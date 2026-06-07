/* ============================================================
   Radiant-MVT™ — screens.js  All Screen Renderers
   ============================================================ */

/* ── SCREEN 1: DECISION QUEUE ── */
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
          <div class="kpi-value accent" id="dq-count">—</div>
        </div>
        <div class="kpi-card" style="min-width:120px;text-align:center">
          <div class="kpi-label">Value at Stake</div>
          <div class="kpi-value positive" id="dq-value">—</div>
        </div>
      </div>
    </div>
    <div class="screen-header">
      <div><div class="screen-title">📋 Decision Queue</div><div class="screen-subtitle">Your prioritised action list — sorted by deadline and impact</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadDecisionQueue()">⟳ Refresh</button>
        <button class="btn btn-primary btn-sm" onclick="generateDecisionBriefing()">🤖 Generate AI Briefing</button>
      </div>
    </div>
    <div id="decision-cards-container">
      <div class="flex-center" style="height:120px"><span class="loading-spinner"></span></div>
    </div>
    <div class="ai-briefing-box">
      <div class="ai-briefing-header">
        <div class="ai-briefing-title">🤖 AI Decision Briefing</div>
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
  
  // Show demo data IMMEDIATELY — no loading spinner
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
    deadline: d.deadline ? new Date(d.deadline).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—',
    countdown: d.deadline ? countdownStr(d.deadline) : '—',
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
    { id:2, priority:'high',     title:'JS Ineos Innovation — choose response to 14h delay', deadline:'11:00', countdown:'3h 26m', potential_impact:'$480,000', context:'Three options costed. Terminal at Rafnes needs response. Ethane cargo delivery impacted. Option C (reroute via Stenungsund) is lowest cost.', actions:['See Options','Snooze 1h'] },
    { id:3, priority:'medium',   title:'Vitol trade confirmation outstanding — RMVT-0234', deadline:'15:00', countdown:'7h 26m', potential_impact:'Counterparty dispute risk', context:'Draft reply ready. One click to send. Trade was agreed verbally on 28-May. Written confirmation overdue by 24h.', actions:['Send Now','Review Draft'] },
    { id:4, priority:'low',      title:'Monthly performance review — submit to Risk by 17:00', deadline:'17:00', countdown:'9h 26m', potential_impact:'Reporting obligation', context:'Template pre-filled. Requires sign-off signature only.', actions:['Open Report','Delegate'] }
  ];
}

function renderDecisionCard(d, i) {
  const priorityEmoji = { critical:'🔴', high:'🟠', medium:'🟡', low:'🟢' };
  const isUrgent = d.priority === 'critical';
  return `<div class="decision-card ${d.priority}" style="animation-delay:${i*0.08}s">
    <div class="decision-header">
      <div class="decision-title">${priorityEmoji[d.priority]||'🔵'} DECISION ${i+1} — ${d.priority.toUpperCase()}</div>
      <div class="decision-deadline ${isUrgent?'urgent':''}">Deadline: ${d.deadline} (${d.countdown})</div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${d.title}</div>
    <div class="decision-impact">Potential impact: ${d.potential_impact}</div>
    <div class="decision-body">${d.context}</div>
    <div class="decision-actions">
      ${d.actions.map((a,ai) => `<button class="btn ${ai===0?'btn-primary':'btn-secondary'} btn-sm" onclick="handleDecisionAction(${d.id},'${a}')">${a}</button>`).join('')}
    </div>
  </div>`;
}

window.handleDecisionAction = function(id, action) {
  showToast('Action', `Decision ${id}: "${action}" — opening details...`, 'info');
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

/* ── SCREEN 2: DASHBOARD ── */
SCREENS['dashboard'] = async function(main) {
  var dateStr = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
  main.innerHTML = '<div class="screen" style="padding:12px 14px">'

    /* ── Header ── */
    + '<div class="screen-header" style="margin-bottom:10px">'
    + '<div><div class="screen-title">&#128202; Trader Dashboard</div><div class="screen-subtitle">Live book overview — ' + dateStr + '</div></div>'
    + '<div class="screen-actions">'
    + '<select class="form-select" style="width:130px" id="dash-book-filter"><option value="">All Books</option><option>Crude</option><option>NGL/Ethane</option><option>Naphtha</option><option>Carbon</option></select>'
    + '<button class="btn btn-secondary btn-sm" onclick="loadDashboardData()">&#8635; Refresh</button>'
    + '</div></div>'

    /* ── KPI STRIP ── */
    + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px">'
    + '<div style="background:linear-gradient(135deg,#0066CC,#0052A3);border-radius:10px;padding:12px 14px;color:white">'
    + '<div style="font-size:10px;opacity:.75;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Today\'s P&amp;L</div>'
    + '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px" id="kpi-pnl">+$2.1M</div>'
    + '<div style="font-size:11px;opacity:.8;margin-top:2px">&#9650; +$184K vs yesterday</div>'
    + '</div>'
    + '<div style="background:linear-gradient(135deg,#16A34A,#15803D);border-radius:10px;padding:12px 14px;color:white">'
    + '<div style="font-size:10px;opacity:.75;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">YTD Performance</div>'
    + '<div style="font-size:22px;font-weight:800;letter-spacing:-.5px">+$47.3M</div>'
    + '<div style="font-size:11px;opacity:.8;margin-top:2px">&#9650; 94% of $50M budget</div>'
    + '</div>'
    + '<div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px">'
    + '<div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">VaR Utilisation</div>'
    + '<div style="font-size:22px;font-weight:800;color:#D97706;letter-spacing:-.5px">62%</div>'
    + '<div style="background:#FEF3C7;border-radius:4px;height:5px;margin-top:6px"><div style="background:#D97706;height:5px;border-radius:4px;width:62%"></div></div>'
    + '</div>'
    + '<div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px">'
    + '<div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Open Positions</div>'
    + '<div style="font-size:22px;font-weight:800;color:#374151;letter-spacing:-.5px">6</div>'
    + '<div style="font-size:11px;color:#6B7280;margin-top:2px">847 trades YTD</div>'
    + '</div>'
    + '<div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px">'
    + '<div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Active Decisions</div>'
    + '<div style="font-size:22px;font-weight:800;color:#DC2626;letter-spacing:-.5px">3</div>'
    + '<div style="font-size:11px;color:#DC2626;margin-top:2px">&#9888; 1 expires in 2h</div>'
    + '</div>'
    + '</div>'

    /* ── MAIN GRID: 3 columns ── */
    + '<div style="display:grid;grid-template-columns:26% 1fr 28%;gap:10px;margin-bottom:10px">'

    /* col 1 — Book P&L */
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + '<div class="card" style="padding:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
    + '<span style="font-size:13px;font-weight:700;color:#374151">Book P&amp;L</span>'
    + '<span class="badge badge-info" id="dash-pnl-time">Today</span>'
    + '</div>'
    + '<div style="font-size:32px;font-weight:800;color:#16A34A;letter-spacing:-1px;margin:6px 0 2px" id="total-pnl-val">+$2.1M</div>'
    + '<div style="font-size:11px;color:#6B7280;margin-bottom:12px">&#9650; $184K from open (unrealised)</div>'
    + '<div id="book-cards"></div>'
    + '</div>'
    + '<div class="card" style="padding:12px;background:linear-gradient(135deg,#F0F7FF,#EFF6FF)">'
    + '<div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:8px">&#127942; Top Performer Today</div>'
    + '<div style="font-size:15px;font-weight:700;color:#111827">Crude &amp; Condensate</div>'
    + '<div style="font-size:22px;font-weight:800;color:#16A34A;margin:3px 0">+$1.24M</div>'
    + '<div style="font-size:11px;color:#6B7280">Brent long 120kbbl · avg entry $82.20 · now $96.97</div>'
    + '</div>'
    + '</div>'

    /* col 2 — Chart + Heat map */
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + '<div class="card" style="padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<span style="font-size:13px;font-weight:700;color:#374151">Intraday P&amp;L</span>'
    + '<span style="display:flex;gap:6px;align-items:center"><span style="width:8px;height:8px;background:#16A34A;border-radius:50%;animation:delayPulse 1.5s infinite"></span><span class="badge badge-info">Live</span></span>'
    + '</div>'
    + '<div style="position:relative;height:160px"><canvas id="intraday-chart"></canvas></div>'
    + '</div>'
    + '<div class="card" style="padding:12px">'
    + '<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">&#128200; Position Heat Map <span style="font-size:11px;font-weight:400;color:#9CA3AF">Commodity × Region</span></div>'
    + '<div id="heat-map-grid"></div>'
    + '</div>'
    + '</div>'

    /* col 3 — Alerts + News */
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div style="padding:10px 12px 8px;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-size:13px;font-weight:700;color:#374151">&#128276; AI Alerts</span>'
    + '<span style="font-size:11px;background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:20px;font-weight:700">2 Active</span>'
    + '</div>'
    + '<div id="dash-alerts" style="padding:8px 12px 10px;max-height:175px;overflow-y:auto"></div>'
    + '</div>'
    + '<div class="card" style="padding:0;overflow:hidden;flex:1">'
    + '<div style="padding:10px 12px 8px;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-size:13px;font-weight:700;color:#374151">&#128240; Market News</span>'
    + '<span style="font-size:11px;color:#9CA3AF">Jun 4, 2026</span>'
    + '</div>'
    + '<div id="dash-news" style="padding:4px 12px 8px;max-height:230px;overflow-y:auto"></div>'
    + '</div>'
    + '</div>'

    + '</div>' /* end 3-col grid */

    /* ── TRADE BLOTTER ── */
    + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div style="padding:10px 14px 8px;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;align-items:center;background:#FAFAFA">'
    + '<span style="font-size:13px;font-weight:700;color:#374151">&#128195; Trade Blotter — Last 20 Trades</span>'
    + '<span id="blotter-update-time" style="font-size:11px;color:#9CA3AF">Updated just now</span>'
    + '</div>'
    + '<div style="max-height:240px;overflow-y:auto">'
    + '<table class="trading-table" style="width:100%"><thead><tr>'
    + '<th>Trade Ref</th><th>Commodity</th><th>Dir</th><th class="right">Volume</th><th class="right">Price</th><th>Counterparty</th><th>Status</th><th>Time</th><th>AI</th>'
    + '</tr></thead><tbody id="blotter-tbody"></tbody></table>'
    + '</div>'
    + '</div>'
    + '</div>';
  loadDashboardData();
};

window.loadDashboardData = async function() {
  const [summary, trades, alerts, news] = await Promise.all([
    apiCall('/positions/summary'), apiCall('/trades/?limit=20'),
    apiCall('/alerts/'), apiCall('/market/news?limit=10')
  ]);
  renderBooks(summary);
  renderBlotter(trades);
  renderAlerts(alerts);
  renderNews(news);
  renderHeatMap();
  setTimeout(renderIntradayChart, 80);
};

function renderBooks(data) {
  var books = (data && data.books) || [
    { name:'Crude & Condensate', pnl:1240000, size:'$84M', icon:'&#128738;', pct:59 },
    { name:'NGL / Ethane',       pnl:680000,  size:'$32M', icon:'&#129514;', pct:32 },
    { name:'Naphtha',            pnl:-140000, size:'$28M', icon:'&#9875;',   pct:-7 },
    { name:'Carbon (EUA)',       pnl:320000,  size:'$14M', icon:'&#127807;', pct:15 }
  ];
  var total = books.reduce(function(s,b){ return s+(b.pnl||0); }, 0);
  var el = document.getElementById('total-pnl-val');
  if (el) { el.textContent = (total>=0?'+$':'−$') + (Math.abs(total)/1e6).toFixed(1)+'M'; el.style.color = total>=0?'#16A34A':'#DC2626'; }
  var container = document.getElementById('book-cards');
  if (!container) return;
  var maxAbs = Math.max.apply(null, books.map(function(b){ return Math.abs(b.pnl); }));
  container.innerHTML = books.map(function(b) {
    var pos = b.pnl >= 0;
    var barW = Math.round(Math.abs(b.pnl)/maxAbs*100);
    var barColor = pos ? '#16A34A' : '#DC2626';
    var bgColor = pos ? '#F0FDF4' : '#FEF2F2';
    var pnlStr = (pos?'+':'-')+'$'+Math.abs(b.pnl/1000).toFixed(0)+'K';
    return '<div style="background:'+bgColor+';border-radius:8px;padding:9px 11px;margin-bottom:6px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'
      + '<span style="font-size:13px">' + (b.icon||'&#128202;') + ' <strong style="color:#111827">' + b.name + '</strong></span>'
      + '<span style="font-size:14px;font-weight:800;color:'+barColor+'">'+pnlStr+'</span>'
      + '</div>'
      + '<div style="background:#E5E7EB;border-radius:3px;height:5px;overflow:hidden">'
      + '<div style="background:'+barColor+';height:5px;border-radius:3px;width:'+barW+'%;transition:width .8s"></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:4px">'
      + '<span style="font-size:10px;color:#9CA3AF">Book size: '+b.size+'</span>'
      + '<span style="font-size:10px;font-weight:700;color:'+barColor+'">'+(b.pct>=0?'+':'')+b.pct+'% today</span>'
      + '</div></div>';
  }).join('');
}

function renderBlotter(data) {
  var trades = (data && (data.trades || (Array.isArray(data)?data:null))) || getDemoTrades();
  var tbody = document.getElementById('blotter-tbody');
  if (!tbody) return;
  window.dashboardFlaggedTrades = {};

  var commColors = { Brent:'#1D4ED8', WTI:'#7C3AED', Urals:'#0F766E', Ethane:'#16A34A', NGLs:'#D97706', EUA:'#15803D', Naphtha:'#9D174D' };
  var commIcons  = { Brent:'&#128738;', WTI:'&#128507;', Urals:'&#127981;', Ethane:'&#129514;', NGLs:'&#9889;', EUA:'&#127807;', Naphtha:'&#9875;' };

  tbody.innerHTML = trades.slice(0,20).map(function(t) {
    var comm = t.commodity || 'Brent';
    var dir = (t.direction||'BUY').toUpperCase();
    var isBuy = dir === 'BUY';
    var status = (t.status||'CONFIRMED').toUpperCase();
    var flagged = !t.ai_reviewed;
    var rowBg = flagged ? '#FFFBEB' : '';
    var commColor = commColors[comm] || '#374151';
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
      + '<td style="font-size:12px;color:#374151">'+(t.counterparty||'Vitol')+'</td>'
      + '<td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:'+(status==='CONFIRMED'?'#DCFCE7':status==='PENDING'?'#FEF9C3':'#FEE2E2')+';color:'+(status==='CONFIRMED'?'#15803D':status==='PENDING'?'#854D0E':'#DC2626')+'">'+status+'</span></td>'
      + '<td style="font-size:12px;color:#9CA3AF">'+time+'</td>'
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
    { severity:'critical', icon:'&#128308;', title:'Fat-finger — Ethane Americas', body:'RMVT-95378: 5,002 MT @ $58.71 — 4× typical volume. P&L +$420K in 15 min.', time:'02:41' },
    { severity:'high',     icon:'&#128992;', title:'JS Ineos Insight — demurrage risk', body:'14h delay past laytime. Est. demurrage $26,250. Three options costed.', time:'Yesterday' },
    { severity:'medium',   icon:'&#128993;', title:'Vitol credit limit 88%', body:'$142M of $160M limit. Two trades pending settlement could push to 97%.', time:'08:15' },
  ];
  var el = document.getElementById('dash-alerts');
  if (!el) return;
  var cfg = { critical:{ bg:'#FEF2F2', bc:'#DC2626', tc:'#991B1B' }, high:{ bg:'#FFF7ED', bc:'#D97706', tc:'#92400E' }, medium:{ bg:'#FEFCE8', bc:'#CA8A04', tc:'#854D0E' } };
  el.innerHTML = (Array.isArray(alerts)?alerts:[]).slice(0,3).map(function(a) {
    var c = cfg[a.severity] || cfg.medium;
    return '<div style="background:'+c.bg+';border-left:3px solid '+c.bc+';border-radius:0 7px 7px 0;padding:8px 10px;margin-bottom:6px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      + '<span style="font-size:12.5px;font-weight:700;color:'+c.tc+'">'+(a.icon||'&#9888;')+' '+(a.title||'')+'</span>'
      + '<span style="font-size:10px;color:#9CA3AF;white-space:nowrap;margin-left:6px">'+(a.time||'')+'</span>'
      + '</div>'
      + '<div style="font-size:11.5px;color:#374151;margin-top:3px;line-height:1.4">'+(a.body||a.description||'')+'</div>'
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
        x: { ticks: { font:{size:10}, maxTicksLimit: 8, color:'#9CA3AF' }, grid: { display:false } },
        y: { ticks: { font:{size:10}, color:'#9CA3AF', callback: function(v) { return '$' + v + 'K'; } }, grid: { color:'#F3F4F6' } }
      }
    }
  });
}

function renderHeatMap() {
  var el = document.getElementById('heat-map-grid');
  if (!el) return;

  // Commodity × Region exposure matrix
  var commodities = ['Brent','Urals','WTI','Ethane','NGLs','EUA'];
  var regions = ['NW Europe','Med','US Gulf','Asia'];

  // net exposure values ($M) — positive=long(blue), negative=short(red), 0=flat(grey)
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
    + '<thead><tr><th style="text-align:left;padding:3px 4px;color:#9CA3AF;font-weight:600;font-size:10px"></th>'
    + regions.map(function(r){ return '<th style="text-align:center;padding:3px 6px;color:#9CA3AF;font-weight:600;font-size:10px;white-space:nowrap">'+r+'</th>'; }).join('')
    + '</tr></thead><tbody>';

  commodities.forEach(function(c) {
    html += '<tr><td style="padding:3px 4px;font-weight:600;color:#374151;white-space:nowrap">' + c + '</td>';
    regions.forEach(function(r) {
      var val = (matrix[c] && matrix[c][r]) || 0;
      var abs = Math.abs(val);
      var intensity = Math.min(abs / 250, 1);
      var bg, fc;
      if (val > 0) {
        // Long — blue scale
        var blue = Math.round(200 - intensity * 140);
        bg = 'rgba(37,99,235,' + (0.12 + intensity * 0.55) + ')';
        fc = intensity > 0.5 ? '#fff' : '#1e40af';
      } else if (val < 0) {
        // Short — red scale
        bg = 'rgba(220,38,38,' + (0.12 + intensity * 0.55) + ')';
        fc = intensity > 0.5 ? '#fff' : '#991b1b';
      } else {
        bg = '#F9FAFB'; fc = '#D1D5DB';
      }
      var label = val !== 0 ? (val > 0 ? '+' : '') + '$' + (abs >= 1 ? abs.toFixed(0) : val.toFixed(0)) + 'M' : '—';
      html += '<td style="text-align:center;padding:4px 6px;background:' + bg + ';border-radius:5px;color:' + fc + ';font-weight:700;min-width:60px">' + label + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>'
    + '<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:#9CA3AF">'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(37,99,235,0.6);border-radius:2px;margin-right:4px"></span>Long position</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(220,38,38,0.6);border-radius:2px;margin-right:4px"></span>Short position</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:2px;margin-right:4px"></span>Flat</span>'
    + '</div></div>';

  el.innerHTML = html;
}

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
        time: a.published_at ? new Date(a.published_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + ' · 4 Jun' : '',
        url: a.url || ''
      };
    });
  }
  if (!articles.length) {
    articles = [
      {id:9,  headline:'Brent surges to $96.97 as UAE signals OPEC exit talks',          sentiment:'bullish', source:'Reuters',    time:'10:14 · 4 Jun', url:''},
      {id:10, headline:'EIA reports 7.97M bbl draw — sixth consecutive weekly reduction', sentiment:'bullish', source:'EIA',       time:'09:30 · 4 Jun', url:''},
      {id:11, headline:'European gas spikes 12% on Russian transit disruption',           sentiment:'bullish', source:'Platts',     time:'08:55 · 4 Jun', url:''},
      {id:12, headline:'Ethane-naphtha spread widens to 14-month high on US supply surge',sentiment:'bullish', source:'ICIS',      time:'08:20 · 4 Jun', url:''},
      {id:13, headline:'China petrochemical imports hit 18-month high in May',            sentiment:'bullish', source:'Argus',     time:'07:45 · 4 Jun', url:''},
      {id:14, headline:'IMO carbon levy $150/tonne advances — 2027 implementation',      sentiment:'bearish', source:"Lloyd's",   time:'06:30 · 4 Jun', url:''},
    ];
  }

  el.innerHTML = articles.slice(0,7).map(function(a) {
    var dot = a.sentiment === 'bullish' ? '&#128994;' : (a.sentiment === 'bearish' ? '&#128308;' : '&#128993;');
    var sentColor = a.sentiment === 'bullish' ? '#16A34A' : (a.sentiment === 'bearish' ? '#DC2626' : '#D97706');
    return '<div style="padding:8px 0;border-bottom:1px solid #F1F5F9;cursor:pointer" '
      + 'onmouseover="this.style.background=\'#F8FAFC\'" onmouseout="this.style.background=\'\'" '
      + 'onclick="openNewsPanel(' + (a.id || 9) + ')">'
      + '<div style="display:flex;gap:7px;align-items:flex-start">'
      + '<span style="font-size:13px;flex-shrink:0;margin-top:2px">' + dot + '</span>'
      + '<div>'
      + '<div style="font-size:12px;color:#111827;line-height:1.4;margin-bottom:3px;font-weight:500">' + a.headline + '</div>'
      + '<div style="font-size:11px;color:#6B7280;display:flex;gap:8px">'
      + '<span style="font-weight:700;color:' + sentColor + '">' + (a.sentiment||'NEUTRAL').toUpperCase() + '</span>'
      + '<span>' + a.source + '</span>'
      + '<span>' + a.time + '</span>'
      + '</div>'
      + '</div></div></div>';
  }).join('');
};

window.applyCurveShift = async function() {
  const input = document.getElementById('curve-shift-input')?.value;
  const result = document.getElementById('curve-shift-result');
  if (!input) return;
  if (result) { result.style.display = 'block'; result.textContent = 'Applying shift...'; }
  const data = await apiCall('/market/curves/shift', { method:'POST', body: JSON.stringify({ instruction: input }) });
  if (result) result.textContent = data?.result || 'Shift applied. Estimated P&L impact: +$84K on current positions.';
};

/* ── SCREEN 8: VESSELS & LOGISTICS ── */
SCREENS['vessels'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">🚢 Vessels & Logistics</div><div class="screen-subtitle">Dragon Fleet tracking · Voyage economics · Cargo pipeline</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadVessels()">⟳ Refresh Fleet</button>
      </div>
    </div>
    <div class="vessel-grid" id="vessel-cards"></div>
    <div class="grid-2">
      <div>
        <div class="card mb-8">
          <div class="card-header"><span class="card-title">⚓ Voyage Economics Calculator</span></div>
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
              ${i===1?'<div class="badge badge-info mt-8">⭐ Recommended by AI</div>':''}
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title mb-8">📦 Cargo Pipeline</div>
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
          <span style="font-size:15px;font-weight:700;color:#111827">🗺 Fleet Position Map</span>
          <span style="font-size:12px;color:#6B7280;margin-left:10px">North Atlantic · Real geography via OpenStreetMap</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer">
            <input type="checkbox" id="ais-traffic-toggle" onchange="toggleAISLayer(this.checked)"
              style="width:16px;height:16px;accent-color:#0066CC">
            <span>🚢 Show vessel traffic</span>
          </label>
          <div style="font-size:11px;color:#94A3B8" id="ais-traffic-note"></div>
        </div>
      </div>
      <div id="vessel-leaflet-map" style="height:480px;width:100%"></div>
      <div style="padding:10px 18px;background:#F8FAFC;border-top:1px solid #F1F5F9;display:flex;gap:18px;font-size:12px">
        <span>🔴 Delayed</span>
        <span>🔵 En Route</span>
        <span>🟠 Loading</span>
        <span>⚫ Ballast (empty)</span>
        <span style="margin-left:auto;color:#6B7280">Hover vessel for details · Click for full info</span>
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
      const eta = v.eta ? new Date(v.eta).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
      const pct = estimateVoyagePct(v.current_lat, v.current_lon, v.origin_port, v.destination_port);
      return {
        name: v.name,
        status: isDelayed ? 'DELAYED' : (v.status||'EN ROUTE').toUpperCase().replace('EN ROUTE','EN ROUTE'),
        route: `${(v.origin_port||'').split(',')[0]} → ${(v.destination_port||'').split(',')[0]}`,
        eta: isDelayed ? eta + ' (+' + Math.round(v.delay_hours) + 'h)' : eta,
        cargo: v.cargo_commodity || 'Ethane',
        volume: v.cargo_volume_mt ? (v.cargo_volume_mt.toLocaleString() + ' MT') : '—',
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
    attribution: '© OpenStreetMap contributors',
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
    
    // Origin → vessel position (dashed, lighter)
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
      html: `<div style="background:${color};width:${isDelayed?16:12}px;height:${isDelayed?16:12}px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:8px">🚢</div>`,
      iconSize: [isDelayed?16:12, isDelayed?16:12],
      iconAnchor: [isDelayed?8:6, isDelayed?8:6]
    });
    
    const shortName = v.name.replace('JS Ineos ','');
    L.marker([v.lat, v.lon], {icon: vesselIcon})
      .addTo(map)
      .bindPopup(`
        <div style="font-family:-apple-system,sans-serif;min-width:180px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px">🚢 ${v.name}</div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Status:</strong> <span style="color:${color}">${v.status}</span></div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Route:</strong> ${v.route}</div>
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><strong>Cargo:</strong> ${v.cargo} · ${v.volume}</div>
          <div style="font-size:12px;color:#374151"><strong>ETA:</strong> <span style="color:${isDelayed?'#DC2626':'#374151'}">${v.eta}</span></div>
          ${isDelayed ? '<div style="margin-top:6px;padding:5px;background:#FEE2E2;border-radius:4px;font-size:11px;color:#DC2626">⚠ 14h delay — cargo impact flagged</div>' : ''}
        </div>
      `);
  });
}

function getDemoVessels() {
  return [
    {name:'JS Ineos Innovation', status:'DELAYED',  route:'Marcus Hook → Rafnes',    eta:'01 Jun +14h', cargo:'Ethane',  volume:'21,500MT', pct:72, delayed:true},
    {name:'JS Ineos Endeavour',  status:'EN ROUTE', route:'Rafnes → Stenungsund',    eta:'02 Jun 06:00', cargo:'Ethane', volume:'22,000MT', pct:45},
    {name:'JS Ineos Intrepid',   status:'LOADING',  route:'Marcus Hook (Loading)',   eta:'04 Jun 08:00', cargo:'Ethane', volume:'21,800MT', pct:15},
    {name:'JS Ineos Insight',    status:'BALLAST',  route:'Rafnes → Marcus Hook',    eta:'—',            cargo:'Ballast',volume:'—',        pct:30},
    {name:'JS Ineos Igloo',      status:'EN ROUTE', route:'Freeport LNG → Brunsbüttel', eta:'06 Jun',   cargo:'LNG',    volume:'74,000M³', pct:60},
    {name:'JS Ineos Inspiration',status:'EN ROUTE', route:'Arzew → Rafnes',          eta:'03 Jun 14:00', cargo:'Ethane', volume:'21,200MT', pct:55}
  ];
}

function renderVesselCards(vessels) {
  const el = document.getElementById('vessel-cards');
  if (!el) return;
  el.innerHTML = vessels.map(v=>`<div class="vessel-card ${v.delayed||v.status==='DELAYED'?'delayed':''}">
    <div class="flex items-center" style="justify-content:space-between;margin-bottom:6px">
      <div class="vessel-name">🚢 ${v.name}</div>
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
    <td>${v.delayed||v.status==='DELAYED'?'<span class="badge badge-critical">⚠ DELAY</span>':'<span class="badge badge-success">OK</span>'}</td>
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
    <!-- JS Ineos Innovation (Marcus Hook → Rafnes, mid-Atlantic) -->
    <circle cx="280" cy="130" r="8" fill="rgba(255,68,68,0.3)" stroke="#FF4444" stroke-width="1.5"/>
    <circle cx="280" cy="130" r="4" fill="#FF4444"/>
    <text x="280" y="120" fill="#FF4444" font-size="8" text-anchor="middle">Innovation ⚠</text>
    <!-- JS Ineos Endeavour (Rafnes → Stenungsund, North Sea) -->
    <circle cx="455" cy="72" r="7" fill="rgba(0,212,255,0.3)" stroke="#00D4FF" stroke-width="1.5"/>
    <circle cx="455" cy="72" r="3" fill="#00D4FF"/>
    <text x="455" y="63" fill="#00D4FF" font-size="8" text-anchor="middle">Endeavour</text>
    <!-- JS Ineos Intrepid (Loading at Marcus Hook) -->
    <circle cx="210" cy="140" r="7" fill="rgba(255,179,71,0.3)" stroke="#FFB347" stroke-width="1.5"/>
    <circle cx="210" cy="140" r="3" fill="#FFB347"/>
    <text x="210" y="152" fill="#FFB347" font-size="8" text-anchor="middle">Intrepid</text>
    <!-- JS Ineos Igloo (Freeport → Brunsbüttel) -->
    <circle cx="320" cy="100" r="7" fill="rgba(0,255,136,0.3)" stroke="#00FF88" stroke-width="1.5"/>
    <circle cx="320" cy="100" r="3" fill="#00FF88"/>
    <text x="320" y="92" fill="#00FF88" font-size="8" text-anchor="middle">Igloo</text>
    <!-- JS Ineos Inspiration (Arzew → Rafnes) -->
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

/* ── SCREEN 9: COMMUNICATIONS HUB ── */
let commsEmailsState = [];
let commsFilterState = 'all';
let commsSelectedId = null;

SCREENS['comms'] = async function(main) {
  commsEmailsState = getDemoEmails();
  commsFilterState = 'all';
  main.innerHTML = `<div class="screen comms-screen">
    <div class="screen-header">
      <div>
        <div class="screen-title">📧 Communications Hub</div>
        <div class="screen-subtitle">AI-prioritised inbox · Smart drafts · Outstanding actions</div>
      </div>
      <div class="screen-actions">
        <span class="comms-live-pill"><span></span> Mail feed live</span>
        <button class="btn btn-secondary btn-sm" onclick="loadComms()">⟳ Refresh</button>
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
          <div class="comms-empty-icon">📧</div>
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
    {id:1, priority:'critical', from:'Vitol Trading — Operations', subject:'URGENT: RMVT-0234 Trade Confirmation Required', summary:'Counterparty requesting written confirmation within 2h or trade will be cancelled.', time:'08:45', unread:true,
      body:'Dear Alex,\n\nWe are following up on verbal agreement from 28 May for the supply of 100,000MT Naphtha CIF NWE.\n\nTrade reference: RMVT-0234\nVolume: 100,000MT\nPrice: $612/MT\nDelivery: 15-20 June 2026\nPort: Flushing, Netherlands\n\nPlease provide written confirmation by 15:00 today to avoid cancellation of the trade.\n\nBest regards,\nMike Johnson\nVitol Trading Operations',
      ai:{summary:'Trade confirmation deadline 15:00 today. $61.2M at risk if not confirmed. Draft reply ready.',priority:'CRITICAL',action:'Send confirmation',deadline:'2h 15m',trade:'RMVT-0234'}},
    {id:2, priority:'high', from:'Rafnes Terminal — Logistics', subject:'JS Ineos Innovation — Berth Delay Update', summary:'Innovation delayed 14 hours. Terminal requires decision on cargo handling by 11:00.', time:'07:55', unread:true,
      body:'Dear INEOS Shipping Team,\n\nThis is to advise that JS Ineos Innovation will arrive at Rafnes Terminal approximately 14 hours behind schedule due to weather delays in the North Atlantic.\n\nExpected arrival: 02 June 2026, 08:00 (was 18:00 01 June)\n\nThe terminal has three berths available. Due to scheduling conflicts, we require your handling preference by 11:00 today.\n\nOptions:\n1. Priority berth — additional cost $45,000\n2. Standard queue — no additional cost, further 6h delay\n3. Reroute to Stenungsund\n\nKind regards,\nRafnes Terminal Operations',
      ai:{summary:'14h vessel delay. Three options available. Decision required by 11:00. Costs calculated.',priority:'HIGH',action:'Choose berth option',deadline:'2h 05m',trade:'Vessel delay'}},
    {id:3, priority:'medium', from:'Alex.Morgan@shell.com', subject:'Brent M+2 swap — indication request', summary:'Shell requesting indicative price for 500kbbl Brent M+2 swap. No urgency.', time:'07:30', unread:false,
      body:'Hi Alex,\n\nCould you give me an indication for a 500kbbl Brent M+2 swap? Looking to hedge some refinery exposure.\n\nNo immediate urgency — happy to discuss later today or tomorrow morning.\n\nThanks,\nAlex Morgan\nShell Trading',
      ai:{summary:'Standard indication request from Shell. No deadline. Auto-draft reply ready.',priority:'MEDIUM',action:'Send indication',deadline:'No deadline',trade:'Potential new trade'}},
    {id:4, priority:'low', from:'Risk Management', subject:'Daily VaR Report — 30 May 2026', summary:'VaR at 62% utilisation. All limits within bounds. No escalation required.', time:'07:00', unread:false,
      body:'Daily VaR Report — 30 May 2026\n\nKey metrics:\n1-Day VaR: $2.1M (62% utilisation)\n10-Day VaR: $6.3M\nBoard Limit: $8.0M\n\nAll positions within approved limits.\nNo escalation required.\n\nRisk Management Team',
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
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(11, 16) || '—';
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
  commsSelectedId = id;
  document.querySelectorAll('.email-row').forEach(r=>r.classList.remove('active'));
  document.getElementById(`email-row-${id}`)?.classList.add('active');
  const meta = getPriorityMeta(e.priority);
  const draftReply = `Dear ${e.from.split(' —')[0].split('@')[0]},\n\nThank you for your message.\n\n${e.id===1?'Please find attached our confirmation for trade RMVT-0234. We confirm the following terms:\n- Volume: 100,000MT Naphtha CIF NWE\n- Price: $612/MT\n- Delivery: 15-20 June 2026\n- Port: Flushing, Netherlands\n\nPlease confirm receipt.':'Noted. We are reviewing the item and will revert with confirmation shortly.'}\n\nBest regards,\nAlex Chen\nINEOS Trading & Shipping`;
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
      <div class="ai-analysis-title"><span>🤖 AI Analysis</span><button class="btn btn-secondary btn-sm" onclick="sendCopilotMessage('Summarise this communication: ${e.subject.replace(/'/g,"\\'")}')">Ask Copilot</button></div>
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
        <button class="btn btn-primary" onclick="sendEmailReply(${id})">📤 Send Reply</button>
        <button class="btn btn-secondary btn-sm" onclick="markEmailActioned(${id})">✓ Mark Actioned</button>
        <button class="btn btn-secondary btn-sm">↩ Forward</button>
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

/* ── SCREEN 10: COMPLIANCE & AUDIT ── */
SCREENS['compliance'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">⚖️ Compliance & Audit</div><div class="screen-subtitle">Regulatory status · Immutable audit trail · AI action log</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadCompliance()">⟳ Refresh</button>
        <button class="btn btn-primary btn-sm">+ New Filing</button>
      </div>
    </div>
    <div class="grid-3 mb-12">
      ${[
        {icon:'🏛',name:'EMIR',    status:'Compliant', deadline:'2 Jun 2026',  last:'28 May 2026', ok:true},
        {icon:'📋',name:'REMIT',   status:'Compliant', deadline:'5 Jun 2026',  last:'27 May 2026', ok:true},
        {icon:'📊',name:'MiFID II',status:'Review',    deadline:'1 Jun 2026',  last:'24 May 2026', ok:false}
      ].map(r=>`<div class="reg-card">
        <span class="reg-icon">${r.icon}</span>
        <div style="flex:1">
          <div class="reg-name">${r.name}</div>
          <div class="reg-deadline">Next deadline: ${r.deadline} &nbsp;|&nbsp; Last filed: ${r.last}</div>
        </div>
        <span class="badge badge-${r.ok?'success':'warning'}">${r.ok?'✓ Compliant':'⚠ Review'}</span>
      </div>`).join('')}
    </div>
    <div class="grid-2">
      <div>
        <div class="card-title mb-8">📋 Immutable Audit Trail</div>
        <div class="filter-bar">
          <select class="form-select"><option>All Types</option><option>Trade</option><option>AI Decision</option><option>System</option></select>
          <input class="form-input" placeholder="Search..." style="width:160px">
        </div>
        <div class="table-container" style="max-height:400px;overflow-y:auto">
          <table class="trading-table"><thead><tr>
            <th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>AI</th><th>Details</th>
          </tr></thead><tbody>
            ${[
              {ts:'08:47:23',user:'alex.chen',action:'Trade Confirmed',entity:'RMVT-0232',ai:'✓',detail:'Brent swap, 200kbbl'},
              {ts:'08:31:15',user:'system',   action:'AI Alert Generated',entity:'ALERT-089',ai:'🤖',detail:'Stale price: Urals M+1'},
              {ts:'08:15:02',user:'alex.chen',action:'Position Updated',entity:'Urals Book',ai:'✓',detail:'Net long 200kbbl'},
              {ts:'07:55:44',user:'system',   action:'Market Data Received',entity:'Brent M0',ai:'—',detail:'$82.40/bbl'},
              {ts:'07:34:01',user:'alex.chen',action:'Login',entity:'Session',ai:'—',detail:'IP: 10.0.1.42'},
              {ts:'07:30:00',user:'system',   action:'EOD Report Generated',entity:'29-May-26',ai:'🤖',detail:'Approved by risk'},
              {ts:'Yesterday',user:'alex.chen',action:'Trade Executed',entity:'RMVT-0229',ai:'✓',detail:'Naphtha long 20kt'},
              {ts:'Yesterday',user:'risk.mgmt',action:'VaR Limit Reviewed',entity:'Board Limit',ai:'—',detail:'$8M unchanged'}
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
        <div class="card-title mb-8">🤖 AI Action Log — All Recommendations</div>
        <div class="table-container" style="max-height:400px;overflow-y:auto">
          <table class="trading-table"><thead><tr>
            <th>Time</th><th>Recommendation</th><th>User Action</th><th>Outcome</th>
          </tr></thead><tbody>
            ${[
              {time:'08:31',rec:'Alert: Stale price Urals',    action:'Accepted',  outcome:'Repriced — saved $24K'},
              {time:'08:15',rec:'Hedge: Increase Urals coverage to 75%', action:'Pending', outcome:'—'},
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
          if (statusEl) statusEl.textContent = reg.status === 'Current' ? '✓ Compliant' : '⚠ ' + reg.status;
        }
      });
    }
  } catch(e) {
    // Compliance screen shows demo data by default - silently ignore
  }
};

/* ── SCREEN 11: BOARDROOM (Executive) ── */
SCREENS['boardroom'] = async function(main) {
  if (!['executive','admin'].includes(currentRole())) {
    main.innerHTML = `<div class="screen flex-center" style="height:60vh"><div class="text-center"><div style="font-size:48px">🔒</div><div class="mt-8 secondary">This screen requires Executive access.</div></div></div>`;
    return;
  }
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">👔 Boardroom View</div><div class="screen-subtitle">Executive performance summary · Capital efficiency · Strategic insights</div></div>
      <div class="screen-actions">
        <button class="btn btn-primary btn-sm" onclick="window.print()">🖨 Export for Board</button>
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
      <div class="quartile-sub">Additional annual desk P&L — achievable with Radiant-MVT decision support</div>
      <button class="btn btn-primary btn-lg mt-12" onclick="exploreTopQuartile()">How we get there →</button>
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

/* ── SCREEN 12: ADMIN / DEMO CONTROL ── */
SCREENS['admin'] = async function(main) {
  if (!['admin'].includes(currentRole())) {
    main.innerHTML = `<div class="screen flex-center" style="height:60vh"><div class="text-center"><div style="font-size:48px">🔒</div><div class="mt-8 secondary">Admin access required.</div></div></div>`;
    return;
  }
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">⚙️ Admin / Demo Control</div><div class="screen-subtitle">Scenario triggers · AI configuration · System status</div></div>
    </div>
    <div class="card mb-12">
      <div class="card-title mb-12">🎭 Demo Scenarios</div>
      <div class="scenario-grid">
        ${[
          {key:'fat_finger',   emoji:'🔴', name:'Fat Finger',        desc:'Simulate a 10x position entry error', sev:'critical'},
          {key:'urals_arb',    emoji:'🟠', name:'Urals Arb',          desc:'Brent/Urals spread opportunity opens', sev:'high'},
          {key:'dragon_delay', emoji:'🟡', name:'Dragon Fleet Delay', desc:'Innovation delayed 14h at Rafnes', sev:'medium'},
          {key:'stale_price',  emoji:'🔴', name:'Stale Price',        desc:'Thomson Reuters feed goes stale', sev:'critical'},
          {key:'margin_breach',emoji:'🔴', name:'Margin Breach',      desc:'ICE margin call exceeds threshold', sev:'critical'},
          {key:'eod_briefing', emoji:'🟢', name:'EOD Briefing',       desc:'End of day AI narrative generation', sev:'low'}
        ].map(s=>`<div class="scenario-btn ${s.sev}" onclick="triggerScenario('${s.key}','${s.name}')">
          <div class="scenario-emoji">${s.emoji}</div>
          <div class="scenario-name">${s.name}</div>
          <div class="scenario-desc">${s.desc}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="grid-2 mb-12">
      <div class="card">
        <div class="card-title mb-8">🤖 AI Configuration</div>
        <div class="var-row"><span class="var-row-label">Current Provider</span>
          <div class="flex gap-6">
            <button class="btn btn-sm ${'claude'==='claude'?'btn-primary':'btn-secondary'}" onclick="setProvider('claude')">☁ Claude API</button>
            <button class="btn btn-sm ${'claude'==='local'?'btn-primary':'btn-secondary'}"  onclick="setProvider('local')">🔒 Local LLM</button>
          </div>
        </div>
        <div class="var-row mt-8"><span class="var-row-label">Claude Status</span><span class="var-row-value positive"><span class="status-dot green"></span>Connected</span></div>
        <div class="var-row"><span class="var-row-label">Local LLM Status</span><span class="var-row-value muted"><span class="status-dot amber"></span>Not configured</span></div>
        <div class="var-row"><span class="var-row-label">Data Egress</span><span class="var-row-value warning-text">${'claude'==='claude'?'☁ Cloud API':'🔒 On-premise'}</span></div>
        <div class="flex gap-8 mt-8">
          <button class="btn btn-secondary btn-sm" onclick="testAI('claude')">Test Claude</button>
          <button class="btn btn-secondary btn-sm" onclick="testAI('local')">Test Local</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title mb-8">📊 System Status</div>
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
  localStorage.setItem('radiant_ai_provider', provider);
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


/* ── VaR Calculation Modal ── */
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
          <div style="font-size:20px;font-weight:700;color:#111827">⚡ How VaR is Calculated</div>
          <div style="font-size:13px;color:#6B7280;margin-top:3px">Parametric Value at Risk — 99% Confidence</div>
        </div>
        <button onclick="document.getElementById('var-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6B7280">✕</button>
      </div>

      <!-- Formula -->
      <div style="background:#F0F7FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px 18px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#2563EB;margin-bottom:10px">Core Formula</div>
        <div style="font-family:monospace;font-size:15px;font-weight:700;color:#1A2332;text-align:center;padding:8px 0">
          VaR₁ = Exposure × σ × Z<sub>99%</sub>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
          <div style="background:white;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:#6B7280;margin-bottom:3px">Exposure</div>
            <div style="font-size:15px;font-weight:700;font-family:monospace">|Net position|<br>× Current price</div>
          </div>
          <div style="background:white;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:#6B7280;margin-bottom:3px">Daily Volatility (σ)</div>
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
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">Worked Example — Brent Book</div>
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
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">WTI (paper short)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">−150,000 bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$78.90/bbl</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$11.8M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$412K</td></tr>
            <tr><td style="padding:8px 12px;border-bottom:1px solid #F1F5F9">Ethane (Dragon cargo)</td><td style="padding:8px 12px;text-align:right;font-family:monospace">+85,000 MT</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$315/MT</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$26.8M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$934K</td></tr>
            <tr style="background:#F8FAFC;font-weight:700"><td style="padding:8px 12px;font-weight:700">Total Portfolio</td><td style="padding:8px 12px;text-align:right;font-family:monospace">—</td><td style="padding:8px 12px;text-align:right">—</td><td style="padding:8px 12px;text-align:right;font-family:monospace">$54.7M</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:#0066CC">$2.1M</td></tr>
          </tbody>
        </table>
        <div style="font-size:11.5px;color:#6B7280;margin-top:8px">Note: VaR contributions add as sum (conservative — ignores diversification benefit). Net: 1.5% × 2.326 × $60.3M gross = $2.1M</div>
      </div>

      <!-- Scaling to 10-day -->
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:14px 16px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#15803D;margin-bottom:8px">10-Day VaR (Square-Root-of-Time Scaling)</div>
        <div style="font-family:monospace;font-size:14px;font-weight:700;color:#111827;text-align:center">
          VaR₁₀ = VaR₁ × √10 = $2.1M × 3.162 = <span style="color:#15803D">$6.3M</span>
        </div>
        <div style="font-size:12px;color:#374151;margin-top:8px">This assumes price changes are i.i.d. (independent and identically distributed) — a standard regulatory assumption under Basel III.</div>
      </div>

      <!-- Stressed VaR -->
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:14px 16px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#D97706;margin-bottom:8px">Stressed VaR — Historical Shock Scenarios</div>
        <div style="font-size:13px;color:#374151;margin-bottom:8px">Uses actual 2008/2020/2022 oil price moves rather than 1.5% assumption:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2008 crash</div><div style="font-weight:700;font-family:monospace">σ = 8.2%</div><div style="font-size:11px;color:#D97706">VaR = $11.5M</div></div>
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2020 COVID</div><div style="font-weight:700;font-family:monospace">σ = 6.1%</div><div style="font-size:11px;color:#D97706">VaR = $8.5M</div></div>
          <div style="background:white;border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;color:#6B7280">2022 Ukraine</div><div style="font-weight:700;font-family:monospace">σ = 4.8%</div><div style="font-size:11px;color:#D97706">VaR = $6.7M</div></div>
        </div>
        <div style="font-size:12px;color:#374151;margin-top:8px;font-weight:600">Regulatory stressed VaR reported: $9.4M (worst-case 3-month stress window)</div>
      </div>

      <!-- Limits -->
      <div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">Board-Approved Limits</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div><span style="color:#6B7280">1-Day VaR limit:</span> <strong>$8.0M</strong></div>
          <div><span style="color:#6B7280">Current utilisation:</span> <strong style="color:#D97706">62% ⚠️</strong></div>
          <div><span style="color:#6B7280">10-Day VaR limit:</span> <strong>$25.0M</strong></div>
          <div><span style="color:#6B7280">Breach threshold:</span> <strong>80% — escalate to CRO</strong></div>
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
/* ── SCREEN: POSITIONS & RISK ── */
SCREENS['positions'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">📈 Positions & Risk</div><div class="screen-subtitle">Full position book with VaR analysis</div></div>
      <div class="screen-actions">
        <select id="pos-book" style="border:1px solid #E5E7EB;border-radius:7px;padding:7px 12px;font-size:13px">
          <option>All Books</option><option>Crude</option><option>Ethane</option><option>NGLs</option><option>Carbon</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="loadPositions()">⟳ Refresh</button>
      </div>
    </div>

    <!-- Explainer cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:18px">
      <div style="background:white;border:1px solid #E5E7EB;border-radius:10px;padding:13px 15px;border-left:4px solid #0066CC">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:5px">Physical Cargo</div>
        <div style="font-size:12.5px;color:#374151;line-height:1.5">Real barrels or tonnes we've <strong>bought or sold</strong> — actual cargo on ships or through pipelines.</div>
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
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">&#128200; Delivery Profile — Exposure by Tenor</div>
          <div style="position:relative;height:170px"><canvas id="exposure-chart"></canvas></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="var-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #F1F5F9">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-size:15px;font-weight:700;color:#111827">⚡ Value at Risk</div>
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
              <div style="font-size:11px;color:#6B7280;margin-top:2px">1-day × √10 Basel III</div>
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
          ${[['🛢 Crude','$1.24M',59],['🧪 Ethane','$0.52M',25],['⚡ NGLs','$0.19M',9],['🌿 Carbon','$0.15M',7]].map(([b,v,p])=>`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F9FAFB">
              <span style="font-size:13px;font-weight:600;color:#111827;width:90px">${b}</span>
              <div style="flex:1;background:#F1F5F9;border-radius:3px;height:6px"><div style="background:#0066CC;height:100%;width:${p}%;border-radius:3px"></div></div>
              <span style="font-size:12px;font-weight:700;font-family:monospace;color:#0066CC;min-width:42px">${v}</span>
            </div>`).join('')}
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:7px;padding:10px 12px;margin-top:12px">
            <div style="font-size:11px;font-weight:700;color:#D97706;margin-bottom:3px">⚠ Stressed VaR</div>
            <div style="font-size:20px;font-weight:800;font-family:monospace">$9.4M</div>
            <div style="font-size:11px;color:#6B7280">2008/2020/2022 shock scenarios</div>
          </div>
        </div>
        <div class="chart-card">
          <div class="card-title mb-8">🏦 Counterparty Exposure (Top 5)</div>
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

/* ── POSITIONS: loadPositions ── */
window.loadPositions = async function() {
  var tbody = document.getElementById('positions-tbody');
  if (!tbody) return;

  var data = await apiCall('/positions/');
  var rows = (data && Array.isArray(data) ? data : (data && data.positions ? data.positions : [])) || [];

  // Per-commodity VaR lookup (parametric 99%, 1-day)
  var VAR_DATA = {
    Brent:  {var1d:1240000, vol:'1.82%', z:'1.65', notional:'$11.6M', stressed:'$3.72M',
             formula:'Net 120kbbl × $96.97 price × 1.82% daily vol × 1.65 z-score',
             drivers:['30-day realised vol: 1.82%/day','Net long after 71% paper hedge','Brent/WTI corr 0.94 gives portfolio netting benefit','UAE OPEC exit risk adds tail premium'],
             scenarios:[['OPEC surprise cut −5%','+$580K'],['Demand shock −10%','−$1.16M'],['2020-style crash −20%','−$2.32M']]},
    Urals:  {var1d:520000,  vol:'2.21%', z:'1.65', notional:'$6.1M',  stressed:'$1.56M',
             formula:'Net 80kbbl × $76.65 price × 2.21% daily vol × 1.65 z-score',
             drivers:['Urals vol 2.21%/day — higher than Brent due to sanctions premium','Zero paper hedge — fully unhedged physical long','Brent/Urals spread risk adds 0.4% incremental vol','Indian buyer concentration creates liquidity risk'],
             scenarios:[['Spread blowout −$8/bbl','−$640K'],['Price −10%','−$613K'],['Sanctions tightening','−$900K']]},
    WTI:    {var1d:190000,  vol:'1.74%', z:'1.65', notional:'$11.6M', stressed:'$570K',
             formula:'Net −150kbbl SHORT × $77.52 × 1.74% × 1.65 — risk is price RISE',
             drivers:['Short position — upside moves are losses','Fully hedged (100%) via paper short','Low residual vol after hedge: 1.74%/day','WTI/Brent spread compression is primary risk'],
             scenarios:[['Price rise +5%','−$194K'],['+10% supply cut','−$387K'],['Short squeeze','−$580K']]},
    Ethane: {var1d:520000,  vol:'1.98%', z:'1.65', notional:'$27.8M', stressed:'$1.56M',
             formula:'Net 85,000 MT × $326.92/MT × 1.98% daily vol × 1.65 z-score',
             drivers:['Unhedged — no paper cover on physical long','TTF gas correlation 0.71 adds European risk','Dragon fleet scheduling creates delivery concentration','Naphtha substitution economics affect demand curve'],
             scenarios:[['−5% ethane price','−$139K'],['China cracker outage','−$830K'],['TTF gas collapse −20%','−$415K']]},
    NGLs:   {var1d:190000,  vol:'1.63%', z:'1.65', notional:'$176K',  stressed:'$570K',
             formula:'Net 3,000 MT × $58.80/MT × 1.63% × 1.65 z-score',
             drivers:['Small net position after 80% paper hedge','Correlated with ethane (0.82) — diversification limited','Propane/butane split adds basis risk vs index','Low standalone risk but adds to portfolio correlation'],
             scenarios:[['−5%','−$8.8K'],['Ethane spread blow','−$52K'],['−10%','−$17.6K']]},
    EUA:    {var1d:150000,  vol:'2.44%', z:'1.65', notional:'$2.5M',  stressed:'$450K',
             formula:'Net 40,000 t × $62.18/t × 2.44% daily vol × 1.65 z-score',
             drivers:['Highest vol in book: 2.44%/day — policy-driven spikes','EU carbon policy risk — announcements cause step-changes','67% hedged via paper short','IMO 2027 levy announcement adds tail upside risk'],
             scenarios:[['Policy reversal −15%','−$374K'],['Supply glut −20%','−$498K'],['Mandate tightening +15%','+$374K']]},
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
    var varStr = vd ? '$' + (vd.var1d/1000).toFixed(0) + 'K' : '—';
    return '<tr>'
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

/* ── PER-COMMODITY VaR MODAL ── */
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
    + '<div><div style="color:white;font-size:17px;font-weight:800">&#9889; VaR Breakdown — ' + commodity + '</div>'
    + '<div style="color:rgba(255,255,255,.75);font-size:12px;margin-top:3px">Parametric method · 99% confidence · 1-day horizon</div></div>'
    + '<button onclick="document.getElementById(\'var-modal\').remove()" style="background:rgba(255,255,255,.15);border:none;color:white;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:30px">&#10005;</button>'
    + '</div>'

    /* KPI row */
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#E5E7EB">'
    + '<div style="background:#F0F7FF;padding:14px 16px;text-align:center"><div style="font-size:10px;font-weight:700;color:#2563EB;text-transform:uppercase;margin-bottom:4px">1-Day VaR</div><div style="font-size:24px;font-weight:800;font-family:monospace;color:#1e40af">$' + var1dM + 'M</div><div style="font-size:11px;color:#6B7280;margin-top:2px">99% confidence</div></div>'
    + '<div style="background:#F0FDF4;padding:14px 16px;text-align:center"><div style="font-size:10px;font-weight:700;color:#16A34A;text-transform:uppercase;margin-bottom:4px">10-Day VaR</div><div style="font-size:24px;font-weight:800;font-family:monospace;color:#15803D">$' + var10d + 'M</div><div style="font-size:11px;color:#6B7280;margin-top:2px">× √10 Basel III</div></div>'
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

/* ── SCREEN: AI INTELLIGENCE ── */
SCREENS['ai'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">🤖 AI Intelligence Centre</div><div class="screen-subtitle">Hedge advisor · Trade ideas · Anomaly detection · Pre-mortem analysis</div></div>
      <div class="screen-actions">
        <span class="ai-provider-badge"><span class="dot"></span>${(window.aiProvider === 'claude' || window.aiProvider?.() === 'claude') ? '🤖 Radiant AI' : '🔒 Local AI'}</span>
      </div>
    </div>
    <div class="ai-3col">
      <div class="ai-panel">
        <div class="ai-panel-title">🛡 Hedge Advisor <button class="ai-panel-expand-btn" onclick="expandPanel(this)">⤢ Expand</button></div>
        <div class="form-group">
          <label class="form-label">Select Position to Hedge</label>
          <select class="form-select" id="hedge-position">
            <option value="">Choose a position...</option>
            <option value="urals">Urals — 200kbbl net long (MED)</option>
            <option value="ethane">Ethane — 20kt net long (EU)</option>
            <option value="brent">Brent — 120kbbl net long (NWE)</option>
            <option value="naphtha">Naphtha — 20kt net long (NWE)</option>
          </select>
        </div>
        <button class="btn btn-primary w-full" onclick="runHedgeAdvisor()">🤖 Get AI Recommendation</button>
        <div id="hedge-factors" style="display:none;margin-top:12px">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">Factor Attribution</div>
          <div id="factor-bars"></div>
          <div class="option-overlay-hint" style="margin-top:8px">💡 Option overlay will be shown in full recommendation</div>
        </div>
        <div class="streaming-box" id="hedge-result" style="display:none;margin-top:10px;min-height:80px"></div>
      </div>
      <div class="ai-panel">
        <div class="ai-panel-title">💡 Trade Ideas <button class="ai-panel-expand-btn" onclick="expandPanel(this)">⤢ Expand</button></div>
        <button class="btn btn-secondary btn-sm w-full mb-8" onclick="scanTradeIdeas()">🔍 Scan for Opportunities</button>
        <div id="trade-ideas-list">${renderTradeIdeaCards()}</div>
      </div>
      <div class="ai-panel">
        <div class="ai-panel-title">⚠ Anomaly Alerts <button class="ai-panel-expand-btn" onclick="expandPanel(this)">⤢ Expand</button></div>
        <div id="ai-alerts-container"><div class="muted small">Loading alerts...</div></div>
        <div class="di-section mt-8">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px">🔬 Pre-Mortem Analysis</div>
          <button class="btn btn-secondary w-full mb-8" onclick="runPreMortem()">Run Pre-Mortem on Book</button>
          <div id="premortem-results"></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="card">
        <div class="card-title">📈 Price Forecasting — AI Forward Curve View</div>
        <select id="forecast-commodity" onchange="renderForecastChart()" style="border:1px solid #E5E7EB;border-radius:7px;padding:7px 12px;font-size:13px;width:100%;margin-bottom:12px">
          <option value="Brent">Brent Crude</option><option value="WTI">WTI Crude</option>
          <option value="Urals">Urals Crude</option><option value="Ethane">Ethane</option><option value="HH">Henry Hub</option>
        </select>
        <div style="height:150px;position:relative"><canvas id="forecast-chart"></canvas></div>
        <div id="forecast-narrative" style="font-size:13px;color:#374151;line-height:1.6;margin-top:10px;padding-top:10px;border-top:1px solid #F1F5F9">Select commodity and click Generate to see AI forecast.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="generateForecastNarrative()">🤖 Generate AI Forecast</button>
      </div>
      <div class="card">
        <div class="card-title">📰 Event & Sentiment Impact on Book</div>
        <div id="sentiment-impact-list"><div class="muted small">Loading...</div></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="loadSentimentImpact()">↻ Refresh</button>
      </div>
    </div>
  </div>`;
  loadAIAlerts();
  renderForecastChart();
  loadSentimentImpact();
};

/* ── AI INTELLIGENCE: all functions ── */

// Cache so re-entering the screen is instant
var _aiCache = {};

window.loadAIAlerts = function() {
  var el = document.getElementById('ai-alerts-container');
  if (!el) return;
  if (_aiCache.alerts) { el.innerHTML = _aiCache.alerts; return; }

  var alerts = [
    { sev:'critical', icon:'🔴', title:'Fat-finger detected — Ethane Americas book',
      body:'RMVT-95378: BUY 5,002 MT Ethane @ $58.71 — volume 4× typical. Book P&L moved +$420K in 15 min window. Recommend confirmation call to Repsol before settlement.',
      time:'02:41', action:'Review Trade' },
    { sev:'high', icon:'🟠', title:'JS Ineos Insight — demurrage risk',
      body:'14-hour North Sea delay pushes ETA past allowed laytime. Estimated demurrage: $26,250. Three options costed — recommend Option B (partial discharge at Teesside).',
      time:'Yesterday', action:'See Voyage Options' },
    { sev:'high', icon:'🟠', title:'Vitol credit limit 88% utilised',
      body:'Current exposure $142M vs $160M approved limit. Two open trades pending settlement would push to 97%. Recommend suspending new trades until Wed settlement clears.',
      time:'08:15', action:'View Exposure' },
    { sev:'medium', icon:'🟡', title:'Stale price alert — Urals M+2',
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
      + 'style="font-size:11px;padding:3px 10px;border:1px solid '+bc+';background:white;color:'+bc+';border-radius:5px;cursor:pointer">'+a.action+' →</button>'
      + '</div>';
  }).join('');
  _aiCache.alerts = html;
  el.innerHTML = html;
};

window.renderTradeIdeaCards = function() {
  if (_aiCache.tradeIdeas) return _aiCache.tradeIdeas;
  var ideas = [
    { tag:'ARB', tagColor:'#2563EB', title:'Brent/Urals Spread — Long Opportunity',
      summary:'Urals discount to Brent at $20.32/bbl — 2.3σ above 90-day mean. Historical reversion within 8–12 days. 14 of 17 similar setups were profitable.',
      pl:'+$1.4M est.', conf:'High', risk:'Med' },
    { tag:'MOMENTUM', tagColor:'#7C3AED', title:'Ethane Long — Supply Tightness',
      summary:'US ethane exports at record 368kbpd. Dragon fleet utilisation 94%. TTF gas surge improves naphtha substitution economics. Add to long.',
      pl:'+$840K est.', conf:'High', risk:'Low' },
    { tag:'EVENT', tagColor:'#D97706', title:'OPEC+ Meeting Thursday — Vol Play',
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
      + 'style="font-size:11px;padding:2px 10px;border:1px solid #0066CC;background:white;color:#0066CC;border-radius:5px;cursor:pointer;margin-left:auto">Ask AI →</button>'
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
    { event:'UAE OPEC exit talks',        impact:'+$284K', dir:'pos', note:'Long Brent 120kbbl — favourable' },
    { event:'EIA 7.97M bbl draw',         impact:'+$196K', dir:'pos', note:'WTI paper short partially offsets' },
    { event:'TTF gas spike +12%',         impact:'+$142K', dir:'pos', note:'Ethane/naphtha arb improves' },
    { event:'IMO carbon levy 2027',        impact:'-$38K',  dir:'neg', note:'Dragon fleet voyage cost headwind' },
    { event:'China cracker demand +18M',  impact:'+$88K',  dir:'pos', note:'Ethane long position supported' },
  ];
  var html = '<div style="font-size:11px;color:#6B7280;margin-bottom:8px">Today\'s news events vs your open book — AI-calculated impact</div>'
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
    Brent:'Brent is likely to trade in the $92–100 range over the next 90 days. UAE exit risk adds a structural +$3–5 uncertainty premium. The EIA draw sequence is the strongest bullish signal in 6 months. Downside risk: Chinese demand slowdown or surprise OPEC production increase.',
    Ethane:'Ethane prices are expected to remain elevated at $320–340/MT through Q3 2026, supported by record US exports and tight Dragon fleet availability. Key upside risk: further TTF gas rally increasing naphtha crack, widening the arb.',
    WTI:'WTI fundamentals support a $75–82 range. Inventory at 6% below 5-year average is constructive but the WTI/Brent spread may narrow as US export pace moderates.',
    Urals:'Urals likely to trade at $17–22 discount to Brent. Indian buyers remain active at these levels. Russian supply stability and sanctions enforcement are the primary variables.',
    HH:'Henry Hub expected to move toward $3.00–3.30/MMBtu by August as summer cooling demand and LNG feedgas exports compete for supply. Storage deficit supports the bullish case.'
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
    urals: '**Recommended Structure: Brent/Urals Spread Swap + Freight Option**\n\nSell 80,000 bbl Urals forward at current $20.32 discount to lock in current spread. Layer a $2/bbl out-of-the-money Brent cap to protect against further Brent rally pulling the spread wider.\n\n**Cost:** ~$0.18/bbl premium | **Coverage:** 85% of downside risk | **Break-even:** $18.40/bbl spread\n\n⚡ *AI Confidence: High — 14 of 17 similar structures were profitable over 30 days*',
    ethane:'**Recommended Structure: Asian Collar — Long Call / Short Put on Ethane**\n\nBuy Dec-26 ethane call at $340/MT, sell put at $305/MT. Zero-cost collar protects existing long position while retaining $15/MT upside from continued Dragon fleet strength.\n\n**Cost:** Zero-cost collar | **Coverage:** Full downside below $305/MT | **Upside cap:** $340/MT\n\n⚡ *AI Confidence: High — ethane fundamentals strongly bullish, Dragon fleet at 94% utilisation*',
    brent: '**Recommended Structure: Put Spread — Buy $95 Put / Sell $88 Put**\n\nProtects 120,000 bbl Brent long against a UAE OPEC-exit reversal. Net premium $0.92/bbl. Covers the move from current $96.97 down to $88 (the key technical support level).\n\n**Cost:** $0.92/bbl (~$110K total) | **Coverage:** Full protection $95→$88 | **Unhedged upside:** Unlimited above $95\n\n⚡ *AI Confidence: High — binary OPEC risk event Thursday warrants option protection*',
    naphtha:'**Recommended Structure: Naphtha Crack Swap**\n\nSell 20,000 MT naphtha crack at current $142/MT vs feedstock. Lock in current margin before potential ethane substitution pressure reduces crack spreads in Q3.\n\n**Cost:** Zero-premium swap | **Coverage:** Full crack spread lock | **Risk:** Upside foregone if cracks widen further\n\n⚡ *AI Confidence: Medium — monitor ethane/naphtha arb closely; swap only 50% of position*',
  };
  var recText = recs[pos] || recs.brent;

  resultEl.innerHTML = '<div style="font-size:12.5px;color:#374151;line-height:1.7;white-space:pre-wrap">' + recText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>') + '</div>';

  // Flash banner
  var banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#0066CC;color:white;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;z-index:9999;animation:bannerIn .4s ease';
  banner.textContent = '✓ AI Hedge Recommendation Ready';
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
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px;margin-bottom:7px"><strong>1. UAE reversal + demand shock</strong> — If UAE confirms OPEC stay AND China demand misses by 300kbpd, Brent retraces to $88. Loss: <strong style="color:#DC2626">-$8.1M</strong></div>'
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px;margin-bottom:7px"><strong>2. Ethane demand collapse</strong> — European cracker outage >30 days drops ethane to $290/MT. Dragon fleet demurrage compounds. Loss: <strong style="color:#DC2626">-$6.4M</strong></div>'
    + '<div style="background:#FEF2F2;border-radius:7px;padding:9px 12px"><strong>3. Urals spread compression</strong> — Sanctions relief allows Urals back to -$8/bbl. 80kbbl unhedged short at risk. Loss: <strong style="color:#DC2626">-$5.8M</strong></div>'
    + '</div>';
  _aiCache.premortem = html;
  el.innerHTML = html;
};

/* ── SCREEN: PERFORMANCE ── */
SCREENS['performance'] = async function(main) {
  main.innerHTML = `<div class="screen performance-screen">
    <div class="screen-header">
      <div><div class="screen-title">🎯 Performance & Analytics</div><div class="screen-subtitle">YTD tracking · Budget comparison · Opportunity cost</div></div>
      <div class="screen-actions">
        <span class="performance-live-pill"><span></span> P&L book reconciled</span>
        <button class="btn btn-secondary btn-sm" onclick="loadPerformance()">⟳ Refresh</button>
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
        <button class="btn btn-primary btn-sm" style="margin-top:12px;width:100%" onclick="navigateTo('decision-intelligence')">📊 View Full 90-Day Opportunity Audit →</button>
      </div>
      <div class="chart-card performance-shortfall-card">
        <div class="chart-title">🔬 AI Shortfall Investigation</div>
        <div class="shortfall-mini-grid">
          <div><span>Missed signals</span><strong>$1.07M</strong></div>
          <div><span>Execution lag</span><strong>$255K</strong></div>
          <div><span>Risk overrides</span><strong>$346K</strong></div>
        </div>
        <button class="btn btn-primary w-full mb-8" onclick="investigateShortfall()">🔬 Investigate Target Shortfall</button>
        <div id="shortfall-result" style="min-height:120px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:14px;font-size:13px;color:#6B7280">
          Click above to run AI forensic analysis on the shortfall vs target...
        </div>
      </div>
    </div>
  </div>`;
  renderMonthlyChart();
  renderWaterfallChart();
};

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

/* ── SCREEN: MARKET DATA ── */
SCREENS['market'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">📉 Market Data & Curves</div><div class="screen-subtitle">Live prices · Forward curves · Spread analysis · Curve shifter</div></div>
      <div class="screen-actions">
        <button class="btn btn-secondary btn-sm" onclick="loadMarketData()">⟳ Refresh Prices</button>
      </div>
    </div>
    <div class="grid-2" style="gap:16px">
      <div>
        <div class="chart-card" style="margin-bottom:14px">
          <div class="chart-title">Live Prices</div>
          <div id="live-prices-table"><div class="muted small">Loading...</div></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">📊 Key Spreads</div>
          <div id="spread-table"><div class="muted small">Calculating...</div></div>
        </div>
        <div class="chart-card" style="margin-top:14px">
          <div class="chart-title">🔧 Curve Shifter</div>
          <label class="form-label">Shift instruction</label>
          <input type="text" id="curve-shift-input" placeholder="e.g. Shift Brent prompt up $3..." 
            style="border:1px solid #E5E7EB;border-radius:7px;padding:9px 12px;font-size:13px;width:100%;margin-bottom:8px"
            onkeydown="if(event.key==='Enter') applyCurveShift()">
          <button class="btn btn-primary w-full" onclick="applyCurveShift()">Apply Shift & Recalculate</button>
          <div id="curve-shift-result" style="margin-top:10px;font-size:13px;color:#374151"></div>
        </div>
      </div>
      <div>
        <div class="chart-card" style="margin-bottom:14px">
          <div class="chart-title">Forward Curve
            <div class="curve-selector">
              <button class="curve-btn active" onclick="switchMarketCurve('brent',this)">Brent</button>
              <button class="curve-btn" onclick="switchMarketCurve('wti',this)">WTI</button>
              <button class="curve-btn" onclick="switchMarketCurve('ethane',this)">Ethane</button>
              <button class="curve-btn" onclick="switchMarketCurve('naphtha',this)">Naphtha</button>
              <button class="curve-btn" onclick="switchMarketCurve('eua',this)">EUA</button>
            </div>
          </div>
          <div style="height:220px"><canvas id="market-curve-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">📰 Market Headlines</div>
          <div id="market-news-list"><div class="muted small">Loading...</div></div>
        </div>
      </div>
    </div>
  </div>`;
  loadMarketData();
  renderMarketCurveChart('brent');
  loadMarketNews();
};

/* ── SCREEN: DECISION INTELLIGENCE ── */
SCREENS['decision-intelligence'] = async function(main) {
  main.innerHTML = `<div class="screen">
    <div class="screen-header">
      <div><div class="screen-title">🧠 Decision Intelligence</div><div class="screen-subtitle">The three moments that change how traders work</div></div>
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
        <button class="btn btn-primary" onclick="runForensics()">🔬 Investigate Q1 Performance</button>
      </div>
      <div id="forensics-results" style="display:none">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">
          <div class="kpi-card"><div class="kpi-label">Total Shortfall</div><div class="kpi-value negative">−$1.82M</div></div>
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
          <div style="font-size:16px;font-weight:700;color:#111827">Desk Brain™ — Institutional Memory</div>
          <div style="font-size:13px;color:#6B7280">Every trade the desk has ever done. Every outcome. Every failure mode. Queryable in seconds.</div>
        </div>
        <div style="margin-left:auto;background:#F0F7FF;border:1px solid #BFDBFE;border-radius:8px;padding:6px 14px;font-size:11px;color:#1e40af;font-weight:700">847 trades indexed · Jan 2022 – Jun 2026</div>
      </div>

      <!-- Query bar -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="text" id="desk-brain-query"
          value="Brent/Urals spread arb — long Urals, short Brent, Med delivery"
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
            <div style="font-size:12px;opacity:.8;margin-top:2px">Brent/Urals spread trades · Jan 2022 – Jun 2026 · Med &amp; NWE delivery</div>
          </div>
          <div style="display:flex;gap:20px">
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">+$2.8M</div><div style="font-size:10px;opacity:.75">Avg P&amp;L</div></div>
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">82%</div><div style="font-size:10px;opacity:.75">Win rate</div></div>
            <div style="text-align:center;color:white"><div style="font-size:22px;font-weight:800">8.4d</div><div style="font-size:10px;opacity:.75">Avg hold</div></div>
          </div>
        </div>

        <!-- P&L outcomes + Trade timeline side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">

          <!-- P&L Distribution -->
          <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">&#128202; P&amp;L Distribution — All 17 Trades</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${[
                ['>$5M profit',   3, '#16A34A', '+$7.1M best (Aug 2023)'],
                ['$2–5M profit',  6, '#22C55E', 'Most common outcome'],
                ['$0–2M profit',  5, '#86EFAC', 'Modest gains'],
                ['Loss < $2M',    2, '#FCA5A5', 'Spread didn\'t compress'],
                ['Loss > $2M',    1, '#DC2626', '-$3.4M worst (Feb 2024)'],
              ].map(([label, count, color, note]) => {
                const w = Math.round(count/17*100);
                return `<div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                    <span style="font-size:11px;font-weight:600;color:#374151">${label}</span>
                    <span style="font-size:11px;color:#6B7280">${count} trades (${w}%)</span>
                  </div>
                  <div style="background:#E5E7EB;border-radius:3px;height:8px;overflow:hidden">
                    <div style="background:${color};height:8px;border-radius:3px;width:${w}%;transition:width 1s"></div>
                  </div>
                  <div style="font-size:10px;color:#9CA3AF;margin-top:1px">${note}</div>
                </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Trade history timeline -->
          <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">&#128197; Recent Similar Trades</div>
            <div style="display:flex;flex-direction:column;gap:1px">
              ${[
                ['Mar 2026', '+$3.2M', 'Urals +$14/bbl spread compression over 9 days', 'pos'],
                ['Jan 2026', '+$1.8M', 'Partial — exited early on geopolitical noise', 'pos'],
                ['Sep 2025', '+$5.4M', 'Perfect entry — spread at 2.8σ, held full duration', 'pos'],
                ['Jun 2025', '+$4.1M', 'Indian buyer demand drove Urals recovery vs Brent', 'pos'],
                ['Feb 2024', '-$3.4M', '⚠ FAILED — freight widened faster than basis compressed', 'neg'],
                ['Oct 2023', '+$2.9M', 'VLCC shortage briefly squeezed spread', 'pos'],
                ['Aug 2023', '+$7.1M', '&#127942; Best ever — 14-day hold, Primorsk supply disruption', 'pos'],
              ].map(([date, pnl, note, dir]) => {
                const bg = dir==='pos'?'#F0FDF4':'#FEF2F2';
                const col = dir==='pos'?'#16A34A':'#DC2626';
                return `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 8px;border-radius:6px;background:${bg};margin-bottom:4px">
                  <span style="font-size:10px;color:#9CA3AF;white-space:nowrap;min-width:48px;margin-top:1px">${date}</span>
                  <div style="flex:1"><div style="font-size:11px;color:#374151;line-height:1.4">${note}</div></div>
                  <span style="font-size:12px;font-weight:800;font-family:monospace;color:${col};white-space:nowrap">${pnl}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Failure mode analysis — the key insight -->
        <div style="border:2px solid #FCD34D;background:#FFFBEB;border-radius:10px;padding:14px 16px;margin-bottom:14px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:24px;flex-shrink:0">&#9888;</span>
            <div>
              <div style="font-size:13px;font-weight:800;color:#D97706;margin-bottom:5px">Failure Mode Identified — Feb 2024 resembles current conditions</div>
              <div style="font-size:12.5px;color:#374151;line-height:1.6;margin-bottom:8px">The only losing trade in this category failed because <strong>Baltic freight rates widened +$4.20/MT in 5 days</strong> (Primorsk ice season), eating the spread compression gain before Urals could recover. The position was held 3 days too long.</div>
              <div style="display:flex;gap:12px">
                <div style="background:white;border:1px solid #FCD34D;border-radius:7px;padding:8px 12px;flex:1">
                  <div style="font-size:10px;font-weight:700;color:#D97706;margin-bottom:3px">THEN (Feb 2024)</div>
                  <div style="font-size:11px;color:#374151">Freight vol: <strong>2.3σ</strong> above mean · Spread: −$19.80/bbl</div>
                </div>
                <div style="background:white;border:2px solid #DC2626;border-radius:7px;padding:8px 12px;flex:1">
                  <div style="font-size:10px;font-weight:700;color:#DC2626;margin-bottom:3px">NOW (Jun 2026) &#128308; WATCH</div>
                  <div style="font-size:11px;color:#374151">Freight vol: <strong>2.1σ</strong> above mean · Spread: −$20.32/bbl</div>
                </div>
              </div>
              <div style="margin-top:10px;font-size:12px;color:#92400E;font-weight:600">&#128161; Recommendation: If entering this trade, set a hard exit at −$2/bbl freight move within 48h. Don't repeat Feb 2024.</div>
            </div>
          </div>
        </div>

        <!-- Ask AI button -->
        <div style="display:flex;gap:10px">
          <button onclick="window.sendCopilotMessage && window.sendCopilotMessage('Based on Desk Brain history of Brent/Urals spread trades, should I enter this trade today given current Brent at $96.97 and Urals at $76.57? What entry/exit conditions should I set?')"
            style="flex:1;padding:11px;background:#0066CC;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
            &#129504; Ask AI: Should I enter this trade today?
          </button>
          <button onclick="window.sendCopilotMessage && window.sendCopilotMessage('What were the exact entry and exit conditions for the best Brent/Urals spread trade in Aug 2023 that returned $7.1M?')"
            style="flex:1;padding:11px;background:white;color:#0066CC;border:2px solid #0066CC;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
            &#127942; How did we make $7.1M in Aug 2023?
          </button>
        </div>
      </div>
    </div>
    <div class="di-section" style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px;font-weight:900;color:#E5E7EB">03</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#111827">Opportunity Cost Engine</div>
            <div style="font-size:13px;color:#6B7280">90-day audit: what was available, what was captured, what was left on the table.</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="runOpportunityCost()">📊 Run 90-Day Audit</button>
      </div>
      <div id="opportunity-results" style="display:none">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
          <div class="kpi-card"><div class="kpi-label">Opportunities Available</div><div class="kpi-value accent">17</div></div>
          <div class="kpi-card"><div class="kpi-label">Captured</div><div class="kpi-value positive">6 (35%)</div></div>
          <div class="kpi-card"><div class="kpi-label">Missed P&L</div><div class="kpi-value negative">$8.7M</div></div>
        </div>
        <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:14px 16px;font-size:13.5px;color:#92400E;line-height:1.6">
          <strong>$8.7M</strong> in strategy-aligned opportunities were available in the last 90 days. 
          11 of 17 were missed — identified after the optimal entry window closed. 
          Radiant-MVT would have surfaced all 17 within <strong>12 minutes</strong> of the trigger event.
        </div>
        <div id="opportunity-narrative" class="streaming-box" style="margin-top:10px;min-height:60px"></div>
      </div>
    </div>
  </div>`;
};

/* Helpers for new screens */
window.loadMarketData = async function() {
  const data = await apiCall('/market/prices');
  const el = document.getElementById('live-prices-table');
  if (!el) return;
  const prices = data?.length > 0 ? data : [
    {commodity:'Brent',price:96.97,change_pct_1d:-0.86},{commodity:'WTI',price:93.80,change_pct_1d:0.52},
    {commodity:'Urals',price:90.15,change_pct_1d:-0.44},{commodity:'Ethane',price:316.9,change_pct_1d:0.38},
    {commodity:'HH',price:3.17,change_pct_1d:-1.24},{commodity:'EUA',price:63.40,change_pct_1d:0.22}
  ];
  el.innerHTML = '<table class="trading-table"><thead><tr><th>Commodity</th><th class="right">Price</th><th class="right">Change</th></tr></thead><tbody>' +
    prices.map(p=>`<tr><td class="semibold">${p.commodity}</td>
      <td class="right mono">${Number(p.price).toFixed(2)}</td>
      <td class="right ${(p.change_pct_1d||0)>=0?'positive':'negative'}">${(p.change_pct_1d||0)>=0?'▲':'▼'} ${Math.abs(p.change_pct_1d||0).toFixed(2)}%</td>
    </tr>`).join('') + '</tbody></table>';
  const spreadEl = document.getElementById('spread-table');
  if (spreadEl) {
    const brent = prices.find(p=>p.commodity==='Brent')?.price||97;
    const urals = prices.find(p=>p.commodity==='Urals')?.price||90;
    const wti = prices.find(p=>p.commodity==='WTI')?.price||94;
    const eth = prices.find(p=>p.commodity==='Ethane')?.price||317;
    spreadEl.innerHTML = `<table class="trading-table"><thead><tr><th>Spread</th><th class="right">Value</th><th class="right">Signal</th></tr></thead><tbody>
      <tr><td>Brent/Urals</td><td class="right mono negative">$${(brent-urals).toFixed(2)}/bbl</td><td class="right"><span style="color:#DC2626;font-weight:700">Wide — Arb signal</span></td></tr>
      <tr><td>WTI/Brent</td><td class="right mono">$${(wti-brent).toFixed(2)}/bbl</td><td class="right muted">Normal</td></tr>
      <tr><td>Eth/Naphtha</td><td class="right mono positive">$${(612-eth/3.7).toFixed(0)}/MT</td><td class="right positive">Ethane cheaper</td></tr>
    </tbody></table>`;
  }
};

window.loadMarketNews = async function() {
  const el = document.getElementById('market-news-list');
  if (!el) return;
  const news = await apiCall('/market/news?limit=6');
  const articles = (news?.articles||news||[]).slice(0,6);
  if (!articles.length) { el.innerHTML = '<div class="muted small">No news loaded</div>'; return; }
  el.innerHTML = articles.map(a=>`<div style="padding:8px 0;border-bottom:1px solid #F9FAFB;cursor:${a.url?'pointer':'default'}"
    onclick="${a.url?'window.open(\''+a.url+'\',\'_blank\')':''}">
    <div style="font-size:12.5px;font-weight:500;color:#111827;margin-bottom:2px">${a.headline||a.title}</div>
    <div style="font-size:11px;color:#6B7280">${a.source||'Reuters'} · ${a.time||a.published_at?.slice(11,16)||'—'}
      ${a.url?'<span style="color:#0066CC;margin-left:6px">↗</span>':''}</div>
  </div>`).join('');
};

window.switchMarketCurve = function(commodity, btn) {
  document.querySelectorAll('.curve-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderMarketCurveChart(commodity);
};

window.renderMarketCurveChart = function(commodity) {
  const canvas = document.getElementById('market-curve-chart');
  if (!canvas||typeof Chart==='undefined') return;
  if (canvas._chart) canvas._chart.destroy();
  const months = ['M0','M1','M2','M3','M4','M5','M6','M9','M12'];
  const bases = {brent:96.97,wti:93.80,ethane:316.9,naphtha:612,eua:63.4};
  const base = bases[commodity]||97;
  const today = months.map((_,i)=>parseFloat((base*(1-i*0.003)+(Math.random()-0.5)*base*0.01).toFixed(3)));
  const yesterday = today.map(v=>v-(Math.random()*0.8+0.2));
  canvas._chart = new Chart(canvas,{type:'line',data:{labels:months,datasets:[
    {label:'Today',data:today,borderColor:'#0066CC',backgroundColor:'rgba(0,102,204,.08)',borderWidth:2,pointRadius:3,fill:true,tension:0.3},
    {label:'Yesterday',data:yesterday,borderColor:'#94A3B8',borderWidth:1.5,pointRadius:0,borderDash:[4,4],tension:0.3}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{font:{size:11},boxWidth:12}}},
    scales:{x:{grid:{color:'#F1F5F9'},ticks:{font:{size:10}}},y:{grid:{color:'#F1F5F9'},ticks:{font:{size:10},callback:v=>'$'+v.toFixed(0)}}}}});
};

window.runForensics = async function() {
  const el = document.getElementById('forensics-results');
  const narrative = document.getElementById('forensics-narrative');
  if (el) el.style.display = 'block';
  if (narrative) await streamToElement(narrative, '/chat/message', {
    message: 'Summarise in 3 sentences why Q1 missed target by $1.82M. Key factors: missed opportunities 59%, delayed execution 14%, losing trades 19%, sizing decisions 8%.',
    screen_context: 'decision_intelligence'
  });
};

window.runDeskBrain = async function() {
  const query = document.getElementById('desk-brain-query')?.value;
  if (!query) return;
  const el = document.getElementById('desk-brain-results');
  if (!el) return;
  el.textContent = '';
  await streamToElement(el, '/chat/message', {
    message: `Desk Brain query: "${query}". Based on the desk's trading history since 2022, describe similar structures, typical P&L ranges, common failure modes, and whether current market conditions resemble past successful setups.`,
    screen_context: 'desk_brain'
  });
};

window.runOpportunityCost = async function() {
  const el = document.getElementById('opportunity-results');
  const narrative = document.getElementById('opportunity-narrative');
  if (el) el.style.display = 'block';
  if (narrative) await streamToElement(narrative, '/chat/message', {
    message: 'Give a 2-sentence executive conclusion on the $8.7M opportunity cost in 90 days and the single most important operational change to capture more of these opportunities.',
    screen_context: 'opportunity_cost'
  });
  showAIReadyBanner && showAIReadyBanner('Opportunity Audit Complete', '17 opportunities analysed · $8.7M gap quantified · Most common reason: identified 4+ hours too late');
};
