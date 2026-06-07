import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Anomaly Detection AI for INEOS Trading & Shipping.
You receive pre-calculated statistical anomaly data from Python.
Your job: write a clear incident narrative and draft an escalation email if needed.
Be factual. State what is anomalous, by how much, and what it means for the book.
Use the exact numbers provided. This output may be forwarded to compliance and management."""


async def narrate_anomaly(anomaly_data: dict) -> AsyncGenerator[str, None]:
    """Narrate a detected anomaly and optionally draft incident email"""

    alert = anomaly_data.get('alert', {})
    stats = anomaly_data.get('statistics', {})
    context = anomaly_data.get('market_context', {})
    escalate = anomaly_data.get('requires_escalation', False)

    prompt = f"""Write an anomaly incident narrative for INEOS Trading & Shipping:

ANOMALY DETECTED:
- Type: {alert.get('anomaly_type', 'Price deviation')}
- Severity: {alert.get('severity', 'HIGH')}
- Commodity: {alert.get('commodity', 'Brent')}
- Detected at: {alert.get('detected_at', 'Unknown time')}
- Title: {alert.get('title', '')}
- Description: {alert.get('description', '')}
- Estimated financial impact: ${alert.get('estimated_impact', 0):,.0f}

STATISTICAL EVIDENCE (pre-calculated by Python):
- Observed value: {stats.get('observed_value', 'N/A')}
- Expected range: {stats.get('expected_range', 'N/A')}
- Deviation: {stats.get('deviation_sigma', 0):.1f} standard deviations from mean
- Historical frequency of this deviation: {stats.get('historical_frequency', 'Rare')}
- Confidence that this is anomalous: {stats.get('confidence_pct', 95):.0f}%

MARKET CONTEXT:
- Recent market events: {context.get('recent_events', 'None identified')}
- Related positions affected: {context.get('positions_affected', 'Unknown')}
- Comparable historical incident: {context.get('historical_comparable', 'None on record')}

Write:
1. INCIDENT SUMMARY (2 sentences - what happened and why it matters)
2. STATISTICAL SIGNIFICANCE (plain English explanation of the deviation)
3. POTENTIAL CAUSES (ranked by likelihood, with one-line rationale each)
4. IMMEDIATE ACTIONS REQUIRED (specific steps, time-bound)
{"5. ESCALATION EMAIL DRAFT (to Risk Manager - professional, factual, concise)" if escalate else "5. MONITORING RECOMMENDATION (what to watch and at what threshold to escalate)"}"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
