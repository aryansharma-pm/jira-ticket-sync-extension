/**
 * popup.js
 * Controls the extension popup UI.
 * Communicates with the service worker via chrome.runtime.sendMessage.
 */

import {
  getSettings,
  saveSettings,
  getLastSyncTime,
  getSyncStatus,
  getUserEmailFromStorage,
  clearSeenTicketIds,
} from "../utils/storage.js";
import { revokeAuthToken } from "../utils/auth.js";
import { CONFIG } from "../config.js";

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const btnSync         = $("btnSync");
const btnOpenSheet    = $("btnOpenSheet");
const btnSignOut      = $("btnSignOut");
const btnSaveSettings = $("btnSaveSettings");
const btnClearCache   = $("btnClearCache");

const statusDot       = $("statusDot");
const statusText      = $("statusText");
const userEmailEl     = $("userEmail");
const lastSyncTimeEl  = $("lastSyncTime");
const lastSyncTicketCountEl = $("lastSyncTicketCount");

const progressWrapper = $("progressWrapper");
const progressLabel   = $("progressLabel");
const progressFill    = $("progressFill");

// Settings fields
const fSpreadsheetId  = $("spreadsheetId");
const fSheetName      = $("sheetName");
const fJiraBaseUrl    = $("jiraBaseUrl");
const fGmailQuery     = $("gmailQuery");
const fAutoSyncIntvl  = $("autoSyncInterval");

// ─── Initialization ───────────────────────────────────────────────────────────

async function init() {
  await loadStatus();
  await loadSettings();
  await loadUserEmail();
  bindEvents();
  listenForProgress();
}

async function loadStatus() {
  const [status, lastSync] = await Promise.all([
    getSyncStatus(),
    getLastSyncTime(),
  ]);

  statusText.textContent = status || "Ready to sync";
  lastSyncTimeEl.textContent = lastSync
    ? new Date(lastSync).toLocaleString()
    : "—";
  const lastAddedCount = extractLastAddedCount(status);
  lastSyncTicketCountEl.textContent = Number.isFinite(lastAddedCount)
    ? String(lastAddedCount)
    : "—";
}

async function loadSettings() {
  const settings = await getSettings();
  fSpreadsheetId.value = settings.spreadsheetId || "";
  fSheetName.value     = settings.sheetName      || "";
  fJiraBaseUrl.value   = settings.jiraBaseUrl    || "";
  fGmailQuery.value    = settings.gmailSearchQuery || "";
  fAutoSyncIntvl.value = settings.autoSyncIntervalMinutes ?? 30;
}

async function loadUserEmail() {
  const email = await getUserEmailFromStorage();
  if (email) {
    userEmailEl.textContent = email;
    btnSignOut.hidden = false;
  }
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  btnSync.addEventListener("click", handleSyncNow);
  btnOpenSheet.addEventListener("click", handleOpenSheet);
  btnSignOut.addEventListener("click", handleSignOut);
  btnSaveSettings.addEventListener("click", handleSaveSettings);
  btnClearCache.addEventListener("click", handleClearCache);
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

async function handleSyncNow() {
  setUiState("syncing");

  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (response) => {
    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }

    if (response?.error) {
      setUiState("error", response.error);
      return;
    }

    const { added, skipped, total } = response.result;
    const summary = `Done! ${added} ticket(s) added, ${skipped} skipped (${total} emails scanned).`;
    setUiState("success", summary);

    loadStatus();
  });
}

// ─── Sheet Link ───────────────────────────────────────────────────────────────

async function handleOpenSheet() {
  const settings = await getSettings();
  if (!settings.spreadsheetId) {
    alert("Please configure your Spreadsheet ID in Settings first.");
    return;
  }
  const url = `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit`;
  chrome.tabs.create({ url });
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

async function handleSignOut() {
  try {
    await revokeAuthToken();
    userEmailEl.textContent = "Not signed in";
    btnSignOut.hidden = true;
    setUiState("idle", "Signed out.");
  } catch (err) {
    console.error("Sign out failed:", err);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function handleSaveSettings() {
  const settings = {
    spreadsheetId:          fSpreadsheetId.value.trim(),
    sheetName:              fSheetName.value.trim() || "Jira Tickets",
    jiraBaseUrl:            fJiraBaseUrl.value.trim().replace(/\/$/, ""),
    gmailSearchQuery:       fGmailQuery.value.trim() || "newer_than:30d",
    autoSyncIntervalMinutes: parseInt(fAutoSyncIntvl.value, 10) || 0,
  };

  await saveSettings(settings);

  // Restart alarm with new interval
  chrome.runtime.sendMessage({ type: "UPDATE_ALARM" });

  btnSaveSettings.textContent = "Saved ✓";
  setTimeout(() => { btnSaveSettings.textContent = "Save Settings"; }, 2000);
}

async function handleClearCache() {
  if (!confirm("Clear the seen-ticket cache? Next sync will re-scan all emails but won't duplicate rows already in the sheet.")) return;
  await clearSeenTicketIds();
  setUiState("idle", "Cache cleared. Ready to sync.");
}

// ─── Progress Listener (from service worker broadcasts) ───────────────────────

function listenForProgress() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SYNC_PROGRESS") {
      progressLabel.textContent = message.message;
      // Animate the progress bar pseudo-randomly while syncing
      progressFill.style.width = randomProgress() + "%";
    }
  });
}


function extractLastAddedCount(statusMessage) {
  if (!statusMessage) return null;
  const match = statusMessage.match(/(?:—|-)\s*(\d+)\s+added/i);
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
}

function randomProgress() {
  const current = parseFloat(progressFill.style.width) || 10;
  return Math.min(current + Math.random() * 15 + 5, 90);
}

// ─── UI State Machine ─────────────────────────────────────────────────────────

function setUiState(state, message) {
  // Reset classes
  statusDot.className = "status-indicator";
  btnSync.disabled = false;
  progressWrapper.hidden = true;

  switch (state) {
    case "syncing":
      statusDot.classList.add("syncing");
      statusText.textContent = "Syncing…";
      btnSync.disabled = true;
      progressWrapper.hidden = false;
      progressLabel.textContent = "Starting…";
      progressFill.style.width = "10%";
      break;

    case "success":
      statusDot.classList.add("success");
      statusText.textContent = message || "Sync complete!";
      progressFill.style.width = "100%";
      setTimeout(() => { progressWrapper.hidden = true; }, 1500);
      break;

    case "error":
      statusDot.classList.add("error");
      statusText.textContent = `Error: ${message}`;
      progressWrapper.hidden = true;
      break;

    case "idle":
    default:
      statusText.textContent = message || "Ready to sync";
      break;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init().catch(console.error);
