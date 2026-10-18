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
  { label: "gradlew release", cmd: "cd android && gradlew assembleRelease" },
];

export const TerminalDeckView: React.FC<TerminalDeckViewProps> = ({ client, activeWorkspace }) => {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<Array<{ id: string; text: string; stream: "stdout" | "stderr" | "system" }>>([
    {
      id: "init",
      text: "[GravKtrl Terminal Deck] Connected to native PowerShell engine.\nCommands will execute in: " + activeWorkspace,
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
          text: `[Error executing command]: ${err.message || String(err)}`,
          stream: "stderr",
        },
      ]);
      setActiveExecutionId(null);
    }
  };

  const handleApprove = async () => {
    if (!pendingApproval) return;
    const { approvalId, command: approvedCmd } = pendingApproval;
    setPendingApproval(null);

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        text: `[Destructive Guard]: Execution APPROVED by mobile operator for "${approvedCmd}"`,
        stream: "system",
      },
    ]);

    try {
      const res = await client.approveCommand(approvalId);
      setActiveExecutionId(res.executionId);
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          text: `[Approval Failed]: ${err.message || String(err)}`,
          stream: "stderr",
        },
      ]);
    }
  };

  const handleRejectApproval = () => {
    if (!pendingApproval) return;
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        text: `[Destructive Guard]: Execution REJECTED by mobile operator for "${pendingApproval.command}"`,
        stream: "stderr",
      },
    ]);
    setPendingApproval(null);
  };

  const handleKill = async () => {
    if (!activeExecutionId) return;
    try {
      await client.killTerminal(activeExecutionId);
      setActiveExecutionId(null);
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          text: `\n[Process killed by user]\n`,
          stream: "system",
        },
      ]);
    } catch (e: any) {
      console.error("Kill failed:", e);
    }
  };

  const clearTerminal = () => {
    setLines([]);
  };

  const navigateHistory = (direction: "up" | "down") => {
    if (history.length === 0) return;
    let newIdx = direction === "up" ? historyIdx + 1 : historyIdx - 1;
    if (newIdx < 0) {
      setHistoryIdx(-1);
      setCommand("");
      return;
    }
    if (newIdx >= history.length) newIdx = history.length - 1;
    setHistoryIdx(newIdx);
    setCommand(history[newIdx]);
  };

  return (
    <div className="flex flex-col h-full bg-[#08090d] text-slate-100 select-text relative">
      {/* Terminal Header & Status Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d1117] border-b border-[#21262d] text-xs">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-400">PowerShell Engine</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400 truncate max-w-[170px]" title={activeWorkspace}>
            {activeWorkspace.split(/[\\/]/).pop() || "Workspace"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeExecutionId ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                RUNNING
              </span>
              <button
                onClick={handleKill}
                className="p-1 px-2 rounded bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 text-[10px] flex items-center gap-1"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                KILL
              </button>
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px]">
              READY
            </span>
          )}

          <button
            onClick={clearTerminal}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Clear output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1-Tap Terminal Macros */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto no-scrollbar bg-[#090b10] border-b border-[#1b212c]">
        {TERMINAL_MACROS.map((m, idx) => (
          <button
            key={idx}
            onClick={() => handleExecute(m.cmd)}
            disabled={activeExecutionId !== null}
            className="whitespace-nowrap px-2.5 py-1 text-[11px] rounded bg-[#161b22] hover:bg-[#21262d] text-emerald-400 font-mono border border-[#30363d] transition-colors disabled:opacity-50 shrink-0 active:scale-95 flex items-center gap-1"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            {m.label}
          </button>
        ))}
      </div>

      {/* Terminal View Output */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed bg-[#050608] space-y-0.5 select-text">
        {lines.map((l) => (
          <div
            key={l.id}
            className={`whitespace-pre-wrap break-all ${
              l.stream === "stderr"
                ? "text-rose-400 font-medium"
                : l.stream === "system"
                ? "text-cyan-400 font-semibold"
                : "text-slate-300"
            }`}
          >
            {l.text}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* High-Risk Destructive Approval Modal Card */}
      {pendingApproval && (
        <div className="absolute inset-x-3 bottom-16 z-30 p-3.5 bg-rose-950/95 border-2 border-rose-500 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom duration-200">
          <div className="flex items-start gap-2.5 mb-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                Security Approval Required
              </h4>
              <p className="text-[11px] text-rose-300 mt-0.5">
                {pendingApproval.riskReason}
              </p>
            </div>
          </div>

          <div className="p-2 rounded bg-black/60 font-mono text-xs text-rose-200 border border-rose-800/60 break-all mb-3">
            {pendingApproval.command}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              Approve Execution
            </button>
            <button
              onClick={handleRejectApproval}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Terminal Command Input */}
      <div className="p-2.5 bg-[#0d1117] border-t border-[#21262d]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateHistory("up")}
            className="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-slate-400 hover:text-white"
            title="Previous command"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigateHistory("down")}
            className="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-slate-400 hover:text-white"
            title="Next command"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleExecute();
              }
            }}
            placeholder="powershell command..."
            className="flex-1 bg-[#161b22] border border-[#30363d] focus:border-emerald-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => handleExecute()}
            disabled={!command.trim() || activeExecutionId !== null}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium shadow transition-all active:scale-95"
            title="Execute"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
