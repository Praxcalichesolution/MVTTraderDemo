import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from typing import AsyncGenerator
from datetime import datetime

SYSTEM_PROMPT = """You are the Radiant-MVT AI for INEOS Trading & Shipping.
You write the morning Decision Queue — not a news summary.
Your job: tell the trader exactly what decisions need to be made today, ranked by financial impact and urgency.
Be direct. Be specific. Use actual numbers provided. No fluff. No pleasantries beyond one line.
Write in the voice of a brilliant senior analyst who has already done all the research.
Never say 'I think' or 'perhaps'. State facts and recommendations with confidence."""


async def generate_decision_queue(market_data: dict, positions: dict, vessels: list,
                                   news: list, alerts: list, trader_name: str = "Alex") -> AsyncGenerator[str, None]:
    """Generate the morning Decision Queue"""

    brent = market_data.get('Brent', {})
    urals_spread = market_data.get('Urals_spread', -4.80)

    vessel_status = []
    for v in vessels[:3]:
        status = f"{v.get('name','')}: {v.get('status','')} → {v.get('destination_port','')}, ETA {v.get('eta','')[:10] if v.get('eta') else 'unknown'}"
        if v.get('delay_hours', 0) > 0:
            status += f" (DELAYED {v['delay_hours']:.0f}h)"
        vessel_status.append(status)

    top_news = [n.get('headline', '') for n in news[:3] if n.get('headline')]
    active_alerts = [a for a in alerts if a.get('status') == 'Open']

    prompt = f"""Generate the morning Decision Queue for {trader_name} at INEOS Trading & Shipping.
Date: {datetime.now().strftime('%A, %d %B %Y')}, {datetime.now().strftime('%H:%M')} London

MARKET DATA (overnight):
- Brent: ${brent.get('price', 82.40):.2f}/bbl | Change: {brent.get('change_1d', -1.20):+.2f} ({brent.get('change_pct_1d', -1.4):+.1f}%)
- Urals/Brent spread: {urals_spread:.2f} $/bbl
- EUA Carbon: €{market_data.get('EUA', {}).get('price', 63.20):.2f}/tonne
- EUR/USD: {market_data.get('EURUSD', {}).get('price', 1.084):.4f}

BOOK STATUS:
- Crude book: Net long {positions.get('crude_net', 120000):,} bbl | Today's MTM: {positions.get('crude_pnl', '+$1.24M')}
- Ethane book: {positions.get('ethane_net', 85000):,} MT long | Today's MTM: {positions.get('ethane_pnl', '-$320K')}
- VaR utilisation: {positions.get('var_util', 62)}% of $8M limit

DRAGON FLEET:
{chr(10).join(vessel_status) if vessel_status else 'All vessels nominal'}

OVERNIGHT NEWS:
{chr(10).join(f'- {h}' for h in top_news) if top_news else '- No significant market-moving news overnight'}

OPEN ALERTS: {len(active_alerts)} requiring attention

Generate 3-4 decisions in this exact format:
DECISION [N] | [URGENCY: CRITICAL/HIGH/MEDIUM] | Deadline: [TIME]
[One-line description of the decision]
Financial impact: [specific $ amount]
Why now: [one sentence with the market reason]
Recommended action: [specific action]

Start with the highest-impact decision. Be specific about amounts and times."""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
