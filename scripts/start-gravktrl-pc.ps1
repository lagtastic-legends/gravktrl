<#
.SYNOPSIS
  GravKtrl PC Host Daemon Launcher & CDP Diagnostics
.DESCRIPTION
  Launches the GravKtrl PC Daemon service (0.0.0.0:8787), checks Antigravity CDP port 9222,
  and prints connection endpoints and pairing token.
#>

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       GRAVKTRL PC DAEMON & REMOTE AGENT BRIDGE LAUNCHER             " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Check CDP Port 9222 Health
Write-Host "[1/3] Probing Google Antigravity IDE CDP Port 9222..." -NoNewline
$cdpActive = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res) {
        $cdpActive = $true
        Write-Host " [ACTIVE]" -ForegroundColor Green
        Write-Host "      Browser : $($res.Browser)" -ForegroundColor DarkGray
        Write-Host "      Protocol: $($res.'Protocol-Version')" -ForegroundColor DarkGray
    }
} catch {
    Write-Host " [OFFLINE]" -ForegroundColor Yellow
}

if (-not $cdpActive) {
    Write-Host ""
    Write-Host "[NOTICE] Antigravity is not currently running with --remote-debugging-port=9222." -ForegroundColor Yellow
    Write-Host "         GravKtrl will automatically operate in FALLBACK QUEUE mode:" -ForegroundColor Yellow
    Write-Host "          • Prompts will be staged directly into the Windows Clipboard" -ForegroundColor DarkGray
    Write-Host "          • Prompts will be logged to <workspace>/.antigravity/GRAVKTRL_INBOX.md" -ForegroundColor DarkGray
    Write-Host "         To enable direct DOM injection & live streaming, run:" -ForegroundColor White
    Write-Host "           .\scripts\launch-antigravity-cdp.ps1" -ForegroundColor Cyan
    Write-Host ""
}

# 2. Check Dependencies
Write-Host "[2/3] Checking Node.js environment..." -NoNewline
try {
    $nodeVer = & node -v
    Write-Host " [$nodeVer]" -ForegroundColor Green
} catch {
    Write-Host " [FAILED: Node.js not found in PATH]" -ForegroundColor Red
    exit 1
}

# 3. Boot PC Daemon
Write-Host "[3/3] Starting GravKtrl PC Daemon on port 8787..." -ForegroundColor Cyan
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

& npx tsx pc-daemon/src/server.ts
