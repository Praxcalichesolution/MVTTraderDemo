"""
FastAPI shell apps for the Trader and Risk workspace variants.
"""
import json
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app_modes import get_app_mode


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "frontend" / "static"
HELP_DOCS_DIR = BASE_DIR / "docs" / "help"
INDEX_TEMPLATE = BASE_DIR / "frontend" / "index.html"


def _render_index(mode: str) -> str:
    config = get_app_mode(mode)
    config["api_base"] = os.getenv("RADIANT_API_BASE", "http://localhost:8000/api")
    template = INDEX_TEMPLATE.read_text(encoding="utf-8")
    bootstrap = (
        "<script>"
        f"window.__APP_MODE__ = {json.dumps(config)};"
        "</script>"
    )
    return (
        template
        .replace("__APP_TITLE__", config["browser_title"])
        .replace("__APP_BOOTSTRAP__", bootstrap)
    )


def _html_response(html: str) -> StreamingResponse:
    return StreamingResponse(iter([html.encode("utf-8")]), media_type="text/html; charset=utf-8")


def create_shell_app(mode: str) -> FastAPI:
    config = get_app_mode(mode)
    app = FastAPI(
        title=config["title"],
        description=f"{config['title']} workspace shell",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    if HELP_DOCS_DIR.is_dir():
        app.mount("/help-docs", StaticFiles(directory=str(HELP_DOCS_DIR)), name="help-docs")

    @app.get("/", include_in_schema=False)
    async def root():
        return _html_response(_render_index(mode))

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        return JSONResponse({}, status_code=204)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str, request: Request):
        if full_path.startswith("static/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return _html_response(_render_index(mode))

    return app
