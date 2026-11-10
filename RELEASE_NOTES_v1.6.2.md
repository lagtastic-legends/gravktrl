# 🚀 GravKtrl v1.6.2 — Zero-Block Antigravity Remote Companion (Native Chrome Tabs & QR Engine)

GravKtrl v1.6.2 resolves the Android connection and embedding issues when pairing with Google Antigravity Remote Control (`Settings > Application > Remote Control`), introducing native **Android Chrome Custom Tabs** and an enhanced **Google AccountChooser QR & Link Decoder**!

---

### 🌟 What's New & Fixed in v1.6.2

1. **Native Chrome Custom Tabs (Bypasses `X-Frame-Options: SAMEORIGIN`)**:
   - `antigravity.google.com` strictly blocks third-party iframe embedding via `X-Frame-Options: SAMEORIGIN` and CSP headers.
   - Replaced the embedded WebView `<iframe>` with official native Android **Chrome Custom Tabs** powered by `@capacitor/browser@7.0.5`.
   - Opens the Antigravity Cloud Companion natively with full Google Account sign-in cookies, passkeys, and real-time WebRTC audio/video agent streaming.
   - Tapping the top-left 'X' seamlessly returns straight to the GravKtrl Command Center!

2. **Full Google AccountChooser QR & URL Decoding**:
   - Fixed QR scanner regex to correctly match Antigravity URLs formatted as:
     `https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fantigravity.google.com%2Fr%2F<instanceId>`
   - Handles percent-encoded slashes (`%2Fr%2F`), standard paths (`/r/<id>`), and raw UUID instance IDs.
   - Preserves Google account query parameters (`Email=...`) for instant 1-tap identity selection.

3. **Instant Auto-Connect & Multi-Path Fallbacks**:
   - Point your camera at Antigravity's **Settings > Application > Remote Control** QR code for instant auto-navigation and immediate Chrome tab launch.
   - Added **Paste Copied Link from PC** (`navigator.clipboard.readText()`) and direct manual entry for instant connection even under extreme monitor glare.

4. **Obsidian Cyberpunk Companion Command Center**:
   - Replaced blank error screens with a futuristic Companion Control Center.
   - Displays live telemetry: Instance ID with 1-tap copy, Cloud Endpoint, Google Auth handshake status, and cross-deck shortcuts to Agent Console, Screen Mirror, and Terminal REPL.
   - "Auto-open upon scan" preference saved directly in localStorage.

5. **PC Daemon Auto-Sync & PowerShell 5.1 Fix**:
   - Fixed `launch-windows-app.ps1` syntax for Windows PowerShell 5.1 compatibility.
   - PC daemon detects active Antigravity Language Server on ports `11010/11011` and auto-provisions the companion link over LAN!

---

### 📦 Download Assets
- **`GravKtrl-v1.6.2.apk`**: Production Android APK with native Chrome Custom Tabs and Antigravity Remote Companion support.
- **`GravKtrl-Windows.bat`**: 1-Click native Windows PC daemon launcher and frameless desktop control center.
