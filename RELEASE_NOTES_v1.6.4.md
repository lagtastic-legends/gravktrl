# 🚀 GravKtrl v1.6.4 — Pure In-App Auto-Pairing & Zero Browser Hijack

**GravKtrl v1.6.4** fixes the issue where scanning Antigravity's on-screen QR code forcefully kicked the user out of the app into a default browser / Chrome window to log in to Google!

---

### 🌟 What's New & Fixed in v1.6.4

1. **Pure In-App Flow (Zero Browser Hijack)**:
   - **Previous issue**: In v1.6.2 and v1.6.3, scanning Antigravity's on-screen QR code automatically triggered an immediate external browser launch (`accounts.google.com/AccountChooser?...`), kicking the user out of GravKtrl and forcing them to sign into Google in a web browser.
   - **Fixed in v1.6.4**: Scanning the Antigravity QR code **stays 100% inside GravKtrl**! The app never forcefully throws you into the browser.

2. **Instant In-App PC Pairing & Console Transition**:
   - The phone extracts the 128-bit Antigravity `instanceId` from the screen QR code and fires a background parallel LAN radar sweep (`POST /api/pair-antigravity`).
   - As soon as the PC daemon authenticates the session, GravKtrl turns green (`ONLINE`) and automatically transitions directly to the **Agent Console**!
   - You can immediately use the **Terminal REPL**, **Remote Screen Mirror**, and **Agent Console** right inside the app without logging into anything.

3. **Optional Manual Companion Launch**:
   - If you ever *do* want to view Google Cloud's web companion interface, a glowing `[🌐 Open Companion in Chrome]` button is available inside the Companion tab. Auto-open is permanently disabled by default.

---

### 📦 Release Assets
- **`GravKtrl-v1.6.4.apk`**: Production Android APK (`versionCode 16`, 39.9 MB) with pure in-app pairing.
- **`GravKtrl-Windows.bat`**: 1-Click native Windows PC daemon launcher and frameless desktop control center.
- **`gravktrl.ico`**: High-resolution application icon.
