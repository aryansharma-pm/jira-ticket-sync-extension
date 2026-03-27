/**
 * calendarClient.js
 * Google Calendar API v3 client.
 * Fetches upcoming events, attendees, and meeting details.
 */

import { authenticatedFetch } from "../utils/auth.js";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Fetch upcoming calendar events within the next N hours.
 *
 * @param {Object} options
 * @param {string} [options.calendarId]
 * @param {number} [options.hoursAhead]
 * @param {number} [options.maxResults]
 * @returns {Promise<CalendarEvent[]>}
 */
export async function fetchUpcomingEvents(options = {}) {
  const {
    calendarId = "primary",
    hoursAhead = 24,
    maxResults = 20,
    timeMin: timeMinOverride = null,
  } = options;

  const now = new Date();
  const effectiveTimeMin = timeMinOverride instanceof Date ? timeMinOverride : now;
  const timeMax = new Date(effectiveTimeMin.getTime() + hoursAhead * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: effectiveTimeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) {
    throw new Error(`Calendar fetch error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.items || []).map(parseCalendarEvent);
}

/**
 * Fetch events starting within the next N minutes (for pre-call brief trigger).
 *
 * @param {number} minutesAhead
 * @returns {Promise<CalendarEvent[]>}
 */
export async function fetchImminentEvents(minutesAhead = 20) {
  const now = new Date();
  // Include 2-minute buffer for already-started meetings
  const timeMin = new Date(now.getTime() - 2 * 60 * 1000);
  const timeMax = new Date(now.getTime() + minutesAhead * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: "10",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const url = `${CALENDAR_BASE}/calendars/primary/events?${params}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) {
    throw new Error(`Calendar imminent fetch error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.items || []).map(parseCalendarEvent);
}

/**
 * Parse a raw Google Calendar event resource into a clean structured object.
 *
 * @param {Object} event - Raw Google Calendar event
 * @returns {CalendarEvent}
 */
export function parseCalendarEvent(event) {
  const start = event.start?.dateTime || event.start?.date || null;
  const end = event.end?.dateTime || event.end?.date || null;

  const attendees = (event.attendees || []).map((a) => ({
    email: a.email || "",
    displayName: a.displayName || "",
    responseStatus: a.responseStatus || "needsAction",
    self: Boolean(a.self),
    organizer: Boolean(a.organizer),
  }));

  return {
    id: event.id || "",
    title: event.summary || "(No title)",
    description: event.description || "",
    location: event.location || "",
    startTime: start,
    endTime: end,
    attendees,
    attendeeEmails: attendees.map((a) => a.email).filter(Boolean),
    organizerEmail: event.organizer?.email || "",
    meetLink: extractMeetLink(event),
    isRecurring: Boolean(event.recurringEventId),
    status: event.status || "confirmed",
    htmlLink: event.htmlLink || "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMeetLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const desc = event.description || "";
  const match = desc.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/);
  return match ? match[0] : "";
}

async function fetchWithRetry(url, retries = 3) {
  let attempt = 0;
  while (attempt <= retries) {
    let resp;
    try {
      resp = await authenticatedFetch(url);
    } catch (err) {
      if (attempt === retries) throw new Error(`Calendar network error: ${err.message}`);
      await sleep(Math.min(3000, 300 * (2 ** attempt)));
      attempt++;
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(resp.status)) return resp;
    if (attempt === retries) return resp;
    await sleep(Math.min(2000, 300 * (2 ** attempt)));
    attempt++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
