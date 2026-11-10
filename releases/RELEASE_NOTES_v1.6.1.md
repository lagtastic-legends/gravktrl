### GravKtrl v1.6.1 Release (versionCode 13)

#### 🚀 What's New: Zero-Friction Auto-Connect on Scan & Dedicated Antigravity Companion Tab

- **Instant Auto-Connect on Scan**:
  - Scanning an **Antigravity Remote Control QR Code** from your PC screen now **instantly saves the session and auto-navigates straight into the full-screen Companion Deck view** with zero intermediate prompts or button clicks!
  - Scanning a **GravKtrl PC Pairing QR Code** (`gravktrl://pair?...`) now **instantly establishes 256-bit secure WebSocket communication and auto-navigates directly into the Agent Console**!
  - Added an **Instant Auto-Connect** toggle (`ON (Instant Link)` / `OFF (Manual)`) in the camera viewfinder so users can choose between instant switching or link review.

- **First-Class "Companion" Tab in Bottom Dock**:
  - Added a dedicated **Companion** tab pill in the main navigation dock with a glowing live beacon indicator whenever an Antigravity companion session is active.
  - Interactive full-screen embedded viewport (`CompanionDeckView.tsx`) with WebRTC/WebSocket support, camera, mic, and clipboard access to work directly with local PC agents from your phone.
  - Header controls with 1-tap **Reload / Refresh**, **Open in External Google Chrome** (with Google Account Chooser URL), **Instance ID copy**, and **Session Disconnect**.

- **Persistent Session Memory & Multi-Rig History**:
  - GravKtrl now automatically remembers your active Antigravity companion session across app restarts.
  - Multi-rig history allows switching between previously scanned computers (e.g. Work Rig vs. Home Laptop) with 1 tap without rescanning.

- **Universal Auto-Routing**:
  - Scanning from `HostPairingView`, `OnboardingConnectModal`, or `AgentConsoleView` seamlessly auto-routes to the active session.

- **Android APK Included**:
  - `GravKtrl-v1.6.1.apk` (22.8 MB) ready to install on Android devices.
