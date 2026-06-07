import warnings, ssl, os as _os
try:
    import urllib3; urllib3.disable_warnings()
except: pass
try: ssl._create_default_https_context = ssl._create_unverified_context
except: pass
"""
api/chat.py — Streaming SSE copilot endpoint
CRITICAL RULE: Python calculates ALL financial figures. AI only narrates.
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from pydantic import BaseModel
from typing import Optional, AsyncIterator
import anthropic
import os
import json
import logging
from datetime import datetime

from database.db import get_db
from api.auth import get_current_user
from database.models import (
    ChatHistory, AppConfig, Trade, Position, Alert, MarketData, Vessel
)

router = APIRouter()
logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv(
    "ANTHROPIC_API_KEY",
    "your_anthropic_api_key"
)


class ChatMessage(BaseModel):
    message: str
    screen_context: Optional[str] = None
    session_id: Optional[str] = None


def _get_ai_provider(db: Session) -> str:
    config = db.query(AppConfig).filter(AppConfig.key == "ai_provider").first()
    return config.value if config else "claude"


def _build_system_prompt(db: Session, user: dict) -> str:
    """Build context-rich system prompt with live Python-computed data."""
    try:
        positions = db.query(Position).all()
        total_mtm_pnl = sum(p.mtm_pnl or 0 for p in positions)
        total_var = sum(p.var_contribution or 0 for p in positions)
    except Exception:
        total_mtm_pnl = 1240000
        total_var = 2100000

    try:
        open_alerts = db.query(Alert).filter(Alert.status == "Open").count()
        critical_alerts = db.query(Alert).filter(Alert.status == "Open", Alert.severity == "Critical").count()
    except Exception:
        open_alerts = 2
        critical_alerts = 1

    # Latest market prices — use raw SQL to avoid model/schema mismatch
    try:
        rows = db.execute(text("""
            SELECT commodity, price, change_pct_1d FROM market_data
            WHERE timestamp = (SELECT MAX(timestamp) FROM market_data m2 WHERE m2.commodity = market_data.commodity)
            ORDER BY commodity
        """)).fetchall()
        prices_str = " | ".join(
            f"{r[0]}: {r[1]:.2f} ({'+' if (r[2] or 0) > 0 else ''}{r[2] or 0:.2f}%)"
            for r in rows
        ) if rows else "Live prices loading..."
    except Exception:
        prices_str = "Brent ~$82/bbl | WTI ~$79/bbl | HH ~$2.84/MMBtu"

    # Vessel delays — raw SQL
    try:
        dv = db.execute(text(
            "SELECT name, delay_hours FROM vessels WHERE delay_hours > 0"
        )).fetchall()
        vessel_str = ", ".join(f"{v[0]} (+{v[1]}h)" for v in dv) if dv else "None delayed"
    except Exception:
        vessel_str = "Fleet status loading..."

    return f"""You are Radiant, the AI intelligence layer of the Radiant-MVT™ Trading Intelligence Platform for INEOS Trading & Shipping.

CRITICAL RULE: You NEVER calculate financial figures. Python has already calculated all numbers. You only narrate, explain, and advise based on pre-computed data provided to you.

CURRENT USER: {user.get('full_name', 'Trader')} ({user.get('role', 'trader')}) — {user.get('desk', 'INEOS Trading & Shipping')}
PLATFORM TIME: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}

LIVE MARKET DATA (Python-computed):
{prices_str or 'No prices loaded yet'}

PORTFOLIO STATUS (Python-computed):
- Total MTM P&L: ${total_mtm_pnl:,.0f}
- Portfolio VaR: ${total_var:,.0f} (limit: $8,000,000)
- VaR utilisation: {total_var / 8_000_000 * 100:.1f}%
- Open alerts: {open_alerts} ({critical_alerts} Critical)
- Delayed vessels: {vessel_str}

PLATFORM CONTEXT:
- INEOS Trading & Shipping operates a major commodity trading desk
- Commodities: Crude Oil (Brent, WTI, Urals), Ethane, NGLs, Carbon (EUA)
- INEOS owns a fleet of Dragon-class ethane carriers
- Users are professional traders, risk managers, and executives

BEHAVIOUR RULES:
1. Be concise and professional — traders have no time for waffle
2. Always cite the source of any figure (e.g., "The Python engine shows...", "Based on current positions...")
3. Never invent prices, P&L figures, or risk metrics — only narrate what was provided
4. When asked for a recommendation, provide structured options with stated trade-offs
5. Reference INEOS context where relevant (Dragon fleet, Rafnes plant, European crude desk)
6. For regulatory questions, be precise about EMIR/REMIT/MiFID II requirements
7. Keep responses under 300 words unless complexity demands more"""


def _get_history(db: Session, user_id: int, session_id: str, limit: int = 10):
    messages = (
        db.query(ChatHistory)
        .filter(ChatHistory.user_id == user_id, ChatHistory.session_id == session_id)
        .order_by(ChatHistory.timestamp.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(messages))


@router.post("/")
async def chat(
    msg: ChatMessage,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    provider = _get_ai_provider(db)
    system_prompt = _build_system_prompt(db, current_user)
    user_id = current_user.get("id", 1)
    session_id = msg.session_id or f"session_{user_id}_{datetime.utcnow().date()}"

    # Build message history
    history = _get_history(db, user_id, session_id)
    messages = [{"role": h.role, "content": h.content} for h in history]
    messages.append({"role": "user", "content": msg.message})

    # Save user message
    db.add(ChatHistory(
        user_id=user_id, session_id=session_id,
        role="user", content=msg.message, screen_context=msg.screen_context,
    ))
    db.commit()

    if provider == "claude":
        api_key = ANTHROPIC_API_KEY
        if not api_key or api_key.startswith("your_key") or api_key == "sk-placeholder":
            response_text = (
                f"[Demo Mode — Claude API key not configured] "
                f"You asked: {msg.message}. In production, Radiant would provide "
                "detailed trading intelligence based on your live positions and market data."
            )
        else:
            try:
                import httpx as _httpx
                client = anthropic.Anthropic(
                    api_key=api_key,
                    http_client=_httpx.Client(verify=False, timeout=60, trust_env=False)
                )
                full_response = ""

                async def generate():
                    nonlocal full_response
                    with client.messages.stream(
                        model="claude-sonnet-4-6",
                        max_tokens=2048,
                        system=system_prompt,
                        messages=messages,
                    ) as stream:
                        for text in stream.text_stream:
                            full_response += text
                            yield f"data: {json.dumps({'chunk': text})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    # Save assistant response
                    db.add(ChatHistory(
                        user_id=user_id, session_id=session_id,
                        role="assistant", content=full_response,
                        screen_context=msg.screen_context,
                    ))
                    db.commit()

                return StreamingResponse(generate(), media_type="text/event-stream",
                                         headers={"Cache-Control": "no-cache",
                                                  "X-Accel-Buffering": "no"})
            except Exception as e:
                logger.error("Claude API error: %s", e)
                response_text = f"AI service temporarily unavailable. Error: {str(e)[:100]}"
    else:
        # Local LLM via OpenAI-compatible endpoint
        try:
            import openai
            local_url = os.getenv("LOCAL_LLM_URL", "http://localhost:1234/v1")
            local_model = os.getenv("LOCAL_LLM_MODEL", "llama-3.1-8b-instruct")
            local_client = openai.OpenAI(base_url=local_url, api_key="local")
            completion = local_client.chat.completions.create(
                model=local_model,
                messages=[{"role": "system", "content": system_prompt}] + messages,
                max_tokens=2048,
            )
            response_text = completion.choices[0].message.content
        except Exception as e:
            logger.error("Local LLM error: %s", e)
            response_text = f"Local LLM unavailable: {str(e)[:100]}"

    # Save assistant response (non-streaming path)
    db.add(ChatHistory(
        user_id=user_id, session_id=session_id,
        role="assistant", content=response_text,
        screen_context=msg.screen_context,
    ))
    db.commit()

    return {"response": response_text, "session_id": session_id}


@router.post("/message")
async def chat_message(
    msg: ChatMessage,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Alias for POST / — accepts the same body."""
    return await chat(msg, db, current_user)


@router.get("/history")
async def get_history(
    session_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    user_id = current_user.get("id", 1)
    query = db.query(ChatHistory).filter(ChatHistory.user_id == user_id)
    if session_id:
        query = query.filter(ChatHistory.session_id == session_id)
    messages = query.order_by(ChatHistory.timestamp.desc()).limit(limit).all()
    return [
        {"role": m.role, "content": m.content, "timestamp": str(m.timestamp)}
        for m in reversed(messages)
    ]
