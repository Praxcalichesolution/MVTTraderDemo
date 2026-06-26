"""
feeds/market_tick_simulator.py
High-frequency intra-day price tick simulation.
"""
import random
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from datetime import datetime
import logging
from database.models import MarketData

logger = logging.getLogger(__name__)

COMMODITIES = {
    "Brent": {"base": 82.40, "vol": 0.003},
    "WTI": {"base": 78.90, "vol": 0.003},
    "Urals": {"base": 77.60, "vol": 0.004},
    "Ethane": {"base": 315.20, "vol": 0.005},
    "NGLs": {"base": 58.50, "vol": 0.004},
    "EUA": {"base": 63.20, "vol": 0.006},
    "EURUSD": {"base": 1.0840, "vol": 0.001},
    "GBPUSD": {"base": 1.2720, "vol": 0.001},
    "HH": {"base": 2.84, "vol": 0.008},
}


async def start_tick_feed():
    """Add intraday micro price movements between real data refreshes"""
    db = SessionLocal()
    try:
        for commodity, params in COMMODITIES.items():
            last = (
                db.query(MarketData)
                .filter(MarketData.commodity == commodity)
                .order_by(MarketData.timestamp.desc())
                .first()
            )

            base_price = last.price if last else params["base"]

            move_pct = random.gauss(0, params["vol"])
            new_price = base_price * (1 + move_pct)
            change = new_price - base_price

            if abs(new_price - params["base"]) / params["base"] > 0.08:
                new_price = params["base"] * (1 + random.uniform(-0.02, 0.02))
                change = new_price - base_price

            db.add(MarketData(
                commodity=commodity,
                price=round(new_price, 4),
                change_1d=round(change, 4),
                change_pct_1d=round(move_pct * 100, 4),
                source="tick",
                timestamp=datetime.utcnow(),
            ))

        db.commit()
        logger.info("Tick simulator: updated all commodity prices")
    except Exception as e:
        logger.error(f"Tick simulator error: {e}")
        db.rollback()
    finally:
        db.close()


# alias for scheduler
emit_market_ticks = start_tick_feed
