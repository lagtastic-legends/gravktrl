# 🚀 GravKtrl v1.7.0 — Multi-Posture Foldable Workspace, Guarded PC Daemon & Security Hardening

**GravKtrl v1.7.0** delivers the rebuilt **Multi-Posture Foldable Workspace** (`slab`, `flip-tabletop`, `fold-expanded`, `dual-screen`), a modular **Node.js TypeScript PC Daemon** with 4-tier LAN/Tailscale pairing and destructive command protection, **persistent Antigravity Remote Control bridging**, and a **Next.js `16.4.6` security upgrade**.

---

### ✨ Highlights in v1.7.0

1. **Multi-Posture Foldable Workspace (`GravShell`):**
   - Dynamically adapts between **Slab** (portrait phone), **Flip Tabletop** (half-folded clamshell split), **Fold Expanded** (2-column unfolded workstation), and **Dual-Screen** (24px center hinge gutter), plus a manual posture switcher in the header.
   - Compositor-first Dark-Mode palette (**Deep Forest Green** `#102C26`, **Champagne** `#F7E7CE`, **Donkey Brown** `#A79277`, **Obsidian** `#090D0C`).

2. **4 Tactical Control Decks & Interactive Trackpad:**
   - **⚡ Tactical Macro Pad:** 12 one-tap workflow actions (`Run Typecheck`, `Build Mobile Bundle`, `ADB Install APK`, `Check ADB Devices`, `Git Status`, `GPU & Temp Check`, media controls, and zero-type pairing).
   - **🤖 Antigravity Remote Control Bridge:** Saves and persists the active Antigravity Remote Control URL across restarts alongside 1-tap prompt dispatch chips for `omni-tool`, `jarvis`, and `gravktrl`.
   - **💻 Guarded PowerShell Terminal:** Streaming WebSocket execution with destructive command interception (`rm -rf`, `Remove-Item -Recurse -Force`, `Format-Volume`, `del /s /q`, `diskpart`, `shutdown /s`, `reg delete`, `bcdedit`).
   - **🖱️ Virtual Trackpad & PC Telemetry:** Live CPU, RAM, and NVIDIA GPU gauges paired with multi-touch gesture cursor movement (`MOVE`), single-tap click, two-finger right-click, and two-finger scroll.

3. **4-Tier Zero-Typing Pairing & PC Daemon Upgrades:**
   - Automatic LAN (`192.168.x.x` / `10.x.x.x`) and Tailscale (`100.x.y.z`) endpoint detection + UDP discovery beacons on port `8788`.
   - Synchronized 6-digit PIN handshake exchanging for 256-bit (64-char hex) session tokens valid across WebSocket and HTTP `/rpc` & `/api/rpc`.
   - Built-in Tier 4 pairing dashboard (`GET /` and `GET /desktop`) showing live connected client count and Antigravity bridge status.
   - Exponential-backoff WebSocket auto-reconnect with live latency indicator (`ms`).

4. **Security & lean Android Packaging:**
   - Upgraded **Next.js `16.4.2 → 16.4.6`** with `experimental.agentUpgrade = "security"`.
   - Removed duplicate leftover binary (`public/gravktrl.apk`) from web assets, dramatically shrinking the compiled Android APK size.

---

### 🧪 Verification Summary
- `npm run typecheck` & `npx tsc -p pc-daemon/tsconfig.json --noEmit`: 0 errors.
- `npx tsx scripts/test-gravktrl-phase1.ts`: 10/10 checks passed.
- `npm run test:e2e` & `npx tsx scripts/test-gravktrl-windows.ts`: full E2E and Windows bridge suites passed.
- `npm run build:mobile` + Gradle debug APK build synced and compiled cleanly.

---

### 📦 Release Assets
- **`GravKtrl-v1.7.0.apk`**: Android APK (`com.gravktrl.app`, `versionCode 17`, `versionName 1.7.0`, `5.76 MB`).
- **`GravKtrl-Windows.bat`**: One-click Windows PC daemon launcher.
- **`gravktrl.ico`**: High-resolution Windows icon asset.
