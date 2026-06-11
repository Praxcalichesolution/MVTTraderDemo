"""
feeds/news_feed.py
Ingests energy news and stores enriched records.
"""
import logging
import os
import random
from datetime import datetime, timedelta

import feedparser
import httpx
from sqlalchemy import text

from database.db import SessionLocal
from database.models import News

logger = logging.getLogger(__name__)


def _parse_date(date_str):
    """Normalize any date string to ISO 8601 for SQLite storage."""
    if not date_str:
        return datetime.utcnow().isoformat()
    # Already ISO format
    if "T" in str(date_str) or (len(str(date_str)) >= 10 and str(date_str)[4] == "-"):
        return str(date_str)
    # RFC 2822 format (from RSS): "Wed, 03 Jun 2026 18:00:00 -0500"
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass
    # feedparser struct_time
    try:
        import time as _time
        t = _time.strptime(str(date_str), "%a, %d %b %Y %H:%M:%S %z")
        return datetime(*t[:6]).isoformat()
    except Exception:
        pass
    return datetime.utcnow().isoformat()


NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")
RSS_FEEDS = [
    "https://www.reutersagency.com/feed/?best-topics=energy",
    "https://oilprice.com/rss/main",
]

SIMULATED_HEADLINES = [
    ("LNG spot prices surge on Asian heatwave demand", "Reuters", "Bullish", "LNG, JKM"),
    ("OPEC+ holds output steady, Brent edges higher", "Bloomberg", "Bullish", "Brent, Urals"),
    ("US ethane exports hit record as European crackers ramp up", "Platts", "Bullish", "Ethane"),
    ("Propane inventories fall sharply at Mont Belvieu", "Reuters", "Bullish", "LPG"),
    ("Hurricane warnings threaten Gulf of Mexico output", "Bloomberg", "Bullish", "WTI, HH"),
    ("China LNG imports decline on mild winter forecast", "Platts", "Bearish", "LNG, JKM"),
    ("EU natural gas storage reaches 90% capacity", "Reuters", "Bearish", "TTF, NBP"),
    ("Naphtha cracks weaken as Asian petrochemical demand softens", "Bloomberg", "Bearish", "Naphtha"),
    ("US shale production rises for third consecutive week", "Reuters", "Bearish", "WTI"),
    ("Vessel delays at Freeport LNG ease congestion", "Platts", "Neutral", "LNG"),
]


async def fetch_and_store_news():
    """Main news feed coroutine."""
    logger.info("[news_feed] Ingesting energy news")
    db = SessionLocal()
    inserted_ids: list[int] = []
    try:
        seed_news_if_empty(db)
        articles = _fetch_from_rss() or _fetch_from_api() or _generate_simulated()
        for article in articles[:10]:
            news_item = News(
                headline=article.get("headline"),
                source=article.get("source"),
                url=article.get("url"),
                published_at=article.get("published_at"),
                summary=article.get("summary"),
                body=article.get("body"),
                sentiment_score=article.get("sentiment_score"),
                commodities_tagged=article.get("commodities_tagged"),
                regions_tagged=article.get("regions_tagged"),
                market_impact=article.get("market_impact"),
                relevance_score=article.get("relevance_score"),
                ingested_at=article.get("ingested_at"),
            )
            db.add(news_item)
            db.flush()
            inserted_ids.append(news_item.id)
        db.commit()
        logger.info("[news_feed] Inserted %d articles.", len(inserted_ids))

        high_relevance = [
            news_id for news_id, article in zip(inserted_ids, articles)
            if article.get("relevance_score", 0) > 0.7
        ][:3]
        _summarize_inserted(high_relevance)
    except Exception as exc:
        logger.exception("[news_feed] Error: %s", exc)
        db.rollback()
    finally:
        db.close()


def seed_news_if_empty(db=None) -> int:
    """Seed realistic full-body news if the table has no rows."""
    owns_session = db is None
    db = db or SessionLocal()
    try:
        count = db.execute(text("SELECT COUNT(*) FROM news")).scalar() or 0
        if count:
            return 0
        inserted = 0
        for article in _seed_articles():
            db.add(News(**article))
            inserted += 1
        db.commit()
        logger.info("[news_feed] Seeded %d news items.", inserted)
        return inserted
    except Exception:
        db.rollback()
        raise
    finally:
        if owns_session:
            db.close()


def _summarize_inserted(news_ids: list[int]):
    if not news_ids:
        return
    try:
        from api.news import summarize_news_item_by_id
        for news_id in news_ids:
            summarize_news_item_by_id(news_id)
    except Exception as exc:
        logger.warning("[news_feed] AI summarization skipped: %s", exc)


def _fetch_from_rss() -> list:
    articles = []
    with httpx.Client(verify=False, trust_env=False, timeout=12.0, follow_redirects=True) as client:
        for feed_url in RSS_FEEDS:
            try:
                resp = client.get(feed_url)
                resp.raise_for_status()
                parsed = feedparser.parse(resp.content)
                for entry in parsed.entries[:5]:
                    body = _entry_body(entry)
                    headline = (entry.get("title") or "").strip()
                    if not headline:
                        continue
                    articles.append({
                        "headline": headline[:500],
                        "source": parsed.feed.get("title", "RSS"),
                        "url": entry.get("link", ""),
                        "published_at": _parse_date(entry.get("published")),
                        "summary": (entry.get("summary") or body or headline)[:1000],
                        "body": body or entry.get("summary") or headline,
                        "sentiment_score": round(random.uniform(-0.4, 0.6), 3),
                        "commodities_tagged": _infer_tags(headline, body),
                        "regions_tagged": _infer_regions(headline, body),
                        "market_impact": random.choice(["Bullish", "Bearish", "Neutral"]),
                        "relevance_score": round(random.uniform(0.55, 0.95), 3),
                        "ingested_at": datetime.utcnow().isoformat(),
                    })
            except Exception as exc:
                logger.warning("[news_feed] RSS fetch failed for %s: %s", feed_url, exc)
    return articles


def _fetch_from_api() -> list:
    if not NEWSAPI_KEY:
        return []
    try:
        with httpx.Client(verify=False, trust_env=False, timeout=12.0) as client:
            resp = client.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": "crude oil OR OPEC OR LNG OR ethane OR natural gas OR Brent OR energy trading",
                    "pageSize": 10,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "apiKey": NEWSAPI_KEY,
                },
            )
        if resp.status_code == 200:
            return [_map_api_article(a) for a in resp.json().get("articles", [])]
    except Exception as exc:
        logger.warning("[news_feed] API call failed: %s", exc)
    return []


def _entry_body(entry) -> str:
    content = entry.get("content")
    if content and isinstance(content, list):
        return " ".join(str(item.get("value", "")) for item in content).strip()
    return str(entry.get("summary_detail", {}).get("value", "") or entry.get("summary", "")).strip()


def _map_api_article(a: dict) -> dict:
    headline = (a.get("title") or "")[:500]
    body = a.get("content") or a.get("description") or headline
    return {
        "headline": headline,
        "source": a.get("source", {}).get("name", "Unknown"),
        "url": a.get("url", ""),
        "published_at": a.get("publishedAt", datetime.utcnow().isoformat()),
        "summary": (a.get("description") or body)[:1000],
        "body": body,
        "sentiment_score": round(random.uniform(-0.3, 0.6), 3),
        "commodities_tagged": _infer_tags(headline, body),
        "regions_tagged": _infer_regions(headline, body),
        "market_impact": random.choice(["Bullish", "Bearish", "Neutral"]),
        "relevance_score": round(random.uniform(0.5, 1.0), 3),
        "ingested_at": datetime.utcnow().isoformat(),
    }


def _generate_simulated() -> list:
    items = random.sample(SIMULATED_HEADLINES, min(5, len(SIMULATED_HEADLINES)))
    result = []
    for headline, source, impact, tags in items:
        score = round(random.uniform(0.1, 0.8) * (1 if impact == "Bullish" else -1 if impact == "Bearish" else 0), 3)
        body_templates = {
            "Bullish": f"{headline}. Market participants said the development supports near-term prices amid tightening physical supply. Traders in Rotterdam and Singapore are adjusting nominations ahead of month-end cargo flows. Forward curve structure shifted to steeper backwardation on the news, with prompt spreads strengthening by 15-20 cents. Trading desks flagged the move as a potential catalyst for short-covering in the paper markets.",
            "Bearish": f"{headline}. The bearish signal prompted traders to reassess long positions ahead of the next trading session. Physical differentials softened as buyers sought larger discounts to compensate for increased supply availability. Several trading houses reported receiving more offers than bids during the Asian morning session. The development adds downward pressure to already weakened fundamentals in the prompt month.",
            "Neutral": f"{headline}. Market participants described the move as broadly in line with expectations, with limited immediate impact on physical trading flows. Analysts said the longer-term implications would depend on how quickly supply and demand fundamentals adjust. Trading volumes were above average as participants repositioned ahead of scheduled data releases and contract expirations.",
        }
        body = body_templates.get(impact, body_templates["Neutral"])
        result.append({
            "headline": headline,
            "source": source,
            "url": "",
            "published_at": datetime.utcnow().isoformat(),
            "summary": body[:300],
            "body": body,
            "sentiment_score": score,
            "commodities_tagged": tags,
            "regions_tagged": _infer_regions(headline, body),
            "market_impact": impact,
            "relevance_score": round(random.uniform(0.6, 1.0), 3),
            "ingested_at": datetime.utcnow().isoformat(),
        })
    return result


def _infer_tags(headline: str, body: str) -> str:
    text_value = f"{headline} {body}".lower()
    tags = []
    checks = [
        ("Brent", ["brent", "opec", "crude"]),
        ("WTI", ["wti", "eia", "cushing", "shale"]),
        ("Urals", ["urals", "russia", "primorsk"]),
        ("Ethane", ["ethane", "cracker"]),
        ("LPG", ["lpg", "propane", "butane"]),
        ("HH", ["henry hub", "natural gas", "gas storage"]),
        ("EUA", ["carbon", "eua", "allowance"]),
        ("Naphtha", ["naphtha"]),
        ("BDTI", ["tanker", "freight"]),
    ]
    for tag, needles in checks:
        if any(needle in text_value for needle in needles):
            tags.append(tag)
    return ", ".join(tags or ["Brent"])


def _infer_regions(headline: str, body: str) -> str:
    text_value = f"{headline} {body}".lower()
    regions = []
    if any(word in text_value for word in ["europe", "eu", "north sea", "primorsk", "rafnes"]):
        regions.append("europe")
    if any(word in text_value for word in ["saudi", "aramco", "oman", "dubai", "middle east"]):
        regions.append("middle_east")
    if any(word in text_value for word in ["china", "india", "asia", "japan", "korea"]):
        regions.append("asia")
    if any(word in text_value for word in ["us ", "u.s.", "eia", "gulf", "cushing"]):
        regions.append("americas")
    return ", ".join(regions or ["global"])


def _seed_articles() -> list[dict]:
    now = datetime.utcnow()
    raw = [
        (
            "OPEC+ extends voluntary cuts into next quarter, tightening Brent prompt balance",
            "Reuters",
            "https://example.com/opec-cuts",
            "Brent, Urals",
            "middle_east, europe",
            "OPEC, Saudi Aramco",
            "Bullish",
            0.94,
            "OPEC+ ministers agreed to extend the current tranche of voluntary crude supply cuts into the next quarter, keeping a cautious posture as refinery runs in Asia recover and Atlantic Basin inventories remain below seasonal norms. Delegates said the group wants clearer evidence that summer demand has absorbed recent non-OPEC growth before restoring barrels. The decision was broadly expected but still removed a source of downside risk for Brent timespreads, which had softened on concern that supply could return quickly. For European refiners and trading desks, the extension keeps medium-sour alternatives tight and may support Urals differentials despite sanction-related frictions. Physical brokers said refiners with prompt crude shorts may need to cover earlier if North Sea programmes remain light. Traders will watch Saudi allocation notices, Russian export schedules and refinery maintenance returns for confirmation. The immediate read is supportive for Brent flat price and for crude spreads linked to sour availability, while any demand disappointment in Asia would limit follow-through."
        ),
        (
            "Primorsk refinery restart narrows expected Urals disruption window",
            "Platts",
            "https://example.com/primorsk-restart",
            "Urals, Brent",
            "europe",
            "Primorsk",
            "Bearish",
            0.88,
            "Russian market sources said units at the Primorsk refining and export complex have resumed staged operations after unplanned maintenance constrained regional crude flows last week. Loadings are not yet back to normal, but traders said revised terminal nominations suggest the outage window may be shorter than feared. Urals differentials had strengthened as some buyers priced in reduced availability and longer voyage optionality. The restart reduces the probability of a sustained disruption, although shipping insurance, sanctions screening and Baltic weather remain important variables. For desks carrying Brent versus Urals exposure, the headline points to less support for the Urals spread if actual cargo programmes normalize. Some Mediterranean refiners may delay spot replacement purchases until there is clearer evidence of stable operations. Freight desks reported no immediate cancellation wave, but vessel queues should be monitored over the next several days. The story is bearish for disruption premium and mildly bearish for Urals relative value."
        ),
        (
            "Dragon fleet weather delay in North Atlantic threatens ethane delivery window",
            "Lloyd's List",
            "https://example.com/dragon-weather-delay",
            "Ethane, LPG, BDTI",
            "europe, americas",
            "INEOS, Dragon fleet",
            "Bullish",
            0.91,
            "A cluster of ethane-capable vessels serving transatlantic petrochemical supply chains has slowed in the North Atlantic after a low-pressure system lifted wave heights and forced route adjustments. Shipping agents said the delay affects several cargoes scheduled into northwest Europe, including vessels commonly monitored by cracker operators and feedstock traders. The issue is weather-driven rather than mechanical, but arrival slippage could tighten short-term ethane cover if downstream units are running at planned rates. Traders said the effect depends on inventory at receiving terminals and whether substitute LPG or naphtha economics remain workable. The delay may also affect demurrage assumptions and prompt freight availability for specialized gas carriers. For INEOS-linked ethane exposure, the news increases the value of delivery optionality and may warrant checking berth schedules, tank headroom and hedge coverage for feedstock replacement costs. The market impact is supportive for near-term ethane logistics premiums rather than outright global NGL prices."
        ),
        (
            "EIA reports larger-than-expected gas inventory draw as power burn rises",
            "EIA",
            "https://example.com/eia-gas-draw",
            "HH",
            "americas",
            "EIA",
            "Bullish",
            0.82,
            "The U.S. Energy Information Administration reported a natural gas storage draw that exceeded analyst expectations, citing stronger power-sector demand and lower renewable output during a period of warm weather. Henry Hub futures moved higher after the release as traders reassessed the cushion available before peak summer cooling demand. Production remained resilient, but pipeline nominations indicated regional constraints that limited immediate supply response. The draw matters for global feedstock desks because U.S. gas costs influence ethane recovery economics, LPG balances and export competitiveness into Europe. If Henry Hub continues to firm, ethane rejection economics could change and petrochemical margins may need to absorb higher energy costs. Traders said the report is most important if the next two storage prints confirm the trend rather than reversing it. The immediate impact is bullish for HH and supportive for U.S. gas-linked feedstock costs."
        ),
        (
            "EU carbon auction clears above expectations as compliance buying returns",
            "ICE",
            "https://example.com/eua-auction",
            "EUA",
            "europe",
            "European Commission",
            "Bullish",
            0.8,
            "The latest EU carbon allowance auction cleared above market expectations with stronger bid coverage than recent sales, suggesting compliance buyers are re-entering the market after a period of cautious purchasing. EUA prices rose following the result as utilities and industrial participants assessed whether auction demand signals a firmer floor. Analysts said reduced free allocation and the approach of compliance deadlines may keep buying interest steady even if power-sector emissions remain subdued. For petrochemical and refining desks in Europe, a firmer carbon price can affect production economics, utility costs and relative competitiveness against imports. The impact is not a direct crude price driver, but it feeds into refinery margin models and naphtha versus gas-based feedstock comparisons. Traders should watch whether secondary-market volumes confirm the auction signal. The read-through is bullish for EUA and mildly negative for carbon-intensive European processing margins."
        ),
        (
            "Saudi Aramco raises light crude OSPs to Asia as refining margins improve",
            "Bloomberg",
            "https://example.com/aramco-osp",
            "Brent, Dubai, Oman",
            "middle_east, asia",
            "Saudi Aramco",
            "Bullish",
            0.87,
            "Saudi Aramco increased official selling prices for key light crude grades to Asian customers, reflecting improved refining margins and firmer demand from China and India. The move came in above some trader expectations and may encourage other Middle Eastern producers to defend differentials. Asian refiners had expected a smaller increase after recent volatility in product cracks, but stronger gasoline and middle-distillate margins gave producers room to push. The OSP adjustment matters for Brent-linked desks because it can redirect marginal buying between Atlantic Basin and Middle Eastern barrels. If Asian refiners resist higher term pricing, spot differentials may soften later, but the first-order signal is producer confidence. For crude books, the change supports Dubai and Oman relative values and can influence Brent-Dubai spread assumptions. Traders should compare refinery run plans and tender results before assuming sustained strength."
        ),
        (
            "Rafnes production update points to steady cracker operations after maintenance",
            "INEOS Market Desk",
            "https://example.com/rafnes-update",
            "Ethane, Naphtha, LPG",
            "europe",
            "INEOS, Rafnes",
            "Neutral",
            0.93,
            "Market participants tracking northwest European petrochemical operations said the Rafnes site is running steadily after planned maintenance, with feedstock nominations broadly aligned with prior guidance. The update reduces concern that unplanned downstream weakness would leave prompt ethane cargoes lengthening into the region. Operators continue to monitor power costs, derivative demand and alternative feedstock spreads, but there was no indication of a major change in operating rates. For an INEOS feedstock trader, the headline is important because it supports existing delivery assumptions and lowers the chance of distressed resale for committed ethane supply. Naphtha and LPG substitution economics remain relevant if margins deteriorate, particularly with European carbon and gas prices moving. The market impact is neutral on outright price but constructive for operational certainty. Traders should still check vessel ETA, terminal availability and hedge coverage against final run-rate confirmations."
        ),
        (
            "India and China crude import data show stronger Middle East pull",
            "Argus",
            "https://example.com/asia-imports",
            "Brent, Dubai, Oman, Urals",
            "asia, middle_east",
            "India, China",
            "Bullish",
            0.84,
            "Customs and tanker-tracking data showed India and China lifting more Middle Eastern crude during the latest reporting window, while discounted Russian flows were mixed by destination. Traders said the data points to resilient refinery demand despite uneven product margins, with several large Asian refiners maximizing runs ahead of seasonal maintenance. The stronger Middle East pull can support Dubai and Oman-linked pricing and narrow arbitrage opportunities for Atlantic Basin barrels into Asia. For Urals exposure, the mixed Russian flow data complicates assumptions about discount persistence and sanctions-driven rerouting. Brent may benefit indirectly if Asian demand keeps global crude balances tight, but the clearest signal is in regional sour crude differentials. Feedstock traders should monitor whether higher crude runs translate into more naphtha supply or whether petrochemical demand remains too weak to absorb it. The read-through is bullish for crude demand and mixed for downstream products."
        ),
    ]

    articles = []
    for idx, (headline, source, url, tags, regions, counterparties, impact, relevance, body) in enumerate(raw):
        articles.append({
            "headline": headline,
            "source": source,
            "url": url,
            "published_at": (now - timedelta(hours=idx * 5 + 2)).isoformat(),
            "summary": body[:500],
            "body": body,
            "sentiment_score": 0.35 if impact == "Bullish" else -0.3 if impact == "Bearish" else 0.0,
            "commodities_tagged": tags,
            "regions_tagged": regions,
            "counterparties_tagged": counterparties,
            "market_impact": impact,
            "relevance_score": relevance,
            "ingested_at": now.isoformat(),
        })
    return articles
