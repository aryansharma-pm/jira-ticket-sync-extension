/**
 * storage.js
 * Abstractions over chrome.storage.local for clean read/write operations.
 */

import { CONFIG } from "../config.js";

const KEYS = CONFIG.STORAGE_KEYS;

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

export function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

export function storageSessionGet(keys) {
  return new Promise((resolve) => {
    if (!chrome.storage.session) {
      resolve({});
      return;
    }
    chrome.storage.session.get(keys, resolve);
  });
}

export function storageSessionSet(items) {
  return new Promise((resolve) => {
    if (!chrome.storage.session) {
      resolve();
      return;
    }
    chrome.storage.session.set(items, resolve);
  });
}

// ─── Seen Ticket IDs ─────────────────────────────────────────────────────────

/**
 * Load the set of already-synced ticket numbers.
 * @returns {Promise<Set<string>>}
 */
export async function getSeenTicketIds() {
  const result = await storageGet(KEYS.SEEN_TICKET_IDS);
  const arr = result[KEYS.SEEN_TICKET_IDS] || [];
  return new Set(arr);
}

/**
 * Add new ticket IDs to the persisted seen-set.
 * @param {string[]} newIds
 */
export async function addSeenTicketIds(newIds) {
  const existing = await getSeenTicketIds();
  newIds.forEach((id) => existing.add(id));
  await storageSet({ [KEYS.SEEN_TICKET_IDS]: [...existing] });
}

/**
 * Clear the seen-ticket cache (forces a full re-sync on next run).
 */
export async function clearSeenTicketIds() {
  await storageSet({ [KEYS.SEEN_TICKET_IDS]: [] });
}

// ─── Sync Metadata ───────────────────────────────────────────────────────────

export async function setLastSyncTime(isoString) {
  await storageSet({ [KEYS.LAST_SYNC_TIME]: isoString });
}

export async function getLastSyncTime() {
  const result = await storageGet(KEYS.LAST_SYNC_TIME);
  return result[KEYS.LAST_SYNC_TIME] || null;
}

export async function setLastSyncAddedCount(count) {
  await storageSet({ [KEYS.LAST_SYNC_ADDED_COUNT]: Number(count) || 0 });
}

export async function getLastSyncAddedCount() {
  const result = await storageGet(KEYS.LAST_SYNC_ADDED_COUNT);
  const value = result[KEYS.LAST_SYNC_ADDED_COUNT];
  return Number.isFinite(value) ? value : null;
}

export async function setLastSyncDetectedCount(count) {
  await storageSet({ [KEYS.LAST_SYNC_DETECTED_COUNT]: Number(count) || 0 });
}

export async function getLastSyncDetectedCount() {
  const result = await storageGet(KEYS.LAST_SYNC_DETECTED_COUNT);
  const value = result[KEYS.LAST_SYNC_DETECTED_COUNT];
  return Number.isFinite(value) ? value : null;
}

export async function clearSyncMetrics() {
  await storageSet({
    [KEYS.LAST_SYNC_TIME]: null,
    [KEYS.LAST_SYNC_ADDED_COUNT]: null,
    [KEYS.LAST_SYNC_DETECTED_COUNT]: null,
  });
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

const MAX_AUDIT_LOG_ENTRIES = 200;

export async function getAuditLog(limit = 30) {
  const result = await storageGet(KEYS.AUDIT_LOG);
  const entries = Array.isArray(result[KEYS.AUDIT_LOG]) ? result[KEYS.AUDIT_LOG] : [];
  if (!Number.isFinite(limit) || limit <= 0) return entries;
  return entries.slice(-Math.floor(limit));
}

export async function appendAuditLog(entry) {
  const existing = await getAuditLog(0);
  const next = [...existing, entry].slice(-MAX_AUDIT_LOG_ENTRIES);
  await storageSet({ [KEYS.AUDIT_LOG]: next });
}

export async function clearAuditLog() {
  await storageSet({ [KEYS.AUDIT_LOG]: [] });
}


export async function setSyncStatus(message) {
  await storageSet({ [KEYS.SYNC_STATUS]: message });
}

export async function getSyncStatus() {
  const result = await storageGet(KEYS.SYNC_STATUS);
  return result[KEYS.SYNC_STATUS] || "Never synced";
}

// ─── User Email ──────────────────────────────────────────────────────────────

export async function setUserEmail(email) {
  await storageSet({ [KEYS.USER_EMAIL]: email });
}

export async function clearUserEmail() {
  await storageSet({ [KEYS.USER_EMAIL]: "" });
}

export async function getUserEmailFromStorage() {
  const result = await storageGet(KEYS.USER_EMAIL);
  return result[KEYS.USER_EMAIL] || null;
}

// ─── User Settings ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  spreadsheetId: CONFIG.SPREADSHEET_ID,
  sheetName: CONFIG.SHEET_NAME,
  jiraBaseUrl: CONFIG.JIRA_BASE_URL,
  autoSyncIntervalMinutes: CONFIG.AUTO_SYNC_INTERVAL_MINUTES,
  dailyReportEnabled: CONFIG.DAILY_REPORT_ENABLED,
  dailyReportHour: CONFIG.DAILY_REPORT_HOUR,
  dailyReportMinute: CONFIG.DAILY_REPORT_MINUTE,
  reportRecipientEmail: CONFIG.REPORT_RECIPIENT_EMAIL,
  gmailDatePreset: CONFIG.GMAIL_DATE_PRESET,
  gmailSearchQuery: "",
  gmailFromDate: "",
  gmailToDate: "",
  maxTotalEmails: CONFIG.MAX_TOTAL_EMAILS,
  maxConcurrentMessageFetches: CONFIG.MAX_CONCURRENT_MESSAGE_FETCHES,
  maxConcurrentAiRequests: CONFIG.MAX_CONCURRENT_AI_REQUESTS,
  fastModeEnabled: false,
  enableAiSummaries: CONFIG.ENABLE_AI_SUMMARIES,
  aiProvider: CONFIG.AI_PROVIDER,
  aiSummaryMode: CONFIG.AI_SUMMARY_MODE,
  openAiApiKey: "",
  openAiModel: CONFIG.OPENAI_MODEL,
  geminiApiKey: "",
  geminiModel: CONFIG.GEMINI_MODEL,
  consolidatedSheetName: CONFIG.CONSOLIDATED_SHEET_NAME,
};

export async function getSettings() {
  const [localResult, sessionResult] = await Promise.all([
    storageGet(KEYS.SETTINGS),
    storageSessionGet([KEYS.OPENAI_API_KEY, KEYS.GEMINI_API_KEY]),
  ]);

  const localSettings = localResult[KEYS.SETTINGS] || {};
  const sessionOpenAiKey = sessionResult[KEYS.OPENAI_API_KEY];
  const sessionGeminiKey = sessionResult[KEYS.GEMINI_API_KEY];
  const settings = { ...DEFAULT_SETTINGS, ...localSettings };

  // Backward-compat: if keys exist in local settings from older versions,
  // surface them now and migrate them into session storage.
  const migratedOpenAiKey = sessionOpenAiKey || localSettings.openAiApiKey || "";
  const migratedGeminiKey = sessionGeminiKey || localSettings.geminiApiKey || "";
  settings.openAiApiKey = migratedOpenAiKey;
  settings.geminiApiKey = migratedGeminiKey;

  if ((!sessionOpenAiKey && localSettings.openAiApiKey) || (!sessionGeminiKey && localSettings.geminiApiKey)) {
    const { openAiApiKey: _openAiApiKey, geminiApiKey: _geminiApiKey, ...sanitizedLocalSettings } = localSettings;
    await Promise.all([
      storageSessionSet({
        [KEYS.OPENAI_API_KEY]: localSettings.openAiApiKey || "",
        [KEYS.GEMINI_API_KEY]: localSettings.geminiApiKey || "",
      }),
      storageSet({ [KEYS.SETTINGS]: sanitizedLocalSettings }),
    ]);
  }

  return settings;
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  const {
    openAiApiKey = "",
    geminiApiKey = "",
    ...persistedSettings
  } = merged;

  await Promise.all([
    storageSet({ [KEYS.SETTINGS]: persistedSettings }),
    storageSessionSet({
      [KEYS.OPENAI_API_KEY]: openAiApiKey,
      [KEYS.GEMINI_API_KEY]: geminiApiKey,
    }),
  ]);
}
