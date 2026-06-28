$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$LogDir = Join-Path $RepoRoot "logs"
$PidDir = Join-Path $RepoRoot ".runtime"

$ApiPort = 8005
$TraderPort = 8006
$ApiBase = "http://127.0.0.1:$ApiPort/api"

New-Item -ItemType Directory -Force -Path $LogDir, $PidDir | Out-Null

if (-not (Test-Path $Python)) {
    throw "Python virtual environment not found at $Python"
}

function Test-PortListening {
    param([int]$Port)
    $matches = cmd.exe /c "netstat -ano -p tcp | findstr /R /C:"":$Port .*LISTENING"""
    return -not [string]::IsNullOrWhiteSpace($matches)
}

function Start-RadiantService {
    param(
        [string]$Name,
        [string]$Module,
        [int]$Port
    )

    if (Test-PortListening -Port $Port) {
        Write-Host "$Name already appears to be listening on 127.0.0.1:$Port"
        return
    }

    $env:PYTHONPATH = $RepoRoot
    $env:RADIANT_API_BASE = $ApiBase

    $stdout = Join-Path $LogDir "$Name-$Port.out.log"
    $stderr = Join-Path $LogDir "$Name-$Port.err.log"
    $process = Start-Process `
        -FilePath $Python `
        -ArgumentList @("-m", "uvicorn", "$Module`:app", "--host", "127.0.0.1", "--port", "$Port", "--log-level", "info") `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -Path (Join-Path $PidDir "$Name.pid") -Value $process.Id -Encoding ASCII
    Write-Host "Started $Name on http://127.0.0.1:$Port/ (PID $($process.Id))"
}

Start-RadiantService -Name "radiant-api" -Module "main" -Port $ApiPort
Start-Sleep -Seconds 6
Start-RadiantService -Name "radiant-trader" -Module "trader_main" -Port $TraderPort

Write-Host ""
Write-Host "Radiant local demo is starting:"
Write-Host "  API    http://127.0.0.1:$ApiPort/api/health"
Write-Host "  Trader http://127.0.0.1:$TraderPort/"
