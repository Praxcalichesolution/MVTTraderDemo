"""
Seed counterparties for Radiant-MVT — real INEOS trading counterparties.
"""
import logging
import json
from database.db import SessionLocal
from database.models import Counterparty

logger = logging.getLogger(__name__)


def seed_counterparties(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(Counterparty).first():
            logger.info("Counterparties already seeded — skipping.")
            return

        cps_data = [
            {
                "name": "Vitol SA",
                "short_name": "Vitol",
                "country": "Switzerland",
                "credit_limit": 15000000,
                "credit_used": 8900000,
                "typical_trade_size_bbl": 500000,
                "preferred_commodities": json.dumps(["Brent", "Urals"]),
                "avg_response_hours": 2.5,
                "seasonal_activity": json.dumps({"high": [3, 4, 9, 10, 11], "low": [1, 7, 8]}),
                "relationship_since": 2012,
                "contact_name": "James Thornton",
                "contact_email": "james.thornton@vitol.com",
                "isda_status": "Signed",
            },
            {
                "name": "Trafigura PTE",
                "short_name": "Trafigura",
                "country": "Singapore",
                "credit_limit": 12000000,
                "credit_used": 5400000,
                "typical_trade_size_bbl": 750000,
                "preferred_commodities": json.dumps(["WTI", "Urals", "NGLs"]),
                "avg_response_hours": 3.0,
                "seasonal_activity": json.dumps({"high": [2, 3, 9, 10], "low": [6, 7]}),
                "relationship_since": 2010,
                "contact_name": "David Lim",
                "contact_email": "d.lim@trafigura.com",
                "isda_status": "Signed",
            },
            {
                "name": "Shell Trading International",
                "short_name": "Shell",
                "country": "Netherlands",
                "credit_limit": 20000000,
                "credit_used": 7200000,
                "typical_trade_size_bbl": 600000,
                "preferred_commodities": json.dumps(["Brent", "Ethane"]),
                "avg_response_hours": 2.0,
                "seasonal_activity": json.dumps({"high": [1, 4, 5, 10, 11, 12], "low": [7, 8]}),
                "relationship_since": 2015,
                "contact_name": "Rebecca Okafor",
                "contact_email": "pricing@shell-trading.com",
                "isda_status": "Signed",
            },
            {
                "name": "BP Oil International",
                "short_name": "BP",
                "country": "United Kingdom",
                "credit_limit": 18000000,
                "credit_used": 9100000,
                "typical_trade_size_bbl": 500000,
                "preferred_commodities": json.dumps(["Brent", "Gas"]),
                "avg_response_hours": 2.2,
                "seasonal_activity": json.dumps({"high": [1, 2, 10, 11, 12], "low": [6, 7, 8]}),
                "relationship_since": 2011,
                "contact_name": "Alistair MacDonald",
                "contact_email": "a.macdonald@bp.com",
                "isda_status": "Signed",
            },
            {
                "name": "Gunvor Group",
                "short_name": "Gunvor",
                "country": "Cyprus",
                "credit_limit": 8000000,
                "credit_used": 3200000,
                "typical_trade_size_bbl": 400000,
                "preferred_commodities": json.dumps(["Urals", "Products"]),
                "avg_response_hours": 3.5,
                "seasonal_activity": json.dumps({"high": [3, 4, 9, 10], "low": [6, 7]}),
                "relationship_since": 2016,
                "contact_name": "Nikolai Smirnov",
                "contact_email": "n.smirnov@gunvor.com",
                "isda_status": "Signed",
            },
            {
                "name": "Glencore Energy UK",
                "short_name": "Glencore",
                "country": "Switzerland",
                "credit_limit": 10000000,
                "credit_used": 4500000,
                "typical_trade_size_bbl": 500000,
                "preferred_commodities": json.dumps(["Crude", "NGLs"]),
                "avg_response_hours": 2.8,
                "seasonal_activity": json.dumps({"high": [2, 3, 10, 11], "low": [7, 8]}),
                "relationship_since": 2014,
                "contact_name": "Francesca Bauer",
                "contact_email": "f.bauer@glencore.com",
                "isda_status": "Signed",
            },
            {
                "name": "TotalEnergies Trading SA",
                "short_name": "TotalEnergies",
                "country": "France",
                "credit_limit": 15000000,
                "credit_used": 6800000,
                "typical_trade_size_bbl": 550000,
                "preferred_commodities": json.dumps(["Brent", "LNG"]),
                "avg_response_hours": 2.3,
                "seasonal_activity": json.dumps({"high": [1, 4, 5, 11, 12], "low": [7, 8]}),
                "relationship_since": 2013,
                "contact_name": "Pierre Dubois",
                "contact_email": "p.dubois@totalenergies.com",
                "isda_status": "Signed",
            },
            {
                "name": "Mercuria Energy Trading",
                "short_name": "Mercuria",
                "country": "Switzerland",
                "credit_limit": 7000000,
                "credit_used": 2800000,
                "typical_trade_size_bbl": 350000,
                "preferred_commodities": json.dumps(["WTI", "Products"]),
                "avg_response_hours": 3.2,
                "seasonal_activity": json.dumps({"high": [3, 4, 9, 10], "low": [1, 7]}),
                "relationship_since": 2018,
                "contact_name": "Antoine Berger",
                "contact_email": "a.berger@mercuria.com",
                "isda_status": "Signed",
            },
            {
                "name": "Repsol Trading SA",
                "short_name": "Repsol",
                "country": "Spain",
                "credit_limit": 6000000,
                "credit_used": 1900000,
                "typical_trade_size_bbl": 300000,
                "preferred_commodities": json.dumps(["Brent", "Naphtha"]),
                "avg_response_hours": 4.0,
                "seasonal_activity": json.dumps({"high": [4, 5, 9, 10], "low": [7, 8]}),
                "relationship_since": 2019,
                "contact_name": "Carlos Moreno",
                "contact_email": "c.moreno@repsol.com",
                "isda_status": "Signed",
            },
            {
                "name": "Equinor ASA",
                "short_name": "Equinor",
                "country": "Norway",
                "credit_limit": 12000000,
                "credit_used": 5500000,
                "typical_trade_size_bbl": 500000,
                "preferred_commodities": json.dumps(["Brent", "Ethane"]),
                "avg_response_hours": 2.0,
                "seasonal_activity": json.dumps({"high": [1, 2, 11, 12], "low": [6, 7, 8]}),
                "relationship_since": 2014,
                "contact_name": "Lars Andersen",
                "contact_email": "l.andersen@equinor.com",
                "isda_status": "Signed",
            },
        ]

        cps = []
        for c in cps_data:
            cps.append(Counterparty(
                name=c["name"],
                short_name=c["short_name"],
                country=c["country"],
                credit_limit=c["credit_limit"],
                credit_used=c["credit_used"],
                isda_status=c["isda_status"],
                typical_trade_size_bbl=c["typical_trade_size_bbl"],
                preferred_commodities=c["preferred_commodities"],
                avg_response_hours=c["avg_response_hours"],
                seasonal_activity=c["seasonal_activity"],
                relationship_since=c["relationship_since"],
                contact_name=c["contact_name"],
                contact_email=c["contact_email"],
            ))

        db.add_all(cps)
        db.commit()
        logger.info(f"Seeded {len(cps)} counterparties.")
        return len(cps)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_counterparties error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_counterparties()
