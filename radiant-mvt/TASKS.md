# Radiant-MVT Task Queue

> **For Codex:** Pick up any task with status `[ ]` (pending). Change it to `[~]` (in progress) when you start,
> and `[x]` (done) when complete. Add notes under each task. Work in the `radiant-mvt/` subfolder.
> Do NOT pick up tasks marked `[~]` (already in progress) or `[x]` (done).
> After completing a task, run `python -m py_compile <file>` to verify Python syntax before marking done.

---

## Phase 1 — External Systems Configuration (Priority: HIGH)

### TASK-001: Add `external_connectors` table to database [x]
**Files:** `database/models.py`, `database/schema_v2.sql`, `database/db.py`

Add SQLAlchemy model and migration for a new `external_connectors` table:
```sql
CREATE TABLE IF NOT EXISTS external_connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    connector_type TEXT NOT NULL,  -- 'etrm' | 'market_data' | 'news' | 'ai_model'
    provider TEXT NOT NULL,        -- 'RightAngle' | 'Bloomberg' | 'NewsAPI' | 'LMStudio' etc
    host_url TEXT,
    api_key TEXT,
    extra_config TEXT,             -- JSON blob for provider-specific fields
    polling_interval_sec INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 1,
    last_connected_at DATETIME,
    last_status TEXT DEFAULT 'Not tested',  -- 'OK' | 'Error' | 'Not tested'
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Add the SQLAlchemy model `ExternalConnector` to `models.py`.
Add migration in `db.py`'s `run_migrations()` to CREATE TABLE IF NOT EXISTS.

Note: Added the `ExternalConnector` ORM model plus SQLite schema and migration support for `external_connectors`.

---

### TASK-002: Add connectors API endpoints [x]
**File:** `api/configuration.py`

Add these routes to the existing configuration router:

- `GET /api/configuration/connectors` — list all connectors
- `POST /api/configuration/connectors` — create new connector (body: name, connector_type, provider, host_url, api_key, extra_config, polling_interval_sec)
- `PATCH /api/configuration/connectors/{id}` — update connector fields
- `DELETE /api/configuration/connectors/{id}` — soft-delete (set is_active=0)
- `POST /api/configuration/connectors/{id}/test` — test connectivity and update last_status

For the test endpoint:
- If connector_type == 'ai_model': send a test request to host_url/v1/models
- If connector_type == 'news': try fetching the feed URL (requests.get with 5s timeout)
- If connector_type == 'market_data' or 'etrm': just ping host_url if provided, otherwise return {"status": "OK", "message": "Credentials saved — live test requires network access"}
- Update last_connected_at, last_status, last_error in DB

Seed 4 demo connectors on first run (check count == 0):
```python
demo_connectors = [
    {"name": "RightAngle ETRM", "connector_type": "etrm", "provider": "RightAngle",
     "host_url": "https://etrm.ineos.internal/api", "last_status": "OK"},
    {"name": "Bloomberg B-PIPE", "connector_type": "market_data", "provider": "Bloomberg",
     "host_url": "https://api.bloomberg.com", "last_status": "OK"},
    {"name": "NewsAPI Feed", "connector_type": "news", "provider": "NewsAPI",
     "host_url": "https://newsapi.org/v2/everything", "last_status": "OK"},
    {"name": "LM Studio (Local)", "connector_type": "ai_model", "provider": "LMStudio",
     "host_url": "http://localhost:1234/v1", "last_status": "Not tested"},
]
```

Note: Added authenticated connector CRUD and connectivity test endpoints, with first-run demo connector seeding.

---

### TASK-003: Add Connectors Configuration screen to frontend [x]
**File:** `frontend/static/js/screens/screens.js`

Add a new screen key `'configuration'` in the SCREENS object.

The screen should have two sections:

**Section A — External Systems Dashboard (top)**
A status card grid showing each connector with:
- Provider logo placeholder (colored circle with initials)
- Connector name and type badge
- Status pill: green "● Connected" / red "● Error" / grey "● Not tested"
- Last refresh timestamp
- "Test Connection" button → calls POST /api/configuration/connectors/{id}/test → updates status pill
- "View Data" button → opens a modal showing last 5 records from that feed

**Section B — Add / Edit Connectors (below)**
A form to add new connectors:
- Connector type dropdown: ETRM | Market Data | News API | AI Model (Local)
- Provider dropdown (changes based on type): 
  - ETRM: RightAngle, Endur/Allegro, SAP, Custom
  - Market Data: Bloomberg, Platts/Argus, ICE/NYMEX, Zima, GlobalView, yfinance (free), Custom
  - News API: NewsAPI, Reuters, Custom RSS
  - AI Model: LM Studio, Ollama, Custom OpenAI-compatible
- Host URL field (shown for all except yfinance)
- API Key field (masked input)
- Polling interval (seconds)
- "Save & Test" button

Note: Added the Configuration nav entry plus a live connectors dashboard, add/edit form, test actions, and data preview modal in the frontend.

Also add "configuration" to the nav sidebar in `index.html` under the TOOLS section.
Nav item: `⚙️ Configuration` with `data-screen="configuration"`.

---

### TASK-004: Wire LM Studio config into AI client [x]
Note: Added `_get_local_config()` to AIClient reading host_url/model from `external_connectors` DB table (ai_model connector) with config.yaml fallback; updated `local_adapter.py` to accept optional `base_url` and `model` params; added `get_active_ai_connector()` to `db.py`. [x]
**Files:** `ai/client.py`, `ai/local_adapter.py`

When the AI provider is set to 'local', read the host_url and model from the `external_connectors` table 
(where connector_type='ai_model' AND is_active=1, latest record) instead of only from config.yaml.
Fall back to config.yaml values if no active AI connector is found in the DB.

Add a helper function `get_active_ai_connector(db)` in `database/db.py` that returns the active AI model connector or None.

Note: Added a shared active AI connector helper and switched local AI config lookup to prefer the latest active DB connector, with config.yaml fallback.

---

## Phase 2 — SQL Server Migration (Priority: HIGH)

### TASK-005: Add SQL Server support alongside SQLite [x]
Note: `db.py` now detects `mssql` prefix and creates pooled SQL Server engine vs SQLite with StaticPool; added `test_db_connection()` and `GET /api/health/db`; added pyodbc + pymssql to requirements.txt. [x]
**Files:** `database/db.py`, `.env.template`, `requirements.txt`

Add `pyodbc` and `pymssql` to requirements.txt.

In `database/db.py`, detect the DATABASE_URL prefix:
- `sqlite:///` → use existing SQLite engine (no change)
- `mssql+pyodbc://` or `mssql+pymssql://` → create SQL Server engine with connection pooling

SQL Server connection string (already set in .env):
```
DATABASE_URL=mssql+pyodbc://MVTSQL:Caliche2025!@10.251.1.14:1433/MVT_Trader?driver=ODBC%20Driver%2018%20for%20SQL%20Server&TrustServerCertificate=yes
```

For SQL Server, set these engine args:
```python
engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_timeout=30, pool_recycle=1800)
```

Add a `test_db_connection()` function that returns True/False and expose it at `GET /api/health/db`.

Note: Added `pymssql`, documented the SQL Server connection string in `.env.template`, and aligned the DB health check to return a boolean status.

---

### TASK-006: Generate SQL Server-compatible schema script [x]
Note: Created `database/schema_sqlserver.sql` with full SQL Server syntax (IDENTITY, NVARCHAR, FLOAT, GETDATE(), DATETIME2, IF NOT EXISTS guards) covering all tables including `external_connectors`.
**File:** `database/schema_sqlserver.sql`

Create a SQL Server version of schema.sql that replaces:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `INT IDENTITY(1,1) PRIMARY KEY`
- `TEXT` → `NVARCHAR(MAX)` or sized `NVARCHAR(255)` where appropriate
- `REAL` → `FLOAT`
- `CURRENT_TIMESTAMP` → `GETDATE()`
- SQLite CHECK constraints → SQL Server CHECK constraints (same syntax mostly)
- `datetime` → `DATETIME2`

Output the complete schema as `database/schema_sqlserver.sql`.

---

## Phase 3 — Production Hardening / IIS Deployment (Priority: MEDIUM)

### TASK-007: Add rate limiting and security headers [x]
Note: Added slowapi to requirements.txt; created `api/rate_limit.py` shared limiter; wired limiter + exception handler onto app in `main.py`; added security-headers middleware; applied `@limiter.limit("10/minute")` to login endpoint in `api/auth.py`.
**File:** `main.py`

Add `slowapi` rate limiter (add to requirements.txt).
Limit: 60 requests/minute per IP on all API routes, 10/minute on `/api/auth/login`.

Add security headers middleware:
```python
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response
```

---

### TASK-008: Create Windows Service wrapper + IIS deploy guide [x]
Note: Created `deploy/windows_service.py` (pywin32 service wrapper), `deploy/web.config` (IIS ARR reverse proxy), and `deploy/DEPLOY_WINDOWS.md` (10-step deployment guide covering prereqs, DB init, service install, IIS config, firewall, and troubleshooting).
**Files:** `deploy/windows_service.py`, `deploy/web.config`, `deploy/DEPLOY_WINDOWS.md`

Create `deploy/windows_service.py` using `pywin32` to run uvicorn as a Windows service.

Create `deploy/web.config` for IIS ARR (Application Request Routing) reverse proxy to localhost:8000:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="ReverseProxyToFastAPI" stopProcessing="true">
                    <match url="(.*)" />
                    <action type="Rewrite" url="http://localhost:8000/{R:1}" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
```

Create `deploy/DEPLOY_WINDOWS.md` with step-by-step IIS deployment instructions.

---

## Completed Tasks

- [x] Initial platform build (FastAPI + SQLite + frontend)
- [x] Decision reasoning endpoint + "Why this?" modal
- [x] Physical/Financial/All position toggle (with data-pos-type attributes)
- [x] Trade blotter configurable row count
- [x] Position heat map drill-down
- [x] AI Alerts drill-down
- [x] P&L summary in Positions & Risk screen
- [x] Book summary view in Performance screen
- [x] Audit log date + type filters
- [x] Rename Copilot → Radiant AI in UI