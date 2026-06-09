import os
import sys
from typing import AsyncGenerator

from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from database.models import DeskDecision

SYSTEM_PROMPT = """You are the Radiant-MVT Desk Brain - the institutional memory of the INEOS Trading & Shipping desk.
You have access to every trade decision, rationale, outcome, and lesson from the past 3 years.
Answer questions about historical desk decisions with the precision of a trader who was there.
Use specific dates, P&L numbers, and lessons. This is the knowledge that would have walked out the door."""


async def query_desk_brain(
    db: Session,
    query: str,
    current_setup: dict = None,
) -> AsyncGenerator[str, None]:
    """Query institutional memory."""
    q = query.lower()

    decisions_query = db.query(DeskDecision)
    if "brent" in q or "urals" in q or "crude" in q:
        decisions_query = decisions_query.filter(DeskDecision.commodity.in_(["Brent", "Urals", "WTI"]))
    elif "ethane" in q:
        decisions_query = decisions_query.filter(DeskDecision.commodity == "Ethane")

    decisions = (
        decisions_query
        .order_by(func.abs(DeskDecision.pnl_realised).desc())
        .limit(10)
        .all()
    )

    decisions_text = ""
    for decision in decisions:
        decisions_text += (
            f"\n{decision.decision_date} | {decision.commodity} | {decision.strategy_type} | "
            f"PnL: ${decision.pnl_realised or 0:,.0f} | {decision.outcome}"
        )
        if decision.lessons_learned:
            decisions_text += f" | Lesson: {decision.lessons_learned}"
        if decision.failure_mode:
            decisions_text += f" | FAILED BECAUSE: {decision.failure_mode}"

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
