"""
Master seeder for Radiant-MVT.
Idempotent — safe to run on every startup.
Runs all individual seed modules in dependency order.
"""
import sys
import os
import logging

logger = logging.getLogger(__name__)


def is_seeded(db):
    """Return True if users table already has data."""
    from database.models import User
    try:
        return db.query(User).first() is not None
    except Exception:
        return False


def seed_books(db):
    """Seed 4 trading books aligned to INEOS commodities."""
    from database.models import Book, User
    if db.query(Book).first():
        logger.info("Books already seeded — skipping.")
        return
    trader = db.query(User).filter(User.role == "trader").first()
    books = [
        Book(
            name="Crude Book",
            commodity="Crude",
            trader_id=trader.id if trader else None,
            annual_target=20000000,
            strategy="Directional + Spread + Arb",
            is_active=1,
        ),
        Book(
            name="Ethane Book",
            commodity="Ethane",
            trader_id=trader.id if trader else None,
            annual_target=8000000,
            strategy="Physical Arb + Hedge",
            is_active=1,
        ),
        Book(
            name="NGLs Book",
            commodity="NGLs",
            trader_id=trader.id if trader else None,
            annual_target=5000000,
            strategy="Basis + Arb",
            is_active=1,
        ),
        Book(
            name="Carbon Book",
            commodity="Carbon",
            trader_id=trader.id if trader else None,
            annual_target=3000000,
            strategy="EUA Compliance + Directional",
            is_active=1,
        ),
    ]
    db.add_all(books)
    db.commit()
    logger.info(f"Seeded {len(books)} books.")


def seed_regulatory(db):
    """Seed EMIR, REMIT, MiFID II regulatory filing records."""
    from database.models import RegulatoryFiling
    from datetime import datetime, timedelta
    if db.query(RegulatoryFiling).first():
        logger.info("RegulatoryFilings already seeded — skipping.")
        return
    now = datetime.utcnow()
    filings = [
        RegulatoryFiling(
            regulation="EMIR",
            filing_type="Derivative Reporting",
            status="Due Soon",
            next_deadline=now + timedelta(days=3),
            last_submitted=now - timedelta(days=28),
            notes="3 derivative trades pending UTI reconciliation with DTCC",
            missing_fields="counterparty_uti,venue_mic",
        ),
        RegulatoryFiling(
            regulation="REMIT",
            filing_type="Trade Reporting",
            status="Current",
            next_deadline=now + timedelta(days=5),
            last_submitted=now - timedelta(days=2),
            notes="All physical commodity contracts reported. Next cycle due in 5 days.",
            missing_fields=None,
        ),
        RegulatoryFiling(
            regulation="MiFID II",
            filing_type="Transaction Reporting",
            status="Current",
            next_deadline=now + timedelta(days=30),
            last_submitted=now - timedelta(hours=18),
            notes="All derivative transactions reported to ARM. Next T+1 filing automated.",
            missing_fields=None,
        ),
    ]
    db.add_all(filings)
    db.commit()
    logger.info(f"Seeded {len(filings)} regulatory filings.")


def run_all_seeds():
    """Run all seed functions in dependency order. Idempotent."""
    from database.db import SessionLocal, init_db

    # Ensure schema is created
    init_db()

    db = SessionLocal()
    try:
        if is_seeded(db):
            logger.info("Database already seeded. Use --force to re-seed.")
            print("Database already seeded. Skipping.")
            return

        print("Seeding database...")

        # 1. Users (no dependencies)
        from database.seed.seed_users import seed_users
        seed_users(db)
        print("  Users seeded.")

        # 2. Books (depends on users)
        seed_books(db)
        print("  Books seeded.")

        # 3. Counterparties (no dependencies)
        from database.seed.seed_counterparties import seed_counterparties
        seed_counterparties(db)
        print("  Counterparties seeded.")

        # 4. Vessels (depends on counterparties for optional FK)
        from database.seed.seed_vessels import seed_vessels
        seed_vessels(db)
        print("  Vessels seeded.")

        # 5. Trades + MonthlyActuals + PerformanceTargets (depends on books, users, cps)
        from database.seed.seed_trades import seed_trades_and_actuals
        n_trades = seed_trades_and_actuals(db)
        print(f"  Trades seeded ({n_trades} trades + actuals + targets).")

        # 6. Positions (depends on books)
        from database.seed.seed_positions import seed_positions
        seed_positions(db)
        print("  Positions seeded.")

        # 7. Desk decisions (depends on users, books, counterparties)
        from database.seed.seed_decisions import seed_decisions
        n_dec = seed_decisions(db)
        print(f"  Desk decisions seeded ({n_dec} decisions).")

        # 8. Emails (depends on users)
        from database.seed.seed_emails import seed_emails
        seed_emails(db)
        print("  Emails seeded.")

        # 9. Demo scenarios (no dependencies)
        from database.seed.seed_scenarios import seed_scenarios
        seed_scenarios(db)
        print("  Demo scenarios seeded.")

        # 10. Regulatory filings (no dependencies)
        seed_regulatory(db)
        print("  Regulatory filings seeded.")

        print("\nAll seeds complete.")
        logger.info("All seeds completed successfully.")

    except Exception as e:
        db.rollback()
        logger.error(f"Seed error: {e}")
        print(f"ERROR during seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    # Allow callers from project root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    run_all_seeds()


def seed_monthly_actuals_if_empty():
    """Seed monthly_actuals and performance_targets if empty."""
    import sqlite3, random as _random, os
    _random.seed(42)
    from database.db import engine
    db_url = str(engine.url)
    db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")
    if not os.path.isabs(db_path):
        db_path = os.path.join(os.getcwd(), db_path.lstrip("./"))
    conn = sqlite3.connect(db_path)
    count = conn.execute('SELECT COUNT(*) FROM monthly_actuals').fetchone()[0]
    if count == 0:
        seasonal = [0.07, 0.08, 0.09, 0.085, 0.09, 0.095, 0.085, 0.08, 0.085, 0.09, 0.085, 0.08]
        targets = {2024: 32000000, 2025: 34000000, 2026: 36000000}
        for year, annual in targets.items():
            for month in range(1, 13):
                if year == 2026 and month > 5:
                    continue
                budget = annual * seasonal[month - 1]
                mult = _random.uniform(0.88, 1.18)
                pnl = budget * mult
                trades = _random.randint(55, 120)
                wins = int(trades * _random.uniform(0.58, 0.72))
                conn.execute(
                    '''INSERT INTO monthly_actuals
                    (year, month, book_id, trader_id, pnl, volume_traded, trades_count, win_count, loss_count, best_trade_pnl, worst_trade_pnl, var_avg)
                    VALUES (?,?,1,1,?,?,?,?,?,?,?,?)''',
                    (year, month, round(pnl, 0), _random.uniform(2e6, 8e6),
                     trades, wins, trades - wins,
                     _random.uniform(200000, 1200000), _random.uniform(-400000, -50000),
                     _random.uniform(1.2e6, 3.5e6))
                )
        conn.execute('DELETE FROM performance_targets')
        for year, target in targets.items():
            conn.execute(
                '''INSERT INTO performance_targets (year, book_id, trader_id, annual_target, q1_target, q2_target, q3_target, q4_target)
                VALUES (?,1,1,?,?,?,?,?)''',
                (year, target, target * 0.24, target * 0.26, target * 0.25, target * 0.25)
            )
        conn.commit()
        logger.info("Seeded monthly_actuals and performance_targets")
    conn.close()
