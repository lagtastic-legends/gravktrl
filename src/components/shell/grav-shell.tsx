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

interface PendingRpc {
  resolve: (result: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function GravShell() {
  const { effectivePosture, setManualOverride } = usePosture();
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
    latencyMs,
    setLatencyMs,
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

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRpcRef = useRef<Map<string, PendingRpc>>(new Map());
  const streamedExecIdsRef = useRef<Set<string>>(new Set());
  const lastTouchRef = useRef<{ x: number; y: number; touches: number; moved: boolean; startTime: number } | null>(null);
  const lastMoveSentRef = useRef<number>(0);

  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [remoteUrlInput, setRemoteUrlInput] = useState(antigravityConfig.remoteUrl || "");
  const [trackpadFeedback, setTrackpadFeedback] = useState<string>("Ready");
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Unified JSON-RPC 2.0 dispatcher (WebSocket first, HTTP /api/rpc fallback)
  const sendRpc = useCallback(
    async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
      const ws = wsRef.current;
      const rpcId = `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      if (ws && ws.readyState === WebSocket.OPEN) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingRpcRef.current.delete(rpcId);
            reject(new Error(`RPC timeout: ${method}`));
          }, 10000);

          pendingRpcRef.current.set(rpcId, { resolve, reject, timer });
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }));
        });
      }

      const res = await fetch(`http://${host}:${port}/api/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
      }
      if (data.error) {
        throw new Error(data.error.message || "RPC Error");
      }
      return data.result;
    },
    [host, port, token]
  );

  // WebSocket auto-reconnect + latency ping + telemetry polling
  useEffect(() => {
    if (!host || !port) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const cleanupPending = () => {
      for (const [, pending] of pendingRpcRef.current) {
        clearTimeout(pending.timer);
        pending.reject(new Error("WebSocket disconnected"));
      }
      pendingRpcRef.current.clear();
    };

    const connectWs = () => {
      if (disposed) return;
      try {
        setConnecting(true);
        const wsUrl = `ws://${host}:${port}/?token=${encodeURIComponent(token || "")}`;
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (disposed) {
            socket.close();
            return;
          }
          attempt = 0;
          setConnected(true);
          setConnecting(false);

          // Initial metrics + remote config + ping
          const pingStart = performance.now();
          const pingId = `ping_${Date.now()}`;
          pendingRpcRef.current.set(pingId, {
            resolve: () => setLatencyMs(Math.max(1, Math.round(performance.now() - pingStart))),
            reject: () => {},
            timer: setTimeout(() => pendingRpcRef.current.delete(pingId), 4000),
          });
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: pingId, method: "system.ping" }));
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: "init_metrics", method: "system.metrics" }));
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: "init_ag_config", method: "antigravity.getRemoteConfig" }));
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.id && pendingRpcRef.current.has(data.id)) {
              const pending = pendingRpcRef.current.get(data.id)!;
              pendingRpcRef.current.delete(data.id);
              clearTimeout(pending.timer);
              if (data.error) pending.reject(new Error(data.error.message || "RPC Error"));
              else pending.resolve(data.result);
              return;
            }

            if (data.result) {
              if (data.id === "init_metrics" || data.id === "poll_metrics") {
                setMetrics(data.result);
              } else if (data.id === "init_ag_config") {
                setAntigravityConfig({
                  remoteUrl: data.result.remoteUrl || "",
                  enabled: Boolean(data.result.enabled),
                  instanceId: data.result.instanceId,
                  companionOrigin: data.result.companionOrigin,
                });
                if (data.result.remoteUrl) {
                  setRemoteUrlInput(data.result.remoteUrl);
                }
              }
            } else if (data.method === "terminal.output" && data.params) {
              if (data.params.executionId) {
                streamedExecIdsRef.current.add(data.params.executionId);
              }
              const text = String(data.params.chunk || "").trimEnd();
              if (text) {
                addTerminalLog({
                  text,
                  stream: data.params.stream || "stdout",
                });
              }
            }
          } catch {}
        };

        const scheduleReconnect = () => {
          if (disposed) return;
          setConnected(false);
          setConnecting(false);
          setLatencyMs(null);
          cleanupPending();
          const backoffMs = Math.min(10000, 1000 * Math.pow(1.5, attempt));
          attempt += 1;
          reconnectTimer = setTimeout(connectWs, backoffMs);
        };

        socket.onclose = scheduleReconnect;
        socket.onerror = () => {
          try {
            socket.close();
          } catch {}
        };
      } catch {
        setConnected(false);
        setConnecting(false);
      }
    };

    connectWs();

    pollInterval = setInterval(() => {
      const s = wsRef.current;
      if (s && s.readyState === WebSocket.OPEN) {
        const pingStart = performance.now();
        const pingId = `ping_${Date.now()}`;
        pendingRpcRef.current.set(pingId, {
          resolve: () => setLatencyMs(Math.max(1, Math.round(performance.now() - pingStart))),
          reject: () => {},
          timer: setTimeout(() => pendingRpcRef.current.delete(pingId), 4000),
        });
        s.send(JSON.stringify({ jsonrpc: "2.0", id: pingId, method: "system.ping" }));
        s.send(JSON.stringify({ jsonrpc: "2.0", id: "poll_metrics", method: "system.metrics" }));
      }
    }, 4000);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollInterval) clearInterval(pollInterval);
      cleanupPending();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, [host, port, token, setConnected, setConnecting, setLatencyMs, setMetrics, setAntigravityConfig, addTerminalLog]);

  // Execute guarded terminal command
  const handleExecuteTerminal = async (customCommand?: string) => {
    const cmd = customCommand || terminalInput;
    if (!cmd.trim()) return;

    setTerminalExecuting(true);
    setLastBlockedReason(null);
    addTerminalLog({ text: `$ ${cmd}`, stream: "info" });
    if (!customCommand) setTerminalInput("");

    try {
      const result = await sendRpc("terminal.exec", { command: cmd });
      if (result) {
        if (!result.allowed) {
          setLastBlockedReason(result.reason || "Destructive command blocked by security guard");
          addTerminalLog({
            text: `[GUARD BLOCKED] ${result.reason || "Destructive command pattern detected"}`,
            stream: "warn",
          });
        } else if (result.output && !streamedExecIdsRef.current.has(result.executionId)) {
          addTerminalLog({
            text: result.output,
            stream: result.exitCode === 0 ? "stdout" : "stderr",
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addTerminalLog({
        text: `[ERROR] ${msg}`,
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
      const result = await sendRpc("macro.run", { macroId });
      if (result?.allowed) {
        setMacroStatus(macroId, "success");
        if (result.output && !streamedExecIdsRef.current.has(result.executionId)) {
          addTerminalLog({ text: result.output, stream: "stdout" });
        }
      } else {
        setMacroStatus(macroId, "error");
        if (result?.reason) {
          addTerminalLog({ text: `[MACRO BLOCKED] ${result.reason}`, stream: "warn" });
        }
      }
    } catch (err: unknown) {
      setMacroStatus(macroId, "error");
      const msg = err instanceof Error ? err.message : String(err);
      addTerminalLog({ text: `[MACRO ERROR] ${msg}`, stream: "error" });
    } finally {
      setTimeout(() => setMacroStatus(macroId, "idle"), 2000);
    }
  };

  // Copy prompt chip & dispatch to Antigravity bridge / terminal
  const handlePromptChip = (chipText: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(chipText);
      setCopiedPrompt(chipText);
      setTimeout(() => setCopiedPrompt(null), 2000);
    }
  };

  const handleSaveRemoteUrl = async () => {
    if (!remoteUrlInput.trim()) return;
    try {
      const res = await sendRpc("antigravity.setRemoteUrl", { url: remoteUrlInput.trim() });
      setAntigravityConfig({ remoteUrl: res?.remoteUrl || remoteUrlInput.trim(), enabled: true });
      addTerminalLog({ text: `[ANTIGRAVITY] Linked Remote Control URL`, stream: "info" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addTerminalLog({ text: `[ANTIGRAVITY ERROR] ${msg}`, stream: "error" });
    }
  };

  // Virtual Trackpad input emitter
  const sendTrackpadInput = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      setTrackpadFeedback(label);
      try {
        await sendRpc("screen.input", { target: "desktop", ...payload });
      } catch {}
    },
    [sendRpc]
  );

  const handleTrackpadTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t) return;
    lastTouchRef.current = {
      x: t.clientX,
      y: t.clientY,
      touches: e.touches.length,
      moved: false,
      startTime: Date.now(),
    };
  };

  const handleTrackpadTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    const prev = lastTouchRef.current;
    if (!t || !prev) return;

    const dx = Math.round((t.clientX - prev.x) * 1.6);
    const dy = Math.round((t.clientY - prev.y) * 1.6);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      prev.moved = true;
    }

    const now = Date.now();
    if (now - lastMoveSentRef.current < 32) return;
    lastMoveSentRef.current = now;

    prev.x = t.clientX;
    prev.y = t.clientY;
    prev.touches = Math.max(prev.touches, e.touches.length);

    if (e.touches.length >= 2) {
      sendTrackpadInput({ type: "scroll", normX: 0.5, normY: 0.5, deltaY: dy * -3 }, `Scroll (${dy > 0 ? "Down" : "Up"})`);
    } else if (dx !== 0 || dy !== 0) {
      sendTrackpadInput({ type: "move", dx, dy }, `Move (${dx > 0 ? "+" : ""}${dx}, ${dy > 0 ? "+" : ""}${dy})`);
    }
  };

  const handleTrackpadTouchEnd = () => {
    const prev = lastTouchRef.current;
    if (!prev) return;
    const elapsed = Date.now() - prev.startTime;
    if (!prev.moved && elapsed < 260) {
      if (prev.touches >= 2) {
        sendTrackpadInput({ type: "right_click", normX: 0.5, normY: 0.5 }, "2-Finger Right Click");
      } else {
        sendTrackpadInput({ type: "click", normX: 0.5, normY: 0.5 }, "Tap Left Click");
      }
    }
    lastTouchRef.current = null;
  };

  // 12 Tactical Macro Definitions
  const macros = [
    { id: "typecheck", label: "Run Typecheck", icon: Play, desc: "npm run typecheck" },
    { id: "build-mobile", label: "Build Mobile Bundle", icon: HardDrive, desc: "npm run build:mobile" },
    { id: "adb-install", label: "ADB Install APK", icon: Smartphone, customCmd: "adb install -r android/app/build/outputs/apk/debug/app-debug.apk", desc: "Push fresh APK" },
    { id: "adb-devices", label: "Check ADB Devices", icon: Activity, desc: "adb devices" },
    { id: "git-status", label: "Git Status", icon: SlidersHorizontal, desc: "git status" },
    { id: "gpu-stats", label: "GPU & Temp Check", icon: Flame, desc: "nvidia-smi telemetry" },
    { id: "media-play-pause", label: "Media Play/Pause", icon: Play, desc: "Host media toggle" },
    { id: "volume-mute", label: "Mute Audio", icon: VolumeMuteIcon, desc: "Host mute toggle" },
    { id: "ag-remote", label: "Open AG Remote", icon: ExternalLink, action: () => setActiveDeck("antigravity"), desc: "Switch to AG Deck" },
    { id: "restart-daemon", label: "Restart Daemon", icon: RotateCw, customCmd: "echo 'GravKtrl daemon online ping'", desc: "Verify RPC ping" },
    { id: "clear-term", label: "Clear Terminal", icon: Trash2, action: clearTerminalLogs, desc: "Wipe screen logs" },
    { id: "pair-device", label: "Pair New Device", icon: Wifi, action: () => setPairingModalOpen(true), desc: "4-tier zero-type modal" },
  ];

  const postureOptions: { id: DevicePosture; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "slab", label: "Slab", icon: Smartphone },
    { id: "flip-tabletop", label: "Tabletop", icon: Monitor },
    { id: "fold-expanded", label: "Expanded", icon: Tablet },
    { id: "dual-screen", label: "Dual-Screen", icon: BookOpen },
  ];

  const cpuLoadPct = metrics?.loadAvg?.[0] && metrics?.cpuCount
    ? Math.min(100, Math.round((metrics.loadAvg[0] / metrics.cpuCount) * 100))
    : 0;
  const ramPct = metrics?.memoryUsedPercent ?? 0;

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
                  className={`group flex flex-col items-start justify-between rounded-xl p-3.5 border text-left transition-transform duration-150 active:scale-[0.97] ${
                    status === "running"
                      ? "border-[#F7E7CE] bg-[#102C26]/90 text-[#F7E7CE]"
                      : status === "success"
                      ? "border-emerald-500/60 bg-emerald-950/35 text-emerald-200"
                      : status === "error"
                      ? "border-red-500/60 bg-red-950/35 text-red-200"
                      : "border-[#A79277]/25 bg-[#102C26]/45 text-[#F7E7CE] hover:border-[#F7E7CE]/60 hover:bg-[#102C26]/75"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="rounded-lg bg-[#090D0C]/80 p-2 border border-[#A79277]/20 group-hover:border-[#F7E7CE]/40">
                      <Icon className={`w-4 h-4 ${status === "running" ? "animate-spin text-[#F7E7CE]" : "text-[#F7E7CE]"}`} />
                    </div>
                    {status === "running" && <span className="text-[10px] uppercase font-bold text-[#F7E7CE]">Busy</span>}
                    {status === "success" && <span className="text-[10px] uppercase font-bold text-emerald-400">Done</span>}
                    {status === "error" && <span className="text-[10px] uppercase font-bold text-red-400">Err</span>}
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
            <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/45 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#F7E7CE]" />
                  <h3 className="text-sm font-bold text-[#F7E7CE]">Antigravity Remote Control Bridge</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#090D0C] text-[#F7E7CE] border border-[#A79277]/30">
                  {antigravityConfig.enabled ? "Linked" : "Ready"}
                </span>
              </div>
              <p className="text-xs text-[#A79277]">
                Connect directly to local Antigravity agents (<code className="text-[#F7E7CE]">Settings &rarr; Enable Remote Control</code>):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remoteUrlInput}
                  onChange={(e) => setRemoteUrlInput(e.target.value)}
                  placeholder="https://antigravity.google.com/r/..."
                  className="flex-1 rounded-xl border border-[#A79277]/35 !bg-[#090D0C] px-3 py-2 text-xs !text-[#F7E7CE] focus:border-[#F7E7CE] focus:outline-none"
                />
                <button
                  onClick={handleSaveRemoteUrl}
                  className="rounded-xl bg-[#F7E7CE] px-3.5 py-2 text-xs font-bold text-[#090D0C] hover:opacity-90 active:scale-95 transition-transform"
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
                    Launch Bridge
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Prompt Dispatch Templates for omni-tool, jarvis, gravktrl */}
            <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/45 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase font-bold tracking-wider text-[#A79277]">
                  1-Tap Agent Prompt Dispatch
                </h4>
                <span className="text-[11px] font-mono text-[#F7E7CE]">
                  Target: {antigravityConfig.activeAgent}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    agent: "omni-tool" as const,
                    title: "🤖 omni-tool",
                    prompt: "Inspect active workspace, run typecheck, and list dirty Git files.",
                  },
                  {
                    agent: "jarvis" as const,
                    title: "🧠 jarvis",
                    prompt: "Summarize PC telemetry metrics and build Android mobile bundle.",
                  },
                  {
                    agent: "gravktrl" as const,
                    title: "⚡ gravktrl",
                    prompt: "Verify PC daemon WebSocket bridge and connected ADB devices.",
                  },
                ].map((chip) => {
                  const isActiveAgent = antigravityConfig.activeAgent === chip.agent;
                  return (
                    <div
                      key={chip.agent}
                      onClick={() => setActiveAgent(chip.agent)}
                      className={`cursor-pointer flex flex-col justify-between rounded-xl border p-3 transition-colors ${
                        isActiveAgent
                          ? "border-[#F7E7CE]/70 bg-[#090D0C]/90"
                          : "border-[#A79277]/25 bg-[#090D0C]/60 hover:border-[#F7E7CE]/50"
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-[#F7E7CE] block mb-1">{chip.title}</span>
                        <p className="text-[11px] text-[#A79277] line-clamp-2">{chip.prompt}</p>
                      </div>
                      <div className="flex gap-1.5 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePromptChip(chip.prompt);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[#102C26] py-1.5 text-[11px] font-semibold text-[#F7E7CE] border border-[#A79277]/30 hover:border-[#F7E7CE]/60 active:scale-95 transition-transform"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAgent(chip.agent);
                            handleExecuteTerminal(`echo "[DISPATCH:${chip.agent}] ${chip.prompt}"`);
                          }}
                          className="flex items-center justify-center rounded-lg bg-[#F7E7CE] px-2.5 py-1.5 text-[11px] font-bold text-[#090D0C] hover:opacity-90 active:scale-95 transition-transform"
                        >
                          Dispatch
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case "terminal":
        return (
          <div className="flex flex-col h-full bg-[#090D0C]">
            {lastBlockedReason && (
              <div className="flex items-center gap-2 border-b border-red-500/40 bg-red-950/60 px-4 py-2 text-xs text-red-200">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>Command Guard Blocked: {lastBlockedReason}</span>
              </div>
            )}

            {/* Output log */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-[#F7E7CE] space-y-1.5 min-h-[200px]">
              {terminalLogs.map((log) => (
                <div
                  key={log.id}
                  className={`leading-relaxed break-words whitespace-pre-wrap ${
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

            {/* Input bar enforcing !bg-[#090D0C] !text-[#F7E7CE] */}
            <div className="border-t border-[#A79277]/25 bg-[#102C26]/45 p-3 flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#F7E7CE]">&gt;_</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleExecuteTerminal();
                }}
                disabled={isTerminalExecuting}
                placeholder="Enter guarded command (e.g. git status, adb devices)..."
                className="flex-1 font-mono text-xs rounded-lg border border-[#A79277]/30 px-2.5 py-2 !bg-[#090D0C] !text-[#F7E7CE] placeholder-[#A79277]/65 focus:border-[#F7E7CE] focus:outline-none"
              />
              <button
                onClick={() => handleExecuteTerminal()}
                disabled={isTerminalExecuting || !terminalInput.trim()}
                className="rounded-lg bg-[#F7E7CE] p-2 text-[#090D0C] hover:opacity-90 active:scale-95 transition-transform disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );

      case "trackpad":
        return (
          <div className="flex flex-col h-full p-4 gap-4">
            {/* Live Telemetry Gauges */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/45 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-[#F7E7CE]" /> CPU
                </span>
                <span className="text-lg font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.cpuCount ? `${metrics.cpuCount}c` : "--"}
                  {metrics ? ` · ${cpuLoadPct}%` : ""}
                </span>
                <div className="w-full h-1.5 rounded-full bg-[#090D0C] overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[#F7E7CE] origin-left transition-transform duration-300"
                    style={{ transform: `scaleX(${Math.max(0.05, cpuLoadPct / 100)})` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/45 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Activity className="w-3 h-3 text-[#F7E7CE]" /> RAM
                </span>
                <span className="text-lg font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.memoryUsedPercent !== undefined ? `${ramPct}%` : "--%"}
                </span>
                <div className="w-full h-1.5 rounded-full bg-[#090D0C] overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[#A79277] origin-left transition-transform duration-300"
                    style={{ transform: `scaleX(${Math.max(0.05, ramPct / 100)})` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/45 p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-[#A79277] uppercase flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[#F7E7CE]" /> GPU
                </span>
                <span className="text-lg font-bold font-mono text-[#F7E7CE] mt-1">
                  {metrics?.gpu?.temperature !== undefined ? `${metrics.gpu.temperature}°C` : "N/A"}
                </span>
                <span className="text-[10px] text-[#A79277] truncate mt-1">
                  {metrics?.gpu?.memoryTotal
                    ? `${metrics.gpu.memoryUsed ?? 0}/${metrics.gpu.memoryTotal} MB`
                    : metrics?.gpu?.name || "Integrated"}
                </span>
              </div>
            </div>

            {/* Multi-Touch Virtual Trackpad Canvas */}
            <div
              onTouchStart={handleTrackpadTouchStart}
              onTouchMove={handleTrackpadTouchMove}
              onTouchEnd={handleTrackpadTouchEnd}
              onWheel={(e) => sendTrackpadInput({ type: "scroll", normX: 0.5, normY: 0.5, deltaY: Math.round(-e.deltaY) }, "Wheel Scroll")}
              className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-[#A79277]/35 bg-[#090D0C] p-6 select-none relative overflow-hidden touch-none"
            >
              <span className="absolute top-3 right-3 text-[10px] font-mono px-2 py-0.5 rounded bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/30">
                {trackpadFeedback}
              </span>
              <MousePointer className="w-8 h-8 text-[#A79277]/50 mb-2" />
              <p className="text-xs font-semibold text-[#F7E7CE]">Multi-Touch Gesture Trackpad</p>
              <p className="text-[11px] text-[#A79277] mt-1 text-center">
                Drag to Move &bull; Tap = Left Click &bull; 2-Finger Tap = Right Click &bull; 2-Finger Slide = Scroll
              </p>

              <div className="absolute bottom-3 inset-x-3 grid grid-cols-3 gap-2">
                <button
                  onClick={() => sendTrackpadInput({ type: "click", normX: 0.5, normY: 0.5 }, "Left Click")}
                  className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/80 py-2.5 text-xs font-bold text-[#F7E7CE] hover:bg-[#102C26] active:scale-95 transition-transform"
                >
                  Left Click
                </button>
                <button
                  onClick={() => sendTrackpadInput({ type: "scroll", normX: 0.5, normY: 0.5, deltaY: -180 }, "Scroll Down")}
                  className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/80 py-2.5 text-xs font-bold text-[#F7E7CE] hover:bg-[#102C26] active:scale-95 transition-transform"
                >
                  2-Finger Scroll
                </button>
                <button
                  onClick={() => sendTrackpadInput({ type: "right_click", normX: 0.5, normY: 0.5 }, "Right Click")}
                  className="rounded-xl border border-[#A79277]/30 bg-[#102C26]/80 py-2.5 text-xs font-bold text-[#F7E7CE] hover:bg-[#102C26] active:scale-95 transition-transform"
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
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#A79277]/25 bg-[#102C26]/90">
        <div className="flex items-center gap-3">
          <GravKtrlLogo size="sm" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#F7E7CE] flex items-center gap-2">
              GravKtrl
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#090D0C] text-[#A79277] border border-[#A79277]/30 font-mono">
                v0.1.0
              </span>
            </h1>
            <p className="text-[11px] text-[#A79277]">{effectivePosture} workspace</p>
          </div>
        </div>

        {/* Posture & Pairing Actions */}
        <div className="flex items-center gap-2">
          {/* Posture Override Pill */}
          <div className="flex items-center bg-[#090D0C]/90 rounded-xl p-1 border border-[#A79277]/30">
            {postureOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = effectivePosture === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setManualOverride(opt.id)}
                  title={`Posture: ${opt.label}`}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                      ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/45"
                      : "text-[#A79277] hover:text-[#F7E7CE]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Connection Status & Ping Latency Pill */}
          <button
            onClick={() => setPairingModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-transform active:scale-95 border ${
              isConnected
                ? "bg-[#102C26] text-[#F7E7CE] border-emerald-500/50"
                : isConnecting
                ? "bg-[#102C26] text-amber-300 border-amber-500/50"
                : "bg-red-950/50 text-red-300 border-red-500/50"
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">
                  {latencyMs !== null ? `${latencyMs}ms` : "Online"}
                </span>
              </>
            ) : isConnecting ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pair PC</span>
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
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/35 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">
                  Left Deck: Macros &amp; Antigravity
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderDeckContent("macros")}
                <div className="border-t border-[#A79277]/20">
                  {renderDeckContent("antigravity")}
                </div>
              </div>
            </div>

            <div className="flex flex-col h-full overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/35 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">
                  Right Deck: Guarded Terminal &amp; Trackpad
                </span>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-1/2 border-b border-[#A79277]/20 overflow-hidden">
                  {renderDeckContent("terminal")}
                </div>
                <div className="h-1/2 overflow-y-auto">
                  {renderDeckContent("trackpad")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Posture Mode: dual-screen (Dual Pane with 24px Center Hinge Gutter) */}
        {effectivePosture === "dual-screen" && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/35">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">
                  Pane A: Tactical Controls
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderDeckContent(activeDeck === "terminal" ? "macros" : activeDeck)}
              </div>
            </div>

            {/* 24px Center Hinge Gutter */}
            <div className="w-6 bg-[#090D0C] border-x border-[#A79277]/30 flex items-center justify-center shrink-0">
              <div className="w-1 h-20 rounded-full bg-[#A79277]/35" />
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#A79277]/20 bg-[#102C26]/35">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A79277]">
                  Pane B: Guarded Terminal &amp; Telemetry
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderDeckContent("terminal")}
              </div>
            </div>
          </div>
        )}

        {/* Posture Mode: flip-tabletop (Clamshell Upper Screen + Lower Tactile Deck) */}
        {effectivePosture === "flip-tabletop" && (
          <div className="flex-1 flex flex-col divide-y divide-[#A79277]/30 overflow-hidden">
            <div className="h-1/2 overflow-hidden bg-[#090D0C]">
              {renderDeckContent("terminal")}
            </div>
            <div className="h-1/2 overflow-y-auto bg-[#102C26]/20">
              {renderDeckContent(activeDeck === "terminal" ? "macros" : activeDeck)}
            </div>
          </div>
        )}

        {/* Posture Mode: slab (Portrait Smartphone Single-Deck View) */}
        {effectivePosture === "slab" && (
          <div className="flex-1 overflow-y-auto">
            {renderDeckContent(activeDeck)}
          </div>
        )}
      </main>

      {/* Bottom Deck Navigation Bar */}
      {(effectivePosture === "slab" || effectivePosture === "flip-tabletop" || effectivePosture === "dual-screen") && (
        <nav className="border-t border-[#A79277]/25 bg-[#102C26]/95 px-3 py-2 grid grid-cols-4 gap-1.5 shrink-0 pb-safe">
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
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
                  isSelected
                    ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/45"
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