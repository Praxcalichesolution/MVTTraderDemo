"""
News detail and AI summarization routes.
"""
import json
import os
from datetime import datetime

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database.db import SessionLocal, get_db

load_dotenv()

router = APIRouter()

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def _loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _row_to_news(row) -> dict:
    return {
        "id": row.id,
        "headline": row.headline,
        "source": row.source,
        "url": row.url,
        "published_at": row.published_at,
        "summary": row.summary,
        "body": getattr(row, "body", None),
        "sentiment_score": row.sentiment_score,
        "commodities_tagged": row.commodities_tagged,
        "regions_tagged": row.regions_tagged,
        "counterparties_tagged": row.counterparties_tagged,
        "market_impact": row.market_impact,
        "relevance_score": row.relevance_score,
        "ingested_at": row.ingested_at,
        "ai_summary": getattr(row, "ai_summary", None),
        "ai_key_points": _loads(getattr(row, "ai_key_points", None), []),
        "ai_position_impact": getattr(row, "ai_position_impact", None),
        "ai_summarized_at": getattr(row, "ai_summarized_at", None),
    }


def _fetch_news_row(db: Session, news_id: int):
    row = db.execute(text("SELECT * FROM news WHERE id = :id"), {"id": news_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"News item {news_id} not found")
    return row


def _normalise_ai_payload(raw: dict, row) -> dict:
    key_points = raw.get("key_points") if isinstance(raw.get("key_points"), list) else []
    market_impact = str(raw.get("market_impact") or row.market_impact or "Neutral").strip().title()
    if market_impact not in {"Bullish", "Bearish", "Neutral"}:
        market_impact = "Neutral"
    return {
        "summary": str(raw.get("summary") or row.summary or row.headline)[:1500],
        "key_points": [str(item)[:500] for item in key_points[:3]],
        "market_impact": market_impact,
        "position_impact": str(raw.get("position_impact") or "No position impact provided.")[:1500],
        "recommended_action": str(raw.get("recommended_action") or "")[:1000],
    }


def _fallback_payload(row, error: str) -> dict:
    source_text = (getattr(row, "body", None) or row.summary or row.headline or "").strip()
    sentences = [part.strip() for part in source_text.replace("\n", " ").split(".") if part.strip()]
    summary = ". ".join(sentences[:3])
    if summary:
        summary = summary + "."
    else:
        summary = row.headline
    return {
        "summary": summary[:1500],
        "key_points": [
            row.headline,
            f"Tagged commodities: {row.commodities_tagged or 'not specified'}",
            f"Claude summarization unavailable: {error[:160]}",
        ],
        "market_impact": row.market_impact or "Neutral",
        "position_impact": (
            "AI summarization failed gracefully. Review crude/feedstock exposure manually "
            f"against this item. Error: {error[:220]}"
        ),
        "recommended_action": "Review manually before changing risk.",
    }


def _build_prompt(row) -> str:
    article_text = (getattr(row, "body", None) or row.summary or row.headline or "").strip()
    return f"""You are a commodity market analyst. Summarize this news for an INEOS crude/feedstock trader.
Return ONLY JSON: {{"summary": "str (3 sentences max)", "key_points": ["str", "str", "str"], "market_impact": "Bullish|Bearish|Neutral", "position_impact": "str (how does this affect crude/ethane/NGL positions)", "recommended_action": "str"}}

Headline: {row.headline}
Source: {row.source or "Unknown"}
Published: {row.published_at}
Tagged commodities: {row.commodities_tagged or "Unknown"}
Current market impact tag: {row.market_impact or "Neutral"}

Article:
{article_text}"""


def _call_claude_summary(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("sk-placeholder") or api_key == "your_key_here":
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    http_client = httpx.Client(verify=False, trust_env=False, timeout=25.0)
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


def summarize_news_item(db: Session, news_id: int) -> dict:
    row = _fetch_news_row(db, news_id)
    try:
        payload = _normalise_ai_payload(_call_claude_summary(_build_prompt(row)), row)
        status = "ai"
    except Exception as exc:
        payload = _fallback_payload(row, str(exc))
        status = "fallback"

    db.execute(text("""
        UPDATE news
        SET ai_summary = :ai_summary,
            ai_key_points = :ai_key_points,
            ai_position_impact = :ai_position_impact,
            ai_summarized_at = :ai_summarized_at,
            market_impact = :market_impact
        WHERE id = :id
    """), {
        "ai_summary": payload["summary"],
        "ai_key_points": json.dumps(payload["key_points"], ensure_ascii=True),
        "ai_position_impact": payload["position_impact"],
        "ai_summarized_at": datetime.utcnow().isoformat(),
        "market_impact": payload["market_impact"],
        "id": news_id,
    })
    db.commit()
    enriched = _row_to_news(_fetch_news_row(db, news_id))
    enriched["recommended_action"] = payload["recommended_action"]
    enriched["summarization_status"] = status
    return enriched


def summarize_news_item_by_id(news_id: int) -> dict:
    db = SessionLocal()
    try:
        return summarize_news_item(db, news_id)
    finally:
        db.close()


@router.get("/")
async def list_news(
    commodity: str | None = None,
    sentiment: str | None = None,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sql = "SELECT * FROM news WHERE 1=1"
    params = {"limit": limit}
    if commodity:
        sql += " AND commodities_tagged LIKE :commodity"
        params["commodity"] = f"%{commodity}%"
    if sentiment:
        normalized = sentiment.strip().title()
        if normalized not in {"Bullish", "Bearish", "Neutral"}:
            raise HTTPException(status_code=400, detail="sentiment must be Bullish, Bearish, or Neutral")
        sql += " AND market_impact = :sentiment"
        params["sentiment"] = normalized
    sql += " ORDER BY published_at DESC, ingested_at DESC LIMIT :limit"
    rows = db.execute(text(sql), params).fetchall()
    return [_row_to_news(row) for row in rows]


@router.get("/search")
async def search_news(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = db.execute(text("""
        SELECT *
        FROM news
        WHERE headline LIKE :q
           OR body LIKE :q
           OR summary LIKE :q
           OR ai_summary LIKE :q
        ORDER BY published_at DESC, ingested_at DESC
        LIMIT :limit
    """), {"q": f"%{q}%", "limit": limit}).fetchall()
    return [_row_to_news(row) for row in rows]


@router.post("/summarize-batch")
async def summarize_batch(
    payload: dict | None = Body(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    limit = int((payload or {}).get("limit", 10))
    limit = max(1, min(limit, 50))
    rows = db.execute(text("""
        SELECT id
        FROM news
        WHERE ai_summary IS NULL
        ORDER BY relevance_score DESC, published_at DESC, ingested_at DESC
        LIMIT :limit
    """), {"limit": limit}).fetchall()
    results = []
    for row in rows:
        try:
            results.append(summarize_news_item(db, row.id))
        except Exception as exc:
            results.append({"id": row.id, "error": str(exc)})
    return {"requested": limit, "processed": len(results), "results": results}


@router.get("/{news_id}")
async def get_news_item(
    news_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _row_to_news(_fetch_news_row(db, news_id))


@router.post("/{news_id}/summarize")
async def summarize_news_endpoint(
    news_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return summarize_news_item(db, news_id)
