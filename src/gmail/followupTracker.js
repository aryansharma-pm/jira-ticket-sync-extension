/**
 * followupTracker.js
 * Tracks outbound emails that contain action requests.
 * Flags threads where no reply was received after a configurable delay.
 */

import { storageGet, storageSet } from "../utils/storage.js";
import { CONFIG } from "../config.js";

const FOLLOWUP_KEY = CONFIG.STORAGE_KEYS.FOLLOWUP_TRACKER;

/**
 * Regex patterns that indicate the sender expects a response or action.
 */
const ACTION_REQUEST_PATTERNS = [
  /please\s+(?:confirm|review|approve|let\s+me\s+know|respond|reply|check|send|share|update)/i,
  /can\s+you\s+(?:please\s+)?(?:confirm|review|approve|send|check|take\s+a\s+look)/i,
  /let\s+me\s+know\s+(?:if|when|what|your)/i,
  /following\s+up\s+on/i,
  /waiting\s+(?:for|on)\s+your/i,
  /kindly\s+(?:review|approve|confirm|respond|revert)/i,
  /please\s+revert\s+(?:back\s+)?(?:by|before|asap)/i,
  /could\s+you\s+please/i,
  /need\s+your\s+(?:approval|input|confirmation|sign.?off|feedback)/i,
  /action\s+(?:required|needed|item)/i,
  /please\s+(?:do\s+the\s+needful|take\s+action)/i,
  /get\s+back\s+to\s+(?:me|us)\s+(?:by|before|asap)/i,
];

/**
 * Detect if an email body contains an action request directed at the recipient.
 *
 * @param {string} body
 * @returns {boolean}
 */
export function detectActionRequest(body) {
  const text = String(body || "");
  return ACTION_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Register a sent email for follow-up tracking.
 *
 * @param {Object} entry
 * @param {string} entry.messageId
 * @param {string} entry.threadId
 * @param {string} entry.subject
 * @param {string} entry.to
 * @param {string} entry.date        - ISO timestamp when sent
 * @param {number} [entry.checkAfterHours] - Default 48
 * @param {string[]} [entry.jiraTickets]
 */
export async function registerFollowup(entry) {
  const existing = await getFollowups();

  // Avoid duplicate registrations for same message
  if (existing.find((f) => f.messageId === entry.messageId)) return;

  const followup = {
    messageId: entry.messageId || entry.id || "",
    threadId: entry.threadId || entry.messageId || "",
    subject: String(entry.subject || "").slice(0, 200),
    to: String(entry.to || ""),
    sentAt: entry.date || new Date().toISOString(),
    checkAfterHours: Number(entry.checkAfterHours) || 48,
    status: "pending",   // pending | replied | dismissed
    reminderFiredAt: null,
    jiraTickets: Array.isArray(entry.jiraTickets) ? entry.jiraTickets : [],
    createdAt: new Date().toISOString(),
  };

  existing.push(followup);
  await saveFollowups(existing);
}

/**
 * Mark all follow-ups in a thread as replied.
 * Call this whenever a new inbound message is detected in a tracked thread.
 *
 * @param {string} threadId
 */
export async function markThreadReplied(threadId) {
  const existing = await getFollowups();
  let changed = false;
  const updated = existing.map((f) => {
    if (f.threadId === threadId && f.status === "pending") {
      changed = true;
      return { ...f, status: "replied", repliedAt: new Date().toISOString() };
    }
    return f;
  });
  if (changed) await saveFollowups(updated);
}

/**
 * Dismiss a follow-up by message ID.
 *
 * @param {string} messageId
 */
export async function dismissFollowup(messageId) {
  const existing = await getFollowups();
  const updated = existing.map((f) =>
    f.messageId === messageId
      ? { ...f, status: "dismissed", dismissedAt: new Date().toISOString() }
      : f
  );
  await saveFollowups(updated);
}

/**
 * Get all follow-ups past their check deadline and still pending.
 *
 * @returns {Promise<Object[]>}
 */
export async function getOverdueFollowups() {
  const all = await getFollowups();
  const now = Date.now();
  return all.filter((f) => {
    if (f.status !== "pending") return false;
    const sentAt = new Date(f.sentAt).getTime();
    const checkAfterMs = f.checkAfterHours * 60 * 60 * 1000;
    return now > sentAt + checkAfterMs;
  });
}

/**
 * Get all follow-ups with status = pending.
 *
 * @returns {Promise<Object[]>}
 */
export async function getPendingFollowups() {
  const all = await getFollowups();
  return all.filter((f) => f.status === "pending");
}

/**
 * Get the raw follow-up list.
 *
 * @returns {Promise<Object[]>}
 */
export async function getFollowups() {
  const result = await storageGet(FOLLOWUP_KEY);
  return Array.isArray(result[FOLLOWUP_KEY]) ? result[FOLLOWUP_KEY] : [];
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function saveFollowups(list) {
  // Keep only the latest 300 entries
  const trimmed = list.slice(-300);
  await storageSet({ [FOLLOWUP_KEY]: trimmed });
}
