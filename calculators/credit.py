"""Counterparty credit utilisation, stress scenarios, limit breach probability"""
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime, timedelta

# Default credit limits by counterparty tier (USD)
DEFAULT_CREDIT_LIMITS = {
    "Tier1": 50_000_000,   # BP, Shell, TotalEnergies, Equinor
    "Tier2": 25_000_000,   # Vitol, Trafigura, Glencore
    "Tier3": 10_000_000,   # Smaller traders, regional players
    "Unrated": 2_000_000
}

def calculate_credit_utilisation(counterparty_exposures: List[Dict], credit_limits: Optional[Dict[str, float]] = None) -> Dict:
    """
    Calculate current credit utilisation per counterparty.
    counterparty_exposures: list of {counterparty, tier, mtm_exposure, settlement_exposure, trade_count}
    Returns utilisation %, headroom, and breach flags.
    """
    limits = credit_limits or DEFAULT_CREDIT_LIMITS
    results = []

    for cp in counterparty_exposures:
        name = cp.get('counterparty', 'Unknown')
        tier = cp.get('tier', 'Tier3')
        mtm = cp.get('mtm_exposure', 0)
        settlement = cp.get('settlement_exposure', 0)
        total_exposure = mtm + settlement

        limit = cp.get('credit_limit') or limits.get(tier, limits['Tier3'])
        util_pct = (total_exposure / limit * 100) if limit > 0 else 0

        results.append({
            "counterparty": name,
            "tier": tier,
            "mtm_exposure_usd": round(mtm, 0),
            "settlement_exposure_usd": round(settlement, 0),
            "total_exposure_usd": round(total_exposure, 0),
            "credit_limit_usd": limit,
            "utilisation_pct": round(util_pct, 1),
            "headroom_usd": round(max(0, limit - total_exposure), 0),
            "status": "BREACH" if util_pct > 100 else "WARNING" if util_pct > 80 else "OK",
            "trade_count": cp.get('trade_count', 0)
        })

    results.sort(key=lambda x: x['utilisation_pct'], reverse=True)

    breaches = [r for r in results if r['status'] == 'BREACH']
    warnings = [r for r in results if r['status'] == 'WARNING']
    total_exposure = sum(r['total_exposure_usd'] for r in results)
    total_limit = sum(r['credit_limit_usd'] for r in results)

    return {
        "counterparties": results,
        "total_exposure_usd": round(total_exposure, 0),
        "total_limit_usd": round(total_limit, 0),
        "portfolio_utilisation_pct": round(total_exposure / total_limit * 100, 1) if total_limit > 0 else 0,
        "breach_count": len(breaches),
        "warning_count": len(warnings),
        "breaches": [r['counterparty'] for r in breaches],
        "calculated_at": datetime.now().isoformat()
    }

def run_credit_stress_scenario(counterparty_exposures: List[Dict], scenario: str) -> Dict:
    """
    Stress test counterparty credit under named market scenarios.
    Scenarios inflate MTM exposures based on market moves.
    """
    mtm_multipliers = {
        "brent_drop_10": 1.45,       # large directional moves increase MTM
        "brent_spike_10": 1.38,
        "russian_disruption": 1.62,  # spread blowout creates large MTM swings
        "freight_spike": 1.28,
        "counterparty_default": 2.0  # worst case: one tier-2 CP defaults
    }

    multiplier = mtm_multipliers.get(scenario, 1.2)
    stressed_exposures = []

    for cp in counterparty_exposures:
        stressed_mtm = cp.get('mtm_exposure', 0) * multiplier
        stressed_settlement = cp.get('settlement_exposure', 0) * 1.1  # slight increase
        stressed_exposures.append({
            **cp,
            "mtm_exposure": stressed_mtm,
            "settlement_exposure": stressed_settlement
        })

    stressed_result = calculate_credit_utilisation(stressed_exposures)
    baseline_result = calculate_credit_utilisation(counterparty_exposures)

    return {
        "scenario": scenario,
        "mtm_stress_multiplier": multiplier,
        "baseline_exposure_usd": baseline_result['total_exposure_usd'],
        "stressed_exposure_usd": stressed_result['total_exposure_usd'],
        "exposure_increase_usd": round(stressed_result['total_exposure_usd'] - baseline_result['total_exposure_usd'], 0),
        "baseline_breaches": baseline_result['breach_count'],
        "stressed_breaches": stressed_result['breach_count'],
        "new_breaches_under_stress": max(0, stressed_result['breach_count'] - baseline_result['breach_count']),
        "stressed_counterparties": stressed_result['counterparties']
    }

def estimate_breach_probability(counterparty: Dict, volatility_pct: float = 0.15, horizon_days: int = 5) -> Dict:
    """
    Estimate probability of breaching credit limit within horizon using a simple diffusion model.
    Uses normal approximation: P(exposure > limit) given current utilisation and vol.
    """
    current_exposure = counterparty.get('mtm_exposure', 0) + counterparty.get('settlement_exposure', 0)
    limit = counterparty.get('credit_limit', DEFAULT_CREDIT_LIMITS['Tier3'])
    util_pct = current_exposure / limit if limit > 0 else 1.0

    # Annualised daily vol assumption
    daily_vol = volatility_pct / np.sqrt(252)
    horizon_vol = daily_vol * np.sqrt(horizon_days)

    # Distance to breach in standard deviations
    headroom_pct = 1.0 - util_pct
    if headroom_pct <= 0:
        breach_prob = 1.0
    else:
        z = headroom_pct / (util_pct * horizon_vol) if util_pct > 0 else 10
        breach_prob = float(1 - 0.5 * (1 + np.math.erf(z / np.sqrt(2))))

    return {
        "counterparty": counterparty.get('counterparty', 'Unknown'),
        "current_utilisation_pct": round(util_pct * 100, 1),
        "breach_probability_pct": round(min(100, breach_prob * 100), 1),
        "horizon_days": horizon_days,
        "headroom_usd": round(max(0, limit - current_exposure), 0),
        "risk_level": "HIGH" if breach_prob > 0.20 else "MEDIUM" if breach_prob > 0.05 else "LOW"
    }
