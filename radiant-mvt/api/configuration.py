"""
Configuration API routes for market watch setup.
"""
import json
from datetime import datetime

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database.commodity_registry import (
    get_all,
    get_by_region,
    get_by_type,
    get_info,
    get_regions,
    get_types,
    is_valid,
    normalize_symbol,
)
from database.db import get_db
from database.models import ExternalConnector

router = APIRouter()


DEMO_CONNECTORS = [
    {
        "name": "RightAngle ETRM",
        "connector_type": "etrm",
        "provider": "RightAngle",
        "host_url": "https://etrm.ineos.internal/api",
        "last_status": "Enterprise — internal network",
    },
    {
        "name": "Bloomberg B-PIPE",
        "connector_type": "market_data",
        "provider": "Bloomberg",
        "host_url": "https://api.bloomberg.com",
        "last_status": "Enterprise — requires B-PIPE credentials",
    },
    {
        "name": "NewsAPI Feed",
        "connector_type": "news",
        "provider": "NewsAPI",
        "host_url": "https://newsapi.org/v2/everything",
        "last_status": "API key required",
    },
    {
        "name": "MarketWatch News",
        "connector_type": "news",
        "provider": "MarketWatch",
        "host_url": "https://feeds.marketwatch.com/marketwatch/topstories",
        "last_status": "Not tested",
    },
    {
        "name": "Alpha Vantage Market Data",
        "connector_type": "market_data",
        "provider": "AlphaVantage",
        "host_url": "https://www.alphavantage.co/query",
        "last_status": "API key required",
    },
    {
        "name": "LM Studio (Local) — Qwen2.5 Coder 7B",
        "connector_type": "ai_model",
        "provider": "LMStudio",
        "host_url": "http://127.0.0.1:1234/v1",
        "last_status": "Not tested",
    },
]


def _with_symbol(registry: dict) -> list[dict]:
    return [{"symbol": symbol, **metadata} for symbol, metadata in registry.items()]


def _serialize_connector(connector: ExternalConnector) -> dict:
    return {
        "id": connector.id,
        "name": connector.name,
        "connector_type": connector.connector_type,
        "provider": connector.provider,
        "host_url": connector.host_url,
        "api_key": connector.api_key,
        "extra_config": connector.extra_config,
        "polling_interval_sec": connector.polling_interval_sec,
        "is_active": connector.is_active,
        "last_connected_at": connector.last_connected_at.isoformat() if connector.last_connected_at else None,
        "last_status": connector.last_status,
        "last_error": connector.last_error,
        "created_at": connector.created_at.isoformat() if connector.created_at else None,
        "updated_at": connector.updated_at.isoformat() if connector.updated_at else None,
    }


def _normalize_extra_config(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _ensure_demo_connectors(db: Session):
    """Seed demo connectors — adds any that are missing by name, preserves existing ones."""
    existing_names = {c.name for c in db.query(ExternalConnector.name).all()}
    added = 0
    for connector_data in DEMO_CONNECTORS:
        if connector_data["name"] not in existing_names:
            db.add(
                ExternalConnector(
                    name=connector_data["name"],
                    connector_type=connector_data["connector_type"],
                    provider=connector_data["provider"],
                    host_url=connector_data.get("host_url"),
                    last_status=connector_data.get("last_status", "Not tested"),
                )
            )
            added += 1
    if added:
        db.commit()


def _apply_connector_updates(connector: ExternalConnector, payload: dict):
    for field in [
        "name",
        "connector_type",
        "provider",
        "host_url",
        "api_key",
        "polling_interval_sec",
        "is_active",
    ]:
        if field in payload:
            setattr(connector, field, payload[field])
    if "extra_config" in payload:
        connector.extra_config = _normalize_extra_config(payload.get("extra_config"))


def _run_connector_test(connector: ExternalConnector) -> tuple[str, str | None]:
    """Provider-aware connectivity test."""
    host_url = (connector.host_url or "").rstrip("/")
    provider = (connector.provider or "").lower()
    api_key = connector.api_key or ""

    # ── AI Model (LM Studio / OpenAI-compatible) ──────────────────────────────
    if connector.connector_type == "ai_model":
        if not host_url:
            raise ValueError("host_url is required for AI model connectors")
        test_url = f"{host_url}/models" if host_url.endswith("/v1") else f"{host_url}/v1/models"
        response = requests.get(test_url, timeout=5)
        response.raise_for_status()
        models = response.json().get("data", [])
        model_names = [m.get("id", "") for m in models[:3]]
        return "OK", f"Connected · {len(models)} model(s) available: {', '.join(model_names)}"

    # ── Enterprise / internal connectors — skip live test ────────────────────
    if provider in {"bloomberg", "rightangle"} or "ineos.internal" in host_url:
        return "Enterprise — requires internal credentials", (
            "Bloomberg B-PIPE and ETRM require private network access and credentials. "
            "Configure API key above and ensure VPN is active."
        )

    # ── NewsAPI ───────────────────────────────────────────────────────────────
    if provider == "newsapi" or "newsapi.org" in host_url:
        if not api_key:
            return "API key required", "Add your NewsAPI key at newsapi.org/register (free tier: 100 req/day)"
        test_url = "https://newsapi.org/v2/top-headlines?category=business&pageSize=1"
        response = requests.get(test_url, headers={"X-Api-Key": api_key}, timeout=8)
        if response.status_code == 401:
            return "Invalid API key", "NewsAPI rejected the key — check it at newsapi.org"
        if response.status_code == 426:
            return "Plan upgrade required", "Your NewsAPI plan doesn't support this endpoint"
        response.raise_for_status()
        data = response.json()
        total = data.get("totalResults", 0)
        return "OK", f"NewsAPI connected · {total} business headlines available"

    # ── MarketWatch (public RSS feed — no key needed) ─────────────────────────
    if provider == "marketwatch" or "marketwatch.com" in host_url:
        feed_url = "https://feeds.marketwatch.com/marketwatch/topstories"
        response = requests.get(feed_url, timeout=8, headers={"User-Agent": "RadiantMVT/1.0"})
        response.raise_for_status()
        # Count items in RSS
        item_count = response.text.count("<item>")
        return "OK", f"MarketWatch RSS connected · {item_count} stories available (no API key needed)"

    # ── Alpha Vantage ─────────────────────────────────────────────────────────
    if provider == "alphavantage" or "alphavantage.co" in host_url:
        if not api_key:
            return "API key required", "Get a free key at alphavantage.co/support/#api-key (500 req/day free)"
        test_url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=BRENT&apikey={api_key}"
        response = requests.get(test_url, timeout=8)
        response.raise_for_status()
        data = response.json()
        if "Note" in data:
            return "Rate limited", "Alpha Vantage rate limit hit — wait 1 minute"
        if "Error Message" in data:
            return "Invalid API key", data["Error Message"]
        return "OK", f"Alpha Vantage connected · quote data available"

    # ── Yahoo Finance / yfinance (no key needed) ──────────────────────────────
    if provider == "yahoo" or "yahoo" in host_url:
        try:
            import yfinance as yf
            ticker = yf.Ticker("BZ=F")
            info = ticker.fast_info
            price = getattr(info, "last_price", None)
            return "OK", f"Yahoo Finance connected · Brent = ${price:.2f}" if price else "OK · data available"
        except Exception as e:
            return "Error", str(e)[:120]

    # ── Generic HTTP test ─────────────────────────────────────────────────────
    if host_url:
        try:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            response = requests.get(host_url, headers=headers, timeout=8)
            if response.status_code == 401:
                return "API key required", f"Server returned 401 — add API key for {connector.name}"
            if response.status_code == 403:
                return "Access denied", f"403 Forbidden — check credentials for {connector.name}"
            response.raise_for_status()
            return "OK", f"Connected to {host_url} (HTTP {response.status_code})"
        except requests.exceptions.ConnectionError:
            return "Unreachable", f"Cannot connect to {host_url} — check URL and network"
        except requests.exceptions.Timeout:
            return "Timeout", f"{host_url} did not respond within 8s"

    return "OK", "Connector saved — no URL to test"


@router.get("/commodities")
async def list_commodities(
    commodity_type: str | None = Query(default=None, alias="type"),
    region: str | None = None,
    q: str | None = None,
    current_user=Depends(get_current_user),
):
    registry = get_all()
    if commodity_type:
        commodity_type = commodity_type.strip().lower()
        if commodity_type not in get_types():
            raise HTTPException(status_code=400, detail=f"Unknown commodity type '{commodity_type}'")
        registry = get_by_type(commodity_type)
    if region:
        region = region.strip().lower()
        if region not in get_regions():
            raise HTTPException(status_code=400, detail=f"Unknown region '{region}'")
        registry = {k: v for k, v in registry.items() if v["region"] == region}
    if q:
        needle = q.strip().lower()
        registry = {
            k: v for k, v in registry.items()
            if needle in k.lower() or needle in v["display"].lower()
        }
    return {
        "count": len(registry),
        "commodities": _with_symbol(registry),
    }


@router.get("/commodities/types")
async def list_commodity_types(current_user=Depends(get_current_user)):
    return {"types": get_types()}


@router.get("/commodities/regions")
async def list_commodity_regions(current_user=Depends(get_current_user)):
    return {"regions": get_regions()}


@router.get("/commodities/validate")
async def validate_commodity(
    symbol: str = Query(..., min_length=1),
    current_user=Depends(get_current_user),
):
    normalized = normalize_symbol(symbol)
    return {
        "symbol": symbol,
        "valid": normalized is not None,
        "normalized_symbol": normalized,
        "metadata": get_info(symbol),
    }


@router.get("/commodities/{symbol}")
async def get_commodity(symbol: str, current_user=Depends(get_current_user)):
    info = get_info(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Unknown commodity symbol '{symbol}'")
    return info


@router.post("/commodities/validate")
async def validate_commodity_payload(
    payload: dict,
    current_user=Depends(get_current_user),
):
    symbol = str(payload.get("symbol", "")).strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    return {
        "symbol": symbol,
        "valid": is_valid(symbol),
        "normalized_symbol": normalize_symbol(symbol),
        "metadata": get_info(symbol),
    }


@router.get("/connectors")
async def list_connectors(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_demo_connectors(db)
    connectors = db.query(ExternalConnector).order_by(ExternalConnector.id.desc()).all()
    return {"connectors": [_serialize_connector(connector) for connector in connectors]}


@router.post("/connectors")
async def create_connector(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_demo_connectors(db)
    required_fields = ["name", "connector_type", "provider"]
    missing_fields = [field for field in required_fields if not str(payload.get(field, "")).strip()]
    if missing_fields:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing_fields)}")

    connector = ExternalConnector(
        name=str(payload["name"]).strip(),
        connector_type=str(payload["connector_type"]).strip(),
        provider=str(payload["provider"]).strip(),
        host_url=str(payload["host_url"]).strip() if payload.get("host_url") else None,
        api_key=str(payload["api_key"]).strip() if payload.get("api_key") else None,
        extra_config=_normalize_extra_config(payload.get("extra_config")),
        polling_interval_sec=int(payload.get("polling_interval_sec", 60)),
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return _serialize_connector(connector)


@router.patch("/connectors/{connector_id}")
async def update_connector(
    connector_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_demo_connectors(db)
    connector = db.query(ExternalConnector).filter(ExternalConnector.id == connector_id).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    _apply_connector_updates(connector, payload)
    connector.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(connector)
    return _serialize_connector(connector)


@router.delete("/connectors/{connector_id}")
async def delete_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_demo_connectors(db)
    connector = db.query(ExternalConnector).filter(ExternalConnector.id == connector_id).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    connector.is_active = 0
    connector.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "deleted", "id": connector_id}


@router.post("/connectors/{connector_id}/test")
async def test_connector(
    connector_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_demo_connectors(db)
    connector = db.query(ExternalConnector).filter(ExternalConnector.id == connector_id).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    connector.last_connected_at = datetime.utcnow()
    try:
        status, message = _run_connector_test(connector)
        connector.last_status = status
        connector.last_error = None
        db.commit()
        db.refresh(connector)
        return {
            "status": status,
            "message": message,
            "connector": _serialize_connector(connector),
        }
    except Exception as exc:
        connector.last_status = "Error"
        connector.last_error = str(exc)
        db.commit()
        db.refresh(connector)
        return {
            "status": "Error",
            "message": str(exc),
            "connector": _serialize_connector(connector),
        }
