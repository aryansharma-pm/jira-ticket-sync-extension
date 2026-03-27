/**
 * service-worker.js
 * Chrome Manifest V3 service worker.
 * Handles:
 *  - Message passing from popup
 *  - Periodic alarms for auto-sync
 *  - Desktop notifications on sync completion
 */

import { runSync } from "./syncEngine.js";
import { getSettings, getSyncStatus, setSyncStatus, setUserEmail, clearUserEmail, getUserEmailFromStorage } from "../utils/storage.js";
import { CONFIG } from "../config.js";
import { sendConsolidatedReportEmail } from "../gmail/reportMailer.js";
import { sendMorningBrief, sendEveningReport } from "../gmail/dailyBrief.js";
import { fetchUpcomingEvents } from "../calendar/calendarClient.js";
import { getAuthToken, getAuthTokenSilent, getUserEmail, revokeAuthToken, forceReauth, setAuthRefreshInteractive } from "../utils/auth.js";
import { runReminderChecks, getReminderAlerts } from "../utils/reminderEngine.js";
import { checkAndGeneratePrecallBrief } from "../calendar/precallBrief.js";
import { getPendingFollowups, dismissFollowup } from "../gmail/followupTracker.js";
import { getTaskStore } from "../utils/taskStore.js";
import { reviewGhostTask } from "../utils/ghostTaskDetector.js";
import { getCommitments } from "../utils/commitmentExtractor.js";
import { searchDecisions } from "../utils/decisionLog.js";

// ─── Install / Startup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log("[SW] Installed, reason:", reason);
  await setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[SW] Browser started, setting up alarm.");
  await setupAlarms();
});

/**
 * Create (or recreate) sync alarms based on user settings.
 */
async function setupAlarms() {
  await setupIntervalAlarm();
  await setupDailyReportAlarm();
  await setupMorningBriefAlarm();
  await setupEveningReportAlarm();
  await setupReminderCheckAlarm();
  await setupPrecallCheckAlarm();
}

async function setupIntervalAlarm() {
  const settings = await getSettings();
  const intervalMinutes = settings.autoSyncIntervalMinutes;

  // Clear any existing alarm first
  chrome.alarms.clear(CONFIG.ALARM_NAME);

  if (intervalMinutes > 0) {
    chrome.alarms.create(CONFIG.ALARM_NAME, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
    console.log(`[SW] Auto-sync alarm set for every ${intervalMinutes} minutes.`);
  } else {
    console.log("[SW] Auto-sync disabled (interval = 0).");
  }
}

async function setupDailyReportAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(CONFIG.DAILY_REPORT_ALARM_NAME);

  if (!settings.dailyReportEnabled) {
    console.log("[SW] Daily report disabled.");
    return;
  }

  const when = nextDailyRunTime(settings.dailyReportHour, settings.dailyReportMinute);
  chrome.alarms.create(CONFIG.DAILY_REPORT_ALARM_NAME, { when });
  console.log(`[SW] Daily report alarm scheduled for ${new Date(when).toLocaleString()}.`);
}

async function setupMorningBriefAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(CONFIG.MORNING_BRIEF_ALARM_NAME);
  if (!settings.morningBriefEnabled) return;

  const when = nextDailyRunTime(settings.morningBriefHour ?? CONFIG.MORNING_BRIEF_HOUR, settings.morningBriefMinute ?? CONFIG.MORNING_BRIEF_MINUTE);
  chrome.alarms.create(CONFIG.MORNING_BRIEF_ALARM_NAME, { when });
  console.log(`[SW] Morning brief alarm set for ${new Date(when).toLocaleString()}.`);
}

async function setupEveningReportAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(CONFIG.EVENING_REPORT_ALARM_NAME);
  if (!settings.eveningReportEnabled) return;

  const when = nextDailyRunTime(settings.eveningReportHour ?? CONFIG.EVENING_REPORT_HOUR, settings.eveningReportMinute ?? CONFIG.EVENING_REPORT_MINUTE);
  chrome.alarms.create(CONFIG.EVENING_REPORT_ALARM_NAME, { when });
  console.log(`[SW] Evening report alarm set for ${new Date(when).toLocaleString()}.`);
}

async function setupReminderCheckAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(CONFIG.REMINDER_CHECK_ALARM_NAME);
  const intervalMinutes = settings.enableFollowupTracking || settings.enableCommitmentTracking || settings.enableSentimentTracking
    ? (CONFIG.REMINDER_CHECK_INTERVAL_MINUTES)
    : 0;
  if (intervalMinutes <= 0) return;
  chrome.alarms.create(CONFIG.REMINDER_CHECK_ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
  console.log(`[SW] Reminder check alarm set every ${intervalMinutes} min.`);
}

async function setupPrecallCheckAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(CONFIG.PRECALL_CHECK_ALARM_NAME);
  if (!settings.enableCalendarIntegration) return;
  const interval = CONFIG.PRECALL_CHECK_INTERVAL_MINUTES;
  chrome.alarms.create(CONFIG.PRECALL_CHECK_ALARM_NAME, {
    delayInMinutes: interval,
    periodInMinutes: interval,
  });
  console.log(`[SW] Pre-call check alarm set every ${interval} min.`);
}

// ─── Alarm Handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CONFIG.ALARM_NAME) {
    await runIntervalSync();
    return;
  }

  if (alarm.name === CONFIG.DAILY_REPORT_ALARM_NAME) {
    try { await runDailyReportSync(); } finally { await setupDailyReportAlarm(); }
    return;
  }

  if (alarm.name === CONFIG.MORNING_BRIEF_ALARM_NAME) {
    try { await runMorningBrief(); } finally { await setupMorningBriefAlarm(); }
    return;
  }

  if (alarm.name === CONFIG.EVENING_REPORT_ALARM_NAME) {
    try { await runEveningReport(); } finally { await setupEveningReportAlarm(); }
    return;
  }

  if (alarm.name === CONFIG.REMINDER_CHECK_ALARM_NAME) {
    try {
      const alerts = await runReminderChecks();
      console.log(`[SW] Reminder check: ${alerts.length} alert(s).`);
      if (alerts.length > 0) {
        showNotification("Jira Tracker — Reminders", `${alerts.length} item(s) need your attention.`);
      }
    } catch (err) {
      console.warn("[SW] Reminder check failed:", err.message);
    }
    return;
  }

  if (alarm.name === CONFIG.PRECALL_CHECK_ALARM_NAME) {
    try {
      const brief = await checkAndGeneratePrecallBrief(20);
      if (brief) {
        broadcastProgress(`📅 Pre-call brief ready: ${brief.event.title}`);
        showNotification("Meeting starting soon", brief.event.title);
      }
    } catch (err) {
      console.warn("[SW] Pre-call check failed:", err.message);
    }
    return;
  }
});

async function runIntervalSync() {
  if (isSyncing) {
    console.log("[SW] Interval sync skipped because another sync is already running.");
    return;
  }

  console.log("[SW] Interval alarm fired, running background sync…");
  isSyncing = true;
  cancelRequested = false;
  setAuthRefreshInteractive(false);

  try {
    const result = await runSync({
      onProgress: (msg) => console.log("[BG Sync]", msg),
      interactiveAuth: false,
      shouldCancel: () => cancelRequested,
    });
    console.log("[SW] Background sync complete:", result);

    showNotification("Jira Gmail Tracker", `Sync complete: ${result.added} new ticket(s) added.`);
  } catch (err) {
    if (err.message === "Sync stopped by user.") {
      console.log("[SW] Background sync stopped by user.");
      await setSyncStatus("Sync stopped.");
      return;
    }
    console.error("[SW] Background sync failed:", err);
    await setSyncStatus(`Error: ${toUserFriendlyError(err)}`);
  } finally {
    setAuthRefreshInteractive(false);
    isSyncing = false;
    cancelRequested = false;
  }
}

// ─── Message Handling (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id && sender.id !== chrome.runtime.id) {
    console.warn("[SW] Rejected message from unexpected sender:", sender.id);
    return false;
  }

  switch (message.type) {
    // ── Trigger manual sync ──────────────────────────────────────────────────
    case "SYNC_NOW":
      handleSyncNow(sendResponse);
      return true; // Keep message channel open for async response

    // ── Get current sync status ──────────────────────────────────────────────
    case "GET_STATUS":
      getSyncStatus().then((status) => sendResponse({ status }));
      return true;

    case "AUTH_STATUS":
      handleAuthStatus(sendResponse);
      return true;

    case "AUTH_SIGN_IN":
      handleAuthSignIn(sendResponse);
      return true;

    case "AUTH_SIGN_OUT":
      handleAuthSignOut(sendResponse);
      return true;

    // ── Update auto-sync alarm after settings change ─────────────────────────
    case "UPDATE_ALARM":
      setupAlarms().then(() => sendResponse({ ok: true }));
      return true;

    // ── Stop currently running sync ──────────────────────────────────────────
    case "STOP_SYNC":
      handleStopSync(sendResponse);
      return true;

    case "SEND_TEST_REPORT":
      handleSendTestReport(sendResponse);
      return true;

    // ── Intelligence features ────────────────────────────────────────────────
    case "GET_REMINDERS":
      getReminderAlerts().then((alerts) => sendResponse({ alerts })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "RUN_REMINDER_CHECKS":
      runReminderChecks().then((alerts) => sendResponse({ alerts })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GET_FOLLOWUPS":
      getPendingFollowups().then((followups) => sendResponse({ followups })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "DISMISS_FOLLOWUP":
      dismissFollowup(message.messageId).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GET_TASKS":
      getTaskStore(message.filter || {}).then((tasks) => sendResponse({ tasks })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "REVIEW_GHOST_TASK":
      reviewGhostTask(message.taskId, message.decision).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GET_COMMITMENTS":
      getCommitments().then((commitments) => sendResponse({ commitments })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GET_PRECALL_BRIEF":
      checkAndGeneratePrecallBrief(message.minutesAhead ?? 20).then((brief) => sendResponse({ brief })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "SEARCH_DECISIONS":
      searchDecisions(message.query || "").then((decisions) => sendResponse({ decisions })).catch((err) => sendResponse({ error: err.message }));
      return true;

    case "FORCE_REAUTH":
      forceReauth()
        .then((token) => getUserEmail(token))
        .then((email) => {
          if (email) setUserEmail(email);
          sendResponse({ ok: true, email: email || "" });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_TODAY_MEETINGS":
      getTodaysMeetings().then((events) => sendResponse({ events })).catch((err) => sendResponse({ error: err.message, events: [] }));
      return true;

    default:
      console.warn("[SW] Unknown message type:", message.type);
  }
});

// ─── Sync Handler ─────────────────────────────────────────────────────────────

let isSyncing = false;
let cancelRequested = false;

async function handleSyncNow(sendResponse) {
  if (isSyncing) {
    sendResponse({ error: "Sync already in progress." });
    return;
  }

  isSyncing = true;
  cancelRequested = false;
  setAuthRefreshInteractive(true);
  await setSyncStatus("Syncing…");

  try {
    const result = await runSync({
      onProgress: async (msg) => {
        await setSyncStatus(msg);
        broadcastProgress(msg);
      },
      interactiveAuth: true,
      shouldCancel: () => cancelRequested,
    });

    sendResponse({ result });
  } catch (err) {
    if (err.message === "Sync stopped by user.") {
      console.log("[SW] Manual sync stopped by user.");
      await setSyncStatus("Sync stopped.");
      sendResponse({ stopped: true });
    } else {
      console.error("[SW] Manual sync error:", err);
      await setSyncStatus(`Error: ${err.message}`);
      sendResponse({ error: err.message });
    }
  } finally {
    setAuthRefreshInteractive(false);
    isSyncing = false;
    cancelRequested = false;
  }
}

function handleStopSync(sendResponse) {
  if (!isSyncing) {
    sendResponse({ ok: false, message: "No sync in progress." });
    return;
  }

  cancelRequested = true;
  setSyncStatus("Stopping sync…").catch(() => {});
  broadcastProgress("Stopping sync…");
  sendResponse({ ok: true });
}

// ─── Notifications ────────────────────────────────────────────────────────────

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message,
  });
}

function broadcastProgress(message) {
  chrome.runtime.sendMessage({ type: "SYNC_PROGRESS", message }, () => {
    if (chrome.runtime.lastError) {
      // No popup is listening. This is expected during background-only syncs.
      return;
    }
  });
}

async function runDailyReportSync() {
  if (isSyncing) {
    console.log("[SW] Daily report skipped because another sync is already running.");
    return;
  }

  const settings = await getSettings();
  const recipientEmail = (settings.reportRecipientEmail || "").trim() || (await getUserEmailFromStorage()) || "";
  if (!recipientEmail) {
    await setSyncStatus("Daily report skipped: recipient email not configured.");
    return;
  }

  isSyncing = true;
  cancelRequested = false;
  setAuthRefreshInteractive(false);
  await setSyncStatus("Running scheduled 9:30 AM sync…");

  try {
    const result = await runSync({
      onProgress: async (msg) => {
        await setSyncStatus(msg);
      },
      interactiveAuth: false,
      shouldCancel: () => cancelRequested,
    });

    await sendConsolidatedReportEmail({
      recipientEmail,
      report: {
        ...result.report,
        added: result.added,
      },
    });

    await setSyncStatus(`Scheduled report sent to ${recipientEmail}.`);
    showNotification("Jira Gmail Tracker", `Daily report sent to ${recipientEmail}`);
  } catch (err) {
    if (err.message === "Sync stopped by user.") {
      console.log("[SW] Daily report sync stopped by user.");
      await setSyncStatus("Scheduled sync stopped.");
      return;
    }
    console.error("[SW] Daily report sync failed:", err);
    await setSyncStatus(`Error: ${toUserFriendlyError(err)}`);
  } finally {
    setAuthRefreshInteractive(false);
    isSyncing = false;
    cancelRequested = false;
  }
}

async function handleSendTestReport(sendResponse) {
  if (isSyncing) {
    sendResponse({ error: "Another sync/report is already in progress." });
    return;
  }

  const settings = await getSettings();
  const recipientEmail = (settings.reportRecipientEmail || "").trim() || (await getUserEmailFromStorage()) || "";
  if (!recipientEmail) {
    sendResponse({ error: "Report recipient email is not configured." });
    return;
  }

  isSyncing = true;
  cancelRequested = false;
  setAuthRefreshInteractive(true);
  await setSyncStatus("Running test report sync…");

  try {
    const result = await runSync({
      onProgress: async (msg) => {
        await setSyncStatus(msg);
        broadcastProgress(msg);
      },
      interactiveAuth: true,
      shouldCancel: () => cancelRequested,
    });

    await sendConsolidatedReportEmail({
      recipientEmail,
      report: {
        ...result.report,
        added: result.added,
      },
    });

    await setSyncStatus(`Test report sent to ${recipientEmail}.`);
    showNotification("Jira Gmail Tracker", `Test report sent to ${recipientEmail}`);
    sendResponse({ ok: true, recipientEmail, added: result.added });
  } catch (err) {
    if (err.message === "Sync stopped by user.") {
      await setSyncStatus("Test report stopped.");
      sendResponse({ stopped: true });
    } else {
      console.error("[SW] Test report error:", err);
      const message = toUserFriendlyError(err);
      await setSyncStatus(`Error: ${message}`);
      sendResponse({ error: message });
    }
  } finally {
    setAuthRefreshInteractive(false);
    isSyncing = false;
    cancelRequested = false;
  }
}

async function getTodaysMeetings() {
  // Show today's meetings regardless of the enableCalendarIntegration flag —
  // the meetings panel is a standalone view that should always be available.
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // hoursAhead from start of day covers the full calendar day
  const hoursFromStartOfDay = (endOfDay - startOfDay) / (1000 * 60 * 60); // always 24
  return fetchUpcomingEvents({
    hoursAhead: hoursFromStartOfDay,
    // Override timeMin to start of today so past meetings also appear
    timeMin: startOfDay,
  });
}

async function runMorningBrief() {
  const settings = await getSettings();
  const recipientEmail = (settings.reportRecipientEmail || "").trim() || (await getUserEmailFromStorage()) || "";
  if (!recipientEmail) {
    console.log("[SW] Morning brief skipped: no recipient email.");
    return;
  }
  try {
    await sendMorningBrief(recipientEmail);
    showNotification("Jira Gmail Tracker", "Morning brief sent.");
  } catch (err) {
    console.error("[SW] Morning brief failed:", err);
  }
}

async function runEveningReport() {
  const settings = await getSettings();
  const recipientEmail = (settings.reportRecipientEmail || "").trim() || (await getUserEmailFromStorage()) || "";
  if (!recipientEmail) {
    console.log("[SW] Evening report skipped: no recipient email.");
    return;
  }
  try {
    await sendEveningReport(recipientEmail, null);
    showNotification("Jira Gmail Tracker", "Evening report sent.");
  } catch (err) {
    console.error("[SW] Evening report failed:", err);
  }
}

function nextDailyRunTime(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function toUserFriendlyError(err) {
  const message = String(err?.message || "Unknown error");
  if (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("network error")
  ) {
    return "Network request failed. Check your internet connection or VPN, then retry.";
  }
  if (message.includes("401") || message.includes("Invalid Credentials") || message.includes("Authentication")) {
    return "Google authentication expired. Click Sign In to reconnect.";
  }
  if (message.includes("403") || message.includes("Permission") || message.includes("forbidden")) {
    return "Permission denied. Ensure the Google Sheet is shared with your account.";
  }
  if (message.includes("429") || message.includes("quota")) {
    return "API rate limit reached. Wait a few minutes before retrying.";
  }
  if (message.includes("Spreadsheet ID") || message.includes("Sheet Name")) {
    return message; // Config validation errors are already user-friendly
  }
  if (message.includes("approaching service worker time limit")) {
    return message;
  }
  return message;
}

async function handleAuthStatus(sendResponse) {
  try {
    const token = await getAuthTokenSilent();
    if (!token) {
      sendResponse({ signedIn: false, email: "" });
      return;
    }

    const email = await getUserEmail(token);
    if (email) await setUserEmail(email);
    sendResponse({ signedIn: Boolean(email), email: email || "" });
  } catch (err) {
    console.warn("[SW] AUTH_STATUS failed:", err);
    sendResponse({ signedIn: false, email: "" });
  }
}

async function handleAuthSignIn(sendResponse) {
  try {
    const token = await getAuthToken(true);
    const email = await getUserEmail(token);
    await setUserEmail(email || "");
    sendResponse({ ok: true, signedIn: Boolean(email), email: email || "" });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleAuthSignOut(sendResponse) {
  try {
    await revokeAuthToken();
    await clearUserEmail();
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}
