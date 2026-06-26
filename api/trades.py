"""
api/trades.py — Trade blotter endpoints
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import Trade, Book, Counterparty

router = APIRouter()


@router.get("/")
async def get_trades(
    book_id: Optional[int] = None,
    commodity: Optional[str] = None,
    status: Optional[str] = None,
    counterparty: Optional[str] = None,
    is_anomalous: Optional[bool] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Full trade blotter with filtering and pagination."""
    query = db.query(Trade).options(
        joinedload(Trade.book),
        joinedload(Trade.counterparty),
    )
    if book_id:
        query = query.filter(Trade.book_id == book_id)
    if commodity:
        query = query.filter(Trade.commodity == commodity)
    if status:
        query = query.filter(Trade.status == status)
    if counterparty:
        query = query.join(Counterparty, Trade.counterparty_id == Counterparty.id).filter(
            Counterparty.name.ilike(f"%{counterparty}%")
        )
    if is_anomalous is not None:
        query = query.filter(Trade.is_anomalous == (1 if is_anomalous else 0))

    total = query.count()
    trades = query.order_by(Trade.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for t in trades:
        result.append({
            "id": t.id,
            "trade_ref": t.trade_ref,
            "book": t.book.name if t.book else None,
            "book_id": t.book_id,
            "counterparty": t.counterparty.name if t.counterparty else None,
            "counterparty_id": t.counterparty_id,
            "commodity": t.commodity,
            "trade_type": t.trade_type,
            "direction": t.direction,
            "volume": t.volume,
            "volume_unit": t.volume_unit,
            "price": t.price,
            "price_basis": t.price_basis,
            "currency": t.currency,
            "trade_date": str(t.trade_date) if t.trade_date else None,
            "delivery_start": str(t.delivery_start) if t.delivery_start else None,
            "delivery_end": str(t.delivery_end) if t.delivery_end else None,
            "status": t.status,
            "strategy_type": t.strategy_type,
            "pnl_realised": t.pnl_realised,
            "pnl_unrealised": t.pnl_unrealised,
            "is_anomalous": bool(t.is_anomalous),
            "anomaly_reason": t.anomaly_reason,
            "created_at": str(t.created_at) if t.created_at else None,
        })
    return {"trades": result, "total": total, "limit": limit, "offset": offset}


@router.get("/stats")
async def get_trade_stats(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Aggregate win/loss statistics across the blotter."""
    trades = db.query(Trade).filter(Trade.status != "Cancelled").all()
    total = len(trades)
    winning = sum(1 for t in trades if (t.pnl_realised or 0) > 0)
    losing = sum(1 for t in trades if (t.pnl_realised or 0) < 0)
    total_realised = sum(t.pnl_realised or 0 for t in trades)
    pnl_vals = [t.pnl_realised for t in trades if t.pnl_realised is not None]
    anomalous = sum(1 for t in trades if t.is_anomalous)

    return {
        "total_trades": total,
        "winning": winning,
        "losing": losing,
        "total_realised_pnl": round(total_realised, 2),
        "avg_trade_pnl": round(total_realised / max(total, 1), 2),
        "best_trade": round(max(pnl_vals), 2) if pnl_vals else None,
        "worst_trade": round(min(pnl_vals), 2) if pnl_vals else None,
        "win_rate_pct": round(winning / max(total, 1) * 100, 1),
        "anomalous_count": anomalous,
    }


@router.get("/{trade_ref}")
async def get_trade(
    trade_ref: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Single trade detail by trade_ref (or numeric id)."""
    # Try by trade_ref first
    trade = db.query(Trade).filter(Trade.trade_ref == trade_ref).first()
    if not trade and trade_ref.isdigit():
        trade = db.query(Trade).filter(Trade.id == int(trade_ref)).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    return {
        "id": trade.id,
        "trade_ref": trade.trade_ref,
        "book": trade.book.name if trade.book else None,
        "counterparty": trade.counterparty.name if trade.counterparty else None,
        "commodity": trade.commodity,
        "trade_type": trade.trade_type,
        "direction": trade.direction,
        "volume": trade.volume,
        "volume_unit": trade.volume_unit,
        "price": trade.price,
        "price_basis": trade.price_basis,
        "currency": trade.currency,
        "trade_date": str(trade.trade_date) if trade.trade_date else None,
        "delivery_start": str(trade.delivery_start) if trade.delivery_start else None,
        "delivery_end": str(trade.delivery_end) if trade.delivery_end else None,
        "status": trade.status,
        "strategy_type": trade.strategy_type,
        "pnl_realised": trade.pnl_realised,
        "pnl_unrealised": trade.pnl_unrealised,
        "is_anomalous": bool(trade.is_anomalous),
        "anomaly_reason": trade.anomaly_reason,
        "created_at": str(trade.created_at) if trade.created_at else None,
    }
