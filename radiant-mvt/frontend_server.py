"""
frontend_server.py — Radiant-MVT Frontend Dev Server
Serves the frontend/ directory on port 3000 with request logging.
Run: python3 frontend_server.py
"""
import http.server
import logging
import os
import socketserver
import sys
import time

PORT = int(os.environ.get("FRONTEND_PORT", 3000))
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("frontend.log", mode="a"),
    ],
)
logger = logging.getLogger("radiant_mvt.frontend")


class LoggingHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler with structured request logging."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def log_message(self, format, *args):
        # Suppress default handler — we log ourselves
        pass

    def do_GET(self):
        start = time.perf_counter()
        # Rewrite root to index.html
        if self.path == "/" or not self.path.startswith("/static"):
            self.path = "/index.html"
        super().do_GET()
        elapsed = (time.perf_counter() - start) * 1000
        status = getattr(self, "_response_code", "???")
        logger.info("GET %-45s  %s  %.1fms", self.path, self.responses.get(self.response_code, ["?"])[0] if hasattr(self, 'response_code') else "OK", elapsed)

    def send_response(self, code, message=None):
        self.response_code = code
        super().send_response(code, message)
        level = logging.WARNING if code >= 400 else logging.INFO
        logger.log(level, "← %d  %s", code, self.path)

    def end_headers(self):
        # Allow CORS from API server for any preflight
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    if not os.path.isdir(FRONTEND_DIR):
        logger.error("Frontend directory not found: %s", FRONTEND_DIR)
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("Radiant-MVT Frontend Server")
    logger.info("Serving : %s", FRONTEND_DIR)
    logger.info("URL     : http://localhost:%d", PORT)
    logger.info("API     : http://localhost:8000  (backend)")
    logger.info("Log     : frontend.log")
    logger.info("Stop    : Ctrl+C")
    logger.info("=" * 60)

    with ThreadedTCPServer(("", PORT), LoggingHTTPHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Frontend server stopped.")


if __name__ == "__main__":
    main()
