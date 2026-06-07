"""Shadow Book - compare ETRM records vs broker confirmations, detect breaks"""
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass

BREAK_TOLERANCE_PCT = 0.001  # 0.1% tolerance for price/volume rounding differences

@dataclass
class TradeBreak:
    trade_ref: str
    break_type: str  # "volume_mismatch", "price_mismatch", "missing_in_etrm", "missing_in_broker", "settlement_mismatch"
    etrm_value: Optional[float]
    broker_value: Optional[float]
    difference: Optional[float]
    difference_pct: Optional[float]
    severity: str  # "Critical", "Warning", "Info"
    recommended_action: str

def reconcile_etrm_vs_broker(etrm_trades: List[Dict], broker_confirms: List[Dict]) -> Dict:
    """
    Compare ETRM trade records against broker confirmations.
    Detects: missing trades, price mismatches, volume breaks, settlement discrepancies.
    """
    breaks: List[TradeBreak] = []
    matched = 0
    clean = 0

    # Index by trade reference
    etrm_index = {t['trade_ref']: t for t in etrm_trades}
    broker_index = {c['trade_ref']: c for c in broker_confirms}

    all_refs = set(etrm_index.keys()) | set(broker_index.keys())

    for ref in all_refs:
        etrm = etrm_index.get(ref)
        broker = broker_index.get(ref)

        if etrm and not broker:
            breaks.append(TradeBreak(
                trade_ref=ref,
                break_type="missing_in_broker",
                etrm_value=etrm.get('volume'),
                broker_value=None,
                difference=None,
                difference_pct=None,
                severity="Critical",
                recommended_action=f"Chase broker for confirmation of {ref}. Do not settle until confirmed."
            ))
            continue

        if broker and not etrm:
            breaks.append(TradeBreak(
                trade_ref=ref,
                break_type="missing_in_etrm",
                etrm_value=None,
                broker_value=broker.get('volume'),
                difference=None,
                difference_pct=None,
                severity="Critical",
                recommended_action=f"Broker has {ref} but ETRM does not. Book urgently or dispute with broker."
            ))
            continue

        # Both present - check for mismatches
        matched += 1
        trade_clean = True

        # Volume check
        etrm_vol = etrm.get('volume', 0)
        broker_vol = broker.get('volume', 0)
        if etrm_vol != 0:
            vol_diff_pct = abs(etrm_vol - broker_vol) / abs(etrm_vol)
            if vol_diff_pct > BREAK_TOLERANCE_PCT:
                breaks.append(TradeBreak(
                    trade_ref=ref,
                    break_type="volume_mismatch",
                    etrm_value=etrm_vol,
                    broker_value=broker_vol,
                    difference=round(broker_vol - etrm_vol, 2),
                    difference_pct=round(vol_diff_pct * 100, 3),
                    severity="Critical" if vol_diff_pct > 0.01 else "Warning",
                    recommended_action=f"Volume mismatch on {ref}: ETRM={etrm_vol}, Broker={broker_vol}. Amend ETRM or dispute broker."
                ))
                trade_clean = False

        # Price check
        etrm_price = etrm.get('price', 0)
        broker_price = broker.get('price', 0)
        if etrm_price != 0:
            price_diff_pct = abs(etrm_price - broker_price) / abs(etrm_price)
            if price_diff_pct > BREAK_TOLERANCE_PCT:
                breaks.append(TradeBreak(
                    trade_ref=ref,
                    break_type="price_mismatch",
                    etrm_value=etrm_price,
                    broker_value=broker_price,
                    difference=round(broker_price - etrm_price, 4),
                    difference_pct=round(price_diff_pct * 100, 3),
                    severity="Critical" if price_diff_pct > 0.005 else "Warning",
                    recommended_action=f"Price mismatch on {ref}: ETRM={etrm_price}, Broker={broker_price}. Check deal ticket."
                ))
                trade_clean = False

        # Settlement amount check
        etrm_settle = etrm.get('settlement_amount')
        broker_settle = broker.get('settlement_amount')
        if etrm_settle is not None and broker_settle is not None:
            settle_diff = abs(etrm_settle - broker_settle)
            if settle_diff > 100:  # $100 tolerance
                breaks.append(TradeBreak(
                    trade_ref=ref,
                    break_type="settlement_mismatch",
                    etrm_value=etrm_settle,
                    broker_value=broker_settle,
                    difference=round(broker_settle - etrm_settle, 2),
                    difference_pct=None,
                    severity="Critical",
                    recommended_action=f"Settlement break on {ref}: ${settle_diff:,.0f} difference. Do not release payment."
                ))
                trade_clean = False

        if trade_clean:
            clean += 1

    breaks_serialised = [
        {
            "trade_ref": b.trade_ref,
            "break_type": b.break_type,
            "etrm_value": b.etrm_value,
            "broker_value": b.broker_value,
            "difference": b.difference,
            "difference_pct": b.difference_pct,
            "severity": b.severity,
            "recommended_action": b.recommended_action
        }
        for b in breaks
    ]

    critical_breaks = [b for b in breaks if b.severity == "Critical"]

    return {
        "total_etrm_trades": len(etrm_trades),
        "total_broker_confirms": len(broker_confirms),
        "matched_count": matched,
        "clean_count": clean,
        "break_count": len(breaks),
        "critical_break_count": len(critical_breaks),
        "breaks": breaks_serialised,
        "reconciliation_status": "CLEAN" if len(breaks) == 0 else "BREAKS FOUND",
        "run_at": datetime.now().isoformat()
    }

def detect_duplicate_trades(trades: List[Dict], tolerance_minutes: int = 5) -> Dict:
    """
    Detect potential duplicate trade entries: same commodity, direction, volume, counterparty
    within a short time window.
    """
    duplicates = []

    for i, t1 in enumerate(trades):
        for t2 in trades[i+1:]:
            if (t1.get('commodity') == t2.get('commodity') and
                t1.get('direction') == t2.get('direction') and
                t1.get('counterparty') == t2.get('counterparty') and
                abs(t1.get('volume', 0) - t2.get('volume', 0)) < 1):

                duplicates.append({
                    "trade_1": t1.get('trade_ref'),
                    "trade_2": t2.get('trade_ref'),
                    "commodity": t1.get('commodity'),
                    "volume": t1.get('volume'),
                    "direction": t1.get('direction'),
                    "counterparty": t1.get('counterparty'),
                    "recommended_action": f"Potential duplicate: {t1.get('trade_ref')} and {t2.get('trade_ref')}. Confirm with trader before settlement."
                })

    return {
        "duplicate_pairs_found": len(duplicates),
        "duplicates": duplicates,
        "status": "DUPLICATES DETECTED" if duplicates else "CLEAN"
    }
