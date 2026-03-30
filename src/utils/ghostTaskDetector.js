/**
 * ghostTaskDetector.js
 * Detects tasks created more than N days ago with zero subsequent activity.
 * Surfaces them for a "still valid?" review rather than silently expiring them.
 */

import { getTaskStore, updateTask, deleteTask } from "./taskStore.js";

const DEFAULT_GHOST_DAYS = 14;

/**
 * Find tasks that qualify as "ghost tasks":
 *  - Not done or already stale
 *  - Created AND last-active more than thresholdDays ago
 *
 * @param {number} [thresholdDays=14]
 * @returns {Promise<Object[]>}
 */
export async function detectGhostTasks(thresholdDays = DEFAULT_GHOST_DAYS) {
  const tasks = await getTaskStore();
  const now = Date.now();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  return tasks.filter((task) => {
    if (task.status === "done" || task.status === "stale") return false;
    const created = new Date(task.createdAt).getTime();
    const lastActivity = new Date(task.lastActivityAt || task.createdAt).getTime();
    return (now - created) > thresholdMs && (now - lastActivity) > thresholdMs;
  });
}

/**
 * Act on a ghost task review decision.
 *
 * @param {string} taskId
 * @param {"keep"|"done"|"delete"} decision
 * @returns {Promise<Object|null>}
 */
export async function reviewGhostTask(taskId, decision) {
  if (decision === "done") {
    return updateTask(taskId, { status: "done" });
  }
  if (decision === "delete") {
    await deleteTask(taskId);
    return null;
  }
  // "keep" — reset lastActivityAt so it won't surface again for another threshold period
  return updateTask(taskId, { lastActivityAt: new Date().toISOString() });
}
