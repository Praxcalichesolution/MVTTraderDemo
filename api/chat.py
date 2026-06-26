"""
Streaming chat endpoint for the Radiant-MVT copilot.
Financial calculations remain platform-computed; AI only narrates and advises.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from ai.app_manual import (
    build_copilot_plan,
    get_app_manual_payload,
    render_app_manual_markdown,
)
from ai.studio import (
    build_runtime_context,
    compile_agent_prompts,
    get_default_chat_agent,
    run_agent_generation,
    seed_ai_studio_defaults,
    update_session_memory,
)
from api.auth import get_current_user
from database.db import get_db
from database.models import AIAgentDefinition, Alert, AppConfig, ChatHistory, Position

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    message: str
    screen_context: Optional[str] = None
    session_id: Optional[str] = None
    provider: Optional[str] = None
    agent_key: Optional[str] = None
    selected_entity_type: Optional[str] = None
    selected_entity_id: Optional[str] = None
    selected_entity_label: Optional[str] = None


def _get_ai_provider(db: Session) -> str:
    config = db.query(AppConfig).filter(AppConfig.key == "ai_provider").first()
    return config.value if config else "claude"


def _build_legacy_system_prompt(db: Session, user: dict) -> str:
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

    try:
        dv = db.execute(text("SELECT name, delay_hours FROM vessels WHERE delay_hours > 0")).fetchall()
        vessel_str = ", ".join(f"{v[0]} (+{v[1]}h)" for v in dv) if dv else "None delayed"
    except Exception:
        vessel_str = "Fleet status loading..."

    return f"""You are Radiant, the AI intelligence layer of the Radiant-MVT trading platform for INEOS Trading & Shipping.

CRITICAL RULE: You NEVER calculate financial figures. Python has already calculated all numbers. You only narrate, explain, and advise based on pre-computed data provided to you.

CURRENT USER: {user.get('full_name', 'Trader')} ({user.get('role', 'trader')}) - {user.get('desk', 'INEOS Trading & Shipping')}
PLATFORM TIME: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}

LIVE MARKET DATA:
{prices_str or 'No prices loaded yet'}

PORTFOLIO STATUS:
- Total MTM P&L: ${total_mtm_pnl:,.0f}
- Portfolio VaR: ${total_var:,.0f} (limit: $8,000,000)
- VaR utilisation: {total_var / 8_000_000 * 100:.1f}%
- Open alerts: {open_alerts} ({critical_alerts} Critical)
- Delayed vessels: {vessel_str}

BEHAVIOUR RULES:
1. Be concise and professional.
2. Always cite the source of any figure in plain language.
3. Never invent prices, P&L figures, or risk metrics.
4. When asked for a recommendation, provide structured options with trade-offs.
5. Keep responses under 300 words unless complexity demands more."""


def _get_history(db: Session, user_id: int, session_id: str, limit: int = 10):
    messages = (
        db.query(ChatHistory)
        .filter(ChatHistory.user_id == user_id, ChatHistory.session_id == session_id)
        .order_by(ChatHistory.timestamp.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(messages))


def _selected_entity_from_message(msg: ChatMessage) -> Optional[dict]:
    if not any([msg.selected_entity_type, msg.selected_entity_id, msg.selected_entity_label]):
        return None
    return {
        "type": msg.selected_entity_type,
        "id": msg.selected_entity_id,
        "label": msg.selected_entity_label,
    }


def _resolve_chat_agent(db: Session, agent_key: Optional[str]) -> Optional[AIAgentDefinition]:
    seed_ai_studio_defaults(db)
    if agent_key:
        agent = (
            db.query(AIAgentDefinition)
            .filter(AIAgentDefinition.agent_key == agent_key, AIAgentDefinition.is_active == 1)
            .first()
        )
        if agent:
            return agent
    return get_default_chat_agent(db)


def _store_assistant_message(
    db: Session,
    user_id: int,
    session_id: str,
    response_text: str,
    screen_context: str | None,
    selected_entity: dict | None,
    agent_key: str | None,
):
    db.add(ChatHistory(
        user_id=user_id,
        session_id=session_id,
        role="assistant",
        content=response_text,
        screen_context=screen_context,
        selected_entity_type=(selected_entity or {}).get("type"),
        selected_entity_id=(selected_entity or {}).get("id"),
        selected_entity_label=(selected_entity or {}).get("label"),
        agent_key=agent_key,
    ))
    db.commit()


@router.get("/app-guide")
async def get_app_guide(
    format: str = Query(default="json"),
    current_user=Depends(get_current_user),
):
    payload = get_app_manual_payload()
    if str(format).lower() == "markdown":
        payload["markdown"] = render_app_manual_markdown()
    return payload


@router.post("/")
async def chat(
    msg: ChatMessage,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_id = current_user.get("id", 1)
    session_id = msg.session_id or f"session_{user_id}_{datetime.utcnow().date()}"
    selected_entity = _selected_entity_from_message(msg)
    if selected_entity and selected_entity.get("type") == "email" and not selected_entity.get("label"):
        selected_entity["label"] = "Selected email"
    agent = _resolve_chat_agent(db, msg.agent_key)
    provider_override = msg.provider if msg.provider in ("claude", "local") else None
    copilot_plan = build_copilot_plan(db, msg.message, msg.screen_context, selected_entity)

    db.add(ChatHistory(
        user_id=user_id,
        session_id=session_id,
        role="user",
        content=msg.message,
        screen_context=msg.screen_context,
        selected_entity_type=(selected_entity or {}).get("type"),
        selected_entity_id=(selected_entity or {}).get("id"),
        selected_entity_label=(selected_entity or {}).get("label"),
        agent_key=agent.agent_key if agent else msg.agent_key,
    ))
    db.commit()

    if copilot_plan.get("should_handle_directly"):
        response_text = copilot_plan.get("response") or "I'm ready to help with the app."
        _store_assistant_message(
            db,
            user_id,
            session_id,
            response_text,
            msg.screen_context,
            selected_entity,
            agent.agent_key if agent else msg.agent_key,
        )
        update_session_memory(
            db,
            user_id,
            session_id,
            msg.screen_context,
            selected_entity,
            agent.agent_key if agent else msg.agent_key,
            msg.message,
            assistant_response=response_text,
        )
        return {
            "response": response_text,
            "session_id": session_id,
            "copilot": copilot_plan.get("client"),
        }

    if agent:
        try:
            runtime_context = build_runtime_context(
                db,
                current_user,
                msg.screen_context or "dashboard",
                session_id,
                selected_entity=selected_entity,
            )
            prompts = compile_agent_prompts(agent, runtime_context, msg.message)
            full_response = ""

            async def generate():
                nonlocal full_response
                async for text_chunk in run_agent_generation(
                    agent,
                    prompts,
                    provider_override=provider_override,
                    stream=True,
                ):
                    full_response += text_chunk
                    yield f"data: {json.dumps({'chunk': text_chunk})}\n\n"
                if copilot_plan.get("client", {}).get("actions") or copilot_plan.get("client", {}).get("matched_screens"):
                    yield f"data: {json.dumps({'copilot': copilot_plan.get('client')})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
                _store_assistant_message(
                    db,
                    user_id,
                    session_id,
                    full_response,
                    msg.screen_context,
                    selected_entity,
                    agent.agent_key,
                )
                update_session_memory(
                    db,
                    user_id,
                    session_id,
                    msg.screen_context,
                    selected_entity,
                    agent.agent_key,
                    msg.message,
                    assistant_response=full_response,
                )

            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        except Exception as exc:
            logger.exception("AI Studio chat flow failed, falling back to legacy prompt: %s", exc)

    provider = provider_override or _get_ai_provider(db)
    _ = _build_legacy_system_prompt(db, current_user)
    if copilot_plan.get("response"):
        response_text = copilot_plan["response"]
    elif provider == "claude":
        response_text = (
            f"[Demo Mode - Claude API key not configured] You asked: {msg.message}. "
            "In production, Radiant would provide detailed trading intelligence based on live desk context."
        )
    else:
        response_text = (
            f"[Local LLM fallback unavailable] Your request was captured: {msg.message}. "
            "Open AI Studio to configure the active chat agent or provider."
        )

    _store_assistant_message(
        db,
        user_id,
        session_id,
        response_text,
        msg.screen_context,
        selected_entity,
        agent.agent_key if agent else msg.agent_key,
    )
    update_session_memory(
        db,
        user_id,
        session_id,
        msg.screen_context,
        selected_entity,
        agent.agent_key if agent else msg.agent_key,
        msg.message,
        assistant_response=response_text,
    )

    return {
        "response": response_text,
        "session_id": session_id,
        "copilot": copilot_plan.get("client"),
    }


@router.post("/message")
async def chat_message(
    msg: ChatMessage,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await chat(msg, db, current_user)


@router.get("/history")
async def get_history(
    session_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_id = current_user.get("id", 1)
    query = db.query(ChatHistory).filter(ChatHistory.user_id == user_id)
    if session_id:
        query = query.filter(ChatHistory.session_id == session_id)
    messages = query.order_by(ChatHistory.timestamp.desc()).limit(limit).all()
    return [
        {
            "role": item.role,
            "content": item.content,
            "timestamp": str(item.timestamp),
            "screen_context": item.screen_context,
            "selected_entity_type": item.selected_entity_type,
            "selected_entity_id": item.selected_entity_id,
            "selected_entity_label": item.selected_entity_label,
            "agent_key": item.agent_key,
        }
        for item in reversed(messages)
    ]
