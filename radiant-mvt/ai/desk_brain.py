import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator
from sqlalchemy.orm import Session
from sqlalchemy import text

SYSTEM_PROMPT = """You are the Radiant-MVT Desk Brain — the institutional memory of the INEOS Trading & Shipping desk.
You have access to every trade decision, rationale, outcome, and lesson from the past 3 years.
Answer questions about historical desk decisions with the precision of a trader who was there.
Use specific dates, P&L numbers, and lessons. This is the knowledge that would have walked out the door."""


async def query_desk_brain(db: Session, query: str, current_setup: dict = None) -> AsyncGenerator[str, None]:
    """Query institutional memory"""

    q = query.lower()
    commodity_filter = ""
    if 'brent' in q or 'urals' in q or 'crude' in q:
        commodity_filter = "AND commodity IN ('Brent', 'Urals', 'WTI')"
    elif 'ethane' in q:
        commodity_filter = "AND commodity = 'Ethane'"

    decisions = db.execute(text(f"""
        SELECT decision_date, commodity, strategy_type, structure_description,
               pnl_realised, outcome, lessons_learned, failure_mode,
               entry_price, exit_price, hold_days, market_context
        FROM desk_decisions
        WHERE 1=1 {commodity_filter}
        ORDER BY ABS(pnl_realised) DESC
        LIMIT 10
    """)).fetchall()

    decisions_text = ""
    for d in decisions:
        decisions_text += f"\n{d[0]} | {d[1]} | {d[2]} | PnL: ${d[4]:,.0f} | {d[5]}"
        if d[6]:
            decisions_text += f" | Lesson: {d[6]}"
        if d[7]:
            decisions_text += f" | FAILED BECAUSE: {d[7]}"

    current_context = ""
    if current_setup:
        current_context = f"""
CURRENT SETUP (today):
- Commodity: {current_setup.get('commodity', 'Brent')}
- Current spread/price: {current_setup.get('market_level', 'Not specified')}
- Proposed structure: {current_setup.get('structure', query)}
"""

    prompt = f"""Trader question: "{query}"
{current_context}

HISTORICAL DESK DECISIONS (from Desk Brain database):
{decisions_text}

Answer based on this historical record. Be specific:
1. How many times has the desk done something similar?
2. What was the average outcome?
3. What were the failure modes?
4. What does history suggest about the current setup?
5. Most relevant single precedent with full detail

If current freight/market conditions are mentioned, compare them to the conditions in the failure cases."""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
