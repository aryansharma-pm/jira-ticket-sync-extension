/**
 * popup.js
 * Controls the extension popup UI.
 * Communicates with the service worker via chrome.runtime.sendMessage.
 */

import {
  getSettings,
  saveSettings,
  getLastSyncTime,
  getLastSyncAddedCount,
  getLastSyncDetectedCount,
  getSyncStatus,
  getUserEmailFromStorage,
  setUserEmail,
  clearUserEmail,
  clearSeenTicketIds,
  clearSyncMetrics,
} from "../utils/storage.js";
import { CONFIG } from "../config.js";
import { getAuthToken, getAuthTokenSilent, getUserEmail, revokeAuthToken, forceReauth } from "../utils/auth.js";
import { JMD_KNOWLEDGE } from "../assistant/knowledge.js";
import { JMDEngine } from "../assistant/engine.js";
import { callSessionProvider } from "../ai/sessionClient.js";

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const authShell       = $("authShell");
const appShell        = $("appShell");
const btnGoogleSignIn = $("btnGoogleSignIn");
const btnContinueGuest = $("btnContinueGuest");
const btnCreateGoogle = $("btnCreateGoogle");

const btnSync         = $("btnSync");
const btnStopSync     = $("btnStopSync");
const btnOpenSheet    = $("btnOpenSheet");
const btnSendTestReport = $("btnSendTestReport");
const btnOpenConfig   = $("btnOpenConfig");
const btnSignOut      = $("btnSignOut");
const btnOpenDashboard = $("btnOpenDashboard");
const btnSaveSettings = $("btnSaveSettings");
const btnClearCache   = $("btnClearCache");
const btnResetStats   = $("btnResetStats");
const settingsPanel   = $("settingsPanel");

const statusDot       = $("statusDot");
const statusText      = $("statusText");
const dailyReportStateEl = $("dailyReportState");
const userEmailEl     = $("userEmail");
const lastSyncTimeEl  = $("lastSyncTime");
const lastSyncTicketCountEl = $("lastSyncTicketCount");
const nextReportRunEl = $("nextReportRun");
const setupProgressEl = $("setupProgress");
const setupAuthItem = $("setupAuthItem");
const setupSheetItem = $("setupSheetItem");
const setupJiraItem = $("setupJiraItem");
const setupReportItem = $("setupReportItem");
const setupAiItem = $("setupAiItem");
const setupAuthText = $("setupAuthText");
const setupSheetText = $("setupSheetText");
const setupJiraText = $("setupJiraText");
const setupReportText = $("setupReportText");
const setupAiText = $("setupAiText");

const progressWrapper = $("progressWrapper");
const progressLabel   = $("progressLabel");
const progressFill    = $("progressFill");

// Settings fields
const fSpreadsheetId  = $("spreadsheetId");
const fSheetName      = $("sheetName");
const fJiraBaseUrl    = $("jiraBaseUrl");
const fGmailDatePreset = $("gmailDatePreset");
const fGmailFromDate  = $("gmailFromDate");
const fGmailToDate    = $("gmailToDate");
const fFastModeEnabled = $("fastModeEnabled");
const fMaxTotalEmails = $("maxTotalEmails");
const fAutoSyncIntvl  = $("autoSyncInterval");
const fDailyReportEnabled = $("dailyReportEnabled");
const fDailyReportTime = $("dailyReportTime");
const fReportRecipientEmail = $("reportRecipientEmail");
const fEnableAiSummaries = $("enableAiSummaries");
const fAiProvider = $("aiProvider");
const fAiSummaryMode = $("aiSummaryMode");
const fConsolidatedSheetName = $("consolidatedSheetName");
const btnTestAi = $("btnTestAi");
const aiTestStatusEl = $("aiTestStatus");

// Intelligence settings fields
const fEnableFollowupTracking   = $("enableFollowupTracking");
const fEnableCommitmentTracking = $("enableCommitmentTracking");
const fEnableSentimentTracking  = $("enableSentimentTracking");
const fEnableDecisionLog        = $("enableDecisionLog");
const fEnableCalendarInteg      = $("enableCalendarIntegration");
const fMorningBriefEnabled      = $("morningBriefEnabled");
const fMorningBriefTime         = $("morningBriefTime");
const fEveningReportEnabled     = $("eveningReportEnabled");
const fEveningReportTime        = $("eveningReportTime");

// Intelligence panel elements
const alertBadge    = $("alertBadge");
const alertList     = $("alertList");
const followupList  = $("followupList");
const commitmentList = $("commitmentList");
const btnRunChecks  = $("btnRunChecks");

// Meetings panel elements
const meetingList        = $("meetingList");
const meetingCountBadge  = $("meetingCountBadge");
const meetingsNote       = $("meetingsNote");
const btnRefreshMeetings   = $("btnRefreshMeetings");
const btnReauthCalendar    = $("btnReauthCalendar");
const calendarAuthGuide    = $("calendarAuthGuide");
const btnRevokeGoogleAccess = $("btnRevokeGoogleAccess");

// Slack elements
const fEnableSlackInteg = $("enableSlackIntegration");
const fSlackBotToken    = $("slackBotToken");
const fSlackChannelId   = $("slackChannelId");
const btnTestSlack      = $("btnTestSlack");
const slackStatusEl     = $("slackStatus");

// Atlassian credentials fields
const fAtlassianDomain = $("atlassianDomain");
const fAtlassianEmail  = $("atlassianEmail");
const fAtlassianToken  = $("atlassianToken");

// JMD Assistant elements
const assistantMessages    = $("assistantMessages");
const assistantInput       = $("assistantInput");
const assistantSendBtn     = $("assistantSendBtn");
const assistantClearBtn    = $("assistantClearBtn");
const assistantProviderBadge = $("assistantProviderBadge");
const assistantAiNote      = $("assistantAiNote");

let popupSyncInProgress = false;
let isProgressListenerBound = false;

// ─── Initialization ───────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  const isSignedIn = await refreshAuthGate();
  if (!isSignedIn) return;

  await loadStatus();
  await loadSettings();
  listenForProgress();
  loadIntelligence().catch(() => {});
  loadTodaysMeetings().catch(() => {});
}

async function loadStatus() {
  const [status, lastSync, lastAddedCount, lastDetectedCount, settings, userEmail] = await Promise.all([
    getSyncStatus(),
    getLastSyncTime(),
    getLastSyncAddedCount(),
    getLastSyncDetectedCount(),
    getSettings(),
    getUserEmailFromStorage(),
  ]);

  statusText.textContent = status || "Ready to sync";
  lastSyncTimeEl.textContent = lastSync
    ? new Date(lastSync).toLocaleString()
    : "—";
  const metricCount = Number.isFinite(lastDetectedCount) ? lastDetectedCount : lastAddedCount;
  lastSyncTicketCountEl.textContent = Number.isFinite(metricCount)
    ? String(metricCount)
    : "—";
  const recipient = (settings.reportRecipientEmail || "").trim();
  dailyReportStateEl.textContent = settings.dailyReportEnabled
    ? (recipient ? `Daily report: enabled to ${recipient}` : "Daily report: enabled (recipient not set)")
    : "Daily report: disabled";
  nextReportRunEl.textContent = getNextReportRunDisplay(settings);
  renderSetupChecklist(settings, userEmail);
}

async function loadSettings() {
  const settings = await getSettings();
  fSpreadsheetId.value = settings.spreadsheetId || "";
  fSheetName.value     = settings.sheetName      || "";
  fJiraBaseUrl.value   = settings.jiraBaseUrl    || "";
  fGmailDatePreset.value = settings.gmailDatePreset || CONFIG.GMAIL_DATE_PRESET;
  fGmailFromDate.value = settings.gmailFromDate || "";
  fGmailToDate.value = settings.gmailToDate || "";
  syncCustomDateFieldState();
  fFastModeEnabled.checked = Boolean(settings.fastModeEnabled);
  fMaxTotalEmails.value = String(settings.maxTotalEmails ?? CONFIG.MAX_TOTAL_EMAILS);
  fAutoSyncIntvl.value = settings.autoSyncIntervalMinutes ?? CONFIG.AUTO_SYNC_INTERVAL_MINUTES;
  fDailyReportEnabled.checked = settings.dailyReportEnabled ?? CONFIG.DAILY_REPORT_ENABLED;
  fDailyReportTime.value = formatTimeValue(
    settings.dailyReportHour ?? CONFIG.DAILY_REPORT_HOUR,
    settings.dailyReportMinute ?? CONFIG.DAILY_REPORT_MINUTE
  );
  fReportRecipientEmail.value = settings.reportRecipientEmail || "";
  fEnableAiSummaries.checked = Boolean(settings.enableAiSummaries);
  fAiProvider.value = settings.aiProvider || CONFIG.AI_PROVIDER;
  fAiSummaryMode.value = settings.aiSummaryMode || CONFIG.AI_SUMMARY_MODE;
  fConsolidatedSheetName.value = settings.consolidatedSheetName || "";

  // Intelligence settings
  // Slack settings
  if (fEnableSlackInteg) fEnableSlackInteg.checked = Boolean(settings.enableSlackIntegration);
  if (fSlackBotToken) {
    fSlackBotToken.value = "";
    fSlackBotToken.placeholder = settings.slackBotToken ? "Configured (leave blank to keep)" : "xoxb-...";
  }
  if (fSlackChannelId) fSlackChannelId.value = settings.slackChannelId || "";

  // Atlassian credentials
  if (fAtlassianDomain) fAtlassianDomain.value = settings.atlassianDomain || "";
  if (fAtlassianEmail)  fAtlassianEmail.value  = settings.atlassianEmail || "";
  if (fAtlassianToken) {
    fAtlassianToken.value = "";
    fAtlassianToken.placeholder = settings.atlassianToken ? "Configured (leave blank to keep)" : "API token from id.atlassian.com";
  }

  if (fEnableFollowupTracking)   fEnableFollowupTracking.checked   = Boolean(settings.enableFollowupTracking);
  if (fEnableCommitmentTracking) fEnableCommitmentTracking.checked = Boolean(settings.enableCommitmentTracking);
  if (fEnableSentimentTracking)  fEnableSentimentTracking.checked  = Boolean(settings.enableSentimentTracking);
  if (fEnableDecisionLog)        fEnableDecisionLog.checked        = Boolean(settings.enableDecisionLog);
  if (fEnableCalendarInteg)      fEnableCalendarInteg.checked      = Boolean(settings.enableCalendarIntegration);
  if (fMorningBriefEnabled)      fMorningBriefEnabled.checked      = Boolean(settings.morningBriefEnabled);
  if (fMorningBriefTime)         fMorningBriefTime.value           = formatTimeValue(settings.morningBriefHour ?? CONFIG.MORNING_BRIEF_HOUR, settings.morningBriefMinute ?? CONFIG.MORNING_BRIEF_MINUTE);
  if (fEveningReportEnabled)     fEveningReportEnabled.checked     = Boolean(settings.eveningReportEnabled);
  if (fEveningReportTime)        fEveningReportTime.value          = formatTimeValue(settings.eveningReportHour ?? CONFIG.EVENING_REPORT_HOUR, settings.eveningReportMinute ?? CONFIG.EVENING_REPORT_MINUTE);

  const userEmail = await getUserEmailFromStorage();
  renderSetupChecklist(settings, userEmail);
  _updateAssistantProviderBadge(settings);
}

async function loadIntelligence() {
  const [alertsResp, followupsResp, commitmentsResp] = await Promise.all([
    sendMessageSafe({ type: "GET_REMINDERS" }),
    sendMessageSafe({ type: "GET_FOLLOWUPS" }),
    sendMessageSafe({ type: "GET_COMMITMENTS" }),
  ]);

  // Render alerts
  const alerts = alertsResp?.alerts || [];
  if (alertBadge) {
    alertBadge.textContent = String(alerts.length);
    alertBadge.hidden = alerts.length === 0;
  }
  if (alertList) {
    alertList.innerHTML = "";
    if (alerts.length === 0) {
      alertList.innerHTML = "<li class='intel-empty'>No alerts.</li>";
    } else {
      // Map P0/P1/P2/P3 urgency to CSS severity classes
      const urgencyClass = { P0: "high", P1: "high", P2: "medium", P3: "low" };
      for (const a of alerts) {
        const severity = urgencyClass[a.urgency] || "medium";
        const li = document.createElement("li");
        li.className = `intel-item intel-item-${severity}`;
        const title = escapeHtml(a.title || a.type || "(alert)");
        const urgencyTag = a.urgency ? `<span style="font-size:10px;font-weight:700;color:#666;margin-right:4px;">${a.urgency}</span>` : "";
        const detail = a.detail ? `<span class="intel-item-meta">${escapeHtml(a.detail)}</span>` : "";
        const action = a.action ? `<span class="intel-item-meta" style="font-style:italic;">→ ${escapeHtml(a.action)}</span>` : "";
        li.innerHTML = `<span class="intel-item-title">${urgencyTag}${title}</span>${detail}${action}`;
        alertList.appendChild(li);
      }
    }
  }

  // Render follow-ups
  const followups = followupsResp?.followups || [];
  if (followupList) {
    followupList.innerHTML = "";
    if (followups.length === 0) {
      followupList.innerHTML = "<li class='intel-empty'>No pending follow-ups.</li>";
    } else {
      for (const f of followups) {
        const li = document.createElement("li");
        li.className = "intel-item";
        const subject = f.subject || f.messageId || "(no subject)";
        const to = f.to || "";
        li.innerHTML = `<span class="intel-item-title">${escapeHtml(subject)}</span>
          ${to ? `<span class="intel-item-meta">To: ${escapeHtml(to)}</span>` : ""}
          <button class="btn-icon btn-dismiss" data-id="${escapeHtml(f.messageId || "")}">Dismiss</button>`;
        followupList.appendChild(li);
      }
      followupList.querySelectorAll(".btn-dismiss").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const msgId = btn.dataset.id;
          btn.disabled = true;
          await sendMessageSafe({ type: "DISMISS_FOLLOWUP", messageId: msgId });
          await loadIntelligence();
        });
      });
    }
  }

  // Render commitments
  const commitments = commitmentsResp?.commitments || [];
  if (commitmentList) {
    commitmentList.innerHTML = "";
    if (commitments.length === 0) {
      commitmentList.innerHTML = "<li class='intel-empty'>No tracked commitments.</li>";
    } else {
      for (const c of commitments) {
        const li = document.createElement("li");
        li.className = `intel-item${c.done ? " intel-item-done" : ""}`;
        const doneIcon = c.done ? `<span style="color:#1f8f65;font-weight:700;margin-right:4px;">✓</span>` : "";
        const text = escapeHtml(c.text || "(no text)");
        const due = c.dueDate
          ? `<span class="intel-item-meta">${c.done ? "Completed" : "Due"}: ${new Date(c.dueDate).toLocaleDateString()}</span>`
          : "";
        const recipient = c.to ? `<span class="intel-item-meta">To: ${escapeHtml(c.to)}</span>` : "";
        li.innerHTML = `<span class="intel-item-title">${doneIcon}${text}</span>${due}${recipient}`;
        commitmentList.appendChild(li);
      }
    }
  }
}

async function loadTodaysMeetings() {
  if (!meetingList) return;
  if (meetingsNote) meetingsNote.hidden = true;

  meetingList.innerHTML = "<li class='intel-empty'>Loading…</li>";
  const resp = await sendMessageSafe({ type: "GET_TODAY_MEETINGS" });

  // Calendar API 403 / auth error — guide the user to re-sign in
  if (resp?.error) {
    const isAuthError = /401|403|auth|credential|permission|scope/i.test(resp.error);
    if (isAuthError) {
      meetingList.innerHTML = "";
      if (calendarAuthGuide) calendarAuthGuide.hidden = false;
    } else {
      meetingList.innerHTML = `<li class='intel-empty'>Error: ${escapeHtml(resp.error)}</li>`;
      if (calendarAuthGuide) calendarAuthGuide.hidden = true;
    }
    if (meetingCountBadge) meetingCountBadge.hidden = true;
    return;
  }
  if (calendarAuthGuide) calendarAuthGuide.hidden = true;

  const events = resp?.events || [];

  if (meetingCountBadge) {
    meetingCountBadge.textContent = String(events.length);
    meetingCountBadge.hidden = events.length === 0;
  }

  meetingList.innerHTML = "";
  if (events.length === 0) {
    meetingList.innerHTML = "<li class='intel-empty'>No meetings scheduled for today.</li>";
    return;
  }

  for (const ev of events) {
    const li = document.createElement("li");
    li.className = "meeting-item";
    const start = ev.startTime ? new Date(ev.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const end   = ev.endTime   ? new Date(ev.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const timeStr = start ? `${start}${end ? " – " + end : ""}` : "";
    const attendeeCount = (ev.attendees || []).filter((a) => !a.self).length;
    const joinLink = ev.meetLink ? `<a class="meeting-join-link" href="${escapeHtml(ev.meetLink)}" target="_blank">Join</a>` : "";
    const calLink  = ev.htmlLink ? `<a class="meeting-cal-link" href="${escapeHtml(ev.htmlLink)}" target="_blank">Calendar</a>` : "";
    li.innerHTML = `
      <div class="meeting-row">
        <span class="meeting-time">${escapeHtml(timeStr)}</span>
        <span class="meeting-title">${escapeHtml(ev.title)}</span>
      </div>
      <div class="meeting-meta">
        ${attendeeCount > 0 ? `<span class="meeting-attendees">${attendeeCount} attendee${attendeeCount !== 1 ? "s" : ""}</span>` : ""}
        ${ev.isRecurring ? '<span class="meeting-tag">Recurring</span>' : ""}
        ${joinLink}${calLink}
      </div>`;
    meetingList.appendChild(li);
  }
}

async function handleTestSlack() {
  if (!btnTestSlack || !slackStatusEl) return;
  const token = fSlackBotToken?.value.trim();
  const channelId = fSlackChannelId?.value.trim();
  if (!token || !channelId) {
    showSlackStatus("Enter a bot token and channel ID first.", "error");
    return;
  }
  btnTestSlack.disabled = true;
  btnTestSlack.textContent = "Testing…";
  try {
    const resp = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channelId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (data.ok) {
      showSlackStatus(`Connected! Channel: #${data.channel?.name || channelId}`, "ok");
    } else {
      showSlackStatus(`Error: ${data.error || "Cannot access channel"}`, "error");
    }
  } catch (err) {
    showSlackStatus(`Network error: ${err.message}`, "error");
  } finally {
    btnTestSlack.disabled = false;
    btnTestSlack.textContent = "Test Slack connection";
  }
}

function showSlackStatus(message, type) {
  if (!slackStatusEl) return;
  slackStatusEl.textContent = message;
  slackStatusEl.className = `field-note slack-status slack-status-${type}`;
  slackStatusEl.hidden = false;
}

// ─── Test AI Connection ────────────────────────────────────────────────────────

async function handleTestAiConnection() {
  if (!btnTestAi || !aiTestStatusEl) return;
  const provider = fAiProvider?.value || "openai";
  btnTestAi.disabled = true;
  btnTestAi.textContent = "Testing…";
  aiTestStatusEl.hidden = true;

  try {
    if (provider === "openai") {
      const resp = await fetch("https://chatgpt.com/api/auth/session", { credentials: "include" });
      if (!resp.ok) {
        showAiTestStatus(`✗ ChatGPT: HTTP ${resp.status}. Open chatgpt.com and sign in.`, "error");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (data?.accessToken) {
        const who = data.user?.email || data.user?.name || "";
        showAiTestStatus(`✓ ChatGPT session active${who ? ` · ${who}` : ""}`, "ok");
      } else {
        showAiTestStatus("✗ Not signed in to ChatGPT. Open chatgpt.com in Chrome and sign in first.", "error");
      }
    } else {
      const resp = await fetch("https://claude.ai/api/organizations", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        showAiTestStatus(`✗ Claude.ai: HTTP ${resp.status}. Open claude.ai and sign in.`, "error");
        return;
      }
      const orgs = await resp.json().catch(() => []);
      if (orgs?.[0]?.uuid) {
        const name = orgs[0].name || "";
        showAiTestStatus(`✓ Claude session active${name ? ` · ${name}` : ""}`, "ok");
      } else {
        showAiTestStatus("✗ Not signed in to Claude. Open claude.ai in Chrome and sign in first.", "error");
      }
    }
  } catch (err) {
    showAiTestStatus(`✗ Connection error: ${err.message}`, "error");
  } finally {
    btnTestAi.disabled = false;
    btnTestAi.textContent = "Test connection";
  }
}

function showAiTestStatus(message, type) {
  if (!aiTestStatusEl) return;
  aiTestStatusEl.textContent = message;
  aiTestStatusEl.className = `field-note ai-test-status ai-test-status-${type}`;
  aiTestStatusEl.hidden = false;
}

function sendMessageSafe(payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) { resolve({}); return; }
        resolve(response || {});
      });
    } catch {
      resolve({});
    }
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  btnGoogleSignIn.addEventListener("click", handleGoogleSignIn);
  btnContinueGuest.addEventListener("click", async () => {
    await showAppShell("Not signed in");
    await loadStatus();
    await loadSettings();
    listenForProgress();
    loadIntelligence().catch(() => {});
    loadTodaysMeetings().catch(() => {});
  });
  btnCreateGoogle.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://accounts.google.com/signup" });
  });
  btnSync.addEventListener("click", handleSyncNow);
  btnStopSync.addEventListener("click", handleStopSync);
  btnOpenSheet.addEventListener("click", handleOpenSheet);
  btnSendTestReport.addEventListener("click", handleSendTestReport);
  btnOpenConfig.addEventListener("click", handleOpenConfig);
  btnSignOut.addEventListener("click", handleSignOut);
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") });
    });
  }
  btnSaveSettings.addEventListener("click", handleSaveSettings);
  btnClearCache.addEventListener("click", handleClearCache);
  btnResetStats.addEventListener("click", handleResetStats);
  fGmailDatePreset.addEventListener("change", syncCustomDateFieldState);

  if (btnRefreshMeetings) {
    btnRefreshMeetings.addEventListener("click", () => loadTodaysMeetings().catch(() => {}));
  }

  if (btnRevokeGoogleAccess) {
    btnRevokeGoogleAccess.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://myaccount.google.com/permissions" });
    });
  }

  if (btnReauthCalendar) {
    btnReauthCalendar.addEventListener("click", async () => {
      btnReauthCalendar.disabled = true;
      btnReauthCalendar.textContent = "Re-authorizing…";
      if (calendarAuthGuide) calendarAuthGuide.hidden = true;
      try {
        // Call forceReauth directly from the popup — it uses launchWebAuthFlow
        // with prompt=consent to guarantee a fresh consent screen with all scopes,
        // including calendar.readonly. Routing through the service worker is avoided
        // because the SW can be killed during the interactive flow.
        const token = await forceReauth();
        const email = await getUserEmail(token);
        if (email) await setUserEmail(email);
        await loadTodaysMeetings();
      } catch (err) {
        if (meetingList) {
          meetingList.innerHTML = `<li class='intel-empty meetings-auth-error'>Re-auth failed: ${escapeHtml(err.message || "unknown error")}</li>`;
        }
        if (calendarAuthGuide) calendarAuthGuide.hidden = false;
      } finally {
        btnReauthCalendar.disabled = false;
        btnReauthCalendar.textContent = "Re-authorize";
      }
    });
  }

  if (btnTestSlack) {
    btnTestSlack.addEventListener("click", handleTestSlack);
  }

  if (btnTestAi) {
    btnTestAi.addEventListener("click", handleTestAiConnection);
  }

  // JMD Assistant
  if (assistantSendBtn) {
    assistantSendBtn.addEventListener("click", () => {
      const q = assistantInput.value.trim();
      if (q) { assistantHandleQuery(q); assistantInput.value = ""; assistantInput.style.height = "auto"; }
    });
  }
  if (assistantInput) {
    assistantInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); assistantSendBtn.click(); }
    });
    assistantInput.addEventListener("input", () => {
      assistantInput.style.height = "auto";
      assistantInput.style.height = Math.min(assistantInput.scrollHeight, 90) + "px";
    });
  }
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => assistantHandleQuery(chip.dataset.q));
  });
  if (assistantClearBtn) {
    assistantClearBtn.addEventListener("click", assistantClearChat);
  }

  if (btnRunChecks) {
    btnRunChecks.addEventListener("click", async () => {
      btnRunChecks.disabled = true;
      btnRunChecks.textContent = "Checking…";
      try {
        await new Promise((resolve) => chrome.runtime.sendMessage({ type: "RUN_REMINDER_CHECKS" }, resolve));
        await loadIntelligence();
      } finally {
        btnRunChecks.disabled = false;
        btnRunChecks.textContent = "Run checks";
      }
    });
  }

  // Inline field validation on blur for faster feedback
  fSpreadsheetId.addEventListener("blur", () => {
    const val = fSpreadsheetId.value.trim();
    fSpreadsheetId.style.borderColor = val ? "" : "var(--error, #d93025)";
  });
  fJiraBaseUrl.addEventListener("blur", () => {
    const val = fJiraBaseUrl.value.trim();
    fJiraBaseUrl.style.borderColor = (!val || isValidHttpUrl(val)) ? "" : "var(--error, #d93025)";
  });
  fReportRecipientEmail.addEventListener("blur", () => {
    const val = fReportRecipientEmail.value.trim();
    fReportRecipientEmail.style.borderColor =
      (!val || isValidEmail(val)) ? "" : "var(--error, #d93025)";
  });
  fMaxTotalEmails.addEventListener("blur", () => {
    const val = parseInt(fMaxTotalEmails.value, 10);
    fMaxTotalEmails.style.borderColor = (val >= 100 && val <= 2000) ? "" : "var(--error, #d93025)";
  });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

async function handleSyncNow() {
  btnSync.classList.remove("sync-click");
  // Restart animation on every click.
  void btnSync.offsetWidth;
  btnSync.classList.add("sync-click");
  popupSyncInProgress = true;
  setUiState("syncing");

  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (response) => {
    popupSyncInProgress = false;
    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }

    if (response?.error) {
      setUiState("error", response.error);
      return;
    }
    if (response?.stopped) {
      setUiState("idle", "Sync stopped.");
      loadStatus();
      return;
    }

    const { added, detected, existing, skipped, total } = response.result;
    if (total === 0) {
      setUiState("idle", "No emails found. Adjust Gmail Query or date filters.");
      lastSyncTicketCountEl.textContent = "0";
      lastSyncTimeEl.textContent = new Date().toLocaleString();
      loadStatus();
      return;
    }
    const summary = `Done! ${detected} detected, ${added} new, ${existing || 0} existing, ${skipped} skipped (${total} emails scanned).`;
    setUiState("success", summary);
    lastSyncTicketCountEl.textContent = String(
      Number.isFinite(detected) ? detected : added
    );
    lastSyncTimeEl.textContent = new Date().toLocaleString();
    loadStatus();
  });
}

function handleStopSync() {
  if (!popupSyncInProgress) return;
  chrome.runtime.sendMessage({ type: "STOP_SYNC" }, (response) => {
    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      setUiState("idle", response?.message || "No sync in progress.");
      return;
    }
    setUiState("idle", "Stopping sync…");
  });
}

function handleSendTestReport() {
  popupSyncInProgress = true;
  setUiState("syncing", "Preparing test report…");

  chrome.runtime.sendMessage({ type: "SEND_TEST_REPORT" }, (response) => {
    popupSyncInProgress = false;

    if (chrome.runtime.lastError) {
      setUiState("error", chrome.runtime.lastError.message);
      return;
    }
    if (response?.error) {
      setUiState("error", response.error);
      return;
    }
    if (response?.stopped) {
      setUiState("idle", "Test report stopped.");
      loadStatus();
      return;
    }

    const recipient = response?.recipientEmail || "recipient";
    const added = Number(response?.added || 0);
    setUiState("success", `Test report sent to ${recipient} (${added} new ticket(s)).`);
    loadStatus();
  });
}

function handleOpenConfig() {
  if (settingsPanel) {
    settingsPanel.open = true;
  }
}

// ─── Sheet Link ───────────────────────────────────────────────────────────────

async function handleOpenSheet() {
  const settings = await getSettings();
  if (!settings.spreadsheetId) {
    alert("Please configure your Spreadsheet ID in Settings first.");
    return;
  }
  const url = `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit`;
  chrome.tabs.create({ url });
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

async function handleSignOut() {
  try {
    await revokeAuthToken();
    await clearUserEmail();
    userEmailEl.textContent = "Not signed in";
    setUiState("idle", "Signed out.");
    showAuthGate();
  } catch (err) {
    setUiState("error", err.message || "Sign out failed.");
  }
}

async function handleGoogleSignIn() {
  const originalLabel = btnGoogleSignIn.textContent;
  btnGoogleSignIn.disabled = true;
  btnGoogleSignIn.textContent = "Signing in…";
  try {
    // Try service-worker auth first so popup lifecycle does not break login flow.
    const authResponse = await sendMessageWithTimeout({ type: "AUTH_SIGN_IN" }, 12000).catch(() => null);

    if (authResponse?.ok && authResponse?.signedIn) {
      await setUserEmail(authResponse.email || "");
      await showAppShell(authResponse.email);
      await loadStatus();
      await loadSettings();
      listenForProgress();
      loadIntelligence().catch(() => {});
      loadTodaysMeetings().catch(() => {});
      return;
    }

    // Fallback: interactive auth directly from popup.
    const token = await getAuthToken(true);
    const email = await getUserEmail(token);
    await setUserEmail(email || "");
    await showAppShell(email);
    await loadStatus();
    await loadSettings();
    listenForProgress();
    loadIntelligence().catch(() => {});
    loadTodaysMeetings().catch(() => {});
  } catch (err) {
    alert(`Sign in failed: ${err.message || "Unable to sign in."}`);
  } finally {
    btnGoogleSignIn.disabled = false;
    btnGoogleSignIn.textContent = originalLabel;
  }
}

async function refreshAuthGate() {
  const storedEmail = await getUserEmailFromStorage();
  if (storedEmail) {
    await showAppShell(storedEmail);
    return true;
  }

  try {
    const token = await getAuthTokenSilent();
    if (!token) {
      showAuthGate();
      return false;
    }
    const email = await getUserEmail(token);
    await setUserEmail(email || "");
    await showAppShell(email);
    return Boolean(email);
  } catch {
    showAuthGate();
    return false;
  }
}

function showAuthGate() {
  authShell.hidden = false;
  appShell.hidden = true;
}

async function showAppShell(email) {
  authShell.hidden = true;
  appShell.hidden = false;
  userEmailEl.textContent = email || "Signed in";
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function handleSaveSettings() {
  const previousSettings = await getSettings();
  const { hour, minute } = parseTimeValue(
    fDailyReportTime.value || formatTimeValue(CONFIG.DAILY_REPORT_HOUR, CONFIG.DAILY_REPORT_MINUTE)
  );
  const settings = {
    spreadsheetId:          fSpreadsheetId.value.trim(),
    sheetName:              fSheetName.value.trim() || "Jira Tickets",
    jiraBaseUrl:            fJiraBaseUrl.value.trim().replace(/\/$/, ""),
    gmailDatePreset:        fGmailDatePreset.value || CONFIG.GMAIL_DATE_PRESET,
    gmailSearchQuery:       "",
    gmailFromDate:          (fGmailDatePreset.value === "custom" ? fGmailFromDate.value : "") || "",
    gmailToDate:            (fGmailDatePreset.value === "custom" ? fGmailToDate.value : "") || "",
    fastModeEnabled:        fFastModeEnabled.checked,
    maxTotalEmails:         Math.max(100, parseInt(fMaxTotalEmails.value, 10) || CONFIG.MAX_TOTAL_EMAILS),
    autoSyncIntervalMinutes: parseInt(fAutoSyncIntvl.value, 10) || 0,
    dailyReportEnabled:     fDailyReportEnabled.checked,
    dailyReportHour:        hour,
    dailyReportMinute:      minute,
    reportRecipientEmail:   fReportRecipientEmail.value.trim(),
    enableAiSummaries:      fEnableAiSummaries.checked,
    aiProvider:             fAiProvider.value || CONFIG.AI_PROVIDER,
    aiSummaryMode:          fAiSummaryMode.value || CONFIG.AI_SUMMARY_MODE,
    consolidatedSheetName:  fConsolidatedSheetName.value.trim() || CONFIG.CONSOLIDATED_SHEET_NAME,

    // Slack
    enableSlackIntegration: fEnableSlackInteg ? fEnableSlackInteg.checked : previousSettings.enableSlackIntegration,
    slackBotToken: fSlackBotToken?.value.trim() || previousSettings.slackBotToken || "",
    slackChannelId: fSlackChannelId?.value.trim() || "",

    // Atlassian
    atlassianDomain: fAtlassianDomain?.value.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || previousSettings.atlassianDomain || "",
    atlassianEmail: fAtlassianEmail?.value.trim() || previousSettings.atlassianEmail || "",
    atlassianToken: fAtlassianToken?.value.trim() || previousSettings.atlassianToken || "",

    // Intelligence
    enableFollowupTracking:   fEnableFollowupTracking   ? fEnableFollowupTracking.checked   : previousSettings.enableFollowupTracking,
    enableCommitmentTracking: fEnableCommitmentTracking ? fEnableCommitmentTracking.checked : previousSettings.enableCommitmentTracking,
    enableSentimentTracking:  fEnableSentimentTracking  ? fEnableSentimentTracking.checked  : previousSettings.enableSentimentTracking,
    enableDecisionLog:        fEnableDecisionLog        ? fEnableDecisionLog.checked        : previousSettings.enableDecisionLog,
    enableCalendarIntegration: fEnableCalendarInteg     ? fEnableCalendarInteg.checked      : previousSettings.enableCalendarIntegration,
    morningBriefEnabled:      fMorningBriefEnabled      ? fMorningBriefEnabled.checked      : previousSettings.morningBriefEnabled,
    ...parseMorningBriefTime(),
    eveningReportEnabled:     fEveningReportEnabled     ? fEveningReportEnabled.checked     : previousSettings.eveningReportEnabled,
    ...parseEveningReportTime(),
  };

  if (settings.enableAiSummaries && !["openai", "anthropic"].includes(settings.aiProvider)) {
    settings.aiProvider = "openai";
  }
  if (settings.dailyReportEnabled && !isValidEmail(settings.reportRecipientEmail)) {
    alert("Enter a valid recipient email for daily reports.");
    return;
  }
  if (settings.gmailDatePreset === "custom" && (!settings.gmailFromDate || !settings.gmailToDate)) {
    alert("For Custom date range, both From Date and To Date are required.");
    return;
  }
  if (
    settings.gmailDatePreset === "custom" &&
    settings.gmailFromDate &&
    settings.gmailToDate &&
    settings.gmailFromDate > settings.gmailToDate
  ) {
    alert("From Date cannot be after To Date.");
    return;
  }

  if (settings.maxTotalEmails > 500) {
    const confirmed = confirm(
      `Warning: scanning ${settings.maxTotalEmails} emails per sync may hit Gmail API quota limits and take a long time. Recommended maximum is 500. Continue anyway?`
    );
    if (!confirmed) return;
  }

  await saveSettings(settings);

  // Restart alarm with new interval
  chrome.runtime.sendMessage({ type: "UPDATE_ALARM" });
  await loadStatus();

  btnSaveSettings.textContent = "Saved ✓";
  setTimeout(() => { btnSaveSettings.textContent = "Save Settings"; }, 2000);
}

async function handleClearCache() {
  if (!confirm("Clear the seen-ticket cache? Next sync will re-scan all emails but won't duplicate rows already in the sheet.")) return;
  await clearSeenTicketIds();
  setUiState("idle", "Cache cleared. Ready to sync.");
}

async function handleResetStats() {
  if (!confirm("Reset last sync time and ticket counters?")) return;
  await clearSyncMetrics();
  await loadStatus();
  setUiState("idle", "Sync stats reset.");
}

// ─── Progress Listener (from service worker broadcasts) ───────────────────────

function listenForProgress() {
  if (isProgressListenerBound) return;
  isProgressListenerBound = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SYNC_PROGRESS") {
      progressLabel.textContent = message.message;
      // Animate the progress bar pseudo-randomly while syncing
      progressFill.style.width = randomProgress() + "%";
    }
  });
}


function randomProgress() {
  const current = parseFloat(progressFill.style.width) || 10;
  const remaining = 90 - current;
  const increment = Math.random() * Math.min(8, remaining * 0.25) + 2;
  return Math.min(current + increment, 90);
}

// ─── UI State Machine ─────────────────────────────────────────────────────────

function setUiState(state, message) {
  // Reset classes
  statusDot.className = "status-indicator";
  document.body.classList.remove("syncing-active");
  btnSync.disabled = false;
  btnSendTestReport.disabled = false;
  btnStopSync.disabled = true;
  progressWrapper.hidden = true;

  switch (state) {
    case "syncing":
      document.body.classList.add("syncing-active");
      statusDot.classList.add("syncing");
      statusText.textContent = "Syncing…";
      btnSync.disabled = true;
      btnSendTestReport.disabled = true;
      btnStopSync.disabled = false;
      progressWrapper.hidden = false;
      progressLabel.textContent = "Starting…";
      progressFill.style.width = "10%";
      break;

    case "success":
      statusDot.classList.add("success");
      statusText.textContent = message || "Sync complete!";
      progressFill.style.width = "100%";
      setTimeout(() => { progressWrapper.hidden = true; }, 1500);
      break;

    case "error":
      statusDot.classList.add("error");
      statusText.textContent = `Error: ${message}`;
      progressWrapper.hidden = true;
      break;

    case "idle":
    default:
      statusText.textContent = message || "Ready to sync";
      break;
  }
}

function parseTimeValue(value) {
  const [h, m] = String(value || "").split(":");
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(m, 10);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : CONFIG.DAILY_REPORT_HOUR,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : CONFIG.DAILY_REPORT_MINUTE,
  };
}

function parseMorningBriefTime() {
  if (!fMorningBriefTime?.value) return {};
  const { hour, minute } = parseTimeValue(fMorningBriefTime.value);
  return { morningBriefHour: hour, morningBriefMinute: minute };
}

function parseEveningReportTime() {
  if (!fEveningReportTime?.value) return {};
  const { hour, minute } = parseTimeValue(fEveningReportTime.value);
  return { eveningReportHour: hour, eveningReportMinute: minute };
}

function formatTimeValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(String(value || ""));
}

function getNextReportRunDisplay(settings) {
  if (!settings.dailyReportEnabled) return "Disabled";
  const hour = settings.dailyReportHour ?? CONFIG.DAILY_REPORT_HOUR;
  const minute = settings.dailyReportMinute ?? CONFIG.DAILY_REPORT_MINUTE;
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString();
}

function renderSetupChecklist(settings, userEmail) {
  const checks = {
    auth: Boolean(String(userEmail || "").trim()),
    sheet: Boolean(String(settings.spreadsheetId || "").trim()),
    jira: isValidHttpUrl(settings.jiraBaseUrl),
    report: !settings.dailyReportEnabled || isValidEmail(settings.reportRecipientEmail),
    ai: true,
  };

  setSetupItemState(
    setupAuthItem,
    checks.auth,
    setupAuthText,
    checks.auth ? `Google connected (${userEmail})` : "Google account not connected"
  );
  setSetupItemState(
    setupSheetItem,
    checks.sheet,
    setupSheetText,
    checks.sheet ? "Spreadsheet ID configured" : "Add Spreadsheet ID in Configuration"
  );
  setSetupItemState(
    setupJiraItem,
    checks.jira,
    setupJiraText,
    checks.jira ? "Jira base URL configured" : "Add valid Jira base URL (https://...)"
  );
  setSetupItemState(
    setupReportItem,
    checks.report,
    setupReportText,
    settings.dailyReportEnabled
      ? (checks.report ? "Daily report email configured" : "Daily report enabled but recipient email missing")
      : "Daily report is optional and currently disabled"
  );
  setSetupItemState(
    setupAiItem,
    checks.ai,
    setupAiText,
    settings.enableAiSummaries
      ? `AI enabled — using ${settings.aiProvider === "anthropic" ? "claude.ai" : "chatgpt.com"} session`
      : "AI summaries disabled — enable in Configuration"
  );

  const done = Object.values(checks).filter(Boolean).length;
  setupProgressEl.textContent = `${done}/5 complete`;
}

function setSetupItemState(element, isComplete, textElement, text) {
  if (!element || !textElement) return;
  element.classList.remove("complete", "pending");
  element.classList.add(isComplete ? "complete" : "pending");
  textElement.textContent = text;
}

function isValidHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function syncCustomDateFieldState() {
  const isCustom = fGmailDatePreset.value === "custom";
  fGmailFromDate.disabled = !isCustom;
  fGmailToDate.disabled = !isCustom;
}

function sendMessageWithTimeout(payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out.")), timeoutMs);
    chrome.runtime.sendMessage(payload, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ─── JMD Platform Assistant ───────────────────────────────────────────────────

const _jmdEngine = new JMDEngine(JMD_KNOWLEDGE);
const _vc = { "1.9.5": "#e8f0fe|#1967d2", "2.0.0": "#e6f4ea|#137333", "2.1.0": "#fce8b2|#b06000" };
const _escH = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const _cap = s => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const _av = n => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

// In-memory conversation history (last N turns kept for context)
const _chatHistory = [];
const MAX_HISTORY_TURNS = 4;

const JIRA_URL_RE_A = /https?:\/\/([\w-]+\.atlassian\.net)\/browse\/([A-Z][A-Z0-9]{1,9}-\d+)/i;
const JIRA_ID_RE_A  = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/;

function _extractJiraInfo(query) {
  const urlMatch = query.match(JIRA_URL_RE_A);
  if (urlMatch) return { ticketId: urlMatch[2].toUpperCase(), domainFromUrl: urlMatch[1] };
  const idMatch = query.match(JIRA_ID_RE_A);
  if (idMatch) return { ticketId: idMatch[1].toUpperCase(), domainFromUrl: null };
  return null;
}

function _adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak" || node.type === "paragraph") return (node.content ? node.content.map(_adfToText).join("") : "") + "\n";
  if (node.type === "listItem") return "• " + (node.content ? node.content.map(_adfToText).join("") : "").trim() + "\n";
  if (Array.isArray(node.content)) return node.content.map(_adfToText).join("");
  if (node.content) return _adfToText(node.content);
  return "";
}

async function _fetchJiraTicket(ticketId, creds) {
  const auth = btoa(creds.email + ":" + creds.token);
  const r = await fetch("https://" + creds.domain + "/rest/api/3/issue/" + ticketId, {
    headers: { "Authorization": "Basic " + auth, "Accept": "application/json" }
  });
  if (!r.ok) return null;
  return r.json();
}

// ── Card renderers ────────────────────────────────────────────────────────────

function _card(hdr, body, accent) {
  const bl = accent ? `border-left:3px solid ${accent}` : "";
  return `<div style="background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;margin-top:4px;font-size:12px;${bl}">
    <div style="padding:8px 12px;background:#f8f8f8;border-bottom:1px solid #efefef;font-weight:600;font-size:12px">${hdr}</div>
    <div style="padding:10px 12px">${body}</div></div>`;
}

function _vBadge(v) {
  const [bg, fg] = (_vc[v] || "#f1f3f4|#444").split("|");
  const lbl = (JMD_KNOWLEDGE.versions[v] || {}).label || v;
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">${lbl}</span>`;
}

function _driCard(d) {
  const codes = d.codenames.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${d.codenames.map(c => `<span style="padding:2px 7px;background:#eef2ff;color:#4f46e5;border-radius:4px;font-size:11px;font-weight:500">${c}</span>`).join("")}</div>`
    : "";
  const row = (bg, fg, name, lbl) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f5">
      <span style="font-size:11px;color:#888;width:52px;flex-shrink:0">${lbl}</span>
      <div style="width:24px;height:24px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0">${_av(name)}</div>
      <span style="font-weight:500;font-size:12px">${name}</span></div>`;
  return _card(`🛠 ${d.service}`, codes + row("#dbeafe","#1d4ed8",d.primary,"Primary") + row("#fce7f3","#9d174d",d.backup,"Backup"));
}

function _faqCard(i) {
  return _card("💡 Quick Answer", `<div style="font-size:12px;line-height:1.6;color:#333">${_escH(i.a)}</div>`);
}

function _vfCard(vf) {
  const rows = vf.matched.map(m => m.items.map(i =>
    `<div style="padding:3px 0 3px 12px;position:relative;font-size:12px;color:#333;border-bottom:1px solid #f5f5f5;line-height:1.5"><span style="position:absolute;left:0;color:#4f46e5">•</span>${_escH(i)}</div>`
  ).join("")).join("");
  return _card(`🚀 ${_vBadge(vf.version)} — ${_cap(vf.matched[0].mod)}`, rows);
}

function _apiCard(api) {
  const typeLabel = api.apiType === "platformApi" ? "Platform REST API" : "Storefront REST API";
  const authColor = api.apiType === "platformApi" ? "#dbeafe" : "#fce7f3";
  const authTextColor = api.apiType === "platformApi" ? "#1d4ed8" : "#9d174d";
  let body = `<div style="margin-bottom:8px;font-size:11px;color:#555">${_escH(api.label)}</div>`;
  body += `<div style="margin-bottom:8px"><span style="background:${authColor};color:${authTextColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500">🔑 ${_escH(api.authMethod)}</span></div>`;
  if (api.modules.length) {
    api.modules.forEach(m => {
      body += `<div style="margin-bottom:6px;padding:6px 8px;background:#f8f9fa;border-radius:4px;border-left:3px solid ${authTextColor}">`;
      body += `<div style="font-weight:600;font-size:12px;margin-bottom:3px;color:#333">${_cap(m.name)}</div>`;
      if (m.description) body += `<div style="font-size:11px;color:#666;margin-bottom:4px">${_escH(m.description)}</div>`;
      const eps = Array.isArray(m.endpoints) ? m.endpoints.slice(0, 4) : [];
      if (eps.length) body += eps.map(e => `<div style="font-size:11px;color:#444;padding:1px 0 1px 8px;position:relative"><span style="position:absolute;left:0;color:#888">›</span>${_escH(e)}</div>`).join("");
      body += `</div>`;
    });
  }
  return _card(`🌐 ${typeLabel}`, body);
}

function _compareCard(results) {
  if (!results.length) return _card("🔀 Version Comparison", '<div style="color:#888;font-size:12px">Feature not found across tracked versions.</div>', "#4f46e5");
  const rows = results.map(r => {
    const hits = r.hits.map(h =>
      `<div style="padding:3px 0 3px 12px;position:relative;font-size:12px;color:#333;border-bottom:1px solid #f5f5f5;line-height:1.4"><span style="position:absolute;left:0;color:#4f46e5">•</span>${_escH(h.item)}</div>`
    ).join("");
    return `<div style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${_vBadge(r.version)}<span style="font-size:11px;color:#888">${r.released}</span></div>${hits}</div>`;
  }).join("");
  return _card("🔀 Version Comparison", rows, "#4f46e5");
}

function _jiraCard(a) {
  const { ticketId, detectedService, detectedDri, versionGaps, problems, codeHints } = a;
  let h = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f0f0f0">`;
  if (ticketId) h += `<span style="background:#eef2ff;color:#4f46e5;padding:3px 10px;border-radius:4px;font-weight:600;font-size:12px">${ticketId}</span>`;
  if (detectedService) h += `<span style="font-size:12px;font-weight:500">→ ${detectedService}</span>`;
  h += "</div>";
  if (detectedDri) {
    const dm = JMD_KNOWLEDGE.dri.find(d => d.primary === detectedDri);
    h += `<div style="margin-bottom:10px;padding:8px;background:#f8f9ff;border-radius:6px;border:1px solid #e8e8ff">
      <div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px">ESCALATE TO</div>
      <div style="display:flex;gap:16px">
        <div><div style="font-size:10px;color:#888">Primary</div><strong style="font-size:12px;color:#1d4ed8">${dm ? dm.primary : detectedDri}</strong></div>
        ${dm ? `<div><div style="font-size:10px;color:#888">Backup</div><strong style="font-size:12px;color:#9d174d">${dm.backup}</strong></div>` : ""}
      </div></div>`;
  }
  if (problems.length) {
    const typeColors = { bug: "#fde8e8|#b71c1c", code_error: "#fde8e8|#b71c1c", perf: "#fef3c7|#92400e", auth: "#f3e8ff|#6b21a8" };
    h += `<div style="margin-bottom:10px"><div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;text-transform:uppercase">Problem Types Detected</div>`;
    problems.forEach(p => {
      const [bg, fg] = (typeColors[p.type] || "#e8f5e9|#1b5e20").split("|");
      h += `<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid #f5f5f5">
        <span style="background:${bg};color:${fg};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap">${p.type.replace("_"," ").toUpperCase()}</span>
        <span style="font-size:12px;color:#333">${p.label}</span></div>`;
    });
    h += "</div>";
  }
  if (versionGaps.length) {
    h += `<div style="margin-bottom:10px"><div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;text-transform:uppercase">Version Gap Alert</div>
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px">
        <div style="font-size:11px;color:#92400e;margin-bottom:4px">⚠ Not available in current JMD v1.9.5</div>`;
    versionGaps.forEach(g => {
      h += `<div style="padding:3px 0;font-size:12px;color:#333;border-bottom:1px solid #fef3c7"><strong>${g.feature}</strong> → Available in ${_vBadge(g.availableIn)}</div>`;
    });
    h += "</div></div>";
  }
  if (codeHints.length) {
    h += `<div><div style="font-size:11px;color:#666;font-weight:600;margin-bottom:4px;text-transform:uppercase">Investigation Hints</div>`;
    codeHints.forEach(c => {
      h += `<div style="padding:3px 0 3px 12px;position:relative;font-size:12px;color:#333;border-bottom:1px solid #f5f5f5;line-height:1.5"><span style="position:absolute;left:0;color:#4f46e5">→</span>${c}</div>`;
    });
    h += "</div>";
  }
  if (!problems.length && !versionGaps.length && !codeHints.length && !detectedService)
    h += '<div style="font-size:12px;color:#888">Paste the full Jira ticket with title, steps, and error messages for a deeper analysis.</div>';
  return _card("🎫 Jira Analysis", h, "#f59e0b");
}

function _jiraApiCard(issue) {
  const f = issue.fields || {};
  const statusColors = { "To Do": "#e8f0fe|#1967d2", "In Progress": "#fef3c7|#92400e", "Done": "#e6f4ea|#137333", "In Review": "#f3e8ff|#6b21a8" };
  const statusName = (f.status || {}).name || "";
  const [sBg, sFg] = (statusColors[statusName] || "#f1f3f4|#555").split("|");
  let h = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
    <span style="background:#eef2ff;color:#4f46e5;padding:3px 10px;border-radius:4px;font-weight:700;font-size:12px">${issue.key}</span>
    <span style="background:${sBg};color:${sFg};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${statusName}</span>`;
  if ((f.priority || {}).name) h += `<span style="font-size:11px;color:#666">⚡ ${f.priority.name}</span>`;
  if ((f.issuetype || {}).name) h += `<span style="font-size:11px;color:#888">· ${f.issuetype.name}</span>`;
  h += "</div>";
  if (f.summary) h += `<div style="font-weight:600;font-size:13px;color:#111;margin-bottom:8px;line-height:1.4">${_escH(f.summary)}</div>`;
  h += `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f0f0f0">`;
  if (f.assignee) h += `<div><div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase">Assignee</div><div style="font-size:12px;font-weight:500">${_escH(f.assignee.displayName)}</div></div>`;
  if (f.reporter) h += `<div><div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase">Reporter</div><div style="font-size:12px;font-weight:500">${_escH(f.reporter.displayName)}</div></div>`;
  const comps = (f.components || []).map(c => c.name).join(", ");
  if (comps) h += `<div><div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase">Component</div><div style="font-size:12px;font-weight:500">${_escH(comps)}</div></div>`;
  h += "</div>";
  const fullDesc = _adfToText(f.description).trim();
  if (fullDesc) {
    h += `<div style="margin-bottom:10px"><div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:4px">Description</div>
      <div style="font-size:12px;color:#333;line-height:1.6;white-space:pre-wrap;background:#fafafa;border-radius:6px;padding:8px;border:1px solid #f0f0f0">${_escH(fullDesc.slice(0, 500))}${fullDesc.length > 500 ? "…" : ""}</div></div>`;
  }
  const comments = (((f.comment || {}).comments) || []).slice(-3);
  if (comments.length) {
    h += `<div><div style="font-size:10px;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px">Comments (${f.comment.total || comments.length})</div>`;
    comments.forEach(c => {
      const body = _adfToText(c.body).trim();
      h += `<div style="padding:7px 9px;background:#f8f9ff;border-radius:6px;margin-bottom:6px;border-left:2px solid #4f46e5">
        <div style="font-size:10px;color:#555;font-weight:600;margin-bottom:3px">${_escH((c.author || {}).displayName || "")}</div>
        <div style="font-size:11px;color:#333;line-height:1.55;white-space:pre-wrap">${_escH(body.slice(0, 300))}${body.length > 300 ? "…" : ""}</div></div>`;
    });
    h += "</div>";
  }
  return _card(`🎫 ${issue.key} — Live from Jira`, h, "#4f46e5");
}

function _noCredsCard(ticketId) {
  const msg = `To fetch live ticket data, add your Atlassian credentials in <strong>Configuration</strong>:<br><br>` +
    `1. <strong>Domain</strong> — e.g. <code>yourcompany.atlassian.net</code><br>` +
    `2. <strong>Email</strong> — your Atlassian login email<br>` +
    `3. <strong>API Token</strong> — from <code>id.atlassian.com → Security → API tokens</code>`;
  const h = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span style="background:#eef2ff;color:#4f46e5;padding:3px 10px;border-radius:4px;font-weight:700;font-size:12px">${ticketId}</span>
    <span style="font-size:11px;color:#888">detected</span></div>
    <div style="font-size:12px;color:#444;line-height:1.7">${msg}</div>`;
  return _card("🎫 Jira Ticket Detected", h, "#f59e0b");
}

function _allServicesCard() {
  const rows = JMD_KNOWLEDGE.dri.map(d =>
    `<div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid #f5f5f5;gap:8px">
      <span style="flex:1;font-weight:500;font-size:12px">${d.service}</span>
      <span style="font-size:11px;color:#4f46e5">${d.primary}</span></div>`
  ).join("");
  return _card("📋 All JMD Services & DRI", `<div style="margin:-10px -12px">${rows}</div>`);
}

function _versionSummaryCard() {
  const rows = Object.entries(JMD_KNOWLEDGE.versions).map(([v, d]) =>
    `<div style="padding:8px 0;border-bottom:1px solid #f5f5f5">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${_vBadge(v)}
        <span style="font-size:11px;color:#888">${d.released}</span>
        ${d.status === "current" ? '<span style="background:#dcfce7;color:#166534;font-size:10px;padding:2px 6px;border-radius:20px">Current</span>' : ""}
      </div><div style="font-size:11px;color:#555">${d.highlights.slice(0, 3).join(" · ")}</div></div>`
  ).join("");
  return _card("📦 Platform Versions", rows, "#4f46e5");
}

// ── Markdown → safe HTML ──────────────────────────────────────────────────────

function _mdToHtml(text) {
  // Escape base HTML first, then apply markdown transforms
  return _escH(text)
    // Code blocks (must come before inline code)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre style="background:#f4f4f4;border-radius:6px;padding:8px 10px;font-size:11px;font-family:monospace;overflow-x:auto;white-space:pre-wrap;color:#1a1a1a;border:1px solid #e0e0e0;margin:4px 0">${code.trim()}</pre>`
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;border-radius:3px;padding:1px 5px;font-family:monospace;font-size:11px;color:#1a1a1a">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // ### heading
    .replace(/^### (.+)$/gm, '<div style="font-weight:700;font-size:12px;color:#111;margin:6px 0 2px">$1</div>')
    // ## heading
    .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:13px;color:#111;margin:7px 0 2px">$1</div>')
    // Unordered list items
    .replace(/^[-•] (.+)$/gm, '<div style="padding:2px 0 2px 14px;position:relative"><span style="position:absolute;left:0;color:#4f46e5">•</span>$1</div>')
    // Numbered list items
    .replace(/^\d+\. (.+)$/gm, '<div style="padding:2px 0 2px 18px;position:relative"><span style="position:absolute;left:0;color:#4f46e5;font-weight:600;font-size:11px">·</span>$1</div>')
    // Double newline → paragraph break
    .replace(/\n\n+/g, '<br><br>')
    // Single newline
    .replace(/\n/g, '<br>');
}

// ── Message rendering helpers ─────────────────────────────────────────────────

function _assistantAppendMsg(role, htmlContent) {
  if (!assistantMessages) return;
  const w = document.createElement("div");
  w.className = `assistant-msg ${role}`;
  const b = document.createElement("div");
  b.className = role === "user" ? "assistant-bubble" : "assistant-bubble assistant-bubble-ai";
  if (role === "user") {
    b.textContent = htmlContent; // safe — user text
  } else {
    b.innerHTML = htmlContent;   // trusted — our own HTML
  }
  w.appendChild(b);
  assistantMessages.appendChild(w);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
  return b;
}

function _assistantAppendCards(htmlCards) {
  if (!assistantMessages || !htmlCards) return;
  const w = document.createElement("div");
  w.className = "assistant-msg assistant";
  const c = document.createElement("div");
  c.className = "assistant-cards";
  c.innerHTML = htmlCards;
  w.appendChild(c);
  assistantMessages.appendChild(w);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

/** Create a streaming bubble — returns the element to update in-place. */
function _assistantCreateStreamBubble(providerLabel) {
  if (!assistantMessages) return null;
  const w = document.createElement("div");
  w.className = "assistant-msg assistant";
  w.id = "assistantStreaming";
  const b = document.createElement("div");
  b.className = "assistant-bubble assistant-bubble-ai";
  b.innerHTML = `<span class="assistant-provider-badge">${_escH(providerLabel)}</span><div class="assistant-stream-text"></div>`;
  w.appendChild(b);
  assistantMessages.appendChild(w);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
  return b.querySelector(".assistant-stream-text");
}

function _assistantRemoveStreamBubble() {
  const e = document.getElementById("assistantStreaming");
  if (e) e.remove();
}

function _assistantShowTyping() {
  if (!assistantMessages) return;
  const w = document.createElement("div");
  w.className = "assistant-msg assistant";
  w.id = "assistantTyping";
  w.innerHTML = '<div class="assistant-bubble"><div class="assistant-typing"><span></span><span></span><span></span></div></div>';
  assistantMessages.appendChild(w);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function _assistantRemoveTyping() {
  const e = document.getElementById("assistantTyping");
  if (e) e.remove();
}

function _renderLocalAssistant(query) {
  const res = _jmdEngine.buildResponse(query);
  if (res.type === "greeting") {
    _assistantAppendMsg("assistant", "Hi! I'm the JMD Platform Assistant. Ask about DRI contacts, version features, comparisons, or paste a Jira ticket.");
    return;
  }
  if (res.type === "version_info") { _assistantAppendCards(_versionSummaryCard()); return; }
  if (res.type === "list_all") { _assistantAppendCards(_allServicesCard()); return; }
  if (res.type === "none") {
    _assistantAppendMsg("assistant", 'Nothing found in the knowledge base. Try a service name, codename, or paste a Jira ticket. Type <strong>List all services</strong> to browse DRIs.');
    return;
  }
  if (res.type === "jira") { _assistantAppendCards(_jiraCard(res.analysis)); return; }
  if (res.type === "compare") { _assistantAppendCards(_compareCard(res.results)); return; }
  if (res.type === "result") {
    if (res.answer) _assistantAppendMsg("assistant", res.answer);
    let cards = "";
    res.sections.forEach(s => {
      if (s.type === "faq") s.items.forEach(i => { cards += _faqCard(i); });
      if (s.type === "dri") s.items.forEach(i => { cards += _driCard(i); });
      if (s.type === "vf")  s.items.forEach(i => { cards += _vfCard(i); });
      if (s.type === "api") s.items.forEach(i => { cards += _apiCard(i); });
    });
    if (cards) _assistantAppendCards(cards);
  }
}

// ── Build system prompt with KB context + conversation history ────────────────

function _buildAssistantPrompt(userQuery, extraContext) {
  const driList = JMD_KNOWLEDGE.dri.map(d =>
    `${d.service}: Primary=${d.primary}, Backup=${d.backup}${d.codenames.length ? ` | Codenames: ${d.codenames.join("/")}` : ""}`
  ).join("\n");
  const verList = Object.entries(JMD_KNOWLEDGE.versions).map(([, d]) =>
    `${d.label} (${d.released}, ${d.status}): ${d.highlights.join(" · ")}`
  ).join("\n");
  const faqList = JMD_KNOWLEDGE.faq.map(f => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");

  // Megatron technical context
  const mg = JMD_KNOWLEDGE.megatron;
  const megatronContext = mg ? [
    `Service: ${mg.codename} — ${mg.overview}`,
    `Stack: ${mg.stack}`,
    "Key config flags: " + Object.entries(mg.configFlags).map(([k, v]) => `${k}: ${v}`).join(" | "),
    "Clusters: " + Object.entries(mg.clusters).map(([k, v]) => `${k}=${v}`).join(" | "),
    "CartArticleWrapper flags: " + Object.entries(mg.models.CartArticleWrapper.keyFlags).map(([k, v]) => `${k}: ${v}`).join(" | "),
    "Business rules — " + Object.entries(mg.businessRules).map(([g, r]) => `${g}: ${r.join("; ")}`).join("\n"),
  ].join("\n") : "";

  // Avis OMS technical context
  const av = JMD_KNOWLEDGE.avis;
  const avisContext = av ? [
    `Service: ${av.codenames.join("/")} — ${av.overview}`,
    `Stack: ${av.stack}`,
    "Forward bag states: " + Object.entries(av.bagStates.forward).map(([k, v]) => `${k}(${v})`).join(" → "),
    "Return states: " + Object.keys(av.bagStates.returnFlow).join(", "),
    "Refund states: " + Object.keys(av.bagStates.refund).join(", "),
    "Business rules: " + Object.entries(av.businessRules).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`).join(" | "),
    "Order types: " + Object.entries(av.orderTypes).map(([k, v]) => `${k}=${v}`).join(", "),
    "Cancellable states (customer+fynd): " + av.cancellableStates.customer_and_fynd.join(", "),
    "Services: " + Object.entries(av.services).map(([k, v]) => `${k}: ${v}`).join(" | "),
  ].join("\n") : "";

  const historyBlock = _chatHistory.slice(-MAX_HISTORY_TURNS).map(h =>
    `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`
  ).join("\n");

  return [
    "You are JMD Platform Assistant — an expert on the JMD/Fynd Commerce platform embedded in a Chrome extension.",
    "",
    "== Platform Versions ==",
    verList,
    "",
    "== DRI Contacts ==",
    driList,
    "",
    "== Megatron (Universal Cart) Technical Reference ==",
    megatronContext,
    "",
    "== Avis (OMS) Technical Reference ==",
    avisContext,
    "",
    "== Platform FAQ ==",
    faqList,
    "",
    "Guidelines:",
    "- Always mention the DRI (name + service) when discussing any service issue",
    "- For feature questions: answer yes/no clearly, state which version introduced it",
    "- For Jira tickets: identify service owner, problem type, version gaps, and concrete investigation steps",
    "- For technical field/flag questions in Megatron (Cart): use the Megatron Technical Reference",
    "- For OMS/order/shipment/bag state questions: use the Avis OMS Technical Reference",
    "- Be concise (under 300 words unless asked for detail)",
    "- Use **bold** for names/versions/ticket IDs, bullet points (-) for lists",
    "- If a feature isn't in the knowledge base, say so clearly and point to the relevant DRI",
    ...(extraContext ? ["", "== Additional Context ==", extraContext] : []),
    ...(historyBlock ? ["", "== Recent Conversation ==", historyBlock] : []),
    "",
    "---",
    "",
    `User: ${userQuery}`,
  ].join("\n");
}

// ── Jira ticket → plain text for AI context ───────────────────────────────────

function _issueToContext(issue) {
  const f = issue.fields || {};
  const lines = [
    `TICKET: ${issue.key}`,
    `SUMMARY: ${f.summary || ""}`,
    `STATUS: ${(f.status || {}).name || ""}`,
    `PRIORITY: ${(f.priority || {}).name || ""}`,
    `TYPE: ${(f.issuetype || {}).name || ""}`,
    `ASSIGNEE: ${(f.assignee || {}).displayName || "Unassigned"}`,
    `REPORTER: ${(f.reporter || {}).displayName || ""}`,
    `COMPONENTS: ${(f.components || []).map(c => c.name).join(", ")}`,
    "",
    "DESCRIPTION:",
    _adfToText(f.description).trim().slice(0, 1200),
  ];
  const comments = ((f.comment || {}).comments || []).slice(-3);
  if (comments.length) {
    lines.push("", "RECENT COMMENTS:");
    comments.forEach(c => {
      lines.push(`  [${(c.author || {}).displayName || ""}]: ${_adfToText(c.body).trim().slice(0, 350)}`);
    });
  }
  return lines.join("\n");
}

// ── Main query handler ────────────────────────────────────────────────────────

async function assistantHandleQuery(query) {
  if (!query.trim() || !assistantMessages) return;
  _assistantAppendMsg("user", query);
  if (assistantSendBtn) assistantSendBtn.disabled = true;

  try {
    const settings = await getSettings();
    const provider  = settings.aiProvider === "anthropic" ? "anthropic" : "openai";
    const aiEnabled = Boolean(settings.enableAiSummaries);
    const providerLabel = provider === "anthropic" ? "Claude" : "ChatGPT";
    const jiraInfo  = _extractJiraInfo(query);

    // ── Path 1: Jira ticket detected ─────────────────────────────────────────
    if (jiraInfo) {
      const { ticketId, domainFromUrl } = jiraInfo;
      const domain = domainFromUrl || settings.atlassianDomain || "";
      const email  = settings.atlassianEmail || "";
      const token  = settings.atlassianToken || "";

      _assistantShowTyping();

      if (domain && email && token) {
        let issue = null;
        try {
          issue = await _fetchJiraTicket(ticketId, { domain, email, token });
        } catch (e) {
          _assistantRemoveTyping();
          _assistantAppendMsg("assistant", `<strong>Jira fetch failed</strong> for ${ticketId}: ${_escH(e.message || "unknown error")}.<br>Check your Atlassian credentials in Configuration.`);
          return;
        }

        if (issue) {
          _assistantRemoveTyping();
          _assistantAppendCards(_jiraApiCard(issue));

          // Local engine analysis on ticket
          const analysis = _jmdEngine.analyzeJira(`${ticketId} ${(issue.fields || {}).summary || ""}`);
          if (analysis.detectedService || analysis.problems.length || analysis.versionGaps.length || analysis.codeHints.length) {
            _assistantAppendCards(_jiraCard(analysis));
          }

          // AI deep analysis if enabled
          if (aiEnabled) {
            const ticketContext = _issueToContext(issue);
            const aiPrompt = _buildAssistantPrompt(
              `Analyze this Jira ticket and provide: (1) root cause hypothesis, (2) who to escalate to and why, (3) concrete investigation steps, (4) any version gaps if relevant.`,
              ticketContext
            );
            const streamEl = _assistantCreateStreamBubble(providerLabel);
            try {
              const reply = await callSessionProvider(aiPrompt, provider, (chunk) => {
                if (streamEl) { streamEl.innerHTML = _mdToHtml(chunk); assistantMessages.scrollTop = assistantMessages.scrollHeight; }
              });
              if (streamEl) streamEl.innerHTML = _mdToHtml(reply);
              _chatHistory.push({ role: "user", content: `Analyze Jira ticket ${ticketId}` });
              _chatHistory.push({ role: "assistant", content: reply.slice(0, 800) });
            } catch (e) {
              _assistantRemoveStreamBubble();
              _assistantAppendMsg("assistant", `<span style="color:#b71c1c;font-size:11px">⚠ AI analysis unavailable: ${_escH(e.message)}. Sign in to ${providerLabel === "Claude" ? "claude.ai" : "chatgpt.com"} first.</span>`);
            }
          }
          return;
        }
      }

      // No credentials — show guidance + local analysis
      _assistantRemoveTyping();
      _assistantAppendCards(_noCredsCard(ticketId));
      const analysis = _jmdEngine.analyzeJira(ticketId);
      if (analysis.problems.length || analysis.versionGaps.length || analysis.codeHints.length) {
        _assistantAppendCards(_jiraCard(analysis));
      }
      return;
    }

    // ── Path 2: Local engine handles it ──────────────────────────────────────
    const localRes = _jmdEngine.buildResponse(query);
    const needsAi  = localRes.type === "none" || localRes.lowConfidence;

    if (localRes.type !== "none") {
      // Show KB context first — label it clearly when AI will also answer
      if (localRes.lowConfidence && aiEnabled) {
        _assistantAppendMsg("assistant", '<span style="font-size:11px;color:#888;font-style:italic">📚 Knowledge base context (partial match) — AI answer below:</span>');
      }
      _renderLocalAssistant(query);
      _chatHistory.push({ role: "user", content: query });
      if (!needsAi) return;
    }

    // ── Path 3: AI answer (streaming) — fires when KB has no result OR low confidence ──
    if (!aiEnabled) {
      if (localRes.type === "none") {
        _assistantAppendMsg("assistant", 'Nothing found in the knowledge base. Enable <strong>AI summaries</strong> in Configuration and sign in to <strong>Claude</strong> or <strong>ChatGPT</strong> for deeper answers.');
      }
      return;
    }

    _assistantShowTyping();
    const prompt = _buildAssistantPrompt(query);
    _assistantRemoveTyping();
    const streamEl = _assistantCreateStreamBubble(providerLabel);

    try {
      const reply = await callSessionProvider(prompt, provider, (chunk) => {
        if (streamEl) { streamEl.innerHTML = _mdToHtml(chunk); assistantMessages.scrollTop = assistantMessages.scrollHeight; }
      });
      const finalText = reply || "No response.";
      if (streamEl) streamEl.innerHTML = _mdToHtml(finalText);
      _chatHistory.push({ role: "user", content: query });
      _chatHistory.push({ role: "assistant", content: finalText.slice(0, 800) });
    } catch (err) {
      _assistantRemoveStreamBubble();
      const hint = provider === "anthropic"
        ? "Sign in to <strong>claude.ai</strong> in Chrome first, then retry."
        : "Sign in to <strong>chatgpt.com</strong> in Chrome first, then retry.";
      _assistantAppendMsg("assistant", `<span style="color:#b71c1c">⚠ ${_escH(err.message)}</span><br><span style="font-size:11px;color:#555">${hint}</span>`);
    }

  } finally {
    if (assistantSendBtn) assistantSendBtn.disabled = false;
  }
}

function assistantClearChat() {
  if (!assistantMessages) return;
  assistantMessages.innerHTML = "";
  _chatHistory.length = 0;
  _assistantAppendMsg("assistant", "Chat cleared. Ask me about DRI contacts, version features, or paste a Jira ticket.");
}

function _updateAssistantProviderBadge(settings) {
  if (!assistantProviderBadge || !assistantAiNote) return;
  if (settings.enableAiSummaries) {
    const name = settings.aiProvider === "anthropic" ? "Claude" : "ChatGPT";
    assistantProviderBadge.textContent = `AI: ${name}`;
    assistantProviderBadge.hidden = false;
    if (assistantAiNote) assistantAiNote.textContent = `Local KB + ${name} session for open questions`;
  } else {
    assistantProviderBadge.hidden = true;
    if (assistantAiNote) assistantAiNote.textContent = "Local KB only · Enable AI summaries in Configuration for deeper answers";
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init().catch(console.error);
