/**
 * stalenessDetector.js
 * Detects tasks that have had no activity beyond a configurable threshold.
 * Higher-priority tasks are flagged sooner.
 */

import { getTaskStore, updateTask } from "./taskStore.js";

/** Base staleness threshold in days (P2 tasks). */
const BASE_STALE_DAYS = 3;

/**
 * Run staleness detection across all pending/in_progress/blocked tasks.
 * Priority multipliers: P0=0.25x, P1=0.5x, P2=1x, P3=1.5x
 *
 * @param {number} [baseDays] - Base threshold for P2 tasks
 * @returns {Promise<Object[]>} Newly marked stale tasks
 */
export async function detectStaleTasks(baseDays = BASE_STALE_DAYS) {
  const tasks = await getTaskStore();
  const now = Date.now();
  const baseMs = baseDays * 24 * 60 * 60 * 1000;
  const newlyStale = [];

  const urgencyMultiplier = { P0: 0.25, P1: 0.5, P2: 1, P3: 1.5 };

  for (const task of tasks) {
    if (task.status === "done" || task.status === "stale") continue;

    const lastActivity = new Date(task.lastActivityAt || task.createdAt).getTime();
    const silenceMs = now - lastActivity;
    const multiplier = urgencyMultiplier[task.urgency] ?? 1;
    const threshold = baseMs * multiplier;

    if (silenceMs > threshold) {
      const silenceDays = Math.floor(silenceMs / (24 * 60 * 60 * 1000));
      await updateTask(task.id, {
        status: "stale",
        staleReason: `No activity for ${silenceDays} day${silenceDays !== 1 ? "s" : ""}`,
      });
      newlyStale.push({ ...task, status: "stale" });
    }
  }

  return newlyStale;
}

/**
 * Get all currently stale tasks.
 *
 * @returns {Promise<Object[]>}
 */
export async function getStaleTasks() {
  return getTaskStore({ status: "stale" });
}

/**
 * Reactivate a stale task when new activity is detected.
 *
 * @param {string} taskId
 * @returns {Promise<Object|null>}
 */
export async function reactivateTask(taskId) {
  return updateTask(taskId, { status: "pending", staleReason: "" });
}
