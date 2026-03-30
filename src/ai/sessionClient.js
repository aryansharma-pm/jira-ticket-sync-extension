/**
 * sessionClient.js
 * Low-level session-based AI callers shared by aiClient.js (service worker)
 * and popup.js (popup context).
 *
 * Uses existing browser sessions — no API keys required:
 *   openai    → chatgpt.com  (user must be signed in)
 *   anthropic → claude.ai    (user must be signed in)
 */

const CHATGPT_SESSION_URL      = "https://chatgpt.com/api/auth/session";
const CHATGPT_CONVERSATION_URL = "https://chatgpt.com/backend-api/conversation";
const CLAUDE_ORGS_URL          = "https://claude.ai/api/organizations";

// ─── UUID ─────────────────────────────────────────────────────────────────────

export function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── ChatGPT ─────────────────────────────────────────────────────────────────

/**
 * Call ChatGPT via browser session. Returns full response text.
 * @param {string} prompt
 * @param {function(string):void} [onChunk] - called with accumulated text as chunks arrive
 */
export async function callChatGptSession(prompt, onChunk) {
  const sessionResp = await fetch(CHATGPT_SESSION_URL, { credentials: "include" });
  if (!sessionResp.ok) {
    throw new Error(
      `ChatGPT: not signed in (HTTP ${sessionResp.status}). Open chatgpt.com and sign in, then try again.`
    );
  }
  const session = await sessionResp.json().catch(() => ({}));
  const accessToken = session?.accessToken;
  if (!accessToken) {
    throw new Error("ChatGPT: no access token found. Sign in at chatgpt.com first.");
  }

  const messageId = generateUUID();
  const parentId  = generateUUID();

  const resp = await fetch(CHATGPT_CONVERSATION_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "next",
      messages: [{
        id: messageId,
        author: { role: "user" },
        content: { content_type: "text", parts: [prompt] },
      }],
      model: "gpt-4o",
      parent_message_id: parentId,
      timezone_offset_min: new Date().getTimezoneOffset(),
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ChatGPT error ${resp.status}: ${body.slice(0, 200)}`);
  }

  return readChatGptSse(resp, onChunk);
}

export async function readChatGptSse(response, onChunk) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer   = "";
  let lastText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return lastText;
        try {
          const obj   = JSON.parse(raw);
          const parts = obj?.message?.content?.parts;
          if (Array.isArray(parts) && typeof parts[0] === "string" && parts[0]) {
            lastText = parts[0];
            if (onChunk) onChunk(lastText);
          }
        } catch { /* ignore partial JSON */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return lastText;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

/**
 * Call Claude via browser session. Returns full response text.
 * @param {string} prompt
 * @param {function(string):void} [onChunk] - called with accumulated text as chunks arrive
 */
export async function callClaudeSession(prompt, onChunk) {
  const orgsResp = await fetch(CLAUDE_ORGS_URL, {
    credentials: "include",
    headers: { "Accept": "application/json" },
  });
  if (!orgsResp.ok) {
    throw new Error(
      `Claude.ai: not signed in (HTTP ${orgsResp.status}). Open claude.ai and sign in, then try again.`
    );
  }
  const orgs  = await orgsResp.json().catch(() => []);
  const orgId = orgs?.[0]?.uuid;
  if (!orgId) {
    throw new Error("Claude.ai: no organization found. Sign in at claude.ai first.");
  }

  const convId     = generateUUID();
  const createResp = await fetch(
    `https://claude.ai/api/organizations/${orgId}/chat_conversations`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ name: "", uuid: convId }),
    }
  );
  if (!createResp.ok) {
    throw new Error(`Claude.ai: failed to create conversation (HTTP ${createResp.status}).`);
  }

  const completionResp = await fetch(
    `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        prompt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        attachments: [],
        files: [],
      }),
    }
  );

  if (!completionResp.ok) {
    const body = await completionResp.text().catch(() => "");
    throw new Error(`Claude.ai error ${completionResp.status}: ${body.slice(0, 200)}`);
  }

  return readClaudeSse(completionResp, onChunk);
}

export async function readClaudeSse(response, onChunk) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text   = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        try {
          const obj = JSON.parse(raw);
          if (obj?.type === "content_block_delta" && obj?.delta?.type === "text_delta") {
            text += obj.delta.text || "";
            if (onChunk) onChunk(text);
          }
        } catch { /* ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return text.trim();
}

// ─── Unified caller ───────────────────────────────────────────────────────────

/**
 * Call whichever provider is configured.
 * @param {string} prompt
 * @param {"openai"|"anthropic"} provider
 * @param {function(string):void} [onChunk]
 */
export async function callSessionProvider(prompt, provider, onChunk) {
  if (provider === "openai") return callChatGptSession(prompt, onChunk);
  if (provider === "anthropic") return callClaudeSession(prompt, onChunk);
  throw new Error(`Unsupported provider: ${provider}`);
}
