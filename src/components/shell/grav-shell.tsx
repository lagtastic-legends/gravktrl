"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePosture, type DevicePosture } from "@/hooks/use-posture";
import { useGravStore, type TacticalDeckId } from "@/store/use-grav-store";
import { GravKtrlLogo } from "@/components/ui/gravktrl-logo";
import { ZeroTypePairingModal } from "@/components/pairing/zero-type-pairing-modal";
import {
  Terminal,
  Cpu,
  Layers,
  Bot,
  MousePointer,
  Wifi,
  WifiOff,
  ShieldAlert,
  Send,
  Play,
  RotateCw,
  ExternalLink,
  Copy,
  Check,
  Smartphone,
  Tablet,
  BookOpen,
  Monitor,
  Flame,
  HardDrive,
  Activity,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";

export function GravShell() {
  const { posture, effectivePosture, manualOverride, setManualOverride } = usePosture();
  const {
    activeDeck,
    setActiveDeck,
    host,
    port,
    token,
    isConnected,
    setConnected,
    isConnecting,
    setConnecting,
    metrics,
    setMetrics,
    terminalLogs,
    terminalInput,
    setTerminalInput,
    addTerminalLog,
    clearTerminalLogs,
    isTerminalExecuting,
    setTerminalExecuting,
    lastBlockedReason,
    setLastBlockedReason,
    antigravityConfig,
    setAntigravityConfig,
    setActiveAgent,
    setPairingModalOpen,
    macroStatus,
    setMacroStatus,
  } = useGravStore();

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [remoteUrlInput, setRemoteUrlInput] = useState(antigravityConfig.remoteUrl || "");
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const trackpadRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Connect WebSocket & keep-alive
  useEffect(() => {
    if (!host || !port) return;

    let socket: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let disposed = false;

    const connectWs = () => {
      try {
        setConnecting(true);
        const wsUrl = `ws://${host}:${port}?token=${encodeURIComponent(token || "")}`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (disposed) return;
          setConnected(true);
          setConnecting(false);
          // Initial metrics fetch
          socket?.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "init_metrics",
              method: "system.metrics",
            })
          );
          // Antigravity remote config fetch
          socket?.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "init_ag_config",
              method: "antigravity.getRemoteConfig",
            })
          );
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.result) {
              if (data.id === "init_metrics" || data.id === "poll_metrics") {
                setMetrics(data.result);
              } else if (data.id === "init_ag_config") {
                setAntigravityConfig({
                  remoteUrl: data.result.remoteUrl,
                  enabled: data.result.enabled,
                  instanceId: data.result.instanceId,
                  companionOrigin: data.result.companionOrigin,
                });
                if (data.result.remoteUrl) {
                  setRemoteUrlInput(data.result.remoteUrl);
                }
              }
            } else if (data.method === "terminal.output" && data.params) {
              addTerminalLog({
                text: data.params.chunk,
                stream: data.params.stream || "stdout",
              });
            }
          } catch {}
        };

        socket.onclose = () => {
          if (disposed) return;
          setConnected(false);
          setConnecting(false);
        };

        socket.onerror = () => {
          if (disposed) return;
          setConnected(false);
          setConnecting(false);
        };

        setWs(socket);
      } catch {
        setConnected(false);
        setConnecting(false);
      }
    };

    connectWs();

    // Periodic metrics poll every 4s
    pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "poll_metrics",
            method: "system.metrics",
          })
        );
      }
    }, 4000);

    return () => {
      disposed = true;
      if (pingInterval) clearInterval(pingInterval);
      if (socket) {
        try {
          socket.close();
        } catch {}
      }
    };
  }, [host, port, token, setConnected, setConnecting, setMetrics, setAntigravityConfig, addTerminalLog]);

  // Execute terminal command via WebSocket or HTTP fallback
  const handleExecuteTerminal = async (customCommand?: string) => {
    const cmd = customCommand || terminalInput;
    if (!cmd.trim()) return;

    setTerminalExecuting(true);
    setLastBlockedReason(null);
    addTerminalLog({ text: `$ ${cmd}`, stream: "info" });
    if (!customCommand) setTerminalInput("");

    try {
      const res = await fetch(`http://${host}:${port}/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `cmd_${Date.now()}`,
          method: "terminal.exec",
          params: { command: cmd },
        }),
      });

      const data = await res.json();
      if (data.result) {
        if (!data.result.allowed) {
          setLastBlockedReason(data.result.reason || "Destructive command blocked by guard");
          addTerminalLog({
            text: `[GUARD BLOCKED] ${data.result.reason || "Destructive command pattern detected"}`,
            stream: "warn",
          });
        } else if (data.result.output) {
          addTerminalLog({
            text: data.result.output,
            stream: data.result.exitCode === 0 ? "stdout" : "stderr",
          });
        }
      } else if (data.error) {
        addTerminalLog({
          text: `[ERROR] ${data.error.message}`,
          stream: "error",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addTerminalLog({
        text: `[NETWORK ERROR] Failed to reach daemon: ${msg}`,
        stream: "error",
      });
    } finally {
      setTerminalExecuting(false);
    }
  };

  // Run macro preset
  const handleRunMacro = async (macroId: string, label: string) => {
    setMacroStatus(macroId, "running");
    addTerminalLog({ text: `[MACRO] Running ${label}...`, stream: "info" });

    try {
      const res = await fetch(`http://${host}:${port}/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `macro_${Date.now()}`,
          method: "macro.run",
          params: { macroId },
        }),
      });

      const data = await res.json();
      if (data.result?.allowed) {
        setMacroStatus(macroId, "success");
        if (data.result.output) {
          addTerminalLog({ text: data.result.output, stream: "stdout" });
        }
      } else {
        setMacroStatus(macroId, "error");
        if (data.result?.reason) {
          addTerminalLog({ text: `[MACRO BLOCKED] ${data.result.reason}`, stream: "warn" });
        }
      }
    } catch {
      setMacroStatus(macroId, "error");
    } finally {
      setTimeout(() => setMacroStatus(macroId, "idle"), 2500);
    }
  };

  // Dispatch prompt chip to clipboard or Antigravity
  const handlePromptChip = (chipText: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(chipText);
      setCopiedPrompt(chipText);
      setTimeout(() => setCopiedPrompt(null), 2000);
    }
  };

  // Save Antigravity Remote URL
  const handleSaveRemoteUrl = async () => {
    if (!remoteUrlInput.trim()) return;
    try {
      await fetch(`http://${host}:${port}/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `set_remote_${Date.now()}`,
          method: "antigravity.setRemoteUrl",
          params: { remoteUrl: remoteUrlInput },
        }),
      });
      setAntigravityConfig({ remoteUrl: remoteUrlInput, enabled: true });
    } catch {}
  };

  // 12 Tactical Macro Definitions
  const macros = [
    { id: "typecheck", label: "Run Typecheck", icon: Play, desc: "npm run typecheck" },
    { id: "build-mobile", label: "Build Mobile Bundle", icon: HardDrive, customCmd: "npm run cap:build", desc: "Build & sync Android" },
    { id: "adb-install", label: "ADB Install APK", icon: Smartphone, customCmd: "adb install -r android/app/build/outputs/apk/debug/app-debug.apk", desc: "Push fresh APK" },
    { id: "adb-devices", label: "Check ADB Devices", icon: Activity, desc: "List attached devices" },
    { id: "git-status", label: "Git Status", icon: SlidersHorizontal, desc: "Inspect dirty tree" },
    { id: "gpu-stats", label: "GPU & Temp Check", icon: Flame, desc: "NVIDIA telemetry" },
    { id: "media-play-pause", label: "Media Play/Pause", icon: Play, desc: "Host audio control" },
    { id: "volume-mute", label: "Mute Audio", icon: VolumeMuteIcon, desc: "Host mute toggle" },
    { id: "ag-remote", label: "Open AG Remote", icon: ExternalLink, action: () => setActiveDeck("antigravity"), desc: "Switch to AG Deck" },
    { id: "restart-daemon", label: "Restart Daemon", icon: RotateCw, customCmd: "echo 'Daemon ping OK'", desc: "Keepalive check" },
    { id: "clear-term", label: "Clear Terminal", icon: Trash2, action: clearTerminalLogs, desc: "Wipe screen logs" },
    { id: "pair-device", label: "Pair New Device", icon: Wifi, action: () => setPairingModalOpen(true), desc: "Open 4-tier pairing" },
  ];

  // Posture selector icons
  const postureOptions: { id: DevicePosture; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "slab", label: "Slab", icon: Smartphone },
    { id: "flip-tabletop", label: "Tabletop", icon: Monitor },
    { id: "fold-expanded", label: "Expanded", icon: Tablet },
    { id: "dual-screen", label: "Dual-Screen", icon: BookOpen },
  ];

  // Render Tactical Decks
  const renderDeckContent = (deckId: TacticalDeckId) => {
    switch (deckId) {
      case "macros":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {macros.map((m) => {
              const Icon = m.icon;
              const status = macroStatus[m.id] || "idle";
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.action) m.action();
                    else if (m.customCmd) handleExecuteTerminal(m.customCmd);
                    else handleRunMacro(m.id, m.label);
                  }}
                  className={`group flex flex-col items-start justify-between rounded-xl p-3.5 border text-left transition-all active:scale-[0.98] ${
                    status === "running"
                      ? "border-[#F7E7CE] bg-[#102C26]/80 text-[#F7E7CE]"
                      : status === "success"
                      ? "border-emerald-500/60 bg-emerald-950/30 text-emerald-200"
                      : status === "error"
                      ? "border-red-500/60 bg-red-950/30 text-red-200"
                      : "border-[#A79277]/25 bg-[#102C26]/40 text-[#F7E7CE] hover:border-[#F7E7CE]/60 hover:bg-[#102C26]/70"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="rounded-lg bg-[#090D0C]/60 p-2 border border-[#A79277]/20 group-hover:border-[#F7E7CE]/40">
                      <Icon className={`w-4 h-4 ${status === "running" ? "animate-spin text-[#F7E7CE]" : "text-[#F7E7CE]"}`} />
                    </div>
                    {status === "running" && <span className="text-[10px] uppercase font-bold text-[#F7E7CE]">Busy</span>}
                    {status === "success" && <span className="text-[10px] uppercase font-bold text-emerald-400">Done</span>}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#F7E7CE] leading-tight">{m.label}</h4>
                    <p className="text-[11px] text-[#A79277] mt-0.5">{m.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        );

      case "antigravity":
        return (
          <div className="flex flex-col gap-4 p-4">
            {/* Remote Session Launcher */}
            <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/40 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#F7E7CE]" />
                  <h3 className="text-sm font-bold text-[#F7E7CE]">Antigravity Remote Control Bridge</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#090D0C] text-[#F7E7CE] border border-[#A79277]/30">
                  {antigravityConfig.enabled ? "Active" : "Ready to Link"}
                </span>
              </div>
              <p className="text-xs text-[#A79277]">
                Connect to native Antigravity remote control session (from Antigravity Settings &gt; Enable Remote Control):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remoteUrlInput}
                  onChange={(e) => setRemoteUrlInput(e.target.value)}
                  placeholder="https://antigravity.google.com/remote?instance=..."
                  className="flex-1 rounded-xl border border-[#A79277]/30 bg-[#090D0C]/80 px-3 py-2 text-xs text-[#F7E7CE] focus:border-[#F7E7CE] focus:outline-none"
                />
                <button
                  onClick={handleSaveRemoteUrl}
                  className="rounded-xl bg-[#F7E7CE] px-3.5 py-2 text-xs font-bold text-[#090D0C] hover:bg-white active:scale-95 transition-all"
                >
                  Save Link
                </button>
              </div>
              {antigravityConfig.remoteUrl && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[#A79277] truncate max-w-xs">{antigravityConfig.remoteUrl}</span>
                  <a
                    href={antigravityConfig.remoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs font-bold text-[#F7E7CE] hover:underline"
                  >
                    Open Session
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Prompt Dispatch Chips */}
            <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/40 p-4 flex flex-col gap-3">
              <h4 className="text-xs uppercase font-bold tracking-wider text-[#A79277]">
                1-Tap Prompt Dispatch Chips
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    agent: "omni-tool",
                    title: "🤖 omni-tool",
                    prompt: "Inspect active workspace, run typecheck, and list dirty Git files.",
                  },
                  {
                    agent: "jarvis",
                    title: "🧠 jarvis",
                    prompt: "Summarize recent system metrics and build Android mobile bundle.",
                  },
                  {
                    agent: "gravktrl",
                    title: "⚡ gravktrl",
                    prompt: "Verify PC daemon WebSocket bridge and ADB devices state.",
                  },
                ].map((chip) => (
                  <div
                    key={chip.agent}
                    className="flex flex-col justify-between rounded-xl border border-[#A79277]/25 bg-[#090D0C]/60 p-3 hover:border-[#F7E7CE]/50 transition-all"
                  >
                    <div>
                      <span className="text-xs font-bold text-[#F7E7CE] block mb-1">{chip.title}</span>
                      <p className="text-[11px] text-[#A79277] line-clamp-2">{chip.prompt}</p>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <button
                        onClick={() => handlePromptChip(chip.prompt)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[#102C26] py-1.5 text-[11px] font-semibold text-[#F7E7CE] border border-[#A79277]/30 hover:border-[#F7E7CE]/60 active:scale-95 transition-all"
                      >
                        {copiedPrompt === chip.prompt ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleExecuteTerminal(`echo "${chip.prompt}"`)}
                        className="flex items-center justify-center rounded-lg bg-[#F7E7CE] px-2.5 py-1.5 text-[11px] font-bold text-[#090D0C] hover:bg-white active:scale-95 transition-all"
                      >
                        Dispatch
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "terminal":
        return (
          <div className="flex flex-col h-full bg-[#090D0C]">
            {/* Warning banner if blocked */}
            {lastBlockedReason && (
              <div className="flex items-center gap-2 border-b border-red-500/40 bg-red-950/40 px-4 py-2 text-xs text-red-200">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>Security Block: {lastBlockedReason}</span>
              </div>
            )}

            {/* Output log */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-[#F7E7CE] space-y-1.5 min-h-[220px]">
              {terminalLogs.map((log) => (
                <div
                  key={log.id}
                  className={`leading-relaxed break-words ${
                    log.stream === "warn"
                      ? "text-amber-300 font-semibold"
                      : log.stream === "error"
                      ? "text-red-400 font-semibold"
                      : log.stream === "info"
                      ? "text-[#A79277]"
                      : "text-[#F7E7CE]"
                  }`}
                >
                  {log.text}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-[#A79277]/20 bg-[#102C26]/40 p-3 flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#F7E7CE]">&gt;_</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleExecuteTerminal();
                }}
                disabled={isTerminalExecuting}
                placeholder="Enter guarded PowerShell command (e.g. git status, adb devices)..."
                className="flex-1 font-mono text-xs bg-transparent text-[#F7E7CE] placeholder-[#A79277]/60 focus:outline-none"
              />
              <button
                onClick={() => handleExecuteTerminal()}
                disabled={isTerminalExecuting || !terminalInput.trim()}
                className="rounded-lg bg-[#F7E7CE] p-2 text-[#090D0C] hover:bg-white disabled:opacity-40 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );

      case "trackpad":
        return (
          <div className="flex flex-col h-full p-4 gap-4">
            {/* Live Telemetry Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-[#F7E7CE]" /> CPU Cores
                </span>
                <span className="text-xl font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.cpuCount || "--"} Cores
                </span>
                <span className="text-[10px] text-[#A79277] truncate">{metrics?.cpuModel || "Detected CPU"}</span>
              </div>

              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Activity className="w-3 h-3 text-[#F7E7CE]" /> RAM Usage
                </span>
                <span className="text-xl font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.memoryUsedPercent !== undefined ? `${metrics.memoryUsedPercent}%` : "--%"}
                </span>
                <span className="text-[10px] text-[#A79277]">
                  {metrics?.totalMemory ? `${Math.round(metrics.totalMemory / 1024 / 1024 / 1024)} GB Total` : "--"}
                </span>
              </div>

              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/40 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[#F7E7CE]" /> GPU Temp
                </span>
                <span className="text-xl font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.gpu?.temperature !== undefined ? `${metrics.gpu.temperature}°C` : "N/A"}
                </span>
                <span className="text-[10px] text-[#A79277] truncate">
                  {metrics?.gpu?.name || "NVIDIA / Integrated"}
                </span>
              </div>
            </div>

            {/* Virtual Trackpad Canvas */}
            <div
              ref={trackpadRef}
              className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-[#A79277]/30 bg-[#090D0C]/80 p-6 select-none relative overflow-hidden"
            >
              <MousePointer className="w-8 h-8 text-[#A79277]/40 mb-2" />
              <p className="text-xs font-semibold text-[#F7E7CE]">Multi-Touch Gesture Trackpad</p>
              <p className="text-[11px] text-[#A79277] mt-1 text-center">
                Tap for Left Click • Two Fingers for Right Click • Drag to Scroll
              </p>

              {/* Physical Click Bars */}
              <div className="absolute bottom-3 inset-x-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => addTerminalLog({ text: "[INPUT] Left Click", stream: "info" })}
                  className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/70 py-3 text-xs font-bold text-[#F7E7CE] hover:bg-[#102C26] active:scale-95 transition-all"
                >
                  Left Click
                </button>
                <button
                  onClick={() => addTerminalLog({ text: "[INPUT] Right Click", stream: "info" })}
                  className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/70 py-3 text-xs font-bold text-[#F7E7CE] hover:bg-[#102C26] active:scale-95 transition-all"
                >
                  Right Click
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090D0C] text-[#F7E7CE] flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#A79277]/25 bg-[#102C26]/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <GravKtrlLogo size="sm" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#F7E7CE] flex items-center gap-2">
              GravKtrl
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#090D0C] text-[#A79277] border border-[#A79277]/30 font-mono">
                v0.1.0
              </span>
            </h1>
            <p className="text-[11px] text-[#A79277]">Mobile Agent Deck</p>
          </div>
        </div>

        {/* Posture & Pairing Actions */}
        <div className="flex items-center gap-2">
          {/* Posture Override Pill */}
          <div className="flex items-center bg-[#090D0C]/80 rounded-xl p-1 border border-[#A79277]/30">
            {postureOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = effectivePosture === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setManualOverride(opt.id)}
                  title={`Posture: ${opt.label}`}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/40 shadow-sm"
                      : "text-[#A79277] hover:text-[#F7E7CE]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Connection Status Button */}
          <button
            onClick={() => setPairingModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              isConnected
                ? "bg-[#102C26] text-[#F7E7CE] border-emerald-500/50"
                : isConnecting
                ? "bg-[#102C26] text-amber-300 border-amber-500/50"
                : "bg-red-950/40 text-red-300 border-red-500/50"
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">Online</span>
              </>
            ) : isConnecting ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden xs:inline">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Pair PC</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Multi-Posture Responsive Container */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Posture Mode: fold-expanded (2-Column Split Workstation) */}
        {effectivePosture === "fold-expanded" && (
          <div className="flex-1 grid grid-cols-2 divide-x divide-[#A79277]/20 overflow-hidden">
            <div className="flex flex-col h-full overflow-y-auto border-r border-[#A79277]/20">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/30 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">Left Deck: Macros &amp; Antigravity</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderDeckContent("macros")}
                <div className="border-t border-[#A79277]/20">
                  {renderDeckContent("antigravity")}
                </div>
              </div>
            </div>

            <div className="flex flex-col h-full overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/30 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">Right Deck: Guarded Terminal &amp; Trackpad</span>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-1/2 border-b border-[#A79277]/20 overflow-hidden">
                  {renderDeckContent("terminal")}
                </div>
                <div className="h-1/2 overflow-hidden">
                  {renderDeckContent("trackpad")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Posture Mode: dual-screen (Dual Pane with 24px Center Hinge Gutter) */}
        {effectivePosture === "dual-screen" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Screen */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/30">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">Screen 1: Tactical Controls</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderDeckContent(activeDeck === "terminal" ? "macros" : activeDeck)}
              </div>
            </div>

            {/* 24px Center Hinge Gutter */}
            <div className="w-6 bg-[#090D0C] border-x border-[#A79277]/30 flex items-center justify-center shrink-0">
              <div className="w-1 h-20 rounded-full bg-[#A79277]/30" />
            </div>

            {/* Right Screen */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/30">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">Screen 2: Guarded Shell</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderDeckContent("terminal")}
              </div>
            </div>
          </div>
        )}

        {/* Posture Mode: flip-tabletop (Clamshell Upper Telemetry Screen + Lower Tactile Deck) */}
        {effectivePosture === "flip-tabletop" && (
          <div className="flex-1 flex flex-col divide-y divide-[#A79277]/30 overflow-hidden">
            {/* Upper Telemetry Screen */}
            <div className="h-1/2 overflow-hidden bg-[#090D0C]">
              {renderDeckContent("terminal")}
            </div>
            {/* Lower Tactile Deck */}
            <div className="h-1/2 overflow-y-auto bg-[#102C26]/20">
              {renderDeckContent(activeDeck === "terminal" ? "macros" : activeDeck)}
            </div>
          </div>
        )}

        {/* Posture Mode: slab (Standard Smartphone Portrait Single-Deck View) */}
        {effectivePosture === "slab" && (
          <div className="flex-1 overflow-y-auto">
            {renderDeckContent(activeDeck)}
          </div>
        )}
      </main>

      {/* Bottom Deck Navigation Bar (for slab & flip-tabletop) */}
      {(effectivePosture === "slab" || effectivePosture === "flip-tabletop") && (
        <nav className="border-t border-[#A79277]/25 bg-[#102C26]/80 backdrop-blur-md px-3 py-2 grid grid-cols-4 gap-1.5 shrink-0">
          {[
            { id: "macros" as TacticalDeckId, label: "Macros", icon: Layers },
            { id: "antigravity" as TacticalDeckId, label: "Antigravity", icon: Bot },
            { id: "terminal" as TacticalDeckId, label: "Terminal", icon: Terminal },
            { id: "trackpad" as TacticalDeckId, label: "Trackpad", icon: MousePointer },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeDeck === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveDeck(item.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                  isSelected
                    ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/40 shadow-sm"
                    : "text-[#A79277] hover:text-[#F7E7CE]"
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* 4-Tier Zero-Type Pairing Modal */}
      <ZeroTypePairingModal />
    </div>
  );
}

// Icon helper
function VolumeMuteIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
