from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ai.help_catalog import get_help_catalog
from database.models import Alert, DecisionQueue, DemoScenario, Email, ExternalConnector


APP_OVERVIEW = (
    "Radiant-MVT is an AI-assisted trading intelligence platform for commodity trading teams. "
    "It combines decision triage, live book and VaR monitoring, market curves, vessel tracking, "
    "communications workflow, compliance, performance analytics, connector administration, and "
    "AI prompt governance in one workspace."
)


SCREEN_MANUAL = [
    {
        "key": "decision-queue",
        "title": "Decision Queue",
        "aliases": ["decision queue", "decisions", "priority list", "action list"],
        "summary": "Prioritised daily decisions sorted by deadline and impact.",
        "features": [
            "Urgency-ranked decision cards with deadline countdowns and potential impact.",
            "AI decision briefing panel for a morning summary with market context.",
            "Decision reasoning modal that explains why an item matters.",
            "Quick actions such as review, snooze, and escalation-oriented follow-up.",
        ],
        "tasks": [
            "Generate the AI decision briefing.",
            "Open a specific decision and explain the reasoning.",
            "Complete or snooze a decision item.",
        ],
    },
    {
        "key": "dashboard",
        "title": "Trader Dashboard",
        "aliases": ["dashboard", "home", "overview", "trader dashboard"],
        "summary": "Live book overview with KPI tiles, alerts, blotter, and desk-wide context.",
        "features": [
            "Role-aware KPI tiles and drag-and-drop layout.",
            "Book summary, P&L, alerts, news, heat maps, and trade blotter views.",
            "Fast drill-down into positions and flagged trades.",
        ],
        "tasks": [
            "Refresh the overview and re-render charts.",
            "Inspect alerts, trade blotter activity, or position heat map hotspots.",
        ],
    },
    {
        "key": "positions",
        "title": "Positions & Risk",
        "aliases": ["positions", "risk", "positions and risk", "book risk"],
        "summary": "Full position book with hedging, VaR, and exposure analysis.",
        "features": [
            "Physical, financial, and all-position filters.",
            "Position table with net exposure, prices, P&L, hedge ratio, and one-day VaR.",
            "Exposure by tenor, counterparty exposure, and forward curve views.",
            "VaR explainer with stressed VaR and board-limit utilisation.",
        ],
        "tasks": [
            "Refresh the position book.",
            "Filter the grid by physical or financial positions.",
            "Review commodity VaR and curve context.",
        ],
    },
    {
        "key": "ai",
        "title": "AI Intelligence Centre",
        "aliases": ["ai intelligence", "ai intelligence centre", "hedge advisor", "trade ideas", "anomaly alerts"],
        "summary": "AI workspace for hedge advice, trade ideas, anomaly alerts, forecasts, and pre-mortems.",
        "features": [
            "Hedge Advisor with factor attribution and recommended structures.",
            "Trade idea scanning and anomaly alert summaries.",
            "Pre-mortem scenario analysis for the current book.",
            "AI forward-curve narrative and event/sentiment impact list.",
        ],
        "tasks": [
            "Run the hedge advisor for Brent, Urals, Ethane, or Naphtha.",
            "Run the pre-mortem on the current book.",
            "Generate a forecast narrative for a selected commodity.",
        ],
    },
    {
        "key": "performance",
        "title": "Performance & Analytics",
        "aliases": ["performance", "analytics", "pnl target", "opportunity cost"],
        "summary": "YTD performance tracking, plan comparison, and missed-opportunity analysis.",
        "features": [
            "YTD P&L, target attainment, run-rate forecast, and year-over-year metrics.",
            "Monthly performance chart, waterfall attribution, and book summary.",
            "Opportunity cost and shortfall investigation hooks.",
        ],
        "tasks": [
            "Refresh performance charts.",
            "Investigate the shortfall with AI forensics.",
        ],
    },
    {
        "key": "decision-intelligence",
        "title": "Decision Intelligence",
        "aliases": ["decision intelligence", "forensics", "desk brain", "institutional memory"],
        "summary": "Explains missed opportunities and searches historical desk memory.",
        "features": [
            "Missing-trade investigation section for Q1 or similar periods.",
            "Desk Brain institutional-memory search for similar historical structures.",
            "High-signal review of what the desk missed and why.",
        ],
        "tasks": [
            "Run the AI forensics investigation.",
            "Search Desk Brain for similar trades or structures.",
        ],
    },
    {
        "key": "market",
        "title": "Market Data & Curves",
        "aliases": ["market", "market data", "curves", "forward curve", "curve shifter", "prices"],
        "summary": "Cached-first live prices, spread analysis, market headlines, and curve scenarios.",
        "features": [
            "Live prices and key spread panels with refresh status.",
            "Forward curve chart for Brent, WTI, Ethane, Naphtha, and EUA.",
            "Natural-language curve shifter that recalculates market scenarios.",
            "Market headlines panel tied to the current commodities.",
        ],
        "tasks": [
            "Refresh prices.",
            "Switch the active market curve.",
            "Apply a natural-language curve shift scenario.",
        ],
    },
    {
        "key": "vessels",
        "title": "Vessels & Logistics",
        "aliases": ["vessels", "logistics", "voyage", "fleet", "shipping"],
        "summary": "Fleet tracking, voyage economics, cargo pipeline, and AIS-style map views.",
        "features": [
            "Vessel cards, voyage economics, and cargo pipeline monitoring.",
            "Interactive map with routes, delays, and rich vessel tooltips.",
            "Operational context for cargo timing and hedge impact.",
        ],
        "tasks": [
            "Review delay impact on cargo and hedge decisions.",
            "Inspect vessel route and voyage economics.",
        ],
    },
    {
        "key": "comms",
        "title": "Communications Hub",
        "aliases": ["communications", "comms", "inbox", "emails", "mail", "reply"],
        "summary": "AI-prioritised inbox with action queue, linked trade context, and drafted replies.",
        "features": [
            "Priority inbox with critical, high, medium, and FYI filters.",
            "Message detail panel with AI analysis, linked trade or vessel, and draft reply.",
            "Action queue for items needing human decisions.",
            "Mark-actioned and send-reply workflow from the message detail view.",
        ],
        "tasks": [
            "Open a specific email.",
            "Send the drafted reply for the selected email.",
            "Mark a communication as actioned.",
        ],
    },
    {
        "key": "compliance",
        "title": "Compliance & Audit",
        "aliases": ["compliance", "audit", "regulatory", "emir", "filings"],
        "summary": "Regulatory status, filing deadlines, audit trail, and AI action log.",
        "features": [
            "Regulatory filing overview and upcoming deadlines.",
            "Immutable audit trail with filters and AI action logging.",
            "Operational compliance checks for the desk.",
        ],
        "tasks": [
            "Refresh compliance data.",
            "Review audit log or filing status.",
        ],
    },
    {
        "key": "configuration",
        "title": "External Systems Configuration",
        "aliases": ["configuration", "connectors", "external systems", "feeds", "ai models", "etrm"],
        "summary": "Connector management for news, market data, AI models, and ETRM integrations.",
        "features": [
            "Connector dashboard grouped by news, market data, AI model, and ETRM.",
            "Create, update, test, and remove connectors.",
            "Credential storage and provider-aware connectivity tests.",
        ],
        "tasks": [
            "Load connector status.",
            "Test a named connector.",
            "Save a connector key or remove a connector.",
        ],
    },
    {
        "key": "ai-studio",
        "title": "AI Studio",
        "aliases": ["ai studio", "prompt studio", "agents", "copilot settings"],
        "summary": "Enterprise control plane for prompts, providers, runtime policy, and user context.",
        "features": [
            "Agent list with default-chat selection and version history.",
            "Prompt templates, tool scope, screen scope, and model settings.",
            "Safe test harness for prompts and persistent user profile editing.",
        ],
        "tasks": [
            "Inspect the current chat copilot configuration.",
            "Test an AI agent with a selected screen context.",
        ],
    },
    {
        "key": "documentation",
        "title": "Help Center",
        "aliases": ["help center", "documentation", "help", "help docs", "user guide", "app guide", "knowledge base"],
        "summary": "Two-panel help workspace with grouped screen guidance, workflow walkthroughs, and AI-assisted actions.",
        "features": [
            "Left-side grouped tree view of the entire application.",
            "Right-side detail panel with purpose, features, common tasks, and deep links.",
            "AI-assisted action buttons that can open screens or ask Radiant AI to perform supported tasks.",
            "Page-help shortcuts from every screen header.",
        ],
        "tasks": [
            "Browse grouped documentation without leaving the app.",
            "Open the linked screen from the help detail panel.",
            "Ask Radiant AI to explain or perform a supported task from the selected page.",
        ],
    },
    {
        "key": "boardroom",
        "title": "Boardroom View",
        "aliases": ["boardroom", "executive", "management"],
        "summary": "Executive summary of desk performance, capital efficiency, and strategic uplift.",
        "features": [
            "Top-quartile gap analysis and strategic performance summary.",
            "Executive-friendly charts and cross-book comparison.",
        ],
        "tasks": [
            "Review executive summary metrics.",
            "Assess top-quartile uplift potential.",
        ],
    },
    {
        "key": "admin",
        "title": "Admin / Demo Control",
        "aliases": ["admin", "demo control", "scenarios", "system status"],
        "summary": "Scenario triggering, AI configuration shortcuts, and system-health controls.",
        "features": [
            "Demo scenario launcher for fat-finger, stale price, margin breach, and vessel-delay cases.",
            "System status and AI connection checks.",
            "Operational controls for demo and admin workflows.",
        ],
        "tasks": [
            "Trigger a named scenario.",
            "Check system status.",
        ],
    },
]


CHAT_CAPABILITIES = [
    "Explain what each screen does and where a feature lives.",
    "Navigate to a screen automatically when the request is explicit.",
    "Run supported in-app tasks such as refreshing data, generating briefings, applying curve shifts, opening emails, marking messages actioned, switching AI provider, testing connectors, and triggering demo scenarios.",
    "Use the currently selected decision, email, alert, or other record when the task depends on a specific item.",
]


def _load_manual_from_help_catalog() -> dict[str, Any] | None:
    articles = get_help_catalog()
    if not articles:
        return None

    screens = []
    for article in articles:
        key = article.get("screen") or article.get("id")
        if not key:
            continue
        screens.append(
            {
                "key": key,
                "title": article.get("title", key),
                "aliases": article.get("aliases", []),
                "summary": article.get("summary", ""),
                "features": article.get("features", []),
                "tasks": article.get("tasks") or article.get("steps", []),
                "chat_examples": article.get("chat_examples") or article.get("quick_questions", []),
                "related_screens": article.get("related_screens", []),
                "sections": article.get("sections", []),
            }
        )

    if not screens:
        return None

    return {
        "overview": APP_OVERVIEW,
        "screens": screens,
        "chat_capabilities": CHAT_CAPABILITIES,
    }


def _load_manual_from_json() -> dict[str, Any] | None:
    manual_path = Path(__file__).resolve().parent.parent / "frontend" / "static" / "data" / "app-guide.json"
    if not manual_path.exists():
        return None
    try:
        payload = json.loads(manual_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("screens"), list):
        return None
    return payload


_manual_payload = _load_manual_from_help_catalog() or _load_manual_from_json()
if _manual_payload:
    APP_OVERVIEW = _manual_payload.get("overview", APP_OVERVIEW)
    SCREEN_MANUAL = _manual_payload.get("screens", SCREEN_MANUAL)
    CHAT_CAPABILITIES = _manual_payload.get("chat_capabilities", CHAT_CAPABILITIES)


MANUAL_BY_KEY = {item["key"]: item for item in SCREEN_MANUAL}


def _normalise(text: str | None) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _tokens(text: str | None) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", _normalise(text)))


def _screen_score(screen: dict[str, Any], query: str) -> int:
    query_text = _normalise(query)
    score = 0
    for alias in screen.get("aliases", []):
        alias_text = _normalise(alias)
        if alias_text and alias_text in query_text:
            score += max(3, len(alias_text.split()))
    haystack = " ".join(
        [
            screen.get("title", ""),
            screen.get("summary", ""),
            " ".join(screen.get("features", [])),
            " ".join(screen.get("tasks", [])),
        ]
    )
    score += len(_tokens(query_text) & _tokens(haystack))
    return score


def match_screens(query: str, current_screen: str | None = None) -> list[dict[str, Any]]:
    query_text = _normalise(query)
    if not query_text:
        return []
    scored = []
    for screen in SCREEN_MANUAL:
        score = _screen_score(screen, query_text)
        if score > 0:
            scored.append((score, screen))
    scored.sort(key=lambda item: item[0], reverse=True)
    results = [screen for _score, screen in scored[:3]]
    if ("this screen" in query_text or "here" in query_text) and current_screen and current_screen in MANUAL_BY_KEY:
        current_doc = MANUAL_BY_KEY[current_screen]
        results = [current_doc] + [screen for screen in results if screen["key"] != current_screen]
    return results


def get_app_manual_payload() -> dict[str, Any]:
    return {
        "overview": APP_OVERVIEW,
        "screens": SCREEN_MANUAL,
        "chat_capabilities": CHAT_CAPABILITIES,
    }


def render_app_manual_markdown() -> str:
    lines = [
        "# Radiant-MVT App Guide",
        "",
        "## Overview",
        APP_OVERVIEW,
        "",
        "## Shared Platform Features",
        "- Left navigation for Trading, Intelligence, Operations, Tools, Management, and Admin areas.",
        "- Top-bar KPIs for P&L, VaR utilisation, decisions, and alerts.",
        "- Right-side Market Watch panel with commodity intelligence and related news.",
        "- Radiant AI copilot panel with screen-aware context and suggested prompts.",
        "- Role-based access for trader, risk, executive, and admin experiences.",
        "",
        "## Screen Guide",
    ]
    for screen in SCREEN_MANUAL:
        lines.append(f"### {screen['title']} (`{screen['key']}`)")
        lines.append(screen["summary"])
        lines.append("")
        lines.append("Features:")
        lines.extend([f"- {item}" for item in screen["features"]])
        lines.append("")
        lines.append("Common tasks:")
        lines.extend([f"- {item}" for item in screen["tasks"]])
        if screen.get("sections"):
            lines.append("")
            lines.append("Detailed guidance:")
            for section in screen["sections"]:
                lines.append(f"- {section.get('title', 'Section')}:")
                lines.extend([f"  - {item}" for item in section.get("items", [])])
        if screen.get("chat_examples"):
            lines.append("")
            lines.append("Example chat prompts:")
            lines.extend([f"- {item}" for item in screen["chat_examples"]])
        lines.append("")
    lines.extend(
        [
            "## Chat Copilot Capabilities",
            *[f"- {item}" for item in CHAT_CAPABILITIES],
            "",
            "## Example Copilot Requests",
            "- `Take me to Positions & Risk.`",
            "- `Refresh market data and open the Brent curve.`",
            "- `Generate my decision briefing.`",
            "- `Open the Vitol confirmation email and send the drafted reply.`",
            "- `Run a pre-mortem on the book.`",
            "- `Test the LM Studio connector.`",
        ]
    )
    return "\n".join(lines)


def _best_overlap_match(records: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    query_tokens = _tokens(query)
    best: tuple[int, dict[str, Any] | None] = (0, None)
    for record in records:
        haystack = " ".join(str(record.get(field, "")) for field in ("name", "title", "subject", "label", "key", "provider"))
        score = len(query_tokens & _tokens(haystack))
        if query and str(record.get("title", "")).lower() in query.lower():
            score += 2
        if query and str(record.get("subject", "")).lower() in query.lower():
            score += 2
        if score > best[0]:
            best = (score, record)
    return best[1]


def _resolve_decision(db: Session, query: str, selected_entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if selected_entity and selected_entity.get("type") == "decision" and selected_entity.get("id"):
        item = db.query(DecisionQueue).filter(DecisionQueue.id == int(selected_entity["id"])).first()
        if item:
            return {"id": item.id, "title": item.title}
    rows = db.query(DecisionQueue).filter(DecisionQueue.status.in_(["Pending", "Snoozed"])).limit(25).all()
    records = [{"id": row.id, "title": row.title, "label": row.title} for row in rows]
    return _best_overlap_match(records, query)


def _resolve_email(db: Session, query: str, selected_entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if selected_entity and selected_entity.get("type") == "email" and selected_entity.get("id"):
        item = db.query(Email).filter(Email.id == int(selected_entity["id"])).first()
        if item:
            return {"id": item.id, "subject": item.subject}
    rows = db.query(Email).order_by(Email.received_at.desc()).limit(25).all()
    records = [{"id": row.id, "subject": row.subject, "label": row.subject} for row in rows]
    return _best_overlap_match(records, query)


def _resolve_alert(db: Session, query: str, selected_entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if selected_entity and selected_entity.get("type") == "alert" and selected_entity.get("id"):
        item = db.query(Alert).filter(Alert.id == int(selected_entity["id"])).first()
        if item:
            return {"id": item.id, "title": item.title}
    rows = db.query(Alert).filter(Alert.status.in_(["Open", "Acknowledged"])).order_by(Alert.created_at.desc()).limit(25).all()
    records = [{"id": row.id, "title": row.title, "label": row.title} for row in rows]
    return _best_overlap_match(records, query)


def _resolve_connector(db: Session, query: str) -> dict[str, Any] | None:
    rows = db.query(ExternalConnector).filter(ExternalConnector.is_active == 1).order_by(ExternalConnector.id.desc()).all()
    records = [
        {
            "id": row.id,
            "name": row.name,
            "provider": row.provider,
            "type": row.connector_type,
            "label": f"{row.name} {row.provider}",
        }
        for row in rows
    ]
    return _best_overlap_match(records, query)


def _resolve_scenario(db: Session, query: str) -> dict[str, Any] | None:
    rows = db.query(DemoScenario).filter(DemoScenario.is_active == 1).all()
    records = [{"key": row.scenario_key, "name": row.title, "label": f"{row.scenario_key} {row.title}"} for row in rows]
    return _best_overlap_match(records, query)


def _extract_commodity(query: str) -> str | None:
    lookup = {
        "brent": "Brent",
        "wti": "WTI",
        "urals": "Urals",
        "ethane": "Ethane",
        "naphtha": "Naphtha",
        "henry hub": "HH",
        "hh": "HH",
        "eua": "EUA",
    }
    query_text = _normalise(query)
    for needle, commodity in lookup.items():
        if needle in query_text:
            return commodity
    return None


def _extract_position_key(query: str) -> str | None:
    lookup = {
        "brent": "brent",
        "urals": "urals",
        "ethane": "ethane",
        "naphtha": "naphtha",
    }
    query_text = _normalise(query)
    for needle, key in lookup.items():
        if needle in query_text:
            return key
    return None


def _compose_screen_help(screen: dict[str, Any]) -> str:
    feature_text = "; ".join(screen["features"][:3])
    task_text = "; ".join(screen["tasks"][:3])
    return (
        f"**{screen['title']}** is the `{screen['key']}` screen. {screen['summary']} "
        f"Key features: {feature_text}. Common tasks: {task_text}."
    )


def _compose_overview_help() -> str:
    screen_names = ", ".join(screen["title"] for screen in SCREEN_MANUAL)
    return (
        f"{APP_OVERVIEW}\n\n"
        f"Main screens: {screen_names}.\n\n"
        f"I can explain any screen, take you there, and run supported tasks such as refreshing data, "
        f"generating briefings, applying curve shifts, opening emails, marking items actioned, testing connectors, "
        f"switching AI provider, and triggering demo scenarios."
    )


def build_copilot_plan(
    db: Session,
    message: str,
    current_screen: str | None,
    selected_entity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    text = _normalise(message)
    matched_screens = match_screens(text, current_screen=current_screen)
    actions: list[dict[str, Any]] = []
    response: str | None = None
    mode = "none"
    direct = False

    def add_navigation(screen_key: str, reason: str | None = None):
        if not any(action["id"] == "navigate" and action["params"].get("screen") == screen_key for action in actions):
            actions.append(
                {
                    "id": "navigate",
                    "label": f"Open {MANUAL_BY_KEY.get(screen_key, {}).get('title', screen_key)}",
                    "params": {"screen": screen_key},
                    "reason": reason,
                }
            )

    doc_keywords = [
        "documentation",
        "document",
        "docs",
        "manual",
        "guide",
        "feature",
        "functionality",
        "what does",
        "what can",
        "what screen",
        "which screen",
        "where do",
        "how do",
        "how can",
        "walk me through",
        "show me around",
        "this screen",
    ]
    nav_keywords = ["go to", "open", "take me", "navigate", "show me", "bring me"]
    action_keywords = [
        "refresh",
        "generate",
        "run",
        "send",
        "mark",
        "acknowledge",
        "resolve",
        "complete",
        "snooze",
        "switch",
        "test",
        "trigger",
        "apply",
    ]

    if "what can this app do" in text or "app overview" in text or "app functionality" in text:
        direct = True
        mode = "documentation"
        response = _compose_overview_help()

    if (
        ("documentation" in text or "help" in text or "guide" in text)
        and any(keyword in text for keyword in nav_keywords + ["page", "screen"])
    ):
        add_navigation("documentation", reason="Help Center is the in-app guide workspace.")
        if response is None:
            response = "Opening **Help Center** so you can browse the app guide and jump to any screen."
        direct = True
        mode = "navigation"

    if any(keyword in text for keyword in nav_keywords) and matched_screens:
        target = matched_screens[0]
        add_navigation(target["key"], reason=f"Matched request for {target['title']}.")
        if response is None:
            response = f"Opening **{target['title']}**. {_compose_screen_help(target)}"
        direct = True
        mode = "navigation"

    if ("decision briefing" in text or "morning briefing" in text) and ("generate" in text or "run" in text or "briefing" in text):
        add_navigation("decision-queue", reason="Decision briefings live on Decision Queue.")
        actions.append({"id": "generate_decision_briefing", "label": "Generate decision briefing", "params": {}})
        response = "I'm opening **Decision Queue** and generating the AI decision briefing."
        direct = True
        mode = "action"

    if "refresh" in text and ("market" in text or "prices" in text or current_screen == "market"):
        add_navigation("market", reason="Price refresh is available on Market Data & Curves.")
        actions.append({"id": "load_market_data", "label": "Refresh prices", "params": {"force_refresh": True}})
        response = "I'm opening **Market Data & Curves** and refreshing prices."
        direct = True
        mode = "action"

    if "curve" in text and "shift" in text:
        commodity = _extract_commodity(text)
        add_navigation("market", reason="Curve shifts are handled on Market Data & Curves.")
        if commodity:
            actions.append({"id": "switch_market_curve", "label": f"Open {commodity} curve", "params": {"commodity": commodity}})
        actions.append({"id": "apply_curve_shift", "label": "Apply curve shift", "params": {"instruction": message, "commodity": commodity}})
        response = "I'm opening **Market Data & Curves** and applying that curve-shift scenario."
        direct = True
        mode = "action"

    if "hedge advisor" in text or ("hedge" in text and ("run" in text or "recommendation" in text or "analyse" in text)):
        position_key = _extract_position_key(text)
        add_navigation("ai", reason="Hedge Advisor lives on AI Intelligence Centre.")
        actions.append({"id": "run_hedge_advisor", "label": "Run Hedge Advisor", "params": {"position": position_key}})
        response = (
            f"I'm opening **AI Intelligence Centre** and running Hedge Advisor"
            + (f" for **{position_key.title()}**." if position_key else ".")
        )
        direct = True
        mode = "action"

    if "pre-mortem" in text:
        add_navigation("ai", reason="Pre-mortem analysis lives on AI Intelligence Centre.")
        actions.append({"id": "run_pre_mortem", "label": "Run pre-mortem", "params": {}})
        response = "I'm opening **AI Intelligence Centre** and running the pre-mortem."
        direct = True
        mode = "action"

    if "forecast" in text and any(term in text for term in ["generate", "run", "show", "open", "forecast"]):
        commodity = _extract_commodity(text) or "Brent"
        add_navigation("ai", reason="Forecast narrative lives on AI Intelligence Centre.")
        actions.append({"id": "generate_forecast_narrative", "label": f"Generate {commodity} forecast", "params": {"commodity": commodity}})
        response = f"I'm opening **AI Intelligence Centre** and generating the **{commodity}** forecast narrative."
        direct = True
        mode = "action"

    if "forensics" in text or "investigate q1" in text or "investigate performance" in text or "shortfall" in text:
        add_navigation("decision-intelligence", reason="Forensics lives on Decision Intelligence.")
        actions.append({"id": "run_forensics", "label": "Run forensics", "params": {}})
        response = "I'm opening **Decision Intelligence** and running the forensics investigation."
        direct = True
        mode = "action"

    if "desk brain" in text or "search memory" in text or "institutional memory" in text or "similar trade" in text:
        add_navigation("decision-intelligence", reason="Desk Brain lives on Decision Intelligence.")
        actions.append({"id": "run_desk_brain", "label": "Search Desk Brain", "params": {"query": message}})
        response = "I'm opening **Decision Intelligence** and searching Desk Brain."
        direct = True
        mode = "action"

    if "reply" in text or "email" in text or "inbox" in text:
        if (
            ("send" in text and "reply" in text)
            or ("open" in text and "email" in text)
            or ("mark" in text and "actioned" in text)
        ):
            email = _resolve_email(db, message, selected_entity)
            add_navigation("comms", reason="Email workflow lives on Communications Hub.")
            if email:
                actions.append({"id": "open_email", "label": "Open email", "params": {"email_id": email["id"]}})
                if "send" in text and "reply" in text:
                    actions.append({"id": "send_email_reply", "label": "Send drafted reply", "params": {"email_id": email["id"]}})
                    response = f"I'm opening **Communications Hub** and sending the drafted reply for **{email['subject']}**."
                elif "mark" in text and "actioned" in text:
                    actions.append({"id": "mark_email_actioned", "label": "Mark email actioned", "params": {"email_id": email["id"]}})
                    response = f"I'm opening **Communications Hub** and marking **{email['subject']}** as actioned."
                else:
                    response = f"I'm opening **Communications Hub** and selecting **{email['subject']}**."
                direct = True
                mode = "action"
            else:
                direct = True
                mode = "guided_action"
                response = (
                    "I can do that from **Communications Hub**, but I need a specific email. "
                    "Open the message first, or mention the sender or subject."
                )

    if "complete decision" in text or ("decision" in text and "complete" in text):
        decision = _resolve_decision(db, message, selected_entity)
        add_navigation("decision-queue", reason="Decision actions live on Decision Queue.")
        if decision:
            actions.append({"id": "complete_decision", "label": "Complete decision", "params": {"decision_id": decision["id"]}})
            response = f"I'm opening **Decision Queue** and completing **{decision['title']}**."
        else:
            response = "I can complete that from **Decision Queue**, but I need a selected or named decision item."
        direct = True
        mode = "action"

    if "snooze" in text and "decision" in text:
        decision = _resolve_decision(db, message, selected_entity)
        minutes_match = re.search(r"(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours)", text)
        minutes = 30
        if minutes_match:
            value = int(minutes_match.group(1))
            unit = minutes_match.group(2)
            minutes = value * 60 if unit.startswith("h") else value
        add_navigation("decision-queue", reason="Decision actions live on Decision Queue.")
        if decision:
            actions.append({"id": "snooze_decision", "label": "Snooze decision", "params": {"decision_id": decision["id"], "minutes": minutes}})
            response = f"I'm opening **Decision Queue** and snoozing **{decision['title']}** for {minutes} minutes."
        else:
            response = "I can snooze that from **Decision Queue**, but I need a selected or named decision item."
        direct = True
        mode = "action"

    if "acknowledge alert" in text or ("alert" in text and "acknowledge" in text):
        alert = _resolve_alert(db, message, selected_entity)
        add_navigation("ai", reason="Alerts are reviewed from AI Intelligence Centre.")
        if alert:
            actions.append({"id": "acknowledge_alert", "label": "Acknowledge alert", "params": {"alert_id": alert["id"]}})
            response = f"I'm acknowledging **{alert['title']}**."
        else:
            response = "I can acknowledge that alert, but I need a selected or named alert first."
        direct = True
        mode = "action"

    if "resolve alert" in text or ("alert" in text and "resolve" in text):
        alert = _resolve_alert(db, message, selected_entity)
        add_navigation("ai", reason="Alerts are reviewed from AI Intelligence Centre.")
        if alert:
            actions.append({"id": "resolve_alert", "label": "Resolve alert", "params": {"alert_id": alert["id"]}})
            response = f"I'm resolving **{alert['title']}**."
        else:
            response = "I can resolve that alert, but I need a selected or named alert first."
        direct = True
        mode = "action"

    if ("test" in text and ("connector" in text or "connection" in text)) or "test ai connection" in text:
        connector = _resolve_connector(db, message)
        add_navigation("configuration", reason="Connector tests live on External Systems Configuration.")
        if connector:
            actions.append({"id": "test_connector", "label": "Test connector", "params": {"connector_id": connector["id"]}})
            response = f"I'm opening **External Systems Configuration** and testing **{connector['name']}**."
        else:
            response = "I can test a connector from **External Systems Configuration**, but I need the connector name or provider."
        direct = True
        mode = "action"

    if "switch to claude" in text or "use claude" in text:
        actions.append({"id": "switch_ai_provider", "label": "Switch to Claude", "params": {"provider": "claude"}})
        response = "I'm switching the copilot to **Claude**."
        direct = True
        mode = "action"

    if "switch to local" in text or "use local llm" in text or "use local model" in text:
        actions.append({"id": "switch_ai_provider", "label": "Switch to Local LLM", "params": {"provider": "local"}})
        response = "I'm switching the copilot to the **Local LLM**."
        direct = True
        mode = "action"

    if "trigger scenario" in text or ("scenario" in text and "trigger" in text):
        scenario = _resolve_scenario(db, message)
        add_navigation("admin", reason="Scenarios are triggered from Admin / Demo Control.")
        if scenario:
            actions.append(
                {
                    "id": "trigger_scenario",
                    "label": "Trigger scenario",
                    "params": {"scenario_key": scenario["key"], "scenario_name": scenario["name"]},
                }
            )
            response = f"I'm opening **Admin / Demo Control** and triggering **{scenario['name']}**."
        else:
            response = "I can trigger a demo scenario from **Admin / Demo Control**, but I need the scenario name."
        direct = True
        mode = "action"

    if response is None and any(keyword in text for keyword in doc_keywords):
        if matched_screens:
            screen = matched_screens[0]
            response = _compose_screen_help(screen)
        else:
            response = _compose_overview_help()
        direct = True
        mode = "documentation"

    return {
        "should_handle_directly": direct,
        "mode": mode,
        "response": response,
        "matched_screens": [screen["key"] for screen in matched_screens],
        "current_screen": current_screen,
        "actions": actions,
        "client": {
            "mode": mode,
            "matched_screens": [screen["key"] for screen in matched_screens],
            "actions": actions,
        },
    }


def get_runtime_manual_context(current_screen: str | None) -> dict[str, str]:
    screen_doc = MANUAL_BY_KEY.get(current_screen or "", {})
    current_screen_summary = (
        f"{screen_doc.get('title', current_screen or 'Current screen')}: {screen_doc.get('summary', 'No manual summary available.')}"
        if screen_doc
        else "No screen-specific manual summary available."
    )
    current_screen_features = "; ".join(screen_doc.get("features", [])[:4]) if screen_doc else "No screen-specific features available."
    compact_screen_index = " | ".join(
        f"{item['title']} ({item['key']}): {item['summary']}" for item in SCREEN_MANUAL
    )
    return {
        "app_manual_overview": APP_OVERVIEW,
        "app_screen_index": compact_screen_index,
        "current_screen_manual": current_screen_summary,
        "current_screen_features": current_screen_features,
    }
