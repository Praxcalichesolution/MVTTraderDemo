CREATE TABLE IF NOT EXISTS market_intelligence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity TEXT NOT NULL,
    analysis_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    outlook TEXT,
    outlook_score REAL,
    key_drivers TEXT,
    key_risks TEXT,
    price_at_analysis REAL,
    change_24h REAL,
    trend_5d REAL,
    trend_30d REAL,
    news_count_analysed INTEGER DEFAULT 0,
    top_news TEXT,
    opportunity_flag INTEGER DEFAULT 0,
    opportunity_description TEXT,
    agent_run_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_intelligence_latest
    ON market_intelligence(commodity, analysis_datetime DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    agent_name TEXT NOT NULL,
    commodities_analysed INTEGER DEFAULT 0,
    duration_seconds REAL DEFAULT 0,
    news_items_read INTEGER DEFAULT 0,
    analyses_produced INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_datetime
    ON agent_runs(run_datetime DESC);

CREATE TABLE IF NOT EXISTS market_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    commodity TEXT NOT NULL,
    alert_threshold_pct REAL DEFAULT 2.0,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_watchlist_user
    ON market_watchlist(user_id, is_active, display_order);

CREATE TABLE IF NOT EXISTS external_connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    connector_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    host_url TEXT,
    api_key TEXT,
    extra_config TEXT,
    polling_interval_sec INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 1,
    last_connected_at DATETIME,
    last_status TEXT DEFAULT 'Not tested',
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
