/* ============================================================
   Radiant-MVTâ„¢ â€” app.js  Main Application Controller
   ============================================================ */

const APP_CONFIG = window.__APP_MODE__ || {};
const APP_ID = APP_CONFIG.id || 'trader';
const API_BASE = APP_CONFIG.api_base || 'http://localhost:8000/api';
const STORAGE_PREFIX = APP_CONFIG.storage_prefix || `radiant_${APP_ID}`;
const STORAGE_KEYS = {
  token: `${STORAGE_PREFIX}_token`,
  role: `${STORAGE_PREFIX}_role`,
  user: `${STORAGE_PREFIX}_user`,
  aiProvider: `${STORAGE_PREFIX}_ai_provider`,
  theme: `${STORAGE_PREFIX}_theme`,
  navCollapsed: `${STORAGE_PREFIX}_nav_collapsed`,
  mpCollapsed: `${STORAGE_PREFIX}_mp_collapsed`,
  dashboardLayout: `${STORAGE_PREFIX}_dashboard_layout_v2`
};

function storageGet(key) {
  return localStorage.getItem(key);
}

function storageSet(key, value) {
  localStorage.setItem(key, value);
}

function storageRemove(key) {
  localStorage.removeItem(key);
}

const THEME_STORAGE_KEY = STORAGE_KEYS.theme;
let authToken = storageGet(STORAGE_KEYS.token);
let currentRole = storageGet(STORAGE_KEYS.role) || ((APP_CONFIG.allowed_roles || [])[0] || 'trader');
let currentScreen = APP_CONFIG.default_screen || 'decision-queue';
let aiProvider = storageGet(STORAGE_KEYS.aiProvider) || 'local';
let currentTheme = storageGet(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
let copilotOpen = false;
let priceUpdateInterval = null;
let tickerData = {};
let selectedEntityContext = null;
let appGuideCache = null;
let docsSelectedScreen = APP_CONFIG.default_screen || 'decision-queue';
let docsNavigationTarget = null;

const SCREEN_DISPLAY_NAMES = {
  'decision-queue': 'Decision Queue',
  'dashboard': 'Dashboard',
  'atlas': 'MVT Atlas',
  'positions': 'Positions & Risk',
  'ai': 'AI Intelligence',
  'performance': 'Performance & Analytics',
  'decision-intelligence': 'Decision Intelligence',
  'market': 'Market Data & Curves',
  'vessels': 'Vessels & Logistics',
  'comms': 'Communications Hub',
  'compliance': 'Compliance & Audit',
  'documentation': 'Help Center',
  'ai-studio': 'AI Studio',
  'configuration': 'External Systems Configuration',
  'boardroom': 'Boardroom View',
  'admin': 'Admin / Demo Control'
};

Object.entries(APP_CONFIG.screen_meta || {}).forEach(([key, meta]) => {
  if (meta && meta.label) SCREEN_DISPLAY_NAMES[key] = meta.label;
});

const DOCUMENTATION_GROUPS = APP_CONFIG.documentation_groups || [
  { key: 'trading', label: 'Trading Workspace', screens: ['decision-queue', 'dashboard', 'positions'] },
  { key: 'intelligence', label: 'AI & Analytics', screens: ['ai', 'performance', 'decision-intelligence'] },
  { key: 'operations', label: 'Operations', screens: ['market', 'vessels', 'comms', 'compliance'] },
  { key: 'platform', label: 'Platform Tools', screens: ['documentation', 'ai-studio', 'configuration'] },
  { key: 'leadership', label: 'Leadership & Admin', screens: ['boardroom', 'admin'] }
];

const PAGE_HELP_PROMPTS = {
  'decision-queue': 'Explain how to work through the Decision Queue and what to do first.',
  'dashboard': 'Explain what this dashboard is showing and what I should look at first.',
  'atlas': 'Explain the MVT Atlas map, the visible layers, and which trade or logistics object I should inspect first.',
  'positions': 'Explain how to use the Positions & Risk screen and where the biggest exposure is.',
  'ai': 'Explain the AI Intelligence screen and which tools I can run from here.',
  'performance': 'Explain the Performance & Analytics page and how to investigate shortfall.',
  'decision-intelligence': 'Explain the Decision Intelligence page and how to use forensics and Desk Brain.',
  'market': 'Explain the Market Data & Curves page and how to run a curve scenario.',
  'vessels': 'Explain the Vessels & Logistics page and how delays affect trading decisions.',
  'comms': 'Explain the Communications Hub and how to work through priority emails.',
  'compliance': 'Explain the Compliance & Audit page and what the key controls are.',
  'documentation': 'Explain how to use the Help Center workspace.',
  'ai-studio': 'Explain the AI Studio page and how to manage agents safely.',
  'configuration': 'Explain the connector configuration page and how to test integrations.',
  'boardroom': 'Explain the Boardroom view and what executives should focus on.',
  'admin': 'Explain the Admin / Demo Control page and what scenarios I can run.'
};

const TICKER_LABELS = {
  trader:    ['Alpha Captured','Leakage Prevented','Risks Flagged','Book Currency'],
  risk:      ['Breaks Resolved','Margin Headroom','Limit Breaches Prevented','VaR Used'],
  executive: ['Time Recovered','Value Identified','On Track','Capital Return']
};

const CONCIERGE_CONTEXT = {
  'decision-queue':   { text: '<strong>3 decisions</strong> require your attention today. Highest priority: Urals hedge review before OPEC+ at 10:00.', actions: ['Generate Briefing','View All'] },
  'dashboard':        { text: '<strong>Book P&L</strong> +$2.1M today. Ethane/Naphtha spread widening â€” <strong>potential opportunity flagged.</strong>', actions: ['Explain P&L','Top Risk'] },
  'positions':        { text: 'Net Crude exposure <strong>$214M long</strong>. VaR utilisation at 62% â€” within limits.', actions: ['Hedge Analysis','Run Stress'] },
  'ai':               { text: 'AI scanner found <strong>2 new trade ideas</strong> and <strong>1 anomaly</strong> in your book since 06:00.', actions: ['View Ideas','Run Pre-Mortem'] },
  'performance':      { text: 'YTD performance at <strong>82% of target</strong>. Shortfall driven primarily by missed opportunities in Q1.', actions: ['Investigate','Forecast'] },
  'decision-intelligence': { text: '<strong>11 opportunities missed</strong> in 90 days. Estimated value: $8.7M. Ready to review?', actions: ['Run Audit','View History'] },
  'market':           { text: 'Brent prompt month <strong>up $1.20</strong> this session. EUA carbon prices testing 3-week highs.', actions: ['Curve Analysis','News Summary'] },
  'vessels':          { text: 'JS Ineos Innovation <strong>14h delayed</strong> at Rafnes. Cargo impact on hedge position flagged.', actions: ['View Impact','Options'] },
  'comms':            { text: '<strong>8 emails</strong> need action. Vitol confirmation outstanding â€” draft reply ready to send.', actions: ['Priority Inbox','Send Drafts'] },
  'compliance':       { text: 'All regulatory filings <strong>up to date</strong>. Next EMIR deadline in 3 days.', actions: ['View Status','EMIR Filing'] },
  'documentation':    { text: 'Browse the Help Center, jump to any screen, and let Radiant AI perform supported tasks for you.', actions: ['Open Screen','Ask AI'] },
  'ai-studio':        { text: 'Control prompts, model settings, user context, and agent guardrails from one enterprise AI workspace.', actions: ['Test Chat Copilot','Review Profiles'] },
  'configuration':    { text: 'Manage external feeds, AI providers, and ETRM connectors from one control centre.', actions: ['Load Connectors','Test Connector'] },
  'boardroom':        { text: 'Desk P&L tracking at <strong>82% of annual target</strong>. Top-quartile uplift potential: $38.4M.', actions: ['Executive Summary','Drill Down'] },
  'admin':            { text: 'System healthy. All feeds active. <strong>6 demo scenarios</strong> available.', actions: ['Run Scenario','System Check'] }
};

const COPILOT_SUGGESTIONS = {
  'decision-queue':   ["What's most urgent right now?","Summarise today's risk","Draft my morning note"],
  'dashboard':        ["What's driving today's P&L?","Show me my biggest risk right now","What should I act on?"],
  'atlas':            ["Explain the selected map object","Summarize Atlas for the morning meeting","What should I investigate first?"],
  'positions':        ["What's my exposure if Brent drops $5?","Which position needs hedging most?","Show me my open risks"],
  'ai':               ["Explain the top trade idea","What anomalies did you find?","Run pre-mortem on my book"],
  'performance':      ["Why are we behind target?","What's our run-rate forecast?","Show opportunity cost"],
  'decision-intelligence': ["Walk me through Q1 forensics","What did we miss last quarter?","Desk Brain: Urals arb history"],
  'market':           ["What's moving Brent today?","Explain the EUA rally","Shift Brent up $3 and show impact"],
  'vessels':          ["Will Innovation delay affect my hedge?","What's my ethane exposure today?","Voyage economics for Hermod"],
  'comms':            ["Draft reply to Vitol","Summarise my inbox","What needs action today?"],
  'compliance':       ["Am I EMIR compliant?","When is my next filing?","Show audit trail"],
  'documentation':    ["Show me where connectors are configured","How do I use the Decision Queue?","Open the Help Center"],
  'ai-studio':        ["What context does Chat Copilot see?","Test the Daily Briefing agent","How should I tune this prompt safely?"],
  'configuration':    ["Show me connector health","Test the LM Studio connector","Where do I update API keys?"],
  'boardroom':        ["Executive summary for board","Top-quartile analysis","Compare books"],
  'admin':            ["Trigger Urals scenario","Test AI connection","Show system status"]
};

CONCIERGE_CONTEXT['atlas'] = {
  text: '<strong>MVT Atlas</strong> is showing deal pins, logistics routes, hub exposure, pricing, trust, and AI anomaly layers.',
  actions: ['Explain Atlas','Map Risks']
};

function getAllowedScreens() {
  return Array.isArray(APP_CONFIG.allowed_screens) ? APP_CONFIG.allowed_screens : [];
}

function getAppMode() {
  return APP_CONFIG;
}

function currentAppId() {
  return APP_ID;
}

function isScreenAllowed(screen) {
  return getAllowedScreens().includes(screen);
}

function resolveScreen(screen) {
  if (isScreenAllowed(screen)) return screen;
  if (APP_CONFIG.screen_fallbacks && APP_CONFIG.screen_fallbacks[screen]) return APP_CONFIG.screen_fallbacks[screen];
  return APP_CONFIG.default_screen || 'decision-queue';
}

function roleAllowsItem(item) {
  return !item.roles || item.roles.includes(currentRole);
}

function getNavItemDescriptor(entry) {
  const key = typeof entry === 'string' ? entry : entry.screen;
  const meta = (APP_CONFIG.screen_meta || {})[key] || {};
  return {
    key,
    label: meta.label || SCREEN_DISPLAY_NAMES[key] || key,
    icon: meta.icon || '',
    roles: typeof entry === 'string' ? null : (entry.roles || null)
  };
}

function renderNav() {
  const nav = document.getElementById('nav-inner');
  if (!nav) return;
  const sections = Array.isArray(APP_CONFIG.nav_sections) ? APP_CONFIG.nav_sections : [];
  let html = sections.map(section => {
    const items = (section.items || [])
      .map(getNavItemDescriptor)
      .filter(item => item && isScreenAllowed(item.key) && roleAllowsItem(item));
    if (!items.length) return '';
    return `
      <div class="nav-section">${escapeHtml(section.label)}</div>
      ${items.map(item => `
        <a class="nav-item" data-screen="${escapeHtml(item.key)}" onclick="navigateTo('${item.key}')">
          <span class="ni">${escapeHtml(item.icon || '')}</span><span class="nl">${escapeHtml(item.label)}</span>
        </a>
      `).join('')}
    `;
  }).join('');
  if (!html.trim()) {
    const fallbackItems = getAllowedScreens()
      .map(key => getNavItemDescriptor(key))
      .filter(item => item && roleAllowsItem(item));
    html = fallbackItems.length ? `
      <div class="nav-section">${escapeHtml(APP_CONFIG.primary_nav_heading || 'Workspace')}</div>
      ${fallbackItems.map(item => `
        <a class="nav-item" data-screen="${escapeHtml(item.key)}" onclick="navigateTo('${item.key}')">
          <span class="ni">${escapeHtml(item.icon || '')}</span><span class="nl">${escapeHtml(item.label)}</span>
        </a>
      `).join('')}
    ` : '';
  }
  nav.innerHTML = html;
}

function applyAppBranding() {
  const fallbackTitle = 'Radiant - Trader';
  document.title = APP_CONFIG.browser_title || APP_CONFIG.title || fallbackTitle;
  document.getElementById('login-brand').textContent = APP_CONFIG.title || fallbackTitle;
  document.getElementById('topbar-brand').textContent = APP_CONFIG.title || fallbackTitle;
  document.getElementById('login-tagline').innerHTML = escapeHtml(APP_CONFIG.tagline || 'Decision intelligence workspace');
  document.getElementById('login-btn').textContent = APP_CONFIG.login_button || 'Sign In';
  document.getElementById('login-email').value = APP_CONFIG.login_default_email || '';
  document.getElementById('login-password').value = APP_CONFIG.login_default_password || '';
  document.getElementById('login-hint').innerHTML = `<code>${escapeHtml(APP_CONFIG.login_hint || '')}</code>`;
  document.getElementById('nav-ver').textContent = `${APP_CONFIG.title || fallbackTitle} v2.1`;
  document.body.dataset.app = APP_ID;
  (APP_CONFIG.topbar_kpis || []).forEach((kpi, index) => {
    const labelEl = document.getElementById(`tb-kpi-label-${index + 1}`);
    if (labelEl) labelEl.textContent = kpi.label || labelEl.textContent;
    const kpiCard = document.getElementById(`tb-kpi-${index + 1}`);
    if (kpiCard && kpi.screen) kpiCard.setAttribute('onclick', `navigateTo('${kpi.screen}')`);
  });
}

/* â”€â”€ API Helper â”€â”€ */
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (response.status === 401) { if (authToken && !authToken.startsWith('demo_')) { logout(); } return null; }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${response.status}`);
    }
    return response.json();
  } catch (e) {
    console.warn('API:', endpoint, e.message);
    return null;  // Silently fail - screens use fallback data
  }
}

/* â”€â”€ Auth â”€â”€ */
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({email, password, app: APP_ID})
    });
    if (!response.ok) throw new Error('Invalid credentials');
    const data = await response.json();
    authToken = data.access_token;
    storageSet(STORAGE_KEYS.token, authToken);
    let me = null;
    try { me = await apiCall('/auth/me'); } catch(e) {}
    if (me) {
      if (Array.isArray(me.allowed_apps) && !me.allowed_apps.includes(APP_ID)) {
        throw new Error(`This account cannot access the ${APP_ID} workspace`);
      }
      currentRole = me.role || currentRole;
      storageSet(STORAGE_KEYS.role, currentRole);
      storageSet(STORAGE_KEYS.user, JSON.stringify(me));
    }
    return true;
  } catch (e) {
    console.warn('Login failed', e.message);
    return false;
  }
}

function logout() {
  authToken = null;
  storageRemove(STORAGE_KEYS.token);
  storageRemove(STORAGE_KEYS.role);
  storageRemove(STORAGE_KEYS.user);
  window.location.hash = '';
  showLoginScreen();
}

function getCurrentUser() {
  try { return JSON.parse(storageGet(STORAGE_KEYS.user) || '{}'); } catch { return {}; }
}

function countdownStr(deadline) {
  const target = new Date(deadline);
  const diffMs = target.getTime() - Date.now();
  if (Number.isNaN(target.getTime())) return 'â€”';
  if (diffMs <= 0) return 'due';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function setSelectedEntity(entity) {
  selectedEntityContext = entity && entity.type ? entity : null;
}

function getSelectedEntity() {
  return selectedEntityContext;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsArg(value) {
  return JSON.stringify(String(value ?? '')).replace(/"/g, '&quot;');
}

function screenDisplayName(screenKey) {
  return SCREEN_DISPLAY_NAMES[screenKey] || screenKey || 'this page';
}

function getScreenHelpPrompt(screenKey) {
  return PAGE_HELP_PROMPTS[screenKey] || `Explain the ${screenDisplayName(screenKey)} page and how to use it.`;
}

async function loadAppGuide(force = false) {
  if (appGuideCache && !force) return appGuideCache;
  let guide = await apiCall('/chat/app-guide');
  if (!guide || !Array.isArray(guide.screens) || guide.screens.length === 0) {
    try {
      const response = await fetch(`/static/data/app-guide.json?v=1781034000`, { cache: 'no-store' });
      if (response.ok) {
        guide = await response.json();
      }
    } catch (err) {
      console.warn('App guide fallback load failed', err);
    }
  }
  if (!guide || !Array.isArray(guide.screens) || guide.screens.length === 0) {
    appGuideCache = {
      overview: 'Radiant-MVT brings trading, intelligence, operations, and admin workflows into one AI-assisted workspace.',
      screens: DOCUMENTATION_GROUPS.flatMap(group => group.screens.map(key => ({
        key,
        title: screenDisplayName(key),
        summary: `Help Center content for ${screenDisplayName(key)} is temporarily unavailable.`,
        features: ['Reconnect to the guide service or refresh the app to load full Help Center content.'],
        tasks: ['Open the screen and use the Help button for page-level guidance.'],
        sections: []
      }))),
      byKey: {}
    };
    appGuideCache.byKey = Object.fromEntries(appGuideCache.screens.map(screen => [screen.key, screen]));
    return appGuideCache;
  }
  const screens = Array.isArray(guide.screens) ? guide.screens : [];
  const byKey = Object.fromEntries(screens.map(screen => [screen.key, screen]));
  appGuideCache = { ...guide, screens, byKey };
  return appGuideCache;
}

function getManualScreen(screenKey) {
  const guide = appGuideCache || { screens: [], byKey: {} };
  return guide.byKey?.[screenKey] || guide.screens.find(screen => screen.key === screenKey) || null;
}

function getDocumentationGroupsData() {
  const guide = appGuideCache || { screens: [], byKey: {} };
  const byKey = guide.byKey || Object.fromEntries((guide.screens || []).map(screen => [screen.key, screen]));
  return DOCUMENTATION_GROUPS.map(group => ({
    ...group,
    items: group.screens.map(key => byKey[key]).filter(item => item && isScreenAllowed(item.key))
  })).filter(group => group.items.length > 0);
}

function setDocumentationFocus(screenKey) {
  if (screenKey) docsSelectedScreen = resolveScreen(screenKey);
  docsNavigationTarget = resolveScreen(docsSelectedScreen || currentScreen || APP_CONFIG.default_screen || 'decision-queue');
  if (currentScreen === 'documentation' && typeof window.renderDocumentationScreen === 'function') {
    window.renderDocumentationScreen(docsNavigationTarget);
    scheduleScreenEnhancements('documentation');
    docsNavigationTarget = null;
    return;
  }
  navigateTo('documentation');
}

function promptCopilotForTask(screenKey, taskLabel) {
  const manual = getManualScreen(screenKey);
  const prompt = manual
    ? `Take me to ${manual.title} and help me ${taskLabel.toLowerCase()}. If this can be done in the app, do it for me.`
    : `Help me ${taskLabel.toLowerCase()}. If this can be done in the app, do it for me.`;
  openCopilot();
  sendCopilotMessage(prompt);
}

function closePageHelp() {
  document.getElementById('page-help-modal')?.remove();
}

async function openPageHelp(screenKey = currentScreen) {
  await loadAppGuide();
  const manual = getManualScreen(screenKey) || getManualScreen(currentScreen);
  if (!manual) {
    showToast('Help', 'Help Center content is not available for this screen yet.', 'warning');
    return;
  }

  closePageHelp();

  const modal = document.createElement('div');
  modal.id = 'page-help-modal';
  const manualKeyArg = escapeJsArg(manual.key);
  const explainPromptArg = escapeJsArg(getScreenHelpPrompt(manual.key));
  const features = (manual.features || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const tasks = (manual.tasks || []).map(task => `
    <div class="page-help-task">
      <div class="page-help-task-copy">
        <div class="page-help-task-title">${escapeHtml(task)}</div>
        <div class="page-help-task-meta">Radiant AI can guide you here or perform supported actions directly.</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="promptCopilotForTask(${manualKeyArg}, ${escapeJsArg(task)})">Ask AI</button>
    </div>
  `).join('');
  modal.innerHTML = `
    <div class="page-help-backdrop" onclick="closePageHelp()"></div>
    <div class="page-help-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(manual.title)} help">
      <div class="page-help-header">
        <div>
          <div class="page-help-eyebrow">Page Help</div>
          <div class="page-help-title">${escapeHtml(manual.title)}</div>
          <div class="page-help-summary">${escapeHtml(manual.summary || '')}</div>
        </div>
        <button class="page-help-close" onclick="closePageHelp()">Ã—</button>
      </div>
      <div class="page-help-body">
        <div class="page-help-section">
          <div class="page-help-section-title">What this page does</div>
          <ul class="page-help-list">${features || '<li>Help Center content for this page is loading.</li>'}</ul>
        </div>
        <div class="page-help-section">
          <div class="page-help-section-title">Common things you can ask Radiant AI to do</div>
          <div class="page-help-task-list">${tasks || '<div class="secondary small">Ask Radiant AI how to use this page.</div>'}</div>
        </div>
      </div>
      <div class="page-help-actions">
        <button class="btn btn-secondary btn-sm" onclick="closePageHelp(); setDocumentationFocus(${manualKeyArg})">Open Help Center</button>
        <button class="btn btn-secondary btn-sm" onclick="closePageHelp(); openCopilot(); sendCopilotMessage(${explainPromptArg})">Explain in Chat</button>
        <button class="btn btn-primary btn-sm" onclick="closePageHelp()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function ensurePageHelpButton(screenKey) {
  const header = document.querySelector('#main .screen .screen-header');
  if (!header) return;
  let actions = header.querySelector('.screen-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'screen-actions';
    header.appendChild(actions);
  }
  let helpBtn = actions.querySelector('.page-help-btn');
  if (!helpBtn) {
    helpBtn = document.createElement('button');
    helpBtn.className = 'btn btn-secondary btn-sm page-help-btn';
    actions.appendChild(helpBtn);
  }
  helpBtn.type = 'button';
  helpBtn.innerHTML = '<span class="page-help-btn-icon">?</span><span>Help</span>';
  helpBtn.title = `Explain ${screenDisplayName(screenKey)}`;
  helpBtn.onclick = () => openPageHelp(screenKey);
}

function decorateAssistableActions() {
  const root = document.getElementById('main');
  if (!root) return;
  root.querySelectorAll('button.btn, .email-row, .comms-action-row, .scenario-btn, .agent-card, .connector-card, [onclick]').forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains('page-help-btn')) return;
    if (node.dataset.agentDecorated === '1') return;
    if (node.closest('#page-help-modal')) return;
    if (node.closest('.help-center-screen') && !node.closest('.docs-action-card')) return;
    const text = (node.textContent || '').trim().toLowerCase();
    if (!text || text === 'Ã—' || text === 'x') return;
    node.dataset.agentDecorated = '1';
    node.classList.add('agent-assistable');
    if (!node.getAttribute('title')) {
      node.setAttribute('title', 'Radiant AI can help with this action');
    }
  });
}

function scheduleScreenEnhancements(screenKey) {
  [60, 260, 900].forEach(delay => {
    window.setTimeout(() => {
      if (currentScreen !== screenKey) return;
      ensurePageHelpButton(screenKey);
      decorateAssistableActions();
    }, delay);
  });
}

/* â”€â”€ Toast â”€â”€ */
function showToast(title, msg, type = 'info', duration = 4000) {
  const icons = { success: 'âœ“', error: 'âœ•', warning: 'âš ', info: 'â„¹' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'â„¹'}</span><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div><button class="toast-close" onclick="this.closest('.toast').remove()">Ã—</button>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/* â”€â”€ Routing â”€â”€ */
function navigateTo(screen) {
  screen = resolveScreen(screen);
  const previousScreen = currentScreen;
  if (screen === 'documentation') {
    if (docsNavigationTarget) {
      docsSelectedScreen = docsNavigationTarget;
      docsNavigationTarget = null;
    } else if (previousScreen && previousScreen !== 'documentation') {
      docsSelectedScreen = resolveScreen(previousScreen);
    }
  }
  currentScreen = screen;
  window.location.hash = screen;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === screen);
  });
  loadScreen(screen);
  updateConciergeBar(screen);
  updateCopilotContext(screen);
}

function loadScreen(screen) {
  screen = resolveScreen(screen);
  const main = document.getElementById('main');
  if (!main) return;
  main.innerHTML = `<div class="flex-center" style="height:200px"><span class="loading-spinner"></span></div>`;
  const fn = SCREENS[screen];
  if (fn) {
    Promise.resolve(fn(main))
      .catch(err => {
        console.warn('Screen render failed', screen, err);
        main.innerHTML = `<div class="screen"><div class="screen-header"><div class="screen-title">Unable to load ${escapeHtml(screenDisplayName(screen))}</div></div><div class="card">Please try again.</div></div>`;
      })
      .finally(() => scheduleScreenEnhancements(screen));
    return;
  }
  else main.innerHTML = `<div class="screen"><div class="screen-header"><div class="screen-title">404 â€” Screen not found</div></div></div>`;
}

function updateConciergeBar(screen) {
  const ctx = CONCIERGE_CONTEXT[screen] || { text: 'Radiant AI ready.', actions: ['Ask AI'] };
  const textEl = document.getElementById('concierge-text');
  const actionsEl = document.getElementById('concierge-actions');
  if (textEl) textEl.innerHTML = ctx.text;
  if (actionsEl) {
    actionsEl.innerHTML = ctx.actions.map(a =>
      `<button class="btn btn-secondary btn-sm" onclick="sendCopilotMessage('${a}')">${a}</button>`
    ).join('');
  }
}

function updateCopilotContext(screen) {
  const banner = document.getElementById('copilot-context-banner');
  const suggestionsEl = document.getElementById('copilot-suggestions');
  if (banner) {
    const name = screenDisplayName(screen);
    const workspaceLabel = APP_CONFIG.title || 'Radiant';
    banner.innerHTML = `You're viewing <strong>${name}</strong> in <strong>${workspaceLabel}</strong>. Ask me anything about your positions, market, decisions, or controls.`;
  }
  if (suggestionsEl) {
    const suggs = COPILOT_SUGGESTIONS[screen] || [];
    suggestionsEl.innerHTML = suggs.map(s => {
    const safe = s.replace(/"/g, '&quot;');
    return `<span class="cp-chip" data-msg="${safe}" onclick="window.sendCopilotMessage && window.sendCopilotMessage(this.dataset.msg)">${s}</span>`;
  }).join('');
  }
}

/* â”€â”€ Market Ticker â”€â”€ */
const MOCK_PRICES = {
  'Brent':   { price: 82.40, unit: '$/bbl' },
  'WTI':     { price: 78.90, unit: '$/bbl' },
  'HH':      { price: 2.84,  unit: '$/MMBtu' },
  'EUA':     { price: 63.20, unit: 'â‚¬/t' },
  'EUR/USD': { price: 1.0840, unit: '' },
  'GBP/USD': { price: 1.2740, unit: '' },
  'Urals':   { price: 74.30, unit: '$/bbl' },
  'Naphtha': { price: 612.0, unit: '$/t' },
  'Ethane':  { price: 248.0, unit: '$/t' }
};

function buildTickerHTML(data) {
  const items = Object.entries(data).map(([name, d]) => {
    const chg = (Math.random() * 2 - 1).toFixed(2);
    const dir = chg >= 0 ? 'up' : 'down';
    const arrow = dir === 'up' ? 'â–²' : 'â–¼';
    return `<div class="ticker-item"><span class="t-name">${name}</span><span class="t-price">${d.unit}${d.price.toFixed(2)}</span><span class="t-change ${dir}">${arrow} ${Math.abs(chg)}</span></div>`;
  }).join('');
  return items + items; // duplicate for seamless loop
}

function initTicker() {
  const track = document.getElementById('ticker-track');
  if (!track) return;
  track.innerHTML = buildTickerHTML(MOCK_PRICES);
}

function refreshTicker() {
  Object.keys(MOCK_PRICES).forEach(k => {
    MOCK_PRICES[k].price += (Math.random() * 0.6 - 0.3);
  });
  initTicker();
}

/* â”€â”€ Copilot Panel â”€â”€ */
function openCopilot() {
  copilotOpen = true;
  document.getElementById('copilot-panel').classList.add('open');
  const bd1 = document.getElementById('copilot-backdrop'); if(bd1) bd1.classList.add('show');
  updateCopilotContext(currentScreen);
}

function closeCopilot() {
  copilotOpen = false;
  document.getElementById('copilot-panel').classList.remove('open');
  const bd2 = document.getElementById('copilot-backdrop'); if(bd2) bd2.classList.remove('show');
}

function appendCopilotMessage(role, text) {
  const msgs = document.getElementById('copilot-messages');
  if (!msgs) return;
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-time">${time}</div>`;
  // Remove typing indicator if exists
  const typing = msgs.querySelector('.typing-wrapper');
  if (typing) typing.remove();
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function showTypingIndicator() {
  const msgs = document.getElementById('copilot-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'msg ai typing-wrapper';
  div.innerHTML = `<div class="msg-bubble typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendCopilotMessage(text) {
  if (!text || !text.trim()) return;
  const input = document.getElementById('copilot-input');
  if (input) input.value = '';
  if (!copilotOpen) openCopilot();
  appendCopilotMessage('user', text);
  showTypingIndicator();
  try {
    const response = await fetch(`${API_BASE}/chat/message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        screen_context: currentScreen,
        provider: aiProvider,
        selected_entity_type: selectedEntityContext?.type || null,
        selected_entity_id: selectedEntityContext?.id || null,
        selected_entity_label: selectedEntityContext?.label || null
      })
    });
    if (!response.ok) throw new Error('Chat error');
    const msgs = document.getElementById('copilot-messages');
    const typing = msgs?.querySelector('.typing-wrapper');
    if (typing) typing.remove();
    // SSE or JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const msgDiv = appendCopilotMessage('ai', '');
      const bubble = msgDiv?.querySelector('.msg-bubble');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        chunk.split('\n').forEach(line => {
          if (line.startsWith('data: ')) {
            const d = line.slice(6).trim();
            if (d && d !== '[DONE]') {
              try { const j = JSON.parse(d); if (j.done) return; accumulated += j.chunk || j.content || j.text || ''; } catch(e) { accumulated += d; }
              if (bubble) bubble.textContent = accumulated;
              if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }
          }
        });
      }
    } else {
      const data = await response.json();
      appendCopilotMessage('ai', data.response || data.message || 'Response received.');
    }
  } catch (e) {
    const msgs = document.getElementById('copilot-messages');
    const typing = msgs?.querySelector('.typing-wrapper');
    if (typing) typing.remove();
    appendCopilotMessage('ai', `I encountered a connection error: ${e.message || 'unknown error'}. Please check your API configuration and try again.`);
  }
}

/* â”€â”€ Streaming helper for screen-level AI boxes â”€â”€ */
async function streamToElement(el, endpoint, body) {
  if (!el) return;
  el.classList.add('active');
  el.textContent = '';
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error();
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.decode(value).split('\n').forEach(line => {
          if (line.startsWith('data: ')) {
            const d = line.slice(6).trim();
            if (d && d !== '[DONE]') {
              try { const j = JSON.parse(d); if (j.done) return; text += j.chunk || j.content || j.text || ''; } catch(e) { text += d; }
              el.textContent = text;
            }
          }
        });
      }
    } else {
      const data = await response.json();
      el.textContent = data.response || data.message || '';
    }
  } catch {
    el.textContent = getDemoAIText(endpoint);
  }
  el.classList.remove('active');
}

function getDemoAIText(endpoint) {
  const demos = {
    '/chat/message': `Morning briefing: Markets are opening with cautious optimism following yesterday's Fed commentary. Brent crude is up $1.20 to $82.40/bbl, driven by expectations of OPEC+ production discipline. Your key priority today is reviewing the Urals hedge before the 10:00 announcement. The JS Ineos Innovation delay creates secondary risk to your ethane delivery schedule â€” recommend reviewing voyage economics for alternatives. VaR utilisation at 62% is comfortable but watch the Ethane/Naphtha spread which is showing unusual behaviour (+2.1Ïƒ from 90-day mean).`,
    '/performance/forensics': `Forensic Analysis â€” Q1 Performance Shortfall\n\nTotal shortfall vs target: $1.82M\n\nRoot cause breakdown:\nâ€¢ Missed opportunities (59%, $1.07M): 7 high-confidence signals not acted on within the decision window. Average delay: 4.2 hours. Market had moved by the time action was taken.\nâ€¢ Losing trades (19%, $346K): 3 trades moved against us â€” 2 were within normal variance, 1 (RMVT-0187, Naphtha long) was flagged by AI as high-risk but executed anyway.\nâ€¢ Delayed execution (14%, $255K): Operational delays in 4 cases â€” 2 due to approval workflow, 2 due to counterparty negotiation.\nâ€¢ Sizing decisions (8%, $146K): Positions sized conservatively on 6 winning trades. At optimal sizing, additional $146K would have been captured.`,
    '/performance/opportunity-cost': `90-Day Opportunity Cost Audit â€” Complete\n\n17 opportunities were identified by the AI signal engine between 28 February and 30 May 2026.\n\n6 were captured (35% capture rate), generating $3.2M in P&L.\n11 were missed, representing an estimated $8.7M in foregone P&L.\n\nMissed opportunity breakdown:\nâ€¢ 4 signals: Acted on too late (average 6.1 hours after signal)\nâ€¢ 3 signals: Not reviewed (no decision made within window)\nâ€¢ 2 signals: Reviewed but rejected (retrospectively, both would have been profitable)\nâ€¢ 2 signals: In conflict with existing position, no resolution reached\n\nRadiant-MVT surfaces all signals within 12 minutes of identification with full context, recommended action, and deadline countdown.`
  };
  return demos[endpoint] || demos['/chat/message'];
}

/* â”€â”€ Chart.js defaults â”€â”€ */
function getThemeVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function updateThemeToggleUI() {
  const toggle = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-toggle-label');
  if (!toggle || !label) return;
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  const nextLabel = nextTheme === 'dark' ? 'Dark mode' : 'Light mode';
  label.textContent = nextLabel;
  toggle.title = `Switch to ${nextLabel.toLowerCase()}`;
  toggle.setAttribute('aria-label', `Switch to ${nextLabel.toLowerCase()}`);
}

function syncChartTheme() {
  if (typeof Chart === 'undefined') return;
  const chartText = getThemeVar('--chart-text') || '#94A3B8';
  const chartGrid = getThemeVar('--chart-grid') || '#F1F5F9';
  const charts = new Set();

  document.querySelectorAll('canvas').forEach(canvas => {
    const chart =
      (typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null) ||
      canvas._chartInstance ||
      canvas._phChart;
    if (chart) charts.add(chart);
  });

  charts.forEach(chart => {
    chart.options = chart.options || {};
    chart.options.plugins = chart.options.plugins || {};
    if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = chartText;
    }
    if (chart.options.plugins.tooltip) {
      chart.options.plugins.tooltip.backgroundColor = getThemeVar('--chart-tooltip-bg') || '#111827';
      chart.options.plugins.tooltip.borderColor = getThemeVar('--chart-tooltip-border') || '#2A3F60';
      chart.options.plugins.tooltip.titleColor = getThemeVar('--chart-tooltip-title') || '#E8EDF5';
      chart.options.plugins.tooltip.bodyColor = getThemeVar('--chart-tooltip-body') || '#8A9BB5';
    }
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(scale => {
        if (!scale) return;
        if (scale.grid) scale.grid.color = chartGrid;
        if (scale.ticks) scale.ticks.color = chartText;
        if (scale.border) scale.border.color = chartGrid;
      });
    }
    chart.update('none');
  });
}

function applyTheme(theme, persist = true) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  if (persist) {
    storageSet(THEME_STORAGE_KEY, currentTheme);
  }
  updateThemeToggleUI();
  applyChartDefaults();
  syncChartTheme();
}

function toggleTheme() {
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  showToast('Theme', `${nextTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'success', 2200);
}

function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = getThemeVar('--chart-text') || '#8A9BB5';
  Chart.defaults.borderColor = getThemeVar('--chart-grid') || '#1E2D45';
  Chart.defaults.font.family = getThemeVar('--font') || "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.color = getThemeVar('--chart-text') || '#8A9BB5';
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = getThemeVar('--chart-tooltip-bg') || '#111827';
  Chart.defaults.plugins.tooltip.borderColor = getThemeVar('--chart-tooltip-border') || '#2A3F60';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = getThemeVar('--chart-tooltip-title') || '#E8EDF5';
  Chart.defaults.plugins.tooltip.bodyColor = getThemeVar('--chart-tooltip-body') || '#8A9BB5';
}

/* â”€â”€ Number animation â”€â”€ */
function animateNumber(el, from, to, duration = 1200, prefix = '', suffix = '') {
  if (!el) return;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    el.textContent = prefix + current.toLocaleString('en-US', { maximumFractionDigits: 1 }) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* â”€â”€ Role-based nav visibility â”€â”€ */
function applyRoleVisibility() {
  const role = currentRole;
  document.querySelectorAll('[data-role]').forEach(el => {
    const allowed = el.dataset.role.split(',');
    el.style.display = allowed.includes(role) || allowed.includes('all') ? '' : 'none';
  });
}

/* â”€â”€ Init â”€â”€ */
function initApp() {
  if (!authToken) { showLoginScreen(); return; }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'grid';
  applyAppBranding();
  renderNav();
  applyChartDefaults();
  const user = getCurrentUser();
  const nameEl = document.getElementById('user-name-display');
  const roleEl = document.getElementById('user-role-display');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = user.full_name || user.username || 'Trader';
  if (roleEl) roleEl.textContent = user.role || currentRole;
  if (avatarEl) avatarEl.textContent = (user.full_name || 'T').charAt(0).toUpperCase();
  initTicker();
  priceUpdateInterval = setInterval(refreshTicker, 60000);
  populateMarketPanel();
  setInterval(populateMarketPanel, 60000);
  const hash = resolveScreen(window.location.hash.replace('#', '') || APP_CONFIG.default_screen || 'decision-queue');
  navigateTo(hash);
  updateConciergeBar(hash);
  // Sync AI provider from backend (non-blocking)
  syncAIProviderFromBackend();
}


/* ============================================================
   Market Intelligence Feature
   ============================================================ */

// Demo data used until backend (Codex) delivers real endpoints
const DEMO_INTELLIGENCE = {
  "Brent": {
    commodity: "Brent",
    outlook: "bearish",
    outlook_score: 32,
    key_drivers: [
      "OPEC+ meeting uncertainty â€” consensus leaning toward extension but cracks emerging",
      "Russian export flows returning via alternative routes, adding supply pressure",
      "USD strengthening limits commodity upside across energy complex"
    ],
    key_risks: [
      "Middle East escalation could spike prices $8-12/bbl rapidly",
      "China demand recovery stronger than expected â€” upside risk to consensus"
    ],
    price_at_analysis: 82.40,
    change_24h: -0.85,
    trend_5d: -1.2,
    trend_30d: -3.8,
    news_count_analysed: 5,
    opportunity_flag: false,
    top_news: [
      {headline: "OPEC+ Considers Extending Production Cuts as Demand Outlook Weakens", source: "Reuters", sentiment: "negative", time: "2h ago"},
      {headline: "Brent-WTI Spread Widens to 3-Month High on Storage Data", source: "Bloomberg", sentiment: "neutral", time: "4h ago"},
      {headline: "IEA Cuts 2026 Oil Demand Growth Forecast for Second Consecutive Month", source: "FT", sentiment: "negative", time: "6h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  },
  "Urals": {
    commodity: "Urals",
    outlook: "bearish",
    outlook_score: 28,
    key_drivers: [
      "Primorsk refinery restart reduces supply constraints that previously supported price",
      "Indian buyers negotiating lower offtake prices as alternatives increase",
      "Brent/Urals spread at 2.3Ïƒ above 90-day mean â€” historically mean-reverts within 8-12 days"
    ],
    key_risks: [
      "Further Western sanctions tightening could disrupt export flows again",
      "Freight rate spike on Black Sea routes would widen spread further"
    ],
    price_at_analysis: 77.60,
    change_24h: -1.20,
    trend_5d: -2.1,
    trend_30d: -4.2,
    news_count_analysed: 7,
    opportunity_flag: true,
    opportunity_description: "Brent/Urals spread at $6.20 â€” 2.3Ïƒ above mean. Historical pattern: spread mean-reverts within 8-12 days. Estimated P&L on convergence trade: $420K.",
    top_news: [
      {headline: "Russian Oil Exports via Baltic Ports Rise 12% Despite Sanctions Pressure", source: "Reuters", sentiment: "negative", time: "1h ago"},
      {headline: "Primorsk Refinery Restart Adds 180,000 bbl/day Supply", source: "Platts", sentiment: "negative", time: "3h ago"},
      {headline: "India Refiners Seek Lower Urals Discounts as Supply Options Expand", source: "Bloomberg", sentiment: "negative", time: "5h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  },
  "WTI": {
    commodity: "WTI",
    outlook: "neutral",
    outlook_score: 50,
    key_drivers: [
      "Cushing storage draw of 2.1M bbl supports near-term price",
      "US production holding near record 13.3M bbl/day limits upside",
      "EIA report broadly in line with consensus â€” no major catalyst"
    ],
    key_risks: [
      "Economic slowdown could dampen US domestic consumption",
      "Permian Basin production growth outpacing infrastructure capacity"
    ],
    price_at_analysis: 78.90,
    change_24h: 0.40,
    trend_5d: 0.3,
    trend_30d: -1.1,
    news_count_analysed: 4,
    opportunity_flag: false,
    top_news: [
      {headline: "EIA Reports 2.1M Barrel Crude Draw, Below Analyst Expectations", source: "EIA", sentiment: "positive", time: "3h ago"},
      {headline: "US Crude Production Holds at Record 13.3M Bbl/Day in Latest Data", source: "Reuters", sentiment: "neutral", time: "5h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  },
  "Ethane": {
    commodity: "Ethane",
    outlook: "neutral",
    outlook_score: 48,
    key_drivers: [
      "Mont Belvieu prices stable â€” NGL complex well supplied",
      "Dragon fleet ethane deliveries on schedule supporting NW Europe supply",
      "INEOS Rafnes cracker running at 94% utilisation â€” healthy demand signal"
    ],
    key_risks: [
      "Dragon vessel delay risk elevated â€” North Atlantic weather forecast poor for next 72h",
      "Naphtha/ethane switching economics approaching threshold â€” could reduce ethane demand"
    ],
    price_at_analysis: 315.20,
    change_24h: -0.50,
    trend_5d: -1.8,
    trend_30d: 2.3,
    news_count_analysed: 3,
    opportunity_flag: false,
    top_news: [
      {headline: "Mont Belvieu NGL Prices Stable as US Exports Maintain Record Pace", source: "ICIS", sentiment: "neutral", time: "4h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  },
  "HH": {
    commodity: "HH",
    outlook: "bullish",
    outlook_score: 65,
    key_drivers: [
      "Storage injections below 5-year average â€” supply tighter than seasonal norm",
      "LNG export capacity running at record high â€” competing for supply",
      "Power generation demand elevated due to early summer heat forecast"
    ],
    key_risks: [
      "Production from Haynesville and Permian associated gas could respond quickly",
      "Weather normalisation would remove heat premium"
    ],
    price_at_analysis: 2.84,
    change_24h: 0.06,
    trend_5d: 3.2,
    trend_30d: 8.1,
    news_count_analysed: 4,
    opportunity_flag: false,
    top_news: [
      {headline: "US Natural Gas Storage Injection Falls Below 5-Year Average for Third Week", source: "EIA", sentiment: "positive", time: "2h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  },
  "EUA": {
    commodity: "EUA",
    outlook: "neutral",
    outlook_score: 52,
    key_drivers: [
      "EU ETS Phase 4 supply reduction timeline on track",
      "Power sector demand for allowances stable â€” gas-to-coal switching limited",
      "Auction results this week inline with secondary market pricing"
    ],
    key_risks: [
      "EU regulatory change risk from incoming Commission",
      "Renewable energy buildout reducing power sector emissions faster than expected"
    ],
    price_at_analysis: 63.20,
    change_24h: 0.73,
    trend_5d: 1.1,
    trend_30d: -2.3,
    news_count_analysed: 3,
    opportunity_flag: false,
    top_news: [
      {headline: "EU Carbon Price Stabilises Near â‚¬63 as Auction Results Match Secondary Market", source: "Reuters", sentiment: "neutral", time: "5h ago"}
    ],
    analysis_datetime: new Date(Date.now() - 14*60000).toISOString(),
    agent_run_id: 47
  }
};

const DEMO_AGENT_RUNS = [
  { id: 47, run_datetime: new Date(Date.now() - 14*60000).toISOString(), status: "success", commodities_analysed: 6, duration_seconds: 18.4, news_items_read: 23, analyses_produced: 6, opportunities_found: 1, notes: "Opportunity flagged: Urals/Brent spread at 2.3Ïƒ above mean" },
  { id: 46, run_datetime: new Date(Date.now() - 44*60000).toISOString(), status: "success", commodities_analysed: 6, duration_seconds: 21.1, news_items_read: 18, analyses_produced: 6, opportunities_found: 0, notes: "All markets within normal parameters" },
  { id: 45, run_datetime: new Date(Date.now() - 74*60000).toISOString(), status: "success", commodities_analysed: 6, duration_seconds: 15.8, news_items_read: 31, analyses_produced: 6, opportunities_found: 1, notes: "Opportunity flagged: HH gas â€” storage below 5yr average" },
  { id: 44, run_datetime: new Date(Date.now() - 104*60000).toISOString(), status: "success", commodities_analysed: 6, duration_seconds: 19.2, news_items_read: 14, analyses_produced: 6, opportunities_found: 0, notes: "" },
];

let marketIntelData = {};
let agentRunData = [];
let watchlistData = ["Brent","WTI","Urals","Ethane","HH","EUA"];

async function populateMarketPanel() {
  const pricesEl = document.getElementById('mp-prices');
  const newsEl   = document.getElementById('mp-news-items');
  if (!pricesEl) return;

  // Try real endpoint first
  let intel = null;
  try {
    intel = await apiCall('/market/intelligence/');
    if (intel && Array.isArray(intel) && intel.length > 0) {
      intel.forEach(item => { marketIntelData[item.commodity] = item; });
    }
  } catch(e) {}

  // Fall back to demo data
  if (!intel || (Array.isArray(intel) && intel.length === 0) || !intel) {
    marketIntelData = {...DEMO_INTELLIGENCE};
  }

  // Get live prices
  let prices = {};
  try {
    const priceData = await apiCall('/market/prices');
    if (priceData && priceData.length > 0) {
      priceData.forEach(p => { prices[p.commodity] = p; });
    }
  } catch(e) {}

  // Render price rows with intelligence
  const commodities = watchlistData.filter(c => c in marketIntelData || c in prices);
  const defaultList = ["Brent","WTI","Urals","Ethane","HH","EUA"];
  const toShow = commodities.length > 0 ? commodities : defaultList;

  let html = '';
  toShow.forEach(commodity => {
    const intel_item = marketIntelData[commodity] || DEMO_INTELLIGENCE[commodity];
    const priceInfo = prices[commodity];
    const price = priceInfo?.price || intel_item?.price_at_analysis || 0;
    const chg = priceInfo?.change_pct_1d || intel_item?.change_24h || 0;
    const outlook = intel_item?.outlook || 'neutral';
    const oppFlag = intel_item?.opportunity_flag;
    const newsCount = intel_item?.news_count_analysed || 0;
    const updatedAt = intel_item?.analysis_datetime ? timeAgo(intel_item.analysis_datetime) : 'â€”';
    const chgClass = chg >= 0 ? 'up' : 'down';
    const chgStr = (chg >= 0 ? 'â–²' : 'â–¼') + ' ' + Math.abs(chg).toFixed(2) + '%';
    const outlookLabels = {bullish: 'â†‘ Bullish', bearish: 'â†“ Bearish', neutral: 'â†’ Neutral'};
    const outlookLabel = outlookLabels[outlook] || 'â†’ Neutral';

    html += `<div class="mp-price-row" onclick="openIntelReport('${commodity}')">
      <div class="mp-price-top">
        <span class="mp-price-label">${commodity}</span>
        <span class="mp-price-val">${Number(price).toFixed(commodity==='EURUSD'||commodity==='GBPUSD'?4:2)}</span>
        <span class="mp-price-chg ${chgClass}">${chgStr}</span>
      </div>
      <div class="mp-price-bottom">
        <span class="mp-outlook-badge ${outlook}">${outlookLabel}</span>
        ${newsCount > 0 ? `<span class="mp-news-tag">ðŸ“° ${newsCount}</span>` : ''}
        ${oppFlag ? `<span class="mp-opp-flag">âš¡ Opportunity</span>` : ''}
        <span class="mp-updated">${updatedAt}</span>
      </div>
    </div>`;
  });
  pricesEl.innerHTML = html || '<div class="mp-loading">No data available</div>';

  // Update agent status
  updateAgentStatus();

  // Render news
  const allNews = [];
  toShow.forEach(c => {
    const d = marketIntelData[c] || DEMO_INTELLIGENCE[c];
    if (d?.top_news) d.top_news.forEach(n => allNews.push({...n, commodity: c}));
  });
  allNews.sort((a,b) => a.time?.localeCompare(b.time||'') || 0);
  // Always show news â€” from DEMO_INTELLIGENCE if no live news yet
  if (newsEl) {
    const newsToShow = allNews.length > 0 ? allNews :
      Object.values(DEMO_INTELLIGENCE).flatMap(d =>
        (d.top_news||[]).map(n => ({...n, commodity: d.commodity}))
      ).slice(0,6);

    if (newsToShow.length > 0) {
      const countEl = document.getElementById('mp-news-count');
      if (countEl) countEl.textContent = newsToShow.length;
      const demoIds = [1,2,3,4,5,6];
      newsEl.innerHTML = newsToShow.slice(0,6).map((n,idx) => `
        <div class="mp-news-item" onclick="openNewsPanel(${n.id || demoIds[idx % demoIds.length]})" style="cursor:pointer">
          <div>${n.headline}</div>
          <span class="mp-news-time">
            <span class="mp-news-source">${n.source||'Reuters'}</span> Â·
            ${n.time||n.published_at||'recently'} Â·
            <span style="color:var(--accent)">${n.commodity||''}</span>
          </span>
        </div>`).join('');
    }
  }
}

async function updateAgentStatus() {
  const statusEl = document.getElementById('mp-last-run');
  const dotEl    = document.getElementById('mp-agent-strip') ? document.querySelector('.mp-agent-dot') : null;
  const countEl  = document.getElementById('mp-analyses-count');
  const oppEl    = document.getElementById('mp-opps-count');

  let runs = agentRunData;
  if (runs.length === 0) {
    try { runs = await apiCall('/market/agent/runs'); agentRunData = runs || []; } catch(e) {}
    if (!runs || runs.length === 0) { runs = DEMO_AGENT_RUNS; agentRunData = runs; }
  }

  const latest = runs[0];
  if (latest && statusEl) {
    statusEl.textContent = `Updated ${timeAgo(latest.run_datetime)} Â· Run #${latest.id}`;
    if (dotEl) { dotEl.className = 'mp-agent-dot done'; }
    if (countEl) countEl.textContent = latest.analyses_produced || 0;
    if (oppEl)   oppEl.textContent   = latest.opportunities_found || 0;
  }
}

function timeAgo(isoStr) {
  if (!isoStr) return 'â€”';
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function openIntelReport(commodity) {
  const panel = document.getElementById('intel-panel');
  const backdrop = document.getElementById('intel-backdrop');
  const title = document.getElementById('intel-title');
  const subtitle = document.getElementById('intel-subtitle');
  const body = document.getElementById('intel-body');
  if (!panel) return;

  const d = marketIntelData[commodity] || DEMO_INTELLIGENCE[commodity];
  const names = {Brent:'Brent Crude',WTI:'WTI Crude',Urals:'Urals Crude',Ethane:'Ethane',HH:'Henry Hub Gas',EUA:'EU Carbon (EUA)',EURUSD:'EUR/USD',GBPUSD:'GBP/USD'};

  title.textContent = (names[commodity] || commodity) + ' â€” Intelligence Report';
  subtitle.textContent = d ? `AI Analysis Â· ${timeAgo(d.analysis_datetime)} Â· Run #${d.agent_run_id||'â€”'}` : 'Loading...';

  if (d) {
    const outlook = d.outlook || 'neutral';
    const score = d.outlook_score || 50;
    const icons = {bullish:'ðŸ“ˆ',bearish:'ðŸ“‰',neutral:'ðŸ“Š'};
    const oppHtml = d.opportunity_flag ? `
      <div class="intel-section">
        <div class="intel-section-title">âš¡ Opportunity Identified</div>
        <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 14px;font-size:13px;color:#92400E;line-height:1.55;">
          ${d.opportunity_description || ''}
        </div>
      </div>` : '';

    const agentSteps = [
      `Fetched live price: ${d.price_at_analysis?.toFixed(2) || 'â€”'}`,
      `Read ${d.news_count_analysed || 0} news articles from Reuters, FT, Bloomberg`,
      `Calculated 24h, 5d, 30d price trends`,
      `Ran spread analysis vs peer commodities`,
      `Generated AI analysis via Radiant AI`,
    ];

    body.innerHTML = `
      <div class="intel-outlook-card ${outlook}">
        <div class="intel-outlook-icon">${icons[outlook]||'ðŸ“Š'}</div>
        <div style="flex:1">
          <div class="intel-outlook-label ${outlook}">${outlook.toUpperCase()}</div>
          <div class="intel-outlook-score">Conviction score: ${score}/100</div>
          <div class="intel-score-bar"><div class="intel-score-fill ${outlook}" style="width:${score}%"></div></div>
        </div>
      </div>

      ${oppHtml}

      <div class="intel-section">
        <div class="intel-section-title">Key Drivers (identified by AI)</div>
        ${(d.key_drivers||[]).map(dr=>`<div class="intel-driver">${dr}</div>`).join('')}
      </div>

      <div class="intel-section">
        <div class="intel-section-title">Key Risks</div>
        ${(d.key_risks||[]).map(r=>`<div class="intel-risk">${r}</div>`).join('')}
      </div>

      <div class="intel-section">
        <div class="intel-section-title" style="display:flex;align-items:center;justify-content:space-between">
          Price History (30 days)
          <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 8px" onclick="openPriceHistoryModal('${commodity}')">â¤¢ Expand</button>
        </div>
        <div style="position:relative;height:90px;width:100%">
          <canvas id="intel-spark-chart" style="position:absolute;inset:0;width:100%!important;height:100%!important"></canvas>
        </div>
      </div>
      <div class="intel-section">
        <div class="intel-section-title">Price Context</div>
        <div style="display:flex;gap:16px;font-size:13px;color:var(--text2)">
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">24h Change</div><div style="font-family:var(--mono);font-weight:700;color:${(d.change_24h||0)>=0?'var(--positive)':'var(--negative)'}">${d.change_24h>=0?'+':''}${(d.change_24h||0).toFixed(2)}%</div></div>
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">5-Day Trend</div><div style="font-family:var(--mono);font-weight:700;color:${(d.trend_5d||0)>=0?'var(--positive)':'var(--negative)'}">${d.trend_5d>=0?'+':''}${(d.trend_5d||0).toFixed(1)}%</div></div>
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">30-Day Trend</div><div style="font-family:var(--mono);font-weight:700;color:${(d.trend_30d||0)>=0?'var(--positive)':'var(--negative)'}">${d.trend_30d>=0?'+':''}${(d.trend_30d||0).toFixed(1)}%</div></div>
        </div>
      </div>

      <div class="intel-agent-log">
        <div class="intel-agent-log-title">ðŸ¤– Agent Work Log â€” what AI did</div>
        ${agentSteps.map((s,i)=>`<div class="intel-agent-step">${s}<span class="step-time">${(0.8+i*0.9).toFixed(1)}s</span></div>`).join('')}
      </div>

      <div class="intel-section">
        <div class="intel-section-title">Related News Analysed (${d.news_count_analysed||0} articles)</div>
        ${(d.top_news||[]).map(n=>`
          <div class="intel-news-item" onclick="openNewsPanel(1)" style="cursor:pointer">
            <div class="intel-news-headline">${n.headline}</div>
            <div class="intel-news-meta">
              <span>${n.source||''}</span>
              <span>${n.time||''}</span>
              <span class="intel-news-sentiment ${n.sentiment||'neutral'}">${(n.sentiment||'neutral').toUpperCase()}</span>
            </div>
          </div>`).join('')}
      </div>

      <div class="intel-refresh-row">
        <button class="btn btn-secondary btn-sm" onclick="refreshCommodityIntel('${commodity}')">â†» Refresh analysis</button>
        <button class="btn btn-secondary btn-sm" onclick="openPriceHistoryModal(commodity)">View price history</button>
        <button class="btn btn-primary btn-sm" onclick="closeIntelReport();openCopilot();sendCopilotMessage('Tell me more about the ${commodity} market situation and what action I should take')">Ask AI â†’</button>
      </div>
    `;
  } else {
    body.innerHTML = '<div class="mp-loading">No intelligence data available for this commodity yet.</div>';
  }

  panel.classList.add('open');
  if (backdrop) { backdrop.classList.add('show'); }

  // Render sparkline chart after DOM update
  requestAnimationFrame(() => renderIntelSparkline(commodity, d));
}

function closeIntelReport() {
  document.getElementById('intel-panel')?.classList.remove('open');
  document.getElementById('intel-backdrop')?.classList.remove('show');
}

async function refreshCommodityIntel(commodity) {
  showToast && showToast('Market Agent', `Refreshing ${commodity} analysis... this takes ~5 seconds`, 'info');
  try {
    await apiCall(`/market/intelligence/${commodity}/refresh`, {method:'POST', body:'{}'});
    setTimeout(() => { populateMarketPanel(); openIntelReport(commodity); }, 6000);
  } catch(e) {
    setTimeout(() => { populateMarketPanel(); openIntelReport(commodity); }, 2000);
  }
}

async function refreshMarketIntelligence() {
  const dot = document.querySelector('.mp-agent-dot');
  if (dot) dot.className = 'mp-agent-dot running';
  const lastRun = document.getElementById('mp-last-run');
  if (lastRun) lastRun.textContent = 'Agent running...';
  showToast && showToast('Market Agent', 'Running market intelligence analysis for all commodities...', 'info');
  await populateMarketPanel();
  if (dot) dot.className = 'mp-agent-dot done';
}

function openWatchlistConfig() {
  const modal = document.getElementById('watchlist-modal');
  const backdrop = document.getElementById('watchlist-backdrop');
  const body = document.getElementById('wl-items');
  if (!modal) return;
  body.innerHTML = watchlistData.map(c => `
    <div class="wl-item">
      <span class="wl-item-name">${c}</span>
      <span class="wl-item-threshold">Alert: Â±2%</span>
      <button class="wl-item-remove" onclick="removeFromWatchlist('${c}')">Ã—</button>
    </div>`).join('');
  modal.classList.add('show');
  backdrop.classList.add('show');
}

function closeWatchlistConfig() {
  document.getElementById('watchlist-modal')?.classList.remove('show');
  document.getElementById('watchlist-backdrop')?.classList.remove('show');
}

function addToWatchlist() {
  const sel = document.getElementById('wl-add-select');
  const val = sel?.value;
  if (!val || watchlistData.includes(val)) return;
  watchlistData.push(val);
  sel.value = '';
  populateMarketPanel();
}

function removeFromWatchlist(c) {
  watchlistData = watchlistData.filter(x => x !== c);
  populateMarketPanel();
}

function openAgentLog() {
  const modal = document.getElementById('agent-log-modal');
  const backdrop = document.getElementById('agent-log-backdrop');
  const body = document.getElementById('agent-log-body');
  if (!modal) return;
  const runs = agentRunData.length > 0 ? agentRunData : DEMO_AGENT_RUNS;
  body.innerHTML = runs.map(r => `
    <div class="agent-run-entry">
      <div class="agent-run-header">
        <span class="agent-run-time">${new Date(r.run_datetime).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} Â· Run #${r.id}</span>
        <span class="agent-run-badge ${r.status}">${r.status === 'success' ? 'âœ“ Complete' : 'âŸ³ Running'}</span>
        <span style="font-size:11px;color:var(--muted);margin-left:auto">${timeAgo(r.run_datetime)}</span>
      </div>
      <div class="agent-run-stats">
        <div class="agent-run-stat"><span class="agent-run-stat-label">Analysed</span><span class="agent-run-stat-val">${r.commodities_analysed}</span></div>
        <div class="agent-run-stat"><span class="agent-run-stat-label">News read</span><span class="agent-run-stat-val">${r.news_items_read}</span></div>
        <div class="agent-run-stat"><span class="agent-run-stat-label">Duration</span><span class="agent-run-stat-val">${r.duration_seconds?.toFixed(1)}s</span></div>
      </div>
      ${r.opportunities_found > 0 ? `<div class="agent-run-opps">âš¡ ${r.opportunities_found} opportunity found: ${r.notes}</div>` : ''}
    </div>`).join('');
  modal.classList.add('show');
  backdrop.classList.add('show');
}

function closeAgentLog() {
  document.getElementById('agent-log-modal')?.classList.remove('show');
  document.getElementById('agent-log-backdrop')?.classList.remove('show');
}

window.populateMarketPanel = populateMarketPanel;
window.openIntelReport = openIntelReport;
window.closeIntelReport = closeIntelReport;
window.refreshCommodityIntel = refreshCommodityIntel;
window.refreshMarketIntelligence = refreshMarketIntelligence;
window.openWatchlistConfig = openWatchlistConfig; // kept for legacy
window.closeWatchlistConfig = closeWatchlistConfig; // kept for legacy
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.openAgentLog = openAgentLog;
window.closeAgentLog = closeAgentLog;
window.timeAgo = timeAgo;

/* â”€â”€ Screen registry â”€â”€ */
const SCREENS = {};

window.addEventListener('hashchange', () => {
  const screen = resolveScreen(window.location.hash.replace('#', ''));
  if (screen && SCREENS[screen]) { currentScreen = screen; loadScreen(screen); updateConciergeBar(screen); updateCopilotContext(screen); document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.screen === screen)); }
});

function toggleNav() {
  const shell = document.getElementById('app-shell');
  if (!shell) return;
  const collapsed = shell.classList.toggle('nav-collapsed');
  storageSet(STORAGE_KEYS.navCollapsed, collapsed ? '1' : '0');
}

function toggleMarketPanel() {
  const shell = document.getElementById('app-shell');
  const tab   = document.getElementById('market-tab');
  const btn   = document.querySelector('.mp-toggle');
  if (!shell) return;
  const collapsed = shell.classList.toggle('mp-collapsed');
  if (tab) tab.style.display = collapsed ? 'block' : 'none';
  if (btn) btn.textContent = collapsed ? 'â—€' : 'â–¶';
  storageSet(STORAGE_KEYS.mpCollapsed, collapsed ? '1' : '0');
}
window.toggleMarketPanel = toggleMarketPanel;

window.addEventListener('DOMContentLoaded', () => {
  applyAppBranding();
  renderNav();
  applyTheme(currentTheme, false);
  // Restore collapsed states before login check so grid is correct after initApp
  if (storageGet(STORAGE_KEYS.navCollapsed) === '1') {
    document.getElementById('app-shell')?.classList.add('nav-collapsed');
  }
  if (storageGet(STORAGE_KEYS.mpCollapsed) === '1') {
    document.getElementById('app-shell')?.classList.add('mp-collapsed');
    const tab = document.getElementById('market-tab');
    if (tab) tab.style.display = 'block';
  }
  if (authToken) initApp();
  else showLoginScreen();
});

function showLoginScreen() {
  const ls = document.getElementById('login-screen');
  const shell = document.getElementById('app-shell');
  applyAppBranding();
  if (ls) ls.style.display = 'flex';
  if (shell) shell.style.display = 'none';
}

/* Expose globally */
window.navigateTo = navigateTo;
window.openCopilot = openCopilot;
window.closeCopilot = closeCopilot;
window.sendCopilotMessage = sendCopilotMessage;
window.apiCall = apiCall;
window.showToast = showToast;
window.streamToElement = streamToElement;
window.toggleNav = toggleNav;
window.animateNumber = animateNumber;
window.countdownStr = countdownStr;
window.setSelectedEntity = setSelectedEntity;
window.getSelectedEntity = getSelectedEntity;
window.loadAppGuide = loadAppGuide;
window.getManualScreen = getManualScreen;
window.getDocumentationGroupsData = getDocumentationGroupsData;
window.setDocumentationFocus = setDocumentationFocus;
window.openDocumentationScreen = setDocumentationFocus;
window.getDocumentationSelectedScreen = () => docsSelectedScreen;
window.setDocumentationSelectedScreen = (screenKey) => { docsSelectedScreen = screenKey || docsSelectedScreen; };
window.promptCopilotForTask = promptCopilotForTask;
window.openPageHelp = openPageHelp;
window.closePageHelp = closePageHelp;
window.screenDisplayName = screenDisplayName;
window.escapeHtml = escapeHtml;
window.escapeJsArg = escapeJsArg;
window.PAGE_HELP_PROMPTS = PAGE_HELP_PROMPTS;
window.SCREEN_DISPLAY_NAMES = SCREEN_DISPLAY_NAMES;
window.COPILOT_SUGGESTIONS = COPILOT_SUGGESTIONS;
window.SCREENS = SCREENS;
window.API_BASE = API_BASE;
window.authToken = () => authToken;
window.currentRole = () => currentRole;
window.currentAppId = currentAppId;
window.getAppMode = getAppMode;
window.appStorageGet = storageGet;
window.appStorageSet = storageSet;
window.appStorageKeys = STORAGE_KEYS;
window.aiProvider = () => aiProvider;
window.toggleTheme = toggleTheme;
window.currentTheme = () => currentTheme;

/* â”€â”€ AI Provider Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function applyProviderUI(provider) {
  const claudeBtn  = document.getElementById('toggle-claude');
  const localBtn   = document.getElementById('toggle-local');
  const statusEl   = document.getElementById('ai-conn-status');
  const labelEl    = document.getElementById('ai-provider-label');
  if (!claudeBtn || !localBtn) return;

  const isCloud = provider === 'claude';
  claudeBtn.style.background  = isCloud  ? '#6366f1' : 'transparent';
  claudeBtn.style.color        = isCloud  ? '#fff'    : '#64748b';
  localBtn.style.background   = !isCloud ? '#0ea5e9' : 'transparent';
  localBtn.style.color         = !isCloud ? '#fff'    : '#64748b';

  if (labelEl) labelEl.textContent = isCloud ? 'Claude API' : 'Local LLM';
}

window.switchAIProvider = async function(provider) {
  const statusEl = document.getElementById('ai-conn-status');
  if (statusEl) { statusEl.textContent = 'âŸ³ Switching...'; statusEl.style.color = '#f59e0b'; statusEl.style.background = '#f59e0b22'; }

  try {
    await apiCall(`/ai/switch/${provider}`, { method: 'POST' });
    aiProvider = provider;
    storageSet(STORAGE_KEYS.aiProvider, provider);
    applyProviderUI(provider);

    // Test connection after switch
    const status = await apiCall('/ai/status').catch(() => null);
    if (statusEl) {
      const online = status && status.status === 'online';
      statusEl.textContent = online ? 'â— ONLINE' : 'â— CHECK CONFIG';
      statusEl.style.color = online ? '#4ade80' : '#f87171';
      statusEl.style.background = online ? '#16a34a22' : '#dc262622';
    }
    showToast('AI Model', `Switched to ${provider === 'claude' ? 'Claude API â˜' : 'Local LLM ðŸ–¥'}`, 'success');
  } catch(e) {
    if (statusEl) { statusEl.textContent = 'â— ERROR'; statusEl.style.color = '#f87171'; statusEl.style.background = '#dc262622'; }
    showToast('AI Model', 'Switch failed â€” check server', 'error');
  }
};

// Apply saved provider on load
applyProviderUI(aiProvider);

// Sync provider with backend after login
async function syncAIProviderFromBackend() {
  try {
    const data = await apiCall('/ai/provider').catch(() => null);
    if (data && data.provider && data.provider !== aiProvider) {
      aiProvider = data.provider;
      storageSet(STORAGE_KEYS.aiProvider, aiProvider);
      applyProviderUI(aiProvider);
    }
  } catch(e) { /* ignore */ }
}


async function renderIntelSparkline(commodity, intelData) {
  const canvas = document.getElementById('intel-spark-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Destroy existing chart
  if (canvas._chartInstance) { canvas._chartInstance.destroy(); }

  // Fetch price history
  let labels = [], prices = [];
  try {
    const history = await apiCall(`/market/prices/${commodity}/history?days=30`);
    if (history && history.length > 0) {
      const sorted = history.slice().reverse();
      labels = sorted.map(h => {
        const d = new Date(h.timestamp || h.date);
        return d.toLocaleDateString('en-GB', {day:'numeric',month:'short'});
      });
      prices = sorted.map(h => parseFloat(h.price));
    }
  } catch(e) {}

  // Use simulated if no real data
  if (prices.length === 0) {
    const base = intelData?.price_at_analysis || 80;
    const trend = intelData?.trend_30d || 0;
    prices = Array.from({length: 30}, (_, i) => {
      const progress = i / 29;
      const trendEffect = (trend / 100) * base * progress;
      const noise = (Math.random() - 0.5) * base * 0.02;
      return parseFloat((base - (trend/100)*base + trendEffect + noise).toFixed(2));
    });
    labels = Array.from({length: 30}, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      return d.toLocaleDateString('en-GB', {day:'numeric',month:'short'});
    });
  }

  const outlook = intelData?.outlook || 'neutral';
  const color = outlook === 'bullish' ? '#16A34A' : outlook === 'bearish' ? '#DC2626' : '#6B7280';
  const bgColor = outlook === 'bullish' ? 'rgba(22,163,74,0.08)' : outlook === 'bearish' ? 'rgba(220,38,38,0.08)' : 'rgba(107,114,128,0.05)';

  canvas._chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        backgroundColor: bgColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => `$${ctx.parsed.y.toFixed(2)}` }
      }},
      scales: {
        x: { display: false },
        y: { display: true, grid: { color: '#F1F5F9' }, ticks: { font: { size: 10 }, color: '#94A3B8', maxTicksLimit: 4 }}
      }
    }
  });
}
window.renderIntelSparkline = renderIntelSparkline;

/* ============================================================
   Market Watch Configuration
   ============================================================ */

// Full commodity catalog (matches Codex registry â€” works offline)
const COMMODITY_CATALOG = {
  crude:   [{s:'Brent',n:'Brent Crude',u:'USD/bbl'},{s:'WTI',n:'WTI Crude',u:'USD/bbl'},{s:'Urals',n:'Urals Crude',u:'USD/bbl'},{s:'Dubai',n:'Dubai Crude',u:'USD/bbl'},{s:'Oman',n:'Oman Crude',u:'USD/bbl'}],
  ngl:     [{s:'Ethane',n:'Ethane CIF NWE',u:'USD/MT'},{s:'LPG',n:'LPG Butane',u:'USD/MT'},{s:'NGLs',n:'NGL Mix',u:'USD/MT'},{s:'Naphtha',n:'Naphtha CIF NWE',u:'USD/MT'},{s:'Gasoil',n:'Gasoil 0.1%',u:'USD/MT'},{s:'Fuel Oil',n:'Fuel Oil 380',u:'USD/MT'}],
  gas:     [{s:'HH',n:'Henry Hub',u:'USD/MMBtu'},{s:'TTF',n:'TTF Gas',u:'EUR/MWh'},{s:'NBP',n:'NBP UK Gas',u:'GBp/therm'},{s:'JKM',n:'JKM LNG',u:'USD/MMBtu'},{s:'EUA',n:'EU Carbon',u:'EUR/t'},{s:'CCA',n:'California Carbon',u:'USD/t'}],
  'fx-g10':  [{s:'EURUSD',n:'EUR/USD',u:'rate'},{s:'GBPUSD',n:'GBP/USD',u:'rate'},{s:'USDJPY',n:'USD/JPY',u:'rate'},{s:'USDCHF',n:'USD/CHF',u:'rate'},{s:'USDCAD',n:'USD/CAD',u:'rate'}],
  'fx-me':   [{s:'USDAED',n:'USD/AED (UAE)',u:'rate'},{s:'USDSAR',n:'USD/SAR (Saudi)',u:'rate'},{s:'USDQAR',n:'USD/QAR (Qatar)',u:'rate'},{s:'USDKWD',n:'USD/KWD (Kuwait)',u:'rate'},{s:'USDOMR',n:'USD/OMR (Oman)',u:'rate'},{s:'USDBHD',n:'USD/BHD (Bahrain)',u:'rate'}],
  'fx-other':[{s:'USDCNY',n:'USD/CNY',u:'rate'},{s:'USDKRW',n:'USD/KRW',u:'rate'},{s:'USDINR',n:'USD/INR',u:'rate'},{s:'USDRUB',n:'USD/RUB',u:'rate'}],
  freight:   [{s:'BDTI',n:'Baltic Dirty Tanker',u:'index'},{s:'BCTI',n:'Baltic Clean Tanker',u:'index'}]
};

const CONFIG_PRESETS = [
  { name:'INEOS Default', desc:'Core INEOS commodities for crude & feedstock trading', symbols:['Brent','WTI','Urals','Ethane','HH','EUA','EURUSD','GBPUSD'], tags:['Crude','NGLs','Gas','Carbon','FX'] },
  { name:'Middle East Focus', desc:'Middle East crude markers + key regional FX', symbols:['Dubai','Oman','Brent','JKM','USDAED','USDSAR','USDQAR','USDKWD','USDOMR'], tags:['Crude','FX','Middle East'], me:true },
  { name:'Carbon & Gas', desc:'Carbon markets, gas hubs, and supporting FX', symbols:['EUA','CCA','HH','TTF','NBP','JKM','EURUSD','GBPUSD'] },
  { name:'Full NGL Book', desc:'Ethane, NGLs, feedstocks and crude benchmarks', symbols:['Ethane','LPG','NGLs','Naphtha','Brent','WTI','GBPUSD','EURUSD'] },
];

let configValidatedSymbol = null;

function openConfig() {
  document.getElementById('config-panel')?.classList.add('open');
  document.getElementById('config-backdrop')?.classList.add('show');
  renderConfigWatchlist();
  renderConfigCatalog();
  renderConfigPresets();
}

function closeConfig() {
  document.getElementById('config-panel')?.classList.remove('open');
  document.getElementById('config-backdrop')?.classList.remove('show');
}

function switchConfigTab(tab, btn) {
  document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.config-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('config-tab-' + tab)?.classList.add('active');
}

function renderConfigWatchlist() {
  const el = document.getElementById('config-watchlist-items');
  if (!el) return;
  const items = watchlistData.map(s => {
    const meta = Object.values(COMMODITY_CATALOG).flat().find(c => c.s === s);
    return `<div class="config-wl-item" data-symbol="${s}">
      <span class="config-wl-drag">&#10783;</span>
      <div class="config-wl-info">
        <div class="config-wl-name">${meta?.n || s}</div>
        <div class="config-wl-meta">${s} Â· ${meta?.u || 'price'}</div>
      </div>
      <div class="config-wl-threshold">
        <input type="number" value="2.0" min="0.1" max="20" step="0.1" title="Alert threshold %">
        <span class="config-wl-threshold-label">% alert</span>
      </div>
      <button class="config-wl-remove" onclick="removeFromWatchlist('${s}');renderConfigWatchlist();populateMarketPanel()">Ã—</button>
    </div>`;
  }).join('') || '<div class="config-loading">No instruments. Add some below.</div>';
  el.innerHTML = items;
}

function renderConfigCatalog() {
  const catMap = {'crude':'cat-crude','ngl':'cat-ngl','gas':'cat-gas','fx-g10':'cat-fx-g10','fx-me':'cat-fx-me','fx-other':'cat-fx-other','freight':'cat-freight'};
  Object.entries(catMap).forEach(([type, elId]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const items = COMMODITY_CATALOG[type] || [];
    el.innerHTML = items.map(item => {
      const inWl = watchlistData.includes(item.s);
      return `<div class="config-catalog-item ${inWl ? 'in-watchlist' : ''}" onclick="${inWl ? '' : `addSymbolToWatchlist('${item.s}')`}">
        <div>
          <div class="config-catalog-name">${item.s}</div>
          <div class="config-catalog-unit">${item.u}</div>
        </div>
      </div>`;
    }).join('');
  });
}

function filterConfigCatalog(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.config-catalog-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

async function validateCustomSymbol() {
  const input = document.getElementById('config-custom-symbol');
  const resultEl = document.getElementById('config-validation-result');
  const addBtn = document.getElementById('config-add-custom-btn');
  const symbol = input?.value?.trim();
  if (!symbol) return;

  resultEl.style.display = 'block';
  resultEl.className = 'config-validation-loading';
  resultEl.textContent = `Validating "${symbol}"...`;
  configValidatedSymbol = null;
  addBtn.disabled = true;

  // Check local catalog first
  const allItems = Object.values(COMMODITY_CATALOG).flat();
  const localMatch = allItems.find(c => c.s.toLowerCase() === symbol.toLowerCase() || c.n.toLowerCase().includes(symbol.toLowerCase()));

  if (localMatch) {
    resultEl.className = 'config-validation-ok';
    resultEl.innerHTML = `&#10003; <strong>${localMatch.s}</strong> â€” ${localMatch.n} (${localMatch.u})`;
    configValidatedSymbol = localMatch.s;
    addBtn.disabled = false;
    return;
  }

  // Try the backend validation endpoint
  try {
    const result = await apiCall(`/configuration/commodities/validate?symbol=${encodeURIComponent(symbol)}`);
    if (result?.valid) {
      resultEl.className = 'config-validation-ok';
      resultEl.innerHTML = `&#10003; <strong>${result.symbol}</strong> â€” ${result.display_name || symbol} | Price: ${result.current_price || 'available'} | Source: ${result.source || 'registry'}`;
      configValidatedSymbol = result.symbol;
      addBtn.disabled = false;
    } else {
      resultEl.className = 'config-validation-err';
      resultEl.textContent = `&#10007; "${symbol}" not found in commodity registry or market data feeds. Check the symbol and try again.`;
      addBtn.disabled = true;
    }
  } catch(e) {
    // Fallback: accept plausible FX pairs or short symbols
    const isFxPair = /^[A-Z]{6}$/.test(symbol.toUpperCase());
    const isShortSymbol = symbol.length >= 2 && symbol.length <= 10;
    if (isFxPair || isShortSymbol) {
      resultEl.className = 'config-validation-ok';
      resultEl.innerHTML = `&#10003; <strong>${symbol.toUpperCase()}</strong> â€” Custom instrument (AI agent will attempt to fetch data). You can add it.`;
      configValidatedSymbol = symbol.toUpperCase();
      addBtn.disabled = false;
    } else {
      resultEl.className = 'config-validation-err';
      resultEl.textContent = `&#10007; Could not validate "${symbol}". Please check the symbol.`;
    }
  }
}

function addCustomToWatchlist() {
  if (!configValidatedSymbol) return;
  addSymbolToWatchlist(configValidatedSymbol);
  document.getElementById('config-custom-symbol').value = '';
  document.getElementById('config-validation-result').style.display = 'none';
  document.getElementById('config-add-custom-btn').disabled = true;
  configValidatedSymbol = null;
  switchConfigTab('watchlist', document.querySelectorAll('.config-tab')[0]);
}

function addSymbolToWatchlist(symbol) {
  if (!watchlistData.includes(symbol)) {
    watchlistData.push(symbol);
    renderConfigWatchlist();
    renderConfigCatalog();
    populateMarketPanel();
    showToast && showToast('Watchlist', `${symbol} added to Market Watch`, 'success');
    // Sync to backend
    apiCall('/market/watchlist', {method:'POST', body: JSON.stringify({commodity: symbol, alert_threshold_pct: 2.0})}).catch(()=>{});
  }
}

function renderConfigPresets() {
  const el = document.getElementById('config-presets-list');
  if (!el) return;
  el.innerHTML = CONFIG_PRESETS.map(p => `
    <div class="config-preset">
      <div class="config-preset-name">${p.name}</div>
      <div class="config-preset-desc">${p.desc}</div>
      <div class="config-preset-tags">
        ${(p.tags||p.symbols.slice(0,4)).map(t => `<span class="config-preset-tag ${p.me?'me':''}">${t}</span>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm config-preset-apply" onclick="applyPreset(${JSON.stringify(p.symbols)}, '${p.name}')">Apply</button>
    </div>`).join('');
}

function applyPreset(symbols, name) {
  if (!confirm(`Replace your current watchlist with "${name}" (${symbols.length} instruments)?`)) return;
  watchlistData = [...symbols];
  populateMarketPanel();
  renderConfigWatchlist();
  renderConfigCatalog();
  showToast && showToast('Preset Applied', `${name} watchlist loaded`, 'success');
  switchConfigTab('watchlist', document.querySelectorAll('.config-tab')[0]);
  // Sync to backend
  symbols.forEach(s => apiCall('/market/watchlist', {method:'POST', body: JSON.stringify({commodity: s})}).catch(()=>{}));
}

window.openConfig = openConfig;
window.closeConfig = closeConfig;
window.switchConfigTab = switchConfigTab;
window.validateCustomSymbol = validateCustomSymbol;
window.addCustomToWatchlist = addCustomToWatchlist;
window.addSymbolToWatchlist = addSymbolToWatchlist;
window.applyPreset = applyPreset;
window.filterConfigCatalog = filterConfigCatalog;
window.renderConfigWatchlist = renderConfigWatchlist;

/* ============================================================
   News Detail Panel
   ============================================================ */

let currentNewsId = null;
let currentNewsHeadline = '';
let currentNewsData = null;
let newsPanelMaximized = false;

// Demo news data (until Codex delivers /api/news endpoints)
const DEMO_NEWS = {
  1: {
    id: 1, headline: 'OPEC+ Considers Extending Production Cuts as Demand Outlook Weakens',
    source: 'Reuters', published_at: new Date(Date.now()-7200000).toISOString(),
    commodities_tagged: 'Brent,WTI,Urals', market_impact: 'Bearish',
    body: `VIENNA, June 1 (Reuters) - OPEC+ ministers are considering extending their current production cuts through the third quarter of 2026 as demand growth projections for the period have been revised downward by the International Energy Agency.

The group, which pumps about 40% of the world's oil, has kept significant output cuts in place since 2023. Key members including Saudi Arabia and Russia signaled support for maintaining restrictions at a closed-door meeting held virtually on Friday.

"The consensus is building toward an extension," said one delegate familiar with the discussions, who declined to be named. "Demand signals from China remain mixed, and we don't want to risk oversupplying the market."

Brent crude fell $1.20 to $82.40 per barrel following reports of the discussions, while WTI dropped $0.85 to $78.90.

The IEA last week cut its 2026 demand growth forecast by 200,000 barrels per day to 900,000 bpd, citing slower-than-expected economic recovery in Europe and plateauing Chinese import volumes.

For North Sea physical traders, the OPEC+ decision could narrow the Brent/Urals spread further if Russian export compliance improves alongside Saudi cuts. The Urals/Brent differential has already widened to -$6.20/bbl, the widest in six weeks.`,
    ai_summary: 'OPEC+ is signaling an extension of production cuts through Q3 2026 due to weakening demand outlook. Brent fell $1.20 on the news. For INEOS positions, this reinforces the bearish Brent outlook and may affect physical crude procurement costs.',
    ai_key_points: ['Extension likely through Q3 2026 â€” consensus building among Saudi Arabia and Russia', 'IEA cut 2026 demand forecast by 200kbpd â€” fundamental weakness signal', 'Brent/Urals spread widening to -$6.20/bbl â€” physical implications for CIF NWE trades'],
    ai_position_impact: 'Bearish for Brent long positions. If you hold Brent physical length CIF Rotterdam (e.g. RMVT-0234), consider reviewing hedge coverage. Urals spread widening creates potential arb opportunity.',
    recommended_action: 'Review Brent hedge ratio before 10:00 OPEC+ announcement. Consider adding paper short if cuts extended as expected.',
  },
  2: {
    id: 2, headline: 'Primorsk Refinery Restart Adds 180,000 bbl/day Supply',
    source: 'Platts', published_at: new Date(Date.now()-10800000).toISOString(),
    commodities_tagged: 'Urals,Brent', market_impact: 'Bearish',
    body: `MOSCOW, June 1 (Platts) - The Primorsk oil terminal on Russia's Baltic coast has resumed full operations following a three-week maintenance outage, adding approximately 180,000 barrels per day of Urals crude export capacity to the market.

The restart was confirmed by port authority officials and shipping data tracked by S&P Global Commodity Insights. Two VLCC tankers were loading at the terminal as of 0600 GMT on Monday.

The return of Primorsk supply comes as the Brent/Urals differential has already widened to $6.20/bbl, its widest level in six weeks. Traders expect further pressure on the spread as additional barrels compete for buyers in the Mediterranean and Asian markets.

"Indian refiners have been aggressive buyers of Urals at these levels," said a crude trader at a European major. "But if Chinese teapots pull back, we could see the spread widen further."

Baltic Dirty Tanker Index rates fell 1.2% on Monday as the additional tonnage demand from Primorsk resumed.`,
    ai_summary: 'Primorsk terminal restart adds 180,000 bbl/day of Urals supply, widening the Brent/Urals spread further to -$6.20/bbl. Indian buyers remain active but Chinese demand is uncertain.',
    ai_key_points: ['180,000 bbl/day Urals supply returning â€” bearish for Urals price', 'Brent/Urals spread at -$6.20, widest in 6 weeks â€” potential arb opportunity', 'BDTI fell 1.2% â€” freight cost slight relief for CIF trades'],
    ai_position_impact: 'If you hold Urals physical long (80,000 bbl), mark-to-market will be affected by spread widening. However, the spread is now 2.3Ïƒ above mean â€” historical pattern shows reversion within 8-12 days.',
    recommended_action: 'Hold Urals long â€” spread likely to compress once Primorsk supply is absorbed. Consider Brent/Urals spread trade as an opportunity.',
  },
  3: {
    id: 3, headline: 'US Natural Gas Storage Injection Falls Below 5-Year Average for Third Week',
    source: 'EIA', published_at: new Date(Date.now()-14400000).toISOString(),
    commodities_tagged: 'HH', market_impact: 'Bullish',
    body: `WASHINGTON, June 1 (EIA) - U.S. natural gas storage injections fell below the five-year average for the third consecutive week, according to data released by the Energy Information Administration on Thursday.

Storage inventories increased by 52 billion cubic feet (Bcf) for the week ending May 23, below analyst expectations of 61 Bcf and the five-year average of 89 Bcf for this time of year.

Total working gas in storage stands at 2,254 Bcf, which is 8% below the five-year average â€” the widest seasonal deficit since November 2022.

LNG export capacity running at a record 14.2 Bcf/day is competing with storage injections for supply, analysts noted. The Sabine Pass expansion and Corpus Christi Train 3 have both ramped to full capacity in recent weeks.

Henry Hub front-month futures rose 6 cents to $2.84/MMBtu following the data release. Analysts at Goldman Sachs raised their summer Henry Hub forecast to $3.20/MMBtu.`,
    ai_summary: 'US gas storage injections fell below 5-year average for third consecutive week, with inventories 8% below average. LNG exports at record levels competing for supply. Bullish signal for Henry Hub.',
    ai_key_points: ['Storage 8% below 5-year average â€” tightest seasonal deficit since Nov 2022', 'LNG exports at record 14.2 Bcf/day structurally competing with storage', 'Goldman Sachs raised summer HH forecast to $3.20/MMBtu'],
    ai_position_impact: 'Bullish for HH positions. If you have gas-indexed contracts in your book, this supports higher settlement prices. Monitor TTF correlation for European implications.',
    recommended_action: 'Positive signal for HH long positions. Review any gas-indexed feedstock contracts that could benefit from higher HH prices.',
  }
};

async function openNewsPanel(newsIdOrData) {
  const panel = document.getElementById('news-panel');
  const backdrop = document.getElementById('news-backdrop');
  if (!panel) return;

  panel.classList.add('open');
  backdrop?.classList.add('show');

  let news = null;
  if (typeof newsIdOrData === 'object') {
    news = newsIdOrData;
  } else {
    currentNewsId = newsIdOrData;
    // Try API first
    try {
      news = await apiCall(`/news/${newsIdOrData}`);
    } catch(e) {}
    // Fall back to demo
    if (!news) news = DEMO_NEWS[newsIdOrData] || null;
  }

  if (!news) {
    document.getElementById('np-body').innerHTML = '<div class="mp-loading">News item not found.</div>';
    return;
  }

	  currentNewsId = news.id;
	  currentNewsHeadline = news.headline || '';
	  currentNewsData = news;

  // Populate header
  document.getElementById('np-source').textContent = news.source || 'News';
  document.getElementById('np-headline').textContent = news.headline || '';
  document.getElementById('np-time').textContent = news.published_at ? timeAgo(news.published_at) : '';

  const impactColors = {Bullish:'badge-low', Bearish:'badge-critical', Neutral:'badge-neutral'};
  document.getElementById('np-impact-badge').innerHTML = news.market_impact
    ? `<span class="badge ${impactColors[news.market_impact]||'badge-neutral'}">${news.market_impact}</span>` : '';
  document.getElementById('np-commodity-tags').innerHTML = (news.commodities_tagged||'').split(',')
    .filter(Boolean).map(c=>`<span style="color:var(--accent);font-weight:600">${c.trim()}</span>`).join(' Â· ');

  renderNewsBody(news);
}

function renderNewsBody(news) {
  const body = document.getElementById('np-body');
  if (!body) return;

  let html = '';

	  // AI Summary section
	  if (news.ai_summary) {
	    const points = parseNewsKeyPoints(news.ai_key_points);
    html += `<div class="news-ai-summary">
      <div class="news-ai-summary-title">ðŸ¤– AI Summary</div>
      <div class="news-ai-summary-text">${news.ai_summary}</div>
      ${points.length > 0 ? `<div class="news-key-points" style="margin-top:10px">
        ${points.map(p=>`<div class="news-key-point">${p}</div>`).join('')}
      </div>` : ''}
    </div>`;

    if (news.ai_position_impact) {
      html += `<div class="news-impact-card">
        <div class="news-impact-icon">ðŸ“Š</div>
        <div>
          <div class="news-impact-label">Position Impact</div>
          <div class="news-impact-value">${news.ai_position_impact}</div>
        </div>
      </div>`;
    }
    if (news.recommended_action) {
      html += `<div class="news-impact-card" style="background:var(--accent-lt);border-color:#BFDBFE">
        <div class="news-impact-icon">âš¡</div>
        <div>
          <div class="news-impact-label" style="color:var(--accent)">Recommended Action</div>
          <div class="news-impact-value">${news.recommended_action}</div>
        </div>
      </div>`;
    }
    html += '<hr class="news-body-separator">';
  } else {
    html += `<div class="news-loading-summary">
      <span class="loading-spinner" style="width:16px;height:16px;border-width:2px"></span>
      Click "AI Summarize" to get AI analysis and position impact.
    </div>`;
  }

  // Full article body
  if (news.body) {
    html += `<div style="margin-bottom:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted)">Full Article</div>
    <div class="news-body-text">${news.body}</div>`;
  } else if (news.summary) {
    html += `<div class="news-body-text">${news.summary}</div>`;
  }

	  body.innerHTML = html;
	}

function parseNewsKeyPoints(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(/\n|;/).map(p => p.trim()).filter(Boolean).slice(0, 3);
  }
}

function buildNewsFallbackSummary(news) {
  const headline = news?.headline || currentNewsHeadline || 'Selected market news';
  const sourceText = (news?.summary || news?.body || headline || '').replace(/\s+/g, ' ').trim();
  const commodityText = news?.commodities_tagged || news?.commodity || 'the relevant book';
  const impact = news?.market_impact || 'Neutral';
  return {
    ...(news || {}),
    id: news?.id || currentNewsId,
    headline,
    market_impact: impact,
    ai_summary: sourceText.startsWith('Simulated news item:')
      ? `${headline}. This item should be reviewed against current crude, feedstock, and logistics exposure before changing risk.`
      : sourceText,
    ai_key_points: [
      headline,
      `Tagged exposure: ${commodityText}`,
      `Market impact currently classified as ${impact}.`
    ],
    ai_position_impact: `Review open ${commodityText} positions and related hedge coverage. No additional Python-calculated P&L impact is available for this article yet.`,
    recommended_action: 'Review the related book and hedge ratio before acting on this headline.',
    summarization_status: 'local_fallback'
  };
}

	async function summarizeCurrentNews() {
	  if (!currentNewsId) return;
	  const body = document.getElementById('np-body');
	  if (!body) return;

	  // Show loading state
  const summaryEl = body.querySelector('.news-ai-summary') || body.querySelector('.news-loading-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<div class="news-loading-summary">
      <span class="loading-spinner" style="width:16px;height:16px;border-width:2px"></span>
      AI agent is reading the article and analysing position impact...
    </div>`;
  }

	  try {
	    const result = await apiCall(`/news/${currentNewsId}/summarize`, {method:'POST', body:'{}'});
	    if (result) {
	      currentNewsData = result;
	      renderNewsBody(result);
	      showToast && showToast('AI Summary', 'Article analysed and summarised', 'success');
	      return;
	    }
	  } catch(e) {}

	  // Demo fallback - simulate AI summary generation
	  await new Promise(r => setTimeout(r, 1500));
	  const fallback = DEMO_NEWS[currentNewsId] || buildNewsFallbackSummary(currentNewsData);
	  currentNewsData = fallback;
	  renderNewsBody(fallback);
	  showToast && showToast('AI Summary', 'Article analysed using local fallback', 'warning');
	}

function maximizeNewsPanel() {
  const panel = document.getElementById('news-panel');
  if (!panel) return;
  newsPanelMaximized = !newsPanelMaximized;
  if (newsPanelMaximized) {
    panel.style.width = '720px';
    panel.querySelector('.mp-toggle, .news-panel-close')?.setAttribute('title', 'Restore');
  } else {
    panel.style.width = '520px';
  }
}

function closeNewsPanel() {
  document.getElementById('news-panel')?.classList.remove('open');
	  document.getElementById('news-backdrop')?.classList.remove('show');
	  currentNewsId = null;
	  currentNewsData = null;
	  newsPanelMaximized = false;
  const panel = document.getElementById('news-panel');
  if (panel) panel.style.width = '520px';
}

window.openNewsPanel = openNewsPanel;
window.closeNewsPanel = closeNewsPanel;
window.summarizeCurrentNews = summarizeCurrentNews;
window.maximizeNewsPanel = maximizeNewsPanel;


async function openPriceHistoryModal(commodity) {
  // Create or reuse a modal
  let modal = document.getElementById('price-history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'price-history-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:600;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:24px;width:720px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div id="phm-title" style="font-size:18px;font-weight:700;color:var(--text)">Price History</div>
        <button onclick="document.getElementById('price-history-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted)">âœ•</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px" id="phm-period-btns">
        <button class="btn btn-primary btn-sm" onclick="loadPriceHistory('${commodity}', 7, this)">7 days</button>
        <button class="btn btn-secondary btn-sm" onclick="loadPriceHistory('${commodity}', 30, this)">30 days</button>
        <button class="btn btn-secondary btn-sm" onclick="loadPriceHistory('${commodity}', 90, this)">90 days</button>
      </div>
      <canvas id="phm-chart" height="200"></canvas>
      <div id="phm-stats" style="display:flex;gap:20px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:13px;color:var(--text2)"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  document.getElementById('phm-title').textContent = (commodity || 'Commodity') + ' â€” Price History';
  // Replace template literal commodity refs
  document.querySelectorAll('#phm-period-btns button').forEach((btn, i) => {
    const days = [7, 30, 90][i];
    btn.onclick = () => loadPriceHistory(commodity, days, btn);
  });
  await loadPriceHistory(commodity, 30, document.querySelector('#phm-period-btns .btn-primary'));
}

async function loadPriceHistory(commodity, days, activeBtn) {
  if (activeBtn) {
    document.querySelectorAll('#phm-period-btns button').forEach(b => {
      b.className = b === activeBtn ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    });
  }
  const canvas = document.getElementById('phm-chart');
  if (!canvas) return;
  if (canvas._phChart) canvas._phChart.destroy();

  let data = [];
  try {
    data = await apiCall('/market/prices/' + encodeURIComponent(commodity) + '/history?days=' + days);
  } catch(e) {}

  if (!data || data.length === 0) return;

  const labels = data.map(d => {
    const dt = new Date(d.timestamp);
    return dt.toLocaleDateString('en-GB', {day:'numeric', month:'short'});
  });
  const prices = data.map(d => parseFloat(d.price));
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const trend = prices[prices.length-1] - prices[0];
  const color = trend >= 0 ? '#16A34A' : '#DC2626';

  canvas._phChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        backgroundColor: color + '15',
        borderWidth: 2,
        pointRadius: days <= 7 ? 4 : 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => commodity + ': $' + ctx.parsed.y.toFixed(2) } }
      },
      scales: {
        x: { ticks: { font: { size: 11 }, color: '#94A3B8', maxTicksLimit: 8 }, grid: { color: '#F1F5F9' } },
        y: {
          ticks: { font: { size: 11 }, color: '#94A3B8', callback: v => '$' + v.toFixed(2) },
          grid: { color: '#F1F5F9' }
        }
      }
    }
  });

  // Stats
  const statsEl = document.getElementById('phm-stats');
  if (statsEl) {
    const chgPct = ((prices[prices.length-1] - prices[0]) / prices[0] * 100).toFixed(2);
    const chgColor = trend >= 0 ? 'var(--positive)' : 'var(--negative)';
    statsEl.innerHTML = `
      <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:2px">Current</div><strong style="font-family:var(--mono)">$${prices[prices.length-1].toFixed(2)}</strong></div>
      <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:2px">${days}d Change</div><strong style="color:${chgColor};font-family:var(--mono)">${trend>=0?'+':''}${chgPct}%</strong></div>
      <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:2px">${days}d High</div><strong style="font-family:var(--mono)">$${maxP.toFixed(2)}</strong></div>
      <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:2px">${days}d Low</div><strong style="font-family:var(--mono)">$${minP.toFixed(2)}</strong></div>
    `;
  }
}

window.openPriceHistoryModal = openPriceHistoryModal;
window.loadPriceHistory = loadPriceHistory;

/* ============================================================
   Copilot Markdown + Fullscreen
   ============================================================ */

// Built-in markdown renderer â€” no CDN dependency
function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let i = 0;
  let inList = false;

  while (i < lines.length) {
    let line = lines[i];

    // Table detection: line contains | and next line has |---|
    if (line.includes('|') && i + 1 < lines.length && lines[i+1].match(/^\s*\|?\s*[-:]+\s*\|/)) {
      // Parse table header
      const headers = line.split('|').filter(h => h.trim() !== '').map(h => h.trim());
      i += 2; // skip separator row
      let tableHtml = '<table><thead><tr>' + headers.map(h => `<th>${inlineMarkdown(h)}</th>`).join('') + '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').filter(c => c.trim() !== '').map(c => c.trim());
        tableHtml += '<tr>' + cells.map(c => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>';
        i++;
      }
      tableHtml += '</tbody></table>';
      if (inList) { html += '</ul>'; inList = false; }
      html += tableHtml;
      continue;
    }

    // Skip separator-only lines (|---|---|)
    if (line.match(/^\s*\|?\s*[-:\s|]+\s*$/)) { i++; continue; }

    // Horizontal rule
    if (line.match(/^\s*[-*_]{3,}\s*$/)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr>'; i++; continue;
    }

    // Headers
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h3) { if (inList) { html += '</ul>'; inList = false; } html += `<h3>${inlineMarkdown(h3[1])}</h3>`; i++; continue; }
    if (h2) { if (inList) { html += '</ul>'; inList = false; } html += `<h3>${inlineMarkdown(h2[1])}</h3>`; i++; continue; }
    if (h1) { if (inList) { html += '</ul>'; inList = false; } html += `<h2>${inlineMarkdown(h1[1])}</h2>`; i++; continue; }

    // Blockquote
    const bq = line.match(/^>\s*(.*)/);
    if (bq) { if (inList) { html += '</ul>'; inList = false; } html += `<blockquote>${inlineMarkdown(bq[1])}</blockquote>`; i++; continue; }

    // List items
    const li = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineMarkdown(li[1])}</li>`;
      i++; continue;
    }

    // Numbered list
    const oli = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (oli) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<li>${inlineMarkdown(oli[1])}</li>`;
      i++; continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<br>';
      i++; continue;
    }

    // Regular paragraph
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${inlineMarkdown(line)}</p>`;
    i++;
  }

  if (inList) html += '</ul>';
  return html;
}

function inlineMarkdown(text) {
  return text
    // Bold+italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Escape remaining HTML-unsafe
    .replace(/</g, (m, offset, str) => str[offset+1] === '/' || /^<[a-z]/.test(str.slice(offset)) ? m : '&lt;');
}

function copilotDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function copilotCurveKeyForCommodity(commodity) {
  const map = { Brent: 'brent', WTI: 'wti', Urals: 'brent', Ethane: 'ethane', Naphtha: 'naphtha', EUA: 'eua', HH: 'brent' };
  return map[commodity] || 'brent';
}

async function ensureCopilotScreen(screen) {
  if (!screen) return;
  if (currentScreen !== screen) {
    navigateTo(screen);
    await copilotDelay(220);
  } else {
    await copilotDelay(120);
  }
}

async function executeCopilotAction(action) {
  if (!action || !action.id) return;
  const params = action.params || {};

  switch (action.id) {
    case 'navigate':
      await ensureCopilotScreen(params.screen);
      break;
    case 'generate_decision_briefing':
      await ensureCopilotScreen('decision-queue');
      window.generateDecisionBriefing && await window.generateDecisionBriefing();
      break;
    case 'load_market_data':
      await ensureCopilotScreen('market');
      window.loadMarketData && await window.loadMarketData({ forceRefresh: !!params.force_refresh });
      break;
    case 'switch_market_curve': {
      await ensureCopilotScreen('market');
      const commodity = params.commodity || 'Brent';
      const curveKey = copilotCurveKeyForCommodity(commodity);
      const btn = Array.from(document.querySelectorAll('.curve-selector .curve-btn')).find(node =>
        String(node.textContent || '').trim().toLowerCase() === curveKey
      );
      if (window.switchMarketCurve) window.switchMarketCurve(curveKey, btn || null);
      break;
    }
    case 'apply_curve_shift': {
      await ensureCopilotScreen('market');
      if (params.commodity && window.switchMarketCurve) {
        const curveKey = copilotCurveKeyForCommodity(params.commodity);
        const btn = Array.from(document.querySelectorAll('.curve-selector .curve-btn')).find(node =>
          String(node.textContent || '').trim().toLowerCase() === curveKey
        );
        window.switchMarketCurve(curveKey, btn || null);
        await copilotDelay(80);
      }
      const input = document.getElementById('curve-shift-input');
      if (input) input.value = params.instruction || '';
      window.applyCurveShift && await window.applyCurveShift();
      break;
    }
    case 'run_hedge_advisor':
      await ensureCopilotScreen('ai');
      if (params.position) {
        const select = document.getElementById('hedge-position');
        if (select) select.value = params.position;
      }
      window.runHedgeAdvisor && await window.runHedgeAdvisor();
      break;
    case 'run_pre_mortem':
      await ensureCopilotScreen('ai');
      window.runPreMortem && await window.runPreMortem();
      break;
    case 'generate_forecast_narrative':
      await ensureCopilotScreen('ai');
      if (params.commodity) {
        const select = document.getElementById('forecast-commodity');
        if (select) select.value = params.commodity;
      }
      window.renderForecastChart && window.renderForecastChart();
      window.generateForecastNarrative && await window.generateForecastNarrative();
      break;
    case 'run_forensics':
      await ensureCopilotScreen('decision-intelligence');
      window.runForensics && await window.runForensics();
      break;
    case 'run_desk_brain':
      await ensureCopilotScreen('decision-intelligence');
      if (params.query) {
        const input = document.getElementById('desk-brain-query');
        if (input) input.value = params.query;
      }
      window.runDeskBrain && await window.runDeskBrain();
      break;
    case 'open_email':
      await ensureCopilotScreen('comms');
      window.openEmail && window.openEmail(Number(params.email_id));
      break;
    case 'send_email_reply':
      await ensureCopilotScreen('comms');
      window.openEmail && window.openEmail(Number(params.email_id));
      await copilotDelay(80);
      window.sendEmailReply && window.sendEmailReply(Number(params.email_id));
      break;
    case 'mark_email_actioned':
      await ensureCopilotScreen('comms');
      window.openEmail && window.openEmail(Number(params.email_id));
      await copilotDelay(80);
      window.markEmailActioned && await window.markEmailActioned(Number(params.email_id));
      break;
    case 'complete_decision':
      await ensureCopilotScreen('decision-queue');
      await apiCall(`/decisions/${Number(params.decision_id)}/complete`, { method: 'POST', body: '{}' });
      window.loadDecisionQueue && await window.loadDecisionQueue();
      showToast('Decision Updated', 'Decision marked complete.', 'success');
      break;
    case 'snooze_decision':
      await ensureCopilotScreen('decision-queue');
      await apiCall(`/decisions/${Number(params.decision_id)}/snooze?minutes=${Number(params.minutes || 30)}`, { method: 'POST', body: '{}' });
      window.loadDecisionQueue && await window.loadDecisionQueue();
      showToast('Decision Updated', `Decision snoozed for ${Number(params.minutes || 30)} minutes.`, 'success');
      break;
    case 'acknowledge_alert':
      await apiCall(`/alerts/${Number(params.alert_id)}/acknowledge`, { method: 'POST', body: '{}' });
      showToast('Alert Updated', 'Alert acknowledged.', 'success');
      break;
    case 'resolve_alert':
      await apiCall(`/alerts/${Number(params.alert_id)}/resolve`, { method: 'POST', body: '{}' });
      showToast('Alert Updated', 'Alert resolved.', 'success');
      break;
    case 'test_connector':
      await ensureCopilotScreen('configuration');
      window.loadAllConnectors && await window.loadAllConnectors();
      await copilotDelay(100);
      window.testFeed && await window.testFeed(Number(params.connector_id));
      break;
    case 'switch_ai_provider':
      window.switchAIProvider && await window.switchAIProvider(params.provider || 'local');
      break;
    case 'trigger_scenario':
      await ensureCopilotScreen('admin');
      window.triggerScenario && await window.triggerScenario(params.scenario_key, params.scenario_name || params.scenario_key);
      break;
    default:
      console.warn('Unknown copilot action', action);
  }
}

window.executeCopilotPlan = async function(plan) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const action of actions) {
    try {
      await executeCopilotAction(action);
    } catch (err) {
      console.warn('Copilot action failed', action, err);
      showToast('Copilot Action', `Unable to complete "${action.label || action.id}".`, 'warning');
    }
  }
};

// Override appendCopilotMessage to render markdown
const _origAppendCopilotMsg = window.appendCopilotMessage;
window.appendCopilotMessage = function(role, text) {
  const msgs = document.getElementById('copilot-messages');
  if (!msgs) return null;
  const isAI = role === 'ai' || role === 'assistant';
  const div = document.createElement('div');
  div.className = `cp-msg ${isAI ? 'ai' : 'user'}`;
  const bubble = document.createElement('div');
  bubble.className = 'cp-bubble';
  if (isAI && text) {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text || '';
  }
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
};

// Also patch the SSE streaming to render markdown on completion
const _origSendCopilot = window.sendCopilotMessage;
window.sendCopilotMessage = async function(text) {
  if (!text || !text.trim()) return;
  const input = document.getElementById('copilot-input');
  if (input) input.value = '';
  if (!copilotOpen) openCopilot();

  appendCopilotMessage('user', text);

  // Typing indicator
  const msgs = document.getElementById('copilot-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'cp-msg ai typing';
  typingDiv.innerHTML = '<div class="cp-bubble"><span class="cp-dots"><span>â—</span><span>â—</span><span>â—</span></span></div>';
  msgs?.appendChild(typingDiv);
  msgs && (msgs.scrollTop = msgs.scrollHeight);

  try {
    const response = await fetch(`${API_BASE}/chat/message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        screen_context: currentScreen,
        selected_entity_type: selectedEntityContext?.type || null,
        selected_entity_id: selectedEntityContext?.id || null,
        selected_entity_label: selectedEntityContext?.label || null
      })
    });
    typingDiv.remove();
    if (!response.ok) throw new Error(`Chat error ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    const responseDiv = document.createElement('div');
    responseDiv.className = 'cp-msg ai';
    const bubble = document.createElement('div');
    bubble.className = 'cp-bubble';
    responseDiv.appendChild(bubble);
    msgs?.appendChild(responseDiv);
    let copilotPlan = null;

    if (contentType.includes('event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const d = line.slice(6).trim();
            if (d && d !== '[DONE]') {
              try {
                const j = JSON.parse(d);
                if (j.copilot) { copilotPlan = j.copilot; continue; }
                if (j.done) { bubble.innerHTML = renderMarkdown(accumulated); break; }
                accumulated += j.chunk || j.content || j.text || '';
                // Stream as plain text, render markdown on completion
                bubble.textContent = accumulated;
                msgs && (msgs.scrollTop = msgs.scrollHeight);
              } catch(e) { accumulated += d; }
            }
          }
        }
      }
      // Final markdown render
      bubble.innerHTML = renderMarkdown(accumulated);
      if (copilotPlan?.actions?.length) {
        await window.executeCopilotPlan(copilotPlan);
      }
    } else {
      const data = await response.json();
      const txt = data.response || data.message || 'Response received.';
      bubble.innerHTML = renderMarkdown(txt);
      if (data.copilot?.actions?.length) {
        await window.executeCopilotPlan(data.copilot);
      }
    }
    msgs && (msgs.scrollTop = msgs.scrollHeight);
  } catch(e) {
    typingDiv.remove();
    appendCopilotMessage('ai', `I'm having trouble connecting right now. The AI service may be initialising â€” please try again in a moment.`);
  }
};

// Fullscreen toggle
let copilotMaximized = false;
window.maximizeCopilot = function() {
  const panel = document.getElementById('copilot-panel');
  const backdrop = document.getElementById('copilot-backdrop');
  const btn = document.getElementById('cp-maximize-btn');
  if (!panel) return;
  copilotMaximized = !copilotMaximized;
  panel.classList.toggle('maximized', copilotMaximized);
  if (btn) btn.textContent = copilotMaximized ? 'â¤¡' : 'â¤¢';
  if (btn) btn.title = copilotMaximized ? 'Restore' : 'Maximize';
  // In maximized mode, backdrop covers everything
  if (backdrop) backdrop.classList.toggle('show', copilotMaximized && copilotOpen);
};

// Override closeCopilot to also restore if maximized
const _origClose = window.closeCopilot;
window.closeCopilot = function() {
  copilotMaximized = false;
  const panel = document.getElementById('copilot-panel');
  panel?.classList.remove('open', 'maximized');
  document.getElementById('copilot-backdrop')?.classList.remove('show');
  copilotOpen = false;
  const btn = document.getElementById('cp-maximize-btn');
  if (btn) { btn.textContent = 'â¤¢'; btn.title = 'Maximize'; }
};

/* â”€â”€ Intel Panel Fullscreen â”€â”€ */
let intelMaximized = false;

window.maximizeIntelPanel = function() {
  const panel = document.getElementById('intel-panel');
  const backdrop = document.getElementById('intel-backdrop');
  if (!panel) return;
  intelMaximized = !intelMaximized;
  panel.classList.toggle('maximized', intelMaximized);
  if (backdrop) backdrop.classList.toggle('show', intelMaximized);
  // Update button icon in header
  const btn = document.getElementById('intel-maximize-btn');
  if (btn) btn.textContent = intelMaximized ? 'â¤¡' : 'â¤¢';
};

// Patch closeIntelReport to also restore maximized
const _origCloseIntel = window.closeIntelReport;
window.closeIntelReport = function() {
  intelMaximized = false;
  document.getElementById('intel-panel')?.classList.remove('open', 'maximized');
  document.getElementById('intel-backdrop')?.classList.remove('show');
  currentNewsId = null;
};

// Also fix renderIntelSparkline to use maintainAspectRatio true with fixed container
window.renderIntelSparkline = async function(commodity, intelData) {
  const canvas = document.getElementById('intel-spark-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chartInstance) { canvas._chartInstance.destroy(); canvas._chartInstance = null; }

  let prices = [], labels = [];
  try {
    const history = await apiCall(`/market/prices/${encodeURIComponent(commodity)}/history?days=30`);
    if (history && history.length > 0) {
      const sorted = [...history].reverse();
      labels = sorted.map(h => { const d=new Date(h.timestamp||h.date); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); });
      prices = sorted.map(h => parseFloat(h.price));
    }
  } catch(e) {}

  if (prices.length === 0) {
    const base = intelData?.price_at_analysis || 80;
    const trend = intelData?.trend_30d || 0;
    prices = Array.from({length:30}, (_,i) => {
      const progress = i/29;
      return parseFloat((base*(1-(trend/100))+base*(trend/100)*progress + (Math.random()-0.5)*base*0.018).toFixed(3));
    });
    labels = Array.from({length:30}, (_,i) => {
      const d=new Date(); d.setDate(d.getDate()-(29-i));
      return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    });
  }

  const outlook = intelData?.outlook || 'neutral';
  const color = outlook==='bullish'?'#16A34A':outlook==='bearish'?'#DC2626':'#6B7280';

  canvas._chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ data:prices, borderColor:color, backgroundColor:color+'18', borderWidth:2, pointRadius:0, fill:true, tension:0.3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend:{display:false}, tooltip:{callbacks:{label:ctx=>`$${ctx.parsed.y.toFixed(2)}`}} },
      scales: {
        x: { display:false },
        y: { display:true, grid:{color:'#F1F5F9'}, ticks:{font:{size:10},color:'#94A3B8',maxTicksLimit:3,callback:v=>'$'+v.toFixed(0)} }
      }
    }
  });
};

/* â”€â”€ AI Ready Banner â”€â”€ */
window.showAIReadyBanner = function(title, message) {
  // Remove any existing banner
  document.getElementById('ai-ready-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'ai-ready-banner';
  banner.style.cssText = `
    position:fixed; top:70px; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,#0066CC,#0052A3);
    color:white; padding:16px 28px; border-radius:12px;
    box-shadow:0 8px 30px rgba(0,102,204,.5);
    z-index:9999; text-align:center; min-width:380px;
    animation:bannerIn .4s cubic-bezier(.34,1.56,.64,1) both;
    cursor:pointer;
  `;
  banner.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.8;margin-bottom:4px">ðŸ¤– AI Analysis Complete</div>
    <div style="font-size:17px;font-weight:800;margin-bottom:4px">${title}</div>
    <div style="font-size:13px;opacity:.9">${message}</div>
    <div style="font-size:11px;opacity:.6;margin-top:6px">Click to dismiss</div>
  `;
  banner.onclick = () => { banner.style.animation = 'bannerOut .3s ease both'; setTimeout(() => banner.remove(), 300); };
  document.body.appendChild(banner);

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    if (document.getElementById('ai-ready-banner')) {
      banner.style.animation = 'bannerOut .3s ease both';
      setTimeout(() => banner.remove(), 300);
    }
  }, 6000);
};
window.showAIReadyBanner = window.showAIReadyBanner;

/* â”€â”€ Expandable AI Panels â”€â”€ */
window.expandPanel = function(btn) {
  const panel = btn.closest('.ai-panel');
  if (!panel) return;

  if (panel.classList.contains('expanded')) {
    // Collapse
    panel.classList.remove('expanded');
    btn.textContent = 'â¤¢ Expand';
    document.getElementById('panel-backdrop')?.remove();
  } else {
    // Expand
    panel.classList.add('expanded');
    btn.textContent = 'â¤¡ Collapse';
    const backdrop = document.createElement('div');
    backdrop.id = 'panel-backdrop';
    backdrop.className = 'ai-panel-backdrop';
    backdrop.onclick = () => expandPanel(btn);
    document.body.insertBefore(backdrop, panel);
  }
};

/* ============================================================
   Vessel Map â€” Leaflet + OpenStreetMap + AIS Traffic Layer
   ============================================================ */

let _aisLayer = null;
let _vesselMap = null;

window.initLeafletMap = function(vessels) {
  const mapEl = document.getElementById('vessel-leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Remove old map
  if (_vesselMap) { _vesselMap.remove(); _vesselMap = null; }
  if (mapEl._leafletMap) { mapEl._leafletMap.remove(); }

  // Init map centred on North Atlantic
  _vesselMap = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true })
    .setView([50, -30], 4);
  mapEl._leafletMap = _vesselMap;

  // Base layer â€” OpenStreetMap
  const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Â© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 12
  }).addTo(_vesselMap);

  // Port locations
  const ports = {
    'Marcus Hook': { ll: [39.8, -75.4], label: 'Marcus Hook, PA' },
    'Freeport TX': { ll: [28.9, -95.4], label: 'Freeport, TX' },
    'Rafnes':      { ll: [59.1,  9.9],  label: 'Rafnes, Norway' },
    'Grangemouth': { ll: [56.0, -3.7],  label: 'Grangemouth, Scotland' },
  };

  // Port markers
  Object.entries(ports).forEach(([name, p]) => {
    L.circleMarker(p.ll, { radius: 7, color: '#1A2332', fillColor: '#475569', fillOpacity: 0.9, weight: 2 })
      .addTo(_vesselMap)
      .bindTooltip(`<strong>${p.label}</strong>`, { permanent: false, className: 'vessel-tooltip' });
  });

  // Colour per status
  const statusColor = { 'DELAYED': '#DC2626', 'EN ROUTE': '#0066CC', 'EN ROUTE (DELAYED)': '#DC2626', 'LOADING': '#D97706', 'BALLAST': '#64748B' };

  vessels.forEach(v => {
    if (!v.lat || !v.lon) return;
    const color = statusColor[v.status] || '#0066CC';
    const isDelayed = v.delayed || v.status === 'DELAYED';

    // Route dashed lines
    const originLL = Object.values(ports).find(p => (v.origin_port || '').includes(p.label.split(',')[0]))?.ll;
    const destLL   = Object.values(ports).find(p => (v.destination_port || '').includes(p.label.split(',')[0]))?.ll;

    if (originLL) L.polyline([originLL, [v.lat, v.lon]], { color, weight: 1.5, opacity: 0.4, dashArray: '6,5' }).addTo(_vesselMap);
    if (destLL)   L.polyline([[v.lat, v.lon], destLL],   { color, weight: 1.5, opacity: 0.25, dashArray: '3,8' }).addTo(_vesselMap);

    // Ship marker â€” custom HTML div icon
    const pulse = isDelayed ? 'animation:delayPulse 1.5s infinite;' : '';
    const shipIcon = L.divIcon({
      className: '',
      html: `<div style="font-size:${isDelayed?22:18}px;${pulse}filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));cursor:pointer">ðŸš¢</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    // Rich hover tooltip
    const tooltipHtml = `
      <div style="font-family:-apple-system,sans-serif;min-width:200px">
        <div style="font-weight:800;font-size:13.5px;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:5px">
          ðŸš¢ ${v.name}
        </div>
        <table style="font-size:12px;width:100%;border-collapse:collapse">
          <tr><td style="color:#6B7280;padding:2px 0">Status</td><td style="font-weight:700;color:${color};padding:2px 0 2px 8px">${v.status}${isDelayed ? ' âš ' : ''}</td></tr>
          <tr><td style="color:#6B7280;padding:2px 0">Route</td><td style="padding:2px 0 2px 8px">${v.route || 'â€”'}</td></tr>
          <tr><td style="color:#6B7280;padding:2px 0">Cargo</td><td style="font-weight:600;padding:2px 0 2px 8px">${v.cargo || 'Ethane'} Â· ${v.volume || 'â€”'}</td></tr>
          <tr><td style="color:#6B7280;padding:2px 0">ETA</td><td style="font-weight:600;color:${isDelayed?'#DC2626':'#374151'};padding:2px 0 2px 8px">${v.eta || 'â€”'}</td></tr>
          <tr><td style="color:#6B7280;padding:2px 0">Position</td><td style="font-family:monospace;font-size:11px;padding:2px 0 2px 8px">${v.lat?.toFixed(2)}Â°N, ${Math.abs(v.lon)?.toFixed(2)}Â°${v.lon < 0 ? 'W' : 'E'}</td></tr>
          <tr><td style="color:#6B7280;padding:2px 0">Progress</td><td style="padding:2px 0 2px 8px">${v.pct || 'â€”'}% complete</td></tr>
          ${isDelayed ? '<tr><td colspan="2" style="color:#DC2626;font-weight:700;padding-top:5px">âš  14h delay â€” demurrage risk $26,250</td></tr>' : ''}
        </table>
        <div style="font-size:10px;color:#94A3B8;margin-top:5px">Click for voyage economics</div>
      </div>`;

    const marker = L.marker([v.lat, v.lon], { icon: shipIcon })
      .addTo(_vesselMap)
      .bindTooltip(tooltipHtml, {
        permanent: false,
        direction: 'top',
        offset: [0, -14],
        opacity: 1,
        className: 'vessel-rich-tooltip'
      })
      .bindPopup(tooltipHtml, { maxWidth: 260 });

    // Click to select vessel in dropdown
    marker.on('click', () => {
      const sel = document.getElementById('voyage-vessel');
      if (sel) {
        const opt = Array.from(sel.options).find(o => o.text.includes(v.name.replace('JS Ineos ', '')));
        if (opt) { sel.value = opt.value; }
      }
    });
  });
};

window.toggleAISLayer = function(enabled) {
  const noteEl = document.getElementById('ais-traffic-note');
  if (!_vesselMap) return;

  if (enabled) {
    // OpenSeaMap â€” shows real vessel traffic lanes (free, no key)
    _aisLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      attribution: 'Â© <a href="http://www.openseamap.org">OpenSeaMap</a>',
      opacity: 0.7,
      maxZoom: 12
    }).addTo(_vesselMap);
    if (noteEl) noteEl.innerHTML = '<span style="color:#16A34A">âœ“ OpenSeaMap traffic overlay loaded</span>';

    // Show info about registering for live AIS
    setTimeout(() => showAIReadyBanner(
      'Vessel Traffic Enabled',
      'Showing OpenSeaMap maritime lanes. For live AIS vessel tracking, register free at aisHub.org'
    ), 500);
  } else {
    if (_aisLayer) { _vesselMap.removeLayer(_aisLayer); _aisLayer = null; }
    if (noteEl) noteEl.innerHTML = '';
  }
};

// CSS for rich tooltip
const aisStyle = document.createElement('style');
aisStyle.textContent = `
  .vessel-rich-tooltip { background:white!important; border:1px solid #E5E7EB!important; border-radius:10px!important; padding:10px 12px!important; box-shadow:0 4px 20px rgba(0,0,0,.15)!important; font-family:-apple-system,sans-serif!important; }
  .vessel-rich-tooltip::before { display:none!important; }
  .vessel-tooltip { background:white!important; border:1px solid #E5E7EB!important; border-radius:6px!important; padding:4px 8px!important; font-size:12px!important; font-weight:600!important; }
  @keyframes delayPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.3)} }
`;
document.head.appendChild(aisStyle);
