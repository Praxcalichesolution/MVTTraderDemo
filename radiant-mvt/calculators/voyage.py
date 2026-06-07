"""Voyage economics calculator for INEOS Dragon Fleet"""
from dataclasses import dataclass
from typing import Dict, Optional
from datetime import datetime, timedelta
import math

# INEOS Dragon Fleet Constants
ETHANE_MT_TO_BBL = 72.37
BOG_RATE_BASE = 0.0012  # 0.12% per day (mid-range)
DEMURRAGE_RATE = 45000  # USD per day
ALLOWED_LAYTIME_HOURS = 36
BUNKER_PRICE_USD_MT = 580  # VLSFO current price
SPEED_NORMAL_KNOTS = 17.5
SPEED_ECO_KNOTS = 15.0
SPEED_FULL_KNOTS = 20.0
FUEL_CONSUMPTION_NORMAL_MT_PER_DAY = 38  # MT/day at normal speed
FUEL_CONSUMPTION_FULL_MT_PER_DAY = 58    # MT/day at full speed

@dataclass
class VoyageScenario:
    label: str
    description: str
    total_cost: float
    net_benefit_vs_baseline: float
    recommendation_score: int  # 0-100
    details: Dict
    recommended_action: str

class VoyageCalculator:
    def __init__(self, vessel_name: str, cargo_volume_mt: float, delay_hours: float,
                 destination: str = "Rafnes, Norway"):
        self.vessel_name = vessel_name
        self.cargo_volume_mt = cargo_volume_mt
        self.cargo_volume_bbl = cargo_volume_mt * ETHANE_MT_TO_BBL
        self.delay_hours = delay_hours
        self.delay_days = delay_hours / 24
        self.destination = destination

    def calculate_bog_loss(self, hours: float) -> Dict:
        """Calculate Boil-Off Gas loss"""
        days = hours / 24
        bog_mt = self.cargo_volume_mt * BOG_RATE_BASE * days
        bog_value = bog_mt * 290  # ~$290/MT ethane current price
        return {
            "bog_mt": round(bog_mt, 2),
            "bog_bbl": round(bog_mt * ETHANE_MT_TO_BBL, 0),
            "bog_cost_usd": round(bog_value, 0),
            "rate_pct_per_day": BOG_RATE_BASE * 100
        }

    def calculate_demurrage(self, delay_hours: float) -> float:
        """Calculate demurrage cost for delay past laytime"""
        if delay_hours <= 0:
            return 0
        delay_days = delay_hours / 24
        return DEMURRAGE_RATE * delay_days

    def calculate_bunker_cost_to_accelerate(self, hours_to_save: float, distance_nm: float = 3000) -> float:
        """Extra bunker cost to accelerate and save time"""
        # Extra fuel burn to go from normal to full speed
        extra_fuel_per_day = FUEL_CONSUMPTION_FULL_MT_PER_DAY - FUEL_CONSUMPTION_NORMAL_MT_PER_DAY
        days_at_higher_speed = (distance_nm / SPEED_FULL_KNOTS) / 24
        extra_fuel_mt = extra_fuel_per_day * days_at_higher_speed * 0.6  # proportional
        return round(extra_fuel_mt * BUNKER_PRICE_USD_MT, 0)

    def calculate_downstream_penalty(self, delay_hours: float, plant: str = "Rafnes") -> float:
        """Estimate downstream supply chain penalty for late delivery"""
        # Rafnes/Grangemouth: ethane feedstock shortage costs ~$8,500/hour of plant curtailment
        # After 6 hours delay, plant starts rationing; after 12 hours, partial curtailment
        if delay_hours <= 6:
            return 0
        elif delay_hours <= 12:
            return delay_hours * 2000  # minor efficiency loss
        elif delay_hours <= 24:
            return 60000 + (delay_hours - 12) * 5000
        else:
            return 120000 + (delay_hours - 24) * 8500

    def calculate_three_options(self) -> Dict:
        """Calculate three voyage response options with full economics"""
        bog_baseline = self.calculate_bog_loss(self.delay_hours)
        demurrage_baseline = self.calculate_demurrage(self.delay_hours)
        downstream_penalty = self.calculate_downstream_penalty(self.delay_hours)

        # Option A: Accelerate
        hours_saved = min(self.delay_hours * 0.71, self.delay_hours - 4)  # max save ~71%, min 4h residual
        bunker_extra = self.calculate_bunker_cost_to_accelerate(hours_saved)
        bog_with_accel = self.calculate_bog_loss(self.delay_hours - hours_saved)
        demurrage_with_accel = self.calculate_demurrage(max(0, self.delay_hours - hours_saved))
        downstream_with_accel = self.calculate_downstream_penalty(max(0, self.delay_hours - hours_saved))

        option_a_cost = bunker_extra + bog_with_accel['bog_cost_usd'] + demurrage_with_accel + downstream_with_accel
        option_a_baseline_cost = bog_baseline['bog_cost_usd'] + demurrage_baseline + downstream_penalty
        option_a_net_benefit = option_a_baseline_cost - option_a_cost

        option_a = VoyageScenario(
            label="Option A: Accelerate Vessel",
            description=f"Increase speed to {SPEED_FULL_KNOTS} knots. Save ~{hours_saved:.0f}h of delay.",
            total_cost=round(option_a_cost, 0),
            net_benefit_vs_baseline=round(option_a_net_benefit, 0),
            recommendation_score=88 if option_a_net_benefit > 50000 else 65,
            details={
                "bunker_extra_usd": bunker_extra,
                "bog_cost_usd": bog_with_accel['bog_cost_usd'],
                "demurrage_usd": round(demurrage_with_accel, 0),
                "downstream_penalty_usd": round(downstream_with_accel, 0),
                "hours_saved": round(hours_saved, 1),
                "residual_delay_hours": round(max(0, self.delay_hours - hours_saved), 1)
            },
            recommended_action=f"Increase to {SPEED_FULL_KNOTS}kn. Notify {self.destination} terminal of updated ETA."
        )

        # Option B: Maintain speed
        swap_volume_mt = max(0, (self.delay_hours / 24) * 2800)  # rough feedstock shortfall
        swap_premium_per_mt = 12  # $/MT premium for prompt physical
        swap_cost = swap_volume_mt * swap_premium_per_mt

        option_b_cost = bog_baseline['bog_cost_usd'] + demurrage_baseline + swap_cost
        option_b_net_benefit = 0  # this IS the baseline

        option_b = VoyageScenario(
            label="Option B: Maintain Current Speed",
            description=f"Accept delay. Source {swap_volume_mt:.0f} MT prompt ethane via swap to maintain plant.",
            total_cost=round(option_b_cost, 0),
            net_benefit_vs_baseline=0,
            recommendation_score=52,
            details={
                "demurrage_usd": round(demurrage_baseline, 0),
                "bog_cost_usd": round(bog_baseline['bog_cost_usd'], 0),
                "swap_volume_mt": round(swap_volume_mt, 0),
                "swap_cost_usd": round(swap_cost, 0),
                "plant_continuity": "Maintained via swap"
            },
            recommended_action=f"Source {swap_volume_mt:.0f} MT prompt ethane from Equinor or TotalEnergies spot market."
        )

        # Option C: Financial hedge
        financial_offset = min(option_a_net_benefit * 0.85, downstream_penalty * 0.9)
        option_c_cost = bog_baseline['bog_cost_usd'] + (financial_offset * 0.15)

        option_c = VoyageScenario(
            label="Option C: Financial Hedge",
            description="Execute ethane spread trade to offset voyage economics loss financially.",
            total_cost=round(option_c_cost, 0),
            net_benefit_vs_baseline=round(financial_offset, 0),
            recommendation_score=71,
            details={
                "spread_trade": "Buy prompt ethane CIF NWE / Sell M+1 forward",
                "estimated_offset_usd": round(financial_offset, 0),
                "execution_time_mins": 15,
                "bog_cost_usd": round(bog_baseline['bog_cost_usd'], 0),
                "residual_exposure_usd": round(option_b_cost - financial_offset, 0)
            },
            recommended_action="Execute via ICE OTC platform. Contact Marex for prompt ethane physical quote."
        )

        # Rank options
        options_ranked = sorted(
            [option_a, option_b, option_c],
            key=lambda x: x.recommendation_score,
            reverse=True
        )

        return {
            "vessel": self.vessel_name,
            "delay_hours": self.delay_hours,
            "cargo_volume_mt": self.cargo_volume_mt,
            "cargo_volume_bbl": round(self.cargo_volume_bbl, 0),
            "bog_if_no_action": bog_baseline,
            "demurrage_if_no_action": round(demurrage_baseline, 0),
            "downstream_risk": round(downstream_penalty, 0),
            "recommended_option": options_ranked[0].label,
            "options": {
                "A": {
                    "label": option_a.label,
                    "total_cost": option_a.total_cost,
                    "net_benefit": option_a.net_benefit_vs_baseline,
                    "score": option_a.recommendation_score,
                    "details": option_a.details,
                    "action": option_a.recommended_action
                },
                "B": {
                    "label": option_b.label,
                    "total_cost": option_b.total_cost,
                    "net_benefit": option_b.net_benefit_vs_baseline,
                    "score": option_b.recommendation_score,
                    "details": option_b.details,
                    "action": option_b.recommended_action
                },
                "C": {
                    "label": option_c.label,
                    "total_cost": option_c.total_cost,
                    "net_benefit": option_c.net_benefit_vs_baseline,
                    "score": option_c.recommendation_score,
                    "details": option_c.details,
                    "action": option_c.recommended_action
                }
            }
        }
