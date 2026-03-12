/**
 * reportMailer.js
 * Sends scheduled consolidated sync reports through Gmail API.
 */

import { authenticatedFetch } from "../utils/auth.js";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export async function sendConsolidatedReportEmail({ recipientEmail, report }) {
  if (!recipientEmail) {
    throw new Error("Recipient email is required for scheduled reports.");
  }

  const syncDate = new Date(report.syncTimestamp || Date.now());
  const readableSyncDate = syncDate.toLocaleString();
  const fileStamp = syncDate.toISOString().slice(0, 10);
  const subject = `Jira Daily AI Report - ${fileStamp}`;
  const pdfBytes = buildReportPdf(report);
  const htmlBody = buildReportHtml({
    readableSyncDate,
    report,
  });

  const boundary = `boundary_${Date.now()}`;
  const rawMessage = [
    `To: ${recipientEmail}`,
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
    `--${boundary}`,
    "Content-Type: application/pdf; name=\"jira-daily-report.pdf\"",
    "Content-Disposition: attachment; filename=\"jira-daily-report.pdf\"",
    "Content-Transfer-Encoding: base64",
    "",
    base64EncodeBytes(pdfBytes),
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const response = await authenticatedFetchWithRetry(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw: toBase64Url(rawMessage),
    }),
  }, {
    retries: 3,
    retryStatuses: [429, 500, 502, 503, 504],
  });

  if (!response.ok) {
    throw new Error(`Failed to send report email: ${response.status} ${await response.text()}`);
  }
}

async function authenticatedFetchWithRetry(url, fetchOptions, retryOptions = {}) {
  const {
    retries = 2,
    retryStatuses = [429, 500, 502, 503, 504],
  } = retryOptions;
  let attempt = 0;
  let response = null;
  let lastError = null;

  while (attempt <= retries) {
    try {
      response = await authenticatedFetch(url, fetchOptions);
      lastError = null;
    } catch (err) {
      lastError = err;
      if (!isRetriableNetworkError(err) || attempt === retries) {
        throw new Error(`Failed to send report email due to network error: ${err.message}`);
      }
      await sleep(Math.min(4000, 350 * (2 ** attempt)));
      attempt += 1;
      continue;
    }

    if (!retryStatuses.includes(response.status)) {
      return response;
    }
    if (attempt === retries) {
      return response;
    }

    const retryAfterSec = Number.parseInt(response.headers.get("retry-after") || "", 10);
    const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : Math.min(4000, 350 * (2 ** attempt));
    await sleep(delayMs);
    attempt += 1;
  }

  if (lastError) {
    throw new Error(`Failed to send report email due to network error: ${lastError.message}`);
  }
  return response;
}

function isRetriableNetworkError(err) {
  const message = String(err?.message || "");
  return Boolean(message) && (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Network request failed")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReportPdf(report) {
  const syncDate = new Date(report.syncTimestamp || Date.now()).toLocaleString();
  const lines = [];
  lines.push("Jira Daily Ticket Report");
  lines.push(`Generated At: ${syncDate}`);
  lines.push(`Total New Tickets: ${Number(report.added || 0)}`);
  lines.push(`AI Status: ${report.aiUnavailableReason ? `Skipped (${report.aiUnavailableReason})` : "Enabled"}`);
  lines.push("");

  if (report.consolidatedSummary) {
    lines.push("Consolidated Summary:");
    lines.push(...wrapText(report.consolidatedSummary, 95));
    lines.push("");
  }

  if (report.consolidatedActionItems) {
    lines.push("Action Items:");
    lines.push(...wrapText(report.consolidatedActionItems, 95));
    lines.push("");
  }

  lines.push("Ticket Highlights:");
  const entries = Array.isArray(report.entries) ? report.entries : [];
  const maxTicketRows = 28;

  if (!entries.length) {
    lines.push("No new tickets in this run.");
  } else {
    for (let index = 0; index < Math.min(entries.length, maxTicketRows); index += 1) {
      const entry = entries[index];
      const summary = sanitizeOneLine(entry.aiSummary || entry.emailSubject || entry.ticketTitle || "");
      const rawLine = `${index + 1}. ${entry.ticketNumber || "N/A"} | ${summary}`;
      lines.push(...wrapText(rawLine, 95));
    }
    if (entries.length > maxTicketRows) {
      lines.push(`... ${entries.length - maxTicketRows} more ticket(s) not shown.`);
    }
  }

  return buildSimplePdfFromLines(lines);
}

function buildReportHtml({ readableSyncDate, report }) {
  const entries = Array.isArray(report.entries) ? report.entries : [];
  const limitedEntries = entries.slice(0, 18);
  const addedCount = Number(report.added || 0);
  const aiStatus = report.aiUnavailableReason
    ? `Skipped (${escapeHtml(report.aiUnavailableReason)})`
    : "Enabled";

  const tableRows = limitedEntries.map((entry, index) => {
    const ticket = escapeHtml(entry.ticketNumber || "N/A");
    const from = escapeHtml(entry.from || "-");
    const date = escapeHtml(entry.date ? new Date(entry.date).toLocaleString() : "-");
    const summary = escapeHtml(sanitizeOneLine(entry.aiSummary || entry.emailSubject || entry.ticketTitle || "-"));
    const jiraUrl = escapeHtml(entry.jiraUrl || "");
    const jiraCell = jiraUrl ? `<a href="${jiraUrl}" target="_blank" rel="noreferrer">Open</a>` : "-";
    const rowBg = index % 2 === 0 ? "#f9fbff" : "#f0f6ff";
    return `
      <tr style="background:${rowBg};">
        <td style="padding:8px;border-bottom:1px solid #d9e7ff;font-weight:700;color:#14385a;">${ticket}</td>
        <td style="padding:8px;border-bottom:1px solid #d9e7ff;color:#1f4467;">${from}</td>
        <td style="padding:8px;border-bottom:1px solid #d9e7ff;color:#1f4467;">${date}</td>
        <td style="padding:8px;border-bottom:1px solid #d9e7ff;color:#1f4467;">${summary}</td>
        <td style="padding:8px;border-bottom:1px solid #d9e7ff;color:#1f4467;">${jiraCell}</td>
      </tr>
    `;
  }).join("");

  const summaryHtml = report.consolidatedSummary
    ? `<p style="margin:0;color:#1b3f63;line-height:1.45;">${escapeHtml(report.consolidatedSummary)}</p>`
    : `<p style="margin:0;color:#5a7898;line-height:1.45;">No consolidated summary generated for this run.</p>`;

  const actionsHtml = report.consolidatedActionItems
    ? `<p style="margin:0;color:#1b3f63;line-height:1.45;">${escapeHtml(report.consolidatedActionItems)}</p>`
    : `<p style="margin:0;color:#5a7898;line-height:1.45;">No explicit action items detected.</p>`;

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(145deg,#e9f4ff,#f4f9ff);padding:18px;">
      <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #cfe0f9;border-radius:14px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0d3b66,#0077b6);padding:16px 18px;color:#ffffff;">
          <h2 style="margin:0 0 6px 0;font-size:20px;">Jira Daily Ticket Report</h2>
          <p style="margin:0;font-size:12px;opacity:0.9;">Generated at ${escapeHtml(readableSyncDate)}</p>
        </div>

        <div style="padding:14px 16px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="background:#ecf6ff;border:1px solid #cae3ff;border-radius:10px;padding:10px 12px;min-width:150px;">
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5b7fa3;font-weight:700;">New Tickets</div>
              <div style="font-size:20px;color:#123b62;font-weight:800;">${addedCount}</div>
            </div>
            <div style="background:#edfdf5;border:1px solid #c7ecd8;border-radius:10px;padding:10px 12px;min-width:150px;">
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#4d7f69;font-weight:700;">AI Status</div>
              <div style="font-size:14px;color:#185c42;font-weight:800;">${aiStatus}</div>
            </div>
            <div style="background:#fff8eb;border:1px solid #f1dbb4;border-radius:10px;padding:10px 12px;min-width:150px;">
              <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#8a6731;font-weight:700;">Attachment</div>
              <div style="font-size:14px;color:#6d4f1f;font-weight:800;">jira-daily-report.pdf</div>
            </div>
          </div>

          <div style="margin-bottom:12px;padding:12px;border:1px solid #d6e6fb;border-radius:10px;background:#f8fbff;">
            <h3 style="margin:0 0 8px 0;font-size:13px;color:#184267;">Consolidated Summary</h3>
            ${summaryHtml}
          </div>

          <div style="margin-bottom:12px;padding:12px;border:1px solid #d6e6fb;border-radius:10px;background:#f8fbff;">
            <h3 style="margin:0 0 8px 0;font-size:13px;color:#184267;">Action Items</h3>
            ${actionsHtml}
          </div>

          <h3 style="margin:0 0 8px 0;font-size:13px;color:#184267;">Ticket Highlights</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #d9e7ff;border-radius:10px;overflow:hidden;font-size:12px;">
            <thead>
              <tr style="background:#e8f2ff;color:#173f63;text-align:left;">
                <th style="padding:8px;border-bottom:1px solid #d9e7ff;">Ticket</th>
                <th style="padding:8px;border-bottom:1px solid #d9e7ff;">From</th>
                <th style="padding:8px;border-bottom:1px solid #d9e7ff;">Date</th>
                <th style="padding:8px;border-bottom:1px solid #d9e7ff;">Summary</th>
                <th style="padding:8px;border-bottom:1px solid #d9e7ff;">Jira</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || `<tr><td colspan="5" style="padding:12px;color:#5a7898;">No new tickets in this run.</td></tr>`}
            </tbody>
          </table>
          ${entries.length > limitedEntries.length
            ? `<p style="margin:8px 0 0 0;color:#5a7898;font-size:11px;">Showing first ${limitedEntries.length} of ${entries.length} ticket(s). Full details are in the PDF attachment.</p>`
            : ""
          }
        </div>
      </div>
    </div>
  `;
}

function base64EncodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64EncodeBytes(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toBase64Url(text) {
  return base64EncodeUtf8(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeOneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function wrapText(text, maxLen = 95) {
  const words = sanitizeOneLine(text).split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let current = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

function buildSimplePdfFromLines(inputLines) {
  const encoder = new TextEncoder();
  const maxLines = 54;
  const lines = [...inputLines];
  if (lines.length > maxLines) {
    lines.length = maxLines - 1;
    lines.push("... Report truncated for PDF preview.");
  }

  const escaped = lines.map((line) => escapePdfText(line));
  const contentStream = [
    "BT",
    "/F1 10 Tf",
    "14 TL",
    "50 760 Td",
    ...escaped.map((line) => `(${line}) Tj T*`),
    "ET",
  ].join("\n");

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>";
  objects[4] = `<< /Length ${encoder.encode(contentStream).length} >>\nstream\n${contentStream}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 1; index <= 5; index += 1) {
    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += "xref\n0 6\n";
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\n";
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}

function escapePdfText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
