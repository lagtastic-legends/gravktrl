"use client";

import { create } from "zustand";

export type TacticalDeckId = "macros" | "antigravity" | "terminal" | "trackpad";

export interface SystemMetrics {
  hostname: string;
  platform: string;
  release?: string;
  arch?: string;
  cpuCount: number;
  cpuModel: string;
  loadAvg: number[];
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  memoryUsedPercent: number;
  uptime: number;
  gpu?: {
    temperature?: number;
    memoryUsed?: number;
    memoryTotal?: number;
    name?: string;
  } | null;
  timestamp: number;
}

export interface TerminalLogEntry {
  id: string;
  text: string;
  stream: "stdout" | "stderr" | "info" | "warn" | "error";
  timestamp: number;
}

export interface AntigravityRemoteConfig {
  remoteUrl: string;
  enabled: boolean;
  instanceId?: string;
  companionOrigin?: string;
  accountChooserUrl?: string;
  activeAgent: "omni-tool" | "jarvis" | "gravktrl";
}

export interface DiscoveredPcDaemon {
  name: string;
  hostname: string;
  lanIp: string;
  tailscaleIp?: string;
  port: number;
  version: string;
  pairingPinFormatted?: string;
  pin?: string;
}

export interface GravStoreState {
  // Navigation & Decks
  activeDeck: TacticalDeckId;
  setActiveDeck: (deck: TacticalDeckId) => void;

  // Pairing & Connection
  host: string;
  port: number;
  token: string;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  isPairingModalOpen: boolean;
  discoveredDaemons: DiscoveredPcDaemon[];
  isScanning: boolean;
  setPairingModalOpen: (open: boolean) => void;
  setConnectionConfig: (config: { host?: string; port?: number; token?: string }) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (err: string | null) => void;
  setDiscoveredDaemons: (daemons: DiscoveredPcDaemon[]) => void;
  setScanning: (scanning: boolean) => void;

  // PC Telemetry & Metrics
  metrics: SystemMetrics | null;
  setMetrics: (metrics: SystemMetrics) => void;

  // Terminal Deck
  terminalLogs: TerminalLogEntry[];
  terminalInput: string;
  isTerminalExecuting: boolean;
  lastBlockedReason: string | null;
  setTerminalInput: (val: string) => void;
  addTerminalLog: (entry: Omit<TerminalLogEntry, "id" | "timestamp">) => void;
  clearTerminalLogs: () => void;
  setTerminalExecuting: (executing: boolean) => void;
  setLastBlockedReason: (reason: string | null) => void;

  // Antigravity Remote Deck
  antigravityConfig: AntigravityRemoteConfig;
  setAntigravityConfig: (config: Partial<AntigravityRemoteConfig>) => void;
  setActiveAgent: (agent: "omni-tool" | "jarvis" | "gravktrl") => void;

  // Tactical Macro Pad
  macroStatus: Record<string, "idle" | "running" | "success" | "error">;
  setMacroStatus: (macroId: string, status: "idle" | "running" | "success" | "error") => void;
}

export const useGravStore = create<GravStoreState>((set) => ({
  // Navigation
  activeDeck: "macros",
  setActiveDeck: (deck) => set({ activeDeck: deck }),

  // Pairing & Connection
  host: typeof window !== "undefined" ? localStorage.getItem("gravktrl_host") || "127.0.0.1" : "127.0.0.1",
  port: typeof window !== "undefined" ? parseInt(localStorage.getItem("gravktrl_port") || "8787", 10) : 8787,
  token: typeof window !== "undefined" ? localStorage.getItem("gravktrl_token") || "" : "",
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  isPairingModalOpen: false,
  discoveredDaemons: [],
  isScanning: false,

  setPairingModalOpen: (open) => set({ isPairingModalOpen: open }),
  setConnectionConfig: ({ host, port, token }) =>
    set((state) => {
      const nextHost = host !== undefined ? host : state.host;
      const nextPort = port !== undefined ? port : state.port;
      const nextToken = token !== undefined ? token : state.token;

      if (typeof window !== "undefined") {
        if (host !== undefined) localStorage.setItem("gravktrl_host", host);
        if (port !== undefined) localStorage.setItem("gravktrl_port", port.toString());
        if (token !== undefined) localStorage.setItem("gravktrl_token", token);
      }

      return { host: nextHost, port: nextPort, token: nextToken };
    }),
  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionError: (err) => set({ connectionError: err }),
  setDiscoveredDaemons: (daemons) => set({ discoveredDaemons: daemons }),
  setScanning: (scanning) => set({ isScanning: scanning }),

  // PC Telemetry & Metrics
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),

  // Terminal Deck
  terminalLogs: [
    {
      id: "init-1",
      text: "[GravKtrl] Guarded Terminal initialized. Destructive commands are strictly blocked.",
      stream: "info",
      timestamp: Date.now(),
    },
  ],
  terminalInput: "",
  isTerminalExecuting: false,
  lastBlockedReason: null,
  setTerminalInput: (val) => set({ terminalInput: val }),
  addTerminalLog: (entry) =>
    set((state) => ({
      terminalLogs: [
        ...state.terminalLogs.slice(-100), // Keep last 100 entries for smooth mobile performance
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ...entry,
          timestamp: Date.now(),
        },
      ],
    })),
  clearTerminalLogs: () => set({ terminalLogs: [] }),
  setTerminalExecuting: (executing) => set({ isTerminalExecuting: executing }),
  setLastBlockedReason: (reason) => set({ lastBlockedReason: reason }),

  // Antigravity Remote Deck
  antigravityConfig: {
    remoteUrl: "",
    enabled: false,
    activeAgent: "omni-tool",
  },
  setAntigravityConfig: (config) =>
    set((state) => ({
      antigravityConfig: { ...state.antigravityConfig, ...config },
    })),
  setActiveAgent: (agent) =>
    set((state) => ({
      antigravityConfig: { ...state.antigravityConfig, activeAgent: agent },
    })),

  // Tactical Macro Pad
  macroStatus: {},
  setMacroStatus: (macroId, status) =>
    set((state) => ({
      macroStatus: { ...state.macroStatus, [macroId]: status },
    })),
}));
