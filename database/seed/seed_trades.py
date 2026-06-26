"""
Seed 847 realistic trades + monthly actuals + performance targets for Radiant-MVT.
Uses random.seed(42) for full reproducibility.
Spans Jan 2023 – May 2026.
"""
import logging
import random
from datetime import date, timedelta
from database.db import SessionLocal
from database.models import Trade, MonthlyActual, PerformanceTarget, Book, User, Counterparty

logger = logging.getLogger(__name__)

random.seed(42)

# ---------------------------------------------------------------------------
# Configuration tables
# ---------------------------------------------------------------------------

STRATEGY_DIST = [
    ("Spread",      0.40, 0.71),
    ("Basis",       0.25, 0.68),
    ("Directional", 0.20, 0.48),
    ("Arb",         0.10, 0.65),
    ("Hedge",       0.05, 0.82),
]

COMMODITY_DIST = [
    ("Brent",  0.40, "bbl",   70,  95,  100000, 1000000),
    ("Ethane", 0.25, "MT",   200, 380,    5000,   15000),
    ("WTI",    0.15, "bbl",   65,  90,  100000,  500000),
    ("Urals",  0.10, "bbl",   62,  88,   80000,  500000),
    ("NGLs",   0.07, "MT",    45,  75,   10000,   50000),
    ("Carbon", 0.03, "tonne", 55,  90,    5000,   50000),
]

TRADE_TYPES = ["Physical", "Paper", "Swap", "Exchange"]
DIRECTIONS  = ["Buy", "Sell"]
LOCATIONS   = {
    "Brent":  ["CIF Rotterdam", "FOB Sullom Voe", "CIF Teesside"],
    "WTI":    ["FOB Cushing", "CIF Houston", "FOB Midland"],
    "Urals":  ["CIF Med", "CIF Rotterdam", "FOB Primorsk"],
    "Ethane": ["CIF Rafnes", "CIF Grangemouth", "FOB Marcus Hook"],
    "NGLs":   ["CIF Grangemouth", "FOB Marcus Hook", "CIF Rotterdam"],
    "Carbon": ["ICE EUA", "EEX", "OTC"],
}
INCOTERMS   = ["CIF", "FOB", "DAP", "CFR"]
BOOK_MAP    = {
    "Brent":  "Crude Book",
    "WTI":    "Crude Book",
    "Urals":  "Crude Book",
    "Ethane": "Ethane Book",
    "NGLs":   "NGLs Book",
    "Carbon": "Carbon Book",
}

TOTAL_TRADES = 847
START_DATE   = date(2023, 1, 1)
END_DATE     = date(2026, 5, 31)
TOTAL_DAYS   = (END_DATE - START_DATE).days


def _pick_strategy():
    r = random.random()
    cumulative = 0.0
    for name, prob, win_rate in STRATEGY_DIST:
        cumulative += prob
        if r < cumulative:
            return name, win_rate
    return STRATEGY_DIST[-1][0], STRATEGY_DIST[-1][2]


def _pick_commodity():
    r = random.random()
    cumulative = 0.0
    for name, prob, unit, lo, hi, vol_lo, vol_hi in COMMODITY_DIST:
        cumulative += prob
        if r < cumulative:
            return name, unit, lo, hi, vol_lo, vol_hi
    last = COMMODITY_DIST[-1]
    return last[0], last[1], last[2], last[3], last[4], last[5]


def _random_date(start, end):
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def _seasonal_weight(d: date) -> float:
    """Q2 and Q4 are stronger — returns a weight multiplier for P&L."""
    if d.month in (4, 5, 6, 10, 11, 12):
        return 1.20
    return 0.85


def seed_trades_and_actuals(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        if db.query(Trade).count() >= 100:
            logger.info("Trades already seeded — skipping.")
            return

        books     = {b.name: b for b in db.query(Book).all()}
        traders   = db.query(User).filter(User.role == "trader").all()
        cps       = db.query(Counterparty).all()

        if not books or not traders or not cps:
            logger.error("seed_trades: prerequisite data missing (books/traders/cps). Run earlier seeds first.")
            return

        trader = traders[0]

        # ------------------------------------------------------------------
        # Build monthly_pnl accumulator  {(year, month): total_pnl}
        # ------------------------------------------------------------------
        monthly_pnl    = {}
        monthly_counts = {}
        monthly_wins   = {}
        monthly_losses = {}
        monthly_vols   = {}
        monthly_best   = {}
        monthly_worst  = {}

        trades = []
        for i in range(TOTAL_TRADES):
            strategy, win_rate   = _pick_strategy()
            commodity, unit, price_lo, price_hi, vol_lo, vol_hi = _pick_commodity()

            book_name = BOOK_MAP.get(commodity, "Crude Book")
            book      = books.get(book_name)
            if not book:
                continue

            trade_date    = _random_date(START_DATE, END_DATE)
            deliver_start = trade_date + timedelta(days=random.randint(5, 30))
            deliver_end   = deliver_start + timedelta(days=random.randint(1, 30))
            is_settled    = deliver_end < date.today()

            volume    = round(random.uniform(vol_lo, vol_hi), 0)
            price     = round(random.uniform(price_lo, price_hi), 2)
            direction = random.choice(DIRECTIONS)
            cp        = random.choice(cps)

            is_winner = random.random() < win_rate
            seasonal  = _seasonal_weight(trade_date)
            if is_winner:
                pnl = round(random.uniform(50000, 1200000) * seasonal, 0)
            else:
                pnl = round(-random.uniform(30000, 400000) * seasonal, 0)

            pnl_realised   = pnl if is_settled else 0.0
            pnl_unrealised = pnl if not is_settled else 0.0

            trade_ref = f"RMVT-{trade_date.year}-{str(i+1).zfill(4)}"

            t = Trade(
                trade_ref=trade_ref,
                book_id=book.id,
                trader_id=trader.id,
                counterparty_id=cp.id,
                commodity=commodity,
                trade_type=random.choice(TRADE_TYPES),
                direction=direction,
                volume=volume,
                volume_unit=unit,
                price=price,
                price_basis=f"ICE {commodity}" if commodity in ("Brent", "WTI") else "Argus",
                currency="USD",
                trade_date=trade_date,
                delivery_start=deliver_start,
                delivery_end=deliver_end,
                delivery_location=random.choice(LOCATIONS.get(commodity, ["OTC"])),
                incoterms=random.choice(INCOTERMS),
                status="Settled" if is_settled else "Confirmed",
                source_system="RightAngle",
                strategy_type=strategy,
                pnl_realised=pnl_realised,
                pnl_unrealised=pnl_unrealised,
                is_anomalous=0,
            )
            trades.append(t)

            # Accumulate monthly stats
            key = (trade_date.year, trade_date.month)
            monthly_pnl[key]    = monthly_pnl.get(key, 0) + pnl
            monthly_counts[key] = monthly_counts.get(key, 0) + 1
            if is_winner:
                monthly_wins[key]  = monthly_wins.get(key, 0) + 1
            else:
                monthly_losses[key] = monthly_losses.get(key, 0) + 1
            monthly_vols[key]  = monthly_vols.get(key, 0) + volume
            if pnl > monthly_best.get(key, -1e18):
                monthly_best[key]  = pnl
            if pnl < monthly_worst.get(key, 1e18):
                monthly_worst[key] = pnl

        db.add_all(trades)
        db.commit()
        logger.info(f"Seeded {len(trades)} trades.")

        # ------------------------------------------------------------------
        # Monthly actuals
        # ------------------------------------------------------------------
        if db.query(MonthlyActual).first():
            logger.info("MonthlyActuals already seeded — skipping.")
        else:
            book_list = list(books.values())
            actuals = []
            for (yr, mo), total_pnl in sorted(monthly_pnl.items()):
                # Distribute across books proportionally
                book_weights = [0.50, 0.25, 0.15, 0.10]  # Crude, Ethane, NGLs, Carbon
                for bk, wt in zip(book_list, book_weights):
                    actuals.append(MonthlyActual(
                        year=yr,
                        month=mo,
                        book_id=bk.id,
                        trader_id=trader.id,
                        pnl=round(total_pnl * wt, 0),
                        volume_traded=round(monthly_vols.get((yr, mo), 0) * wt, 0),
                        trades_count=max(1, int(monthly_counts.get((yr, mo), 1) * wt)),
                        win_count=max(0, int(monthly_wins.get((yr, mo), 0) * wt)),
                        loss_count=max(0, int(monthly_losses.get((yr, mo), 0) * wt)),
                        best_trade_pnl=round(monthly_best.get((yr, mo), 0) * wt, 0),
                        worst_trade_pnl=round(monthly_worst.get((yr, mo), 0) * wt, 0),
                        var_avg=round(abs(total_pnl * wt) * 0.12, 0),
                    ))
            db.add_all(actuals)
            db.commit()
            logger.info(f"Seeded {len(actuals)} monthly actual records.")

        # ------------------------------------------------------------------
        # Performance targets  2024 / 2025 / 2026
        # ------------------------------------------------------------------
        if db.query(PerformanceTarget).first():
            logger.info("PerformanceTargets already seeded — skipping.")
        else:
            targets_config = [
                (2024, 32000000),
                (2025, 34000000),
                (2026, 36000000),
            ]
            # Seasonal quarterly weights: Q1=22%, Q2=28%, Q3=24%, Q4=26%
            Q_WEIGHTS = (0.22, 0.28, 0.24, 0.26)
            targets = []
            for yr, annual in targets_config:
                for bk in books.values():
                    book_share = (bk.annual_target or annual / 4) / annual
                    targets.append(PerformanceTarget(
                        year=yr,
                        book_id=bk.id,
                        trader_id=trader.id,
                        annual_target=round(annual * book_share, 0),
                        q1_target=round(annual * book_share * Q_WEIGHTS[0], 0),
                        q2_target=round(annual * book_share * Q_WEIGHTS[1], 0),
                        q3_target=round(annual * book_share * Q_WEIGHTS[2], 0),
                        q4_target=round(annual * book_share * Q_WEIGHTS[3], 0),
                    ))
            db.add_all(targets)
            db.commit()
            logger.info(f"Seeded {len(targets)} performance targets.")

        return len(trades)

    except Exception as e:
        db.rollback()
        logger.error(f"seed_trades error: {e}")
        raise
    finally:
        if close_db:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_trades_and_actuals()
