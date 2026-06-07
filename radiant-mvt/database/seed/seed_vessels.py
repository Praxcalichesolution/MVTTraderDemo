"""
Seed INEOS Dragon fleet vessels for Radiant-MVT.
All 6 JS Ineos class vessels — 27,500 m³ multi-gas carriers.
"""
import logging
from datetime import datetime, timedelta
from database.db import SessionLocal
from database.models import Vessel

logger = logging.getLogger(__name__)


def seed_vessels(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(Vessel).first():
            logger.info("Vessels already seeded — skipping.")
            return

        now = datetime.utcnow()

        vessels_data = [
            {
                "name": "JS Ineos Intrepid",
                "imo_number": "9780978",
                "capacity_m3": 27500,
                "origin_port": "Marcus Hook, PA, USA",
                "destination_port": "Rafnes, Norway",
                "current_lat": 52.3,
                "current_lon": -18.2,
                "status": "En Route",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 12400,
                "eta": now + timedelta(days=4),
                "original_eta": now + timedelta(days=4),
                "delay_hours": 0,
            },
            {
                "name": "JS Ineos Insight",
                "imo_number": "9780980",
                "capacity_m3": 27500,
                "origin_port": "Marcus Hook, PA, USA",
                "destination_port": "Grangemouth, Scotland",
                "current_lat": 48.1,
                "current_lon": -22.5,
                "status": "En Route",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 11800,
                "eta": now + timedelta(days=6),
                "original_eta": now + timedelta(days=6),
                "delay_hours": 0,
            },
            {
                "name": "JS Ineos Ingenuity",
                "imo_number": "9780992",
                "capacity_m3": 27500,
                "origin_port": "Rafnes, Norway",
                "destination_port": "Marcus Hook, PA, USA",
                "current_lat": 58.9,
                "current_lon": -5.1,
                "status": "Ballast",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 0,
                "eta": now + timedelta(days=9),
                "original_eta": now + timedelta(days=9),
                "delay_hours": 0,
            },
            {
                "name": "JS Ineos Innovation",
                "imo_number": "9781006",
                "capacity_m3": 27500,
                "origin_port": "Marcus Hook, PA, USA",
                "destination_port": "Rafnes, Norway",
                "current_lat": 55.2,
                "current_lon": -10.8,
                "status": "En Route",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 12100,
                "eta": now + timedelta(days=2),
                "original_eta": now + timedelta(days=2),
                "delay_hours": 0,
            },
            {
                "name": "JS Ineos Independence",
                "imo_number": "9781018",
                "capacity_m3": 27500,
                "origin_port": "Freeport, TX, USA",
                "destination_port": "Grangemouth, Scotland",
                "current_lat": 35.8,
                "current_lon": -60.2,
                "status": "En Route",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 11500,
                "eta": now + timedelta(days=8),
                "original_eta": now + timedelta(days=8),
                "delay_hours": 0,
            },
            {
                "name": "JS Ineos Inspiration",
                "imo_number": "9781020",
                "capacity_m3": 27500,
                "origin_port": "Grangemouth, Scotland",
                "destination_port": "Marcus Hook, PA, USA",
                "current_lat": 53.5,
                "current_lon": -20.4,
                "status": "En Route",
                "cargo_commodity": "Ethane",
                "cargo_volume_mt": 0,
                "eta": now + timedelta(days=7),
                "original_eta": now + timedelta(days=7),
                "delay_hours": 0,
            },
        ]

        vessels = []
        for v in vessels_data:
            vessels.append(Vessel(
                name=v["name"],
                imo_number=v["imo_number"],
                capacity_m3=v["capacity_m3"],
                vessel_type="Multi-gas carrier",
                flag="Bahamas",
                origin_port=v["origin_port"],
                destination_port=v["destination_port"],
                current_lat=v["current_lat"],
                current_lon=v["current_lon"],
                status=v["status"],
                cargo_commodity=v["cargo_commodity"],
                cargo_volume_mt=v["cargo_volume_mt"],
                eta=v["eta"],
                original_eta=v["original_eta"],
                delay_hours=v["delay_hours"],
                charter_party_rate=45000,
                allowed_laytime_hours=36,
            ))

        db.add_all(vessels)
        db.commit()
        logger.info(f"Seeded {len(vessels)} vessels.")
        return len(vessels)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_vessels error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_vessels()
