/**
 * sheetsClient.js
 * Google Sheets API v4 client.
 * Handles sheet initialization, duplicate detection, and row appending.
 */

import { authenticatedFetch } from "../utils/auth.js";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── Sheet Headers ────────────────────────────────────────────────────────────

/**
 * Column headers written to row 1 of the sheet on first use.
 */
export const SHEET_HEADERS = [
  "Ticket Number",
  "Ticket Title / Summary",
  "Email Subject",
  "Date",
  "Jira Link",
  "Gmail Link",
  "From",
  "AI Ticket Summary",
  "Synced At",
];

export const CONSOLIDATED_SHEET_HEADERS = [
  "Sync Timestamp",
  "Ticket Count",
  "Ticket Numbers",
  "Consolidated Summary",
  "Action Items",
  "Synced At",
];

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Ensure the target sheet tab exists and has headers.
 * If the sheet is empty, write the header row first.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 */
export async function initSheet(spreadsheetId, sheetName) {
  await ensureHeaders(spreadsheetId, sheetName, SHEET_HEADERS);
}

export async function initConsolidatedSheet(spreadsheetId, sheetName) {
  await ensureHeaders(spreadsheetId, sheetName, CONSOLIDATED_SHEET_HEADERS);
}

/**
 * Ensure a sheet tab with the given name exists in the spreadsheet.
 * Creates it if missing.
 */
async function ensureSheetTabExists(spreadsheetId, sheetName) {
  const metaUrl = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`;
  const metaResp = await fetchWithRetry(metaUrl, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });
  if (!metaResp.ok) throw new Error(`Cannot read spreadsheet metadata: ${await metaResp.text()}`);

  const meta = await metaResp.json();
  const existing = (meta.sheets || []).map((s) => s.properties.title);

  if (!existing.includes(sheetName)) {
    // Create the sheet tab via batchUpdate
    const batchUrl = `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`;
    const body = {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    };
    const createResp = await authenticatedFetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!createResp.ok) {
      throw new Error(`Failed to create sheet tab: ${await createResp.text()}`);
    }
    console.log(`[Sheets] Created new tab: "${sheetName}"`);
  }
}

async function fetchWithRetry(url, options = {}) {
  const {
    retries = 2,
    retryStatuses = [429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let attempt = 0;
  let response = null;

  while (attempt <= retries) {
    response = await authenticatedFetch(url, fetchOptions);
    if (!retryStatuses.includes(response.status)) {
      return response;
    }

    if (attempt === retries) {
      return response;
    }

    const delayMs = Math.min(2000, 300 * (2 ** attempt));
    await sleep(delayMs);
    attempt += 1;
  }

  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureHeaders(spreadsheetId, sheetName, headers) {
  await ensureSheetTabExists(spreadsheetId, sheetName);

  const range = `${sheetName}!A1:Z1`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await fetchWithRetry(url, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });

  if (!resp.ok) throw new Error(`Sheets read error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  const firstRow = data.values?.[0] || [];

  if (firstRow.length === 0) {
    await writeRow(spreadsheetId, sheetName, headers);
    return;
  }
}

// ─── Read Existing Tickets ────────────────────────────────────────────────────

/**
 * Read all ticket numbers already present in column A of the sheet.
 * Used for client-side deduplication before appending.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<Set<string>>} Set of existing ticket numbers
 */
export async function getExistingTicketNumbers(spreadsheetId, sheetName) {
  // Column A holds ticket numbers; read all rows except header
  const range = `${sheetName}!A2:A`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await fetchWithRetry(url, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });

  if (!resp.ok) throw new Error(`Sheets read error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  const rows = data.values || [];

  // Flatten the 2D array → Set<string>
  return new Set(rows.map((row) => row[0]).filter(Boolean));
}

// ─── Append Rows ──────────────────────────────────────────────────────────────

/**
 * Append a single row to the sheet.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string[]} rowData - Array of cell values matching SHEET_HEADERS order
 */
export async function writeRow(spreadsheetId, sheetName, rowData) {
  const range = `${sheetName}!A:A`;
  const url =
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const body = { values: [rowData] };
  const resp = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Sheets append error ${resp.status}: ${await resp.text()}`);
}

/**
 * Append multiple rows in a single API call (batch).
 * Much more efficient than calling writeRow() in a loop.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string[][]} rows - Array of row arrays
 */
export async function writeRows(spreadsheetId, sheetName, rows) {
  if (!rows || rows.length === 0) return;

  const range = `${sheetName}!A:A`;
  const url =
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const body = { values: rows };
  const resp = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Sheets batch append error ${resp.status}: ${await resp.text()}`);

  console.log(`[Sheets] Appended ${rows.length} row(s).`);
}


// ─── Row Builder ──────────────────────────────────────────────────────────────

/**
 * Build a spreadsheet row array from a parsed Jira ticket entry.
 *
 * @param {Object} entry
 * @param {string} entry.ticketNumber
 * @param {string} entry.ticketTitle
 * @param {string} entry.emailSubject
 * @param {string} entry.date         - ISO date string
 * @param {string} entry.jiraUrl
 * @param {string} entry.gmailUrl
 * @param {string} entry.from
 * @returns {string[]} Row in the same order as SHEET_HEADERS
 */
export function buildSheetRow(entry) {
  const syncedAt = formatDateTimeForSheet(new Date());
  const readableDate = entry.date ? formatDateTimeForSheet(new Date(entry.date)) : "";

  return [
    entry.ticketNumber,
    entry.ticketTitle,
    entry.emailSubject,
    readableDate,
    entry.jiraUrl,
    entry.gmailUrl,
    entry.from,
    entry.aiSummary || "",
    syncedAt,
  ];
}

export function buildConsolidatedSheetRow(entry) {
  const syncedAt = formatDateTimeForSheet(new Date());

  return [
    entry.syncTimestamp ? formatDateTimeForSheet(new Date(entry.syncTimestamp)) : "",
    String(entry.ticketCount || 0),
    (entry.ticketNumbers || []).join(", "),
    entry.summary || "",
    entry.actionItems || "",
    syncedAt,
  ];
}

function formatDateTimeForSheet(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
