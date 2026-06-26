$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$FrontendPort = if ($env:TRADER_FRONTEND_PORT) { $env:TRADER_FRONTEND_PORT } else { "4001" }
$BackendPort = if ($env:TRADER_BACKEND_PORT) { $env:TRADER_BACKEND_PORT } else { "4003" }

$env:PYTHONPATH = $Root
$env:RADIANT_API_BASE = "/api"
$env:RADIANT_BACKEND_HOST = "localhost"
$env:RADIANT_BACKEND_PORT = $BackendPort

$services = @(
    @{ Name = "Radiant Trader Backend"; Module = "main:app"; Port = $BackendPort; Out = "uvicorn-$BackendPort.out.log"; Err = "uvicorn-$BackendPort.err.log" },
    @{ Name = "Radiant Trader"; Module = "trader_main:app"; Port = $FrontendPort; Out = "uvicorn-$FrontendPort.out.log"; Err = "uvicorn-$FrontendPort.err.log" }
)

foreach ($service in $services) {
    $listeners = Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

foreach ($service in $services) {
    $arguments = @(
        "-m", "uvicorn", $service.Module,
        "--host", "0.0.0.0",
        "--port", "$($service.Port)",
        "--log-level", "info"
    )

    Start-Process `
        -FilePath "python" `
        -ArgumentList $arguments `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Root $service.Out) `
        -RedirectStandardError (Join-Path $Root $service.Err)
}

Write-Host "Radiant MVT Trader started:"
Write-Host "  Trader : http://localhost:$FrontendPort"
Write-Host "  API    : http://localhost:$FrontendPort/api/health"
