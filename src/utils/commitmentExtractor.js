/**
 * commitmentExtractor.js
 * Extracts explicit self-commitments from outbound email text.
 * E.g. "I'll send the document by Friday" → tracked commitment with inferred due date.
 */

import { addTask } from "./taskStore.js";
import { storageGet, storageSet } from "./storage.js";
import { CONFIG } from "../config.js";

const COMMITMENT_KEY = CONFIG.STORAGE_KEYS.COMMITMENTS;

/**
 * Regex patterns that indicate a self-commitment from the sender.
 * Each pattern is re-instantiated with global flag in extractCommitments.
 */
const COMMITMENT_PATTERNS = [
  /i(?:'ll| will)\s+(?:send|share|provide|complete|finish|submit|review|check|update|fix|do|follow\s+up|get\s+back)\b[^.!?\n]{5,120}/gi,
  /i(?:'ll| will)\s+have\s+(?:this|that|it)\b[^.!?\n]{5,80}/gi,
  /let\s+me\s+(?:send|share|check|review|get\s+back|follow\s+up)\b[^.!?\n]{5,80}/gi,
  /i(?:'ll| will)\s+get\s+back\s+to\s+you\b[^.!?\n]{0,60}/gi,
  /i\s+(?:commit|promise)\s+to\b[^.!?\n]{5,100}/gi,
  /will\s+make\s+sure\s+(?:to|that)\b[^.!?\n]{5,100}/gi,
];

/**
 * Extract commitments from an outbound email body.
 *
 * @param {Object} email - { id, subject, body, to, date }
 * @returns {Object[]} Array of commitment objects
 */
export function extractCommitments(email) {
  const body = String(email.body || "");
  const commitments = [];
  const seen = new Set();

  for (const patternTemplate of COMMITMENT_PATTERNS) {
    const pattern = new RegExp(patternTemplate.source, "gi");
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const text = match[0].trim().replace(/\s+/g, " ");
      if (text.split(" ").length < 4) continue;

      const key = text.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      commitments.push({
        text: text.slice(0, 200),
        dueDate: inferDueDate(text),
        emailId: email.id || "",
        emailSubject: String(email.subject || "").slice(0, 200),
        to: String(email.to || ""),
        sentAt: email.date || new Date().toISOString(),
        status: "pending",  // pending | done | overdue
      });
    }
  }

  return commitments;
}

/**
 * Persist extracted commitments to storage and create tasks for them.
 *
 * @param {Object[]} commitments - From extractCommitments()
 * @param {Object} email         - The source email
 */
export async function saveCommitments(commitments, email) {
  if (!commitments.length) return;

  const existing = await getCommitments();
  const newOnes = commitments.filter(
    (c) => !existing.find((e) => e.emailId === c.emailId && e.text === c.text)
  );

  if (!newOnes.length) return;

  for (const commitment of newOnes) {
    await addTask({
      title: `Commitment: ${commitment.text.slice(0, 80)}`,
      description: commitment.text,
      taskType: "commitment",
      urgency: commitment.dueDate ? "P1" : "P2",
      dueDate: commitment.dueDate,
      participants: commitment.to ? [commitment.to] : [],
      sources: [{ type: "email", id: commitment.emailId, subject: commitment.emailSubject }],
      commitmentText: commitment.text,
    });
  }

  const updated = [...existing, ...newOnes].slice(-300);
  await storageSet({ [COMMITMENT_KEY]: updated });
}

/**
 * Get all stored commitments.
 *
 * @returns {Promise<Object[]>}
 */
export async function getCommitments() {
  const result = await storageGet(COMMITMENT_KEY);
  return Array.isArray(result[COMMITMENT_KEY]) ? result[COMMITMENT_KEY] : [];
}

/**
 * Get commitments that are past their due date and still pending.
 *
 * @returns {Promise<Object[]>}
 */
export async function getOverdueCommitments() {
  const all = await getCommitments();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((c) => c.status === "pending" && c.dueDate && c.dueDate < today);
}

/**
 * Mark a commitment as done.
 *
 * @param {string} emailId
 * @param {string} text
 */
export async function markCommitmentDone(emailId, text) {
  const existing = await getCommitments();
  const updated = existing.map((c) =>
    c.emailId === emailId && c.text === text
      ? { ...c, status: "done", completedAt: new Date().toISOString() }
      : c
  );
  await storageSet({ [COMMITMENT_KEY]: updated });
}

// ─── Due date inference ───────────────────────────────────────────────────────

function inferDueDate(text) {
  const lower = text.toLowerCase();
  const now = new Date();

  const rules = [
    { test: /\b(eod|end of day|today)\b/, days: 0 },
    { test: /\btomorrow\b/, days: 1 },
    { test: /\b(eow|end of week)\b/, days: daysUntilWeekday(5) },
    { test: /\bfriday\b/, days: daysUntilWeekday(5) },
    { test: /\bthursday\b/, days: daysUntilWeekday(4) },
    { test: /\bwednesday\b/, days: daysUntilWeekday(3) },
    { test: /\btuesday\b/, days: daysUntilWeekday(2) },
    { test: /\bmonday\b/, days: daysUntilWeekday(1) },
  ];

  for (const rule of rules) {
    if (rule.test.test(lower)) {
      const due = new Date(now);
      due.setDate(due.getDate() + rule.days);
      return due.toISOString().slice(0, 10);
    }
  }

  // "in N days" / "within N days"
  const inNDays = lower.match(/(?:in|within)\s+(\d+)\s+(?:business\s+)?days?/);
  if (inNDays) {
    const n = parseInt(inNDays[1], 10);
    if (!isNaN(n) && n > 0 && n <= 60) {
      const due = new Date(now);
      due.setDate(due.getDate() + n);
      return due.toISOString().slice(0, 10);
    }
  }

  return null;
}

function daysUntilWeekday(targetDay) {
  const currentDay = new Date().getDay(); // 0=Sun, 6=Sat
  let diff = targetDay - currentDay;
  if (diff <= 0) diff += 7;
  return diff;
}
