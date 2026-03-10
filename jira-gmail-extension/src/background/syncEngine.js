/**
 * syncEngine.js
 * Core sync orchestration: fetches Gmail, detects Jira tickets,
 * deduplicates, and pushes new entries to Google Sheets.
 */

import {
  getSettings,
  getSeenTicketIds,
  addSeenTicketIds,
  setSyncStatus,
  setLastSyncTime,
} from "../utils/storage.js";
import { fetchMessageIds, fetchMessage, parseEmail } from "../gmail/gmailClient.js";
import { extractTicketNumbers, containsTicket, buildJiraUrl, buildGmailUrl, sanitize } from "../utils/jiraParser.js";
import { initSheet, getExistingTicketNumbers, writeRows, buildSheetRow } from "../sheets/sheetsClient.js";
import { getUserEmail } from "../utils/auth.js";
import { getAuthToken } from "../utils/auth.js";

/**
 * Main sync function. Orchestrates the full pipeline:
 * 1. Authenticate
 * 2. Initialize sheet
 * 3. Fetch emails
 * 4. Extract Jira tickets
 * 5. Deduplicate
 * 6. Push to Sheets
 *
 * @param {Function} [onProgress] - Optional callback(message: string) for status updates
 * @returns {Promise<{ added: number, skipped: number, total: number }>}
 */
export async function runSync(onProgress = () => {}) {
  const settings = await getSettings();

  // ── Step 1: Authenticate ────────────────────────────────────────────────────
  onProgress("Authenticating…");
  let token;
  try {
    token = await getAuthToken(true);
  } catch (err) {
    throw new Error(`Authentication failed: ${err.message}`);
  }

  // ── Step 2: Get user email (for body mention detection) ─────────────────────
  onProgress("Fetching user profile…");
  let userEmail = "";
  try {
    userEmail = await getUserEmail(token);
  } catch {
    console.warn("[Sync] Could not fetch user email; mention detection disabled.");
  }

  // ── Step 3: Initialize the Google Sheet ─────────────────────────────────────
  onProgress("Initializing Google Sheet…");
  await initSheet(settings.spreadsheetId, settings.sheetName);

  // ── Step 4: Load deduplication caches ───────────────────────────────────────
  onProgress("Loading deduplication cache…");

  // Local cache (fast)
  const seenIds = await getSeenTicketIds();

  // Remote cache from sheet column A (source of truth for dedup)
  const sheetTicketNumbers = await getExistingTicketNumbers(
    settings.spreadsheetId,
    settings.sheetName
  );

  // Combine both caches for maximum dedup coverage
  const allSeen = new Set([...seenIds, ...sheetTicketNumbers]);

  // ── Step 5: Fetch Gmail message IDs ─────────────────────────────────────────
  onProgress("Searching Gmail…");
  const messageIds = await fetchMessageIds(settings.gmailSearchQuery);
  onProgress(`Found ${messageIds.length} email(s) to scan…`);

  // ── Step 6: Process each email ───────────────────────────────────────────────
  const newRows = [];
  const newTicketKeys = []; // composite key: ticketNumber (for storage dedup)
  let processed = 0;
  let skipped = 0;

  for (const msgId of messageIds) {
    processed++;

    if (processed % 10 === 0) {
      onProgress(`Processing email ${processed} of ${messageIds.length}…`);
    }

    let message;
    try {
      message = await fetchMessage(msgId);
    } catch (err) {
      console.warn(`[Sync] Failed to fetch message ${msgId}:`, err.message);
      continue;
    }

    const email = parseEmail(message);

    // ── Relevance check ───────────────────────────────────────────────────────
    // We only process emails where the user is involved (To, CC, or mentioned)
    const isAddressed =
      isUserAddressed(email, userEmail) || isUserMentionedInBody(email, userEmail);

    // Search all text surfaces for ticket numbers
    const searchText = [email.subject, email.body, email.snippet].join(" ");
    const ticketNumbers = extractTicketNumbers(searchText);

    if (ticketNumbers.length === 0) {
      skipped++;
      continue; // No Jira tickets found in this email
    }

    if (userEmail && !isAddressed) {
      skipped++;
      continue; // User is not involved in this email
    }

    // ── Emit one row per ticket found in the email ────────────────────────────
    for (const ticketNumber of ticketNumbers) {
      // Dedup: skip if we've already recorded this ticket
      if (allSeen.has(ticketNumber)) continue;

      const entry = {
        ticketNumber,
        ticketTitle: sanitize(email.subject), // subject is the best proxy for ticket title
        emailSubject: sanitize(email.subject),
        date: email.date,
        jiraUrl: buildJiraUrl(ticketNumber),
        gmailUrl: buildGmailUrl(email.id),
        from: sanitize(email.from),
      };

      newRows.push(buildSheetRow(entry));
      newTicketKeys.push(ticketNumber);
      allSeen.add(ticketNumber); // prevent same ticket from another email adding a duplicate
    }
  }

  // ── Step 7: Batch-write new rows to Sheets ──────────────────────────────────
  if (newRows.length > 0) {
    onProgress(`Writing ${newRows.length} new ticket(s) to sheet…`);
    await writeRows(settings.spreadsheetId, settings.sheetName, newRows);
    await addSeenTicketIds(newTicketKeys);
  }

  // ── Step 8: Persist sync metadata ───────────────────────────────────────────
  const now = new Date().toISOString();
  await setLastSyncTime(now);

  const summary = `Last sync: ${new Date(now).toLocaleString()} — ${newRows.length} added, ${skipped} skipped`;
  await setSyncStatus(summary);

  onProgress("Sync complete!");

  return {
    added: newRows.length,
    skipped,
    total: messageIds.length,
  };
}

// ─── Helper: Is user in To or CC? ─────────────────────────────────────────────

function isUserAddressed(email, userEmail) {
  if (!userEmail) return true; // If we don't know the user, assume all emails are relevant
  const toLower = userEmail.toLowerCase();
  return (
    email.to.toLowerCase().includes(toLower) ||
    email.cc.toLowerCase().includes(toLower)
  );
}

// ─── Helper: Is user mentioned in the body? ───────────────────────────────────

function isUserMentionedInBody(email, userEmail) {
  if (!userEmail) return false;
  const toLower = userEmail.toLowerCase();
  return email.body.toLowerCase().includes(toLower);
}
