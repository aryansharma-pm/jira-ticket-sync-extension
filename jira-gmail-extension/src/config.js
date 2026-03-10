/**
 * config.js
 * Central configuration for the Jira Gmail Tracker extension.
 * Update these values before deploying.
 */

export const CONFIG = {
  // ─── Google OAuth ───────────────────────────────────────────────────────────
  // Must match the client ID in manifest.json -> oauth2.client_id
  OAUTH_CLIENT_ID: "182233530044-h7k4mcod7munop1tvbas6l8e3u536toq.apps.googleusercontent.com",

  // ─── Google Sheets ──────────────────────────────────────────────────────────
  // The spreadsheet where Jira ticket data will be written
  SPREADSHEET_ID: "1fQLU987LszlOdZE6oLHYhaITnWZBbw_7cWDRiLcNB7A",

  // Name of the sheet (tab) inside the spreadsheet
  SHEET_NAME: "Jira Tickets",

  // ─── Jira ───────────────────────────────────────────────────────────────────
  // Base URL of your Jira instance (no trailing slash)
  JIRA_BASE_URL: "https://gofynd.atlassian.net",

  // Regex to identify Jira ticket numbers (e.g., ABC-1234, PROJ-99)
  // Adjust the project-key prefix range if needed
  JIRA_TICKET_REGEX: /\b([A-Z][A-Z0-9]+-\d+)\b/g,

  // ─── Gmail Scan Settings ────────────────────────────────────────────────────
  // Gmail search query: fetch emails that may contain Jira tickets
  // Scoped to the last 30 days; adjust as needed
  GMAIL_SEARCH_QUERY: "newer_than:30d",

  // Maximum emails to fetch per sync run (Gmail API max per page: 500)
  MAX_RESULTS_PER_PAGE: 100,

  // Maximum total emails to process per sync (safety cap)
  MAX_TOTAL_EMAILS: 1000,

  // ─── Auto-sync ──────────────────────────────────────────────────────────────
  // Alarm name used by Chrome alarms API
  ALARM_NAME: "jira-gmail-sync",

  // Auto-sync interval in minutes (set to 0 to disable auto-sync)
  AUTO_SYNC_INTERVAL_MINUTES: 30,

  // ─── Storage Keys ───────────────────────────────────────────────────────────
  STORAGE_KEYS: {
    SEEN_TICKET_IDS: "seenTicketIds",   // Set of ticket numbers already pushed
    LAST_SYNC_TIME:  "lastSyncTime",    // ISO timestamp of last successful sync
    USER_EMAIL:      "userEmail",       // Authenticated user's email
    SYNC_STATUS:     "syncStatus",      // Latest status message for the popup
    SETTINGS:        "settings",        // User-configurable settings
  },
};
