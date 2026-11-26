# Changelog

All notable changes to **GravKtrl** (`com.gravktrl.app`) are documented in this file.

## [1.7.0] - 2026-11-26

### Added
- **Standalone Multi-Posture Shell (`src/components/shell/grav-shell.tsx`):** Rebuilt dark-mode-first adaptive workspace supporting `slab`, `flip-tabletop`, `fold-expanded`, and `dual-screen` (24px center hinge gutter) hardware postures with manual switcher controls in the top header.
- **4 Tactical Control Decks:**
  - **Tactical Macro Pad:** 12 one-tap developer macros including `Run Typecheck`, `Build Mobile Bundle` (`npm run build:mobile`), `ADB Install APK`, `Check ADB Devices`, `Git Status`, `GPU & Temp Check`, media controls, and device pairing.
  - **Antigravity Remote Control Bridge:** Persistent Remote Control session URL configuration (`.gravktrl-remote.json`) and 1-tap prompt dispatch templates for `omni-tool`, `jarvis`, and `gravktrl`.
  - **Guarded PowerShell Terminal:** Real-time WebSocket streaming terminal with `executionId` deduplication and visual security guard alerts.
  - **Virtual Trackpad & PC Telemetry:** Live CPU load, RAM usage, and NVIDIA GPU temperature/VRAM gauges paired with multi-touch trackpad gesture controls (`move`, `click`, `right_click`, `scroll`) routed to the PC daemon (`screen.input` / `MOVE`).
- **4-Tier Zero-Typing Pairing & PC Daemon Modularization (`pc-daemon/`):**
  - **Destructive Command Guard (`pc-daemon/src/command-guard.ts`):** Blocks `rm -rf`, `Remove-Item -Recurse -Force`, `Format-Volume`, `del /s /q`, `diskpart`, `shutdown /s`, `reg delete`, and `bcdedit` while allowing safe dev/Android workflows.
  - **LAN & Tailscale Discovery (`pc-daemon/src/discovery.ts`):** IPv4 interface detection (`192.168.x.x`, `10.x.x.x`, Tailscale `100.x.y.z`), 3-second UDP discovery beacon on port `8788`, and `GET /api/discover`.
  - **6-Digit PIN & 256-Bit Token Auth (`pc-daemon/src/auth-pairing.ts`):** Rate-limited PIN handshake on `POST /api/pair` and `POST /api/pair-pin` issuing 64-char hex session tokens accepted across WebSocket and HTTP RPC (`/rpc`, `/api/rpc`).
  - **Tier 4 Built-In Pairing Dashboard (`pc-daemon/src/desktop-ui.ts`):** Served on `GET /` and `GET /desktop`, displaying active PIN, QR code, LAN/Tailscale endpoints, connected clients counter, and persistent Antigravity Remote Control bridge URL.
- **Brand Identity:** Isometric gravity-well vector emblem (`public/gravktrl_logo.svg` & `src/components/ui/gravktrl-logo.tsx`) in Deep Forest Green (`#102C26`), Champagne (`#F7E7CE`), Donkey Brown (`#A79277`), and Obsidian (`#090D0C`).
- **Automated Phase 1–4 Verification (`scripts/test-gravktrl-phase1.ts`):** Self-terminating suite validating command guard rules, ephemeral port boot, HTTP discovery/dashboard, PIN rejection/exchange, HTTP/WebSocket RPC, Antigravity remote persistence, `terminal.exec`, and `macro.run`.

### Changed
- **WebSocket Resilience & Zustand Store (`src/store/use-grav-store.ts`):** Added exponential-backoff auto-reconnect, live `system.ping` latency pill (`ms`), and LAN vs. Tailscale endpoint routing in [zero-type-pairing-modal.tsx](src/components/pairing/zero-type-pairing-modal.tsx).
- **Dark-Mode-First & Compositor Performance:** Enforced dark `<input>` styles (`!bg-[#090D0C] !text-[#F7E7CE]`, `color-scheme: dark`) and removed animated blur filters for smooth 60/120fps rendering.
- **Build & Tooling:** Added `"build:mobile": "next build && npx cap sync android"` script and removed an accidental duplicate APK file (`public/gravktrl.apk`) from static web assets.

### Security
- **Next.js Upgrade:** Upgraded `next` from `16.4.2` to `16.4.6` to remediate published security advisories and configured `experimental.agentUpgrade = "security"` in `next.config.ts`.

## [1.6.4] - 2026-11-14
- Eliminated forced external browser launch when scanning Antigravity screen QR codes (`0` browser hijack); implemented pure in-app pairing transition.

## [1.6.3] - 2026-11-14
- Added dual PC & companion auto-connect on Antigravity QR scan with cryptographic line-of-sight instance pairing (`POST /api/pair-antigravity`) and parallel LAN probing.

## [1.6.2] - 2026-11-10
- Switched Antigravity Remote Companion launcher to native Android Chrome Custom Tabs and fixed `jsQR` decoding.

## [1.6.1] - 2026-11-10
- Added zero-friction auto-connect on scan and dedicated Antigravity Companion tab.

## [1.6.0] - 2026-11-10
- Added Live Camera QR Scanner (`jsqr`) and Antigravity Remote Companion Deck.

## [1.5.0] - 2026-11-10
- Added native Antigravity Remote Control Connect-RPC integration.

## [1.4.0] - 2026-11-10
- Added full interactive Terminal REPL (`xterm.js` PTY streaming) and mobile touch accessory controls.

## [1.3.0] - 2026-10-26
- Added Remote PC Screen and Antigravity window MJPEG live mirroring with touch/click injection.

## [1.2.3] - 2026-10-20
- Added Antigravity model selector, usage quota HUD, and live conversation drawer syncing.

## [1.2.0] - 2026-10-19
- Adapted Silk Neomorphic UI styling, custom app icons, and splash screens across Android mipmap densities.

## [1.1.0] - 2026-10-18
- Introduced Windows Desktop Control Center, Dual-Mode Win32 Antigravity Bridge, and real-time `WorkspaceWatcher`.

## [1.0.0] - 2026-10-17
- Initial GravKtrl mobile-to-PC Remote Agent Commander & Terminal Bridge architecture.
