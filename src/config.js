/**
 * config.js
 * Central configuration for the Jira Gmail Tracker extension.
 * Update these values before deploying.
 */

export const CONFIG = {
  // ─── Google OAuth ───────────────────────────────────────────────────────────
  // Must match the client ID in manifest.json -> oauth2.client_id
  OAUTH_CLIENT_ID: "YOUR_CLIENT_ID.apps.googleusercontent.com",

  // ─── Google Sheets ──────────────────────────────────────────────────────────
  // The spreadsheet where Jira ticket data will be written
  SPREADSHEET_ID: "",

  // Name of the sheet (tab) inside the spreadsheet
  SHEET_NAME: "Jira Tickets",

  // ─── Jira ───────────────────────────────────────────────────────────────────
  // Base URL of your Jira instance (no trailing slash)
  JIRA_BASE_URL: "",

  // Regex to identify Jira ticket numbers (e.g., ABC-1234, PROJ-99)
  // Adjust the project-key prefix range if needed
  JIRA_TICKET_REGEX: /\b([A-Z][A-Z0-9]+-\d+)\b/g,

  // ─── Gmail Scan Settings ────────────────────────────────────────────────────
  // Date range mode for Gmail sync
  // last_30 | prev_30 | last_60 | last_90 | last_120 | custom
  GMAIL_DATE_PRESET: "last_30",

  // Maximum emails to fetch per sync run (Gmail API max per page: 500)
  MAX_RESULTS_PER_PAGE: 500,

  // Maximum total emails to process per sync (safety cap)
  MAX_TOTAL_EMAILS: 1000,
  MAX_CONCURRENT_MESSAGE_FETCHES: 12,
  MAX_CONCURRENT_AI_REQUESTS: 4,

  // ─── Auto-sync ──────────────────────────────────────────────────────────────
  // Alarm name used by Chrome alarms API
  ALARM_NAME: "jira-gmail-sync",
  DAILY_REPORT_ALARM_NAME: "jira-gmail-daily-report",

  // Auto-sync interval in minutes (set to 0 to disable auto-sync)
  AUTO_SYNC_INTERVAL_MINUTES: 0,
  DAILY_REPORT_ENABLED: false,
  DAILY_REPORT_HOUR: 9,
  DAILY_REPORT_MINUTE: 30,
  REPORT_RECIPIENT_EMAIL: "",

  // ─── AI Summaries ──────────────────────────────────────────────────────────
  ENABLE_AI_SUMMARIES: false,
  AI_PROVIDER: "basic", // basic | openai | gemini
  AI_SUMMARY_MODE: "full", // full | consolidated_only
  OPENAI_MODEL: "gpt-4.1-mini",
  GEMINI_MODEL: "gemini-2.0-flash",
  CONSOLIDATED_SHEET_NAME: "Ticket Insights",

  // ─── Storage Keys ───────────────────────────────────────────────────────────
  STORAGE_KEYS: {
    SEEN_TICKET_IDS: "seenTicketIds",   // Set of ticket numbers already pushed
    LAST_SYNC_TIME:  "lastSyncTime",    // ISO timestamp of last successful sync
    LAST_SYNC_ADDED_COUNT: "lastSyncAddedCount", // Count of tickets added in last sync
    LAST_SYNC_DETECTED_COUNT: "lastSyncDetectedCount", // Count of unique tickets found in last sync
    USER_EMAIL:      "userEmail",       // Authenticated user's email
    SYNC_STATUS:     "syncStatus",      // Latest status message for the popup
    SETTINGS:        "settings",        // User-configurable settings
    OPENAI_API_KEY:  "openAiApiKey",
    GEMINI_API_KEY:  "geminiApiKey",
    AUDIT_LOG:       "auditLog",        // Recent sync + AI execution events
  },
};
