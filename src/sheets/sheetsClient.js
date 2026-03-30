/**
 * sheetsClient.js
 * Google Sheets API v4 client.
 * Handles sheet initialization, duplicate detection, and row appending.
 */

import { authenticatedFetch } from "../utils/auth.js";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── Sheet Headers ────────────────────────────────────────────────────────────

/**
 * Main Jira Tickets sheet — 10 columns.
 * Col A: Ticket · B: Status · C: Priority · D: Title · E: Date
 * Col F: Sender · G: Jira link · H: Email link · I: AI Summary · J: Synced At
 */
export const SHEET_HEADERS = [
  "Ticket",
  "Status",
  "Priority",
  "Title",
  "Date",
  "Sender",
  "Jira",
  "Email",
  "AI Summary",
  "Synced At",
];

const SHEET_COLUMN_WIDTHS = [110, 95, 85, 250, 130, 170, 90, 90, 330, 130];

/**
 * Consolidated AI Insights sheet — 11 columns.
 * Sync Date | New | Total | Tickets | Summary | Action Items | Blockers | Risks | Highlights | AI Provider | Synced At
 */
export const CONSOLIDATED_SHEET_HEADERS = [
  "Sync Date",
  "New Tickets",
  "Total Detected",
  "Ticket IDs",
  "Summary",
  "Action Items",
  "Blockers",
  "Risks",
  "Highlights",
  "AI Provider",
  "Synced At",
];

const CONSOLIDATED_COLUMN_WIDTHS = [130, 75, 80, 175, 360, 280, 190, 200, 175, 90, 130];

// ─── Header / background colours ─────────────────────────────────────────────

/** Light Magenta 3 header (used on both sheets) */
const HEADER_BG = { red: 0.918, green: 0.820, blue: 0.863 };   // #EAD1DC — Light Magenta 3
const HEADER_FG = { red: 0, green: 0, blue: 0 };                // black text on header

/** Row highlight colours for Status values */
const STATUS_COLOURS = {
  Blocked:      { red: 0.988, green: 0.773, blue: 0.773 }, // #FCBCBC — clear red
  "In Progress":{ red: 0.996, green: 0.937, blue: 0.663 }, // #FEEFA9 — clear amber-yellow
  Resolved:     { red: 0.773, green: 0.929, blue: 0.796 }, // #C5EDCB — clear green
  Pending:      { red: 0.773, green: 0.898, blue: 0.973 }, // #C5E5F8 — clear blue
};

/** Black text applied alongside all status/priority backgrounds */
const DARK_TEXT = { red: 0, green: 0, blue: 0 }; // #000000

/** Priority cell colour for "High" */
const HIGH_PRIORITY_BG = { red: 1, green: 0.671, blue: 0.561 }; // #FFAB8F — more visible

// ─── Initialization ───────────────────────────────────────────────────────────

export async function initSheet(spreadsheetId, sheetName) {
  await ensureHeaders(spreadsheetId, sheetName, SHEET_HEADERS);
  await applyMainSheetFormatting(spreadsheetId, sheetName);
}

export async function initConsolidatedSheet(spreadsheetId, sheetName) {
  await ensureHeaders(spreadsheetId, sheetName, CONSOLIDATED_SHEET_HEADERS);
  await applyConsolidatedSheetFormatting(spreadsheetId, sheetName);
}

// ─── Formatting — Main Sheet ──────────────────────────────────────────────────

async function applyMainSheetFormatting(spreadsheetId, sheetName) {
  try {
    const sheetId = await resolveSheetId(spreadsheetId, sheetName);
    if (sheetId == null) return;

    const colCount = SHEET_HEADERS.length; // 10

    // Clear accumulated conditional format rules from previous runs
    const clearRules = await buildDeleteConditionalFormatRequests(spreadsheetId, sheetId);

    const requests = [
      ...clearRules,

      // Reset all data row backgrounds to white (removes stale direct formatting)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
          fields: "userEnteredFormat.backgroundColor",
        },
      },

      // Freeze header row
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },

      // Header row: dark navy, bold white, centred
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              textFormat: { bold: true, foregroundColor: HEADER_FG, fontSize: 10 },
              wrapStrategy: "CLIP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)",
        },
      },

      // Data rows: vertical alignment middle, wrap for AI Summary (col I = index 8)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" },
          },
          fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
        },
      },

      // Column A (Ticket): bold
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              horizontalAlignment: "LEFT",
            },
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment)",
        },
      },

      // Column B (Status) and C (Priority): centered
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" },
          },
          fields: "userEnteredFormat(horizontalAlignment,verticalAlignment)",
        },
      },

      // Column widths
      ...SHEET_COLUMN_WIDTHS.map((width, index) => ({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize: width },
          fields: "pixelSize",
        },
      })),

      // ── Conditional formatting ──────────────────────────────────────────────
      // Whole-row highlight based on col B (Status). Formula anchors to $B (index 1).
      // Range covers all data rows across all columns.
      ...Object.entries(STATUS_COLOURS).map(([status, bg], i) => ({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount }],
            booleanRule: {
              condition: {
                type: "CUSTOM_FORMULA",
                values: [{ userEnteredValue: `=$B2="${status}"` }],
              },
              format: {
                backgroundColor: bg,
                textFormat: { foregroundColor: DARK_TEXT },
              },
            },
          },
          index: i,
        },
      })),

      // Priority "High" — colour just column C (index 2)
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 }],
            booleanRule: {
              condition: {
                type: "TEXT_EQ",
                values: [{ userEnteredValue: "High" }],
              },
              format: {
                backgroundColor: HIGH_PRIORITY_BG,
                textFormat: { bold: true, foregroundColor: DARK_TEXT },
              },
            },
          },
          index: Object.keys(STATUS_COLOURS).length,
        },
      },

      // Add thin borders to all data cells
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: colCount },
          innerHorizontal: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } },
          innerVertical:   { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.85 } },
        },
      },
    ];

    await batchUpdate(spreadsheetId, requests);
    console.log(`[Sheets] Formatted main sheet "${sheetName}".`);
  } catch (err) {
    console.warn(`[Sheets] Main sheet formatting skipped ("${sheetName}"):`, err.message);
  }
}

// ─── Formatting — Consolidated Sheet ─────────────────────────────────────────

async function applyConsolidatedSheetFormatting(spreadsheetId, sheetName) {
  try {
    const sheetId = await resolveSheetId(spreadsheetId, sheetName);
    if (sheetId == null) return;

    const colCount = CONSOLIDATED_SHEET_HEADERS.length; // 11

    // Clear accumulated conditional format rules from previous runs
    const clearRules = await buildDeleteConditionalFormatRequests(spreadsheetId, sheetId);

    const requests = [
      ...clearRules,

      // Reset all data row backgrounds to white (removes stale direct formatting)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
          fields: "userEnteredFormat.backgroundColor",
        },
      },

      // Freeze header row
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },

      // Header row: same dark navy
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              textFormat: { bold: true, foregroundColor: HEADER_FG, fontSize: 10 },
              wrapStrategy: "CLIP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)",
        },
      },

      // Wrap + top-align for all text-heavy columns: Summary(4), Action Items(5), Blockers(6), Risks(7), Highlights(8)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" },
          },
          fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
        },
      },

      // Numeric cols B & C (New / Total): centre
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" },
          },
          fields: "userEnteredFormat(horizontalAlignment,verticalAlignment)",
        },
      },

      // Column widths
      ...CONSOLIDATED_COLUMN_WIDTHS.map((width, index) => ({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize: width },
          fields: "pixelSize",
        },
      })),

      // Alternate row background — slightly more visible stripe for readability
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=ISEVEN(ROW())" }] },
              format: { backgroundColor: { red: 0.929, green: 0.941, blue: 0.965 } }, // #EDF0F6
            },
          },
          index: 0,
        },
      },

      // Blockers column (G = index 6): red when non-empty
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=LEN(TRIM($G2))>0' }] },
              format: {
                backgroundColor: { red: 0.988, green: 0.773, blue: 0.773 }, // #FCBCBC
                textFormat: { foregroundColor: DARK_TEXT, bold: true },
              },
            },
          },
          index: 1,
        },
      },

      // Risks column (H = index 7): amber when non-empty
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=LEN(TRIM($H2))>0' }] },
              format: {
                backgroundColor: { red: 0.996, green: 0.906, blue: 0.600 }, // #FEE799
                textFormat: { foregroundColor: DARK_TEXT },
              },
            },
          },
          index: 2,
        },
      },

      // Highlights column (I = index 8): green when non-empty
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=LEN(TRIM($I2))>0' }] },
              format: {
                backgroundColor: { red: 0.773, green: 0.929, blue: 0.796 }, // #C5EDCB
                textFormat: { foregroundColor: DARK_TEXT },
              },
            },
          },
          index: 3,
        },
      },

      // Rows where AI fell back to Basic: italic text
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$J2="Basic (local)"' }] },
              format: { textFormat: { italic: true } },
            },
          },
          index: 4,
        },
      },

      // Borders
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: colCount },
          innerHorizontal: { style: "SOLID", color: { red: 0.82, green: 0.82, blue: 0.82 } },
          innerVertical:   { style: "SOLID", color: { red: 0.87, green: 0.87, blue: 0.87 } },
        },
      },
    ];

    await batchUpdate(spreadsheetId, requests);
    console.log(`[Sheets] Formatted consolidated sheet "${sheetName}".`);
  } catch (err) {
    console.warn(`[Sheets] Consolidated sheet formatting skipped ("${sheetName}"):`, err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns deleteConditionalFormatRule requests for every existing rule on sheetId.
 * Deleting index 0 repeatedly works because Google processes batchUpdate sequentially
 * and each deletion shifts remaining rules down.
 */
async function buildDeleteConditionalFormatRequests(spreadsheetId, sheetId) {
  try {
    const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets(properties.sheetId,conditionalFormats)`;
    const resp = await fetchWithRetry(url, { retries: 2 });
    if (!resp.ok) return [];
    const meta = await resp.json();
    const sheet = (meta.sheets || []).find((s) => s.properties.sheetId === sheetId);
    const ruleCount = (sheet?.conditionalFormats || []).length;
    if (ruleCount === 0) return [];
    // Delete index 0 `ruleCount` times — each deletion shifts the list
    return Array.from({ length: ruleCount }, () => ({
      deleteConditionalFormatRule: { sheetId, index: 0 },
    }));
  } catch {
    return [];
  }
}

async function resolveSheetId(spreadsheetId, sheetName) {
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`;
  const resp = await fetchWithRetry(url, { retries: 2 });
  if (!resp.ok) return null;
  const meta = await resp.json();
  const sheet = (meta.sheets || []).find((s) => s.properties.title === sheetName);
  return sheet?.properties?.sheetId ?? null;
}

async function batchUpdate(spreadsheetId, requests) {
  const url = `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`;
  await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
}

// ─── Sheet Existence ──────────────────────────────────────────────────────────

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
    const batchUrl = `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`;
    const createResp = await authenticatedFetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] }),
    });
    if (!createResp.ok) {
      throw new Error(`Failed to create sheet tab: ${await createResp.text()}`);
    }
    console.log(`[Sheets] Created new tab: "${sheetName}"`);
  }
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
  }
}

// ─── Read Existing Tickets ────────────────────────────────────────────────────

/**
 * Read all ticket numbers already in column A of the sheet (for deduplication).
 */
export async function getExistingTicketNumbers(spreadsheetId, sheetName) {
  const range = `${sheetName}!A2:A`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await fetchWithRetry(url, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });

  if (!resp.ok) throw new Error(`Sheets read error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  return new Set((data.values || []).map((row) => row[0]).filter(Boolean));
}

// ─── Append Rows ──────────────────────────────────────────────────────────────

export async function writeRow(spreadsheetId, sheetName, rowData) {
  const range = `${sheetName}!A:A`;
  const url =
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const resp = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [rowData] }),
  });

  if (!resp.ok) throw new Error(`Sheets append error ${resp.status}: ${await resp.text()}`);
}

export async function writeRows(spreadsheetId, sheetName, rows) {
  if (!rows || rows.length === 0) return;

  const range = `${sheetName}!A:A`;
  const url =
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const resp = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });

  if (!resp.ok) throw new Error(`Sheets batch append error ${resp.status}: ${await resp.text()}`);
  console.log(`[Sheets] Appended ${rows.length} row(s).`);
}

// ─── Row Builders ─────────────────────────────────────────────────────────────

/**
 * Build a main-sheet row from a parsed email+ticket entry.
 * Uses HYPERLINK formulas for Jira and Gmail links.
 */
export function buildSheetRow(entry) {
  const source = `${entry.emailSubject || ""}\n${entry.body || ""}\n${entry.snippet || ""}`;
  const status   = detectRowStatus(source);
  const priority = detectRowPriority(source);

  // Use HYPERLINK() so cells are clickable in Sheets
  const jiraLink  = entry.jiraUrl  ? `=HYPERLINK("${escapeFormula(entry.jiraUrl)}","→ Jira")`  : "";
  const gmailLink = entry.gmailUrl ? `=HYPERLINK("${escapeFormula(entry.gmailUrl)}","→ Gmail")` : "";

  return [
    entry.ticketNumber || "",
    status,
    priority,
    sanitizeCell(entry.ticketTitle || entry.emailSubject || ""),
    entry.date ? formatDateTimeForSheet(new Date(entry.date)) : "",
    sanitizeCell(entry.from || ""),
    jiraLink,
    gmailLink,
    sanitizeCell(entry.aiSummary || ""),
    formatDateTimeForSheet(new Date()),
  ];
}

/**
 * Build a consolidated-insights row from AI sync results.
 */
export function buildConsolidatedSheetRow(entry) {
  const providerLabel = {
    openai:    "ChatGPT",
    anthropic: "Claude",
    basic:     "Basic (local)",
  }[entry.providerUsed] || entry.providerUsed || "Basic (local)";

  return [
    entry.syncTimestamp ? formatDateTimeForSheet(new Date(entry.syncTimestamp)) : "",
    String(entry.newTicketsAdded ?? entry.ticketCount ?? 0),
    String(entry.ticketCount || 0),
    (entry.ticketNumbers || []).join(", "),
    sanitizeCell(entry.summary    || ""),
    sanitizeCell(entry.actionItems || ""),
    sanitizeCell(entry.blockers   || ""),
    sanitizeCell(entry.risks      || ""),
    sanitizeCell(entry.highlights || ""),
    providerLabel,
    formatDateTimeForSheet(new Date()),
  ];
}

// ─── Status / Priority Detection ─────────────────────────────────────────────

function detectRowStatus(text) {
  const t = text.toLowerCase();
  if (/\b(blocked|blocker|stuck|dependency|waiting on|cannot proceed|on hold)\b/.test(t)) return "Blocked";
  if (/\b(resolved|fixed|closed|done|completed|deployed|shipped)\b/.test(t))               return "Resolved";
  if (/\b(in progress|working on|investigating|under review|wip|active)\b/.test(t))        return "In Progress";
  if (/\b(pending|awaiting|need input|waiting for|waiting for response)\b/.test(t))        return "Pending";
  return "Updated";
}

function detectRowPriority(text) {
  const t = text.toLowerCase();
  if (/\b(p0|p1|sev[- ]?0|sev[- ]?1|critical|urgent|asap|high priority|production down|outage|immediately)\b/.test(t)) {
    return "High";
  }
  if (/\b(p2|sev[- ]?2|medium priority|important)\b/.test(t)) {
    return "Medium";
  }
  return "Normal";
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatDateTimeForSheet(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d  = String(date.getDate()).padStart(2, "0");
  const h  = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s  = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/** Strip characters that would break a =HYPERLINK() formula */
function escapeFormula(url) {
  return String(url || "").replace(/"/g, "'");
}

/** Remove leading = to prevent formula injection in user-controlled text */
function sanitizeCell(text) {
  const s = String(text || "");
  return s.startsWith("=") ? `'${s}` : s;
}

async function fetchWithRetry(url, options = {}) {
  const { retries = 2, retryStatuses = [429, 500, 502, 503, 504], ...fetchOptions } = options;
  let attempt = 0;
  let response = null;
  let lastError = null;

  while (attempt <= retries) {
    try {
      response = await authenticatedFetch(url, fetchOptions);
      lastError = null;
    } catch (err) {
      lastError = err;
      if (!isRetriableNetworkError(err) || attempt === retries) {
        throw new Error(`Sheets network error: ${err.message}`);
      }
      await sleep(Math.min(3000, 300 * (2 ** attempt)));
      attempt++;
      continue;
    }
    if (!retryStatuses.includes(response.status)) return response;
    if (attempt === retries) return response;
    await sleep(Math.min(2000, 300 * (2 ** attempt)));
    attempt++;
  }
  if (lastError) throw new Error(`Sheets network error: ${lastError.message}`);
  return response;
}

function isRetriableNetworkError(err) {
  const m = String(err?.message || "");
  return m.includes("Failed to fetch") || m.includes("NetworkError") || m.includes("Network request failed");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
