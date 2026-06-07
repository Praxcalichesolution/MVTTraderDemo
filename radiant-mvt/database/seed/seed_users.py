"""
Seed users for Radiant-MVT — INEOS Trading & Shipping personas.
"""
import logging
from passlib.context import CryptContext
from database.db import SessionLocal
from database.models import User

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_users(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(User).first():
            logger.info("Users already seeded — skipping.")
            return

        users_data = [
            {
                "email": "alex.chen@ineos-ts.com",
                "password": "Trader2026!",
                "full_name": "Alex Chen",
                "role": "trader",
                "title": "Senior Crude & Feedstock Trader",
                "desk": "INEOS Trading & Shipping",
            },
            {
                "email": "sarah.mitchell@ineos-ts.com",
                "password": "Risk2026!",
                "full_name": "Sarah Mitchell",
                "role": "risk",
                "title": "Head of Market Risk",
                "desk": "INEOS Trading & Shipping",
            },
            {
                "email": "james.hartley@ineos-ts.com",
                "password": "Exec2026!",
                "full_name": "James Hartley",
                "role": "executive",
                "title": "Head of Trading",
                "desk": "INEOS Trading & Shipping",
            },
            {
                "email": "admin@radiant-mvt.com",
                "password": "Admin2026!",
                "full_name": "System Administrator",
                "role": "admin",
                "title": "Platform Administrator",
                "desk": "Radiant-MVT",
            },
        ]

        users = []
        for u in users_data:
            users.append(User(
                email=u["email"],
                hashed_password=pwd_context.hash(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                title=u["title"],
                desk=u["desk"],
                is_active=1,
            ))

        db.add_all(users)
        db.commit()
        logger.info(f"Seeded {len(users)} users.")
        return len(users)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_users error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_users()
