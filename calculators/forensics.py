"""Trading Forensics Engine - 'Why did we miss our target?'"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

def investigate_target_shortfall(db: Session, year: int, quarter: Optional[int] = None) -> Dict:
    """
    Moment 1 of the demo: forensic breakdown of why target was missed.
    Breaks P&L gap into: losing trades, missed opportunities, delayed execution, sizing decisions.
    """
    # Get target vs actual
    period_label = f"Q{quarter} {year}" if quarter else f"YTD {year}"

    # Demo values (realistic for INEOS desk scale)
    target = 9000000 if quarter else 36000000
    actual = 7179000 if quarter else 18400000
    shortfall = target - actual

    # Forensic breakdown
    losing_trades_impact = shortfall * 0.19
    missed_opps_impact = shortfall * 0.59
    delayed_execution_impact = shortfall * 0.14
    sizing_decisions_impact = shortfall * 0.08

    top_missed_opps = [
        {
            "opportunity": "Brent/Urals spread widening (Russian refinery outage, May 8)",
            "estimated_pnl": 1280000,
            "identified_hours_late": 4.2,
            "trigger_event": "Primorsk refinery maintenance announced"
        },
        {
            "opportunity": "Ethane arb NWE vs Mont Belvieu (EIA draw, Apr 24)",
            "estimated_pnl": 890000,
            "identified_hours_late": 6.8,
            "trigger_event": "EIA inventory report: -8.2M bbl vs -3.5M consensus"
        },
        {
            "opportunity": "WTI/Brent EFP compression (Apr 15)",
            "estimated_pnl": 620000,
            "identified_hours_late": 3.1,
            "trigger_event": "Cushing storage utilization crossed 65%"
        }
    ]

    worst_losing_trades = [
        {"trade_ref": "RMVT-0712", "strategy": "Directional WTI Long", "pnl": -340000, "reason": "OPEC+ surprised with production increase"},
        {"trade_ref": "RMVT-0698", "strategy": "Ethane Arb", "pnl": -180000, "reason": "Freight widened 2.1x faster than basis"},
        {"trade_ref": "RMVT-0654", "strategy": "Brent Directional", "pnl": -160000, "reason": "Geopolitical risk event unwound faster than modelled"},
    ]

    return {
        "period": period_label,
        "target": target,
        "actual": actual,
        "shortfall": shortfall,
        "shortfall_pct": round((shortfall / target) * 100, 1),
        "breakdown": {
            "losing_trades": {
                "amount": round(losing_trades_impact, 0),
                "pct_of_shortfall": 19,
                "description": "Trades that resulted in a loss",
                "worst_trades": worst_losing_trades
            },
            "missed_opportunities": {
                "amount": round(missed_opps_impact, 0),
                "pct_of_shortfall": 59,
                "description": "Strategy-aligned opportunities not captured",
                "key_examples": top_missed_opps
            },
            "delayed_execution": {
                "amount": round(delayed_execution_impact, 0),
                "pct_of_shortfall": 14,
                "description": "Opportunities captured but entry was late, reducing P&L",
                "avg_delay_hours": 3.8
            },
            "sizing_decisions": {
                "amount": round(sizing_decisions_impact, 0),
                "pct_of_shortfall": 8,
                "description": "Correct direction but undersized position",
            }
        },
        "headline_finding": f"{59}% of the shortfall was caused by opportunities identified after the optimal entry window had closed.",
        "recommendation": "Earlier identification of strategy-aligned opportunities is the single highest-impact improvement available to this desk."
    }
