# 🚀 GravKtrl v1.6.3 — Dual PC & Companion Auto-Connect on Antigravity QR Scan

**GravKtrl v1.6.3** brings full zero-typing **Dual Auto-Connect** when scanning Google Antigravity's on-screen QR code (`Settings > Application > Remote Control`), linking your smartphone simultaneously to **both** Google Cloud's agent companion and your **local PC host daemon** (`0.0.0.0:8787`) over Wi-Fi!

---

### 🌟 What's New & Fixed in v1.6.3

1. **Dual PC & Companion Auto-Connect on Scan**:
   - **Previous issue**: In v1.6.2, scanning Antigravity's on-screen QR code only opened Chrome Custom Tabs to Google's cloud companion, leaving GravKtrl itself `OFFLINE` with no PC host connection.
   - **In v1.6.3**: Scanning the QR code simultaneously launches the Google Cloud Companion in Chrome Custom Tabs **AND** executes an ultra-fast parallel LAN radar sweep (`client.pairWithAntigravityInstance(instanceId)`) to automatically pair with your PC host daemon!
   - As soon as the scan completes, GravKtrl switches to `ONLINE: <Hostname> (<LAN-IP>:8787)` with full access to the **Interactive Terminal REPL**, **Remote Screen Mirror**, **Agent Console**, and **Git Workspaces**!

2. **Cryptographic Line-of-Sight Pairing (`POST /api/pair-antigravity`)**:
   - The PC Daemon introduces `POST /api/pair-antigravity` which communicates directly with the local Antigravity Language Server via Connect-RPC.
   - The daemon verifies that the scanned 128-bit `instanceId` matches the active Antigravity session on the PC.
   - Physical visibility of the on-screen QR code provides cryptographically sound line-of-sight authentication, immediately returning the 256-bit `masterToken` without typing a 6-digit PIN!

3. **Ultra-Fast Parallel LAN Radar Probing (~114ms)**:
   - High-speed parallel sweep probes candidate IP endpoints and local subnets:
     - `192.168.1.x`, `192.168.0.x`, `192.168.2.x` (standard home routers)
     - `192.168.43.x` (Android Wi-Fi Hotspot)
     - `172.20.10.x` (iOS Wi-Fi Hotspot)
     - `10.0.0.x` (corporate / custom subnets)
   - Uses `Promise.any()` with 1.2s abort timeouts for near-instant detection (benchmarked at **114ms** on target LAN).

4. **Dual-Mode Bridge HUD in Companion Deck (`CompanionDeckView.tsx`)**:
   - **PC Connected**: Shows `● PC HOST BRIDGE ONLINE (<LAN-IP>:8787)` with direct 1-tap shortcuts to **Terminal**, **Mirror**, and **Agent Console**.
   - **PC Disconnected**: Shows an amber card with an instant `[⚡ Auto-Connect to PC (Radar Sweep)]` button and clear instructions if the PC daemon isn't running.

5. **Crisp Desktop Control Center SVG QR Code (`desktop-ui.ts`)**:
   - The PC Frameless Control Center (`http://localhost:8787/desktop`) now displays a live pairing SVG QR code right beside the 6-digit PIN.
   - Users can scan either the Antigravity settings QR code OR the GravKtrl desktop QR code.

6. **Windows Daemon Auto-Start Resilience**:
   - Added automatic Windows Startup shortcut creation (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`), ensuring the daemon automatically launches in the background whenever Windows boots.

---

### 📦 Release Assets
- **`GravKtrl-v1.6.3.apk`**: Production Android APK (`versionCode 15`, 34.2 MB) with dual Antigravity & PC auto-pairing.
- **`GravKtrl-Windows.bat`**: 1-Click native Windows PC daemon launcher and frameless desktop control center.
- **`gravktrl.ico`**: High-resolution application icon.
