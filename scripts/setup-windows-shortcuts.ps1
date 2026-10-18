<#
.SYNOPSIS
  Configure Windows Shortcuts for Google Antigravity & GravKtrl PC Host
.DESCRIPTION
  1. Updates the Start Menu shortcut for Google Antigravity to always include
     --remote-debugging-port=9222.
  2. Creates a Desktop Shortcut for "Google Antigravity (GravKtrl CDP)".
  3. Creates a 1-Click Desktop Shortcut for "GravKtrl PC Host".
#>

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       CONFIGURE WINDOWS APP SHORTCUTS (ZERO-CLI DESKTOP MODE)        " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$antigravityExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
$repoRoot = Split-Path -Parent $PSScriptRoot

# 1. Update Start Menu shortcut for Google Antigravity
$startMenuLnk = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Antigravity.lnk"
if (Test-Path $startMenuLnk) {
    try {
        $lnk = $wsh.CreateShortcut($startMenuLnk)
        $lnk.Arguments = "--remote-debugging-port=9222"
        $lnk.Save()
        Write-Host "✓ [Start Menu] Updated Antigravity shortcut to launch with --remote-debugging-port=9222" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] Could not update Start Menu shortcut: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Start Menu shortcut not found at $startMenuLnk" -ForegroundColor DarkGray
}

# 2. Create Desktop Shortcut for Google Antigravity (GravKtrl CDP)
if (Test-Path $antigravityExe) {
    try {
        $desktopAntigravityLnk = Join-Path $desktop "Google Antigravity (GravKtrl CDP).lnk"
        $lnk = $wsh.CreateShortcut($desktopAntigravityLnk)
        $lnk.TargetPath = $antigravityExe
        $lnk.Arguments = "--remote-debugging-port=9222"
        $lnk.WorkingDirectory = [System.IO.Path]::GetDirectoryName($antigravityExe)
        $lnk.Description = "Launch Google Antigravity with CDP Port 9222 for GravKtrl Mobile Commander"
        $lnk.IconLocation = "$antigravityExe,0"
        $lnk.Save()
        Write-Host "✓ [Desktop] Created shortcut: 'Google Antigravity (GravKtrl CDP)'" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] Could not create Desktop shortcut for Antigravity: $_" -ForegroundColor Yellow
    }
}

# 3. Create Desktop Shortcut for GravKtrl PC Host Daemon
try {
    $desktopGravLnk = Join-Path $desktop "GravKtrl PC Host.lnk"
    $startScript = Join-Path $repoRoot "scripts\start-gravktrl-pc.ps1"
    
    $lnk = $wsh.CreateShortcut($desktopGravLnk)
    $lnk.TargetPath = "powershell.exe"
    $lnk.Arguments = "-ExecutionPolicy Bypass -NoExit -File `"$startScript`""
    $lnk.WorkingDirectory = $repoRoot
    $lnk.Description = "1-Click Launch for GravKtrl PC Host Daemon"
    if (Test-Path $antigravityExe) {
        $lnk.IconLocation = "$antigravityExe,0"
    }
    $lnk.Save()
    Write-Host "✓ [Desktop] Created shortcut: 'GravKtrl PC Host'" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] Could not create Desktop shortcut for GravKtrl: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE! You can now launch both apps directly from Desktop: " -ForegroundColor Green
Write-Host "   1. Double-click 'Google Antigravity (GravKtrl CDP)'                 " -ForegroundColor White
Write-Host "   2. Double-click 'GravKtrl PC Host'                                  " -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
