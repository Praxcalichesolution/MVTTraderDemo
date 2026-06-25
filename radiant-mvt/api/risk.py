"""
Risk module API.
"""
from __future__ import annotations

from datetime import date
import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from api.auth import get_current_user
from calculators.risk_engine import (
    backtest_observations,
    build_limits,
    build_reports,
    historical_var_es,
    normalize_positions,
    stress_scenarios,
)
from database.db import get_db
from database.models import (
    Alert,
    MarketData,
    Position,
    RiskBacktestObservation,
    RiskLimit,
    RiskMetricRun,
    RiskNormalizedExposure,
    RiskReport,
    RiskStressRun,
)


router = APIRouter()


def _market_prices(db: Session) -> dict[str, float]:
    rows = db.query(MarketData).order_by(MarketData.timestamp.desc()).limit(500).all()
    prices = {}
    for row in rows:
        if row.commodity not in prices:
            prices[row.commodity] = float(row.price or 0)
    return prices


def _json_loads(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _metric_payload(row: RiskMetricRun) -> dict:
    payload = _json_loads(row.payload_json, {})
    return {
        "id": row.id,
        "run_date": row.run_date.isoformat() if row.run_date else None,
        "confidence": row.confidence,
        "horizon_days": row.horizon_days,
        "method": row.method,
        "var_amount": row.var_amount,
        "expected_shortfall": row.expected_shortfall,
        "portfolio_value": row.portfolio_value,
        "observations": row.observations,
        "exceptions_count": row.exceptions_count,
        "status": row.status,
        "generated_by": row.generated_by,
        **payload,
    }


def _exposure_payload(row: RiskNormalizedExposure) -> dict:
    return {
        "id": row.id,
        "position_id": row.position_id,
        "book_id": row.book_id,
        "book_name": row.book_name,
        "commodity": row.commodity,
        "region": row.region,
        "tenor": row.tenor,
        "source_type": row.source_type,
        "physical_volume": row.physical_volume,
        "financial_volume": row.financial_volume,
        "net_volume": row.net_volume,
        "delta_equivalent": row.delta_equivalent,
        "basis_bucket": row.basis_bucket,
        "location_basis": row.location_basis,
        "hedge_effectiveness": row.hedge_effectiveness,
        "normalized_price": row.normalized_price,
        "notional_usd": row.notional_usd,
        "as_of": row.as_of.isoformat() if row.as_of else None,
    }


def _stress_payload(row: RiskStressRun) -> dict:
    payload = _json_loads(row.payload_json, {})
    return {
        "id": row.id,
        "scenario_name": row.scenario_name,
        "scenario_type": row.scenario_type,
        "total_pnl_impact": row.total_pnl_impact,
        "worst_book": row.worst_book,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        **payload,
    }


def _limit_payload(row: RiskLimit) -> dict:
    return {
        "id": row.id,
        "scope_type": row.scope_type,
        "scope_name": row.scope_name,
        "metric": row.metric,
        "limit_amount": row.limit_amount,
        "warning_pct": row.warning_pct,
        "breach_pct": row.breach_pct,
        "current_value": row.current_value,
        "utilization_pct": row.utilization_pct,
        "status": row.status,
        "escalation": row.escalation,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _report_payload(row: RiskReport) -> dict:
    return {
        "id": row.id,
        "report_date": row.report_date.isoformat() if row.report_date else None,
        "report_type": row.report_type,
        "title": row.title,
        "status": row.status,
        "methodology": row.methodology,
        "summary": _json_loads(row.summary_json, {}),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _backtest_payload(row: RiskBacktestObservation) -> dict:
    return {
        "id": row.id,
        "observation_date": row.observation_date.isoformat() if row.observation_date else None,
        "confidence": row.confidence,
        "horizon_days": row.horizon_days,
        "predicted_var": row.predicted_var,
        "realized_pnl": row.realized_pnl,
        "exception_flag": row.exception_flag,
        "exception_amount": row.exception_amount,
        "notes": row.notes,
    }


def _metric_matches(metric: dict, confidence: float, horizon_days: int) -> bool:
    return abs(float(metric.get("confidence") or 0) - float(confidence)) < 0.0001 and int(metric.get("horizon_days") or 0) == int(horizon_days)


def _refresh_snapshot(db: Session, user: dict | None = None) -> dict:
    positions = db.query(Position).options(joinedload(Position.book)).all()
    exposures = normalize_positions(positions, _market_prices(db))
    metrics = [
        historical_var_es(exposures, confidence=confidence, horizon_days=horizon)
        for confidence in (0.95, 0.99)
        for horizon in (1, 10)
    ]
    var_1d_99 = next((m["var_amount"] for m in metrics if m["confidence"] == 0.99 and m["horizon_days"] == 1), 0)
    stress = stress_scenarios(exposures)
    backtests = backtest_observations(var_1d_99)
    exception_count = sum(1 for row in backtests if row["exception_flag"])
    for metric in metrics:
        metric["exceptions_count"] = exception_count if metric["confidence"] == 0.99 and metric["horizon_days"] == 1 else 0
    limits = build_limits(metrics, exposures)
    reports = build_reports(metrics, stress, limits)

    db.query(RiskNormalizedExposure).delete()
    db.query(RiskMetricRun).delete()
    db.query(RiskStressRun).delete()
    db.query(RiskBacktestObservation).delete()
    db.query(RiskLimit).delete()
    db.query(RiskReport).delete()

    for exp in exposures:
        db.add(RiskNormalizedExposure(**exp))

    generated_by = user.get("email") if isinstance(user, dict) else None
    for metric in metrics:
        payload = {
            "breakdown_by_commodity": metric.get("breakdown_by_commodity", {}),
            "return_source": metric.get("return_source"),
        }
        db.add(RiskMetricRun(
            confidence=metric["confidence"],
            horizon_days=metric["horizon_days"],
            method=metric["methodology"],
            var_amount=metric["var_amount"],
            expected_shortfall=metric["expected_shortfall"],
            portfolio_value=metric["portfolio_value"],
            observations=metric["observations"],
            exceptions_count=metric.get("exceptions_count", 0),
            status="Complete",
            generated_by=generated_by,
            payload_json=json.dumps(payload),
        ))

    for scenario in stress:
        payload = {
            "description": scenario["description"],
            "by_book": scenario["by_book"],
            "by_commodity": scenario["by_commodity"],
        }
        db.add(RiskStressRun(
            scenario_name=scenario["scenario_name"],
            scenario_type=scenario["scenario_type"],
            total_pnl_impact=scenario["total_pnl_impact"],
            worst_book=scenario["worst_book"],
            payload_json=json.dumps(payload),
        ))

    for row in backtests:
        db.add(RiskBacktestObservation(
            observation_date=date.fromisoformat(row["observation_date"]),
            confidence=row["confidence"],
            horizon_days=row["horizon_days"],
            predicted_var=row["predicted_var"],
            realized_pnl=row["realized_pnl"],
            exception_flag=row["exception_flag"],
            exception_amount=row["exception_amount"],
            notes=row["notes"],
        ))

    for row in limits:
        db.add(RiskLimit(**row))
        if row["status"] != "OK":
            title = f"Risk limit {row['status'].lower()}: {row['metric']}"
            existing = db.query(Alert).filter(Alert.title == title, Alert.status.in_(["Open", "Acknowledged"])).first()
            if not existing:
                db.add(Alert(
                    alert_type="Risk Limit",
                    severity="Critical" if row["status"] == "Breach" else "High",
                    title=title,
                    description=(
                        f"{row['scope_name']} is at {row['utilization_pct']}% of "
                        f"the {row['metric']} limit."
                    ),
                    affected_book=row["scope_name"],
                    estimated_impact=row["current_value"],
                    ai_explanation="Generated by Risk Module limit monitoring.",
                    ai_draft_action="Review exposure drivers and escalate through Credit alert pipeline.",
                    status="Open",
                ))

    for row in reports:
        db.add(RiskReport(
            report_date=date.fromisoformat(row["report_date"]),
            report_type=row["report_type"],
            title=row["title"],
            status=row["status"],
            methodology=row["methodology"],
            summary_json=json.dumps(row["summary"]),
        ))

    db.commit()
    return {
        "exposures": exposures,
        "metrics": metrics,
        "stress": stress,
        "backtesting": backtests,
        "limits": limits,
        "reports": reports,
    }


def _ensure_snapshot(db: Session, user: dict | None = None) -> None:
    if db.query(RiskMetricRun).count() == 0:
        _refresh_snapshot(db, user)


@router.post("/run")
async def run_risk_snapshot(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    snapshot = _refresh_snapshot(db, current_user)
    return {
        "status": "complete",
        "exposures": len(snapshot["exposures"]),
        "metrics": len(snapshot["metrics"]),
        "stress_scenarios": len(snapshot["stress"]),
        "backtesting_observations": len(snapshot["backtesting"]),
        "limits": len(snapshot["limits"]),
        "reports": len(snapshot["reports"]),
    }


@router.get("/overview")
async def get_risk_overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    metrics = [_metric_payload(row) for row in db.query(RiskMetricRun).order_by(RiskMetricRun.confidence, RiskMetricRun.horizon_days).all()]
    exposures = [_exposure_payload(row) for row in db.query(RiskNormalizedExposure).order_by(RiskNormalizedExposure.book_name, RiskNormalizedExposure.commodity).all()]
    stress = [_stress_payload(row) for row in db.query(RiskStressRun).order_by(RiskStressRun.total_pnl_impact).all()]
    backtests = [_backtest_payload(row) for row in db.query(RiskBacktestObservation).order_by(RiskBacktestObservation.observation_date.desc()).limit(60).all()]
    limits = [_limit_payload(row) for row in db.query(RiskLimit).order_by(RiskLimit.utilization_pct.desc()).all()]
    reports = [_report_payload(row) for row in db.query(RiskReport).order_by(RiskReport.created_at.desc()).all()]
    latest_var = next((m for m in metrics if _metric_matches(m, 0.99, 1)), metrics[0] if metrics else None)
    return {
        "as_of": date.today().isoformat(),
        "methodology": "Historical Simulation VaR and Expected Shortfall",
        "market_history_days": 260,
        "latest_var": latest_var,
        "exposures": exposures,
        "metrics": metrics,
        "stress": stress,
        "backtesting": {
            "observations": backtests,
            "exceptions": sum(1 for row in backtests if row["exception_flag"]),
            "exception_rate_pct": round(sum(1 for row in backtests if row["exception_flag"]) / len(backtests) * 100, 1) if backtests else 0,
        },
        "limits": limits,
        "reports": reports,
    }


@router.get("/exposures")
async def get_exposures(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    return [_exposure_payload(row) for row in db.query(RiskNormalizedExposure).all()]


@router.get("/metrics")
async def get_metrics(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    return [_metric_payload(row) for row in db.query(RiskMetricRun).order_by(RiskMetricRun.confidence, RiskMetricRun.horizon_days).all()]


@router.get("/var")
async def get_var_metric(
    confidence: float = Query(0.99),
    horizon_days: int = Query(1),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_snapshot(db, current_user)
    rows = db.query(RiskMetricRun).filter(RiskMetricRun.horizon_days == horizon_days).all()
    row = next((candidate for candidate in rows if abs(float(candidate.confidence or 0) - float(confidence)) < 0.0001), None)
    if row:
        return _metric_payload(row)
    snapshot = _refresh_snapshot(db, current_user)
    return next(
        (metric for metric in snapshot["metrics"] if _metric_matches(metric, confidence, horizon_days)),
        {},
    )


@router.get("/stress")
async def get_stress(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    return [_stress_payload(row) for row in db.query(RiskStressRun).order_by(RiskStressRun.total_pnl_impact).all()]


@router.get("/backtesting")
async def get_backtesting(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    rows = [_backtest_payload(row) for row in db.query(RiskBacktestObservation).order_by(RiskBacktestObservation.observation_date.desc()).all()]
    return {
        "observations": rows,
        "exceptions": sum(1 for row in rows if row["exception_flag"]),
        "exception_rate_pct": round(sum(1 for row in rows if row["exception_flag"]) / len(rows) * 100, 1) if rows else 0,
    }


@router.get("/limits")
async def get_limits(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    return [_limit_payload(row) for row in db.query(RiskLimit).order_by(RiskLimit.utilization_pct.desc()).all()]


@router.get("/reports")
async def get_reports(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _ensure_snapshot(db, current_user)
    return [_report_payload(row) for row in db.query(RiskReport).order_by(RiskReport.created_at.desc()).all()]
