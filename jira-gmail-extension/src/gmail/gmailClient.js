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
 * @param {Object} options
 * @param {number} [options.maxTotal] - Hard cap on total messages to retrieve
 * @param {number} [options.maxResultsPerPage] - Gmail page size (max 500)
 * @returns {Promise<string[]>} Array of Gmail message IDs
 */
export async function fetchMessageIds(query, options = {}) {
  const maxTotal = Math.max(1, Number(options.maxTotal || CONFIG.MAX_TOTAL_EMAILS));
  const maxResultsPerPage = Math.min(
    500,
    Math.max(1, Number(options.maxResultsPerPage || CONFIG.MAX_RESULTS_PER_PAGE))
  );
  const ids = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(maxResultsPerPage, maxTotal - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${GMAIL_BASE}/messages?${params}`;
    const resp = await fetchWithRetry(url, {
      retries: 3,
      retryStatuses: [429, 500, 502, 503, 504],
    });

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
export async function fetchMessage(messageId, format = "full") {
  const url = `${GMAIL_BASE}/messages/${messageId}?format=${encodeURIComponent(format)}`;
  const resp = await fetchWithRetry(url, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gmail fetch error ${resp.status}: ${err}`);
  }
  return resp.json();
}

async function fetchWithRetry(url, options = {}) {
  const {
    retries = 2,
    retryStatuses = [429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let attempt = 0;
  let response = null;

  while (attempt <= retries) {
    response = await authenticatedFetch(url, fetchOptions);
    if (!retryStatuses.includes(response.status)) {
      return response;
    }

    if (attempt === retries) {
      return response;
    }

    const delayMs = Math.min(2000, 300 * (2 ** attempt));
    await sleep(delayMs);
    attempt += 1;
  }

  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
