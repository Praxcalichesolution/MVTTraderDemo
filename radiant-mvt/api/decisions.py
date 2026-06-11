"""
api/decisions.py - Decision queue management
INEOS Trading & Shipping - Radiant-MVT
"""
import json as _json
import logging
import os as _os
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database.db import SessionLocal, get_db
from database.models import Alert, DecisionQueue, MarketData, News, Position

router = APIRouter()
logger = logging.getLogger(__name__)


def _decision_sorting():
    return (
        case(
            (DecisionQueue.urgency == "Critical", 1),
            (DecisionQueue.urgency == "High", 2),
            (DecisionQueue.urgency == "Medium", 3),
            else_=4,
        ),
        DecisionQueue.deadline.asc(),
        DecisionQueue.created_at.desc(),
    )


def _serialize_queue_item(item: DecisionQueue) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "decision_type": item.decision_type,
        "potential_impact": item.potential_impact,
        "impact_description": item.impact_description,
        "urgency": item.urgency,
        "deadline": str(item.deadline) if item.deadline else None,
        "status": item.status,
        "created_at": str(item.created_at) if item.created_at else None,
        "related_trade_id": item.related_trade_id,
        "related_vessel_id": item.related_vessel_id,
        "related_alert_id": item.related_alert_id,
        "reasoning_text": item.reasoning_text,
        "reasoning_generated_at": (
            str(item.reasoning_generated_at) if item.reasoning_generated_at else None
        ),
        "reasoning_cached": bool(item.reasoning_text),
    }


def _seed_demo_decisions(db: Session) -> list[int]:
    now = datetime.utcnow()
    decisions = [
        {
            "title": "Review Urals hedge coverage before OPEC+",
            "description": (
                "OPEC+ meets at 10:00. Current hedge covers 61%. "
                "Analyst consensus implies elevated spread risk on the long Urals book."
            ),
            "decision_type": "Hedge Review",
            "potential_impact": 2400000,
            "impact_description": "$2.4M at risk if spread moves",
            "urgency": "Critical",
            "deadline": now + timedelta(hours=2),
        },
        {
            "title": "JS Ineos Innovation - choose response to 14h delay",
            "description": (
                "Three response options have been costed. Terminal at Rafnes needs an answer "
                "and voyage economics are shifting."
            ),
            "decision_type": "Operational",
            "potential_impact": 480000,
            "impact_description": "Voyage economics impact $480K",
            "urgency": "High",
            "deadline": now + timedelta(hours=3, minutes=26),
        },
        {
            "title": "Vitol trade confirmation outstanding - RMVT-0234",
            "description": (
                "Trade was agreed verbally this morning. Written confirmation remains unsent "
                "and counterparty deadline is approaching."
            ),
            "decision_type": "Confirmation",
            "potential_impact": 0,
            "impact_description": "Counterparty dispute risk",
            "urgency": "Medium",
            "deadline": now + timedelta(hours=7, minutes=26),
        },
        {
            "title": "Monthly performance review - submit to Risk by 17:00",
            "description": (
                "June performance pack is due. Risk needs P&L attribution and VaR summary "
                "from the current live book."
            ),
            "decision_type": "Reporting",
            "potential_impact": 0,
            "impact_description": "Reporting obligation",
            "urgency": "Low",
            "deadline": now + timedelta(hours=9, minutes=26),
        },
    ]

    seeded_items: list[DecisionQueue] = []
    for payload in decisions:
        item = DecisionQueue(user_id=1, status="Pending", **payload)
        db.add(item)
        seeded_items.append(item)

    db.commit()
    for item in seeded_items:
        db.refresh(item)
    return [item.id for item in seeded_items]


def _build_prompt(item: DecisionQueue, db: Session) -> str:
    """Build the reasoning prompt for a decision, enriched with live context."""
    positions = (
        db.query(Position)
        .order_by(Position.mtm_pnl.asc().nullsfirst())
        .limit(5)
        .all()
    )
    alerts = (
        db.query(Alert)
        .filter(Alert.status == "Open")
        .order_by(Alert.created_at.desc())
        .limit(5)
        .all()
    )
    market = (
        db.query(MarketData)
        .order_by(MarketData.timestamp.desc())
        .limit(6)
        .all()
    )
    commodity_hint = (
        db.query(News.commodities_tagged)
        .order_by(News.relevance_score.desc())
        .limit(1)
        .scalar()
        or ""
    )

    nl = "\n"
    pos_text = (
        nl.join(
            "  - "
            + str(p.commodity)
            + ": net="
            + str(p.net_volume)
            + ", avg_px="
            + str(p.avg_price)
            + ", mtm_pnl="
            + str(p.mtm_pnl)
            for p in positions
        )
        or "  No position data"
    )
    alert_text = (
        nl.join(
            "  ["
            + str(a.severity)
            + "] "
            + str(a.title)
            + ": "
            + str(a.description or "")
            for a in alerts
        )
        or "  No active alerts"
    )
    mkt_text = (
        nl.join(
            "  "
            + str(m.commodity)
            + ": "
            + str(m.price)
            + " ("
            + str(m.change_pct_1d)
            + "%)"
            for m in market
        )
        or "  No market data"
    )

    news_text = "  No recent news"
    try:
        from feeds.feed_aggregator import get_relevant_news_for_decision

        recent_news = get_relevant_news_for_decision(
            db,
            item.title or "",
            commodities=commodity_hint,
            limit=5,
        )
        if recent_news:
            lines = []
            for news_item in recent_news:
                impact = news_item.get("market_impact")
                if impact == "Bullish":
                    impact_prefix = "[UP]"
                elif impact == "Bearish":
                    impact_prefix = "[DOWN]"
                else:
                    impact_prefix = "[NEWS]"
                lines.append(
                    "  "
                    + impact_prefix
                    + " ["
                    + str(news_item.get("source") or "Unknown")
                    + " | "
                    + str(news_item.get("published_at") or "")
                    + "] "
                    + str(news_item.get("headline") or "")
                    + (
                        " - " + str(news_item.get("summary") or "")[:120]
                        if news_item.get("summary")
                        else ""
                    )
                )
            news_text = nl.join(lines)
    except Exception:
        pass

    return (
        "You are Radiant AI, the INEOS Trading & Shipping intelligence engine.\n"
        "A trader needs a clear, actionable explanation for this decision.\n"
        "You have access to live market data, positions, alerts, and recent news.\n\n"
        "DECISION: "
        + str(item.title or "")
        + "\n"
        + "URGENCY: "
        + str(item.urgency or "N/A")
        + "\n"
        + "DESCRIPTION: "
        + str(item.description or "N/A")
        + "\n"
        + "IMPACT: "
        + str(item.impact_description or str(item.potential_impact) or "N/A")
        + "\n"
        + "DEADLINE: "
        + str(item.deadline or "N/A")
        + "\n"
        + "POTENTIAL IMPACT: "
        + str(item.potential_impact or "N/A")
        + "\n\n"
        + "LIVE POSITIONS:\n"
        + pos_text
        + "\n\n"
        + "ACTIVE ALERTS:\n"
        + alert_text
        + "\n\n"
        + "LIVE MARKET DATA:\n"
        + mkt_text
        + "\n\n"
        + "RECENT NEWS FROM CONFIGURED FEEDS:\n"
        + news_text
        + "\n\n"
        + "Provide structured reasoning with exactly these 5 sections and keep it under 500 words.\n"
        + "In section 2, cite at least 2 specific news headlines above with [Source | Date] format.\n\n"
        + "1. Situation - What triggered this decision?\n"
        + "2. Key Evidence - Cite specific news and data points that support this\n"
        + "3. Risk if Ignored - What happens if the trader does nothing?\n"
        + "4. Recommended Action - Precisely what should the trader do?\n"
        + "5. Confidence - Rate 1-10 and explain the main uncertainty."
    )


def _call_llm_blocking(prompt: str) -> str:
    """Call LLM synchronously and return the full response text."""
    try:
        from api.ai_settings import _get_provider

        _db = SessionLocal()
        provider = _get_provider(_db)
        _db.close()
    except Exception:
        provider = "local"

    if provider == "local":
        from openai import OpenAI

        local_url = _os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
        local_model = _os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
        client = OpenAI(base_url=local_url, api_key="lm-studio")
        resp = client.chat.completions.create(
            model=local_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            stream=False,
        )
        return resp.choices[0].message.content or ""

    import anthropic

    api_key = _os.getenv("ANTHROPIC_API_KEY", "")
    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text or ""
    except anthropic.AuthenticationError:
        from openai import OpenAI

        local_url = _os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
        local_model = _os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
        client2 = OpenAI(base_url=local_url, api_key="lm-studio")
        resp2 = client2.chat.completions.create(
            model=local_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            stream=False,
        )
        return resp2.choices[0].message.content or ""


def _store_reasoning(decision_id: int, text_content: str):
    """Write generated reasoning back to the DB."""
    db = SessionLocal()
    try:
        item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
        if item:
            item.reasoning_text = text_content
            item.reasoning_generated_at = datetime.utcnow()
            db.commit()
            logger.info(
                "Cached reasoning for decision %d (%d chars)",
                decision_id,
                len(text_content),
            )
    except Exception as exc:
        logger.warning("Failed to store reasoning for decision %d: %s", decision_id, exc)
    finally:
        db.close()


def _background_generate_reasoning(decision_id: int):
    """Background task: generate reasoning and cache it in the DB."""
    db = SessionLocal()
    try:
        item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
        if not item:
            return
        if item.reasoning_text and item.reasoning_generated_at:
            age = (datetime.utcnow() - item.reasoning_generated_at).total_seconds()
            if age < 14400:
                logger.info(
                    "Reasoning for decision %d still fresh (%.0fs old), skipping",
                    decision_id,
                    age,
                )
                return
        prompt = _build_prompt(item, db)
        db.close()
        db = None
        reasoning = _call_llm_blocking(prompt)
        if reasoning:
            _store_reasoning(decision_id, reasoning)
    except Exception as exc:
        logger.warning(
            "Background reasoning generation failed for decision %d: %s",
            decision_id,
            exc,
        )
    finally:
        if db:
            db.close()


@router.get("/queue")
async def get_decision_queue(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    items = (
        db.query(DecisionQueue)
        .filter(DecisionQueue.status.in_(["Pending", "Snoozed"]))
        .order_by(*_decision_sorting())
        .limit(20)
        .all()
    )

    seeded_ids: list[int] = []
    if not items:
        seeded_ids = _seed_demo_decisions(db)
        items = (
            db.query(DecisionQueue)
            .filter(DecisionQueue.status.in_(["Pending", "Snoozed"]))
            .order_by(*_decision_sorting())
            .limit(20)
            .all()
        )

    result = [_serialize_queue_item(item) for item in items]

    if seeded_ids:
        for decision_id in seeded_ids:
            background_tasks.add_task(_background_generate_reasoning, decision_id)
        logger.info(
            "Queued background reasoning generation for %d new decisions",
            len(seeded_ids),
        )
    else:
        for row in result:
            if not row.get("reasoning_text"):
                background_tasks.add_task(_background_generate_reasoning, row["id"])

    return result


@router.get("/")
async def get_decisions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """All decisions for the current user (Pending + Snoozed)."""
    items = (
        db.query(DecisionQueue)
        .filter(DecisionQueue.status.in_(["Pending", "Snoozed"]))
        .order_by(DecisionQueue.created_at.desc())
        .all()
    )
    return [_serialize_queue_item(item) for item in items]


@router.patch("/{decision_id}/complete")
async def complete_decision(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    item.status = "Completed"
    item.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "completed", "decision_id": decision_id}


@router.post("/{decision_id}/complete")
async def complete_decision_post(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await complete_decision(decision_id, db, current_user)


@router.post("/{decision_id}/snooze")
async def snooze_decision(
    decision_id: int,
    minutes: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    snooze_until = datetime.utcnow() + timedelta(minutes=minutes)
    item.status = "Snoozed"
    item.snooze_until = snooze_until
    db.commit()
    return {
        "status": "snoozed",
        "until": snooze_until.isoformat(),
        "decision_id": decision_id,
    }


@router.post("/{decision_id}/refresh-reasoning")
async def refresh_reasoning(
    decision_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Force-regenerate reasoning for a decision (clears cache)."""
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    item.reasoning_text = None
    item.reasoning_generated_at = None
    db.commit()
    background_tasks.add_task(_background_generate_reasoning, decision_id)
    return {
        "status": "queued",
        "decision_id": decision_id,
        "message": "Reasoning will be regenerated in background",
    }


@router.get("/{decision_id}/reasoning")
async def get_decision_reasoning(
    decision_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Stream AI reasoning for a decision.
    - If reasoning is cached in DB: stream it instantly.
    - If not cached: generate live, store in DB, and stream simultaneously.
    """
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")

    cached_text = item.reasoning_text
    generated_at = item.reasoning_generated_at

    if cached_text:

        async def stream_cached():
            yield (
                "data: "
                + _json.dumps({"meta": "cached", "generated_at": str(generated_at)})
                + "\n\n"
            )
            chunk_size = 60
            for index in range(0, len(cached_text), chunk_size):
                yield (
                    "data: "
                    + _json.dumps({"chunk": cached_text[index:index + chunk_size]})
                    + "\n\n"
                )
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_cached(), media_type="text/event-stream")

    prompt = _build_prompt(item, db)

    async def stream_and_store():
        collected = []
        try:
            try:
                from api.ai_settings import _get_provider

                _db2 = SessionLocal()
                provider = _get_provider(_db2)
                _db2.close()
            except Exception:
                provider = "local"

            if provider == "local":
                from openai import OpenAI

                local_url = _os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
                local_model = _os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
                client = OpenAI(base_url=local_url, api_key="lm-studio")
                stream = client.chat.completions.create(
                    model=local_model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=600,
                    stream=True,
                )
                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        collected.append(delta)
                        yield "data: " + _json.dumps({"chunk": delta}) + "\n\n"
            else:
                import anthropic

                api_key = _os.getenv("ANTHROPIC_API_KEY", "")
                try:
                    client = anthropic.Anthropic(api_key=api_key)
                    with client.messages.stream(
                        model="claude-sonnet-4-6",
                        max_tokens=600,
                        messages=[{"role": "user", "content": prompt}],
                    ) as stream:
                        for chunk in stream.text_stream:
                            collected.append(chunk)
                            yield "data: " + _json.dumps({"chunk": chunk}) + "\n\n"
                except anthropic.AuthenticationError:
                    yield (
                        "data: "
                        + _json.dumps({"chunk": "Claude key invalid, using Local LLM...\n\n"})
                        + "\n\n"
                    )
                    from openai import OpenAI

                    local_url = _os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
                    local_model = _os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
                    client2 = OpenAI(base_url=local_url, api_key="lm-studio")
                    stream2 = client2.chat.completions.create(
                        model=local_model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=600,
                        stream=True,
                    )
                    for chunk2 in stream2:
                        delta = chunk2.choices[0].delta.content or ""
                        if delta:
                            collected.append(delta)
                            yield "data: " + _json.dumps({"chunk": delta}) + "\n\n"

            yield "data: [DONE]\n\n"

            if collected:
                _store_reasoning(decision_id, "".join(collected))

        except Exception as exc:
            yield "data: " + _json.dumps({"error": str(exc)[:200]}) + "\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_and_store(), media_type="text/event-stream")
