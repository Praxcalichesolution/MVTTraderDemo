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


def _try_yfinance() -> dict:
    """
    Attempt to pull real prices from yfinance.
    Returns dict of {commodity: {price, change_1d, change_pct_1d}} or empty dict on failure.
    """
    try:
        import yfinance as yf
        all_tickers = list(TICKER_MAP.values()) + list(FOREX_MAP.values())
        data = yf.download(all_tickers, period="5d", interval="1d",
                           progress=False, auto_adjust=True)
        if data is None or data.empty:
            return {}

        result = {}
        close = data.get("Close", data)  # handle both dict and MultiIndex

        for commodity, ticker in TICKER_MAP.items():
            try:
                if hasattr(close, "columns") and ticker in close.columns:
                    series = close[ticker].dropna()
                elif hasattr(close, "name"):
                    series = close.dropna()
                else:
                    continue
                if len(series) < 1:
                    continue
                price = float(series.iloc[-1])
                prev = float(series.iloc[-2]) if len(series) >= 2 else price
                change = round(price - prev, 4)
                change_pct = round((change / prev) * 100, 4) if prev else 0
                result[commodity] = {
                    "price": round(price, 4),
                    "price_unit": PRICE_UNITS.get(commodity, "USD/bbl"),
                    "change_1d": change,
                    "change_pct_1d": change_pct,
                    "high_1d": round(price * 1.005, 4),
                    "low_1d": round(price * 0.995, 4),
                    "source": "yfinance",
                }
            except Exception as e:
                logger.debug("yfinance parse failed for %s/%s: %s", commodity, ticker, e)

        for pair, ticker in FOREX_MAP.items():
            try:
                if hasattr(close, "columns") and ticker in close.columns:
                    series = close[ticker].dropna()
                    if len(series) >= 1:
                        result[pair] = {
                            "price": round(float(series.iloc[-1]), 6),
                            "price_unit": "rate",
                            "change_1d": 0,
                            "change_pct_1d": 0,
                            "high_1d": None,
                            "low_1d": None,
                            "source": "yfinance",
                        }
            except Exception as e:
                logger.debug("yfinance FX parse failed for %s: %s", pair, e)

        return result
    except ImportError:
        logger.warning("yfinance not installed; using simulated prices")
        return {}
    except Exception as e:
        logger.warning("yfinance fetch failed: %s", e)
        return {}


async def fetch_and_store_market_data():
    """
    Main feed coroutine — called by the APScheduler every 60 seconds.
    Tries yfinance for real prices; falls back to simulation for anything missing.
    """
    logger.info("[market_data] Fetching market prices …")
    db = SessionLocal()
    try:
        live = _try_yfinance()
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
            "[market_data] Stored %d ticks (%d live from yfinance, %d simulated).",
            stored, live_count, stored - live_count
        )
    except Exception as exc:
        logger.exception("[market_data] Error: %s", exc)
        db.rollback()
    finally:
        db.close()
