from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./radiant_mvt.db")


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


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    if DATABASE_URL.startswith("sqlite"):
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
    from sqlalchemy import inspect as sa_inspect, text as sa_text

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
    ]

    is_mssql = DATABASE_URL.startswith("mssql")

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

        # Ensure external_connectors table exists (ORM handles it but belt+braces)
        if 'external_connectors' not in existing_tables:
            if is_mssql:
                conn_sql = """
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
                    )"""
            else:
                conn_sql = """
                    CREATE TABLE IF NOT EXISTS external_connectors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL, connector_type TEXT NOT NULL,
                        provider TEXT NOT NULL, host_url TEXT, api_key TEXT,
                        extra_config TEXT, polling_interval_sec INTEGER DEFAULT 60,
                        is_active INTEGER DEFAULT 1, last_connected_at DATETIME,
                        last_status TEXT DEFAULT 'Not tested', last_error TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)"""
            with engine.connect() as conn:
                try:
                    conn.execute(sa_text(conn_sql))
                    conn.commit()
                    _log.info("Created external_connectors table")
                except Exception as e:
                    _log.debug("external_connectors creation: %s", e)

        _log.info("run_migrations() complete")
    except Exception as e:
        _log.warning("run_migrations() error: %s", e)

