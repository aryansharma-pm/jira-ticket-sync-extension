/**
 * aiClient.js
 * Summarization for ticket rows and sync rollups.
 * Uses existing browser sessions for AI (no API keys required):
 *  - openai    → ChatGPT (chatgpt.com) — user must be signed in
 *  - anthropic → Claude  (claude.ai)   — user must be signed in
 * Falls back to local basic summarization if the session call fails.
 */

import { callSessionProvider } from "./sessionClient.js";

const MAX_TICKET_CONTEXT_CHARS      = 6000;
const MAX_CONSOLIDATED_CONTEXT_CHARS = 12000;

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

  const provider = getEffectiveAiProvider(settings);
  const summariesByTicket = new Map();
  const isConsolidatedOnly = settings.aiSummaryMode === "consolidated_only";
  const providerLabel = provider === "basic" ? "Basic (local)" : provider === "openai" ? "ChatGPT" : "Claude";
  onProgress(`AI provider: ${providerLabel}.`);

  let consolidated = { summary: "", actionItems: "", blockers: "", risks: "", highlights: "" };
  let fallbackUsed = false;
  let fallbackReason = "";

  try {
    if (!isConsolidatedOnly) {
      const maxConcurrent = Math.max(1, Number(settings.maxConcurrentAiRequests || 2));
      let completed = 0;
      await runWithConcurrency(entries, maxConcurrent, async (entry) => {
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
    onProgress(`AI provider failed (${providerLabel}); falling back to Basic summaries…`);
    fallbackUsed = true;
    fallbackReason = String(err?.message || "provider error");

    if (!isConsolidatedOnly) {
      for (const entry of entries) {
        if (!summariesByTicket.has(entry.ticketNumber)) {
          throwIfCancelled(shouldCancel);
          summariesByTicket.set(entry.ticketNumber, summarizeTicketBasic(entry));
        }
      }
    }

    const enrichedEntries = entries.map((entry) => ({
      ...entry,
      aiSummary: summariesByTicket.get(entry.ticketNumber) || sanitizeOneLine(entry.emailSubject || entry.ticketTitle || ""),
    }));
    const basic = summarizeCollectionBasic(enrichedEntries);
    consolidated = { ...basic, blockers: "", risks: "", highlights: "" };
  }

  return {
    summariesByTicket,
    consolidatedSummary:     consolidated.summary,
    consolidatedActionItems: consolidated.actionItems,
    consolidatedBlockers:    consolidated.blockers,
    consolidatedRisks:       consolidated.risks,
    consolidatedHighlights:  consolidated.highlights,
    providerRequested: provider,
    providerUsed: fallbackUsed ? "basic" : provider,
    fallbackUsed,
    fallbackReason,
  };
}

async function summarizeTicket(entry, _settings, provider) {
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

  const prompt = `You are an engineering manager reviewing a Jira ticket email update.
Analyze the email below and return ONLY valid JSON with this exact shape:
{"summary":"..."}

Rules for summary (max 50 words, one sentence):
- State what the ticket is actually about — do NOT copy the subject line verbatim, rephrase meaningfully
- Include the current state: blocked / under review / resolved / awaiting response / deployed / escalated
- Include the specific next step or owner if mentioned (e.g. "waiting on infra team to provision DB" not "action required")
- If there is urgency (outage, P0/P1, deadline), state it clearly
- Be concrete. Never write filler like "an update was received" or "the email discusses"

${content}`;

  const rawText = await callAiProvider(prompt, provider);
  const parsed = safeJsonParse(rawText);
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) {
    throw new Error("AI response did not include a valid ticket summary.");
  }
  return summary;
}

async function summarizeCollection(entries, _settings, provider) {
  if (provider === "basic") {
    return summarizeCollectionBasic(entries);
  }

  const content = truncate(
    entries
      .map((entry) => [
        `Ticket: ${entry.ticketNumber}`,
        `Summary: ${entry.aiSummary || ""}`,
        `Subject: ${entry.emailSubject || ""}`,
        `From: ${entry.from || ""}`,
        `Date: ${entry.date || ""}`,
      ].join("\n"))
      .join("\n\n---\n\n"),
    MAX_CONSOLIDATED_CONTEXT_CHARS
  );

  const prompt = `You are an engineering manager writing a concise daily standup brief from Jira email updates.

Ticket updates:
${content}

Return ONLY valid JSON with this exact shape (no markdown, no extra keys):
{
  "summary": "2-3 sentences: overall health of the ticket landscape, the most critical theme, and one observation about patterns or bottlenecks. Be specific — use ticket numbers and facts from the emails.",
  "actionItems": "Numbered list of concrete actions that need to happen TODAY or this week. Each item must start with a verb, reference a ticket number, and say WHY it is urgent. Example: '1. Follow up with infra team on PROJ-42 — DB provisioning is blocking 3 dependent tickets. 2. Close PROJ-18 — fix deployed 2 days ago, no closure email sent.' Use empty string if genuinely nothing needs action.",
  "blockers": "Comma-separated list of actively blocked tickets with a one-line reason for each. Example: 'PROJ-12 (waiting on legal sign-off), PROJ-33 (dependency on PROJ-44 unresolved)'. Empty string if no blockers.",
  "risks": "1-2 sentences about tickets that could escalate or miss a deadline in the next 24-48 hours if not addressed. Name the ticket and why. Empty string if nothing at risk.",
  "highlights": "1-2 sentences about tickets that were resolved, shipped, or made notable progress. Keep it factual. Empty string if nothing to celebrate."
}

Be direct, specific, and actionable. Avoid generic statements like 'multiple tickets need attention'.`;

  const rawText = await callAiProvider(prompt, provider);
  const parsed = safeJsonParse(rawText);
  const summary     = typeof parsed.summary     === "string" ? parsed.summary.trim()     : "";
  const actionItems = typeof parsed.actionItems === "string" ? parsed.actionItems.trim() : "";
  const blockers    = typeof parsed.blockers    === "string" ? parsed.blockers.trim()    : "";
  const risks       = typeof parsed.risks       === "string" ? parsed.risks.trim()       : "";
  const highlights  = typeof parsed.highlights  === "string" ? parsed.highlights.trim()  : "";

  if (!summary && !actionItems) {
    throw new Error("AI response did not include consolidated summary content.");
  }
  return { summary, actionItems, blockers, risks, highlights };
}

async function callAiProvider(prompt, provider) {
  return callSessionProvider(prompt, provider);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const provider = String(settings.aiProvider || "openai").toLowerCase();
  if (["openai", "anthropic"].includes(provider)) return provider;
  return "openai";
}

function getEffectiveAiProvider(settings) {
  const requested = getRequestedAiProvider(settings);
  if (["openai", "anthropic"].includes(requested)) return requested;
  return "basic";
}

function sanitizeOneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function summarizeTicketBasic(entry) {
  const subject  = sanitizeOneLine(entry.emailSubject || entry.ticketTitle || "");
  const text     = `${entry.emailSubject || ""}\n${entry.body || ""}\n${entry.snippet || ""}`.toLowerCase();
  const status   = detectStatus(text);
  const priority = detectPriority(text);
  const nextStep = extractNextStep(entry.body || entry.snippet || "");

  const parts = [`${entry.ticketNumber}: ${subject || "update received"}`];
  if (status) parts.push(`status ${status}`);
  if (priority) parts.push(`priority ${priority}`);
  if (nextStep) parts.push(`next step: ${nextStep}`);
  return sanitizeOneLine(parts.join(", "));
}

function summarizeCollectionBasic(entries) {
  const statusCounts = { blocked: 0, "in progress": 0, resolved: 0, pending: 0, updated: 0 };
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
