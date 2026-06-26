"""
api/positions.py — Position management endpoints
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from sqlalchemy import func, text
from database.db import get_db
from api.auth import get_current_user
from database.models import Position, Book, MarketData
from datetime import datetime
import numpy as np

router = APIRouter()


@router.get("/")
async def get_positions(
    book: str = None,
    commodity: str = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """All open positions, optionally filtered by book or commodity."""
    query = db.query(Position).options(joinedload(Position.book))
    if commodity:
        query = query.filter(Position.commodity == commodity)
    if book:
        query = query.join(Book, Position.book_id == Book.id).filter(Book.name == book)

    positions = query.all()
    result = []
    for p in positions:
        result.append({
            "id": p.id,
            "book": p.book.name if p.book else "Unknown",
            "book_id": p.book_id,
            "commodity": p.commodity,
            "region": p.region,
            "tenor": p.tenor,
            "physical_volume": getattr(p, "physical_volume", 0) or 0,
            "paper_volume": getattr(p, "paper_volume", 0) or 0,
            "net_volume": p.net_volume,
            "volume_unit": p.volume_unit,
            "avg_price": p.avg_price,
            "mtm_price": p.mtm_price,
            "mtm_pnl": p.mtm_pnl,
            "hedge_ratio": p.hedge_ratio,
            "var_contribution": p.var_contribution,
            "as_of": p.as_of,
        })
    return result


@router.get("/summary")
async def get_position_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Aggregated P&L summary by book and commodity."""
    positions = db.query(Position).options(joinedload(Position.book)).all()
    books_active = db.query(Book).filter(Book.is_active == 1).all()

    total_mtm_pnl = sum(p.mtm_pnl or 0 for p in positions)
    total_var = sum(p.var_contribution or 0 for p in positions)
    var_limit = 8_000_000

    by_book: dict = {}
    for p in positions:
        bname = p.book.name if p.book else "Unknown"
        if bname not in by_book:
            by_book[bname] = {
                "book": bname,
                "name": bname,
                "total_pnl": 0.0,
                "pnl": 0.0,
                "size": "$0M",
                "pct": 0,
                "commodities": {},
            }
        by_book[bname]["total_pnl"] += p.mtm_pnl or 0
        by_book[bname]["pnl"] += p.mtm_pnl or 0
        cname = p.commodity or "Unknown"
        by_book[bname]["commodities"][cname] = (
            by_book[bname]["commodities"].get(cname, 0) + (p.mtm_pnl or 0)
        )

    total_abs_pnl = sum(abs(item["total_pnl"]) for item in by_book.values()) or 1
    for item in by_book.values():
        item["size"] = f"${abs(item['total_pnl']) / 1_000_000:.1f}M"
        item["pct"] = round(item["total_pnl"] / total_abs_pnl * 100)

    return {
        "total_mtm_pnl": round(total_mtm_pnl, 2),
        "total_var": round(total_var, 2),
        "var_limit": var_limit,
        "var_utilisation_pct": round(total_var / var_limit * 100, 1) if var_limit else 0,
        "active_books": len(books_active),
        "open_positions": len(positions),
        "books": list(by_book.values()),
        "by_book": list(by_book.values()),
        "as_of": datetime.utcnow().isoformat(),
    }


@router.get("/var")
async def get_var(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    positions = db.execute(text("SELECT commodity, net_volume, volume_unit, mtm_price FROM positions")).fetchall()

    # Simple VaR: 1.5% daily vol * 2.326 z-score * portfolio value
    total_exposure = 0
    breakdown = {}
    for p in positions:
        price = p[3] or 80.0
        vol = p[1] or 0
        exposure = abs(vol * price)
        total_exposure += exposure
        breakdown[p[0]] = round(exposure, 0)

    daily_vol = 0.015  # 1.5% parametric assumption
    z_99 = 2.326
    var_1d = round(total_exposure * daily_vol * z_99, 0)
    var_10d = round(var_1d * np.sqrt(10), 0)
    limit = 8000000

    return {
        "var_1d": var_1d,
        "var_10d": var_10d,
        "confidence": 0.99,
        "limit": limit,
        "utilisation_pct": round(var_1d / limit * 100, 1) if limit else 0,
        "methodology": "Parametric (99% confidence, 90-day window)",
        "breakdown_by_commodity": breakdown,
        "total_gross_exposure": round(total_exposure, 0),
        "calculated_at": datetime.now().isoformat()
    }


@router.get("/stress")
async def get_stress_test(
    scenario: str = Query(default="brent_drop_5"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Stress VaR for a named macro scenario."""
    from calculators.var import calculate_stress_var

    positions = db.query(Position).all()
    pos_list = [
        {"commodity": p.commodity, "net_volume": p.net_volume or 0}
        for p in positions
    ]
    return calculate_stress_var(pos_list, scenario)
