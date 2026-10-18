"use client";

import React, { useState, useEffect, useRef } from "react";
import { Terminal, Play, Square, AlertTriangle, ShieldCheck, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { GravKtrlClient, ApprovalRequest } from "../lib/gravktrl-client";

interface TerminalDeckViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
}

const TERMINAL_MACROS = [
  { label: "typecheck", cmd: "npm run typecheck" },
  { label: "test", cmd: "npm test" },
  { label: "git status", cmd: "git status" },
  { label: "adb devices", cmd: "adb devices" },
  { label: "gradlew debug", cmd: "cd android && gradlew assembleDebug" },
];

export const TerminalDeckView: React.FC<TerminalDeckViewProps> = ({ client, activeWorkspace }) => {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<Array<{ id: string; text: string; stream: "stdout" | "stderr" | "system" }>>([
    {
      id: "init",
      text: "[GravKtrl Terminal Deck] Connected to native PC terminal engine.\nWorking directory: " + activeWorkspace,
      stream: "system",
    },
  ]);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubOutput = client.on("terminal.output", (data: any) => {
      if (!data?.chunk) return;
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          text: data.chunk,
          stream: data.stream || "stdout",
        },
      ]);
    });

    const unsubExit = client.on("terminal.exit", (data: any) => {
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          text: `\n[Process exited with code ${data.exitCode} in ${data.durationMs}ms]\n`,
          stream: "system",
        },
      ]);
      setActiveExecutionId(null);
    });

    const unsubApproval = client.on("approval.required", (data: any) => {
      setPendingApproval(data as ApprovalRequest);
    });

    return () => {
      unsubOutput();
      unsubExit();
      unsubApproval();
    };
  }, [client]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const handleExecute = async (cmdToRun?: string) => {
    const cmd = (cmdToRun || command).trim();
    if (!cmd) return;

    setCommand("");
    setHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)]);
    setHistoryIdx(-1);

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        text: `\nPS ${activeWorkspace}> ${cmd}`,
        stream: "system",
      },
    ]);

    try {
      const res = await client.executeTerminal(cmd);
      if (res.status === "approval_required") {
        setPendingApproval({
          approvalId: res.executionId,
          command: cmd,
          riskReason: res.riskReason || "High-risk command detected",
        });
      } else {
        setActiveExecutionId(res.executionId);
      }
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          text: `\n[Execution Error]: ${err.message || String(err)}\n`,
          stream: "stderr",
        },
      ]);
    }
  };

  const handleApprove = async () => {
    if (!pendingApproval) return;
    try {
      const res = await client.approveCommand(pendingApproval.approvalId);
      setActiveExecutionId(res.executionId);
      setPendingApproval(null);
    } catch (err: any) {
      alert("Approval error: " + err.message);
    }
  };

  const handleDeny = () => {
    setPendingApproval(null);
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        text: `\n[Security Alert]: Command execution denied by mobile operator.\n`,
        stream: "stderr",
      },
    ]);
  };

  const handleKill = async () => {
    if (!activeExecutionId) return;
    await client.killTerminal(activeExecutionId);
    setActiveExecutionId(null);
  };

  const clearTerminal = () => {
    setLines([]);
  };

  const navigateHistory = (direction: "up" | "down") => {
    if (history.length === 0) return;
    if (direction === "up") {
      const nextIdx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(nextIdx);
      setCommand(history[nextIdx] || "");
    } else {
      const nextIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(nextIdx);
      setCommand(nextIdx === -1 ? "" : history[nextIdx] || "");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 select-text">
      {/* 1. Header Strip */}
      <div className="mx-3 mt-3 p-3 rounded-2xl bg-white shadow-neo-flat border border-white/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600 shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs text-slate-800">Native Terminal Engine</span>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]" title={activeWorkspace}>
              {activeWorkspace}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeExecutionId ? (
            <button
              onClick={handleKill}
              className="px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 shadow-neo-soft text-[10px] font-bold flex items-center gap-1 active:shadow-neo-pressed"
            >
              <Square className="w-2.5 h-2.5 fill-current text-rose-600" />
              KILL
            </button>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              READY
            </span>
          )}

          <button
            onClick={clearTerminal}
            className="p-1.5 rounded-xl bg-white shadow-neo-soft border border-white/80 text-slate-500 hover:text-slate-800 active:shadow-neo-pressed"
            title="Clear buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Destructive Safety Guard Approval Modal */}
      {pendingApproval && (
        <div className="mx-3 mt-2 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 shadow-neo-flat text-rose-950 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide text-rose-800">Destructive Safety Guard</span>
          </div>
          <p className="text-xs text-rose-900 mb-1.5">{pendingApproval.riskReason}</p>
          <div className="p-2 neo-well rounded-xl font-mono text-[11px] text-slate-800 mb-3 break-all">
            {pendingApproval.command}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleDeny}
              className="px-3 py-1.5 rounded-xl bg-white shadow-neo-soft text-slate-700 font-bold text-xs hover:bg-slate-50 active:shadow-neo-pressed"
            >
              Deny
            </button>
            <button
              onClick={handleApprove}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-neo-soft hover:bg-rose-700 flex items-center gap-1 active:scale-95"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Authorize &amp; Execute
            </button>
          </div>
        </div>
      )}

      {/* 3. Terminal Quick Command Macros */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar shrink-0">
        {TERMINAL_MACROS.map((m, idx) => (
          <button
            key={idx}
            onClick={() => handleExecute(m.cmd)}
            className="whitespace-nowrap px-3 py-1.5 text-[11px] font-semibold rounded-full bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed text-slate-700 border border-white/80 transition-all shrink-0"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 4. Terminal Output Viewport (Dark Inset Window for Perfect Readability) */}
      <div className="flex-1 mx-3 mb-2 p-3.5 rounded-2xl bg-[#0f172a] shadow-neo-pressed border border-slate-700/40 text-slate-100 font-mono text-xs overflow-y-auto leading-relaxed select-text">
        {lines.map((l) => (
          <div
            key={l.id}
            className={`whitespace-pre-wrap ${
              l.stream === "stderr"
                ? "text-rose-400 font-bold"
                : l.stream === "system"
                ? "text-cyan-400"
                : "text-slate-200"
            }`}
          >
            {l.text}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* 5. Terminal Command Input Bar */}
      <div className="shrink-0 p-3 bg-[#f6f8fb]/95 backdrop-blur-xl border-t border-slate-200/60">
        <div className="flex items-center gap-2">
          {/* History Nav */}
          <div className="flex flex-col gap-1 shrink-0">
            <button
              type="button"
              onClick={() => navigateHistory("up")}
              className="w-7 h-4 rounded-md bg-white shadow-neo-soft flex items-center justify-center text-slate-600 active:shadow-neo-pressed"
              title="Previous Command"
            >
              <ArrowUp className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={() => navigateHistory("down")}
              className="w-7 h-4 rounded-md bg-white shadow-neo-soft flex items-center justify-center text-slate-600 active:shadow-neo-pressed"
              title="Next Command"
            >
              <ArrowDown className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Command Input Well */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleExecute();
                else if (e.key === "ArrowUp") navigateHistory("up");
                else if (e.key === "ArrowDown") navigateHistory("down");
              }}
              placeholder="Enter shell command (npm, git, adb, gradlew)..."
              className="w-full neo-well rounded-2xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono"
            />
          </div>

          {/* Run Button */}
          <button
            type="button"
            onClick={() => handleExecute()}
            disabled={!command.trim()}
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 shadow-neo-soft text-white flex items-center justify-center shrink-0 font-medium disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all"
            title="Execute Command"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
