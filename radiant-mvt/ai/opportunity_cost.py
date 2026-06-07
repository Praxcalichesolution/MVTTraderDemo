import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Opportunity Cost Analyst for INEOS Trading & Shipping.
You narrate the 90-day opportunity audit — the closing moment of the demo that shows what was left on the table.
This is the most impactful section: concrete, specific, and honest about what better intelligence would have delivered.
Use the exact P&L numbers. Make the cost of inaction vivid but professional.
This output is used in board-level presentations."""


async def narrate_opportunity_audit(audit_data: dict) -> AsyncGenerator[str, None]:
    """Narrate the 90-day opportunity cost audit"""

    total_missed = audit_data.get('total_missed_pnl', 0)
    opportunities = audit_data.get('opportunities', [])
    period = audit_data.get('period', 'Last 90 days')
    current_tool_cost = audit_data.get('radiant_annual_cost', 120000)
    current_pnl = audit_data.get('actual_pnl', 0)

    opp_lines = []
    for o in opportunities[:5]:
        opp_lines.append(
            f"- {o.get('date', '')}: {o.get('opportunity', '')} | "
            f"Missed P&L: ${o.get('missed_pnl', 0):,.0f} | "
            f"Signal lag: {o.get('signal_lag_hours', 0):.1f}h | "
            f"Root cause: {o.get('root_cause', 'Late signal')}"
        )

    prompt = f"""Write the 90-day opportunity cost audit narrative for INEOS Trading & Shipping:

AUDIT PERIOD: {period}
ACTUAL P&L ACHIEVED: ${current_pnl:,.0f}
TOTAL MISSED OPPORTUNITY: ${total_missed:,.0f}
RADIANT-MVT ANNUAL COST: ${current_tool_cost:,.0f}
ROI IF OPPORTUNITIES CAPTURED: {(total_missed / current_tool_cost * 100):.0f}x annual cost

TOP MISSED OPPORTUNITIES (pre-identified by Python):
{chr(10).join(opp_lines) if opp_lines else '- Data not available'}

CATEGORIES OF LOSS:
- Late news reaction: ${audit_data.get('late_news_cost', 0):,.0f}
- Missed spread trades: ${audit_data.get('missed_spread_cost', 0):,.0f}
- Sub-optimal hedge timing: ${audit_data.get('hedge_timing_cost', 0):,.0f}
- Vessel route decisions: ${audit_data.get('vessel_cost', 0):,.0f}

Write the closing narrative in 5 sections:
1. THE HEADLINE NUMBER (the single most striking finding — one sentence)
2. WHERE THE MONEY WENT (category breakdown, plain English, specific)
3. THE PATTERN (what systemic issue caused most of this — information lag, decision speed, etc.)
4. THE MATH (what Radiant-MVT captures, specific $ and ROI vs cost)
5. THE CLOSING STATEMENT (2 sentences — the bottom line for a CFO or Head of Trading)

This is the final slide of the demo. Make it land."""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
