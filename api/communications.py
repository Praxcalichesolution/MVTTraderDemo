"""
api/communications.py — Email hub and communication threads
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import Email, Trade, Vessel
from datetime import datetime

router = APIRouter()


@router.get("/emails")
async def get_emails(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    direction: Optional[str] = None,
    limit: int = Query(default=20),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Email inbox/outbox with AI-assigned priorities."""
    query = db.query(Email)
    if status:
        query = query.filter(Email.status == status)
    if priority:
        query = query.filter(Email.ai_priority == priority)
    if direction:
        query = query.filter(Email.direction == direction)
    emails = query.order_by(Email.received_at.desc()).limit(limit).all()

    result = []
    for e in emails:
        trade_ref = None
        vessel_name = None
        if e.ai_linked_trade_id:
            t = db.query(Trade).filter(Trade.id == e.ai_linked_trade_id).first()
            trade_ref = t.trade_ref if t else None
        if e.ai_linked_vessel_id:
            v = db.query(Vessel).filter(Vessel.id == e.ai_linked_vessel_id).first()
            vessel_name = v.name if v else None
        result.append({
            "id": e.id,
            "direction": e.direction,
            "from_name": e.from_name,
            "from_email": e.from_email,
            "subject": e.subject,
            "body_preview": (e.body or "")[:200] if e.body else None,
            "ai_summary": e.ai_summary,
            "ai_priority": e.ai_priority,
            "ai_action_required": e.ai_action_required,
            "status": e.status,
            "received_at": str(e.received_at) if e.received_at else None,
            "deadline": str(e.deadline) if e.deadline else None,
            "linked_trade_ref": trade_ref,
            "linked_vessel_name": vessel_name,
        })
    return result


@router.get("/inbox")
async def get_inbox(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=20),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Inbound emails only."""
    query = db.query(Email).filter(Email.direction == "Inbound")
    if status:
        query = query.filter(Email.status == status)
    if priority:
        query = query.filter(Email.ai_priority == priority)
    emails = query.order_by(Email.received_at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "from_name": e.from_name,
            "from_email": e.from_email,
            "subject": e.subject,
            "body_preview": (e.body or "")[:200] if e.body else None,
            "ai_summary": e.ai_summary,
            "ai_priority": e.ai_priority,
            "ai_action_required": e.ai_action_required,
            "status": e.status,
            "received_at": str(e.received_at) if e.received_at else None,
            "deadline": str(e.deadline) if e.deadline else None,
        }
        for e in emails
    ]


@router.get("/emails/unread-count")
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    count = db.query(Email).filter(Email.status == "Unread").count()
    return {"unread_count": count}


@router.patch("/{email_id}/mark-actioned")
async def mark_actioned(
    email_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email.status = "Actioned"
    db.commit()
    return {"status": "actioned", "email_id": email_id}


@router.post("/{email_id}/mark-actioned")
async def mark_actioned_post(
    email_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return await mark_actioned(email_id, db, current_user)


@router.get("/outstanding-actions")
async def get_outstanding_actions(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Emails with pending AI-identified actions, ordered by priority."""
    emails = (
        db.query(Email)
        .filter(
            Email.status.not_in(["Actioned", "Dismissed"]),
            Email.ai_action_required.isnot(None),
        )
        .all()
    )

    priority_order = {"Critical": 1, "High": 2, "Medium": 3, "Low": 4}
    emails_sorted = sorted(
        emails,
        key=lambda e: (priority_order.get(e.ai_priority, 5),
                       str(e.deadline) if e.deadline else "9999"),
    )

    return [
        {
            "id": e.id,
            "subject": e.subject,
            "from_name": e.from_name,
            "ai_priority": e.ai_priority,
            "ai_action_required": e.ai_action_required,
            "deadline": str(e.deadline) if e.deadline else None,
            "status": e.status,
        }
        for e in emails_sorted
    ]
