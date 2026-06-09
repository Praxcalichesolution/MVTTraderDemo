"""
Small in-process TTL cache for read-heavy API endpoints.
"""
from __future__ import annotations

import threading
import time


class TTLCache:
    def __init__(self):
        self._data: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        now = time.time()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value, ttl_seconds: float):
        with self._lock:
            self._data[key] = (time.time() + ttl_seconds, value)
        return value

    def get_or_set(self, key: str, ttl_seconds: float, factory):
        cached = self.get(key)
        if cached is not None:
            return cached, True
        value = factory()
        self.set(key, value, ttl_seconds)
        return value, False

    def invalidate(self, prefix: str | None = None):
        with self._lock:
            if prefix is None:
                self._data.clear()
                return
            for key in list(self._data.keys()):
                if key.startswith(prefix):
                    self._data.pop(key, None)


api_cache = TTLCache()
