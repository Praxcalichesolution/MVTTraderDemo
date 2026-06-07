"""Parametric VaR calculation using rolling covariance matrix"""
import numpy as np
import pandas as pd
from typing import Dict, List
from datetime import datetime, timedelta

VAR_CONFIDENCE = 0.99
VAR_WINDOW_DAYS = 90
Z_SCORE_99 = 2.326  # Z-score for 99% confidence

def calculate_parametric_var(positions: List[Dict], price_history: Dict[str, List[float]], horizon_days: int = 1) -> Dict:
    """
    Parametric VaR using variance-covariance method.
    positions: list of {commodity, net_volume, volume_unit}
    price_history: {commodity: [prices last 90 days]}
    """
    commodities = [p['commodity'] for p in positions if p.get('net_volume', 0) != 0]
    if not commodities:
        return {"var_1d": 0, "var_10d": 0, "confidence": VAR_CONFIDENCE}

    # Build returns matrix
    returns_matrix = {}
    for commodity in commodities:
        prices = price_history.get(commodity, [])
        if len(prices) > 1:
            prices_arr = np.array(prices[-VAR_WINDOW_DAYS:])
            returns = np.diff(prices_arr) / prices_arr[:-1]
            returns_matrix[commodity] = returns

    if not returns_matrix:
        return {"var_1d": 0, "var_10d": 0, "confidence": VAR_CONFIDENCE}

    # Align lengths
    min_len = min(len(r) for r in returns_matrix.values())
    returns_df = pd.DataFrame({k: v[-min_len:] for k, v in returns_matrix.items()})

    # Covariance matrix
    cov_matrix = returns_df.cov().values

    # Position vector (in USD terms: volume * current_price)
    position_values = []
    for pos in positions:
        commodity = pos['commodity']
        if commodity in returns_matrix:
            net_vol = pos.get('net_volume', 0)
            price = price_history.get(commodity, [82.0])[-1]
            position_values.append(net_vol * price)

    if not position_values:
        return {"var_1d": 0, "var_10d": 0, "confidence": VAR_CONFIDENCE}

    w = np.array(position_values)

    # Portfolio variance: w^T * Sigma * w
    if cov_matrix.shape[0] == len(w):
        portfolio_variance = float(w.T @ cov_matrix @ w)
        portfolio_std = np.sqrt(abs(portfolio_variance))
    else:
        portfolio_std = abs(sum(position_values)) * 0.015  # fallback 1.5% daily vol

    var_1d = Z_SCORE_99 * portfolio_std * np.sqrt(horizon_days)
    var_10d = var_1d * np.sqrt(10)

    return {
        "var_1d": round(abs(var_1d), 0),
        "var_10d": round(abs(var_10d), 0),
        "confidence": VAR_CONFIDENCE,
        "window_days": VAR_WINDOW_DAYS,
        "methodology": "Parametric (Variance-Covariance)",
        "calculated_at": datetime.now().isoformat()
    }

def calculate_stress_var(positions: List[Dict], scenario: str) -> Dict:
    """Stress VaR for named scenarios"""
    scenarios = {
        "brent_drop_5": {"Brent": -5.0, "WTI": -4.5, "Urals": -5.2},
        "brent_up_8": {"Brent": 8.0, "WTI": 7.5, "Urals": 8.3},
        "russian_disruption": {"Urals": -12.0, "Brent": 3.5},
        "opec_cut": {"Brent": 6.0, "WTI": 5.5, "Urals": 5.8},
        "freight_spike": {"Ethane": -8.0, "NGLs": -5.0},
    }

    shocks = scenarios.get(scenario, {})
    total_pnl_impact = 0
    breakdown = {}

    for pos in positions:
        commodity = pos['commodity']
        shock = shocks.get(commodity, 0)
        net_vol = pos.get('net_volume', 0)
        pnl_impact = net_vol * shock
        breakdown[commodity] = round(pnl_impact, 0)
        total_pnl_impact += pnl_impact

    return {
        "scenario": scenario,
        "total_pnl_impact": round(total_pnl_impact, 0),
        "breakdown": breakdown,
        "shocks_applied": shocks
    }
