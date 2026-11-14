export interface DesktopUiParams {
  hostname: string;
  port: number;
  lanIp: string;
  tailscaleIp?: string;
  pin: string;
  masterToken: string;
  activeWorkspace: string;
  workspaces: Array<{ path: string; name: string }>;
  cdpActive: boolean;
  version: string;
  qrCodeSvg?: string;
  remoteControl?: {
    available: boolean;
    enabled: boolean;
    instanceId: string;
    url: string;
    hostname: string;
  };
}

export function renderDesktopHtml(params: DesktopUiParams): string {
  const pinDisplay = params.pin.length === 6 
    ? `${params.pin.slice(0, 3)} - ${params.pin.slice(3)}` 
    : params.pin;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GravKtrl Desktop Control Center</title>
  <style>
    :root {
      --bg: #030712;
      --card-bg: #0b1120;
      --border: #1e293b;
      --accent-purple: #9333ea;
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
    }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      padding-bottom: 24px;
    }
    header {
      background: rgba(11, 17, 32, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      width: 28px;
      height: 28px;
    }
    .brand h1 {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #a855f7, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.12);
      color: var(--accent-emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }
    main {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 500px;
      margin: 0 auto;
      width: 100%;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      position: relative;
    }
    .card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pin-box {
      background: #000000;
      border: 1px solid rgba(147, 51, 234, 0.4);
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .pin-box:hover {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.2);
    }
    .pin-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 0.15em;
      color: #38bdf8;
      text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    }
    .pin-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
    }
    .stat-val {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      font-family: ui-monospace, monospace;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mode-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .mode-cdp {
      background: rgba(6, 182, 212, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .mode-win32 {
      background: rgba(147, 51, 234, 0.15);
      color: #c084fc;
      border: 1px solid rgba(147, 51, 234, 0.3);
    }
    .workspace-path {
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #cbd5e1;
      background: #020617;
      border: 1px solid #1e293b;
      padding: 8px 10px;
      border-radius: 6px;
      word-break: break-all;
      margin-top: 4px;
    }
    .btn-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #9333ea, #db2777);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(147, 51, 234, 0.3);
    }
    .btn-primary:hover {
      box-shadow: 0 4px 16px rgba(147, 51, 234, 0.5);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #1e293b;
      color: #f1f5f9;
      border: 1px solid #334155;
    }
    .btn-secondary:hover {
      background: #334155;
    }
    .feed {
      max-height: 160px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .feed-item {
      font-size: 11px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #030712;
      border-left: 3px solid var(--accent-cyan);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .feed-item.created { border-left-color: var(--accent-emerald); }
    .feed-item.deleted { border-left-color: #ef4444; }

    /* Remote Control Card & Toggle */
    .rc-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
    }
    .rc-toggle-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
    }
    .rc-toggle-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155;
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 24px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: #ffffff;
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }
    input:checked + .slider {
      background: linear-gradient(135deg, #10b981, #06b6d4);
    }
    input:checked + .slider:before {
      transform: translateX(20px);
    }
    .rc-input {
      width: 100%;
      background: #030712;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      color: var(--text-main);
      font-size: 12px;
      font-family: inherit;
      outline: none;
      box-sizing: border-box;
      margin-top: 4px;
    }
    .rc-input:focus {
      border-color: var(--accent-purple);
    }
    .rc-url-box {
      display: flex;
      align-items: center;
      background: #030712;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 6px 4px 10px;
      gap: 8px;
      margin-top: 4px;
    }
    .rc-url-text {
      flex: 1;
      font-size: 11px;
      font-family: monospace;
      color: var(--accent-cyan);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-copy {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-copy:hover {
      background: #334155;
    }
    .feed-path {
      font-family: ui-monospace, monospace;
      color: #e2e8f0;
      max-width: 80%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .feed-time {
      color: #64748b;
      font-size: 10px;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 100;
    }
    .toast.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg class="brand-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" fill="#030712" stroke="#9333ea" stroke-width="4"/>
        <circle cx="50" cy="50" r="32" stroke="url(#logo_grad)" stroke-width="4" stroke-dasharray="160 30" transform="rotate(-30 50 50)"/>
        <path d="M50 24L38 42H46V70H54V42H62L50 24Z" fill="url(#logo_grad)"/>
        <path d="M28 42L22 50L28 58" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M72 42L78 50L72 58" stroke="#06b6d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <defs>
          <linearGradient id="logo_grad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stop-color="#9333ea"/>
            <stop offset="0.5" stop-color="#db2777"/>
            <stop offset="1" stop-color="#06b6d4"/>
          </linearGradient>
        </defs>
      </svg>
      <div>
        <h1>GravKtrl Windows</h1>
        <div style="font-size: 10px; color: var(--text-muted); font-family: monospace;">v${params.version} &bull; ${params.hostname}</div>
      </div>
    </div>
    <div class="badge-live">
      <span class="pulse-dot"></span>
      <span>ONLINE</span>
    </div>
  </header>

  <main>
    <!-- INSTANT SMARTPHONE PAIRING & QR CODE -->
    <div class="card">
      <div class="card-title">
        <span>Instant Smartphone Pairing</span>
        <span style="font-size: 10px; color: var(--accent-cyan); font-weight: 500;">Zero Typing Radar</span>
      </div>
      <div style="display: flex; gap: 12px; align-items: center;">
        ${params.qrCodeSvg ? `
        <div style="background: #000; border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 10px; padding: 6px; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Scan with GravKtrl phone camera">
          <div style="width: 96px; height: 96px; display: flex; align-items: center; justify-content: center;">
            ${params.qrCodeSvg}
          </div>
        </div>
        ` : ""}
        <div class="pin-box" id="pinBox" style="flex: 1; padding: 12px;" title="Click to copy pairing credentials">
          <div class="pin-code" style="font-size: 24px;">${pinDisplay}</div>
          <div class="pin-hint">6-Digit Quick PIN or Scan QR with Phone Camera</div>
        </div>
      </div>
      <div style="margin-top: 8px; font-size: 10px; color: #94a3b8; line-height: 1.4;">
        💡 <strong>Antigravity Screen Scan:</strong> You can also scan Antigravity's on-screen QR code (Settings &gt; Remote Control) to auto-pair!
      </div>
    </div>

    <!-- ANTIGRAVITY CONTROLLER STATUS -->
    <div class="card">
      <div class="card-title">
        <span>Antigravity Controller</span>
        <span id="modeBadge" class="mode-pill ${params.cdpActive ? "mode-cdp" : "mode-win32"}">
          ${params.cdpActive ? "CDP PORT 9222 ACTIVE" : "WIN32 NATIVE PROCESS"}
        </span>
      </div>
      <div class="grid-2" style="margin-top: 6px;">
        <div>
          <div class="stat-label">Wi-Fi LAN IP</div>
          <div class="stat-val">${params.lanIp}:${params.port}</div>
        </div>
        <div>
          <div class="stat-label">Tailscale VPN</div>
          <div class="stat-val">${params.tailscaleIp ? `${params.tailscaleIp}:${params.port}` : "Not active"}</div>
        </div>
      </div>
    </div>

    <!-- NATIVE ANTIGRAVITY REMOTE CONTROL (WORK WITH LOCAL AGENTS FROM ANOTHER DEVICE) -->
    <div class="card" id="remoteControlCard">
      <div class="card-title">
        <span>Remote Control</span>
        <span id="rcBadge" class="mode-pill ${params.remoteControl?.enabled ? "mode-cdp" : "mode-win32"}">
          ${params.remoteControl?.enabled ? "ACTIVE" : "DISABLED"}
        </span>
      </div>
      <div class="rc-toggle-row">
        <div>
          <div class="rc-toggle-label">Enable Remote Control</div>
          <div class="rc-toggle-desc">Work with local agents from another device.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="rcToggle" ${params.remoteControl?.enabled ? "checked" : ""} onchange="onToggleRemoteControl(this.checked)">
          <span class="slider"></span>
        </label>
      </div>

      <div id="rcDetails" style="${params.remoteControl?.enabled ? "" : "display: none;"} margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px;">
        <div style="margin-bottom: 8px;">
          <div class="stat-label">Device Name</div>
          <input type="text" id="rcHostnameInput" class="rc-input" value="${params.remoteControl?.hostname || params.hostname}" placeholder="Enter device name..." onblur="onUpdateHostname(this.value)">
        </div>
        <div style="margin-top: 8px;">
          <div class="stat-label">Antigravity Cloud Companion Link</div>
          <div class="rc-url-box">
            <span class="rc-url-text" id="rcUrlText">${params.remoteControl?.url || (params.remoteControl?.instanceId ? "https://antigravity.google.com/r/" + encodeURIComponent(params.remoteControl.instanceId) : "https://antigravity.google.com/r/")}</span>
            <button class="btn-copy" onclick="copyRcLink()" title="Copy Companion Link">Copy</button>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <a href="/api/antigravity/remote-control/open" target="_blank" class="btn btn-primary" style="flex: 1; padding: 6px 12px; font-size: 11px;">
              🌐 Open Companion in Browser
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- ACTIVE WORKSPACE -->
    <div class="card">
      <div class="card-title">
        <span>Active Workspace Directory</span>
        <span style="font-size: 10px; color: var(--accent-emerald);">Live Watcher Active</span>
      </div>
      <div class="workspace-path" id="activeWsPath">${params.activeWorkspace}</div>
    </div>

    <!-- LIVE FILE ACTIVITY STREAM -->
    <div class="card">
      <div class="card-title">
        <span>Live Workspace Activity</span>
        <span id="fileCount" style="font-size: 10px; color: var(--text-muted);">Listening...</span>
      </div>
      <div class="feed" id="fileFeed">
        <div style="font-size: 11px; color: #64748b; text-align: center; padding: 12px;">Waiting for Antigravity file edits...</div>
      </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div class="btn-row">
      <button class="btn btn-primary" id="btnLaunchCdp">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Launch Antigravity with CDP Port 9222
      </button>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <a class="btn btn-secondary" href="/" target="_blank">
          Open Web Commander
        </a>
        <a class="btn btn-secondary" href="/download-apk">
          Download Android APK
        </a>
      </div>
    </div>
  </main>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    const MASTER_TOKEN = "${params.masterToken}";
    const PIN = "${params.pin}";
    const PORT = ${params.port};

    function showToast(msg) {
      const t = document.getElementById("toast");
      t.innerText = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2000);
    }

    // PIN Copy
    document.getElementById("pinBox").addEventListener("click", () => {
      navigator.clipboard.writeText(PIN).then(() => {
        showToast("PIN " + PIN + " copied!");
      });
    });

    // Launch Antigravity button
    document.getElementById("btnLaunchCdp").addEventListener("click", async () => {
      try {
        const res = await fetch("/api/launch-antigravity", { method: "POST" });
        const data = await res.json();
        showToast(data.message || "Launched Antigravity!");
      } catch (e) {
        showToast("Launch requested");
      }
    });

    // WebSocket live stream
    let ws;
    function connectWs() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = protocol + "//" + location.host + "/?token=" + encodeURIComponent(MASTER_TOKEN);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[GravKtrl Desktop] Connected to live daemon feed");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === "agent.fileModified") {
            appendFileEvent(msg.params);
          } else if (msg.method === "agent.streamChunk") {
            console.log("[Agent Stream]", msg.params);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setTimeout(connectWs, 2000);
      };
    }

    const feed = document.getElementById("fileFeed");
    let hasEvents = false;

    function appendFileEvent(ev) {
      if (!hasEvents) {
        feed.innerHTML = "";
        hasEvents = true;
      }
      const item = document.createElement("div");
      item.className = "feed-item " + (ev.action || "modified");
      const timeStr = new Date(ev.timestamp || Date.now()).toLocaleTimeString();
      item.innerHTML = \`<span class="feed-path">[\${ev.action.toUpperCase()}] \${ev.file}</span><span class="feed-time">\${timeStr}</span>\`;
      feed.insertBefore(item, feed.firstChild);
      if (feed.children.length > 30) {
        feed.removeChild(feed.lastChild);
      }
    }

    // Remote Control management
    async function onToggleRemoteControl(enabled) {
      const badge = document.getElementById("rcBadge");
      const details = document.getElementById("rcDetails");
      const hostname = document.getElementById("rcHostnameInput")?.value;
      badge.innerText = "UPDATING...";
      try {
        const res = await fetch("/api/antigravity/remote-control/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, hostname })
        });
        const data = await res.json();
        if (data.enabled) {
          badge.className = "mode-pill mode-cdp";
          badge.innerText = "ACTIVE";
          if (details) details.style.display = "block";
          if (data.url) {
            const urlText = document.getElementById("rcUrlText");
            if (urlText) urlText.innerText = data.url;
          }
          showToast("Remote Control enabled! Local agents accessible from companion.");
        } else {
          badge.className = "mode-pill mode-win32";
          badge.innerText = "DISABLED";
          if (details) details.style.display = "none";
          showToast("Remote Control disabled.");
        }
      } catch (err) {
        showToast("Failed to toggle Remote Control");
      }
    }

    async function onUpdateHostname(hostname) {
      try {
        await fetch("/api/antigravity/remote-control/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true, hostname })
        });
        showToast("Device name updated!");
      } catch {}
    }

    function copyRcLink() {
      const url = document.getElementById("rcUrlText")?.innerText || "";
      if (url) {
        navigator.clipboard.writeText(url).then(() => showToast("Companion Link copied!"));
      }
    }

    connectWs();
  </script>
</body>
</html>
`;
}
