<#
.SYNOPSIS
  Configure Windows Shortcuts for Google Antigravity & GravKtrl Windows Control
#>

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       CONFIGURE WINDOWS APP SHORTCUTS (ZERO-CLI DESKTOP MODE)        " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$antigravityExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
$repoRoot = Split-Path -Parent $PSScriptRoot
$icoPath = [System.IO.Path]::Combine($repoRoot, 'public', 'gravktrl.ico')

# 1. Update Start Menu shortcut for Google Antigravity
$startMenuLnk = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Antigravity.lnk')
if (Test-Path $startMenuLnk) {
    try {
        $lnk = $wsh.CreateShortcut($startMenuLnk)
        $lnk.Arguments = "--remote-debugging-port=9222"
        $lnk.Save()
        Write-Host "✓ [Start Menu] Updated Antigravity shortcut to launch with --remote-debugging-port=9222" -ForegroundColor Green
    } catch {
        Write-Host ("WARNING: Could not update Start Menu shortcut: " + $_.Exception.Message) -ForegroundColor Yellow
    }
} else {
    Write-Host ("INFO: Start Menu shortcut not found at " + $startMenuLnk) -ForegroundColor DarkGray
}

# 2. Create Desktop Shortcut for Google Antigravity (GravKtrl CDP)
if (Test-Path $antigravityExe) {
    try {
        $desktopAntigravityLnk = [System.IO.Path]::Combine($desktop, 'Google Antigravity (GravKtrl CDP).lnk')
        $lnk = $wsh.CreateShortcut($desktopAntigravityLnk)
        $lnk.TargetPath = $antigravityExe
        $lnk.Arguments = "--remote-debugging-port=9222"
        $lnk.WorkingDirectory = [System.IO.Path]::GetDirectoryName($antigravityExe)
        $lnk.Description = "Launch Google Antigravity with CDP Port 9222 for GravKtrl Mobile Commander"
        $lnk.IconLocation = "$antigravityExe,0"
        $lnk.Save()
        Write-Host "✓ [Desktop] Created shortcut: 'Google Antigravity (GravKtrl CDP)'" -ForegroundColor Green
    } catch {
        Write-Host ("WARNING: Could not create Desktop shortcut for Antigravity: " + $_.Exception.Message) -ForegroundColor Yellow
    }
}

# 3. Create Desktop Shortcut for GravKtrl Windows Desktop App
try {
    $desktopAppLnk = [System.IO.Path]::Combine($desktop, 'GravKtrl Windows Control.lnk')
    $batPath = [System.IO.Path]::Combine($repoRoot, 'GravKtrl-Windows.bat')
    
    $lnk = $wsh.CreateShortcut($desktopAppLnk)
    $lnk.TargetPath = $batPath
    $lnk.WorkingDirectory = $repoRoot
    $lnk.Description = "Launch GravKtrl Windows Desktop App & Frameless Control Center"
    if (Test-Path $icoPath) {
        $lnk.IconLocation = "$icoPath,0"
    }
    $lnk.Save()
    Write-Host "✓ [Desktop] Created shortcut: 'GravKtrl Windows Control'" -ForegroundColor Green
} catch {
    Write-Host ("WARNING: Could not create Desktop shortcut for GravKtrl Windows Control: " + $_.Exception.Message) -ForegroundColor Yellow
}

# 4. Create Desktop Shortcut for GravKtrl PC Host Daemon (Terminal Mode)
try {
    $desktopGravLnk = [System.IO.Path]::Combine($desktop, 'GravKtrl PC Host (Console).lnk')
    $startScript = [System.IO.Path]::Combine($repoRoot, 'scripts', 'start-gravktrl-pc.ps1')
    
    $lnk = $wsh.CreateShortcut($desktopGravLnk)
    $lnk.TargetPath = 'powershell.exe'
    $lnk.Arguments = '-ExecutionPolicy Bypass -NoExit -File "' + $startScript + '"'
    $lnk.WorkingDirectory = $repoRoot
    $lnk.Description = "Launch GravKtrl PC Host Daemon with Live Console"
    if (Test-Path $icoPath) {
        $lnk.IconLocation = "$icoPath,0"
    } elseif (Test-Path $antigravityExe) {
        $lnk.IconLocation = "$antigravityExe,0"
    }
    $lnk.Save()
    Write-Host "✓ [Desktop] Created shortcut: 'GravKtrl PC Host (Console)'" -ForegroundColor Green
} catch {
    Write-Host ("WARNING: Could not create Desktop shortcut for GravKtrl Console: " + $_.Exception.Message) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE! Desktop Shortcuts configured with gravktrl.ico:    " -ForegroundColor Green
Write-Host "   1. 'GravKtrl Windows Control' -> Frameless Desktop Control Center  " -ForegroundColor White
Write-Host "   2. 'Google Antigravity (GravKtrl CDP)' -> Antigravity with port 9222" -ForegroundColor White
Write-Host "   3. 'GravKtrl PC Host (Console)' -> Terminal console host           " -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
