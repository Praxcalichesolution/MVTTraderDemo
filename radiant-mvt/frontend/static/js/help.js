/* ============================================================
   Radiant-MVT - help.js
   Local, file-backed Help Center
   ============================================================ */

const helpCenterState = {
  items: [],
  filteredItems: [],
  selectedArticleId: '',
  query: ''
};

const HELP_GROUP_ORDER = [
  'Trading Workspace',
  'AI & Analytics',
  'Operations',
  'Platform Tools',
  'Leadership & Admin'
];

const HELP_SCREEN_CATEGORY = {
  'decision-queue': 'Trading Workspace',
  'dashboard': 'Trading Workspace',
  'positions': 'Trading Workspace',
  'ai': 'AI & Analytics',
  'performance': 'AI & Analytics',
  'decision-intelligence': 'AI & Analytics',
  'market': 'Operations',
  'vessels': 'Operations',
  'comms': 'Operations',
  'compliance': 'Operations',
  'documentation': 'Platform Tools',
  'ai-studio': 'Platform Tools',
  'configuration': 'Platform Tools',
  'boardroom': 'Leadership & Admin',
  'admin': 'Leadership & Admin'
};

let helpLayoutResizeBound = false;

function cleanupHelpCenterButtonDecorations() {
  document.querySelectorAll('.help-center-screen .agent-assistable').forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest('.docs-action-card')) return;
    node.classList.remove('agent-assistable');
    delete node.dataset.agentDecorated;
  });
}

function normalizeHelpText(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
}

function scoreHelpItem(item, normalizedQuery, tokens) {
  const fields = [
    item.id,
    item.title,
    item.screen,
    item.category,
    item.summary,
    item.why_it_matters,
    ...(item.steps || []),
    ...(item.features || []),
    ...(item.quick_questions || []),
    ...(item.automation_examples || [])
  ].map(normalizeHelpText);

  let score = 0;
  for (const field of fields) {
    if (field.includes(normalizedQuery)) score += 8;
    for (const token of tokens) {
      if (field.includes(token)) score += 2;
    }
  }
  if (normalizeHelpText(item.screen) === normalizedQuery || normalizeHelpText(item.id) === normalizedQuery) {
    score += 12;
  }
  return score;
}

function filterLocalHelp(query) {
  const normalized = normalizeHelpText(query).trim();
  helpCenterState.query = query || '';

  if (!normalized) {
    helpCenterState.filteredItems = [...helpCenterState.items];
  } else {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    helpCenterState.filteredItems = [...helpCenterState.items]
      .map(item => ({ item, score: scoreHelpItem(item, normalized, tokens) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .map(entry => entry.item);
  }

  if (!helpCenterState.filteredItems.some(item => item.id === helpCenterState.selectedArticleId)) {
    helpCenterState.selectedArticleId = helpCenterState.filteredItems[0]?.id || '';
  }
}

function buildHelpGroups() {
  const groups = new Map();
  for (const item of helpCenterState.filteredItems) {
    const key = item.category || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return Array.from(groups.entries()).sort((a, b) => {
    const aRank = HELP_GROUP_ORDER.indexOf(a[0]);
    const bRank = HELP_GROUP_ORDER.indexOf(b[0]);
    const left = aRank === -1 ? 999 : aRank;
    const right = bRank === -1 ? 999 : bRank;
    if (left !== right) return left - right;
    return a[0].localeCompare(b[0]);
  });
}

function mapGuideScreenToHelpItem(screen) {
  const key = screen?.key;
  return {
    id: key,
    title: screen?.title || key || 'Untitled',
    screen: key,
    category: HELP_SCREEN_CATEGORY[key] || 'Other',
    summary: screen?.summary || '',
    why_it_matters: screen?.summary || '',
    steps: Array.isArray(screen?.tasks) ? screen.tasks : [],
    features: Array.isArray(screen?.features) ? screen.features : [],
    quick_questions: Array.isArray(screen?.chat_examples) ? screen.chat_examples : [],
    chat_examples: Array.isArray(screen?.chat_examples) ? screen.chat_examples : [],
    related_screens: Array.isArray(screen?.related_screens) ? screen.related_screens : [],
    sections: Array.isArray(screen?.sections) ? screen.sections : [],
    automation_examples: []
  };
}

async function loadHelpItemsWithFallback() {
  try {
    const response = await fetch('/help-docs/catalog.json', { cache: 'no-store' });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      throw new Error(`Static help load failed (${response.status})`);
    }
    if (!contentType.includes('application/json')) {
      throw new Error('Help Center endpoint returned non-JSON content.');
    }
    const items = await response.json();
    if (Array.isArray(items) && items.length > 0) {
      return items;
    }
  } catch (err) {
    console.warn('Help Center catalog fetch failed, trying fallback guide.', err);
  }

  try {
    if (typeof window.loadAppGuide === 'function') {
      const guide = await window.loadAppGuide(true);
      if (Array.isArray(guide?.screens) && guide.screens.length > 0) {
        return guide.screens.map(mapGuideScreenToHelpItem);
      }
    }
  } catch (err) {
    console.warn('Help Center guide fallback failed.', err);
  }

  throw new Error('No Help Center source is available.');
}

function scrollHelpDetailToTop() {
  const detail = document.getElementById('help-detail');
  if (detail) detail.scrollTop = 0;
}

function renderHelpTree() {
  const host = document.getElementById('help-tree');
  const meta = document.getElementById('docs-nav-meta');
  if (!host) return;

  const filteredCount = helpCenterState.filteredItems.length;
  const totalCount = helpCenterState.items.length;

  if (meta) {
    meta.innerHTML = `
      <span class="docs-meta-pill">${filteredCount} topic${filteredCount === 1 ? '' : 's'}</span>
      ${helpCenterState.query ? `<span class="docs-meta-pill docs-meta-pill-accent">Search: ${window.escapeHtml(helpCenterState.query)}</span>` : ''}
      <span class="docs-meta-pill">${totalCount} loaded</span>
    `;
  }

  if (!filteredCount) {
    host.innerHTML = '<div class="docs-empty-state">No Help Center topics matched your search.</div>';
    return;
  }

  host.innerHTML = buildHelpGroups().map(([group, items]) => `
    <section class="docs-group">
      <div class="docs-group-title">${window.escapeHtml(group)}</div>
      <div class="docs-group-list">
        ${items.map(item => {
          const isSelected = item.id === helpCenterState.selectedArticleId;
          const isAgentReady = (item.automation_examples || []).length > 0;
          return `
            <button
              class="docs-topic ${isSelected ? 'docs-topic-active' : ''}"
              onclick="selectHelpArticle(${window.escapeJsArg(item.id)})"
            >
              <div class="docs-topic-main">
                <div class="docs-topic-title-row">
                  <strong>${window.escapeHtml(item.title)}</strong>
                  ${isAgentReady ? '<span class="docs-topic-badge">Agent</span>' : ''}
                </div>
                <div class="docs-topic-slug">${window.escapeHtml(item.screen || item.id)}</div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function renderHelpDetail() {
  const host = document.getElementById('help-detail');
  if (!host) return;

  const item = helpCenterState.filteredItems.find(entry => entry.id === helpCenterState.selectedArticleId)
    || helpCenterState.items.find(entry => entry.id === helpCenterState.selectedArticleId);

  if (!item) {
    host.innerHTML = '<div class="docs-empty-state">Select a Help Center topic from the left.</div>';
    return;
  }

  const features = item.features || [];
  const steps = item.steps || [];
  const quickQuestions = item.quick_questions || [];
  const automationExamples = item.automation_examples || [];
  const openTarget = item.screen || item.id;
  const groupLabel = item.category || 'Guide';

  host.innerHTML = `
    <div class="docs-detail-wrap">
      <div class="docs-detail-hero">
        <div class="docs-detail-copy">
          <div class="kpi-label">${window.escapeHtml(groupLabel)}</div>
          <h2>${window.escapeHtml(item.title)}</h2>
          <p>${window.escapeHtml(item.summary || '')}</p>
        </div>
        <div class="docs-detail-actions">
          ${openTarget && openTarget !== 'documentation' ? `<button class="btn btn-primary btn-sm" onclick="navigateTo(${window.escapeJsArg(openTarget)})">Open Screen</button>` : ''}
          <button class="btn btn-secondary btn-sm ai-btn" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(`How do I use ${item.title}?`)})">Ask Agent</button>
          <button class="btn btn-secondary btn-sm" onclick="openPageHelp(${window.escapeJsArg(openTarget)})">Page Help</button>
        </div>
      </div>

      <div class="card docs-focus-card">
        <div class="card-body">
          <strong>Why this page matters</strong>
          <p class="text-muted docs-focus-copy">${window.escapeHtml(item.why_it_matters || '')}</p>
        </div>
      </div>

      <div class="docs-detail-grid">
        <div class="card">
          <div class="card-body">
            <div class="docs-section-head">
              <strong>How to use it</strong>
              <span class="docs-meta-pill">${steps.length} step${steps.length === 1 ? '' : 's'}</span>
            </div>
            <div class="docs-step-list">
              ${steps.length ? steps.map((step, index) => `
                <div class="docs-step">
                  <div class="docs-step-index">${index + 1}</div>
                  <div class="docs-step-copy">${window.escapeHtml(step)}</div>
                </div>
              `).join('') : '<div class="secondary small">No guided steps are available for this topic yet.</div>'}
            </div>
          </div>
        </div>

        <div class="docs-side-column">
          <div class="card">
            <div class="card-body">
              <div class="docs-section-head">
                <strong>Available features</strong>
                <span class="docs-meta-pill">${features.length}</span>
              </div>
              <div class="docs-chip-list">
                ${features.length ? features.map(feature => `<span class="cp-chip">${window.escapeHtml(feature)}</span>`).join('') : '<div class="secondary small">Feature details are being prepared.</div>'}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <div class="docs-section-head">
                <strong>Good agent prompts</strong>
                <span class="docs-meta-pill docs-meta-pill-accent">AI ready</span>
              </div>
              <div class="docs-prompt-list">
                ${quickQuestions.length ? quickQuestions.map(prompt => `
                  <button class="btn btn-secondary btn-sm docs-prompt-btn" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(prompt)})">${window.escapeHtml(prompt)}</button>
                `).join('') : '<div class="secondary small">Ask Radiant AI how to use this page.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>

      ${automationExamples.length ? `
        <div class="card">
          <div class="card-body">
            <div class="docs-section-head">
              <strong>Agent-enabled actions</strong>
              <span class="docs-meta-pill docs-meta-pill-accent">Run from chat</span>
            </div>
            <div class="docs-action-list">
              ${automationExamples.map(example => `
                <div class="docs-action-card">
                  <code>${window.escapeHtml(example)}</code>
                  <button class="btn btn-primary btn-sm" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(example)})">Run with Agent</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  scrollHelpDetailToTop();
  cleanupHelpCenterButtonDecorations();
}

function ensureHelpLayoutSizing() {
  if (helpLayoutResizeBound) return;
  helpLayoutResizeBound = true;
  window.addEventListener('resize', syncHelpLayoutHeight);
}

function syncHelpLayoutHeight() {
  const content = document.getElementById('main');
  const shellCard = document.querySelector('.docs-shell-card');
  const shell = document.querySelector('.docs-shell');
  if (!content || !shellCard || !shell || currentScreen !== 'documentation') return;

  const contentRect = content.getBoundingClientRect();
  const shellCardRect = shellCard.getBoundingClientRect();
  const availableHeight = Math.floor(contentRect.bottom - shellCardRect.top);
  const clampedHeight = Math.max(420, availableHeight);
  shellCard.style.height = `${clampedHeight}px`;
}

async function loadHelpCatalogData(params = {}) {
  const tree = document.getElementById('help-tree');
  const detail = document.getElementById('help-detail');
  if (!tree || !detail) return;

  tree.innerHTML = '<div class="flex-center" style="height:180px"><span class="loading-spinner"></span></div>';
  detail.innerHTML = '<div class="flex-center" style="height:180px"><span class="loading-spinner"></span></div>';

  try {
    const items = await loadHelpItemsWithFallback();

    helpCenterState.items = Array.isArray(items) ? items : [];
    helpCenterState.query = params.query || '';
    filterLocalHelp(helpCenterState.query);
  helpCenterState.selectedArticleId = params.article
      || helpCenterState.selectedArticleId
      || helpCenterState.filteredItems[0]?.id
      || helpCenterState.items[0]?.id
      || '';

    renderHelpTree();
    renderHelpDetail();
    cleanupHelpCenterButtonDecorations();
  } catch (err) {
    tree.innerHTML = `<div class="docs-empty-state">Help Center content is unavailable: ${window.escapeHtml(err.message)}</div>`;
    detail.innerHTML = '<div class="docs-empty-state">Help Center content is unavailable right now.</div>';
  }
}

async function loadHelpCenter(params = {}) {
  const content = document.getElementById('main');
  if (!content) return;

  content.innerHTML = `
    <div class="screen docs-screen help-center-screen">
      <div class="screen-header">
        <div>
          <div class="screen-title">Help Center</div>
          <div class="screen-subtitle">Browse every workflow, jump to the right screen, and use Radiant AI directly from the same workspace.</div>
        </div>
        <div class="screen-actions">
          <button class="btn btn-secondary btn-sm ai-btn" onclick="openCopilot(); sendCopilotMessage('What can you help me do in this application?')">Ask Agent</button>
        </div>
      </div>

      <div class="card docs-search-card">
        <div class="card-body docs-search-body">
          <div class="docs-search-row">
            <input id="help-search" class="form-control docs-search-input" placeholder="Search screens, workflows, prompts, or actions">
            <button class="btn btn-primary" onclick="runHelpSearch()">Search</button>
            <button class="btn btn-secondary" onclick="resetHelpSearch()">Show All</button>
          </div>
          <div class="docs-search-tip">
            Loaded from <code>docs/help/catalog.json</code>. No database dependency for the Help Center screen.
          </div>
        </div>
      </div>

      <div class="card docs-shell-card">
        <div class="card-body docs-shell-card-body">
          <div class="docs-shell">
            <aside class="docs-nav-panel">
              <div class="docs-nav-header">
                <div class="kpi-label">Help Center</div>
                <h3>Workspaces and guides</h3>
                <p>Choose a screen or workflow on the left and read the details on the right.</p>
                <div id="docs-nav-meta" class="docs-nav-meta"></div>
              </div>
              <div id="help-tree" class="docs-nav-tree"></div>
            </aside>
            <section id="help-detail" class="docs-detail-panel"></section>
          </div>
        </div>
      </div>
    </div>
  `;

  const searchBox = document.getElementById('help-search');
  if (searchBox) {
    searchBox.value = params.query || '';
    searchBox.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runHelpSearch();
      }
    });
  }

  ensureHelpLayoutSizing();
  syncHelpLayoutHeight();
  await loadHelpCatalogData(params);
  cleanupHelpCenterButtonDecorations();
}

window.runHelpSearch = function() {
  const query = document.getElementById('help-search')?.value?.trim() || '';
  filterLocalHelp(query);
  renderHelpTree();
  renderHelpDetail();
};

window.resetHelpSearch = function() {
  const input = document.getElementById('help-search');
  if (input) input.value = '';
  filterLocalHelp('');
  renderHelpTree();
  renderHelpDetail();
};

window.selectHelpArticle = function(articleId) {
  helpCenterState.selectedArticleId = articleId;
  renderHelpTree();
  renderHelpDetail();
  scrollHelpDetailToTop();
};

window.renderDocumentationScreen = function(screenKey) {
  if (!helpCenterState.items.length) {
    loadHelpCenter({ article: screenKey || helpCenterState.selectedArticleId || 'decision-queue' });
    return;
  }
  if (screenKey) helpCenterState.selectedArticleId = screenKey;
  renderHelpTree();
  renderHelpDetail();
  syncHelpLayoutHeight();
  cleanupHelpCenterButtonDecorations();
};

SCREENS['documentation'] = async function() {
  const requestedArticle = (typeof window.getDocumentationSelectedScreen === 'function' && window.getDocumentationSelectedScreen())
    || 'decision-queue';
  await loadHelpCenter({ article: requestedArticle });
};
