$ErrorActionPreference = "Stop"

$cred = ("protocol=https`nhost=github.com" | git credential fill)
$token = ""
foreach ($line in ($cred -split "`n")) {
    if ($line.StartsWith("password=")) { 
        $token = $line.Substring(9).Trim() 
    }
}

if (-not $token) {
    Write-Host "[ERROR] Could not retrieve GitHub token from git credentials." -ForegroundColor Red
    exit 1
}

$env:GH_TOKEN = $token

$apkPath = "GravKtrl-v1.1.0.apk"
$batPath = "GravKtrl-Windows.bat"
$icoPath = "public\gravktrl.ico"
$notesFile = "RELEASE_NOTES_v1.1.0.md"

if (-not (Test-Path $apkPath)) {
    Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" $apkPath
}

Write-Host "Publishing GitHub Release v1.1.0..." -ForegroundColor Cyan
gh release create v1.1.0 $apkPath $batPath $icoPath --title "GravKtrl v1.1.0: Windows Desktop App, Dual-Mode Win32 Bridge and Live Workspace Watcher" --notes-file $notesFile

Write-Host "[SUCCESS] Release v1.1.0 published successfully to GitHub!" -ForegroundColor Green
