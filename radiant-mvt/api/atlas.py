"""
Atlas map-ready API for Trader and Risk spatial screens.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from api.auth import get_current_user
from database.db import get_db
from database.models import MarketData, Position, Trade, Vessel


router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


PORTS = {
    "marcus_hook": {"name": "Marcus Hook", "lat": 39.819, "lon": -75.418},
    "freeport": {"name": "Freeport", "lat": 28.954, "lon": -95.359},
    "rafnes": {"name": "Rafnes", "lat": 59.100, "lon": 9.650},
    "grangemouth": {"name": "Grangemouth", "lat": 56.015, "lon": -3.708},
    "stenungsund": {"name": "Stenungsund", "lat": 58.070, "lon": 11.820},
    "brunsbuttel": {"name": "Brunsbuttel", "lat": 53.895, "lon": 9.145},
    "arzew": {"name": "Arzew", "lat": 35.850, "lon": -0.320},
}

HUBS = {
    "brent": {"name": "Brent Index", "lat": 60.900, "lon": 1.500},
    "nwe": {"name": "NWE Naphtha", "lat": 51.950, "lon": 4.130},
    "ttf": {"name": "TTF Gas", "lat": 52.250, "lon": 5.270},
    "hh": {"name": "Henry Hub", "lat": 30.300, "lon": -92.040},
    "mb": {"name": "Mont Belvieu", "lat": 29.850, "lon": -94.890},
}

ROUTE_GEOMETRIES = {
    "route_marine_marcus_rafnes": [
        [39.819, -75.418],
        [44.500, -56.000],
        [52.000, -28.000],
        [58.000, -5.500],
        [59.100, 9.650],
    ],
    "route_marine_freeport_brunsbuttel": [
        [28.954, -95.359],
        [35.500, -72.000],
        [48.000, -33.000],
        [52.500, -6.000],
        [53.895, 9.145],
    ],
    "route_pipeline_texas_ngl": [
        [29.850, -94.890],
        [30.100, -93.200],
        [30.300, -92.040],
    ],
    "route_rail_nwe_distribution": [
        [51.950, 4.130],
        [52.350, 7.200],
        [53.895, 9.145],
    ],
    "route_truck_scandi_last_mile": [
        [59.100, 9.650],
        [58.600, 10.500],
        [58.070, 11.820],
    ],
}


def _base_object(
    *,
    id: str,
    feature_id: str,
    layer_key: str,
    object_type: str,
    name: str,
    metric: float,
    unit: str,
    status: str,
    severity: str = "medium",
    lat: float | None = None,
    lon: float | None = None,
    geometry: dict[str, Any] | None = None,
    source_system: str = "Radiant demo atlas",
    source_timestamp: str | None = None,
    is_demo: bool = True,
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "feature_id": feature_id,
        "layer_key": layer_key,
        "object_type": object_type,
        "name": name,
        "lat": lat,
        "lon": lon,
        "geometry": geometry,
        "metric": metric,
        "unit": unit,
        "status": status,
        "severity": severity,
        "source_system": source_system,
        "source_timestamp": source_timestamp or _now(),
        "is_demo": is_demo,
        "detail": detail or {},
    }


def _status_from_value(value: float, watch: float, breach: float) -> tuple[str, str]:
    magnitude = abs(value)
    if magnitude >= breach:
        return "breach", "high"
    if magnitude >= watch:
        return "watch", "medium"
    return "ok", "low"


def _demo_nodes() -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for key, point in PORTS.items():
        status = "watch" if key in {"rafnes", "freeport"} else "ok"
        nodes.append(_base_object(
            id=f"node_{key}",
            feature_id="F-16",
            layer_key="logistics",
            object_type="node",
            name=point["name"],
            lat=point["lat"],
            lon=point["lon"],
            metric=42000 if key == "rafnes" else 18000,
            unit="open bbl obligation",
            status=status,
            severity="medium" if status == "watch" else "low",
            detail={
                "location_type": "terminal",
                "open_receipts_bbl": 26000 if key in {"marcus_hook", "freeport"} else 9000,
                "open_deliveries_bbl": 42000 if key == "rafnes" else 12000,
                "reconciliation_status": "watch" if key == "rafnes" else "reconciled",
                "lineage": ["RightAngle movement schedule", "Vessel scheduler", "Radiant Atlas location mapping"],
            },
        ))
    return nodes


def _position_nodes(db: Session) -> list[dict[str, Any]]:
    positions = db.query(Position).options(joinedload(Position.book)).all()
    buckets: dict[str, dict[str, Any]] = {}
    for pos in positions:
        commodity = (pos.commodity or "").lower()
        if "gas" in commodity or "hh" in commodity:
            hub_key = "hh"
        elif "ethane" in commodity or "ngl" in commodity:
            hub_key = "mb"
        elif "naphtha" in commodity:
            hub_key = "nwe"
        elif "carbon" in commodity or "eua" in commodity:
            hub_key = "ttf"
        else:
            hub_key = "brent"
        bucket = buckets.setdefault(hub_key, {"net": 0.0, "var": 0.0, "pnl": 0.0, "records": 0})
        bucket["net"] += float(pos.net_volume or 0)
        bucket["var"] += float(pos.var_contribution or 0)
        bucket["pnl"] += float(pos.mtm_pnl or 0)
        bucket["records"] += 1

    if not buckets:
        buckets = {
            "brent": {"net": 82000, "var": 1420000, "pnl": 620000, "records": 3},
            "mb": {"net": -36000, "var": 960000, "pnl": -180000, "records": 2},
            "nwe": {"net": 54000, "var": 1180000, "pnl": 420000, "records": 2},
        }

    nodes: list[dict[str, Any]] = []
    for hub_key, values in buckets.items():
        hub = HUBS.get(hub_key, HUBS["brent"])
        status, severity = _status_from_value(values["var"], 900000, 1400000)
        net = round(values["net"], 0)
        nodes.append(_base_object(
            id=f"hub_position_{hub_key}",
            feature_id="F-14",
            layer_key="positions",
            object_type="hub",
            name=f"{hub['name']} position",
            lat=hub["lat"],
            lon=hub["lon"],
            metric=net,
            unit="bbl net",
            status=status,
            severity=severity,
            source_system="Trader positions",
            is_demo=False if positions else True,
            detail={
                "net_length_short_bbl": net,
                "position_direction": "long" if net >= 0 else "short",
                "var_contribution_usd": round(values["var"], 0),
                "mtm_pnl_usd": round(values["pnl"], 0),
                "position_records": values["records"],
                "concentration_score": min(100, round(abs(net) / 1000, 1)),
                "lineage": ["positions table", "book mapping", "demo hub geocode" if positions else "demo position fixture"],
            },
        ))
    return nodes


def _trade_pins(db: Session) -> list[dict[str, Any]]:
    trades = (
        db.query(Trade)
        .options(joinedload(Trade.counterparty), joinedload(Trade.book))
        .order_by(Trade.created_at.desc())
        .limit(12)
        .all()
    )
    location_cycle = ["marcus_hook", "rafnes", "freeport", "grangemouth", "stenungsund"]
    pins: list[dict[str, Any]] = []
    for idx, trade in enumerate(trades):
        point = PORTS[location_cycle[idx % len(location_cycle)]]
        unpriced = trade.price is None or str(trade.price_basis or "").lower() in {"index", "floating", "tbd"}
        status = "watch" if unpriced else "ok"
        pins.append(_base_object(
            id=f"deal_{trade.trade_ref}",
            feature_id="F-01",
            layer_key="deals",
            object_type="pin",
            name=f"{trade.trade_ref} {trade.direction} {trade.commodity}",
            lat=point["lat"] + (idx % 3) * 0.18,
            lon=point["lon"] + (idx % 2) * 0.22,
            metric=float(trade.volume or 0),
            unit=trade.volume_unit or "bbl",
            status=status,
            severity="medium" if unpriced else "low",
            source_system=trade.source_system or "RightAngle",
            source_timestamp=trade.updated_at.isoformat() if trade.updated_at else None,
            is_demo=True,
            detail={
                "trade_ref": trade.trade_ref,
                "counterparty": trade.counterparty.name if trade.counterparty else None,
                "book": trade.book.name if trade.book else None,
                "price": trade.price,
                "price_basis": trade.price_basis,
                "unpriced_volume_flag": unpriced,
                "mapped_location": point["name"],
                "deal_to_physical_thread": "Linked to scheduled corridor by demo location mapping",
                "lineage": ["trades table", "demo receipt/delivery geocode", "route inference"],
            },
        ))
    if pins:
        return pins
    return [
        _base_object(
            id="deal_demo_rmvt_0234",
            feature_id="F-01",
            layer_key="deals",
            object_type="pin",
            name="RMVT-0234 Vitol confirmation",
            lat=PORTS["marcus_hook"]["lat"],
            lon=PORTS["marcus_hook"]["lon"],
            metric=50000,
            unit="bbl",
            status="watch",
            detail={"unpriced_volume_flag": True, "deal_to_physical_thread": "Demo linked to Marcus Hook -> Rafnes"},
        )
    ]


def _pricing_nodes(db: Session) -> list[dict[str, Any]]:
    latest: dict[str, MarketData] = {}
    for row in db.query(MarketData).order_by(MarketData.timestamp.desc()).limit(100).all():
        latest.setdefault((row.commodity or "").lower(), row)
    specs = [
        ("brent", "Brent", "F-24"),
        ("nwe", "Naphtha", "F-24"),
        ("ttf", "TTF", "F-24"),
        ("hh", "HH", "F-24"),
        ("mb", "Ethane", "F-24"),
    ]
    nodes: list[dict[str, Any]] = []
    for hub_key, commodity_key, feature_id in specs:
        hub = HUBS[hub_key]
        match = next((row for key, row in latest.items() if commodity_key.lower() in key), None)
        price = float(match.price) if match else {"Brent": 82.4, "Naphtha": 612, "TTF": 35.6, "HH": 2.84, "Ethane": 248}[commodity_key]
        change = float(match.change_pct_1d or 0) if match else (1.2 if commodity_key in {"Brent", "Ethane"} else -0.7)
        nodes.append(_base_object(
            id=f"pricing_{hub_key}",
            feature_id=feature_id,
            layer_key="pricing",
            object_type="hub",
            name=f"{hub['name']} index",
            lat=hub["lat"] + 0.35,
            lon=hub["lon"] - 0.35,
            metric=round(price, 2),
            unit=match.price_unit if match else "USD",
            status="watch" if abs(change) > 1 else "ok",
            severity="medium" if abs(change) > 1 else "low",
            source_system=match.source if match else "Radiant market demo",
            source_timestamp=match.timestamp.isoformat() if match and match.timestamp else None,
            is_demo=False if match else True,
            detail={
                "commodity": commodity_key,
                "change_pct_1d": change,
                "forward_curve": [round(price * factor, 2) for factor in (1.00, 1.01, 1.005, 0.997, 0.992, 0.989)],
                "lineage": ["market_data table" if match else "demo forward curve fixture"],
            },
        ))
    return nodes


def _vessel_nodes(db: Session) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for vessel in db.query(Vessel).order_by(Vessel.updated_at.desc()).limit(10).all():
        if vessel.current_lat is None or vessel.current_lon is None:
            continue
        demurrage = float(vessel.delay_hours or 0) * float((vessel.charter_party_rate or 45000) / 24)
        delayed = float(vessel.delay_hours or 0) > 0
        nodes.append(_base_object(
            id=f"vessel_{vessel.id}",
            feature_id="F-07",
            layer_key="vessels",
            object_type="pin",
            name=vessel.name,
            lat=float(vessel.current_lat),
            lon=float(vessel.current_lon),
            metric=round(demurrage, 0),
            unit="USD demurrage",
            status="breach" if delayed else "ok",
            severity="high" if delayed else "low",
            source_system="Vessel scheduler",
            source_timestamp=vessel.updated_at.isoformat() if vessel.updated_at else None,
            is_demo=False,
            detail={
                "origin": vessel.origin_port,
                "destination": vessel.destination_port,
                "delay_hours": vessel.delay_hours or 0,
                "allowed_laytime_hours": vessel.allowed_laytime_hours,
                "cargo": vessel.cargo_commodity,
                "cargo_volume_mt": vessel.cargo_volume_mt,
                "demurrage_accrued_usd": round(demurrage, 0),
                "lineage": ["vessels table", "demurrage calculation"],
            },
        ))
    return nodes


def _risk_nodes() -> list[dict[str, Any]]:
    specs = [
        ("risk_heat_gulf", "Gulf Coast VaR heat", 29.900, -94.200, 2_400_000, "breach", "high"),
        ("risk_heat_north_sea", "North Sea price exposure", 59.700, 1.700, 1_620_000, "watch", "medium"),
        ("risk_heat_nwe", "NWE basis exposure", 52.100, 4.600, 1_180_000, "watch", "medium"),
        ("risk_heat_scandi", "Scandinavia delivery stress", 58.800, 10.400, 780_000, "ok", "low"),
    ]
    return [
        _base_object(
            id=id,
            feature_id="F-18",
            layer_key="risk",
            object_type="heat",
            name=name,
            lat=lat,
            lon=lon,
            metric=metric,
            unit="USD VaR",
            status=status,
            severity=severity,
            detail={
                "price_exposure_usd": metric * 18,
                "var_usd": metric,
                "drivers": ["Prompt Brent delta", "Ethane/Naphtha basis", "Open delivery obligations"],
                "lineage": ["risk engine snapshot", "demo regional geocode"],
            },
        )
        for id, name, lat, lon, metric, status, severity in specs
    ]


def _anomaly_nodes() -> list[dict[str, Any]]:
    return [
        _base_object(
            id="anomaly_unpriced_rafnes",
            feature_id="F-45",
            layer_key="ai-anomalies",
            object_type="anomaly",
            name="Unpriced volume clustered near Rafnes",
            lat=59.240,
            lon=9.850,
            metric=41000,
            unit="bbl unpriced",
            status="watch",
            severity="medium",
            detail={
                "anomaly_type": "pricing gap",
                "confidence_pct": 84,
                "recommended_action": "Confirm index election before delivery window.",
                "lineage": ["AI anomaly detector", "trade pricing completeness check"],
            },
        ),
        _base_object(
            id="anomaly_basis_gulf_nwe",
            feature_id="F-45",
            layer_key="ai-anomalies",
            object_type="anomaly",
            name="Basis volatility above 90-day band",
            lat=42.100,
            lon=-42.000,
            metric=2.3,
            unit="sigma",
            status="breach",
            severity="high",
            detail={
                "anomaly_type": "basis risk",
                "confidence_pct": 91,
                "recommended_action": "Review Gulf Coast to NWE hedge coverage.",
                "lineage": ["AI anomaly detector", "market_data spread monitor"],
            },
        ),
    ]


def _routes() -> list[dict[str, Any]]:
    specs = [
        ("route_marine_marcus_rafnes", "Marcus Hook to Rafnes", "marine", "F-03", 480000, "watch"),
        ("route_marine_freeport_brunsbuttel", "Freeport to Brunsbuttel", "marine", "F-06", 310000, "ok"),
        ("route_pipeline_texas_ngl", "Mont Belvieu to Henry Hub", "pipeline", "F-06", 185000, "ok"),
        ("route_rail_nwe_distribution", "NWE rail distribution", "rail", "F-06", 94000, "watch"),
        ("route_truck_scandi_last_mile", "Rafnes to Stenungsund last mile", "truck", "F-06", 42000, "ok"),
        ("basis_brent_nwe", "Brent to NWE basis differential", "basis", "F-25", 3.20, "watch"),
        ("basis_hh_ttf", "HH to TTF basis volatility", "basis", "F-19", 41.0, "breach"),
    ]
    route_map = {
        "basis_brent_nwe": [[HUBS["brent"]["lat"], HUBS["brent"]["lon"]], [HUBS["nwe"]["lat"], HUBS["nwe"]["lon"]]],
        "basis_hh_ttf": [[HUBS["hh"]["lat"], HUBS["hh"]["lon"]], [HUBS["ttf"]["lat"], HUBS["ttf"]["lon"]]],
    }
    routes: list[dict[str, Any]] = []
    for route_id, name, mode, feature_id, metric, status in specs:
        coords = ROUTE_GEOMETRIES.get(route_id) or route_map[route_id]
        severity = "high" if status == "breach" else "medium" if status == "watch" else "low"
        routes.append(_base_object(
            id=route_id,
            feature_id=feature_id,
            layer_key="basis" if mode == "basis" else "logistics",
            object_type="route",
            name=name,
            geometry={"type": "LineString", "coordinates": [[lon, lat] for lat, lon in coords]},
            metric=metric,
            unit="USD margin" if mode != "basis" else ("vol pct" if feature_id == "F-19" else "USD/bbl"),
            status=status,
            severity=severity,
            detail={
                "transport_mode": mode,
                "route_id": route_id,
                "origin": name.split(" to ")[0],
                "destination": name.split(" to ")[-1] if " to " in name else None,
                "basis_volatility_pct": metric if feature_id == "F-19" else None,
                "basis_differential_usd_bbl": metric if feature_id == "F-25" else None,
                "reconciliation_status": "break" if status == "breach" else "watch" if status == "watch" else "reconciled",
                "lineage": ["demo route geometry", "movement schedule", "market basis monitor"],
            },
        ))
    return routes


def _all_nodes(db: Session) -> list[dict[str, Any]]:
    return (
        _demo_nodes()
        + _position_nodes(db)
        + _trade_pins(db)
        + _pricing_nodes(db)
        + _vessel_nodes(db)
        + _risk_nodes()
        + _anomaly_nodes()
    )


def _all_objects(db: Session) -> list[dict[str, Any]]:
    return _all_nodes(db) + _routes()


def _layers() -> list[dict[str, Any]]:
    return [
        {"key": "deals", "label": "Deals", "feature_ids": ["F-01", "F-03", "F-26"], "default_visible": True},
        {"key": "logistics", "label": "Logistics", "feature_ids": ["F-03", "F-06", "F-07", "F-16"], "default_visible": True},
        {"key": "vessels", "label": "Vessels", "feature_ids": ["F-07"], "default_visible": True},
        {"key": "positions", "label": "Positions", "feature_ids": ["F-14", "F-17"], "default_visible": True},
        {"key": "risk", "label": "Risk", "feature_ids": ["F-18", "F-20"], "default_visible": True},
        {"key": "pricing", "label": "Pricing", "feature_ids": ["F-24", "F-25", "F-26"], "default_visible": True},
        {"key": "basis", "label": "Basis", "feature_ids": ["F-19", "F-25"], "default_visible": True},
        {"key": "trust", "label": "Trust", "feature_ids": ["F-43", "F-44"], "default_visible": True},
        {"key": "ai-anomalies", "label": "AI Anomalies", "feature_ids": ["F-45"], "default_visible": True},
    ]


@router.get("/summary")
async def atlas_summary(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    objects = _all_objects(db)
    nodes = [obj for obj in objects if obj["object_type"] != "route"]
    routes = [obj for obj in objects if obj["object_type"] == "route"]
    return {
        "as_of": _now(),
        "data_state": "mixed",
        "active_deals": len([n for n in nodes if n["layer_key"] == "deals"]),
        "mapped_routes": len(routes),
        "net_exposure": round(sum(float(n["metric"] or 0) for n in nodes if n["layer_key"] == "positions"), 0),
        "risk_watch_count": len([obj for obj in objects if obj["status"] in {"watch", "breach"} and obj["layer_key"] in {"risk", "basis"}]),
        "anomalies": len([n for n in nodes if n["layer_key"] == "ai-anomalies"]),
        "reconciliation": {
            "reconciled": len([obj for obj in objects if obj.get("detail", {}).get("reconciliation_status") == "reconciled"]),
            "watch": len([obj for obj in objects if obj.get("detail", {}).get("reconciliation_status") == "watch"]),
            "break": len([obj for obj in objects if obj.get("detail", {}).get("reconciliation_status") == "break"]),
        },
        "layer_count": len(_layers()),
    }


@router.get("/nodes")
async def atlas_nodes(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return {"as_of": _now(), "nodes": _all_nodes(db)}


@router.get("/routes")
async def atlas_routes(current_user=Depends(get_current_user)):
    return {"as_of": _now(), "routes": _routes()}


@router.get("/layers")
async def atlas_layers(current_user=Depends(get_current_user)):
    return {"as_of": _now(), "layers": _layers()}


@router.get("/layers/{layer_key}")
async def atlas_layer(layer_key: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    valid = {layer["key"] for layer in _layers()}
    if layer_key not in valid:
        raise HTTPException(status_code=404, detail="Atlas layer not found")
    objects = [
        obj for obj in _all_objects(db)
        if obj["layer_key"] == layer_key
        or (layer_key == "trust" and obj.get("detail", {}).get("reconciliation_status"))
    ]
    return {"as_of": _now(), "layer_key": layer_key, "objects": objects}


@router.get("/lineage/{object_type}/{object_id}")
async def atlas_lineage(object_type: str, object_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    obj = next((item for item in _all_objects(db) if item["id"] == object_id and item["object_type"] == object_type), None)
    if not obj:
        raise HTTPException(status_code=404, detail="Atlas object not found")
    return {
        "object_type": object_type,
        "object_id": object_id,
        "name": obj["name"],
        "source_system": obj["source_system"],
        "source_timestamp": obj["source_timestamp"],
        "is_demo": obj["is_demo"],
        "reconciliation_status": obj.get("detail", {}).get("reconciliation_status", obj["status"]),
        "lineage": obj.get("detail", {}).get("lineage", []),
        "sync_metadata": {
            "atlas_materialized_at": _now(),
            "source_record_id": obj.get("detail", {}).get("trade_ref") or obj.get("detail", {}).get("route_id") or object_id,
            "mapping_confidence": "demo-spatial" if obj["is_demo"] else "source-backed",
        },
    }


@router.get("/risk/var-heat")
async def atlas_risk_var_heat(current_user=Depends(get_current_user)):
    return {"as_of": _now(), "heat": _risk_nodes()}


@router.get("/risk/basis-volatility")
async def atlas_basis_volatility(current_user=Depends(get_current_user)):
    return {
        "as_of": _now(),
        "connectors": [route for route in _routes() if route["feature_id"] in {"F-19", "F-25"}],
    }


class ScenarioRequest(BaseModel):
    scenario_key: str = "brent_down_5"
    shock_pct: float | None = None


@router.post("/risk/scenario-overlay")
async def atlas_scenario_overlay(body: ScenarioRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    shock_map = {
        "brent_down_5": -5.0,
        "basis_widen_15": 15.0,
        "freight_delay_24h": 8.0,
        "ngl_rally_7": 7.0,
    }
    shock = float(body.shock_pct if body.shock_pct is not None else shock_map.get(body.scenario_key, -5.0))
    impacted = []
    for obj in deepcopy(_all_objects(db)):
        impact = 0.0
        if obj["layer_key"] in {"risk", "positions", "basis"}:
            impact = abs(float(obj["metric"] or 0)) * abs(shock) / 100
        elif obj["layer_key"] in {"logistics", "vessels"} and "freight" in body.scenario_key:
            impact = max(abs(float(obj["metric"] or 0)) * 0.12, 25000)
        if impact:
            obj["scenario"] = {
                "scenario_key": body.scenario_key,
                "shock_pct": shock,
                "impact_metric": round(impact, 0),
                "overlay_status": "breach" if impact > 900000 else "watch" if impact > 200000 else "ok",
            }
            obj["status"] = obj["scenario"]["overlay_status"]
            obj["severity"] = "high" if obj["status"] == "breach" else "medium" if obj["status"] == "watch" else "low"
            impacted.append(obj)
    return {
        "as_of": _now(),
        "scenario_key": body.scenario_key,
        "shock_pct": shock,
        "objects": impacted,
        "summary": {
            "impacted_objects": len(impacted),
            "estimated_pnl_or_var_impact": round(sum(item["scenario"]["impact_metric"] for item in impacted), 0),
            "breaches": len([item for item in impacted if item["status"] == "breach"]),
            "watches": len([item for item in impacted if item["status"] == "watch"]),
        },
    }


@router.get("/trades/deal-pins")
async def atlas_deal_pins(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return {"as_of": _now(), "deal_pins": _trade_pins(db)}


@router.get("/positions/hubs")
async def atlas_position_hubs(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return {"as_of": _now(), "hubs": _position_nodes(db)}


@router.get("/pricing/hubs")
async def atlas_pricing_hubs(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return {"as_of": _now(), "hubs": _pricing_nodes(db)}


@router.get("/anomalies")
async def atlas_anomalies(current_user=Depends(get_current_user)):
    return {"as_of": _now(), "anomalies": _anomaly_nodes()}
