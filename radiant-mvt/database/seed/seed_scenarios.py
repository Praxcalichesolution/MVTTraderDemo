"""
Seed 6 pre-computed demo scenario payloads for Radiant-MVT demo mode.
"""
import logging
import json
from database.db import SessionLocal
from database.models import DemoScenario

logger = logging.getLogger(__name__)


def seed_scenarios(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(DemoScenario).first():
            logger.info("DemoScenarios already seeded — skipping.")
            return

        scenarios = [
            DemoScenario(
                scenario_key="fat_finger",
                title="Fat Finger Trade Alert",
                description="Anomalous 6M bbl Brent trade detected from ETRM feed",
                trigger_type="manual",
                is_active=1,
                payload=json.dumps({
                    "trade_ref": "RMVT-DEMO-001",
                    "commodity": "Brent",
                    "volume": 6000000,
                    "normal_max": 1000000,
                    "sigma_above_normal": 8.4,
                    "estimated_impact": 4920000,
                    "counterparty": "Vitol",
                    "price": 82.40,
                    "anomaly_type": "fat_finger",
                    "ai_explanation": (
                        "Trade volume of 6,000,000 bbl is 8.4 standard deviations above the desk's maximum "
                        "single-trade volume of 1,000,000 bbl for Brent. This pattern is consistent with a "
                        "fat-finger data entry error (extra zero). Immediate review required before settlement."
                    ),
                    "draft_email_to": "middle.office@ineos-ts.com",
                    "draft_email_subject": "URGENT: Anomalous Trade Detected — RMVT-DEMO-001 Requires Immediate Review",
                    "draft_email_body": (
                        "Dear Middle Office Team,\n\n"
                        "An anomalous trade has been detected by the Radiant-MVT surveillance system and requires "
                        "immediate review:\n\n"
                        "Trade Reference: RMVT-DEMO-001\n"
                        "Commodity: Dated Brent Crude\n"
                        "Volume: 6,000,000 barrels (ANOMALOUS — 6x maximum desk limit)\n"
                        "Counterparty: Vitol Group\n"
                        "Price: $82.40/bbl\n"
                        "Time Booked: {timestamp}\n\n"
                        "Risk Assessment: Volume is 8.4 standard deviations above the desk's maximum single-trade "
                        "size of 1,000,000 bbl. This is consistent with a fat-finger data entry error.\n\n"
                        "Recommended Action: Place trade on hold pending trader confirmation. "
                        "Do not proceed to settlement.\n\n"
                        "This alert was generated automatically by Radiant-MVT AI Surveillance.\n\n"
                        "Radiant-MVT Risk Monitoring"
                    ),
                }),
            ),
            DemoScenario(
                scenario_key="urals_arb",
                title="Brent/Urals Spread Opportunity",
                description="Spread widens to 2.3σ following Russian refinery outage",
                trigger_type="manual",
                is_active=1,
                payload=json.dumps({
                    "spread_current": -6.20,
                    "spread_90d_mean": -4.15,
                    "spread_90d_std": 0.89,
                    "sigma_from_mean": 2.3,
                    "news_trigger": "Primorsk refinery maintenance announced — 180,000 bbl/day offline for 3 weeks",
                    "news_published_mins_ago": 22,
                    "historical_precedents": [
                        {
                            "date": "Sep 2022",
                            "spread_at_entry": -6.05,
                            "spread_at_exit": -4.20,
                            "hold_days": 9,
                            "pnl": 2800000,
                        },
                        {
                            "date": "Jan 2023",
                            "spread_at_entry": -6.45,
                            "spread_at_exit": -4.10,
                            "hold_days": 12,
                            "pnl": 3100000,
                        },
                        {
                            "date": "Aug 2024",
                            "spread_at_entry": -5.95,
                            "spread_at_exit": -4.35,
                            "hold_days": 8,
                            "pnl": 2400000,
                        },
                    ],
                    "suggested_trade": "Buy Urals CIF Med 500,000 bbl / Sell ICE Brent futures 5x contracts",
                    "expected_pnl_50pct_reversion": 420000,
                    "confidence_factors": {
                        "historical_pattern": 0.35,
                        "news_catalyst": 0.30,
                        "spread_magnitude": 0.25,
                        "liquidity": 0.10,
                    },
                    "risk_factors": [
                        "Outage shorter than expected",
                        "Freight widening offsets spread",
                        "OPEC+ announcement volatility",
                    ],
                }),
            ),
            DemoScenario(
                scenario_key="dragon_delay",
                title="JS Ineos Innovation — 14 Hour Delay",
                description="Dragon vessel delayed by North Atlantic weather",
                trigger_type="manual",
                is_active=1,
                payload=json.dumps({
                    "vessel_name": "JS Ineos Innovation",
                    "original_eta": "2026-06-12 06:00",
                    "new_eta": "2026-06-12 20:00",
                    "delay_hours": 14,
                    "cargo_volume_mt": 12100,
                    "cargo_value_usd": 3847780,
                    "bog_rate": 0.0012,
                    "bog_loss_mt_per_day": 14.52,
                    "bog_cost_14hrs": 8526,
                    "destination": "Rafnes, Norway",
                    "options": {
                        "accelerate": {
                            "label": "Accelerate vessel speed",
                            "bunker_extra_cost": 41000,
                            "delay_reduction_hours": 10,
                            "residual_delay_hours": 4,
                            "bog_saving": 6180,
                            "downstream_penalty_avoided": 120000,
                            "net_benefit": 85180,
                            "recommendation_score": 92,
                        },
                        "maintain": {
                            "label": "Maintain current speed",
                            "demurrage_cost": 26250,
                            "bog_cost_total": 8526,
                            "ethane_swap_volume_mt": 8000,
                            "ethane_swap_premium": 12,
                            "swap_cost": 96000,
                            "total_cost": 130776,
                            "plant_continuity": "Maintained",
                            "recommendation_score": 61,
                        },
                        "financial_hedge": {
                            "label": "Execute financial spread hedge",
                            "spread_trade": "Buy prompt ethane financial vs sell forward",
                            "estimated_offset": 95000,
                            "residual_exposure": 35776,
                            "execution_time_mins": 15,
                            "recommendation_score": 74,
                        },
                    },
                }),
            ),
            DemoScenario(
                scenario_key="stale_price",
                title="Stale Price Detected — Ethane Book",
                description="Two trades priced on yesterday's Argus settlement",
                trigger_type="manual",
                is_active=1,
                payload=json.dumps({
                    "pnl_spike_usd": 890000,
                    "spike_duration_mins": 47,
                    "affected_trades": [
                        {
                            "trade_ref": "RMVT-0891",
                            "commodity": "Ethane",
                            "volume_mt": 11800,
                            "booked_price": 318.50,
                            "correct_price": 279.80,
                            "counterparty": "TotalEnergies",
                            "pnl_impact": 456840,
                        },
                        {
                            "trade_ref": "RMVT-0892",
                            "commodity": "Ethane",
                            "volume_mt": 11200,
                            "booked_price": 318.50,
                            "correct_price": 279.80,
                            "counterparty": "Shell",
                            "pnl_impact": 433440,
                        },
                    ],
                    "total_overstatement": 890280,
                    "root_cause": (
                        "Both trades priced using Argus NWE Ethane assessment from 28 May 2026 "
                        "(yesterday: $318.50/MT) instead of today's assessment ($279.80/MT). "
                        "Price difference: $38.70/MT."
                    ),
                    "stale_date": "2026-05-28",
                    "correct_date": "2026-05-29",
                    "draft_email_to": "middle.office@ineos-ts.com",
                    "draft_email_subject": "P&L Correction Required — Stale Ethane Prices RMVT-0891 & RMVT-0892",
                    "draft_email_body": (
                        "Dear Middle Office,\n\n"
                        "Radiant-MVT has identified a pricing error requiring correction:\n\n"
                        "Trades Affected:\n"
                        "• RMVT-0891: 11,800 MT Ethane / TotalEnergies / Impact: $456,840\n"
                        "• RMVT-0892: 11,200 MT Ethane / Shell / Impact: $433,440\n\n"
                        "Root Cause: Trades priced at $318.50/MT (Argus NWE assessment 28-May-26) "
                        "instead of $279.80/MT (today's 29-May-26 assessment).\n\n"
                        "Total P&L Correction Required: -$890,280\n\n"
                        "Action: Please reprice both trades at $279.80/MT and notify counterparties of the correction.\n\n"
                        "Generated by Radiant-MVT Anomaly Detection"
                    ),
                }),
            ),
            DemoScenario(
                scenario_key="margin_breach",
                title="Margin Limit Approaching — Crude Book",
                description="Position at 95% of credit limit with Vitol",
                trigger_type="manual",
                is_active=1,
                payload=json.dumps({
                    "counterparty": "Vitol",
                    "credit_limit": 15000000,
                    "current_exposure": 14250000,
                    "utilisation_pct": 95.0,
                    "trigger": "Brent +$1.80 move increased MTM exposure",
                    "brent_shock_8usd_exposure": 16100000,
                    "brent_shock_8usd_breach_amount": 1100000,
                    "recommendations": [
                        "Divert next two prompt spot cargoes from Vitol to Shell or Trafigura",
                        "Request immediate margin call adjustment with Vitol (credit line review)",
                        "Novate RMVT-0234 (600K bbl) to BP to reduce Vitol exposure by $4.9M",
                    ],
                    "draft_margin_call_subject": "Credit Line Review Request — INEOS Trading & Shipping / Vitol",
                    "urgency": "Action required before end of business today",
                }),
            ),
            DemoScenario(
                scenario_key="eod_briefing",
                title="End of Day Executive Briefing",
                description="AI-generated C-suite summary",
                trigger_type="scheduled",
                is_active=1,
                payload=json.dumps({
                    "date": "2026-05-30",
                    "total_pnl_today": 1248000,
                    "total_pnl_ytd": 18400000,
                    "ytd_target": 22500000,
                    "ytd_target_pct": 81.8,
                    "best_book": "Crude (+$1.24M)",
                    "worst_book": "Ethane (-$320K, stale price corrected)",
                    "trades_today": 14,
                    "alerts_resolved": 2,
                    "vessel_updates": 1,
                    "opportunities_surfaced": 3,
                    "opportunities_actioned": 1,
                    "key_decisions_made": 2,
                }),
            ),
        ]

        db.add_all(scenarios)
        db.commit()
        logger.info(f"Seeded {len(scenarios)} demo scenarios.")
        return len(scenarios)
    except Exception as e:
        db.rollback()
        logger.error(f"seed_scenarios error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_scenarios()
