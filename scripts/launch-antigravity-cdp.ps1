<#
.SYNOPSIS
  Launch Google Antigravity IDE with Chrome DevTools Protocol Port 9222
.DESCRIPTION
  Starts Antigravity with --remote-debugging-port=9222 so GravKtrl can inject
  prompts directly and stream live thoughts without requiring clipboard paste.
#>

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       LAUNCH GOOGLE ANTIGRAVITY WITH CDP PORT 9222 ENABLED          " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

$antigravityExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"

if (-not (Test-Path $antigravityExe)) {
    Write-Host "[ERROR] Antigravity executable not found at: $antigravityExe" -ForegroundColor Red
    exit 1
}

# Check if already running on port 9222
$cdpActive = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res) { $cdpActive = $true }
} catch {}

if ($cdpActive) {
    Write-Host "✓ Google Antigravity is already active and listening on port 9222!" -ForegroundColor Green
    exit 0
}

# Check if running without port 9222
$running = Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "[NOTICE] Antigravity is currently running without CDP debugging port." -ForegroundColor Yellow
    Write-Host "         To enable direct DOM prompt injection, please restart Antigravity with port 9222." -ForegroundColor White
    $confirm = Read-Host "Close existing Antigravity instance and restart with --remote-debugging-port=9222? (Y/N)"
    if ($confirm -eq "Y" -or $confirm -eq "y") {
        Write-Host "Closing Antigravity..." -ForegroundColor Yellow
        Stop-Process -Name "Antigravity" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Leaving current Antigravity instance running in Fallback Queue mode." -ForegroundColor DarkGray
        exit 0
    }
}

Write-Host "Starting Antigravity with --remote-debugging-port=9222..." -ForegroundColor Cyan
Start-Process -FilePath $antigravityExe -ArgumentList "--remote-debugging-port=9222"

Start-Sleep -Seconds 3

try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($res) {
        Write-Host "✓ Google Antigravity CDP Bridge is ONLINE on port 9222!" -ForegroundColor Green
        Write-Host "  GravKtrl can now inject prompts directly into the chat without Ctrl+V." -ForegroundColor Green
    }
} catch {
    Write-Host "[WARNING] Antigravity started, but port 9222 is taking longer to respond. It will be ready shortly." -ForegroundColor Yellow
}
