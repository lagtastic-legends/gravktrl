import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { GravKtrlAuth } from "./auth.js";
import { TelemetryCollector } from "./telemetry.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { CdpAntigravityDriver } from "./drivers/cdp-antigravity.js";
import { TerminalEngineDriver } from "./drivers/terminal-engine.js";
import { GitEngineDriver } from "./drivers/git-engine.js";
import { WorkspaceWatcher } from "./drivers/workspace-watcher.js";
import { AntigravityConversationManager } from "./drivers/antigravity-conversation-manager.js";
import { ModelManager, type ModelUsageData, type ModelInfo } from "./drivers/model-manager.js";
import { ScreenMirrorDriver, type ScreenInfo, type ScreenInputEvent } from "./drivers/screen-mirror-driver.js";
import { InteractiveTerminalManager, type TerminalSessionInfo, type TerminalDataEvent } from "./drivers/interactive-terminal-manager.js";
import { AntigravityHubDriver, type AntigravityRemoteControlStatus } from "./drivers/antigravity-hub-driver.js";
import { renderDesktopHtml } from "./desktop-ui.js";
import QRCode from "qrcode";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}

// Driver delegates for Phase 2 integration
export interface AgentDriver {
  sendPrompt(prompt: string, activeWorkspace: string): Promise<{ success: boolean; mode: "cdp" | "win32" | "fallback"; message: string }>;
  stopAgent(): Promise<{ success: boolean; message: string }>;
  getAgentStatus(): { isRunning: boolean; currentTask?: string; lastResponse?: string; cdpAttached: boolean; mode?: "cdp" | "win32" | "offline"; processName?: string };
  onStreamChunk?(listener: (chunk: { text: string; isComplete: boolean; status: string }) => void): void;
  getWin32Bridge?(): any;
}

export interface TerminalDriver {
  execute(
    command: string,
    cwd: string,
    approvalId?: string
  ): Promise<{ executionId: string; status: "started" | "approval_required"; riskReason?: string }>;
  sendInput(executionId: string, input: string): boolean;
  kill(executionId: string): boolean;
  approveExecution(approvalId: string): Promise<{ executionId: string; status: "started" }>;
  onOutput?(listener: (event: { executionId: string; chunk: string; stream: "stdout" | "stderr" }) => void): void;
  onExit?(listener: (event: { executionId: string; exitCode: number; durationMs: number }) => void): void;
  onApprovalRequired?(listener: (event: { approvalId: string; command: string; riskReason: string }) => void): void;
}

export interface GitDriver {
  getStatus(cwd: string): Promise<{ branch: string; clean: boolean; modified: string[]; untracked: string[]; staged: string[] }>;
  getDiff(cwd: string, file?: string): Promise<{ diff: string }>;
  commitAndPush(cwd: string, message: string): Promise<{ success: boolean; log: string }>;
}

export class GravKtrlServer {
  private port: number;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private auth: GravKtrlAuth;
  private telemetry: TelemetryCollector;
  private workspaceManager: WorkspaceManager;
  private workspaceWatcher: WorkspaceWatcher;
  private conversationManager: AntigravityConversationManager;
  private modelManager: ModelManager;
  private screenMirror: ScreenMirrorDriver;
  private interactiveTerminal: InteractiveTerminalManager;
  private antigravityHub: AntigravityHubDriver;
  private authenticatedSockets: Set<WebSocket> = new Set();

  private agentDriver?: AgentDriver;
  private terminalDriver?: TerminalDriver;
  private gitDriver?: GitDriver;

  constructor(port: number = 8787, baseDir: string = process.cwd()) {
    this.port = port;
    this.auth = new GravKtrlAuth(baseDir);
    this.telemetry = new TelemetryCollector();
    this.workspaceManager = new WorkspaceManager(baseDir);
    this.workspaceWatcher = new WorkspaceWatcher(this.workspaceManager.getActiveWorkspace());
    this.conversationManager = new AntigravityConversationManager();
    this.modelManager = new ModelManager(baseDir);
    this.screenMirror = new ScreenMirrorDriver(baseDir);
    this.interactiveTerminal = new InteractiveTerminalManager();
    this.antigravityHub = new AntigravityHubDriver();

    this.interactiveTerminal.onData((event) => {
      this.broadcastNotification("terminal.data", event as unknown as Record<string, unknown>);
    });

    this.interactiveTerminal.onExit((event) => {
      this.broadcastNotification("terminal.sessionExit", event as unknown as Record<string, unknown>);
    });

    this.interactiveTerminal.onApprovalRequired((event) => {
      this.broadcastNotification("approval.required", event as unknown as Record<string, unknown>);
    });

    this.workspaceWatcher.onFileChange((event) => {
      this.broadcastNotification("agent.fileModified", event as unknown as Record<string, unknown>);
    });

    this.conversationManager.onStream((event) => {
      this.broadcastNotification("agent.streamChunk", event.chunk);
    });

    // Real-time notification whenever ANY conversation in ANY project is modified or added
    this.conversationManager.onListUpdate((data) => {
      this.broadcastNotification("conversation.listUpdated", data);
    });

    // Real-time notification whenever model quota usage or timers update
    this.modelManager.onUsageUpdate((data) => {
      this.broadcastNotification("model.usageUpdated", data);
    });

    this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.setupHttpUpgrade();
    this.setupWebSocketServer();

    // Wire up production drivers
    this.setDrivers({
      agent: new CdpAntigravityDriver(),
      terminal: new TerminalEngineDriver(),
      git: new GitEngineDriver(),
    });
  }

  public setDrivers(drivers: { agent?: AgentDriver; terminal?: TerminalDriver; git?: GitDriver }): void {
    if (drivers.agent) {
      this.agentDriver = drivers.agent;
      this.agentDriver.onStreamChunk?.((chunk) => {
        this.broadcastNotification("agent.streamChunk", chunk);
      });
    }
    if (drivers.terminal) {
      this.terminalDriver = drivers.terminal;
      this.terminalDriver.onOutput?.((event) => {
        this.broadcastNotification("terminal.output", event);
      });
      this.terminalDriver.onExit?.((event) => {
        this.broadcastNotification("terminal.exit", event);
      });
      this.terminalDriver.onApprovalRequired?.((event) => {
        this.broadcastNotification("approval.required", event);
      });
    }
    if (drivers.git) {
      this.gitDriver = drivers.git;
    }
  }

  public getAuth(): GravKtrlAuth {
    return this.auth;
  }

  public getWorkspaceManager(): WorkspaceManager {
    return this.workspaceManager;
  }

  public getWorkspaceWatcher(): WorkspaceWatcher {
    return this.workspaceWatcher;
  }

  public getAgentDriver(): AgentDriver | undefined {
    return this.agentDriver;
  }

  private setupHttpUpgrade(): void {
    this.httpServer.on("upgrade", (request, socket, head) => {
      const host = request.headers.host || "127.0.0.1";
      const reqUrl = new URL(request.url || "/", `http://${host}`);
      const token =
        reqUrl.searchParams.get("token") ||
        (request.headers["x-gravktrl-token"] as string) ||
        (request.headers.authorization ? request.headers.authorization.replace(/^Bearer\s+/i, "") : "");

      const isAuthed = this.auth.verifyToken(token);

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        if (isAuthed) {
          this.authenticatedSockets.add(ws);
        }
        this.wss.emit("connection", ws, request, isAuthed);
      });
    });
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage, initialAuth: boolean) => {
      let isAuthenticated = initialAuth;
      if (isAuthenticated) {
        this.authenticatedSockets.add(ws);
      }

      ws.on("message", async (data: Buffer | string) => {
        try {
          const raw = data.toString("utf-8");
          const payload = JSON.parse(raw) as JsonRpcRequest;

          // Special case: explicit auth.authenticate method
          if (payload.method === "auth.authenticate") {
            const token = (payload.params as { token?: string })?.token;
            if (this.auth.verifyToken(token)) {
              isAuthenticated = true;
              this.authenticatedSockets.add(ws);
              this.sendWsResponse(ws, {
                jsonrpc: "2.0",
                id: payload.id,
                result: { authenticated: true, activeWorkspace: this.workspaceManager.getActiveWorkspace() },
              });
            } else {
              this.sendWsResponse(ws, {
                jsonrpc: "2.0",
                id: payload.id,
                error: { code: -32001, message: "Unauthorized: Invalid Pairing Token" },
              });
            }
            return;
          }

          if (!isAuthenticated) {
            this.sendWsResponse(ws, {
              jsonrpc: "2.0",
              id: payload.id,
              error: { code: -32001, message: "Unauthorized: Pairing Token required" },
            });
            return;
          }

          const response = await this.dispatchJsonRpc(payload);
          this.sendWsResponse(ws, response);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.sendWsResponse(ws, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: " + errorMsg },
          });
        }
      });

      ws.on("close", () => {
        this.authenticatedSockets.delete(ws);
      });
    });
  }

  private sendWsResponse(ws: WebSocket, res: JsonRpcResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(res));
    }
  }

  public broadcastNotification(method: string, params: any): void {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    const message = JSON.stringify(notification);

    for (const ws of this.authenticatedSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for local LAN web browsers / development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-GravKtrl-Token");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || "127.0.0.1";
    const reqUrl = new URL(req.url || "/", `http://${host}`);
    const pathname = reqUrl.pathname;

    // Health check endpoint
    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "online",
          service: "gravktrl-daemon",
          uptime: process.uptime(),
          time: new Date().toISOString(),
        })
      );
      return;
    }

    // Wi-Fi Radar Discovery Beacon: GET /api/discover
    if (req.method === "GET" && (pathname === "/api/discover" || pathname === "/discover")) {
      const cdpHealth = await this.telemetry.checkCdpHealth();
      const beacon = this.auth.getDiscoveryBeacon(this.port, cdpHealth.healthy);
      const rcStatus = await this.antigravityHub.getRemoteControlInfo().catch(() => null);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ...beacon,
          antigravity: rcStatus?.enabled
            ? {
                enabled: true,
                instanceId: rcStatus.instanceId,
                companionOrigin: rcStatus.companionOrigin,
                url: rcStatus.url,
                accountChooserUrl: rcStatus.accountChooserUrl,
              }
            : { enabled: false },
        })
      );
      return;
    }

    // Direct Pairing via Antigravity Instance ID (scanned Antigravity QR code): POST /api/pair-antigravity
    if (req.method === "POST" && pathname === "/api/pair-antigravity") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}") as { instanceId?: string };
          if (!payload.instanceId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Missing required parameter: instanceId" }));
            return;
          }

          const rcStatus = await this.antigravityHub.getRemoteControlInfo().catch(() => null);
          const reqId = payload.instanceId.trim().toLowerCase().replace(/-v\d+$/, "");
          const localId = (rcStatus?.instanceId || "").trim().toLowerCase().replace(/-v\d+$/, "");

          if (!localId || reqId !== localId) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: false,
                error: `Instance ID mismatch. Active PC instance is ${localId || "unavailable"}`,
              })
            );
            return;
          }

          // Instance ID match verified! Screen physical access proven.
          const beacon = this.auth.getDiscoveryBeacon(this.port);
          const masterToken = this.auth.getMasterToken();
          const activeWs = this.workspaceManager.getActiveWorkspace();
          const workspaces = this.workspaceManager.listWorkspaces();

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              masterToken,
              pin: this.auth.getPin(),
              lanIp: beacon.lanIp,
              tailscaleIp: beacon.tailscaleIp,
              hostname: beacon.name,
              port: this.port,
              activeWorkspace: activeWs,
              workspaces,
              antigravity: rcStatus,
            })
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: errMsg }));
        }
      });
      return;
    }

    // 6-Digit Quick PIN Exchange: POST /api/pair-pin
    if (req.method === "POST" && pathname === "/api/pair-pin") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}") as { pin?: string };
          if (!payload.pin) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Missing required parameter: pin" }));
            return;
          }

          const exchange = this.auth.exchangePin(payload.pin);
          const beacon = this.auth.getDiscoveryBeacon(this.port);
          const activeWs = this.workspaceManager.getActiveWorkspace();
          const workspaces = this.workspaceManager.listWorkspaces();

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              masterToken: exchange.masterToken,
              lanIp: beacon.lanIp,
              tailscaleIp: beacon.tailscaleIp,
              hostname: beacon.name,
              port: this.port,
              activeWorkspace: activeWs,
              workspaces,
            })
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isRateLimit = errMsg.includes("Rate limit");
          res.writeHead(isRateLimit ? 429 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: errMsg }));
        }
      });
      return;
    }

    // Direct APK Download endpoint for 1-tap mobile installation
    if (req.method === "GET" && pathname === "/download-apk") {
      const apkPath = path.resolve(process.cwd(), "android/app/build/outputs/apk/debug/app-debug.apk");
      if (fs.existsSync(apkPath)) {
        const stat = fs.statSync(apkPath);
        res.writeHead(200, {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Length": stat.size,
          "Content-Disposition": 'attachment; filename="GravKtrl.apk"',
        });
        fs.createReadStream(apkPath).pipe(res);
        return;
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("APK not yet compiled. Run 'gradlew assembleDebug' on PC.");
        return;
      }
    }

    // Windows Desktop Control Center: GET /desktop
    if (req.method === "GET" && (pathname === "/desktop" || pathname === "/desktop/")) {
      const beacon = this.auth.getDiscoveryBeacon(this.port);
      const pin = this.auth.getPin();
      const masterToken = this.auth.getMasterToken();
      const activeWs = this.workspaceManager.getActiveWorkspace();
      const workspaces = this.workspaceManager.listWorkspaces();
      const cdpHealth = await this.telemetry.checkCdpHealth();
      const rcStatus = await this.antigravityHub.getRemoteControlInfo();

      const pairDeepLink = `gravktrl://pair?host=${beacon.lanIp}&port=${this.port}&token=${masterToken}&pin=${pin}`;
      let qrCodeSvg = "";
      try {
        qrCodeSvg = await QRCode.toString(pairDeepLink, {
          type: "svg",
          margin: 1,
          color: {
            dark: "#38bdf8",
            light: "#00000000",
          },
        });
      } catch {}

      const html = renderDesktopHtml({
        hostname: beacon.name,
        port: this.port,
        lanIp: beacon.lanIp,
        tailscaleIp: beacon.tailscaleIp,
        pin,
        masterToken,
        activeWorkspace: activeWs,
        workspaces,
        cdpActive: cdpHealth.healthy,
        version: "1.6.3",
        remoteControl: rcStatus,
        qrCodeSvg,
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // Launch Antigravity endpoint: POST /api/launch-antigravity
    if (req.method === "POST" && pathname === "/api/launch-antigravity") {
      if (this.agentDriver && this.agentDriver.getWin32Bridge) {
        const bridge = this.agentDriver.getWin32Bridge();
        const launchResult = await bridge.launchWithCdp(this.workspaceManager.getActiveWorkspace());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(launchResult));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Launch signaled" }));
      return;
    }

    // Antigravity Remote Control Status: GET /api/antigravity/remote-control
    if (req.method === "GET" && pathname === "/api/antigravity/remote-control") {
      const rcStatus = await this.antigravityHub.getRemoteControlInfo();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rcStatus));
      return;
    }

    // Antigravity Remote Control Toggle: POST /api/antigravity/remote-control/toggle
    if (req.method === "POST" && pathname === "/api/antigravity/remote-control/toggle") {
      let bodyStr = "";
      req.on("data", (chunk) => { bodyStr += chunk; });
      req.on("end", async () => {
        try {
          const body = JSON.parse(bodyStr || "{}");
          const enabled = Boolean(body.enabled);
          const hostname = body.hostname as string | undefined;
          const result = await this.antigravityHub.setRemoteControl(enabled, hostname);
          this.broadcastNotification("antigravity.remoteControlChanged", result.status as unknown as Record<string, unknown>);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.status));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || "Failed to update remote control" }));
        }
      });
      return;
    }

    // Antigravity Remote Control Browser Redirect: GET /api/antigravity/remote-control/open
    if (req.method === "GET" && pathname === "/api/antigravity/remote-control/open") {
      const rcStatus = await this.antigravityHub.getRemoteControlInfo();
      const targetUrl = rcStatus.url || "https://antigravity.google.com";
      res.writeHead(302, { Location: targetUrl });
      res.end();
      return;
    }

    // Remote PC Screen & Antigravity Live Stream: GET /api/screen/stream
    if (req.method === "GET" && (pathname === "/api/screen/stream" || pathname === "/api/screen/stream/")) {
      const token =
        reqUrl.searchParams.get("token") ||
        (req.headers["x-gravktrl-token"] as string) ||
        (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "") : "");

      if (!this.auth.verifyToken(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid Pairing Token" }));
        return;
      }

      const target = (reqUrl.searchParams.get("target") as "desktop" | "antigravity") || "antigravity";
      const fps = parseInt(reqUrl.searchParams.get("fps") || "10", 10);
      const quality = parseInt(reqUrl.searchParams.get("quality") || "60", 10);
      const scale = parseFloat(reqUrl.searchParams.get("scale") || "0.75");

      this.screenMirror.addStreamClient(res, target, fps, quality, scale);
      return;
    }

    // Single Screen Snapshot: GET /api/screen/shot
    if (req.method === "GET" && pathname === "/api/screen/shot") {
      const token =
        reqUrl.searchParams.get("token") ||
        (req.headers["x-gravktrl-token"] as string) ||
        (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "") : "");

      if (!this.auth.verifyToken(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized: Invalid Pairing Token" }));
        return;
      }

      const target = (reqUrl.searchParams.get("target") as "desktop" | "antigravity") || "antigravity";
      const quality = parseInt(reqUrl.searchParams.get("quality") || "75", 10);
      const scale = parseFloat(reqUrl.searchParams.get("scale") || "1.0");

      try {
        const frame = await this.screenMirror.captureFrame(target, quality, scale);
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": frame.length,
          "Cache-Control": "no-cache",
        });
        res.end(frame);
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Failed to capture frame" }));
      }
      return;
    }

    // Serve Static Mobile Web Commander HUD (out/ directory)
    if (req.method === "GET" && !pathname.startsWith("/rpc")) {
      const outDir = path.resolve(process.cwd(), "out");
      let reqPath = pathname || "/";
      if (reqPath === "/") reqPath = "/index.html";

      let safePath = path.join(outDir, path.normalize(reqPath).replace(/^(\.\.[/\\])+/, ""));
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        safePath = path.join(outDir, "index.html");
      }

      if (fs.existsSync(safePath)) {
        const ext = path.extname(safePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".ico": "image/x-icon",
          ".woff2": "font/woff2",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(safePath).pipe(res);
        return;
      }
    }

    // Verify Auth for HTTP RPC
    const token =
      reqUrl.searchParams.get("token") ||
      (req.headers["x-gravktrl-token"] as string) ||
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "") : "");

    if (!this.auth.verifyToken(token)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing pairing token" }));
      return;
    }

    if (req.method === "POST" && pathname === "/rpc") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body) as JsonRpcRequest;
          const result = await this.dispatchJsonRpc(payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Invalid JSON: " + errorMsg },
            })
          );
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }

  private async dispatchJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params = {} } = request;
    const activeWs = this.workspaceManager.getActiveWorkspace();

    try {
      switch (method) {
        // SYSTEM
        case "system.ping": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              pong: true,
              time: new Date().toISOString(),
              server: "gravktrl-daemon",
              activeWorkspace: activeWs,
            },
          };
        }

        case "system.telemetry": {
          const telem = await this.telemetry.getTelemetry(activeWs);
          return { jsonrpc: "2.0", id, result: telem };
        }

        // WORKSPACE
        case "workspace.list": {
          const workspaces = this.workspaceManager.listWorkspaces();
          return {
            jsonrpc: "2.0",
            id,
            result: {
              activeWorkspace: activeWs,
              workspaces,
            },
          };
        }

        case "workspace.add": {
          const targetPath = params.path as string;
          const customName = params.name as string | undefined;
          if (!targetPath) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: path" },
            };
          }
          const added = this.workspaceManager.addWorkspace(targetPath, customName);
          return { jsonrpc: "2.0", id, result: added };
        }

        case "workspace.switch": {
          const targetPath = params.path as string;
          if (!targetPath) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: path" },
            };
          }
          const switched = this.workspaceManager.switchWorkspace(targetPath);
          if (!switched.success) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32002, message: switched.error || "Failed to switch workspace" },
            };
          }
          this.workspaceWatcher.setWorkspace(targetPath);
          return { jsonrpc: "2.0", id, result: switched };
        }

        case "workspace.recentActivity": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              activeWorkspace: activeWs,
              recentFiles: this.workspaceWatcher.getRecentHistory(),
            },
          };
        }

        // CONVERSATIONS & CHAT (Antigravity Native Transcript & Projects)
        case "conversation.list": {
          const data = this.conversationManager.listProjectsAndConversations();
          return { jsonrpc: "2.0", id, result: data };
        }

        case "conversation.getMessages": {
          const convId = (params.conversationId as string) || this.conversationManager.getActiveConversationId();
          if (!convId) {
            return { jsonrpc: "2.0", id, result: { messages: [] } };
          }
          const limit = (params.limit as number) || 50;
          const messages = this.conversationManager.getConversationMessages(convId, limit);
          return { jsonrpc: "2.0", id, result: { conversationId: convId, messages } };
        }

        case "conversation.select": {
          const convId = params.conversationId as string;
          if (!convId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: conversationId" },
            };
          }
          const selected = this.conversationManager.setActiveConversation(convId);
          return { jsonrpc: "2.0", id, result: selected };
        }

        case "conversation.new": {
          const projId = params.projectId as string | undefined;
          const created = await this.conversationManager.createNewConversation(projId, (this.agentDriver as any)?.getWin32Bridge?.());
          return { jsonrpc: "2.0", id, result: created };
        }

        // AGENT (CDP Bridge & Inbox Fallback)
        case "agent.sendPrompt": {
          const prompt = params.prompt as string;
          if (!prompt) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: prompt" },
            };
          }
          if (!this.agentDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32003, message: "Agent driver not initialized" },
            };
          }

          // Record model usage on every prompt dispatched
          this.modelManager.recordRequestUsage();

          // Ensure active conversation is watched for immediate live output streaming
          const activeConv = this.conversationManager.getActiveConversationId();
          if (activeConv) {
            this.conversationManager.startWatchingConversation(activeConv);
          }

          const res = await this.agentDriver.sendPrompt(prompt, activeWs);

          // If a conversation was created or changed, re-sync watcher
          const latestConvs = this.conversationManager.listProjectsAndConversations();
          if (latestConvs.activeConversationId) {
            this.conversationManager.startWatchingConversation(latestConvs.activeConversationId);
          }

          return { jsonrpc: "2.0", id, result: res };
        }

        case "agent.stop": {
          if (!this.agentDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32003, message: "Agent driver not initialized" },
            };
          }
          const res = await this.agentDriver.stopAgent();
          return { jsonrpc: "2.0", id, result: res };
        }

        case "agent.status": {
          if (!this.agentDriver) {
            const cdpHealth = await this.telemetry.checkCdpHealth();
            return {
              jsonrpc: "2.0",
              id,
              result: { isRunning: false, cdpAttached: cdpHealth.healthy },
            };
          }
          const status = this.agentDriver.getAgentStatus();
          return { jsonrpc: "2.0", id, result: status };
        }

        // TERMINAL ENGINE & DEST GUARD
        case "terminal.execute": {
          const command = params.command as string;
          const approvalId = params.approvalId as string | undefined;
          if (!command) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: command" },
            };
          }
          if (!this.terminalDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32004, message: "Terminal driver not initialized" },
            };
          }
          const res = await this.terminalDriver.execute(command, activeWs, approvalId);
          return { jsonrpc: "2.0", id, result: res };
        }

        case "terminal.input": {
          const executionId = params.executionId as string;
          const input = params.input as string;
          if (!executionId || input === undefined) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter executionId or input" },
            };
          }
          if (!this.terminalDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32004, message: "Terminal driver not initialized" },
            };
          }
          const success = this.terminalDriver.sendInput(executionId, input);
          return { jsonrpc: "2.0", id, result: { success } };
        }

        case "terminal.kill": {
          const executionId = params.executionId as string;
          if (!executionId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter: executionId" },
            };
          }
          if (!this.terminalDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32004, message: "Terminal driver not initialized" },
            };
          }
          const success = this.terminalDriver.kill(executionId);
          return { jsonrpc: "2.0", id, result: { success } };
        }

        case "terminal.approve": {
          const approvalId = params.approvalId as string;
          if (!approvalId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter: approvalId" },
            };
          }

          // Check if it's an interactive terminal approval
          if (this.interactiveTerminal.approveCommand(approvalId)) {
            return { jsonrpc: "2.0", id, result: { success: true, message: "Interactive command approved" } };
          }

          if (!this.terminalDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32004, message: "Terminal driver not initialized" },
            };
          }
          const res = await this.terminalDriver.approveExecution(approvalId);
          return { jsonrpc: "2.0", id, result: res };
        }

        // INTERACTIVE PTY TERMINAL REPL
        case "terminal.createSession": {
          const session = this.interactiveTerminal.createSession({
            cwd: (params.cwd as string) || activeWs,
            shell: params.shell as string,
            cols: params.cols as number,
            rows: params.rows as number,
            name: params.name as string,
          });
          return { jsonrpc: "2.0", id, result: session };
        }

        case "terminal.getOrCreatePrimarySession": {
          const session = this.interactiveTerminal.getOrCreatePrimarySession((params.cwd as string) || activeWs);
          return { jsonrpc: "2.0", id, result: session };
        }

        case "terminal.sendData": {
          const sessionId = params.sessionId as string;
          const data = params.data as string;
          if (!sessionId || data === undefined) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing sessionId or data" },
            };
          }
          const success = this.interactiveTerminal.write(sessionId, data);
          return { jsonrpc: "2.0", id, result: { success } };
        }

        case "terminal.resize": {
          const sessionId = params.sessionId as string;
          const cols = (params.cols as number) || 80;
          const rows = (params.rows as number) || 24;
          if (!sessionId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter: sessionId" },
            };
          }
          const success = this.interactiveTerminal.resize(sessionId, cols, rows);
          return { jsonrpc: "2.0", id, result: { success } };
        }

        case "terminal.killSession": {
          const sessionId = params.sessionId as string;
          if (!sessionId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter: sessionId" },
            };
          }
          const success = this.interactiveTerminal.kill(sessionId);
          return { jsonrpc: "2.0", id, result: { success } };
        }

        case "terminal.listSessions": {
          const sessions = this.interactiveTerminal.listSessions();
          return { jsonrpc: "2.0", id, result: { sessions } };
        }

        // GIT OPERATIONS
        case "git.status": {
          if (!this.gitDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32005, message: "Git driver not initialized" },
            };
          }
          const res = await this.gitDriver.getStatus(activeWs);
          return { jsonrpc: "2.0", id, result: res };
        }

        case "git.diff": {
          const file = params.file as string | undefined;
          if (!this.gitDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32005, message: "Git driver not initialized" },
            };
          }
          const res = await this.gitDriver.getDiff(activeWs, file);
          return { jsonrpc: "2.0", id, result: res };
        }

        case "git.commitAndPush": {
          const message = params.message as string;
          if (!message) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing parameter: message" },
            };
          }
          if (!this.gitDriver) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32005, message: "Git driver not initialized" },
            };
          }
          const res = await this.gitDriver.commitAndPush(activeWs, message);
          return { jsonrpc: "2.0", id, result: res };
        }

        // MODEL SELECTION & USAGE QUOTAS
        case "model.list": {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              models: this.modelManager.getModels(),
              usage: this.modelManager.getUsage(),
            },
          };
        }

        case "model.usage": {
          return {
            jsonrpc: "2.0",
            id,
            result: this.modelManager.getUsage(),
          };
        }

        case "model.select": {
          const modelId = params.modelId as string;
          if (!modelId) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing required parameter: modelId" },
            };
          }
          const res = this.modelManager.selectModel(modelId);
          return { jsonrpc: "2.0", id, result: res };
        }

        // REMOTE SCREEN MIRRORING & INPUT INJECTION
        case "screen.info": {
          const info = await this.screenMirror.getScreenInfo();
          return { jsonrpc: "2.0", id, result: info };
        }

        case "screen.capture": {
          const target = (params.target as "desktop" | "antigravity") || "antigravity";
          const quality = (params.quality as number) || 75;
          const scale = (params.scale as number) || 1.0;
          const frame = await this.screenMirror.captureFrame(target, quality, scale);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              target,
              format: "image/jpeg",
              sizeBytes: frame.length,
              imageBase64: frame.toString("base64"),
            },
          };
        }

        case "screen.input": {
          const inputEvent = params as unknown as ScreenInputEvent;
          const res = await this.screenMirror.injectInput(inputEvent);
          return { jsonrpc: "2.0", id, result: res };
        }

        // ANTIGRAVITY NATIVE REMOTE CONTROL ("Work with local agents from another device")
        case "antigravity.getRemoteControl": {
          const status = await this.antigravityHub.getRemoteControlInfo();
          return { jsonrpc: "2.0", id, result: status };
        }

        case "antigravity.setRemoteControl": {
          const enabled = Boolean(params.enabled);
          const hostname = params.hostname as string | undefined;
          const result = await this.antigravityHub.setRemoteControl(enabled, hostname);
          this.broadcastNotification("antigravity.remoteControlChanged", result.status as unknown as Record<string, unknown>);
          return { jsonrpc: "2.0", id, result: result.status };
        }

        case "antigravity.getCompanionUrl": {
          const status = await this.antigravityHub.getRemoteControlInfo();
          const email = params.email as string | undefined;
          let directUrl = status.url || "";
          if (email && directUrl) {
            directUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent(directUrl)}`;
          }
          return {
            jsonrpc: "2.0",
            id,
            result: {
              url: directUrl,
              rawUrl: status.url,
              instanceId: status.instanceId,
              companionOrigin: status.companionOrigin,
              enabled: status.enabled,
            },
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `Internal server error: ${errorMsg}` },
      };
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, "0.0.0.0", () => {
        this.auth.printStartupBanner(this.port);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    this.workspaceWatcher.stop();
    this.conversationManager.dispose();
    this.modelManager.dispose();
    this.screenMirror.dispose();
    this.interactiveTerminal.dispose();
    return new Promise((resolve) => {
      for (const socket of this.authenticatedSockets) {
        try {
          socket.close();
        } catch {}
      }
      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  const server = new GravKtrlServer(8787);
  server.start().catch((err) => {
    console.error("[GravKtrl] Server start failed:", err);
  });
}
