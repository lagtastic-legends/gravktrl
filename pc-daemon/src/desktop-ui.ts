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
  connectedClients?: number;
  antigravityRemoteUrl?: string;
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

  const connectedClients = params.connectedClients ?? 0;
  const activeRemoteUrl =
    params.antigravityRemoteUrl ||
    params.remoteControl?.url ||
    (params.remoteControl?.instanceId
      ? `https://antigravity.google.com/r/${encodeURIComponent(params.remoteControl.instanceId)}`
      : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GravKtrl Windows — PC Daemon & Pairing Dashboard</title>
  <style>
    :root {
      --bg: #090D0C;
      --surface: #0F1614;
      --card-bg: #141C1A;
      --border: #202E2A;
      --accent-forest: #102C26;
      --accent-forest-light: #184239;
      --accent-champagne: #F7E7CE;
      --accent-donkey: #A79277;
      --accent-emerald: #34D399;
      --text: #F7E7CE;
      --text-muted: #A79277;
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
      color-scheme: dark;
    }
    header {
      background: #0F1614;
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
      width: 32px;
      height: 32px;
    }
    .brand h1 {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--accent-champagne);
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(16, 44, 38, 0.9);
      color: var(--accent-emerald);
      border: 1px solid rgba(52, 211, 153, 0.35);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
    }
    main {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 560px;
      margin: 0 auto;
      width: 100%;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      position: relative;
    }
    .card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pin-box {
      background: #090D0C;
      border: 1px solid rgba(167, 146, 119, 0.35);
      border-radius: 10px;
      padding: 14px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s ease-out;
    }
    .pin-box:hover {
      border-color: var(--accent-champagne);
    }
    .pin-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 0.14em;
      color: var(--accent-champagne);
    }
    .pin-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
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
      font-size: 12px;
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
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--accent-forest);
      color: var(--accent-champagne);
      border: 1px solid rgba(167, 146, 119, 0.3);
    }
    .workspace-path {
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: var(--accent-champagne);
      background: #090D0C;
      border: 1px solid var(--border);
      padding: 8px 10px;
      border-radius: 8px;
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
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(167, 146, 119, 0.3);
      transition: transform 0.15s ease-out, opacity 0.15s ease-out;
      text-decoration: none;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background: var(--accent-champagne);
      color: #090D0C;
      border-color: var(--accent-champagne);
    }
    .btn-primary:hover {
      opacity: 0.92;
    }
    .btn-secondary {
      background: var(--accent-forest);
      color: var(--accent-champagne);
    }
    .btn-secondary:hover {
      background: var(--accent-forest-light);
    }
    .feed {
      max-height: 150px;
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
      background: #090D0C;
      border-left: 3px solid var(--accent-donkey);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .feed-item.created { border-left-color: var(--accent-emerald); }
    .feed-item.deleted { border-left-color: #f87171; }
    .rc-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 4px;
    }
    .rc-toggle-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
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
      background-color: #202E2A;
      transition: transform 0.2s ease-out;
      border-radius: 24px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: #F7E7CE;
      transition: transform 0.2s ease-out;
      border-radius: 50%;
    }
    input:checked + .slider {
      background: #245E52;
    }
    input:checked + .slider:before {
      transform: translateX(20px);
    }
    .rc-input {
      width: 100%;
      background: #090D0C !important;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      color: #F7E7CE !important;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      outline: none;
      margin-top: 4px;
    }
    .rc-input:focus {
      border-color: var(--accent-champagne);
    }
    .rc-url-box {
      display: flex;
      align-items: center;
      background: #090D0C;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 8px 6px 10px;
      gap: 8px;
      margin-top: 4px;
    }
    .rc-url-text {
      flex: 1;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      color: var(--accent-champagne);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-copy {
      background: var(--accent-forest);
      border: 1px solid rgba(167, 146, 119, 0.35);
      color: var(--accent-champagne);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }
    .feed-path {
      font-family: ui-monospace, monospace;
      color: var(--text);
      max-width: 80%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .feed-time {
      color: var(--text-muted);
      font-size: 10px;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent-champagne);
      color: #090D0C;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease-out;
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
      <svg class="brand-logo" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="256" rx="56" fill="#090D0C" stroke="#202E2A" stroke-width="4"/>
        <ellipse cx="128" cy="128" rx="96" ry="50" stroke="#F7E7CE" stroke-opacity="0.85" stroke-width="5" stroke-dasharray="18 10" transform="rotate(-25 128 128)"/>
        <ellipse cx="128" cy="128" rx="88" ry="44" stroke="#A79277" stroke-opacity="0.7" stroke-width="4" stroke-dasharray="22 10" transform="rotate(35 128 128)"/>
        <polygon points="128,74 174,101 128,128 82,101" fill="#184239" stroke="#A79277" stroke-width="2"/>
        <polygon points="82,101 128,128 128,182 82,155" fill="#102C26"/>
        <polygon points="128,128 174,101 174,155 128,182" fill="#0A1B17"/>
        <path d="M116 114 L128 124 L116 134" stroke="#F7E7CE" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M134 134 L146 134" stroke="#A79277" stroke-width="6" stroke-linecap="round"/>
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
        <span>4-Tier Zero-Typing Pairing</span>
        <span style="font-size: 10px; color: var(--accent-champagne);">Port ${params.port} &bull; UDP 8788</span>
      </div>
      <div style="display: flex; gap: 12px; align-items: center;">
        ${params.qrCodeSvg ? `
        <div style="background: #090D0C; border: 1px solid rgba(167, 146, 119, 0.35); border-radius: 10px; padding: 6px; width: 108px; height: 108px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Scan with GravKtrl phone camera">
          <div style="width: 94px; height: 94px; display: flex; align-items: center; justify-content: center;">
            ${params.qrCodeSvg}
          </div>
        </div>
        ` : ""}
        <div class="pin-box" id="pinBox" style="flex: 1;" title="Click to copy pairing PIN">
          <div class="pin-code">${pinDisplay}</div>
          <div class="pin-hint">6-Digit Quick PIN (Click to copy)</div>
        </div>
      </div>
    </div>

    <!-- NETWORK ENDPOINTS & CONNECTED CLIENTS -->
    <div class="card">
      <div class="card-title">
        <span>Network &amp; Clients</span>
        <span class="mode-pill">${params.cdpActive ? "CDP PORT 9222 ACTIVE" : "DAEMON READY"}</span>
      </div>
      <div class="grid-3">
        <div>
          <div class="stat-label">LAN Endpoint</div>
          <div class="stat-val">${params.lanIp}:${params.port}</div>
        </div>
        <div>
          <div class="stat-label">Tailscale Mesh</div>
          <div class="stat-val">${params.tailscaleIp ? `${params.tailscaleIp}:${params.port}` : "Not active"}</div>
        </div>
        <div>
          <div class="stat-label">Connected Clients</div>
          <div class="stat-val" id="clientCountVal">${connectedClients} Active</div>
        </div>
      </div>
    </div>

    <!-- ANTIGRAVITY REMOTE CONTROL BRIDGE -->
    <div class="card" id="remoteControlCard">
      <div class="card-title">
        <span>Antigravity Remote Control Bridge</span>
        <span id="rcBadge" class="mode-pill">${activeRemoteUrl || params.remoteControl?.enabled ? "LINKED" : "STANDBY"}</span>
      </div>
      <div class="rc-toggle-row">
        <div>
          <div class="rc-toggle-label">Remote Control Bridge URL</div>
          <div class="rc-toggle-desc">Persisted Antigravity Settings &rarr; Remote Control link.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="rcToggle" ${params.remoteControl?.enabled ? "checked" : ""} onchange="onToggleRemoteControl(this.checked)">
          <span class="slider"></span>
        </label>
      </div>

      <div style="margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px;">
        <div class="stat-label">Active Bridge URL</div>
        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <input type="text" id="rcUrlInput" class="rc-input" style="margin-top: 0;" value="${activeRemoteUrl}" placeholder="https://antigravity.google.com/r/...">
          <button class="btn-copy" onclick="saveRemoteBridgeUrl()" style="padding: 0 12px; white-space: nowrap;">Save URL</button>
        </div>
        <div class="rc-url-box" style="margin-top: 8px;">
          <span class="rc-url-text" id="rcUrlText">${activeRemoteUrl || "Not configured yet"}</span>
          <button class="btn-copy" onclick="copyRcLink()" title="Copy Bridge Link">Copy</button>
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
      <div class="feed" id="fileFeed">
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">Waiting for workspace edits...</div>
      </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div class="btn-row">
      <div class="grid-2">
        <a class="btn btn-primary" href="/hud" target="_blank">
          Open Mobile Shell HUD
        </a>
        <a class="btn btn-secondary" href="/download-apk">
          Download Android APK
        </a>
      </div>
      <button class="btn btn-secondary" id="btnLaunchCdp">
        Launch Antigravity with CDP (:9222)
      </button>
    </div>
  </main>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    const MASTER_TOKEN = "${params.masterToken}";
    const PIN = "${params.pin}";

    function showToast(msg) {
      const t = document.getElementById("toast");
      t.innerText = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2000);
    }

    document.getElementById("pinBox").addEventListener("click", () => {
      navigator.clipboard.writeText(PIN).then(() => {
        showToast("PIN " + PIN + " copied!");
      });
    });

    document.getElementById("btnLaunchCdp").addEventListener("click", async () => {
      try {
        const res = await fetch("/api/launch-antigravity", { method: "POST" });
        const data = await res.json();
        showToast(data.message || "Launched Antigravity!");
      } catch {
        showToast("Launch requested");
      }
    });

    let ws;
    function connectWs() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = protocol + "//" + location.host + "/?token=" + encodeURIComponent(MASTER_TOKEN);
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === "agent.fileModified") {
            appendFileEvent(msg.params);
          }
        } catch {}
      };

      ws.onclose = () => {
        setTimeout(connectWs, 2500);
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
      if (feed.children.length > 20) {
        feed.removeChild(feed.lastChild);
      }
    }

    async function saveRemoteBridgeUrl() {
      const val = document.getElementById("rcUrlInput")?.value?.trim() || "";
      try {
        const res = await fetch("/api/rpc?token=" + encodeURIComponent(MASTER_TOKEN), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + MASTER_TOKEN },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "save_url_" + Date.now(),
            method: "antigravity.setRemoteUrl",
            params: { url: val }
          })
        });
        const data = await res.json();
        if (data.result?.success) {
          const urlText = document.getElementById("rcUrlText");
          if (urlText) urlText.innerText = data.result.remoteUrl || "Not configured yet";
          document.getElementById("rcBadge").innerText = data.result.remoteUrl ? "LINKED" : "STANDBY";
          showToast("Antigravity Bridge URL saved!");
        }
      } catch {
        showToast("Failed to save URL");
      }
    }

    async function onToggleRemoteControl(enabled) {
      const badge = document.getElementById("rcBadge");
      badge.innerText = "UPDATING...";
      try {
        const res = await fetch("/api/antigravity/remote-control/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        badge.innerText = data.enabled ? "LINKED" : "STANDBY";
        if (data.url) {
          const input = document.getElementById("rcUrlInput");
          if (input) input.value = data.url;
          const urlText = document.getElementById("rcUrlText");
          if (urlText) urlText.innerText = data.url;
        }
        showToast(data.enabled ? "Remote Control enabled!" : "Remote Control disabled.");
      } catch {
        showToast("Failed to toggle Remote Control");
      }
    }

    function copyRcLink() {
      const url = document.getElementById("rcUrlText")?.innerText || "";
      if (url && url !== "Not configured yet") {
        navigator.clipboard.writeText(url).then(() => showToast("Bridge Link copied!"));
      }
    }

    connectWs();
  </script>
</body>
</html>
`;
}