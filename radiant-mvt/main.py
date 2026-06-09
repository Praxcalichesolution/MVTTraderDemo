"""
main.py — Radiant-MVT FastAPI Application Entry Point
INEOS Trading & Shipping — Trading Intelligence Platform
"""
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database.db import init_db, run_migrations

# ── Configure logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("radiant_mvt")
request_logger = logging.getLogger("radiant_mvt.requests")


# ── Request / Response logging middleware ────────────────────────────────────
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        client = request.client.host if request.client else "unknown"
        request_logger.info(
            "→ %s %s  [client=%s]", request.method, request.url.path, client
        )
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            request_logger.error(
                "✗ %s %s  ERROR=%s  %.1fms", request.method, request.url.path, exc, elapsed
            )
            raise
        elapsed = (time.perf_counter() - start) * 1000
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        request_logger.log(
            level,
            "← %s %s  status=%d  %.1fms",
            request.method, request.url.path, response.status_code, elapsed,
        )
        return response


# ── Scheduler setup ──────────────────────────────────────────────────────────
def _build_scheduler():
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from feeds.market_data import fetch_and_store_market_data
    from feeds.news_feed import fetch_and_store_news
    from feeds.feed_aggregator import aggregate_all_feeds
    from feeds.etrm_simulator import simulate_etrm_updates
    from feeds.vessel_simulator import simulate_vessel_positions
    from feeds.anomaly_injector import inject_random_anomaly
    from feeds.market_intelligence_agent import run_market_intelligence_agent

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(fetch_and_store_market_data, "interval", seconds=60,   id="market_data")
    scheduler.add_job(fetch_and_store_news,         "interval", seconds=300,  id="news_feed")
    scheduler.add_job(aggregate_all_feeds,          "interval", minutes=15,   id="feed_aggregator")
    scheduler.add_job(simulate_etrm_updates,        "interval", seconds=180,  id="etrm_sim")
    scheduler.add_job(simulate_vessel_positions,    "interval", seconds=180,  id="vessel_sim")
    scheduler.add_job(inject_random_anomaly,        "interval", seconds=120,  id="anomaly_injector")
    scheduler.add_job(run_market_intelligence_agent, "interval", minutes=30,  id="market_intel")
    scheduler.add_job(
        run_market_intelligence_agent,
        "date",
        run_date=datetime.now() + timedelta(seconds=10),
        id="market_intel_startup",
    )
    return scheduler


# ── Lifespan ─────────────────────────────────────────────────────────────────

def _refresh_decision_deadlines():
    """Ensure decision queue always has future deadlines — critical for demo."""
    try:
        from database.db import SessionLocal
        from database.models import DecisionQueue
        from datetime import datetime, timedelta
        db = SessionLocal()
        now = datetime.now()
        # Update or insert the 3 core demo decisions
        decisions = [
            (1, "Review Urals hedge coverage before OPEC+ announcement",
             "Urals net long 80,000 bbl. OPEC+ meeting in 2 hours. Hedge ratio at 61%.",
             "$2.4M at risk if spread moves", 2400000, "Critical",
             now + timedelta(hours=2, minutes=15)),
            (2, "JS Ineos Innovation delay — choose response option",
             "Dragon vessel delayed 14 hours. Three options costed. Terminal at Rafnes needs decision.",
             "Voyage economics impact $480K", 480000, "High",
             now + timedelta(hours=3, minutes=45)),
            (3, "Vitol trade confirmation outstanding — RMVT-0234",
             "Verbal trade agreed this morning. Written confirmation not sent. Counterparty deadline approaching.",
             "Counterparty dispute risk if missed", 0, "Medium",
             now + timedelta(hours=6, minutes=30)),
        ]
        for d in decisions:
            existing = db.query(DecisionQueue).filter(DecisionQueue.id == d[0]).first()
            if existing:
                existing.title = d[1]
                existing.description = d[2]
                existing.impact_description = d[3]
                existing.potential_impact = d[4]
                existing.urgency = d[5]
                existing.deadline = d[6]
                existing.status = "Pending"
            else:
                db.add(DecisionQueue(
                    id=d[0],
                    title=d[1],
                    description=d[2],
                    impact_description=d[3],
                    potential_impact=d[4],
                    urgency=d[5],
                    deadline=d[6],
                    user_id=1,
                    status="Pending",
                ))
        db.commit()
        db.close()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== Radiant-MVT starting up ===")

    # 1. Initialise database
    logger.info("Initialising database …")
    init_db()
    run_migrations()
    logger.info("Database ready.")

    # 2. Seed database if empty
    try:
        from database.seed import run_seed
        run_seed()
        from database.seed.seed_all import seed_monthly_actuals_if_empty
        seed_monthly_actuals_if_empty()
        from feeds.news_feed import seed_news_if_empty as _seed_news2
        from database.db import SessionLocal as _SL2
        _db2 = _SL2()
        try:
            _seed_news2(_db2)
        finally:
            _db2.close()
    except Exception as exc:
        logger.warning("Seed skipped or failed: %s", exc)

    # 3. Start background scheduler
    scheduler = _build_scheduler()
    scheduler.start()
    logger.info("Background feed scheduler started (%d jobs).", len(scheduler.get_jobs()))

    yield  # ── application runs ──

    logger.info("=== Radiant-MVT shutting down ===")
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped.")


# ── App factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Radiant-MVT",
    description="INEOS Trading & Shipping — Trading Intelligence Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Rate limiter ──────────────────────────────────────────────────────────────
from api.rate_limit import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Only inject security headers on API JSON responses to avoid
    # Content-Length mismatch on static files and SSE streams
    ct = response.headers.get("content-type", "")
    is_api = request.url.path.startswith("/api/")
    if is_api and "text/event-stream" not in ct:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/api/db-status", tags=["System"])
async def db_status():
    """Diagnostic: shows DB connection, version, and all table names."""
    from database.db import engine, DATABASE_URL
    from sqlalchemy import inspect as sa_inspect, text
    result = {
        "database_url": DATABASE_URL[:60] + "..." if len(DATABASE_URL) > 60 else DATABASE_URL,
        "db_type": "sql_server" if DATABASE_URL.startswith("mssql") else "sqlite",
        "connected": False,
        "server_version": None,
        "tables": [],
        "error": None,
    }
    try:
        with engine.connect() as conn:
            if DATABASE_URL.startswith("mssql"):
                result["server_version"] = conn.execute(text("SELECT @@VERSION")).scalar()[:80]
            else:
                result["server_version"] = "SQLite"
            result["connected"] = True
        inspector = sa_inspect(engine)
        result["tables"] = sorted(inspector.get_table_names())
        result["table_count"] = len(result["tables"])
    except Exception as e:
        result["error"] = str(e)
    return result


@app.get("/api/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "app": "Radiant-MVT",
        "version": "1.0.0",
        "organisation": "INEOS Trading & Shipping",
    }


@app.get("/api/health/db", tags=["System"])
async def health_db():
    from database.db import test_db_connection
    result = test_db_connection()
    return {"database": result}


# ── API routers ───────────────────────────────────────────────────────────────
from api.auth          import router as auth_router
from api.users         import router as users_router
from api.positions     import router as positions_router
from api.trades        import router as trades_router
from api.market_data   import router as market_data_router
from api.alerts        import router as alerts_router
from api.chat          import router as chat_router
from api.performance   import router as performance_router
from api.vessels       import router as vessels_router
from api.communications import router as communications_router
from api.decisions     import router as decisions_router
from api.regulatory    import router as regulatory_router
from api.admin         import router as admin_router
from api.ai_settings   import router as ai_settings_router
from api.market_intelligence import router as market_intel_router
from api.configuration import router as configuration_router
from api.news          import router as news_router
from api.dashboard     import router as dashboard_router

app.include_router(auth_router,           prefix="/api/auth",           tags=["Auth"])
app.include_router(users_router,          prefix="/api/users",          tags=["Users"])
app.include_router(positions_router,      prefix="/api/positions",      tags=["Positions"])
app.include_router(trades_router,         prefix="/api/trades",         tags=["Trades"])
app.include_router(market_data_router,    prefix="/api/market-data",    tags=["Market Data"])
app.include_router(alerts_router,         prefix="/api/alerts",         tags=["Alerts"])
app.include_router(chat_router,           prefix="/api/chat",           tags=["AI Chat"])
app.include_router(performance_router,    prefix="/api/performance",    tags=["Performance"])
app.include_router(vessels_router,        prefix="/api/vessels",        tags=["Vessels"])
app.include_router(communications_router, prefix="/api/communications", tags=["Communications"])
app.include_router(decisions_router,      prefix="/api/decisions",      tags=["Decisions"])
app.include_router(regulatory_router,     prefix="/api/regulatory",     tags=["Regulatory"])
app.include_router(admin_router,          prefix="/api/admin",          tags=["Admin"])
app.include_router(ai_settings_router,    prefix="/api/ai-settings",    tags=["AI Settings"])
app.include_router(market_intel_router,   prefix="/api/market",         tags=["Market Intelligence"])
app.include_router(configuration_router,  prefix="/api/configuration",  tags=["Configuration"])
app.include_router(news_router,           prefix="/api/news",           tags=["News"])
app.include_router(dashboard_router,      prefix="/api/dashboard",      tags=["Dashboard"])


# ── Additional route aliases ─────────────────────────────────────────────────
app.include_router(market_data_router,    prefix="/api/market",         tags=["Market Data (alias)"])
app.include_router(communications_router, prefix="/api/comms",          tags=["Communications (alias)"])
app.include_router(ai_settings_router,    prefix="/api/ai",             tags=["AI Settings (alias)"])

# ── Static files & SPA catch-all ─────────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(__file__), "frontend", "static")
INDEX_HTML = os.path.join(os.path.dirname(__file__), "frontend", "index.html")

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", include_in_schema=False)
async def serve_root():
    """Serve frontend - no auth required."""
    if os.path.exists(INDEX_HTML):
        return FileResponse(INDEX_HTML)
    return JSONResponse({"message": "Radiant-MVT API running."})

@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    return JSONResponse({}, status_code=204)

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_catch_all(full_path: str, request: Request):
    """Serve the SPA index.html for all non-API routes."""
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    if os.path.exists(INDEX_HTML):
        return FileResponse(INDEX_HTML)
    return JSONResponse(
        {"message": "Radiant-MVT API running. Frontend not yet deployed."},
        status_code=200,
    )


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
