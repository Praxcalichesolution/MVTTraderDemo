-- Radiant-MVT SQL Server Schema
-- Target: SQL Server 2019+ / Azure SQL
-- Connection: mssql+pyodbc://MVTSQL:***@10.251.1.14:1433/MVT_Trader
-- Run this script once to create all tables in the MVT_Trader database
-- Generated: 2026-06-07

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255) UNIQUE NOT NULL,
    hashed_password NVARCHAR(MAX) NOT NULL,
    full_name NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) NOT NULL CHECK(role IN ('trader','risk','executive','admin')),
    desk NVARCHAR(255) DEFAULT 'INEOS Trading & Shipping',
    title NVARCHAR(255),
    is_active INT DEFAULT 1,
    last_login DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='books' AND xtype='U')
CREATE TABLE books (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    commodity NVARCHAR(255) NOT NULL,
    trader_id INT REFERENCES users(id),
    annual_target FLOAT,
    strategy NVARCHAR(MAX),
    is_active INT DEFAULT 1
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='counterparties' AND xtype='U')
CREATE TABLE counterparties (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    short_name NVARCHAR(255),
    country NVARCHAR(255),
    credit_limit FLOAT,
    credit_used FLOAT DEFAULT 0,
    isda_status NVARCHAR(50) DEFAULT 'Signed',
    typical_trade_size_bbl FLOAT,
    preferred_commodities NVARCHAR(MAX),
    avg_response_hours FLOAT,
    seasonal_activity NVARCHAR(MAX),
    relationship_since INT,
    contact_name NVARCHAR(255),
    contact_email NVARCHAR(255)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='vessels' AND xtype='U')
CREATE TABLE vessels (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    imo_number NVARCHAR(255),
    capacity_m3 FLOAT DEFAULT 27500,
    vessel_type NVARCHAR(255) DEFAULT 'Multi-gas carrier',
    flag NVARCHAR(255) DEFAULT 'Bahamas',
    current_lat FLOAT,
    current_lon FLOAT,
    origin_port NVARCHAR(255),
    destination_port NVARCHAR(255),
    eta DATETIME2,
    original_eta DATETIME2,
    delay_hours FLOAT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'En Route',
    cargo_commodity NVARCHAR(255) DEFAULT 'Ethane',
    cargo_volume_mt FLOAT,
    charter_party_rate FLOAT DEFAULT 45000,
    allowed_laytime_hours FLOAT DEFAULT 36,
    booked_counterparty_id INT REFERENCES counterparties(id),
    updated_at DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='trades' AND xtype='U')
CREATE TABLE trades (
    id INT IDENTITY(1,1) PRIMARY KEY,
    trade_ref NVARCHAR(255) UNIQUE NOT NULL,
    book_id INT REFERENCES books(id),
    trader_id INT REFERENCES users(id),
    counterparty_id INT REFERENCES counterparties(id),
    commodity NVARCHAR(255) NOT NULL,
    trade_type NVARCHAR(50) NOT NULL CHECK(trade_type IN ('Physical','Paper','Exchange','Swap','Option')),
    direction NVARCHAR(10) NOT NULL CHECK(direction IN ('Buy','Sell')),
    volume FLOAT NOT NULL,
    volume_unit NVARCHAR(50) DEFAULT 'bbl',
    price FLOAT,
    price_basis NVARCHAR(255),
    currency NVARCHAR(10) DEFAULT 'USD',
    trade_date DATE,
    delivery_start DATE,
    delivery_end DATE,
    delivery_location NVARCHAR(255),
    incoterms NVARCHAR(50),
    status NVARCHAR(50) DEFAULT 'Confirmed',
    source_system NVARCHAR(255) DEFAULT 'RightAngle',
    strategy_type NVARCHAR(255),
    pnl_realised FLOAT DEFAULT 0,
    pnl_unrealised FLOAT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    is_anomalous INT DEFAULT 0,
    anomaly_reason NVARCHAR(MAX)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='positions' AND xtype='U')
CREATE TABLE positions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    book_id INT REFERENCES books(id),
    commodity NVARCHAR(255) NOT NULL,
    region NVARCHAR(255),
    tenor NVARCHAR(255),
    delivery_month NVARCHAR(50),
    physical_volume FLOAT DEFAULT 0,
    paper_volume FLOAT DEFAULT 0,
    exchange_volume FLOAT DEFAULT 0,
    net_volume FLOAT DEFAULT 0,
    volume_unit NVARCHAR(50) DEFAULT 'bbl',
    avg_price FLOAT,
    mtm_price FLOAT,
    mtm_pnl FLOAT DEFAULT 0,
    hedge_ratio FLOAT DEFAULT 0,
    var_contribution FLOAT DEFAULT 0,
    as_of DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='market_data' AND xtype='U')
CREATE TABLE market_data (
    id INT IDENTITY(1,1) PRIMARY KEY,
    commodity NVARCHAR(255) NOT NULL,
    price FLOAT NOT NULL,
    price_unit NVARCHAR(50) DEFAULT 'USD/bbl',
    source NVARCHAR(255) DEFAULT 'yfinance',
    change_1d FLOAT,
    change_pct_1d FLOAT,
    high_1d FLOAT,
    low_1d FLOAT,
    volume FLOAT,
    timestamp DATETIME2 DEFAULT GETDATE()
);
CREATE INDEX IF NOT EXISTS idx_market_data_ts ON market_data(commodity, timestamp DESC);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forward_curves' AND xtype='U')
CREATE TABLE forward_curves (
    id INT IDENTITY(1,1) PRIMARY KEY,
    commodity NVARCHAR(255) NOT NULL,
    tenor NVARCHAR(255) NOT NULL,
    delivery_month NVARCHAR(50) NOT NULL,
    price FLOAT NOT NULL,
    basis_vs_prompt FLOAT DEFAULT 0,
    curve_date DATE,
    source NVARCHAR(255) DEFAULT 'Simulated',
    updated_at DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='news' AND xtype='U')
CREATE TABLE news (
    id INT IDENTITY(1,1) PRIMARY KEY,
    headline NVARCHAR(MAX) NOT NULL,
    source NVARCHAR(255),
    url NVARCHAR(MAX),
    published_at DATETIME2,
    summary NVARCHAR(MAX),
    body NVARCHAR(MAX),
    sentiment_score FLOAT DEFAULT 0,
    commodities_tagged NVARCHAR(MAX),
    regions_tagged NVARCHAR(MAX),
    counterparties_tagged NVARCHAR(MAX),
    market_impact NVARCHAR(50) DEFAULT 'Neutral',
    relevance_score FLOAT DEFAULT 0,
    ai_summary NVARCHAR(MAX),
    ai_key_points NVARCHAR(MAX),
    ai_position_impact NVARCHAR(MAX),
    ai_summarized_at DATETIME2,
    ingested_at DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='alerts' AND xtype='U')
CREATE TABLE alerts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    alert_type NVARCHAR(255) NOT NULL,
    severity NVARCHAR(50) NOT NULL CHECK(severity IN ('Critical','High','Medium','Low')),
    title NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(MAX),
    affected_trade_id INT REFERENCES trades(id),
    affected_book NVARCHAR(255),
    estimated_impact FLOAT,
    ai_explanation NVARCHAR(MAX),
    ai_draft_action NVARCHAR(MAX),
    status NVARCHAR(50) DEFAULT 'Open',
    assigned_to INT REFERENCES users(id),
    created_at DATETIME2 DEFAULT GETDATE(),
    resolved_at DATETIME2
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_log' AND xtype='U')
CREATE TABLE audit_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action_type NVARCHAR(255) NOT NULL,
    entity_type NVARCHAR(255),
    entity_id INT,
    description NVARCHAR(MAX),
    ai_involved INT DEFAULT 0,
    ai_recommendation NVARCHAR(MAX),
    ai_accepted INT,
    timestamp DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='chat_history' AND xtype='U')
CREATE TABLE chat_history (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    session_id NVARCHAR(255),
    role NVARCHAR(20) NOT NULL CHECK(role IN ('user','assistant')),
    content NVARCHAR(MAX) NOT NULL,
    screen_context NVARCHAR(MAX),
    sources_cited NVARCHAR(MAX),
    timestamp DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='desk_decisions' AND xtype='U')
CREATE TABLE desk_decisions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    decision_date DATE NOT NULL,
    trader_id INT REFERENCES users(id),
    book_id INT REFERENCES books(id),
    commodity NVARCHAR(255),
    strategy_type NVARCHAR(255),
    structure_description NVARCHAR(MAX) NOT NULL,
    rationale NVARCHAR(MAX),
    market_context NVARCHAR(MAX),
    volume FLOAT,
    entry_price FLOAT,
    exit_price FLOAT,
    hold_days INT,
    pnl_realised FLOAT,
    outcome NVARCHAR(255),
    lessons_learned NVARCHAR(MAX),
    failure_mode NVARCHAR(255),
    tags NVARCHAR(MAX),
    similarity_hash NVARCHAR(255),
    counterparty_id INT REFERENCES counterparties(id)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ai_recommendations' AND xtype='U')
CREATE TABLE ai_recommendations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    recommendation_type NVARCHAR(255) NOT NULL,
    title NVARCHAR(MAX),
    content NVARCHAR(MAX) NOT NULL,
    factors NVARCHAR(MAX),
    ai_provider NVARCHAR(50) DEFAULT 'claude',
    status NVARCHAR(50) DEFAULT 'Pending',
    rejection_reason NVARCHAR(MAX),
    actual_outcome FLOAT,
    created_at DATETIME2 DEFAULT GETDATE(),
    actioned_at DATETIME2
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='performance_targets' AND xtype='U')
CREATE TABLE performance_targets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    year INT NOT NULL,
    book_id INT REFERENCES books(id),
    trader_id INT REFERENCES users(id),
    annual_target FLOAT NOT NULL,
    q1_target FLOAT,
    q2_target FLOAT,
    q3_target FLOAT,
    q4_target FLOAT
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='monthly_actuals' AND xtype='U')
CREATE TABLE monthly_actuals (
    id INT IDENTITY(1,1) PRIMARY KEY,
    year INT NOT NULL,
    month INT NOT NULL,
    book_id INT REFERENCES books(id),
    trader_id INT REFERENCES users(id),
    pnl FLOAT DEFAULT 0,
    volume_traded FLOAT DEFAULT 0,
    trades_count INT DEFAULT 0,
    win_count INT DEFAULT 0,
    loss_count INT DEFAULT 0,
    best_trade_pnl FLOAT,
    worst_trade_pnl FLOAT,
    var_avg FLOAT,
    notes NVARCHAR(MAX)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='emails' AND xtype='U')
CREATE TABLE emails (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    direction NVARCHAR(10) NOT NULL CHECK(direction IN ('Inbound','Outbound')),
    from_email NVARCHAR(255),
    from_name NVARCHAR(255),
    to_email NVARCHAR(255),
    subject NVARCHAR(MAX) NOT NULL,
    body NVARCHAR(MAX),
    received_at DATETIME2 DEFAULT GETDATE(),
    ai_summary NVARCHAR(MAX),
    ai_priority NVARCHAR(50) DEFAULT 'Medium',
    ai_action_required NVARCHAR(MAX),
    ai_draft_reply NVARCHAR(MAX),
    ai_linked_trade_id INT REFERENCES trades(id),
    ai_linked_vessel_id INT,
    ai_suggested_contacts NVARCHAR(MAX),
    deadline DATETIME2,
    status NVARCHAR(50) DEFAULT 'Unread',
    thread_id NVARCHAR(255)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='decision_queue' AND xtype='U')
CREATE TABLE decision_queue (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    title NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(MAX),
    decision_type NVARCHAR(255),
    potential_impact FLOAT,
    impact_description NVARCHAR(MAX),
    urgency NVARCHAR(50) DEFAULT 'Medium',
    deadline DATETIME2,
    related_trade_id INT REFERENCES trades(id),
    related_vessel_id INT REFERENCES vessels(id),
    related_alert_id INT REFERENCES alerts(id),
    status NVARCHAR(50) DEFAULT 'Pending',
    created_at DATETIME2 DEFAULT GETDATE(),
    completed_at DATETIME2
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='regulatory_filings' AND xtype='U')
CREATE TABLE regulatory_filings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    regulation NVARCHAR(255) NOT NULL,
    filing_type NVARCHAR(255),
    status NVARCHAR(50) DEFAULT 'Current',
    next_deadline DATETIME2,
    last_submitted DATETIME2,
    notes NVARCHAR(MAX),
    missing_fields NVARCHAR(MAX)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='demo_scenarios' AND xtype='U')
CREATE TABLE demo_scenarios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    scenario_key NVARCHAR(255) UNIQUE NOT NULL,
    title NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(MAX),
    payload NVARCHAR(MAX) NOT NULL,
    trigger_type NVARCHAR(255),
    is_active INT DEFAULT 1
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_config' AND xtype='U')
CREATE TABLE app_config (
    [key] NVARCHAR(255) PRIMARY KEY,
    value NVARCHAR(MAX),
    description NVARCHAR(MAX),
    updated_at DATETIME2 DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='external_connectors' AND xtype='U')
CREATE TABLE external_connectors (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    connector_type NVARCHAR(50) NOT NULL,
    provider NVARCHAR(100) NOT NULL,
    host_url NVARCHAR(MAX),
    api_key NVARCHAR(MAX),
    extra_config NVARCHAR(MAX),
    polling_interval_sec INT DEFAULT 60,
    is_active INT DEFAULT 1,
    last_connected_at DATETIME2,
    last_status NVARCHAR(50) DEFAULT 'Not tested',
    last_error NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
