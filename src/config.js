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
  // Alarm names used by Chrome alarms API
  ALARM_NAME: "jira-gmail-sync",
  DAILY_REPORT_ALARM_NAME: "jira-gmail-daily-report",
  MORNING_BRIEF_ALARM_NAME: "jira-gmail-morning-brief",
  EVENING_REPORT_ALARM_NAME: "jira-gmail-evening-report",
  REMINDER_CHECK_ALARM_NAME: "jira-gmail-reminder-check",
  PRECALL_CHECK_ALARM_NAME: "jira-gmail-precall-check",

  // Auto-sync interval in minutes (set to 0 to disable auto-sync)
  AUTO_SYNC_INTERVAL_MINUTES: 0,
  DAILY_REPORT_ENABLED: false,
  DAILY_REPORT_HOUR: 9,
  DAILY_REPORT_MINUTE: 30,
  REPORT_RECIPIENT_EMAIL: "",

  // ─── Intelligence Features ───────────────────────────────────────────────────
  MORNING_BRIEF_ENABLED: false,
  MORNING_BRIEF_HOUR: 7,
  MORNING_BRIEF_MINUTE: 30,
  EVENING_REPORT_ENABLED: false,
  EVENING_REPORT_HOUR: 18,
  EVENING_REPORT_MINUTE: 0,
  REMINDER_CHECK_INTERVAL_MINUTES: 30,  // How often to scan for stale tasks / overdue follow-ups
  PRECALL_CHECK_INTERVAL_MINUTES: 5,    // How often to check for imminent calendar meetings
  FOLLOWUP_CHECK_HOURS: 48,             // Hours before a sent email is flagged with no reply
  STALE_TASK_DAYS: 3,                   // Days of inactivity before a task is stale
  GHOST_TASK_DAYS: 14,                  // Days before an untouched task is a ghost task
  SLACK_ENABLED: false,
  SLACK_CHANNEL_ID: "",
  SLACK_MAX_MESSAGES: 200,
  SLACK_LOOKBACK_HOURS: 72,

  // ─── AI Summaries ──────────────────────────────────────────────────────────
  ENABLE_AI_SUMMARIES: false,
  AI_PROVIDER: "openai", // openai (ChatGPT session) | anthropic (Claude session)
  AI_SUMMARY_MODE: "full", // full | consolidated_only
  CONSOLIDATED_SHEET_NAME: "Ticket Insights",

  // ─── Storage Keys ───────────────────────────────────────────────────────────
  STORAGE_KEYS: {
    // Core sync
    SEEN_TICKET_IDS:          "seenTicketIds",
    LAST_SYNC_TIME:           "lastSyncTime",
    LAST_SYNC_ADDED_COUNT:    "lastSyncAddedCount",
    LAST_SYNC_DETECTED_COUNT: "lastSyncDetectedCount",
    USER_EMAIL:               "userEmail",
    SYNC_STATUS:              "syncStatus",
    SETTINGS:                 "settings",
    AUDIT_LOG:                "auditLog",

    // Intelligence features
    TASK_STORE:               "taskStore",         // Unified task objects
    FOLLOWUP_TRACKER:         "followupTracker",   // Sent emails expecting replies
    COMMITMENTS:              "commitments",        // Self-commitments from outbound email
    SENTIMENT_LOG:            "sentimentLog",       // Sentiment history per sender
    DECISION_LOG:             "decisionLog",        // Auto-recorded decisions
    REMINDER_LOG:             "reminderLog",        // Last computed reminder alerts
    LAST_PRECALL_BRIEF_EVENT: "lastPrecallBriefEvent", // Prevents duplicate pre-call briefs
    SLACK_BOT_TOKEN:          "slackBotToken",        // Slack bot token (session storage)
    SLACK_THREADS:            "slackThreads",          // Cached Slack threads

    // JMD Assistant
    ATLASSIAN_TOKEN:          "atlassianToken",        // Atlassian API token (session storage)
    ASSISTANT_HISTORY:        "assistantHistory",      // JMD assistant chat history
  },
};
