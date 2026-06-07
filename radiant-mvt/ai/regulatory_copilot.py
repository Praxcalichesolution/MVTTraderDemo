import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Regulatory Copilot for INEOS Trading & Shipping.
You provide active EMIR/REMIT compliance guidance — not general regulatory information.
You are given the specific trade details and the pre-identified compliance gaps.
Your job: state exactly what is missing, what the deadline is, and what the consequence of missing it is.
Be precise about regulation citations. This output may be used in regulatory correspondence."""


async def generate_regulatory_guidance(trade_data: dict, compliance_check: dict) -> AsyncGenerator[str, None]:
    """Generate active EMIR/REMIT compliance guidance for a specific trade"""

    missing_fields = compliance_check.get('missing_fields', [])
    warnings = compliance_check.get('warnings', [])
    deadlines = compliance_check.get('deadlines', {})
    regime = compliance_check.get('applicable_regime', 'EMIR/REMIT')

    missing_lines = []
    for f in missing_fields:
        deadline = deadlines.get(f.get('field', ''), 'T+1 business day')
        missing_lines.append(
            f"- {f.get('field', '')}: {f.get('description', '')} | "
            f"Required by: {f.get('regulation_ref', '')} | Deadline: {deadline}"
        )

    prompt = f"""Provide regulatory compliance guidance for this INEOS trade:

TRADE:
- Reference: {trade_data.get('trade_ref', 'Unknown')}
- Commodity: {trade_data.get('commodity', 'Crude')}
- Direction: {trade_data.get('direction', 'Buy')}
- Volume: {trade_data.get('volume', 0):,.0f} {trade_data.get('volume_unit', 'bbl')}
- Counterparty: {trade_data.get('counterparty', 'Unknown')}
- Venue: {trade_data.get('venue', 'OTC')}
- Trade date: {trade_data.get('trade_date', 'Unknown')}
- Status: {trade_data.get('status', 'Pending')}

APPLICABLE REGIME: {regime}
REPORTING STATUS: {compliance_check.get('reporting_status', 'Incomplete')}
OVERALL COMPLIANCE SCORE: {compliance_check.get('compliance_score', 0)}/100

MISSING REQUIRED FIELDS ({len(missing_fields)} gaps):
{chr(10).join(missing_lines) if missing_lines else 'None — all required fields present'}

WARNINGS ({len(warnings)}):
{chr(10).join(f"- {w}" for w in warnings) if warnings else 'None'}

Write the compliance guidance:
1. COMPLIANCE STATUS (one line — pass/fail/at-risk with overall score)
2. CRITICAL GAPS (fields that will cause a regulatory breach if not resolved — specific deadline and consequence)
3. WARNINGS (fields to review — not yet breaching but at risk)
4. ACTION CHECKLIST (numbered, time-ordered actions with responsible party)
5. REGULATORY REFERENCES (specific Article/RTS citations for each gap)
6. CONSEQUENCE OF NON-COMPLIANCE (specific fine range or reporting obligation under {regime})"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
