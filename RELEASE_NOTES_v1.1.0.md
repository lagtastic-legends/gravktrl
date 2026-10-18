# 🚀 GravKtrl v1.1.0 — Windows Desktop App, Dual-Mode Win32 Bridge & Live Workspace Watcher

GravKtrl v1.1.0 introduces full standalone Windows Desktop app capabilities, seamless dual-mode control for normally running `Antigravity.exe` (via Win32 keystrokes & window focus) + high-performance Chrome DevTools Protocol (CDP port 9222), and real-time workspace file change streaming to mobile!

---

### ✨ What's New in v1.1.0

1. **Dual-Mode Windows Antigravity Controller:**
   - **Win32 Native Mode:** Automatically detects normally opened `Antigravity.exe` windows on Windows (without needing any command-line flags). Injects prompts using Win32 API (`ShowWindow`, `SetForegroundWindow`, clipboard paste & `{ENTER}` keystroke simulation).
   - **CDP Port 9222 Mode:** Automatically detects when CDP is active for high-speed DOM injection and live thought streaming.
   - **Zero Configuration:** If Antigravity is not running at all, GravKtrl can cold-start it with `--remote-debugging-port=9222` automatically!

2. **Standalone Windows Desktop Control Center (`GET /desktop`):**
   - Obsidian cyberpunk control dashboard (`http://localhost:8787/desktop`) running in a native frameless app window (`msedge.exe --app=...` / Chrome).
   - Instant 6-digit PIN display, live process status card, active workspace indicator, and 1-click Antigravity launcher.

3. **Real-Time Workspace Watcher:**
   - Monitors file changes in the active workspace directory in real time, ignoring noisy folders (`node_modules`, `.git`, `.next`, `build`).
   - Streams `agent.fileModified` events directly to the mobile app with file paths, change actions (`created`, `modified`, `deleted`), and timestamps.

4. **1-Click Launchers & Custom Windows Brand Icon:**
   - Double-clickable `GravKtrl-Windows.bat` at repository root.
   - Automated Desktop shortcut creation with custom `gravktrl.ico` icon.
   - Comprehensive test suite in `scripts/test-gravktrl-windows.ts`.

---

### 📦 Included Release Assets
- `GravKtrl-v1.1.0.apk`: Compiled Android application (ARM64 & x86_64) for smartphones and foldables.
- `GravKtrl-Windows.bat`: 1-Click launcher for Windows.
- `gravktrl.ico`: Windows multi-resolution brand icon (16x16 through 256x256).
