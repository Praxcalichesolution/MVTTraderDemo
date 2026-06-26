import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.client import ai_client
from typing import AsyncGenerator

SYSTEM_PROMPT = """You are the Radiant-MVT Executive Intelligence AI for INEOS Trading & Shipping.
You write board-level and executive management summaries of trading performance.
Your audience: CFO, Head of Trading, Board Risk Committee.
Use precise language. No jargon that a CFO would not know. No trader slang.
Every claim must reference a specific number from the data provided.
Compare to top-quartile industry benchmarks where provided. Be factual and authoritative."""


async def generate_executive_summary(performance_data: dict, benchmarks: dict,
                                     period: str = "Q1 2026") -> AsyncGenerator[str, None]:
    """Generate executive summary and top-quartile comparison narrative"""

    pnl = performance_data.get('pnl', 0)
    target = performance_data.get('target', 0)
    vs_target_pct = performance_data.get('vs_target_pct', 0)
    sharpe = performance_data.get('sharpe_ratio', 0)
    win_rate = performance_data.get('win_rate', 0)
    var_util = performance_data.get('var_utilisation', 0)
    best_trade = performance_data.get('best_trade', {})
    worst_trade = performance_data.get('worst_trade', {})

    tq_sharpe = benchmarks.get('top_quartile_sharpe', 1.8)
    tq_win_rate = benchmarks.get('top_quartile_win_rate', 0.62)
    tq_return_on_var = benchmarks.get('top_quartile_return_on_var', 3.2)
    median_sharpe = benchmarks.get('median_sharpe', 1.1)

    prompt = f"""Write an executive performance summary for INEOS Trading & Shipping:

PERIOD: {period}
FINANCIAL PERFORMANCE:
- Realised P&L: ${pnl:,.0f}
- Target: ${target:,.0f}
- vs Target: {vs_target_pct:+.1f}%
- Return on capital deployed: {performance_data.get('return_on_capital', 0):.1f}%

RISK-ADJUSTED METRICS (pre-calculated by Python):
- Sharpe Ratio: {sharpe:.2f}
- Win Rate: {win_rate:.1%}
- VaR Utilisation: {var_util:.0f}% of ${performance_data.get('var_limit', 8000000):,.0f} limit
- Return on VaR: {performance_data.get('return_on_var', 0):.1f}x
- Maximum drawdown: ${performance_data.get('max_drawdown', 0):,.0f}

TOP-QUARTILE BENCHMARKS (industry):
- Sharpe Ratio: {tq_sharpe:.1f} (top quartile) | {median_sharpe:.1f} (median) | INEOS: {sharpe:.2f}
- Win Rate: {tq_win_rate:.0%} (top quartile) | INEOS: {win_rate:.0%}
- Return on VaR: {tq_return_on_var:.1f}x (top quartile) | INEOS: {performance_data.get('return_on_var', 0):.1f}x

NOTABLE TRADES:
- Best trade: {best_trade.get('description', 'N/A')} | P&L: ${best_trade.get('pnl', 0):,.0f}
- Worst trade: {worst_trade.get('description', 'N/A')} | P&L: ${worst_trade.get('pnl', 0):,.0f}

BOOK COMPOSITION:
{chr(10).join(f"- {b.get('name','')}: ${b.get('pnl',0):,.0f} ({b.get('pct_of_total',0):.0f}% of total)" for b in performance_data.get('books', []))}

Write the executive summary:
1. PERFORMANCE HEADLINE (one sentence for the board packet cover)
2. FINANCIAL SUMMARY (P&L vs target, key drivers — 3 sentences max)
3. RISK-ADJUSTED ASSESSMENT (how efficiently was risk capital deployed)
4. BENCHMARKING (where INEOS sits vs top-quartile peers — be specific about gaps and leads)
5. KEY RISK EVENTS NAVIGATED (what went well)
6. AREAS FOR IMPROVEMENT (what the data shows needs attention — 2 specific points)
7. OUTLOOK (2 sentences on positioning for next period)"""

    async for chunk in ai_client.generate(SYSTEM_PROMPT, prompt):
        yield chunk
