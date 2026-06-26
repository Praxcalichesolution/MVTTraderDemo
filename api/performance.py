"""
api/performance.py — YTD performance, targets, forecasts
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import MonthlyActual, PerformanceTarget, Book
from datetime import datetime

router = APIRouter()


@router.get("/summary")
async def get_performance_summary(
    year: int = Query(default=2026),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Full YTD performance summary with forecasts (delegates to calculator)."""
    from calculators.performance import calculate_ytd_performance
    user_id = current_user.get("id", 1)
    return calculate_ytd_performance(db, user_id, year)


@router.get("/ytd")
async def get_ytd_performance(
    year: int = Query(default=2026),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """YTD P&L vs target with waterfall attribution."""
    from calculators.performance import calculate_ytd_performance
    user_id = current_user.get("id", 1)
    return calculate_ytd_performance(db, user_id, year)


@router.get("/monthly")
async def get_monthly_actuals(
    year: int = Query(default=2026),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Monthly P&L actuals for the given year."""
    rows = db.query(MonthlyActual).filter(MonthlyActual.year == year).order_by(MonthlyActual.month).all()
    return [
        {
            "year": r.year,
            "month": r.month,
            "pnl": r.pnl,
            "trades_count": r.trades_count,
            "win_count": r.win_count,
            "volume_traded": r.volume_traded,
        }
        for r in rows
    ]


@router.get("/opportunity-cost")
@router.post("/opportunity-cost")
async def get_opportunity_cost(
    days: int = Query(default=90),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """90-day audit of missed trading opportunities."""
    from calculators.opportunity import calculate_opportunity_cost
    user_id = current_user.get("id", 1)
    return calculate_opportunity_cost(db, user_id, days)


@router.get("/forensics")
async def get_forensics(
    year: int = Query(default=2026),
    quarter: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Forensic breakdown of why the trading target was missed."""
    from calculators.forensics import investigate_target_shortfall
    return investigate_target_shortfall(db, year, quarter)


@router.get("/top-quartile")
async def get_top_quartile_gap(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Boardroom: uplift if all traders reached top-quartile performance."""
    from calculators.performance import calculate_top_quartile_gap
    return calculate_top_quartile_gap(db)


@router.get("/targets")
async def get_targets(
    year: int = Query(default=2026),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Performance targets for each book."""
    rows = db.query(PerformanceTarget).filter(PerformanceTarget.year == year).all()
    return [
        {
            "book_id": r.book_id,
            "year": r.year,
            "annual_target": r.annual_target,
            "q1_target": r.q1_target,
            "q2_target": r.q2_target,
            "q3_target": r.q3_target,
            "q4_target": r.q4_target,
        }
        for r in rows
    ]
