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
  // First, check if the named sheet tab exists; create it if not
  await ensureSheetTabExists(spreadsheetId, sheetName);

  // Read row 1 to check for headers
  const range = `${sheetName}!A1:Z1`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await authenticatedFetch(url);

  if (!resp.ok) throw new Error(`Sheets read error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  const firstRow = data.values?.[0] || [];

  // If no headers yet, write them now
  if (firstRow.length === 0) {
    await writeRow(spreadsheetId, sheetName, SHEET_HEADERS);
    console.log("[Sheets] Header row written.");
  }
}

/**
 * Ensure a sheet tab with the given name exists in the spreadsheet.
 * Creates it if missing.
 */
async function ensureSheetTabExists(spreadsheetId, sheetName) {
  const metaUrl = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`;
  const metaResp = await authenticatedFetch(metaUrl);
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
  const resp = await authenticatedFetch(url);

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
  const syncedAt = new Date().toLocaleString();
  const readableDate = entry.date ? new Date(entry.date).toLocaleString() : "";

  return [
    entry.ticketNumber,
    entry.ticketTitle,
    entry.emailSubject,
    readableDate,
    entry.jiraUrl,
    entry.gmailUrl,
    entry.from,
    syncedAt,
  ];
}
