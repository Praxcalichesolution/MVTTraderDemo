"""
api/admin.py — Demo scenario triggers and system admin
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from database.db import get_db
from api.auth import get_current_user, get_current_admin
from database.models import AppConfig, DemoScenario, Alert, Trade, Vessel, Counterparty, AuditLog
from datetime import datetime
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Config ────────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    configs = db.query(AppConfig).all()
    return {c.key: c.value for c in configs}


@router.put("/config/{key}")
async def update_config(
    key: str,
    value: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    config = db.query(AppConfig).filter(AppConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = AppConfig(key=key, value=value)
        db.add(config)
    db.commit()
    return {"key": key, "value": value}


# ── Scenarios ─────────────────────────────────────────────────────────────────

@router.get("/scenarios")
async def list_scenarios(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all available demo scenarios."""
    scenarios = db.query(DemoScenario).filter(DemoScenario.is_active == 1).all()
    return [
        {
            "id": s.id,
            "scenario_key": s.scenario_key,
            "title": s.title,
            "description": s.description,
            "is_active": s.is_active,
        }
        for s in scenarios
    ]


@router.post("/scenarios/{scenario_key}/trigger")
async def trigger_scenario(
    scenario_key: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Trigger a demo scenario by key."""
    scenario = db.query(DemoScenario).filter(DemoScenario.scenario_key == scenario_key).first()
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_key}' not found")

    payload: dict = {}
    try:
        payload = json.loads(scenario.payload) if scenario.payload else {}
    except Exception:
        payload = {}

    now = datetime.utcnow().isoformat()

    # ── fat_finger ───────────────────────────────────────────────────────────
    if scenario_key == "fat_finger":
        # Upsert anomalous trade
        existing = db.query(Trade).filter(Trade.trade_ref == "RMVT-DEMO-001").first()
        if not existing:
            cp = db.query(Counterparty).first()
            new_trade = Trade(
                trade_ref="RMVT-DEMO-001",
                book_id=1, trader_id=1,
                counterparty_id=cp.id if cp else 1,
                commodity="Brent", trade_type="Physical", direction="Buy",
                volume=6_000_000, price=82.40, status="Pending",
                is_anomalous=True,
                anomaly_reason="Volume 8.4σ above maximum — fat finger suspected",
            )
            db.add(new_trade)

        db.add(Alert(
            alert_type="fat_finger", severity="Critical",
            title="Fat Finger Detected: RMVT-DEMO-001 — 6,000,000 bbl Brent",
            description="Trade volume is 6x the maximum single-trade size for Brent",
            estimated_impact=4_920_000,
            ai_explanation=payload.get(
                "ai_explanation",
                "Trade RMVT-DEMO-001 shows volume 8.4 standard deviations above the maximum "
                "observed single-trade size for Brent over 24 months. Probability of fat finger: 97.3%."
            ),
            ai_draft_action=payload.get("draft_email_body", ""),
            status="Open",
        ))
        db.commit()

    # ── dragon_delay ─────────────────────────────────────────────────────────
    elif scenario_key == "dragon_delay":
        vessels = db.query(Vessel).filter(Vessel.name.ilike("%Innovation%")).all()
        for v in vessels:
            if not v.original_eta:
                v.original_eta = v.eta
            v.delay_hours = 14
            v.updated_at = now
        db.commit()

    # ── stale_price ──────────────────────────────────────────────────────────
    elif scenario_key == "stale_price":
        db.add(Alert(
            alert_type="stale_price", severity="Critical",
            title="Stale Price Detected: $890K P&L Overstatement — Ethane Book",
            description="Two ethane trades priced on 28-May Argus assessment instead of today",
            estimated_impact=890_280,
            ai_explanation=(
                "Trades RMVT-0891 and RMVT-0892 priced at $318.50/MT (yesterday's Argus NWE) "
                "vs correct $279.80/MT today. Total P&L overstatement: $890,280."
            ),
            ai_draft_action=payload.get("draft_email_body", ""),
            status="Open",
        ))
        db.commit()

    # ── margin_breach ─────────────────────────────────────────────────────────
    elif scenario_key == "margin_breach":
        vitol = db.query(Counterparty).filter(Counterparty.name.ilike("%Vitol%")).first()
        if vitol:
            vitol.credit_used = 14_250_000
            db.commit()

    else:
        # Generic: just log it
        logger.info("Generic scenario triggered: %s", scenario_key)

    # Audit log
    try:
        db.add(AuditLog(
            user_id=current_user.get("id", 1),
            action_type="DEMO_SCENARIO_TRIGGERED",
            entity_type="scenario",
            description=f"Triggered: {scenario_key}",
            ai_involved=False,
        ))
        db.commit()
    except Exception:
        db.rollback()

    return {
        "scenario_key": scenario_key,
        "title": scenario.title,
        "payload": payload,
        "triggered_at": now,
    }


# ── System status ─────────────────────────────────────────────────────────────

@router.get("/health")
async def health_check(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    from database.models import User
    user_count = db.query(User).count()
    return {"status": "healthy", "users": user_count, "platform": "Radiant-MVT v1.0.0"}


@router.get("/system/status")
async def system_status(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Row counts for all major tables."""
    from sqlalchemy import text
    tables = ["trades", "positions", "alerts", "vessels", "emails", "news",
              "market_data", "forward_curves", "decision_queue", "chat_history"]
    counts = {}
    for table in tables:
        try:
            counts[table] = db.execute(text(f"SELECT COUNT(*) FROM {table}")).fetchone()[0]
        except Exception:
            counts[table] = -1
    return {"tables": counts, "status": "operational", "timestamp": datetime.utcnow().isoformat()}
