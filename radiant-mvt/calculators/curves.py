"""Forward curve construction - spot + basis, curve shift logic"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel

class CurveShiftInput(BaseModel):
    commodity: str
    shift_type: str  # "parallel", "steepen", "flatten", "twist"
    shift_amount_usd: float  # USD per BBL / MT
    tenor_from: Optional[str] = None  # e.g. "M1", "Cal25" - for non-parallel shifts
    tenor_to: Optional[str] = None
    as_of: Optional[str] = None  # ISO date string, defaults to today

TENOR_LABELS = ["Spot", "M+1", "M+2", "M+3", "Q2", "Q3", "Q4", "Cal+1", "Cal+2"]
TENOR_MONTHS = [0, 1, 2, 3, 4, 7, 10, 13, 25]  # approximate month offsets

def build_forward_curve(spot_price: float, commodity: str, basis_points: Optional[List[float]] = None) -> Dict:
    """
    Construct forward curve from spot price and basis adjustments.
    basis_points: list of $/BBL adjustments for each tenor (relative to spot)
    If not provided, uses commodity-specific defaults.
    """
    default_basis = {
        "Brent": [0.0, -0.15, -0.28, -0.40, -0.55, -0.65, -0.72, -0.95, -1.40],
        "WTI":   [0.0, -0.20, -0.38, -0.52, -0.70, -0.85, -0.95, -1.20, -1.65],
        "Urals": [0.0, -0.35, -0.60, -0.85, -1.10, -1.30, -1.45, -1.80, -2.40],
        "Ethane":[0.0, +0.50, +0.95, +1.30, +1.60, +1.80, +1.95, +2.20, +2.60],
        "NGLs":  [0.0, +0.30, +0.55, +0.75, +0.90, +1.00, +1.08, +1.25, +1.55],
    }

    basis = basis_points or default_basis.get(commodity, [0.0] * len(TENOR_LABELS))

    curve_points = []
    for i, label in enumerate(TENOR_LABELS):
        b = basis[i] if i < len(basis) else 0.0
        forward_price = spot_price + b
        curve_points.append({
            "tenor": label,
            "month_offset": TENOR_MONTHS[i],
            "price": round(forward_price, 3),
            "basis_vs_spot": round(b, 3)
        })

    # Determine structure
    m1_price = curve_points[1]["price"]
    m3_price = curve_points[3]["price"]
    structure = "Backwardation" if m1_price > m3_price else "Contango"

    return {
        "commodity": commodity,
        "spot_price": spot_price,
        "curve_structure": structure,
        "curve": curve_points,
        "built_at": datetime.now().isoformat()
    }

def apply_curve_shift(curve: Dict, shift_input: CurveShiftInput) -> Dict:
    """
    Apply a curve shift scenario to an existing forward curve.
    Returns shifted curve and PnL impact estimate per 1000 BBL of exposure.
    """
    curve_points = curve.get("curve", [])
    shifted_points = []

    for i, point in enumerate(curve_points):
        tenor = point["tenor"]
        original_price = point["price"]

        if shift_input.shift_type == "parallel":
            delta = shift_input.shift_amount_usd

        elif shift_input.shift_type == "steepen":
            # Near end unchanged, far end gets full shift
            delta = shift_input.shift_amount_usd * (i / max(len(curve_points) - 1, 1))

        elif shift_input.shift_type == "flatten":
            # Near end gets full shift, far end unchanged
            delta = shift_input.shift_amount_usd * (1 - i / max(len(curve_points) - 1, 1))

        elif shift_input.shift_type == "twist":
            # Short end down, long end up (or reverse depending on sign)
            midpoint = len(curve_points) / 2
            delta = shift_input.shift_amount_usd * ((i - midpoint) / midpoint)

        else:
            delta = 0.0

        shifted_points.append({
            "tenor": tenor,
            "month_offset": point["month_offset"],
            "original_price": original_price,
            "shifted_price": round(original_price + delta, 3),
            "delta": round(delta, 3),
            "basis_vs_spot": point["basis_vs_spot"]
        })

    pnl_per_1000bbl = sum(p["delta"] for p in shifted_points) / len(shifted_points) * 1000

    return {
        "commodity": shift_input.commodity,
        "shift_type": shift_input.shift_type,
        "shift_amount_usd": shift_input.shift_amount_usd,
        "shifted_curve": shifted_points,
        "avg_price_delta": round(sum(p["delta"] for p in shifted_points) / max(len(shifted_points), 1), 3),
        "indicative_pnl_per_1000bbl": round(pnl_per_1000bbl, 0),
        "applied_at": datetime.now().isoformat()
    }

def calculate_spread(curve_a: Dict, curve_b: Dict) -> Dict:
    """Calculate spread between two forward curves (e.g. Brent/WTI, Brent/Urals)."""
    points_a = {p["tenor"]: p["price"] for p in curve_a.get("curve", [])}
    points_b = {p["tenor"]: p["price"] for p in curve_b.get("curve", [])}

    spread_points = []
    for tenor in TENOR_LABELS:
        price_a = points_a.get(tenor)
        price_b = points_b.get(tenor)
        if price_a is not None and price_b is not None:
            spread_points.append({
                "tenor": tenor,
                "spread": round(price_a - price_b, 3),
                f"{curve_a['commodity']}_price": price_a,
                f"{curve_b['commodity']}_price": price_b
            })

    spot_spread = spread_points[0]["spread"] if spread_points else 0

    return {
        "spread_name": f"{curve_a['commodity']}/{curve_b['commodity']}",
        "spot_spread": spot_spread,
        "curve": spread_points,
        "structure": "Widening" if len(spread_points) > 1 and spread_points[-1]["spread"] > spot_spread else "Narrowing",
        "calculated_at": datetime.now().isoformat()
    }
