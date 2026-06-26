"""
Shared in-app help catalog for Radiant-MVT.
Used by both the Help Center UI and chat/manual helpers.
"""
from __future__ import annotations

from copy import deepcopy
import json
import logging
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)
HELP_CATALOG_PATH = Path(__file__).resolve().parent.parent / "docs" / "help" / "catalog.json"


def _load_help_articles() -> list[dict[str, Any]]:
    try:
        with HELP_CATALOG_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, list):
            raise ValueError("catalog payload must be a list")
        return [item for item in payload if isinstance(item, dict)]
    except Exception as exc:
        logger.warning("Unable to load help catalog from %s: %s", HELP_CATALOG_PATH, exc)
        return []


def _normalize(value: str) -> str:
    return " ".join(str(value or "").lower().replace("_", " ").replace("-", " ").split())


def _article_score(article: dict[str, Any], query: str) -> int:
    if not query:
        return 0

    normalized_query = _normalize(query)
    tokens = [token for token in normalized_query.split() if token]
    haystacks = [
        article.get("id", ""),
        article.get("title", ""),
        article.get("screen", ""),
        article.get("summary", ""),
        article.get("why_it_matters", ""),
        " ".join(article.get("steps", [])),
        " ".join(article.get("features", [])),
        " ".join(article.get("quick_questions", [])),
        " ".join(article.get("automation_examples", [])),
    ]
    normalized_haystacks = [_normalize(item) for item in haystacks]

    score = 0
    for haystack in normalized_haystacks:
        if normalized_query and normalized_query in haystack:
            score += 6
    for token in tokens:
        for haystack in normalized_haystacks:
            if token == _normalize(article.get("screen", "")) or token == _normalize(article.get("id", "")):
                score += 6
            if token in haystack:
                score += 2
    return score


def get_help_catalog() -> list[dict[str, Any]]:
    return deepcopy(_load_help_articles())


def get_help_article(article_id: str) -> dict[str, Any] | None:
    normalized = _normalize(article_id)
    for article in _load_help_articles():
        if _normalize(article.get("id", "")) == normalized or _normalize(article.get("screen", "")) == normalized:
            return deepcopy(article)
    return None


def search_help(query: str, limit: int = 5) -> list[dict[str, Any]]:
    scored: list[tuple[int, dict[str, Any]]] = []
    for article in _load_help_articles():
        score = _article_score(article, query)
        if score > 0:
            scored.append((score, article))
    scored.sort(key=lambda item: (-item[0], item[1].get("title", "")))
    return [deepcopy(article) for _, article in scored[:limit]]


def get_screen_help(screen: str) -> dict[str, Any] | None:
    return get_help_article(screen)


def build_help_context(question: str = "", screen_context: str = "", limit: int = 3) -> str:
    matches = search_help(question, limit=limit)
    if not matches and screen_context:
        screen_match = get_screen_help(screen_context)
        if screen_match:
            matches = [screen_match]
    if not matches:
        return ""

    lines = ["APPLICATION HELP CENTER:"]
    for article in matches:
        lines.append(
            f"- {article['title']} (screen={article.get('screen') or article.get('id')}): {article.get('summary', '')}"
        )
        if article.get("steps"):
            lines.append("  Steps:")
            for step in article["steps"][:3]:
                lines.append(f"    * {step}")
        if article.get("automation_examples"):
            lines.append("  Supported automation examples:")
            for example in article["automation_examples"][:2]:
                lines.append(f"    * {example}")
    return "\n".join(lines)
