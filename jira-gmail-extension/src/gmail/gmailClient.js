/**
 * gmailClient.js
 * Gmail API v1 client with pagination support.
 * Fetches emails matching a query, extracts headers and body.
 */

import { authenticatedFetch } from "../utils/auth.js";
import { CONFIG } from "../config.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ─── Message List ─────────────────────────────────────────────────────────────

/**
 * Fetch all message IDs matching a Gmail search query (handles pagination).
 *
 * @param {string} query    - Gmail search query string
 * @param {number} maxTotal - Hard cap on total messages to retrieve
 * @returns {Promise<string[]>} Array of Gmail message IDs
 */
export async function fetchMessageIds(query, maxTotal = CONFIG.MAX_TOTAL_EMAILS) {
  const ids = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(CONFIG.MAX_RESULTS_PER_PAGE, maxTotal - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${GMAIL_BASE}/messages?${params}`;
    const resp = await authenticatedFetch(url);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gmail list error ${resp.status}: ${err}`);
    }

    const data = await resp.json();

    if (data.messages) {
      for (const msg of data.messages) {
        ids.push(msg.id);
        if (ids.length >= maxTotal) break;
      }
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken && ids.length < maxTotal);

  return ids;
}

// ─── Single Message ───────────────────────────────────────────────────────────

/**
 * Fetch a single Gmail message with full payload.
 *
 * @param {string} messageId
 * @returns {Promise<Object>} Gmail message resource
 */
export async function fetchMessage(messageId) {
  const url = `${GMAIL_BASE}/messages/${messageId}?format=full`;
  const resp = await authenticatedFetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gmail fetch error ${resp.status}: ${err}`);
  }
  return resp.json();
}

// ─── Header Extraction ────────────────────────────────────────────────────────

/**
 * Extract a named header value from a Gmail message's payload.
 * @param {Object} payload - message.payload object
 * @param {string} name    - Header name (case-insensitive)
 * @returns {string}
 */
export function getHeader(payload, name) {
  if (!payload?.headers) return "";
  const header = payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

// ─── Body Extraction ──────────────────────────────────────────────────────────

/**
 * Recursively extract plain-text body from a Gmail message payload.
 * Handles multipart messages (text/plain preferred over text/html).
 *
 * @param {Object} payload - message.payload or a nested MIME part
 * @returns {string} Decoded body text
 */
export function extractBody(payload) {
  if (!payload) return "";

  // Single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart: search parts recursively
  if (payload.parts) {
    // Prefer plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to HTML
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode a base64url-encoded string to UTF-8 text.
 * Gmail API uses URL-safe base64 (replaces + with -, / with _).
 * @param {string} data
 * @returns {string}
 */
function decodeBase64Url(data) {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    // Handle multi-byte characters properly
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

// ─── Structured Email Object ──────────────────────────────────────────────────

/**
 * Parse a raw Gmail message resource into a clean structured object.
 *
 * @param {Object} message - Raw Gmail message from the API
 * @returns {{
 *   id: string,
 *   subject: string,
 *   from: string,
 *   to: string,
 *   cc: string,
 *   date: string,
 *   body: string,
 *   snippet: string
 * }}
 */
export function parseEmail(message) {
  const payload = message.payload || {};
  const internalDate = parseInt(message.internalDate || "0", 10);

  return {
    id: message.id,
    subject: getHeader(payload, "Subject"),
    from: getHeader(payload, "From"),
    to: getHeader(payload, "To"),
    cc: getHeader(payload, "Cc"),
    date: internalDate
      ? new Date(internalDate).toISOString()
      : new Date().toISOString(),
    body: extractBody(payload),
    snippet: message.snippet || "",
  };
}
