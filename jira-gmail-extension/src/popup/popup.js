/**
 * popup.js
 * Controls the extension popup UI.
 * Communicates with the service worker via chrome.runtime.sendMessage.
 */

import {
  getSettings,
  saveSettings,
  getLastSyncTime,
  getLastSyncAddedCount,
  getLastSyncDetectedCount,
  getSyncStatus,
  getUserEmailFromStorage,
  setUserEmail,
  clearUserEmail,
  clearSeenTicketIds,
  clearSyncMetrics,
} from "../utils/storage.js";
import { CONFIG } from "../config.js";
import { getAuthToken, getAuthTokenSilent, getUserEmail, revokeAuthToken } from "../utils/auth.js";

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const authShell       = $("authShell");
const appShell        = $("appShell");
const btnGoogleSignIn = $("btnGoogleSignIn");
const btnContinueGuest = $("btnContinueGuest");
const btnCreateGoogle = $("btnCreateGoogle");

const btnSync         = $("btnSync");
const btnStopSync     = $("btnStopSync");
const btnOpenSheet    = $("btnOpenSheet");
const btnSendTestReport = $("btnSendTestReport");
const btnOpenConfig   = $("btnOpenConfig");
const btnSignOut      = $("btnSignOut");
const btnSaveSettings = $("btnSaveSettings");
const btnClearCache   = $("btnClearCache");
const btnResetStats   = $("btnResetStats");
const settingsPanel   = $("settingsPanel");

const statusDot       = $("statusDot");
const statusText      = $("statusText");
const dailyReportStateEl = $("dailyReportState");
const userEmailEl     = $("userEmail");
const lastSyncTimeEl  = $("lastSyncTime");
const lastSyncTicketCountEl = $("lastSyncTicketCount");
const nextReportRunEl = $("nextReportRun");
const setupProgressEl = $("setupProgress");
const setupAuthItem = $("setupAuthItem");
const setupSheetItem = $("setupSheetItem");
const setupJiraItem = $("setupJiraItem");
const setupReportItem = $("setupReportItem");
const setupAiItem = $("setupAiItem");
const setupAuthText = $("setupAuthText");
const setupSheetText = $("setupSheetText");
const setupJiraText = $("setupJiraText");
const setupReportText = $("setupReportText");
const setupAiText = $("setupAiText");

const progressWrapper = $("progressWrapper");
const progressLabel   = $("progressLabel");
const progressFill    = $("progressFill");

// Settings fields
const fSpreadsheetId  = $("spreadsheetId");
const fSheetName      = $("sheetName");
const fJiraBaseUrl    = $("jiraBaseUrl");
const fGmailDatePreset = $("gmailDatePreset");
const fGmailFromDate  = $("gmailFromDate");
const fGmailToDate    = $("gmailToDate");
const fFastModeEnabled = $("fastModeEnabled");
const fMaxTotalEmails = $("maxTotalEmails");
const fAutoSyncIntvl  = $("autoSyncInterval");
const fDailyReportEnabled = $("dailyReportEnabled");
const fDailyReportTime = $("dailyReportTime");
const fReportRecipientEmail = $("reportRecipientEmail");
const fEnableAiSummaries = $("enableAiSummaries");
const fAiProvider = $("aiProvider");
const fAiSummaryMode = $("aiSummaryMode");
const fOpenAiApiKey = $("openAiApiKey");
const fOpenAiModel = $("openAiModel");
const fGeminiApiKey = $("geminiApiKey");
const fGeminiModel = $("geminiModel");
const fConsolidatedSheetName = $("consolidatedSheetName");
let popupSyncInProgress = false;
let isProgressListenerBound = false;

// ─── Initialization ───────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  const isSignedIn = await refreshAuthGate();
  if (!isSignedIn) return;

  await loadStatus();
  await loadSettings();
  listenForProgress();
}

async function loadStatus() {
  const [status, lastSync, lastAddedCount, lastDetectedCount, settings, userEmail] = await Promise.all([
    getSyncStatus(),
    getLastSyncTime(),
    getLastSyncAddedCount(),
    getLastSyncDetectedCount(),
    getSettings(),
    getUserEmailFromStorage(),
  ]);

  statusText.textContent = status || "Ready to sync";
  lastSyncTimeEl.textContent = lastSync
    ? new Date(lastSync).toLocaleString()
    : "—";
  const metricCount = Number.isFinite(lastDetectedCount) ? lastDetectedCount : lastAddedCount;
  lastSyncTicketCountEl.textContent = Number.isFinite(metricCount)
    ? String(metricCount)
    : "—";
  const recipient = (settings.reportRecipientEmail || "").trim();
  dailyReportStateEl.textContent = settings.dailyReportEnabled
    ? (recipient ? `Daily report: enabled to ${recipient}` : "Daily report: enabled (recipient not set)")
    : "Daily report: disabled";
  nextReportRunEl.textContent = getNextReportRunDisplay(settings);
  renderSetupChecklist(settings, userEmail);
}

async function loadSettings() {
  const settings = await getSettings();
  fSpreadsheetId.value = settings.spreadsheetId || "";
  fSheetName.value     = settings.sheetName      || "";
  fJiraBaseUrl.value   = settings.jiraBaseUrl    || "";
  fGmailDatePreset.value = settings.gmailDatePreset || CONFIG.GMAIL_DATE_PRESET;
  fGmailFromDate.value = settings.gmailFromDate || "";
  fGmailToDate.value = settings.gmailToDate || "";
  syncCustomDateFieldState();
  fFastModeEnabled.checked = Boolean(settings.fastModeEnabled);
  fMaxTotalEmails.value = String(settings.maxTotalEmails ?? CONFIG.MAX_TOTAL_EMAILS);
  fAutoSyncIntvl.value = settings.autoSyncIntervalMinutes ?? CONFIG.AUTO_SYNC_INTERVAL_MINUTES;
  fDailyReportEnabled.checked = settings.dailyReportEnabled ?? CONFIG.DAILY_REPORT_ENABLED;
  fDailyReportTime.value = formatTimeValue(
    settings.dailyReportHour ?? CONFIG.DAILY_REPORT_HOUR,
    settings.dailyReportMinute ?? CONFIG.DAILY_REPORT_MINUTE
  );
  fReportRecipientEmail.value = settings.reportRecipientEmail || "";
  fEnableAiSummaries.checked = Boolean(settings.enableAiSummaries);
  fAiProvider.value = settings.aiProvider || CONFIG.AI_PROVIDER;
  fAiSummaryMode.value = settings.aiSummaryMode || CONFIG.AI_SUMMARY_MODE;
  fOpenAiApiKey.value = "";
  fOpenAiApiKey.placeholder = settings.openAiApiKey ? "Configured (leave blank to keep)" : "sk-...";
  fOpenAiModel.value = settings.openAiModel || "";
  fGeminiApiKey.value = "";
  fGeminiApiKey.placeholder = settings.geminiApiKey ? "Configured (leave blank to keep)" : "AIza...";
  fGeminiModel.value = settings.geminiModel || CONFIG.GEMINI_MODEL;
  fConsolidatedSheetName.value = settings.consolidatedSheetName || "";
  const userEmail = await getUserEmailFromStorage();
  renderSetupChecklist(settings, userEmail);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  btnGoogleSignIn.addEventListener("click", handleGoogleSignIn);
  btnContinueGuest.addEventListener("click", async () => {
    await showAppShell("Not signed in");
    await loadStatus();
    await loadSettings();
    listenForProgress();
  });
  btnCreateGoogle.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://accounts.google.com/signup" });
  });
  btnSync.addEventListener("click", handleSyncNow);
  btnStopSync.addEventListener("click", handleStopSync);
  btnOpenSheet.addEventListener("click", handleOpenSheet);
  btnSendTestReport.addEventListener("click", handleSendTestReport);
  btnOpenConfig.addEventListener("click", handleOpenConfig);
  btnSignOut.addEventListener("click", handleSignOut);
  btnSaveSettings.addEventListener("click", handleSaveSettings);
  btnClearCache.addEventListener("click", handleClearCache);
  btnResetStats.addEventListener("click", handleResetStats);
  fGmailDatePreset.addEventListener("change", syncCustomDateFieldState);
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

async function handleSyncNow() {
  btnSync.classList.remove("sync-click");
  // Restart animation on every click.
  void btnSync.offsetWidth;
  btnSync.classList.add("sync-click");
  popupSyncInProgress = true;
  setUiState("syncing");

  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (response) => {
    popupSyncInProgress = false;
    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }

    if (response?.error) {
      setUiState("error", response.error);
      return;
    }
    if (response?.stopped) {
      setUiState("idle", "Sync stopped.");
      loadStatus();
      return;
    }

    const { added, detected, existing, skipped, total } = response.result;
    if (total === 0) {
      setUiState("idle", "No emails found. Adjust Gmail Query or date filters.");
      lastSyncTicketCountEl.textContent = "0";
      lastSyncTimeEl.textContent = new Date().toLocaleString();
      loadStatus();
      return;
    }
    const summary = `Done! ${detected} detected, ${added} new, ${existing || 0} existing, ${skipped} skipped (${total} emails scanned).`;
    setUiState("success", summary);
    lastSyncTicketCountEl.textContent = String(
      Number.isFinite(detected) ? detected : added
    );
    lastSyncTimeEl.textContent = new Date().toLocaleString();
    loadStatus();
  });
}

function handleStopSync() {
  if (!popupSyncInProgress) return;
  chrome.runtime.sendMessage({ type: "STOP_SYNC" }, (response) => {
    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      setUiState("idle", response?.message || "No sync in progress.");
      return;
    }
    setUiState("idle", "Stopping sync…");
  });
}

function handleSendTestReport() {
  popupSyncInProgress = true;
  setUiState("syncing", "Preparing test report…");

  chrome.runtime.sendMessage({ type: "SEND_TEST_REPORT" }, (response) => {
    popupSyncInProgress = false;

    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }
    if (response?.error) {
      setUiState("error", response.error);
      return;
    }
    if (response?.stopped) {
      setUiState("idle", "Test report stopped.");
      loadStatus();
      return;
    }

    const recipient = response?.recipientEmail || "recipient";
    const added = Number(response?.added || 0);
    setUiState("success", `Test report sent to ${recipient} (${added} new ticket(s)).`);
    loadStatus();
  });
}

function handleOpenConfig() {
  if (settingsPanel) {
    settingsPanel.open = true;
  }
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
    await clearUserEmail();
    userEmailEl.textContent = "Not signed in";
    setUiState("idle", "Signed out.");
    showAuthGate();
  } catch (err) {
    setUiState("error", err.message || "Sign out failed.");
  }
}

async function handleGoogleSignIn() {
  const originalLabel = btnGoogleSignIn.textContent;
  btnGoogleSignIn.disabled = true;
  btnGoogleSignIn.textContent = "Signing in…";
  try {
    // Try service-worker auth first so popup lifecycle does not break login flow.
    const authResponse = await sendMessageWithTimeout({ type: "AUTH_SIGN_IN" }, 12000).catch(() => null);

    if (authResponse?.ok && authResponse?.signedIn) {
      await setUserEmail(authResponse.email || "");
      await showAppShell(authResponse.email);
      await loadStatus();
      await loadSettings();
      listenForProgress();
      return;
    }

    // Fallback: interactive auth directly from popup.
    const token = await getAuthToken(true);
    const email = await getUserEmail(token);
    await setUserEmail(email || "");
    await showAppShell(email);
    await loadStatus();
    await loadSettings();
    listenForProgress();
  } catch (err) {
    alert(`Sign in failed: ${err.message || "Unable to sign in."}`);
  } finally {
    btnGoogleSignIn.disabled = false;
    btnGoogleSignIn.textContent = originalLabel;
  }
}

async function refreshAuthGate() {
  const storedEmail = await getUserEmailFromStorage();
  if (storedEmail) {
    await showAppShell(storedEmail);
    return true;
  }

  try {
    const token = await getAuthTokenSilent();
    if (!token) {
      showAuthGate();
      return false;
    }
    const email = await getUserEmail(token);
    await setUserEmail(email || "");
    await showAppShell(email);
    return Boolean(email);
  } catch {
    showAuthGate();
    return false;
  }
}

function showAuthGate() {
  authShell.hidden = false;
  appShell.hidden = true;
}

async function showAppShell(email) {
  authShell.hidden = true;
  appShell.hidden = false;
  userEmailEl.textContent = email || "Signed in";
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function handleSaveSettings() {
  const previousSettings = await getSettings();
  const { hour, minute } = parseTimeValue(
    fDailyReportTime.value || formatTimeValue(CONFIG.DAILY_REPORT_HOUR, CONFIG.DAILY_REPORT_MINUTE)
  );
  const nextOpenAiKey = fOpenAiApiKey.value.trim() || previousSettings.openAiApiKey || "";
  const nextGeminiKey = fGeminiApiKey.value.trim() || previousSettings.geminiApiKey || "";
  const settings = {
    spreadsheetId:          fSpreadsheetId.value.trim(),
    sheetName:              fSheetName.value.trim() || "Jira Tickets",
    jiraBaseUrl:            fJiraBaseUrl.value.trim().replace(/\/$/, ""),
    gmailDatePreset:        fGmailDatePreset.value || CONFIG.GMAIL_DATE_PRESET,
    gmailSearchQuery:       "",
    gmailFromDate:          (fGmailDatePreset.value === "custom" ? fGmailFromDate.value : "") || "",
    gmailToDate:            (fGmailDatePreset.value === "custom" ? fGmailToDate.value : "") || "",
    fastModeEnabled:        fFastModeEnabled.checked,
    maxTotalEmails:         Math.max(100, parseInt(fMaxTotalEmails.value, 10) || CONFIG.MAX_TOTAL_EMAILS),
    autoSyncIntervalMinutes: parseInt(fAutoSyncIntvl.value, 10) || 0,
    dailyReportEnabled:     fDailyReportEnabled.checked,
    dailyReportHour:        hour,
    dailyReportMinute:      minute,
    reportRecipientEmail:   fReportRecipientEmail.value.trim(),
    enableAiSummaries:      fEnableAiSummaries.checked,
    aiProvider:             fAiProvider.value || CONFIG.AI_PROVIDER,
    aiSummaryMode:          fAiSummaryMode.value || CONFIG.AI_SUMMARY_MODE,
    openAiApiKey:           nextOpenAiKey,
    openAiModel:            fOpenAiModel.value.trim() || CONFIG.OPENAI_MODEL,
    geminiApiKey:           nextGeminiKey,
    geminiModel:            fGeminiModel.value.trim() || CONFIG.GEMINI_MODEL,
    consolidatedSheetName:  fConsolidatedSheetName.value.trim() || CONFIG.CONSOLIDATED_SHEET_NAME,
  };

  let autoFallbackProvider = "";
  if (settings.enableAiSummaries && settings.aiProvider === "gemini" && !settings.geminiApiKey) {
    settings.aiProvider = "basic";
    autoFallbackProvider = "Gemini";
  }
  if (settings.enableAiSummaries && settings.aiProvider === "openai" && !settings.openAiApiKey) {
    settings.aiProvider = "basic";
    autoFallbackProvider = "OpenAI";
  }

  if (settings.enableAiSummaries) {
    if (!["basic", "openai", "gemini"].includes(settings.aiProvider)) {
      settings.aiProvider = "basic";
    }
  }
  if (settings.dailyReportEnabled && !isValidEmail(settings.reportRecipientEmail)) {
    alert("Enter a valid recipient email for daily reports.");
    return;
  }
  if (settings.gmailDatePreset === "custom" && (!settings.gmailFromDate || !settings.gmailToDate)) {
    alert("For Custom date range, both From Date and To Date are required.");
    return;
  }
  if (
    settings.gmailDatePreset === "custom" &&
    settings.gmailFromDate &&
    settings.gmailToDate &&
    settings.gmailFromDate > settings.gmailToDate
  ) {
    alert("From Date cannot be after To Date.");
    return;
  }

  await saveSettings(settings);
  if (autoFallbackProvider) {
    setUiState("idle", `${autoFallbackProvider} key missing. Saved with Basic AI mode.`);
  }

  // Restart alarm with new interval
  chrome.runtime.sendMessage({ type: "UPDATE_ALARM" });
  await loadStatus();

  btnSaveSettings.textContent = "Saved ✓";
  setTimeout(() => { btnSaveSettings.textContent = "Save Settings"; }, 2000);
}

async function handleClearCache() {
  if (!confirm("Clear the seen-ticket cache? Next sync will re-scan all emails but won't duplicate rows already in the sheet.")) return;
  await clearSeenTicketIds();
  setUiState("idle", "Cache cleared. Ready to sync.");
}

async function handleResetStats() {
  if (!confirm("Reset last sync time and ticket counters?")) return;
  await clearSyncMetrics();
  await loadStatus();
  setUiState("idle", "Sync stats reset.");
}

// ─── Progress Listener (from service worker broadcasts) ───────────────────────

function listenForProgress() {
  if (isProgressListenerBound) return;
  isProgressListenerBound = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SYNC_PROGRESS") {
      progressLabel.textContent = message.message;
      // Animate the progress bar pseudo-randomly while syncing
      progressFill.style.width = randomProgress() + "%";
    }
  });
}


function randomProgress() {
  const current = parseFloat(progressFill.style.width) || 10;
  return Math.min(current + Math.random() * 15 + 5, 90);
}

// ─── UI State Machine ─────────────────────────────────────────────────────────

function setUiState(state, message) {
  // Reset classes
  statusDot.className = "status-indicator";
  document.body.classList.remove("syncing-active");
  btnSync.disabled = false;
  btnSendTestReport.disabled = false;
  btnStopSync.disabled = true;
  progressWrapper.hidden = true;

  switch (state) {
    case "syncing":
      document.body.classList.add("syncing-active");
      statusDot.classList.add("syncing");
      statusText.textContent = "Syncing…";
      btnSync.disabled = true;
      btnSendTestReport.disabled = true;
      btnStopSync.disabled = false;
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

function parseTimeValue(value) {
  const [h, m] = String(value || "").split(":");
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(m, 10);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : CONFIG.DAILY_REPORT_HOUR,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : CONFIG.DAILY_REPORT_MINUTE,
  };
}

function formatTimeValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function getNextReportRunDisplay(settings) {
  if (!settings.dailyReportEnabled) return "Disabled";
  const hour = settings.dailyReportHour ?? CONFIG.DAILY_REPORT_HOUR;
  const minute = settings.dailyReportMinute ?? CONFIG.DAILY_REPORT_MINUTE;
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString();
}

function renderSetupChecklist(settings, userEmail) {
  const checks = {
    auth: Boolean(String(userEmail || "").trim()),
    sheet: Boolean(String(settings.spreadsheetId || "").trim()),
    jira: isValidHttpUrl(settings.jiraBaseUrl),
    report: !settings.dailyReportEnabled || isValidEmail(settings.reportRecipientEmail),
    ai: true,
  };

  setSetupItemState(
    setupAuthItem,
    checks.auth,
    setupAuthText,
    checks.auth ? `Google connected (${userEmail})` : "Google account not connected"
  );
  setSetupItemState(
    setupSheetItem,
    checks.sheet,
    setupSheetText,
    checks.sheet ? "Spreadsheet ID configured" : "Add Spreadsheet ID in Configuration"
  );
  setSetupItemState(
    setupJiraItem,
    checks.jira,
    setupJiraText,
    checks.jira ? "Jira base URL configured" : "Add valid Jira base URL (https://...)"
  );
  setSetupItemState(
    setupReportItem,
    checks.report,
    setupReportText,
    settings.dailyReportEnabled
      ? (checks.report ? "Daily report email configured" : "Daily report enabled but recipient email missing")
      : "Daily report is optional and currently disabled"
  );
  setSetupItemState(
    setupAiItem,
    checks.ai,
    setupAiText,
    settings.enableAiSummaries
      ? (
        settings.aiProvider === "basic"
          ? "AI basic mode enabled (no API key needed)"
          : (isAiProviderKeyConfigured(settings)
            ? "AI key configured"
            : `${settings.aiProvider === "gemini" ? "Gemini" : "OpenAI"} key missing; Basic fallback will be used`)
      )
      : "AI summaries are optional and currently disabled"
  );

  const done = Object.values(checks).filter(Boolean).length;
  setupProgressEl.textContent = `${done}/5 complete`;
}

function setSetupItemState(element, isComplete, textElement, text) {
  if (!element || !textElement) return;
  element.classList.remove("complete", "pending");
  element.classList.add(isComplete ? "complete" : "pending");
  textElement.textContent = text;
}

function isValidHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAiProviderKeyConfigured(settings) {
  const provider = String(settings.aiProvider || "basic").toLowerCase();
  if (provider === "basic") return true;
  if (provider === "gemini") return Boolean(String(settings.geminiApiKey || "").trim());
  return Boolean(String(settings.openAiApiKey || "").trim());
}

function syncCustomDateFieldState() {
  const isCustom = fGmailDatePreset.value === "custom";
  fGmailFromDate.disabled = !isCustom;
  fGmailToDate.disabled = !isCustom;
}

function sendMessageWithTimeout(payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out.")), timeoutMs);
    chrome.runtime.sendMessage(payload, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init().catch(console.error);
