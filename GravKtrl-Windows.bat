@echo off
title GravKtrl Windows Launcher
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-windows-app.ps1"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Launcher exited with code %ERRORLEVEL%
    pause
)
