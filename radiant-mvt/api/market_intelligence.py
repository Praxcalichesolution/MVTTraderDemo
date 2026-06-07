"""
Market Intelligence API routes.
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database.db import get_db
from database.commodity_registry import get_info, is_valid, normalize_symbol
from feeds.market_intelligence_agent import run_market_intelligence_agent

router = APIRouter()


def _loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _analysis_row(row) -> dict:
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


def _watchlist_row(row) -> dict:
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
    rows = db.execute(text("""
        SELECT mi.*
        FROM market_intelligence mi
        INNER JOIN (
            SELECT commodity, MAX(analysis_datetime) AS max_dt
            FROM market_intelligence
            GROUP BY commodity
        ) latest
            ON mi.commodity = latest.commodity
           AND mi.analysis_datetime = latest.max_dt
        ORDER BY mi.commodity ASC
    """)).fetchall()
    return [_analysis_row(row) for row in rows]


@router.get("/intelligence/{commodity}")
async def get_commodity_intelligence(
    commodity: str,
    limit: int = Query(default=10, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    normalized = normalize_symbol(commodity) or commodity
    rows = db.execute(text("""
        SELECT *
        FROM market_intelligence
        WHERE commodity = :commodity
        ORDER BY analysis_datetime DESC
        LIMIT :limit
    """), {"commodity": normalized, "limit": limit}).fetchall()
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
    row = db.execute(text("""
        SELECT *
        FROM market_intelligence
        WHERE commodity = :commodity
        ORDER BY analysis_datetime DESC
        LIMIT 1
    """), {"commodity": normalized}).fetchone()
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
    rows = db.execute(text("""
        SELECT *
        FROM agent_runs
        ORDER BY run_datetime DESC
        LIMIT 20
    """)).fetchall()
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
    rows = db.execute(text("""
        SELECT id, user_id, commodity, alert_threshold_pct, is_active, display_order, created_at
        FROM market_watchlist
        WHERE user_id = :user_id AND is_active = 1
        ORDER BY display_order ASC, commodity ASC
    """), {"user_id": current_user["id"]}).fetchall()
    return [
        _watchlist_row(row)
        for row in rows
    ]


@router.post("/watchlist")
async def add_to_watchlist(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    commodity, threshold, display_order = _validate_watchlist_payload(payload)

    existing = db.execute(text("""
        SELECT id
        FROM market_watchlist
        WHERE user_id = :user_id AND lower(commodity) = lower(:commodity)
        LIMIT 1
    """), {"user_id": current_user["id"], "commodity": commodity}).fetchone()

    if existing:
        db.execute(text("""
            UPDATE market_watchlist
            SET commodity = :commodity,
                alert_threshold_pct = :threshold,
                is_active = 1,
                display_order = :display_order
            WHERE id = :id
        """), {
            "commodity": commodity,
            "threshold": threshold,
            "display_order": display_order,
            "id": existing.id,
        })
        watchlist_id = existing.id
    else:
        result = db.execute(text("""
            INSERT INTO market_watchlist (
                user_id, commodity, alert_threshold_pct, is_active, display_order, created_at
            ) VALUES (
                :user_id, :commodity, :threshold, 1, :display_order, :created_at
            )
        """), {
            "user_id": current_user["id"],
            "commodity": commodity,
            "threshold": threshold,
            "display_order": display_order,
            "created_at": datetime.utcnow().isoformat(),
        })
        watchlist_id = result.lastrowid
    db.commit()
    return {
        "id": watchlist_id,
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
    result = db.execute(text("""
        DELETE FROM market_watchlist
        WHERE user_id = :user_id AND lower(commodity) = lower(:commodity)
    """), {"user_id": current_user["id"], "commodity": normalized or commodity})
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"'{commodity}' is not in the watchlist")
    return {"removed": normalized or commodity}
