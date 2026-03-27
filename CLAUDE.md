# CLAUDE.md

## Project Overview

**Jira Gmail Tracker** is a Chrome Manifest V3 extension that acts as an engineering manager's intelligence hub. It scans Gmail (and optionally Slack) for Jira ticket activity, deduplicates and logs tickets to Google Sheets, generates AI-powered summaries, sends scheduled briefing emails, and provides an in-popup JMD Platform Assistant for DRI lookups and platform knowledge queries.

---

## Features & Functionalities

### 1. Gmail → Jira Ticket Sync

**Core feature.** Scans the user's Gmail inbox for emails that mention Jira ticket IDs (e.g., `PROJ-123`) and logs structured rows to a Google Sheet.

- Configurable Gmail query (default: `in:inbox has:attachment OR to:me`) with date range presets (1d, 7d, 30d, 90d, custom)
- Concurrent email fetching and processing (configurable concurrency, default 5)
- "Fast mode" — metadata-only fetch for speed when full body is not needed for AI
- Deduplication: tickets already in the sheet are skipped (tracks seen ticket IDs in `chrome.storage.local`)
- Per-email extraction: ticket number, email subject, sender (`from`), date, body/snippet, Jira hyperlink, Gmail hyperlink
- Infers row status (blocked / resolved / in-progress / pending / updated) and priority (P0–P3) from email body text
- 4-minute time budget guard prevents runaway syncs

**Sheets output — Main Sheet (10 columns):**
| Ticket | Status | Priority | Title | Date | Sender | Jira Link | Email Link | AI Summary | Synced At |

**Sheets output — Consolidated AI Sheet (11 columns):**
| Sync Date | New | Total | Ticket IDs | Summary | Action Items | Blockers | Risks | Highlights | AI Provider | Synced At |

---

### 2. Google Sheets Integration

Managed by `src/sheets/sheetsClient.js`.

- Auto-initializes both the main ticket sheet and consolidated AI sheet if they don't exist (creates headers, freezes header row)
- Conditional formatting: alternating row backgrounds, status-based row colors, priority highlights
- HYPERLINK formulas for clickable Jira and Gmail links
- Batch row writes with exponential-backoff retry
- Reads column A to build the dedup cache before each sync

---

### 3. AI Summaries

Managed by `src/ai/aiClient.js` and `src/ai/sessionClient.js`.

**Three AI providers:**
- **Basic (local)** — no network, pure regex-based status/priority/next-step extraction; always available
- **ChatGPT (chatgpt.com)** — uses the user's active browser session (no API key needed); streaming SSE
- **Claude (claude.ai)** — uses the user's active browser session (no API key needed); streaming SSE

**Two summary types:**
- **Per-ticket summaries** — up to 50-word, one-sentence summaries per ticket (concurrency configurable)
- **Consolidated report** — one synthesis across all tickets: overall health, action items, blockers, risks, highlights

**Modes:**
- `per_ticket_and_consolidated` — full per-ticket + consolidated (default)
- `consolidated_only` — skip per-ticket to save time/quota

**AI contract:**
- All AI outputs safe-parsed with JSON schema validation
- Any provider failure falls back gracefully to Basic local summaries
- Sync never fails solely due to AI provider unavailability

---

### 4. Scheduled Reports & Briefings

Managed by `src/gmail/reportMailer.js`, `src/gmail/dailyBrief.js`.

#### Daily Email Report
- Triggers on a configurable schedule (alarm: `DAILY_REPORT_ALARM`)
- Sends HTML email + plain-text PDF attachment to user's Gmail
- Content: full ticket table, AI consolidated summary, action items, blockers, risks, highlights
- HTML is styled with responsive tables and color-coded priority badges

#### Morning Brief
- Triggers at configured morning hour (alarm: `MORNING_BRIEF_ALARM`)
- Content: P0/P1 urgent tasks, blocked tasks, today's calendar events, overdue follow-ups, commitments due today
- Color-coded urgency badges; styled HTML email

#### Evening Report
- Triggers at configured evening hour (alarm: `EVENING_REPORT_ALARM`)
- Content: tickets resolved today, still-open tickets, overdue commitments, sentiment risks, decisions recorded today
- Summarizes day's intelligence signals

---

### 5. Follow-Up Tracker

Managed by `src/gmail/followupTracker.js`.

- Detects outbound emails that contain action requests ("please confirm", "can you", "waiting on", etc.)
- Registers the email as a pending follow-up with a configurable check window (default: 24 hours)
- Automatically marks follow-ups resolved when a reply is detected in the same thread
- `getOverdueFollowups()` surfaces overdue items in morning briefs and reminder alerts
- Manual dismiss available

---

### 6. Commitment Extractor

Managed by `src/utils/commitmentExtractor.js`.

- Scans **outbound** emails for first-person commitments: "I'll send", "I will", "let me get back to you", "I commit to"
- Infers due dates from natural language: "by Friday", "end of week", "in 3 days", "next Monday"
- Creates tasks for each extracted commitment with due dates
- `getOverdueCommitments()` used in morning briefs and reminder checks
- Max 300 commitments stored; `markCommitmentDone()` to close them

---

### 7. Sentiment Tracker

Managed by `src/utils/sentimentTracker.js`.

- Scores each email body: +1 (positive), 0 (neutral), -1 (negative) based on keyword patterns
- Tracks sentiment log per sender over time (last 20 entries per sender)
- `detectSentimentDrift()` identifies senders with deteriorating sentiment trend
- Drift results surface in evening reports and smart reminder alerts
- Severity levels: `high` (rapid decline) and `medium` (gradual decline)

---

### 8. Decision Log

Managed by `src/utils/decisionLog.js`.

- Auto-extracts decisions from email content: "we decided", "agreed to", "going ahead with", "resolution:"
- Stores decisions with metadata: source (email/meeting), subject, participants, Jira ticket reference, timestamp
- Max 500 decisions; searchable by keyword or Jira ticket
- Pre-call briefs and context engine use decision history for meeting preparation

---

### 9. Task Store

Managed by `src/utils/taskStore.js`.

- Unified task registry across all sources: email, calendar, Jira
- Deduplication by title (fuzzy merge on re-add)
- Task fields: id, title, description, status (pending | in_progress | blocked | done | stale), urgency (P0–P3), taskType, participants, dueDate, jiraTicket, sources, createdAt, lastActivityAt
- `updateTask()` auto-refreshes `lastActivityAt`
- Max 1,000 tasks; auto-prunes old completed tasks above cap
- Filterable by status, urgency, taskType

---

### 10. Staleness Detector

Managed by `src/utils/stalenessDetector.js`.

- Identifies tasks with no activity beyond a threshold (configurable base days)
- Priority-aware multipliers: P0 = 0.25×, P1 = 0.5×, P2 = 1×, P3 = 1.5×
- Marks tasks as `stale` with a stored reason
- `reactivateTask()` resets a stale task back to `pending`

---

### 11. Ghost Task Detector

Managed by `src/utils/ghostTaskDetector.js`.

- Detects tasks untouched for 14+ days — "ghost tasks" that may no longer be relevant
- `reviewGhostTask(taskId, decision)` handles: "keep" (resets activity timestamp), "done", or "delete"
- Surfaces ghosts in reminder alerts for periodic review

---

### 12. Smart Reminder Engine

Managed by `src/utils/reminderEngine.js`.

- Context-driven alerts (not time-driven) — fires when conditions change
- Parallel checks on every reminder cycle:
  1. Overdue follow-ups (no reply received)
  2. Stale tasks (no activity past threshold)
  3. Ghost tasks (untouched 14+ days)
  4. Sentiment drift (sender relationship risks)
  5. Blocked tasks (status = blocked)
  6. Overdue commitments
- Alerts sorted by urgency (P0 first) with type, title, detail, action, and sourceId
- `getReminderAlerts()` used by morning briefs and popup status

---

### 13. Context Engine

Managed by `src/context/contextEngine.js`.

- Enriches tasks with Jira ticket references extracted from task fields
- Finds related tasks sharing participants
- Detects Jira drift: mismatch between email status (e.g., "blocked") and Jira issue status (e.g., "In Progress")
- Links tasks that reference the same Jira ticket into a group

---

### 14. Calendar Integration

Managed by `src/calendar/calendarClient.js` and `src/calendar/precallBrief.js`.

- Fetches upcoming events from Google Calendar (scoped to next N hours)
- `fetchImminentEvents(minutesAhead)` finds events starting within N minutes (with 2-minute buffer)
- Parses attendees, meet links, recurrence status, and descriptions

#### Pre-Call Brief
- Auto-generates a meeting brief 15–20 minutes before a calendar event starts
- Brief content: meeting time, attendees, related open tasks, recent decisions from decision log
- Deduplicates: one brief per event (stored event ID prevents re-firing)
- Used in morning brief emails

---

### 15. Slack Integration

Managed by `src/slack/slackClient.js`.

- Scans Slack channels for messages containing Jira ticket mentions
- `fetchSlackThreadsWithJiraTickets(botToken, channelId, opts)` — fetches recent messages and replies
- Returns SlackThread objects: message text, user, ticket list, timestamp, direct Slack URL
- `testSlackConnection()` verifies bot token and channel before saving
- Bot token stored in `chrome.storage.session` (not persisted to disk)

---

### 16. JMD Platform Assistant

The in-popup AI assistant powered by the JMD Platform knowledge base.

#### Knowledge Base (`src/assistant/knowledge.js`)
Static, offline knowledge about the JMD platform:
- **Platform versions:** 1.9.5, 2.0.0, 2.1.0 — each with feature highlights and per-service feature details
- **DRI directory:** 17 service entries (Catalog, Inventory, Search, Pricing, Theme, Marketing, Payments, OMS, and more) with primary/backup contacts and keyword triggers
- **Jira patterns:** maps ticket keywords to service and DRI owner
- **FAQ:** 10 curated entries (coupons, maker-checker, MTO flow, Stormbreaker, Megatron, etc.)

#### Query Engine (`src/assistant/engine.js`)
Offline intent-based query engine, no network required:
- `detectIntent()` — classifies: feature_check, how_does, who_handles, what_is, general
- `findDRI(query)` — keyword-scored DRI lookup with ranked results
- `findFAQ(query)` — full-text FAQ search
- `findVersionFeatures(query)` — find features across all versions
- `compareVersions(query)` — diff features between two versions
- `analyzeJira(text)` — extract ticket ID, detect service owner, find DRI, surface version gaps, identify known problems, suggest code hints
- `buildResponse()` — unified response builder (type: result | jira | compare | greeting)

#### Assistant UI (in popup)
- Expandable panel in the popup with quick-access chips: "All services", "OMS DRI", "v2.1.0 changes", "Megatron", "Payments DRI", "Stormbreaker"
- Multi-turn conversation with chat history (last 4 turns injected as context into AI prompts)
- Provider badge in panel header shows active AI (ChatGPT / Claude / Basic)
- **3-path query handling:**
  1. **Jira ticket detected** (e.g., "PROJ-123") → fetches live Jira data via Atlassian REST API → local KB analysis → optional AI deep-dive (root cause, escalation advice, investigation steps)
  2. **Local KB handles it** → instant offline response (DRI lookup, FAQ, version features)
  3. **AI fallback** → streaming response via ChatGPT or Claude session (with live typewriter rendering)
- Streaming AI responses rendered with live markdown (bold, italic, code blocks, numbered/bulleted lists)
- Clear conversation button resets chat history and DOM

#### Atlassian Integration
- Configure `atlassianDomain`, `atlassianEmail`, `atlassianToken` in the Configuration panel
- Token stored in `chrome.storage.session` (not written to disk)
- Fetches live issue data: summary, status, assignee, reporter, description (ADF → text), last 3 comments
- No-credentials fallback renders graceful card prompting setup

---

### 17. Session-Based AI (No API Keys)

Managed by `src/ai/sessionClient.js`.

- Uses `fetch` with `credentials: "include"` to call ChatGPT and Claude via the user's existing browser login
- No OpenAI/Anthropic API keys required — extension piggybacks on active sessions
- Host permissions in `manifest.json`: `https://chatgpt.com/*` and `https://claude.ai/*`
- Full Server-Sent Events (SSE) streaming support:
  - ChatGPT: parses `parts[0]` from streamed chunks
  - Claude: parses `content_block_delta` / `text_delta` events
- `onChunk` callback enables live rendering in popup (typewriter effect)
- Used by both `aiClient.js` (sync pipeline) and `popup.js` (assistant)

---

## Architecture

```
src/
├── ai/
│   ├── aiClient.js          # Sync pipeline AI: per-ticket + consolidated summaries
│   └── sessionClient.js     # Shared: ChatGPT/Claude session calls + SSE parsing
├── assistant/
│   ├── knowledge.js         # JMD Platform knowledge base (versions, DRI, FAQ)
│   └── engine.js            # Offline query engine (intent → response)
├── background/
│   ├── service-worker.js    # MV3 service worker: alarms, message routing
│   └── syncEngine.js        # Core 9-step sync pipeline
├── calendar/
│   ├── calendarClient.js    # Google Calendar API v3 client
│   └── precallBrief.js      # Pre-meeting brief generator
├── context/
│   └── contextEngine.js     # Cross-source task linking and drift detection
├── gmail/
│   ├── gmailClient.js       # Gmail API v1 client + MIME parser
│   ├── reportMailer.js      # Daily report emails (HTML + PDF)
│   ├── dailyBrief.js        # Morning/evening brief emails
│   └── followupTracker.js   # Outbound follow-up tracking
├── sheets/
│   └── sheetsClient.js      # Google Sheets API v4 client
├── slack/
│   └── slackClient.js       # Slack API: channel scan for Jira mentions
├── utils/
│   ├── auth.js              # OAuth token management
│   ├── storage.js           # chrome.storage abstraction + defaults
│   ├── jiraParser.js        # Jira ticket ID extraction + sanitization
│   ├── taskStore.js         # Unified task CRUD
│   ├── commitmentExtractor.js
│   ├── sentimentTracker.js
│   ├── decisionLog.js
│   ├── ghostTaskDetector.js
│   ├── reminderEngine.js
│   ├── stalenessDetector.js
│   └── contextEngine.js    # (also in context/)
├── popup/
│   ├── popup.html           # Extension popup UI
│   ├── popup.js             # All popup logic + assistant handler
│   └── popup.css            # Popup styles
└── config.js                # Central config, STORAGE_KEYS, alarm names
```

### Module Boundaries (enforced)
- `src/gmail/*` — Gmail API retrieval/parsing only
- `src/sheets/*` — Google Sheets read/write only
- `src/ai/*` — Summarization/fallback logic only
- `src/utils/*` — Shared utilities and storage/auth helpers
- `src/background/*` — Orchestration only (no low-level API details)
- `src/assistant/*` — Platform knowledge base and offline query engine
- Prefer explicit contracts over implicit coupling between modules

---

## Configuration Options

All settings persisted in `chrome.storage.local` (except tokens which go to `chrome.storage.session`):

| Setting | Default | Description |
|---|---|---|
| `spreadsheetId` | — | Google Sheet ID to write rows into |
| `gmailQuery` | `in:inbox` | Gmail search query |
| `datePreset` | `7d` | Lookback window (1d/7d/30d/90d/custom) |
| `enableAiSummaries` | false | Master AI toggle |
| `aiProvider` | `openai` | `openai` or `anthropic` |
| `aiSummaryMode` | `per_ticket_and_consolidated` | `per_ticket_and_consolidated` or `consolidated_only` |
| `maxConcurrentAiRequests` | 2 | Parallel AI calls during sync |
| `maxConcurrentMessages` | 5 | Parallel Gmail fetches |
| `reportRecipientEmail` | — | Address to receive scheduled reports |
| `enableDailyReport` | false | Daily email report toggle |
| `enableMorningBrief` | false | Morning brief toggle |
| `enableEveningReport` | false | Evening report toggle |
| `slackBotToken` | — | Slack bot token (session storage) |
| `slackChannelId` | — | Slack channel to scan |
| `enableSlackSync` | false | Slack scan toggle |
| `atlassianDomain` | — | e.g. `yourcompany.atlassian.net` |
| `atlassianEmail` | — | Atlassian account email |
| `atlassianToken` | — | Atlassian API token (session storage) |

---

## Security Rules

- Never commit real credentials: OAuth client IDs, API keys, Spreadsheet IDs
- All sensitive tokens (`slackBotToken`, `atlassianToken`) stored in `chrome.storage.session` — cleared on browser close
- Minimum required Chrome permissions; no Gmail write scope unless explicitly requested
- Session-based AI uses `credentials: "include"` on the user's existing login — no API keys stored or transmitted through the extension itself
- HTML rendered from AI or email content is always escaped before insertion

---

## AI Contract

- Always resolve provider via `getEffectiveAiProvider()` before any external AI call
- All AI JSON outputs must be safe-parsed (`safeJsonParse`) — never `JSON.parse` directly
- Any provider failure must degrade gracefully to local Basic summaries
- Sync completion must never be blocked solely by an AI provider failure
- The `sessionClient.js` module is the single source of truth for session-based AI calls

---

## Code Standards

- ES Modules only (`import`/`export`); all imports must be at the top level
- Public functions documented with JSDoc
- Small, composable functions over large monoliths
- Keep files focused; split if responsibility grows
- No hardcoded credentials in source

---

## Testing Standards

Prefer Vitest for unit/integration tests. Prioritize tests for:
- `jiraParser` — ticket ID extraction and sanitization
- AI provider fallback behavior (mock provider failure → Basic fallback)
- Sync dedup correctness (seen ticket IDs not re-appended)
- Storage read/write contracts with mocked `chrome.*`
- JMDEngine intent detection and DRI lookup accuracy

---

## Dangerous Actions (Denied by Default)

- `git push --force`
- Destructive filesystem operations outside project scope
- Any attempt to add Gmail write scope unless explicitly requested
- Storing secrets in `chrome.storage.local` (use `session` for tokens)
- Direct `JSON.parse` on AI responses without safe-parse wrapper
