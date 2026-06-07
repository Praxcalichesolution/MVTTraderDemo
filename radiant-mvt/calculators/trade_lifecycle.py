"""Trade Lifecycle Tracker - nomination through settlement, flag delays"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta, date
from dataclasses import dataclass

# Standard SLA timings (hours from trade date)
LIFECYCLE_SLAs = {
    "confirmation":     2,    # Broker confirmation expected within 2h
    "nomination":       24,   # Vessel nomination within 24h for physical
    "bl_receipt":       72,   # Bill of Lading receipt within 72h of loading
    "invoice":          48,   # Invoice from counterparty within 48h of BL
    "settlement":       120,  # Settlement 5 business days after BL date
    "final_pnl_close":  168   # Final P&L close within 7 days of settlement
}

LIFECYCLE_STAGES = [
    "Booked",
    "Confirmed",
    "Nominated",
    "Loading",
    "BL_Issued",
    "Invoiced",
    "Settled",
    "Closed"
]

@dataclass
class LifecycleAlert:
    trade_ref: str
    stage: str
    alert_type: str  # "SLA_BREACH", "SLA_WARNING", "MISSING_DOC", "DISPUTED"
    hours_overdue: float
    description: str
    recommended_action: str
    priority: str  # "High", "Medium", "Low"

def track_trade_lifecycle(trade: Dict) -> Dict:
    """
    Track a single trade through its lifecycle stages.
    Returns current stage, elapsed time, SLA status, and any alerts.
    """
    trade_ref = trade.get('trade_ref', 'UNKNOWN')
    trade_date = trade.get('trade_date')
    current_stage = trade.get('stage', 'Booked')
    commodity_type = trade.get('commodity_type', 'Financial')  # Financial or Physical
    alerts = []
    now = datetime.now()

    if isinstance(trade_date, str):
        try:
            trade_date_dt = datetime.fromisoformat(trade_date)
        except ValueError:
            trade_date_dt = now - timedelta(days=1)
    elif isinstance(trade_date, datetime):
        trade_date_dt = trade_date
    else:
        trade_date_dt = now - timedelta(days=1)

    hours_since_trade = (now - trade_date_dt).total_seconds() / 3600

    # Check confirmation SLA
    confirmed_at = trade.get('confirmed_at')
    if not confirmed_at and hours_since_trade > LIFECYCLE_SLAs['confirmation']:
        overdue = hours_since_trade - LIFECYCLE_SLAs['confirmation']
        alerts.append(LifecycleAlert(
            trade_ref=trade_ref,
            stage="Confirmation",
            alert_type="SLA_BREACH" if overdue > 4 else "SLA_WARNING",
            hours_overdue=round(overdue, 1),
            description=f"Broker confirmation not received. {overdue:.1f}h past SLA.",
            recommended_action="Chase broker immediately. Escalate to senior trader if >6h.",
            priority="High" if overdue > 4 else "Medium"
        ))

    # Physical trade checks
    if commodity_type == 'Physical':
        nominated_at = trade.get('nominated_at')
        if not nominated_at and hours_since_trade > LIFECYCLE_SLAs['nomination']:
            overdue = hours_since_trade - LIFECYCLE_SLAs['nomination']
            alerts.append(LifecycleAlert(
                trade_ref=trade_ref,
                stage="Nomination",
                alert_type="SLA_BREACH",
                hours_overdue=round(overdue, 1),
                description=f"Vessel nomination overdue by {overdue:.1f}h.",
                recommended_action="Submit nomination immediately to avoid demurrage exposure.",
                priority="High"
            ))

        bl_date = trade.get('bl_date')
        bl_received = trade.get('bl_received_at')
        if bl_date and not bl_received:
            bl_dt = datetime.fromisoformat(bl_date) if isinstance(bl_date, str) else bl_date
            hours_since_bl = (now - bl_dt).total_seconds() / 3600
            if hours_since_bl > LIFECYCLE_SLAs['bl_receipt']:
                overdue = hours_since_bl - LIFECYCLE_SLAs['bl_receipt']
                alerts.append(LifecycleAlert(
                    trade_ref=trade_ref,
                    stage="BL_Receipt",
                    alert_type="MISSING_DOC",
                    hours_overdue=round(overdue, 1),
                    description=f"Bill of Lading not received {hours_since_bl:.0f}h after loading.",
                    recommended_action="Contact shipping agent for original BL. Required for invoice and payment.",
                    priority="High"
                ))

        invoice_received = trade.get('invoice_received_at')
        if bl_date and not invoice_received:
            bl_dt = datetime.fromisoformat(bl_date) if isinstance(bl_date, str) else bl_date
            hours_since_bl = (now - bl_dt).total_seconds() / 3600
            if hours_since_bl > LIFECYCLE_SLAs['invoice']:
                overdue = hours_since_bl - LIFECYCLE_SLAs['invoice']
                alerts.append(LifecycleAlert(
                    trade_ref=trade_ref,
                    stage="Invoice",
                    alert_type="SLA_WARNING",
                    hours_overdue=round(overdue, 1),
                    description=f"Invoice not received {hours_since_bl:.0f}h after BL date.",
                    recommended_action="Request invoice from counterparty. Check payment terms.",
                    priority="Medium"
                ))

    # Settlement check
    settlement_due = trade.get('settlement_due_date')
    settled_at = trade.get('settled_at')
    if settlement_due and not settled_at:
        sd_dt = datetime.fromisoformat(settlement_due) if isinstance(settlement_due, str) else settlement_due
        if isinstance(sd_dt, date) and not isinstance(sd_dt, datetime):
            sd_dt = datetime.combine(sd_dt, datetime.min.time())
        hours_to_settlement = (sd_dt - now).total_seconds() / 3600
        if hours_to_settlement < 0:
            alerts.append(LifecycleAlert(
                trade_ref=trade_ref,
                stage="Settlement",
                alert_type="SLA_BREACH",
                hours_overdue=round(abs(hours_to_settlement), 1),
                description=f"Settlement overdue by {abs(hours_to_settlement):.1f}h.",
                recommended_action="Initiate payment immediately. Late settlement may trigger interest claims.",
                priority="High"
            ))
        elif hours_to_settlement < 24:
            alerts.append(LifecycleAlert(
                trade_ref=trade_ref,
                stage="Settlement",
                alert_type="SLA_WARNING",
                hours_overdue=0,
                description=f"Settlement due in {hours_to_settlement:.1f}h.",
                recommended_action="Confirm payment instructions and initiate wire transfer.",
                priority="Medium"
            ))

    alerts_serialised = [
        {
            "trade_ref": a.trade_ref,
            "stage": a.stage,
            "alert_type": a.alert_type,
            "hours_overdue": a.hours_overdue,
            "description": a.description,
            "recommended_action": a.recommended_action,
            "priority": a.priority
        }
        for a in alerts
    ]

    stage_index = LIFECYCLE_STAGES.index(current_stage) if current_stage in LIFECYCLE_STAGES else 0
    progress_pct = round((stage_index / (len(LIFECYCLE_STAGES) - 1)) * 100, 0)

    return {
        "trade_ref": trade_ref,
        "commodity_type": commodity_type,
        "current_stage": current_stage,
        "progress_pct": progress_pct,
        "hours_since_trade": round(hours_since_trade, 1),
        "alert_count": len(alerts),
        "high_priority_alerts": len([a for a in alerts if a.priority == "High"]),
        "alerts": alerts_serialised,
        "lifecycle_health": "RED" if any(a.priority == "High" for a in alerts) else "AMBER" if alerts else "GREEN",
        "checked_at": datetime.now().isoformat()
    }

def audit_portfolio_lifecycle(trades: List[Dict]) -> Dict:
    """
    Run lifecycle checks across all open trades. Returns portfolio-level summary and triage list.
    """
    results = [track_trade_lifecycle(t) for t in trades]

    red_trades = [r for r in results if r['lifecycle_health'] == 'RED']
    amber_trades = [r for r in results if r['lifecycle_health'] == 'AMBER']
    green_trades = [r for r in results if r['lifecycle_health'] == 'GREEN']

    all_alerts = []
    for r in results:
        all_alerts.extend(r['alerts'])

    high_priority = [a for a in all_alerts if a['priority'] == 'High']

    return {
        "total_trades": len(trades),
        "red_count": len(red_trades),
        "amber_count": len(amber_trades),
        "green_count": len(green_trades),
        "total_alerts": len(all_alerts),
        "high_priority_alerts": len(high_priority),
        "red_trades": [r['trade_ref'] for r in red_trades],
        "triage_list": sorted(results, key=lambda x: x['high_priority_alerts'], reverse=True)[:10],
        "run_at": datetime.now().isoformat()
    }

def calculate_settlement_exposure(trades: List[Dict]) -> Dict:
    """
    Aggregate unsettled cash flows due within rolling windows.
    Returns settlement exposure by 1d, 3d, 5d, 10d buckets.
    """
    buckets = {"1d": 0, "3d": 0, "5d": 0, "10d": 0, "beyond_10d": 0}
    now = datetime.now()

    for trade in trades:
        if trade.get('settled_at'):
            continue

        settlement_due = trade.get('settlement_due_date')
        amount = trade.get('settlement_amount', 0) or 0

        if not settlement_due:
            continue

        sd_dt = datetime.fromisoformat(settlement_due) if isinstance(settlement_due, str) else settlement_due
        if isinstance(sd_dt, date) and not isinstance(sd_dt, datetime):
            sd_dt = datetime.combine(sd_dt, datetime.min.time())

        days_to_settle = (sd_dt - now).days

        if days_to_settle <= 1:
            buckets["1d"] += amount
        elif days_to_settle <= 3:
            buckets["3d"] += amount
        elif days_to_settle <= 5:
            buckets["5d"] += amount
        elif days_to_settle <= 10:
            buckets["10d"] += amount
        else:
            buckets["beyond_10d"] += amount

    return {
        "settlement_buckets_usd": {k: round(v, 0) for k, v in buckets.items()},
        "total_unsettled_usd": round(sum(buckets.values()), 0),
        "most_urgent_usd": round(buckets["1d"], 0),
        "as_of": datetime.now().isoformat()
    }
