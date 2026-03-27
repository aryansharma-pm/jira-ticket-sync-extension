/**
 * decisionLog.js
 * Auto-records decisions extracted from emails and meetings.
 * Provides a searchable history answering "why did we do this?".
 */

import { storageGet, storageSet } from "./storage.js";
import { CONFIG } from "../config.js";

const DECISION_KEY = CONFIG.STORAGE_KEYS.DECISION_LOG;
const MAX_DECISIONS = 500;

/**
 * Patterns that indicate a decision was made or confirmed.
 */
const DECISION_PATTERNS = [
  /\b(?:we(?:'ve)?\s+decided|decision\s+(?:was|is|has\s+been)|it\s+(?:was|has\s+been)\s+decided|agreed\s+to|going\s+(?:ahead|forward)\s+with|confirmed\s+(?:that|to)|approved\s+(?:to|the)|final(?:ized|ly\s+decided))\b[^.!?\n]{5,200}/gi,
  /\b(?:will\s+not\s+(?:proceed|go\s+ahead|use|implement)|decided\s+against|chose\s+(?:not\s+to|to\s+go\s+with))\b[^.!?\n]{5,150}/gi,
  /\b(?:resolution|conclusion|outcome)\s*[:\-]\s*[^.!?\n]{10,200}/gi,
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract decisions from email or meeting content.
 *
 * @param {string} content
 * @param {Object} [metadata]
 * @param {string} [metadata.source]      - "email" | "meeting" | "slack"
 * @param {string} [metadata.sourceId]
 * @param {string} [metadata.subject]
 * @param {string[]} [metadata.participants]
 * @param {string} [metadata.timestamp]
 * @param {string[]} [metadata.jiraTickets]
 * @returns {Object[]}
 */
export function extractDecisions(content, metadata = {}) {
  const text = String(content || "");
  const decisions = [];
  const seen = new Set();

  for (const patternTemplate of DECISION_PATTERNS) {
    const pattern = new RegExp(patternTemplate.source, "gi");
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0].trim().replace(/\s+/g, " ");
      if (raw.split(" ").length < 5) continue;

      const key = raw.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      decisions.push({
        id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        summary: raw.slice(0, 250),
        source: metadata.source || "email",
        sourceId: String(metadata.sourceId || ""),
        subject: String(metadata.subject || "").slice(0, 200),
        participants: Array.isArray(metadata.participants) ? metadata.participants : [],
        timestamp: metadata.timestamp || new Date().toISOString(),
        jiraTickets: Array.isArray(metadata.jiraTickets) ? metadata.jiraTickets : [],
      });
    }
  }

  return decisions;
}

/**
 * Persist decisions to the decision log.
 *
 * @param {Object[]} decisions - From extractDecisions()
 */
export async function saveDecisions(decisions) {
  if (!decisions.length) return;
  const existing = await getDecisionLog(0);
  const updated = [...existing, ...decisions].slice(-MAX_DECISIONS);
  await storageSet({ [DECISION_KEY]: updated });
}

/**
 * Retrieve the decision log.
 *
 * @param {number} [limit=50] - 0 = all
 * @returns {Promise<Object[]>}
 */
export async function getDecisionLog(limit = 50) {
  const result = await storageGet(DECISION_KEY);
  const entries = Array.isArray(result[DECISION_KEY]) ? result[DECISION_KEY] : [];
  if (limit <= 0) return entries;
  return entries.slice(-limit);
}

/**
 * Search decisions by keyword (title, subject, or Jira ticket).
 *
 * @param {string} query
 * @returns {Promise<Object[]>}
 */
export async function searchDecisions(query) {
  const all = await getDecisionLog(0);
  const lower = query.toLowerCase();
  return all.filter(
    (d) =>
      d.summary.toLowerCase().includes(lower) ||
      d.subject.toLowerCase().includes(lower) ||
      d.jiraTickets.some((t) => t.toLowerCase().includes(lower))
  );
}

/**
 * Clear the entire decision log.
 */
export async function clearDecisionLog() {
  await storageSet({ [DECISION_KEY]: [] });
}
