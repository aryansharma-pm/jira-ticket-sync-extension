/**
 * service-worker.js
 * Chrome Manifest V3 service worker.
 * Handles:
 *  - Message passing from popup
 *  - Periodic alarms for auto-sync
 *  - Desktop notifications on sync completion
 */

import { runSync } from "./syncEngine.js";
import { getSettings, getSyncStatus, setSyncStatus } from "../utils/storage.js";
import { CONFIG } from "../config.js";

// ─── Install / Startup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log("[SW] Installed, reason:", reason);
  await setupAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[SW] Browser started, setting up alarm.");
  await setupAlarm();
});

/**
 * Create (or recreate) the periodic sync alarm based on user settings.
 */
async function setupAlarm() {
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

// ─── Alarm Handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CONFIG.ALARM_NAME) return;
  console.log("[SW] Alarm fired, running background sync…");

  try {
    const result = await runSync((msg) => console.log("[BG Sync]", msg));
    console.log("[SW] Background sync complete:", result);

    showNotification(
      "Jira Gmail Tracker",
      `Sync complete: ${result.added} new ticket(s) added.`
    );
  } catch (err) {
    console.error("[SW] Background sync failed:", err);
    await setSyncStatus(`Error: ${err.message}`);
  }
});

// ─── Message Handling (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    // ── Trigger manual sync ──────────────────────────────────────────────────
    case "SYNC_NOW":
      handleSyncNow(sendResponse);
      return true; // Keep message channel open for async response

    // ── Get current sync status ──────────────────────────────────────────────
    case "GET_STATUS":
      getSyncStatus().then((status) => sendResponse({ status }));
      return true;

    // ── Update auto-sync alarm after settings change ─────────────────────────
    case "UPDATE_ALARM":
      setupAlarm().then(() => sendResponse({ ok: true }));
      return true;

    default:
      console.warn("[SW] Unknown message type:", message.type);
  }
});

// ─── Sync Handler ─────────────────────────────────────────────────────────────

let isSyncing = false;

async function handleSyncNow(sendResponse) {
  if (isSyncing) {
    sendResponse({ error: "Sync already in progress." });
    return;
  }

  isSyncing = true;
  await setSyncStatus("Syncing…");

  try {
    const result = await runSync(async (msg) => {
      await setSyncStatus(msg);
      // Broadcast progress to any open popups
      try {
        chrome.runtime.sendMessage({ type: "SYNC_PROGRESS", message: msg });
      } catch {
        // Popup may be closed; ignore
      }
    });

    sendResponse({ result });
  } catch (err) {
    console.error("[SW] Manual sync error:", err);
    await setSyncStatus(`Error: ${err.message}`);
    sendResponse({ error: err.message });
  } finally {
    isSyncing = false;
  }
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
