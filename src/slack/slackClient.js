/**
 * slackClient.js
 * Slack Web API client for scanning channels for Jira ticket mentions.
 *
 * ─── HOW TO ENABLE SLACK INTEGRATION ────────────────────────────────────────
 *
 * 1. Create a Slack App at https://api.slack.com/apps → "Create New App" → "From Scratch"
 * 2. Under "OAuth & Permissions" → "Scopes" → "Bot Token Scopes", add:
 *      channels:history   (read public channel messages)
 *      channels:read      (list channels)
 *      search:read        (search messages — optional, for keyword search)
 *      groups:history     (if scanning private channels)
 * 3. Click "Install App to Workspace" → copy the "Bot User OAuth Token" (xoxb-...)
 * 4. Invite the bot to the channel: /invite @YourAppName
 * 5. Find the channel ID: open Slack in browser, channel URL ends with /CXXXXXXXX
 * 6. In the extension, paste the bot token + channel ID, check "Enable Slack scanning"
 * 7. Save settings → run a sync → the Jira Tickets sheet will include Slack thread links
 *
 * NOTE: Slack tokens are stored in chrome.storage.session (cleared on browser close).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CONFIG } from "../config.js";

const SLACK_API_BASE = "https://slack.com/api";

/**
 * Fetch recent messages from a Slack channel and return those mentioning Jira tickets.
 *
 * @param {string} botToken   - Slack Bot OAuth token (xoxb-...)
 * @param {string} channelId  - Slack channel ID (e.g. C0123ABCD)
 * @param {Object} [opts]
 * @param {number} [opts.lookbackHours]  - How many hours back to scan (default: 72)
 * @param {number} [opts.maxMessages]    - Max messages to retrieve (default: 200)
 * @returns {Promise<SlackThread[]>}
 */
export async function fetchSlackThreadsWithJiraTickets(botToken, channelId, opts = {}) {
  if (!botToken || !channelId) return [];

  const { lookbackHours = CONFIG.SLACK_LOOKBACK_HOURS ?? 72, maxMessages = CONFIG.SLACK_MAX_MESSAGES ?? 200 } = opts;

  const oldest = String(Math.floor((Date.now() - lookbackHours * 3600 * 1000) / 1000));

  const params = new URLSearchParams({
    channel: channelId,
    oldest,
    limit: String(Math.min(maxMessages, 200)),
    inclusive: "true",
  });

  const resp = await slackFetch(`${SLACK_API_BASE}/conversations.history?${params}`, botToken);
  const data = await resp.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || "unknown"}`);
  }

  const regex = CONFIG.JIRA_TICKET_REGEX || /\b([A-Z][A-Z0-9]+-\d+)\b/g;
  const matched = [];

  for (const msg of (data.messages || [])) {
    // Reset regex lastIndex since it's global
    const ticketRegex = new RegExp(regex.source, regex.flags);
    const tickets = [];
    let m;
    while ((m = ticketRegex.exec(msg.text || "")) !== null) {
      tickets.push(m[1]);
    }
    if (tickets.length === 0) continue;

    matched.push({
      ts: msg.ts,
      text: truncate(msg.text || "", 200),
      user: msg.user || msg.username || "",
      tickets: [...new Set(tickets)],
      threadTs: msg.thread_ts || msg.ts,
      replyCount: msg.reply_count || 0,
      channelId,
      slackUrl: buildSlackUrl(channelId, msg.ts),
      timestamp: new Date(Number(msg.ts.split(".")[0]) * 1000).toISOString(),
    });
  }

  return matched;
}

/**
 * Fetch threads (replies) for a parent message.
 *
 * @param {string} botToken
 * @param {string} channelId
 * @param {string} threadTs   - The parent message's ts value
 * @returns {Promise<Object[]>} Array of reply message objects
 */
export async function fetchThreadReplies(botToken, channelId, threadTs) {
  const params = new URLSearchParams({ channel: channelId, ts: threadTs, limit: "50" });
  const resp = await slackFetch(`${SLACK_API_BASE}/conversations.replies?${params}`, botToken);
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack replies error: ${data.error}`);
  return data.messages || [];
}

/**
 * Verify the bot token is valid and the bot has access to the channel.
 *
 * @param {string} botToken
 * @param {string} channelId
 * @returns {Promise<{ok: boolean, error?: string, channelName?: string}>}
 */
export async function testSlackConnection(botToken, channelId) {
  try {
    const resp = await slackFetch(`${SLACK_API_BASE}/conversations.info?channel=${channelId}`, botToken);
    const data = await resp.json();
    if (!data.ok) return { ok: false, error: data.error || "Cannot access channel" };
    return { ok: true, channelName: data.channel?.name || channelId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function slackFetch(url, token) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  if (!resp.ok) throw new Error(`Slack HTTP ${resp.status}`);
  return resp;
}

function buildSlackUrl(channelId, ts) {
  // Produces a deep-link that opens in the Slack desktop/web app
  const tsClean = ts.replace(".", "");
  return `slack://channel?team=&id=${channelId}&message=${tsClean}`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}
