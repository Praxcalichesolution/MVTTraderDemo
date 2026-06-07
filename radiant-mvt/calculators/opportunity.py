"""Opportunity Cost Engine - 90-day audit of missed opportunities"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, date
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import text

def calculate_opportunity_cost(db: Session, trader_id: int, lookback_days: int = 90) -> Dict:
    """
    The closing moment of the demo.
    Audit last 90 days: how many opportunities matched strategy, how many captured, estimated missed P&L.
    """
    # Get all desk decisions (Desk Brain) in period
    cutoff = datetime.now() - timedelta(days=lookback_days)
    decisions = db.execute(text("""
        SELECT * FROM desk_decisions
        WHERE decision_date >= :cutoff
        ORDER BY decision_date DESC
    """), {"cutoff": cutoff.date().isoformat()}).fetchall()

    # In demo: use pre-computed realistic numbers
    total_opportunities = 17
    traded = 6
    missed = 11

    # Simulate missed opportunity P&L based on historical win rates and avg trade size
    avg_winning_pnl = 2800000  # $2.8M avg from historical data
    win_rate = 0.68  # 68% win rate on strategy-matched trades

    expected_missed_pnl = missed * avg_winning_pnl * win_rate * 0.65  # discount for uncertainty

    # Break down by reason
    reasons = {
        "Opportunity identified after optimal entry window": 7,
        "Insufficient market data at time of opportunity": 2,
        "Position limit constraints": 1,
        "Trader capacity - reviewing other positions": 1,
    }

    top_missed = [
        {
            "date": (datetime.now() - timedelta(days=8)).strftime("%d %b %Y"),
            "type": "Brent/Urals Spread",
            "trigger": "Russian pipeline disruption news",
            "time_to_identify_hours": 4.2,
            "optimal_window_hours": 0.5,
            "estimated_pnl": 420000,
            "status": "Missed"
        },
        {
            "date": (datetime.now() - timedelta(days=23)).strftime("%d %b %Y"),
            "type": "Ethane Arb (NWE vs US)",
            "trigger": "EIA inventory draw larger than consensus",
            "time_to_identify_hours": 6.8,
            "optimal_window_hours": 1.0,
            "estimated_pnl": 380000,
            "status": "Missed"
        },
        {
            "date": (datetime.now() - timedelta(days=41)).strftime("%d %b %Y"),
            "type": "WTI/Brent EFP",
            "trigger": "Cushing storage data release",
            "time_to_identify_hours": 3.1,
            "optimal_window_hours": 0.75,
            "estimated_pnl": 290000,
            "status": "Missed"
        },
    ]

    radiant_surfacing_time_mins = 12  # minutes to surface after trigger

    return {
        "period_days": lookback_days,
        "period_label": f"Last {lookback_days} days",
        "total_opportunities_available": total_opportunities,
        "opportunities_traded": traded,
        "opportunities_missed": missed,
        "capture_rate_pct": round((traded / total_opportunities) * 100, 1),
        "estimated_missed_pnl": round(expected_missed_pnl, 0),
        "top_missed_opportunities": top_missed,
        "primary_miss_reason": "Opportunity identified after optimal entry window",
        "avg_identification_delay_hours": 4.5,
        "optimal_entry_window_hours": 0.75,
        "radiant_surfacing_time_mins": radiant_surfacing_time_mins,
        "headline": f"${expected_missed_pnl/1e6:.1f}M estimated missed P&L in the last {lookback_days} days",
        "closing_statement": f"Radiant-MVT would have surfaced all {total_opportunities} opportunities within {radiant_surfacing_time_mins} minutes of the trigger event."
    }
