/**
 * aiClient.js
 * Summarization for ticket rows and sync rollups.
 * Supports:
 *  - basic (local rule-based, no API key)
 *  - openai
 *  - gemini
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const MAX_TICKET_CONTEXT_CHARS = 6000;
const MAX_CONSOLIDATED_CONTEXT_CHARS = 12000;
const AI_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const AI_MAX_RETRIES = 2;

export function isAiConfigured(settings) {
  return Boolean(settings.enableAiSummaries);
}

export async function buildAiArtifacts(
  entries,
  settings,
  onProgress = () => {},
  shouldCancel = () => false
) {
  if (!isAiConfigured(settings) || !entries.length) {
    return {
      summariesByTicket: new Map(),
      consolidatedSummary: "",
      consolidatedActionItems: "",
    };
  }

  const requestedProvider = getRequestedAiProvider(settings);
  const provider = getEffectiveAiProvider(settings);
  const fallbackToBasicAllowed = provider !== "basic";
  const summariesByTicket = new Map();
  const isConsolidatedOnly = settings.aiSummaryMode === "consolidated_only";
  const providerLabel = provider === "basic" ? "Basic (local)" : provider;
  onProgress(`AI provider: ${providerLabel}.`);
  if (requestedProvider !== provider) {
    onProgress(`AI fallback active: "${requestedProvider}" not fully configured, using Basic mode.`);
  }
  let consolidated = { summary: "", actionItems: "" };
  let fallbackUsed = requestedProvider !== provider;
  let fallbackReason = requestedProvider !== provider ? "provider not configured" : "";

  try {
    if (!isConsolidatedOnly) {
      const maxConcurrentAiRequests = Math.max(1, Number(settings.maxConcurrentAiRequests || 4));
      let completed = 0;
      await runWithConcurrency(entries, maxConcurrentAiRequests, async (entry) => {
        throwIfCancelled(shouldCancel);
        const summary = await summarizeTicket(entry, settings, provider);
        summariesByTicket.set(entry.ticketNumber, summary);
        completed += 1;
        if (completed % 5 === 0 || completed === entries.length) {
          onProgress(`Generating AI summary ${completed} of ${entries.length}…`);
        }
      });
    } else {
      onProgress("AI mode: consolidated-only (skipping per-ticket summaries)…");
    }

    throwIfCancelled(shouldCancel);
    onProgress("Generating consolidated AI report…");
    const enrichedEntries = entries.map((entry) => ({
      ...entry,
      aiSummary: summariesByTicket.get(entry.ticketNumber) || sanitizeOneLine(entry.emailSubject || entry.ticketTitle || ""),
    }));
    consolidated = await summarizeCollection(enrichedEntries, settings, provider);
  } catch (err) {
    if (String(err?.message || "") === "Sync stopped by user.") throw err;
    onProgress(
      fallbackToBasicAllowed
        ? `AI provider failed (${provider}); falling back to Basic summaries…`
        : "Basic summarization hit an error; retrying with safe local fallback…"
    );
    if (fallbackToBasicAllowed) {
      fallbackUsed = true;
    }
    fallbackReason = String(err?.message || "provider error");
    summariesByTicket.clear();

    if (!isConsolidatedOnly) {
      for (const entry of entries) {
        throwIfCancelled(shouldCancel);
        summariesByTicket.set(entry.ticketNumber, summarizeTicketBasic(entry));
      }
    }

    const enrichedEntries = entries.map((entry) => ({
      ...entry,
      aiSummary: summariesByTicket.get(entry.ticketNumber) || sanitizeOneLine(entry.emailSubject || entry.ticketTitle || ""),
    }));
    consolidated = summarizeCollectionBasic(enrichedEntries);
  }

  return {
    summariesByTicket,
    consolidatedSummary: consolidated.summary,
    consolidatedActionItems: consolidated.actionItems,
    providerRequested: requestedProvider,
    providerUsed: fallbackUsed ? "basic" : provider,
    fallbackUsed,
    fallbackReason,
  };
}

async function summarizeTicket(entry, settings, provider) {
  if (provider === "basic") {
    return summarizeTicketBasic(entry);
  }

  const content = truncate(
    [
      `Ticket: ${entry.ticketNumber}`,
      `Subject: ${entry.emailSubject || ""}`,
      `From: ${entry.from || ""}`,
      `Date: ${entry.date || ""}`,
      `Body: ${entry.body || ""}`,
      `Snippet: ${entry.snippet || ""}`,
    ].join("\n"),
    MAX_TICKET_CONTEXT_CHARS
  );

  const prompt = [
    "Summarize the Jira-related email context for one ticket.",
    "Return only JSON in this shape: {\"summary\":\"...\"}.",
    "The summary must be a single concise sentence under 35 words.",
    "Focus on the issue, latest status, and any explicit next step if present.",
    content,
  ].join("\n\n");

  const response = await callAiProvider(prompt, settings, provider, {
    name: "ticket_summary_payload",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  });
  const parsed = safeJsonParse(response);
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) {
    throw new Error("AI response did not include a valid ticket summary.");
  }
  return summary;
}

async function summarizeCollection(entries, settings, provider) {
  if (provider === "basic") {
    return summarizeCollectionBasic(entries);
  }

  const content = truncate(
    entries
      .map((entry) => [
        `Ticket: ${entry.ticketNumber}`,
        `AI Summary: ${entry.aiSummary || ""}`,
        `Subject: ${entry.emailSubject || ""}`,
        `From: ${entry.from || ""}`,
      ].join("\n"))
      .join("\n\n---\n\n"),
    MAX_CONSOLIDATED_CONTEXT_CHARS
  );

  const prompt = [
    "Create a consolidated Jira ticket report across multiple emails.",
    "Return only JSON in this shape: {\"summary\":\"...\",\"actionItems\":\"...\"}.",
    "summary: 2-4 short sentences covering the major themes, urgency, and repeated blockers.",
    "actionItems: a short semicolon-separated list of next actions, or an empty string if none are clear.",
    content,
  ].join("\n\n");

  const response = await callAiProvider(prompt, settings, provider, {
    name: "consolidated_summary_payload",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        actionItems: { type: "string" },
      },
      required: ["summary", "actionItems"],
      additionalProperties: false,
    },
  });
  const parsed = safeJsonParse(response);
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const actionItems = typeof parsed.actionItems === "string" ? parsed.actionItems.trim() : "";
  if (!summary && !actionItems) {
    throw new Error("AI response did not include consolidated summary content.");
  }

  return {
    summary,
    actionItems,
  };
}

async function callAiProvider(prompt, settings, provider, schemaConfig) {
  if (provider === "gemini") {
    return callGemini(prompt, settings, schemaConfig);
  }
  if (provider === "openai") {
    return callOpenAi(prompt, settings, schemaConfig);
  }
  throw new Error(`Unsupported AI provider: ${provider}`);
}

async function callOpenAi(prompt, settings, schemaConfig) {
  const response = await postJsonWithRetry(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: settings.openAiModel || DEFAULT_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: schemaConfig.name,
          strict: true,
          schema: schemaConfig.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = data.output_text;

  if (typeof outputText !== "string" || !outputText.trim()) {
    throw new Error("OpenAI response did not include output_text.");
  }

  return outputText;
}

async function callGemini(prompt, settings, schemaConfig) {
  const model = settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const url =
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(settings.geminiApiKey)}`;

  const response = await postJsonWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(schemaConfig.schema),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = extractGeminiText(data);
  if (!outputText) {
    throw new Error("Gemini response did not include text content.");
  }
  return outputText;
}

async function postJsonWithRetry(url, init) {
  let attempt = 0;
  let response = null;
  while (attempt <= AI_MAX_RETRIES) {
    response = await fetch(url, init);
    if (!AI_RETRY_STATUSES.has(response.status)) {
      return response;
    }
    if (response.status === 429) {
      const body = await response.clone().text().catch(() => "");
      if (/insufficient_quota|quota/i.test(body)) {
        return response;
      }
    }
    if (attempt === AI_MAX_RETRIES) {
      return response;
    }
    const retryAfterSeconds = Number.parseInt(response.headers.get("retry-after") || "", 10);
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : Math.min(4000, 350 * (2 ** attempt));
    await sleep(retryAfterMs);
    attempt += 1;
  }
  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function throwIfCancelled(shouldCancel) {
  if (shouldCancel()) {
    throw new Error("Sync stopped by user.");
  }
}

function getRequestedAiProvider(settings) {
  const provider = String(settings.aiProvider || "basic").toLowerCase();
  if (provider === "gemini" || provider === "openai" || provider === "basic") return provider;
  return "basic";
}

function getEffectiveAiProvider(settings) {
  const requested = getRequestedAiProvider(settings);
  if (requested === "gemini") {
    return settings.geminiApiKey ? "gemini" : "basic";
  }
  if (requested === "openai") {
    return settings.openAiApiKey ? "openai" : "basic";
  }
  return "basic";
}

function toGeminiSchema(jsonSchema) {
  const convert = (node) => {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" && typeof value === "string") {
        out[key] = value.toUpperCase();
      } else if (key === "properties" && value && typeof value === "object") {
        const mapped = {};
        for (const [propName, propSchema] of Object.entries(value)) {
          mapped[propName] = convert(propSchema);
        }
        out[key] = mapped;
      } else {
        out[key] = convert(value);
      }
    }
    return out;
  };
  return convert(jsonSchema);
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text || "").join("").trim();
}

function sanitizeOneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function summarizeTicketBasic(entry) {
  const subject = sanitizeOneLine(entry.emailSubject || entry.ticketTitle || "");
  const text = `${entry.emailSubject || ""}\n${entry.body || ""}\n${entry.snippet || ""}`.toLowerCase();
  const status = detectStatus(text);
  const priority = detectPriority(text);
  const nextStep = extractNextStep(entry.body || entry.snippet || "");

  const parts = [`${entry.ticketNumber}: ${subject || "update received"}`];
  if (status) parts.push(`status ${status}`);
  if (priority) parts.push(`priority ${priority}`);
  if (nextStep) parts.push(`next step: ${nextStep}`);
  return sanitizeOneLine(parts.join(", "));
}

function summarizeCollectionBasic(entries) {
  const statusCounts = {
    blocked: 0,
    "in progress": 0,
    resolved: 0,
    pending: 0,
    updated: 0,
  };
  let highPriorityCount = 0;
  const actionItems = [];

  for (const entry of entries) {
    const source = `${entry.emailSubject || ""}\n${entry.body || ""}\n${entry.snippet || ""}`.toLowerCase();
    const status = detectStatus(source);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (detectPriority(source) === "high") highPriorityCount += 1;

    const nextStep = extractNextStep(entry.body || entry.snippet || "");
    if (nextStep) actionItems.push(nextStep);
  }

  const summaryParts = [];
  summaryParts.push(`${entries.length} ticket(s) analyzed.`);
  if (statusCounts.blocked > 0) summaryParts.push(`${statusCounts.blocked} blocked`);
  if (statusCounts["in progress"] > 0) summaryParts.push(`${statusCounts["in progress"]} in progress`);
  if (statusCounts.resolved > 0) summaryParts.push(`${statusCounts.resolved} resolved`);
  if (statusCounts.pending > 0) summaryParts.push(`${statusCounts.pending} pending`);
  if (highPriorityCount > 0) summaryParts.push(`${highPriorityCount} marked high priority`);

  const uniqueActionItems = [...new Set(actionItems.map((item) => sanitizeOneLine(item)).filter(Boolean))]
    .slice(0, 6)
    .join("; ");

  return {
    summary: sanitizeOneLine(summaryParts.join(" ")),
    actionItems: uniqueActionItems,
  };
}

function detectStatus(text) {
  if (/\b(blocked|blocker|stuck|dependency|waiting on|cannot proceed|unable to)\b/i.test(text)) return "blocked";
  if (/\b(resolved|fixed|closed|done|completed|deployed)\b/i.test(text)) return "resolved";
  if (/\b(in progress|working on|investigating|analysis|under review|wip)\b/i.test(text)) return "in progress";
  if (/\b(pending|awaiting|need input|waiting for response)\b/i.test(text)) return "pending";
  return "updated";
}

function detectPriority(text) {
  if (/\b(p0|p1|sev1|critical|urgent|asap|immediately|high priority|production down|outage)\b/i.test(text)) {
    return "high";
  }
  if (/\b(p2|sev2|medium priority)\b/i.test(text)) {
    return "medium";
  }
  return "";
}

function extractNextStep(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);

  for (const line of lines) {
    if (/^(next step|action item|todo|to do|please|need to|will|plan|follow up)\b[:\-\s]/i.test(line)) {
      return line.replace(/\s+/g, " ").slice(0, 160);
    }
  }

  const sentence = String(text || "")
    .replace(/\s+/g, " ")
    .match(/\b(need to|please|will|should)\b[^.]{8,140}\./i);

  return sentence ? sentence[0].trim() : "";
}

async function runWithConcurrency(items, concurrency, worker) {
  if (!items.length) return;

  let currentIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}
