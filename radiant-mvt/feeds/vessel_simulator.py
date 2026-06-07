"""
feeds/vessel_simulator.py
Simulates AIS vessel position updates for INEOS gas carriers.
"""
import random
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from sqlalchemy import text
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

ROUTES = {
    "Marcus Hook, PA, USA": {"lat": 39.8, "lon": -75.4},
    "Marcus Hook": {"lat": 39.8, "lon": -75.4},
    "Freeport, TX, USA": {"lat": 28.9, "lon": -95.4},
    "Freeport LNG": {"lat": 28.9, "lon": -95.4},
    "Rafnes, Norway": {"lat": 59.1, "lon": 9.9},
    "Rafnes": {"lat": 59.1, "lon": 9.9},
    "Grangemouth, Scotland": {"lat": 56.0, "lon": -3.7},
    "Grangemouth": {"lat": 56.0, "lon": -3.7},
    "Rotterdam": {"lat": 51.9, "lon": 4.5},
    "Antwerp": {"lat": 51.2, "lon": 4.4},
    "Stenungsund": {"lat": 58.1, "lon": 11.8},
    "Wilton": {"lat": 54.6, "lon": -1.1},
}

DEFAULT_DEST = {"lat": 59.1, "lon": 9.9}
DEFAULT_ORIGIN = {"lat": 39.8, "lon": -75.4}


async def simulate_vessel_positions():
    """Update vessel positions along their routes"""
    db = SessionLocal()
    try:
        vessels = db.execute(text("""
            SELECT id, name, current_lat, current_lon, origin_port, destination_port,
                   eta, delay_hours, status, cargo_volume_mt
            FROM vessels
        """)).fetchall()

        for v in vessels:
            vid, name, lat, lon = v[0], v[1], v[2] or 50.0, v[3] or -20.0
            origin = v[4] or "Marcus Hook"
            dest = v[5] or "Rafnes"

            dest_coords = ROUTES.get(dest, DEFAULT_DEST)
            origin_coords = ROUTES.get(origin, DEFAULT_ORIGIN)

            dlat = dest_coords["lat"] - lat
            dlon = dest_coords["lon"] - lon
            distance = (dlat**2 + dlon**2)**0.5

            if distance < 1.0:
                new_lat = dest_coords["lat"]
                new_lon = dest_coords["lon"]
                new_status = "Loading" if v[9] and v[9] > 0 else "Ballast"
            else:
                speed = random.uniform(0.4, 0.8)
                new_lat = lat + (dlat / distance) * speed + random.uniform(-0.05, 0.05)
                new_lon = lon + (dlon / distance) * speed + random.uniform(-0.05, 0.05)
                delay = v[7] or 0
                new_status = "En Route (Delayed)" if delay > 0 else "En Route"

            db.execute(text("""
                UPDATE vessels SET current_lat=:lat, current_lon=:lon,
                status=:status, updated_at=:now WHERE id=:id
            """), {"lat": round(new_lat, 3), "lon": round(new_lon, 3),
                   "status": new_status, "now": datetime.now().isoformat(), "id": vid})

        db.commit()
        logger.info(f"Vessel simulator: updated {len(vessels)} vessels")
    except Exception as e:
        logger.error(f"Vessel simulator error: {e}")
        db.rollback()
    finally:
        db.close()


# backward compat alias
start_vessel_feed = simulate_vessel_positions
