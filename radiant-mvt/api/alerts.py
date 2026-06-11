"""
api/alerts.py — Alert management with AI explanations
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import Alert, Trade
from datetime import datetime

router = APIRouter()


@router.get("/")
async def get_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    limit: int = Query(default=20, le=50),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Active alerts, ordered by severity and creation time."""
    query = db.query(Alert).options(joinedload(Alert.affected_trade))
    if status:
        query = query.filter(Alert.status == status)
    if severity:
        query = query.filter(Alert.severity == severity)
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    alerts = query.order_by(Alert.created_at.desc()).limit(limit).all()

    result = []
    for a in alerts:
        result.append({
            "id": a.id,
            "alert_type": a.alert_type,
            "severity": a.severity,
            "title": a.title,
            "description": a.description,
            "affected_book": a.affected_book,
            "affected_trade_id": a.affected_trade_id,
            "trade_ref": a.affected_trade.trade_ref if a.affected_trade else None,
            "estimated_impact": a.estimated_impact,
            "ai_explanation": a.ai_explanation,
            "ai_draft_action": a.ai_draft_action,
            "status": a.status,
            "created_at": str(a.created_at) if a.created_at else None,
            "resolved_at": str(a.resolved_at) if a.resolved_at else None,
        })
    return result


@router.get("/summary")
async def get_alert_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Count of alerts by severity and status."""
    all_alerts = db.query(Alert).all()
    return {
        "total": len(all_alerts),
        "open": sum(1 for a in all_alerts if a.status == "Open"),
        "acknowledged": sum(1 for a in all_alerts if a.status == "Acknowledged"),
        "resolved": sum(1 for a in all_alerts if a.status == "Resolved"),
        "critical": sum(1 for a in all_alerts if a.severity == "Critical" and a.status == "Open"),
        "high": sum(1 for a in all_alerts if a.severity == "High" and a.status == "Open"),
        "total_estimated_impact": round(
            sum(a.estimated_impact or 0 for a in all_alerts if a.status == "Open"), 2
        ),
    }


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "Acknowledged"
    db.commit()
    return {"status": "acknowledged", "alert_id": alert_id}


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert_post(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return await acknowledge_alert(alert_id, db, current_user)


@router.patch("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "Resolved"
    alert.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "resolved", "alert_id": alert_id}


@router.post("/{alert_id}/resolve")
async def resolve_alert_post(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return await resolve_alert(alert_id, db, current_user)
