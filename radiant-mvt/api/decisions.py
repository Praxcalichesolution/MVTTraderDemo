"""
api/decisions.py — Decision queue management
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.db import get_db
from api.auth import get_current_user
from database.models import DecisionQueue, Trade, Vessel, Alert
from datetime import datetime, timedelta
import json as _json
import os as _os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_prompt(item, db: Session) -> str:
    """Build the reasoning prompt for a decision, enriched with live context."""
    try:
        positions = db.execute(text(
            "SELECT commodity, quantity, avg_price, pnl FROM positions ORDER BY pnl ASC LIMIT 5"
        )).fetchall()
    except Exception:
        positions = []

    try:
        alerts = db.execute(text(
            "SELECT title, severity, message FROM alerts WHERE is_read=0 ORDER BY created_at DESC LIMIT 5"
        )).fetchall()
    except Exception:
        alerts = []

    try:
        market = db.execute(text(
            "SELECT symbol, price, change_pct FROM market_data ORDER BY updated_at DESC LIMIT 6"
        )).fetchall()
    except Exception:
        market = []

    nl = "\n"
    pos_text = nl.join("  - " + str(p[0]) + ": qty=" + str(p[1]) + ", avg_px=" + str(p[2]) + ", pnl=" + str(p[3]) for p in positions) or "  No position data"
    alert_text = nl.join("  [" + str(a[1]) + "] " + str(a[0]) + ": " + str(a[2]) for a in alerts) or "  No active alerts"
    mkt_text = nl.join("  " + str(m[0]) + ": " + str(m[1]) for m in market) or "  No market data"

    # Fetch relevant news articles for cited evidence
    news_text = "  No recent news"
    try:
        from feeds.feed_aggregator import get_relevant_news_for_decision
        commodity_hint = ""
        try:
            commodity_hint = db.execute(text(
                "SELECT commodities_tagged FROM news ORDER BY relevance_score DESC LIMIT 1"
            )).scalar() or ""
        except Exception:
            pass
        recent_news = get_relevant_news_for_decision(
            db, item.title or "", commodities=commodity_hint, limit=5
        )
        if recent_news:
            nl = "\n"
            news_lines = []
            for n in recent_news:
                impact_icon = "📈" if n["market_impact"] == "Bullish" else "📉" if n["market_impact"] == "Bearish" else "📰"
                news_lines.append(
                    "  " + impact_icon + " [" + n["source"] + " | " + n["published_at"] + "] "
                    + n["headline"]
                    + (" — " + (n["summary"] or "")[:120] if n.get("summary") else "")
                )
            news_text = nl.join(news_lines)
    except Exception:
        pass

    return (
        "You are Radiant AI, the INEOS Trading & Shipping intelligence engine.\n"
        "A trader needs a clear, actionable explanation for this decision.\n"
        "You have access to LIVE market data, positions, alerts, AND real-time news feeds.\n\n"
        "DECISION: " + str(item.title or "") + "\n"
        "URGENCY: " + str(item.urgency or "N/A") + "\n"
        "DESCRIPTION: " + str(item.description or "N/A") + "\n"
        "IMPACT: " + str(item.impact_description or str(item.potential_impact) or "N/A") + "\n"
        "DEADLINE: " + str(item.deadline or "N/A") + "\n"
        "POTENTIAL IMPACT: " + str(item.potential_impact or "N/A") + "\n\n"
        "LIVE POSITIONS:\n" + pos_text + "\n\n"
        "ACTIVE ALERTS:\n" + alert_text + "\n\n"
        "LIVE MARKET DATA:\n" + mkt_text + "\n\n"
        "RECENT NEWS FROM CONFIGURED FEEDS (cite these in your evidence):\n" + news_text + "\n\n"
        "Provide structured reasoning with exactly these 5 sections (keep under 500 words).\n"
        "In section 2, CITE at least 2 specific news headlines above with [Source | Date] format.\n\n"
        "**1. Situation** - What triggered this decision?\n"
        "**2. Key Evidence** - Cite specific news + data points that support this\n"
        "**3. Risk if Ignored** - What happens if trader does nothing?\n"
        "**4. Recommended Action** - Precisely what should the trader do?\n"
        "**5. Confidence** - Rate 1-10 and explain the main uncertainty."
    )


def _call_llm_blocking(prompt: str) -> str:
    """Call LLM synchronously and return the full response text."""
    import os
    try:
        from api.ai_settings import _get_provider
        from database.db import SessionLocal
        _db = SessionLocal()
        provider = _get_provider(_db)
        _db.close()
    except Exception:
        provider = "local"

    if provider == "local":
        from openai import OpenAI
        local_url = os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
        local_model = os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
        client = OpenAI(base_url=local_url, api_key="lm-studio")
        resp = client.chat.completions.create(
            model=local_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            stream=False,
        )
        return resp.choices[0].message.content or ""
    else:
        import anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        try:
            client = anthropic.Anthropic(api_key=api_key)
            resp = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text or ""
        except anthropic.AuthenticationError:
            # Fall back to local LLM
            from openai import OpenAI
            local_url = os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
            local_model = os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
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
    from database.db import SessionLocal
    db = SessionLocal()
    try:
        item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
        if item:
            item.reasoning_text = text_content
            item.reasoning_generated_at = datetime.utcnow()
            db.commit()
            logger.info("Cached reasoning for decision %d (%d chars)", decision_id, len(text_content))
    except Exception as e:
        logger.warning("Failed to store reasoning for decision %d: %s", decision_id, e)
    finally:
        db.close()


def _background_generate_reasoning(decision_id: int):
    """Background task: generate reasoning and cache it in the DB."""
    from database.db import SessionLocal
    db = SessionLocal()
    try:
        item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
        if not item:
            return
        # Skip if already cached and recent (< 4 hours old)
        if item.reasoning_text and item.reasoning_generated_at:
            age = (datetime.utcnow() - item.reasoning_generated_at).total_seconds()
            if age < 14400:
                logger.info("Reasoning for decision %d still fresh (%.0fs old), skipping", decision_id, age)
                return
        prompt = _build_prompt(item, db)
        db.close()
        db = None
        reasoning = _call_llm_blocking(prompt)
        if reasoning:
            _store_reasoning(decision_id, reasoning)
    except Exception as e:
        logger.warning("Background reasoning generation failed for decision %d: %s", decision_id, e)
    finally:
        if db:
            db.close()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/queue")
async def get_decision_queue(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Defensive query — reasoning columns may not exist in older DB versions
    try:
        rows = db.execute(text("""
            SELECT id, title, description, decision_type, potential_impact,
                   impact_description, urgency, deadline, status, created_at,
                   related_trade_id, related_vessel_id, related_alert_id,
                   reasoning_text, reasoning_generated_at
            FROM decision_queue
            WHERE status IN ('Pending', 'Snoozed')
            ORDER BY
                CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                deadline ASC
            LIMIT 20
        """)).fetchall()
    except Exception:
        # Columns not yet migrated — fall back to base columns
        rows = db.execute(text("""
            SELECT id, title, description, decision_type, potential_impact,
                   impact_description, urgency, deadline, status, created_at,
                   related_trade_id, related_vessel_id, related_alert_id
            FROM decision_queue
            WHERE status IN ('Pending', 'Snoozed')
            ORDER BY
                CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                deadline ASC
            LIMIT 20
        """)).fetchall()

    seeded_ids = []
    if not rows:
        # Seed realistic decisions
        import sqlite3
        from database.db import engine
        db_url = str(engine.url)
        db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")
        import os
        if not os.path.isabs(db_path):
            db_path = os.path.join(os.getcwd(), db_path.lstrip("./"))
        conn = sqlite3.connect(db_path)
        now = datetime.now()
        decisions = [
            ('Review Urals hedge coverage before OPEC+', 'OPEC+ meets at 10:00. Current hedge covers 61%. Analyst consensus: 70% probability of production cut of 500k bbl/day. Urals net long 80,000 bbl.', 'Hedge Review', 2400000, '$2.4M at risk if spread moves', 'Critical', (now + timedelta(hours=2)).isoformat(), 1, 'Pending'),
            ('JS Ineos Innovation — choose response to 14h delay', 'Three options costed. Terminal at Rafnes needs response. Ethane cargo delivery impacted. Option C (reroute) saves $96K net vs Option A.', 'Operational', 480000, 'Voyage economics impact $480K', 'High', (now + timedelta(hours=3, minutes=26)).isoformat(), 1, 'Pending'),
            ('Vitol trade confirmation outstanding — RMVT-0234', 'Trade was agreed verbally on 28-May. Written confirmation overdue by 24h. Draft reply ready. One click to send.', 'Confirmation', 0, 'Counterparty dispute risk', 'Medium', (now + timedelta(hours=7, minutes=26)).isoformat(), 1, 'Pending'),
            ('Monthly performance review — submit to Risk by 17:00', 'June performance pack due. Risk team needs P&L attribution and VaR summary. Template auto-populated from live positions.', 'Reporting', 0, 'Reporting obligation', 'Low', (now + timedelta(hours=9, minutes=26)).isoformat(), 1, 'Pending'),
        ]
        for d in decisions:
            cur = conn.execute(
                'INSERT OR IGNORE INTO decision_queue (title, description, decision_type, potential_impact, impact_description, urgency, deadline, user_id, status) VALUES (?,?,?,?,?,?,?,?,?)', d
            )
            if cur.lastrowid:
                seeded_ids.append(cur.lastrowid)
        conn.commit()
        conn.close()
        try:
            rows = db.execute(text("""
                SELECT id, title, description, decision_type, potential_impact,
                       impact_description, urgency, deadline, status, created_at,
                       related_trade_id, related_vessel_id, related_alert_id,
                       reasoning_text, reasoning_generated_at
                FROM decision_queue
                WHERE status IN ('Pending', 'Snoozed')
                ORDER BY
                    CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                    deadline ASC
                LIMIT 20
            """)).fetchall()
        except Exception:
            rows = db.execute(text("""
                SELECT id, title, description, decision_type, potential_impact,
                       impact_description, urgency, deadline, status, created_at,
                       related_trade_id, related_vessel_id, related_alert_id
                FROM decision_queue
                WHERE status IN ('Pending', 'Snoozed')
                ORDER BY
                    CASE urgency WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
                    deadline ASC
                LIMIT 20
            """)).fetchall()

    result = [dict(r._mapping) for r in rows]

    # For newly seeded decisions, pre-generate reasoning in background
    if seeded_ids:
        for did in seeded_ids:
            background_tasks.add_task(_background_generate_reasoning, did)
        logger.info("Queued background reasoning generation for %d new decisions", len(seeded_ids))
    else:
        # Also queue background refresh for any decision missing reasoning
        for row in result:
            if not row.get("reasoning_text"):
                background_tasks.add_task(_background_generate_reasoning, row["id"])

    return result


@router.get("/")
async def get_decisions(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """All decisions for the current user (Pending + Snoozed)."""
    items = (
        db.query(DecisionQueue)
        .filter(DecisionQueue.status.in_(["Pending", "Snoozed"]))
        .order_by(DecisionQueue.created_at.desc())
        .all()
    )
    return [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "decision_type": i.decision_type,
            "urgency": i.urgency,
            "potential_impact": i.potential_impact,
            "impact_description": i.impact_description,
            "deadline": str(i.deadline) if i.deadline else None,
            "status": i.status,
            "created_at": str(i.created_at) if i.created_at else None,
            "reasoning_cached": bool(i.reasoning_text),
        }
        for i in items
    ]


@router.patch("/{decision_id}/complete")
async def complete_decision(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
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
    current_user = Depends(get_current_user)
):
    return await complete_decision(decision_id, db, current_user)


@router.post("/{decision_id}/snooze")
async def snooze_decision(
    decision_id: int,
    minutes: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    snooze_until = (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()
    item.status = "Snoozed"
    db.commit()
    return {"status": "snoozed", "until": snooze_until, "decision_id": decision_id}


@router.post("/{decision_id}/refresh-reasoning")
async def refresh_reasoning(
    decision_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Force-regenerate reasoning for a decision (clears cache)."""
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")
    # Clear cache so background task regenerates
    item.reasoning_text = None
    item.reasoning_generated_at = None
    db.commit()
    background_tasks.add_task(_background_generate_reasoning, decision_id)
    return {"status": "queued", "decision_id": decision_id, "message": "Reasoning will be regenerated in background"}


@router.get("/{decision_id}/reasoning")
async def get_decision_reasoning(
    decision_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Stream AI reasoning for a decision.
    - If reasoning is cached in DB: stream it instantly (no LLM call).
    - If not cached: generate live, store in DB, and stream simultaneously.
    """
    item = db.query(DecisionQueue).filter(DecisionQueue.id == decision_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Decision not found")

    # ── CACHE HIT: stream stored reasoning instantly ──────────────────────────
    try:
        cached_text = item.reasoning_text
        generated_at = item.reasoning_generated_at
    except Exception:
        cached_text = None
        generated_at = None

    if cached_text:

        async def stream_cached():
            # Send a small header chunk indicating this is from cache
            yield "data: " + _json.dumps({"meta": "cached", "generated_at": str(generated_at)}) + "\n\n"
            # Stream in ~50-char chunks to animate the text like streaming
            chunk_size = 60
            for i in range(0, len(cached_text), chunk_size):
                yield "data: " + _json.dumps({"chunk": cached_text[i:i+chunk_size]}) + "\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_cached(), media_type="text/event-stream")

    # ── CACHE MISS: generate live, store, and stream ──────────────────────────
    prompt = _build_prompt(item, db)

    async def stream_and_store():
        collected = []
        try:
            import os
            try:
                from api.ai_settings import _get_provider
                from database.db import SessionLocal
                _db2 = SessionLocal()
                provider = _get_provider(_db2)
                _db2.close()
            except Exception:
                provider = "local"

            if provider == "local":
                from openai import OpenAI
                local_url = os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
                local_model = os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
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
                api_key = os.getenv("ANTHROPIC_API_KEY", "")
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
                    yield "data: " + _json.dumps({"chunk": "⚠️ Claude key invalid, using Local LLM...\n\n"}) + "\n\n"
                    from openai import OpenAI
                    local_url = os.getenv("LOCAL_LLM_URL", "http://127.0.0.1:1234/v1")
                    local_model = os.getenv("LOCAL_LLM_MODEL", "qwen2.5-coder-7b-instruct")
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

            # Store in DB after streaming completes
            if collected:
                full_text = "".join(collected)
                _store_reasoning(decision_id, full_text)

        except Exception as exc:
            yield "data: " + _json.dumps({"error": str(exc)[:200]}) + "\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_and_store(), media_type="text/event-stream")
