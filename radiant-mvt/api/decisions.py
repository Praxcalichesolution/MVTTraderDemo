"""
api/decisions.py — Decision queue management
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import DecisionQueue, Trade, Vessel, Alert
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/queue")
async def get_decision_queue(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT id, title, description, decision_type, potential_impact,
               impact_description, urgency, deadline, status, created_at,
               related_trade_id, related_vessel_id, related_alert_id
        FROM decision_queue
        WHERE status IN ('Pending', 'Snoozed')
        ORDER BY
            CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
            deadline ASC
        LIMIT 20
    """)).fetchall()

    if not rows:
        # Seed 3 realistic decisions directly
        import sqlite3
        from database.db import engine
        db_url = str(engine.url)
        db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")
        import os
        if not os.path.isabs(db_path):
            db_path = os.path.join(os.getcwd(), db_path.lstrip("./"))
        conn = sqlite3.connect(db_path)
        now = datetime.now()
        decisions = [
            ('Review Urals hedge coverage before OPEC+', 'Urals net long 80,000 bbl with OPEC+ announcement in 2 hours. Current hedge ratio 61%.', 'Hedge Review', 2400000, '$2.4M at risk if spread moves', 'Critical', (now + timedelta(hours=2)).isoformat(), 1, 'Pending'),
            ('JS Ineos Innovation delay — choose response option', 'Dragon vessel delayed 14 hours. Three options costed: accelerate ($41K), maintain ($131K), hedge ($35K net). Terminal needs decision.', 'Operational', 480000, 'Voyage economics impact $480K', 'High', (now + timedelta(hours=3, minutes=26)).isoformat(), 1, 'Pending'),
            ('Vitol trade confirmation outstanding — RMVT-0234', 'Verbal trade agreed this morning. Written confirmation not sent. Counterparty deadline 15:00.', 'Confirmation', 0, 'Counterparty dispute risk if missed', 'Medium', (now + timedelta(hours=7, minutes=26)).isoformat(), 1, 'Pending'),
        ]
        for d in decisions:
            conn.execute('INSERT OR IGNORE INTO decision_queue (title, description, decision_type, potential_impact, impact_description, urgency, deadline, user_id, status) VALUES (?,?,?,?,?,?,?,?,?)', d)
        conn.commit()
        conn.close()
        rows = db.execute(text("""
            SELECT id, title, description, decision_type, potential_impact,
                   impact_description, urgency, deadline, status, created_at,
                   related_trade_id, related_vessel_id, related_alert_id
            FROM decision_queue
            WHERE status IN ('Pending', 'Snoozed')
            ORDER BY
                CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                deadline ASC
            LIMIT 20
        """)).fetchall()

    return [dict(r._mapping) for r in rows]


@router.get("/")
async def get_decisions(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """All decisions for the current user (Pending + Snoozed)."""
    items = (
        db.query(DecisionQueue)
        .filter(DecisionQueue.status.in_(["Pending", "Snoozed"]))
        .order_by(DecisionQueue.created_at.desc())
        .all()
    )
    return [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "decision_type": i.decision_type,
            "urgency": i.urgency,
            "potential_impact": i.potential_impact,
            "impact_description": i.impact_description,
            "deadline": str(i.deadline) if i.deadline else None,
            "status": i.status,
            "created_at": str(i.created_at) if i.created_at else None,
        }
        for i in items
    ]


@router.patch("/{decision_id}/complete")
async def complete_decision(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    item.status = "Completed"
    item.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "completed", "decision_id": decision_id}


@router.post("/{decision_id}/complete")
async def complete_decision_post(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return await complete_decision(decision_id, db, current_user)


@router.post("/{decision_id}/snooze")
async def snooze_decision(
    decision_id: int,
    minutes: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    snooze_until = (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()
    item.status = "Snoozed"
    db.commit()
    return {"status": "snoozed", "until": snooze_until, "decision_id": decision_id}
