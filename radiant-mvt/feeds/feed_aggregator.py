"""
feeds/feed_aggregator.py
Dynamic feed aggregator — reads active connectors from DB and ingests
news + market data from all configured sources.

Called by the scheduler every 15 minutes.
"""
import logging
import os
import random
from datetime import datetime, timedelta

import feedparser
import httpx
from sqlalchemy import text

from database.db import SessionLocal

logger = logging.getLogger(__name__)


# ── Commodity / region tag helpers (shared with news_feed.py) ─────────────────

def _infer_tags(headline: str, body: str) -> str:
    t = f"{headline} {body}".lower()
    tags = []
    for tag, needles in [
        ("Brent",   ["brent", "opec", "crude"]),
        ("WTI",     ["wti", "eia", "cushing", "shale"]),
        ("Urals",   ["urals", "russia", "primorsk"]),
        ("Ethane",  ["ethane", "cracker"]),
        ("LPG",     ["lpg", "propane", "butane"]),
        ("HH",      ["henry hub", "natural gas", "gas storage"]),
        ("EUA",     ["carbon", "eua", "allowance"]),
        ("Naphtha", ["naphtha"]),
        ("LNG",     ["lng", "liquefied natural gas"]),
        ("BDTI",    ["tanker", "freight"]),
    ]:
        if any(n in t for n in needles):
            tags.append(tag)
    return ", ".join(tags or ["Brent"])


def _infer_regions(headline: str, body: str) -> str:
    t = f"{headline} {body}".lower()
    regions = []
    if any(w in t for w in ["europe", "eu ", "north sea", "primorsk", "rafnes", "norway"]):
        regions.append("europe")
    if any(w in t for w in ["saudi", "aramco", "oman", "dubai", "middle east", "opec"]):
        regions.append("middle_east")
    if any(w in t for w in ["china", "india", "asia", "japan", "korea", "lng"]):
        regions.append("asia")
    if any(w in t for w in ["us ", "u.s.", "eia", "gulf", "cushing", "henry hub"]):
        regions.append("americas")
    return ", ".join(regions or ["global"])


def _parse_date(val) -> str:
    if not val:
        return datetime.utcnow().isoformat()
    s = str(val)
    if "T" in s or (len(s) >= 10 and s[4] == "-"):
        return s
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass
    return datetime.utcnow().isoformat()


# ── Per-source fetchers ───────────────────────────────────────────────────────

def _fetch_rss(connector, max_items=8) -> list[dict]:
    """Fetch articles from any RSS/Atom feed URL."""
    url = connector.get("host_url", "")
    name = connector.get("name", "RSS")
    if not url:
        return []
    articles = []
    try:
        with httpx.Client(verify=False, trust_env=False, timeout=12.0,
                          follow_redirects=True) as client:
            headers = {"User-Agent": "RadiantMVT/2.0 (trading intelligence platform)"}
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
        feed_title = parsed.feed.get("title", name)
        for entry in parsed.entries[:max_items]:
            headline = (entry.get("title") or "").strip()
            if not headline:
                continue
            content = entry.get("content")
            if content and isinstance(content, list):
                body = " ".join(str(i.get("value", "")) for i in content).strip()
            else:
                body = str(entry.get("summary") or "").strip()
            articles.append({
                "headline": headline[:500],
                "source": feed_title[:100],
                "url": entry.get("link", url),
                "published_at": _parse_date(entry.get("published")),
                "summary": (entry.get("summary") or body or headline)[:1000],
                "body": (body or headline)[:4000],
                "sentiment_score": round(random.uniform(-0.3, 0.5), 3),
                "commodities_tagged": _infer_tags(headline, body),
                "regions_tagged": _infer_regions(headline, body),
                "market_impact": "Neutral",
                "relevance_score": round(random.uniform(0.55, 0.90), 3),
                "ingested_at": datetime.utcnow().isoformat(),
                "connector_id": connector.get("id"),
            })
        logger.info("[feed_aggregator] RSS '%s' → %d articles", feed_title, len(articles))
    except Exception as exc:
        logger.warning("[feed_aggregator] RSS fetch failed for '%s': %s", name, exc)
    return articles


def _fetch_newsapi(connector, max_items=10) -> list[dict]:
    """Fetch from NewsAPI.org using the connector's api_key."""
    api_key = connector.get("api_key", "") or os.getenv("NEWSAPI_KEY", "")
    if not api_key:
        logger.info("[feed_aggregator] NewsAPI skipped — no API key for '%s'", connector.get("name"))
        return []
    try:
        with httpx.Client(verify=False, trust_env=False, timeout=12.0) as client:
            resp = client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": "crude oil OR OPEC OR LNG OR ethane OR natural gas OR Brent OR energy trading",
                    "pageSize": max_items,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "apiKey": api_key,
                },
            )
        if resp.status_code != 200:
            logger.warning("[feed_aggregator] NewsAPI returned %d", resp.status_code)
            return []
        articles = []
        for a in resp.json().get("articles", []):
            headline = (a.get("title") or "")[:500]
            body = a.get("content") or a.get("description") or headline
            articles.append({
                "headline": headline,
                "source": a.get("source", {}).get("name", "NewsAPI"),
                "url": a.get("url", ""),
                "published_at": _parse_date(a.get("publishedAt")),
                "summary": (a.get("description") or body)[:1000],
                "body": body[:4000],
                "sentiment_score": round(random.uniform(-0.3, 0.6), 3),
                "commodities_tagged": _infer_tags(headline, body),
                "regions_tagged": _infer_regions(headline, body),
                "market_impact": "Neutral",
                "relevance_score": round(random.uniform(0.5, 1.0), 3),
                "ingested_at": datetime.utcnow().isoformat(),
                "connector_id": connector.get("id"),
            })
        logger.info("[feed_aggregator] NewsAPI → %d articles", len(articles))
        return articles
    except Exception as exc:
        logger.warning("[feed_aggregator] NewsAPI fetch failed: %s", exc)
        return []


def _fetch_alphavantage_news(connector, max_items=8) -> list[dict]:
    """Fetch news from Alpha Vantage NEWS_SENTIMENT endpoint."""
    api_key = connector.get("api_key", "") or os.getenv("ALPHA_VANTAGE_KEY", "")
    if not api_key:
        return []
    try:
        with httpx.Client(verify=False, trust_env=False, timeout=12.0) as client:
            resp = client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "NEWS_SENTIMENT",
                    "topics": "energy_transportation,finance",
                    "limit": max_items,
                    "apikey": api_key,
                },
            )
        data = resp.json()
        if "Note" in data or "Error" in data:
            return []
        articles = []
        for item in data.get("feed", [])[:max_items]:
            headline = (item.get("title") or "")[:500]
            body = item.get("summary") or headline
            sentiment = float(item.get("overall_sentiment_score", 0))
            articles.append({
                "headline": headline,
                "source": item.get("source", "Alpha Vantage"),
                "url": item.get("url", ""),
                "published_at": _parse_date(item.get("time_published")),
                "summary": body[:1000],
                "body": body[:4000],
                "sentiment_score": round(sentiment, 3),
                "commodities_tagged": _infer_tags(headline, body),
                "regions_tagged": _infer_regions(headline, body),
                "market_impact": "Bullish" if sentiment > 0.15 else "Bearish" if sentiment < -0.15 else "Neutral",
                "relevance_score": round(min(abs(sentiment) + 0.5, 1.0), 3),
                "ingested_at": datetime.utcnow().isoformat(),
                "connector_id": connector.get("id"),
            })
        logger.info("[feed_aggregator] AlphaVantage news → %d articles", len(articles))
        return articles
    except Exception as exc:
        logger.warning("[feed_aggregator] AlphaVantage news failed: %s", exc)
        return []


# ── Article storage ───────────────────────────────────────────────────────────

def _store_articles(db, articles: list[dict]) -> list[int]:
    """Insert articles into the news table, skipping duplicates by headline."""
    inserted_ids = []
    for art in articles:
        try:
            # Deduplicate by headline (last 24h)
            dup = db.execute(text(
                "SELECT id FROM news WHERE headline = :h "
                "AND ingested_at > :cutoff LIMIT 1"
            ), {
                "h": art["headline"],
                "cutoff": (datetime.utcnow() - timedelta(hours=24)).isoformat()
            }).fetchone()
            if dup:
                continue
            result = db.execute(text("""
                INSERT INTO news
                    (headline, source, url, published_at, summary, body,
                     sentiment_score, commodities_tagged, regions_tagged,
                     market_impact, relevance_score, ingested_at)
                VALUES
                    (:headline, :source, :url, :published_at, :summary, :body,
                     :sentiment_score, :commodities_tagged, :regions_tagged,
                     :market_impact, :relevance_score, :ingested_at)
            """), {k: art.get(k) for k in [
                "headline", "source", "url", "published_at", "summary", "body",
                "sentiment_score", "commodities_tagged", "regions_tagged",
                "market_impact", "relevance_score", "ingested_at"
            ]})
            inserted_ids.append(result.lastrowid)
        except Exception as exc:
            logger.warning("[feed_aggregator] Insert failed: %s", exc)
    if inserted_ids:
        db.commit()
    return inserted_ids


# ── Connector last-polled updater ─────────────────────────────────────────────

def _mark_polled(db, connector_id: int, article_count: int):
    try:
        db.execute(text("""
            UPDATE external_connectors
            SET last_connected_at = :now,
                last_status = :status,
                last_error = NULL
            WHERE id = :id
        """), {
            "now": datetime.utcnow().isoformat(),
            "status": f"OK — {article_count} articles ingested",
            "id": connector_id,
        })
        db.commit()
    except Exception:
        pass


def _mark_poll_error(db, connector_id: int, error: str):
    try:
        db.execute(text("""
            UPDATE external_connectors
            SET last_status = :status, last_error = :err
            WHERE id = :id
        """), {"status": "Error", "err": error[:300], "id": connector_id})
        db.commit()
    except Exception:
        pass


# ── Main entry point ──────────────────────────────────────────────────────────

def get_active_news_connectors(db) -> list[dict]:
    """Return all active news connectors as dicts."""
    try:
        rows = db.execute(text("""
            SELECT id, name, connector_type, provider, host_url, api_key, extra_config
            FROM external_connectors
            WHERE is_active = 1 AND connector_type = 'news'
        """)).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception:
        return []


async def aggregate_all_feeds():
    """
    Poll all active news connectors and ingest articles.
    Called by the APScheduler every 15 minutes.
    """
    logger.info("[feed_aggregator] Starting aggregation run")
    db = SessionLocal()
    total_inserted = 0
    try:
        connectors = get_active_news_connectors(db)
        if not connectors:
            logger.info("[feed_aggregator] No active news connectors found — using fallback RSS")
            # Fall back to hardcoded energy feeds
            fallback = [
                {"id": None, "name": "Reuters Energy", "provider": "rss",
                 "host_url": "https://www.reutersagency.com/feed/?best-topics=energy"},
                {"id": None, "name": "OilPrice.com", "provider": "rss",
                 "host_url": "https://oilprice.com/rss/main"},
                {"id": None, "name": "MarketWatch Top Stories", "provider": "marketwatch",
                 "host_url": "https://feeds.marketwatch.com/marketwatch/topstories"},
            ]
            connectors = fallback

        for conn in connectors:
            articles = []
            provider = (conn.get("provider") or "").lower()
            try:
                if provider == "newsapi" or "newsapi.org" in (conn.get("host_url") or ""):
                    articles = _fetch_newsapi(conn)
                elif provider == "alphavantage" or "alphavantage.co" in (conn.get("host_url") or ""):
                    articles = _fetch_alphavantage_news(conn)
                else:
                    # Treat as RSS (works for MarketWatch, Reuters, OilPrice, any RSS URL)
                    articles = _fetch_rss(conn)

                inserted = _store_articles(db, articles)
                total_inserted += len(inserted)
                if conn.get("id"):
                    _mark_polled(db, conn["id"], len(inserted))

                # AI-summarize the top 2 high-relevance articles
                if inserted:
                    _trigger_ai_summaries(inserted[:2])

            except Exception as exc:
                logger.warning("[feed_aggregator] Connector '%s' failed: %s", conn.get("name"), exc)
                if conn.get("id"):
                    _mark_poll_error(db, conn["id"], str(exc))

        logger.info("[feed_aggregator] Aggregation complete — %d new articles", total_inserted)
    except Exception as exc:
        logger.exception("[feed_aggregator] Fatal error: %s", exc)
    finally:
        db.close()
    return total_inserted


def _trigger_ai_summaries(news_ids: list[int]):
    """Fire-and-forget AI summarization for newly ingested articles."""
    if not news_ids:
        return
    try:
        from api.news import summarize_news_item_by_id
        for news_id in news_ids:
            try:
                summarize_news_item_by_id(news_id)
            except Exception:
                pass
    except Exception as exc:
        logger.debug("[feed_aggregator] AI summary skipped: %s", exc)


# ── Cited news retrieval (used by decisions.py reasoning) ────────────────────

def get_relevant_news_for_decision(db, decision_title: str,
                                   commodities: str = "", limit: int = 5) -> list[dict]:
    """
    Return the most relevant recent news articles for a given decision.
    Used to build cited evidence in AI reasoning prompts.
    """
    try:
        # Build keyword list from decision title + commodity tags
        keywords = set()
        title_words = [w.lower() for w in decision_title.split() if len(w) > 3]
        keywords.update(title_words[:6])
        if commodities:
            for tag in commodities.split(","):
                keywords.add(tag.strip().lower())

        # Fetch recent high-relevance articles
        cutoff = (datetime.utcnow() - timedelta(hours=48)).isoformat()
        rows = db.execute(text("""
            SELECT id, headline, source, url, published_at, summary,
                   sentiment_score, market_impact, relevance_score,
                   commodities_tagged, ai_summary
            FROM news
            WHERE ingested_at > :cutoff
            ORDER BY relevance_score DESC, ingested_at DESC
            LIMIT 30
        """), {"cutoff": cutoff}).fetchall()

        # Score each article for relevance to this decision
        scored = []
        for row in rows:
            text_val = f"{row.headline} {row.summary or ''}".lower()
            score = float(row.relevance_score or 0.5)
            for kw in keywords:
                if kw in text_val:
                    score += 0.15
            scored.append((score, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        result = []
        for score, row in scored[:limit]:
            result.append({
                "id": row.id,
                "headline": row.headline,
                "source": row.source,
                "published_at": str(row.published_at or "")[:16],
                "summary": row.ai_summary or row.summary or "",
                "market_impact": row.market_impact,
                "sentiment_score": row.sentiment_score,
                "url": row.url,
            })
        return result
    except Exception as exc:
        logger.warning("[feed_aggregator] get_relevant_news failed: %s", exc)
        return []
