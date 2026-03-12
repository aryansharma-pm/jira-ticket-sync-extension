# CLAUDE.md

## Project Purpose
Jira Gmail Tracker is a Chrome Manifest V3 extension that:
1. Reads Gmail messages with Jira ticket mentions
2. Extracts ticket IDs and deduplicates them
3. Appends structured rows to Google Sheets
4. Optionally generates AI summaries (Basic/OpenAI/Gemini)
5. Sends scheduled consolidated reports by email

## Architecture Rules
- Keep module boundaries strict:
  - `src/gmail/*`: Gmail API retrieval/parsing only
  - `src/sheets/*`: Google Sheets read/write only
  - `src/ai/*`: Summarization/fallback logic only
  - `src/utils/*`: shared utilities and storage/auth helpers
  - `src/background/*`: orchestration only (no low-level API details)
- Prefer explicit contracts over implicit coupling between modules.

## AI Contract
- Always resolve provider via `getEffectiveAiProvider()` behavior before external AI calls.
- All AI outputs must be schema-validated or safe-parsed.
- Any provider failure must degrade gracefully to local Basic summaries.
- Do not block sync completion solely because AI provider failed.

## Security Rules
- Never commit real credentials or IDs:
  - OAuth client IDs
  - OpenAI/Gemini API keys
  - private Spreadsheet IDs
- Keep API keys in `chrome.storage.session`, not hardcoded in source.
- Minimum required permissions only; avoid write scopes unless feature requires it.

## Code Standards
- ES Modules only (`import`/`export`)
- Keep public functions documented with JSDoc
- Prefer small, composable functions over large monoliths
- Keep files focused; split if a file grows too much in responsibility

## Testing Standards
- Prefer Vitest for unit/integration tests
- Prioritize tests for:
  - `jiraParser` extraction/sanitization
  - AI provider fallback behavior
  - sync dedup correctness
  - storage read/write contracts with mocked `chrome.*`

## Dangerous Actions (Denied by Default)
- `git push --force`
- destructive filesystem operations outside project scope
- any attempt to add Gmail write scope unless explicitly requested
