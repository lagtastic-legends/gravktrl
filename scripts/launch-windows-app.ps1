<#
.SYNOPSIS
  Launch GravKtrl Windows Desktop App & Frameless Control Center
.DESCRIPTION
  1. Starts the background GravKtrl Daemon (0.0.0.0:8787) if not already active.
  2. Ensures desktop shortcuts are created with public\gravktrl.ico.
  3. Launches the Desktop Control Center in an app-mode frameless window (Edge or Chrome).
#>

$ErrorActionPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = [System.Environment]::GetFolderPath('Desktop')
$icoPath = Join-Path $repoRoot "public\gravktrl.ico"
$port = 8787
$healthUrl = "http://127.0.0.1:$port/health"
$desktopUrl = "http://localhost:$port/desktop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "           LAUNCHING GRAVKTRL WINDOWS DESKTOP APP                     " -ForegroundColor Magenta
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Check if GravKtrl Daemon is already active
$isOnline = $false
try {
    $res = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res -and $res.status -eq "online") {
        $isOnline = $true
    }
} catch {}

if (-not $isOnline) {
    Write-Host "[1/3] Starting GravKtrl PC Daemon in background..." -ForegroundColor Yellow
    
    # Check if tsx or node is available
    $npxPath = (Get-Command "npx.cmd" -ErrorAction SilentlyContinue).Source
    if (-not $npxPath) { $npxPath = "npx" }

    Start-Process -FilePath $npxPath `
        -ArgumentList "tsx", "pc-daemon/src/server.ts" `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden

    # Wait for daemon to become ready
    $retries = 15
    while ($retries -gt 0 -and -not $isOnline) {
        Start-Sleep -Milliseconds 400
        try {
            $check = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($check -and $check.status -eq "online") {
                $isOnline = $true
                break
            }
        } catch {}
        $retries--
    }

    if ($isOnline) {
        Write-Host "✓ [1/3] GravKtrl PC Daemon is ONLINE at 0.0.0.0:$port" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Daemon taking longer than expected to report health. Proceeding to launch UI..." -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ [1/3] GravKtrl PC Daemon is already active!" -ForegroundColor Green
}

# 2. Ensure Desktop Shortcut exists
try {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $desktop "GravKtrl Windows Control.lnk"
    if (-not (Test-Path $shortcutPath)) {
        $lnk = $wsh.CreateShortcut($shortcutPath)
        $batPath = Join-Path $repoRoot "GravKtrl-Windows.bat"
        $lnk.TargetPath = $batPath
        $lnk.WorkingDirectory = $repoRoot
        $lnk.Description = "Launch GravKtrl Windows Desktop App & Control Center"
        if (Test-Path $icoPath) {
            $lnk.IconLocation = "$icoPath,0"
        }
        $lnk.Save()
        Write-Host "✓ [2/3] Created Desktop shortcut: 'GravKtrl Windows Control'" -ForegroundColor Green
    } else {
        Write-Host "✓ [2/3] Desktop shortcut already present." -ForegroundColor Green
    }
} catch {
    Write-Host "[INFO] Shortcut check complete." -ForegroundColor DarkGray
}

# 3. Locate browser for --app mode (Edge -> Chrome -> Default)
Write-Host "[3/3] Opening Frameless Desktop Control Center..." -ForegroundColor Cyan

$edgeCandidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$browserExe = $null
foreach ($path in $edgeCandidates) {
    if (Test-Path $path) {
        $browserExe = $path
        break
    }
}

if (-not $browserExe) {
    foreach ($path in $chromeCandidates) {
        if (Test-Path $path) {
            $browserExe = $path
            break
        }
    }
}

if ($browserExe) {
    Start-Process -FilePath $browserExe -ArgumentList "--app=$desktopUrl", "--window-size=460,720"
    Write-Host "✓ Launched GravKtrl Desktop in native app-window mode ($browserExe)" -ForegroundColor Green
} else {
    Start-Process $desktopUrl
    Write-Host "✓ Opened GravKtrl Desktop in default browser" -ForegroundColor Green
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  GRAVKTRL DESKTOP IS READY!                                          " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
