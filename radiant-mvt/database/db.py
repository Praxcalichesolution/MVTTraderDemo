from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./radiant_mvt.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=StaticPool,
    echo=False
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=10000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
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

def run_migrations(db_path=None):
    """Add any missing columns that may not be in older DB versions"""
    import sqlite3, os
    from dotenv import load_dotenv
    load_dotenv()
    url = os.getenv('DATABASE_URL', 'sqlite:///./radiant_mvt.db')
    path = url.replace('sqlite:///', '').replace('sqlite:////', '/')
    if not os.path.exists(path):
        return
    conn = sqlite3.connect(path)
    try:
        migrations = [
        ('market_data', 'volume', 'REAL'),
        ('market_data', 'high_1d', 'REAL'),
        ('market_data', 'low_1d', 'REAL'),
        ('market_data', 'price_unit', 'TEXT'),
        ('app_config', 'description', 'TEXT'),
        ('news', 'body', 'TEXT'),
        ('news', 'ai_summary', 'TEXT'),
        ('news', 'ai_key_points', 'TEXT'),
        ('news', 'ai_position_impact', 'TEXT'),
        ('news', 'ai_summarized_at', 'TIMESTAMP'),

            ('monthly_actuals', 'var_avg', 'REAL'),
            ('desk_decisions', 'similarity_hash', 'TEXT'),
            ('emails', 'ai_linked_vessel_id', 'INTEGER'),
            ('emails', 'ai_suggested_contacts', 'TEXT'),
            ('demo_scenarios', 'trigger_type', 'TEXT'),
        ]
        for table, col, dtype in migrations:
            try:
                conn.execute(f'ALTER TABLE {table} ADD COLUMN {col} {dtype}')
                conn.commit()
            except Exception:
                pass  # Column already exists

        schema_v2_path = os.path.join(os.path.dirname(__file__), "schema_v2.sql")
        if os.path.exists(schema_v2_path):
            with open(schema_v2_path, "r") as f:
                conn.executescript(f.read())
            conn.commit()

        schema_news_path = os.path.join(os.path.dirname(__file__), "schema_news.sql")
        if os.path.exists(schema_news_path):
            with open(schema_news_path, "r") as f:
                for statement in f.read().split(";"):
                    stmt = statement.strip()
                    if stmt:
                        try:
                            conn.execute(stmt)
                            conn.commit()
                        except Exception:
                            pass
    finally:
        conn.close()
