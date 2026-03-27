/**
 * reminderEngine.js
 * Context-based smart reminder engine.
 * Fires alerts based on events (no reply, stale task, blocked, ghost tasks)
 * rather than purely time-based triggers.
 */

import { getOverdueFollowups } from "../gmail/followupTracker.js";
import { detectStaleTasks, getStaleTasks } from "./stalenessDetector.js";
import { detectGhostTasks } from "./ghostTaskDetector.js";
import { getTaskStore } from "./taskStore.js";
import { detectSentimentDrift } from "./sentimentTracker.js";
import { getOverdueCommitments } from "./commitmentExtractor.js";
import { storageGet, storageSet } from "./storage.js";
import { CONFIG } from "../config.js";

const REMINDER_LOG_KEY = CONFIG.STORAGE_KEYS.REMINDER_LOG;

const URGENCY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Run all reminder checks and return a sorted list of actionable alerts.
 *
 * @returns {Promise<Object[]>} Alerts sorted by urgency (P0 first)
 */
export async function runReminderChecks() {
  const alerts = [];

  await Promise.allSettled([
    checkOverdueFollowups(alerts),
    checkStaleTasks(alerts),
    checkGhostTasks(alerts),
    checkSentimentDrift(alerts),
    checkBlockedTasks(alerts),
    checkOverdueCommitments(alerts),
  ]);

  alerts.sort(
    (a, b) => (URGENCY_ORDER[a.urgency] ?? 3) - (URGENCY_ORDER[b.urgency] ?? 3)
  );

  await storageSet({ [REMINDER_LOG_KEY]: alerts });
  return alerts;
}

/**
 * Retrieve the last computed reminder alerts without re-running checks.
 *
 * @returns {Promise<Object[]>}
 */
export async function getReminderAlerts() {
  const result = await storageGet(REMINDER_LOG_KEY);
  return Array.isArray(result[REMINDER_LOG_KEY]) ? result[REMINDER_LOG_KEY] : [];
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkOverdueFollowups(alerts) {
  try {
    const overdue = await getOverdueFollowups();
    for (const f of overdue.slice(0, 5)) {
      alerts.push({
        type: "followup_overdue",
        urgency: "P1",
        title: `No reply: "${f.subject || "(no subject)"}"`,
        detail: `Sent to ${f.to} — ${humanizeAge(f.sentAt)} ago with no response.`,
        action: "Send a follow-up",
        sourceId: f.messageId,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] followup check error:", err.message);
  }
}

async function checkStaleTasks(alerts) {
  try {
    // Run detection to mark newly stale, then collect all stale
    await detectStaleTasks(3);
    const stale = await getStaleTasks();
    for (const task of stale.slice(0, 5)) {
      alerts.push({
        type: "task_stale",
        urgency: task.urgency || "P2",
        title: `Stale: "${task.title}"`,
        detail: task.staleReason || "No recent activity.",
        action: "Review and update status",
        sourceId: task.id,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] staleness check error:", err.message);
  }
}

async function checkGhostTasks(alerts) {
  try {
    const ghosts = await detectGhostTasks(14);
    for (const task of ghosts.slice(0, 3)) {
      alerts.push({
        type: "ghost_task",
        urgency: "P3",
        title: `Forgotten? "${task.title}"`,
        detail: `Created ${humanizeAge(task.createdAt)} ago with no follow-up. Still relevant?`,
        action: "Mark done or dismiss",
        sourceId: task.id,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] ghost task check error:", err.message);
  }
}

async function checkSentimentDrift(alerts) {
  try {
    const risks = await detectSentimentDrift();
    for (const risk of risks.slice(0, 2)) {
      alerts.push({
        type: "sentiment_drift",
        urgency: risk.riskLevel === "high" ? "P1" : "P2",
        title: `Relationship risk: ${risk.sender}`,
        detail: risk.message,
        action: "Proactively reach out",
        sourceId: risk.sender,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] sentiment drift check error:", err.message);
  }
}

async function checkBlockedTasks(alerts) {
  try {
    const allTasks = await getTaskStore();
    const longBlocked = allTasks.filter((t) => {
      if (t.status !== "blocked") return false;
      const blockedMs = Date.now() - new Date(t.lastActivityAt || t.createdAt).getTime();
      return blockedMs > 24 * 60 * 60 * 1000;
    });
    for (const task of longBlocked.slice(0, 3)) {
      alerts.push({
        type: "blocked_unresolved",
        urgency: "P1",
        title: `Still blocked: "${task.title}"`,
        detail: `Blocked for ${humanizeAge(task.lastActivityAt)} with no update. Consider escalating.`,
        action: "Escalate or update",
        sourceId: task.id,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] blocked task check error:", err.message);
  }
}

async function checkOverdueCommitments(alerts) {
  try {
    const overdue = await getOverdueCommitments();
    for (const commitment of overdue.slice(0, 3)) {
      alerts.push({
        type: "commitment_overdue",
        urgency: "P1",
        title: `Overdue commitment: "${commitment.text.slice(0, 60)}"`,
        detail: `Due ${commitment.dueDate} — promised to ${commitment.to || "recipient"}.`,
        action: "Complete or update",
        sourceId: commitment.emailId,
        firedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[Reminders] commitment check error:", err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeAge(isoString) {
  if (!isoString) return "unknown time";
  const ms = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
