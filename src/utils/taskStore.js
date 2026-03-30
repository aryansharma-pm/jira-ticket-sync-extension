/**
 * taskStore.js
 * Unified task storage across all sources (email, calendar, Jira).
 * Tasks are stored in chrome.storage.local with a stable generated ID.
 */

import { storageGet, storageSet } from "./storage.js";
import { CONFIG } from "../config.js";

const TASK_KEY = CONFIG.STORAGE_KEYS.TASK_STORE;
const MAX_TASKS = 1000;

/**
 * Add a new task. Deduplicates by exact title match on non-done tasks.
 * If a duplicate is found, the new source is merged into it instead.
 *
 * @param {Object} task
 * @returns {Promise<Object>} The created or merged task
 */
export async function addTask(task) {
  const existing = await getAllTasks();

  const newTask = {
    id: task.id || generateId(),
    title: String(task.title || "Untitled task").slice(0, 300),
    description: String(task.description || "").slice(0, 2000),
    status: task.status || "pending",       // pending | in_progress | blocked | done | stale
    urgency: task.urgency || "P2",          // P0 | P1 | P2 | P3
    taskType: task.taskType || "action",    // action | decision | blocker | question | risk | commitment
    participants: Array.isArray(task.participants) ? task.participants : [],
    dueDate: task.dueDate || null,
    jiraTicket: task.jiraTicket || null,
    sources: Array.isArray(task.sources) ? task.sources : [],
    createdAt: task.createdAt || new Date().toISOString(),
    lastActivityAt: task.lastActivityAt || new Date().toISOString(),
    followUpRequired: Boolean(task.followUpRequired),
    aiSummary: String(task.aiSummary || "").slice(0, 500),
    riskLevel: task.riskLevel || "low",     // low | medium | high
    commitmentText: String(task.commitmentText || "").slice(0, 300),
    staleReason: task.staleReason || "",
  };

  // Dedup: if same non-done title already exists, merge sources into it
  const duplicate = existing.find(
    (t) =>
      t.status !== "done" &&
      t.title.toLowerCase().trim() === newTask.title.toLowerCase().trim()
  );
  if (duplicate) {
    duplicate.sources = mergeUnique(duplicate.sources, newTask.sources, "id");
    duplicate.lastActivityAt = new Date().toISOString();
    if (newTask.urgency < duplicate.urgency) duplicate.urgency = newTask.urgency; // escalate
    await saveAllTasks(existing);
    return duplicate;
  }

  existing.push(newTask);
  await saveAllTasks(existing);
  return newTask;
}

/**
 * Update a task by ID. Automatically refreshes lastActivityAt.
 *
 * @param {string} id
 * @param {Object} changes
 * @returns {Promise<Object|null>}
 */
export async function updateTask(id, changes) {
  const existing = await getAllTasks();
  const index = existing.findIndex((t) => t.id === id);
  if (index === -1) return null;
  existing[index] = {
    ...existing[index],
    ...changes,
    lastActivityAt: new Date().toISOString(),
  };
  await saveAllTasks(existing);
  return existing[index];
}

/**
 * Get tasks, with optional filters.
 *
 * @param {Object} [filter]
 * @param {string} [filter.status]
 * @param {string} [filter.urgency]
 * @param {string} [filter.taskType]
 * @returns {Promise<Object[]>}
 */
export async function getTaskStore(filter = {}) {
  let tasks = await getAllTasks();
  if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
  if (filter.urgency) tasks = tasks.filter((t) => t.urgency === filter.urgency);
  if (filter.taskType) tasks = tasks.filter((t) => t.taskType === filter.taskType);
  return tasks;
}

/**
 * Delete a specific task by ID.
 *
 * @param {string} id
 */
export async function deleteTask(id) {
  const existing = await getAllTasks();
  await saveAllTasks(existing.filter((t) => t.id !== id));
}

/**
 * Remove completed tasks older than N days to prevent storage bloat.
 *
 * @param {number} [olderThanDays=30]
 * @returns {Promise<number>} Count of pruned tasks
 */
export async function pruneCompletedTasks(olderThanDays = 30) {
  const existing = await getAllTasks();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const kept = existing.filter((t) => {
    if (t.status !== "done") return true;
    return new Date(t.lastActivityAt).getTime() > cutoff;
  });
  await saveAllTasks(kept);
  return existing.length - kept.length;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function getAllTasks() {
  const result = await storageGet(TASK_KEY);
  return Array.isArray(result[TASK_KEY]) ? result[TASK_KEY] : [];
}

async function saveAllTasks(tasks) {
  // If over cap, prune the oldest completed tasks first
  if (tasks.length > MAX_TASKS) {
    const doneSorted = tasks
      .filter((t) => t.status === "done")
      .sort((a, b) => new Date(a.lastActivityAt) - new Date(b.lastActivityAt));
    const toRemove = new Set(doneSorted.slice(0, tasks.length - MAX_TASKS).map((t) => t.id));
    tasks = tasks.filter((t) => !toRemove.has(t.id));
  }
  await storageSet({ [TASK_KEY]: tasks });
}

function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeUnique(arrA, arrB, key) {
  const seen = new Set((arrA || []).map((item) => item[key]));
  const merged = [...(arrA || [])];
  for (const item of arrB || []) {
    if (!seen.has(item[key])) {
      merged.push(item);
      seen.add(item[key]);
    }
  }
  return merged;
}
