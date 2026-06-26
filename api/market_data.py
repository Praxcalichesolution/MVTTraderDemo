"""
api/market_data.py — Live prices, forward curves, news
INEOS Trading & Shipping — Radiant-MVT
"""
from datetime import datetime, timezone
import re
import threading
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import MarketData, ForwardCurve
from feeds.market_data import fetch_and_store_market_data

router = APIRouter()
_refresh_state_lock = threading.Lock()
_refresh_state = {
    "in_progress": False,
    "started_at": None,
    "last_completed_at": None,
}


def _to_utc_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _serialize_timestamp(value):
    dt = _to_utc_datetime(value)
    return dt.isoformat() if dt else None


def _get_latest_price_rows(db: Session):
    from sqlalchemy import text
    return db.execute(text("""
        SELECT m.commodity, m.price, m.price_unit, m.source,
               m.change_1d, m.change_pct_1d, m.high_1d, m.low_1d, m.timestamp
        FROM market_data m
        INNER JOIN (
            SELECT commodity, MAX(timestamp) AS max_ts
            FROM market_data GROUP BY commodity
        ) latest ON m.commodity = latest.commodity AND m.timestamp = latest.max_ts
        ORDER BY m.commodity
    """)).fetchall()


def _serialize_price_row(row):
    timestamp = _to_utc_datetime(row[8])
    return {
        "commodity": row[0],
        "price": row[1],
        "price_unit": row[2],
        "source": row[3],
        "change_1d": row[4],
        "change_pct_1d": row[5],
        "high_1d": row[6],
        "low_1d": row[7],
        "timestamp": timestamp.isoformat() if timestamp else None,
    }


def _build_spreads_from_prices(prices: list[dict]):
    price_map = {p["commodity"]: p["price"] for p in prices if p.get("price") is not None}
    spreads = []
    if "Brent" in price_map and "WTI" in price_map:
        spreads.append({
            "name": "Brent / WTI",
            "value": round(price_map["Brent"] - price_map["WTI"], 4),
            "unit": "USD/bbl",
        })
    if "Brent" in price_map and "Urals" in price_map:
        spreads.append({
            "name": "Brent / Urals",
            "value": round(price_map["Brent"] - price_map["Urals"], 4),
            "unit": "USD/bbl",
        })
    if "Naphtha" in price_map and "Ethane" in price_map:
        spreads.append({
            "name": "Naphtha / Ethane",
            "value": round(price_map["Naphtha"] - price_map["Ethane"], 4),
            "unit": "USD/MT",
        })
    return spreads


def _parse_curve_shift_request(request: dict) -> dict:
    instruction = str(request.get("instruction", "") or "").strip()
    default_commodity = str(request.get("commodity", "Brent") or "Brent").strip() or "Brent"
    parsed = {
        "instruction": instruction,
        "commodity": default_commodity,
        "shift_type": str(request.get("shift_type", "parallel") or "parallel").strip().lower(),
        "shift_amount_usd": float(request.get("shift_amount_usd", 0) or 0),
    }

    if not instruction:
        return parsed

    instruction_lower = instruction.lower()
    commodity_map = {
        "brent": "Brent",
        "wti": "WTI",
        "ethane": "Ethane",
        "naphtha": "Naphtha",
        "eua": "EUA",
        "urals": "Urals",
    }
    for token, commodity in commodity_map.items():
        if token in instruction_lower:
            parsed["commodity"] = commodity
            break

    if any(word in instruction_lower for word in ["steepen", "steeper", "steepen the curve"]):
        parsed["shift_type"] = "steepen"
    elif any(word in instruction_lower for word in ["flatten", "flatter"]):
        parsed["shift_type"] = "flatten"
    elif any(word in instruction_lower for word in ["twist", "rotate"]):
        parsed["shift_type"] = "twist"
    else:
        parsed["shift_type"] = "parallel"

    amount_match = re.search(r'([+-]?\d+(?:\.\d+)?)', instruction_lower.replace(",", ""))
    if amount_match:
        amount = float(amount_match.group(1))
        if amount >= 0:
            if any(word in instruction_lower for word in ["down", "lower", "decrease", "drop", "fall", "softer"]):
                amount *= -1
            elif any(word in instruction_lower for word in ["up", "higher", "raise", "increase", "lift", "wider"]):
                amount *= 1
        parsed["shift_amount_usd"] = amount

    return parsed


def _queue_market_refresh(background_tasks: BackgroundTasks) -> bool:
    with _refresh_state_lock:
        if _refresh_state["in_progress"]:
            return False
        _refresh_state["in_progress"] = True
        _refresh_state["started_at"] = datetime.now(timezone.utc)

    background_tasks.add_task(_run_market_refresh_job)
    return True


async def _run_market_refresh_job():
    try:
        await fetch_and_store_market_data()
    finally:
        with _refresh_state_lock:
            _refresh_state["in_progress"] = False
            _refresh_state["last_completed_at"] = datetime.now(timezone.utc)


@router.get("/overview")
async def get_market_overview(
    background_tasks: BackgroundTasks,
    force_refresh: bool = Query(default=False),
    stale_after_seconds: int = Query(default=150, ge=30, le=3600),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Return cached prices immediately and refresh live data in the background when needed."""
    rows = _get_latest_price_rows(db)
    prices = [_serialize_price_row(row) for row in rows]

    latest_ts = None
    source_mix = {}
    for price in prices:
        ts = _to_utc_datetime(price.get("timestamp"))
        if ts and (latest_ts is None or ts > latest_ts):
            latest_ts = ts
        source = price.get("source") or "unknown"
        source_mix[source] = source_mix.get(source, 0) + 1

    now = datetime.now(timezone.utc)
    age_seconds = int((now - latest_ts).total_seconds()) if latest_ts else None
    is_stale = latest_ts is None or age_seconds is None or age_seconds >= stale_after_seconds

    refresh_reason = None
    refresh_triggered = False
    if force_refresh:
        refresh_reason = "manual"
        refresh_triggered = _queue_market_refresh(background_tasks)
    elif is_stale:
        refresh_reason = "stale-cache" if latest_ts else "empty-cache"
        refresh_triggered = _queue_market_refresh(background_tasks)

    with _refresh_state_lock:
        refresh_in_progress = _refresh_state["in_progress"]
        refresh_started_at = _serialize_timestamp(_refresh_state["started_at"])
        last_completed_at = _serialize_timestamp(_refresh_state["last_completed_at"])

    return {
        "prices": prices,
        "spreads": _build_spreads_from_prices(prices),
        "meta": {
            "last_refreshed_at": _serialize_timestamp(latest_ts),
            "age_seconds": age_seconds,
            "is_stale": is_stale,
            "refresh_in_progress": refresh_in_progress,
            "refresh_triggered": refresh_triggered,
            "refresh_reason": refresh_reason,
            "refresh_started_at": refresh_started_at,
            "refresh_last_completed_at": last_completed_at,
            "stale_after_seconds": stale_after_seconds,
            "cached_row_count": len(prices),
            "source_mix": source_mix,
        },
    }


@router.get("/prices")
async def get_live_prices(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Latest price for each commodity."""
    rows = _get_latest_price_rows(db)
    return [_serialize_price_row(row) for row in rows]


@router.get("/prices/{commodity}/history")
async def get_price_history(
    commodity: str,
    days: int = Query(default=30, le=365),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Historical price series for a commodity (latest N ticks)."""
    records = (
        db.query(MarketData)
        .filter(MarketData.commodity == commodity)
        .order_by(MarketData.timestamp.desc())
        .limit(days)
        .all()
    )
    if not records:
        # Return simulated history so the chart always renders
        import random, math
        from datetime import datetime, timedelta
        base_prices = {"Brent":82.4,"WTI":78.9,"Urals":74.3,"Ethane":248.0,"HH":2.84,"EUA":63.2,"Naphtha":612.0}
        base = base_prices.get(commodity, 80.0)
        random.seed(hash(commodity) % 9999)
        now = datetime.utcnow()
        return [
            {"price": round(base * (1 + 0.015*math.sin(i/3) + random.uniform(-0.008,0.008)), 3),
             "change_pct_1d": round(random.uniform(-1.5, 1.5), 3),
             "timestamp": (now - timedelta(days=days-i)).isoformat()}
            for i in range(days)
        ]
    return [
        {"price": r.price, "change_pct_1d": r.change_pct_1d,
         "timestamp": r.timestamp}
        for r in reversed(records)
    ]


@router.get("/curves")
async def get_forward_curves(
    commodity: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Forward curves, optionally filtered by commodity."""
    query = db.query(ForwardCurve)
    if commodity:
        query = query.filter(ForwardCurve.commodity == commodity)
    curves = query.order_by(ForwardCurve.commodity, ForwardCurve.tenor).all()

    result: dict = {}
    for c in curves:
        if c.commodity not in result:
            result[c.commodity] = []
        result[c.commodity].append({
            "tenor": c.tenor,
            "delivery_month": c.delivery_month,
            "price": c.price,
            "basis_vs_prompt": c.basis_vs_prompt,
        })
    return result


@router.post("/curves/shift")
async def shift_curve(
    request: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Apply a curve shift described in natural language or structured JSON."""
    from calculators.curves import build_forward_curve, apply_curve_shift, CurveShiftInput

    parsed_request = _parse_curve_shift_request(request)
    commodity = parsed_request["commodity"]
    shift_type = parsed_request["shift_type"]
    shift_amount = float(parsed_request["shift_amount_usd"])

    # Get current spot price
    subq = (
        db.query(MarketData.commodity, func.max(MarketData.timestamp).label("max_ts"))
        .filter(MarketData.commodity == commodity)
        .group_by(MarketData.commodity)
        .subquery()
    )
    md = db.query(MarketData).join(
        subq,
        (MarketData.commodity == subq.c.commodity)
        & (MarketData.timestamp == subq.c.max_ts),
    ).first()
    spot = md.price if md else 82.40

    curve = build_forward_curve(spot, commodity)
    shift_input = CurveShiftInput(
        commodity=commodity,
        shift_type=shift_type,
        shift_amount_usd=shift_amount,
    )
    shifted = apply_curve_shift(curve, shift_input)
    shifted["spot_price"] = spot
    shifted["original_curve"] = curve["curve"]
    shifted["parsed_request"] = parsed_request
    shifted["result"] = (
        f"{commodity} {shift_type} shift applied at "
        f"{shift_amount:+.2f} USD. Indicative P&L: "
        f"{shifted['indicative_pnl_per_1000bbl']:+,.0f} per 1,000 bbl."
    )
    return shifted


@router.get("/spreads")
async def get_spreads(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Key spread indicators: Brent/WTI, Brent/Urals."""
    from calculators.curves import build_forward_curve, calculate_spread

    subq = (
        db.query(MarketData.commodity, func.max(MarketData.timestamp).label("max_ts"))
        .group_by(MarketData.commodity)
        .subquery()
    )
    records = db.query(MarketData).join(
        subq,
        (MarketData.commodity == subq.c.commodity)
        & (MarketData.timestamp == subq.c.max_ts),
    ).all()
    price_map = {r.commodity: r.price for r in records}

    spreads = {}
    pairs = [("Brent", "WTI"), ("Brent", "Urals")]
    for a, b in pairs:
        if a in price_map and b in price_map:
            curve_a = build_forward_curve(price_map[a], a)
            curve_b = build_forward_curve(price_map[b], b)
            spreads[f"{a}/{b}"] = calculate_spread(curve_a, curve_b)
    return spreads


@router.get("/news")
async def get_news(
    limit: int = Query(default=20, le=50),
    commodity: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Latest news items, optionally filtered by commodity tag."""
    # Use raw SQL to avoid SQLAlchemy DateTime processor choking on RFC 2822 dates
    from sqlalchemy import text as _text
    if commodity:
        rows = db.execute(
            _text(
                "SELECT id, headline, summary, source, published_at, sentiment_score, "
                "relevance_score, commodities_tagged, market_impact, url "
                "FROM news WHERE commodities_tagged LIKE :tag "
                "ORDER BY id DESC LIMIT :lim"
            ),
            {"tag": f"%{commodity}%", "lim": limit}
        ).fetchall()
    else:
        rows = db.execute(
            _text(
                "SELECT id, headline, summary, source, published_at, sentiment_score, "
                "relevance_score, commodities_tagged, market_impact, url "
                "FROM news ORDER BY id DESC LIMIT :lim"
            ),
            {"lim": limit}
        ).fetchall()

    return [
        {
            "id": r[0],
            "headline": r[1],
            "summary": r[2],
            "source": r[3],
            "published_at": str(r[4]) if r[4] else None,
            "sentiment_score": r[5],
            "relevance_score": r[6],
            "commodities_tagged": r[7],
            "market_impact": r[8],
            "url": r[9],
        }
        for r in rows
    ]
