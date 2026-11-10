### GravKtrl v1.5.0 Release (versionCode 11)

#### 🚀 What's New: Native Antigravity Remote Control ("Work with local agents from another device")

- **Official Antigravity Remote Control Bridge**: Direct Connect-RPC and Jetbox state synchronization with the active Antigravity Language Server on `:11011` discovered automatically from `~/.gemini/antigravity/daemon/hub_*.json`.
- **Obsidian Windows Desktop UI Integration**: Added the exact native Antigravity Remote Control card to `/desktop` with live toggle switch, hostname configuration, and 1-click cloud companion URL launcher.
- **Mobile Client Controls**: Added native Remote Control card in `HostPairingView` and active companion status indicator pill in `AgentConsoleView`, allowing users to toggle agent remote control from their phone anytime.
- **Zero-Friction Companion Cloud Launcher**: Automatic authentication URL generation with Google Account chooser redirect (`https://antigravity.google.com/r/<instanceId>`) and 1-tap QR code sharing.
- **Bi-directional WebSocket Notifications**: Real-time state synchronization across PC daemon, desktop window, and mobile devices via `antigravity.remoteControlChanged`.
- **E2E Automated Verification**: Comprehensive 11-step automated verification suite (`test-gravktrl-windows.ts`) testing RPC, WebSocket, HTTP endpoints, screen mirroring, REPL, and remote control toggling.
- **Android APK Included**: Ready to install on Android devices (`GravKtrl-v1.5.0.apk`).
