"""
feeds/etrm_simulator.py
Simulates RightAngle ETRM system by generating synthetic trade blotters.
"""
import logging
import os
import random
import sys
from datetime import date, datetime, timedelta

from sqlalchemy.exc import IntegrityError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from database.models import Book, Counterparty, MarketData, Trade, User

logger = logging.getLogger(__name__)
random.seed()

COMMODITIES = ["Brent", "WTI", "Urals", "Ethane", "NGLs"]
DIRECTIONS = ["Buy", "Sell"]
TRADE_TYPES = ["Physical", "Paper", "Exchange"]
STRATEGIES = ["Spread", "Basis", "Directional", "Hedge", "Arb"]
INCOTERMS = ["CIF", "FOB", "DES", "DAP"]
LOCATIONS = ["Rotterdam", "ARA", "Sullom Voe", "Hound Point", "Grangemouth", "Rafnes", "Freeport TX"]


def generate_trade_ref():
    import time

    ts = int(time.time() * 1000) % 100000
    return f"RMVT-{ts:05d}"


def get_current_price(db, commodity):
    row = (
        db.query(MarketData)
        .filter(MarketData.commodity == commodity)
        .order_by(MarketData.timestamp.desc())
        .first()
    )
    defaults = {"Brent": 82.40, "WTI": 78.90, "Urals": 77.60, "Ethane": 315.20, "NGLs": 58.50}
    return row.price if row else defaults.get(commodity, 80.0)


async def simulate_etrm_updates():
    """Simulate RightAngle sending new trades."""
    db = SessionLocal()
    try:
        books = db.query(Book).limit(4).all()
        user = db.query(User).filter(User.role == "trader").first()
        counterparties = db.query(Counterparty).all()

        if not books or user is None or not counterparties:
            return

        n_trades = random.randint(1, 2)
        for _ in range(n_trades):
            commodity = random.choice(COMMODITIES)
            direction = random.choice(DIRECTIONS)
            book = random.choice(books)
            cp = random.choice(counterparties)
            price = get_current_price(db, commodity) * random.uniform(0.995, 1.005)

            if commodity in ["Ethane", "NGLs"]:
                volume = random.randint(5000, 15000)
                unit = "MT"
            else:
                volume = random.randint(50000, 500000)
                unit = "bbl"

            trade = Trade(
                trade_ref=generate_trade_ref(),
                book_id=book.id,
                trader_id=user.id,
                counterparty_id=cp.id,
                commodity=commodity,
                trade_type=random.choice(TRADE_TYPES),
                direction=direction,
                volume=volume,
                volume_unit=unit,
                price=round(price, 3),
                price_basis="Dated Brent",
                currency="USD",
                trade_date=date.today(),
                delivery_start=date.today() + timedelta(days=random.randint(7, 45)),
                delivery_end=date.today() + timedelta(days=random.randint(46, 75)),
                delivery_location=random.choice(LOCATIONS),
                incoterms=random.choice(INCOTERMS),
                status="Confirmed",
                source_system="RightAngle",
                strategy_type=random.choice(STRATEGIES),
                pnl_realised=0,
                pnl_unrealised=round(
                    volume * price * random.uniform(-0.008, 0.012) * (1 if direction == "Buy" else -1),
                    0,
                ),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(trade)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                continue

        db.commit()
        logger.info("ETRM simulator: added %d new trades", n_trades)
    except Exception as exc:
        logger.error("ETRM simulator error: %s", exc)
        db.rollback()
    finally:
        db.close()


start_etrm_feed = simulate_etrm_updates
