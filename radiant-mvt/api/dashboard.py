"""
Dashboard aggregation routes with short-lived caching for the primary landing screen.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from api.auth import get_current_user
from database.db import get_db
from database.models import Alert, News, Position, Trade
from runtime_cache import api_cache

router = APIRouter()

FILTER_COMMODITIES = {
    "Crude": {"Brent", "WTI", "Urals", "Crude"},
    "NGL/Ethane": {"Ethane", "NGLs", "LPG", "Propane", "Butane"},
    "Naphtha": {"Naphtha"},
    "Carbon": {"EUA", "Carbon"},
}


def _filter_def(book_filter: str | None) -> tuple[set[str], str]:
    normalized = (book_filter or "").strip()
    return FILTER_COMMODITIES.get(normalized, set()), normalized


def _matches_filter(commodity: str | None, book_name: str | None, book_filter: str | None) -> bool:
    commodities, normalized = _filter_def(book_filter)
    if not normalized:
        return True
    commodity_value = (commodity or "").strip()
    book_value = (book_name or "").strip().lower()
    if commodity_value in commodities:
        return True
    if normalized.lower() in book_value:
        return True
    return False


def _book_summary(positions: list[Position]) -> list[dict]:
    by_book: dict[str, dict] = {}
    for position in positions:
        name = position.book.name if position.book else "Unknown"
        item = by_book.setdefault(
            name,
            {
                "name": name,
                "pnl": 0.0,
                "size_value": 0.0,
                "commodities": {},
            },
        )
        item["pnl"] += position.mtm_pnl or 0
        item["size_value"] += abs((position.net_volume or 0) * (position.mtm_price or position.avg_price or 0))
        commodity = position.commodity or "Unknown"
        item["commodities"][commodity] = item["commodities"].get(commodity, 0) + (position.mtm_pnl or 0)

    largest_abs = max((abs(item["pnl"]) for item in by_book.values()), default=1)
    books = []
    for item in by_book.values():
        books.append(
            {
                "name": item["name"],
                "pnl": round(item["pnl"], 2),
                "size": f"${item['size_value'] / 1_000_000:.1f}M",
                "pct": round(item["pnl"] / largest_abs * 100) if largest_abs else 0,
                "commodities": item["commodities"],
            }
        )
    return sorted(books, key=lambda item: item["pnl"], reverse=True)


def _serialize_trades(trades: list[Trade]) -> list[dict]:
    return [
        {
            "id": trade.id,
            "trade_ref": trade.trade_ref,
            "book": trade.book.name if trade.book else None,
            "book_id": trade.book_id,
            "counterparty": trade.counterparty.name if trade.counterparty else None,
            "counterparty_id": trade.counterparty_id,
            "commodity": trade.commodity,
            "trade_type": trade.trade_type,
            "direction": trade.direction,
            "volume": trade.volume,
            "volume_unit": trade.volume_unit,
            "price": trade.price,
            "price_basis": trade.price_basis,
            "currency": trade.currency,
            "trade_date": str(trade.trade_date) if trade.trade_date else None,
            "delivery_start": str(trade.delivery_start) if trade.delivery_start else None,
            "delivery_end": str(trade.delivery_end) if trade.delivery_end else None,
            "status": trade.status,
            "strategy_type": trade.strategy_type,
            "pnl_realised": trade.pnl_realised,
            "pnl_unrealised": trade.pnl_unrealised,
            "is_anomalous": bool(trade.is_anomalous),
            "anomaly_reason": trade.anomaly_reason,
            "created_at": str(trade.created_at) if trade.created_at else None,
        }
        for trade in trades
    ]


def _serialize_alerts(alerts: list[Alert]) -> list[dict]:
    return [
        {
            "id": alert.id,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "title": alert.title,
            "description": alert.description,
            "affected_book": alert.affected_book,
            "affected_trade_id": alert.affected_trade_id,
            "trade_ref": alert.affected_trade.trade_ref if alert.affected_trade else None,
            "estimated_impact": alert.estimated_impact,
            "ai_explanation": alert.ai_explanation,
            "ai_draft_action": alert.ai_draft_action,
            "status": alert.status,
            "created_at": str(alert.created_at) if alert.created_at else None,
            "resolved_at": str(alert.resolved_at) if alert.resolved_at else None,
        }
        for alert in alerts
    ]


def _serialize_news(news_items: list[News]) -> list[dict]:
    return [
        {
            "id": news.id,
            "headline": news.headline,
            "summary": news.summary,
            "source": news.source,
            "published_at": str(news.published_at) if news.published_at else None,
            "sentiment_score": news.sentiment_score,
            "relevance_score": news.relevance_score,
            "commodities_tagged": news.commodities_tagged,
            "market_impact": news.market_impact,
            "url": news.url,
        }
        for news in news_items
    ]


def _build_heatmap(positions: list[Position]) -> dict:
    preferred_order = ["Brent", "Urals", "WTI", "Ethane", "NGLs", "EUA", "Naphtha"]
    region_order = ["NW Europe", "Med", "US Gulf", "Asia", "Global"]
    matrix: dict[str, dict[str, dict]] = {}

    for position in positions:
        commodity = position.commodity or "Unknown"
        region = position.region or "Global"
        commodity_row = matrix.setdefault(commodity, {})
        bucket = commodity_row.setdefault(
            region,
            {"pnl_m": 0.0, "quantity": 0.0, "unit": position.volume_unit or "bbl"},
        )
        bucket["pnl_m"] += (position.mtm_pnl or 0) / 1_000_000
        bucket["quantity"] += position.net_volume or 0
        bucket["unit"] = position.volume_unit or bucket["unit"]

    commodities = [c for c in preferred_order if c in matrix] + sorted(c for c in matrix if c not in preferred_order)
    regions = [r for r in region_order if any(r in row for row in matrix.values())]
    extra_regions = sorted({region for row in matrix.values() for region in row.keys()} - set(regions))
    regions.extend(extra_regions)

    return {
        "commodities": commodities,
        "regions": regions,
        "matrix": matrix,
    }


@router.get("/summary")
async def get_dashboard_summary(
    book_filter: str | None = Query(default=None),
    trade_limit: int = Query(default=20, le=100),
    alert_limit: int = Query(default=20, le=50),
    news_limit: int = Query(default=10, le=50),
    ttl_seconds: int = Query(default=10, ge=1, le=60),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    cache_key = f"dashboard:summary:{book_filter or ''}:{trade_limit}:{alert_limit}:{news_limit}"

    def build_payload():
        started = time.perf_counter()
        positions_query = db.query(Position).options(joinedload(Position.book))
        trades_query = (
            db.query(Trade)
            .options(joinedload(Trade.book), joinedload(Trade.counterparty))
        )
        alerts_query = (
            db.query(Alert)
            .options(joinedload(Alert.affected_trade))
        )
        news_query = db.query(News)

        commodities, normalized_filter = _filter_def(book_filter)
        if normalized_filter:
            if commodities:
                positions_query = positions_query.filter(Position.commodity.in_(commodities))
                trades_query = trades_query.filter(Trade.commodity.in_(commodities))
                news_query = news_query.filter(
                    or_(*[News.commodities_tagged.ilike(f"%{commodity}%") for commodity in commodities])
                )

        positions = [p for p in positions_query.all() if _matches_filter(p.commodity, p.book.name if p.book else None, book_filter)]
        trades = trades_query.order_by(Trade.created_at.desc()).limit(trade_limit * 3 if normalized_filter else trade_limit).all()
        if normalized_filter:
            trades = [
                trade for trade in trades
                if _matches_filter(trade.commodity, trade.book.name if trade.book else None, book_filter)
            ]
        trades = trades[:trade_limit]

        alerts = alerts_query.order_by(Alert.created_at.desc()).limit(alert_limit * 3 if normalized_filter else alert_limit).all()
        if normalized_filter:
            keywords = commodities or {normalized_filter}
            alerts = [
                alert for alert in alerts
                if any(
                    keyword.lower() in " ".join(
                        [
                            alert.title or "",
                            alert.description or "",
                            alert.affected_book or "",
                            alert.affected_trade.commodity if alert.affected_trade else "",
                        ]
                    ).lower()
                    for keyword in keywords
                )
            ]
        alerts = alerts[:alert_limit]

        news_items = news_query.order_by(News.id.desc()).limit(news_limit * 3 if normalized_filter else news_limit).all()
        if normalized_filter:
            keywords = commodities or {normalized_filter}
            news_items = [
                news for news in news_items
                if any(keyword.lower() in (news.commodities_tagged or "").lower() for keyword in keywords)
            ]
        news_items = news_items[:news_limit]
        books = _book_summary(positions)
        heatmap = _build_heatmap(positions)
        total_mtm_pnl = round(sum(position.mtm_pnl or 0 for position in positions), 2)
        total_var = round(sum(position.var_contribution or 0 for position in positions), 2)
        return {
            "summary": {
                "total_mtm_pnl": total_mtm_pnl,
                "total_var": total_var,
                "var_limit": 8_000_000,
                "var_utilisation_pct": round(total_var / 8_000_000 * 100, 1) if total_var else 0,
                "active_books": len({position.book_id for position in positions if position.book_id}),
                "open_positions": len(positions),
                "books": books,
                "selected_filter": normalized_filter or "",
            },
            "trades": _serialize_trades(trades),
            "alerts": _serialize_alerts(alerts),
            "news": _serialize_news(news_items),
            "heatmap": heatmap,
            "generated_in_ms": round((time.perf_counter() - started) * 1000, 1),
        }

    payload, cache_hit = api_cache.get_or_set(cache_key, ttl_seconds, build_payload)
    return {**payload, "cache_hit": cache_hit}
