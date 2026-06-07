"""Radiant-MVT™ proxy server — serves frontend + proxies /api/* to FastAPI backend"""
import http.server, urllib.request, urllib.error, json, os, sys, socket

BACKEND_HOST = "localhost"
BACKEND_PORT = 8080
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=FRONTEND_DIR, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            print(f"  API  {args[1]} {args[0].split()[1] if args[0] else ''}")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy("GET")
        else:
            p = self.path.split("?")[0].lstrip("/")
            fp = os.path.join(FRONTEND_DIR, p) if p else ""
            if fp and os.path.isfile(fp):
                super().do_GET()
            else:
                self._serve_index()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy("POST")

    def do_PUT(self):
        if self.path.startswith("/api/"): self._proxy("PUT")

    def do_DELETE(self):
        if self.path.startswith("/api/"): self._proxy("DELETE")

    def do_PATCH(self):
        if self.path.startswith("/api/"): self._proxy("PATCH")

    def _serve_index(self):
        idx = os.path.join(FRONTEND_DIR, "index.html")
        if not os.path.exists(idx):
            self.send_error(404); return
        with open(idx, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept,Cache-Control")
        self.send_header("Access-Control-Expose-Headers", "Content-Type")

    def _proxy(self, method):
        url = f"http://{BACKEND_HOST}:{BACKEND_PORT}{self.path}"
        headers = {}
        for h in ["Authorization", "Content-Type", "Accept", "Cache-Control"]:
            v = self.headers.get(h)
            if v: headers[h] = v

        body = None
        n = int(self.headers.get("Content-Length", 0))
        if n: body = self.rfile.read(n)

        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                ct = ""
                for k, v in resp.headers.items():
                    kl = k.lower()
                    if kl in ("transfer-encoding", "connection", "keep-alive"): continue
                    self.send_header(k, v)
                    if kl == "content-type": ct = v
                self._cors()
                self.end_headers()
                # Stream the body (handles SSE)
                while True:
                    chunk = resp.read(512)
                    if not chunk: break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except ConnectionRefusedError:
            msg = json.dumps({"detail": f"Backend not running on port {BACKEND_PORT}"}).encode()
            self.send_response(503)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
        except Exception as ex:
            msg = json.dumps({"detail": str(ex)}).encode()
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = http.server.ThreadingHTTPServer(("", port), Handler)
    print(f"\n  ╔══════════════════════════════════════════╗")
    print(f"  ║  Radiant-MVT™ Trading Intelligence      ║")
    print(f"  ╚══════════════════════════════════════════╝")
    print(f"\n  Open:    http://localhost:{port}")
    print(f"  Backend: http://localhost:{BACKEND_PORT}")
    print(f"  Login:   alex.chen@ineos-ts.com / Trader2026!")
    print(f"\n  Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
