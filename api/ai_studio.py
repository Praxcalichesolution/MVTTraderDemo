import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ai.studio import (
    SUPPORTED_OUTPUT_FORMATS,
    SUPPORTED_SCREENS,
    SUPPORTED_TOOLS,
    build_runtime_context,
    compile_agent_prompts,
    get_default_chat_agent,
    get_or_create_user_profile,
    record_agent_version,
    run_agent_generation_full,
    seed_ai_studio_defaults,
    serialize_agent,
    serialize_agent_version,
    serialize_user_profile,
    upsert_user_profile,
)
from api.auth import get_current_user
from database.db import get_db
from database.models import AIAgentDefinition, AIAgentVersion, AIUserContextProfile, User

router = APIRouter()


class SelectedEntity(BaseModel):
    type: str
    id: Optional[str] = None
    label: Optional[str] = None


class AgentPayload(BaseModel):
    agent_key: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = "general"
    purpose: Optional[str] = None
    instructions: Optional[str] = None
    system_prompt_template: str
    user_prompt_template: Optional[str] = None
    model_provider: Optional[str] = "claude"
    model_name: Optional[str] = "claude-sonnet-4-6"
    temperature: Optional[float] = Field(default=0.2, ge=0, le=1.5)
    max_tokens: Optional[int] = Field(default=1400, ge=128, le=8000)
    provider_settings: Optional[dict[str, Any]] = None
    allowed_tools: Optional[list[str]] = None
    allowed_screens: Optional[list[str]] = None
    output_format: Optional[str] = "narrative"
    response_style: Optional[str] = None
    is_active: Optional[bool] = True
    is_chat_default: Optional[bool] = False
    change_summary: Optional[str] = None


class AgentTestPayload(BaseModel):
    message: str
    screen_context: Optional[str] = "ai-studio"
    session_id: Optional[str] = None
    selected_entity: Optional[SelectedEntity] = None
    provider_override: Optional[str] = None


class ProfilePayload(BaseModel):
    role: Optional[str] = None
    desk_team: Optional[str] = None
    industries_covered: Optional[list[str]] = None
    commodities_covered: Optional[list[str]] = None
    regions_covered: Optional[list[str]] = None
    preferred_answer_style: Optional[str] = None
    risk_appetite: Optional[str] = None
    review_posture: Optional[str] = None
    default_focus_areas: Optional[list[str]] = None
    analyst_preferences: Optional[list[str]] = None
    persistent_notes: Optional[str] = None


def _require_agent_admin(current_user: dict):
    if current_user.get("role") not in ("admin", "executive", "risk"):
        raise HTTPException(status_code=403, detail="AI Studio administration requires admin, executive, or risk role")


def _load_agent(db: Session, agent_id: int) -> AIAgentDefinition:
    agent = db.query(AIAgentDefinition).filter(AIAgentDefinition.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/overview")
async def get_ai_studio_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    agents = (
        db.query(AIAgentDefinition)
        .order_by(AIAgentDefinition.category.asc(), AIAgentDefinition.name.asc())
        .all()
    )
    profile = get_or_create_user_profile(db, current_user)
    default_chat_agent = get_default_chat_agent(db)
    users = []
    if current_user.get("role") in ("admin", "executive", "risk"):
        users = [
            {
                "id": user.id,
                "full_name": user.full_name,
                "role": user.role,
                "desk": user.desk,
            }
            for user in db.query(User).filter(User.is_active == 1).order_by(User.full_name.asc()).all()
        ]
    return {
        "agents": [serialize_agent(agent) for agent in agents],
        "profile": serialize_user_profile(profile, current_user),
        "defaults": {
            "screens": SUPPORTED_SCREENS,
            "tools": SUPPORTED_TOOLS,
            "output_formats": SUPPORTED_OUTPUT_FORMATS,
            "default_chat_agent_id": default_chat_agent.id if default_chat_agent else None,
        },
        "users": users,
    }


@router.get("/agents")
async def list_agents(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    agents = db.query(AIAgentDefinition).order_by(AIAgentDefinition.name.asc()).all()
    return {"agents": [serialize_agent(agent) for agent in agents]}


@router.get("/agents/{agent_id}")
async def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    return serialize_agent(_load_agent(db, agent_id))


@router.post("/agents")
async def create_agent(
    payload: AgentPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_agent_admin(current_user)
    seed_ai_studio_defaults(db)
    existing = db.query(AIAgentDefinition).filter(AIAgentDefinition.agent_key == payload.agent_key).first()
    if existing:
        raise HTTPException(status_code=400, detail="agent_key already exists")
    if payload.output_format not in SUPPORTED_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported output_format")
    agent = AIAgentDefinition(
        agent_key=payload.agent_key,
        name=payload.name,
        description=payload.description,
        category=payload.category or "general",
        purpose=payload.purpose,
        instructions=payload.instructions,
        system_prompt_template=payload.system_prompt_template,
        user_prompt_template=payload.user_prompt_template,
        model_provider=payload.model_provider or "claude",
        model_name=payload.model_name or "claude-sonnet-4-6",
        temperature=payload.temperature or 0.2,
        max_tokens=payload.max_tokens or 1400,
        provider_settings=json.dumps(payload.provider_settings or {}),
        allowed_tools=json.dumps(payload.allowed_tools or []),
        allowed_screens=json.dumps(payload.allowed_screens or []),
        output_format=payload.output_format or "narrative",
        response_style=payload.response_style,
        is_active=1 if payload.is_active else 0,
        is_chat_default=1 if payload.is_chat_default else 0,
        version=1,
        created_by_user_id=current_user["id"],
        updated_by_user_id=current_user["id"],
    )
    if agent.is_chat_default:
        db.query(AIAgentDefinition).update({AIAgentDefinition.is_chat_default: 0})
    db.add(agent)
    db.flush()
    record_agent_version(db, agent, current_user["id"], payload.change_summary or "Agent created")
    db.commit()
    db.refresh(agent)
    return serialize_agent(agent)


@router.put("/agents/{agent_id}")
async def update_agent(
    agent_id: int,
    payload: AgentPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_agent_admin(current_user)
    seed_ai_studio_defaults(db)
    agent = _load_agent(db, agent_id)
    if payload.agent_key != agent.agent_key:
        dupe = db.query(AIAgentDefinition).filter(
            AIAgentDefinition.agent_key == payload.agent_key,
            AIAgentDefinition.id != agent.id,
        ).first()
        if dupe:
            raise HTTPException(status_code=400, detail="agent_key already exists")
    if payload.output_format not in SUPPORTED_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported output_format")
    if payload.is_chat_default:
        db.query(AIAgentDefinition).filter(AIAgentDefinition.id != agent.id).update({AIAgentDefinition.is_chat_default: 0})
    agent.agent_key = payload.agent_key
    agent.name = payload.name
    agent.description = payload.description
    agent.category = payload.category or "general"
    agent.purpose = payload.purpose
    agent.instructions = payload.instructions
    agent.system_prompt_template = payload.system_prompt_template
    agent.user_prompt_template = payload.user_prompt_template
    agent.model_provider = payload.model_provider or "claude"
    agent.model_name = payload.model_name or "claude-sonnet-4-6"
    agent.temperature = payload.temperature or 0.2
    agent.max_tokens = payload.max_tokens or 1400
    agent.provider_settings = json.dumps(payload.provider_settings or {})
    agent.allowed_tools = json.dumps(payload.allowed_tools or [])
    agent.allowed_screens = json.dumps(payload.allowed_screens or [])
    agent.output_format = payload.output_format or "narrative"
    agent.response_style = payload.response_style
    agent.is_active = 1 if payload.is_active else 0
    agent.is_chat_default = 1 if payload.is_chat_default else 0
    agent.version = int(agent.version or 1) + 1
    agent.updated_by_user_id = current_user["id"]
    agent.updated_at = datetime.utcnow()
    record_agent_version(db, agent, current_user["id"], payload.change_summary or "Agent updated")
    db.commit()
    db.refresh(agent)
    return serialize_agent(agent)


@router.get("/agents/{agent_id}/versions")
async def list_agent_versions(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _load_agent(db, agent_id)
    versions = (
        db.query(AIAgentVersion)
        .filter(AIAgentVersion.agent_id == agent_id)
        .order_by(AIAgentVersion.version_number.desc(), AIAgentVersion.created_at.desc())
        .all()
    )
    return {"versions": [serialize_agent_version(version) for version in versions]}


@router.post("/agents/{agent_id}/test")
async def test_agent(
    agent_id: int,
    payload: AgentTestPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    agent = _load_agent(db, agent_id)
    session_id = payload.session_id or f"studio_test_{current_user['id']}"
    runtime_context = build_runtime_context(
        db,
        current_user,
        payload.screen_context or "ai-studio",
        session_id,
        payload.selected_entity.model_dump() if payload.selected_entity else None,
    )
    prompts = compile_agent_prompts(agent, runtime_context, payload.message)
    response = await run_agent_generation_full(agent, prompts, provider_override=payload.provider_override)
    return {
        "agent": serialize_agent(agent),
        "runtime_context": {
            "screen_context": runtime_context["screen_context"],
            "selected_entity_label": runtime_context["selected_entity_label"],
            "session_memory": runtime_context["session_memory"],
            "user_profile_summary": runtime_context["user_profile_summary"],
        },
        "compiled_prompts": prompts,
        "response": response,
    }


@router.get("/profile/me")
async def get_my_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    profile = get_or_create_user_profile(db, current_user)
    return serialize_user_profile(profile, current_user)


@router.put("/profile/me")
async def update_my_profile(
    payload: ProfilePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    seed_ai_studio_defaults(db)
    profile = upsert_user_profile(db, current_user, payload.model_dump(exclude_none=False))
    return serialize_user_profile(profile, current_user)


@router.get("/profiles")
async def list_profiles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_agent_admin(current_user)
    profiles = db.query(AIUserContextProfile).order_by(AIUserContextProfile.updated_at.desc()).all()
    users = {user.id: user for user in db.query(User).filter(User.is_active == 1).all()}
    return {
        "profiles": [
            serialize_user_profile(
                profile,
                {
                    "id": profile.user_id,
                    "role": getattr(users.get(profile.user_id), "role", None),
                    "desk": getattr(users.get(profile.user_id), "desk", None),
                },
            )
            for profile in profiles
        ]
    }
