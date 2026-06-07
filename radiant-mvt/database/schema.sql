PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('trader','risk','executive','admin')),
    desk TEXT DEFAULT 'INEOS Trading & Shipping',
    title TEXT,
    is_active INTEGER DEFAULT 1,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    commodity TEXT NOT NULL,
    trader_id INTEGER REFERENCES users(id),
    annual_target REAL,
    strategy TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS counterparties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT,
    country TEXT,
    credit_limit REAL,
    credit_used REAL DEFAULT 0,
    isda_status TEXT DEFAULT 'Signed',
    typical_trade_size_bbl REAL,
    preferred_commodities TEXT,
    avg_response_hours REAL,
    seasonal_activity TEXT,
    relationship_since INTEGER,
    contact_name TEXT,
    contact_email TEXT
);

CREATE TABLE IF NOT EXISTS vessels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    imo_number TEXT,
    capacity_m3 REAL DEFAULT 27500,
    vessel_type TEXT DEFAULT 'Multi-gas carrier',
    flag TEXT DEFAULT 'Bahamas',
    current_lat REAL,
    current_lon REAL,
    origin_port TEXT,
    destination_port TEXT,
    eta TIMESTAMP,
    original_eta TIMESTAMP,
    delay_hours REAL DEFAULT 0,
    status TEXT DEFAULT 'En Route',
    cargo_commodity TEXT DEFAULT 'Ethane',
    cargo_volume_mt REAL,
    charter_party_rate REAL DEFAULT 45000,
    allowed_laytime_hours REAL DEFAULT 36,
    booked_counterparty_id INTEGER REFERENCES counterparties(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_ref TEXT UNIQUE NOT NULL,
    book_id INTEGER REFERENCES books(id),
    trader_id INTEGER REFERENCES users(id),
    counterparty_id INTEGER REFERENCES counterparties(id),
    commodity TEXT NOT NULL,
    trade_type TEXT NOT NULL CHECK(trade_type IN ('Physical','Paper','Exchange','Swap','Option')),
    direction TEXT NOT NULL CHECK(direction IN ('Buy','Sell')),
    volume REAL NOT NULL,
    volume_unit TEXT DEFAULT 'bbl',
    price REAL,
    price_basis TEXT,
    currency TEXT DEFAULT 'USD',
    trade_date DATE,
    delivery_start DATE,
    delivery_end DATE,
    delivery_location TEXT,
    incoterms TEXT,
    status TEXT DEFAULT 'Confirmed',
    source_system TEXT DEFAULT 'RightAngle',
    strategy_type TEXT,
    pnl_realised REAL DEFAULT 0,
    pnl_unrealised REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_anomalous INTEGER DEFAULT 0,
    anomaly_reason TEXT
);

CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES books(id),
    commodity TEXT NOT NULL,
    region TEXT,
    tenor TEXT,
    delivery_month TEXT,
    physical_volume REAL DEFAULT 0,
    paper_volume REAL DEFAULT 0,
    exchange_volume REAL DEFAULT 0,
    net_volume REAL DEFAULT 0,
    volume_unit TEXT DEFAULT 'bbl',
    avg_price REAL,
    mtm_price REAL,
    mtm_pnl REAL DEFAULT 0,
    hedge_ratio REAL DEFAULT 0,
    var_contribution REAL DEFAULT 0,
    as_of TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity TEXT NOT NULL,
    price REAL NOT NULL,
    price_unit TEXT DEFAULT 'USD/bbl',
    source TEXT DEFAULT 'yfinance',
    change_1d REAL,
    change_pct_1d REAL,
    high_1d REAL,
    low_1d REAL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_market_data_ts ON market_data(commodity, timestamp DESC);

CREATE TABLE IF NOT EXISTS forward_curves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity TEXT NOT NULL,
    tenor TEXT NOT NULL,
    delivery_month TEXT NOT NULL,
    price REAL NOT NULL,
    basis_vs_prompt REAL DEFAULT 0,
    curve_date DATE,
    source TEXT DEFAULT 'Simulated',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    headline TEXT NOT NULL,
    source TEXT,
    url TEXT,
    published_at TIMESTAMP,
    summary TEXT,
    sentiment_score REAL DEFAULT 0,
    commodities_tagged TEXT,
    regions_tagged TEXT,
    counterparties_tagged TEXT,
    market_impact TEXT DEFAULT 'Neutral',
    relevance_score REAL DEFAULT 0,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('Critical','High','Medium','Low')),
    title TEXT NOT NULL,
    description TEXT,
    affected_trade_id INTEGER REFERENCES trades(id),
    affected_book TEXT,
    estimated_impact REAL,
    ai_explanation TEXT,
    ai_draft_action TEXT,
    status TEXT DEFAULT 'Open',
    assigned_to INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    description TEXT,
    ai_involved INTEGER DEFAULT 0,
    ai_recommendation TEXT,
    ai_accepted INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    session_id TEXT,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    screen_context TEXT,
    sources_cited TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS desk_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_date DATE NOT NULL,
    trader_id INTEGER REFERENCES users(id),
    book_id INTEGER REFERENCES books(id),
    commodity TEXT,
    strategy_type TEXT,
    structure_description TEXT NOT NULL,
    rationale TEXT,
    market_context TEXT,
    volume REAL,
    entry_price REAL,
    exit_price REAL,
    hold_days INTEGER,
    pnl_realised REAL,
    outcome TEXT,
    lessons_learned TEXT,
    failure_mode TEXT,
    tags TEXT,
    counterparty_id INTEGER REFERENCES counterparties(id)
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    recommendation_type TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    factors TEXT,
    ai_provider TEXT DEFAULT 'claude',
    status TEXT DEFAULT 'Pending',
    rejection_reason TEXT,
    actual_outcome REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actioned_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    book_id INTEGER REFERENCES books(id),
    trader_id INTEGER REFERENCES users(id),
    annual_target REAL NOT NULL,
    q1_target REAL,
    q2_target REAL,
    q3_target REAL,
    q4_target REAL
);

CREATE TABLE IF NOT EXISTS monthly_actuals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    book_id INTEGER REFERENCES books(id),
    trader_id INTEGER REFERENCES users(id),
    pnl REAL DEFAULT 0,
    volume_traded REAL DEFAULT 0,
    trades_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    loss_count INTEGER DEFAULT 0,
    best_trade_pnl REAL,
    worst_trade_pnl REAL,
    var_avg REAL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    direction TEXT NOT NULL CHECK(direction IN ('Inbound','Outbound')),
    from_email TEXT,
    from_name TEXT,
    to_email TEXT,
    subject TEXT NOT NULL,
    body TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_summary TEXT,
    ai_priority TEXT DEFAULT 'Medium',
    ai_action_required TEXT,
    ai_draft_reply TEXT,
    ai_linked_trade_id INTEGER REFERENCES trades(id),
    deadline TIMESTAMP,
    status TEXT DEFAULT 'Unread',
    thread_id TEXT
);

CREATE TABLE IF NOT EXISTS decision_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    decision_type TEXT,
    potential_impact REAL,
    impact_description TEXT,
    urgency TEXT DEFAULT 'Medium',
    deadline TIMESTAMP,
    related_trade_id INTEGER REFERENCES trades(id),
    related_vessel_id INTEGER REFERENCES vessels(id),
    related_alert_id INTEGER REFERENCES alerts(id),
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS regulatory_filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regulation TEXT NOT NULL,
    filing_type TEXT,
    status TEXT DEFAULT 'Current',
    next_deadline TIMESTAMP,
    last_submitted TIMESTAMP,
    notes TEXT,
    missing_fields TEXT
);

CREATE TABLE IF NOT EXISTS demo_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    payload TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
