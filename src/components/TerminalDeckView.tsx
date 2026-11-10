"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal as TerminalIcon,
  Play,
  Square,
  AlertTriangle,
  ShieldCheck,
  RotateCw,
  Trash2,
  CornerDownLeft,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Command,
  Plus,
} from "lucide-react";
import type { GravKtrlClient, TerminalSessionInfo, ApprovalRequest } from "../lib/gravktrl-client";
import "@xterm/xterm/css/xterm.css";

interface TerminalDeckViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
}

const TERMINAL_MACROS = [
  { label: "typecheck", cmd: "npm run typecheck" },
  { label: "git status", cmd: "git status" },
  { label: "git diff", cmd: "git diff" },
  { label: "npm test", cmd: "npm test" },
  { label: "adb devices", cmd: "adb devices" },
  { label: "gradlew debug", cmd: "cd android; .\\gradlew.bat assembleDebug" },
  { label: "ls / dir", cmd: "dir" },
];

export const TerminalDeckView: React.FC<TerminalDeckViewProps> = ({ client, activeWorkspace }) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);

  const [activeSession, setActiveSession] = useState<TerminalSessionInfo | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  // Sticky modifier keys for mobile accessory bar
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  // Fallback direct text input for devices where canvas touch doesn't trigger soft keyboard
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [directCommand, setDirectCommand] = useState("");

  /**
   * Initializes or fetches primary terminal session on mount.
   */
  const initSession = useCallback(async () => {
    try {
      const session = await client.getOrCreatePrimaryTerminalSession(activeWorkspace);
      if (session) {
        setActiveSession(session);
        setSessions([session]);
      }
    } catch (err) {
      console.warn("[TerminalDeck] Failed to get/create terminal session:", err);
    }
  }, [client, activeWorkspace]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  /**
   * Dynamically loads xterm.js and FitAddon in client environment.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !terminalContainerRef.current) return;

    let isSubscribed = true;

    async function setupXterm() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (!isSubscribed || !terminalContainerRef.current) return;

      // Clean up existing instance if any
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 12,
        lineHeight: 1.25,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        theme: {
          background: "#0b0f19",
          foreground: "#f8fafc",
          cursor: "#818cf8",
          cursorAccent: "#0b0f19",
          selectionBackground: "rgba(99, 102, 241, 0.35)",
          black: "#0f172a",
          red: "#f43f5e",
          green: "#10b981",
          yellow: "#f59e0b",
          blue: "#6366f1",
          magenta: "#d946ef",
          cyan: "#06b6d4",
          white: "#f8fafc",
          brightBlack: "#475569",
          brightRed: "#fb7185",
          brightGreen: "#34d399",
          brightYellow: "#fbbf24",
          brightBlue: "#818cf8",
          brightMagenta: "#e879f9",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
        convertEol: true,
        scrollback: 3000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      terminalContainerRef.current.innerHTML = "";
      term.open(terminalContainerRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      setIsReady(true);

      // Handle user typing directly into xterm
      term.onData((data: string) => {
        if (!activeSession) return;
        client.sendTerminalData(activeSession.sessionId, data);
      });

      // Handle window / container resize
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          if (activeSession && term.cols && term.rows) {
            client.resizeTerminal(activeSession.sessionId, term.cols, term.rows);
          }
        } catch {}
      });

      if (terminalContainerRef.current) {
        resizeObserver.observe(terminalContainerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }

    setupXterm();

    return () => {
      isSubscribed = false;
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [activeSession, client]);

  /**
   * Subscribes to live terminal output from WebSocket.
   */
  useEffect(() => {
    const unsubData = client.on("terminal.data", (event: any) => {
      if (!event || !event.data) return;
      if (activeSession && event.sessionId && event.sessionId !== activeSession.sessionId) {
        return;
      }
      if (xtermRef.current) {
        xtermRef.current.write(event.data);
      }
    });

    const unsubExit = client.on("terminal.sessionExit", (event: any) => {
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[33m[Session Exited with code ${event?.exitCode ?? 0}]\x1b[0m\r\n`);
      }
    });

    const unsubApproval = client.on("approval.required", (event: any) => {
      setPendingApproval(event as ApprovalRequest);
    });

    return () => {
      unsubData();
      unsubExit();
      unsubApproval();
    };
  }, [client, activeSession]);

  /**
   * Sends raw string or key sequence to active session.
   */
  const sendKey = (keySeq: string) => {
    if (!activeSession) return;

    let payload = keySeq;

    // Apply CTRL modifier
    if (ctrlActive) {
      if (keySeq.length === 1) {
        const charCode = keySeq.toUpperCase().charCodeAt(0);
        if (charCode >= 64 && charCode <= 95) {
          payload = String.fromCharCode(charCode - 64);
        }
      }
      setCtrlActive(false);
    }

    // Apply ALT modifier (Escape prefix)
    if (altActive) {
      payload = "\x1b" + payload;
      setAltActive(false);
    }

    client.sendTerminalData(activeSession.sessionId, payload);
    xtermRef.current?.focus();
  };

  /**
   * Runs a complete macro command followed by Enter.
   */
  const handleExecuteMacro = (cmdText: string) => {
    if (!activeSession) return;
    client.sendTerminalData(activeSession.sessionId, `${cmdText}\r`);
    xtermRef.current?.focus();
  };

  const handleRestartSession = async () => {
    if (activeSession) {
      await client.killTerminalSession(activeSession.sessionId);
    }
    xtermRef.current?.clear();
    const newSession = await client.createTerminalSession({
      cwd: activeWorkspace,
      cols: xtermRef.current?.cols || 80,
      rows: xtermRef.current?.rows || 24,
    });
    setActiveSession(newSession);
    setSessions([newSession]);
    xtermRef.current?.focus();
  };

  const handleClearTerminal = () => {
    xtermRef.current?.clear();
    // Also send Ctrl+L to shell to reset cursor
    if (activeSession) {
      client.sendTerminalData(activeSession.sessionId, "\x0c");
    }
  };

  const handleApprove = async () => {
    if (!pendingApproval) return;
    try {
      await client.approveCommand(pendingApproval.approvalId);
      setPendingApproval(null);
    } catch (err: any) {
      alert("Approval error: " + err.message);
    }
  };

  const handleDeny = () => {
    setPendingApproval(null);
    if (xtermRef.current) {
      xtermRef.current.writeln("\r\n\x1b[31m[Security Alert]: Command execution denied by operator.\x1b[0m\r\n");
    }
  };

  const handleDirectCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directCommand.trim() || !activeSession) return;
    client.sendTerminalData(activeSession.sessionId, directCommand + "\r");
    setDirectCommand("");
  };

  return (
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 select-none relative overflow-hidden">
      {/* 1. TOP STATUS & SESSION TOOLBAR */}
      <div className="mx-3 mt-3 p-2.5 rounded-2xl bg-white shadow-neo-flat border border-white/60 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600 shrink-0">
            <TerminalIcon className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-slate-800 truncate">
                {activeSession?.name || "Interactive Shell"}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE REPL
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]" title={activeWorkspace}>
              {activeWorkspace.split(/[\\/]/).pop()}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => sendKey("\x03")}
            className="h-7 px-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 shadow-neo-soft text-[10px] font-bold flex items-center gap-1 active:shadow-neo-pressed"
            title="Send Ctrl+C (Interrupt/Break)"
          >
            <Square className="w-2.5 h-2.5 fill-current text-rose-600" />
            <span>Ctrl+C</span>
          </button>

          <button
            type="button"
            onClick={handleClearTerminal}
            className="w-7 h-7 rounded-lg bg-white shadow-neo-soft border border-white/80 text-slate-500 hover:text-slate-800 flex items-center justify-center active:shadow-neo-pressed"
            title="Clear Terminal Screen (Ctrl+L)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleRestartSession}
            className="w-7 h-7 rounded-lg bg-white shadow-neo-soft border border-white/80 text-slate-500 hover:text-indigo-600 flex items-center justify-center active:shadow-neo-pressed"
            title="Restart Interactive Shell Session"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. DESTRUCTIVE COMMAND GUARD MODAL */}
      {pendingApproval && (
        <div className="mx-3 mt-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 shadow-neo-flat text-rose-950 shrink-0 z-20 animate-in fade-in">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide text-rose-800">Destructive Safety Guard</span>
          </div>
          <p className="text-[11px] text-rose-900 mb-1.5">{pendingApproval.riskReason}</p>
          <div className="p-2 neo-well rounded-xl font-mono text-[11px] text-slate-800 mb-2 break-all bg-white/60">
            {pendingApproval.command}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleDeny}
              className="px-3 py-1 rounded-xl bg-white shadow-neo-soft text-slate-700 font-bold text-xs hover:bg-slate-50 active:shadow-neo-pressed"
            >
              Deny
            </button>
            <button
              onClick={handleApprove}
              className="px-3 py-1 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-neo-soft hover:bg-rose-700 flex items-center gap-1 active:scale-95"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Authorize &amp; Execute</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. TACTICAL PRESET MACROS ROW */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar shrink-0 z-10">
        {TERMINAL_MACROS.map((m, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleExecuteMacro(m.cmd)}
            className="whitespace-nowrap px-2.5 py-1 text-[10px] font-semibold rounded-full bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed text-slate-700 border border-white/80 transition-all shrink-0 flex items-center gap-1 group"
          >
            <Play className="w-2 h-2 text-indigo-500 fill-current group-hover:text-indigo-600" />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* 4. MAIN XTERM.JS TERMINAL CANVAS */}
      <div
        onClick={() => xtermRef.current?.focus()}
        className="flex-1 min-h-0 mx-3 mb-2 rounded-2xl bg-[#0b0f19] shadow-inner border border-slate-800/80 p-2.5 overflow-hidden flex flex-col relative"
      >
        <div
          ref={terminalContainerRef}
          className="w-full h-full overflow-hidden"
          style={{ minHeight: "180px" }}
        />

        {/* Tap to Focus Overlay helper */}
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={() => setShowDirectInput(!showDirectInput)}
            className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-[10px] font-mono text-slate-300 backdrop-blur-sm border border-slate-700"
            title="Toggle Text Input Box"
          >
            {showDirectInput ? "Hide Input" : "Input Bar"}
          </button>
        </div>
      </div>

      {/* Direct Command Input Bar (Optional fallback for soft keyboard) */}
      {showDirectInput && (
        <form onSubmit={handleDirectCommandSubmit} className="mx-3 mb-2 flex items-center gap-1.5 shrink-0 z-20">
          <input
            type="text"
            value={directCommand}
            onChange={(e) => setDirectCommand(e.target.value)}
            placeholder="Type command and press Send..."
            className="flex-1 h-8 neo-well rounded-xl px-3 text-[11px] font-mono text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            className="h-8 px-3 rounded-xl bg-indigo-600 text-white text-[11px] font-bold shadow-neo-soft active:scale-95"
          >
            Send
          </button>
        </form>
      )}

      {/* 5. SILK NEOMORPHIC MOBILE ACCESSORY BAR (Fixed above bottom dock) */}
      <div className="mx-3 mb-20 p-2 rounded-2xl bg-white shadow-neo-soft border border-white/80 flex flex-col gap-1.5 shrink-0 z-20">
        {/* Row 1: Modifier and Core Shell Keys */}
        <div className="flex items-center justify-between gap-1">
          {/* ESC Key */}
          <button
            type="button"
            onClick={() => sendKey("\x1b")}
            className="flex-1 h-8 rounded-xl bg-[#f6f8fb] shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed text-[11px] font-mono font-bold text-slate-700 flex items-center justify-center border border-white/80 transition-all"
            title="Escape"
          >
            ESC
          </button>

          {/* TAB Key (PowerShell / Bash Autocomplete!) */}
          <button
            type="button"
            onClick={() => sendKey("\t")}
            className="flex-1 h-8 rounded-xl bg-indigo-50/70 shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed text-[11px] font-mono font-bold text-indigo-700 flex items-center justify-center border border-indigo-100 transition-all"
            title="Tab Autocomplete"
          >
            TAB
          </button>

          {/* CTRL Sticky Modifier */}
          <button
            type="button"
            onClick={() => setCtrlActive(!ctrlActive)}
            className={`flex-1 h-8 rounded-xl text-[11px] font-mono font-bold flex items-center justify-center border transition-all ${
              ctrlActive
                ? "bg-indigo-600 text-white shadow-neo-pressed border-indigo-700"
                : "bg-[#f6f8fb] text-slate-700 shadow-neo-soft border-white/80"
            }`}
            title="Control Modifier"
          >
            CTRL
          </button>

          {/* ALT Sticky Modifier */}
          <button
            type="button"
            onClick={() => setAltActive(!altActive)}
            className={`flex-1 h-8 rounded-xl text-[11px] font-mono font-bold flex items-center justify-center border transition-all ${
              altActive
                ? "bg-indigo-600 text-white shadow-neo-pressed border-indigo-700"
                : "bg-[#f6f8fb] text-slate-700 shadow-neo-soft border-white/80"
            }`}
            title="Alt Modifier"
          >
            ALT
          </button>

          {/* Enter / Return */}
          <button
            type="button"
            onClick={() => sendKey("\r")}
            className="flex-1 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-neo-soft text-[11px] font-mono font-bold flex items-center justify-center active:scale-95 transition-all"
            title="Enter / Return"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2: Navigation Arrows & Common Terminal Symbols */}
        <div className="flex items-center justify-between gap-1 text-[11px] font-mono font-semibold">
          {/* Arrow Up (History Up) */}
          <button
            type="button"
            onClick={() => sendKey("\x1b[A")}
            className="w-8 h-7 rounded-lg bg-[#f6f8fb] shadow-neo-soft text-slate-700 flex items-center justify-center active:shadow-neo-pressed"
            title="History Up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Arrow Down (History Down) */}
          <button
            type="button"
            onClick={() => sendKey("\x1b[B")}
            className="w-8 h-7 rounded-lg bg-[#f6f8fb] shadow-neo-soft text-slate-700 flex items-center justify-center active:shadow-neo-pressed"
            title="History Down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* Arrow Left */}
          <button
            type="button"
            onClick={() => sendKey("\x1b[D")}
            className="w-8 h-7 rounded-lg bg-[#f6f8fb] shadow-neo-soft text-slate-700 flex items-center justify-center active:shadow-neo-pressed"
            title="Cursor Left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Arrow Right */}
          <button
            type="button"
            onClick={() => sendKey("\x1b[C")}
            className="w-8 h-7 rounded-lg bg-[#f6f8fb] shadow-neo-soft text-slate-700 flex items-center justify-center active:shadow-neo-pressed"
            title="Cursor Right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          {/* Quick symbols */}
          {["|", "/", "\\", "-", "~", "_", "$"].map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => sendKey(sym)}
              className="flex-1 h-7 rounded-lg bg-[#f6f8fb] shadow-neo-soft text-slate-700 flex items-center justify-center hover:text-indigo-600 active:shadow-neo-pressed"
            >
              {sym}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
