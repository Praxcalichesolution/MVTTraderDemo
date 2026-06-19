from sqlalchemy import create_engine, event, text, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
import logging
import os
import time
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./radiant_mvt.db")
SLOW_QUERY_MS = float(os.getenv("SQL_SLOW_QUERY_MS", "250"))
sql_logger = logging.getLogger("radiant_mvt.sql")


class Base(DeclarativeBase):
    pass


def _create_engine():
    url = DATABASE_URL
    if url.startswith("mssql"):
        return create_engine(
            url,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True,
            echo=False,
        )
    else:
        return create_engine(
            url,
            connect_args={"check_same_thread": False, "timeout": 30},
            poolclass=StaticPool,
            echo=False,
        )


engine = _create_engine()


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.close()


@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start_time", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    try:
        started = conn.info["query_start_time"].pop(-1)
    except Exception:
        return
    elapsed_ms = (time.perf_counter() - started) * 1000
    if elapsed_ms >= SLOW_QUERY_MS:
        compact_sql = " ".join(statement.split())
        sql_logger.warning(
            "Slow SQL %.1fms rows=%s sql=%s",
            elapsed_ms,
            cursor.rowcount,
            compact_sql[:500],
        )


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_database_dialect(bind=None) -> str:
    target = bind or engine
    try:
        return target.dialect.name.lower()
    except Exception:
        return "unknown"


def is_sql_server(bind=None) -> bool:
    return get_database_dialect(bind).startswith("mssql")


def is_sqlite(bind=None) -> bool:
    return get_database_dialect(bind) == "sqlite"


def get_active_ai_connector(db):
    """Return the most-recently-updated active AI model connector row, or None."""
    try:
        row = db.execute(text(
            "SELECT id, host_url, extra_config FROM external_connectors "
            "WHERE connector_type='ai_model' AND is_active=1 "
            "ORDER BY updated_at DESC"
        )).fetchone()
        return row
    except Exception:
        return None


def test_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Works for both SQLite and SQL Server."""
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        from database import models  # registers all ORM models on Base
        Base.metadata.create_all(bind=engine)
        _log.info("Base.metadata.create_all() completed")
    except Exception as e:
        _log.warning("Base.metadata.create_all failed: %s", e)

    # Run legacy schema.sql only for SQLite (it has SQLite-specific syntax)
    if is_sqlite():
        schema_path = "database/schema.sql"
        if os.path.exists(schema_path):
            with open(schema_path, "r") as f:
                sql = f.read()
            with engine.connect() as conn:
                for statement in sql.split(";"):
                    stmt = statement.strip()
                    if stmt and not stmt.startswith("--"):
                        try:
                            conn.execute(text(stmt))
                        except Exception:
                            pass
                conn.commit()
    return True


def run_migrations():
    """
    Add missing columns to existing tables.
    Uses SQLAlchemy inspect — works for BOTH SQLite and SQL Server.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    from sqlalchemy import text as sa_text

    # Column migrations: (table, column, sql_server_type, sqlite_type)
    migrations = [
        ('market_data',    'volume',                   'FLOAT',     'REAL'),
        ('market_data',    'high_1d',                  'FLOAT',     'REAL'),
        ('market_data',    'low_1d',                   'FLOAT',     'REAL'),
        ('market_data',    'price_unit',               'NVARCHAR(50)',  'TEXT'),
        ('app_config',     'description',              'NVARCHAR(500)', 'TEXT'),
        ('news',           'body',                     'NVARCHAR(MAX)', 'TEXT'),
        ('news',           'ai_summary',               'NVARCHAR(MAX)', 'TEXT'),
        ('news',           'ai_key_points',            'NVARCHAR(MAX)', 'TEXT'),
        ('news',           'ai_position_impact',       'NVARCHAR(MAX)', 'TEXT'),
        ('news',           'ai_summarized_at',         'DATETIME2',    'TIMESTAMP'),
        ('monthly_actuals','var_avg',                  'FLOAT',     'REAL'),
        ('desk_decisions', 'similarity_hash',          'NVARCHAR(64)',  'TEXT'),
        ('emails',         'ai_linked_vessel_id',      'INT',       'INTEGER'),
        ('emails',         'ai_suggested_contacts',    'NVARCHAR(MAX)', 'TEXT'),
        ('demo_scenarios', 'trigger_type',             'NVARCHAR(50)',  'TEXT'),
        ('decision_queue', 'reasoning_text',           'NVARCHAR(MAX)', 'TEXT'),
        ('decision_queue', 'reasoning_generated_at',   'DATETIME2',    'DATETIME'),
        ('chat_history',   'selected_entity_type',     'NVARCHAR(100)', 'TEXT'),
        ('chat_history',   'selected_entity_id',       'NVARCHAR(100)', 'TEXT'),
        ('chat_history',   'selected_entity_label',    'NVARCHAR(255)', 'TEXT'),
        ('chat_history',   'agent_key',                'NVARCHAR(120)', 'TEXT'),
    ]

    is_mssql = is_sql_server()

    try:
        inspector = sa_inspect(engine)
        existing_tables = set(inspector.get_table_names())

        with engine.connect() as conn:
            for table, col, mssql_type, sqlite_type in migrations:
                if table not in existing_tables:
                    continue
                try:
                    existing_cols = {c['name'].lower() for c in inspector.get_columns(table)}
                    if col.lower() not in existing_cols:
                        col_type = mssql_type if is_mssql else sqlite_type
                        alter = f"ALTER TABLE {table} ADD {col} {col_type}"
                        conn.execute(sa_text(alter))
                        conn.commit()
                        _log.info("Migration: added %s.%s (%s)", table, col, col_type)
                except Exception as e:
                    _log.debug("Migration skip %s.%s: %s", table, col, e)

        table_create_sql = {}
        if is_mssql:
            table_create_sql = {
                'external_connectors': """
                    CREATE TABLE external_connectors (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        name NVARCHAR(255) NOT NULL,
                        connector_type NVARCHAR(50) NOT NULL,
                        provider NVARCHAR(100) NOT NULL,
                        host_url NVARCHAR(500),
                        api_key NVARCHAR(500),
                        extra_config NVARCHAR(MAX),
                        polling_interval_sec INT DEFAULT 60,
                        is_active INT DEFAULT 1,
                        last_connected_at DATETIME2,
                        last_status NVARCHAR(200) DEFAULT 'Not tested',
                        last_error NVARCHAR(MAX),
                        created_at DATETIME2 DEFAULT GETDATE(),
                        updated_at DATETIME2 DEFAULT GETDATE()
                    )""",
                'ai_agent_definitions': """
                    CREATE TABLE ai_agent_definitions (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        agent_key NVARCHAR(120) NOT NULL UNIQUE,
                        name NVARCHAR(255) NOT NULL,
                        description NVARCHAR(MAX),
                        category NVARCHAR(100) DEFAULT 'general',
                        purpose NVARCHAR(MAX),
                        instructions NVARCHAR(MAX),
                        system_prompt_template NVARCHAR(MAX) NOT NULL,
                        user_prompt_template NVARCHAR(MAX),
                        model_provider NVARCHAR(50) DEFAULT 'claude',
                        model_name NVARCHAR(120) DEFAULT 'claude-sonnet-4-6',
                        temperature FLOAT DEFAULT 0.2,
                        max_tokens INT DEFAULT 1400,
                        provider_settings NVARCHAR(MAX),
                        allowed_tools NVARCHAR(MAX),
                        allowed_screens NVARCHAR(MAX),
                        output_format NVARCHAR(80) DEFAULT 'narrative',
                        response_style NVARCHAR(120),
                        is_active INT DEFAULT 1,
                        is_chat_default INT DEFAULT 0,
                        version INT DEFAULT 1,
                        created_by_user_id INT,
                        updated_by_user_id INT,
                        created_at DATETIME2 DEFAULT GETDATE(),
                        updated_at DATETIME2 DEFAULT GETDATE()
                    )""",
                'ai_agent_versions': """
                    CREATE TABLE ai_agent_versions (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        agent_id INT NOT NULL,
                        version_number INT NOT NULL,
                        change_summary NVARCHAR(MAX),
                        snapshot_json NVARCHAR(MAX) NOT NULL,
                        changed_by_user_id INT,
                        created_at DATETIME2 DEFAULT GETDATE()
                    )""",
                'ai_user_context_profiles': """
                    CREATE TABLE ai_user_context_profiles (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        user_id INT NOT NULL UNIQUE,
                        role_profile NVARCHAR(255),
                        desk_team NVARCHAR(255),
                        industries_covered NVARCHAR(MAX),
                        commodities_covered NVARCHAR(MAX),
                        regions_covered NVARCHAR(MAX),
                        preferred_answer_style NVARCHAR(255),
                        risk_appetite NVARCHAR(255),
                        review_posture NVARCHAR(255),
                        default_focus_areas NVARCHAR(MAX),
                        analyst_preferences NVARCHAR(MAX),
                        persistent_notes NVARCHAR(MAX),
                        created_at DATETIME2 DEFAULT GETDATE(),
                        updated_at DATETIME2 DEFAULT GETDATE()
                    )""",
                'ai_session_memory': """
                    CREATE TABLE ai_session_memory (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        user_id INT NOT NULL,
                        session_id NVARCHAR(255) NOT NULL,
                        last_screen NVARCHAR(120),
                        selected_entity_type NVARCHAR(120),
                        selected_entity_id NVARCHAR(120),
                        selected_entity_label NVARCHAR(255),
                        memory_summary NVARCHAR(MAX),
                        recent_user_goal NVARCHAR(MAX),
                        last_agent_key NVARCHAR(120),
                        last_message_at DATETIME2,
                        created_at DATETIME2 DEFAULT GETDATE(),
                        updated_at DATETIME2 DEFAULT GETDATE()
                    )""",
            }
        else:
            table_create_sql = {
                'external_connectors': """
                    CREATE TABLE IF NOT EXISTS external_connectors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL, connector_type TEXT NOT NULL,
                        provider TEXT NOT NULL, host_url TEXT, api_key TEXT,
                        extra_config TEXT, polling_interval_sec INTEGER DEFAULT 60,
                        is_active INTEGER DEFAULT 1, last_connected_at DATETIME,
                        last_status TEXT DEFAULT 'Not tested', last_error TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)""",
                'ai_agent_definitions': """
                    CREATE TABLE IF NOT EXISTS ai_agent_definitions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        agent_key TEXT NOT NULL UNIQUE,
                        name TEXT NOT NULL,
                        description TEXT,
                        category TEXT DEFAULT 'general',
                        purpose TEXT,
                        instructions TEXT,
                        system_prompt_template TEXT NOT NULL,
                        user_prompt_template TEXT,
                        model_provider TEXT DEFAULT 'claude',
                        model_name TEXT DEFAULT 'claude-sonnet-4-6',
                        temperature REAL DEFAULT 0.2,
                        max_tokens INTEGER DEFAULT 1400,
                        provider_settings TEXT,
                        allowed_tools TEXT,
                        allowed_screens TEXT,
                        output_format TEXT DEFAULT 'narrative',
                        response_style TEXT,
                        is_active INTEGER DEFAULT 1,
                        is_chat_default INTEGER DEFAULT 0,
                        version INTEGER DEFAULT 1,
                        created_by_user_id INTEGER,
                        updated_by_user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )""",
                'ai_agent_versions': """
                    CREATE TABLE IF NOT EXISTS ai_agent_versions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        agent_id INTEGER NOT NULL,
                        version_number INTEGER NOT NULL,
                        change_summary TEXT,
                        snapshot_json TEXT NOT NULL,
                        changed_by_user_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )""",
                'ai_user_context_profiles': """
                    CREATE TABLE IF NOT EXISTS ai_user_context_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL UNIQUE,
                        role_profile TEXT,
                        desk_team TEXT,
                        industries_covered TEXT,
                        commodities_covered TEXT,
                        regions_covered TEXT,
                        preferred_answer_style TEXT,
                        risk_appetite TEXT,
                        review_posture TEXT,
                        default_focus_areas TEXT,
                        analyst_preferences TEXT,
                        persistent_notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )""",
                'ai_session_memory': """
                    CREATE TABLE IF NOT EXISTS ai_session_memory (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        session_id TEXT NOT NULL,
                        last_screen TEXT,
                        selected_entity_type TEXT,
                        selected_entity_id TEXT,
                        selected_entity_label TEXT,
                        memory_summary TEXT,
                        recent_user_goal TEXT,
                        last_agent_key TEXT,
                        last_message_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )""",
            }

        for table_name, conn_sql in table_create_sql.items():
            if table_name in existing_tables:
                continue
            with engine.connect() as conn:
                try:
                    conn.execute(sa_text(conn_sql))
                    conn.commit()
                    _log.info("Created %s table", table_name)
                except Exception as e:
                    _log.debug("%s creation: %s", table_name, e)

        if 'ai_session_memory' in table_create_sql:
            with engine.connect() as conn:
                try:
                    if is_mssql:
                        conn.execute(sa_text(
                            "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_ai_session_memory_user_session') "
                            "CREATE UNIQUE INDEX idx_ai_session_memory_user_session "
                            "ON ai_session_memory(user_id, session_id)"
                        ))
                    else:
                        conn.execute(sa_text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_session_memory_user_session "
                            "ON ai_session_memory(user_id, session_id)"
                        ))
                    conn.commit()
                except Exception as e:
                    _log.debug("ai_session_memory index skip: %s", e)

        _log.info("run_migrations() complete")
    except Exception as e:
        _log.warning("run_migrations() error: %s", e)
