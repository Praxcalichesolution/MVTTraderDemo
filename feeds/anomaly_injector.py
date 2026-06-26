"""
feeds/anomaly_injector.py
Injects synthetic trading anomalies for demo / testing purposes.
Creates alerts and optionally marks trades as anomalous.
"""
import logging
import random
from datetime import datetime, timedelta
from database.db import SessionLocal
from database.models import Alert

logger = logging.getLogger(__name__)

ANOMALY_TEMPLATES = [
    {
        "alert_type": "PnL Spike",
        "severity": "High",
        "title": "Unusual P&L spike detected in Ethane Americas book",
        "description": (
            "Book P&L moved +$420,000 in a single 15-minute window, "
            "exceeding the 2-sigma threshold. Potential fat-finger or "
            "unauthorised position increase."
        ),
        "estimated_impact": 420_000,
        "ai_explanation": (
            "The P&L velocity is 3.4 standard deviations above the rolling mean. "
            "Cross-referencing with the trade blotter shows two large buy orders "
            "executed at off-market prices. Recommend immediate review."
        ),
        "ai_draft_action": (
            "1. Freeze further trading on Ethane Americas until reviewed.\n"
            "2. Contact trader for explanation.\n"
            "3. Escalate to risk desk if no response within 30 minutes."
        ),
    },
    {
        "alert_type": "Credit Breach",
        "severity": "Critical",
        "title": "Credit limit breach — Shell Trading",
        "description": "Exposure to Shell Trading has reached 97% of the $50M credit limit.",
        "estimated_impact": 48_500_000,
        "ai_explanation": (
            "Three back-to-back physical LNG purchases with Shell have pushed "
            "gross exposure to $48.5M against a $50M limit. "
            "One additional standard-size trade will breach the hard limit."
        ),
        "ai_draft_action": (
            "1. Halt new trades with Shell Trading immediately.\n"
            "2. Notify credit team and request emergency limit review.\n"
            "3. Consider novating one position to reduce exposure."
        ),
    },
    {
        "alert_type": "VaR Breach",
        "severity": "High",
        "title": "Portfolio VaR approaching limit",
        "description": "Daily VaR estimate has reached $7.2M, 90% of the $8M limit.",
        "estimated_impact": 7_200_000,
        "ai_explanation": (
            "Propane long positions added this morning have increased VaR "
            "by $1.1M. Current concentration in prompt-month propane is the "
            "primary driver."
        ),
        "ai_draft_action": (
            "1. Review open propane positions for partial hedge opportunities.\n"
            "2. Consider selling calendar spreads to reduce prompt exposure.\n"
            "3. Alert risk management of current utilisation level."
        ),
    },
    {
        "alert_type": "Vessel Delay",
        "severity": "Medium",
        "title": "JS Ineos Insight delayed by 14 hours — demurrage risk",
        "description": (
            "Weather-related delay in the North Sea has pushed ETA past "
            "the allowed laytime window. Estimated demurrage: $26,250."
        ),
        "estimated_impact": 26_250,
        "ai_explanation": (
            "At $45,000/day charter rate, a 14-hour delay equates to $26,250 "
            "demurrage liability. The counterparty agreement has a 36-hour "
            "laytime allowance which will be exhausted."
        ),
        "ai_draft_action": (
            "1. Notify Borealis AS of expected delay.\n"
            "2. Prepare demurrage NOR documentation.\n"
            "3. Explore berth-swapping at Rafnes to minimise port time."
        ),
    },
    {
        "alert_type": "Margin Call",
        "severity": "Critical",
        "title": "ICE margin call — $1.8M variation margin due by 14:00",
        "description": (
            "Overnight price moves on natural gas futures have triggered a "
            "variation margin call of $1.8M due to ICE before 14:00 UTC."
        ),
        "estimated_impact": 1_800_000,
        "ai_explanation": (
            "Natural gas prompt contract fell 4.2% overnight. "
            "Net short position of 50,000 MMBtu generates a $1.8M mark-to-market loss "
            "requiring immediate cash settlement."
        ),
        "ai_draft_action": (
            "1. Confirm treasury has sufficient same-day liquidity.\n"
            "2. Wire transfer to ICE clearing account by 13:30 UTC.\n"
            "3. Review natural gas short position sizing."
        ),
    },
]


async def inject_random_anomaly(force: bool = False):
    """
    With a small probability (or always if force=True), insert an anomaly alert.
    """
    if not force and random.random() > 0.12:   # ~12% chance per cycle
        return

    template = random.choice(ANOMALY_TEMPLATES)
    logger.info("[anomaly_injector] Injecting anomaly: %s", template["title"])
    db = SessionLocal()
    try:
        existing = (
            db.query(Alert)
            .filter(
                Alert.title == template["title"],
                Alert.created_at > (datetime.utcnow() - timedelta(minutes=30)),
            )
            .first()
        )

        if existing:
            logger.debug("[anomaly_injector] Duplicate alert suppressed.")
            return

        db.add(
            Alert(
                alert_type=template["alert_type"],
                severity=template["severity"],
                title=template["title"],
                description=template["description"],
                estimated_impact=template["estimated_impact"],
                ai_explanation=template["ai_explanation"],
                ai_draft_action=template["ai_draft_action"],
                status="Open",
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
        logger.info("[anomaly_injector] Alert created: %s", template["title"])
    except Exception as exc:
        logger.exception("[anomaly_injector] Error: %s", exc)
        db.rollback()
    finally:
        db.close()
