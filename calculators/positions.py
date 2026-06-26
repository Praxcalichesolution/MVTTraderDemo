"""Position aggregation - net positions by commodity/region/tenor, hedge ratios"""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime, date

# INEOS constants
ETHANE_MT_TO_BBL = 72.37

def aggregate_net_positions(trades: List[Dict]) -> Dict:
    """
    Aggregate raw trades into net positions by commodity, region, tenor bucket.
    Returns net long/short per commodity with unit-normalised volumes.
    """
    positions: Dict[str, Dict] = {}

    for trade in trades:
        commodity = trade.get('commodity', 'Unknown')
        region = trade.get('region', 'Global')
        tenor = trade.get('tenor_bucket', 'Spot')  # Spot / M+1 / M+2 / Cal
        direction = trade.get('direction', 'Buy')
        volume = trade.get('volume', 0)
        volume_unit = trade.get('volume_unit', 'BBL')
        price = trade.get('price', 0)

        # Normalise to BBL
        if volume_unit == 'MT' and commodity in ['Ethane', 'NGLs']:
            volume_bbl = volume * ETHANE_MT_TO_BBL
        else:
            volume_bbl = volume

        signed_volume = volume_bbl if direction == 'Buy' else -volume_bbl

        key = f"{commodity}|{region}|{tenor}"
        if key not in positions:
            positions[key] = {
                "commodity": commodity,
                "region": region,
                "tenor": tenor,
                "net_volume_bbl": 0,
                "gross_long_bbl": 0,
                "gross_short_bbl": 0,
                "trade_count": 0,
                "avg_price": 0,
                "_total_cost": 0
            }

        p = positions[key]
        p["net_volume_bbl"] += signed_volume
        p["trade_count"] += 1
        p["_total_cost"] += abs(signed_volume) * price
        if signed_volume > 0:
            p["gross_long_bbl"] += signed_volume
        else:
            p["gross_short_bbl"] += abs(signed_volume)

    # Calculate avg price and clean up internal fields
    result_positions = []
    for key, p in positions.items():
        total_gross = p["gross_long_bbl"] + p["gross_short_bbl"]
        p["avg_price"] = round(p["_total_cost"] / total_gross, 4) if total_gross > 0 else 0
        p["net_volume_bbl"] = round(p["net_volume_bbl"], 0)
        p["direction"] = "Long" if p["net_volume_bbl"] >= 0 else "Short"
        del p["_total_cost"]
        result_positions.append(p)

    # Summary by commodity
    commodity_summary: Dict[str, float] = {}
    for p in result_positions:
        c = p["commodity"]
        commodity_summary[c] = commodity_summary.get(c, 0) + p["net_volume_bbl"]

    return {
        "positions": result_positions,
        "commodity_summary": {k: round(v, 0) for k, v in commodity_summary.items()},
        "total_gross_long": round(sum(p["gross_long_bbl"] for p in result_positions), 0),
        "total_gross_short": round(sum(p["gross_short_bbl"] for p in result_positions), 0),
        "as_of": datetime.now().isoformat()
    }

def calculate_hedge_ratio(physical_position: Dict, hedge_position: Dict) -> Dict:
    """
    Calculate hedge effectiveness ratio for a physical/derivative position pair.
    Returns hedge ratio, over/under hedge status, and recommended adjustment.
    """
    physical_vol = physical_position.get('net_volume_bbl', 0)
    hedge_vol = hedge_position.get('net_volume_bbl', 0)

    if physical_vol == 0:
        return {"hedge_ratio": 0, "status": "No physical position", "recommendation": "N/A"}

    # Hedge ratio: -1.0 = perfectly hedged (hedge is opposite sign)
    hedge_ratio = -hedge_vol / physical_vol if physical_vol != 0 else 0

    if 0.90 <= hedge_ratio <= 1.10:
        status = "Fully Hedged"
        recommendation = "No action required"
    elif hedge_ratio < 0.90:
        unhedged_vol = physical_vol * (1 - hedge_ratio)
        status = "Under-Hedged"
        recommendation = f"Sell {abs(unhedged_vol):.0f} BBL {hedge_position.get('commodity','commodity')} to reach full hedge"
    else:
        over_vol = physical_vol * (hedge_ratio - 1)
        status = "Over-Hedged"
        recommendation = f"Buy back {abs(over_vol):.0f} BBL {hedge_position.get('commodity','commodity')} to reduce over-hedge"

    return {
        "physical_volume_bbl": round(physical_vol, 0),
        "hedge_volume_bbl": round(hedge_vol, 0),
        "hedge_ratio": round(hedge_ratio, 3),
        "hedge_ratio_pct": round(hedge_ratio * 100, 1),
        "status": status,
        "recommendation": recommendation,
        "commodity": physical_position.get('commodity', 'Unknown')
    }

def calculate_position_limits_utilisation(positions: List[Dict], limits: Dict[str, float]) -> Dict:
    """
    Check each commodity's net exposure against approved position limits.
    Returns utilisation % and breach flags.
    """
    utilisation = []

    for pos in positions:
        commodity = pos['commodity']
        net_vol = abs(pos.get('net_volume_bbl', 0))
        limit = limits.get(commodity, 1000000)  # default 1M BBL limit
        util_pct = (net_vol / limit * 100) if limit > 0 else 0

        utilisation.append({
            "commodity": commodity,
            "net_volume_bbl": round(net_vol, 0),
            "limit_bbl": limit,
            "utilisation_pct": round(util_pct, 1),
            "headroom_bbl": round(max(0, limit - net_vol), 0),
            "status": "BREACH" if util_pct > 100 else "WARNING" if util_pct > 85 else "OK",
            "limit_breach": util_pct > 100
        })

    breaches = [u for u in utilisation if u['limit_breach']]
    warnings = [u for u in utilisation if u['status'] == 'WARNING']

    return {
        "utilisation": utilisation,
        "breach_count": len(breaches),
        "warning_count": len(warnings),
        "breaches": breaches,
        "max_utilisation_pct": max((u['utilisation_pct'] for u in utilisation), default=0),
        "as_of": datetime.now().isoformat()
    }
