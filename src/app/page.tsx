"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Terminal,
  GitBranch,
  Settings,
  Wifi,
  WifiOff,
  Cpu,
  Zap,
  Smartphone,
  Layers,
  ChevronDown,
  Monitor,
  SplitSquareVertical,
  Play,
  Mic,
  Square,
  Sparkles,
  Send,
  RefreshCw,
} from "lucide-react";
import { getGravKtrlClient, TelemetryData, ConnectionState } from "@/lib/gravktrl-client";
import { useDevicePosture, DevicePosture } from "@/hooks/useDevicePosture";
import { GravKtrlLogo } from "@/components/GravKtrlLogo";
import { OnboardingConnectModal } from "@/components/OnboardingConnectModal";
import { AgentConsoleView } from "@/components/AgentConsoleView";
import { TerminalDeckView } from "@/components/TerminalDeckView";
import { GitWorkspaceView } from "@/components/GitWorkspaceView";
import { HostPairingView } from "@/components/HostPairingView";

type ActiveTab = "agent" | "terminal" | "git" | "host";

export default function GravKtrlApp() {
  const [client] = useState(() => getGravKtrlClient());
  const { posture, setManualOverride, manualOverride, hingeWidthPx } = useDevicePosture();

  const [activeTab, setActiveTab] = useState<ActiveTab>("agent");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string>("C:\\Users\\devra\\Downloads\\gravktrl");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);

  // Onboarding wizard popup state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPostureMenu, setShowPostureMenu] = useState(false);

  // Flip Flex tactile pad prompt state
  const [flipPrompt, setFlipPrompt] = useState("");
  const [flipAgentStatus, setFlipAgentStatus] = useState("idle");

  useEffect(() => {
    setConnectionState(client.getConnectionState());
    setLatencyMs(client.getLatency());

    const unsubConn = client.on("connectionState", (state: any) => {
      setConnectionState(state);
      if (state === "authenticated") {
        fetchTelemetryAndWorkspace();
      }
    });

    const unsubLatency = client.on("latency", (lat: any) => {
      setLatencyMs(lat);
    });

    const unsubStream = client.on("agent.streamChunk", (chunk: any) => {
      if (chunk?.status) setFlipAgentStatus(chunk.status);
    });

    // Check first-time user for auto onboarding
    if (typeof window !== "undefined") {
      const pairedBefore = localStorage.getItem("gravktrl_paired_hosts");
      if (!pairedBefore) {
        setShowOnboarding(true);
      }

      // Check URL query parameters (?token=...&pin=...)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        const host = params.get("host") || window.location.hostname || "127.0.0.1";
        const port = parseInt(params.get("port") || window.location.port || "8787", 10);
        const pin = params.get("pin") || undefined;
        const isTailscale = host.startsWith("100.");
        const profile = {
          id: "profile-web-" + Date.now(),
          name: isTailscale ? "PC (Tailscale VPN)" : "PC (Wi-Fi LAN)",
          host,
          port,
          token: urlToken,
          pin,
          isTailscale,
          lastConnected: new Date().toISOString(),
        };
        client.saveProfile(profile);
        client.connect(profile);
      } else {
        client.connect();
      }
    } else {
      client.connect();
    }

    // Android Deep-Link listener via @capacitor/app
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appUrlOpen", (event) => {
        if (event?.url) {
          try {
            const parsed = new URL(event.url.replace("gravktrl://", "http://"));
            const host = parsed.searchParams.get("host") || parsed.hostname || "127.0.0.1";
            const port = parseInt(parsed.searchParams.get("port") || "8787", 10);
            const token = parsed.searchParams.get("token") || "";
            const pin = parsed.searchParams.get("pin") || undefined;

            if (token) {
              const isTailscale = host.startsWith("100.");
              const profile = {
                id: "profile-auto-" + Date.now(),
                name: isTailscale ? "PC (Tailscale VPN)" : "PC (Wi-Fi LAN)",
                host,
                port,
                token,
                pin,
                isTailscale,
                lastConnected: new Date().toISOString(),
              };
              client.saveProfile(profile);
              client.connect(profile);
            }
          } catch {}
        }
      });
    }).catch(() => {});

    // Telemetry polling
    const telemTimer = setInterval(() => {
      if (client.getConnectionState() === "authenticated") {
        client.getTelemetry().then((t) => {
          setTelemetry(t);
          if (t.activeDirectory) setActiveWorkspace(t.activeDirectory);
        }).catch(() => {});
      }
    }, 5000);

    return () => {
      unsubConn();
      unsubLatency();
      unsubStream();
      clearInterval(telemTimer);
    };
  }, [client]);

  const fetchTelemetryAndWorkspace = async () => {
    try {
      const telem = await client.getTelemetry();
      setTelemetry(telem);
      if (telem.activeDirectory) setActiveWorkspace(telem.activeDirectory);
    } catch {}
  };

  const getWorkspaceShortName = (fullPath: string) => {
    const parts = fullPath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Workspace";
  };

  const handleFlipSend = async (textToSend?: string) => {
    const text = (textToSend || flipPrompt).trim();
    if (!text) return;
    setFlipPrompt("");
    try {
      await client.sendPromptToAgent(text);
    } catch (e: any) {
      alert("Failed to inject prompt: " + (e.message || String(e)));
    }
  };

  const handleFlipExecuteMacro = async (cmd: string) => {
    try {
      await client.executeTerminal(cmd);
    } catch (e: any) {
      alert("Macro execution failed: " + (e.message || String(e)));
    }
  };

  return (
    <main className="flex flex-col h-[100dvh] w-full bg-[#08090d] text-slate-100 overflow-hidden relative select-none">
      {/* Onboarding Wizard Modal */}
      <OnboardingConnectModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        client={client}
        connectionState={connectionState}
        latencyMs={latencyMs}
        onConnected={() => fetchTelemetryAndWorkspace()}
      />

      {/* COMPACT TOP BAR (Zero clipping on 360px & Cover screens) */}
      <header className="flex items-center justify-between px-3 py-2 bg-[#0d1117] border-b border-[#21262d] shrink-0 z-30">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2">
          <GravKtrlLogo size="sm" />
          <div>
            <div className="font-extrabold text-xs tracking-wider text-white">GRAVKTRL</div>
            <div className="text-[9px] text-cyan-400 font-mono tracking-tighter uppercase -mt-0.5">
              AGENT BRIDGE
            </div>
          </div>
        </div>

        {/* Center / Right Action Controls */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          {/* Posture Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => setShowPostureMenu(!showPostureMenu)}
              className="px-2 py-0.5 rounded-full bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-[10px] font-mono text-cyan-300 flex items-center gap-1 transition-colors"
              title="Change UI Posture Mode"
            >
              <Smartphone className="w-2.5 h-2.5 text-cyan-400" />
              <span className="capitalize">{manualOverride ? `${posture}*` : posture}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {/* Posture Menu Dropdown */}
            {showPostureMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-1 z-50 text-[11px] animate-in fade-in">
                <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-[#21262d]">
                  Device Posture Override
                </div>
                {[
                  { id: null, label: "⚡ Auto-Detect (Sensors)" },
                  { id: "phone-slab", label: "📱 Phone Slab" },
                  { id: "flip-flex", label: "📐 Z Flip Flex (Tabletop)" },
                  { id: "fold-dual", label: "📖 Galaxy Fold Dual" },
                  { id: "cover-compact", label: "🔍 Cover Screen (<360px)" },
                  { id: "desktop-mission", label: "🖥️ Desktop Mission" },
                ].map((item) => (
                  <button
                    key={String(item.id)}
                    onClick={() => {
                      setManualOverride(item.id as DevicePosture | null);
                      setShowPostureMenu(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between ${
                      (manualOverride === item.id || (!manualOverride && item.id === null))
                        ? "bg-cyan-950 text-cyan-300 font-semibold"
                        : "text-slate-300 hover:bg-[#21262d]"
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Connect / Guide Pill */}
          <button
            onClick={() => setShowOnboarding(true)}
            className="px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-950 to-cyan-950 hover:from-purple-900 hover:to-cyan-900 border border-cyan-500/50 text-[10px] font-semibold text-cyan-200 flex items-center gap-1 shadow-sm transition-all active:scale-95"
            title="Open Onboarding & Quick Pair Guide"
          >
            <Zap className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
            <span className="hidden min-[340px]:inline">Connect</span>
          </button>

          {/* Online / Offline Status Badge */}
          <button
            onClick={() => setActiveTab("host")}
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1 transition-all ${
              connectionState === "authenticated"
                ? "bg-emerald-950/70 border border-emerald-800 text-emerald-300"
                : connectionState === "connecting"
                ? "bg-amber-950/70 border border-amber-800 text-amber-300 animate-pulse"
                : "bg-rose-950/70 border border-rose-800 text-rose-300"
            }`}
          >
            {connectionState === "authenticated" ? (
              <>
                <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                <span>{latencyMs ? `${latencyMs}ms` : "ONLINE"}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-2.5 h-2.5 text-rose-400" />
                <span>OFFLINE</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ADAPTIVE VIEWPORT ENGINE: 5 FORM FACTORS */}
      <div className="flex-1 overflow-hidden relative">
        {/* POSTURE 1 & 2: PHONE SLAB & COVER COMPACT (Single-column + Tab Dock) */}
        {(posture === "phone-slab" || posture === "cover-compact") && (
          <div className="flex flex-col h-full w-full max-w-lg mx-auto">
            <div className="flex-1 overflow-hidden relative">
              {activeTab === "agent" && (
                <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
              )}
              {activeTab === "terminal" && (
                <TerminalDeckView client={client} activeWorkspace={activeWorkspace} />
              )}
              {activeTab === "git" && (
                <GitWorkspaceView
                  client={client}
                  activeWorkspace={activeWorkspace}
                  onWorkspaceSwitched={(newWs) => {
                    setActiveWorkspace(newWs);
                    fetchTelemetryAndWorkspace();
                  }}
                />
              )}
              {activeTab === "host" && (
                <HostPairingView
                  client={client}
                  connectionState={connectionState}
                  latencyMs={latencyMs}
                  telemetry={telemetry}
                  onRefreshTelemetry={fetchTelemetryAndWorkspace}
                />
              )}
            </div>

            {/* 4-Tab Bottom Navigation Dock */}
            <nav className="flex items-center justify-around px-2 py-2 bg-[#0d1117] border-t border-[#21262d] shrink-0 z-20">
              <button
                onClick={() => setActiveTab("agent")}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === "agent"
                    ? "text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Bot className="w-4 h-4" />
                <span className="text-[10px] font-semibold tracking-tight">Agent</span>
              </button>

              <button
                onClick={() => setActiveTab("terminal")}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === "terminal"
                    ? "text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span className="text-[10px] font-semibold tracking-tight">Terminal</span>
              </button>

              <button
                onClick={() => setActiveTab("git")}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === "git"
                    ? "text-amber-400 bg-amber-950/50 border border-amber-800/60 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <GitBranch className="w-4 h-4" />
                <span className="text-[10px] font-semibold tracking-tight">Git & Files</span>
              </button>

              <button
                onClick={() => setActiveTab("host")}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === "host"
                    ? "text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="text-[10px] font-semibold tracking-tight">Host PC</span>
              </button>
            </nav>
          </div>
        )}

        {/* POSTURE 3: FLIP FLEX (Clamshell 90° Tabletop Split across Fold Crease) */}
        {posture === "flip-flex" && (
          <div className="flex flex-col h-full w-full">
            {/* TOP 50%: Live Monitor Above Hinge Crease */}
            <div className="h-[48%] overflow-hidden relative border-b border-[#21262d] bg-[#050608]">
              <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
            </div>

            {/* MIDDLE 28px HINGE SAFE BAR (Along the Physical Fold Crease) */}
            <div className="h-7 bg-[#161b22] border-y border-cyan-500/40 flex items-center justify-between px-3 text-[10px] font-mono text-cyan-300 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
                <span>FLIP TABLETOP FLEX MODE</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{getWorkspaceShortName(activeWorkspace)}</span>
                <span>•</span>
                <span>CPU {telemetry?.cpuUsagePercent ?? 0}%</span>
              </div>
            </div>

            {/* BOTTOM 50%: Tactile Control Pad (Flat on Table) */}
            <div className="flex-1 overflow-y-auto p-2.5 bg-[#090b10] flex flex-col justify-between space-y-2">
              {/* 2x3 1-Tap Quick Action Macro Grid */}
              <div className="grid grid-cols-3 gap-1.5 shrink-0">
                <button
                  onClick={() => handleFlipExecuteMacro("npm run typecheck")}
                  className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-cyan-800 text-cyan-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  Typecheck
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("npm test")}
                  className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-emerald-800 text-emerald-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  Test
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("gradlew assembleRelease")}
                  className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-purple-800 text-purple-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  Build APK
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("adb devices")}
                  className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-amber-800 text-amber-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  ADB Devices
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("git status")}
                  className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-slate-700 text-slate-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <GitBranch className="w-2.5 h-2.5" />
                  Git Status
                </button>
                <button
                  onClick={() => client.stopAgent()}
                  className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-mono flex items-center justify-center gap-1 active:scale-95"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop Agent
                </button>
              </div>

              {/* Tactical Prompt Bar */}
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={flipPrompt}
                  onChange={(e) => setFlipPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFlipSend()}
                  placeholder="Inject prompt into Antigravity IDE..."
                  className="flex-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-sans"
                />
                <button
                  onClick={() => handleFlipSend()}
                  disabled={!flipPrompt.trim()}
                  className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white shadow active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POSTURE 4: FOLD DUAL (Galaxy Z Fold 8 & iPhone Duo Dual-Screen Split) */}
        {posture === "fold-dual" && (
          <div className="flex h-full w-full">
            {/* LEFT DISPLAY SEGMENT: Agent Chat Console */}
            <div className="flex-1 min-w-0 h-full overflow-hidden border-r border-[#21262d]">
              <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
            </div>

            {/* CENTER HINGE GUTTER: Dedicated Fold Crease Safe Buffer */}
            <div
              style={{ width: `${hingeWidthPx}px` }}
              className="bg-[#090b10] border-x border-[#21262d] flex flex-col items-center justify-center shrink-0 text-slate-600 select-none"
              title="Physical Hinge Crease Buffer"
            >
              <div className="w-1.5 h-16 rounded-full bg-slate-800/80 my-auto" />
            </div>

            {/* RIGHT DISPLAY SEGMENT: Terminal Engine (Top) + Git Diff (Bottom) */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 border-b border-[#21262d]">
                <TerminalDeckView client={client} activeWorkspace={activeWorkspace} />
              </div>
              <div className="h-[46%] min-h-0">
                <GitWorkspaceView
                  client={client}
                  activeWorkspace={activeWorkspace}
                  onWorkspaceSwitched={(newWs) => {
                    setActiveWorkspace(newWs);
                    fetchTelemetryAndWorkspace();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* POSTURE 5: DESKTOP MISSION (1024px+ 3-Column Command Center) */}
        {posture === "desktop-mission" && (
          <div className="grid grid-cols-12 h-full w-full">
            {/* Left Column (3 cols): Workspaces & Git */}
            <div className="col-span-3 h-full border-r border-[#21262d] overflow-hidden">
              <GitWorkspaceView
                client={client}
                activeWorkspace={activeWorkspace}
                onWorkspaceSwitched={(newWs) => {
                  setActiveWorkspace(newWs);
                  fetchTelemetryAndWorkspace();
                }}
              />
            </div>

            {/* Center Column (5 cols): Antigravity Agent Chat */}
            <div className="col-span-5 h-full border-r border-[#21262d] overflow-hidden">
              <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
            </div>

            {/* Right Column (4 cols): Terminal Deck & Host Pairing */}
            <div className="col-span-4 h-full flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 border-b border-[#21262d]">
                <TerminalDeckView client={client} activeWorkspace={activeWorkspace} />
              </div>
              <div className="h-[40%] min-h-0">
                <HostPairingView
                  client={client}
                  connectionState={connectionState}
                  latencyMs={latencyMs}
                  telemetry={telemetry}
                  onRefreshTelemetry={fetchTelemetryAndWorkspace}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
