/**
 * dashboard.js — Full-page Dashboard for Jira Gmail Tracker
 * Reads chrome.storage, mirrors popup intelligence, and hosts the JMD Assistant.
 */

import { JMDEngine } from '../assistant/engine.js';
import { JMD_KNOWLEDGE } from '../assistant/knowledge.js';
import { callSessionProvider } from '../ai/sessionClient.js';

// ─── State ──────────────────────────────────────────────────────────────────

let _settings = {};
let _chatHistory = [];
let _activeSection = 'overview';
const _engine = new JMDEngine(JMD_KNOWLEDGE);

// ─── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await _loadSettings();
  _setupNav();
  _populateOverview();
  _populateIntelligence();
  _setupAssistant();
  _setupSettings();
  _setupActions();
});

// ─── Storage ─────────────────────────────────────────────────────────────────

async function _loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => {
      _settings = data || {};
      resolve();
    });
  });
}

async function _saveSettings(updates) {
  return new Promise(resolve => {
    chrome.storage.local.set(updates, resolve);
  });
}

// ─── Navigation ──────────────────────────────────────────────────────────────

const SECTION_META = {
  overview:     { title: 'Overview',     sub: 'Your engineering manager intelligence hub' },
  tickets:      { title: 'Tickets',      sub: 'Synced Jira ticket data' },
  intelligence: { title: 'Intelligence', sub: 'Alerts, follow-ups, and commitments' },
  assistant:    { title: 'JMD Assistant',sub: 'Platform knowledge, DRI lookup, Jira analysis' },
  settings:     { title: 'Settings',     sub: 'Configure sync, AI, reports, and integrations' },
};

function _setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const sec = el.dataset.section;
      _switchSection(sec);
    });
  });
}

function _switchSection(sec) {
  _activeSection = sec;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === sec);
  });

  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('hidden', el.id !== `section-${sec}`);
  });

  const meta = SECTION_META[sec] || {};
  document.getElementById('sectionTitle').textContent = meta.title || sec;
  document.getElementById('sectionSub').textContent   = meta.sub   || '';
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function _populateOverview() {
  // User info
  const email = _settings.userEmail || '';
  document.getElementById('sidebarUserName').textContent = email || 'Not signed in';
  const initial = email ? email[0].toUpperCase() : '?';
  document.getElementById('userAvatarInitial').textContent = initial;

  // KPIs
  document.getElementById('kpiLastCount').textContent =
    _settings.lastSyncTicketCount != null ? String(_settings.lastSyncTicketCount) : '—';
  document.getElementById('kpiLastSync').textContent  = _fmtTime(_settings.lastSyncTime);
  document.getElementById('kpiNextReport').textContent = _settings.nextReportRun || '—';

  // Setup checklist
  _refreshSetup();

  // Topbar / sidebar status
  _setStatus('ready', 'Ready');
}

function _refreshSetup() {
  const checks = {
    ovAuthItem:   !!_settings.userEmail,
    ovSheetItem:  !!_settings.spreadsheetId,
    ovJiraItem:   !!_settings.jiraBaseUrl,
    ovReportItem: !_settings.enableDailyReport || !!_settings.reportRecipientEmail,
    ovAiItem:     !_settings.enableAiSummaries || true,
  };

  let done = 0;
  for (const [id, ok] of Object.entries(checks)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.className = `check-item ${ok ? 'complete' : 'pending'}`;
    if (ok) done++;
  }
  const prog = document.getElementById('ovSetupProgress');
  if (prog) prog.textContent = `${done}/5`;
}

function _fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(typeof ts === 'number' ? ts : ts);
    if (isNaN(d)) return '—';
    const now = Date.now();
    const diff = Math.round((now - d.getTime()) / 60000);
    if (diff < 1)  return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.round(diff/60)}h ago`;
    return d.toLocaleDateString();
  } catch { return '—'; }
}

function _setStatus(state, text) {
  const dot  = document.getElementById('topbarStatusDot');
  const txt  = document.getElementById('topbarStatusText');
  if (dot) { dot.className = `topbar-status-dot ${state}`; }
  if (txt) txt.textContent = text;

  // Also mirror in popup status dot if accessible
  const pd = document.getElementById('statusDot');
  if (pd) pd.className = `status-indicator ${state}`;
}

// ─── Intelligence ─────────────────────────────────────────────────────────────

function _populateIntelligence() {
  chrome.storage.local.get([
    'reminderAlerts', 'pendingFollowUps', 'commitments'
  ], data => {
    _renderAlerts(data.reminderAlerts || [], 'ovAlertList',   'alert-dash-item');
    _renderAlerts(data.reminderAlerts || [], 'intelAlertList','alert-dash-item');
    _renderFollowups(data.pendingFollowUps || []);
    _renderCommitments(data.commitments   || []);

    const alertCount = (data.reminderAlerts || []).length;
    document.getElementById('kpiAlertCount').textContent = alertCount;
    const nb = document.getElementById('navAlertBadge');
    if (nb) {
      nb.textContent = alertCount;
      nb.hidden = alertCount === 0;
    }
  });
}

function _renderAlerts(alerts, listId, itemClass) {
  const ul = document.getElementById(listId);
  if (!ul) return;
  if (!alerts.length) {
    ul.innerHTML = '<li class="empty-state">No alerts. Click "Run checks" to refresh.</li>';
    return;
  }
  ul.innerHTML = alerts.slice(0, 12).map(a => `
    <li class="${itemClass} ${a.urgency || 'low'}">
      <div class="alert-dash-body">
        <span class="alert-dash-title">${_esc(a.title || a.type || 'Alert')}</span>
        <span class="alert-dash-meta">${_esc(a.detail || '')}</span>
      </div>
    </li>`).join('');
}

function _renderFollowups(followups) {
  const ul = document.getElementById('intelFollowupList');
  if (!ul) return;
  const pending = followups.filter(f => f.status === 'pending');
  if (!pending.length) {
    ul.innerHTML = '<li class="empty-state">No pending follow-ups.</li>';
    return;
  }
  ul.innerHTML = pending.slice(0, 10).map(f => `
    <li class="intel-dash-item">
      <div>
        <div class="intel-dash-title">${_esc(f.subject || 'Follow-up')}</div>
        <div class="intel-dash-meta">To: ${_esc(f.to || '')} · Sent ${_fmtTime(f.sentAt)}</div>
      </div>
    </li>`).join('');
}

function _renderCommitments(commitments) {
  const ul = document.getElementById('intelCommitmentList');
  if (!ul) return;
  const open = commitments.filter(c => c.status !== 'done');
  if (!open.length) {
    ul.innerHTML = '<li class="empty-state">No tracked commitments.</li>';
    return;
  }
  ul.innerHTML = open.slice(0, 10).map(c => `
    <li class="intel-dash-item">
      <div>
        <div class="intel-dash-title">${_esc(c.text || 'Commitment')}</div>
        <div class="intel-dash-meta">Due: ${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : 'Unknown'}</div>
      </div>
    </li>`).join('');
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function _setupActions() {
  // Overview
  _on('ovBtnSync',      () => _triggerSync());
  _on('ovBtnOpenSheet', () => _openSheet());
  _on('ovBtnTestReport',() => _sendTestReport());
  _on('ovBtnRunChecks', () => _runChecks());

  // Topbar
  _on('btnDashboardSync', () => _triggerSync());

  // Intelligence
  _on('intelBtnRunChecks', () => _runChecks());

  // Tickets section
  _on('ticketBtnSync',  () => _triggerSync());
  _on('ticketBtnSheet', () => _openSheet());

  // Settings
  _on('dsBtnSave',       () => _saveAllSettings());
  _on('dsBtnClearCache', () => _clearCache());
  _on('dsBtnResetStats', () => _resetStats());

  // Sign out
  _on('btnDashboardSignOut', () => {
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' });
    window.close();
  });
}

function _on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

function _triggerSync() {
  _setStatus('syncing', 'Syncing…');
  const overlay = document.getElementById('progressOverlay');
  const fill    = document.getElementById('dashProgressFill');
  const label   = document.getElementById('dashProgressLabel');
  if (overlay) overlay.hidden = false;
  if (fill)    fill.style.width = '10%';
  if (label)   label.textContent = 'Starting sync…';

  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, resp => {
    if (chrome.runtime.lastError) return;
    const done = resp?.result ? 'success' : 'error';
    if (fill)  fill.style.width = '100%';
    if (label) label.textContent = resp?.result ? 'Sync complete!' : (resp?.error || 'Sync error');
    setTimeout(() => { if (overlay) overlay.hidden = true; }, 1800);
    _setStatus(done, done === 'success' ? 'Synced' : 'Error');
  });

  // Listen for progress messages from service worker
  const _onMsg = msg => {
    if (msg.type === 'SYNC_PROGRESS') {
      if (fill)  fill.style.width  = Math.min(95, (fill.style.width ? parseInt(fill.style.width) : 10) + 5) + '%';
      if (label) label.textContent = msg.message || 'Syncing…';
    }
  };
  chrome.runtime.onMessage.addListener(_onMsg);
  // Clean up listener after 5 minutes (safety)
  setTimeout(() => chrome.runtime.onMessage.removeListener(_onMsg), 300000);
}

function _openSheet() {
  const id = _settings.spreadsheetId;
  if (id) chrome.tabs.create({ url: `https://docs.google.com/spreadsheets/d/${id}` });
}

function _sendTestReport() {
  chrome.runtime.sendMessage({ type: 'SEND_TEST_REPORT' });
}

function _runChecks() {
  chrome.runtime.sendMessage({ type: 'RUN_REMINDER_CHECKS' }, () => {
    _loadSettings().then(_populateIntelligence);
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DS_FIELDS = [
  ['ds-spreadsheetId',         'spreadsheetId'],
  ['ds-sheetName',             'sheetName'],
  ['ds-jiraBaseUrl',           'jiraBaseUrl'],
  ['ds-gmailDatePreset',       'gmailDatePreset'],
  ['ds-maxTotalEmails',        'maxTotalEmails'],
  ['ds-autoSyncInterval',      'autoSyncInterval'],
  ['ds-fastModeEnabled',       'fastModeEnabled'],
  ['ds-reportRecipientEmail',  'reportRecipientEmail'],
  ['ds-dailyReportEnabled',    'dailyReportEnabled'],
  ['ds-dailyReportTime',       'dailyReportTime'],
  ['ds-morningBriefEnabled',   'morningBriefEnabled'],
  ['ds-morningBriefTime',      'morningBriefTime'],
  ['ds-eveningReportEnabled',  'eveningReportEnabled'],
  ['ds-eveningReportTime',     'eveningReportTime'],
  ['ds-enableAiSummaries',     'enableAiSummaries'],
  ['ds-aiProvider',            'aiProvider'],
  ['ds-aiSummaryMode',         'aiSummaryMode'],
  ['ds-atlassianDomain',       'atlassianDomain'],
  ['ds-atlassianEmail',        'atlassianEmail'],
  ['ds-enableFollowupTracking','enableFollowupTracking'],
  ['ds-enableCommitmentTracking','enableCommitmentTracking'],
  ['ds-enableSentimentTracking','enableSentimentTracking'],
  ['ds-enableDecisionLog',     'enableDecisionLog'],
  ['ds-enableCalendarIntegration','enableCalendarIntegration'],
];

function _setupSettings() {
  for (const [elId, key] of DS_FIELDS) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const val = _settings[key];
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (val != null) {
      el.value = val;
    }
  }
}

async function _saveAllSettings() {
  const updates = {};
  for (const [elId, key] of DS_FIELDS) {
    const el = document.getElementById(elId);
    if (!el) continue;
    if (el.type === 'checkbox') {
      updates[key] = el.checked;
    } else if (el.type === 'number') {
      updates[key] = parseFloat(el.value) || 0;
    } else {
      updates[key] = el.value.trim();
    }
  }
  // Save Atlassian token to session storage separately
  const atEl = document.getElementById('ds-atlassianToken');
  if (atEl && atEl.value) {
    chrome.storage.session.set({ atlassianToken: atEl.value });
  }
  await _saveSettings(updates);
  _settings = { ..._settings, ...updates };
  _showToast('Settings saved');
  _refreshSetup();
}

function _clearCache() {
  if (!confirm('Clear the seen ticket cache? Next sync will re-process all tickets.')) return;
  chrome.storage.local.remove(['seenTicketIds'], () => _showToast('Cache cleared'));
}

function _resetStats() {
  chrome.storage.local.remove(['lastSyncTime','lastSyncTicketCount','nextReportRun'], () => {
    _showToast('Stats reset');
    document.getElementById('kpiLastCount').textContent = '—';
    document.getElementById('kpiLastSync').textContent  = '—';
    document.getElementById('kpiNextReport').textContent = '—';
  });
}

function _showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:#0F172A; color:#fff; padding:10px 20px; border-radius:8px;
    font-size:13px; font-weight:600; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.25);
    border-left:3px solid #00B25A;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ─── Assistant ────────────────────────────────────────────────────────────────

function _setupAssistant() {
  const input   = document.getElementById('dashAssistantInput');
  const sendBtn = document.getElementById('dashSendBtn');
  const clearBtn = document.getElementById('dashClearBtn');

  if (sendBtn) sendBtn.addEventListener('click', _sendAssistantMsg);
  if (clearBtn) clearBtn.addEventListener('click', _clearAssistant);

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendAssistantMsg();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  // Chips
  document.querySelectorAll('.dash-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      if (input) { input.value = q; }
      _sendAssistantMsg(q);
    });
  });

  // Provider badge
  _updateProviderBadge();
}

function _updateProviderBadge() {
  const badge = document.getElementById('dashAssistantProviderBadge');
  if (!badge) return;
  const p = _settings.aiProvider || 'basic';
  const labels = { openai: 'ChatGPT', anthropic: 'Claude', basic: null };
  const label = labels[p];
  if (label && _settings.enableAiSummaries) {
    badge.textContent = label;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

async function _sendAssistantMsg(forceQuery) {
  const input = document.getElementById('dashAssistantInput');
  const query = (forceQuery || (input && input.value.trim()) || '').trim();
  if (!query) return;
  if (input && !forceQuery) input.value = '';
  if (input) input.style.height = 'auto';

  _appendMsg('user', query);
  _chatHistory.push({ role: 'user', content: query });
  if (_chatHistory.length > 8) _chatHistory = _chatHistory.slice(-8);

  // Show typing
  const typingId = _appendTyping();

  try {
    // Path 1 — Jira ticket
    const ticketMatch = query.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
    if (ticketMatch) {
      _removeTyping(typingId);
      await _handleJiraQuery(ticketMatch[1], query);
      return;
    }

    // Path 2 — Local KB
    const localRes = _engine.buildResponse(query, _chatHistory.slice(0, -1));
    const aiEnabled = _settings.enableAiSummaries && _settings.aiProvider !== 'basic';
    const needsAi = localRes.type === 'none' || localRes.lowConfidence;

    if (localRes.type !== 'none') {
      _removeTyping(typingId);
      if (localRes.lowConfidence && aiEnabled) {
        _appendMsg('assistant', '<span style="font-size:11px;color:#94A3B8;font-style:italic">📚 Knowledge base context — AI answer below:</span>');
      }
      _renderLocalResponse(localRes);
      _chatHistory.push({ role: 'assistant', content: localRes.text || '' });
      if (!needsAi) return;
    }

    // Path 3 — AI
    if (!aiEnabled) {
      _removeTyping(typingId);
      if (localRes.type === 'none') {
        _appendMsg('assistant', "I couldn't find that in the local knowledge base. Enable AI summaries to get AI-powered answers.");
      }
      return;
    }

    const typingId2 = localRes.type !== 'none' ? _appendTyping() : typingId;
    const provider = _settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai';
    const prompt = _buildPrompt(query);

    const msgEl = _appendStreamMsg();
    let full = '';
    try {
      await callSessionProvider(prompt, provider, chunk => {
        full += chunk;
        _updateStreamMsg(msgEl, full);
        _removeTyping(typingId2);
      });
      _chatHistory.push({ role: 'assistant', content: full });
    } catch (err) {
      _removeTyping(typingId2);
      _appendMsg('assistant', `AI error: ${err.message || err}`);
    }
  } catch (err) {
    _removeTyping(typingId);
    _appendMsg('assistant', `Error: ${err.message || err}`);
  }
}

async function _handleJiraQuery(ticketId, query) {
  _appendMsg('assistant', `🔍 Looking up **${ticketId}**…`);

  const domain = _settings.atlassianDomain;
  const email  = _settings.atlassianEmail;
  let   token  = '';

  try {
    const sess = await new Promise(r => chrome.storage.session.get(['atlassianToken'], r));
    token = sess.atlassianToken || '';
  } catch {}

  if (!domain || !email || !token) {
    const kbAnalysis = _engine.analyzeJira(`${ticketId} ${query}`);
    _renderLocalResponse(kbAnalysis);
    return;
  }

  try {
    const url = `https://${domain}/rest/api/3/issue/${ticketId}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${email}:${token}`),
        'Accept': 'application/json',
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const issue = await resp.json();
    const summary  = issue.fields?.summary || ticketId;
    const status   = issue.fields?.status?.name || 'Unknown';
    const assignee = issue.fields?.assignee?.displayName || 'Unassigned';
    const desc     = _adfToText(issue.fields?.description);

    const card = `**${ticketId}: ${summary}**\n\nStatus: ${status} · Assignee: ${assignee}\n\n${desc ? desc.slice(0, 400) + (desc.length > 400 ? '…' : '') : ''}`;
    _appendMsg('assistant', _renderMarkdown(card));
    _chatHistory.push({ role: 'assistant', content: card });
  } catch (err) {
    _appendMsg('assistant', `Could not fetch Jira data: ${err.message}. Check Atlassian credentials in Settings.`);
  }
}

function _buildPrompt(query) {
  const histCtx = _chatHistory.slice(0, -1).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  return `You are the JMD Platform Assistant for an engineering manager at a Fynd/JioCommerce team.
You have deep knowledge of the JMD platform (Megatron cart, Avis OMS, Catalog, Inventory, Payments, Theme, Search, Marketing services).

${histCtx ? `Recent conversation:\n${histCtx}\n\n` : ''}User question: ${query}

Answer concisely and technically. For DRI/ownership questions, mention the primary contact. For version questions, list specific features. For Jira/technical questions, give actionable investigation steps.`;
}

function _renderLocalResponse(res) {
  if (!res || res.type === 'none') return;
  const html = _localResToHtml(res);
  _appendRawMsg('assistant', html);
}

function _localResToHtml(res) {
  if (res.type === 'greeting') return _renderMarkdown(res.text || 'Hello!');

  let html = '';
  if (res.text) html += `<p style="margin-bottom:8px">${_renderMarkdown(res.text)}</p>`;

  const s = res.sections || {};
  for (const [, val] of Object.entries(s)) {
    if (!val) continue;
    if (typeof val === 'string') {
      html += `<p style="margin-bottom:6px">${_renderMarkdown(val)}</p>`;
    } else if (Array.isArray(val)) {
      html += '<ul style="margin:4px 0 8px 16px">' +
        val.map(v => `<li style="margin-bottom:3px">${_esc(String(v))}</li>`).join('') +
        '</ul>';
    }
  }
  return html || _renderMarkdown(res.text || '');
}

// ─── Message Rendering ────────────────────────────────────────────────────────

function _appendMsg(role, html) {
  const msgs = document.getElementById('dashMessages');
  if (!msgs) return null;
  const wrap = document.createElement('div');
  wrap.className = `dash-msg ${role}`;
  const bub = document.createElement('div');
  bub.className = 'dash-bubble';
  bub.innerHTML = typeof html === 'string' ? html : _esc(String(html));
  wrap.appendChild(bub);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function _appendRawMsg(role, html) {
  const msgs = document.getElementById('dashMessages');
  if (!msgs) return null;
  const wrap = document.createElement('div');
  wrap.className = `dash-msg ${role}`;
  const cards = document.createElement('div');
  cards.className = 'dash-cards';
  const bub = document.createElement('div');
  bub.className = 'dash-bubble';
  bub.innerHTML = html;
  cards.appendChild(bub);
  wrap.appendChild(cards);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function _appendTyping() {
  const msgs = document.getElementById('dashMessages');
  if (!msgs) return null;
  const id = `typing-${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.className = 'dash-msg assistant';
  wrap.id = id;
  const bub = document.createElement('div');
  bub.className = 'dash-bubble dash-typing';
  bub.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(bub);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function _removeTyping(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function _appendStreamMsg() {
  const msgs = document.getElementById('dashMessages');
  if (!msgs) return null;
  const wrap = document.createElement('div');
  wrap.className = 'dash-msg assistant';
  const bub = document.createElement('div');
  bub.className = 'dash-bubble';
  wrap.appendChild(bub);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return bub;
}

function _updateStreamMsg(el, text) {
  if (!el) return;
  el.innerHTML = _renderMarkdown(text);
  const msgs = document.getElementById('dashMessages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function _clearAssistant() {
  _chatHistory = [];
  const msgs = document.getElementById('dashMessages');
  if (msgs) {
    msgs.innerHTML = `<div class="dash-msg assistant"><div class="dash-bubble">Chat cleared. Ask me anything about the JMD platform.</div></div>`;
  }
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function _renderMarkdown(text) {
  if (!text) return '';
  let s = _esc(text);
  // Code blocks
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px;font-size:11px;overflow-x:auto;margin:6px 0"><code>$1</code></pre>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:3px;padding:1px 5px;font-size:11px">$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Bullet lists
  s = s.replace(/^[•\-\*] (.+)$/gm, '<li style="margin-bottom:3px">$1</li>');
  s = s.replace(/(<li[^>]*>.*<\/li>)/s, '<ul style="margin:4px 0 6px 16px">$1</ul>');
  // Numbered lists
  s = s.replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:3px">$1</li>');
  // Line breaks
  s = s.replace(/\n\n/g, '</p><p style="margin-bottom:6px">');
  s = s.replace(/\n/g, '<br>');
  return `<p style="margin:0">${s}</p>`;
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _adfToText(adf) {
  if (!adf || !adf.content) return '';
  const extract = nodes => nodes.map(n => {
    if (n.type === 'text') return n.text || '';
    if (n.content) return extract(n.content);
    return '';
  }).flat().join('');
  return extract(adf.content);
}
