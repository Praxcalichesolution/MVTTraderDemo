"""
Market Intelligence API routes.
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database.commodity_registry import get_info, is_valid, normalize_symbol
from database.db import get_db
from database.models import AgentRun, MarketIntelligence, MarketWatchlist
from feeds.market_intelligence_agent import run_market_intelligence_agent

router = APIRouter()


def _loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _analysis_row(row: MarketIntelligence) -> dict:
    return {
        "id": row.id,
        "commodity": row.commodity,
        "analysis_datetime": row.analysis_datetime,
        "outlook": row.outlook,
        "outlook_score": row.outlook_score,
        "key_drivers": _loads(row.key_drivers, []),
        "key_risks": _loads(row.key_risks, []),
        "price_at_analysis": row.price_at_analysis,
        "change_24h": row.change_24h,
        "trend_5d": row.trend_5d,
        "trend_30d": row.trend_30d,
        "news_count_analysed": row.news_count_analysed,
        "top_news": _loads(row.top_news, []),
        "opportunity_flag": bool(row.opportunity_flag),
        "opportunity_description": row.opportunity_description,
        "agent_run_id": row.agent_run_id,
        "created_at": row.created_at,
    }


def _watchlist_row(row: MarketWatchlist) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "commodity": row.commodity,
        "metadata": get_info(row.commodity),
        "alert_threshold_pct": row.alert_threshold_pct,
        "is_active": bool(row.is_active),
        "display_order": row.display_order,
        "created_at": row.created_at,
    }


def _validate_watchlist_payload(payload: dict) -> tuple[str, float, int]:
    commodity = str(payload.get("commodity", "")).strip()
    if not commodity:
        raise HTTPException(status_code=400, detail="commodity is required")
    normalized = normalize_symbol(commodity)
    if normalized is None:
        raise HTTPException(status_code=400, detail=f"Unknown commodity symbol '{commodity}'")
    try:
        threshold = float(payload.get("alert_threshold_pct", 2.0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="alert_threshold_pct must be numeric")
    if threshold <= 0 or threshold > 25:
        raise HTTPException(status_code=400, detail="alert_threshold_pct must be between 0 and 25")
    try:
        display_order = int(payload.get("display_order", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="display_order must be an integer")
    if display_order < 0:
        raise HTTPException(status_code=400, detail="display_order must be zero or greater")
    return normalized, threshold, display_order


@router.get("/intelligence/")
async def list_latest_intelligence(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(MarketIntelligence)
        .order_by(MarketIntelligence.commodity.asc(), MarketIntelligence.analysis_datetime.desc())
        .all()
    )
    latest_by_commodity = {}
    for row in rows:
        latest_by_commodity.setdefault(row.commodity, row)
    return [_analysis_row(row) for row in latest_by_commodity.values()]


@router.get("/intelligence/{commodity}")
async def get_commodity_intelligence(
    commodity: str,
    limit: int = Query(default=10, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    normalized = normalize_symbol(commodity) or commodity
    rows = (
        db.query(MarketIntelligence)
        .filter(MarketIntelligence.commodity == normalized)
        .order_by(MarketIntelligence.analysis_datetime.desc())
        .limit(limit)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No market intelligence for '{normalized}'")
    return {
        "commodity": normalized,
        "latest": _analysis_row(rows[0]),
        "history": [_analysis_row(row) for row in rows],
    }


@router.post("/intelligence/{commodity}/refresh")
async def refresh_commodity_intelligence(
    commodity: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    normalized = normalize_symbol(commodity)
    if normalized is None:
        raise HTTPException(status_code=400, detail=f"Unknown commodity symbol '{commodity}'")
    result = await run_market_intelligence_agent([normalized])
    row = (
        db.query(MarketIntelligence)
        .filter(MarketIntelligence.commodity == normalized)
        .order_by(MarketIntelligence.analysis_datetime.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status_code=500, detail="Refresh did not produce an analysis")
    return {
        "run": result,
        "analysis": _analysis_row(row),
    }


@router.get("/agent/runs")
async def list_agent_runs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(AgentRun)
        .order_by(AgentRun.run_datetime.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": row.id,
            "run_datetime": row.run_datetime,
            "agent_name": row.agent_name,
            "commodities_analysed": row.commodities_analysed,
            "duration_seconds": row.duration_seconds,
            "news_items_read": row.news_items_read,
            "analyses_produced": row.analyses_produced,
            "opportunities_found": row.opportunities_found,
            "status": row.status,
            "notes": row.notes,
        }
        for row in rows
    ]


@router.get("/watchlist")
async def get_watchlist(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(MarketWatchlist)
        .filter(
            MarketWatchlist.user_id == current_user["id"],
            MarketWatchlist.is_active == 1,
        )
        .order_by(MarketWatchlist.display_order.asc(), MarketWatchlist.commodity.asc())
        .all()
    )
    return [_watchlist_row(row) for row in rows]


@router.post("/watchlist")
async def add_to_watchlist(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    commodity, threshold, display_order = _validate_watchlist_payload(payload)

    existing = (
        db.query(MarketWatchlist)
        .filter(
            MarketWatchlist.user_id == current_user["id"],
            MarketWatchlist.commodity.ilike(commodity),
        )
        .first()
    )

    if existing:
        existing.commodity = commodity
        existing.alert_threshold_pct = threshold
        existing.is_active = 1
        existing.display_order = display_order
        watchlist = existing
    else:
        watchlist = MarketWatchlist(
            user_id=current_user["id"],
            commodity=commodity,
            alert_threshold_pct=threshold,
            is_active=1,
            display_order=display_order,
            created_at=datetime.utcnow(),
        )
        db.add(watchlist)

    db.commit()
    db.refresh(watchlist)
    return {
        "id": watchlist.id,
        "commodity": commodity,
        "metadata": get_info(commodity),
        "alert_threshold_pct": threshold,
        "is_active": True,
        "display_order": display_order,
    }


@router.delete("/watchlist/{commodity}")
async def remove_from_watchlist(
    commodity: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    normalized = normalize_symbol(commodity)
    if normalized is None and not is_valid(commodity):
        raise HTTPException(status_code=400, detail=f"Unknown commodity symbol '{commodity}'")

    result = (
        db.query(MarketWatchlist)
        .filter(
            MarketWatchlist.user_id == current_user["id"],
            MarketWatchlist.commodity.ilike(normalized or commodity),
        )
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"'{commodity}' is not in the watchlist")

    db.delete(result)
    db.commit()
    return {"removed": normalized or commodity}
