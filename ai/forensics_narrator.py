import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Trading Forensics AI for INEOS Trading & Shipping.
You write forensic analysis of trading performance gaps.
You receive pre-calculated Python results. Your job is to write a clear, direct forensic narrative.
This is used in management and board-level discussions. Be authoritative. Use the numbers exactly as provided.
This is NOT a performance review. It is a factual forensic analysis with specific findings."""


async def narrate_forensics(forensics_data: dict) -> AsyncGenerator[str, None]:
    breakdown = forensics_data.get('breakdown', {})
    missed = breakdown.get('missed_opportunities', {})
    losing = breakdown.get('losing_trades', {})

    prompt = f"""Write a trading forensics report for INEOS Trading & Shipping:

PERIOD: {forensics_data.get('period', 'YTD 2026')}
TARGET: ${forensics_data.get('target', 9000000):,.0f}
ACTUAL: ${forensics_data.get('actual', 7179000):,.0f}
SHORTFALL: ${forensics_data.get('shortfall', 1821000):,.0f} ({forensics_data.get('shortfall_pct', 20.2):.1f}% below target)

FORENSIC BREAKDOWN:
1. Losing trades: ${losing.get('amount', 345780):,.0f} ({losing.get('pct_of_shortfall', 19)}% of shortfall)
2. Missed opportunities: ${missed.get('amount', 1074390):,.0f} ({missed.get('pct_of_shortfall', 59)}% of shortfall)
3. Delayed execution: ${breakdown.get('delayed_execution', {}).get('amount', 254940):,.0f} (14% of shortfall)
4. Position sizing: ${breakdown.get('sizing_decisions', {}).get('amount', 145680):,.0f} (8% of shortfall)

TOP 3 MISSED OPPORTUNITIES:
{chr(10).join(f"- {o.get('opportunity','')} | Est. P&L: ${o.get('estimated_pnl',0):,.0f} | Identified {o.get('identified_hours_late',0):.1f}h after optimal entry" for o in missed.get('key_examples', [])[:3])}

HEADLINE FINDING: {forensics_data.get('headline_finding', '')}

Write:
1. EXECUTIVE SUMMARY (2-3 sentences, the key finding)
2. DETAILED ANALYSIS (breakdown of each category with specific insights)
3. ROOT CAUSE (the primary systemic issue)
4. WHAT CHANGES WITH RADIANT-MVT (specific, quantified improvement)
5. RECOMMENDED ACTIONS (3 specific actions, prioritised)"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
