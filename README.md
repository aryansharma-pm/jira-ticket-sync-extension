# Jira Gmail Tracker — Chrome Extension

A production-ready Chrome Extension (Manifest V3) that scans your Gmail inbox for Jira ticket references, detects emails you're mentioned or tagged in, and automatically pushes structured ticket data to a Google Sheet.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)                                 │
│                                                                 │
│  ┌──────────┐   messages    ┌──────────────────────────────┐   │
│  │  Popup   │ ◄──────────── │   Service Worker (BG)        │   │
│  │  popup.js│ ──────────── ►│   service-worker.js          │   │
│  └──────────┘               │   syncEngine.js              │   │
│                             └──────────────┬───────────────┘   │
│                                            │                   │
│                        ┌───────────────────┼──────────────┐    │
│                        ▼                   ▼              ▼    │
│                  Gmail API v1    Google Sheets v4     Storage   │
│                  gmailClient    sheetsClient          (local)   │
└─────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. User clicks "Sync Now" (or auto-alarm fires)
2. Service worker authenticates via Chrome `identity` API (OAuth2)
3. `syncEngine` fetches email IDs from Gmail matching the search query
4. Each email is fetched, parsed, and scanned for `PROJ-123` style patterns
5. Only emails where the user is in To/CC (or mentioned in body) are kept
6. Duplicate ticket numbers are filtered (local cache + sheet column A)
7. Optional AI summaries are generated per ticket and as a sync-level rollup
8. New rows are batch-appended to Google Sheets
9. Progress is broadcast to the open popup (if any)

---

## Folder Structure

```
jira-gmail-extension/
├── manifest.json                    # Extension manifest (MV3)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── config.js                    # Central configuration
    ├── background/
    │   ├── service-worker.js        # MV3 service worker (message hub + alarms)
    │   └── syncEngine.js           # Core sync orchestration
    ├── gmail/
    │   └── gmailClient.js          # Gmail API v1 client + email parser
    ├── sheets/
    │   └── sheetsClient.js         # Google Sheets API v4 client
    ├── popup/
    │   ├── popup.html              # Extension popup UI
    │   ├── popup.css               # Dark-theme styles
    │   └── popup.js               # Popup controller
    └── utils/
        ├── auth.js                 # OAuth2 token management
        ├── jiraParser.js           # Regex extraction + URL builder
        └── storage.js             # chrome.storage.local abstractions
```

---

## Setup Guide

### Step 1 — Google Cloud Project & OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Enable the following APIs:
   - **Gmail API**
   - **Google Sheets API**
   - **Google Drive API** (needed to access Sheets metadata)
4. Navigate to **APIs & Services → Credentials**.
5. Click **Create Credentials → OAuth 2.0 Client ID**.
6. Choose **Chrome Extension** as the application type.
7. Enter your extension ID (see Step 3 to get this first, or use a placeholder and update later).
8. Copy the generated **Client ID**.

### Step 2 — Configure the Extension

Open `manifest.json` and `src/config.js`, then update:

```json
// manifest.json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  ...
}
```

```js
// src/config.js
OAUTH_CLIENT_ID: "YOUR_CLIENT_ID.apps.googleusercontent.com",
SPREADSHEET_ID:  "YOUR_GOOGLE_SPREADSHEET_ID",  // From the sheet URL
JIRA_BASE_URL:   "https://yourcompany.atlassian.net",
```

The repository intentionally ships with placeholder OAuth values. Do not commit real client IDs or API keys.

To find your **Spreadsheet ID**, open the Google Sheet and copy the ID from the URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
```

### Step 3 — Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer Mode** (top-right toggle).
3. Click **Load Unpacked**.
4. Select the `jira-gmail-extension/` folder.
5. Copy the **Extension ID** shown on the card.
6. Go back to Google Cloud Console → OAuth 2.0 Client ID → edit your credential.
7. Add the extension ID in the format: `chrome-extension://YOUR_EXTENSION_ID`
8. Save. (No reload needed in Chrome unless you change manifest.json.)

### Step 4 — Create the Google Sheet

1. Create a new Google Sheet at [sheets.new](https://sheets.new).
2. Copy its ID from the URL (see Step 2).
3. The extension will automatically create the "Jira Tickets" tab and write headers on first sync.

### Step 5 — Test

1. Click the extension icon → a popup opens.
2. Click **Sync Now**.
3. A Google sign-in prompt appears the first time — sign in and grant permissions.
4. Watch the progress bar. When done, open the sheet to verify rows.

---

## Google Sheet Schema

| Column | Field              | Description                          |
|--------|--------------------|--------------------------------------|
| A      | Ticket Number      | e.g., `ABC-1234`                     |
| B      | Ticket Title       | Email subject (proxy for ticket title)|
| C      | Email Subject      | Raw email subject line               |
| D      | Date               | Email timestamp (human-readable)     |
| E      | Jira Link          | Direct link to the Jira issue        |
| F      | Gmail Link         | Deep-link to the email in Gmail      |
| G      | From               | Sender of the email                  |
| H      | AI Ticket Summary  | Optional OpenAI-generated summary    |
| I      | Synced At          | Timestamp when the row was written   |

If AI summaries are enabled, a second sheet tab is also maintained:

| Column | Header                 | Description                                  |
|--------|------------------------|----------------------------------------------|
| A      | Sync Timestamp         | Timestamp of the sync run                     |
| B      | Ticket Count           | Number of newly added tickets in that sync    |
| C      | Ticket Numbers         | Comma-separated list of ticket keys           |
| D      | Consolidated Summary   | Rollup across all newly added tickets         |
| E      | Action Items           | Suggested next actions from the rollup        |
| F      | Synced At              | Timestamp when the rollup row was written     |

---

## Required Permissions

| Permission           | Reason                                               |
|----------------------|------------------------------------------------------|
| `identity`           | OAuth2 token management via Chrome                  |
| `storage`            | Persist seen-ticket cache and settings               |
| `alarms`             | Schedule periodic auto-sync                          |
| `notifications`      | Show desktop notification after background sync      |
| `gmail.readonly`     | Read (not modify) Gmail messages                     |
| `spreadsheets`       | Append rows to Google Sheets                         |
| `userinfo.email`     | Detect if user is mentioned in emails                |

---

## Configuration Reference (`src/config.js`)

| Key                         | Default              | Description                          |
|-----------------------------|----------------------|--------------------------------------|
| `SPREADSHEET_ID`            | _(required)_         | Target Google Sheet ID               |
| `SHEET_NAME`                | `"Jira Tickets"`     | Tab name inside the spreadsheet      |
| `JIRA_BASE_URL`             | _(required)_         | e.g., `https://acme.atlassian.net`   |
| `JIRA_TICKET_REGEX`         | `/\b([A-Z][A-Z0-9]+-\d+)\b/g` | Matches ticket numbers    |
| `GMAIL_DATE_PRESET`         | `"last_30"`          | Date-range preset for Gmail sync     |
| `MAX_RESULTS_PER_PAGE`      | `100`                | Messages per API page                |
| `MAX_TOTAL_EMAILS`          | `1000`               | Hard cap per sync run                |
| `AUTO_SYNC_INTERVAL_MINUTES`| `30`                 | 0 = disabled                         |
| `ENABLE_AI_SUMMARIES`       | `false`              | Enable OpenAI summarization          |
| `OPENAI_MODEL`              | `"gpt-4.1-mini"`     | OpenAI model used for summaries      |
| `CONSOLIDATED_SHEET_NAME`   | `"Ticket Insights"`  | Sheet tab for sync-level rollups     |

---

## Performance Tips

- Use shorter date ranges (`last_30` vs `last_120`) for faster scans.
- **Increase `MAX_RESULTS_PER_PAGE`** to 500 to reduce API round-trips (Gmail max).
- **The seen-cache** (chrome.storage) avoids re-fetching email content for tickets already synced.
- **Batch writes** — all new rows are written in a single `values:append` call.

## Security Notes

- Tokens are managed entirely by Chrome's `identity` API — never stored in plain text.
- The extension only requests `gmail.readonly` — it cannot send or delete emails.
- OAuth consent is scoped to the authenticated user's own account.
- No data is sent to any third-party server — all communication is directly with Google APIs.
- The `seen-ticket` cache is stored in `chrome.storage.local` (device-only, not synced).
- Run `node scripts/scan-secrets.mjs` before commit to catch accidental credentials.

---

## SDLC Guardrails

- `CLAUDE.md` contains project context and engineering rules.
- `.claude/commands/*` contains reusable SDLC command templates.
- `.github/workflows/ci.yml` runs lint, tests, manifest validation, and security scan.
- `tests/` includes starter Vitest coverage for parser and AI fallback behavior.
- Optional local hook: `git config core.hooksPath .githooks` to enable pre-commit security/manifest checks.

---

## Troubleshooting

| Problem                        | Fix                                                             |
|--------------------------------|-----------------------------------------------------------------|
| "Not signed in" / no prompt    | Check Client ID in manifest.json matches Cloud Console exactly  |
| Empty sheet after sync         | Verify Spreadsheet ID and that the Sheet API is enabled         |
| No tickets found               | Try a wider date range preset or verify custom date boundaries  |
| Duplicate rows appear          | Click "Clear Seen Cache" — the sheet dedup check will still apply|
| 401 errors in logs             | Revoke & re-grant OAuth consent via btnSignOut                  |

---

## Future Improvements

- [ ] Fetch actual Jira ticket titles via the Jira REST API (requires Jira OAuth)
- [ ] Filter by specific Jira project keys
- [ ] Rich email threading (collapse email threads to single row)
- [ ] Export to Notion / Airtable / Linear instead of Sheets
- [ ] Configurable column mapping from the popup settings
