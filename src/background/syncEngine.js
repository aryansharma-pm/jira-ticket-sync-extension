/**
 * syncEngine.js
 * Core sync orchestration: fetches Gmail, detects Jira tickets,
 * deduplicates, and pushes new entries to Google Sheets.
 */

import {
  getSettings,
  addSeenTicketIds,
  setSyncStatus,
  setLastSyncTime,
  setLastSyncAddedCount,
  setLastSyncDetectedCount,
  setUserEmail,
  appendAuditLog,
} from "../utils/storage.js";
import { fetchMessageIds, fetchMessage, parseEmail } from "../gmail/gmailClient.js";
import { extractTicketNumbers, buildJiraUrl, buildGmailUrl, sanitize } from "../utils/jiraParser.js";
import {
  initSheet,
  initConsolidatedSheet,
  getExistingTicketNumbers,
  writeRows,
  buildSheetRow,
  buildConsolidatedSheetRow,
} from "../sheets/sheetsClient.js";
import { getUserEmail, getAuthToken } from "../utils/auth.js";
import { buildAiArtifacts, isAiConfigured } from "../ai/aiClient.js";
import { detectActionRequest, registerFollowup, markThreadReplied } from "../gmail/followupTracker.js";
import { extractCommitments, saveCommitments } from "../utils/commitmentExtractor.js";
import { scoreSentiment, recordSenderSentiment } from "../utils/sentimentTracker.js";
import { extractDecisions, saveDecisions } from "../utils/decisionLog.js";
import { enrichTaskContext } from "../context/contextEngine.js";

/**
 * Main sync function. Orchestrates the full pipeline:
 * 1. Authenticate
 * 2. Initialize sheet
 * 3. Fetch emails
 * 4. Extract Jira tickets
 * 5. Deduplicate
 * 6. Push to Sheets
 *
 * @param {Object} options
 * @param {Function} [options.onProgress] - Optional callback(message: string) for status updates
 * @param {boolean} [options.interactiveAuth]
 * @param {Function} [options.shouldCancel] - Optional callback returning true if sync should stop
 * @returns {Promise<{ added: number, detected: number, existing: number, skipped: number, total: number }>}
 */
// Maximum wall-clock ms a sync is allowed to run before aborting to protect the service worker.
const MAX_SYNC_DURATION_MS = 4 * 60 * 1000; // 4 minutes

export async function runSync(options = {}) {
  const onProgress = options.onProgress || (() => {});
  const interactiveAuth = options.interactiveAuth ?? true;
  const shouldCancel = options.shouldCancel || (() => false);
  const syncStartedAt = Date.now();

  /** Throws if the sync has been running longer than MAX_SYNC_DURATION_MS. */
  function checkTimeBudget() {
    if (Date.now() - syncStartedAt > MAX_SYNC_DURATION_MS) {
      throw new Error(
        "Sync stopped: approaching service worker time limit. Reduce Max Emails or enable Fast Mode and retry."
      );
    }
  }

  const settings = await getSettings();
  validateSyncSettings(settings);

  // ── Step 1: Authenticate ────────────────────────────────────────────────────
  onProgress("Authenticating…");
  let token;
  try {
    token = await getAuthToken(interactiveAuth);
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }
  throwIfCancelled(shouldCancel);

  // ── Step 2: Get user email (for body mention detection) ─────────────────────
  onProgress("Fetching user profile…");
  let userEmail = "";
  try {
    userEmail = await getUserEmail(token);
    if (userEmail) {
      await setUserEmail(userEmail);
    }
  } catch {
    console.warn("[Sync] Could not fetch user email; mention detection disabled.");
  }
  throwIfCancelled(shouldCancel);

  // ── Step 3: Initialize the Google Sheet ─────────────────────────────────────
  onProgress("Initializing Google Sheet…");
  await initSheet(settings.spreadsheetId, settings.sheetName);
  if (isAiConfigured(settings)) {
    await initConsolidatedSheet(settings.spreadsheetId, settings.consolidatedSheetName);
  }
  throwIfCancelled(shouldCancel);

  // ── Step 4: Load deduplication caches ───────────────────────────────────────
  onProgress("Loading deduplication cache…");

  // Remote cache from sheet column A (source of truth for dedup)
  const sheetTicketNumbers = await getExistingTicketNumbers(
    settings.spreadsheetId,
    settings.sheetName
  );

  // Deduplicate only against what's actually in the sheet.
  // This prevents stale local cache from hiding tickets after manual sheet cleanup.
  const allSeen = new Set(sheetTicketNumbers);
  throwIfCancelled(shouldCancel);

  // ── Step 5: Fetch Gmail message IDs ─────────────────────────────────────────
  onProgress("Searching Gmail…");
  const effectiveGmailQuery = buildEffectiveGmailQuery(settings);
  const messageIds = await fetchMessageIds(effectiveGmailQuery, {
    maxTotal: settings.maxTotalEmails,
  });
  onProgress(`Found ${messageIds.length} email(s) to scan…`);
  if (messageIds.length === 0) {
    const now = new Date().toISOString();
    await setLastSyncTime(now);
    await setLastSyncAddedCount(0);
    await setLastSyncDetectedCount(0);
    await setSyncStatus(`No emails found for current filters. Query used: "${effectiveGmailQuery || "(empty)"}"`);
    await appendAuditLog({
      timestamp: now,
      mode: interactiveAuth ? "manual" : "background",
      gmailQuery: effectiveGmailQuery,
      scannedEmails: 0,
      detected: 0,
      added: 0,
      existing: 0,
      skipped: 0,
      aiEnabled: Boolean(settings.enableAiSummaries),
      aiProviderRequested: settings.aiProvider || "basic",
      aiFallbackUsed: false,
      aiUnavailableReason: "",
      outcome: "no_emails",
    });
    return {
      added: 0,
      detected: 0,
      existing: 0,
      skipped: 0,
      total: 0,
      report: {
        syncTimestamp: now,
        entries: [],
        consolidatedSummary: "",
        consolidatedActionItems: "",
        aiUnavailableReason: "",
      },
    };
  }

  // ── Step 6: Process each email ───────────────────────────────────────────────
  const pendingEntries = [];
  const scanEntriesByTicket = new Map();
  const newTicketKeys = []; // composite key: ticketNumber (for storage dedup)
  const detectedTicketNumbers = new Set();
  let processed = 0;
  let skipped = 0;
  let existing = 0;
  const maxConcurrentMessageFetches = Math.max(
    1,
    Number(settings.maxConcurrentMessageFetches || 8)
  );
  await runWithConcurrency(messageIds, maxConcurrentMessageFetches, async (msgId) => {
    throwIfCancelled(shouldCancel);
    checkTimeBudget();
    processed++;

    if (processed % 10 === 0 || processed === messageIds.length) {
      onProgress(`Processing email ${processed} of ${messageIds.length}…`);
    }

    let message;
    try {
      const fetchFormat = settings.fastModeEnabled ? "metadata" : "full";
      message = await fetchMessage(msgId, fetchFormat);
    } catch (err) {
      console.warn(`[Sync] Failed to fetch message ${msgId}:`, err.message);
      return;
    }

    const email = parseEmail(message);

    // ── Relevance check ───────────────────────────────────────────────────────
    // We only process emails where the user is involved (To, CC, or mentioned)
    const isAddressed = settings.fastModeEnabled
      ? isUserAddressed(email, userEmail)
      : (isUserAddressed(email, userEmail) || isUserMentionedInBody(email, userEmail));

    // Search all text surfaces for ticket numbers
    const searchText = [email.subject, email.body, email.snippet].join(" ");
    const ticketNumbers = extractTicketNumbers(searchText);

    if (ticketNumbers.length === 0) {
      skipped++;
      return; // No Jira tickets found in this email
    }

    if (userEmail && !isAddressed) {
      skipped++;
      return; // User is not involved in this email
    }

    // ── Intelligence processing (non-blocking — failures do not stop sync) ────
    const isOutbound = userEmail && email.from.toLowerCase().includes(userEmail.toLowerCase());
    try {
      if (isOutbound) {
        // Track sent emails that expect replies
        if (settings.enableFollowupTracking && detectActionRequest(email.body)) {
          await registerFollowup({
            messageId: email.id,
            threadId: message.threadId || email.id,
            subject: email.subject,
            to: email.to,
            date: email.date,
            checkAfterHours: settings.followupCheckHours || 48,
            jiraTickets: ticketNumbers,
          });
        }
        // Extract self-commitments ("I'll send X by Friday")
        if (settings.enableCommitmentTracking) {
          const commitments = extractCommitments(email);
          if (commitments.length) await saveCommitments(commitments, email);
        }
      } else {
        // Inbound: mark thread replied if we were tracking a follow-up on it
        if (settings.enableFollowupTracking && message.threadId) {
          await markThreadReplied(message.threadId);
        }
        // Track sentiment drift per sender
        if (settings.enableSentimentTracking) {
          const score = scoreSentiment(email.body);
          await recordSenderSentiment(email.from, score, email.id);
        }
      }
      // Extract decisions from all relevant emails
      if (settings.enableDecisionLog) {
        const decisions = extractDecisions(email.body, {
          source: "email",
          sourceId: email.id,
          subject: email.subject,
          participants: [email.from, email.to].filter(Boolean),
          timestamp: email.date,
          jiraTickets: ticketNumbers,
        });
        if (decisions.length) await saveDecisions(decisions);
      }
    } catch (intelligenceErr) {
      console.warn("[Sync] Intelligence processing error (non-fatal):", intelligenceErr.message);
    }

    // ── Emit one row per ticket found in the email ────────────────────────────
    for (const ticketNumber of ticketNumbers) {
      detectedTicketNumbers.add(ticketNumber);
      if (!scanEntriesByTicket.has(ticketNumber)) {
        scanEntriesByTicket.set(ticketNumber, {
          ticketNumber,
          ticketTitle: sanitize(email.subject),
          emailSubject: sanitize(email.subject),
          date: email.date,
          jiraUrl: buildJiraUrl(ticketNumber, settings.jiraBaseUrl),
          gmailUrl: buildGmailUrl(email.id),
          from: sanitize(email.from),
          body: sanitize(email.body),
          snippet: sanitize(email.snippet),
        });
      }

      // Dedup: skip if we've already recorded this ticket
      if (allSeen.has(ticketNumber)) {
        existing++;
        continue;
      }

      const entry = scanEntriesByTicket.get(ticketNumber);

      pendingEntries.push(entry);
      newTicketKeys.push(ticketNumber);
      allSeen.add(ticketNumber); // prevent same ticket from another email adding a duplicate
    }
  });

  // ── Step 7: Optional AI summarization ──────────────────────────────────────
  let consolidatedRow = null;
  let consolidatedSummary = "";
  let consolidatedActionItems = "";
  let consolidatedBlockers = "";
  let consolidatedRisks = "";
  let consolidatedHighlights = "";
  let aiUnavailableReason = "";
  const aiSourceEntries = pendingEntries.length > 0
    ? pendingEntries
    : [...scanEntriesByTicket.values()];
  let aiFallbackUsed = false;
  let aiFallbackProvider = "";
  if (aiSourceEntries.length > 0 && isAiConfigured(settings)) {
    try {
      const aiArtifacts = await buildAiArtifacts(aiSourceEntries, settings, onProgress, shouldCancel);
      aiFallbackUsed = Boolean(aiArtifacts.fallbackUsed);
      aiFallbackProvider = aiArtifacts.providerRequested || "";

      for (const entry of aiSourceEntries) {
        entry.aiSummary = aiArtifacts.summariesByTicket.get(entry.ticketNumber) || entry.aiSummary || "";
      }

      if (aiArtifacts.consolidatedSummary || aiArtifacts.consolidatedActionItems) {
        consolidatedSummary     = aiArtifacts.consolidatedSummary;
        consolidatedActionItems = aiArtifacts.consolidatedActionItems;
        consolidatedBlockers    = aiArtifacts.consolidatedBlockers   || "";
        consolidatedRisks       = aiArtifacts.consolidatedRisks      || "";
        consolidatedHighlights  = aiArtifacts.consolidatedHighlights || "";
        consolidatedRow = buildConsolidatedSheetRow({
          syncTimestamp:   new Date().toISOString(),
          ticketCount:     aiSourceEntries.length,
          newTicketsAdded: pendingEntries.length,
          ticketNumbers:   aiSourceEntries.map((entry) => entry.ticketNumber),
          summary:         consolidatedSummary,
          actionItems:     consolidatedActionItems,
          blockers:        consolidatedBlockers,
          risks:           consolidatedRisks,
          highlights:      consolidatedHighlights,
          providerUsed:    aiArtifacts.providerUsed || "basic",
        });
      }
    } catch (err) {
      if (err.message === "Sync stopped by user.") throw err;
      aiUnavailableReason = parseAiErrorReason(err);
      onProgress(`AI summary skipped (${aiUnavailableReason}). Continuing sync…`);
    }
  }

  // ── Step 7: Batch-write new rows to Sheets ──────────────────────────────────
  const newRows = pendingEntries.map((entry) => buildSheetRow(entry));
  if (newRows.length > 0) {
    throwIfCancelled(shouldCancel);
    onProgress(`Writing ${newRows.length} new ticket(s) to sheet…`);
    await writeRows(settings.spreadsheetId, settings.sheetName, newRows);
    await addSeenTicketIds(newTicketKeys);
  }
  if (consolidatedRow) {
    throwIfCancelled(shouldCancel);
    onProgress("Writing consolidated AI report to sheet…");
    await writeRows(settings.spreadsheetId, settings.consolidatedSheetName, [consolidatedRow]);
  }

  // ── Step 8: Enrich task context (link tickets, find related tasks) ──────────
  try {
    await enrichTaskContext();
  } catch (ctxErr) {
    console.warn("[Sync] Context enrichment error (non-fatal):", ctxErr.message);
  }

  // ── Step 9: Persist sync metadata ───────────────────────────────────────────
  const now = new Date().toISOString();
  await setLastSyncTime(now);
  await setLastSyncAddedCount(newRows.length);
  await setLastSyncDetectedCount(detectedTicketNumbers.size);

  const summary = `Last sync: ${new Date(now).toLocaleString()} — ${detectedTicketNumbers.size} detected, ${newRows.length} new, ${existing} existing, ${skipped} skipped`;
  const aiSuffix = aiUnavailableReason
    ? ` | AI skipped: ${aiUnavailableReason}`
    : (aiFallbackUsed ? ` | AI fallback active: Basic mode (requested ${aiFallbackProvider || "provider"})` : "");
  await setSyncStatus(`${summary}${aiSuffix}`);
  await appendAuditLog({
    timestamp: now,
    mode: interactiveAuth ? "manual" : "background",
    gmailQuery: effectiveGmailQuery,
    scannedEmails: messageIds.length,
    detected: detectedTicketNumbers.size,
    added: newRows.length,
    existing,
    skipped,
    aiEnabled: Boolean(settings.enableAiSummaries),
    aiProviderRequested: settings.aiProvider || "basic",
    aiFallbackUsed,
    aiUnavailableReason,
    outcome: "success",
  });

  onProgress("Sync complete!");

  return {
    added: newRows.length,
    detected: detectedTicketNumbers.size,
    existing,
    skipped,
    total: messageIds.length,
    report: {
      syncTimestamp: now,
      entries: aiSourceEntries.map((entry) => ({
        ticketNumber: entry.ticketNumber,
        ticketTitle: entry.ticketTitle,
        emailSubject: entry.emailSubject,
        date: entry.date,
        from: entry.from,
        jiraUrl: entry.jiraUrl,
        gmailUrl: entry.gmailUrl,
        aiSummary: entry.aiSummary || "",
      })),
      consolidatedSummary,
      consolidatedActionItems,
      aiUnavailableReason,
    },
  };
}

function validateSyncSettings(settings) {
  const missing = [];
  if (!settings.spreadsheetId?.trim()) missing.push("Spreadsheet ID");
  if (!settings.sheetName?.trim()) missing.push("Sheet Name");

  if (missing.length > 0) {
    throw new Error(`Missing required settings: ${missing.join(", ")}. Open Configuration and save them.`);
  }

  const preset = String(settings.gmailDatePreset || "last_30").toLowerCase();
  if (preset === "custom") {
    if (!settings.gmailFromDate || !settings.gmailToDate) {
      throw new Error("Custom date range requires both From Date and To Date.");
    }
    if (settings.gmailFromDate > settings.gmailToDate) {
      throw new Error("Custom date range is invalid: From Date is after To Date.");
    }
  }
}

// ─── Helper: Extract email addresses from a header value ──────────────────────

function parseEmailAddresses(headerValue) {
  const addresses = [];
  // Matches addr-spec in plain or "Name <addr>" formats
  const regex = /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi;
  let match;
  while ((match = regex.exec(String(headerValue || ""))) !== null) {
    addresses.push(match[0].toLowerCase());
  }
  return addresses;
}

// ─── Helper: Is user in To or CC? ─────────────────────────────────────────────

function isUserAddressed(email, userEmail) {
  if (!userEmail) return true; // If we don't know the user, assume all emails are relevant
  const userEmailLower = userEmail.toLowerCase();
  const toAddresses = parseEmailAddresses(email.to);
  const ccAddresses = parseEmailAddresses(email.cc);
  return toAddresses.includes(userEmailLower) || ccAddresses.includes(userEmailLower);
}

// ─── Helper: Is user mentioned in the body? ───────────────────────────────────

function isUserMentionedInBody(email, userEmail) {
  if (!userEmail) return false;
  const userEmailLower = userEmail.toLowerCase();
  return parseEmailAddresses(email.body).includes(userEmailLower);
}

function throwIfCancelled(shouldCancel) {
  if (shouldCancel()) {
    throw new Error("Sync stopped by user.");
  }
}

function parseAiErrorReason(err) {
  const message = String(err?.message || "");
  if (
    message.includes("insufficient_quota") ||
    message.includes("OpenAI error 429") ||
    message.includes("Gemini error 429")
  ) {
    return "insufficient AI provider quota";
  }
  return "AI service error";
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

function buildEffectiveGmailQuery(settings) {
  const preset = String(settings.gmailDatePreset || "last_30").toLowerCase();
  let fromDate = null;
  let toDate = null;

  if (preset === "custom") {
    fromDate = parseDateOnly(settings.gmailFromDate);
    toDate = parseDateOnly(settings.gmailToDate);
  } else {
    const range = buildDateRangeFromPreset(preset);
    fromDate = range.fromDate;
    toDate = range.toDate;
  }

  const parts = [];

  if (fromDate) {
    // Gmail `after:` is exclusive, so shift by -1 day for inclusive start date.
    parts.push(`after:${formatGmailDate(addDays(fromDate, -1))}`);
  }

  if (toDate) {
    // Gmail `before:` is exclusive, so shift by +1 day for inclusive end date.
    parts.push(`before:${formatGmailDate(addDays(toDate, 1))}`);
  }

  // Fast mode: let Gmail pre-filter to emails where the user is To/CC.
  // This reduces the fetch set server-side instead of filtering locally.
  if (settings.fastModeEnabled) {
    parts.push("(to:me OR cc:me)");
  }

  const query = parts.join(" ").trim();
  return query || "in:anywhere";
}

function buildDateRangeFromPreset(preset) {
  const today = startOfLocalDay(new Date());
  switch (preset) {
    case "prev_30":
      return {
        fromDate: addDays(today, -59),
        toDate: addDays(today, -30),
      };
    case "last_60":
      return {
        fromDate: addDays(today, -59),
        toDate: today,
      };
    case "last_90":
      return {
        fromDate: addDays(today, -89),
        toDate: today,
      };
    case "last_120":
      return {
        fromDate: addDays(today, -119),
        toDate: today,
      };
    case "last_30":
    default:
      return {
        fromDate: addDays(today, -29),
        toDate: today,
      };
  }
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDateOnly(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGmailDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
