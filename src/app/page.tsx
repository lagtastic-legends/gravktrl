"use client";

import React, { useState, useEffect } from "react";
import {
  Smartphone,
  ChevronDown,
  Zap,
  SplitSquareVertical,
  Play,
  Square,
  Send,
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

  const [activeTab, setActiveTab] = useState<ActiveTab>("host");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string>("C:\\Users\\devra\\Downloads\\gravktrl");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);

  // Onboarding wizard popup state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPostureMenu, setShowPostureMenu] = useState(false);

  // Flip Flex tactile pad prompt state
  const [flipPrompt, setFlipPrompt] = useState("");

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
    import("@capacitor/app")
      .then(({ App }) => {
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
      })
      .catch(() => {});

    // Telemetry polling
    const telemTimer = setInterval(() => {
      if (client.getConnectionState() === "authenticated") {
        fetchTelemetryAndWorkspace();
      }
    }, 2000);

    return () => {
      unsubConn();
      unsubLatency();
      clearInterval(telemTimer);
    };
  }, [client]);

  const fetchTelemetryAndWorkspace = async () => {
    try {
      const telem = await client.getTelemetry();
      if (telem) {
        setTelemetry(telem);
        if (telem.activeDirectory) {
          setActiveWorkspace(telem.activeDirectory);
        }
      }
    } catch {}
  };

  const getWorkspaceShortName = (fullPath: string) => {
    if (!fullPath) return "workspace";
    const parts = fullPath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || parts[parts.length - 2] || "workspace";
  };

  const handleFlipExecuteMacro = (cmd: string) => {
    client.executeTerminal(cmd);
  };

  const handleFlipSend = async () => {
    if (!flipPrompt.trim()) return;
    const text = flipPrompt.trim();
    setFlipPrompt("");
    try {
      await client.sendPromptToAgent(text);
    } catch {}
  };

  const ramUsedGb = telemetry?.usedMemoryBytes
    ? (telemetry.usedMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
    : "4.2";
  const ramTotalGb = telemetry?.totalMemoryBytes
    ? (telemetry.totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
    : "16.0";

  const activeTabTitle =
    activeTab === "agent"
      ? "Agent Console"
      : activeTab === "terminal"
      ? "Terminal Engine"
      : activeTab === "git"
      ? "Git & Workspaces"
      : "Host Telemetry";

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-[#f6f8fb] text-[#1e293b] overflow-hidden select-none font-sans antialiased">
      {/* 1. SILK NEOMORPHIC HEADER (Stitch Design System) */}
      <header className="fixed top-0 w-full z-50 pt-safe bg-[#f6f8fb]/85 backdrop-blur-xl border-b border-slate-200/60 shadow-[0_2px_10px_rgba(166,178,199,0.15)]">
        <div className="px-4 py-2.5 flex flex-col justify-center gap-1.5">
          <div className="flex items-center justify-between">
            {/* Brand Logo & Name */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white shadow-neo-soft flex items-center justify-center p-1.5 border border-white/80 shrink-0">
                <GravKtrlLogo size="sm" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-slate-800">GRAVKTRL</span>
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      connectionState === "authenticated" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      connectionState === "authenticated" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  ></span>
                </span>
              </div>
              <span className="text-xs font-medium text-slate-400 hidden min-[360px]:inline">
                / {activeTabTitle}
              </span>
            </div>

            {/* Right Actions: Workspace Chip & Quick Connect / Posture */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("git")}
                className="h-8 px-2.5 bg-white shadow-neo-soft rounded-full flex items-center gap-1 text-slate-600 hover:text-indigo-600 transition-all active:shadow-neo-pressed border border-white/60"
                title="Active Project Workspace"
              >
                <span className="material-symbols-outlined text-indigo-500 text-[15px]">swap_horiz</span>
                <span className="font-mono text-[11px] font-semibold text-slate-700 truncate max-w-[100px]">
                  {getWorkspaceShortName(activeWorkspace)}
                </span>
              </button>

              <button
                onClick={() => setShowOnboarding(true)}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-neo-soft flex items-center justify-center hover:brightness-105 active:scale-95 transition-all"
                title="Pairing & Onboarding Guide"
              >
                <span className="material-symbols-outlined text-[17px]">hub</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
            {/* Status & Latency */}
            <div
              className={`h-6 px-2.5 rounded-full flex items-center gap-1.5 shrink-0 shadow-sm border ${
                connectionState === "authenticated"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                  : "bg-rose-50 text-rose-700 border-rose-200/60"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connectionState === "authenticated" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              ></span>
              <span className="font-mono text-[10px] font-bold tracking-tight">
                {connectionState === "authenticated" ? `ONLINE • ${latencyMs ?? 8}ms` : "OFFLINE"}
              </span>
            </div>

            {/* CPU */}
            <div className="h-6 px-2.5 rounded-full bg-white shadow-neo-soft flex items-center gap-1 shrink-0 border border-white/60">
              <span className="text-[10px] font-medium text-slate-400">CPU</span>
              <span className="font-mono text-[11px] text-indigo-600 font-semibold">
                {telemetry?.cpuUsagePercent ?? 18}%
              </span>
            </div>

            {/* RAM */}
            <div className="h-6 px-2.5 rounded-full bg-white shadow-neo-soft flex items-center gap-1 shrink-0 border border-white/60">
              <span className="text-[10px] font-medium text-slate-400">RAM</span>
              <span className="font-mono text-[11px] text-slate-700 font-semibold">
                {ramUsedGb}/{ramTotalGb}GB
              </span>
            </div>

            {/* Antigravity Mode */}
            <div className="h-6 px-2.5 rounded-full bg-white shadow-neo-soft flex items-center gap-1 shrink-0 border border-white/60">
              <span className="text-[10px] font-medium text-slate-400">ANTIGRAVITY</span>
              <span
                className={`font-mono text-[10px] font-bold ${
                  telemetry?.cdpHealthy ? "text-emerald-600" : "text-indigo-600"
                }`}
              >
                {telemetry?.cdpHealthy ? "CDP:9222" : "WIN32"}
              </span>
            </div>

            {/* Posture Pill */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowPostureMenu(!showPostureMenu)}
                className="h-6 px-2.5 rounded-full bg-white shadow-neo-soft flex items-center gap-1 text-slate-600 border border-white/60 hover:text-indigo-600"
              >
                <Smartphone className="w-2.5 h-2.5 text-indigo-500" />
                <span className="font-mono text-[10px] text-indigo-600 font-bold capitalize">
                  {manualOverride ? `${posture}*` : posture}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
              </button>

              {showPostureMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-neo-flat p-1.5 z-50 text-[11px]">
                  <div className="px-2 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
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
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-all flex items-center justify-between ${
                        manualOverride === item.id || (!manualOverride && item.id === null)
                          ? "bg-indigo-50 text-indigo-700 font-bold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN ADAPTIVE CONTENT VIEWPORT */}
      <main className="flex-1 min-h-0 pt-28 pb-16 overflow-y-auto w-full relative">
        {/* POSTURE 1 & 2: PHONE SLAB & COVER COMPACT */}
        {(posture === "phone-slab" || posture === "cover-compact") && (
          <div className="h-full w-full max-w-lg mx-auto overflow-y-auto">
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
                activeWorkspace={activeWorkspace}
                onOpenOnboarding={() => setShowOnboarding(true)}
              />
            )}
          </div>
        )}

        {/* POSTURE 3: FLIP FLEX (Tabletop Clamshell Split) */}
        {posture === "flip-flex" && (
          <div className="flex flex-col h-full w-full">
            {/* Top Display */}
            <div className="h-[48%] overflow-hidden relative border-b border-slate-200 bg-white shadow-neo-soft">
              {activeTab === "agent" && (
                <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
              )}
              {activeTab === "host" && (
                <HostPairingView
                  client={client}
                  connectionState={connectionState}
                  latencyMs={latencyMs}
                  telemetry={telemetry}
                  onRefreshTelemetry={fetchTelemetryAndWorkspace}
                  activeWorkspace={activeWorkspace}
                  onOpenOnboarding={() => setShowOnboarding(true)}
                />
              )}
              {activeTab !== "agent" && activeTab !== "host" && (
                <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
              )}
            </div>

            {/* Hinge Safe Bar */}
            <div className="h-7 bg-[#eef2f7] border-y border-indigo-200/60 flex items-center justify-between px-3 text-[10px] font-mono text-indigo-700 shrink-0">
              <div className="flex items-center gap-1.5">
                <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-600" />
                <span className="font-bold">FLIP TABLETOP FLEX MODE</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{getWorkspaceShortName(activeWorkspace)}</span>
                <span>•</span>
                <span>CPU {telemetry?.cpuUsagePercent ?? 0}%</span>
              </div>
            </div>

            {/* Bottom Tactile Pad */}
            <div className="flex-1 overflow-y-auto p-3 bg-[#f6f8fb] flex flex-col justify-between space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleFlipExecuteMacro("npm run typecheck")}
                  className="p-2.5 rounded-xl bg-white shadow-neo-soft text-slate-700 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  <Play className="w-2.5 h-2.5 fill-current text-indigo-600" />
                  Typecheck
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("npm test")}
                  className="p-2.5 rounded-xl bg-white shadow-neo-soft text-slate-700 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  <Play className="w-2.5 h-2.5 fill-current text-emerald-600" />
                  Test
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("cd android && gradlew assembleDebug")}
                  className="p-2.5 rounded-xl bg-white shadow-neo-soft text-slate-700 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  <Play className="w-2.5 h-2.5 fill-current text-purple-600" />
                  Build APK
                </button>
                <button
                  onClick={() => handleFlipExecuteMacro("git status")}
                  className="p-2.5 rounded-xl bg-white shadow-neo-soft text-slate-700 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  Git Status
                </button>
                <button
                  onClick={() => client.stopAgent()}
                  className="p-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop Agent
                </button>
                <button
                  onClick={() => setActiveTab("host")}
                  className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono flex items-center justify-center gap-1 active:shadow-neo-pressed"
                >
                  Host HUD
                </button>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={flipPrompt}
                  onChange={(e) => setFlipPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFlipSend()}
                  placeholder="Inject prompt into Antigravity..."
                  className="flex-1 neo-well rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                <button
                  onClick={() => handleFlipSend()}
                  disabled={!flipPrompt.trim()}
                  className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-neo-soft active:scale-95 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POSTURE 4: FOLD DUAL */}
        {posture === "fold-dual" && (
          <div className="flex h-full w-full">
            <div className="flex-1 min-w-0 h-full overflow-hidden border-r border-slate-200 bg-white">
              <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
            </div>

            <div
              style={{ width: `${hingeWidthPx}px` }}
              className="bg-[#eef2f7] border-x border-slate-200 flex flex-col items-center justify-center shrink-0 select-none"
            >
              <div className="w-1.5 h-16 rounded-full bg-slate-300 my-auto" />
            </div>

            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 border-b border-slate-200">
                <TerminalDeckView client={client} activeWorkspace={activeWorkspace} />
              </div>
              <div className="h-[46%] min-h-0">
                <HostPairingView
                  client={client}
                  connectionState={connectionState}
                  latencyMs={latencyMs}
                  telemetry={telemetry}
                  onRefreshTelemetry={fetchTelemetryAndWorkspace}
                  activeWorkspace={activeWorkspace}
                  onOpenOnboarding={() => setShowOnboarding(true)}
                />
              </div>
            </div>
          </div>
        )}

        {/* POSTURE 5: DESKTOP MISSION (1024px+ 3-Column) */}
        {posture === "desktop-mission" && (
          <div className="grid grid-cols-12 h-full w-full">
            <div className="col-span-3 h-full border-r border-slate-200 overflow-hidden bg-white">
              <GitWorkspaceView
                client={client}
                activeWorkspace={activeWorkspace}
                onWorkspaceSwitched={(newWs) => {
                  setActiveWorkspace(newWs);
                  fetchTelemetryAndWorkspace();
                }}
              />
            </div>
            <div className="col-span-5 h-full border-r border-slate-200 overflow-hidden bg-[#f6f8fb]">
              <AgentConsoleView client={client} activeWorkspace={activeWorkspace} />
            </div>
            <div className="col-span-4 h-full flex flex-col overflow-hidden bg-white">
              <div className="flex-1 min-h-0 border-b border-slate-200">
                <TerminalDeckView client={client} activeWorkspace={activeWorkspace} />
              </div>
              <div className="h-[40%] min-h-0 overflow-y-auto">
                <HostPairingView
                  client={client}
                  connectionState={connectionState}
                  latencyMs={latencyMs}
                  telemetry={telemetry}
                  onRefreshTelemetry={fetchTelemetryAndWorkspace}
                  activeWorkspace={activeWorkspace}
                  onOpenOnboarding={() => setShowOnboarding(true)}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. SILK NEOMORPHIC BOTTOM NAVIGATION DOCK (Stitch Design System) */}
      <nav className="fixed bottom-0 w-full z-50 pb-safe bg-[#f6f8fb]/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_16px_rgba(166,178,199,0.25)]">
        <div className="h-16 px-4 flex items-center justify-around">
          {/* Agent Tab */}
          <button
            onClick={() => setActiveTab("agent")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] h-full transition-all ${
              activeTab === "agent" ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {activeTab === "agent" ? (
              <div className="w-10 h-7 rounded-full bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[19px]">smart_toy</span>
              </div>
            ) : (
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            )}
            <span className="text-[11px] tracking-tight">Agent</span>
          </button>

          {/* Terminal Tab */}
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] h-full transition-all ${
              activeTab === "terminal" ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {activeTab === "terminal" ? (
              <div className="w-10 h-7 rounded-full bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[19px]">terminal</span>
              </div>
            ) : (
              <span className="material-symbols-outlined text-[20px]">terminal</span>
            )}
            <span className="text-[11px] tracking-tight">Terminal</span>
          </button>

          {/* Git/Files Tab */}
          <button
            onClick={() => setActiveTab("git")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] h-full transition-all ${
              activeTab === "git" ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {activeTab === "git" ? (
              <div className="w-10 h-7 rounded-full bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[19px]">account_tree</span>
              </div>
            ) : (
              <span className="material-symbols-outlined text-[20px]">account_tree</span>
            )}
            <span className="text-[11px] tracking-tight">Git/Files</span>
          </button>

          {/* Host PC Tab */}
          <button
            onClick={() => setActiveTab("host")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] h-full transition-all ${
              activeTab === "host" ? "text-indigo-600 font-bold" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {activeTab === "host" ? (
              <div className="w-10 h-7 rounded-full bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[19px]">dns</span>
              </div>
            ) : (
              <span className="material-symbols-outlined text-[20px]">dns</span>
            )}
            <span className="text-[11px] tracking-tight">Host PC</span>
          </button>
        </div>
      </nav>

      {/* 4. ONBOARDING MODAL */}
      {showOnboarding && (
        <OnboardingConnectModal
          client={client}
          onClose={() => setShowOnboarding(false)}
          onConnected={() => {
            setShowOnboarding(false);
            fetchTelemetryAndWorkspace();
          }}
        />
      )}
    </div>
  );
}
