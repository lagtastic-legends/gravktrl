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

$apkPath = "releases\GravKtrl-v1.6.4.apk"
$batPath = "GravKtrl-Windows.bat"
$icoPath = "public\gravktrl.ico"
$notesFile = "RELEASE_NOTES_v1.6.4.md"

if (-not (Test-Path $apkPath)) {
    Write-Host "[ERROR] APK not found at $apkPath" -ForegroundColor Red
    exit 1
}

Write-Host "Publishing GitHub Release v1.6.4..." -ForegroundColor Cyan
gh release create v1.6.4 $apkPath $batPath $icoPath --title "GravKtrl v1.6.4: Pure In-App Auto-Pairing (Zero Browser Hijack)" --notes-file $notesFile

Write-Host "[SUCCESS] Release v1.6.4 published successfully to GitHub!" -ForegroundColor Green
