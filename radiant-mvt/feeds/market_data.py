import ssl
import certifi
# Fix for corporate Mac SSL certificate inspection
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except:
    pass

"""
feeds/market_data.py
Live market data: tries yfinance for real prices, falls back to random walk simulation.
INEOS Trading & Shipping — Radiant-MVT
"""
import logging
import random
from datetime import datetime
import requests
from sqlalchemy import text
from database.db import SessionLocal

logger = logging.getLogger(__name__)

# Commodity → yfinance ticker
TICKER_MAP = {
    "Brent":       "BZ=F",
    "WTI":         "CL=F",
    "HH":          "NG=F",    # Henry Hub natural gas
    "EUA":         "EUAA.L",  # EU Allowances
}

FOREX_MAP = {
    "EURUSD":  "EURUSD=X",
    "GBPUSD":  "GBPUSD=X",
}

# Price units per commodity
PRICE_UNITS = {
    "Brent": "USD/bbl", "WTI": "USD/bbl", "Urals": "USD/bbl",
    "Ethane": "USD/MT", "Propane": "USD/MT", "Naphtha": "USD/MT",
    "HH": "USD/MMBtu", "EUA": "EUR/tCO2",
    "Ethylene": "USD/MT", "LNG": "USD/MMBtu",
    "Fuel Oil": "USD/MT", "Butane": "USD/MT",
    "EURUSD": "rate", "GBPUSD": "rate",
}

# Realistic base prices for simulation fallback
BASE_PRICES = {
    "Brent":       82.40,
    "WTI":         78.90,
    "Urals":       77.60,
    "Ethane":     315.20,
    "Propane":     42.00,
    "Naphtha":    680.00,
    "HH":           2.84,
    "EUA":         63.20,
    "Ethylene":   950.00,
    "LNG":         10.50,
    "Fuel Oil":   480.00,
    "Butane":      50.00,
}

_last_prices: dict = {}


def _simulate_tick(commodity: str) -> dict:
    """Apply a small Gaussian random walk to the last known price."""
    base = _last_prices.get(commodity, BASE_PRICES.get(commodity, 80.0))
    change_pct = random.gauss(0, 0.008)
    new_price = round(base * (1 + change_pct), 4)
    _last_prices[commodity] = new_price
    change_1d = round(new_price - base, 4)
    return {
        "commodity": commodity,
        "price": new_price,
        "price_unit": PRICE_UNITS.get(commodity, "USD/bbl"),
        "change_1d": change_1d,
        "change_pct_1d": round(change_pct * 100, 4),
        "high_1d": round(new_price * 1.005, 4),
        "low_1d": round(new_price * 0.995, 4),
        "source": "simulated",
    }


def _fetch_yahoo_chart_quote(ticker: str) -> dict | None:
    """
    Pull quote data directly from Yahoo Finance's chart endpoint.
    This avoids the broken pandas/yfinance dependency chain in this environment.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    response = requests.get(
        url,
        params={"range": "5d", "interval": "1d", "includePrePost": "false"},
        timeout=12,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    response.raise_for_status()
    payload = response.json()
    chart = payload.get("chart") or {}
    result = (chart.get("result") or [None])[0]
    if not result:
        return None

    meta = result.get("meta") or {}
    indicators = result.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0]
    closes = [v for v in (quote.get("close") or []) if v is not None]

    price = meta.get("regularMarketPrice")
    prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
    if price is None and closes:
        price = closes[-1]
    if prev_close is None and len(closes) >= 2:
        prev_close = closes[-2]
    if price is None:
        return None

    high = meta.get("regularMarketDayHigh")
    low = meta.get("regularMarketDayLow")
    if high is None and closes:
        high = max(closes)
    if low is None and closes:
        low = min(closes)

    return {
        "price": float(price),
        "previous_close": float(prev_close) if prev_close is not None else float(price),
        "high": float(high) if high is not None else None,
        "low": float(low) if low is not None else None,
    }


def _try_live_prices() -> dict:
    """
    Attempt to pull real prices from Yahoo Finance's public chart API.
    Returns dict of {commodity: {price, change_1d, change_pct_1d}} or empty dict on failure.
    """
    result = {}

    for commodity, ticker in {**TICKER_MAP, **FOREX_MAP}.items():
        try:
            quote = _fetch_yahoo_chart_quote(ticker)
            if not quote:
                continue

            is_fx = commodity in FOREX_MAP
            digits = 6 if is_fx else 4
            price = round(quote["price"], digits)
            prev = quote["previous_close"] if quote["previous_close"] else quote["price"]
            change = round(price - prev, digits)
            change_pct = round((change / prev) * 100, 4) if prev else 0
            result[commodity] = {
                "price": price,
                "price_unit": PRICE_UNITS.get(commodity, "USD/bbl"),
                "change_1d": change,
                "change_pct_1d": change_pct,
                "high_1d": round(quote["high"], digits) if quote["high"] is not None else None,
                "low_1d": round(quote["low"], digits) if quote["low"] is not None else None,
                "source": "yahoo",
            }
        except Exception as exc:
            logger.debug("Yahoo chart fetch failed for %s/%s: %s", commodity, ticker, exc)

    return result


async def fetch_and_store_market_data():
    """
    Main feed coroutine — called by the APScheduler every 60 seconds.
    Tries yfinance for real prices; falls back to simulation for anything missing.
    """
    logger.info("[market_data] Fetching market prices …")
    db = SessionLocal()
    try:
        live = _try_live_prices()
        ts = datetime.utcnow().isoformat()
        stored = 0

        # Store all base commodities
        all_commodities = list(BASE_PRICES.keys()) + list(FOREX_MAP.keys())
        for commodity in all_commodities:
            if commodity in live:
                tick = live[commodity]
                tick["commodity"] = commodity
                _last_prices[commodity] = tick["price"]
            else:
                tick = _simulate_tick(commodity)

            db.execute(
                text("""
                    INSERT INTO market_data
                        (commodity, price, price_unit, source,
                         change_1d, change_pct_1d, high_1d, low_1d, timestamp)
                    VALUES
                        (:commodity, :price, :price_unit, :source,
                         :change_1d, :change_pct_1d, :high_1d, :low_1d, :ts)
                """),
                {**tick, "ts": ts},
            )
            stored += 1

        db.commit()
        live_count = len(live)
        logger.info(
            "[market_data] Stored %d ticks (%d live from Yahoo, %d simulated).",
            stored, live_count, stored - live_count
        )
    except Exception as exc:
        logger.exception("[market_data] Error: %s", exc)
        db.rollback()
    finally:
        db.close()
