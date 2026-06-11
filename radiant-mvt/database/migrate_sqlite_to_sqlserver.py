"""
One-time migration helper to copy data from the existing SQLite database into SQL Server.

Usage:
    set DATABASE_URL=mssql+pyodbc://...
    python -m database.migrate_sqlite_to_sqlserver

Optional:
    set SQLITE_SOURCE_URL=sqlite:///./radiant_mvt.db
    set MIGRATION_CLEAR_TARGET=1
"""
from __future__ import annotations

import os
from typing import Iterable

from sqlalchemy import MetaData, create_engine, inspect, text

from database.models import Base

SQLITE_SOURCE_URL = os.getenv("SQLITE_SOURCE_URL", "sqlite:///./radiant_mvt.db")
TARGET_URL = os.getenv("DATABASE_URL", "")
CLEAR_TARGET = os.getenv("MIGRATION_CLEAR_TARGET", "0") == "1"

TABLE_ORDER = [
    "users",
    "books",
    "counterparties",
    "vessels",
    "trades",
    "positions",
    "market_data",
    "forward_curves",
    "news",
    "alerts",
    "audit_log",
    "chat_history",
    "desk_decisions",
    "ai_recommendations",
    "performance_targets",
    "monthly_actuals",
    "emails",
    "decision_queue",
    "regulatory_filings",
    "demo_scenarios",
    "app_config",
    "external_connectors",
    "market_watchlist",
    "agent_runs",
    "market_intelligence",
]


def _assert_configuration():
    if not TARGET_URL:
        raise RuntimeError("DATABASE_URL must be set to the SQL Server target.")
    if not TARGET_URL.startswith("mssql"):
        raise RuntimeError("DATABASE_URL must point to SQL Server for this migration.")


def _chunks(rows: list[dict], size: int) -> Iterable[list[dict]]:
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def _has_identity_id(table) -> bool:
    id_column = table.columns.get("id")
    return bool(id_column is not None and getattr(id_column.type, "python_type", int) is int)


def _clear_target_tables(target_conn, tables: list[str]):
    for table_name in reversed(tables):
        target_conn.execute(text(f"DELETE FROM {table_name}"))


def _copy_table(source_conn, target_conn, source_table, target_table, table_name: str):
    rows = [dict(row) for row in source_conn.execute(source_table.select()).mappings().all()]
    if not rows:
        print(f"{table_name}: 0 rows")
        return

    common_columns = [column.name for column in target_table.columns if column.name in rows[0]]
    payload = [{column: row.get(column) for column in common_columns} for row in rows]

    identity_mode = _has_identity_id(target_table)
    if identity_mode:
        target_conn.execute(text(f"SET IDENTITY_INSERT {table_name} ON"))

    for batch in _chunks(payload, 500):
        target_conn.execute(target_table.insert(), batch)

    if identity_mode:
        target_conn.execute(text(f"SET IDENTITY_INSERT {table_name} OFF"))
        max_id = max((row.get("id") or 0) for row in payload)
        target_conn.execute(text(f"DBCC CHECKIDENT ('{table_name}', RESEED, {max_id})"))

    print(f"{table_name}: {len(payload)} rows")


def main():
    _assert_configuration()

    source_engine = create_engine(SQLITE_SOURCE_URL)
    target_engine = create_engine(TARGET_URL)

    Base.metadata.create_all(bind=target_engine)

    source_meta = MetaData()
    source_meta.reflect(bind=source_engine)
    target_meta = MetaData()
    target_meta.reflect(bind=target_engine)

    source_tables = set(source_meta.tables.keys())
    target_tables = set(target_meta.tables.keys())
    transferable = [table for table in TABLE_ORDER if table in source_tables and table in target_tables]

    if not transferable:
        raise RuntimeError("No overlapping tables found between SQLite source and SQL Server target.")

    with source_engine.connect() as source_conn, target_engine.begin() as target_conn:
        if CLEAR_TARGET:
            _clear_target_tables(target_conn, transferable)

        for table_name in transferable:
            _copy_table(
                source_conn,
                target_conn,
                source_meta.tables[table_name],
                target_meta.tables[table_name],
                table_name,
            )

    inspector = inspect(target_engine)
    migrated = {table: inspector.get_columns(table) for table in transferable}
    print(f"Migration complete. Verified {len(migrated)} tables on SQL Server.")


if __name__ == "__main__":
    main()
