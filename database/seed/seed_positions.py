"""
Seed current open positions for Radiant-MVT (as of today).
"""
import logging
from database.db import SessionLocal
from database.models import Position, Book

logger = logging.getLogger(__name__)


def seed_positions(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(Position).first():
            logger.info("Positions already seeded — skipping.")
            return

        book_by_name = {b.name: b for b in db.query(Book).all()}

        def bid(name):
            b = book_by_name.get(name)
            return b.id if b else None

        positions_data = [
            # Crude Book
            {
                "book_id": bid("Crude Book"),
                "commodity": "Brent",
                "region": "NW Europe",
                "tenor": "Prompt",
                "delivery_month": "Jun-26",
                "physical_volume": 420000,
                "paper_volume": -300000,
                "net_volume": 120000,
                "volume_unit": "bbl",
                "avg_price": 82.20,
                "mtm_price": 82.40,
                "mtm_pnl": 1240000,
                "hedge_ratio": 0.71,
                "var_contribution": 2400000,
            },
            {
                "book_id": bid("Crude Book"),
                "commodity": "Urals",
                "region": "Mediterranean",
                "tenor": "Prompt",
                "delivery_month": "Jun-26",
                "physical_volume": 80000,
                "paper_volume": 0,
                "net_volume": 80000,
                "volume_unit": "bbl",
                "avg_price": 77.40,
                "mtm_price": 77.60,
                "mtm_pnl": 440000,
                "hedge_ratio": 0.0,
                "var_contribution": 960000,
            },
            {
                "book_id": bid("Crude Book"),
                "commodity": "WTI",
                "region": "US Gulf",
                "tenor": "M+1",
                "delivery_month": "Jul-26",
                "physical_volume": 0,
                "paper_volume": -150000,
                "net_volume": -150000,
                "volume_unit": "bbl",
                "avg_price": 79.10,
                "mtm_price": 78.90,
                "mtm_pnl": 300000,
                "hedge_ratio": 1.0,
                "var_contribution": 1125000,
            },
            # Ethane Book
            {
                "book_id": bid("Ethane Book"),
                "commodity": "Ethane",
                "region": "NW Europe",
                "tenor": "Prompt",
                "delivery_month": "Jun-26",
                "physical_volume": 85000,
                "paper_volume": 0,
                "net_volume": 85000,
                "volume_unit": "MT",
                "avg_price": 318.50,
                "mtm_price": 315.20,
                "mtm_pnl": -320000,
                "hedge_ratio": 0.0,
                "var_contribution": 510000,
            },
            # NGLs Book
            {
                "book_id": bid("NGLs Book"),
                "commodity": "NGLs",
                "region": "NW Europe",
                "tenor": "Prompt",
                "delivery_month": "Jun-26",
                "physical_volume": -12000,
                "paper_volume": 15000,
                "net_volume": 3000,
                "volume_unit": "MT",
                "avg_price": 58.20,
                "mtm_price": 58.80,
                "mtm_pnl": 88000,
                "hedge_ratio": 0.80,
                "var_contribution": 90000,
            },
            # Carbon Book
            {
                "book_id": bid("Carbon Book"),
                "commodity": "EUA",
                "region": "EU",
                "tenor": "Dec-26",
                "delivery_month": "Dec-26",
                "physical_volume": 0,
                "paper_volume": 0,
                "net_volume": 0,
                "volume_unit": "tonne",
                "avg_price": 63.20,
                "mtm_price": 63.20,
                "mtm_pnl": 0,
                "hedge_ratio": 0.0,
                "var_contribution": 0,
            },
        ]

        positions = []
        for p in positions_data:
            if p["book_id"] is None:
                continue
            positions.append(Position(
                book_id=p["book_id"],
                commodity=p["commodity"],
                region=p["region"],
                tenor=p["tenor"],
                delivery_month=p["delivery_month"],
                physical_volume=p["physical_volume"],
                paper_volume=p["paper_volume"],
                net_volume=p["net_volume"],
                volume_unit=p.get("volume_unit", "bbl"),
                avg_price=p["avg_price"],
                mtm_price=p["mtm_price"],
                mtm_pnl=p["mtm_pnl"],
                hedge_ratio=p.get("hedge_ratio", 0),
                var_contribution=p.get("var_contribution", 0),
            ))

        db.add_all(positions)
        db.commit()
        logger.info(f"Seeded {len(positions)} positions.")
        return len(positions)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_positions error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_positions()
