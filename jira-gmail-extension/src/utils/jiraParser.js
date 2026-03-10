/**
 * jiraParser.js
 * Utilities for detecting and extracting Jira ticket references from text.
 */

import { CONFIG } from "../config.js";

/**
 * Extract all unique Jira ticket numbers from a string.
 * Handles multi-line text, HTML entities, and repeated references.
 *
 * @param {string} text - Raw text content (email body, subject, etc.)
 * @returns {string[]} Array of unique ticket numbers, e.g. ["ABC-123", "PROJ-456"]
 */
export function extractTicketNumbers(text) {
  if (!text || typeof text !== "string") return [];

  // Reset lastIndex since we're reusing a global regex
  const regex = new RegExp(CONFIG.JIRA_TICKET_REGEX.source, "g");
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].toUpperCase());
  }

  // Deduplicate while preserving order
  return [...new Set(matches)];
}

/**
 * Check whether a piece of text contains at least one Jira ticket reference.
 * @param {string} text
 * @returns {boolean}
 */
export function containsTicket(text) {
  if (!text) return false;
  const regex = new RegExp(CONFIG.JIRA_TICKET_REGEX.source);
  return regex.test(text);
}

/**
 * Build a direct Jira ticket URL from a ticket number.
 * @param {string} ticketNumber - e.g. "ABC-1234"
 * @returns {string} Full URL to the Jira issue
 */
export function buildJiraUrl(ticketNumber) {
  return `${CONFIG.JIRA_BASE_URL}/browse/${ticketNumber}`;
}

/**
 * Build a Gmail deep-link URL for a given message ID.
 * @param {string} messageId - Gmail message ID
 * @returns {string} URL that opens the email in Gmail web
 */
export function buildGmailUrl(messageId) {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

/**
 * Extract the plain-text "project key" from a ticket number.
 * e.g. "ABC-1234" → "ABC"
 * @param {string} ticketNumber
 * @returns {string}
 */
export function getProjectKey(ticketNumber) {
  return ticketNumber.split("-")[0];
}

/**
 * Sanitize a string for safe storage (strips HTML tags, trims whitespace).
 * @param {string} text
 * @returns {string}
 */
export function sanitize(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")   // Strip HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")       // Collapse whitespace
    .trim();
}
