COMMODITY_REGISTRY = {
    # Crude Oil
    "Brent": {"type": "crude", "unit": "USD/bbl", "ticker": "BZ=F", "display": "Brent Crude", "region": "global"},
    "WTI": {"type": "crude", "unit": "USD/bbl", "ticker": "CL=F", "display": "WTI Crude", "region": "americas"},
    "Urals": {"type": "crude", "unit": "USD/bbl", "ticker": None, "display": "Urals Crude (Med)", "region": "europe"},
    "Dubai": {"type": "crude", "unit": "USD/bbl", "ticker": None, "display": "Dubai Crude", "region": "middle_east"},
    "Oman": {"type": "crude", "unit": "USD/bbl", "ticker": None, "display": "Oman Crude", "region": "middle_east"},
    # Products
    "Naphtha": {"type": "product", "unit": "USD/MT", "ticker": None, "display": "Naphtha CIF NWE", "region": "europe"},
    "Gasoil": {"type": "product", "unit": "USD/MT", "ticker": None, "display": "Gasoil 0.1% FOB ARA", "region": "europe"},
    "Fuel Oil": {"type": "product", "unit": "USD/MT", "ticker": None, "display": "Fuel Oil 380 CST", "region": "global"},
    # NGLs
    "Ethane": {"type": "ngl", "unit": "USD/MT", "ticker": None, "display": "Ethane CIF NWE", "region": "europe"},
    "LPG": {"type": "ngl", "unit": "USD/MT", "ticker": None, "display": "LPG Butane FOB", "region": "global"},
    "NGLs": {"type": "ngl", "unit": "USD/MT", "ticker": None, "display": "NGL Mix", "region": "global"},
    # Gas
    "HH": {"type": "gas", "unit": "USD/MMBtu", "ticker": "NG=F", "display": "Henry Hub Nat Gas", "region": "americas"},
    "TTF": {"type": "gas", "unit": "EUR/MWh", "ticker": None, "display": "TTF Natural Gas", "region": "europe"},
    "NBP": {"type": "gas", "unit": "GBp/therm", "ticker": None, "display": "NBP UK Natural Gas", "region": "europe"},
    "JKM": {"type": "gas", "unit": "USD/MMBtu", "ticker": None, "display": "JKM LNG Marker", "region": "asia"},
    # Carbon
    "EUA": {"type": "carbon", "unit": "EUR/tonne", "ticker": "EUAA.L", "display": "EU Carbon Allowance", "region": "europe"},
    "CCA": {"type": "carbon", "unit": "USD/tonne", "ticker": None, "display": "California Carbon", "region": "americas"},
    # FX - G10
    "EURUSD": {"type": "fx", "unit": "rate", "ticker": "EURUSD=X", "display": "EUR/USD", "region": "global"},
    "GBPUSD": {"type": "fx", "unit": "rate", "ticker": "GBPUSD=X", "display": "GBP/USD", "region": "global"},
    "USDJPY": {"type": "fx", "unit": "rate", "ticker": "USDJPY=X", "display": "USD/JPY", "region": "global"},
    "USDCHF": {"type": "fx", "unit": "rate", "ticker": "USDCHF=X", "display": "USD/CHF", "region": "global"},
    # FX - Middle East
    "USDAED": {"type": "fx", "unit": "rate", "ticker": "AED=X", "display": "USD/AED (UAE)", "region": "middle_east"},
    "USDSAR": {"type": "fx", "unit": "rate", "ticker": "SAR=X", "display": "USD/SAR (Saudi)", "region": "middle_east"},
    "USDQAR": {"type": "fx", "unit": "rate", "ticker": "QAR=X", "display": "USD/QAR (Qatar)", "region": "middle_east"},
    "USDKWD": {"type": "fx", "unit": "rate", "ticker": "KWD=X", "display": "USD/KWD (Kuwait)", "region": "middle_east"},
    "USDOMR": {"type": "fx", "unit": "rate", "ticker": "OMR=X", "display": "USD/OMR (Oman)", "region": "middle_east"},
    "USDBHD": {"type": "fx", "unit": "rate", "ticker": "BHD=X", "display": "USD/BHD (Bahrain)", "region": "middle_east"},
    # FX - Asia
    "USDCNY": {"type": "fx", "unit": "rate", "ticker": "CNY=X", "display": "USD/CNY (China)", "region": "asia"},
    "USDKRW": {"type": "fx", "unit": "rate", "ticker": "KRW=X", "display": "USD/KRW (Korea)", "region": "asia"},
    "USDINR": {"type": "fx", "unit": "rate", "ticker": "INR=X", "display": "USD/INR (India)", "region": "asia"},
    # Freight / Other
    "BDTI": {"type": "freight", "unit": "index", "ticker": None, "display": "Baltic Dirty Tanker", "region": "global"},
    "BCTI": {"type": "freight", "unit": "index", "ticker": None, "display": "Baltic Clean Tanker", "region": "global"},
}


def _canonical_key(symbol: str) -> str | None:
    cleaned = (symbol or "").strip()
    if cleaned in COMMODITY_REGISTRY:
        return cleaned
    upper = cleaned.upper()
    for key in COMMODITY_REGISTRY:
        if key.upper() == upper:
            return key
    return None


def get_all() -> dict:
    return COMMODITY_REGISTRY


def get_by_type(commodity_type: str) -> dict:
    return {k: v for k, v in COMMODITY_REGISTRY.items() if v["type"] == commodity_type}


def get_by_region(region: str) -> dict:
    return {k: v for k, v in COMMODITY_REGISTRY.items() if v["region"] == region}


def is_valid(symbol: str) -> bool:
    return _canonical_key(symbol) is not None


def get_info(symbol: str) -> dict | None:
    key = _canonical_key(symbol)
    if key is None:
        return None
    return {"symbol": key, **COMMODITY_REGISTRY[key]}


def normalize_symbol(symbol: str) -> str | None:
    return _canonical_key(symbol)


def get_types() -> list[str]:
    return sorted({item["type"] for item in COMMODITY_REGISTRY.values()})


def get_regions() -> list[str]:
    return sorted({item["region"] for item in COMMODITY_REGISTRY.values()})
