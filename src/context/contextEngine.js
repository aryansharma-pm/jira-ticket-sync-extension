/**
 * contextEngine.js
 * Links tasks across sources, enriches with Jira ticket references,
 * finds related tasks via shared participants, and detects status drift
 * between email context and Jira.
 */

import { getTaskStore, updateTask } from "../utils/taskStore.js";
import { extractTicketNumbers } from "../utils/jiraParser.js";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full enrichment pass on all pending tasks:
 *  1. Link tasks to Jira tickets found in their title/description/sources
 *  2. Identify tasks sharing the same Jira ticket (related/duplicate candidates)
 *
 * @returns {Promise<Object>} Summary of enrichment results
 */
export async function enrichTaskContext() {
  const tasks = await getTaskStore();
  const ticketToTasks = new Map();
  let linkedCount = 0;

  for (const task of tasks) {
    // Gather text surfaces for ticket extraction
    const surfaces = [
      task.title,
      task.description,
      task.aiSummary,
      ...(task.sources || []).map((s) => s.subject || ""),
    ].join(" ");

    const tickets = extractTicketNumbers(surfaces);

    if (tickets.length) {
      // Assign first detected ticket if task doesn't already have one
      if (!task.jiraTicket) {
        await updateTask(task.id, { jiraTicket: tickets[0] });
        linkedCount++;
      }
      const primaryTicket = task.jiraTicket || tickets[0];
      if (!ticketToTasks.has(primaryTicket)) ticketToTasks.set(primaryTicket, []);
      ticketToTasks.get(primaryTicket).push(task.id);
    }
  }

  // Collect tickets with multiple tasks (potential duplicates / related work)
  const relatedGroups = [];
  for (const [ticket, taskIds] of ticketToTasks.entries()) {
    if (taskIds.length > 1) {
      relatedGroups.push({ ticket, taskIds });
    }
  }

  return { linkedCount, relatedGroups, ticketToTasks };
}

/**
 * Find tasks that share participants with a given task.
 * Useful for surfacing related work involving the same people.
 *
 * @param {string} taskId
 * @returns {Promise<Object[]>}
 */
export async function findRelatedTasks(taskId) {
  const tasks = await getTaskStore();
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return [];

  const targetParticipants = new Set(
    (target.participants || []).map((p) => p.toLowerCase())
  );
  if (!targetParticipants.size) return [];

  return tasks.filter((t) => {
    if (t.id === taskId || t.status === "done") return false;
    return (t.participants || []).some((p) =>
      targetParticipants.has(p.toLowerCase())
    );
  });
}

/**
 * Detect drift between what email/task context says and a Jira issue's status.
 * E.g. email says "blocked" but Jira shows "In Progress".
 *
 * @param {Object} task       - Task from taskStore
 * @param {Object} jiraIssue  - Raw Jira REST issue object (issue.fields)
 * @returns {Object|null} Drift descriptor, or null if no drift detected
 */
export function detectJiraDrift(task, jiraIssue) {
  if (!jiraIssue?.fields) return null;

  const jiraStatus = (jiraIssue.fields.status?.name || "").toLowerCase();
  const textContext = [task.title, task.description, task.aiSummary]
    .join(" ")
    .toLowerCase();

  const isBlockedInText =
    /\b(blocked|blocker|stuck|cannot\s+proceed|waiting\s+on|dependency)\b/.test(textContext);
  const isResolvedInText =
    /\b(resolved|fixed|closed|done|completed|deployed)\b/.test(textContext);
  const jiraIsDone = ["done", "closed", "resolved", "cancelled"].includes(jiraStatus);
  const jiraIsInProgress = ["in progress", "in development", "in review"].includes(jiraStatus);

  if (isBlockedInText && jiraIsInProgress) {
    return {
      driftType: "blocked_not_reflected",
      message: `Task context indicates a blocker, but Jira shows "${jiraIssue.fields.status?.name}"`,
      suggestedAction: `Update ${task.jiraTicket} status to Blocked in Jira`,
    };
  }

  if (isResolvedInText && !jiraIsDone) {
    return {
      driftType: "resolved_not_reflected",
      message: `Task context suggests this is resolved, but Jira still shows "${jiraIssue.fields.status?.name}"`,
      suggestedAction: `Close ${task.jiraTicket} in Jira`,
    };
  }

  return null;
}
