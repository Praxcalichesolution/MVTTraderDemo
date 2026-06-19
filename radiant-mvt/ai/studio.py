import json
from collections import Counter
from datetime import datetime
from typing import Any, AsyncGenerator

from sqlalchemy import text
from sqlalchemy.orm import Session

from ai.app_manual import get_runtime_manual_context
from ai.claude_adapter import generate_claude
from ai.local_adapter import generate_local
from database.models import (
    AIAgentDefinition,
    AIAgentVersion,
    AISessionMemory,
    AIUserContextProfile,
    Alert,
    ChatHistory,
    DecisionQueue,
    MarketData,
    News,
    Position,
    Trade,
    User,
    Vessel,
    Email,
    ExternalConnector,
)


SUPPORTED_SCREENS = [
    "decision-queue",
    "dashboard",
    "positions",
    "ai",
    "performance",
    "decision-intelligence",
    "market",
    "vessels",
    "comms",
    "compliance",
    "configuration",
    "documentation",
    "ai-studio",
    "boardroom",
    "admin",
]

SUPPORTED_OUTPUT_FORMATS = [
    "narrative",
    "bullet_summary",
    "executive_memo",
    "json",
    "decision_options",
]

SUPPORTED_TOOLS = [
    "market_snapshot",
    "position_snapshot",
    "decision_queue",
    "news_digest",
    "vessel_status",
    "chat_history",
    "user_profile",
    "app_manual",
    "screen_navigation",
    "ui_actions",
]


class SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _json_load(value: Any, fallback: Any):
    if value in (None, ""):
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _json_dump(value: Any) -> str:
    return json.dumps(value or [], ensure_ascii=True)


def _coerce_list(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return []
        if text_value.startswith("["):
            parsed = _json_load(text_value, [])
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in text_value.split(",") if item.strip()]
    return [str(value).strip()]


def _list_to_display(value: Any) -> str:
    items = _coerce_list(value)
    return ", ".join(items) if items else "Not specified"


def serialize_agent(agent: AIAgentDefinition) -> dict[str, Any]:
    return {
        "id": agent.id,
        "agent_key": agent.agent_key,
        "name": agent.name,
        "description": agent.description,
        "category": agent.category,
        "purpose": agent.purpose,
        "instructions": agent.instructions,
        "system_prompt_template": agent.system_prompt_template,
        "user_prompt_template": agent.user_prompt_template,
        "model_provider": agent.model_provider,
        "model_name": agent.model_name,
        "temperature": float(agent.temperature or 0),
        "max_tokens": int(agent.max_tokens or 0),
        "provider_settings": _json_load(agent.provider_settings, {}),
        "allowed_tools": _json_load(agent.allowed_tools, []),
        "allowed_screens": _json_load(agent.allowed_screens, []),
        "output_format": agent.output_format,
        "response_style": agent.response_style,
        "is_active": int(agent.is_active or 0),
        "is_chat_default": int(agent.is_chat_default or 0),
        "version": agent.version or 1,
        "created_by_user_id": agent.created_by_user_id,
        "updated_by_user_id": agent.updated_by_user_id,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
    }


def serialize_agent_version(version: AIAgentVersion) -> dict[str, Any]:
    return {
        "id": version.id,
        "agent_id": version.agent_id,
        "version_number": version.version_number,
        "change_summary": version.change_summary,
        "snapshot": _json_load(version.snapshot_json, {}),
        "changed_by_user_id": version.changed_by_user_id,
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }


def serialize_user_profile(profile: AIUserContextProfile, user: dict | None = None) -> dict[str, Any]:
    user = user or {}
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "role": profile.role_profile or user.get("role"),
        "desk_team": profile.desk_team or user.get("desk"),
        "industries_covered": _coerce_list(profile.industries_covered),
        "commodities_covered": _coerce_list(profile.commodities_covered),
        "regions_covered": _coerce_list(profile.regions_covered),
        "preferred_answer_style": profile.preferred_answer_style or "Concise trader summary",
        "risk_appetite": profile.risk_appetite or "Balanced",
        "review_posture": profile.review_posture or "Escalate material risks, keep routine analysis direct",
        "default_focus_areas": _coerce_list(profile.default_focus_areas),
        "analyst_preferences": _coerce_list(profile.analyst_preferences),
        "persistent_notes": profile.persistent_notes or "",
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def describe_user_profile(profile: AIUserContextProfile, user: dict | None = None) -> str:
    data = serialize_user_profile(profile, user)
    return (
        f"Role: {data['role'] or 'Not specified'}\n"
        f"Desk / Team: {data['desk_team'] or 'Not specified'}\n"
        f"Industries: {_list_to_display(data['industries_covered'])}\n"
        f"Commodities: {_list_to_display(data['commodities_covered'])}\n"
        f"Regions: {_list_to_display(data['regions_covered'])}\n"
        f"Preferred answer style: {data['preferred_answer_style']}\n"
        f"Risk appetite: {data['risk_appetite']}\n"
        f"Review posture: {data['review_posture']}\n"
        f"Default focus areas: {_list_to_display(data['default_focus_areas'])}\n"
        f"Analyst preferences: {_list_to_display(data['analyst_preferences'])}\n"
        f"Persistent notes: {data['persistent_notes'] or 'None'}"
    )


def record_agent_version(
    db: Session,
    agent: AIAgentDefinition,
    changed_by_user_id: int | None = None,
    change_summary: str | None = None,
) -> AIAgentVersion:
    version = AIAgentVersion(
        agent_id=agent.id,
        version_number=agent.version or 1,
        change_summary=change_summary or "Configuration updated",
        snapshot_json=json.dumps(serialize_agent(agent), ensure_ascii=True),
        changed_by_user_id=changed_by_user_id,
    )
    db.add(version)
    db.flush()
    return version


DEFAULT_AGENT_DEFINITIONS = [
    {
        "agent_key": "daily_briefing",
        "name": "Daily Briefing Agent",
        "description": "Builds the trader's morning brief from live desk context, risk, market, and decisions.",
        "category": "briefing",
        "purpose": "Create an opening briefing that tells the desk what matters now, what changed, and what to do first.",
        "instructions": (
            "Prioritise material market moves, top decision deadlines, alert escalation, and any vessel or counterparty issue "
            "that changes today's operating posture. Use concise executive language and end with recommended first actions."
        ),
        "system_prompt_template": (
            "You are {agent_name} inside the Radiant-MVT trading platform for INEOS Trading & Shipping.\n\n"
            "Purpose:\n{agent_purpose}\n\n"
            "Operating instructions:\n{agent_instructions}\n\n"
            "User:\n- Name: {user_name}\n- Role: {user_role}\n- Desk: {user_desk}\n- Title: {user_title}\n\n"
            "Persistent user context:\n{user_profile_summary}\n\n"
            "Runtime context:\n- Current screen: {screen_context}\n- Selected entity: {selected_entity_label}\n- Session memory: {session_memory}\n- Platform time: {platform_time}\n\n"
            "Live desk snapshot:\n{portfolio_snapshot}\n\n"
            "Market snapshot:\n{market_snapshot}\n\n"
            "Rules:\n"
            "1. Never invent figures; only narrate the supplied platform context.\n"
            "2. Treat all numbers as pre-computed by platform services.\n"
            "3. Highlight deadlines, risk concentrations, and recommended actions.\n"
            "4. Keep the tone enterprise-grade and direct."
        ),
        "user_prompt_template": (
            "Produce the daily briefing for this user.\n\n"
            "Request: {user_message}\n"
            "If the request is generic, assume they want the opening brief for their current screen and priorities."
        ),
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.2,
        "max_tokens": 1200,
        "allowed_tools": ["market_snapshot", "position_snapshot", "decision_queue", "news_digest"],
        "allowed_screens": ["decision-queue", "dashboard", "market"],
        "output_format": "executive_memo",
        "response_style": "Short executive brief with action bullets",
    },
    {
        "agent_key": "market_risk_summary",
        "name": "Market Risk Summary Agent",
        "description": "Summarises risk concentration, portfolio pressure points, and current market drivers.",
        "category": "risk",
        "purpose": "Explain what is driving current market risk and which exposures deserve immediate attention.",
        "instructions": "Lead with the most material exposures, then connect them to current market and alert context.",
        "system_prompt_template": (
            "You are {agent_name} for Radiant-MVT.\nPurpose: {agent_purpose}\nInstructions: {agent_instructions}\n\n"
            "User context:\n{user_profile_summary}\n\n"
            "Screen: {screen_context}\nSelected entity: {selected_entity_summary}\nSession memory: {session_memory}\n\n"
            "Portfolio snapshot:\n{portfolio_snapshot}\n\n"
            "Market snapshot:\n{market_snapshot}\n\n"
            "Output format: {output_format}. Never fabricate numbers."
        ),
        "user_prompt_template": "User request: {user_message}",
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.15,
        "max_tokens": 1000,
        "allowed_tools": ["market_snapshot", "position_snapshot", "decision_queue"],
        "allowed_screens": ["positions", "dashboard", "market"],
        "output_format": "bullet_summary",
        "response_style": "Risk-first summary",
    },
    {
        "agent_key": "decision_queue_analyst",
        "name": "Decision Queue Analyst Agent",
        "description": "Explains priority decisions, deadlines, and trade-offs in the queue.",
        "category": "workflow",
        "purpose": "Turn the decision queue into clear next-best actions with trade-offs and escalation notes.",
        "instructions": "Rank urgency, explain why each item matters, and show what can wait without hiding risk.",
        "system_prompt_template": (
            "You are {agent_name}. Purpose: {agent_purpose}\nInstructions: {agent_instructions}\n\n"
            "User: {user_name} ({user_role})\nCurrent screen: {screen_context}\nSelected entity: {selected_entity_summary}\n\n"
            "Decision queue snapshot is embedded inside the live desk context below.\n{portfolio_snapshot}\n\n"
            "Session memory:\n{session_memory}"
        ),
        "user_prompt_template": "Analyse the decision queue for this request: {user_message}",
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.2,
        "max_tokens": 1000,
        "allowed_tools": ["decision_queue", "position_snapshot", "vessel_status"],
        "allowed_screens": ["decision-queue", "dashboard", "vessels"],
        "output_format": "decision_options",
        "response_style": "Ranked decision note",
    },
    {
        "agent_key": "position_exposure_narrative",
        "name": "Position / Exposure Narrative Agent",
        "description": "Turns book and position data into an exposure narrative for traders, risk, or executives.",
        "category": "portfolio",
        "purpose": "Translate positions into a concise narrative about what the book is long, short, and sensitive to.",
        "instructions": "Connect exposure, P&L, and market context. Use the user's preferred level of detail.",
        "system_prompt_template": (
            "You are {agent_name}.\nPurpose: {agent_purpose}\nInstructions: {agent_instructions}\n\n"
            "User profile:\n{user_profile_summary}\n\n"
            "Current screen: {screen_context}\nSelected entity: {selected_entity_summary}\n\n"
            "Portfolio snapshot:\n{portfolio_snapshot}\nMarket snapshot:\n{market_snapshot}"
        ),
        "user_prompt_template": "Provide the exposure narrative requested here: {user_message}",
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.2,
        "max_tokens": 1000,
        "allowed_tools": ["position_snapshot", "market_snapshot"],
        "allowed_screens": ["positions", "dashboard", "boardroom"],
        "output_format": "narrative",
        "response_style": "Analyst narrative",
    },
    {
        "agent_key": "news_impact",
        "name": "News Impact Agent",
        "description": "Assesses how live news could affect the user's current book and operating priorities.",
        "category": "news",
        "purpose": "Explain whether a headline matters, how it could transmit to the book, and what follow-up is warranted.",
        "instructions": "Tie headlines to exposures, counterparties, vessels, or decisions whenever possible.",
        "system_prompt_template": (
            "You are {agent_name}.\nPurpose: {agent_purpose}\nInstructions: {agent_instructions}\n\n"
            "User: {user_name} / {user_role}\nScreen: {screen_context}\nSelected entity: {selected_entity_summary}\n\n"
            "Persistent context:\n{user_profile_summary}\n\n"
            "Market snapshot:\n{market_snapshot}\nPortfolio snapshot:\n{portfolio_snapshot}"
        ),
        "user_prompt_template": "Assess the impact of this request or headline: {user_message}",
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.25,
        "max_tokens": 900,
        "allowed_tools": ["news_digest", "position_snapshot", "market_snapshot"],
        "allowed_screens": ["market", "dashboard", "ai"],
        "output_format": "bullet_summary",
        "response_style": "Headline impact note",
    },
    {
        "agent_key": "escalation_exception",
        "name": "Escalation / Exception Agent",
        "description": "Drafts escalation-quality summaries for exceptions, breaches, and operating incidents.",
        "category": "governance",
        "purpose": "Prepare an escalation summary that is factual, high-signal, and suitable for management review.",
        "instructions": "State the issue, impact, control posture, owner, and recommended next decision in a disciplined format.",
        "system_prompt_template": (
            "You are {agent_name}.\nPurpose: {agent_purpose}\nInstructions: {agent_instructions}\n\n"
            "User profile:\n{user_profile_summary}\n\n"
            "Screen: {screen_context}\nSelected entity: {selected_entity_summary}\nSession memory: {session_memory}\n\n"
            "Portfolio snapshot:\n{portfolio_snapshot}"
        ),
        "user_prompt_template": "Prepare the escalation or exception summary for: {user_message}",
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.1,
        "max_tokens": 900,
        "allowed_tools": ["decision_queue", "vessel_status", "position_snapshot", "chat_history"],
        "allowed_screens": ["decision-queue", "positions", "vessels", "compliance"],
        "output_format": "executive_memo",
        "response_style": "Escalation memo",
    },
    {
        "agent_key": "chat_copilot",
        "name": "Chat Copilot Agent",
        "description": "Default conversational copilot for Trader, aware of screen, entity, user profile, and session memory.",
        "category": "chat",
        "purpose": "Answer user questions with full application context while preserving the current Trader copilot experience.",
        "instructions": (
            "Be concise and professional. Never invent figures. Reference the current screen and selected entity when helpful. "
            "Use session memory to stay consistent, but prioritise the latest user instruction."
        ),
        "system_prompt_template": (
            "You are {agent_name}, the Radiant-MVT AI copilot for INEOS Trading & Shipping.\n\n"
            "Purpose:\n{agent_purpose}\n\n"
            "Instructions:\n{agent_instructions}\n\n"
            "Current user:\n- Name: {user_name}\n- Role: {user_role}\n- Desk: {user_desk}\n- Title: {user_title}\n\n"
            "Persistent user context:\n{user_profile_summary}\n\n"
            "Live runtime context:\n"
            "- Screen: {screen_context}\n"
            "- Selected entity: {selected_entity_label}\n"
            "- Selected entity summary: {selected_entity_summary}\n"
            "- Session memory: {session_memory}\n"
            "- Platform time: {platform_time}\n\n"
            "Live desk snapshot:\n{portfolio_snapshot}\n\n"
            "Market snapshot:\n{market_snapshot}\n\n"
            "Application manual overview:\n{app_manual_overview}\n\n"
            "Application screen index:\n{app_screen_index}\n\n"
            "Current screen manual:\n{current_screen_manual}\n"
            "Current screen features:\n{current_screen_features}\n\n"
            "Rules:\n"
            "1. Never calculate financial figures yourself; narrate only supplied numbers.\n"
            "2. If the user asks for recommendations, provide options and trade-offs.\n"
            "3. Keep answers under 300 words unless the user asks for more detail.\n"
            "4. Treat this as an enterprise trading copilot, not a generic chatbot.\n"
            "5. Mention when the answer is based on the selected entity or user profile if that materially changes the response.\n"
            "6. If the user asks where a feature lives or how to do a task in the app, answer from the application manual context first."
        ),
        "user_prompt_template": (
            "User question:\n{user_message}\n\n"
            "If relevant, anchor the answer to the current screen, selected entity, user role, and session memory."
        ),
        "model_provider": "claude",
        "model_name": "claude-sonnet-4-6",
        "temperature": 0.2,
        "max_tokens": 1400,
        "allowed_tools": SUPPORTED_TOOLS,
        "allowed_screens": SUPPORTED_SCREENS,
        "output_format": "narrative",
        "response_style": "Concise trader response",
        "is_chat_default": 1,
    },
]


def seed_ai_studio_defaults(db: Session) -> dict[str, int]:
    admin = db.query(User).filter(User.role == "admin").first()
    admin_id = admin.id if admin else None
    created_agents = 0
    created_profiles = 0

    for definition in DEFAULT_AGENT_DEFINITIONS:
        agent = db.query(AIAgentDefinition).filter(AIAgentDefinition.agent_key == definition["agent_key"]).first()
        if agent:
            continue
        agent = AIAgentDefinition(
            agent_key=definition["agent_key"],
            name=definition["name"],
            description=definition.get("description"),
            category=definition.get("category", "general"),
            purpose=definition.get("purpose"),
            instructions=definition.get("instructions"),
            system_prompt_template=definition["system_prompt_template"],
            user_prompt_template=definition.get("user_prompt_template"),
            model_provider=definition.get("model_provider", "claude"),
            model_name=definition.get("model_name", "claude-sonnet-4-6"),
            temperature=definition.get("temperature", 0.2),
            max_tokens=definition.get("max_tokens", 1400),
            provider_settings=_json_dump(definition.get("provider_settings", {})),
            allowed_tools=_json_dump(definition.get("allowed_tools", [])),
            allowed_screens=_json_dump(definition.get("allowed_screens", [])),
            output_format=definition.get("output_format", "narrative"),
            response_style=definition.get("response_style"),
            is_active=1,
            is_chat_default=definition.get("is_chat_default", 0),
            version=1,
            created_by_user_id=admin_id,
            updated_by_user_id=admin_id,
        )
        db.add(agent)
        db.flush()
        record_agent_version(db, agent, admin_id, "Seeded default configuration")
        created_agents += 1

    users = db.query(User).filter(User.is_active == 1).all()
    for user in users:
        profile = db.query(AIUserContextProfile).filter(AIUserContextProfile.user_id == user.id).first()
        if profile:
            continue
        default_preferences = {
            "trader": ["Action-first output", "Keep to first-order impacts", "Highlight deadline risk"],
            "risk": ["Stress downside first", "Flag controls and breach posture", "Include assumptions"],
            "executive": ["Executive summary first", "Focus on materiality", "State decision needed"],
            "admin": ["Operational status clarity", "Call out failures", "Include remediation next steps"],
        }
        profile = AIUserContextProfile(
            user_id=user.id,
            role_profile=user.role,
            desk_team=user.desk or "INEOS Trading & Shipping",
            industries_covered=_json_dump(["Refining", "Energy Trading", "Shipping"]),
            commodities_covered=_json_dump(["Brent", "WTI", "Urals", "Ethane", "NGLs", "EUA"]),
            regions_covered=_json_dump(["North Sea", "Europe", "US Gulf", "Atlantic Basin"]),
            preferred_answer_style="Concise trader summary" if user.role == "trader" else "Structured management summary",
            risk_appetite="Balanced" if user.role in ("trader", "executive") else "Conservative",
            review_posture="Escalate material risks; keep routine analysis direct",
            default_focus_areas=_json_dump(["Risk", "PnL", "Decisions"]),
            analyst_preferences=_json_dump(default_preferences.get(user.role, ["Be concise"])),
            persistent_notes=(
                "Treat this user as an experienced energy-market professional. "
                "Use platform context before broad macro commentary."
            ),
        )
        db.add(profile)
        created_profiles += 1

    if created_agents or created_profiles:
        db.commit()
    return {"created_agents": created_agents, "created_profiles": created_profiles}


def get_default_chat_agent(db: Session) -> AIAgentDefinition | None:
    agent = (
        db.query(AIAgentDefinition)
        .filter(AIAgentDefinition.is_active == 1, AIAgentDefinition.is_chat_default == 1)
        .order_by(AIAgentDefinition.updated_at.desc())
        .first()
    )
    if agent:
        return agent
    return (
        db.query(AIAgentDefinition)
        .filter(AIAgentDefinition.is_active == 1, AIAgentDefinition.agent_key == "chat_copilot")
        .first()
    )


def get_or_create_user_profile(db: Session, user: dict) -> AIUserContextProfile:
    profile = db.query(AIUserContextProfile).filter(AIUserContextProfile.user_id == user["id"]).first()
    if profile:
        return profile
    seed_ai_studio_defaults(db)
    profile = db.query(AIUserContextProfile).filter(AIUserContextProfile.user_id == user["id"]).first()
    if profile:
        return profile
    profile = AIUserContextProfile(
        user_id=user["id"],
        role_profile=user.get("role"),
        desk_team=user.get("desk"),
        preferred_answer_style="Concise trader summary",
        risk_appetite="Balanced",
        review_posture="Escalate material risks; keep routine analysis direct",
        industries_covered=_json_dump([]),
        commodities_covered=_json_dump([]),
        regions_covered=_json_dump([]),
        default_focus_areas=_json_dump([]),
        analyst_preferences=_json_dump([]),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def upsert_user_profile(db: Session, user: dict, payload: dict[str, Any]) -> AIUserContextProfile:
    profile = get_or_create_user_profile(db, user)
    for field in [
        "preferred_answer_style",
        "risk_appetite",
        "review_posture",
        "persistent_notes",
    ]:
        if field in payload:
            setattr(profile, field, payload.get(field) or None)
    if "role" in payload:
        profile.role_profile = payload.get("role") or user.get("role")
    if "desk_team" in payload:
        profile.desk_team = payload.get("desk_team") or user.get("desk")
    for list_field in [
        "industries_covered",
        "commodities_covered",
        "regions_covered",
        "default_focus_areas",
        "analyst_preferences",
    ]:
        if list_field in payload:
            setattr(profile, list_field, _json_dump(payload.get(list_field)))
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


def _market_snapshot(db: Session) -> str:
    try:
        rows = db.execute(text(
            """
            SELECT commodity, price, change_pct_1d
            FROM market_data md
            WHERE id IN (SELECT MAX(id) FROM market_data GROUP BY commodity)
            ORDER BY commodity
            """
        )).fetchall()
    except Exception:
        rows = []
    if not rows:
        return "Market data unavailable."
    return "\n".join(
        f"- {row[0]}: {float(row[1] or 0):,.2f} ({float(row[2] or 0):+,.2f}% 1d)"
        for row in rows[:10]
    )


def _portfolio_snapshot(db: Session) -> str:
    try:
        positions = db.query(Position).all()
        total_pnl = sum(float(position.mtm_pnl or 0) for position in positions)
        total_var = sum(float(position.var_contribution or 0) for position in positions)
        top_positions = sorted(positions, key=lambda item: abs(float(item.net_volume or 0)), reverse=True)[:5]
    except Exception:
        positions = []
        total_pnl = 0
        total_var = 0
        top_positions = []
    try:
        decision_count = db.query(DecisionQueue).filter(DecisionQueue.status == "Pending").count()
    except Exception:
        decision_count = 0
    try:
        open_alerts = db.query(Alert).filter(Alert.status == "Open").all()
    except Exception:
        open_alerts = []
    try:
        delayed_vessels = db.query(Vessel).filter(Vessel.delay_hours > 0).all()
    except Exception:
        delayed_vessels = []

    sections = [
        f"Portfolio MTM P&L: ${total_pnl:,.0f}",
        f"Portfolio VaR contribution sum: ${total_var:,.0f}",
        f"Pending decisions: {decision_count}",
        f"Open alerts: {len(open_alerts)}",
        f"Delayed vessels: {len(delayed_vessels)}",
    ]
    if top_positions:
        sections.append("Largest live positions:")
        for position in top_positions:
            sections.append(
                f"- {position.commodity} {position.delivery_month or ''} | Net {float(position.net_volume or 0):,.0f} "
                f"{position.volume_unit or ''} | MTM ${float(position.mtm_pnl or 0):,.0f}"
            )
    if open_alerts:
        severity_mix = Counter(alert.severity or "Unknown" for alert in open_alerts)
        sections.append("Alert mix: " + ", ".join(f"{k} {v}" for k, v in severity_mix.items()))
    return "\n".join(sections)


def _selected_entity_context(db: Session, selected_entity: dict[str, Any] | None) -> tuple[str, str]:
    if not selected_entity:
        return "None selected", "No selected record provided."
    entity_type = str(selected_entity.get("type") or "").lower().strip()
    entity_id = selected_entity.get("id")
    label = selected_entity.get("label") or f"{entity_type}:{entity_id}"
    if not entity_type or entity_id in (None, ""):
        return label or "None selected", "Selected record metadata incomplete."

    try:
        if entity_type == "trade":
            trade = db.query(Trade).filter(Trade.id == int(entity_id)).first()
            if trade:
                return label, (
                    f"Trade {trade.trade_ref}: {trade.direction} {float(trade.volume or 0):,.0f} {trade.volume_unit or ''} "
                    f"{trade.commodity} @ ${float(trade.price or 0):,.2f} | Status {trade.status}"
                )
        if entity_type == "vessel":
            vessel = db.query(Vessel).filter(Vessel.id == int(entity_id)).first()
            if vessel:
                return label, (
                    f"Vessel {vessel.name}: {vessel.origin_port} -> {vessel.destination_port} | "
                    f"Delay {float(vessel.delay_hours or 0):,.0f}h | Status {vessel.status}"
                )
        if entity_type == "alert":
            alert = db.query(Alert).filter(Alert.id == int(entity_id)).first()
            if alert:
                return label, f"Alert {alert.severity}: {alert.title} | Status {alert.status}"
        if entity_type == "decision":
            decision = db.query(DecisionQueue).filter(DecisionQueue.id == int(entity_id)).first()
            if decision:
                return label, (
                    f"Decision: {decision.title} | Urgency {decision.urgency} | Status {decision.status} | "
                    f"Impact ${float(decision.potential_impact or 0):,.0f}"
                )
        if entity_type == "news":
            news = db.query(News).filter(News.id == int(entity_id)).first()
            if news:
                return label, f"News: {news.headline} | Impact {news.market_impact or 'Unknown'} | Source {news.source or 'Unknown'}"
        if entity_type == "position":
            position = db.query(Position).filter(Position.id == int(entity_id)).first()
            if position:
                return label, (
                    f"Position {position.commodity}: Net {float(position.net_volume or 0):,.0f} {position.volume_unit or ''} | "
                    f"MTM ${float(position.mtm_pnl or 0):,.0f}"
                )
        if entity_type == "email":
            email = db.query(Email).filter(Email.id == int(entity_id)).first()
            if email:
                return label, (
                    f"Email from {email.from_name or email.from_email or 'Unknown sender'}: {email.subject} | "
                    f"Priority {email.ai_priority or 'Unknown'} | Status {email.status}"
                )
        if entity_type == "connector":
            connector = db.query(ExternalConnector).filter(ExternalConnector.id == int(entity_id)).first()
            if connector:
                return label, (
                    f"Connector {connector.name}: {connector.connector_type} via {connector.provider} | "
                    f"Status {connector.last_status or 'Unknown'}"
                )
    except Exception:
        pass
    return label, f"Selected entity {label} ({entity_type})"


def get_or_create_session_memory(db: Session, user_id: int, session_id: str) -> AISessionMemory:
    memory = (
        db.query(AISessionMemory)
        .filter(AISessionMemory.user_id == user_id, AISessionMemory.session_id == session_id)
        .first()
    )
    if memory:
        return memory
    memory = AISessionMemory(user_id=user_id, session_id=session_id)
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


def update_session_memory(
    db: Session,
    user_id: int,
    session_id: str,
    screen_context: str | None,
    selected_entity: dict[str, Any] | None,
    agent_key: str | None,
    user_message: str,
    assistant_response: str | None = None,
) -> AISessionMemory:
    memory = get_or_create_session_memory(db, user_id, session_id)
    label, _summary = _selected_entity_context(db, selected_entity)
    memory.last_screen = screen_context
    memory.selected_entity_type = (selected_entity or {}).get("type")
    memory.selected_entity_id = str((selected_entity or {}).get("id") or "") or None
    memory.selected_entity_label = label if selected_entity else None
    memory.last_agent_key = agent_key
    memory.recent_user_goal = user_message[:400]
    memory.last_message_at = datetime.utcnow()

    recent = (
        db.query(ChatHistory)
        .filter(ChatHistory.user_id == user_id, ChatHistory.session_id == session_id)
        .order_by(ChatHistory.timestamp.desc())
        .limit(4)
        .all()
    )
    recent_lines = []
    for item in reversed(recent):
        if item.role == "user":
            recent_lines.append(f"User: {item.content[:180]}")
        else:
            recent_lines.append(f"Assistant: {item.content[:180]}")
    if assistant_response:
        recent_lines.append(f"Assistant: {assistant_response[:180]}")
    memory.memory_summary = " | ".join(recent_lines)[-1200:]
    memory.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(memory)
    return memory


def build_runtime_context(
    db: Session,
    user: dict,
    screen_context: str | None,
    session_id: str,
    selected_entity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    profile = get_or_create_user_profile(db, user)
    memory = get_or_create_session_memory(db, user["id"], session_id)
    selected_label, selected_summary = _selected_entity_context(db, selected_entity)
    manual_context = get_runtime_manual_context(screen_context)
    context = {
        "platform_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "user_name": user.get("full_name", "Trader"),
        "user_role": user.get("role", "trader"),
        "user_desk": user.get("desk", "INEOS Trading & Shipping"),
        "user_title": user.get("title", ""),
        "screen_context": screen_context or "dashboard",
        "selected_entity_label": selected_label,
        "selected_entity_summary": selected_summary,
        "selected_entity_type": (selected_entity or {}).get("type", ""),
        "session_memory": memory.memory_summary or "No prior session memory yet.",
        "recent_user_goal": memory.recent_user_goal or "",
        "user_profile_summary": describe_user_profile(profile, user),
        "portfolio_snapshot": _portfolio_snapshot(db),
        "market_snapshot": _market_snapshot(db),
        "allowed_screens": ", ".join(SUPPORTED_SCREENS),
        "allowed_tools": ", ".join(SUPPORTED_TOOLS),
        "profile": serialize_user_profile(profile, user),
        **manual_context,
    }
    return context


def compile_agent_prompts(
    agent: AIAgentDefinition,
    runtime_context: dict[str, Any],
    user_message: str,
) -> dict[str, str]:
    data = SafeDict(runtime_context.copy())
    data["agent_name"] = agent.name
    data["agent_purpose"] = agent.purpose or ""
    data["agent_instructions"] = agent.instructions or ""
    data["output_format"] = agent.output_format or "narrative"
    data["response_style"] = agent.response_style or ""
    data["user_message"] = user_message
    system_prompt = (agent.system_prompt_template or "").format_map(data)
    user_prompt_template = agent.user_prompt_template or "{user_message}"
    user_prompt = user_prompt_template.format_map(data)
    return {"system_prompt": system_prompt, "user_prompt": user_prompt}


async def run_agent_generation(
    agent: AIAgentDefinition,
    prompts: dict[str, str],
    provider_override: str | None = None,
    stream: bool = True,
) -> AsyncGenerator[str, None]:
    provider = (provider_override or agent.model_provider or "claude").lower().strip()
    model_name = agent.model_name or ("claude-sonnet-4-6" if provider == "claude" else "llama-3.1-8b-instruct")
    temperature = float(agent.temperature or 0.2)
    max_tokens = int(agent.max_tokens or 1200)
    provider_settings = _json_load(agent.provider_settings, {})

    if provider == "local":
        base_url = provider_settings.get("base_url")
        async for chunk in generate_local(
            prompts["system_prompt"],
            prompts["user_prompt"],
            stream=stream,
            base_url=base_url,
            model=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk
        return

    async for chunk in generate_claude(
        prompts["system_prompt"],
        prompts["user_prompt"],
        stream=stream,
        model=model_name,
        max_tokens=max_tokens,
        temperature=temperature,
    ):
        yield chunk


async def run_agent_generation_full(
    agent: AIAgentDefinition,
    prompts: dict[str, str],
    provider_override: str | None = None,
) -> str:
    chunks: list[str] = []
    async for chunk in run_agent_generation(agent, prompts, provider_override=provider_override, stream=False):
        chunks.append(chunk)
    return "".join(chunks)
