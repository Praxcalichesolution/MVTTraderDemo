"""
Configuration API routes for market watch setup.
"""
from fastapi import APIRouter, Depends, HTTPException, Query

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

router = APIRouter()


def _with_symbol(registry: dict) -> list[dict]:
    return [{"symbol": symbol, **metadata} for symbol, metadata in registry.items()]


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
