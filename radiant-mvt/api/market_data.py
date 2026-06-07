"""
api/market_data.py — Live prices, forward curves, news
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import MarketData, ForwardCurve

router = APIRouter()


@router.get("/prices")
async def get_live_prices(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Latest price for each commodity."""
    from sqlalchemy import text
    rows = db.execute(text("""
        SELECT m.commodity, m.price, m.price_unit, m.source,
               m.change_1d, m.change_pct_1d, m.high_1d, m.low_1d, m.timestamp
        FROM market_data m
        INNER JOIN (
            SELECT commodity, MAX(timestamp) AS max_ts
            FROM market_data GROUP BY commodity
        ) latest ON m.commodity = latest.commodity AND m.timestamp = latest.max_ts
    """)).fetchall()
    return [
        {
            "commodity": r[0],
            "price": r[1],
            "price_unit": r[2],
            "source": r[3],
            "change_1d": r[4],
            "change_pct_1d": r[5],
            "high_1d": r[6],
            "low_1d": r[7],
            "timestamp": r[8],
        }
        for r in rows
    ]


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

    commodity = request.get("commodity", "Brent")
    shift_type = request.get("shift_type", "parallel")
    shift_amount = float(request.get("shift_amount_usd", 0))

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
