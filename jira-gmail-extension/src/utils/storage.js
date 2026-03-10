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
  gmailSearchQuery: CONFIG.GMAIL_SEARCH_QUERY,
};

export async function getSettings() {
  const result = await storageGet(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  await storageSet({ [KEYS.SETTINGS]: { ...current, ...settings } });
}
