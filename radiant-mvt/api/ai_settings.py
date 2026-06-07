"""
api/ai_settings.py — AI provider management and status
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database.db import get_db
from api.auth import get_current_user, get_current_admin
from database.models import AppConfig
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv(
    "ANTHROPIC_API_KEY",
    "your_anthropic_api_key"
)


class AIProviderUpdate(BaseModel):
    provider: str  # "claude" or "local"


def _get_provider(db: Session) -> str:
    from sqlalchemy import text
    row = db.execute(text("SELECT value FROM app_config WHERE key='ai_provider'")).fetchone()
    return row[0] if row else "claude"


@router.get("/provider")
async def get_ai_provider(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return {"provider": _get_provider(db)}


@router.put("/provider")
async def set_ai_provider(
    data: AIProviderUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    if data.provider not in ("claude", "local"):
        raise HTTPException(status_code=400, detail="Provider must be 'claude' or 'local'")
    from sqlalchemy import text
    db.execute(text("INSERT OR REPLACE INTO app_config (key, value) VALUES ('ai_provider', :v)"), {"v": data.provider})
    db.commit()
    return {"provider": data.provider, "message": f"AI provider set to {data.provider}"}


@router.post("/switch/{provider}")
async def switch_provider(
    provider: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if provider not in ("claude", "local"):
        raise HTTPException(status_code=400, detail="Provider must be 'claude' or 'local'")
    from sqlalchemy import text
    db.execute(text("INSERT OR REPLACE INTO app_config (key, value) VALUES ('ai_provider', :v)"), {"v": provider})
    db.commit()
    return {"switched_to": provider, "status": "ok"}


@router.get("/status")
async def get_ai_status(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    provider = _get_provider(db)
    key_configured = bool(ANTHROPIC_API_KEY and not ANTHROPIC_API_KEY.startswith("your_key"))
    return {
        "provider": provider,
        "model": "claude-sonnet-4-6" if provider == "claude" else "llama-3.1-8b-instruct",
        "status": "online" if key_configured or provider == "local" else "key_not_configured",
        "key_configured": key_configured,
        "features": ["chat", "news_analysis", "alert_narration", "email_drafting", "curve_shift"],
    }


@router.get("/test")
async def test_connection(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Test the Claude API connection."""
    provider = _get_provider(db)
    if provider != "claude":
        return {"success": False, "error": "Provider is set to 'local', not 'claude'"}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=32,
            messages=[{"role": "user", "content": "Reply with exactly: RADIANT-MVT ONLINE"}],
        )
        result = response.content[0].text
        return {"success": True, "provider": "claude", "response": result}
    except Exception as e:
        logger.error("AI test failed: %s", e)
        return {"success": False, "error": str(e)[:200]}
