"""
api/vessels.py — Vessel tracking and voyage economics
INEOS Trading & Shipping — Radiant-MVT
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.db import get_db
from api.auth import get_current_user
from database.models import Vessel, Counterparty
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/")
async def get_vessels(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Full fleet list with live demurrage calculations."""
    vessels = db.query(Vessel).order_by(Vessel.eta).all()
    result = []
    for v in vessels:
        cp = db.query(Counterparty).filter(Counterparty.id == v.booked_counterparty_id).first()
        demurrage_accrued = (v.delay_hours or 0) * ((v.charter_party_rate or 45_000) / 24)
        result.append({
            "id": v.id,
            "name": v.name,
            "imo_number": v.imo_number,
            "capacity_m3": v.capacity_m3,
            "vessel_type": v.vessel_type,
            "flag": v.flag,
            "current_lat": v.current_lat,
            "current_lon": v.current_lon,
            "origin_port": v.origin_port,
            "destination_port": v.destination_port,
            "eta": str(v.eta) if v.eta else None,
            "original_eta": str(v.original_eta) if v.original_eta else None,
            "delay_hours": v.delay_hours or 0,
            "status": v.status,
            "cargo_commodity": v.cargo_commodity,
            "cargo_volume_mt": v.cargo_volume_mt,
            "charter_party_rate": v.charter_party_rate,
            "demurrage_accrued_usd": round(demurrage_accrued, 2),
            "booked_counterparty": cp.name if cp else None,
            "updated_at": str(v.updated_at) if v.updated_at else None,
        })
    return result


@router.get("/fleet-summary")
async def get_fleet_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Aggregated fleet health: delays, demurrage exposure."""
    vessels = db.query(Vessel).all()
    total_demurrage = sum(
        (v.delay_hours or 0) * ((v.charter_party_rate or 45_000) / 24) for v in vessels
    )
    delayed = [v for v in vessels if (v.delay_hours or 0) > 0]
    return {
        "total_vessels": len(vessels),
        "en_route": len([v for v in vessels if v.status == "En Route"]),
        "delayed": len(delayed),
        "total_demurrage_exposure_usd": round(total_demurrage, 2),
        "vessels_at_risk": [
            {
                "name": v.name,
                "delay_hours": v.delay_hours,
                "demurrage_usd": round((v.delay_hours or 0) * ((v.charter_party_rate or 45_000) / 24), 2),
                "destination_port": v.destination_port,
                "eta": str(v.eta) if v.eta else None,
            }
            for v in delayed
        ],
    }


@router.get("/{vessel_id}/voyage-economics")
async def get_voyage_economics(
    vessel_id: int,
    delay_hours: float = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Three-option voyage economics analysis for a vessel."""
    from calculators.voyage import VoyageCalculator

    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    effective_delay = delay_hours if delay_hours > 0 else (vessel.delay_hours or 0)
    calc = VoyageCalculator(
        vessel_name=vessel.name,
        cargo_volume_mt=vessel.cargo_volume_mt or 12_000,
        delay_hours=effective_delay,
        destination=vessel.destination_port or "Rafnes, Norway",
    )
    return calc.calculate_three_options()


@router.post("/{vessel_id}/trigger-delay")
async def trigger_vessel_delay(
    vessel_id: int,
    delay_hours: float = Query(..., description="Delay in hours to apply"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Demo scenario: apply a delay to a vessel and recalculate ETA."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")

    # Store original ETA on first delay
    if not vessel.original_eta and vessel.eta:
        vessel.original_eta = vessel.eta

    new_eta = None
    base_eta = vessel.original_eta or vessel.eta
    if base_eta:
        try:
            if isinstance(base_eta, str):
                from dateutil import parser as dp
                base_dt = dp.parse(base_eta)
            else:
                base_dt = datetime.fromisoformat(str(base_eta))
            new_eta = (base_dt + timedelta(hours=delay_hours)).isoformat()
        except Exception:
            new_eta = None

    vessel.delay_hours = delay_hours
    if new_eta:
        vessel.eta = new_eta
    vessel.updated_at = datetime.utcnow()
    db.commit()

    return {
        "vessel_id": vessel_id,
        "vessel_name": vessel.name,
        "delay_hours": delay_hours,
        "new_eta": new_eta,
        "status": "updated",
    }
