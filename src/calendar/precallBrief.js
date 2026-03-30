/**
 * precallBrief.js
 * Generates a pre-meeting intelligence brief 15–20 minutes before a calendar event:
 *  - Who is attending and their recent interaction history
 *  - Open tasks involving those attendees
 *  - Relevant recent decisions
 *  - Linked Jira tickets
 */

import { fetchImminentEvents } from "./calendarClient.js";
import { getTaskStore } from "../utils/taskStore.js";
import { getDecisionLog } from "../utils/decisionLog.js";
import { storageGet, storageSet } from "../utils/storage.js";
import { CONFIG } from "../config.js";

const BRIEF_SENT_KEY = CONFIG.STORAGE_KEYS.LAST_PRECALL_BRIEF_EVENT;

/**
 * Check for imminent meetings and generate a pre-call brief if one is found
 * that hasn't had a brief generated yet.
 *
 * @param {number} [minutesAhead=20] - Window to look ahead for meetings
 * @returns {Promise<Object|null>} Brief object, or null if nothing imminent
 */
export async function checkAndGeneratePrecallBrief(minutesAhead = 20) {
  let events;
  try {
    events = await fetchImminentEvents(minutesAhead);
  } catch (err) {
    console.warn("[PrecallBrief] Could not fetch calendar events:", err.message);
    return null;
  }

  if (!events.length) return null;

  // Only take the next upcoming event (not already started more than 2 min ago)
  const now = Date.now();
  const upcoming = events.find((e) => {
    const start = new Date(e.startTime).getTime();
    return start > now - 2 * 60 * 1000;
  });

  if (!upcoming) return null;

  // Check if we already generated a brief for this event
  const lastBriefEventId = await getLastBriefEventId();
  if (lastBriefEventId === upcoming.id) return null;

  const brief = await generateBrief(upcoming);
  await setLastBriefEventId(upcoming.id);
  return brief;
}

/**
 * Generate the full pre-call brief for a specific event.
 *
 * @param {Object} event - CalendarEvent from calendarClient
 * @returns {Promise<Object>} Brief with event, tasks, decisions, briefText
 */
export async function generateBrief(event) {
  const attendeeEmails = event.attendeeEmails.map((e) => e.toLowerCase());

  const [allTasks, recentDecisions] = await Promise.all([
    getTaskStore(),
    getDecisionLog(30),
  ]);

  // Tasks involving any attendee and not yet done
  const relatedTasks = allTasks.filter((task) => {
    if (task.status === "done") return false;
    return (task.participants || []).some((p) =>
      attendeeEmails.includes(p.toLowerCase())
    );
  }).slice(0, 8);

  // Decisions involving any attendee
  const relatedDecisions = recentDecisions.filter((d) => {
    return (d.participants || []).some((p) =>
      attendeeEmails.includes(p.toLowerCase())
    );
  }).slice(0, 3);

  const briefText = buildBriefText(event, relatedTasks, relatedDecisions);

  return {
    event,
    relatedTasks,
    relatedDecisions,
    briefText,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Text builder ─────────────────────────────────────────────────────────────

function buildBriefText(event, tasks, decisions) {
  const lines = [];
  const startStr = new Date(event.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  lines.push(`📅 Pre-call brief: ${event.title}`);
  lines.push(`🕐 Starts at: ${startStr}`);

  if (event.meetLink) lines.push(`🔗 Meet link: ${event.meetLink}`);

  const externalAttendees = event.attendees.filter((a) => !a.self);
  if (externalAttendees.length) {
    const names = externalAttendees.map((a) => a.displayName || a.email).join(", ");
    lines.push(`👥 Attendees: ${names}`);
  }

  if (tasks.length) {
    lines.push(`\n📋 Open items with these attendees (${tasks.length}):`);
    const urgencyIcon = (u) => ({ P0: "🔴", P1: "🟠", P2: "🟡", P3: "🔵" }[u] || "🔵");
    for (const task of tasks.slice(0, 5)) {
      lines.push(`  ${urgencyIcon(task.urgency)} ${task.title} [${task.status}]`);
    }
    if (tasks.length > 5) lines.push(`  … and ${tasks.length - 5} more`);
  } else {
    lines.push("\n✅ No open tasks with these attendees.");
  }

  if (decisions.length) {
    lines.push(`\n💡 Recent decisions involving these attendees:`);
    for (const d of decisions) {
      const dateStr = new Date(d.timestamp).toLocaleDateString();
      lines.push(`  • ${d.summary.slice(0, 120)} (${dateStr})`);
    }
  }

  return lines.join("\n");
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getLastBriefEventId() {
  const result = await storageGet(BRIEF_SENT_KEY);
  return result[BRIEF_SENT_KEY] || null;
}

async function setLastBriefEventId(eventId) {
  await storageSet({ [BRIEF_SENT_KEY]: eventId });
}
