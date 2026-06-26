"""P&L calculation engine - MTM, attribution, intraday"""
import pandas as pd
import numpy as np
from datetime import datetime, date
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

def calculate_mtm_pnl(positions: List[Dict], market_prices: Dict[str, float]) -> Dict:
    """Calculate mark-to-market P&L for all positions"""
    total_pnl = 0
    book_pnl = {}
    commodity_pnl = {}

    for pos in positions:
        commodity = pos['commodity']
        net_volume = pos['net_volume']
        avg_price = pos.get('avg_price', 0)
        mtm_price = market_prices.get(commodity, pos.get('mtm_price', avg_price))

        # Convert units if needed
        if pos.get('volume_unit') == 'MT' and commodity in ['Ethane', 'NGLs']:
            pnl = net_volume * (mtm_price - avg_price)
        else:
            pnl = net_volume * (mtm_price - avg_price)

        book_name = pos.get('book_name', 'Unknown')
        book_pnl[book_name] = book_pnl.get(book_name, 0) + pnl
        commodity_pnl[commodity] = commodity_pnl.get(commodity, 0) + pnl
        total_pnl += pnl

    return {
        "total_pnl": round(total_pnl, 0),
        "by_book": {k: round(v, 0) for k, v in book_pnl.items()},
        "by_commodity": {k: round(v, 0) for k, v in commodity_pnl.items()},
        "as_of": datetime.now().isoformat()
    }

def calculate_intraday_pnl(db: Session, trader_id: int, date_from: datetime, date_to: datetime) -> Dict:
    """Calculate intraday P&L movement"""
    # Returns time series of P&L throughout the day
    from sqlalchemy import text

    result = db.execute(text("""
        SELECT strftime('%H:00', timestamp) as hour,
               commodity,
               AVG(price) as avg_price
        FROM market_data
        WHERE date(timestamp) = date('now')
        GROUP BY hour, commodity
        ORDER BY hour, commodity
    """)).fetchall()

    hourly_pnl = []
    cumulative = 0
    for row in result:
        hourly_pnl.append({
            "time": row[0],
            "commodity": row[1],
            "price": row[2]
        })

    return {"hourly_data": hourly_pnl, "generated_at": datetime.now().isoformat()}

def calculate_pnl_attribution(trades: List[Dict], market_prices: Dict) -> Dict:
    """Attribute P&L by strategy type, trader, commodity"""
    attribution = {
        "by_strategy": {},
        "by_commodity": {},
        "total_realised": 0,
        "total_unrealised": 0
    }

    for trade in trades:
        strategy = trade.get('strategy_type', 'Unknown')
        commodity = trade.get('commodity', 'Unknown')
        realised = trade.get('pnl_realised', 0) or 0
        unrealised = trade.get('pnl_unrealised', 0) or 0

        attribution['by_strategy'][strategy] = attribution['by_strategy'].get(strategy, 0) + realised + unrealised
        attribution['by_commodity'][commodity] = attribution['by_commodity'].get(commodity, 0) + realised + unrealised
        attribution['total_realised'] += realised
        attribution['total_unrealised'] += unrealised

    return attribution
