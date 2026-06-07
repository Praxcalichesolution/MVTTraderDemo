import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.client import ai_client
from typing import AsyncGenerator
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

SYSTEM_PROMPT = """You are the Radiant-MVT AI Copilot for INEOS Trading & Shipping.
You have access to the trader's live book data retrieved from the database.
Answer questions concisely and precisely. Use the data provided — do not invent numbers.
After every factual answer, cite your source in brackets: [Source: table_name, field, timestamp]
If data is not in the context, say so — do not guess.
You are talking to a senior commodity trader. Be direct. No disclaimers. No hedging language.
NEVER perform financial calculations yourself. Only report pre-calculated numbers from the database."""


async def answer_question(db: Session, question: str, user_id: int,
                          screen_context: str = "dashboard") -> AsyncGenerator[str, None]:
    """RAG over SQLite — retrieve relevant data then generate answer"""

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
    """Retrieve relevant DB context based on question"""
    q = question.lower()
    context_parts = []

    try:
        # Always include current positions and P&L
        positions = db.execute(text("""
            SELECT p.commodity, p.net_volume, p.volume_unit, p.mtm_pnl, p.mtm_price,
                   p.avg_price, p.delivery_month, p.region, b.name as book
            FROM positions p JOIN books b ON p.book_id = b.id
        """)).fetchall()

        if positions:
            context_parts.append("POSITIONS (as of now):")
            for p in positions:
                pnl_str = f"${p[3]:+,.0f}" if p[3] else "$0"
                context_parts.append(f"  {p[8]} | {p[0]} | Net: {p[1]:,.0f} {p[2]} | MTM P&L: {pnl_str} | MTM price: ${p[4]:.2f} | Delivery: {p[6]}")

        # Market data if price-related
        if any(w in q for w in ['brent', 'wti', 'price', 'market', 'crude', 'ethane', 'urals']):
            prices = db.execute(text("""
                SELECT commodity, price, change_1d, change_pct_1d, timestamp
                FROM market_data
                WHERE id IN (SELECT MAX(id) FROM market_data GROUP BY commodity)
                ORDER BY commodity
            """)).fetchall()
            if prices:
                context_parts.append("\nLIVE MARKET PRICES:")
                for p in prices:
                    ts = str(p[4])[:16] if p[4] else 'unknown'
                    context_parts.append(f"  {p[0]}: ${p[1]:.2f} | Change: {p[2]:+.2f} ({p[3]:+.1f}%) | As of: {ts}")

        # Trades if trade-related
        if any(w in q for w in ['trade', 'blotter', 'confirmation', 'vitol', 'trafigura', 'shell', 'bp', 'gunvor', 'position', 'booking']):
            trades = db.execute(text("""
                SELECT t.trade_ref, t.commodity, t.direction, t.volume, t.volume_unit,
                       t.price, t.delivery_start, t.status, c.name as counterparty, t.strategy_type
                FROM trades t
                LEFT JOIN counterparties c ON t.counterparty_id = c.id
                WHERE t.status IN ('Confirmed', 'Pending')
                ORDER BY t.created_at DESC LIMIT 10
            """)).fetchall()
            if trades:
                context_parts.append("\nRECENT TRADES (last 10 confirmed/pending):")
                for t in trades:
                    context_parts.append(f"  {t[0]} | {t[1]} | {t[2]} | {t[3]:,.0f} {t[4]} @ ${t[5]:.2f} | {t[6]} | {t[7]} | {t[8]}")

        # Vessels if vessel-related
        if any(w in q for w in ['vessel', 'ship', 'dragon', 'ineos', 'cargo', 'delivery', 'eta', 'delay', 'rafnes', 'grangemouth']):
            vessels = db.execute(text("""
                SELECT name, status, origin_port, destination_port, eta, delay_hours,
                       cargo_volume_mt, cargo_commodity
                FROM vessels ORDER BY eta
            """)).fetchall()
            if vessels:
                context_parts.append("\nDRAGON FLEET STATUS:")
                for v in vessels:
                    delay_str = f" (DELAYED {v[5]:.0f}h)" if v[5] and v[5] > 0 else ""
                    eta_str = str(v[4])[:16] if v[4] else 'unknown'
                    context_parts.append(f"  {v[0]} | {v[1]} | {v[2]} → {v[3]} | ETA: {eta_str}{delay_str} | Cargo: {v[6]} MT {v[7]}")

        # Exposure / VaR
        if any(w in q for w in ['exposure', 'var', 'risk', 'limit', 'margin']):
            context_parts.append("\nRISK METRICS (pre-calculated):")
            context_parts.append("  VaR 1-day (99%): $2.1M | VaR 10-day: $6.3M | Limit: $8.0M | Utilisation: 62%")

        # Performance
        if any(w in q for w in ['pnl', 'performance', 'target', 'ytd', 'month', 'quarter']):
            actuals = db.execute(text("""
                SELECT year, month, pnl FROM monthly_actuals
                WHERE year = 2026 ORDER BY month DESC LIMIT 6
            """)).fetchall()
            if actuals:
                context_parts.append("\nYTD PERFORMANCE 2026:")
                for a in actuals:
                    context_parts.append(f"  {a[0]}-M{a[1]:02d}: ${a[2]:,.0f}")
                context_parts.append("  Annual target: $36,000,000 | YTD: $18,400,000 | 82% of pro-rata target")

        # Counterparty
        if any(w in q for w in ['counterparty', 'credit', 'vitol', 'trafigura', 'shell', 'bp', 'gunvor']):
            cps = db.execute(text("""
                SELECT name, credit_limit, credit_used FROM counterparties ORDER BY credit_limit DESC LIMIT 5
            """)).fetchall()
            if cps:
                context_parts.append("\nCOUNTERPARTY CREDIT:")
                for cp in cps:
                    util = (cp[2] / cp[1] * 100) if cp[1] else 0
                    context_parts.append(f"  {cp[0]}: Limit ${cp[1]:,.0f} | Used ${cp[2]:,.0f} | {util:.0f}% utilised")

        # Alerts
        if any(w in q for w in ['alert', 'anomaly', 'breach', 'warning', 'flag']):
            alerts = db.execute(text("""
                SELECT severity, title, estimated_impact, created_at, status
                FROM alerts WHERE status = 'Open' ORDER BY created_at DESC LIMIT 5
            """)).fetchall()
            if alerts:
                context_parts.append("\nOPEN ALERTS:")
                for a in alerts:
                    context_parts.append(f"  [{a[0]}] {a[1]} | Impact: ${a[2]:,.0f} | {str(a[3])[:16]}")

    except Exception as e:
        context_parts.append(f"[Data retrieval partial: {str(e)[:100]}]")

    return "\n".join(context_parts) if context_parts else "No relevant data found for this query."
