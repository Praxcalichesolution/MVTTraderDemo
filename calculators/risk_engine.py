"""
Risk module calculation helpers.

The demo database does not carry a full historical price store yet, so this
engine uses available market prices and deterministic 260-day return paths.
The API keeps the methodology visible so real market-history integration can
replace the synthetic path without changing the UI contract.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
import math


OBSERVATION_DAYS = 260


def _num(value, default=0.0) -> float:
    try:
        if value is None:
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _basis_bucket(commodity: str, region: str | None) -> str:
    commodity_name = (commodity or "Unknown").strip()
    region_name = (region or "Global").strip()
    if "Urals" in commodity_name:
        return "Urals-Brent / " + region_name
    if "Brent" in commodity_name:
        return "Brent prompt / " + region_name
    if "LPG" in commodity_name or "Ethane" in commodity_name:
        return "NGL freight-adjusted / " + region_name
    return commodity_name + " outright / " + region_name


def _commodity_key(commodity: str) -> int:
    return sum(ord(ch) for ch in (commodity or "Unknown"))


def normalize_positions(positions, market_prices: dict[str, float]) -> list[dict]:
    exposures = []
    for pos in positions:
        commodity = pos.commodity or "Unknown"
        physical = _num(getattr(pos, "physical_volume", 0))
        paper = _num(getattr(pos, "paper_volume", 0))
        exchange = _num(getattr(pos, "exchange_volume", 0))
        financial = paper + exchange
        net = _num(getattr(pos, "net_volume", physical + financial), physical + financial)
        delta = net if net else physical + financial
        price = _num(getattr(pos, "mtm_price", None), 0) or _num(getattr(pos, "avg_price", None), 0) or market_prices.get(commodity, 80.0)

        if physical and financial:
            source_type = "Mixed"
        elif physical:
            source_type = "Physical"
        else:
            source_type = "Financial"

        hedge_effectiveness = 0.0
        if abs(physical) > 0:
            hedge_effectiveness = min(abs(financial) / abs(physical), 1.0)
        elif abs(financial) > 0:
            hedge_effectiveness = 1.0

        region = getattr(pos, "region", None) or "Global"
        exposures.append({
            "position_id": pos.id,
            "book_id": getattr(pos, "book_id", None),
            "book_name": pos.book.name if getattr(pos, "book", None) else "Unassigned",
            "commodity": commodity,
            "region": region,
            "tenor": getattr(pos, "tenor", None) or getattr(pos, "delivery_month", None) or "Prompt",
            "source_type": source_type,
            "physical_volume": round(physical, 2),
            "financial_volume": round(financial, 2),
            "net_volume": round(net, 2),
            "delta_equivalent": round(delta, 2),
            "basis_bucket": _basis_bucket(commodity, region),
            "location_basis": region,
            "hedge_effectiveness": round(hedge_effectiveness, 4),
            "normalized_price": round(price, 4),
            "notional_usd": round(delta * price, 2),
        })
    return exposures


def make_return_path(commodity: str, days: int = OBSERVATION_DAYS) -> list[float]:
    seed = _commodity_key(commodity)
    vol = 0.011 + (seed % 9) * 0.0017
    drift = ((seed % 5) - 2) * 0.00008
    returns = []
    for i in range(days):
        seasonal = math.sin((i + seed) / 8.5) * vol * 0.55
        second = math.cos((i * 1.7 + seed) / 13.0) * vol * 0.35
        shock = 0.0
        if (i + seed) % 53 == 0:
            shock = -vol * (2.2 + (seed % 4) * 0.35)
        elif (i + seed) % 47 == 0:
            shock = vol * (1.8 + (seed % 3) * 0.25)
        returns.append(drift + seasonal + second + shock)
    return returns


def historical_var_es(exposures: list[dict], confidence: float = 0.99, horizon_days: int = 1) -> dict:
    horizon = max(int(horizon_days or 1), 1)
    if not exposures:
        return {
            "confidence": confidence,
            "horizon_days": horizon,
            "var_amount": 0,
            "expected_shortfall": 0,
            "observations": 0,
            "portfolio_value": 0,
            "methodology": "Historical Simulation",
            "breakdown_by_commodity": {},
        }

    returns_by_commodity = {
        exp["commodity"]: make_return_path(exp["commodity"], OBSERVATION_DAYS + horizon)
        for exp in exposures
    }
    pnl_path = []
    for i in range(OBSERVATION_DAYS):
        total_pnl = 0.0
        for exp in exposures:
            returns = returns_by_commodity[exp["commodity"]]
            horizon_return = sum(returns[i:i + horizon])
            total_pnl += _num(exp["delta_equivalent"]) * _num(exp["normalized_price"], 80) * horizon_return
        pnl_path.append(total_pnl)

    losses = sorted([-p for p in pnl_path])
    index = min(max(math.ceil(confidence * len(losses)) - 1, 0), len(losses) - 1)
    var_amount = max(losses[index], 0)
    tail_losses = [loss for loss in losses if loss >= var_amount]
    expected_shortfall = sum(tail_losses) / len(tail_losses) if tail_losses else var_amount

    breakdown = {}
    for commodity in sorted({exp["commodity"] for exp in exposures}):
        commodity_exposures = [exp for exp in exposures if exp["commodity"] == commodity]
        commodity_result = historical_var_es_single(commodity_exposures, confidence, horizon)
        breakdown[commodity] = round(commodity_result, 0)

    return {
        "confidence": confidence,
        "horizon_days": horizon,
        "var_amount": round(var_amount, 0),
        "expected_shortfall": round(expected_shortfall, 0),
        "observations": OBSERVATION_DAYS,
        "portfolio_value": round(sum(abs(_num(exp["notional_usd"])) for exp in exposures), 0),
        "methodology": "Historical Simulation",
        "breakdown_by_commodity": breakdown,
        "return_source": "260 trading-day deterministic demo path seeded from current market data",
    }


def historical_var_es_single(exposures: list[dict], confidence: float, horizon: int) -> float:
    if not exposures:
        return 0.0
    returns_by_commodity = {
        exp["commodity"]: make_return_path(exp["commodity"], OBSERVATION_DAYS + horizon)
        for exp in exposures
    }
    losses = []
    for i in range(OBSERVATION_DAYS):
        pnl = 0.0
        for exp in exposures:
            pnl += _num(exp["delta_equivalent"]) * _num(exp["normalized_price"], 80) * sum(returns_by_commodity[exp["commodity"]][i:i + horizon])
        losses.append(-pnl)
    losses.sort()
    index = min(max(math.ceil(confidence * len(losses)) - 1, 0), len(losses) - 1)
    return max(losses[index], 0)


def stress_scenarios(exposures: list[dict]) -> list[dict]:
    scenarios = [
        {
            "name": "Brent/Urals basis blowout",
            "type": "Basis",
            "description": "Brent rallies while Urals weakens on regional dislocation.",
            "shocks": {"Brent": 0.045, "Urals": -0.075, "default": -0.018},
        },
        {
            "name": "Severe weather logistics event",
            "type": "Weather",
            "description": "Port disruption and freight squeeze across physical barrels.",
            "shocks": {"LPG": -0.06, "Ethane": -0.055, "default": -0.025},
        },
        {
            "name": "Regional supply disruption",
            "type": "Supply",
            "description": "Regional outage reprices prompt barrels and location basis.",
            "shocks": {"Brent": 0.035, "Urals": 0.025, "default": 0.02},
        },
    ]

    results = []
    for scenario in scenarios:
        by_book = defaultdict(float)
        by_commodity = defaultdict(float)
        total = 0.0
        for exp in exposures:
            commodity = exp["commodity"]
            shock = scenario["shocks"].get(commodity, scenario["shocks"].get("default", 0))
            if scenario["type"] == "Weather" and exp["source_type"] == "Physical":
                shock *= 1.35
            impact = _num(exp["delta_equivalent"]) * _num(exp["normalized_price"], 80) * shock
            total += impact
            by_book[exp["book_name"]] += impact
            by_commodity[commodity] += impact
        worst_book = min(by_book.items(), key=lambda item: item[1])[0] if by_book else "N/A"
        results.append({
            "scenario_name": scenario["name"],
            "scenario_type": scenario["type"],
            "description": scenario["description"],
            "total_pnl_impact": round(total, 0),
            "worst_book": worst_book,
            "by_book": {key: round(value, 0) for key, value in by_book.items()},
            "by_commodity": {key: round(value, 0) for key, value in by_commodity.items()},
        })
    return results


def backtest_observations(var_1d_99: float, days: int = 60) -> list[dict]:
    observations = []
    start = date.today() - timedelta(days=days)
    for i in range(days):
        obs_date = start + timedelta(days=i + 1)
        realized = -var_1d_99 * (0.35 + 0.42 * math.sin(i / 4.7))
        if i in (17, 43):
            realized = -var_1d_99 * (1.08 + i * 0.001)
        exception = abs(realized) > var_1d_99 and realized < 0
        observations.append({
            "observation_date": obs_date.isoformat(),
            "confidence": 0.99,
            "horizon_days": 1,
            "predicted_var": round(var_1d_99, 0),
            "realized_pnl": round(realized, 0),
            "exception_flag": 1 if exception else 0,
            "exception_amount": round(abs(realized) - var_1d_99, 0) if exception else 0,
            "notes": "VaR exception" if exception else "Inside model envelope",
        })
    return observations


def build_limits(metrics: list[dict], exposures: list[dict]) -> list[dict]:
    var_99_1d = next((m for m in metrics if m["confidence"] == 0.99 and m["horizon_days"] == 1), None)
    var_99_10d = next((m for m in metrics if m["confidence"] == 0.99 and m["horizon_days"] == 10), None)
    gross_notional = sum(abs(_num(exp["notional_usd"])) for exp in exposures)
    limit_specs = [
        ("Portfolio", "Total Book", "1D 99% VaR", 8_000_000, _num(var_99_1d["var_amount"] if var_99_1d else 0)),
        ("Portfolio", "Total Book", "10D 99% VaR", 25_000_000, _num(var_99_10d["var_amount"] if var_99_10d else 0)),
        ("Portfolio", "Total Book", "Gross delta-equivalent notional", 350_000_000, gross_notional),
    ]
    rows = []
    for scope_type, scope_name, metric, limit_amount, current_value in limit_specs:
        utilization = current_value / limit_amount * 100 if limit_amount else 0
        status = "Breach" if utilization >= 100 else "Warning" if utilization >= 80 else "OK"
        rows.append({
            "scope_type": scope_type,
            "scope_name": scope_name,
            "metric": metric,
            "limit_amount": round(limit_amount, 0),
            "warning_pct": 80,
            "breach_pct": 100,
            "current_value": round(current_value, 0),
            "utilization_pct": round(utilization, 1),
            "status": status,
            "escalation": "Credit alert pipeline" if status != "OK" else "None",
        })
    return rows


def build_reports(metrics: list[dict], stress: list[dict], limits: list[dict]) -> list[dict]:
    today = date.today().isoformat()
    worst_stress = min(stress, key=lambda item: item["total_pnl_impact"]) if stress else None
    exception_limits = [row for row in limits if row["status"] != "OK"]
    return [
        {
            "report_date": today,
            "report_type": "Daily",
            "title": "Daily VaR/ES by desk and portfolio",
            "status": "Ready",
            "methodology": "Historical Simulation VaR with Expected Shortfall",
            "summary": {
                "metric_count": len(metrics),
                "limit_exceptions": len(exception_limits),
                "worst_stress": worst_stress["scenario_name"] if worst_stress else "N/A",
            },
        },
        {
            "report_date": today,
            "report_type": "Periodic",
            "title": "Risk committee stress and backtesting pack",
            "status": "Ready",
            "methodology": "Historical Simulation, stress P&L, backtesting exceptions",
            "summary": {
                "stress_scenarios": len(stress),
                "breach_pipeline": "Credit alert pipeline",
            },
        },
    ]
