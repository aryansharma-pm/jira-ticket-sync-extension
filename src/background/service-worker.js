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
import { getAuthToken, getAuthTokenSilent, getUserEmail, revokeAuthToken, setAuthRefreshInteractive } from "../utils/auth.js";

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

// ─── Alarm Handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CONFIG.ALARM_NAME) {
    await runIntervalSync();
    return;
  }

  if (alarm.name === CONFIG.DAILY_REPORT_ALARM_NAME) {
    try {
      await runDailyReportSync();
    } finally {
      await setupDailyReportAlarm();
    }
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
    iconUrl: "../../icons/icon48.png",
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
    return "Network request failed. Check internet/VPN and Google auth, then retry.";
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
