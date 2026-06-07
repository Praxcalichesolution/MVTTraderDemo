"""
Market Intelligence Agent for commodity outlook analysis.
"""
import json
import logging
import os
import time
from datetime import datetime
from typing import Iterable

import anthropic
import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from database.db import SessionLocal

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_COMMODITIES = ["Brent", "WTI", "Urals", "Ethane", "HH", "EUA", "EURUSD", "GBPUSD"]
AGENT_NAME = "market_intelligence"
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def _json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=True)


def _json_loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return round(((current - previous) / previous) * 100, 4)


def _simulated_trend(change_24h: float | None, multiplier: float) -> float:
    base = float(change_24h or 0)
    return round(max(min(base * multiplier, 12.0), -12.0), 4)


def _normalise_analysis(raw: dict) -> dict:
    outlook = str(raw.get("outlook", "Neutral")).strip().title()
    if outlook not in {"Bullish", "Bearish", "Neutral"}:
        outlook = "Neutral"
    try:
        score = max(0, min(100, float(raw.get("score", raw.get("outlook_score", 50)))))
    except Exception:
        score = 50
    drivers = raw.get("key_drivers") if isinstance(raw.get("key_drivers"), list) else []
    risks = raw.get("key_risks") if isinstance(raw.get("key_risks"), list) else []
    return {
        "outlook": outlook,
        "score": score,
        "key_drivers": [str(item)[:500] for item in drivers[:3]],
        "key_risks": [str(item)[:500] for item in risks[:2]],
        "opportunity_flag": bool(raw.get("opportunity_flag", False)),
        "opportunity_description": raw.get("opportunity_description"),
    }


def _partial_analysis(error: str, change_24h: float | None) -> dict:
    return {
        "outlook": "Neutral",
        "score": 50,
        "key_drivers": ["Latest market price and news were processed without Claude narration."],
        "key_risks": [f"Claude analysis unavailable: {error[:220]}"],
        "opportunity_flag": bool(change_24h is not None and abs(change_24h) >= 2.0),
        "opportunity_description": None,
    }


def _build_prompt(commodity: str, price: float | None, change_24h: float | None,
                  trend_5d: float, trend_30d: float, news_items: list[dict]) -> str:
    news_text = "\n".join(
        f"- {item.get('headline', '')} ({item.get('source') or 'Unknown'}): {item.get('summary') or ''}"
        for item in news_items
    ) or "- No recent tagged news found."
    return f"""You are a commodity market analyst. Analyse this data and return ONLY a JSON object.
Commodity: {commodity}
Current price: {price} (24h change: {change_24h}%)
5-day trend: {trend_5d}%
30-day trend: {trend_30d}%
Recent news headlines:
{news_text}

Return JSON: {{"outlook": "Bullish|Bearish|Neutral", "score": 0-100, "key_drivers": ["...", "...", "..."], "key_risks": ["...", "..."], "opportunity_flag": true/false, "opportunity_description": "string or null"}}"""


def _call_claude(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-placeholder") or api_key == "your_key_here":
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    http_client = httpx.Client(verify=False, timeout=20.0, trust_env=False)
    client = anthropic.Anthropic(api_key=api_key, http_client=http_client)
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=900,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = response.content[0].text.strip() if response.content else "{}"
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            start = response_text.find("{")
            end = response_text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(response_text[start:end + 1])
            raise
    finally:
        try:
            client.close()
        except Exception:
            http_client.close()


def _active_commodities(db, commodities: Iterable[str] | None = None) -> list[str]:
    if commodities:
        return list(dict.fromkeys(c.strip() for c in commodities if c and c.strip()))
    rows = db.execute(text("""
        SELECT DISTINCT commodity
        FROM market_watchlist
        WHERE is_active = 1
        ORDER BY display_order ASC, commodity ASC
    """)).fetchall()
    watchlist = [row.commodity for row in rows]
    return watchlist or DEFAULT_COMMODITIES


def _latest_price(db, commodity: str):
    return db.execute(text("""
        SELECT price, change_pct_1d, timestamp
        FROM market_data
        WHERE commodity = :commodity
        ORDER BY timestamp DESC
        LIMIT 1
    """), {"commodity": commodity}).fetchone()


def _historical_price(db, commodity: str, days: int):
    return db.execute(text(f"""
        SELECT price, timestamp
        FROM market_data
        WHERE commodity = :commodity
          AND timestamp <= datetime('now', '-{days} days')
        ORDER BY timestamp DESC
        LIMIT 1
    """), {"commodity": commodity}).fetchone()


def _recent_price_at_offset(db, commodity: str, offset: int):
    return db.execute(text("""
        SELECT price, timestamp
        FROM market_data
        WHERE commodity = :commodity
        ORDER BY timestamp DESC
        LIMIT 1 OFFSET :offset
    """), {"commodity": commodity, "offset": offset}).fetchone()


def _latest_news(db, commodity: str) -> list[dict]:
    rows = db.execute(text("""
        SELECT headline, source, published_at, summary, market_impact, relevance_score
        FROM news
        WHERE commodities_tagged LIKE :tag
        ORDER BY published_at DESC, ingested_at DESC
        LIMIT 5
    """), {"tag": f"%{commodity}%"}).fetchall()
    return [
        {
            "headline": row.headline,
            "source": row.source,
            "published_at": row.published_at,
            "summary": row.summary,
            "market_impact": row.market_impact,
            "relevance_score": row.relevance_score,
        }
        for row in rows
    ]


def _insert_analysis(db, commodity: str, analysis: dict, price: float | None,
                     change_24h: float | None, trend_5d: float, trend_30d: float,
                     news_items: list[dict], run_id: int):
    db.execute(text("""
        INSERT INTO market_intelligence (
            commodity, analysis_datetime, outlook, outlook_score, key_drivers,
            key_risks, price_at_analysis, change_24h, trend_5d, trend_30d,
            news_count_analysed, top_news, opportunity_flag,
            opportunity_description, agent_run_id, created_at
        ) VALUES (
            :commodity, :analysis_datetime, :outlook, :outlook_score, :key_drivers,
            :key_risks, :price_at_analysis, :change_24h, :trend_5d, :trend_30d,
            :news_count_analysed, :top_news, :opportunity_flag,
            :opportunity_description, :agent_run_id, :created_at
        )
    """), {
        "commodity": commodity,
        "analysis_datetime": datetime.utcnow().isoformat(),
        "outlook": analysis["outlook"],
        "outlook_score": analysis["score"],
        "key_drivers": _json_dumps(analysis["key_drivers"]),
        "key_risks": _json_dumps(analysis["key_risks"]),
        "price_at_analysis": price,
        "change_24h": change_24h,
        "trend_5d": trend_5d,
        "trend_30d": trend_30d,
        "news_count_analysed": len(news_items),
        "top_news": _json_dumps(news_items),
        "opportunity_flag": 1 if analysis["opportunity_flag"] else 0,
        "opportunity_description": analysis.get("opportunity_description"),
        "agent_run_id": run_id,
        "created_at": datetime.utcnow().isoformat(),
    })


async def run_market_intelligence_agent(commodities: Iterable[str] | None = None):
    """
    Analyse active watchlist commodities with market data, tagged news, and Claude narration.
    """
    started = time.perf_counter()
    db = SessionLocal()
    run_id = None
    notes: list[str] = []
    commodities_analysed = 0
    news_items_read = 0
    analyses_produced = 0
    opportunities_found = 0
    status = "success"

    try:
        run_result = db.execute(text("""
            INSERT INTO agent_runs (
                run_datetime, agent_name, commodities_analysed, duration_seconds,
                news_items_read, analyses_produced, opportunities_found, status, notes
            ) VALUES (
                :run_datetime, :agent_name, 0, 0, 0, 0, 0, 'running', NULL
            )
        """), {"run_datetime": datetime.utcnow().isoformat(), "agent_name": AGENT_NAME})
        run_id = run_result.lastrowid
        db.commit()

        for commodity in _active_commodities(db, commodities):
            try:
                latest = _latest_price(db, commodity)
                if latest is None:
                    notes.append(f"{commodity}: no market_data price available")
                    analysis = _partial_analysis("no latest market price available", None)
                    _insert_analysis(db, commodity, analysis, None, None, 0.0, 0.0, [], run_id)
                    analyses_produced += 1
                    continue

                price = float(latest.price)
                change_24h = latest.change_pct_1d
                change_24h = round(float(change_24h), 4) if change_24h is not None else None

                price_5 = _recent_price_at_offset(db, commodity, 5)
                price_30 = _historical_price(db, commodity, 30) or _recent_price_at_offset(db, commodity, 30)
                trend_5d = _pct_change(price, float(price_5.price)) if price_5 else None
                trend_30d = _pct_change(price, float(price_30.price)) if price_30 else None
                trend_5d = trend_5d if trend_5d is not None else _simulated_trend(change_24h, 3.0)
                trend_30d = trend_30d if trend_30d is not None else _simulated_trend(change_24h, 8.0)

                news_items = _latest_news(db, commodity)
                news_items_read += len(news_items)
                prompt = _build_prompt(commodity, price, change_24h, trend_5d, trend_30d, news_items)

                try:
                    raw_analysis = _call_claude(prompt)
                    analysis = _normalise_analysis(raw_analysis)
                except Exception as exc:
                    status = "partial"
                    notes.append(f"{commodity}: Claude failed: {str(exc)[:220]}")
                    analysis = _partial_analysis(str(exc), change_24h)

                _insert_analysis(db, commodity, analysis, price, change_24h, trend_5d, trend_30d, news_items, run_id)
                commodities_analysed += 1
                analyses_produced += 1
                if analysis["opportunity_flag"]:
                    opportunities_found += 1
                db.commit()
            except Exception as exc:
                db.rollback()
                status = "partial"
                notes.append(f"{commodity}: analysis failed: {str(exc)[:220]}")
                logger.exception("[market_intelligence] Failed for %s: %s", commodity, exc)

    except Exception as exc:
        db.rollback()
        status = "failed"
        notes.append(str(exc)[:500])
        logger.exception("[market_intelligence] Run failed: %s", exc)
    finally:
        duration = round(time.perf_counter() - started, 3)
        if run_id is not None:
            try:
                db.execute(text("""
                    UPDATE agent_runs
                    SET commodities_analysed = :commodities_analysed,
                        duration_seconds = :duration_seconds,
                        news_items_read = :news_items_read,
                        analyses_produced = :analyses_produced,
                        opportunities_found = :opportunities_found,
                        status = :status,
                        notes = :notes
                    WHERE id = :run_id
                """), {
                    "commodities_analysed": commodities_analysed,
                    "duration_seconds": duration,
                    "news_items_read": news_items_read,
                    "analyses_produced": analyses_produced,
                    "opportunities_found": opportunities_found,
                    "status": status,
                    "notes": "; ".join(notes) if notes else None,
                    "run_id": run_id,
                })
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("[market_intelligence] Failed to update run log")
        db.close()

    return {
        "run_id": run_id,
        "status": status,
        "commodities_analysed": commodities_analysed,
        "analyses_produced": analyses_produced,
        "opportunities_found": opportunities_found,
        "duration_seconds": round(time.perf_counter() - started, 3),
        "notes": notes,
    }
