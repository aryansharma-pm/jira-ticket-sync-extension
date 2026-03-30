/**
 * sentimentTracker.js
 * Tracks sentiment signals across inbound email threads per sender.
 * Detects declining sentiment which may indicate a relationship risk.
 */

import { storageGet, storageSet } from "./storage.js";
import { CONFIG } from "../config.js";

const SENTIMENT_KEY = CONFIG.STORAGE_KEYS.SENTIMENT_LOG;
const MAX_HISTORY_PER_SENDER = 20;

// ─── Signal patterns ──────────────────────────────────────────────────────────

const NEGATIVE_PATTERNS = [
  /\b(disappoint(?:ed|ing)|frustrat(?:ed|ing)|concern(?:ed)?|worried|escalat(?:e|ing)|delay(?:ed)?|unacceptable|overdue|missed\s+deadline|not\s+working|not\s+(?:happy|satisfied)|issue|problem|fail(?:ed)?)\b/gi,
];

const POSITIVE_PATTERNS = [
  /\b(great|excellent|perfect|thank\s+you|appreciate|well\s+done|good\s+job|on\s+track|resolved|sorted|happy|pleased|fantastic|wonderful)\b/gi,
];

const URGENCY_PATTERNS = [
  /\b(asap|urgent(?:ly)?|immediately|critical|blocker|blocking|p0|sev1|production\s+down|outage|emergency)\b/gi,
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score the sentiment of an email body.
 *
 * @param {string} body
 * @returns {number} -1 (negative), 0 (neutral), 1 (positive)
 */
export function scoreSentiment(body) {
  const text = String(body || "");
  const neg = countMatches(text, NEGATIVE_PATTERNS[0]);
  const pos = countMatches(text, POSITIVE_PATTERNS[0]);
  const urg = countMatches(text, URGENCY_PATTERNS[0]);

  const score = pos * 1 - neg * 1.5 - urg * 2;

  if (score >= 2) return 1;
  if (score <= -2) return -1;
  return 0;
}

/**
 * Record a sentiment observation for a specific sender.
 *
 * @param {string} senderEmail
 * @param {number} score      - Output of scoreSentiment()
 * @param {string} emailId
 */
export async function recordSenderSentiment(senderEmail, score, emailId) {
  const log = await getSentimentLog();
  const key = senderEmail.toLowerCase().trim();
  if (!key) return;

  if (!log[key]) log[key] = [];
  log[key].push({ score, emailId, timestamp: new Date().toISOString() });
  log[key] = log[key].slice(-MAX_HISTORY_PER_SENDER);

  await storageSet({ [SENTIMENT_KEY]: log });
}

/**
 * Detect senders whose recent sentiment has been consistently or increasingly negative.
 *
 * @returns {Promise<Object[]>} Drift risks sorted by severity
 */
export async function detectSentimentDrift() {
  const log = await getSentimentLog();
  const risks = [];

  for (const [sender, entries] of Object.entries(log)) {
    if (entries.length < 3) continue;

    const recent = entries.slice(-5);
    const avgRecent = avg(recent.map((e) => e.score));

    const older = entries.slice(0, -5);
    const avgOlder = older.length >= 2 ? avg(older.map((e) => e.score)) : null;

    const drift = avgOlder !== null ? avgOlder - avgRecent : 0; // positive = getting worse
    const lastSeen = recent[recent.length - 1].timestamp;

    if (drift > 1 || avgRecent < -0.4) {
      risks.push({
        sender,
        recentAvgSentiment: +avgRecent.toFixed(2),
        drift: +drift.toFixed(2),
        riskLevel: drift > 2 || avgRecent < -0.8 ? "high" : "medium",
        lastInteraction: lastSeen,
        message:
          drift > 1
            ? `Communication with ${sender} has become increasingly negative. Consider proactive outreach.`
            : `Recent emails from ${sender} carry a consistently negative tone.`,
      });
    }
  }

  return risks.sort((a, b) => b.drift - a.drift);
}

/**
 * Get the full sentiment log (internal/testing use).
 *
 * @returns {Promise<Object>}
 */
export async function getSentimentLog() {
  const result = await storageGet(SENTIMENT_KEY);
  const val = result[SENTIMENT_KEY];
  return val && typeof val === "object" && !Array.isArray(val) ? val : {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countMatches(text, pattern) {
  const r = new RegExp(pattern.source, "gi");
  return (text.match(r) || []).length;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
