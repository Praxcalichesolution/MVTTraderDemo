# Radiant MVT Trader

Standalone Trader workspace for the Radiant MVT platform.

## Run Locally

1. Copy `.env.template` to `.env` and fill in required keys.
2. Start the app:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_trader_repo_windows.ps1
```

Default ports:

- Trader frontend: `4001`
- Backend API: `4003`

You can override ports with:

```powershell
$env:TRADER_FRONTEND_PORT="4101"
$env:TRADER_BACKEND_PORT="4103"
powershell -ExecutionPolicy Bypass -File .\start_trader_repo_windows.ps1
```

The frontend uses same-origin `/api`, and the Trader shell proxies API calls to the local backend port.
