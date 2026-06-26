import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Hedge Advisor for INEOS Trading & Shipping.
You receive pre-calculated hedge analysis from Python (all math is done).
Your job: write the recommendation narrative in plain English a senior trader would respect.
Be specific. Use the numbers provided. Explain the WHY clearly.
Show the factor attribution — what's driving the recommendation score.
Offer 2 alternatives clearly. State the recommendation confidently."""


async def generate_hedge_recommendation(position: dict, market_data: dict,
                                        factors: dict, curve_data: dict) -> AsyncGenerator[str, None]:

    score = factors.get('recommendation_score', 74)
    factors_for = factors.get('factors_for_hedging', {})
    factors_against = factors.get('factors_against_hedging', {})

    prompt = f"""Write a hedge recommendation for this INEOS position:

POSITION:
- Commodity: {position.get('commodity', 'Brent')}
- Net volume: {position.get('net_volume', 600000):,} {position.get('volume_unit', 'bbl')}
- Average entry: ${position.get('avg_price', 81.20):.2f}/bbl
- Current MTM: ${position.get('mtm_price', 82.40):.2f}/bbl
- Delivery: {position.get('delivery_month', 'Jun-26')} | {position.get('delivery_location', 'CIF Rotterdam')}
- Hedge ratio currently: {position.get('hedge_ratio', 0):.0%}

MARKET CONTEXT:
- Brent prompt: ${market_data.get('brent_price', 82.40):.2f}/bbl
- Basis (Dated vs ICE): ${market_data.get('basis', 0.18):+.2f}/bbl
- 90-day basis volatility: {market_data.get('basis_vol_pct', 2.1):.1f}%
- Margin utilisation: {market_data.get('margin_util', 62)}% of limit
- OPEC+ meeting: {market_data.get('opec_days', 2)} days away

FACTOR ATTRIBUTION (pre-calculated by Python):
Recommendation score: {score}/100
Factors FOR hedging:
{chr(10).join(f'  + {k}: {v}%' for k, v in factors_for.items())}
Factors AGAINST:
{chr(10).join(f'  - {k}: {v}%' for k, v in factors_against.items())}

FORWARD CURVE:
{chr(10).join(f'  {t}: ${p:.2f}' for t, p in curve_data.items())}

Write:
1. RECOMMENDATION (2 sentences max, direct)
2. WHY — factor breakdown in plain English
3. OPTION A (primary recommendation): specific instrument, volume, price
4. OPTION B: alternative approach with tradeoff
5. OPTION C: no hedge — state the risk explicitly
6. EVIDENCE LEVEL and DATA QUALITY statement"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
