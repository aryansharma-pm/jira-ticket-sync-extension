/**
 * dailyBrief.js
 * Generates morning plan and evening report emails using all intelligence sources.
 *  - Morning brief: Priority tasks, today's meetings, overdue follow-ups, commitments due today
 *  - Evening report: Completed today, still open, risks for tomorrow, sentiment risks
 */

import { authenticatedFetch } from "../utils/auth.js";
import { getTaskStore } from "../utils/taskStore.js";
import { getOverdueFollowups, getPendingFollowups } from "./followupTracker.js";
import { getCommitments, getOverdueCommitments } from "../utils/commitmentExtractor.js";
import { detectSentimentDrift } from "../utils/sentimentTracker.js";
import { getDecisionLog } from "../utils/decisionLog.js";
import { fetchUpcomingEvents } from "../calendar/calendarClient.js";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// ─── Morning Brief ────────────────────────────────────────────────────────────

/**
 * Generate and send the morning intelligence brief.
 *
 * @param {string} recipientEmail
 * @returns {Promise<void>}
 */
export async function sendMorningBrief(recipientEmail) {
  if (!recipientEmail) throw new Error("Recipient email required for morning brief.");

  const [tasks, overdueFollowups, commitments, sentimentRisks, todayEvents] =
    await Promise.allSettled([
      getTaskStore(),
      getOverdueFollowups(),
      getCommitments(),
      detectSentimentDrift(),
      fetchUpcomingEvents({ hoursAhead: 16, maxResults: 10 }).catch(() => []),
    ]).then((results) => results.map((r) => (r.status === "fulfilled" ? r.value : [])));

  const today = new Date().toISOString().slice(0, 10);

  const p0p1Tasks = tasks
    .filter((t) => t.status !== "done" && (t.urgency === "P0" || t.urgency === "P1"))
    .slice(0, 8);

  const blockedTasks = tasks
    .filter((t) => t.status === "blocked")
    .slice(0, 5);

  const dueToday = commitments.filter(
    (c) => c.status === "pending" && c.dueDate === today
  );

  const html = buildMorningHtml({
    date: new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    p0p1Tasks,
    blockedTasks,
    overdueFollowups: (overdueFollowups || []).slice(0, 5),
    dueToday,
    todayEvents: (todayEvents || []).slice(0, 5),
    sentimentRisks: (sentimentRisks || []).slice(0, 2),
  });

  await sendEmail(recipientEmail, `☀️ Morning Brief — ${new Date().toLocaleDateString()}`, html);
}

// ─── Evening Report ───────────────────────────────────────────────────────────

/**
 * Generate and send the evening wrap report.
 *
 * @param {string} recipientEmail
 * @param {Object} [syncResult] - Result from the last runSync call
 * @returns {Promise<void>}
 */
export async function sendEveningReport(recipientEmail, syncResult = {}) {
  if (!recipientEmail) throw new Error("Recipient email required for evening report.");

  const [tasks, pendingFollowups, overdueCommitments, sentimentRisks, recentDecisions] =
    await Promise.allSettled([
      getTaskStore(),
      getPendingFollowups(),
      getOverdueCommitments(),
      detectSentimentDrift(),
      getDecisionLog(10),
    ]).then((results) => results.map((r) => (r.status === "fulfilled" ? r.value : [])));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const completedToday = tasks.filter(
    (t) =>
      t.status === "done" &&
      new Date(t.lastActivityAt).getTime() >= todayStart.getTime()
  );

  const stillOpen = tasks
    .filter((t) => t.status !== "done" && (t.urgency === "P0" || t.urgency === "P1"))
    .slice(0, 8);

  const html = buildEveningHtml({
    date: new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    completedToday: completedToday.slice(0, 10),
    stillOpen,
    pendingFollowups: (pendingFollowups || []).slice(0, 5),
    overdueCommitments: (overdueCommitments || []).slice(0, 3),
    sentimentRisks: (sentimentRisks || []).slice(0, 2),
    recentDecisions: (recentDecisions || []).slice(0, 3),
    syncResult,
  });

  await sendEmail(recipientEmail, `🌙 Evening Wrap — ${new Date().toLocaleDateString()}`, html);
}

// ─── HTML Builders ────────────────────────────────────────────────────────────

function buildMorningHtml({ date, p0p1Tasks, blockedTasks, overdueFollowups, dueToday, todayEvents, sentimentRisks }) {
  const urgencyBadge = (u) =>
    ({ P0: `<span style="color:#c62828;font-weight:700;">🔴 P0</span>`,
       P1: `<span style="color:#e65100;font-weight:700;">🟠 P1</span>`,
       P2: `<span style="color:#f9a825;font-weight:700;">🟡 P2</span>`,
       P3: `<span style="color:#1565c0;font-weight:700;">🔵 P3</span>` }[u] || "");

  const taskRows = (list) => list.map((t) =>
    `<tr><td style="padding:6px 8px;">${urgencyBadge(t.urgency)}</td>
     <td style="padding:6px 8px;color:#1a237e;">${esc(t.title)}</td>
     <td style="padding:6px 8px;color:#555;">${esc(t.status)}</td></tr>`
  ).join("") || `<tr><td colspan="3" style="padding:8px;color:#888;">None — great start!</td></tr>`;

  const followupRows = overdueFollowups.map((f) =>
    `<li style="margin:4px 0;">📧 <b>${esc(f.subject || "(no subject)")}</b> → ${esc(f.to)} <span style="color:#888;">(${humanizeAge(f.sentAt)} ago)</span></li>`
  ).join("") || `<li style="color:#888;">No overdue follow-ups.</li>`;

  const meetingRows = todayEvents.map((e) => {
    const time = e.startTime ? new Date(e.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return `<li style="margin:4px 0;">🗓 <b>${esc(e.title)}</b> at ${time}${e.meetLink ? ` — <a href="${esc(e.meetLink)}">Join</a>` : ""}</li>`;
  }).join("") || `<li style="color:#888;">No meetings today.</li>`;

  const commitmentRows = dueToday.map((c) =>
    `<li style="margin:4px 0;">📌 ${esc(c.text.slice(0, 100))} → <b>${esc(c.to)}</b></li>`
  ).join("") || `<li style="color:#888;">No commitments due today.</li>`;

  const sentimentSection = sentimentRisks.length ? `
    <div style="margin-bottom:16px;padding:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;">
      <h3 style="margin:0 0 8px;font-size:13px;color:#e65100;">⚠️ Relationship Risks</h3>
      ${sentimentRisks.map((r) => `<p style="margin:4px 0;color:#333;">${esc(r.message)}</p>`).join("")}
    </div>` : "";

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f4ff;padding:16px;">
      <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d9f0;">
        <div style="background:linear-gradient(135deg,#1a237e,#283593);padding:16px 20px;color:#fff;">
          <h2 style="margin:0 0 4px;">☀️ Morning Brief</h2>
          <p style="margin:0;font-size:12px;opacity:0.85;">${esc(date)}</p>
        </div>
        <div style="padding:16px 20px;">

          <div style="margin-bottom:16px;">
            <h3 style="margin:0 0 8px;font-size:13px;color:#c62828;">🔴 Requires Attention (P0/P1)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#e8eaf6;">
                <th style="padding:6px 8px;text-align:left;">Priority</th>
                <th style="padding:6px 8px;text-align:left;">Task</th>
                <th style="padding:6px 8px;text-align:left;">Status</th>
              </tr></thead>
              <tbody>${taskRows(p0p1Tasks)}</tbody>
            </table>
          </div>

          ${blockedTasks.length ? `
          <div style="margin-bottom:16px;padding:10px 12px;background:#fce4ec;border-radius:8px;border:1px solid #f48fb1;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#880e4f;">🚫 Blocked Tasks</h3>
            <ul style="margin:0;padding-left:18px;">${blockedTasks.map((t) => `<li style="margin:3px 0;">${esc(t.title)}</li>`).join("")}</ul>
          </div>` : ""}

          <div style="margin-bottom:16px;padding:10px 12px;background:#e3f2fd;border-radius:8px;border:1px solid #90caf9;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#0d47a1;">📅 Today's Meetings</h3>
            <ul style="margin:0;padding-left:18px;">${meetingRows}</ul>
          </div>

          <div style="margin-bottom:16px;padding:10px 12px;background:#fafafa;border-radius:8px;border:1px solid #e0e0e0;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#4a148c;">📧 Overdue Follow-Ups</h3>
            <ul style="margin:0;padding-left:18px;">${followupRows}</ul>
          </div>

          <div style="margin-bottom:16px;padding:10px 12px;background:#f3e5f5;border-radius:8px;border:1px solid #ce93d8;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#4a148c;">📌 Commitments Due Today</h3>
            <ul style="margin:0;padding-left:18px;">${commitmentRows}</ul>
          </div>

          ${sentimentSection}

        </div>
      </div>
    </div>`;
}

function buildEveningHtml({ date, completedToday, stillOpen, pendingFollowups, overdueCommitments, sentimentRisks, recentDecisions, syncResult }) {
  const completedList = completedToday.map((t) =>
    `<li style="margin:3px 0;">✅ ${esc(t.title)}</li>`
  ).join("") || `<li style="color:#888;">Nothing completed today.</li>`;

  const openList = stillOpen.map((t) =>
    `<li style="margin:3px 0;">${t.urgency === "P0" ? "🔴" : "🟠"} ${esc(t.title)} [${esc(t.status)}]</li>`
  ).join("") || `<li style="color:#888;">All clear!</li>`;

  const followupList = pendingFollowups.map((f) =>
    `<li style="margin:3px 0;">📧 "${esc(f.subject || "(no subject)")}" → ${esc(f.to)}</li>`
  ).join("") || `<li style="color:#888;">No pending follow-ups.</li>`;

  const commitmentList = overdueCommitments.map((c) =>
    `<li style="margin:3px 0;">⚠️ ${esc(c.text.slice(0, 100))} — due ${esc(c.dueDate)}</li>`
  ).join("");

  const decisionList = recentDecisions.map((d) =>
    `<li style="margin:3px 0;">💡 ${esc(d.summary.slice(0, 150))}</li>`
  ).join("") || `<li style="color:#888;">No decisions recorded today.</li>`;

  const syncSummary = syncResult.added != null
    ? `<p style="color:#555;font-size:12px;">🔄 Last sync: ${syncResult.detected || 0} tickets detected, ${syncResult.added || 0} new added.</p>`
    : "";

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f4ff;padding:16px;">
      <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d0d9f0;">
        <div style="background:linear-gradient(135deg,#1b5e20,#2e7d32);padding:16px 20px;color:#fff;">
          <h2 style="margin:0 0 4px;">🌙 Evening Wrap</h2>
          <p style="margin:0;font-size:12px;opacity:0.85;">${esc(date)}</p>
        </div>
        <div style="padding:16px 20px;">
          ${syncSummary}

          <div style="margin-bottom:14px;padding:10px 12px;background:#e8f5e9;border-radius:8px;border:1px solid #a5d6a7;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#1b5e20;">✅ Completed Today</h3>
            <ul style="margin:0;padding-left:18px;">${completedList}</ul>
          </div>

          <div style="margin-bottom:14px;padding:10px 12px;background:#fff3e0;border-radius:8px;border:1px solid #ffcc80;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#e65100;">⚠️ Still Open (carry to tomorrow)</h3>
            <ul style="margin:0;padding-left:18px;">${openList}</ul>
          </div>

          ${overdueCommitments.length ? `
          <div style="margin-bottom:14px;padding:10px 12px;background:#fce4ec;border-radius:8px;border:1px solid #f48fb1;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#880e4f;">📌 Overdue Commitments</h3>
            <ul style="margin:0;padding-left:18px;">${commitmentList}</ul>
          </div>` : ""}

          <div style="margin-bottom:14px;padding:10px 12px;background:#f3e5f5;border-radius:8px;border:1px solid #ce93d8;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#4a148c;">📧 Pending Follow-Ups</h3>
            <ul style="margin:0;padding-left:18px;">${followupList}</ul>
          </div>

          ${sentimentRisks.length ? `
          <div style="margin-bottom:14px;padding:10px 12px;background:#fff8e1;border-radius:8px;border:1px solid #ffe082;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#e65100;">⚠️ Relationship Risks</h3>
            ${sentimentRisks.map((r) => `<p style="margin:4px 0;font-size:12px;">${esc(r.message)}</p>`).join("")}
          </div>` : ""}

          <div style="margin-bottom:14px;padding:10px 12px;background:#e3f2fd;border-radius:8px;border:1px solid #90caf9;">
            <h3 style="margin:0 0 6px;font-size:13px;color:#0d47a1;">💡 Decisions Made Today</h3>
            <ul style="margin:0;padding-left:18px;">${decisionList}</ul>
          </div>

        </div>
      </div>
    </div>`;
}

// ─── Email sender ─────────────────────────────────────────────────────────────

async function sendEmail(to, subject, htmlBody) {
  const boundary = `brief_${Date.now()}`;
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64EncodeUtf8(htmlBody),
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const resp = await authenticatedFetch(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: toBase64Url(rawMessage) }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to send brief: ${resp.status} ${await resp.text()}`);
  }
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function base64EncodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(text) {
  return base64EncodeUtf8(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function humanizeAge(isoString) {
  if (!isoString) return "?";
  const ms = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
