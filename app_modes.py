"""
Shared configuration for the Radiant workspace variants.
"""
from copy import deepcopy


SCREEN_META = {
    "decision-queue": {"label": "Decision Queue", "icon": "📋"},
    "dashboard": {"label": "Dashboard", "icon": "📊"},
    "atlas": {"label": "MVT Atlas", "icon": "A"},
    "positions": {"label": "Positions & Risk", "icon": "📈"},
    "ai": {"label": "AI Intelligence", "icon": "🤖"},
    "performance": {"label": "Performance", "icon": "🎯"},
    "decision-intelligence": {"label": "Decision Intel", "icon": "🧠"},
    "market": {"label": "Market Data", "icon": "📉"},
    "vessels": {"label": "Vessels", "icon": "🚢"},
    "comms": {"label": "Communications", "icon": "📧"},
    "compliance": {"label": "Compliance", "icon": "⚖️"},
    "documentation": {"label": "Help Center", "icon": "📚"},
    "ai-studio": {"label": "AI Studio", "icon": "🧭"},
    "configuration": {"label": "Configuration", "icon": "⚙"},
    "boardroom": {"label": "Boardroom", "icon": "👔"},
    "admin": {"label": "Admin", "icon": "⚙️"},
}


APP_MODES = {
    "trader": {
        "id": "trader",
        "title": "Radiant - Trader",
        "browser_title": "Radiant - Trader",
        "brand_mark": "Radiant - Trader",
        "primary_nav_heading": "Trading",
        "tagline": "Decision intelligence for commodity trading desks",
        "default_screen": "decision-queue",
        "storage_prefix": "radiant_trader",
        "login_button": "Sign In to Trader",
        "login_hint": "alex.chen@ineos-ts.com / Trader2026!",
        "login_default_email": "alex.chen@ineos-ts.com",
        "login_default_password": "Trader2026!",
        "allowed_roles": ["trader", "executive", "admin"],
        "allowed_screens": [
            "decision-queue",
            "dashboard",
            "ai",
            "performance",
            "decision-intelligence",
            "atlas",
            "vessels",
            "comms",
            "compliance",
            "documentation",
            "ai-studio",
            "configuration",
            "boardroom",
            "admin",
        ],
        "topbar_kpis": [
            {"label": "Today P&L", "screen": None},
            {"label": "VaR Util", "screen": "ai"},
            {"label": "Decisions", "screen": "decision-queue"},
            {"label": "Alerts", "screen": "ai"},
        ],
        "screen_fallbacks": {
            "positions": "dashboard",
            "market": "ai",
        },
        "nav_sections": [
            {"label": "Trading", "items": ["decision-queue", "dashboard"]},
            {"label": "Intelligence", "items": ["ai", "performance", "decision-intelligence"]},
            {"label": "Operations", "items": ["atlas", "vessels", "comms", "compliance"]},
            {
                "label": "Tools",
                "items": [
                    "documentation",
                    {"screen": "ai-studio", "roles": ["executive", "admin"]},
                    {"screen": "configuration", "roles": ["executive", "admin"]},
                ],
            },
            {
                "label": "Management",
                "items": [
                    {"screen": "boardroom", "roles": ["executive", "admin"]},
                    {"screen": "admin", "roles": ["admin"]},
                ],
            },
        ],
        "documentation_groups": [
            {"key": "trading", "label": "Trading Workspace", "screens": ["decision-queue", "dashboard"]},
            {"key": "intelligence", "label": "AI & Analytics", "screens": ["ai", "performance", "decision-intelligence"]},
            {"key": "operations", "label": "Operations", "screens": ["atlas", "vessels", "comms", "compliance"]},
            {"key": "tools", "label": "Trader Tools", "screens": ["documentation", "ai-studio", "configuration"]},
            {"key": "management", "label": "Leadership", "screens": ["boardroom", "admin"]},
        ],
    },
}


ROLE_APP_ACCESS = {
    "trader": ["trader"],
    "executive": ["trader"],
    "admin": ["trader"],
}


def get_allowed_apps_for_role(role: str) -> list[str]:
    return ROLE_APP_ACCESS.get(role, [])


def get_app_mode(mode: str) -> dict:
    config = APP_MODES[mode]
    payload = deepcopy(config)
    payload["screen_meta"] = deepcopy(SCREEN_META)
    return payload
