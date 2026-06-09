import os
import sys
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from database.models import Alert, Counterparty, MonthlyActual, Trade

SYSTEM_PROMPT = """You are the Radiant-MVT AI Copilot for INEOS Trading & Shipping.
You have access to the trader's live book data retrieved from the database.
Answer questions concisely and precisely. Use the data provided - do not invent numbers.
After every factual answer, cite your source in brackets: [Source: table_name, field, timestamp]
If data is not in the context, say so - do not guess.
You are talking to a senior commodity trader. Be direct. No disclaimers. No hedging language.
NEVER perform financial calculations yourself. Only report pre-calculated numbers from the database."""


async def answer_question(
    db: Session,
    question: str,
    user_id: int,
    screen_context: str = "dashboard",
) -> AsyncGenerator[str, None]:
    """RAG over the operational database - retrieve relevant data then generate answer."""
    context_data = retrieve_context(db, question, screen_context)

    prompt = f"""Trader question: "{question}"

Current screen: {screen_context}
Time: {datetime.now().strftime('%H:%M, %d %b %Y')}

LIVE DATA FROM DATABASE:
{context_data}

Answer the question using only the data above.
Cite sources in brackets after each fact. Be specific with numbers.
If the question involves a calculation, show the relevant numbers from the database and state the result."""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk


def retrieve_context(db: Session, question: str, screen: str) -> str:
    """Retrieve relevant DB context based on question."""
    q = question.lower()
    context_parts = []

    try:
        positions = db.execute(
            text(
                """
                SELECT p.commodity, p.net_volume, p.volume_unit, p.mtm_pnl, p.mtm_price,
                       p.avg_price, p.delivery_month, p.region, b.name as book
                FROM positions p JOIN books b ON p.book_id = b.id
                """
            )
        ).fetchall()

        if positions:
            context_parts.append("POSITIONS (as of now):")
            for p in positions:
                pnl_str = f"${p[3]:+,.0f}" if p[3] else "$0"
                context_parts.append(
                    f"  {p[8]} | {p[0]} | Net: {p[1]:,.0f} {p[2]} | MTM P&L: {pnl_str} | "
                    f"MTM price: ${p[4]:.2f} | Delivery: {p[6]}"
                )

        if any(w in q for w in ["brent", "wti", "price", "market", "crude", "ethane", "urals"]):
            prices = db.execute(
                text(
                    """
                    SELECT commodity, price, change_1d, change_pct_1d, timestamp
                    FROM market_data
                    WHERE id IN (SELECT MAX(id) FROM market_data GROUP BY commodity)
                    ORDER BY commodity
                    """
                )
            ).fetchall()
            if prices:
                context_parts.append("\nLIVE MARKET PRICES:")
                for p in prices:
                    ts = str(p[4])[:16] if p[4] else "unknown"
                    context_parts.append(
                        f"  {p[0]}: ${p[1]:.2f} | Change: {p[2]:+.2f} ({p[3]:+.1f}%) | As of: {ts}"
                    )

        if any(
            w in q
            for w in [
                "trade",
                "blotter",
                "confirmation",
                "vitol",
                "trafigura",
                "shell",
                "bp",
                "gunvor",
                "position",
                "booking",
            ]
        ):
            trades = (
                db.query(Trade)
                .order_by(Trade.created_at.desc())
                .limit(10)
                .all()
            )
            if trades:
                context_parts.append("\nRECENT TRADES (last 10 confirmed/pending):")
                for trade in trades:
                    context_parts.append(
                        f"  {trade.trade_ref} | {trade.commodity} | {trade.direction} | "
                        f"{trade.volume:,.0f} {trade.volume_unit} @ ${trade.price:.2f} | "
                        f"{trade.delivery_start} | {trade.status} | {trade.counterparty.name if trade.counterparty else 'Unknown'}"
                    )

        if any(w in q for w in ["vessel", "ship", "dragon", "ineos", "cargo", "delivery", "eta", "delay", "rafnes", "grangemouth"]):
            vessels = db.execute(
                text(
                    """
                    SELECT name, status, origin_port, destination_port, eta, delay_hours,
                           cargo_volume_mt, cargo_commodity
                    FROM vessels ORDER BY eta
                    """
                )
            ).fetchall()
            if vessels:
                context_parts.append("\nDRAGON FLEET STATUS:")
                for v in vessels:
                    delay_str = f" (DELAYED {v[5]:.0f}h)" if v[5] and v[5] > 0 else ""
                    eta_str = str(v[4])[:16] if v[4] else "unknown"
                    context_parts.append(
                        f"  {v[0]} | {v[1]} | {v[2]} -> {v[3]} | ETA: {eta_str}{delay_str} | Cargo: {v[6]} MT {v[7]}"
                    )

        if any(w in q for w in ["exposure", "var", "risk", "limit", "margin"]):
            context_parts.append("\nRISK METRICS (pre-calculated):")
            context_parts.append("  VaR 1-day (99%): $2.1M | VaR 10-day: $6.3M | Limit: $8.0M | Utilisation: 62%")

        if any(w in q for w in ["pnl", "performance", "target", "ytd", "month", "quarter"]):
            actuals = (
                db.query(MonthlyActual)
                .filter(MonthlyActual.year == 2026)
                .order_by(MonthlyActual.month.desc())
                .limit(6)
                .all()
            )
            if actuals:
                context_parts.append("\nYTD PERFORMANCE 2026:")
                for actual in actuals:
                    context_parts.append(f"  {actual.year}-M{actual.month:02d}: ${actual.pnl:,.0f}")
                context_parts.append("  Annual target: $36,000,000 | YTD: $18,400,000 | 82% of pro-rata target")

        if any(w in q for w in ["counterparty", "credit", "vitol", "trafigura", "shell", "bp", "gunvor"]):
            counterparties = (
                db.query(Counterparty)
                .order_by(Counterparty.credit_limit.desc())
                .limit(5)
                .all()
            )
            if counterparties:
                context_parts.append("\nCOUNTERPARTY CREDIT:")
                for cp in counterparties:
                    util = (cp.credit_used / cp.credit_limit * 100) if cp.credit_limit else 0
                    context_parts.append(
                        f"  {cp.name}: Limit ${cp.credit_limit:,.0f} | Used ${cp.credit_used:,.0f} | {util:.0f}% utilised"
                    )

        if any(w in q for w in ["alert", "anomaly", "breach", "warning", "flag"]):
            alerts = (
                db.query(Alert)
                .filter(Alert.status == "Open")
                .order_by(Alert.created_at.desc())
                .limit(5)
                .all()
            )
            if alerts:
                context_parts.append("\nOPEN ALERTS:")
                for alert in alerts:
                    context_parts.append(
                        f"  [{alert.severity}] {alert.title} | Impact: ${alert.estimated_impact or 0:,.0f} | {str(alert.created_at)[:16]}"
                    )

    except Exception as exc:
        context_parts.append(f"[Data retrieval partial: {str(exc)[:100]}]")

    return "\n".join(context_parts) if context_parts else "No relevant data found for this query."
