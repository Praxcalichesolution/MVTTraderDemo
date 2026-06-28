/* ============================================================
   Radiant-MVTâ„¢ â€” screens.js  All Screen Renderers
   ============================================================ */

/* â”€â”€ SCREEN 1: DECISION QUEUE â”€â”€ */
const SCREEN_APP_MODE = window.getAppMode ? window.getAppMode() : {};
const SCREEN_APP_ID = window.currentAppId ? window.currentAppId() : 'trader';
const SCREEN_STORAGE_KEYS = window.appStorageKeys || { dashboardLayout: 'radiant_dashboard_layout_v2', aiProvider: 'radiant_ai_provider', token: 'radiant_token' };

function readAppToken() {
  const liveToken = typeof authToken === 'function' ? authToken() : authToken;
  return liveToken || (window.appStorageGet ? window.appStorageGet(SCREEN_STORAGE_KEYS.token) : localStorage.getItem('radiant_token')) || '';
}

SCREENS['decision-queue'] = async function(main) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const dateStr = now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  main.innerHTML = `<div class="screen">
    <div class="greeting-bar">
      <div class="greeting-left">
        <div class="greeting-name">GOOD MORNING, ALEX</div>
        <div class="greeting-date">${dateStr} &nbsp;|&nbsp; ${timeStr} London &nbsp;|&nbsp; <span class="market-status"><span class="status-dot green"></span>Market OPEN</span></div>
      </div>
      <div class="greeting-right">
        <div class="kpi-card" style="min-width:120px;text-align:center">
          <div class="kpi-label">Decisions Today</div>
          <div class="kpi-value accent" id="dq-count">â€”</div>
        </div>
        <div class="kpi-card" style="min-width:120px;text-align:center">
          <div class="kpi-label">Value at Stake</div>
          <div class="kpi-value positive" id="dq-value">â€”</div>
        </div>
      </div>
    </div>
    <div class="screen-header">
      <div><div class="screen-title">ðŸ“‹ Decision Queue</div><div class="screen-subtitle">Your prioritised action list â€” sorted by deadline and impact</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadDecisionQueue()">âŸ³ Refresh</button>
        <button class="btn btn-primary btn-sm" onclick="generateDecisionBriefing()">ðŸ¤– Generate AI Briefing</button>
      </div>
    </div>
    <div id="decision-cards-container">
      <div class="flex-center" style="height:120px"><span class="loading-spinner"></span></div>
    </div>
    <div class="ai-briefing-box">
      <div class="ai-briefing-header">
        <div class="ai-briefing-title">ðŸ¤– AI Decision Briefing</div>
        <button class="btn btn-primary btn-sm" onclick="generateDecisionBriefing()">Generate Briefing</button>
      </div>
      <div class="ai-briefing-content" id="ai-briefing-content">Click "Generate Briefing" to get your AI-powered morning briefing...</div>
    </div>
  </div>`;
  loadDecisionQueue();
};

window.loadDecisionQueue = async function() {
  const container = document.getElementById('decision-cards-container');
  if (!container) return;

  // Show demo data IMMEDIATELY â€” no loading spinner
  const demoDecisions = getDemoDecisions();
  const dq_count = document.getElementById('dq-count');
  const dq_value = document.getElementById('dq-value');
  if (dq_count) dq_count.textContent = demoDecisions.length;
  if (dq_value) dq_value.textContent = '$3.4M';
  container.innerHTML = demoDecisions.map((d,i) => renderDecisionCard(d,i)).join('') +
    '<div class="secondary small mt-8">+ 1 more decision queued for this afternoon</div>';

  // Then try to load real data in background
  const data = await apiCall('/decisions/queue').catch(() => null);
  let rawDecisions = Array.isArray(data) ? data : (data?.decisions || []);
  const normalise = (d, i) => ({
    id: d.id || i+1,
    priority: (d.priority || d.urgency || 'medium').toLowerCase(),
    title: d.title || 'Action required',
    deadline: d.deadline ? new Date(d.deadline).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'â€”',
    countdown: d.deadline ? countdownStr(d.deadline) : 'â€”',
    potential_impact: d.impact_description || (d.potential_impact ? '$' + Number(d.potential_impact).toLocaleString() : 'Review required'),
    context: d.description || d.impact_description || '',
    actions: (d.urgency||d.priority||'').toLowerCase() === 'critical' ? ['Review Now','Snooze 30m'] : ['See Options','Snooze 1h']
  });
  const decisions = rawDecisions.length > 0 ? rawDecisions.map(normalise) : getDemoDecisions();
  document.getElementById('dq-count').textContent = decisions.length;
  const totalValue = decisions.reduce((s,d) => s + (parseFloat(d.potential_impact?.replace(/[^0-9.]/g,'')) || 0), 0);
  document.getElementById('dq-value').textContent = totalValue > 0 ? `$${(totalValue/1e6).toFixed(1)}M` : '$3.2M';
  container.innerHTML = decisions.map((d,i) => renderDecisionCard(d,i)).join('') +
    (decisions.length > 3 ? `<div class="secondary small mt-8">+ ${decisions.length-3} more decisions queued for this afternoon</div>` : '');
};

function getDemoDecisions() {
  return [
    { id:1, priority:'critical', title:'Review Urals hedge coverage before OPEC+ announcement', deadline:'09:30', countdown:'1h 56m', potential_impact:'$2,400,000', context:'OPEC+ meets at 10:00. Current hedge covers 61%. Analyst consensus: 70% probability of production cut announcement.', actions:['Review Now','Snooze 30m'] },
    { id:2, priority:'high',     title:'JS Ineos Innovation â€” choose response to 14h delay', deadline:'11:00', countdown:'3h 26m', potential_impact:'$480,000', context:'Three options costed. Terminal at Rafnes needs response. Ethane cargo delivery impacted. Option C (reroute via Stenungsund) is lowest cost.', actions:['See Options','Snooze 1h'] },
    { id:3, priority:'medium',   title:'Vitol trade confirmation outstanding â€” RMVT-0234', deadline:'15:00', countdown:'7h 26m', potential_impact:'Counterparty dispute risk', context:'Draft reply ready. One click to send. Trade was agreed verbally on 28-May. Written confirmation overdue by 24h.', actions:['Send Now','Review Draft'] },
    { id:4, priority:'low',      title:'Monthly performance review â€” submit to Risk by 17:00', deadline:'17:00', countdown:'9h 26m', potential_impact:'Reporting obligation', context:'Template pre-filled. Requires sign-off signature only.', actions:['Open Report','Delegate'] }
  ];
}

function renderDecisionCard(d, i) {
  const priorityEmoji = { critical:'ðŸ”´', high:'ðŸŸ ', medium:'ðŸŸ¡', low:'ðŸŸ¢' };
  const isUrgent = d.priority === 'critical';
  return `<div class="decision-card ${d.priority}" style="animation-delay:${i*0.08}s">
    <div class="decision-header">
      <div class="decision-title">${priorityEmoji[d.priority]||'ðŸ”µ'} DECISION ${i+1} â€” ${d.priority.toUpperCase()}</div>
      <div class="decision-deadline ${isUrgent?'urgent':''}">Deadline: ${d.deadline} (${d.countdown})</div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${d.title}</div>
    <div class="decision-impact">Potential impact: ${d.potential_impact}</div>
    <div class="decision-body">${d.context}</div>
    <button class="btn btn-ghost btn-sm" style="margin-bottom:8px;color:#6366f1;border-color:#6366f1" onclick="showDecisionReasoning(${d.id}, '${(d.title||'').replace(/'/g,"\\'")}')">ðŸ” Why this recommendation?</button>
    <div class="decision-actions">
      ${d.actions.map((a,ai) => `<button class="btn ${ai===0?'btn-primary':'btn-secondary'} btn-sm" onclick="handleDecisionAction(${d.id},'${a}')">${a}</button>`).join('')}
    </div>
  </div>`;
}

window.handleDecisionAction = function(id, action) {
  if (typeof setSelectedEntity === 'function') setSelectedEntity({ type: 'decision', id: String(id), label: `Decision ${id}` });
  showToast('Action', `Decision ${id}: "${action}" â€” opening details...`, 'info');
  if (action.toLowerCase().includes('review') || action.toLowerCase().includes('see')) openCopilot();
};

window.generateDecisionBriefing = async function() {
  const el = document.getElementById('ai-briefing-content');
  if (!el) return;
  el.textContent = '';
  el.classList.add('streaming');
  await streamToElement(el, '/chat/message', { message: 'Generate my morning decision briefing with market context', screen_context: 'decision_queue', provider: 'claude' });
  el.classList.remove('streaming');
};

window.showDecisionReasoning = async function(decisionId, title) {
  if (typeof setSelectedEntity === 'function') setSelectedEntity({ type: 'decision', id: String(decisionId), label: title });
  // Remove any existing modal
  const existing = document.getElementById('reasoning-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'reasoning-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;width:100%;max-width:680px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:20px 24px;border-bottom:1px solid #2d3748;display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6366f1;margin-bottom:4px">ðŸ” AI Reasoning & Evidence</div>
          <div style="font-size:15px;font-weight:600;color:#f1f5f9">${title}</div>
        </div>
        <button onclick="document.getElementById('reasoning-modal').remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:20px;line-height:1;padding:0">Ã—</button>
      </div>
      <div id="reasoning-content" style="padding:24px;overflow-y:auto;flex:1;font-size:14px;line-height:1.7;color:#cbd5e1">
        <div style="display:flex;align-items:center;gap:8px;color:#6366f1">
          <div style="width:8px;height:8px;border-radius:50%;background:#6366f1;animation:pulse 1s infinite"></div>
          Radiant AI is analysing the evidence...
        </div>
      </div>
      <div style="padding:12px 24px;border-top:1px solid #2d3748;font-size:11px;color:#475569;display:flex;align-items:center;justify-content:space-between">
        <span id="reasoning-source-label">Based on live positions, market data, and alerts</span>
        <button id="reasoning-refresh-btn" onclick="window._refreshReasoning && window._refreshReasoning()" style="font-size:11px;color:#6366f1;background:none;border:1px solid #6366f133;border-radius:4px;padding:2px 8px;cursor:pointer;display:none">â†» Refresh</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  const contentEl = document.getElementById('reasoning-content');
  contentEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:#6366f1"><div style="width:8px;height:8px;border-radius:50%;background:#6366f1;animation:pulse 1s infinite"></div>Fetching reasoning...</div>';
  // Store decisionId for refresh button
  window._refreshReasoning = async () => {
    await fetch('/api/decisions/' + decisionId + '/refresh-reasoning', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + readAppToken() }
    });
    showDecisionReasoning(decisionId, title);
  };

  try {
    const token = readAppToken();
    const response = await fetch(`/api/decisions/${decisionId}/reasoning`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch reasoning');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    contentEl.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.meta === 'cached') {
              const srcLabel = document.getElementById('reasoning-source-label');
              const refreshBtn = document.getElementById('reasoning-refresh-btn');
              const genAt = parsed.generated_at ? new Date(parsed.generated_at).toLocaleTimeString() : '';
              if (srcLabel) srcLabel.innerHTML = 'âš¡ Cached reasoning' + (genAt ? ' Â· generated ' + genAt : '');
              if (refreshBtn) refreshBtn.style.display = 'inline-block';
            } else if (parsed.chunk) {
              accumulated += parsed.chunk;
              // Render markdown-like formatting
              contentEl.innerHTML = accumulated
                .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f1f5f9">$1</strong>')
                .replace(/^(\d+\..+)$/gm, '<div style="margin-top:16px;color:#f1f5f9;font-weight:600">$1</div>')
                .replace(/\n/g, '<br>');
            } else if (parsed.error) {
              contentEl.innerHTML = '<div style="color:#ef4444;padding:12px;background:#1e1014;border-radius:6px;border:1px solid #7f1d1d">'
                + '<strong>AI Error:</strong> ' + parsed.error
                + '<br><br><span style="color:#94a3b8;font-size:12px">Tip: Add your ANTHROPIC_API_KEY to the .env file, or switch to Local LLM in the header toggle.</span>'
                + '</div>';
            }
          } catch(e) {}
        }
      }
    }
  } catch(err) {
    contentEl.innerHTML = `<div style="color:#ef4444">Failed to load reasoning: ${err.message}</div>`;
  }
};

/* â”€â”€ SCREEN 2: DASHBOARD â”€â”€ */
const DASHBOARD_LAYOUT_KEY = SCREEN_STORAGE_KEYS.dashboardLayout || 'radiant_dashboard_layout_v2';
const DASHBOARD_TILE_ORDER = ['kpis','book-pnl','top-performer','intraday','market-curve','heatmaps','alerts','news','blotter'];
const DASHBOARD_TILE_META = {
  'kpis': { label: 'KPI Strip', span: 12 },
  'book-pnl': { label: 'Book P&L', span: 4 },
  'top-performer': { label: 'Top Performer', span: 4 },
  'intraday': { label: 'Intraday P&L', span: 4 },
  'market-curve': { label: 'Market Curve', span: 8, apps: ['risk'] },
  'heatmaps': { label: 'Position Heat Maps', span: 8 },
  'alerts': { label: 'AI Alerts', span: 4 },
  'news': { label: 'Market News', span: 4 },
  'blotter': { label: 'Trade Blotter', span: 12 }
};
var dashboardMarketCurveChartRef = null;
var activeDashboardMarketCurve = 'brent';

function getDashboardTileIds() {
  return DASHBOARD_TILE_ORDER.filter(function(id) {
    var meta = DASHBOARD_TILE_META[id];
    return meta && (!meta.apps || meta.apps.includes(SCREEN_APP_ID));
  });
}

function normalizeDashboardLayout(state) {
  state = state || {};
  var tileIds = getDashboardTileIds();
  var order = Array.isArray(state.order) ? state.order.slice() : tileIds.slice();
  var hidden = Array.isArray(state.hidden) ? state.hidden.slice() : [];
  tileIds.forEach(function(id) {
    if (!order.includes(id)) order.push(id);
  });
  order = order.filter(function(id, index) {
    return tileIds.includes(id) && order.indexOf(id) === index;
  });
  hidden = hidden.filter(function(id, index) {
    return tileIds.includes(id) && hidden.indexOf(id) === index;
  });
  return { order: order, hidden: hidden };
}

function getDashboardLayoutState() {
  try {
    return normalizeDashboardLayout(JSON.parse((window.appStorageGet ? window.appStorageGet(DASHBOARD_LAYOUT_KEY) : localStorage.getItem(DASHBOARD_LAYOUT_KEY)) || '{}'));
  } catch (e) {
    return normalizeDashboardLayout({});
  }
}

function saveDashboardLayoutState(state) {
  var normalized = normalizeDashboardLayout(state);
  if (window.appStorageSet) window.appStorageSet(DASHBOARD_LAYOUT_KEY, JSON.stringify(normalized));
  else localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(normalized));
  return normalized;
}

function getDashboardTileBody(id) {
  if (id === 'kpis') {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'
      + '<div style="background:linear-gradient(135deg,#0066CC,#0052A3);border-radius:10px;padding:12px 14px;color:white">'
      + '<div style="font-size:10px;opacity:.75;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Today\'s P&amp;L</div>'
      + '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px" id="kpi-pnl">+$2.1M</div>'
      + '<div style="font-size:11px;opacity:.8;margin-top:2px">Live desk total</div>'
      + '</div>'
      + '<div style="background:linear-gradient(135deg,#16A34A,#15803D);border-radius:10px;padding:12px 14px;color:white">'
      + '<div style="font-size:10px;opacity:.75;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">YTD Performance</div>'
      + '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px">+$47.3M</div>'
      + '<div style="font-size:11px;opacity:.8;margin-top:2px">&#9650; 94% of $50M budget</div>'
      + '</div>'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">VaR Utilisation</div>'
      + '<div style="font-size:22px;font-weight:800;color:#D97706;letter-spacing:-.5px" id="kpi-var-util">62%</div>'
      + '<div style="background:#FEF3C7;border-radius:4px;height:5px;margin-top:6px"><div id="kpi-var-bar" style="background:#D97706;height:5px;border-radius:4px;width:62%"></div></div>'
      + '</div>'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Open Positions</div>'
      + '<div style="font-size:22px;font-weight:800;color:var(--text2);letter-spacing:-.5px" id="kpi-open-positions">6</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:2px" id="kpi-active-books">Across 4 active books</div>'
      + '</div>'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Active Decisions</div>'
      + '<div style="font-size:22px;font-weight:800;color:#DC2626;letter-spacing:-.5px" id="kpi-active-alerts">3</div>'
      + '<div style="font-size:11px;color:#DC2626;margin-top:2px">Open AI alerts</div>'
      + '</div>'
      + '</div>';
  }
  if (id === 'book-pnl') {
    return '<div class="card" style="padding:14px;height:100%">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      + '<span style="font-size:13px;font-weight:700;color:var(--text2)">Book P&amp;L</span>'
      + '<span class="badge badge-info" id="dash-pnl-time">Today</span>'
      + '</div>'
      + '<div style="font-size:32px;font-weight:800;color:#16A34A;letter-spacing:-1px;margin:6px 0 2px" id="total-pnl-val">+$2.1M</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:12px">Updated from current open positions</div>'
      + '<div id="book-cards"></div>'
      + '</div>';
  }
  if (id === 'top-performer') {
    return '<div class="card" style="padding:12px;background:var(--dashboard-top-performer-bg);height:100%">'
      + '<div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:8px">&#127942; Top Performer Today</div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--text)">Crude &amp; Condensate</div>'
      + '<div style="font-size:22px;font-weight:800;color:#16A34A;margin:3px 0">+$1.24M</div>'
      + '<div style="font-size:11px;color:var(--muted)">Brent long 120kbbl | avg entry $82.20 | now $96.97</div>'
      + '</div>';
  }
  if (id === 'intraday') {
    return '<div class="card" style="padding:12px;height:100%">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<span style="font-size:13px;font-weight:700;color:var(--text2)">Intraday P&amp;L</span>'
      + '<span style="display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;background:#16A34A;border-radius:50%;animation:delayPulse 1.5s infinite"></span><span class="badge badge-info">Live</span></span>'
      + '</div>'
      + '<div style="position:relative;height:220px"><canvas id="intraday-chart"></canvas></div>'
      + '</div>';
  }
  if (id === 'heatmaps') {
    return '<div class="card" style="padding:12px;height:100%">'
      + '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:4px">&#128200; Position Heat Maps <span style="font-size:11px;font-weight:400;color:var(--muted)">Commodity x Region</span></div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">These two maps now sit side by side by default, and you can move the whole tile anywhere in the dashboard.</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">'
      + '<div style="min-width:0">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">P&amp;L Heat Map</div>'
      + '<div id="heat-map-grid-pnl"></div>'
      + '</div>'
      + '<div style="min-width:0">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">Barrels Heat Map</div>'
      + '<div id="heat-map-grid-barrels"></div>'
      + '</div>'
      + '</div>'
      + '</div>';
  }
  if (id === 'market-curve') {
    return '<div class="card" style="padding:12px;height:100%">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap">'
      + '<div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text2)">Forward Market Curve</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:2px">Prompt-to-forward shape for curve and basis risk</div>'
      + '</div>'
      + '<div class="curve-selector" id="dashboard-curve-selector" style="flex-wrap:wrap;justify-content:flex-end">'
      + '<button class="curve-btn active" onclick="switchDashboardMarketCurve(\'brent\', this)">Brent</button>'
      + '<button class="curve-btn" onclick="switchDashboardMarketCurve(\'wti\', this)">WTI</button>'
      + '<button class="curve-btn" onclick="switchDashboardMarketCurve(\'ethane\', this)">Ethane</button>'
      + '<button class="curve-btn" onclick="switchDashboardMarketCurve(\'naphtha\', this)">Naphtha</button>'
      + '<button class="curve-btn" onclick="switchDashboardMarketCurve(\'eua\', this)">EUA</button>'
      + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px" id="dashboard-curve-stats">'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Prompt</div><div style="font-size:17px;font-weight:800;color:var(--text2)" id="dash-curve-prompt">--</div></div>'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Far</div><div style="font-size:17px;font-weight:800;color:var(--text2)" id="dash-curve-far">--</div></div>'
      + '<div style="background:var(--dashboard-kpi-neutral-bg);border:1px solid var(--dashboard-kpi-neutral-border);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Shape</div><div style="font-size:17px;font-weight:800;color:#D97706" id="dash-curve-shape">--</div></div>'
      + '</div>'
      + '<div style="position:relative;height:230px"><canvas id="dashboard-market-curve-chart"></canvas></div>'
      + '</div>';
  }
  if (id === 'alerts') {
    return '<div class="card" style="padding:0;overflow:hidden;height:100%">'
      + '<div style="padding:10px 12px 8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--dashboard-table-header-bg)">'
      + '<span style="font-size:13px;font-weight:700;color:var(--text2)">&#128276; AI Alerts</span>'
      + '<span style="font-size:11px;background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:20px;font-weight:700" id="dash-alert-count">2 Active</span>'
      + '</div>'
      + '<div id="dash-alerts" style="padding:8px 12px 10px;max-height:260px;overflow-y:auto"></div>'
      + '</div>';
  }
  if (id === 'news') {
    return '<div class="card" style="padding:0;overflow:hidden;height:100%">'
      + '<div style="padding:10px 12px 8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--dashboard-table-header-bg)">'
      + '<span style="font-size:13px;font-weight:700;color:var(--text2)">&#128240; Market News</span>'
      + '<span style="font-size:11px;color:var(--muted)">Jun 4, 2026</span>'
      + '</div>'
      + '<div id="dash-news" style="padding:4px 12px 8px;max-height:300px;overflow-y:auto"></div>'
      + '</div>';
  }
  return '<div class="card" style="padding:0;overflow:hidden;height:100%">'
    + '<div style="padding:10px 14px 8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--dashboard-table-header-bg)">'
    + '<span style="font-size:13px;font-weight:700;color:var(--text2)">&#128195; Trade Blotter</span>'
    + '<div style="display:flex;align-items:center;gap:12px">'
    + '<span style="font-size:13px;color:var(--muted)">Showing last <select id="blotter-row-count" onchange="reloadBlotter(this.value)" style="background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:2px 6px;font-size:13px"><option value="5">5</option><option value="10">10</option><option value="20" selected>20</option><option value="50">50</option><option value="100">100</option></select> trades</span>'
    + '<span id="blotter-update-time" style="font-size:11px;color:var(--muted)">Updated just now</span>'
    + '</div>'
    + '</div>'
    + '<div style="max-height:260px;overflow-y:auto">'
    + '<table class="trading-table" style="width:100%"><thead><tr>'
    + '<th>Trade Ref</th><th>Commodity</th><th>Dir</th><th class="right">Volume</th><th class="right">Price</th><th>Counterparty</th><th>Status</th><th>Time</th><th>AI</th>'
    + '</tr></thead><tbody id="blotter-tbody"></tbody></table>'
    + '</div>'
    + '</div>';
}

function renderDashboardCustomizer() {
  var layout = getDashboardLayoutState();
  var panel = document.getElementById('dashboard-customizer');
  if (!panel) return;
  panel.innerHTML = getDashboardTileIds().map(function(id) {
    var meta = DASHBOARD_TILE_META[id];
    var hidden = layout.hidden.includes(id);
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
      + '<div><div style="font-size:12px;font-weight:700;color:var(--text)">' + meta.label + '</div><div style="font-size:11px;color:var(--muted)">' + (hidden ? 'Hidden' : 'Visible') + ' Â· drag visible tiles to reorder</div></div>'
      + '<button class="btn btn-secondary btn-sm" onclick="toggleDashboardTileVisibility(\'' + id + '\')">' + (hidden ? 'Add Tile' : 'Hide Tile') + '</button>'
      + '</div>';
  }).join('');
}

function renderDashboardTiles() {
  var layout = getDashboardLayoutState();
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;
  var visible = layout.order.filter(function(id) { return !layout.hidden.includes(id); });
  grid.innerHTML = visible.map(function(id) {
    var meta = DASHBOARD_TILE_META[id];
    return '<div class="dashboard-tile-shell" draggable="' + (id !== 'kpis') + '" data-tile-id="' + id + '" style="grid-column:span ' + meta.span + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      + '<div style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">'
      + '<span class="dashboard-tile-handle" style="cursor:' + (id !== 'kpis' ? 'grab' : 'default') + ';opacity:' + (id !== 'kpis' ? '1' : '.35') + '">&#8645;</span>'
      + '<span>' + meta.label + '</span>'
      + '</div>'
      + '</div>'
      + getDashboardTileBody(id)
      + '</div>';
  }).join('');
  setupDashboardTileDnD();
  renderDashboardCustomizer();
}

function setupDashboardTileDnD() {
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;
  Array.from(grid.querySelectorAll('.dashboard-tile-shell')).forEach(function(tile) {
    tile.addEventListener('dragstart', function(event) {
      var tileId = tile.getAttribute('data-tile-id');
      if (tileId === 'kpis') {
        event.preventDefault();
        return;
      }
      tile.style.opacity = '0.5';
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tileId);
    });
    tile.addEventListener('dragend', function() {
      tile.style.opacity = '';
    });
    tile.addEventListener('dragover', function(event) {
      event.preventDefault();
    });
    tile.addEventListener('drop', function(event) {
      event.preventDefault();
      var sourceId = event.dataTransfer.getData('text/plain');
      var targetId = tile.getAttribute('data-tile-id');
      if (!sourceId || !targetId || sourceId === targetId || targetId === 'kpis') return;
      var layout = getDashboardLayoutState();
      var sourceIndex = layout.order.indexOf(sourceId);
      var targetIndex = layout.order.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;
      layout.order.splice(sourceIndex, 1);
      layout.order.splice(targetIndex, 0, sourceId);
      saveDashboardLayoutState(layout);
      renderDashboardTiles();
      loadDashboardData();
    });
  });
}

window.toggleDashboardCustomizer = function() {
  var panel = document.getElementById('dashboard-customizer-panel');
  if (!panel) return;
  var show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  if (show) renderDashboardCustomizer();
};

window.toggleDashboardTileVisibility = function(tileId) {
  var layout = getDashboardLayoutState();
  if (layout.hidden.includes(tileId)) {
    layout.hidden = layout.hidden.filter(function(id) { return id !== tileId; });
  } else if (tileId !== 'kpis') {
    layout.hidden.push(tileId);
  }
  saveDashboardLayoutState(layout);
  renderDashboardTiles();
  loadDashboardData();
};

window.resetDashboardLayout = function() {
  saveDashboardLayoutState({ order: getDashboardTileIds(), hidden: [] });
  renderDashboardTiles();
  loadDashboardData();
};

SCREENS['dashboard'] = async function(main) {
  var dateStr = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
  var dashTitle = 'Trader Dashboard';
  var dashSubtitle = 'Live book overview - ' + dateStr;
  main.innerHTML = '<div class="screen" style="padding:12px 14px">'
    + '<div class="screen-header" style="margin-bottom:10px">'
    + '<div><div class="screen-title">&#128202; ' + dashTitle + '</div><div class="screen-subtitle">' + dashSubtitle + '</div></div>'
    + '<div class="screen-actions" style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<select class="form-select" style="width:130px" id="dash-book-filter" onchange="onDashboardBookFilterChange()"><option value="">All Books</option><option>Crude</option><option>NGL/Ethane</option><option>Naphtha</option><option>Carbon</option></select>'
    + '<button class="btn btn-secondary btn-sm" onclick="toggleDashboardCustomizer()">Customize Layout</button>'
    + '<button class="btn btn-secondary btn-sm" onclick="resetDashboardLayout()">Reset Layout</button>'
    + '<button class="btn btn-secondary btn-sm" onclick="loadDashboardData()">&#8635; Refresh</button>'
    + '</div></div>'
    + '<div id="dashboard-customizer-panel" class="card" style="padding:12px;margin-bottom:12px;display:none">'
    + '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:4px">Dashboard Layout</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Hide or add tiles below. Drag visible tiles by the handle to rearrange the dashboard.</div>'
    + '<div id="dashboard-customizer"></div>'
    + '</div>'
    + '<div id="dashboard-grid" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px"></div>'
    + '</div>';
  renderDashboardTiles();
  loadDashboardData();
};

window.loadDashboardData = async function() {
  var selectedFilter = document.getElementById('dash-book-filter')?.value || '';
  const dashboard = await apiCall('/dashboard/summary?book_filter=' + encodeURIComponent(selectedFilter)).catch(() => null);
  renderDashboardSummary(dashboard && dashboard.summary ? dashboard.summary : null, dashboard && dashboard.alerts ? dashboard.alerts : null);
  renderBooks(dashboard && dashboard.summary ? dashboard.summary : null);
  renderBlotter(dashboard && dashboard.trades ? { trades: dashboard.trades } : null);
  renderAlerts(dashboard && dashboard.alerts ? dashboard.alerts : null);
  renderNews(dashboard && dashboard.news ? dashboard.news : null);
  renderHeatMap(dashboard && dashboard.heatmap ? dashboard.heatmap : null);
  setTimeout(renderIntradayChart, 80);
  setTimeout(renderDashboardMarketCurveChart, 90);
};

window.onDashboardBookFilterChange = function() {
  loadDashboardData();
};

function renderDashboardSummary(summary, alerts) {
  summary = summary || {};
  alerts = Array.isArray(alerts) ? alerts : [];
  var totalPnl = Number(summary.total_mtm_pnl || 0);
  var pnlEl = document.getElementById('kpi-pnl');
  if (pnlEl) {
    pnlEl.textContent = (totalPnl >= 0 ? '+$' : '-$') + (Math.abs(totalPnl) / 1e6).toFixed(1) + 'M';
  }
  var utilPct = Number(summary.var_utilisation_pct || 0);
  var utilEl = document.getElementById('kpi-var-util');
  var utilBar = document.getElementById('kpi-var-bar');
  if (utilEl) utilEl.textContent = utilPct.toFixed(utilPct >= 10 ? 0 : 1) + '%';
  if (utilBar) utilBar.style.width = Math.max(0, Math.min(utilPct, 100)) + '%';
  var openPosEl = document.getElementById('kpi-open-positions');
  if (openPosEl) openPosEl.textContent = String(summary.open_positions || 0);
  var activeBooksEl = document.getElementById('kpi-active-books');
  if (activeBooksEl) activeBooksEl.textContent = 'Across ' + String(summary.active_books || 0) + ' active books';
  var activeAlerts = alerts.filter(function(alert) { return (alert.status || '').toLowerCase() !== 'resolved'; }).length;
  var alertKpiEl = document.getElementById('kpi-active-alerts');
  var alertBadgeEl = document.getElementById('dash-alert-count');
  if (alertKpiEl) alertKpiEl.textContent = String(activeAlerts);
  if (alertBadgeEl) alertBadgeEl.textContent = activeAlerts + ' Active';
}

function renderBooks(data) {
  var books = (data && data.books) || [
    { name:'Crude & Condensate', pnl:1240000, size:'$84M', icon:'&#128738;', pct:59 },
    { name:'NGL / Ethane',       pnl:680000,  size:'$32M', icon:'&#129514;', pct:32 },
    { name:'Naphtha',            pnl:-140000, size:'$28M', icon:'&#9875;',   pct:-7 },
    { name:'Carbon (EUA)',       pnl:320000,  size:'$14M', icon:'&#127807;', pct:15 }
  ];
  var total = books.reduce(function(s,b){ return s+(b.pnl||0); }, 0);
  var el = document.getElementById('total-pnl-val');
  if (el) { el.textContent = (total>=0?'+$':'âˆ’$') + (Math.abs(total)/1e6).toFixed(1)+'M'; el.style.color = total>=0?'#16A34A':'#DC2626'; }
  var container = document.getElementById('book-cards');
  if (!container) return;
  var maxAbs = Math.max.apply(null, books.map(function(b){ return Math.abs(b.pnl); }));
  container.innerHTML = books.map(function(b) {
    var pos = b.pnl >= 0;
    var barW = Math.round(Math.abs(b.pnl)/maxAbs*100);
    var barColor = pos ? '#16A34A' : '#DC2626';
    var bgColor = pos ? 'var(--dashboard-book-positive-bg)' : 'var(--dashboard-book-negative-bg)';
    var pnlStr = (pos?'+':'-')+'$'+Math.abs(b.pnl/1000).toFixed(0)+'K';
    return '<div style="background:'+bgColor+';border-radius:8px;padding:9px 11px;margin-bottom:6px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'
      + '<span style="font-size:13px">' + (b.icon||'&#128202;') + ' <strong style="color:var(--text)">' + b.name + '</strong></span>'
      + '<span style="font-size:14px;font-weight:800;color:'+barColor+'">'+pnlStr+'</span>'
      + '</div>'
      + '<div style="background:var(--dashboard-book-bar-bg);border-radius:3px;height:5px;overflow:hidden">'
      + '<div style="background:'+barColor+';height:5px;border-radius:3px;width:'+barW+'%;transition:width .8s"></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:4px">'
      + '<span style="font-size:10px;color:var(--muted)">Book size: '+b.size+'</span>'
      + '<span style="font-size:10px;font-weight:700;color:'+barColor+'">'+(b.pct>=0?'+':'')+b.pct+'% today</span>'
      + '</div></div>';
  }).join('');
}

window.reloadBlotter = async function(count) {
  count = parseInt(count) || 20;
  var selectedFilter = document.getElementById('dash-book-filter')?.value || '';
  const data = await apiCall('/dashboard/summary?trade_limit=' + count + '&book_filter=' + encodeURIComponent(selectedFilter)).catch(() => null);
  renderBlotter(data && data.trades ? { trades: data.trades } : null, count);
};

function renderBlotter(data, rowLimit) {
  rowLimit = rowLimit || parseInt(document.getElementById('blotter-row-count')?.value) || 20;
  var trades = (data && (data.trades || (Array.isArray(data)?data:null))) || getDemoTrades();
  var tbody = document.getElementById('blotter-tbody');
  if (!tbody) return;
  window.dashboardFlaggedTrades = {};

  var commColors = { Brent:'#1D4ED8', WTI:'#7C3AED', Urals:'#0F766E', Ethane:'#16A34A', NGLs:'#D97706', EUA:'#15803D', Naphtha:'#9D174D' };
  var commIcons  = { Brent:'&#128738;', WTI:'&#128507;', Urals:'&#127981;', Ethane:'&#129514;', NGLs:'&#9889;', EUA:'&#127807;', Naphtha:'&#9875;' };

  tbody.innerHTML = trades.slice(0,rowLimit).map(function(t) {
    var comm = t.commodity || 'Brent';
    var dir = (t.direction||'BUY').toUpperCase();
    var isBuy = dir === 'BUY';
    var status = (t.status||'CONFIRMED').toUpperCase();
    var flagged = !t.ai_reviewed;
    var rowBg = flagged ? 'var(--warn-lt)' : '';
    var commColor = commColors[comm] || 'var(--text2)';
    var icon = commIcons[comm] || '&#128202;';
    var price = typeof t.price==='number' ? t.price.toFixed(2) : (t.price||'82.40');
    var vol = (t.volume||50000).toLocaleString();
    var time = t.created_at ? new Date(t.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ('0'+Math.floor(7+Math.random()*8)).slice(-2)+':'+('0'+Math.floor(Math.random()*59)).slice(-2);
    var tradeKey = String(t.trade_ref || t.id || ('RMVT-000' + Math.max(1, Math.floor(Math.random()*9))));
    if (flagged) window.dashboardFlaggedTrades[tradeKey] = getAIFlagDetails(t, tradeKey, comm, dir, vol, price);
    return '<tr style="background:'+rowBg+'">'
      + '<td><span style="font-family:monospace;font-size:12px;color:#0066CC;font-weight:600">'+tradeKey+'</span></td>'
      + '<td><span style="background:'+commColor+'18;color:'+commColor+';font-weight:700;font-size:11.5px;padding:2px 8px;border-radius:20px;white-space:nowrap">'+icon+' '+comm+'</span></td>'
      + '<td><span style="background:'+(isBuy?'#DCFCE7':'#FEE2E2')+';color:'+(isBuy?'#15803D':'#DC2626')+';font-weight:700;font-size:11px;padding:2px 9px;border-radius:20px">'+dir+'</span></td>'
      + '<td style="text-align:right;font-family:monospace;font-size:12px">'+vol+'</td>'
      + '<td style="text-align:right;font-family:monospace;font-size:12px;font-weight:600">'+price+'</td>'
      + '<td style="font-size:12px;color:var(--text2)">'+(t.counterparty||'Vitol')+'</td>'
      + '<td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:'+(status==='CONFIRMED'?'#DCFCE7':status==='PENDING'?'#FEF9C3':'#FEE2E2')+';color:'+(status==='CONFIRMED'?'#15803D':status==='PENDING'?'#854D0E':'#DC2626')+'">'+status+'</span></td>'
      + '<td style="font-size:12px;color:var(--muted)">'+time+'</td>'
      + '<td>'+(flagged?'<button class="ai-flag-badge" data-trade-key="'+tradeKey.replace(/"/g,'&quot;')+'" title="Show AI review details">&#9888; Flagged</button>':'<span style="font-size:11px;color:#16A34A;font-weight:700">&#10003; Verified</span>')+'</td>'
      + '</tr>';
  }).join('');

  tbody.querySelectorAll('.ai-flag-badge').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showAIFlagDetails(btn.dataset.tradeKey);
    });
  });

  var upd = document.getElementById('blotter-update-time');
  if (upd) upd.textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}

function getAIFlagDetails(t, tradeKey, commodity, direction, volume, price) {
  var scenarios = {
    Ethane: {
      reason: 'Blocked for logistics and exposure review',
      signal: 'Ethane cargo exposure is tied to delayed vessel economics and the desk already has elevated NGL/Ethane concentration.',
      evidence: ['Dragon fleet ETA variance increased after the latest terminal update', 'Trade size would lift NGL/Ethane book VaR by an estimated 7%', 'Counterparty confirmation is present, but voyage hedge linkage is incomplete'],
      action: 'Confirm cargo handling option and attach voyage hedge before releasing the trade.'
    },
    NGLs: {
      reason: 'Blocked for stale curve validation',
      signal: 'NGL forward curve input is older than the trading threshold while the trade price is near the edge of the current bid/offer range.',
      evidence: ['Last validated NGL curve snapshot is more than 30 minutes old', 'Price differs from current desk fair value by more than 1.5 sigma', 'AI could not match a live broker quote for the same tenor'],
      action: 'Refresh NGL curve, reprice the ticket, and rerun AI verification.'
    },
    Urals: {
      reason: 'Blocked for sanctions and spread-risk review',
      signal: 'Urals trade requires extra review because the Brent/Urals spread is moving quickly and counterparty jurisdiction screening is incomplete.',
      evidence: ['Brent/Urals differential moved beyond the desk guardrail intraday', 'Counterparty KYC timestamp is outside today\'s trading session', 'Position would increase short-term basis risk in the Med book'],
      action: 'Complete counterparty screening and confirm spread hedge coverage.'
    },
    Brent: {
      reason: 'Blocked for position-limit check',
      signal: 'The trade would increase prompt Brent exposure while VaR utilisation is already above the desk watch level.',
      evidence: ['Desk VaR is at 62% with prompt-month sensitivity concentrated in Brent', 'Trade direction adds to existing same-direction exposure', 'AI recommends risk-manager acknowledgement before release'],
      action: 'Reduce size, add hedge coverage, or request risk approval.'
    },
    WTI: {
      reason: 'Blocked for benchmark mismatch',
      signal: 'WTI ticket terms do not fully align with the linked Brent hedge assumptions.',
      evidence: ['Benchmark basis field is missing from the ticket', 'Hedge effectiveness drops below the 80% desk threshold', 'Settlement calendar differs from the linked exposure'],
      action: 'Add basis terms and confirm hedge mapping.'
    },
    EUA: {
      reason: 'Blocked for carbon allowance compliance check',
      signal: 'EUA allowance trade needs compliance review because delivery and registry treatment are not fully specified.',
      evidence: ['Registry account field is incomplete', 'Trade date falls near the allowance reporting window', 'AI cannot confirm whether the ticket is hedge or inventory usage'],
      action: 'Tag the trade purpose and add registry details.'
    },
    Naphtha: {
      reason: 'Blocked for margin and crack-spread review',
      signal: 'Naphtha exposure is underperforming today and the proposed trade could compound crack-spread downside.',
      evidence: ['Naphtha book is down intraday', 'Ethane/Naphtha substitution signal is active', 'Trade increases exposure in the weaker leg without offsetting hedge'],
      action: 'Review crack-spread hedge and reduce directional exposure.'
    }
  };
  var detail = scenarios[commodity] || scenarios.Brent;
  return Object.assign({
    tradeKey: tradeKey,
    commodity: commodity,
    direction: direction,
    volume: volume,
    price: price,
    counterparty: t.counterparty || 'Vitol',
    status: (t.status || 'CONFIRMED').toUpperCase(),
    confidence: t.ai_confidence || 'High',
    reviewedBy: 'Radiant AI trade-control check'
  }, detail);
}

function showAIFlagDetails(tradeKey) {
  var detail = (window.dashboardFlaggedTrades || {})[tradeKey];
  if (!detail) {
    showToast('AI Flag', 'No review details were found for this trade.', 'warning');
    return;
  }
  document.getElementById('ai-flag-modal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'ai-flag-modal';
  modal.className = 'ai-flag-modal';
  modal.innerHTML = '<div class="ai-flag-dialog">'
    + '<div class="ai-flag-header">'
    + '<div><div class="ai-flag-kicker">&#9888; AI Flagged Trade</div><div class="ai-flag-title">'+detail.tradeKey+' is blocked</div></div>'
    + '<button class="ai-flag-close" onclick="document.getElementById(\'ai-flag-modal\').remove()">&#10005;</button>'
    + '</div>'
    + '<div class="ai-flag-summary">'
    + '<div><span>Commodity</span><strong>'+detail.commodity+'</strong></div>'
    + '<div><span>Direction</span><strong>'+detail.direction+'</strong></div>'
    + '<div><span>Volume</span><strong>'+detail.volume+'</strong></div>'
    + '<div><span>Price</span><strong>'+detail.price+'</strong></div>'
    + '</div>'
    + '<div class="ai-flag-section blocked"><span>Why blocked</span><strong>'+detail.reason+'</strong><p>'+detail.signal+'</p></div>'
    + '<div class="ai-flag-section"><span>Evidence</span><ul>'+detail.evidence.map(function(e){ return '<li>'+e+'</li>'; }).join('')+'</ul></div>'
    + '<div class="ai-flag-action"><span>Recommended next step</span><strong>'+detail.action+'</strong></div>'
    + '<div class="ai-flag-footer">'
    + '<button class="btn btn-secondary" onclick="sendCopilotMessage(\'Explain AI block for trade '+detail.tradeKey+'\');document.getElementById(\'ai-flag-modal\').remove()">Ask AI</button>'
    + '<button class="btn btn-primary" onclick="document.getElementById(\'ai-flag-modal\').remove()">Got it</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
}

window.showAIFlagDetails = showAIFlagDetails;

function getDemoTrades() {
  const cps = ['Vitol','Shell','BP','Glencore','Trafigura','Gunvor','Mercuria'];
  const comms = ['Brent','WTI','Urals','Naphtha','Ethane','EUA'];
  return Array.from({length:20},(_,i) => ({
    trade_ref:`RMVT-${String(200+i).padStart(4,'0')}`,
    commodity: comms[i%comms.length],
    direction: i%3===0?'SELL':'BUY',
    volume: (50+Math.floor(Math.random()*200))*1000,
    price: (75 + Math.random()*15).toFixed(2),
    counterparty: cps[i%cps.length],
    status: i===2?'PENDING':i===5?'DISPUTED':'CONFIRMED',
    ai_reviewed: i%4!==0
  }));
}

function renderAlerts(data) {
  var raw = (data && (data.alerts || data)) || [];
  var alerts = raw.length ? raw : [
    { severity:'critical', icon:'&#128308;', title:'Fat-finger â€” Ethane Americas', body:'RMVT-95378: 5,002 MT @ $58.71 â€” 4Ã— typical volume. P&L +$420K in 15 min.', time:'02:41' },
    { severity:'high',     icon:'&#128992;', title:'JS Ineos Insight â€” demurrage risk', body:'14h delay past laytime. Est. demurrage $26,250. Three options costed.', time:'Yesterday' },
    { severity:'medium',   icon:'&#128993;', title:'Vitol credit limit 88%', body:'$142M of $160M limit. Two trades pending settlement could push to 97%.', time:'08:15' },
  ];
  var el = document.getElementById('dash-alerts');
  if (!el) return;
  var cfg = { critical:{ bg:'var(--neg-lt)', bc:'#DC2626', tc:'#991B1B' }, high:{ bg:'#FFF7ED', bc:'#D97706', tc:'#92400E' }, medium:{ bg:'#FEFCE8', bc:'#CA8A04', tc:'#854D0E' } };
  el.innerHTML = (Array.isArray(alerts)?alerts:[]).slice(0,3).map(function(a, ai) {
    var c = cfg[a.severity] || cfg.medium;
    var alertId = 'alert-detail-' + ai;
    return '<div style="background:'+c.bg+';border-left:3px solid '+c.bc+';border-radius:0 7px 7px 0;padding:8px 10px;margin-bottom:6px;cursor:pointer" onclick="this.querySelector(\'[data-expand]\').style.display=this.querySelector(\'[data-expand]\').style.display===\'none\'?\'block\':\'none\'">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      + '<span style="font-size:12.5px;font-weight:700;color:'+c.tc+'">'+(a.icon||'&#9888;')+' '+(a.title||'')+'</span>'
      + '<span style="font-size:10px;color:var(--muted);white-space:nowrap;margin-left:6px">'+(a.time||'')+'</span>'
      + '</div>'
      + '<div style="font-size:11.5px;color:var(--text2);margin-top:3px;line-height:1.4">'+(a.body||a.description||'')+'</div>'
      + '<div data-expand style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid '+c.bc+'20">'
      + '<div style="font-size:11px;font-weight:700;color:'+c.tc+';margin-bottom:4px">Full context</div>'
      + '<div style="font-size:11px;color:var(--text2);line-height:1.5">'+(a.body||a.description||'No additional detail available.')+'</div>'
      + '<button onclick="event.stopPropagation();window.sendCopilotMessage&&window.sendCopilotMessage(\'Tell me more about: '+(a.title||'').replace(/'/g,"\\'")+'\')" style="margin-top:6px;font-size:11px;padding:3px 10px;border:1px solid '+c.bc+';background:var(--card);color:'+c.tc+';border-radius:5px;cursor:pointer">Ask AI â†’</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function renderIntradayChart() {
  var canvas = document.getElementById('intraday-chart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') return;
  // Destroy existing chart
  var existing = Chart.getChart ? Chart.getChart(canvas) : null;
  if (existing) existing.destroy();

  // Generate realistic intraday P&L curve
  var now = new Date();
  var labels = [], values = [], cumPnl = 0;
  var openHour = 7, currentMin = now.getHours() * 60 + now.getMinutes();
  var openMin = openHour * 60;
  var totalMins = Math.min(currentMin - openMin, 600);
  if (totalMins < 10) totalMins = 600; // fallback for early morning
  var step = 15; // every 15 minutes
  var swings = [0.8, 1.2, -0.3, 0.6, 1.8, 0.4, -0.2, 1.1, 0.9, -0.4, 1.3, 0.7, 0.5, 1.4, -0.1, 0.9, 0.6, 1.2, 0.3, 0.8, 1.5, 0.2, 0.7, 1.0, -0.3, 0.8, 1.2, 0.6, 0.9, 0.4, 1.1, 0.7, 0.5, 0.8, 1.3, 0.6, 0.4, 0.9, 0.7, 1.0];
  for (var i = 0; i <= totalMins / step; i++) {
    var mins = openMin + i * step;
    var h = Math.floor(mins / 60), m = mins % 60;
    labels.push(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
    cumPnl += (swings[i % swings.length] || 0.5) * (Math.random() * 180 + 60);
    values.push(Math.round(cumPnl));
  }

  var ctx = canvas.getContext('2d');
  var chartText = typeof getThemeVar === 'function' ? (getThemeVar('--chart-text') || '#9CA3AF') : '#9CA3AF';
  var chartGrid = typeof getThemeVar === 'function' ? (getThemeVar('--chart-grid') || '#F3F4F6') : '#F3F4F6';
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'P&L ($K)',
        data: values,
        borderColor: '#0066CC',
        backgroundColor: 'rgba(0,102,204,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: function(ctx) { return '+$' + ctx.parsed.y.toLocaleString() + 'K'; } }
      }},
      scales: {
        x: { ticks: { font:{size:10}, maxTicksLimit: 8, color:chartText }, grid: { display:false } },
        y: { ticks: { font:{size:10}, color:chartText, callback: function(v) { return '$' + v + 'K'; } }, grid: { color:chartGrid } }
      }
    }
  });
}

function dashboardCurveFallbackSeries(commodity) {
  var base = {
    Brent: [82.40, 82.25, 82.12, 81.98, 81.76, 81.51, 81.18, 80.72],
    WTI: [78.90, 78.73, 78.55, 78.38, 78.12, 77.84, 77.48, 77.05],
    Ethane: [248, 251, 254, 257, 261, 265, 271, 278],
    Naphtha: [612, 618, 623, 627, 632, 638, 646, 655],
    EUA: [63.20, 63.55, 63.88, 64.10, 64.48, 64.93, 65.40, 66.05]
  }[commodity] || [80, 80.2, 80.1, 79.9, 79.7, 79.4, 79.1, 78.8];
  var labels = ['Spot', 'M+1', 'M+2', 'M+3', 'Q+1', 'Q+2', 'Cal+1', 'Cal+2'];
  return base.map(function(price, idx) {
    return { tenor: labels[idx], price: price };
  });
}

function formatDashboardCurvePrice(value) {
  var amount = Number(value || 0);
  if (Math.abs(amount) >= 100) return '$' + amount.toFixed(0);
  return '$' + amount.toFixed(2);
}

window.switchDashboardMarketCurve = function(curveKey, btn) {
  activeDashboardMarketCurve = curveKey || 'brent';
  document.querySelectorAll('#dashboard-curve-selector .curve-btn').forEach(function(node) {
    node.classList.toggle('active', node === btn);
  });
  renderDashboardMarketCurveChart();
};

async function renderDashboardMarketCurveChart() {
  var canvas = document.getElementById('dashboard-market-curve-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  var commodityMap = marketCurveCommodityMap();
  var commodity = commodityMap[activeDashboardMarketCurve] || 'Brent';
  document.querySelectorAll('#dashboard-curve-selector .curve-btn').forEach(function(node) {
    var buttonText = String(node.textContent || '').trim().toLowerCase();
    node.classList.toggle('active', buttonText === activeDashboardMarketCurve);
  });

  var data = await apiCall('/market/curves?commodity=' + encodeURIComponent(commodity)).catch(function() { return null; });
  var series = data && data[commodity] ? data[commodity] : null;
  if (!series || !series.length) series = dashboardCurveFallbackSeries(commodity);

  var labels = series.map(function(point) { return point.tenor || point.delivery_month || ''; });
  var prices = series.map(function(point) { return Number(point.price || 0); });
  var prompt = prices[0] || 0;
  var far = prices[prices.length - 1] || prompt;
  var shape = prompt > far ? 'Backwardation' : (prompt < far ? 'Contango' : 'Flat');
  var curveMove = far - prompt;

  var promptEl = document.getElementById('dash-curve-prompt');
  var farEl = document.getElementById('dash-curve-far');
  var shapeEl = document.getElementById('dash-curve-shape');
  if (promptEl) promptEl.textContent = formatDashboardCurvePrice(prompt);
  if (farEl) farEl.textContent = formatDashboardCurvePrice(far);
  if (shapeEl) {
    shapeEl.textContent = shape + ' ' + (curveMove >= 0 ? '+' : '') + curveMove.toFixed(Math.abs(curveMove) >= 10 ? 0 : 2);
    shapeEl.style.color = shape === 'Backwardation' ? '#D97706' : (shape === 'Contango' ? '#2563EB' : 'var(--muted)');
  }

  var existing = Chart.getChart ? Chart.getChart(canvas) : dashboardMarketCurveChartRef;
  if (existing) existing.destroy();

  var chartText = typeof getThemeVar === 'function' ? (getThemeVar('--chart-text') || '#9CA3AF') : '#9CA3AF';
  var chartGrid = typeof getThemeVar === 'function' ? (getThemeVar('--chart-grid') || '#F3F4F6') : '#F3F4F6';
  var lineColor = shape === 'Backwardation' ? '#D97706' : '#2563EB';
  dashboardMarketCurveChartRef = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: commodity + ' forward curve',
        data: prices,
        borderColor: lineColor,
        backgroundColor: shape === 'Backwardation' ? 'rgba(217,119,6,0.12)' : 'rgba(37,99,235,0.12)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 2,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return commodity + ': ' + formatDashboardCurvePrice(ctx.raw);
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 }, color: chartText, maxRotation: 0 }, grid: { display: false } },
        y: {
          ticks: { font: { size: 10 }, color: chartText, callback: function(value) { return formatDashboardCurvePrice(value); } },
          grid: { color: chartGrid }
        }
      }
    }
  });
}

function renderHeatMapLegacy() {
  var el = document.getElementById('heat-map-grid');
  if (!el) return;

  // Commodity Ã— Region exposure matrix
  var commodities = ['Brent','Urals','WTI','Ethane','NGLs','EUA'];
  var regions = ['NW Europe','Med','US Gulf','Asia'];

  // net exposure values ($M) â€” positive=long(blue), negative=short(red), 0=flat(grey)
  var matrix = {
    'Brent':  {'NW Europe':214, 'Med':0,    'US Gulf':-118, 'Asia':0},
    'Urals':  {'NW Europe':0,   'Med':62,   'US Gulf':0,    'Asia':0},
    'WTI':    {'NW Europe':0,   'Med':0,    'US Gulf':-118, 'Asia':0},
    'Ethane': {'NW Europe':27,  'Med':0,    'US Gulf':0,    'Asia':8},
    'NGLs':   {'NW Europe':2,   'Med':0,    'US Gulf':0,    'Asia':0},
    'EUA':    {'NW Europe':25,  'Med':0,    'US Gulf':0,    'Asia':0},
  };

  // Build table
  var html = '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:separate;border-spacing:3px;font-size:11px">'
    + '<thead><tr><th style="text-align:left;padding:3px 4px;color:var(--muted);font-weight:600;font-size:10px"></th>'
    + regions.map(function(r){ return '<th style="text-align:center;padding:3px 6px;color:var(--muted);font-weight:600;font-size:10px;white-space:nowrap">'+r+'</th>'; }).join('')
    + '</tr></thead><tbody>';

  commodities.forEach(function(c) {
    html += '<tr><td style="padding:3px 4px;font-weight:600;color:#374151;white-space:nowrap">' + c + '</td>';
    regions.forEach(function(r) {
      var val = (matrix[c] && matrix[c][r]) || 0;
      var abs = Math.abs(val);
      var intensity = Math.min(abs / 250, 1);
      var bg, fc;
      if (val > 0) {
        // Long â€” blue scale
        var blue = Math.round(200 - intensity * 140);
        bg = 'rgba(37,99,235,' + (0.12 + intensity * 0.55) + ')';
        fc = intensity > 0.5 ? '#fff' : '#1e40af';
      } else if (val < 0) {
        // Short â€” red scale
        bg = 'rgba(220,38,38,' + (0.12 + intensity * 0.55) + ')';
        fc = intensity > 0.5 ? '#fff' : '#991b1b';
      } else {
        bg = '#F9FAFB'; fc = '#D1D5DB';
      }
      var label = val !== 0 ? (val > 0 ? '+' : '') + '$' + (abs >= 1 ? abs.toFixed(0) : val.toFixed(0)) + 'M' : 'â€”';
      html += '<td style="text-align:center;padding:4px 6px;background:' + bg + ';border-radius:5px;color:' + fc + ';font-weight:700;min-width:60px;cursor:' + (val !== 0 ? 'pointer' : 'default') + '" onclick="showPositionDetail(\'' + c + '\',\'' + r + '\')">' + label + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>'
    + '<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:var(--muted)">'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(37,99,235,0.6);border-radius:2px;margin-right:4px"></span>Long position</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(220,38,38,0.6);border-radius:2px;margin-right:4px"></span>Short position</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--dashboard-flat-cell-bg);border:1px solid var(--border);border-radius:2px;margin-right:4px"></span>Flat</span>'
    + '</div></div>';

  el.innerHTML = html;
}

function renderHeatMap(data) {
  var pnlEl = document.getElementById('heat-map-grid-pnl');
  var barrelEl = document.getElementById('heat-map-grid-barrels');
  if (!pnlEl && !barrelEl) return;

  var commodities = (data && data.commodities && data.commodities.length)
    ? data.commodities
    : ['Brent','Urals','WTI','Ethane','NGLs','EUA'];
  var regions = (data && data.regions && data.regions.length)
    ? data.regions
    : ['NW Europe','Med','US Gulf','Asia'];
  var matrix = (data && data.matrix) || {
    'Brent': {
      'NW Europe': { pnl_m: 214, quantity: 120000, unit: 'bbl', quantity_bbl: 120000, quantity_bbl_available: true },
      'US Gulf': { pnl_m: -118, quantity: -80000, unit: 'bbl', quantity_bbl: -80000, quantity_bbl_available: true }
    },
    'Urals': {
      'Med': { pnl_m: 62, quantity: 45000, unit: 'bbl', quantity_bbl: 45000, quantity_bbl_available: true }
    },
    'WTI': {
      'US Gulf': { pnl_m: -118, quantity: -76000, unit: 'bbl', quantity_bbl: -76000, quantity_bbl_available: true }
    },
    'Ethane': {
      'NW Europe': { pnl_m: 27, quantity: 5000, unit: 'MT', quantity_bbl: 361850, quantity_bbl_available: true },
      'Asia': { pnl_m: 8, quantity: 2400, unit: 'MT', quantity_bbl: 173688, quantity_bbl_available: true }
    },
    'NGLs': {
      'NW Europe': { pnl_m: 2, quantity: 12000, unit: 'bbl', quantity_bbl: 12000, quantity_bbl_available: true }
    },
    'EUA': {
      'NW Europe': { pnl_m: 25, quantity: 1800, unit: 'tCO2e', quantity_bbl: 0, quantity_bbl_available: false }
    }
  };

  function buildHeatMapTable(metric) {
    var maxAbs = 0;
    commodities.forEach(function(c) {
      regions.forEach(function(r) {
        var cell = (matrix[c] && matrix[c][r]) || {};
        var value = metric === 'barrels'
          ? (cell.quantity_bbl_available ? Number(cell.quantity_bbl || 0) : 0)
          : Number(cell.pnl_m || 0);
        maxAbs = Math.max(maxAbs, Math.abs(value));
      });
    });
    maxAbs = maxAbs || 1;

    var html = '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:separate;border-spacing:3px;font-size:11px">'
      + '<thead><tr><th style="text-align:left;padding:3px 4px;color:var(--muted);font-weight:600;font-size:10px"></th>'
      + regions.map(function(r){ return '<th style="text-align:center;padding:3px 6px;color:var(--muted);font-weight:600;font-size:10px;white-space:nowrap">'+r+'</th>'; }).join('')
      + '</tr></thead><tbody>';

    commodities.forEach(function(c) {
      html += '<tr><td style="padding:3px 4px;font-weight:600;color:var(--text2);white-space:nowrap">' + c + '</td>';
      regions.forEach(function(r) {
        var cell = (matrix[c] && matrix[c][r]) || { pnl_m: 0, quantity: 0, unit: 'bbl', quantity_bbl: 0, quantity_bbl_available: false };
        var pnlVal = Number(cell.pnl_m || 0);
        var qtyVal = Number(cell.quantity || 0);
        var bblVal = Number(cell.quantity_bbl || 0);
        var hasBbl = !!cell.quantity_bbl_available;
        var primaryVal = metric === 'barrels'
          ? (hasBbl ? bblVal : 0)
          : pnlVal;
        var intensity = Math.min(Math.abs(primaryVal) / maxAbs, 1);
        var bg, fc;
        if (primaryVal > 0) {
          bg = 'rgba(37,99,235,' + (0.12 + intensity * 0.55) + ')';
          fc = intensity > 0.5 ? '#fff' : '#1e40af';
        } else if (primaryVal < 0) {
          bg = 'rgba(220,38,38,' + (0.12 + intensity * 0.55) + ')';
          fc = intensity > 0.5 ? '#fff' : '#991b1b';
        } else {
          bg = 'var(--dashboard-flat-cell-bg)';
          fc = 'var(--dashboard-flat-cell-text)';
        }

        var pnlLabel = pnlVal !== 0
          ? (pnlVal > 0 ? '+' : '-') + '$' + Math.abs(pnlVal).toFixed(Math.abs(pnlVal) >= 10 ? 0 : 1) + 'M'
          : '-';
        var qtyLabel = qtyVal !== 0
          ? (qtyVal > 0 ? '+' : '-') + Math.abs(qtyVal).toLocaleString(undefined, { maximumFractionDigits: Math.abs(qtyVal) >= 100 ? 0 : 1 }) + ' ' + (cell.unit || '')
          : '-';
        var bblLabel = hasBbl
          ? (bblVal > 0 ? '+' : (bblVal < 0 ? '-' : '')) + Math.abs(bblVal).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' bbl'
          : '-';
        var primaryLabel = metric === 'barrels' ? bblLabel : pnlLabel;
        var secondaryLabel = metric === 'barrels' ? qtyLabel : bblLabel;
        var clickable = metric === 'barrels' ? hasBbl || qtyVal !== 0 : pnlVal !== 0 || qtyVal !== 0;

        html += '<td style="text-align:center;padding:6px 6px;background:' + bg + ';border-radius:5px;color:' + fc + ';font-weight:700;min-width:74px;cursor:' + (clickable ? 'pointer' : 'default') + '" onclick="showPositionDetail(\'' + c + '\',\'' + r + '\')">'
          + '<div>' + primaryLabel + '</div>'
          + '<div style="font-size:10px;font-weight:600;opacity:' + (secondaryLabel !== '-' ? '0.9' : '0.45') + ';margin-top:2px">' + secondaryLabel + '</div>'
          + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>'
      + '<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:var(--muted);flex-wrap:wrap">'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(37,99,235,0.6);border-radius:2px;margin-right:4px"></span>Long position</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(220,38,38,0.6);border-radius:2px;margin-right:4px"></span>Short position</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:var(--dashboard-flat-cell-bg);border:1px solid var(--border);border-radius:2px;margin-right:4px"></span>Flat</span>'
      + (metric === 'barrels'
        ? '<span>Secondary line shows original unit.</span>'
        : '<span>Secondary line shows barrel-equivalent exposure.</span>')
      + '</div></div>';

    return html;
  }

  if (pnlEl) pnlEl.innerHTML = buildHeatMapTable('pnl');
  if (barrelEl) barrelEl.innerHTML = buildHeatMapTable('barrels');
}

window.showPositionDetail = function(commodity, region) {
  showToast('Position Detail', `Loading ${commodity} position for ${region}...`, 'info');
  // Navigate to positions screen with filter
  setTimeout(() => navigateTo('positions'), 300);
};

function renderNews(data) {
  var el = document.getElementById('dash-news');
  if (!el) return;
  // Use API data if available, else hardcoded real June 4 headlines
  var articles = [];
  if (data && (Array.isArray(data) ? data.length : (data.articles||data))) {
    var raw = Array.isArray(data) ? data : (data.articles || data || []);
    articles = raw.map(function(a) {
      var impact = (a.market_impact||'').toLowerCase();
      return {
        id: a.id,
        headline: a.headline || a.title || '',
        source: a.source || 'Reuters',
        sentiment: impact === 'bullish' ? 'bullish' : (impact === 'bearish' ? 'bearish' : 'neutral'),
        time: a.published_at ? new Date(a.published_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + ' Â· 4 Jun' : '',
        url: a.url || ''
      };
    });
  }
  if (!articles.length) {
    articles = [
      {id:9,  headline:'Brent surges to $96.97 as UAE signals OPEC exit talks',          sentiment:'bullish', source:'Reuters',    time:'10:14 Â· 4 Jun', url:''},
      {id:10, headline:'EIA reports 7.97M bbl draw â€” sixth consecutive weekly reduction', sentiment:'bullish', source:'EIA',       time:'09:30 Â· 4 Jun', url:''},
      {id:11, headline:'European gas spikes 12% on Russian transit disruption',           sentiment:'bullish', source:'Platts',     time:'08:55 Â· 4 Jun', url:''},
      {id:12, headline:'Ethane-naphtha spread widens to 14-month high on US supply surge',sentiment:'bullish', source:'ICIS',      time:'08:20 Â· 4 Jun', url:''},
      {id:13, headline:'China petrochemical imports hit 18-month high in May',            sentiment:'bullish', source:'Argus',     time:'07:45 Â· 4 Jun', url:''},
      {id:14, headline:'IMO carbon levy $150/tonne advances â€” 2027 implementation',      sentiment:'bearish', source:"Lloyd's",   time:'06:30 Â· 4 Jun', url:''},
    ];
  }

  el.innerHTML = articles.slice(0,7).map(function(a) {
    var dot = a.sentiment === 'bullish' ? '&#128994;' : (a.sentiment === 'bearish' ? '&#128308;' : '&#128993;');
    var sentColor = a.sentiment === 'bullish' ? '#16A34A' : (a.sentiment === 'bearish' ? '#DC2626' : '#D97706');
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" '
      + 'onmouseover="this.style.background=\'var(--dashboard-news-hover)\'" onmouseout="this.style.background=\'\'" '
      + 'onclick="openNewsPanel(' + (a.id || 9) + ')">'
      + '<div style="display:flex;gap:7px;align-items:flex-start">'
      + '<span style="font-size:13px;flex-shrink:0;margin-top:2px">' + dot + '</span>'
      + '<div>'
      + '<div style="font-size:12px;color:var(--text);line-height:1.4;margin-bottom:3px;font-weight:500">' + a.headline + '</div>'
      + '<div style="font-size:11px;color:var(--muted);display:flex;gap:8px">'
      + '<span style="font-weight:700;color:' + sentColor + '">' + (a.sentiment||'NEUTRAL').toUpperCase() + '</span>'
      + '<span>' + a.source + '</span>'
      + '<span>' + a.time + '</span>'
      + '</div>'
      + '</div></div></div>';
  }).join('');
};

var marketRefreshPollHandle = null;
var marketCurveChartRef = null;
var activeMarketCurve = 'brent';
var marketCurveScenario = null;

function marketCurveCommodityMap() {
  return {
    brent: 'Brent',
    wti: 'WTI',
    ethane: 'Ethane',
    naphtha: 'Naphtha',
    eua: 'EUA'
  };
}

function marketCurveKeyForCommodity(commodity) {
  var normalized = String(commodity || '').toLowerCase();
  var reverse = {
    brent: 'brent',
    wti: 'wti',
    ethane: 'ethane',
    naphtha: 'naphtha',
    eua: 'eua'
  };
  return reverse[normalized] || 'brent';
}

function clearMarketRefreshPoll() {
  if (marketRefreshPollHandle) {
    clearTimeout(marketRefreshPollHandle);
    marketRefreshPollHandle = null;
  }
}

function formatMarketTimestamp(ts) {
  if (!ts) return 'Not refreshed yet';
  var dt = new Date(ts);
  if (isNaN(dt.getTime())) return 'Not refreshed yet';
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatMarketAge(ageSeconds) {
  if (ageSeconds === null || ageSeconds === undefined || isNaN(ageSeconds)) return '';
  if (ageSeconds < 60) return ageSeconds + 's ago';
  if (ageSeconds < 3600) return Math.floor(ageSeconds / 60) + 'm ago';
  return Math.floor(ageSeconds / 3600) + 'h ago';
}

function formatMarketPrice(price, unit) {
  var value = Number(price || 0);
  if ((unit || '').toLowerCase() === 'rate') {
    return value.toFixed(4);
  }
  var decimals = Math.abs(value) >= 100 ? 2 : (Math.abs(value) >= 10 ? 2 : 4);
  return '$' + value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function renderMarketRefreshStatus(meta, options) {
  options = options || {};
  var statusEl = document.getElementById('market-refresh-status');
  var noteEl = document.getElementById('market-refresh-note');
  if (!statusEl && !noteEl) return;

  if (!meta) {
    if (statusEl) statusEl.innerHTML = '<span class="muted small">Using cached snapshot...</span>';
    if (noteEl) noteEl.textContent = '';
    return;
  }

  var last = meta.last_refreshed_at ? formatMarketTimestamp(meta.last_refreshed_at) : 'No cached snapshot yet';
  var age = formatMarketAge(meta.age_seconds);
  var sourceSummary = meta.source_mix
    ? Object.keys(meta.source_mix).map(function(key) {
        return key + ': ' + meta.source_mix[key];
      }).join(' | ')
    : '';
  var statusParts = [];
  if (meta.refresh_in_progress || meta.refresh_triggered) {
    statusParts.push('<span style="display:inline-flex;align-items:center;gap:6px;color:#1d4ed8;font-weight:700"><span class="loading-spinner" style="width:12px;height:12px;border-width:2px"></span>Refreshing live data</span>');
  } else if (meta.is_stale) {
    statusParts.push('<span style="color:#b45309;font-weight:700">Cached snapshot shown</span>');
  } else {
    statusParts.push('<span style="color:#15803d;font-weight:700">Live cache ready</span>');
  }
  statusParts.push('<span style="color:#64748b">Last refreshed ' + last + (age ? ' (' + age + ')' : '') + '</span>');
  if (statusEl) statusEl.innerHTML = statusParts.join(' <span style="color:#CBD5E1">|</span> ');

  var noteParts = [];
  if (meta.cached_row_count !== undefined) noteParts.push((meta.cached_row_count || 0) + ' instruments cached');
  if (sourceSummary) noteParts.push(sourceSummary);
  if (options.error) noteParts.push('Showing fallback data while the API is unavailable');
  if (noteEl) noteEl.textContent = noteParts.join(' | ');
}

function renderMarketPricesTable(prices) {
  var el = document.getElementById('live-prices-table');
  if (!el) return;

  var rows = Array.isArray(prices) && prices.length ? prices : [
    { commodity: 'Brent', price: 82.40, price_unit: 'USD/bbl', change_pct_1d: 1.2, source: 'cache', timestamp: new Date().toISOString() },
    { commodity: 'WTI', price: 78.90, price_unit: 'USD/bbl', change_pct_1d: 0.8, source: 'cache', timestamp: new Date().toISOString() },
    { commodity: 'Urals', price: 74.30, price_unit: 'USD/bbl', change_pct_1d: -0.4, source: 'cache', timestamp: new Date().toISOString() },
    { commodity: 'Ethane', price: 248.0, price_unit: 'USD/MT', change_pct_1d: 0.6, source: 'cache', timestamp: new Date().toISOString() },
    { commodity: 'Naphtha', price: 612.0, price_unit: 'USD/MT', change_pct_1d: 1.1, source: 'cache', timestamp: new Date().toISOString() },
    { commodity: 'EUA', price: 63.2, price_unit: 'EUR/tCO2', change_pct_1d: -0.2, source: 'cache', timestamp: new Date().toISOString() }
  ];

  el.innerHTML = '<div class="table-container"><table class="trading-table">'
    + '<thead><tr><th>Commodity</th><th class="right">Price</th><th class="right">24h</th><th>Unit</th><th>Source</th></tr></thead><tbody>'
    + rows.map(function(row) {
        var change = Number(row.change_pct_1d || 0);
        var changeColor = change > 0 ? '#16A34A' : (change < 0 ? '#DC2626' : '#6B7280');
        var changePrefix = change > 0 ? '+' : '';
        return '<tr>'
          + '<td style="font-weight:600">' + (row.commodity || '-') + '</td>'
          + '<td class="right mono" style="font-weight:700">' + formatMarketPrice(row.price, row.price_unit) + '</td>'
          + '<td class="right mono" style="color:' + changeColor + '">' + changePrefix + change.toFixed(2) + '%</td>'
          + '<td>' + (row.price_unit || '-') + '</td>'
          + '<td><span class="badge badge-info" style="text-transform:none">' + (row.source || 'cache') + '</span></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div>';
}

function renderMarketSpreads(spreads, prices) {
  var el = document.getElementById('spread-table');
  if (!el) return;

  var rows = Array.isArray(spreads) && spreads.length ? spreads.slice() : [];
  if (!rows.length && Array.isArray(prices) && prices.length) {
    var priceMap = {};
    prices.forEach(function(row) {
      priceMap[row.commodity] = Number(row.price || 0);
    });
    if (priceMap.Brent && priceMap.WTI) {
      rows.push({ name: 'Brent / WTI', value: priceMap.Brent - priceMap.WTI, unit: 'USD/bbl' });
    }
    if (priceMap.Brent && priceMap.Urals) {
      rows.push({ name: 'Brent / Urals', value: priceMap.Brent - priceMap.Urals, unit: 'USD/bbl' });
    }
    if (priceMap.Naphtha && priceMap.Ethane) {
      rows.push({ name: 'Naphtha / Ethane', value: priceMap.Naphtha - priceMap.Ethane, unit: 'USD/MT' });
    }
  }

  if (!rows.length) {
    el.innerHTML = '<div class="muted small">Spread snapshot will appear after the first market refresh.</div>';
    return;
  }

  el.innerHTML = rows.map(function(row) {
    var value = Number(row.value || 0);
    var cls = value >= 0 ? 'positive' : 'negative';
    var prefix = value >= 0 ? '+' : '-';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1F5F9">'
      + '<div><div style="font-size:13px;font-weight:700;color:#111827">' + row.name + '</div>'
      + '<div style="font-size:11px;color:#6B7280">Prompt differential</div></div>'
      + '<div class="' + cls + '" style="font-size:18px;font-weight:800">' + prefix + '$' + Math.abs(value).toFixed(2) + '</div>'
      + '</div>';
  }).join('');
}

function scheduleMarketRefreshPoll(forceRefresh) {
  clearMarketRefreshPoll();
  marketRefreshPollHandle = setTimeout(function() {
    if (document.getElementById('live-prices-table')) {
      window.loadMarketData({ silent: true, forceRefresh: !!forceRefresh });
    }
  }, 3000);
}

window.loadMarketData = async function(options) {
  options = options || {};
  var pricesEl = document.getElementById('live-prices-table');
  var spreadsEl = document.getElementById('spread-table');
  if (!pricesEl || !spreadsEl) return;

  if (!options.silent && !pricesEl.dataset.loaded) {
    pricesEl.innerHTML = '<div class="muted small">Loading cached market snapshot...</div>';
    spreadsEl.innerHTML = '<div class="muted small">Loading spread snapshot...</div>';
  }

  var endpoint = '/market/overview';
  var qs = [];
  if (options.forceRefresh) qs.push('force_refresh=true');
  if (qs.length) endpoint += '?' + qs.join('&');

  var overview = await apiCall(endpoint).catch(function() { return null; });
  var meta = overview && overview.meta ? overview.meta : null;
  var prices = overview && Array.isArray(overview.prices) ? overview.prices : [];
  var spreads = overview && Array.isArray(overview.spreads) ? overview.spreads : [];

  if (!overview) {
    renderMarketPricesTable([]);
    renderMarketSpreads([], []);
    renderMarketRefreshStatus({
      last_refreshed_at: null,
      age_seconds: null,
      cached_row_count: 0,
      source_mix: {},
      refresh_in_progress: false,
      refresh_triggered: false,
      is_stale: true
    }, { error: true });
    return;
  }

  renderMarketPricesTable(prices);
  renderMarketSpreads(spreads, prices);
  renderMarketRefreshStatus(meta);
  pricesEl.dataset.loaded = 'true';
  spreadsEl.dataset.loaded = 'true';

  if (meta && (meta.refresh_in_progress || meta.refresh_triggered || !prices.length)) {
    scheduleMarketRefreshPoll(false);
  } else {
    clearMarketRefreshPoll();
  }

  if (options.forceRefresh && meta && meta.refresh_triggered) {
    showToast('Market refresh started', 'Cached prices are on screen now. Live data is refreshing in the background.', 'info');
  }
};

window.loadMarketNews = async function() {
  var el = document.getElementById('market-news-list');
  if (!el) return;

  var data = await apiCall('/market/news?limit=6').catch(function() { return null; });
  var items = Array.isArray(data) ? data : [];
  if (!items.length) {
    items = [
      { headline: 'Brent prompt firms on tighter Atlantic Basin balances', source: 'Reuters', published_at: new Date().toISOString(), market_impact: 'Bullish' },
      { headline: 'European gas volatility eases after storage injection build', source: 'ICIS', published_at: new Date().toISOString(), market_impact: 'Neutral' },
      { headline: 'Naphtha cracks widen as petrochemical buying improves', source: 'Argus', published_at: new Date().toISOString(), market_impact: 'Bullish' }
    ];
  }

  el.innerHTML = items.slice(0, 6).map(function(item) {
    var impact = (item.market_impact || 'Neutral').toLowerCase();
    var color = impact === 'bullish' ? '#16A34A' : (impact === 'bearish' ? '#DC2626' : '#D97706');
    return '<div style="padding:10px 0;border-bottom:1px solid #F1F5F9">'
      + '<div style="font-size:13px;font-weight:600;color:#111827;line-height:1.45">' + (item.headline || 'Market update') + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:4px;font-size:11px;color:#6B7280">'
      + '<span style="color:' + color + ';font-weight:700">' + (item.market_impact || 'Neutral') + '</span>'
      + '<span>' + (item.source || 'Market feed') + '</span>'
      + '<span>' + formatMarketTimestamp(item.published_at) + '</span>'
      + '</div></div>';
  }).join('');
};

window.renderMarketCurveChart = async function(curveKey) {
  activeMarketCurve = curveKey || activeMarketCurve || 'brent';
  var canvas = document.getElementById('market-curve-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  var data = await apiCall('/market/curves').catch(function() { return null; });
  var commodityMap = marketCurveCommodityMap();
  var commodity = commodityMap[activeMarketCurve] || 'Brent';
  var series = data && data[commodity] ? data[commodity] : null;
  if (!series || !series.length) {
    var base = {
      Brent: [82.4, 82.9, 83.2, 83.6, 84.1, 84.4],
      WTI: [78.9, 79.2, 79.6, 79.8, 80.1, 80.5],
      Ethane: [248, 251, 255, 258, 262, 265],
      Naphtha: [612, 618, 624, 629, 635, 642],
      EUA: [63.2, 63.8, 64.1, 64.7, 65.0, 65.5]
    }[commodity] || [80, 81, 82, 83, 84, 85];
    series = base.map(function(price, idx) {
      return { tenor: 'M+' + (idx + 1), price: price };
    });
  }

  var labels = series.map(function(point) { return point.tenor || point.delivery_month; });
  var basePrices = series.map(function(point) { return Number(point.price || 0); });
  var datasets = [{
    label: 'Base Curve',
    data: basePrices,
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37,99,235,0.12)',
    fill: true,
    tension: 0.32,
    borderWidth: 3,
    pointRadius: 2
  }];

  if (marketCurveScenario && marketCurveScenario.commodity === commodity) {
    labels = marketCurveScenario.original_curve.map(function(point) { return point.tenor; });
    datasets = [{
      label: 'Current Curve',
      data: marketCurveScenario.original_curve.map(function(point) { return Number(point.price || point.original_price || 0); }),
      borderColor: '#2563EB',
      backgroundColor: 'rgba(37,99,235,0.10)',
      fill: false,
      tension: 0.32,
      borderWidth: 2,
      pointRadius: 2
    }, {
      label: 'What-if Scenario',
      data: marketCurveScenario.shifted_curve.map(function(point) { return Number(point.shifted_price || 0); }),
      borderColor: '#F97316',
      backgroundColor: 'rgba(249,115,22,0.14)',
      fill: false,
      tension: 0.32,
      borderWidth: 3,
      pointRadius: 3,
      borderDash: [6, 4]
    }];
  }

  if (marketCurveChartRef) marketCurveChartRef.destroy();
  marketCurveChartRef = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + '$' + Number(ctx.raw || 0).toFixed(2);
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#EEF2F7' },
          ticks: {
            callback: function(value) { return '$' + Number(value).toFixed(0); }
          }
        }
      }
    }
  });
};

window.switchMarketCurve = function(curveKey, btn) {
  activeMarketCurve = curveKey || 'brent';
  document.querySelectorAll('.curve-selector .curve-btn').forEach(function(node) {
    node.classList.toggle('active', node === btn);
  });
  window.renderMarketCurveChart(activeMarketCurve);
};

window.applyCurveShift = async function() {
  const input = document.getElementById('curve-shift-input')?.value;
  const result = document.getElementById('curve-shift-result');
  if (!input) return;
  if (result) { result.style.display = 'block'; result.textContent = 'Applying shift...'; }
  const commodityMap = marketCurveCommodityMap();
  const commodity = commodityMap[activeMarketCurve] || 'Brent';
  const data = await apiCall('/market/curves/shift', {
    method:'POST',
    body: JSON.stringify({ instruction: input, commodity: commodity })
  });
  if (!data) {
    if (result) result.textContent = 'Could not calculate scenario. Please try a shift like "Brent up 3" or "WTI flatten by 1.5".';
    return;
  }

  marketCurveScenario = data;
  activeMarketCurve = marketCurveKeyForCommodity(data.commodity || commodity);
  document.querySelectorAll('.curve-selector .curve-btn').forEach(function(node) {
    var buttonText = String(node.textContent || '').trim().toLowerCase();
    node.classList.toggle('active', buttonText === activeMarketCurve);
  });
  await window.renderMarketCurveChart(activeMarketCurve);

  if (result) {
    var pnl = Number(data.indicative_pnl_per_1000bbl || 0);
    var avgDelta = Number(data.avg_price_delta || 0);
    var structure = String(data.shift_type || 'parallel');
    result.innerHTML = '<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px 12px">'
      + '<div style="font-weight:700;color:#9A3412;margin-bottom:4px">What-if scenario applied to chart</div>'
      + '<div style="font-size:12px;color:#7C2D12;line-height:1.5">'
      + (data.result || 'Scenario applied.') + '<br>'
      + 'Average curve move: <strong>' + (avgDelta >= 0 ? '+' : '') + avgDelta.toFixed(2) + '</strong> USD<br>'
      + 'Indicative P&amp;L: <strong>' + (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toLocaleString() + '</strong> per 1,000 bbl<br>'
      + 'Scenario type: <strong>' + structure + '</strong>'
      + '</div></div>';
  }
};

/* â”€â”€ SCREEN 8: VESSELS & LOGISTICS â”€â”€ */
SCREENS['vessels'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸš¢ Vessels & Logistics</div><div class="screen-subtitle">Dragon Fleet tracking Â· Voyage economics Â· Cargo pipeline</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadVessels()">âŸ³ Refresh Fleet</button>
      </div>
    </div>
    <div class="vessel-grid" id="vessel-cards"></div>
    <div class="grid-2">
      <div>
        <div class="card mb-8">
          <div class="card-header"><span class="card-title">âš“ Voyage Economics Calculator</span></div>
          <div class="flex gap-8 mb-8">
            <select class="form-select" id="voyage-vessel" style="flex:1">
              <option>Select vessel...</option>
              <option>JS Ineos Innovation</option><option>JS Ineos Endeavour</option>
              <option>JS Ineos Intrepid</option><option>JS Ineos Insight</option>
            </select>
            <button class="btn btn-primary" onclick="calcVoyageEconomics()">Calculate</button>
          </div>
          <div id="voyage-results" style="display:none">
            ${['Direct to Rafnes (25 days)','Via Stenungsund reroute (28 days)','Wait for berth clearance (14h delay)'].map((opt,i)=>`
            <div class="trade-idea-card ${i===1?'border-color:var(--accent)':''}">
              <div class="idea-title">Option ${i+1}: ${opt}</div>
              <div class="flex gap-12 mt-8">
                <div><div class="xsmall muted">Total Cost</div><div class="mono semibold">${['$1.24M','$1.18M','$0.92M'][i]}</div></div>
                <div><div class="xsmall muted">Days</div><div class="mono semibold">${[25,28,14][i]}d</div></div>
                <div><div class="xsmall muted">P&L Impact</div><div class="mono ${i===2?'negative':'positive'}">${['+$180K','+$240K','-$480K'][i]}</div></div>
              </div>
              ${i===1?'<div class="badge badge-info mt-8">â­ Recommended by AI</div>':''}
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title mb-8">ðŸ“¦ Cargo Pipeline</div>
          <div class="table-container">
            <table class="trading-table"><thead><tr><th>Vessel</th><th>Cargo</th><th class="right">Volume</th><th>ETA</th><th>Status</th><th>Risk</th></tr></thead>
            <tbody id="cargo-tbody"></tbody></table>
          </div>
        </div>
      </div>
    </div>
    <!-- Fleet Map -->
    <div style="background:white;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #F1F5F9">
        <div>
          <span style="font-size:15px;font-weight:700;color:#111827">ðŸ—º Fleet Position Map</span>
          <span style="font-size:12px;color:#6B7280;margin-left:10px">North Atlantic Â· Real geography via OpenStreetMap</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer">
            <input type="checkbox" id="ais-traffic-toggle" onchange="toggleAISLayer(this.checked)"
              style="width:16px;height:16px;accent-color:#0066CC">
            <span>ðŸš¢ Show vessel traffic</span>
          </label>
          <div style="font-size:11px;color:#94A3B8" id="ais-traffic-note"></div>
        </div>
      </div>
      <div id="vessel-leaflet-map" style="height:480px;width:100%"></div>
      <div style="padding:10px 18px;background:#F8FAFC;border-top:1px solid #F1F5F9;display:flex;gap:18px;font-size:12px">
        <span>ðŸ”´ Delayed</span>
        <span>ðŸ”µ En Route</span>
        <span>ðŸŸ  Loading</span>
        <span>âš« Ballast (empty)</span>
        <span style="margin-left:auto;color:#6B7280">Hover vessel for details Â· Click for full info</span>
      </div>
    </div>
  </div>`;
  loadVessels();
};

window.loadVessels = async function() {
  const raw = await apiCall('/vessels/').catch(() => null);

  // Normalize API field names to internal format
  let vessels;
  if (raw && Array.isArray(raw) && raw.length > 0 && raw[0].origin_port !== undefined) {
    vessels = raw.map(v => {
      const isDelayed = v.delay_hours > 0 || v.status === 'En Route (Delayed)';
      const eta = v.eta ? new Date(v.eta).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'â€”';
      const pct = estimateVoyagePct(v.current_lat, v.current_lon, v.origin_port, v.destination_port);
      return {
        name: v.name,
        status: isDelayed ? 'DELAYED' : (v.status||'EN ROUTE').toUpperCase().replace('EN ROUTE','EN ROUTE'),
        route: `${(v.origin_port||'').split(',')[0]} â†’ ${(v.destination_port||'').split(',')[0]}`,
        eta: isDelayed ? eta + ' (+' + Math.round(v.delay_hours) + 'h)' : eta,
        cargo: v.cargo_commodity || 'Ethane',
        volume: v.cargo_volume_mt ? (v.cargo_volume_mt.toLocaleString() + ' MT') : 'â€”',
        pct: pct,
        delayed: isDelayed,
        lat: v.current_lat,
        lon: v.current_lon,
        origin_port: v.origin_port,
        destination_port: v.destination_port,
        delay_hours: v.delay_hours || 0,
        imo: v.imo_number
      };
    });
  } else {
    vessels = getDemoVessels();
  }

  renderVesselCards(vessels);
  renderCargoPipeline(vessels);
  initLeafletMap(vessels);
};

function estimateVoyagePct(lat, lon, origin, dest) {
  // Simple estimation based on longitude for Atlantic crossing
  const portLons = {'Marcus Hook':75.4,'Freeport':95.4,'Rafnes':-9.9,'Grangemouth':-3.7};
  const oKey = Object.keys(portLons).find(k => (origin||'').includes(k));
  const dKey = Object.keys(portLons).find(k => (dest||'').includes(k));
  if (!oKey || !dKey || !lon) return Math.round(30 + Math.random()*50);
  const oLon = portLons[oKey]; const dLon = portLons[dKey];
  const curLon = lon;
  const pct = Math.abs((curLon - oLon) / (dLon - oLon)) * 100;
  return Math.max(5, Math.min(95, Math.round(pct)));
}

function initLeafletMap(vessels) {
  const mapEl = document.getElementById('vessel-leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Remove old map if exists
  if (mapEl._leafletMap) { mapEl._leafletMap.remove(); }

  // Initialize Leaflet centered on North Atlantic
  const map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false })
    .setView([50, -30], 3);
  mapEl._leafletMap = map;

  // OpenStreetMap tiles (free, no key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Â© OpenStreetMap contributors',
    maxZoom: 10
  }).addTo(map);

  // Port locations
  const ports = {
    'Marcus Hook, PA, USA': [39.8, -75.4],
    'Freeport, TX, USA': [28.9, -95.4],
    'Rafnes, Norway': [59.1, 9.9],
    'Grangemouth, Scotland': [56.0, -3.7]
  };

  // Draw port markers
  Object.entries(ports).forEach(([name, coords]) => {
    L.circleMarker(coords, {radius:6, color:'#1A2332', fillColor:'#64748B', fillOpacity:0.9, weight:2})
      .addTo(map)
      .bindTooltip(`<strong>${name.split(',')[0]}</strong>`, {permanent:false, className:'vessel-tooltip'});
  });

  // Draw routes (dashed lines)
  const routeColors = { 'DELAYED':'#DC2626', 'EN ROUTE':'#0066CC', 'LOADING':'#D97706', 'BALLAST':'#6B7280' };

  vessels.forEach(v => {
    if (!v.lat || !v.lon) return;
    const color = routeColors[v.status] || '#0066CC';
    const isDelayed = v.status === 'DELAYED';

    // Origin â†’ vessel position (dashed, lighter)
    const originCoords = ports[v.origin_port] || ports[Object.keys(ports).find(k => (v.origin_port||'').includes(k.split(',')[0])) || ''];
    const destCoords = ports[v.destination_port] || ports[Object.keys(ports).find(k => (v.destination_port||'').includes(k.split(',')[0])) || ''];

    if (originCoords) {
      L.polyline([originCoords, [v.lat, v.lon]], {
        color, weight:2, opacity:0.4, dashArray:'5,5'
      }).addTo(map);
    }

    if (destCoords) {
      L.polyline([[v.lat, v.lon], destCoords], {
        color, weight:2, opacity:0.25, dashArray:'3,8'
      }).addTo(map);
    }

    // Vessel marker
    const vesselIcon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:${isDelayed?16:12}px;height:${isDelayed?16:12}px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:8px">ðŸš¢</div>`,
      iconSize: [isDelayed?16:12, isDelayed?16:12],
      iconAnchor: [isDelayed?8:6, isDelayed?8:6]
    });

    const shortName = v.name.replace('JS Ineos ','');
    L.marker([v.lat, v.lon], {icon: vesselIcon})
      .addTo(map)
      .bindPopup(`
        <div style="font-family:-apple-system,sans-serif;min-width:180px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px">ðŸš¢ ${v.name}</div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Status:</strong> <span style="color:${color}">${v.status}</span></div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Route:</strong> ${v.route}</div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Cargo:</strong> ${v.cargo} Â· ${v.volume}</div>
          <div style="font-size:12px;color:#374151"><strong>ETA:</strong> <span style="color:${isDelayed?'#DC2626':'#374151'}">${v.eta}</span></div>
          ${isDelayed ? '<div style="margin-top:6px;padding:5px;background:#FEE2E2;border-radius:4px;font-size:11px;color:#DC2626">âš  14h delay â€” cargo impact flagged</div>' : ''}
        </div>
      `);
  });
}

function getDemoVessels() {
  return [
    {name:'JS Ineos Innovation', status:'DELAYED',  route:'Marcus Hook â†’ Rafnes',    eta:'01 Jun +14h', cargo:'Ethane',  volume:'21,500MT', pct:72, delayed:true},
    {name:'JS Ineos Endeavour',  status:'EN ROUTE', route:'Rafnes â†’ Stenungsund',    eta:'02 Jun 06:00', cargo:'Ethane', volume:'22,000MT', pct:45},
    {name:'JS Ineos Intrepid',   status:'LOADING',  route:'Marcus Hook (Loading)',   eta:'04 Jun 08:00', cargo:'Ethane', volume:'21,800MT', pct:15},
    {name:'JS Ineos Insight',    status:'BALLAST',  route:'Rafnes â†’ Marcus Hook',    eta:'â€”',            cargo:'Ballast',volume:'â€”',        pct:30},
    {name:'JS Ineos Igloo',      status:'EN ROUTE', route:'Freeport LNG â†’ BrunsbÃ¼ttel', eta:'06 Jun',   cargo:'LNG',    volume:'74,000MÂ³', pct:60},
    {name:'JS Ineos Inspiration',status:'EN ROUTE', route:'Arzew â†’ Rafnes',          eta:'03 Jun 14:00', cargo:'Ethane', volume:'21,200MT', pct:55}
  ];
}

function renderVesselCards(vessels) {
  const el = document.getElementById('vessel-cards');
  if (!el) return;
  el.innerHTML = vessels.map(v=>`<div class="vessel-card ${v.delayed||v.status==='DELAYED'?'delayed':''}">
    <div class="flex items-center" style="justify-content:space-between;margin-bottom:6px">
      <div class="vessel-name">ðŸš¢ ${v.name}</div>
      <span class="badge badge-${v.status==='DELAYED'?'critical':v.status==='LOADING'?'info':v.status==='BALLAST'?'neutral':'success'}">${v.status}</span>
    </div>
    <div class="vessel-route">${v.route}</div>
    <div class="flex" style="justify-content:space-between;margin-bottom:6px">
      <div><div class="xsmall muted">Cargo</div><div class="vessel-cargo">${v.cargo} &nbsp; ${v.volume}</div></div>
      <div style="text-align:right"><div class="xsmall muted">ETA</div><div class="vessel-eta ${v.delayed||v.status==='DELAYED'?'delayed':''}">${v.eta}</div></div>
    </div>
    <div class="progress-bar-container"><div class="progress-bar-fill ${v.delayed?'danger':'gradient'}" style="width:${v.pct}%"></div></div>
    <div class="xsmall muted mt-8">${v.pct}% of voyage complete</div>
  </div>`).join('');
}

function renderCargoPipeline(vessels) {
  const tbody = document.getElementById('cargo-tbody');
  if (!tbody) return;
  tbody.innerHTML = vessels.map(v=>`<tr>
    <td class="semibold">${v.name.replace('JS Ineos ','')}</td>
    <td>${v.cargo}</td>
    <td class="right mono">${v.volume}</td>
    <td class="mono ${v.delayed||v.status==='DELAYED'?'negative':''}">${v.eta}</td>
    <td><span class="badge badge-${v.status==='DELAYED'?'critical':v.status==='LOADING'?'info':v.status==='BALLAST'?'neutral':'success'}">${v.status}</span></td>
    <td>${v.delayed||v.status==='DELAYED'?'<span class="badge badge-critical">âš  DELAY</span>':'<span class="badge badge-success">OK</span>'}</td>
  </tr>`).join('');
}

function renderWorldMap() {
  return `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg" style="background:var(--bg-base);border-radius:4px">
    <!-- Ocean background -->
    <rect width="900" height="400" fill="#0A0E1A"/>
    <!-- Simplified continental outlines -->
    <!-- North America -->
    <path d="M 80,60 L 180,50 L 210,80 L 220,140 L 200,180 L 170,200 L 150,240 L 130,260 L 100,250 L 80,220 L 60,180 L 50,120 Z" fill="#162035" stroke="#1E2D45" stroke-width="1"/>
    <!-- South America -->
    <path d="M 160,260 L 200,250 L 220,280 L 210,340 L 180,370 L 160,360 L 140,320 L 140,280 Z" fill="#162035" stroke="#1E2D45" stroke-width="1"/>
    <!-- Europe -->
    <path d="M 420,60 L 480,55 L 500,70 L 510,100 L 490,120 L 460,130 L 430,120 L 410,100 L 405,75 Z" fill="#162035" stroke="#1E2D45" stroke-width="1"/>
    <!-- Africa -->
    <path d="M 430,130 L 510,120 L 540,160 L 540,240 L 520,300 L 490,340 L 460,330 L 440,280 L 420,200 L 415,150 Z" fill="#162035" stroke="#1E2D45" stroke-width="1"/>
    <!-- Asia -->
    <path d="M 510,50 L 680,40 L 720,80 L 730,120 L 700,150 L 640,160 L 580,150 L 530,130 L 510,100 Z" fill="#162035" stroke="#1E2D45" stroke-width="1"/>
    <!-- Labels -->
    <text x="120" y="160" fill="#4A5A70" font-size="10" text-anchor="middle">ATLANTIC</text>
    <text x="350" y="220" fill="#4A5A70" font-size="10" text-anchor="middle">ATLANTIC</text>
    <text x="620" y="230" fill="#4A5A70" font-size="10" text-anchor="middle">INDIAN OCEAN</text>
    <text x="790" y="200" fill="#4A5A70" font-size="10" text-anchor="middle">PACIFIC</text>
    <!-- Vessel positions with animated pulse -->
    <!-- JS Ineos Innovation (Marcus Hook â†’ Rafnes, mid-Atlantic) -->
    <circle cx="280" cy="130" r="8" fill="rgba(255,68,68,0.3)" stroke="#FF4444" stroke-width="1.5"/>
    <circle cx="280" cy="130" r="4" fill="#FF4444"/>
    <text x="280" y="120" fill="#FF4444" font-size="8" text-anchor="middle">Innovation âš </text>
    <!-- JS Ineos Endeavour (Rafnes â†’ Stenungsund, North Sea) -->
    <circle cx="455" cy="72" r="7" fill="rgba(0,212,255,0.3)" stroke="#00D4FF" stroke-width="1.5"/>
    <circle cx="455" cy="72" r="3" fill="#00D4FF"/>
    <text x="455" y="63" fill="#00D4FF" font-size="8" text-anchor="middle">Endeavour</text>
    <!-- JS Ineos Intrepid (Loading at Marcus Hook) -->
    <circle cx="210" cy="140" r="7" fill="rgba(255,179,71,0.3)" stroke="#FFB347" stroke-width="1.5"/>
    <circle cx="210" cy="140" r="3" fill="#FFB347"/>
    <text x="210" y="152" fill="#FFB347" font-size="8" text-anchor="middle">Intrepid</text>
    <!-- JS Ineos Igloo (Freeport â†’ BrunsbÃ¼ttel) -->
    <circle cx="320" cy="100" r="7" fill="rgba(0,255,136,0.3)" stroke="#00FF88" stroke-width="1.5"/>
    <circle cx="320" cy="100" r="3" fill="#00FF88"/>
    <text x="320" y="92" fill="#00FF88" font-size="8" text-anchor="middle">Igloo</text>
    <!-- JS Ineos Inspiration (Arzew â†’ Rafnes) -->
    <circle cx="400" cy="150" r="7" fill="rgba(0,212,255,0.3)" stroke="#00D4FF" stroke-width="1.5"/>
    <circle cx="400" cy="150" r="3" fill="#00D4FF"/>
    <text x="400" y="142" fill="#00D4FF" font-size="8" text-anchor="middle">Inspiration</text>
    <!-- Route lines -->
    <line x1="210" y1="140" x2="455" y2="72" stroke="#1E2D45" stroke-width="1" stroke-dasharray="4,4"/>
    <line x1="280" y1="130" x2="455" y2="72" stroke="#FF4444" stroke-width="1" stroke-dasharray="3,5" opacity="0.6"/>
    <line x1="320" y1="100" x2="470" y2="80" stroke="#1E2D45" stroke-width="1" stroke-dasharray="4,4"/>
    <line x1="400" y1="150" x2="455" y2="72" stroke="#1E2D45" stroke-width="1" stroke-dasharray="4,4"/>
    <!-- Legend -->
    <circle cx="20" cy="380" r="4" fill="#FF4444"/><text x="30" y="383" fill="#8A9BB5" font-size="9">Delayed</text>
    <circle cx="80" cy="380" r="4" fill="#00D4FF"/><text x="90" y="383" fill="#8A9BB5" font-size="9">En Route</text>
    <circle cx="140" cy="380" r="4" fill="#FFB347"/><text x="150" y="383" fill="#8A9BB5" font-size="9">Loading</text>
    <circle cx="200" cy="380" r="4" fill="#00FF88"/><text x="210" y="383" fill="#8A9BB5" font-size="9">On Schedule</text>
  </svg>`;
}

window.calcVoyageEconomics = async function() {
  const vessel = document.getElementById('voyage-vessel')?.value;
  if (!vessel || vessel === 'Select vessel...') { showToast('Select Vessel','Please select a vessel','warning'); return; }
  const results = document.getElementById('voyage-results');
  if (results) results.style.display = 'block';
};

/* â”€â”€ SCREEN 9: COMMUNICATIONS HUB â”€â”€ */
let commsEmailsState = [];
let commsFilterState = 'all';
let commsSelectedId = null;

SCREENS['comms'] = async function(main) {
  commsEmailsState = getDemoEmails();
  commsFilterState = 'all';
  main.innerHTML = `<div class="screen comms-screen">
    <div class="screen-header">
      <div>
        <div class="screen-title">ðŸ“§ Communications Hub</div>
        <div class="screen-subtitle">AI-prioritised inbox Â· Smart drafts Â· Outstanding actions</div>
      </div>
      <div class="screen-actions">
        <span class="comms-live-pill"><span></span> Mail feed live</span>
        <button class="btn btn-secondary btn-sm" onclick="loadComms()">âŸ³ Refresh</button>
        <button class="btn btn-primary btn-sm" onclick="sendCopilotMessage('Summarise communications requiring action today')">Ask AI</button>
      </div>
    </div>

    <div class="comms-kpi-row" id="comms-kpis"></div>

    <div class="comms-workspace">
      <section class="comms-list-panel">
        <div class="comms-panel-head">
          <div>
            <div class="comms-panel-title">Priority Inbox</div>
            <div class="comms-panel-sub" id="comms-list-subtitle">Sorted by urgency and action window</div>
          </div>
          <span class="badge badge-info" id="comms-count-badge">0</span>
        </div>
        <div class="comms-tabs">
          <button class="comms-tab active" onclick="filterInbox('all',this)">All</button>
          <button class="comms-tab" onclick="filterInbox('critical',this)">Critical</button>
          <button class="comms-tab" onclick="filterInbox('high',this)">High</button>
          <button class="comms-tab" onclick="filterInbox('medium',this)">Medium</button>
          <button class="comms-tab" onclick="filterInbox('low',this)">FYI</button>
        </div>
        <div id="email-list" class="comms-message-list"></div>
      </section>

      <section class="comms-detail-panel" id="email-detail">
        <div class="comms-empty-state">
          <div class="comms-empty-icon">ðŸ“§</div>
          <div class="comms-empty-title">Select a message</div>
          <div class="comms-empty-text">AI analysis, linked trade context, and a drafted response will appear here.</div>
        </div>
      </section>

      <aside class="comms-action-panel">
        <div class="comms-panel-head compact">
          <div>
            <div class="comms-panel-title">Action Queue</div>
            <div class="comms-panel-sub">What needs a human decision</div>
          </div>
        </div>
        <div id="outstanding-actions" class="comms-action-list"></div>
        <div class="comms-draft-meter">
          <div class="comms-draft-meter-top"><span>Draft readiness</span><strong>92%</strong></div>
          <div class="comms-meter-track"><div style="width:92%"></div></div>
          <p>Replies are pre-filled from trade, vessel, and risk context. Review terms before sending.</p>
        </div>
      </aside>
    </div>
  </div>`;
  renderComms();
  openEmail(commsEmailsState[0]?.id);
  loadComms();
};

function getDemoEmails() {
  return [
    {id:1, priority:'critical', from:'Vitol Trading â€” Operations', subject:'URGENT: RMVT-0234 Trade Confirmation Required', summary:'Counterparty requesting written confirmation within 2h or trade will be cancelled.', time:'08:45', unread:true,
      body:'Dear Alex,\n\nWe are following up on verbal agreement from 28 May for the supply of 100,000MT Naphtha CIF NWE.\n\nTrade reference: RMVT-0234\nVolume: 100,000MT\nPrice: $612/MT\nDelivery: 15-20 June 2026\nPort: Flushing, Netherlands\n\nPlease provide written confirmation by 15:00 today to avoid cancellation of the trade.\n\nBest regards,\nMike Johnson\nVitol Trading Operations',
      ai:{summary:'Trade confirmation deadline 15:00 today. $61.2M at risk if not confirmed. Draft reply ready.',priority:'CRITICAL',action:'Send confirmation',deadline:'2h 15m',trade:'RMVT-0234'}},
    {id:2, priority:'high', from:'Rafnes Terminal â€” Logistics', subject:'JS Ineos Innovation â€” Berth Delay Update', summary:'Innovation delayed 14 hours. Terminal requires decision on cargo handling by 11:00.', time:'07:55', unread:true,
      body:'Dear INEOS Shipping Team,\n\nThis is to advise that JS Ineos Innovation will arrive at Rafnes Terminal approximately 14 hours behind schedule due to weather delays in the North Atlantic.\n\nExpected arrival: 02 June 2026, 08:00 (was 18:00 01 June)\n\nThe terminal has three berths available. Due to scheduling conflicts, we require your handling preference by 11:00 today.\n\nOptions:\n1. Priority berth â€” additional cost $45,000\n2. Standard queue â€” no additional cost, further 6h delay\n3. Reroute to Stenungsund\n\nKind regards,\nRafnes Terminal Operations',
      ai:{summary:'14h vessel delay. Three options available. Decision required by 11:00. Costs calculated.',priority:'HIGH',action:'Choose berth option',deadline:'2h 05m',trade:'Vessel delay'}},
    {id:3, priority:'medium', from:'Alex.Morgan@shell.com', subject:'Brent M+2 swap â€” indication request', summary:'Shell requesting indicative price for 500kbbl Brent M+2 swap. No urgency.', time:'07:30', unread:false,
      body:'Hi Alex,\n\nCould you give me an indication for a 500kbbl Brent M+2 swap? Looking to hedge some refinery exposure.\n\nNo immediate urgency â€” happy to discuss later today or tomorrow morning.\n\nThanks,\nAlex Morgan\nShell Trading',
      ai:{summary:'Standard indication request from Shell. No deadline. Auto-draft reply ready.',priority:'MEDIUM',action:'Send indication',deadline:'No deadline',trade:'Potential new trade'}},
    {id:4, priority:'low', from:'Risk Management', subject:'Daily VaR Report â€” 30 May 2026', summary:'VaR at 62% utilisation. All limits within bounds. No escalation required.', time:'07:00', unread:false,
      body:'Daily VaR Report â€” 30 May 2026\n\nKey metrics:\n1-Day VaR: $2.1M (62% utilisation)\n10-Day VaR: $6.3M\nBoard Limit: $8.0M\n\nAll positions within approved limits.\nNo escalation required.\n\nRisk Management Team',
      ai:{summary:'Routine daily risk report. No action required. All within limits.',priority:'FYI',action:'Acknowledge',deadline:'No deadline',trade:null}}
  ];
}

function normaliseCommsEmail(e) {
  const priority = (e.ai_priority || e.priority || 'low').toLowerCase();
  return {
    id: e.id,
    priority: priority === 'fyi' ? 'low' : priority,
    from: e.from || e.from_name || e.from_email || 'Unknown sender',
    subject: e.subject || 'No subject',
    summary: e.summary || e.body_preview || e.ai_summary || 'No preview available.',
    time: e.time || formatCommsTime(e.received_at),
    unread: e.unread ?? (e.status === 'Unread'),
    body: e.body || e.body_preview || e.ai_summary || e.summary || 'Message body unavailable.',
    ai: e.ai || {
      summary: e.ai_summary || e.ai_action_required || 'No AI summary available.',
      priority: (e.ai_priority || 'FYI').toUpperCase(),
      action: e.ai_action_required || 'Review',
      deadline: e.deadline ? formatCommsDeadline(e.deadline) : 'No deadline',
      trade: e.linked_trade_ref || e.linked_vessel_name || null
    }
  };
}

function getPriorityMeta(priority) {
  return {
    critical: {label:'Critical', badge:'badge-critical', dot:'critical', initial:'C'},
    high:     {label:'High',     badge:'badge-high',     dot:'high',     initial:'H'},
    medium:   {label:'Medium',   badge:'badge-medium',   dot:'medium',   initial:'M'},
    low:      {label:'FYI',      badge:'badge-low',      dot:'low',      initial:'L'}
  }[priority] || {label:'FYI', badge:'badge-neutral', dot:'low', initial:'L'};
}

function formatCommsTime(value) {
  if (!value) return 'â€”';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(11, 16) || 'â€”';
  return d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
}

function formatCommsDeadline(value) {
  if (!value) return 'No deadline';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short'}) + ' ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
}

function getFilteredCommsEmails() {
  const emails = commsEmailsState.map(normaliseCommsEmail);
  const order = {critical:0, high:1, medium:2, low:3};
  return emails
    .filter(e => commsFilterState === 'all' || e.priority === commsFilterState)
    .sort((a,b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || (b.unread - a.unread));
}

function renderComms() {
  renderCommsKpis();
  renderCommsList();
  renderOutstandingActions();
}

function renderCommsKpis() {
  const el = document.getElementById('comms-kpis');
  if (!el) return;
  const emails = commsEmailsState.map(normaliseCommsEmail);
  const unread = emails.filter(e => e.unread).length;
  const critical = emails.filter(e => e.priority === 'critical').length;
  const drafts = emails.filter(e => e.ai?.action && e.ai.action !== 'Review').length;
  const linked = emails.filter(e => e.ai?.trade).length;
  el.innerHTML = [
    {label:'Unread', value: unread, sub:'Awaiting review', tone:'accent'},
    {label:'Critical', value: critical, sub:'Decision window open', tone:'negative'},
    {label:'Smart drafts', value: drafts, sub:'Ready for edit/send', tone:'positive'},
    {label:'Linked items', value: linked, sub:'Trades, vessels, risk', tone:'warning'}
  ].map(k => `<div class="comms-kpi">
    <div class="comms-kpi-label">${k.label}</div>
    <div class="comms-kpi-value ${k.tone}">${k.value}</div>
    <div class="comms-kpi-sub">${k.sub}</div>
  </div>`).join('');
}

function renderCommsList() {
  const list = document.getElementById('email-list');
  const count = document.getElementById('comms-count-badge');
  if (!list) return;
  const emails = getFilteredCommsEmails();
  if (count) count.textContent = emails.length;
  if (!emails.length) {
    list.innerHTML = '<div class="comms-empty-list">No messages match this filter.</div>';
    return;
  }
  list.innerHTML = emails.map(renderEmailRow).join('');
}

function renderEmailRow(e) {
  const meta = getPriorityMeta(e.priority);
  return `<button class="email-row ${e.unread?'unread':''} ${commsSelectedId===e.id?'active':''}" id="email-row-${e.id}" onclick="openEmail(${e.id})">
    <span class="email-priority-dot ${meta.dot}"></span>
    <span class="email-row-main">
      <span class="email-row-top"><strong>${e.from}</strong><span>${e.time}</span></span>
      <span class="email-subject">${e.subject}</span>
      <span class="email-summary">${e.summary}</span>
      <span class="email-row-tags"><span class="badge ${meta.badge}">${meta.label}</span>${e.ai?.trade ? `<span class="email-link-tag">${e.ai.trade}</span>` : ''}</span>
    </span>
  </button>`;
}

function renderOutstandingActions() {
  const el = document.getElementById('outstanding-actions');
  if (!el) return;
  const actions = commsEmailsState.map(normaliseCommsEmail)
    .filter(e => e.ai?.action && e.ai.action !== 'Acknowledge')
    .slice(0, 5);
  el.innerHTML = actions.map(e => {
    const meta = getPriorityMeta(e.priority);
    return `<button class="comms-action-row" onclick="openEmail(${e.id})">
      <span class="badge ${meta.badge}">${meta.label}</span>
      <strong>${e.ai.action}</strong>
      <span>${e.subject}</span>
      <em>${e.ai.deadline}</em>
    </button>`;
  }).join('') || '<div class="comms-empty-list">No outstanding actions.</div>';
}

window.openEmail = function(id) {
  const e = commsEmailsState.map(normaliseCommsEmail).find(x=>x.id===id);
  if (!e) return;
  if (typeof setSelectedEntity === 'function') setSelectedEntity({ type: 'email', id: String(id), label: e.subject });
  commsSelectedId = id;
  document.querySelectorAll('.email-row').forEach(r=>r.classList.remove('active'));
  document.getElementById(`email-row-${id}`)?.classList.add('active');
  const meta = getPriorityMeta(e.priority);
  const draftReply = `Dear ${e.from.split(' â€”')[0].split('@')[0]},\n\nThank you for your message.\n\n${e.id===1?'Please find attached our confirmation for trade RMVT-0234. We confirm the following terms:\n- Volume: 100,000MT Naphtha CIF NWE\n- Price: $612/MT\n- Delivery: 15-20 June 2026\n- Port: Flushing, Netherlands\n\nPlease confirm receipt.':'Noted. We are reviewing the item and will revert with confirmation shortly.'}\n\nBest regards,\nAlex Chen\nINEOS Trading & Shipping`;
  document.getElementById('email-detail').innerHTML = `
    <div class="email-detail-header">
      <div>
        <div class="email-detail-kicker"><span class="badge ${meta.badge}">${meta.label}</span><span>${e.unread?'Unread':'Reviewed'}</span></div>
        <div class="email-detail-subject">${e.subject}</div>
        <div class="email-detail-meta"><strong>${e.from}</strong><span>${e.time}</span><span>To Alex Chen</span></div>
      </div>
      <div class="email-detail-actions">
        <button class="btn btn-secondary btn-sm">Archive</button>
        <button class="btn btn-primary btn-sm" onclick="sendEmailReply(${id})">Send Reply</button>
      </div>
    </div>
    <div class="email-body-card">${e.body}</div>
    <div class="ai-analysis-box">
      <div class="ai-analysis-title"><span>ðŸ¤– AI Analysis</span><button class="btn btn-secondary btn-sm" onclick="sendCopilotMessage('Summarise this communication: ${e.subject.replace(/'/g,"\\'")}')">Ask Radiant AI</button></div>
      <div class="ai-summary-callout">${e.ai.summary}</div>
      <div class="ai-analysis-grid">
        <div><span>Priority</span><strong><span class="badge ${meta.badge}">${e.ai.priority}</span></strong></div>
        <div><span>Action</span><strong>${e.ai.action}</strong></div>
        <div><span>Deadline</span><strong class="${e.ai.deadline.includes('h')?'warning-text':''}">${e.ai.deadline}</strong></div>
        ${e.ai.trade?`<div><span>Linked item</span><strong class="accent-text">${e.ai.trade}</strong></div>`:''}
      </div>
    </div>
    <div class="draft-panel">
      <div class="draft-head"><span>AI Draft Reply</span><span>Editable before send</span></div>
      <textarea id="reply-draft">${draftReply}</textarea>
      <div class="draft-actions">
        <button class="btn btn-primary" onclick="sendEmailReply(${id})">ðŸ“¤ Send Reply</button>
        <button class="btn btn-secondary btn-sm" onclick="markEmailActioned(${id})">âœ“ Mark Actioned</button>
        <button class="btn btn-secondary btn-sm">â†© Forward</button>
        <button class="btn btn-secondary btn-sm">Dismiss</button>
      </div>
    </div>`;
};

window.sendEmailReply = function(id) {
  showToast('Email Sent','Reply sent successfully. Trade actioned and logged.','success');
};

window.filterInbox = function(priority, tab) {
  commsFilterState = priority;
  document.querySelectorAll('.comms-tab').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  renderCommsList();
};

window.loadComms = async function() {
  const data = await apiCall('/comms/inbox?limit=20');
  const rows = Array.isArray(data) ? data : data?.emails;
  if (rows?.length) {
    commsEmailsState = rows.map(normaliseCommsEmail);
    renderComms();
    openEmail(commsSelectedId || commsEmailsState[0]?.id);
  }
};

window.markEmailActioned = async function(id) {
  await apiCall(`/comms/${id}/mark-actioned`, {method:'POST', body:'{}'});
  showToast('Action Logged', 'Communication marked actioned.', 'success');
};

/* â”€â”€ SCREEN 10: COMPLIANCE & AUDIT â”€â”€ */
SCREENS['compliance'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">âš–ï¸ Compliance & Audit</div><div class="screen-subtitle">Regulatory status Â· Immutable audit trail Â· AI action log</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadCompliance()">âŸ³ Refresh</button>
        <button class="btn btn-primary btn-sm">+ New Filing</button>
      </div>
    </div>
    <div class="grid-3 mb-12">
      ${[
        {icon:'ðŸ›',name:'EMIR',    status:'Compliant', deadline:'2 Jun 2026',  last:'28 May 2026', ok:true},
        {icon:'ðŸ“‹',name:'REMIT',   status:'Compliant', deadline:'5 Jun 2026',  last:'27 May 2026', ok:true},
        {icon:'ðŸ“Š',name:'MiFID II',status:'Review',    deadline:'1 Jun 2026',  last:'24 May 2026', ok:false}
      ].map(r=>`<div class="reg-card">
        <span class="reg-icon">${r.icon}</span>
        <div style="flex:1">
          <div class="reg-name">${r.name}</div>
          <div class="reg-deadline">Next deadline: ${r.deadline} &nbsp;|&nbsp; Last filed: ${r.last}</div>
        </div>
        <span class="badge badge-${r.ok?'success':'warning'}">${r.ok?'âœ“ Compliant':'âš  Review'}</span>
      </div>`).join('')}
    </div>
    <div class="grid-2">
      <div>
        <div class="card-title mb-8">ðŸ“‹ Immutable Audit Trail</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input type="date" id="audit-date-from" placeholder="From date" style="background:#1e293b;border:1px solid #334155;color:#f1f5f9;border-radius:6px;padding:6px 10px;font-size:12px" onchange="filterAuditLog()">
          <input type="date" id="audit-date-to" placeholder="To date" style="background:#1e293b;border:1px solid #334155;color:#f1f5f9;border-radius:6px;padding:6px 10px;font-size:12px" onchange="filterAuditLog()">
          <select id="audit-type-filter" onchange="filterAuditLog()" style="background:#1e293b;border:1px solid #334155;color:#f1f5f9;border-radius:6px;padding:6px 10px;font-size:12px">
            <option value="">All actions</option>
            <option value="AI">AI Actions</option>
            <option value="Trade">Trades</option>
            <option value="Alert">Alerts</option>
            <option value="Manual">Manual</option>
          </select>
        </div>
        <div class="filter-bar">
          <select class="form-select"><option>All Types</option><option>Trade</option><option>AI Decision</option><option>System</option></select>
          <input class="form-input" placeholder="Search..." style="width:160px">
        </div>
        <div class="table-container" style="max-height:400px;overflow-y:auto">
          <table class="trading-table"><thead><tr>
            <th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>AI</th><th>Details</th>
          </tr></thead><tbody>
            ${[
              {ts:'08:47:23',user:'alex.chen',action:'Trade Confirmed',entity:'RMVT-0232',ai:'âœ“',detail:'Brent swap, 200kbbl'},
              {ts:'08:31:15',user:'system',   action:'AI Alert Generated',entity:'ALERT-089',ai:'ðŸ¤–',detail:'Stale price: Urals M+1'},
              {ts:'08:15:02',user:'alex.chen',action:'Position Updated',entity:'Urals Book',ai:'âœ“',detail:'Net long 200kbbl'},
              {ts:'07:55:44',user:'system',   action:'Market Data Received',entity:'Brent M0',ai:'â€”',detail:'$82.40/bbl'},
              {ts:'07:34:01',user:'alex.chen',action:'Login',entity:'Session',ai:'â€”',detail:'IP: 10.0.1.42'},
              {ts:'07:30:00',user:'system',   action:'EOD Report Generated',entity:'29-May-26',ai:'ðŸ¤–',detail:'Approved by risk'},
              {ts:'Yesterday',user:'alex.chen',action:'Trade Executed',entity:'RMVT-0229',ai:'âœ“',detail:'Naphtha long 20kt'},
              {ts:'Yesterday',user:'risk.mgmt',action:'VaR Limit Reviewed',entity:'Board Limit',ai:'â€”',detail:'$8M unchanged'}
            ].map(r=>`<tr>
              <td class="mono xsmall muted">${r.ts}</td>
              <td class="xsmall">${r.user}</td>
              <td class="small semibold">${r.action}</td>
              <td class="mono xsmall accent-text">${r.entity}</td>
              <td class="text-center">${r.ai}</td>
              <td class="xsmall muted">${r.detail}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      <div>
        <div class="card-title mb-8">ðŸ¤– AI Action Log â€” All Recommendations</div>
        <div class="table-container" style="max-height:400px;overflow-y:auto">
          <table class="trading-table"><thead><tr>
            <th>Time</th><th>Recommendation</th><th>User Action</th><th>Outcome</th>
          </tr></thead><tbody>
            ${[
              {time:'08:31',rec:'Alert: Stale price Urals',    action:'Accepted',  outcome:'Repriced â€” saved $24K'},
              {time:'08:15',rec:'Hedge: Increase Urals coverage to 75%', action:'Pending', outcome:'â€”'},
              {time:'Yesterday',rec:'Trade idea: Brent/Urals arb', action:'Accepted',  outcome:'+$180K P&L'},
              {time:'Yesterday',rec:'Alert: Counterparty limit 88%',action:'Rejected',  outcome:'No breach yet'},
              {time:'26-May', rec:'Pre-mortem: Carbon long',    action:'Accepted',  outcome:'+$85K P&L'},
              {time:'24-May', rec:'Trade idea: Ethane squeeze', action:'Rejected',  outcome:'Would have been +$220K'}
            ].map(r=>`<tr>
              <td class="mono xsmall muted">${r.time}</td>
              <td class="small">${r.rec}</td>
              <td><span class="badge badge-${r.action==='Accepted'?'success':r.action==='Rejected'?'danger':'warning'} xsmall">${r.action}</span></td>
              <td class="xsmall ${r.outcome.startsWith('+')?'positive':r.outcome==='-'||r.outcome.startsWith('No')?'muted':''}">${r.outcome}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>
    </div>
  </div>`;
  loadCompliance();
};
window.filterAuditLog = function() {
  const dateFrom = document.getElementById('audit-date-from')?.value;
  const dateTo = document.getElementById('audit-date-to')?.value;
  const typeFilter = document.getElementById('audit-type-filter')?.value || '';
  const rows = document.querySelectorAll('#audit-trail-tbody tr');
  rows.forEach(row => {
    const actionCell = row.querySelector('td:nth-child(3)');
    const action = actionCell ? actionCell.textContent : '';
    const matchType = !typeFilter || action.toLowerCase().includes(typeFilter.toLowerCase());
    row.style.display = matchType ? '' : 'none';
  });
  if (!rows.length) {
    showToast('Audit Filter', 'Filters applied. Date filtering applies to live data.', 'info');
  }
};

window.loadCompliance = async function() {
  // Load real regulatory data from working endpoint
  try {
    const data = await apiCall('/regulatory/');
    if (data && data.length > 0) {
      // Update the compliance cards with real data
      data.forEach(reg => {
        const card = document.querySelector(`[data-reg="${reg.regulation}"]`);
        if (card) {
          const statusEl = card.querySelector('.reg-status');
          if (statusEl) statusEl.textContent = reg.status === 'Current' ? 'âœ“ Compliant' : 'âš  ' + reg.status;
        }
      });
    }
  } catch(e) {
    // Compliance screen shows demo data by default - silently ignore
  }
};

/* â”€â”€ SCREEN 11: BOARDROOM (Executive) â”€â”€ */
SCREENS['boardroom'] = async function(main) {
  if (!['executive','admin'].includes(window.currentRole())) {
    main.innerHTML = `<div class="screen flex-center" style="height:60vh"><div class="text-center"><div style="font-size:48px">ðŸ”’</div><div class="mt-8 secondary">This screen requires Executive access.</div></div></div>`;
    return;
  }
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸ‘” Boardroom View</div><div class="screen-subtitle">Executive performance summary Â· Capital efficiency Â· Strategic insights</div></div>
      <div class="screen-actions">
        <button class="btn btn-primary btn-sm" onclick="window.print()">ðŸ–¨ Export for Board</button>
      </div>
    </div>
    <div class="grid-4 mb-12">
      <div class="boardroom-kpi"><div class="boardroom-kpi-value">$18.4M</div><div class="boardroom-kpi-label">Total Desk P&L YTD</div></div>
      <div class="boardroom-kpi"><div class="boardroom-kpi-value accent-text">82%</div><div class="boardroom-kpi-label">vs Annual Target</div></div>
      <div class="boardroom-kpi"><div class="boardroom-kpi-value warning-text">$2.1M</div><div class="boardroom-kpi-label">Capital at Risk (VaR)</div></div>
      <div class="boardroom-kpi"><div class="boardroom-kpi-value">14.2%</div><div class="boardroom-kpi-label">Return on Capital</div></div>
    </div>
    <div class="grid-2 mb-12">
      <div class="chart-container">
        <div class="chart-title">Book P&L Comparison (YTD)</div>
        <canvas id="book-comparison-chart" style="max-height:220px"></canvas>
      </div>
      <div class="chart-container">
        <div class="chart-title">Monthly Trend vs Target</div>
        <canvas id="trend-target-chart" style="max-height:220px"></canvas>
      </div>
    </div>
    <div class="quartile-box">
      <div class="quartile-headline">If every trader performed at top-quartile levels:</div>
      <div class="quartile-number">$38,400,000</div>
      <div class="quartile-sub">Additional annual desk P&L â€” achievable with Radiant-MVT decision support</div>
      <button class="btn btn-primary btn-lg mt-12" onclick="exploreTopQuartile()">How we get there â†’</button>
      <div class="streaming-box mt-12" id="quartile-narrative" style="display:none;text-align:left"></div>
    </div>
  </div>`;
  renderBookComparisonChart();
  renderTrendTargetChart();
};

function renderBookComparisonChart() {
  const canvas = document.getElementById('book-comparison-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type:'bar',
    data:{ labels:['Crude & Condensate','NGL / Ethane','Naphtha','Carbon EUA'],
      datasets:[
        {label:'YTD Actual',  data:[7.2, 4.8, -0.8, 7.2], backgroundColor:['rgba(0,212,255,0.7)','rgba(0,212,255,0.7)','rgba(255,68,68,0.6)','rgba(0,212,255,0.7)']},
        {label:'YTD Budget',  data:[8.0, 5.5, 2.0, 7.0], backgroundColor:'rgba(138,155,181,0.25)', borderColor:'#8A9BB5', borderWidth:1, type:'bar'}
      ]},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'#1E2D45'}},y:{grid:{color:'#1E2D45'},ticks:{callback:v=>`$${v}M`}}}}
  });
}

function renderTrendTargetChart() {
  const canvas = document.getElementById('trend-target-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chart) canvas._chart.destroy();
  const months = ['Jan','Feb','Mar','Apr','May','Jun (proj)'];
  canvas._chart = new Chart(canvas, {
    type:'line',
    data:{ labels:months, datasets:[
      {label:'Actual',    data:[3.2,7.0,9.9,14.0,18.4,null], borderColor:'#00FF88', tension:0.3, fill:false},
      {label:'Target',   data:[3.8,7.6,11.8,16.6,22.0,25.5], borderColor:'#8A9BB5', tension:0.3, borderDash:[4,4], fill:false},
      {label:'Forecast', data:[null,null,null,null,18.4,24.2], borderColor:'#00D4FF', tension:0.3, borderDash:[2,6], fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'#1E2D45'}},y:{grid:{color:'#1E2D45'},ticks:{callback:v=>`$${v}M`}}}}
  });
}

window.exploreTopQuartile = async function() {
  const el = document.getElementById('quartile-narrative');
  if (el) el.style.display = 'block';
  await streamToElement(el, '/chat/message', {message:'Explain how the desk can reach top-quartile performance and unlock the additional $38.4M P&L potential', screen_context:'boardroom', provider: 'claude'});
};

/* â”€â”€ SCREEN 12: ADMIN / DEMO CONTROL â”€â”€ */
SCREENS['admin'] = async function(main) {
  if (!['admin'].includes(window.currentRole())) {
    main.innerHTML = `<div class="screen flex-center" style="height:60vh"><div class="text-center"><div style="font-size:48px">ðŸ”’</div><div class="mt-8 secondary">Admin access required.</div></div></div>`;
    return;
  }
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">âš™ï¸ Admin / Demo Control</div><div class="screen-subtitle">Scenario triggers Â· AI configuration Â· System status</div></div>
    </div>
    <div class="card mb-12">
      <div class="card-title mb-12">ðŸŽ­ Demo Scenarios</div>
      <div class="scenario-grid">
        ${[
          {key:'fat_finger',   emoji:'ðŸ”´', name:'Fat Finger',        desc:'Simulate a 10x position entry error', sev:'critical'},
          {key:'urals_arb',    emoji:'ðŸŸ ', name:'Urals Arb',          desc:'Brent/Urals spread opportunity opens', sev:'high'},
          {key:'dragon_delay', emoji:'ðŸŸ¡', name:'Dragon Fleet Delay', desc:'Innovation delayed 14h at Rafnes', sev:'medium'},
          {key:'stale_price',  emoji:'ðŸ”´', name:'Stale Price',        desc:'Thomson Reuters feed goes stale', sev:'critical'},
          {key:'margin_breach',emoji:'ðŸ”´', name:'Margin Breach',      desc:'ICE margin call exceeds threshold', sev:'critical'},
          {key:'eod_briefing', emoji:'ðŸŸ¢', name:'EOD Briefing',       desc:'End of day AI narrative generation', sev:'low'}
        ].map(s=>`<div class="scenario-btn ${s.sev}" onclick="triggerScenario('${s.key}','${s.name}')">
          <div class="scenario-emoji">${s.emoji}</div>
          <div class="scenario-name">${s.name}</div>
          <div class="scenario-desc">${s.desc}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="grid-2 mb-12">
      <div class="card">
        <div class="card-title mb-8">ðŸ¤– AI Configuration</div>
        <div class="var-row"><span class="var-row-label">Current Provider</span>
          <div class="flex gap-6">
            <button class="btn btn-sm ${'claude'==='claude'?'btn-primary':'btn-secondary'}" onclick="setProvider('claude')">â˜ Claude API</button>
            <button class="btn btn-sm ${'claude'==='local'?'btn-primary':'btn-secondary'}"  onclick="setProvider('local')">ðŸ”’ Local LLM</button>
          </div>
        </div>
        <div class="var-row mt-8"><span class="var-row-label">Claude Status</span><span class="var-row-value positive"><span class="status-dot green"></span>Connected</span></div>
        <div class="var-row"><span class="var-row-label">Local LLM Status</span><span class="var-row-value muted"><span class="status-dot amber"></span>Not configured</span></div>
        <div class="var-row"><span class="var-row-label">Data Egress</span><span class="var-row-value warning-text">${'claude'==='claude'?'â˜ Cloud API':'ðŸ”’ On-premise'}</span></div>
        <div class="flex gap-8 mt-8">
          <button class="btn btn-secondary btn-sm" onclick="testAI('claude')">Test Claude</button>
          <button class="btn btn-secondary btn-sm" onclick="testAI('local')">Test Local</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title mb-8">ðŸ“Š System Status</div>
        <div id="system-status">
          ${[
            {table:'trades',     count:'2,847', updated:'08:47:23'},
            {table:'positions',  count:'24',    updated:'08:47:00'},
            {table:'alerts',     count:'3',     updated:'08:31:15'},
            {table:'vessels',    count:'6',     updated:'08:00:00'},
            {table:'market_prices', count:'847',updated:'08:47:30'},
            {table:'emails',     count:'142',   updated:'08:45:00'}
          ].map(r=>`<div class="var-row">
            <span class="var-row-label mono">${r.table}</span>
            <span class="mono xsmall muted">${r.count} rows</span>
            <span class="mono xsmall muted">Updated ${r.updated}</span>
            <span class="status-dot green"></span>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
  loadSystemStatus();
};

window.triggerScenario = async function(key, name) {
  showToast('Scenario Triggered', `Running "${name}" scenario...`, 'warning');
  const data = await apiCall(`/admin/scenarios/${key}/trigger`, { method:'POST', body:'{}' });
  if (data) {
    showToast('Scenario Active', `"${name}" is now active. Check relevant screens.`, 'success');
    if (key === 'dragon_delay') navigateTo('vessels');
    else if (key === 'stale_price') navigateTo('market');
    else if (key === 'fat_finger' || key === 'margin_breach') navigateTo('positions');
    else if (key === 'urals_arb') navigateTo('ai');
    else if (key === 'eod_briefing') navigateTo('decision-queue');
  }
};

window.setProvider = function(provider) {
  if (window.appStorageSet) window.appStorageSet(SCREEN_STORAGE_KEYS.aiProvider, provider);
  else localStorage.setItem('radiant_ai_provider', provider);
  showToast('AI Provider', `Switched to ${provider === 'claude' ? 'Claude API' : 'Local LLM'}`, 'info');
  loadScreen('admin');
};

window.testAI = async function(provider) {
  showToast('Testing', `Testing ${provider} connection...`, 'info', 2000);
  const data = await apiCall('/admin/ai/test', { method:'POST', body: JSON.stringify({ provider }) });
  showToast(provider === 'claude' ? 'Claude' : 'Local LLM', data?.status || 'Connection test complete', 'success');
};

window.loadSystemStatus = async function() {
  await apiCall('/admin/system-status');
};


/* â”€â”€ VaR Calculation Modal â”€â”€ */
window.showVaRModal = function() {
  let modal = document.getElementById('var-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'var-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:700;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
    <div style="background:white;border-radius:14px;padding:28px;width:640px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <div style="font-size:20px;font-weight:700;color:#111827">âš¡ How VaR is Calculated</div>
          <div style="font-size:13px;color:#6B7280;margin-top:3px">Parametric Value at Risk â€” 99% Confidence</div>
        </div>
        <button onclick="document.getElementById('var-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6B7280">âœ•</button>
      </div>

      <!-- Formula -->
      <div style="background:#F0F7FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 18px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#2563EB;margin-bottom:10px">Core Formula</div>
        <div style="font-family:monospace;font-size:15px;font-weight:700;color:#1A2332;text-align:center;padding:8px 0">
          VaRâ‚ = Exposure Ã— Ïƒ Ã— Z<sub>99%</sub>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
          <div style="background:white;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:#6B7280;margin-bottom:3px">Exposure</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace">|Net position|<br>Ã— Current price</div>
          </div>
          <div style="background:white;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:#6B7280;margin-bottom:3px">Daily Volatility (Ïƒ)</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;color:#0066CC">1.5%</div>
            <div style="font-size:10px;color:#6B7280">90-day rolling window</div>
          </div>
          <div style="background:white;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:#6B7280;margin-bottom:3px">Z-score (99%)</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace;color:#0066CC">2.326</div>
            <div style="font-size:10px;color:#6B7280">Normal distribution</div>
          </div>
        </div>
      </div>

      <!-- Worked example -->
      <div style="margin-bottom:18px">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">Worked Example â€” Brent Book</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#F8FAFC">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;border-bottom:1px solid #E5E7EB">Position</th>
              <th style="padding:8px 12px;text-align:right;font-weight:700;font-size:11px;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">Net Volume</th>
              <th style="padding:8px 12px;text-align:right;font-weight:700;font-size:11px;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">Price</th>
              <th style="padding:8px 12px;text-align:right;font-weight:700;font-size:11px;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">Exposure</th>
              <th style="padding:8px 12px;text-align:right;font-weight:700;font-size:11px;color:#6B7280;text-transform:uppercase;border-bottom:1px solid #E5E7EB">1-Day VaR</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">Brent (physical + paper)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">+120,000 bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$82.40/bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$9.9M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$345K</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">Urals (physical long)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">+80,000 bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$77.60/bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$6.2M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$216K</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">WTI (paper short)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">âˆ’150,000 bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$78.90/bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$11.8M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$412K</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">Ethane (Dragon cargo)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">+85,000 MT</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$315/MT</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$26.8M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$934K</td></tr>
            <tr style="background:#F8FAFC;font-weight:700"><td style="padding:8px 12px;font-weight:700">Total Portfolio</td><td style="padding:8px 12px;text-align:right;font-family:monospace">â€”</td><td style="padding:8px 12px;text-align:right">â€”</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$54.7M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$2.1M</td></tr>
          </tbody>
        </table>
        <div style="font-size:11.5px;color:#6B7280;margin-top:8px">Note: VaR contributions add as sum (conservative â€” ignores diversification benefit). Net: 1.5% Ã— 2.326 Ã— $60.3M gross = $2.1M</div>
      </div>

      <!-- Scaling to 10-day -->
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:14px 16px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#15803D;margin-bottom:8px">10-Day VaR (Square-Root-of-Time Scaling)</div>
        <div style="font-family:monospace;font-size:14px;font-weight:700;color:#111827;text-align:center">
          VaRâ‚â‚€ = VaRâ‚ Ã— âˆš10 = $2.1M Ã— 3.162 = <span style="color:#15803D">$6.3M</span>
        </div>
        <div style="font-size:12px;color:#374151;margin-top:8px">This assumes price changes are i.i.d. (independent and identically distributed) â€” a standard regulatory assumption under Basel III.</div>
      </div>

      <!-- Stressed VaR -->
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:14px 16px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#D97706;margin-bottom:8px">Stressed VaR â€” Historical Shock Scenarios</div>
        <div style="font-size:13px;color:#374151;margin-bottom:8px">Uses actual 2008/2020/2022 oil price moves rather than 1.5% assumption:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2008 crash</div><div style="font-weight:700;font-family:monospace">Ïƒ = 8.2%</div><div style="font-size:11px;color:#D97706">VaR = $11.5M</div></div>
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2020 COVID</div><div style="font-weight:700;font-family:monospace">Ïƒ = 6.1%</div><div style="font-size:11px;color:#D97706">VaR = $8.5M</div></div>
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2022 Ukraine</div><div style="font-weight:700;font-family:monospace">Ïƒ = 4.8%</div><div style="font-size:11px;color:#D97706">VaR = $6.7M</div></div>
        </div>
        <div style="font-size:12px;color:#374151;margin-top:8px;font-weight:600">Regulatory stressed VaR reported: $9.4M (worst-case 3-month stress window)</div>
      </div>

      <!-- Limits -->
      <div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">Board-Approved Limits</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div><span style="color:#6B7280">1-Day VaR limit:</span> <strong>$8.0M</strong></div>
          <div><span style="color:#6B7280">Current utilisation:</span> <strong style="color:#D97706">62% âš ï¸</strong></div>
          <div><span style="color:#6B7280">10-Day VaR limit:</span> <strong>$25.0M</strong></div>
          <div><span style="color:#6B7280">Breach threshold:</span> <strong>80% â€” escalate to CRO</strong></div>
        </div>
      </div>

      <button onclick="document.getElementById('var-modal').remove()" class="btn btn-primary" style="width:100%;margin-top:18px;padding:12px">Close</button>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  } else {
    modal.remove();
  }
};
/* â”€â”€ SCREEN: POSITIONS & RISK â”€â”€ */
SCREENS['positions'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸ“ˆ Positions & Risk</div><div class="screen-subtitle">Full position book with VaR analysis</div></div>
      <div class="screen-actions">
        <div style="display:flex;gap:4px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:4px">
          <button class="pos-toggle active" onclick="filterPositions('all', this)" style="padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#6366f1;color:white">All</button>
          <button class="pos-toggle" onclick="filterPositions('physical', this)" style="padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;color:#94a3b8">Physical</button>
          <button class="pos-toggle" onclick="filterPositions('financial', this)" style="padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;color:#94a3b8">Financial</button>
        </div>
        <select id="pos-book" style="border:1px solid #E5E7EB;border-radius:7px;padding:7px 12px;font-size:13px">
          <option>All Books</option><option>Crude</option><option>Ethane</option><option>NGLs</option><option>Carbon</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="loadPositions()">âŸ³ Refresh</button>
      </div>
    </div>

    <!-- P&L Summary Row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
      <div style="background:linear-gradient(135deg,#16A34A,#15803D);border-radius:10px;padding:12px 16px;color:white">
        <div style="font-size:10px;opacity:.8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Today's P&L</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:-.5px" id="pos-today-pnl">+$2.1M</div>
        <div style="font-size:11px;opacity:.8;margin-top:2px">Unrealised MTM</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px 16px">
        <div style="font-size:10px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Day-over-Day Change</div>
        <div style="font-size:24px;font-weight:800;color:#16A34A;letter-spacing:-.5px" id="pos-dod-change">+$184K</div>
        <div style="font-size:11px;color:#6B7280;margin-top:2px">vs yesterday close</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px 16px">
        <div style="font-size:10px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">MTM P&L (Book Total)</div>
        <div style="font-size:24px;font-weight:800;color:#374151;letter-spacing:-.5px" id="pos-mtm-total">+$2.1M</div>
        <div style="font-size:11px;color:#6B7280;margin-top:2px">All open positions</div>
      </div>
    </div>

    <!-- Explainer cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:18px">
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;border-left:4px solid #0066CC">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:5px">Physical Cargo</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.5">Real barrels or tonnes we've <strong>bought or sold</strong> â€” actual cargo on ships or through pipelines.</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;border-left:4px solid #16A34A">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:5px">Paper Hedge</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.5">Financial contracts used to <strong>lock in a price</strong> and protect against physical position moving against us.</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;border-left:4px solid #D97706">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:5px">Net Exposure</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.5">What we're actually <strong>exposed to</strong> after netting physical against paper. Our real risk if prices move.</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;border-left:4px solid #7C3AED">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:5px">Today's P&L</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.5">How much each position has <strong>gained or lost today</strong> vs entry price. Not yet realised in cash.</div>
      </div>
    </div>

    <div class="grid-2" style="gap:16px">
      <div>
        <div class="table-container">
          <table class="trading-table">
            <thead><tr>
              <th>What we trade<div style="font-size:9px;font-weight:400;color:#94A3B8">Commodity</div></th>
              <th class="right">Physical cargo<div style="font-size:9px;font-weight:400;color:#94A3B8">Real volume</div></th>
              <th class="right">Paper hedge<div style="font-size:9px;font-weight:400;color:#94A3B8">Financial</div></th>
              <th class="right">Net exposure<div style="font-size:9px;font-weight:400;color:#94A3B8">Risk</div></th>
              <th>Unit</th>
              <th class="right">We paid</th>
              <th class="right">Market now</th>
              <th class="right">Today's P&L</th>
              <th class="right">% Hedged</th>
              <th class="right">1-Day VaR</th>
            </tr></thead>
            <tbody id="positions-tbody">
              <tr><td colspan="10" style="text-align:center;padding:20px;color:#6B7280">Loading positions...</td></tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;background:white;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">&#128200; Delivery Profile â€” Exposure by Tenor</div>
          <div style="position:relative;height:170px"><canvas id="exposure-chart"></canvas></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="var-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #F1F5F9">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-size:15px;font-weight:700;color:#111827">âš¡ Value at Risk</div>
              <button onclick="showVaRModal()" style="width:20px;height:20px;border-radius:50%;background:#0066CC;color:white;border:none;font-size:11px;font-weight:700;cursor:pointer">?</button>
            </div>
            <span style="font-size:10px;color:#6B7280;background:#F8FAFC;padding:2px 9px;border-radius:20px;border:1px solid #E5E7EB">Parametric 99%</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
            <div style="background:#F0F7FF;border-radius:8px;padding:12px">
              <div style="font-size:10px;color:#2563EB;font-weight:700;text-transform:uppercase;margin-bottom:3px">1-Day VaR</div>
              <div style="font-size:22px;font-weight:800;font-family:monospace">$2.1M</div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px">Max likely 1-day loss</div>
            </div>
            <div style="background:#F0FDF4;border-radius:8px;padding:12px">
              <div style="font-size:10px;color:#16A34A;font-weight:700;text-transform:uppercase;margin-bottom:3px">10-Day VaR</div>
              <div style="font-size:22px;font-weight:800;font-family:monospace">$6.3M</div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px">1-day Ã— âˆš10 Basel III</div>
            </div>
          </div>
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <span style="font-size:13px;font-weight:600;color:#374151">Board Limit Utilisation</span>
              <span style="font-size:13px;font-weight:700;color:#D97706">62% of $8.0M</span>
            </div>
            <div style="background:#F1F5F9;border-radius:6px;height:10px;overflow:hidden">
              <div style="background:#D97706;height:100%;width:62%;border-radius:6px"></div>
            </div>
          </div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:8px">VaR by Book</div>
          ${[['ðŸ›¢ Crude','$1.24M',59],['ðŸ§ª Ethane','$0.52M',25],['âš¡ NGLs','$0.19M',9],['ðŸŒ¿ Carbon','$0.15M',7]].map(([b,v,p])=>`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F9FAFB">
              <span style="font-size:13px;font-weight:600;color:#111827;width:90px">${b}</span>
              <div style="flex:1;background:#F1F5F9;border-radius:3px;height:6px"><div style="background:#0066CC;height:100%;width:${p}%;border-radius:3px"></div></div>
              <span style="font-size:12px;font-weight:700;font-family:monospace;color:#0066CC;min-width:42px">${v}</span>
            </div>`).join('')}
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:7px;padding:10px 12px;margin-top:12px">
            <div style="font-size:11px;font-weight:700;color:#D97706;margin-bottom:3px">âš  Stressed VaR</div>
            <div style="font-size:20px;font-weight:800;font-family:monospace">$9.4M</div>
            <div style="font-size:11px;color:#6B7280">2008/2020/2022 shock scenarios</div>
          </div>
        </div>
        <div class="chart-card">
          <div class="card-title mb-8">ðŸ¦ Counterparty Exposure (Top 5)</div>
          <div id="cp-exposure"><div class="muted small">Loading...</div></div>
        </div>
      </div>
    </div>
    <div class="chart-card" style="margin-top:16px">
      <div class="chart-title">Forward Curve
        <div class="curve-selector">
          <button class="curve-btn active" onclick="switchCurve('brent',this)">Brent</button>
          <button class="curve-btn" onclick="switchCurve('wti',this)">WTI</button>
          <button class="curve-btn" onclick="switchCurve('ethane',this)">Ethane</button>
          <button class="curve-btn" onclick="switchCurve('naphtha',this)">Naphtha</button>
        </div>
      </div>
      <div style="height:200px"><canvas id="curve-chart"></canvas></div>
    </div>
  </div>`;
  loadPositions();
  renderCounterpartyExposure();
  renderCurveChart('brent');
};

window.filterPositions = function(type, btn) {
  document.querySelectorAll('.pos-toggle').forEach(b => { b.style.background='transparent'; b.style.color='#94a3b8'; });
  btn.style.background='#6366f1'; btn.style.color='white';
  const rows = document.querySelectorAll('[data-pos-type]');
  rows.forEach(r => {
    r.style.display = (type === 'all' || r.dataset.posType === type) ? '' : 'none';
  });
};

/* â”€â”€ POSITIONS: loadPositions â”€â”€ */
window.loadPositions = async function() {
  var tbody = document.getElementById('positions-tbody');
  if (!tbody) return;

  var data = await apiCall('/positions/');
  var rows = (data && Array.isArray(data) ? data : (data && data.positions ? data.positions : [])) || [];

  // Per-commodity VaR lookup (parametric 99%, 1-day)
  var VAR_DATA = {
    Brent:  {var1d:1240000, vol:'1.82%', z:'1.65', notional:'$11.6M', stressed:'$3.72M',
             formula:'Net 120kbbl Ã— $96.97 price Ã— 1.82% daily vol Ã— 1.65 z-score',
             drivers:['30-day realised vol: 1.82%/day','Net long after 71% paper hedge','Brent/WTI corr 0.94 gives portfolio netting benefit','UAE OPEC exit risk adds tail premium'],
             scenarios:[['OPEC surprise cut âˆ’5%','+$580K'],['Demand shock âˆ’10%','âˆ’$1.16M'],['2020-style crash âˆ’20%','âˆ’$2.32M']]},
    Urals:  {var1d:520000,  vol:'2.21%', z:'1.65', notional:'$6.1M',  stressed:'$1.56M',
             formula:'Net 80kbbl Ã— $76.65 price Ã— 2.21% daily vol Ã— 1.65 z-score',
             drivers:['Urals vol 2.21%/day â€” higher than Brent due to sanctions premium','Zero paper hedge â€” fully unhedged physical long','Brent/Urals spread risk adds 0.4% incremental vol','Indian buyer concentration creates liquidity risk'],
             scenarios:[['Spread blowout âˆ’$8/bbl','âˆ’$640K'],['Price âˆ’10%','âˆ’$613K'],['Sanctions tightening','âˆ’$900K']]},
    WTI:    {var1d:190000,  vol:'1.74%', z:'1.65', notional:'$11.6M', stressed:'$570K',
             formula:'Net âˆ’150kbbl SHORT Ã— $77.52 Ã— 1.74% Ã— 1.65 â€” risk is price RISE',
             drivers:['Short position â€” upside moves are losses','Fully hedged (100%) via paper short','Low residual vol after hedge: 1.74%/day','WTI/Brent spread compression is primary risk'],
             scenarios:[['Price rise +5%','âˆ’$194K'],['+10% supply cut','âˆ’$387K'],['Short squeeze','âˆ’$580K']]},
    Ethane: {var1d:520000,  vol:'1.98%', z:'1.65', notional:'$27.8M', stressed:'$1.56M',
             formula:'Net 85,000 MT Ã— $326.92/MT Ã— 1.98% daily vol Ã— 1.65 z-score',
             drivers:['Unhedged â€” no paper cover on physical long','TTF gas correlation 0.71 adds European risk','Dragon fleet scheduling creates delivery concentration','Naphtha substitution economics affect demand curve'],
             scenarios:[['âˆ’5% ethane price','âˆ’$139K'],['China cracker outage','âˆ’$830K'],['TTF gas collapse âˆ’20%','âˆ’$415K']]},
    NGLs:   {var1d:190000,  vol:'1.63%', z:'1.65', notional:'$176K',  stressed:'$570K',
             formula:'Net 3,000 MT Ã— $58.80/MT Ã— 1.63% Ã— 1.65 z-score',
             drivers:['Small net position after 80% paper hedge','Correlated with ethane (0.82) â€” diversification limited','Propane/butane split adds basis risk vs index','Low standalone risk but adds to portfolio correlation'],
             scenarios:[['âˆ’5%','âˆ’$8.8K'],['Ethane spread blow','âˆ’$52K'],['âˆ’10%','âˆ’$17.6K']]},
    EUA:    {var1d:150000,  vol:'2.44%', z:'1.65', notional:'$2.5M',  stressed:'$450K',
             formula:'Net 40,000 t Ã— $62.18/t Ã— 2.44% daily vol Ã— 1.65 z-score',
             drivers:['Highest vol in book: 2.44%/day â€” policy-driven spikes','EU carbon policy risk â€” announcements cause step-changes','67% hedged via paper short','IMO 2027 levy announcement adds tail upside risk'],
             scenarios:[['Policy reversal âˆ’15%','âˆ’$374K'],['Supply glut âˆ’20%','âˆ’$498K'],['Mandate tightening +15%','+$374K']]},
  };

  // Fallback to static seed data if API returns empty
  if (!rows.length) {
    rows = [
      {commodity:'Brent',   region:'NW Europe',    physical_volume:420000,  paper_volume:-300000, net_volume:120000,  volume_unit:'bbl', avg_price:82.20, mtm_price:96.97, mtm_pnl:1240000, hedge_ratio:0.71},
      {commodity:'Urals',   region:'Mediterranean', physical_volume:80000,   paper_volume:0,       net_volume:80000,   volume_unit:'bbl', avg_price:77.40, mtm_price:76.65, mtm_pnl:440000,  hedge_ratio:0.0},
      {commodity:'WTI',     region:'US Gulf',       physical_volume:0,       paper_volume:-150000, net_volume:-150000, volume_unit:'bbl', avg_price:79.10, mtm_price:77.52, mtm_pnl:300000,  hedge_ratio:1.0},
      {commodity:'Ethane',  region:'NW Europe',     physical_volume:85000,   paper_volume:0,       net_volume:85000,   volume_unit:'MT',  avg_price:318.5, mtm_price:326.92,mtm_pnl:-320000, hedge_ratio:0.0},
      {commodity:'NGLs',    region:'NW Europe',     physical_volume:-12000,  paper_volume:15000,   net_volume:3000,    volume_unit:'MT',  avg_price:58.20, mtm_price:58.80, mtm_pnl:88000,   hedge_ratio:0.8},
      {commodity:'EUA',     region:'EU Carbon',     physical_volume:120000,  paper_volume:-80000,  net_volume:40000,   volume_unit:'t',   avg_price:61.50, mtm_price:62.18, mtm_pnl:320000,  hedge_ratio:0.67},
    ];
  }

  var icons = {Brent:'&#128738;',Urals:'&#127981;',WTI:'&#128507;',Ethane:'&#129514;',NGLs:'&#9889;',EUA:'&#127807;',Naphtha:'&#9875;'};

  tbody.innerHTML = rows.map(function(p) {
    var pnl = p.mtm_pnl || 0;
    var pnlStr = (pnl >= 0 ? '+' : '') + '$' + (Math.abs(pnl)/1000).toFixed(0) + 'K';
    var pnlCol = pnl >= 0 ? '#16A34A' : '#DC2626';
    var net = p.net_volume || 0;
    var netStr = (net >= 0 ? '+' : '') + Math.abs(net).toLocaleString() + ' ' + (p.volume_unit||'bbl');
    var netCol = net >= 0 ? '#0066CC' : '#DC2626';
    var hedgePct = Math.round((p.hedge_ratio||0)*100);
    var hedgeColor = hedgePct >= 70 ? '#16A34A' : (hedgePct >= 40 ? '#D97706' : '#DC2626');
    var icon = icons[p.commodity] || '&#128202;';
    var vd = VAR_DATA[p.commodity];
    var varStr = vd ? '$' + (vd.var1d/1000).toFixed(0) + 'K' : 'â€”';
    var posType = (p.physical_volume && !p.paper_volume) ? 'physical' : (!p.physical_volume && p.paper_volume) ? 'financial' : 'physical';
    return '<tr data-pos-type="' + posType + '">'
      + '<td><span style="font-size:14px;margin-right:5px">' + icon + '</span><strong style="color:#111827">' + p.commodity + '</strong><div style="font-size:10px;color:#9CA3AF">' + (p.region||'') + '</div></td>'
      + '<td class="right" style="font-family:monospace;font-size:12px">' + (p.physical_volume||0).toLocaleString() + '</td>'
      + '<td class="right" style="font-family:monospace;font-size:12px">' + (p.paper_volume||0).toLocaleString() + '</td>'
      + '<td class="right" style="font-weight:700;color:' + netCol + ';font-size:12px">' + netStr + '</td>'
      + '<td style="color:#9CA3AF;font-size:11px">' + (p.volume_unit||'bbl') + '</td>'
      + '<td class="right" style="font-family:monospace;font-size:12px">' + (p.avg_price||0).toFixed(2) + '</td>'
      + '<td class="right" style="font-family:monospace;font-size:12px;font-weight:600">' + (p.mtm_price||0).toFixed(2) + '</td>'
      + '<td class="right" style="font-weight:700;color:' + pnlCol + ';font-size:12px">' + pnlStr + '</td>'
      + '<td class="right"><span style="font-size:11px;font-weight:700;color:' + hedgeColor + '">' + hedgePct + '%</span>'
      + '<div style="background:#F1F5F9;border-radius:3px;height:4px;margin-top:3px;width:44px"><div style="background:' + hedgeColor + ';height:4px;border-radius:3px;width:' + Math.min(hedgePct,100) + '%"></div></div></td>'
      + '<td class="right" style="white-space:nowrap">'
      + '<span style="font-family:monospace;font-size:12px;font-weight:700;color:#2563EB">' + varStr + '</span>'
      + (vd ? ' <button onclick="showCommodityVaR(\'' + p.commodity + '\')" style="width:16px;height:16px;border-radius:50%;background:#2563EB;color:white;border:none;font-size:9px;font-weight:800;cursor:pointer;vertical-align:middle;margin-left:2px">?</button>' : '')
      + '</td>'
      + '</tr>';
  }).join('');

  // Expose VAR_DATA for the modal
  window._VAR_DATA = VAR_DATA;

  // Render exposure chart after table loads
  setTimeout(function(){ renderExposureChart(rows); }, 80);
};

function renderExposureChart(rows) {
  var canvas = document.getElementById('exposure-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  var existing = Chart.getChart ? Chart.getChart(canvas) : null;
  if (existing) existing.destroy();

  var labels = ['Jun-26','Jul-26','Aug-26','Sep-26','Oct-26','Nov-26','Q1-27'];
  var baseNet = rows.reduce(function(s,r){ return s + (r.net_volume||0); }, 0) / 1e5;
  var datasets = [
    { label: 'Crude', data: [baseNet*0.9, baseNet*0.7, baseNet*0.5, baseNet*0.4, baseNet*0.3, baseNet*0.2, baseNet*0.1], backgroundColor: '#2563EB' },
    { label: 'Ethane', data: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.42], backgroundColor: '#16A34A' },
    { label: 'NGLs', data: [0.03, 0.03, 0.02, 0.02, 0.01, 0.01, 0], backgroundColor: '#D97706' },
    { label: 'Carbon', data: [0.4, 0.3, 0.2, 0.15, 0.1, 0.05, 0], backgroundColor: '#7C3AED' },
  ];

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 }, color: '#9CA3AF' }, grid: { display: false } },
        y: { stacked: true, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: function(v) { return v.toFixed(1) + 'M'; } }, grid: { color: '#F3F4F6' } }
      }
    }
  });
}

function renderCounterpartyExposure() {
  var el = document.getElementById('cp-exposure');
  if (!el) return;
  var cps = [
    {name:'Vitol',            exposure:142, limit:200, pct:71},
    {name:'Shell Trading',    exposure:98,  limit:150, pct:65},
    {name:'BP Oil Intl',      exposure:87,  limit:150, pct:58},
    {name:'TotalEnergies',    exposure:64,  limit:120, pct:53},
    {name:'Glencore Energy',  exposure:51,  limit:100, pct:51},
  ];
  el.innerHTML = cps.map(function(c) {
    var col = c.pct >= 80 ? '#DC2626' : (c.pct >= 60 ? '#D97706' : '#16A34A');
    return '<div style="margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
      + '<span style="font-size:12px;font-weight:600;color:#374151">' + c.name + '</span>'
      + '<span style="font-size:12px;font-family:monospace;color:' + col + ';font-weight:700">$' + c.exposure + 'M / $' + c.limit + 'M</span>'
      + '</div>'
      + '<div style="background:#F1F5F9;border-radius:4px;height:7px;overflow:hidden">'
      + '<div style="background:' + col + ';height:100%;width:' + c.pct + '%;border-radius:4px;transition:width .6s"></div>'
      + '</div>'
      + '<div style="text-align:right;font-size:10px;color:' + col + ';font-weight:700;margin-top:1px">' + c.pct + '%</div>'
      + '</div>';
  }).join('');
}

function renderCurveChart(commodity) {
  var canvas = document.getElementById('curve-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  var existing = Chart.getChart ? Chart.getChart(canvas) : null;
  if (existing) existing.destroy();

  var curves = {
    brent:   {base:96.97, label:'Brent ($/bbl)',    color:'#2563EB'},
    wti:     {base:77.52, label:'WTI ($/bbl)',      color:'#7C3AED'},
    ethane:  {base:326.9, label:'Ethane ($/MT)',    color:'#16A34A'},
    naphtha: {base:680.0, label:'Naphtha ($/MT)',   color:'#D97706'},
  };
  var c = curves[commodity] || curves.brent;
  var months = ['Jun-26','Jul-26','Aug-26','Sep-26','Oct-26','Nov-26','Dec-26','Jan-27','Feb-27','Mar-27'];
  var backwardation = commodity === 'ethane' || commodity === 'naphtha';
  var data = months.map(function(_, i) {
    var drift = backwardation ? -i * 0.4 : -i * 0.18;
    return +(c.base + drift + (Math.random() - 0.5) * 0.3).toFixed(2);
  });

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: c.label, data: data, borderColor: c.color, backgroundColor: c.color + '18', borderWidth: 2.5, pointRadius: 3, fill: true, tension: 0.35 },
        { label: 'Entry price', data: Array(10).fill(+(c.base * 0.98).toFixed(2)), borderColor: '#9CA3AF', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { ticks: { font: { size: 10 }, color: '#9CA3AF' }, grid: { display: false } },
        y: { ticks: { font: { size: 10 }, color: '#9CA3AF' }, grid: { color: '#F3F4F6' } }
      }
    }
  });
}

window.switchCurve = function(commodity, btn) {
  document.querySelectorAll('.curve-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderCurveChart(commodity);
};

/* â”€â”€ PER-COMMODITY VaR MODAL â”€â”€ */
window.showCommodityVaR = function(commodity) {
  var vd = (window._VAR_DATA || {})[commodity];
  if (!vd) return;

  document.getElementById('var-modal') && document.getElementById('var-modal').remove();

  var var10d = (vd.var1d * Math.sqrt(10) / 1e6).toFixed(2);
  var var1dM = (vd.var1d / 1e6).toFixed(2);
  var totalVar = 2100000;
  var pctOfTotal = Math.round(vd.var1d / totalVar * 100);

  var scenRows = vd.scenarios.map(function(s) {
    var pos = s[1].charAt(0) === '+';
    var col = pos ? '#16A34A' : '#DC2626';
    return '<tr style="border-bottom:1px solid #F1F5F9">'
      + '<td style="padding:7px 10px;font-size:12px;color:#374151">' + s[0] + '</td>'
      + '<td style="padding:7px 10px;font-size:13px;font-weight:700;font-family:monospace;color:' + col + ';text-align:right">' + s[1] + '</td>'
      + '</tr>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'var-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };

  modal.innerHTML = '<div style="background:white;border-radius:14px;width:580px;max-width:95vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25)">'

    /* Header */
    + '<div style="background:linear-gradient(135deg,#1e40af,#2563EB);padding:18px 22px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div><div style="color:white;font-size:17px;font-weight:800">&#9889; VaR Breakdown â€” ' + commodity + '</div>'
    + '<div style="color:rgba(255,255,255,.75);font-size:12px;margin-top:3px">Parametric method Â· 99% confidence Â· 1-day horizon</div></div>'
    + '<button onclick="document.getElementById(\'var-modal\').remove()" style="background:rgba(255,255,255,.15);border:none;color:white;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:30px">&#10005;</button>'
    + '</div>'

    /* KPI row */
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#E5E7EB">'
    + '<div style="background:#F0F7FF;padding:14px 16px;text-align:center"><div style="font-size:10px;font-weight:700;color:#2563EB;text-transform:uppercase;margin-bottom:4px">1-Day VaR</div><div style="font-size:24px;font-weight:800;font-family:monospace;color:#1e40af">$' + var1dM + 'M</div><div style="font-size:11px;color:#6B7280;margin-top:2px">99% confidence</div></div>'
    + '<div style="background:#F0FDF4;padding:14px 16px;text-align:center"><div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:4px">10-Day VaR</div><div style="font-size:24px;font-weight:800;font-family:monospace;color:#15803D">$' + var10d + 'M</div><div style="font-size:11px;color:#6B7280;margin-top:2px">Ã— âˆš10 Basel III</div></div>'
    + '<div style="background:#FFF7ED;padding:14px 16px;text-align:center"><div style="font-size:10px;font-weight:700;color:#D97706;text-transform:uppercase;margin-bottom:4px">% of Book VaR</div><div style="font-size:24px;font-weight:800;font-family:monospace;color:#D97706">' + pctOfTotal + '%</div><div style="font-size:11px;color:#6B7280;margin-top:2px">of $2.1M total</div></div>'
    + '</div>'

    /* Formula */
    + '<div style="padding:16px 20px;border-bottom:1px solid #F1F5F9">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:8px">Formula</div>'
    + '<div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:10px 14px;font-family:monospace;font-size:13px;color:#1e40af;font-weight:600">'
    + 'VaR = ' + vd.formula
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">'
    + '<div style="background:#F1F5F9;border-radius:7px;padding:8px 10px;text-align:center"><div style="font-size:10px;color:#6B7280;margin-bottom:2px">Daily Volatility</div><div style="font-size:16px;font-weight:800;color:#374151">' + vd.vol + '</div></div>'
    + '<div style="background:#F1F5F9;border-radius:7px;padding:8px 10px;text-align:center"><div style="font-size:10px;color:#6B7280;margin-bottom:2px">Z-Score (99%)</div><div style="font-size:16px;font-weight:800;color:#374151">' + vd.z + '</div></div>'
    + '<div style="background:#F1F5F9;border-radius:7px;padding:8px 10px;text-align:center"><div style="font-size:10px;color:#6B7280;margin-bottom:2px">Notional</div><div style="font-size:16px;font-weight:800;color:#374151">' + vd.notional + '</div></div>'
    + '</div></div>'

    /* Risk drivers */
    + '<div style="padding:14px 20px;border-bottom:1px solid #F1F5F9">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:8px">Risk Drivers</div>'
    + vd.drivers.map(function(d){ return '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:5px"><span style="color:#2563EB;margin-top:1px">&#9679;</span><span style="font-size:12.5px;color:#374151">' + d + '</span></div>'; }).join('')
    + '</div>'

    /* Scenarios */
    + '<div style="padding:14px 20px;border-bottom:1px solid #F1F5F9">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:8px">Stress Scenarios</div>'
    + '<table style="width:100%"><tbody>' + scenRows + '</tbody></table>'
    + '</div>'

    /* Stressed VaR */
    + '<div style="padding:14px 20px;border-bottom:1px solid #F1F5F9">'
    + '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">'
    + '<div><div style="font-size:11px;font-weight:700;color:#D97706">&#9888; Stressed VaR (2008/2020/2022 scenarios)</div>'
    + '<div style="font-size:11px;color:#6B7280;margin-top:2px">Historical shock applied to current position</div></div>'
    + '<div style="font-size:22px;font-weight:800;font-family:monospace;color:#D97706">' + vd.stressed + '</div>'
    + '</div></div>'

    /* Footer */
    + '<div style="padding:14px 20px;display:flex;gap:10px">'
    + '<button onclick="document.getElementById(\'var-modal\').remove()" class="btn btn-primary" style="flex:1">Close</button>'
    + '<button onclick="window.sendCopilotMessage && window.sendCopilotMessage(\'Explain VaR for my ' + commodity + ' position and suggest how to reduce it\')" style="flex:1;padding:10px;border:1px solid #0066CC;background:white;color:#0066CC;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">&#129504; Ask AI to Reduce VaR</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);
};

/* â”€â”€ SCREEN: AI INTELLIGENCE â”€â”€ */
SCREENS['ai'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸ¤– AI Intelligence Centre</div><div class="screen-subtitle">Hedge advisor Â· Trade ideas Â· Anomaly detection Â· Pre-mortem analysis</div></div>
      <div class="screen-actions">
        <span class="ai-provider-badge"><span class="dot"></span>${(window.aiProvider === 'claude' || window.aiProvider?.() === 'claude') ? 'ðŸ¤– Radiant AI' : 'ðŸ”’ Local AI'}</span>
      </div>
    </div>
    <div class="ai-3col">
      <div class="ai-panel">
        <div class="ai-panel-title">${isRiskApp ? 'ðŸ“‰ Exposure Review' : 'ðŸ›¡ Hedge Advisor'} <button class="ai-panel-expand-btn" onclick="expandPanel(this)">â¤¢ Expand</button></div>
        <div class="form-group">
          <label class="form-label">Select Position to Hedge</label>
          <select class="form-select" id="hedge-position">
            <option value="">Choose a position...</option>
            <option value="urals">Urals â€” 200kbbl net long (MED)</option>
            <option value="ethane">Ethane â€” 20kt net long (EU)</option>
            <option value="brent">Brent â€” 120kbbl net long (NWE)</option>
            <option value="naphtha">Naphtha â€” 20kt net long (NWE)</option>
          </select>
        </div>
        <button class="btn btn-primary w-full" onclick="runHedgeAdvisor()">ðŸ¤– Get AI Recommendation</button>
        <div id="hedge-factors" style="display:none;margin-top:12px">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">Factor Attribution</div>
          <div id="factor-bars"></div>
          <div class="option-overlay-hint" style="margin-top:8px">ðŸ’¡ Option overlay will be shown in full recommendation</div>
        </div>
        <div class="streaming-box" id="hedge-result" style="display:none;margin-top:10px;min-height:80px"></div>
      </div>
      <div class="ai-panel">
        <div class="ai-panel-title">${isRiskApp ? 'ðŸ§­ Control Insights' : 'ðŸ’¡ Trade Ideas'} <button class="ai-panel-expand-btn" onclick="expandPanel(this)">â¤¢ Expand</button></div>
        <button class="btn btn-secondary btn-sm w-full mb-8" onclick="scanTradeIdeas()">${isRiskApp ? 'ðŸ” Scan for Risk Signals' : 'ðŸ” Scan for Opportunities'}</button>
        <div id="trade-ideas-list">${renderTradeIdeaCards()}</div>
      </div>
      <div class="ai-panel">
        <div class="ai-panel-title">${isRiskApp ? 'âš  Concentration Alerts' : 'âš  Anomaly Alerts'} <button class="ai-panel-expand-btn" onclick="expandPanel(this)">â¤¢ Expand</button></div>
        <div id="ai-alerts-container"><div class="muted small">Loading alerts...</div></div>
        <div class="di-section mt-8">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">${isRiskApp ? 'ðŸ”¬ Stress Review' : 'ðŸ”¬ Pre-Mortem Analysis'}</div>
          <button class="btn btn-secondary w-full mb-8" onclick="runPreMortem()">${isRiskApp ? 'Run Desk Stress Review' : 'Run Pre-Mortem on Book'}</button>
          <div id="premortem-results"></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="card">
        <div class="card-title">ðŸ“ˆ Price Forecasting â€” AI Forward Curve View</div>
        <select id="forecast-commodity" onchange="renderForecastChart()" style="border:1px solid #E5E7EB;border-radius:7px;padding:7px 12px;font-size:13px;width:100%;margin-bottom:12px">
          <option value="Brent">Brent Crude</option><option value="WTI">WTI Crude</option>
          <option value="Urals">Urals Crude</option><option value="Ethane">Ethane</option><option value="HH">Henry Hub</option>
        </select>
        <div style="height:150px;position:relative"><canvas id="forecast-chart"></canvas></div>
        <div id="forecast-narrative" style="font-size:13px;color:#374151;line-height:1.6;margin-top:10px;padding-top:10px;border-top:1px solid #F1F5F9">Select commodity and click Generate to see AI forecast.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="generateForecastNarrative()">ðŸ¤– Generate AI Forecast</button>
      </div>
      <div class="card">
        <div class="card-title">ðŸ“° Event & Sentiment Impact on Book</div>
        <div id="sentiment-impact-list"><div class="muted small">Loading...</div></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="loadSentimentImpact()">â†» Refresh</button>
      </div>
    </div>
  </div>`;
  loadAIAlerts();
  renderForecastChart();
  loadSentimentImpact();
};

/* â”€â”€ AI INTELLIGENCE: all functions â”€â”€ */

// Cache so re-entering the screen is instant
var _aiCache = {};

window.loadAIAlerts = function() {
  var el = document.getElementById('ai-alerts-container');
  if (!el) return;
  if (_aiCache.alerts) { el.innerHTML = _aiCache.alerts; return; }

  var alerts = [
    { sev:'critical', icon:'ðŸ”´', title:'Fat-finger detected â€” Ethane Americas book',
      body:'RMVT-95378: BUY 5,002 MT Ethane @ $58.71 â€” volume 4Ã— typical. Book P&L moved +$420K in 15 min window. Recommend confirmation call to Repsol before settlement.',
      time:'02:41', action:'Review Trade' },
    { sev:'high', icon:'ðŸŸ ', title:'JS Ineos Insight â€” demurrage risk',
      body:'14-hour North Sea delay pushes ETA past allowed laytime. Estimated demurrage: $26,250. Three options costed â€” recommend Option B (partial discharge at Teesside).',
      time:'Yesterday', action:'See Voyage Options' },
    { sev:'high', icon:'ðŸŸ ', title:'Vitol credit limit 88% utilised',
      body:'Current exposure $142M vs $160M approved limit. Two open trades pending settlement would push to 97%. Recommend suspending new trades until Wed settlement clears.',
      time:'08:15', action:'View Exposure' },
    { sev:'medium', icon:'ðŸŸ¡', title:'Stale price alert â€” Urals M+2',
      body:'Urals Aug-26 price unchanged for 52 minutes. Last update 08:03. Current book carries $890K mark-to-market overstatement vs Platts reference. Feed health check required.',
      time:'09:03', action:'Check Feed' },
  ];

  var html = alerts.map(function(a) {
    var bg = a.sev==='critical'?'#FEF2F2':a.sev==='high'?'#FFF7ED':'#FEFCE8';
    var bc = a.sev==='critical'?'#DC2626':a.sev==='high'?'#D97706':'#CA8A04';
    return '<div style="background:'+bg+';border-left:4px solid '+bc+';border-radius:8px;padding:12px 14px;margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">'
      + '<span style="font-size:13px;font-weight:700;color:#111827">'+a.icon+' '+a.title+'</span>'
      + '<span style="font-size:10px;color:#9CA3AF;white-space:nowrap;margin-left:8px">'+a.time+'</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:8px">'+a.body+'</div>'
      + '<button onclick="window.sendCopilotMessage && window.sendCopilotMessage(\'Tell me more about: '+a.title+'\')" '
      + 'style="font-size:11px;padding:3px 10px;border:1px solid '+bc+';background:white;color:'+bc+';border-radius:5px;cursor:pointer">'+a.action+' â†’</button>'
      + '</div>';
  }).join('');
  _aiCache.alerts = html;
  el.innerHTML = html;
};

window.renderTradeIdeaCards = function() {
  if (_aiCache.tradeIdeas) return _aiCache.tradeIdeas;
  var ideas = [
    { tag:'ARB', tagColor:'#2563EB', title:'Brent/Urals Spread â€” Long Opportunity',
      summary:'Urals discount to Brent at $20.32/bbl â€” 2.3Ïƒ above 90-day mean. Historical reversion within 8â€“12 days. 14 of 17 similar setups were profitable.',
      pl:'+$1.4M est.', conf:'High', risk:'Med' },
    { tag:'MOMENTUM', tagColor:'#7C3AED', title:'Ethane Long â€” Supply Tightness',
      summary:'US ethane exports at record 368kbpd. Dragon fleet utilisation 94%. TTF gas surge improves naphtha substitution economics. Add to long.',
      pl:'+$840K est.', conf:'High', risk:'Low' },
    { tag:'EVENT', tagColor:'#D97706', title:'OPEC+ Meeting Thursday â€” Vol Play',
      summary:'UAE exit talks create binary outcome. Options implied vol at 31%. Consider straddle on Brent before Thursday\'s emergency session.',
      pl:'+$620K est.', conf:'Med', risk:'Med' },
  ];
  var html = ideas.map(function(idea) {
    return '<div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px;margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px">'
      + '<span style="font-size:10px;font-weight:700;background:'+idea.tagColor+'18;color:'+idea.tagColor+';padding:2px 8px;border-radius:20px">'+idea.tag+'</span>'
      + '<span style="font-size:11px;font-weight:700;color:#16A34A">'+idea.pl+'</span>'
      + '</div>'
      + '<div style="font-size:12.5px;font-weight:700;color:#111827;margin-bottom:5px">'+idea.title+'</div>'
      + '<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:8px">'+idea.summary+'</div>'
      + '<div style="display:flex;gap:8px">'
      + '<span style="font-size:11px;background:#DCFCE7;color:#16A34A;padding:2px 8px;border-radius:20px">Conf: '+idea.conf+'</span>'
      + '<span style="font-size:11px;background:#FEF3C7;color:#D97706;padding:2px 8px;border-radius:20px">Risk: '+idea.risk+'</span>'
      + '<button onclick="window.sendCopilotMessage && window.sendCopilotMessage(\'Analyse this trade idea: '+idea.title+'\')" '
      + 'style="font-size:11px;padding:2px 10px;border:1px solid #0066CC;background:white;color:#0066CC;border-radius:5px;cursor:pointer;margin-left:auto">Ask AI â†’</button>'
      + '</div></div>';
  }).join('');
  _aiCache.tradeIdeas = html;
  return html;
};

window.scanTradeIdeas = async function() {
  var el = document.getElementById('trade-ideas-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:20px"><div class="loading-spinner" style="display:inline-block;width:24px;height:24px;border-width:3px"></div><div style="margin-top:8px;font-size:12px;color:#6B7280">Scanning market for opportunities...</div></div>';
  await new Promise(function(r){ setTimeout(r, 1800); });
  delete _aiCache.tradeIdeas;
  el.innerHTML = renderTradeIdeaCards();
};

window.loadSentimentImpact = function() {
  var el = document.getElementById('sentiment-impact-list');
  if (!el) return;
  if (_aiCache.sentiment) { el.innerHTML = _aiCache.sentiment; return; }

  var items = [
    { event:'UAE OPEC exit talks',        impact:'+$284K', dir:'pos', note:'Long Brent 120kbbl â€” favourable' },
    { event:'EIA 7.97M bbl draw',         impact:'+$196K', dir:'pos', note:'WTI paper short partially offsets' },
    { event:'TTF gas spike +12%',         impact:'+$142K', dir:'pos', note:'Ethane/naphtha arb improves' },
    { event:'IMO carbon levy 2027',        impact:'-$38K',  dir:'neg', note:'Dragon fleet voyage cost headwind' },
    { event:'China cracker demand +18M',  impact:'+$88K',  dir:'pos', note:'Ethane long position supported' },
  ];
  var html = '<div style="font-size:11px;color:#6B7280;margin-bottom:8px">Today\'s news events vs your open book â€” AI-calculated impact</div>'
    + items.map(function(i) {
    var col = i.dir === 'pos' ? '#16A34A' : '#DC2626';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #F9FAFB">'
      + '<div><div style="font-size:12px;font-weight:600;color:#374151">'+i.event+'</div>'
      + '<div style="font-size:11px;color:#9CA3AF">'+i.note+'</div></div>'
      + '<span style="font-size:13px;font-weight:700;font-family:monospace;color:'+col+';min-width:60px;text-align:right">'+i.impact+'</span>'
      + '</div>';
  }).join('');
  _aiCache.sentiment = html;
  el.innerHTML = html;
};

window.renderForecastChart = function() {
  var canvas = document.getElementById('forecast-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  var existing = Chart.getChart ? Chart.getChart(canvas) : null;
  if (existing) existing.destroy();

  var sel = document.getElementById('forecast-commodity');
  var commodity = sel ? sel.value : 'Brent';
  var bases = {Brent:96.97, WTI:77.52, Urals:76.65, Ethane:326.92, HH:2.93};
  var base = bases[commodity] || 96.97;
  var months = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan-27'];
  var actual = months.slice(0,3).map(function(_,i){ return +(base - i*0.2 + (Math.random()-0.5)*0.5).toFixed(2); });
  var forecast = [null, null].concat(months.slice(2).map(function(_,i){ return +(actual[actual.length-1] + i*0.3 + (Math.random()-0.5)*0.8).toFixed(2); }));
  var upper = forecast.map(function(v){ return v ? +(v*1.025).toFixed(2) : null; });
  var lower = forecast.map(function(v){ return v ? +(v*0.975).toFixed(2) : null; });

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label:'Actual', data: actual.concat(Array(months.length-actual.length).fill(null)), borderColor:'#111827', borderWidth:2.5, pointRadius:3, tension:0.3 },
        { label:'AI Forecast', data: forecast, borderColor:'#0066CC', borderWidth:2, borderDash:[5,4], pointRadius:2, tension:0.3 },
        { label:'Upper bound', data: upper, borderColor:'#0066CC30', borderWidth:1, fill:'+1', pointRadius:0 },
        { label:'Lower bound', data: lower, borderColor:'#0066CC30', borderWidth:1, backgroundColor:'#0066CC10', fill:false, pointRadius:0 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:{size:10}, filter:function(i){ return i.text!=='Upper bound'&&i.text!=='Lower bound'; } } } },
      scales:{
        x:{ ticks:{ font:{size:10}, color:'#9CA3AF' }, grid:{ display:false } },
        y:{ ticks:{ font:{size:10}, color:'#9CA3AF' }, grid:{ color:'#F3F4F6' } }
      }
    }
  });
};

window.generateForecastNarrative = async function() {
  var sel = document.getElementById('forecast-commodity');
  var commodity = sel ? sel.value : 'Brent';
  var el = document.getElementById('forecast-narrative');
  if (!el) return;
  if (_aiCache['forecast_'+commodity]) { el.innerHTML = _aiCache['forecast_'+commodity]; renderForecastChart(); return; }
  el.innerHTML = '<span class="loading-spinner" style="display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:middle"></span> Generating AI forecast...';
  renderForecastChart();

  var prompts = {
    Brent:'What is your 90-day price forecast for Brent crude given UAE OPEC exit risk and EIA draw data from today June 4 2026?',
    WTI:'Forecast WTI crude for the next 90 days given current US inventory tightness.',
    Ethane:'Forecast US ethane export prices for next 90 days given Dragon fleet dynamics.',
    Urals:'Forecast Urals crude given current Russian supply dynamics.',
    HH:'Forecast Henry Hub natural gas price for summer 2026.'
  };
  var result = await apiCall('/chat/message', { method:'POST', body: JSON.stringify({ message: prompts[commodity]||prompts.Brent, context:'market_forecast' }) });
  var text = result?.response || result?.content || result?.message || _forecastFallback(commodity);
  var html = '<div style="font-size:12.5px;color:#374151;line-height:1.7">'+text.replace(/\n/g,'<br>')+'</div>';
  _aiCache['forecast_'+commodity] = html;
  el.innerHTML = html;
};

function _forecastFallback(commodity) {
  var f = {
    Brent:'Brent is likely to trade in the $92â€“100 range over the next 90 days. UAE exit risk adds a structural +$3â€“5 uncertainty premium. The EIA draw sequence is the strongest bullish signal in 6 months. Downside risk: Chinese demand slowdown or surprise OPEC production increase.',
    Ethane:'Ethane prices are expected to remain elevated at $320â€“340/MT through Q3 2026, supported by record US exports and tight Dragon fleet availability. Key upside risk: further TTF gas rally increasing naphtha crack, widening the arb.',
    WTI:'WTI fundamentals support a $75â€“82 range. Inventory at 6% below 5-year average is constructive but the WTI/Brent spread may narrow as US export pace moderates.',
    Urals:'Urals likely to trade at $17â€“22 discount to Brent. Indian buyers remain active at these levels. Russian supply stability and sanctions enforcement are the primary variables.',
    HH:'Henry Hub expected to move toward $3.00â€“3.30/MMBtu by August as summer cooling demand and LNG feedgas exports compete for supply. Storage deficit supports the bullish case.'
  };
  return f[commodity] || f.Brent;
}

window.runHedgeAdvisor = async function() {
  var sel = document.getElementById('hedge-position');
  var pos = sel ? sel.value : '';
  if (!pos) { alert('Please select a position to hedge'); return; }

  var factorsEl = document.getElementById('hedge-factors');
  var barsEl = document.getElementById('factor-bars');
  var resultEl = document.getElementById('hedge-result');
  if (!resultEl) return;

  // Show working state
  if (factorsEl) factorsEl.style.display = 'block';
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div class="ai-working-state"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
    + '<div class="brain-pulse" style="width:28px;height:28px;border-radius:50%;background:#0066CC;animation:brainPulse 1.2s infinite;flex-shrink:0"></div>'
    + '<div style="font-size:13px;font-weight:600;color:#0066CC">Radiant AI is analysing your position...</div></div>'
    + '<div id="hedge-steps" style="font-size:12px;color:#374151;line-height:1.9"></div></div>';

  var steps = ['&#128202; Loading position book and live prices...','&#128200; Calculating Greeks and factor exposures...','&#127942; Comparing 14 hedge structures...','&#129504; Optimising for cost vs coverage...'];
  var stepsEl = document.getElementById('hedge-steps');
  for (var i = 0; i < steps.length; i++) {
    await new Promise(function(r){ setTimeout(r, 500); });
    if (stepsEl) stepsEl.innerHTML += '<div>&#10003; ' + steps[i] + '</div>';
  }

  var factors = {
    urals:  [{n:'Brent/Urals spread',v:72},{n:'Freight Baltic Index',v:58},{n:'Russian supply risk',v:44},{n:'Mediterranean demand',v:31}],
    ethane: [{n:'US ethane exports',v:81},{n:'TTF gas correlation',v:67},{n:'Naphtha arb',v:54},{n:'Dragon fleet utilisation',v:48}],
    brent:  [{n:'UAE OPEC risk',v:78},{n:'EIA inventory draw',v:65},{n:'USD strength',v:42},{n:'China demand',v:38}],
    naphtha:[{n:'Naphtha crack spread',v:71},{n:'Ethane substitution',v:62},{n:'EU refinery runs',v:49},{n:'Gasoline demand',v:35}],
  };
  if (barsEl) {
    barsEl.innerHTML = (factors[pos]||factors.brent).map(function(f) {
      return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:#374151">'+f.n+'</span><span style="font-weight:700;color:#0066CC">'+f.v+'%</span></div>'
        + '<div style="background:#F1F5F9;border-radius:3px;height:6px"><div class="factor-bar" style="background:#0066CC;height:100%;border-radius:3px;width:0;transition:width .8s" data-w="'+f.v+'%"></div></div></div>';
    }).join('');
    setTimeout(function(){ document.querySelectorAll('.factor-bar').forEach(function(b){ b.style.width=b.dataset.w; }); }, 50);
  }

  // Stream recommendation
  await new Promise(function(r){ setTimeout(r, 400); });
  var recs = {
    urals: '**Recommended Structure: Brent/Urals Spread Swap + Freight Option**\n\nSell 80,000 bbl Urals forward at current $20.32 discount to lock in current spread. Layer a $2/bbl out-of-the-money Brent cap to protect against further Brent rally pulling the spread wider.\n\n**Cost:** ~$0.18/bbl premium | **Coverage:** 85% of downside risk | **Break-even:** $18.40/bbl spread\n\nâš¡ *AI Confidence: High â€” 14 of 17 similar structures were profitable over 30 days*',
    ethane:'**Recommended Structure: Asian Collar â€” Long Call / Short Put on Ethane**\n\nBuy Dec-26 ethane call at $340/MT, sell put at $305/MT. Zero-cost collar protects existing long position while retaining $15/MT upside from continued Dragon fleet strength.\n\n**Cost:** Zero-cost collar | **Coverage:** Full downside below $305/MT | **Upside cap:** $340/MT\n\nâš¡ *AI Confidence: High â€” ethane fundamentals strongly bullish, Dragon fleet at 94% utilisation*',
    brent: '**Recommended Structure: Put Spread â€” Buy $95 Put / Sell $88 Put**\n\nProtects 120,000 bbl Brent long against a UAE OPEC-exit reversal. Net premium $0.92/bbl. Covers the move from current $96.97 down to $88 (the key technical support level).\n\n**Cost:** $0.92/bbl (~$110K total) | **Coverage:** Full protection $95â†’$88 | **Unhedged upside:** Unlimited above $95\n\nâš¡ *AI Confidence: High â€” binary OPEC risk event Thursday warrants option protection*',
    naphtha:'**Recommended Structure: Naphtha Crack Swap**\n\nSell 20,000 MT naphtha crack at current $142/MT vs feedstock. Lock in current margin before potential ethane substitution pressure reduces crack spreads in Q3.\n\n**Cost:** Zero-premium swap | **Coverage:** Full crack spread lock | **Risk:** Upside foregone if cracks widen further\n\nâš¡ *AI Confidence: Medium â€” monitor ethane/naphtha arb closely; swap only 50% of position*',
  };
  var recText = recs[pos] || recs.brent;

  resultEl.innerHTML = '<div style="font-size:12.5px;color:#374151;line-height:1.7;white-space:pre-wrap">' + recText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>') + '</div>';

  // Flash banner
  var banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#0066CC;color:white;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;z-index:9999;animation:bannerIn .4s ease';
  banner.textContent = 'âœ“ AI Hedge Recommendation Ready';
  document.body.appendChild(banner);
  setTimeout(function(){ banner.style.animation='bannerOut .4s ease forwards'; setTimeout(function(){ banner.remove(); }, 400); }, 3000);
};

window.runPreMortem = async function() {
  var el = document.getElementById('premortem-results');
  if (!el) return;
  if (_aiCache.premortem) { el.innerHTML = _aiCache.premortem; return; }
  el.innerHTML = '<div style="font-size:12px;color:#6B7280">&#128200; Running scenario analysis on current book...</div>';
  await new Promise(function(r){ setTimeout(r, 1200); });
  var html = '<div style="font-size:12px;color:#374151;margin-top:8px">'
    + '<div style="font-weight:700;color:#DC2626;margin-bottom:6px">&#9888; 3 scenarios where this book loses >$5M:</div>'
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px;margin-bottom:7px"><strong>1. UAE reversal + demand shock</strong> â€” If UAE confirms OPEC stay AND China demand misses by 300kbpd, Brent retraces to $88. Loss: <strong style="color:#DC2626">-$8.1M</strong></div>'
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px;margin-bottom:7px"><strong>2. Ethane demand collapse</strong> â€” European cracker outage >30 days drops ethane to $290/MT. Dragon fleet demurrage compounds. Loss: <strong style="color:#DC2626">-$6.4M</strong></div>'
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px"><strong>3. Urals spread compression</strong> â€” Sanctions relief allows Urals back to -$8/bbl. 80kbbl unhedged short at risk. Loss: <strong style="color:#DC2626">-$5.8M</strong></div>'
    + '</div>';
  _aiCache.premortem = html;
  el.innerHTML = html;
};

/* â”€â”€ SCREEN: PERFORMANCE â”€â”€ */
SCREENS['performance'] = async function(main) {
  main.innerHTML = `<div class="screen performance-screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸŽ¯ Performance & Analytics</div><div class="screen-subtitle">YTD tracking Â· Budget comparison Â· Opportunity cost</div></div>
      <div class="screen-actions">
        <span class="performance-live-pill"><span></span> P&L book reconciled</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPerformance()">âŸ³ Refresh</button>
      </div>
    </div>
    <div class="performance-kpi-row">
      <div class="performance-kpi-card primary"><div class="kpi-label">YTD P&L</div><div class="kpi-value positive">+$18.4M</div><div class="performance-kpi-note">+$2.2M vs May run rate</div></div>
      <div class="performance-kpi-card target"><div class="kpi-label">vs Target</div><div class="kpi-value accent">82%</div><div class="performance-kpi-note">-$4.1M shortfall to plan</div></div>
      <div class="performance-kpi-card success"><div class="kpi-label">vs Last Year</div><div class="kpi-value positive">+12%</div><div class="performance-kpi-note">Physical desk leading</div></div>
      <div class="performance-kpi-card forecast"><div class="kpi-label">Run Rate Forecast</div><div class="kpi-value">$31.5M</div><div class="performance-kpi-note">Base case to December</div></div>
    </div>
    <div class="performance-chart-grid">
      <div class="chart-card performance-chart-card">
        <div class="chart-title">Monthly P&L vs Budget <span class="chart-chip positive">Actual + Forecast</span></div>
        <div class="performance-chart-wrap"><canvas id="monthly-chart"></canvas></div>
        <div class="performance-chart-insight">
          <strong>Q2 acceleration:</strong> April and May outperformed budget, while June MTD remains the main gap to close.
        </div>
      </div>
      <div class="chart-card performance-chart-card">
        <div class="chart-title">P&L Waterfall Attribution <span class="chart-chip warning">Bridge to target</span></div>
        <div class="performance-chart-wrap"><canvas id="waterfall-chart"></canvas></div>
        <div class="performance-chart-insight">
          <strong>Largest drag:</strong> missed opportunities and timing leakage explain most of the target shortfall.
        </div>
      </div>
    </div>
    <!-- Book Summary Widget -->
    <div class="chart-card" style="margin-bottom:16px">
      <div class="chart-title">ðŸ“š Book Summary <span style="font-size:11px;font-weight:400;color:#9CA3AF">YTD performance by trading book</span></div>
      <div id="book-summary-table"></div>
    </div>

    <div class="performance-lower-grid">
      <div class="chart-card performance-strategy-card">
        <div class="chart-title">Performance by Strategy</div>
        <div class="table-container">
          <table class="trading-table">
            <thead><tr><th>Strategy</th><th class="right">Win Rate</th><th class="right">Avg P&L</th><th class="right">Total P&L</th><th class="right">Trades</th></tr></thead>
            <tbody>
              ${[['Arb (Brent/Urals)','72%','+$120K','+$4.8M',40],['Spread Trading','65%','+$85K','+$3.2M',38],
                ['Directional','58%','+$62K','+$2.6M',42],['Basis / Physical','71%','+$210K','+$5.9M',28],
                ['Carbon / EUA','54%','+$44K','+$1.9M',43]].map(([s,w,a,t,n])=>`
                <tr><td class="semibold">${s}</td><td class="right bold">${w}</td><td class="right positive">${a}</td><td class="right positive">${t}</td><td class="right">${n}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px;width:100%" onclick="navigateTo('decision-intelligence')">ðŸ“Š View Full 90-Day Opportunity Audit â†’</button>
      </div>
      <div class="chart-card performance-shortfall-card">
        <div class="chart-title">ðŸ”¬ AI Shortfall Investigation</div>
        <div class="shortfall-mini-grid">
          <div><span>Missed signals</span><strong>$1.07M</strong></div>
          <div><span>Execution lag</span><strong>$255K</strong></div>
          <div><span>Risk overrides</span><strong>$346K</strong></div>
        </div>
        <button class="btn btn-primary w-full mb-8" onclick="investigateShortfall()">ðŸ”¬ Investigate Target Shortfall</button>
        <div id="shortfall-result" style="min-height:120px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:14px;font-size:13px;color:#6B7280">
          Click above to run AI forensic analysis on the shortfall vs target...
        </div>
      </div>
    </div>
  </div>`;
  renderMonthlyChart();
  renderWaterfallChart();
  renderBookSummary();
};

function renderBookSummary() {
  const el = document.getElementById('book-summary-table');
  if (!el) return;

  const demoBooks = [
    { name: 'Ethane Americas', commodity: 'Ethane', ytd_pnl: 8200000, target: 12000000 },
    { name: 'LPG Europe', commodity: 'Propane', ytd_pnl: 5100000, target: 8000000 },
    { name: 'Naphtha Asia', commodity: 'Naphtha', ytd_pnl: 3400000, target: 6000000 },
    { name: 'Natural Gas UK', commodity: 'Natural Gas', ytd_pnl: -200000, target: 5000000 },
    { name: 'LNG Global', commodity: 'LNG', ytd_pnl: 11000000, target: 5000000 },
  ];

  // Try to load from API, fall back to demo data
  apiCall('/performance/summary').then(data => {
    const books = (data && Array.isArray(data.books)) ? data.books : demoBooks;
    el.innerHTML = renderBookSummaryTable(books);
  }).catch(() => {
    el.innerHTML = renderBookSummaryTable(demoBooks);
  });

  // Show demo immediately while loading
  el.innerHTML = renderBookSummaryTable(demoBooks);
}

function renderBookSummaryTable(books) {
  const rows = books.map(b => {
    const pct = b.target > 0 ? Math.round((b.ytd_pnl / b.target) * 100) : 0;
    const pos = b.ytd_pnl >= 0;
    const overTarget = pct >= 100;
    const status = overTarget ? 'Above Target' : (pct >= 75 ? 'On Track' : (pct >= 50 ? 'Below Plan' : 'At Risk'));
    const statusColor = overTarget ? '#16A34A' : (pct >= 75 ? '#2563EB' : (pct >= 50 ? '#D97706' : '#DC2626'));
    const statusBg = overTarget ? '#F0FDF4' : (pct >= 75 ? '#EFF6FF' : (pct >= 50 ? '#FFF7ED' : '#FEF2F2'));
    const pnlStr = (pos ? '+$' : '-$') + (Math.abs(b.ytd_pnl) / 1e6).toFixed(2) + 'M';
    const targetStr = '$' + (b.target / 1e6).toFixed(1) + 'M';
    return `<tr>
      <td style="font-weight:700;color:#111827">${b.name}</td>
      <td style="color:#6B7280">${b.commodity}</td>
      <td style="font-family:monospace;font-weight:700;color:${pos?'#16A34A':'#DC2626'}">${pnlStr}</td>
      <td style="font-family:monospace;color:#374151">${targetStr}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#F1F5F9;border-radius:3px;height:6px;min-width:60px"><div style="background:${statusColor};height:100%;width:${Math.min(pct,100)}%;border-radius:3px"></div></div>
          <span style="font-size:12px;font-weight:700;color:${statusColor};min-width:36px">${pct}%</span>
        </div>
      </td>
      <td><span style="background:${statusBg};color:${statusColor};font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px">${status}</span></td>
    </tr>`;
  }).join('');
  return `<table class="trading-table" style="width:100%">
    <thead><tr>
      <th>Book Name</th><th>Commodity</th><th class="right">YTD P&L</th><th class="right">Target</th><th>% of Target</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const PERFORMANCE_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PERFORMANCE_ACTUALS = [2.4, 1.8, 2.7, 3.5, 4.2, 3.8, null, null, null, null, null, null];
const PERFORMANCE_BUDGET = [2.1, 2.2, 2.4, 2.7, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8];
const PERFORMANCE_FORECAST = [null, null, null, null, null, 3.8, 3.9, 4.1, 4.3, 4.5, 4.7, 4.9];

function getChartGradient(ctx, area, top, bottom) {
  const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  return gradient;
}

function renderMonthlyFallback(canvas) {
  const wrap = canvas.closest('.performance-chart-wrap');
  if (!wrap) return;
  const max = Math.max(...PERFORMANCE_BUDGET, ...PERFORMANCE_ACTUALS.filter(Boolean), ...PERFORMANCE_FORECAST.filter(Boolean));
  const width = 760;
  const height = 230;
  const left = 42;
  const bottom = 34;
  const top = 18;
  const plotH = height - top - bottom;
  const gap = (width - left - 16) / PERFORMANCE_MONTHS.length;
  const bars = PERFORMANCE_MONTHS.map((m, i) => {
    const actual = PERFORMANCE_ACTUALS[i];
    const forecast = PERFORMANCE_FORECAST[i];
    const budget = PERFORMANCE_BUDGET[i];
    const value = actual ?? forecast ?? 0;
    const barH = value / max * plotH;
    const x = left + i * gap + gap * .23;
    const y = top + plotH - barH;
    const fill = actual === null ? '#38BDF8' : '#16A34A';
    const budgetY = top + plotH - (budget / max * plotH);
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(gap*.46).toFixed(1)}" height="${barH.toFixed(1)}" rx="7" fill="${fill}"/>
      <line x1="${(x-2).toFixed(1)}" y1="${budgetY.toFixed(1)}" x2="${(x+gap*.46+2).toFixed(1)}" y2="${budgetY.toFixed(1)}" stroke="#D97706" stroke-width="3" stroke-linecap="round"/>
      <text x="${(left + i * gap + gap*.46).toFixed(1)}" y="${height-10}" text-anchor="middle" font-size="12" fill="#64748B">${m}</text>
    </g>`;
  }).join('');
  wrap.innerHTML = `<div class="performance-svg-chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly P&L versus budget">
      <defs>
        <linearGradient id="actualPnL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22C55E"/><stop offset="1" stop-color="#0F766E"/></linearGradient>
      </defs>
      <line x1="${left}" y1="${top + plotH}" x2="${width-10}" y2="${top + plotH}" stroke="#E5E7EB"/>
      <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="#E5E7EB"/>
      ${bars}
    </svg>
    <div class="performance-legend">
      <span><i style="background:#16A34A"></i>Actual</span>
      <span><i style="background:#38BDF8"></i>Forecast</span>
      <span><i style="background:#D97706"></i>Budget marker</span>
    </div>
  </div>`;
}

function renderWaterfallFallback(canvas) {
  const wrap = canvas.closest('.performance-chart-wrap');
  if (!wrap) return;
  const items = [
    {label:'Target', value:22.5, color:'#2563EB', base:0},
    {label:'Captured', value:18.4, color:'#16A34A', base:0},
    {label:'Missed Opps', value:1.07, color:'#DC2626', base:18.4},
    {label:'Timing', value:.26, color:'#F97316', base:19.47},
    {label:'Risk', value:.35, color:'#9333EA', base:19.73},
    {label:'Sizing', value:.15, color:'#EAB308', base:20.08},
    {label:'Actual', value:18.4, color:'#0F766E', base:0}
  ];
  const max = 24;
  const width = 760;
  const height = 230;
  const left = 42;
  const bottom = 36;
  const top = 18;
  const plotH = height - top - bottom;
  const gap = (width - left - 16) / items.length;
  const bars = items.map((item, i) => {
    const totalTop = item.base + item.value;
    const y = top + plotH - (totalTop / max * plotH);
    const h = item.value / max * plotH;
    const x = left + i * gap + gap * .22;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(gap*.48).toFixed(1)}" height="${Math.max(h, 4).toFixed(1)}" rx="7" fill="${item.color}" opacity=".9"/>
      <text x="${(left + i * gap + gap*.46).toFixed(1)}" y="${height-10}" text-anchor="middle" font-size="11" fill="#64748B">${item.label}</text>
    </g>`;
  }).join('');
  wrap.innerHTML = `<div class="performance-svg-chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="P&L waterfall attribution">
      <line x1="${left}" y1="${top + plotH}" x2="${width-10}" y2="${top + plotH}" stroke="#E5E7EB"/>
      <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="#E5E7EB"/>
      ${bars}
    </svg>
    <div class="performance-legend">
      <span><i style="background:#2563EB"></i>Target</span>
      <span><i style="background:#16A34A"></i>Captured</span>
      <span><i style="background:#DC2626"></i>Leakage</span>
      <span><i style="background:#0F766E"></i>Actual</span>
    </div>
  </div>`;
}

function renderMonthlyChart() {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') { renderMonthlyFallback(canvas); return; }
  const existing = Chart.getChart ? Chart.getChart(canvas) : canvas._chart;
  if (existing) existing.destroy();
  const ctx = canvas.getContext('2d');

  canvas._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: PERFORMANCE_MONTHS,
      datasets: [
        {
          type: 'bar',
          label: 'Actual P&L',
          data: PERFORMANCE_ACTUALS,
          borderRadius: 7,
          borderSkipped: false,
          backgroundColor: context => {
            const {chart} = context;
            const {ctx, chartArea} = chart;
            if (!chartArea) return '#16A34A';
            return getChartGradient(ctx, chartArea, '#22C55E', '#0F766E');
          },
          maxBarThickness: 28
        },
        {
          type: 'bar',
          label: 'Forecast',
          data: PERFORMANCE_FORECAST,
          borderRadius: 7,
          borderSkipped: false,
          backgroundColor: context => {
            const {chart} = context;
            const {ctx, chartArea} = chart;
            if (!chartArea) return '#38BDF8';
            return getChartGradient(ctx, chartArea, '#38BDF8', '#2563EB');
          },
          maxBarThickness: 28
        },
        {
          type: 'line',
          label: 'Budget',
          data: PERFORMANCE_BUDGET,
          borderColor: '#D97706',
          backgroundColor: '#D97706',
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: .35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(1) || '0.0'}M`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: value => `$${value}M` },
          grid: { color: '#EEF2F7' }
        }
      }
    }
  });
}

function renderWaterfallChart() {
  const canvas = document.getElementById('waterfall-chart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') { renderWaterfallFallback(canvas); return; }
  const existing = Chart.getChart ? Chart.getChart(canvas) : canvas._chart;
  if (existing) existing.destroy();

  const labels = ['Target', 'Captured', 'Missed Opps', 'Timing', 'Risk Overrides', 'Sizing', 'Actual'];
  const floating = [
    [0, 22.5],
    [0, 18.4],
    [18.4, 19.47],
    [19.47, 19.73],
    [19.73, 20.08],
    [20.08, 20.23],
    [0, 18.4]
  ];
  const colors = ['#2563EB', '#16A34A', '#DC2626', '#F97316', '#9333EA', '#EAB308', '#0F766E'];

  canvas._chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'P&L bridge',
        data: floating,
        backgroundColor: colors.map(c => c + 'D9'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 34
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              const delta = Array.isArray(v) ? Math.abs(v[1] - v[0]) : v;
              return `${ctx.label}: $${delta.toFixed(2)}M`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          suggestedMax: 24,
          ticks: { callback: value => `$${value}M` },
          grid: { color: '#EEF2F7' }
        }
      }
    }
  });
}

function loadPerformance() {
  renderMonthlyChart();
  renderWaterfallChart();
  showToast('Performance refreshed', 'P&L charts recalculated from the latest book snapshot.', 'success');
}

async function investigateShortfall() {
  const el = document.getElementById('shortfall-result');
  if (!el) return;
  el.innerHTML = '<div class="muted small">Running AI forensic analysis...</div>';
  await streamToElement(el, '/performance/forensics', {screen_context:'performance', provider:'claude'});
}

window.renderMonthlyChart = renderMonthlyChart;
window.renderWaterfallChart = renderWaterfallChart;
window.loadPerformance = loadPerformance;
window.investigateShortfall = investigateShortfall;

/* â”€â”€ SCREEN: MARKET DATA â”€â”€ */
SCREENS['market'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸ“‰ Market Data & Curves</div><div class="screen-subtitle">Cached snapshot first Â· live refresh in background Â· forward curves Â· spread analysis</div></div>
      <div class="screen-actions">
        <div style="text-align:right">
          <div id="market-refresh-status" class="muted small" style="margin-bottom:6px">Loading cached market snapshot...</div>
          <button class="btn btn-secondary btn-sm" onclick="window.loadMarketData && window.loadMarketData({ forceRefresh: true })">âŸ³ Refresh Prices</button>
        </div>
      </div>
    </div>
    <div class="grid-2" style="gap:16px">
      <div>
        <div class="chart-card" style="margin-bottom:14px">
          <div class="chart-title">Live Prices</div>
          <div id="market-refresh-note" class="muted small" style="margin-bottom:10px">Checking cache health...</div>
          <div id="live-prices-table"><div class="muted small">Loading...</div></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">ðŸ“Š Key Spreads</div>
          <div id="spread-table"><div class="muted small">Calculating...</div></div>
        </div>
        <div class="chart-card" style="margin-top:14px">
          <div class="chart-title">ðŸ”§ Curve Shifter</div>
          <label class="form-label">Shift instruction</label>
          <input type="text" id="curve-shift-input" placeholder="e.g. Shift Brent prompt up $3..."
            style="border:1px solid #E5E7EB;border-radius:7px;padding:9px 12px;font-size:13px;width:100%;margin-bottom:8px"
            onkeydown="if(event.key==='Enter' && window.applyCurveShift){ window.applyCurveShift() }">
          <button class="btn btn-primary w-full" onclick="window.applyCurveShift && window.applyCurveShift()">Apply Shift & Recalculate</button>
          <div id="curve-shift-result" style="margin-top:10px;font-size:13px;color:#374151"></div>
        </div>
      </div>
      <div>
        <div class="chart-card" style="margin-bottom:14px">
          <div class="chart-title">Forward Curve
            <div class="curve-selector">
              <button class="curve-btn active" onclick="window.switchMarketCurve && window.switchMarketCurve('brent',this)">Brent</button>
              <button class="curve-btn" onclick="window.switchMarketCurve && window.switchMarketCurve('wti',this)">WTI</button>
              <button class="curve-btn" onclick="window.switchMarketCurve && window.switchMarketCurve('ethane',this)">Ethane</button>
              <button class="curve-btn" onclick="window.switchMarketCurve && window.switchMarketCurve('naphtha',this)">Naphtha</button>
              <button class="curve-btn" onclick="window.switchMarketCurve && window.switchMarketCurve('eua',this)">EUA</button>
            </div>
          </div>
          <div style="height:220px"><canvas id="market-curve-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">ðŸ“° Market Headlines</div>
          <div id="market-news-list"><div class="muted small">Loading...</div></div>
        </div>
      </div>
    </div>
  </div>`;
  loadMarketData();
  renderMarketCurveChart('brent');
  loadMarketNews();
};

/* â”€â”€ SCREEN: DECISION INTELLIGENCE â”€â”€ */
SCREENS['decision-intelligence'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">ðŸ§  Decision Intelligence</div><div class="screen-subtitle">The three moments that change how traders work</div></div>
    </div>
    <div class="di-section" style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px;font-weight:900;color:#E5E7EB">01</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#111827">Missing Trade Investigation</div>
            <div style="font-size:13px;color:#6B7280">Why did we miss our target? AI forensics on the full quarter.</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="runForensics()">ðŸ”¬ Investigate Q1 Performance</button>
      </div>
      <div id="forensics-results" style="display:none">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
          <div class="kpi-card"><div class="kpi-label">Total Shortfall</div><div class="kpi-value negative">âˆ’$1.82M</div></div>
          <div class="kpi-card"><div class="kpi-label">Missed Opps</div><div class="kpi-value negative">$1.07M</div></div>
          <div class="kpi-card"><div class="kpi-label">Delayed Exec</div><div class="kpi-value warning-text">$255K</div></div>
          <div class="kpi-card"><div class="kpi-label">Losing Trades</div><div class="kpi-value negative">$346K</div></div>
        </div>
        <div id="forensics-narrative" class="streaming-box"></div>
      </div>
    </div>
    <div style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <span style="font-size:28px;font-weight:900;color:#E5E7EB">02</span>
        <div>
          <div style="font-size:16px;font-weight:700;color:#111827">Desk Brainâ„¢ â€” Institutional Memory</div>
          <div style="font-size:13px;color:#6B7280">Every trade the desk has ever done. Every outcome. Every failure mode. Queryable in seconds.</div>
        </div>
        <div style="margin-left:auto;background:#F0F7FF;border:1px solid #BFDBFE;border-radius:8px;padding:6px 14px;font-size:11px;color:#1e40af;font-weight:700">847 trades indexed Â· Jan 2022 â€“ Jun 2026</div>
      </div>

      <!-- Query bar -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="text" id="desk-brain-query"
          value="Brent/Urals spread arb â€” long Urals, short Brent, Med delivery"
          style="flex:1;border:2px solid #BFDBFE;border-radius:8px;padding:10px 14px;font-size:13px;background:#F0F7FF;color:#1e40af;font-weight:600"
          onkeydown="if(event.key==='Enter') runDeskBrain()">
        <button class="btn btn-primary" onclick="runDeskBrain()" style="white-space:nowrap">&#129504; Search Memory</button>
      </div>

      <!-- Pre-loaded results -->
      <div id="desk-brain-results">
        <!-- Summary bar -->
        <div style="background:linear-gradient(135deg,#1e40af,#2563EB);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
          <div style="color:white">
            <div style="font-size:18px;font-weight:800">17 similar structures found</div>
            <div style="font-size:12px;opacity:.8;margin-top:2px">Brent/Urals spread trades Â· Jan 2022 â€“ Jun 2026 Â· Med &amp; NWE delivery</div>
          </div>
          <div style="display:flex;gap:20px">
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">+$2.8M</div><div style="font-size:10px;opacity:.75">Avg P&amp;L</div></div>
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">82%</div><div style="font-size:10px;opacity:.75">Win rate</div></div>
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">8.4d</div><div style="font-size:10px;opacity:.75">Avg hold</div></div>
          </div>
        <!-- P&L Distribution (truncated â€” full chart requires trade data API) -->
        <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">&#128202; P&amp;L Distribution</div>
          <div style="color:#6B7280;font-size:13px">Load trade history to view P&amp;L distribution chart.</div>
        </div>
      </div>
    </div>
  </div>`;
};

window.runForensics = async function() {
  const results = document.getElementById('forensics-results');
  const narrative = document.getElementById('forensics-narrative');
  if (!results || !narrative) return;
  results.style.display = 'block';
  narrative.textContent = '';
  await streamToElement(
    narrative,
    '/chat/message',
    {
      message: 'Run a decision-intelligence forensic review of the most important missed opportunities and shortfall drivers.',
      screen_context: 'decision-intelligence',
      provider: 'claude',
    }
  );
};

window.runDeskBrain = async function() {
  const input = document.getElementById('desk-brain-query');
  const container = document.getElementById('desk-brain-results');
  if (!container) return;
  const query = (input?.value || '').trim() || 'Brent/Urals spread arb';
  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#1e40af,#2563EB);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white">
        <div style="font-size:18px;font-weight:800">Desk Brain search running</div>
        <div style="font-size:12px;opacity:.8;margin-top:2px">${query}</div>
      </div>
      <div class="loading-spinner" style="border-color:rgba(255,255,255,.4);border-top-color:white"></div>
    </div>
    <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px;color:#6B7280;font-size:13px">
      Searching institutional memory, pattern-matching historical structures, and preparing the analyst note...
    </div>
  `;
  await new Promise(resolve => setTimeout(resolve, 900));
  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#1e40af,#2563EB);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <div style="color:white">
        <div style="font-size:18px;font-weight:800">Desk Brain results ready</div>
        <div style="font-size:12px;opacity:.8;margin-top:2px">${query}</div>
      </div>
      <div style="display:flex;gap:20px">
        <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">17</div><div style="font-size:10px;opacity:.75">Similar setups</div></div>
        <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">82%</div><div style="font-size:10px;opacity:.75">Win rate</div></div>
        <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">+$2.8M</div><div style="font-size:10px;opacity:.75">Avg P&amp;L</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px">Pattern summary</div>
        <div style="font-size:13px;color:#374151;line-height:1.6">
          Historical Brent/Urals spread trades performed best when the initial spread dislocation was driven by logistics or sanctions noise
          rather than structural demand weakness. Most winners were paired with freight awareness and a defined exit window inside two weeks.
        </div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px">What the desk usually does well</div>
        <div style="font-size:13px;color:#374151;line-height:1.6">
          Winning structures were sized progressively, hedged with Brent overlays, and exited once the spread normalized to the 60-day mean.
          Underperforming examples stayed open too long after the catalyst faded.
        </div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px">Failure modes</div>
        <div style="font-size:13px;color:#374151;line-height:1.6">
          Misses were usually caused by late entry after the first leg had already moved, insufficient freight protection, or conflicting inventory constraints.
        </div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
        <div style="font-size:12px;font-weight:700;color:#111827;margin-bottom:8px">Recommended next step</div>
        <div style="font-size:13px;color:#374151;line-height:1.6">
          Use this screen to compare the current spread setup with prior trades, then jump to Positions &amp; Risk for hedge sizing or Market Data &amp; Curves for scenario testing.
        </div>
      </div>
    </div>
  `;
};

SCREENS['configuration'] = async function(main) {
  main.innerHTML = `
    <div class="screen" style="padding:16px">
      <div class="screen-header" style="margin-bottom:16px">
        <div>
          <div class="screen-title">âš™ï¸ External Systems Configuration</div>
          <div class="screen-subtitle">Configure news feeds, market data sources, AI models, and ETRM connections</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:4px;border-bottom:1px solid #2d3748;margin-bottom:20px">
        ${['news','market','ai','etrm'].map((t,i) => `
          <button id="cfg-tab-${t}" onclick="switchCfgTab('${t}')"
            style="padding:8px 18px;border:none;border-bottom:2px solid ${i===0?'#6366f1':'transparent'};
            background:none;color:${i===0?'#6366f1':'#64748b'};font-size:13px;font-weight:600;cursor:pointer">
            ${{news:'ðŸ“° News Feeds',market:'ðŸ“Š Market Watch',ai:'ðŸ¤– AI Models',etrm:'ðŸ­ ETRM'}[t]}
          </button>`).join('')}
      </div>

      <!-- News Feeds tab -->
      <div id="cfg-panel-news" class="cfg-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font-size:14px;font-weight:700;color:#f1f5f9">News Feed Sources</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              Add any RSS feed or news API. Radiant AI ingests all sources every 15 min and uses them for decision analysis with citations.
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAddFeedModal('news')">+ Add News Feed</button>
        </div>
        <div id="grid-news" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
          <div style="color:#6366f1;font-size:13px">Loading...</div>
        </div>
      </div>

      <!-- Market Watch tab -->
      <div id="cfg-panel-market" class="cfg-panel" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font-size:14px;font-weight:700;color:#f1f5f9">Market Data Sources</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              Price feeds used in the Market Watch panel and AI decision analysis. Free sources (Yahoo Finance) work out of the box.
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAddFeedModal('market_data')">+ Add Price Feed</button>
        </div>
        <div id="grid-market" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
          <div style="color:#6366f1;font-size:13px">Loading...</div>
        </div>
      </div>

      <!-- AI Models tab -->
      <div id="cfg-panel-ai" class="cfg-panel" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font-size:14px;font-weight:700;color:#f1f5f9">AI Model Connections</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              Configure both External LLMs like Claude and local endpoints like LM Studio or Ollama, then test each connection here.
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAddFeedModal('ai_model')">+ Add AI Model</button>
        </div>
        <div id="grid-ai" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
          <div style="color:#6366f1;font-size:13px">Loading...</div>
        </div>
      </div>

      <!-- ETRM tab -->
      <div id="cfg-panel-etrm" class="cfg-panel" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font-size:14px;font-weight:700;color:#f1f5f9">ETRM & Trading Systems</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">
              Connect RightAngle, Endur, SAP or any ETRM via REST API to sync live positions and trades.
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAddFeedModal('etrm')">+ Add ETRM</button>
        </div>
        <div id="grid-etrm" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
          <div style="color:#6366f1;font-size:13px">Loading...</div>
        </div>
      </div>

      <!-- Add feed modal -->
      <div id="add-feed-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:none;align-items:center;justify-content:center">
        <div style="background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;width:100%;max-width:480px;padding:24px">
          <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:16px" id="add-feed-title">Add Feed</div>
          <div style="display:grid;gap:12px">
            <div>
              <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Name</label>
              <input id="af-name" class="form-input" style="width:100%" placeholder="e.g. Reuters Energy RSS">
            </div>
            <div id="af-provider-row">
              <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Provider</label>
              <select id="af-provider" class="form-select" style="width:100%"></select>
            </div>
            <div>
              <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Feed URL / Host</label>
              <input id="af-url" class="form-input" style="width:100%" placeholder="https://...">
            </div>
            <div id="af-key-row">
              <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">API Key (if required)</label>
              <input id="af-key" type="password" class="form-input" style="width:100%" placeholder="Leave blank for free/RSS feeds">
            </div>
            <div id="af-hint" style="font-size:11px;color:#f59e0b;padding:8px;background:#f59e0b10;border-radius:6px;display:none"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-primary btn-sm" onclick="saveNewFeed()">Save & Test</button>
            <button class="btn btn-ghost btn-sm" onclick="closeAddFeedModal()">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;

  window._cfgActiveTab = 'news';
  loadAllConnectors();
};

window.switchCfgTab = function(tab) {
  ['news','market','ai','etrm'].forEach(t => {
    document.getElementById('cfg-panel-' + t).style.display = t === tab ? 'block' : 'none';
    var btn = document.getElementById('cfg-tab-' + t);
    btn.style.borderBottomColor = t === tab ? '#6366f1' : 'transparent';
    btn.style.color = t === tab ? '#6366f1' : '#64748b';
  });
  window._cfgActiveTab = tab;
};

window._addFeedType = 'news';
window.openAddFeedModal = function(type) {
  window._addFeedType = type;
  var providerOpts = {
    news: ['RSS Feed','NewsAPI','MarketWatch RSS','Reuters RSS','Bloomberg RSS','OilPrice RSS','Custom'],
    market_data: ['Yahoo Finance (free)','AlphaVantage','Bloomberg B-PIPE','Platts/Argus','ICE','Custom'],
    ai_model: ['Claude API (External)','LM Studio','Ollama','Custom OpenAI-compatible'],
    etrm: ['RightAngle','Endur/Allegro','SAP','Custom']
  };
  var hints = {
    'NewsAPI': 'Free key at newsapi.org/register Â· 100 req/day free',
    'AlphaVantage': 'Free key at alphavantage.co/support/#api-key Â· 500 req/day',
    'Yahoo Finance (free)': 'No API key needed â€” works out of the box',
    'RSS Feed': 'Paste any RSS/Atom feed URL â€” no key required',
    'MarketWatch RSS': 'URL: https://feeds.marketwatch.com/marketwatch/topstories',
    'Reuters RSS': 'URL: https://www.reutersagency.com/feed/?best-topics=energy',
    'OilPrice RSS': 'URL: https://oilprice.com/rss/main',
    'Claude API (External)': 'Uses your saved connector key or ANTHROPIC_API_KEY from .env',
    'LM Studio': 'URL: http://127.0.0.1:1234/v1 â€” no key needed',
  };
  var titleMap = {news:'Add News Feed', market_data:'Add Market Data Source', ai_model:'Add AI Model', etrm:'Add ETRM Connection'};
  document.getElementById('add-feed-title').textContent = titleMap[type] || 'Add Feed';
  var sel = document.getElementById('af-provider');
  sel.innerHTML = (providerOpts[type]||['Custom']).map(o => '<option>' + o + '</option>').join('');
  sel.onchange = function() {
    var hint = hints[sel.value] || '';
    var hintEl = document.getElementById('af-hint');
    hintEl.style.display = hint ? 'block' : 'none';
    hintEl.textContent = 'ðŸ’¡ ' + hint;
    // Auto-fill URL for well-known providers
    var autoUrls = {
      'MarketWatch RSS': 'https://feeds.marketwatch.com/marketwatch/topstories',
      'Reuters RSS': 'https://www.reutersagency.com/feed/?best-topics=energy',
      'OilPrice RSS': 'https://oilprice.com/rss/main',
      'Claude API (External)': 'https://api.anthropic.com',
      'LM Studio': 'http://127.0.0.1:1234/v1',
      'NewsAPI': 'https://newsapi.org/v2/everything',
      'AlphaVantage': 'https://www.alphavantage.co/query',
    };
    if (autoUrls[sel.value]) document.getElementById('af-url').value = autoUrls[sel.value];
  };
  sel.dispatchEvent(new Event('change'));
  var modal = document.getElementById('add-feed-modal');
  modal.style.display = 'flex';
};

window.closeAddFeedModal = function() {
  document.getElementById('add-feed-modal').style.display = 'none';
  document.getElementById('af-name').value = '';
  document.getElementById('af-url').value = '';
  document.getElementById('af-key').value = '';
};

window.saveNewFeed = async function() {
  var token = readAppToken();
  var provider = document.getElementById('af-provider').value;
  // Normalize provider for backend matching
  var providerMap = {
    'RSS Feed': 'rss', 'MarketWatch RSS': 'MarketWatch', 'Reuters RSS': 'Reuters',
    'OilPrice RSS': 'OilPrice', 'Bloomberg RSS': 'Bloomberg',
    'NewsAPI': 'NewsAPI', 'AlphaVantage': 'AlphaVantage',
    'Yahoo Finance (free)': 'Yahoo', 'Claude API (External)': 'Anthropic', 'LM Studio': 'LMStudio',
    'Ollama': 'Ollama', 'Custom OpenAI-compatible': 'Custom',
    'RightAngle': 'RightAngle', 'Endur/Allegro': 'Endur',
  };
  var typeMap = {news:'news', market_data:'market_data', ai_model:'ai_model', etrm:'etrm'};
  var payload = {
    name: document.getElementById('af-name').value || provider,
    connector_type: window._addFeedType,
    provider: providerMap[provider] || provider,
    host_url: document.getElementById('af-url').value,
    api_key: document.getElementById('af-key').value || null,
  };
  try {
    var r = await fetch('/api/configuration/connectors', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text());
    closeAddFeedModal();
    loadAllConnectors();
  } catch(e) { alert('Error: ' + e.message); }
};

function _statusStyle(status) {
  const s = (status || '').toLowerCase();
  if (s === 'ok' || s.startsWith('ok â€”')) return {dot:'#16a34a',text:'#16a34a',bg:'#16a34a18'};
  if (s.includes('api key') || s.includes('key required')) return {dot:'#f59e0b',text:'#f59e0b',bg:'#f59e0b18'};
  if (s.includes('enterprise') || s.includes('internal')) return {dot:'#6366f1',text:'#6366f1',bg:'#6366f118'};
  if (s.includes('error') || s.includes('invalid') || s.includes('denied') || s.includes('âœ—')) return {dot:'#ef4444',text:'#ef4444',bg:'#ef444418'};
  if (s.includes('timeout') || s.includes('unreachable')) return {dot:'#f97316',text:'#f97316',bg:'#f9731618'};
  if (s === 'not tested') return {dot:'#475569',text:'#64748b',bg:'#47556918'};
  return {dot:'#64748b',text:'#94a3b8',bg:'#64748b18'};
}

function _renderConnectorCard(c) {
  var st = _statusStyle(c.last_status);
  var typeColors = {etrm:'#6366f1', market_data:'#0ea5e9', news:'#f59e0b', ai_model:'#10b981'};
  var bg = typeColors[c.connector_type] || '#6b7280';
  var initials = (c.provider||'??').substring(0,2).toUpperCase();
  var lastTested = c.last_connected_at
    ? ' Â· tested ' + new Date(c.last_connected_at).toLocaleTimeString() : '';
  // Article count hint for news
  var extraInfo = '';
  var statusLabel = c.last_status || 'Not Tested';
  if ((c.provider || '').toLowerCase() === 'anthropic') {
    extraInfo += '<div style="font-size:11px;color:#94a3b8;margin-top:4px">Uses saved connector key or falls back to ANTHROPIC_API_KEY from .env.</div>';
  }
  if (statusLabel.startsWith('OK â€”')) { extraInfo = '<div style="font-size:11px;color:#16a34a;margin-top:4px">' + statusLabel.replace('OK â€” ','âœ“ ') + '</div>'; statusLabel = 'OK'; }

  // Show API key input for providers that need it
  var keyRow = '';
  if (['newsapi','alphavantage','bloomberg','anthropic','claude','custom'].includes((c.provider||'').toLowerCase())) {
    keyRow = '<div style="display:flex;gap:6px;margin-top:8px">'
      + '<input id="key-' + c.id + '" type="password" class="form-input" style="flex:1;font-size:12px;padding:4px 8px" placeholder="' + (c.api_key ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢ (saved)' : 'Enter API key') + '">'
      + '<button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="saveFeedKey(' + c.id + ')">Save Key</button>'
      + '</div>';
  }
  return '<div id="conn-' + c.id + '" style="background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;padding:14px">'
    + '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">'
    + '<div style="width:36px;height:36px;border-radius:8px;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:12px;flex-shrink:0">' + initials + '</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-weight:600;color:#f1f5f9;font-size:13px">' + c.name + '</div>'
    + '<div style="font-size:11px;color:#475569;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (c.host_url || 'No URL') + '</div>'
    + '</div></div>'
    + '<div style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:20px;background:' + st.bg + '">'
    + '<span style="width:6px;height:6px;border-radius:50%;background:' + st.dot + ';display:inline-block"></span>'
    + '<span style="font-size:11px;font-weight:600;color:' + st.text + '">' + statusLabel + '</span>'
    + '<span style="font-size:10px;color:#475569">' + lastTested + '</span>'
    + '</div>'
    + extraInfo
    + (c.last_error ? '<div style="font-size:11px;color:#ef4444;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (c.last_error||'') + '">â†³ ' + (c.last_error||'').substring(0,70) + '</div>' : '')
    + keyRow
    + '<div style="display:flex;gap:6px;margin-top:10px">'
    + '<button class="btn btn-secondary btn-sm" id="test-' + c.id + '" style="font-size:12px" onclick="testFeed(' + c.id + ')">âš¡ Test</button>'
    + '<button class="btn btn-ghost btn-sm" style="font-size:12px;color:#ef4444;border-color:#ef444433" onclick="deleteFeed(' + c.id + ')">Remove</button>'
    + '</div></div>';
}

window.loadAllConnectors = async function() {
  var token = readAppToken();
  try {
    var r = await fetch('/api/configuration/connectors', {headers:{'Authorization':'Bearer '+token}});
    var data = await r.json();
    var all = data.connectors || [];
    var byType = {news:[], market_data:[], ai_model:[], etrm:[]};
    all.forEach(c => { if (byType[c.connector_type]) byType[c.connector_type].push(c); });
    ['news','market','ai','etrm'].forEach(tab => {
      var type = tab === 'market' ? 'market_data' : tab === 'ai' ? 'ai_model' : tab;
      var grid = document.getElementById('grid-' + tab);
      if (!grid) return;
      var connectors = byType[type] || [];
      if (!connectors.length) {
        var emptyMsg = {
          news: 'ðŸ“° No news feeds configured. Add Reuters, MarketWatch or any RSS URL.',
          market_data: 'ðŸ“Š No market data sources. Yahoo Finance works free â€” no key needed.',
          ai_model: 'ðŸ¤– No AI models configured. Add LM Studio at http://127.0.0.1:1234/v1',
          etrm: 'ðŸ­ No ETRM connected. Add RightAngle or any REST-capable ETRM.'
        };
        grid.innerHTML = '<div style="color:#64748b;font-size:13px;padding:20px;border:1px dashed #2d3748;border-radius:8px;grid-column:1/-1">' + (emptyMsg[type]||'No connectors') + '</div>';
      } else {
        grid.innerHTML = connectors.map(_renderConnectorCard).join('');
      }
    });
  } catch(e) {
    ['news','market','ai','etrm'].forEach(tab => {
      var g = document.getElementById('grid-' + tab);
      if (g) g.innerHTML = '<div style="color:#ef4444">Error: ' + e.message + '</div>';
    });
  }
};

window.saveFeedKey = async function(id) {
  var token = readAppToken();
  var keyEl = document.getElementById('key-' + id);
  if (!keyEl || !keyEl.value) return;
  var r = await fetch('/api/configuration/connectors/' + id, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify({api_key: keyEl.value})
  });
  if (r.ok) { keyEl.value=''; keyEl.placeholder='â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢ (saved)'; testFeed(id); }
  else alert('Save failed');
};

window.testFeed = async function(id) {
  var token = readAppToken();
  var btn = document.getElementById('test-' + id);
  if (btn) { btn.textContent='âŸ³'; btn.disabled=true; }
  try {
    var r = await fetch('/api/configuration/connectors/' + id + '/test', {
      method:'POST', headers:{'Authorization':'Bearer '+token}
    });
    var data = await r.json();
    if (!r.ok) throw new Error(data?.message || 'Connector test failed');
    loadAllConnectors();
    if (typeof showToast === 'function') {
      showToast('Connector Test', data?.message || data?.status || 'Test complete', (data?.status || '').toLowerCase() === 'ok' ? 'success' : 'info');
    }
  } catch(e) {
    if (btn) { btn.textContent='âš¡ Test'; btn.disabled=false; }
    alert('Test failed: ' + e.message);
  }
};

window.deleteFeed = async function(id) {
  if (!confirm('Remove this connector?')) return;
  var token = readAppToken();
  var r = await fetch('/api/configuration/connectors/' + id, {
    method:'DELETE', headers:{'Authorization':'Bearer '+token}
  });
  if (r.ok) loadAllConnectors();
  else alert('Delete failed');
};

/* AI STUDIO */
window.aiStudioState = {
  overview: null,
  selectedAgentId: null,
  draftAgent: null,
  testResult: null,
};

const AI_STUDIO_NEW_AGENT = {
  agent_key: 'new_agent_key',
  name: 'New Agent',
  description: '',
  category: 'general',
  purpose: '',
  instructions: '',
  system_prompt_template:
    'You are {agent_name} for Radiant-MVT.\nPurpose: {agent_purpose}\nInstructions: {agent_instructions}\n\nUser profile:\n{user_profile_summary}\n\nRuntime context:\n- Screen: {screen_context}\n- Selected entity: {selected_entity_summary}\n- Session memory: {session_memory}\n\nLive desk snapshot:\n{portfolio_snapshot}\n\nMarket snapshot:\n{market_snapshot}',
  user_prompt_template: 'User request:\n{user_message}',
  model_provider: 'claude',
  model_name: 'claude-sonnet-4-6',
  temperature: 0.2,
  max_tokens: 1400,
  provider_settings: {},
  allowed_tools: ['market_snapshot', 'position_snapshot'],
  allowed_screens: ['dashboard'],
  output_format: 'narrative',
  response_style: 'Concise professional response',
  is_active: 1,
  is_chat_default: 0,
};

function aiStudioCanManage() {
  return ['admin', 'executive', 'risk'].includes(window.currentRole());
}

function aiStudioSplitList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map(v => v.trim())
    .filter(Boolean);
}

function aiStudioJoinList(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function aiStudioCurrentAgent() {
  if (window.aiStudioState.draftAgent) return window.aiStudioState.draftAgent;
  const agents = window.aiStudioState.overview?.agents || [];
  return agents.find(agent => agent.id === window.aiStudioState.selectedAgentId) || agents[0] || null;
}

function aiStudioVersionMarkup(agentId) {
  const agent = (window.aiStudioState.overview?.agents || []).find(item => item.id === agentId);
  const versions = agent?._versions || [];
  if (!versions.length) {
    return '<div class="secondary small">No version history loaded yet.</div>';
  }
  return versions.map(version => `
    <div class="ai-studio-version-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="font-size:13px;font-weight:700;color:#111827">v${version.version_number}</div>
        <div style="font-size:11px;color:#64748b">${version.created_at ? new Date(version.created_at).toLocaleString() : 'recent'}</div>
      </div>
      <div style="font-size:12px;color:#374151;margin-top:6px">${version.change_summary || 'Configuration updated'}</div>
    </div>
  `).join('');
}

function renderAIStudioWorkspace() {
  const data = window.aiStudioState.overview;
  const agent = aiStudioCurrentAgent();
  const root = document.getElementById('ai-studio-root');
  if (!root || !data) return;

  const profile = data.profile || {};
  const agents = data.agents || [];
  const selectedId = agent?.id;
  const manage = aiStudioCanManage();
  const activeCount = agents.filter(item => item.is_active).length;
  const defaultAgent = agents.find(item => item.is_chat_default);

  root.innerHTML = `
    <div class="screen ai-studio-screen">
      <div class="screen-header">
        <div>
          <div class="screen-title">AI Studio</div>
          <div class="screen-subtitle">Enterprise agent control layer for prompts, runtime policy, model routing, and persistent analyst context.</div>
        </div>
        <div class="screen-actions">
          ${manage ? '<button class="btn btn-secondary btn-sm" onclick="createAIStudioAgent()">New Agent</button>' : ''}
          <button class="btn btn-primary btn-sm" onclick="loadAIStudioOverview(true)">Refresh</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px">
        <div class="card" style="padding:14px 16px">
          <div class="kpi-label">Agent Registry</div>
          <div class="kpi-value accent">${agents.length}</div>
          <div class="secondary small mt-4">${activeCount} active definitions</div>
        </div>
        <div class="card" style="padding:14px 16px">
          <div class="kpi-label">Default Copilot</div>
          <div style="font-size:18px;font-weight:700;color:#111827">${defaultAgent ? defaultAgent.name : 'Unassigned'}</div>
          <div class="secondary small mt-4">${defaultAgent ? defaultAgent.model_provider + ' / ' + defaultAgent.model_name : 'Set via agent editor'}</div>
        </div>
        <div class="card" style="padding:14px 16px">
          <div class="kpi-label">My Context</div>
          <div style="font-size:18px;font-weight:700;color:#111827">${profile.preferred_answer_style || 'Configured'}</div>
          <div class="secondary small mt-4">${(profile.commodities_covered || []).length} commodities tagged</div>
        </div>
        <div class="card" style="padding:14px 16px">
          <div class="kpi-label">Governance</div>
          <div style="font-size:18px;font-weight:700;color:#111827">${manage ? 'Editable' : 'View / Test'}</div>
          <div class="secondary small mt-4">${data.users?.length || 0} active users in scope</div>
        </div>
      </div>

      <div class="ai-studio-layout">
        <div class="card ai-studio-panel">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
            <div>
              <div class="card-title" style="margin-bottom:2px">Agent Registry</div>
              <div class="secondary small">Seeded operating agents plus custom definitions.</div>
            </div>
            <span class="badge badge-info">${agents.length}</span>
          </div>
          <div class="ai-studio-agent-list">
            ${agents.map(item => `
              <button class="ai-studio-agent-item ${item.id === selectedId ? 'active' : ''}" onclick="selectAIStudioAgent(${item.id})">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <strong>${item.name}</strong>
                  <span class="badge ${item.is_active ? 'badge-low' : 'badge-critical'}">${item.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div class="secondary small" style="margin-top:4px">${item.description || item.purpose || item.agent_key}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:#64748b">
                  <span>${item.model_provider}</span>
                  <span>v${item.version}</span>
                  ${item.is_chat_default ? '<span style="color:#0066CC;font-weight:700">Default copilot</span>' : ''}
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="card ai-studio-panel">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
            <div>
              <div class="card-title" style="margin-bottom:2px">Agent Definition</div>
              <div class="secondary small">${manage ? 'Business-safe editing for prompts, models, runtime guardrails, and screen scope.' : 'View current definitions and use the test harness.'}</div>
            </div>
            ${agent ? `<span class="badge badge-medium">${agent.agent_key}</span>` : ''}
          </div>
          ${agent ? `
            <div class="ai-studio-form-grid">
              <div class="form-group">
                <label>Name</label>
                <input id="ai-agent-name" value="${agent.name || ''}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group">
                <label>Agent Key</label>
                <input id="ai-agent-key" value="${agent.agent_key || ''}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group">
                <label>Category</label>
                <input id="ai-agent-category" value="${agent.category || ''}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group">
                <label>Output Format</label>
                <select id="ai-agent-output-format" ${manage ? '' : 'disabled'}>
                  ${(data.defaults?.output_formats || []).map(fmt => `<option value="${fmt}" ${fmt === agent.output_format ? 'selected' : ''}>${fmt}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Description</label>
                <textarea id="ai-agent-description" rows="2" ${manage ? '' : 'disabled'}>${agent.description || ''}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Purpose</label>
                <textarea id="ai-agent-purpose" rows="3" ${manage ? '' : 'disabled'}>${agent.purpose || ''}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Instructions</label>
                <textarea id="ai-agent-instructions" rows="4" ${manage ? '' : 'disabled'}>${agent.instructions || ''}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>System Prompt Template</label>
                <textarea id="ai-agent-system-prompt" rows="10" class="mono" ${manage ? '' : 'disabled'}>${agent.system_prompt_template || ''}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>User Prompt Template</label>
                <textarea id="ai-agent-user-prompt" rows="5" class="mono" ${manage ? '' : 'disabled'}>${agent.user_prompt_template || ''}</textarea>
              </div>
            </div>

            <div class="ai-studio-form-grid" style="margin-top:6px">
              <div class="form-group">
                <label>Model Provider</label>
                <select id="ai-agent-provider" ${manage ? '' : 'disabled'}>
                  ${['claude','local'].map(provider => `<option value="${provider}" ${provider === agent.model_provider ? 'selected' : ''}>${provider}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Model Name</label>
                <input id="ai-agent-model" value="${agent.model_name || ''}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group">
                <label>Temperature</label>
                <input id="ai-agent-temperature" type="number" step="0.05" min="0" max="1.5" value="${agent.temperature ?? 0.2}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group">
                <label>Max Tokens</label>
                <input id="ai-agent-max-tokens" type="number" min="128" max="8000" value="${agent.max_tokens || 1400}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Allowed Screens</label>
                <textarea id="ai-agent-screens" rows="2" ${manage ? '' : 'disabled'}>${aiStudioJoinList(agent.allowed_screens)}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Allowed Tools</label>
                <textarea id="ai-agent-tools" rows="2" ${manage ? '' : 'disabled'}>${aiStudioJoinList(agent.allowed_tools)}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Response Style</label>
                <input id="ai-agent-response-style" value="${agent.response_style || ''}" ${manage ? '' : 'disabled'}>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Provider Settings (JSON)</label>
                <textarea id="ai-agent-provider-settings" rows="4" class="mono" ${manage ? '' : 'disabled'}>${JSON.stringify(agent.provider_settings || {}, null, 2)}</textarea>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px">
                  <input id="ai-agent-active" type="checkbox" style="width:auto" ${agent.is_active ? 'checked' : ''} ${manage ? '' : 'disabled'}>
                  Active
                </label>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px">
                  <input id="ai-agent-default" type="checkbox" style="width:auto" ${agent.is_chat_default ? 'checked' : ''} ${manage ? '' : 'disabled'}>
                  Default chat copilot
                </label>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Change Summary</label>
                <input id="ai-agent-change-summary" placeholder="Why are you changing this agent?" ${manage ? '' : 'disabled'}>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px">
              <div class="secondary small">Template variables available: <code>{user_message}</code>, <code>{screen_context}</code>, <code>{selected_entity_summary}</code>, <code>{portfolio_snapshot}</code>, <code>{market_snapshot}</code>, <code>{user_profile_summary}</code>, <code>{session_memory}</code>.</div>
              ${manage ? '<button class="btn btn-primary btn-sm" onclick="saveAIStudioAgent()">Save Agent</button>' : ''}
            </div>

            <div style="margin-top:16px">
              <div class="card-title" style="margin-bottom:8px">Version History</div>
              <div id="ai-studio-version-list">${aiStudioVersionMarkup(agent.id)}</div>
            </div>
          ` : '<div class="secondary">No agent selected.</div>'}
        </div>

        <div style="display:grid;gap:12px">
          <div class="card ai-studio-panel">
            <div class="card-title" style="margin-bottom:8px">Test Agent</div>
            <div class="secondary small" style="margin-bottom:10px">Run a safe prompt test using your current user profile and optional selected record context.</div>
            <div class="form-group">
              <label>Target Screen Context</label>
              <select id="ai-studio-test-screen">
                ${(data.defaults?.screens || []).map(screen => `<option value="${screen}" ${screen === 'ai-studio' ? 'selected' : ''}>${screen}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Test Prompt</label>
              <textarea id="ai-studio-test-message" rows="5">Explain what this agent would tell me about my most important exposure right now.</textarea>
            </div>
            <button class="btn btn-primary btn-sm" onclick="runAIStudioAgentTest()" ${agent ? '' : 'disabled'}>Run Test</button>
            <div id="ai-studio-test-output" class="ai-studio-test-output">${window.aiStudioState.testResult ? renderAIStudioTestResult(window.aiStudioState.testResult) : '<div class="secondary small">Compiled prompt preview and model output will appear here.</div>'}</div>
          </div>

          <div class="card ai-studio-panel">
            <div class="card-title" style="margin-bottom:8px">My AI Context Profile</div>
            <div class="secondary small" style="margin-bottom:10px">Persistent analyst context automatically injected into chat and agent runs.</div>
            <div class="ai-studio-form-grid">
              <div class="form-group">
                <label>Role</label>
                <input id="ai-profile-role" value="${profile.role || ''}">
              </div>
              <div class="form-group">
                <label>Desk / Team</label>
                <input id="ai-profile-desk" value="${profile.desk_team || ''}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Industries Covered</label>
                <input id="ai-profile-industries" value="${aiStudioJoinList(profile.industries_covered)}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Commodities Covered</label>
                <input id="ai-profile-commodities" value="${aiStudioJoinList(profile.commodities_covered)}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Regions Covered</label>
                <input id="ai-profile-regions" value="${aiStudioJoinList(profile.regions_covered)}">
              </div>
              <div class="form-group">
                <label>Preferred Answer Style</label>
                <input id="ai-profile-style" value="${profile.preferred_answer_style || ''}">
              </div>
              <div class="form-group">
                <label>Risk Appetite</label>
                <input id="ai-profile-risk" value="${profile.risk_appetite || ''}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Review Posture</label>
                <textarea id="ai-profile-review" rows="3">${profile.review_posture || ''}</textarea>
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Default Focus Areas</label>
                <input id="ai-profile-focus" value="${aiStudioJoinList(profile.default_focus_areas)}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Analyst Preferences</label>
                <input id="ai-profile-preferences" value="${aiStudioJoinList(profile.analyst_preferences)}">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label>Persistent Notes</label>
                <textarea id="ai-profile-notes" rows="4">${profile.persistent_notes || ''}</textarea>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveAIStudioProfile()">Save Profile</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAIStudioTestResult(result) {
  return `
    <div style="display:grid;gap:10px">
      <div>
        <div class="kpi-label">Runtime Context</div>
        <div class="secondary small">Screen: ${result.runtime_context?.screen_context || 'n/a'} | Entity: ${result.runtime_context?.selected_entity_label || 'None selected'}</div>
      </div>
      <div>
        <div class="kpi-label">Model Output</div>
        <div class="ai-studio-response-box">${(result.response || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
      </div>
      <details>
        <summary style="cursor:pointer;font-weight:600;color:#374151">Show Compiled Prompts</summary>
        <div style="margin-top:8px;display:grid;gap:8px">
          <div>
            <div class="kpi-label">System Prompt</div>
            <pre class="ai-studio-pre">${(result.compiled_prompts?.system_prompt || '').replace(/</g, '&lt;')}</pre>
          </div>
          <div>
            <div class="kpi-label">User Prompt</div>
            <pre class="ai-studio-pre">${(result.compiled_prompts?.user_prompt || '').replace(/</g, '&lt;')}</pre>
          </div>
        </div>
      </details>
    </div>
  `;
}

window.loadAIStudioOverview = async function(forceSelectDefault) {
  const data = await apiCall('/ai-studio/overview');
  if (!data) {
    const root = document.getElementById('ai-studio-root');
    if (root) root.innerHTML = '<div class="card" style="color:#DC2626">Unable to load AI Studio configuration.</div>';
    return;
  }
  window.aiStudioState.overview = data;
  if (forceSelectDefault || !window.aiStudioState.selectedAgentId) {
    window.aiStudioState.selectedAgentId = data.defaults?.default_chat_agent_id || data.agents?.[0]?.id || null;
    window.aiStudioState.draftAgent = null;
  }
  const selected = (data.agents || []).find(agent => agent.id === window.aiStudioState.selectedAgentId);
  if (selected && !selected._versions) {
    const versions = await apiCall(`/ai-studio/agents/${selected.id}/versions`);
    if (versions?.versions) selected._versions = versions.versions;
  }
  renderAIStudioWorkspace();
};

window.selectAIStudioAgent = async function(agentId) {
  window.aiStudioState.selectedAgentId = agentId;
  window.aiStudioState.draftAgent = null;
  window.aiStudioState.testResult = null;
  const selected = (window.aiStudioState.overview?.agents || []).find(agent => agent.id === agentId);
  if (selected && !selected._versions) {
    const versions = await apiCall(`/ai-studio/agents/${selected.id}/versions`);
    if (versions?.versions) selected._versions = versions.versions;
  }
  renderAIStudioWorkspace();
};

window.createAIStudioAgent = function() {
  if (!aiStudioCanManage()) return;
  window.aiStudioState.draftAgent = { ...AI_STUDIO_NEW_AGENT };
  window.aiStudioState.selectedAgentId = null;
  window.aiStudioState.testResult = null;
  renderAIStudioWorkspace();
};

window.saveAIStudioAgent = async function() {
  if (!aiStudioCanManage()) return;
  const current = aiStudioCurrentAgent();
  if (!current) return;
  const payload = {
    agent_key: document.getElementById('ai-agent-key').value.trim(),
    name: document.getElementById('ai-agent-name').value.trim(),
    description: document.getElementById('ai-agent-description').value.trim(),
    category: document.getElementById('ai-agent-category').value.trim(),
    purpose: document.getElementById('ai-agent-purpose').value.trim(),
    instructions: document.getElementById('ai-agent-instructions').value.trim(),
    system_prompt_template: document.getElementById('ai-agent-system-prompt').value,
    user_prompt_template: document.getElementById('ai-agent-user-prompt').value,
    model_provider: document.getElementById('ai-agent-provider').value,
    model_name: document.getElementById('ai-agent-model').value.trim(),
    temperature: parseFloat(document.getElementById('ai-agent-temperature').value || '0.2'),
    max_tokens: parseInt(document.getElementById('ai-agent-max-tokens').value || '1400', 10),
    allowed_screens: aiStudioSplitList(document.getElementById('ai-agent-screens').value),
    allowed_tools: aiStudioSplitList(document.getElementById('ai-agent-tools').value),
    output_format: document.getElementById('ai-agent-output-format').value,
    response_style: document.getElementById('ai-agent-response-style').value.trim(),
    is_active: document.getElementById('ai-agent-active').checked,
    is_chat_default: document.getElementById('ai-agent-default').checked,
    change_summary: document.getElementById('ai-agent-change-summary').value.trim() || 'AI Studio update',
  };
  try {
    payload.provider_settings = JSON.parse(document.getElementById('ai-agent-provider-settings').value || '{}');
  } catch (e) {
    showToast('AI Studio', 'Provider settings must be valid JSON.', 'error');
    return;
  }

  const endpoint = current.id ? `/ai-studio/agents/${current.id}` : '/ai-studio/agents';
  const method = current.id ? 'PUT' : 'POST';
  const result = await apiCall(endpoint, { method, body: JSON.stringify(payload) });
  if (result) {
    showToast('AI Studio', current.id ? 'Agent configuration saved.' : 'New agent created.', 'success');
    await loadAIStudioOverview(true);
    if (result.id) window.aiStudioState.selectedAgentId = result.id;
    window.aiStudioState.draftAgent = null;
    await loadAIStudioOverview(false);
  } else {
    showToast('AI Studio', 'Unable to save agent configuration.', 'error');
  }
};

window.runAIStudioAgentTest = async function() {
  const agent = aiStudioCurrentAgent();
  if (!agent || !agent.id) {
    showToast('AI Studio', 'Save the new agent before running a test.', 'warning');
    return;
  }
  const output = document.getElementById('ai-studio-test-output');
  if (output) output.innerHTML = '<div class="secondary small">Running prompt test...</div>';
  const payload = {
    message: document.getElementById('ai-studio-test-message').value,
    screen_context: document.getElementById('ai-studio-test-screen').value,
    selected_entity: getSelectedEntity(),
  };
  const result = await apiCall(`/ai-studio/agents/${agent.id}/test`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (result) {
    window.aiStudioState.testResult = result;
    if (output) output.innerHTML = renderAIStudioTestResult(result);
    showToast('AI Studio', 'Agent test completed.', 'success');
  } else {
    if (output) output.innerHTML = '<div style="color:#DC2626">Agent test failed.</div>';
  }
};

window.saveAIStudioProfile = async function() {
  const payload = {
    role: document.getElementById('ai-profile-role').value.trim(),
    desk_team: document.getElementById('ai-profile-desk').value.trim(),
    industries_covered: aiStudioSplitList(document.getElementById('ai-profile-industries').value),
    commodities_covered: aiStudioSplitList(document.getElementById('ai-profile-commodities').value),
    regions_covered: aiStudioSplitList(document.getElementById('ai-profile-regions').value),
    preferred_answer_style: document.getElementById('ai-profile-style').value.trim(),
    risk_appetite: document.getElementById('ai-profile-risk').value.trim(),
    review_posture: document.getElementById('ai-profile-review').value.trim(),
    default_focus_areas: aiStudioSplitList(document.getElementById('ai-profile-focus').value),
    analyst_preferences: aiStudioSplitList(document.getElementById('ai-profile-preferences').value),
    persistent_notes: document.getElementById('ai-profile-notes').value.trim(),
  };
  const result = await apiCall('/ai-studio/profile/me', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  if (result) {
    if (window.aiStudioState.overview) window.aiStudioState.overview.profile = result;
    showToast('AI Studio', 'Your AI context profile was saved.', 'success');
    renderAIStudioWorkspace();
  } else {
    showToast('AI Studio', 'Unable to save profile.', 'error');
  }
};

SCREENS['ai-studio'] = async function(main) {
  main.innerHTML = '<div id="ai-studio-root" class="screen"><div class="flex-center" style="height:240px"><span class="loading-spinner"></span></div></div>';
  await loadAIStudioOverview();
};

SCREENS['documentation'] = async function(main) {
  const guide = await window.loadAppGuide();

  const renderDocumentationScreen = function(screenKey) {
    const groups = window.getDocumentationGroupsData ? window.getDocumentationGroupsData() : [];
    const allScreens = guide?.screens || [];
    const fallbackKey = groups[0]?.items?.[0]?.key || allScreens[0]?.key || 'decision-queue';
    const activeKey = screenKey || (window.getDocumentationSelectedScreen && window.getDocumentationSelectedScreen()) || fallbackKey;
    if (window.setDocumentationSelectedScreen) window.setDocumentationSelectedScreen(activeKey);
    const manual = window.getManualScreen ? window.getManualScreen(activeKey) : null;
    const selected = manual || (window.getManualScreen ? window.getManualScreen(fallbackKey) : null);
    const prompts = (window.COPILOT_SUGGESTIONS?.[selected?.key] || []).slice(0, 3);
    const featureList = (selected?.features || []).map(item => `<li>${window.escapeHtml(item)}</li>`).join('');
    const sectionCards = (selected?.sections || []).map(section => `
      <div class="docs-card">
        <div class="docs-card-title">${window.escapeHtml(section.title || 'Guidance')}</div>
        <ul class="docs-feature-list">${(section.items || []).map(item => `<li>${window.escapeHtml(item)}</li>`).join('')}</ul>
      </div>
    `).join('');
    const taskCards = (selected?.tasks || []).map(task => `
      <div class="docs-task-card agent-assistable">
        <div class="docs-task-copy">
          <div class="docs-task-title">${window.escapeHtml(task)}</div>
          <div class="docs-task-meta">Ask Radiant AI to guide you or perform the supported workflow directly.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="promptCopilotForTask(${window.escapeJsArg(selected.key)}, ${window.escapeJsArg(task)})">Let AI Handle It</button>
      </div>
    `).join('');
    const promptChips = prompts.map(prompt => `
      <button class="docs-prompt-chip" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(prompt)})">${window.escapeHtml(prompt)}</button>
    `).join('');
    const chatExamples = (selected?.chat_examples || []).map(prompt => `
      <button class="docs-prompt-chip" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(prompt)})">${window.escapeHtml(prompt)}</button>
    `).join('');
    const relatedLinks = (selected?.related_screens || []).map(key => `
      <button class="docs-related-link" onclick="navigateTo(${window.escapeJsArg(key)})">${window.escapeHtml(window.screenDisplayName(key))}</button>
    `).join('');
    const visibleGroups = groups.length > 0 ? groups : [
      {
        label: 'All Screens',
        items: allScreens
      }
    ];

    main.innerHTML = `
      <div class="screen docs-screen">
        <div class="screen-header">
          <div>
            <div class="screen-title">Documentation & Help</div>
            <div class="screen-subtitle">Browse every feature, jump straight to the right screen, and let Radiant AI act for you where supported.</div>
          </div>
          <div class="screen-actions">
            <button class="btn btn-secondary btn-sm" onclick="openCopilot(); sendCopilotMessage('What can you do for me in this app?')">Ask Radiant AI</button>
            <button class="btn btn-primary btn-sm" onclick="openPageHelp('documentation')">How This Works</button>
          </div>
        </div>

        <div class="docs-shell">
          <aside class="docs-tree-panel">
            <div class="docs-overview-card">
              <div class="docs-overview-label">Application Guide</div>
              <div class="docs-overview-text">${window.escapeHtml((guide?.overview || 'Radiant-MVT brings trading, intelligence, operations, and admin workflows into one AI-assisted workspace.'))}</div>
            </div>
            <div class="docs-tree-scroll">
              ${visibleGroups.map(group => `
                <section class="docs-tree-group">
                  <div class="docs-tree-heading">${window.escapeHtml(group.label)}</div>
                  <div class="docs-tree-items">
                    ${group.items.map(item => `
                      <button class="docs-tree-item ${item.key === selected?.key ? 'active' : ''}" onclick="renderDocumentationScreen(${window.escapeJsArg(item.key)})">
                        <span class="docs-tree-item-title">${window.escapeHtml(item.title)}</span>
                        <span class="docs-tree-item-summary">${window.escapeHtml(item.summary)}</span>
                      </button>
                    `).join('')}
                  </div>
                </section>
              `).join('')}
            </div>
          </aside>

          <section class="docs-detail-panel">
            <div class="docs-detail-scroll">
              <div class="docs-detail-hero">
                <div class="docs-detail-eyebrow">${window.escapeHtml(groups.find(group => group.items.some(item => item.key === selected?.key))?.label || 'Workspace')}</div>
                <div class="docs-detail-title-row">
                  <div>
                    <h2 class="docs-detail-title">${window.escapeHtml(selected?.title || 'Documentation')}</h2>
                    <p class="docs-detail-summary">${window.escapeHtml(selected?.summary || 'Select a screen on the left to explore its features and supported actions.')}</p>
                  </div>
                  <div class="docs-detail-actions">
                    <button class="btn btn-secondary btn-sm" onclick="navigateTo(${window.escapeJsArg(selected?.key || 'decision-queue')})">Open Screen</button>
                    <button class="btn btn-primary btn-sm" onclick="openCopilot(); sendCopilotMessage(${window.escapeJsArg(window.PAGE_HELP_PROMPTS?.[selected?.key] || `Explain the ${window.screenDisplayName(selected?.key)} page and how to use it.`)})">Explain in Chat</button>
                  </div>
                </div>
              </div>

              <div class="docs-grid">
                <div class="docs-card">
                  <div class="docs-card-title">Features</div>
                  <ul class="docs-feature-list">${featureList || '<li>Feature details are being prepared for this screen.</li>'}</ul>
                </div>
                <div class="docs-card">
                  <div class="docs-card-title">Helpful Chat Prompts</div>
                  <div class="docs-prompt-list">${promptChips || '<div class="secondary small">Ask Radiant AI anything about this screen.</div>'}</div>
                </div>
              </div>

              ${sectionCards ? `<div class="docs-grid docs-section-grid">${sectionCards}</div>` : ''}

              <div class="docs-card">
                <div class="docs-card-title">Common Tasks</div>
                <div class="docs-task-list">${taskCards || '<div class="secondary small">This screen is primarily informational, but Radiant AI can still explain it in chat.</div>'}</div>
              </div>

              <div class="docs-grid">
                <div class="docs-card">
                  <div class="docs-card-title">Example Questions For Chat</div>
                  <div class="docs-prompt-list">${chatExamples || '<div class="secondary small">Ask Radiant AI how to use this screen.</div>'}</div>
                </div>
                <div class="docs-card">
                  <div class="docs-card-title">Related Screens</div>
                  <div class="docs-related-list">${relatedLinks || '<div class="secondary small">No related screens listed yet.</div>'}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  };

  window.renderDocumentationScreen = renderDocumentationScreen;
  renderDocumentationScreen();
};

/* Atlas map screens: Trader MVT Atlas and Risk Atlas */
let atlasMapInstance = null;
let atlasLayerGroups = {};
let atlasState = { nodes: [], routes: [], selected: null, summary: null, scenario: null };

function atlasMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

function atlasNumber(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

function atlasStatusClass(status) {
  status = String(status || '').toLowerCase();
  if (status === 'breach' || status === 'break') return 'breach';
  if (status === 'watch') return 'watch';
  if (status === 'unknown') return 'unknown';
  return 'ok';
}

function atlasColor(item) {
  const status = atlasStatusClass(item.status);
  if (status === 'breach') return '#DC2626';
  if (status === 'watch') return '#D97706';
  if (item.layer_key === 'positions' && Number(item.metric || 0) < 0) return '#7C3AED';
  if (item.layer_key === 'pricing') return '#0891B2';
  if (item.layer_key === 'deals') return '#2563EB';
  if (item.layer_key === 'basis') return '#9333EA';
  return '#16A34A';
}

function atlasFeatureLabel(item) {
  const labels = {
    'F-01': 'Deal pin', 'F-03': 'Deal thread', 'F-06': 'Transport', 'F-07': 'Dwell ring',
    'F-14': 'Net hub', 'F-16': 'Obligation', 'F-17': 'Concentration', 'F-18': 'VaR heat',
    'F-19': 'Basis vol', 'F-20': 'Scenario', 'F-24': 'Index hub', 'F-25': 'Basis diff',
    'F-26': 'Unpriced flag', 'F-43': 'Recon', 'F-44': 'Lineage', 'F-45': 'AI anomaly'
  };
  return labels[item.feature_id] || item.feature_id || 'Atlas';
}

function atlasSafe(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
}

async function loadAtlasPayload() {
  const [summary, nodesPayload, routesPayload, layersPayload] = await Promise.all([
    apiCall('/atlas/summary'),
    apiCall('/atlas/nodes'),
    apiCall('/atlas/routes'),
    apiCall('/atlas/layers')
  ]);
  atlasState.summary = summary || {
    data_state: 'demo',
    active_deals: 1,
    mapped_routes: 3,
    net_exposure: 82000,
    risk_watch_count: 2,
    anomalies: 1,
    reconciliation: { reconciled: 2, watch: 1, break: 0 }
  };
  atlasState.nodes = (nodesPayload && nodesPayload.nodes) || [];
  atlasState.routes = (routesPayload && routesPayload.routes) || [];
  atlasState.layers = (layersPayload && layersPayload.layers) || [];
  if (!atlasState.nodes.length || !atlasState.routes.length) {
    const fallback = atlasFallbackObjects();
    atlasState.nodes = atlasState.nodes.length ? atlasState.nodes : fallback.nodes;
    atlasState.routes = atlasState.routes.length ? atlasState.routes : fallback.routes;
    atlasState.summary = { ...atlasState.summary, data_state: 'demo' };
  }
  return atlasState;
}

function atlasFallbackObjects() {
  const stamp = new Date().toISOString();
  const node = (id, feature_id, layer_key, object_type, name, lat, lon, metric, unit, status, detail) => ({
    id, feature_id, layer_key, object_type, name, lat, lon, metric, unit, status,
    severity: status === 'breach' ? 'high' : status === 'watch' ? 'medium' : 'low',
    source_system: 'Frontend Atlas demo fallback',
    source_timestamp: stamp,
    is_demo: true,
    detail: detail || {}
  });
  const route = (id, feature_id, layer_key, name, coords, metric, unit, status, detail) => ({
    id, feature_id, layer_key, object_type: 'route', name,
    geometry: { type: 'LineString', coordinates: coords.map(pair => [pair[1], pair[0]]) },
    metric, unit, status,
    severity: status === 'breach' ? 'high' : status === 'watch' ? 'medium' : 'low',
    source_system: 'Frontend Atlas demo fallback',
    source_timestamp: stamp,
    is_demo: true,
    detail: detail || {}
  });
  return {
    nodes: [
      node('fallback_deal_marcus', 'F-01', 'deals', 'pin', 'RMVT-0234 deal pin', 39.819, -75.418, 50000, 'bbl', 'watch', { unpriced_volume_flag: true, lineage: ['frontend fallback deal'] }),
      node('fallback_hub_brent', 'F-14', 'positions', 'hub', 'Brent net long hub', 60.9, 1.5, 82000, 'bbl net', 'ok', { position_direction: 'long', concentration_score: 82, lineage: ['frontend fallback position'] }),
      node('fallback_risk_gulf', 'F-18', 'risk', 'heat', 'Gulf Coast VaR heat', 29.9, -94.2, 2400000, 'USD VaR', 'breach', { drivers: ['prompt delta', 'basis volatility'], lineage: ['frontend fallback risk'] }),
      node('fallback_price_nwe', 'F-24', 'pricing', 'hub', 'NWE Naphtha index', 51.95, 4.13, 612, 'USD/t', 'watch', { forward_curve: [612, 618, 616, 610], lineage: ['frontend fallback price'] }),
      node('fallback_anomaly_rafnes', 'F-45', 'ai-anomalies', 'anomaly', 'Unpriced volume anomaly', 59.24, 9.85, 41000, 'bbl', 'watch', { confidence_pct: 84, lineage: ['frontend fallback anomaly'] })
    ],
    routes: [
      route('fallback_route_marine', 'F-06', 'logistics', 'Marcus Hook to Rafnes', [[39.819, -75.418], [50, -35], [59.1, 9.65]], 480000, 'USD margin', 'watch', { transport_mode: 'marine', reconciliation_status: 'watch', lineage: ['frontend fallback route'] }),
      route('fallback_basis_hh_ttf', 'F-19', 'basis', 'HH to TTF basis volatility', [[30.3, -92.04], [42, -40], [52.25, 5.27]], 41, 'vol pct', 'breach', { transport_mode: 'basis', basis_volatility_pct: 41, reconciliation_status: 'break', lineage: ['frontend fallback basis'] })
    ]
  };
}

function atlasKpiStrip(summary) {
  const cards = [
    ['Active deals', summary.active_deals || 0, 'ok'],
    ['Mapped routes', summary.mapped_routes || 0, 'ok'],
    ['Net exposure', atlasNumber(summary.net_exposure || 0), Number(summary.net_exposure || 0) < 0 ? 'watch' : 'ok'],
    ['Risk watches', summary.risk_watch_count || 0, 'watch'],
    ['AI anomalies', summary.anomalies || 0, 'breach']
  ];
  return '<div class="atlas-kpis">' + cards.map(card => `
    <button class="atlas-kpi ${card[2]}" onclick="sendCopilotMessage('Explain the ${atlasSafe(card[0])} Atlas KPI')">
      <span>${atlasSafe(card[0])}</span><strong>${atlasSafe(card[1])}</strong>
    </button>
  `).join('') + '</div>';
}

function atlasLayerControls() {
  const traderLayers = [
    ['deals', 'Deals'], ['logistics', 'Logistics'], ['vessels', 'Vessels'], ['positions', 'Positions'],
    ['risk', 'Risk'], ['pricing', 'Pricing'], ['basis', 'Basis'], ['trust', 'Trust'], ['ai-anomalies', 'AI Anomalies']
  ];
  return traderLayers.map(([key, label]) => `
    <label class="atlas-layer-toggle">
      <input type="checkbox" data-atlas-layer="${key}" checked onchange="toggleAtlasLayer('${key}', this.checked)">
      <span>${atlasSafe(label)}</span>
    </label>
  `).join('');
}

function atlasLegend() {
  return `
    <div class="atlas-legend">
      <span><i class="ok"></i> healthy</span>
      <span><i class="watch"></i> watch</span>
      <span><i class="breach"></i> breach</span>
      <span><i class="demo"></i> demo/mixed</span>
    </div>
  `;
}

function renderAtlasShell(main) {
  const title = 'MVT Atlas';
  const subtitle = 'Trader map for deals, physical routes, logistics dwell, hub exposure, pricing, trust, and AI anomalies';
  main.innerHTML = `<div class="screen atlas-screen">
    <div class="screen-header">
      <div>
        <div class="screen-title">${title}</div>
        <div class="screen-subtitle">${subtitle}</div>
      </div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="reloadAtlasScreen()">Refresh</button>
        <button class="btn btn-primary btn-sm" onclick="openCopilot(); sendCopilotMessage('Summarize the MVT Atlas map for the morning meeting')">Ask AI</button>
      </div>
    </div>
    <div id="atlas-kpi-host"></div>
    <div class="atlas-workbench">
      <aside class="atlas-controls">
        <div class="atlas-panel-title">Layers</div>
        <div class="atlas-layer-list">${atlasLayerControls()}</div>
        <div class="atlas-panel-title mt-12">Transport Modes</div>
        <div class="atlas-mode-list"><span>Marine</span><span>Pipeline</span><span>Rail</span><span>Truck</span></div>
        <div class="atlas-panel-title mt-12">Legend</div>
        ${atlasLegend()}
        <div class="atlas-data-label">Data state: <strong id="atlas-data-state">mixed</strong></div>
      </aside>
      <section class="atlas-map-wrap">
        <div id="trader-atlas-map" class="atlas-map"></div>
      </section>
      <aside class="atlas-drawer" id="atlas-detail-drawer">
        <div class="atlas-empty-detail">
          <strong>Select a map object</strong>
          <span>Click a deal, hub, route, risk heat zone, basis connector, pricing node, anomaly, or reconciliation status.</span>
        </div>
      </aside>
    </div>
    <div class="atlas-bottom-grid">
      <div class="card">
        <div class="card-title mb-8">Open Delivery Obligations</div>
        <div id="atlas-hub-list" class="atlas-list"></div>
      </div>
      <div class="card">
        <div class="card-title mb-8">Deal-to-Physical Threads</div>
        <div id="atlas-route-list" class="atlas-list"></div>
      </div>
    </div>
  </div>`;
}

function initAtlasMap() {
  const mapId = 'trader-atlas-map';
  const mapEl = document.getElementById(mapId);
  if (!mapEl) return;
  if (typeof L === 'undefined') {
    renderAtlasFallbackMap(mapEl);
    return;
  }
  if (atlasMapInstance) {
    atlasMapInstance.remove();
    atlasMapInstance = null;
  }
  atlasLayerGroups = {};
  atlasMapInstance = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true }).setView([47, -20], 3);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'OpenStreetMap',
    maxZoom: 10
  }).addTo(atlasMapInstance);
  ['deals','logistics','vessels','positions','risk','pricing','basis','trust','ai-anomalies'].forEach(key => {
    atlasLayerGroups[key] = L.layerGroup().addTo(atlasMapInstance);
  });
  renderAtlasObjects();
  setTimeout(() => atlasMapInstance && atlasMapInstance.invalidateSize(), 80);
}

function atlasProject(lat, lon) {
  const minLon = -105;
  const maxLon = 18;
  const minLat = 24;
  const maxLat = 64;
  return {
    x: Math.max(2, Math.min(98, ((Number(lon) - minLon) / (maxLon - minLon)) * 100)),
    y: Math.max(2, Math.min(98, (1 - ((Number(lat) - minLat) / (maxLat - minLat))) * 100))
  };
}

function renderAtlasFallbackMap(mapEl) {
  const routes = atlasState.routes;
  const nodes = atlasState.nodes;
  const routeLines = routes.map(route => {
    const coords = route.geometry?.coordinates || [];
    const points = coords.map(pair => {
      const pos = atlasProject(pair[1], pair[0]);
      return `${pos.x},${pos.y}`;
    }).join(' ');
    return `<polyline points="${points}" stroke="${atlasColor(route)}" stroke-width="${route.layer_key === 'basis' ? 0.9 : 0.65}" fill="none" stroke-linecap="round" stroke-dasharray="${route.layer_key === 'basis' ? '2 2' : route.detail?.transport_mode === 'marine' ? '1 1.8' : '0'}" onclick="selectAtlasObjectById('${route.id}')"></polyline>`;
  }).join('');
  const nodeButtons = nodes.map(node => {
    if (node.lat == null || node.lon == null) return '';
    const pos = atlasProject(node.lat, node.lon);
    const size = node.object_type === 'heat' ? 32 : node.object_type === 'hub' ? 26 : 20;
    const label = node.object_type === 'anomaly' ? 'AI' : node.layer_key === 'deals' ? 'D' : node.layer_key === 'pricing' ? '$' : node.layer_key === 'vessels' ? 'V' : node.layer_key === 'positions' ? 'H' : 'N';
    return `<button class="atlas-fallback-node ${atlasStatusClass(node.status)}" style="left:${pos.x}%;top:${pos.y}%;width:${size}px;height:${size}px;--atlas-color:${atlasColor(node)}" onclick="selectAtlasObjectById('${node.id}')" title="${atlasSafe(node.name)}">${label}</button>`;
  }).join('');
  mapEl.innerHTML = `
    <div class="atlas-fallback-map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Atlas fallback map">
        <rect width="100" height="100" fill="#E7EEF7"></rect>
        <path d="M4,18 C13,10 27,8 34,18 C42,30 36,44 26,48 C18,51 9,42 5,32 Z" fill="#C8D7E8" opacity=".8"></path>
        <path d="M34,8 C43,5 52,9 56,18 C60,30 52,38 43,36 C35,34 30,22 34,8 Z" fill="#C8D7E8" opacity=".75"></path>
        <path d="M55,10 C70,3 91,7 96,22 C88,32 71,34 59,28 Z" fill="#C8D7E8" opacity=".8"></path>
        <path d="M58,34 C65,42 68,58 63,76 C57,91 47,84 45,63 C43,49 48,39 58,34 Z" fill="#C8D7E8" opacity=".72"></path>
        <g class="atlas-fallback-routes">${routeLines}</g>
      </svg>
      ${nodeButtons}
      <div class="atlas-fallback-note">Fallback map active: CDN map tiles unavailable, Atlas objects remain clickable.</div>
    </div>
  `;
}

function atlasNodeHtml(item) {
  const color = atlasColor(item);
  const size = item.object_type === 'heat' ? 34 : item.object_type === 'hub' ? 28 : item.object_type === 'anomaly' ? 24 : 20;
  const label = item.object_type === 'anomaly' ? 'AI' : item.layer_key === 'deals' ? 'D' : item.layer_key === 'pricing' ? '$' : item.layer_key === 'vessels' ? 'V' : item.layer_key === 'positions' ? 'H' : 'N';
  const pulse = item.status === 'breach' || item.feature_id === 'F-07' || item.object_type === 'anomaly' ? ' pulse' : '';
  return `<div class="atlas-marker${pulse}" style="--atlas-color:${color};width:${size}px;height:${size}px">${label}</div>`;
}

function addAtlasNode(item) {
  if (item.lat == null || item.lon == null) return;
  const key = item.layer_key || 'logistics';
  const group = atlasLayerGroups[key] || atlasLayerGroups.logistics;
  if (item.object_type === 'heat') {
    const radius = Math.max(35000, Math.min(190000, Number(item.metric || 0) / 13));
    L.circle([item.lat, item.lon], {
      radius,
      color: atlasColor(item),
      fillColor: atlasColor(item),
      fillOpacity: item.status === 'breach' ? 0.24 : 0.15,
      weight: 1.5
    }).addTo(group).on('click', () => selectAtlasObject(item));
  }
  const marker = L.marker([item.lat, item.lon], {
    icon: L.divIcon({ className: '', html: atlasNodeHtml(item), iconSize: [34, 34], iconAnchor: [17, 17] })
  }).addTo(group);
  marker.bindTooltip(`<strong>${atlasSafe(item.name)}</strong><br>${atlasSafe(atlasFeatureLabel(item))}: ${atlasSafe(atlasNumber(item.metric))} ${atlasSafe(item.unit || '')}`, { className: 'vessel-tooltip' });
  marker.on('click', () => selectAtlasObject(item));
  const markerEl = marker.getElement && marker.getElement();
  if (markerEl) {
    markerEl.addEventListener('click', event => {
      event.stopPropagation();
      selectAtlasObject(item);
    });
  }
}

function addAtlasRoute(item) {
  const coords = item.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return;
  const latLngs = coords.map(pair => [pair[1], pair[0]]);
  const key = item.layer_key || 'logistics';
  const group = atlasLayerGroups[key] || atlasLayerGroups.logistics;
  const isBasis = key === 'basis';
  const poly = L.polyline(latLngs, {
    color: atlasColor(item),
    weight: isBasis ? 4 : 3,
    opacity: item.status === 'breach' ? 0.9 : 0.72,
    dashArray: isBasis ? '8,6' : (item.detail?.transport_mode === 'marine' ? '3,7' : null)
  }).addTo(group);
  poly.bindTooltip(`<strong>${atlasSafe(item.name)}</strong><br>${atlasSafe(atlasFeatureLabel(item))}: ${atlasSafe(atlasNumber(item.metric))} ${atlasSafe(item.unit || '')}`, { className: 'vessel-tooltip' });
  poly.on('click', () => selectAtlasObject(item));
  const pathEl = poly.getElement && poly.getElement();
  if (pathEl) {
    pathEl.addEventListener('click', event => {
      event.stopPropagation();
      selectAtlasObject(item);
    });
  }
}

function renderAtlasObjects() {
  Object.values(atlasLayerGroups).forEach(group => group.clearLayers());
  atlasState.routes.forEach(route => {
    addAtlasRoute(route);
  });
  atlasState.nodes.forEach(node => {
    addAtlasNode(node);
  });
  if (atlasState.scenario?.objects) {
    atlasState.scenario.objects.forEach(obj => {
      if (obj.object_type === 'route') addAtlasRoute(obj);
      else addAtlasNode(obj);
    });
  }
}

function renderAtlasLists() {
  const hubs = document.getElementById('atlas-hub-list');
  const routes = document.getElementById('atlas-route-list');
  if (hubs) {
    const list = atlasState.nodes
      .filter(n => ['positions','logistics'].includes(n.layer_key))
      .slice(0, 6);
    hubs.innerHTML = list.map(n => `
      <button class="atlas-list-row" onclick="selectAtlasObjectById('${n.id}')">
        <span><b>${atlasSafe(n.name)}</b><small>${atlasSafe(atlasFeatureLabel(n))} - ${atlasSafe(n.source_system)}</small></span>
        <em class="${atlasStatusClass(n.status)}">${atlasSafe(atlasNumber(n.metric))}</em>
      </button>
    `).join('');
  }
  if (routes) {
    const list = atlasState.routes.slice(0, 6);
    routes.innerHTML = list.map(r => `
      <button class="atlas-list-row" onclick="selectAtlasObjectById('${r.id}')">
        <span><b>${atlasSafe(r.name)}</b><small>${atlasSafe(r.detail?.transport_mode || r.layer_key)} - ${atlasSafe(r.feature_id)}</small></span>
        <em class="${atlasStatusClass(r.status)}">${atlasSafe(atlasNumber(r.metric))}</em>
      </button>
    `).join('');
  }
}

function selectAtlasObjectById(id) {
  const obj = atlasState.nodes.concat(atlasState.routes).concat(atlasState.scenario?.objects || []).find(item => item.id === id);
  if (obj) selectAtlasObject(obj);
}

async function selectAtlasObject(item) {
  atlasState.selected = item;
  if (typeof setSelectedEntity === 'function') {
    setSelectedEntity({ type: item.object_type || 'atlas', id: item.id, label: item.name });
  }
  const drawer = document.getElementById('atlas-detail-drawer');
  if (!drawer) return;
  let lineage = await apiCall(`/atlas/lineage/${item.object_type}/${item.id}`);
  if (!lineage) {
    lineage = {
      source_system: item.source_system,
      source_timestamp: item.source_timestamp,
      is_demo: item.is_demo,
      reconciliation_status: item.status,
      lineage: item.detail?.lineage || []
    };
  }
  const detailRows = Object.entries(item.detail || {})
    .filter(([key, value]) => value !== null && value !== undefined && key !== 'lineage')
    .slice(0, 9)
    .map(([key, value]) => `<div><span>${atlasSafe(key.replaceAll('_', ' '))}</span><strong>${atlasSafe(Array.isArray(value) ? value.join(', ') : value)}</strong></div>`)
    .join('');
  drawer.innerHTML = `
    <div class="atlas-drawer-header">
      <div>
        <div class="atlas-eyebrow">${atlasSafe(atlasFeatureLabel(item))} - ${atlasSafe(item.object_type)}</div>
        <h3>${atlasSafe(item.name)}</h3>
      </div>
      <span class="atlas-status ${atlasStatusClass(item.status)}">${atlasSafe(item.status)}</span>
    </div>
    <div class="atlas-metric-main"><strong>${atlasSafe(atlasNumber(item.metric))}</strong><span>${atlasSafe(item.unit || '')}</span></div>
    <div class="atlas-detail-grid">${detailRows}</div>
    <div class="atlas-lineage">
      <div class="atlas-panel-title">Lineage</div>
      <p><b>${atlasSafe(lineage.source_system)}</b> - ${atlasSafe(lineage.is_demo ? 'demo-backed mapping' : 'source-backed')}</p>
      <p>${atlasSafe(lineage.source_timestamp || item.source_timestamp || '')}</p>
      <p>Recon: <b>${atlasSafe(lineage.reconciliation_status || item.status)}</b></p>
      <ul>${(lineage.lineage || []).map(x => `<li>${atlasSafe(x)}</li>`).join('')}</ul>
    </div>
    <div class="atlas-ai-actions">
      ${['Explain this map object','What changed?','Draft control note','What should I investigate first?','What should I hedge first?','Identify data quality issues'].map(action => `
        <button class="btn btn-secondary btn-sm" onclick="askAtlasAI('${action.replace(/'/g, "\\'")}')">${atlasSafe(action)}</button>
      `).join('')}
    </div>
  `;
}

function askAtlasAI(action) {
  const item = atlasState.selected;
  const context = item ? `${action}: ${item.name} (${item.object_type}, ${item.feature_id}). Metric ${item.metric} ${item.unit}. Status ${item.status}. Source ${item.source_system}. Detail ${JSON.stringify(item.detail || {})}` : action;
  if (item && typeof setSelectedEntity === 'function') setSelectedEntity({ type: item.object_type || 'atlas', id: item.id, label: item.name });
  openCopilot();
  sendCopilotMessage(context);
}

function toggleAtlasLayer(key, enabled) {
  const group = atlasLayerGroups[key];
  if (!group || !atlasMapInstance) return;
  if (enabled) group.addTo(atlasMapInstance);
  else atlasMapInstance.removeLayer(group);
}

function reloadAtlasScreen() {
  SCREENS['atlas'](document.getElementById('main'));
}

async function renderAtlasScreen(main) {
  renderAtlasShell(main);
  const state = await loadAtlasPayload();
  const dataState = document.getElementById('atlas-data-state');
  if (dataState) dataState.textContent = state.summary?.data_state || 'mixed';
  const host = document.getElementById('atlas-kpi-host');
  if (host) host.innerHTML = atlasKpiStrip(state.summary || {});
  initAtlasMap();
  renderAtlasLists();
}

SCREENS['atlas'] = async function(main) {
  await renderAtlasScreen(main);
};
