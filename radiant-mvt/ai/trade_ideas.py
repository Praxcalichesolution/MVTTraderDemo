import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Trade Intelligence engine for INEOS Trading & Shipping.
You identify actionable trade opportunities from news and market data.
Be specific: name the trade structure, the entry, the expected P&L, the risk.
This is NOT a news summary. It is a trade idea with a rationale a professional trader would respect.
Every idea must have: structure, entry price/level, expected P&L, key risk, confidence level."""


async def generate_trade_idea(news_item: dict, positions: dict, market_data: dict,
                               historical_precedents: list) -> AsyncGenerator[str, None]:

    precedents_text = ""
    for p in historical_precedents[:3]:
        precedents_text += f"- {p.get('date')}: similar setup → P&L {p.get('pnl', 0):+,.0f} in {p.get('hold_days', 0)} days\n"

    prompt = f"""Generate a trade idea from this market event:

NEWS TRIGGER:
Headline: {news_item.get('headline', '')}
Published: {news_item.get('published_at', '')} ({news_item.get('mins_ago', 22)} minutes ago)
Commodities affected: {news_item.get('commodities_tagged', 'Brent, Urals')}
Market impact assessment: {news_item.get('market_impact', 'Bearish Urals')}

CURRENT MARKET (pre-calculated):
- Brent/Urals spread: ${market_data.get('urals_spread', -6.20):.2f}/bbl (90d mean: ${market_data.get('urals_spread_mean', -4.15):.2f})
- Spread is {market_data.get('spread_sigma', 2.3):.1f} standard deviations from mean
- Brent prompt: ${market_data.get('brent', 82.40):.2f}/bbl
- Freight (BDTI): {market_data.get('bdti', 'Stable')}

CURRENT BOOK EXPOSURE:
- Urals long: {positions.get('urals_long', 80000):,} bbl
- Brent short hedge: {positions.get('brent_short', 0):,} bbl

HISTORICAL PRECEDENTS (similar setups):
{precedents_text if precedents_text else 'No close historical matches found'}

Write the trade idea:
OPPORTUNITY: [one-line title]
SETUP: [what the market is doing and why]
TRADE STRUCTURE: [exact trade — buy X, sell Y, volumes, venue]
ENTRY: [specific price or spread level]
TARGET: [exit level and expected timeframe]
EXPECTED P&L: [specific $ amount at target]
KEY RISK: [the one thing that kills this trade]
CONFIDENCE: [High/Medium/Low with one-line justification]"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
