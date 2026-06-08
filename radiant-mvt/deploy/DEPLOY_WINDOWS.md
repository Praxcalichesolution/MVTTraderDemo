# Radiant-MVT — Windows Server Deployment Guide

Target: Windows Server 2019/2022 with IIS, running behind an IIS ARR reverse proxy.

---

## 1. Prerequisites

Install the following before starting:

- **Python 3.10+** — https://www.python.org/downloads/
  - Tick "Add Python to PATH" during install.
- **ODBC Driver 18 for SQL Server** — required if connecting to SQL Server
  - https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
- **IIS** — enable via Server Manager → Add Roles → Web Server (IIS)
- **Application Request Routing (ARR) 3.0** — https://www.iis.net/downloads/microsoft/application-request-routing
- **URL Rewrite Module 2.1** — https://www.iis.net/downloads/microsoft/url-rewrite
- **pywin32** — installed in step 2 below

---

## 2. Install Python Dependencies

Open a Command Prompt as Administrator in the `radiant-mvt\` folder:

```cmd
cd C:\path\to\MVT Trader\radiant-mvt
pip install -r requirements.txt pywin32
python Scripts\pywin32_postinstall.py -install
```

---

## 3. Configure .env

Copy `.env.template` to `.env` and fill in real values:

```env
# Database — use SQL Server for production
DATABASE_URL=mssql+pyodbc://MVTSQL:YourPassword@10.251.1.14:1433/MVT_Trader?driver=ODBC%20Driver%2018%20for%20SQL%20Server&TrustServerCertificate=yes

# AI — set one of: claude | local
ANTHROPIC_API_KEY=sk-ant-...

# Auth
SECRET_KEY=change-me-to-a-random-64-char-string
TOKEN_EXPIRE_MINUTES=480
```

---

## 4. Initialise the Database

If using SQL Server, run the schema script first in SSMS or sqlcmd:

```cmd
sqlcmd -S 10.251.1.14 -d MVT_Trader -U MVTSQL -P YourPassword -i database\schema_sqlserver.sql
```

Then verify the app can reach the DB:

```cmd
python -c "from database.db import test_db_connection; print(test_db_connection())"
```

---

## 5. Test the App Runs

```cmd
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Browse to http://localhost:8000/api/health — expect `{"status":"ok"}`.
Press Ctrl+C to stop after testing.

---

## 6. Install as a Windows Service

From an elevated Command Prompt in `radiant-mvt\`:

```cmd
python deploy\windows_service.py install
python deploy\windows_service.py start
```

Check status:

```cmd
sc query RadiantMVT
```

To stop or remove:

```cmd
python deploy\windows_service.py stop
python deploy\windows_service.py remove
```

The service reads `.env` from the `radiant-mvt\` directory on startup. Set the service to start
automatically in `services.msc` (Startup Type: Automatic).

---

## 7. Configure IIS

1. Open **IIS Manager**.
2. Enable ARR proxy:
   - Click the server node → **Application Request Routing Cache** → **Server Proxy Settings** →
     tick **Enable proxy** → Apply.
3. Create a new site (or use Default Web Site):
   - Physical path: `C:\path\to\MVT Trader\radiant-mvt\frontend`
   - Port: 80 (or 443 for HTTPS)
4. Copy `deploy\web.config` into the site root (or the physical path folder above).
5. In IIS Manager, select the site → **URL Rewrite** → confirm the `ReverseProxy-RadiantMVT` rule appears.
6. Restart the site.

---

## 8. Test End-to-End

```cmd
curl http://localhost/api/health
curl http://localhost/api/health/db
```

Expect:

```json
{"status": "ok", "app": "Radiant-MVT", ...}
{"database": {"ok": true, "url": "10.251.1.14:1433/MVT_Trader"}}
```

---

## 9. Firewall

Open the required ports:

```cmd
netsh advfirewall firewall add rule name="Radiant-MVT HTTP" protocol=TCP dir=in localport=80 action=allow
netsh advfirewall firewall add rule name="Radiant-MVT HTTPS" protocol=TCP dir=in localport=443 action=allow
```

For HTTPS, add an SSL certificate binding in IIS and update `web.config` to use port 443.

---

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| Service fails to start | Check Windows Event Viewer → Application log for `RadiantMVT` entries |
| 502 Bad Gateway from IIS | Ensure `RadiantMVT` service is running; ARR proxy is enabled |
| DB connection error | Verify ODBC Driver 18 is installed; test with `sqlcmd` directly |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` from the correct Python environment |
| Auth token errors | Ensure `SECRET_KEY` in `.env` matches across all instances |
| Rate limit 429 on login | Reduce login attempts; limit is 10/minute per IP |

### Logs

- **Application logs**: `radiant-mvt\logs\` (if configured) or Windows Event Viewer
- **IIS access logs**: `C:\inetpub\logs\LogFiles\`
- **Service stdout**: redirect in `windows_service.py` to a file if needed by adding `stdout=open('service.log','a')` to `subprocess.Popen`
