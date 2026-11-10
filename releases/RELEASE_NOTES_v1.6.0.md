### GravKtrl v1.6.0 Release (versionCode 12)

#### 🚀 What's New: Live Camera QR Scanner & Antigravity Remote Companion Deck

- **Antigravity Screen QR Code Scanner**:
  - Point your mobile device's camera directly at your PC monitor on the **Antigravity Settings > Application > Remote Control** screen to scan the official Antigravity QR code (`https://antigravity.google.com/r/<instanceId>`).
  - Powered by dual decoding engines: hardware-accelerated W3C `BarcodeDetector` (modern Android / Chrome) with instant pure JavaScript `jsQR` frame fallback for zero-latency 60fps scanning.
  - Cyberpunk viewfinder with animated laser scanline, neon corner reticle, haptic feedback, and audio chime upon lock-on.

- **Ergonomic Viewfinder Controls**:
  - **Flashlight / Torch toggle**: illuminates PC monitors or low-light office environments via `MediaStreamTrack.applyConstraints`.
  - **Front / Back Camera switch**: toggle effortlessly between camera sensors.
  - **Gallery / Photo Scanner**: upload a screenshot or photo of any QR code to parse instantly from device storage.
  - **Clipboard Auto-Reader**: 1-tap paste of Antigravity or pairing URLs from clipboard.

- **Antigravity Cloud Companion Deck**:
  - Full-featured mobile deck launched automatically when an Antigravity Remote Control session is detected.
  - **Integrated Web Deck**: interact with your local agent in a full-screen mobile-optimized web deck directly inside GravKtrl.
  - **Google Account Chooser Launcher**: 1-tap redirect to native Chrome with authenticated Google session handling (`https://accounts.google.com/AccountChooser?continue=...`).
  - **Local Host Sync**: links the remote companion instance directly with the local GravKtrl PC Daemon.

- **Zero-Typing Host Auto-Pairing**:
  - Also scans GravKtrl PC Daemon QR codes (`gravktrl://pair?...`) displayed on the PC terminal or Windows Desktop app (`/desktop`), instantly establishing 256-bit secure pairing without entering IP addresses, ports, or PINs.

- **Android Permissions & Hardware Hardening**:
  - Added `<uses-permission android:name="android.permission.CAMERA" />` with optional camera hardware feature fallbacks in `AndroidManifest.xml`.
  - Full automated 12-step verification test suite (`test-gravktrl-windows.ts`) with 100% passing results.

- **Downloadable APK**:
  - `GravKtrl-v1.6.0.apk` included and ready to install on Android devices.
