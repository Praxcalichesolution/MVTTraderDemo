$ErrorActionPreference = "Continue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PidDir = Join-Path $RepoRoot ".runtime"
$Ports = @(8005, 8006, 8007)

function Stop-ProcessId {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped PID $ProcessId"
    }
}

if (Test-Path $PidDir) {
    Get-ChildItem $PidDir -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
        $raw = Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1
        $pidValue = 0
        if ([int]::TryParse($raw, [ref]$pidValue)) {
            Stop-ProcessId -ProcessId $pidValue
        }
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

foreach ($port in $Ports) {
    $lines = cmd.exe /c "netstat -ano -p tcp | findstr /R /C:"":$port .*LISTENING"""
    foreach ($line in $lines) {
        $parts = ($line -split "\s+") | Where-Object { $_ }
        $owner = 0
        if ($parts.Count -gt 0) {
            [void][int]::TryParse($parts[-1], [ref]$owner)
        }
        if ($owner -gt 0) {
            Stop-ProcessId -ProcessId $owner
        }
    }
}

Write-Host "Radiant local demo stop command completed."
