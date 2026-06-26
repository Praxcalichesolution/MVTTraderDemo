import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Voyage Economics AI for INEOS Trading & Shipping.
You narrate voyage routing decisions using pre-calculated economics from Python.
You present the 3-option decision clearly: the numbers, the tradeoffs, and the recommendation.
This is read by a senior trader who needs to make a routing decision in minutes.
Be direct. State the winner clearly. Quantify the tradeoffs exactly."""


async def narrate_voyage_decision(voyage_data: dict, options: list, recommendation: dict) -> AsyncGenerator[str, None]:
    """Narrate the 3-option voyage economics decision"""

    vessel = voyage_data.get('vessel', {})
    cargo = voyage_data.get('cargo', {})

    option_lines = []
    for i, opt in enumerate(options[:3], 1):
        option_lines.append(f"""
OPTION {i}: {opt.get('name', f'Route {i}')}
  Route: {opt.get('route_description', 'Not specified')}
  Distance: {opt.get('distance_nm', 0):,.0f} nm | Transit time: {opt.get('transit_days', 0):.1f} days
  Freight cost: ${opt.get('freight_cost', 0):,.0f} | Fuel cost: ${opt.get('fuel_cost', 0):,.0f}
  Total voyage cost: ${opt.get('total_cost', 0):,.0f}
  Net margin: ${opt.get('net_margin', 0):,.0f} | Margin/bbl: ${opt.get('margin_per_bbl', 0):.2f}
  Key risk: {opt.get('key_risk', 'None identified')}
  Canal/port availability: {opt.get('infrastructure_status', 'Available')}""")

    prompt = f"""Write a voyage economics decision narrative for INEOS Trading & Shipping:

VESSEL: {vessel.get('name', 'Unknown')} | {vessel.get('vessel_type', 'VLCC')} | {vessel.get('dwt', 0):,.0f} DWT
CARGO: {cargo.get('volume_mt', 0):,.0f} MT {cargo.get('commodity', 'Crude')}
LOADING PORT: {voyage_data.get('load_port', 'Unknown')} | Laycan: {voyage_data.get('laycan', 'Unknown')}
DISCHARGE PORT: {voyage_data.get('discharge_port', 'Unknown')}
MARKET RATE (BDTI): {voyage_data.get('bdti_ws', 'WS100')}
DECISION DEADLINE: {voyage_data.get('decision_deadline', 'COB today')}

THREE ROUTE OPTIONS (economics pre-calculated by Python):
{''.join(option_lines)}

RECOMMENDED OPTION: {recommendation.get('option_name', 'Option 1')}
Recommendation rationale (pre-calculated): {recommendation.get('rationale', '')}
Value vs next-best: ${recommendation.get('value_vs_alternative', 0):,.0f} better

Write:
1. SITUATION (one sentence — what decision is needed and why now)
2. OPTIONS COMPARED (brief comparison of the 3 routes — lead with the financial difference)
3. RECOMMENDATION (direct — which option, why, what it delivers)
4. KEY RISKS to the recommended option and mitigants
5. WHAT TO WATCH (2-3 factors that could change this recommendation before deadline)"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
