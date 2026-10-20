export interface PcProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
  pin?: string;
  lanIp?: string;
  tailscaleIp?: string;
  isTailscale: boolean;
  lastConnected?: string;
}

export interface DiscoveryBeacon {
  name: string;
  lanIp: string;
  tailscaleIp?: string;
  port: number;
  cdpActive: boolean;
  version: string;
}

export interface TelemetryData {
  cpuUsagePercent: number;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
  memoryUsagePercent: number;
  uptimeSeconds: number;
  uptimeFormatted: string;
  hostname: string;
  platform: string;
  arch: string;
  activeDirectory: string;
  cdpHealthy: boolean;
  cdpTargetCount: number;
  timestamp: string;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  isGitRepo: boolean;
  isCurrent: boolean;
  lastAccessed: string;
}

export interface GitStatusData {
  branch: string;
  clean: boolean;
  modified: string[];
  untracked: string[];
  staged: string[];
}

export interface ApprovalRequest {
  approvalId: string;
  command: string;
  riskReason: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  lastModified: string;
  relativeTime: string;
  isActive: boolean;
  stepCount: number;
  workspacePath?: string;
  projectName: string;
  projectId: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  workspacePath?: string;
  conversations: ConversationItem[];
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  thinking?: string;
  timestamp: string;
  stepIndex: number;
  status?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  tier: string;
  badge: string;
  group: "gemini" | "claude_gpt";
  isAvailable: boolean;
  isSelected: boolean;
  notice?: string;
  description: string;
}

export interface LimitQuota {
  remainingPercent: number;
  resetFormatted: string;
  resetTimestamp: number;
}

export interface ModelUsageData {
  gemini: {
    weekly: LimitQuota;
    fiveHour: LimitQuota;
  };
  claudeGpt: {
    weekly: LimitQuota;
    fiveHour: LimitQuota;
  };
  activeModelId: string;
  lastUpdated: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "authenticated" | "error";

type EventCallback<T = unknown> = (data: T) => void;

export class GravKtrlClient {
  private ws: WebSocket | null = null;
  private currentProfile: PcProfile | null = null;
  private connectionState: ConnectionState = "disconnected";
  private pingLatencyMs: number | null = null;
  private pingIntervalTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = true;
  private failoverAttempted: boolean = false;
  private nextRequestId: number = 1;
  private pendingRequests: Map<string | number, { resolve: (val: unknown) => void; reject: (err: Error) => void }> = new Map();
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();

  constructor() {
    this.loadActiveProfile();
  }

  // --- Profile Management ---
  public getSavedProfiles(): PcProfile[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("gravktrl_profiles");
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: "default-lan",
        name: "My PC (Local Wi-Fi)",
        host: "192.168.1.3",
        port: 8787,
        token: "",
        isTailscale: false,
      },
    ];
  }

  public saveProfile(profile: PcProfile): void {
    if (typeof window === "undefined") return;
    const profiles = this.getSavedProfiles().filter((p) => p.id !== profile.id);
    profiles.push(profile);
    localStorage.setItem("gravktrl_profiles", JSON.stringify(profiles));
    localStorage.setItem("gravktrl_active_profile_id", profile.id);
    localStorage.setItem("gravktrl_paired_hosts", "true");
    this.currentProfile = profile;
  }

  public deleteProfile(profileId: string): void {
    if (typeof window === "undefined") return;
    const profiles = this.getSavedProfiles().filter((p) => p.id !== profileId);
    localStorage.setItem("gravktrl_profiles", JSON.stringify(profiles));
  }

  public loadActiveProfile(): PcProfile | null {
    if (typeof window === "undefined") return null;
    try {
      const activeId = localStorage.getItem("gravktrl_active_profile_id");
      const profiles = this.getSavedProfiles();
      const match = profiles.find((p) => p.id === activeId) || profiles[0] || null;
      this.currentProfile = match;
      return match;
    } catch {
      return null;
    }
  }

  public getCurrentProfile(): PcProfile | null {
    return this.currentProfile;
  }

  // --- Event Subscription ---
  public on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit<T = unknown>(event: string, data: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[GravKtrlClient] Event error (${event}):`, e);
        }
      });
    }
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getLatency(): number | null {
    return this.pingLatencyMs;
  }

  // --- 4-Tier Zero-Typing Pairing & Discovery Helpers ---
  public async discoverBeacon(host: string, port = 8787): Promise<DiscoveryBeacon | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`http://${host}:${port}/api/discover`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (res.ok) {
        return (await res.json()) as DiscoveryBeacon;
      }
    } catch {}
    return null;
  }

  public async scanSubnet(extraCandidates: string[] = []): Promise<DiscoveryBeacon[]> {
    const discovered: DiscoveryBeacon[] = [];
    const windowHost = typeof window !== "undefined" ? window.location.hostname : "";

    const candidates = [
      windowHost,
      "127.0.0.1",
      "192.168.1.3",
      "192.168.1.2",
      "192.168.1.4",
      "192.168.1.5",
      "192.168.0.2",
      "192.168.0.3",
      "10.0.0.2",
      "10.0.0.3",
      ...extraCandidates,
    ].filter(Boolean);

    const uniqueIps = Array.from(new Set(candidates));

    const promises = uniqueIps.map(async (ip) => {
      const beacon = await this.discoverBeacon(ip, 8787);
      if (beacon) {
        discovered.push(beacon);
      }
    });

    await Promise.allSettled(promises);
    return discovered;
  }

  public async pairWithPin(
    host: string,
    port = 8787,
    pin: string
  ): Promise<{ profile: PcProfile; workspaces: WorkspaceItem[] }> {
    const res = await fetch(`http://${host}:${port}/api/pair-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin.replace(/\s|-/g, "").trim() }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to pair with 6-digit PIN");
    }

    const isTailscale = host.startsWith("100.");
    const profile: PcProfile = {
      id: "profile-" + Date.now(),
      name: `${data.hostname || "PC"} (${isTailscale ? "Tailscale" : "Wi-Fi"})`,
      host,
      port,
      token: data.masterToken,
      pin,
      lanIp: data.lanIp,
      tailscaleIp: data.tailscaleIp,
      isTailscale,
      lastConnected: new Date().toISOString(),
    };

    this.saveProfile(profile);
    this.connect(profile);

    return { profile, workspaces: data.workspaces || [] };
  }

  // --- WebSocket Connection & Automatic Dual-IP Failover ---
  public connect(profile?: PcProfile): void {
    const target = profile || this.currentProfile;
    if (!target) {
      this.setConnectionState("error");
      return;
    }

    this.currentProfile = target;
    this.shouldReconnect = true;
    this.cleanupSocket();

    this.setConnectionState("connecting");

    const protocol = "ws";
    const wsUrl = `${protocol}://${target.host}:${target.port}/?token=${encodeURIComponent(target.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.failoverAttempted = false;
        this.setConnectionState("connected");
        this.authenticate(target.token);
        this.startPingLoop();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn("[GravKtrlClient] WebSocket error:", err);
      };

      this.ws.onclose = () => {
        this.setConnectionState("disconnected");
        this.pingLatencyMs = null;
        this.stopPingLoop();

        // Dual-IP Failover Check: If primary host fails and Tailscale / LAN alternate exists
        if (!this.failoverAttempted && target.tailscaleIp && target.host !== target.tailscaleIp) {
          console.log("[GravKtrlClient] Primary connection failed, attempting failover to Tailscale IP:", target.tailscaleIp);
          this.failoverAttempted = true;
          this.connect({ ...target, host: target.tailscaleIp, isTailscale: true });
          return;
        } else if (!this.failoverAttempted && target.lanIp && target.host !== target.lanIp) {
          console.log("[GravKtrlClient] Primary connection failed, attempting failover to LAN IP:", target.lanIp);
          this.failoverAttempted = true;
          this.connect({ ...target, host: target.lanIp, isTailscale: false });
          return;
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      console.error("[GravKtrlClient] Connect exception:", e);
      this.setConnectionState("error");
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.cleanupSocket();
    this.setConnectionState("disconnected");
  }

  private cleanupSocket(): void {
    this.stopPingLoop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emit("connectionState", state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect && this.connectionState !== "authenticated") {
        console.log("[GravKtrlClient] Attempting auto-reconnect...");
        this.connect();
      }
    }, 3000);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingIntervalTimer = setInterval(() => {
      if (this.connectionState === "authenticated") {
        const start = performance.now();
        this.call("system.ping")
          .then(() => {
            this.pingLatencyMs = Math.round(performance.now() - start);
            this.emit("latency", this.pingLatencyMs);
          })
          .catch(() => {
            this.pingLatencyMs = null;
          });
      }
    }, 4000);
  }

  private stopPingLoop(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);

      // JSON-RPC Notification (no id)
      if (data.method && data.id === undefined) {
        this.emit(data.method, data.params);
        return;
      }

      // JSON-RPC Response to pending request
      if (data.id !== undefined && this.pendingRequests.has(data.id)) {
        const { resolve, reject } = this.pendingRequests.get(data.id)!;
        this.pendingRequests.delete(data.id);

        if (data.error) {
          reject(new Error(data.error.message || `RPC Error: ${JSON.stringify(data.error)}`));
        } else {
          resolve(data.result);
        }
      }
    } catch (e) {
      console.error("[GravKtrlClient] Failed to parse message:", e);
    }
  }

  public call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected to PC Host"));
        return;
      }

      const id = this.nextRequestId++;
      const payload = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve: resolve as (val: unknown) => void, reject });

      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC request '${method}' timed out`));
        }
      }, 15000);
    });
  }

  private async authenticate(token: string): Promise<void> {
    try {
      await this.call("auth.authenticate", { token });
      this.setConnectionState("authenticated");
    } catch {
      this.setConnectionState("error");
    }
  }

  // --- High-Level RPC APIs ---
  public getTelemetry(): Promise<TelemetryData> {
    return this.call<TelemetryData>("system.telemetry");
  }

  public listWorkspaces(): Promise<{ activeWorkspace: string; workspaces: WorkspaceItem[] }> {
    return this.call("workspace.list");
  }

  public switchWorkspace(targetPath: string): Promise<{ success: boolean; activeWorkspace: string }> {
    return this.call("workspace.switch", { path: targetPath });
  }

  public addWorkspace(targetPath: string, name?: string): Promise<WorkspaceItem> {
    return this.call("workspace.add", { path: targetPath, name });
  }

  public sendPromptToAgent(prompt: string): Promise<{ success: boolean; mode: "cdp" | "win32" | "fallback"; message: string }> {
    return this.call("agent.sendPrompt", { prompt });
  }

  public stopAgent(): Promise<{ success: boolean; message: string }> {
    return this.call("agent.stop");
  }

  public getAgentStatus(): Promise<{
    isRunning: boolean;
    currentTask?: string;
    lastResponse?: string;
    cdpAttached: boolean;
    mode?: "cdp" | "win32" | "offline";
    processName?: string;
  }> {
    return this.call("agent.status");
  }

  public getRecentWorkspaceActivity(): Promise<{
    activeWorkspace: string;
    recentFiles: Array<{ file: string; action: "created" | "modified" | "deleted"; size?: number; timestamp: string }>;
  }> {
    return this.call("workspace.recentActivity");
  }

  // --- Antigravity Conversations & History ---
  public listConversations(): Promise<{ projects: ProjectGroup[]; activeConversationId: string | null }> {
    return this.call("conversation.list");
  }

  public getConversationMessages(conversationId?: string, limit?: number): Promise<{ conversationId: string; messages: ChatMessage[] }> {
    return this.call("conversation.getMessages", { conversationId, limit });
  }

  public selectConversation(conversationId: string): Promise<{ success: boolean; conversationId: string; messages: ChatMessage[] }> {
    return this.call("conversation.select", { conversationId });
  }

  public createConversation(projectId?: string): Promise<{ success: boolean; conversationId?: string; message: string }> {
    return this.call("conversation.new", { projectId });
  }

  // --- Antigravity Model Selection & Quota Limits ---
  public listModels(): Promise<{ models: ModelInfo[]; usage: ModelUsageData }> {
    return this.call("model.list");
  }

  public getModelUsage(): Promise<ModelUsageData> {
    return this.call("model.usage");
  }

  public selectModel(modelId: string): Promise<{ success: boolean; model?: ModelInfo; message: string }> {
    return this.call("model.select", { modelId });
  }

  public executeTerminal(
    command: string,
    approvalId?: string
  ): Promise<{ executionId: string; status: "started" | "approval_required"; riskReason?: string }> {
    return this.call("terminal.execute", { command, approvalId });
  }

  public sendTerminalInput(executionId: string, input: string): Promise<{ success: boolean }> {
    return this.call("terminal.input", { executionId, input });
  }

  public killTerminal(executionId: string): Promise<{ success: boolean }> {
    return this.call("terminal.kill", { executionId });
  }

  public approveCommand(approvalId: string): Promise<{ executionId: string; status: "started" }> {
    return this.call("terminal.approve", { approvalId });
  }

  public getGitStatus(): Promise<GitStatusData> {
    return this.call<GitStatusData>("git.status");
  }

  public getGitDiff(file?: string): Promise<{ diff: string }> {
    return this.call<{ diff: string }>("git.diff", { file });
  }

  public gitCommitAndPush(message: string): Promise<{ success: boolean; log: string }> {
    return this.call<{ success: boolean; log: string }>("git.commitAndPush", { message });
  }

  // --- Voice Input Helper (Web Speech API) ---
  public createVoiceRecognition(
    onResult: (text: string) => void,
    onError: (err: string) => void
  ): { start: () => void; stop: () => void; isSupported: boolean } {
    if (typeof window === "undefined") {
      return { start: () => {}, stop: () => {}, isSupported: false };
    }

    const SpeechRec = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
                     (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      return { start: () => {}, stop: () => {}, isSupported: false };
    }

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      if (transcript) onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      onError(event.error || "Speech recognition error");
    };

    return {
      start: () => {
        try {
          recognition.start();
        } catch {}
      },
      stop: () => {
        try {
          recognition.stop();
        } catch {}
      },
      isSupported: true,
    };
  }
}

// Global Singleton for the App
let clientInstance: GravKtrlClient | null = null;
export function getGravKtrlClient(): GravKtrlClient {
  if (!clientInstance) {
    clientInstance = new GravKtrlClient();
  }
  return clientInstance;
}
