"""Pre-Mortem Risk Engine - 'Tell me how this position blows up'"""
from typing import Dict, List
from datetime import datetime

FAILURE_SCENARIOS = [
    {
        "name": "Russian export disruption",
        "probability": "Elevated",
        "probability_pct": 22,
        "trigger": "Primorsk or Novorossiysk port closure / sanctions escalation",
        "price_impact": {"Brent": +3.5, "Urals": -8.0, "Ethane": -1.5},
        "position_impact_multiplier": 1.0,
        "time_to_materialise_days": 3,
        "early_warning": "Baltic Dirty Tanker Index, Urals/Brent spread widening >$2 in single session"
    },
    {
        "name": "Dragon vessel delay >48 hours",
        "probability": "Medium",
        "probability_pct": 18,
        "trigger": "North Atlantic weather event, port congestion at Rafnes/Grangemouth",
        "price_impact": {"Ethane": -2.0},
        "position_impact_multiplier": 0.8,
        "time_to_materialise_days": 1,
        "early_warning": "NOAA North Atlantic storm forecast, Rafnes port utilisation >85%"
    },
    {
        "name": "OPEC+ surprise production increase",
        "probability": "Medium",
        "probability_pct": 15,
        "trigger": "Emergency OPEC+ meeting or unilateral Saudi production increase",
        "price_impact": {"Brent": -6.0, "WTI": -5.5, "Urals": -6.5},
        "position_impact_multiplier": 1.0,
        "time_to_materialise_days": 1,
        "early_warning": "Saudi Aramco OSP changes, OPEC meeting schedule changes, Reuters OPEC sources"
    },
    {
        "name": "EUA carbon price spike",
        "probability": "Low",
        "probability_pct": 8,
        "trigger": "EU regulatory change, extreme cold weather driving power demand",
        "price_impact": {"EUA": +15.0, "Gas": +2.5},
        "position_impact_multiplier": 0.6,
        "time_to_materialise_days": 5,
        "early_warning": "EU ETS auction results, European power futures, EU legislative calendar"
    },
    {
        "name": "Freight market spike",
        "probability": "Medium",
        "probability_pct": 19,
        "trigger": "VLCC demand surge from Asia, canal disruption, global tanker shortage",
        "price_impact": {"Ethane": -3.5, "NGLs": -2.8},
        "position_impact_multiplier": 0.9,
        "time_to_materialise_days": 2,
        "early_warning": "Baltic Dirty/Clean Tanker Index, VLCC fleet utilisation >92%, Suez/Panama news"
    }
]

def run_premortem(positions: List[Dict], current_prices: Dict) -> Dict:
    """Run pre-mortem analysis on current positions"""
    results = []

    for scenario in FAILURE_SCENARIOS:
        total_pnl_impact = 0
        commodity_breakdown = {}

        for pos in positions:
            commodity = pos['commodity']
            price_shock = scenario['price_impact'].get(commodity, 0)
            net_vol = pos.get('net_volume', 0)
            pnl_impact = net_vol * price_shock * scenario['position_impact_multiplier']

            if abs(pnl_impact) > 1000:
                commodity_breakdown[commodity] = round(pnl_impact, 0)
                total_pnl_impact += pnl_impact

        worst_case = total_pnl_impact * 1.4
        base_case = total_pnl_impact
        best_case = total_pnl_impact * 0.4

        results.append({
            "scenario": scenario['name'],
            "probability": scenario['probability'],
            "probability_pct": scenario['probability_pct'],
            "trigger": scenario['trigger'],
            "early_warning_signals": scenario['early_warning'],
            "time_to_materialise_days": scenario['time_to_materialise_days'],
            "pnl_impact": {
                "worst_case": round(worst_case, 0),
                "base_case": round(base_case, 0),
                "best_case": round(best_case, 0)
            },
            "commodity_breakdown": commodity_breakdown
        })

    # Sort by absolute base case impact
    results.sort(key=lambda x: abs(x['pnl_impact']['base_case']), reverse=True)

    return {
        "analysis_timestamp": datetime.now().isoformat(),
        "positions_analysed": len(positions),
        "scenarios": results,
        "top_risk": results[0]['scenario'] if results else "No positions",
        "combined_worst_case": round(sum(r['pnl_impact']['worst_case'] for r in results), 0),
        "recommendation": "Monitor early warning signals daily. Set automated alerts for threshold breaches."
    }
