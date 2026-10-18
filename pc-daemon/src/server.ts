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
import { renderDesktopHtml } from "./desktop-ui.js";

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

    this.workspaceWatcher.onFileChange((event) => {
      this.broadcastNotification("agent.fileModified", event as unknown as Record<string, unknown>);
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

  public broadcastNotification(method: string, params: Record<string, unknown>): void {
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(beacon));
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
        version: "1.1.0",
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
          const res = await this.agentDriver.sendPrompt(prompt, activeWs);
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
