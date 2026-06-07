"""
feeds/etrm_simulator.py
Simulates RightAngle ETRM system — generates synthetic trade blotters.
"""
import random
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from sqlalchemy import text
from datetime import datetime, date, timedelta
import logging

logger = logging.getLogger(__name__)
random.seed()

COMMODITIES = ['Brent', 'WTI', 'Urals', 'Ethane', 'NGLs']
DIRECTIONS = ['Buy', 'Sell']
TRADE_TYPES = ['Physical', 'Paper', 'Exchange']
STRATEGIES = ['Spread', 'Basis', 'Directional', 'Hedge', 'Arb']
INCOTERMS = ['CIF', 'FOB', 'DES', 'DAP']
LOCATIONS = ['Rotterdam', 'ARA', 'Sullom Voe', 'Hound Point', 'Grangemouth', 'Rafnes', 'Freeport TX']


def generate_trade_ref():
    import time
    ts = int(time.time() * 1000) % 100000
    return f"RMVT-{ts:05d}"


def get_current_price(db, commodity):
    row = db.execute(text("""
        SELECT price FROM market_data WHERE commodity = :c
        ORDER BY timestamp DESC LIMIT 1
    """), {"c": commodity}).fetchone()
    defaults = {"Brent": 82.40, "WTI": 78.90, "Urals": 77.60, "Ethane": 315.20, "NGLs": 58.50}
    return (row[0] if row else defaults.get(commodity, 80.0))


async def simulate_etrm_updates():
    """Simulate RightAngle sending new trades"""
    db = SessionLocal()
    try:
        books = db.execute(text("SELECT id FROM books LIMIT 4")).fetchall()
        users = db.execute(text("SELECT id FROM users WHERE role='trader' LIMIT 1")).fetchone()
        counterparties = db.execute(text("SELECT id FROM counterparties ORDER BY RANDOM() LIMIT 3")).fetchall()

        if not books or not users or not counterparties:
            return

        n_trades = random.randint(1, 2)
        for _ in range(n_trades):
            commodity = random.choice(COMMODITIES)
            direction = random.choice(DIRECTIONS)
            book = random.choice(books)
            cp = random.choice(counterparties)
            price = get_current_price(db, commodity) * random.uniform(0.995, 1.005)

            if commodity in ['Ethane', 'NGLs']:
                volume = random.randint(5000, 15000)
                unit = 'MT'
            else:
                volume = random.randint(50000, 500000)
                unit = 'bbl'

            trade_ref = generate_trade_ref()
            delivery_start = (date.today() + timedelta(days=random.randint(7, 45))).isoformat()
            delivery_end = (date.today() + timedelta(days=random.randint(46, 75))).isoformat()
            strategy = random.choice(STRATEGIES)
            pnl = volume * price * random.uniform(-0.008, 0.012) * (1 if direction == 'Buy' else -1)

            db.execute(text("""
                INSERT OR IGNORE INTO trades
                (trade_ref, book_id, trader_id, counterparty_id, commodity, trade_type, direction,
                 volume, volume_unit, price, price_basis, currency, trade_date, delivery_start,
                 delivery_end, delivery_location, incoterms, status, source_system, strategy_type,
                 pnl_realised, pnl_unrealised, created_at, updated_at)
                VALUES (:ref, :book, :trader, :cp, :comm, :ttype, :dir,
                        :vol, :unit, :price, 'Dated Brent', 'USD', :tdate, :ds,
                        :de, :loc, :inc, 'Confirmed', 'RightAngle', :strat,
                        0, :pnl, :now, :now)
            """), {
                "ref": trade_ref, "book": book[0], "trader": users[0], "cp": cp[0],
                "comm": commodity, "ttype": random.choice(TRADE_TYPES), "dir": direction,
                "vol": volume, "unit": unit, "price": round(price, 3),
                "tdate": date.today().isoformat(), "ds": delivery_start, "de": delivery_end,
                "loc": random.choice(LOCATIONS), "inc": random.choice(INCOTERMS),
                "strat": strategy, "pnl": round(pnl, 0), "now": datetime.now().isoformat()
            })

        db.commit()
        logger.info(f"ETRM simulator: added {n_trades} new trades")
    except Exception as e:
        logger.error(f"ETRM simulator error: {e}")
        db.rollback()
    finally:
        db.close()


# backward compat alias used by main.py scheduler
start_etrm_feed = simulate_etrm_updates
