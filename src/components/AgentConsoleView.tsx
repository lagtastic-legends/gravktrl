"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Send, Square, Sparkles, Terminal, ShieldAlert, CheckCircle2, Copy, RefreshCw, Activity, FileText } from "lucide-react";
import type { GravKtrlClient } from "../lib/gravktrl-client";

interface AgentConsoleViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
}

interface MessageHistory {
  id: string;
  sender: "user" | "agent";
  text: string;
  status?: string;
  timestamp: string;
}

interface FileActivity {
  file: string;
  action: "created" | "modified" | "deleted";
  size?: number;
  timestamp: string;
}

const PRESET_PROMPTS = [
  { label: "Typecheck & Fix", prompt: "Run npm run typecheck, inspect any errors found, and fix them with zero regressions." },
  { label: "Run Test Suite", prompt: "Run the project test suite, diagnose any failing tests, and fix them cleanly." },
  { label: "Build Release APK", prompt: "Build the signed Android release APK via Gradle and report the APK output path and size." },
  { label: "Stage, Commit & Push", prompt: "Inspect git status and diff, format code, and make a clean atomic commit and push to remote." },
];

export const AgentConsoleView: React.FC<AgentConsoleViewProps> = ({ client, activeWorkspace }) => {
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>("idle");
  const [attachMode, setAttachMode] = useState<"cdp" | "win32" | "fallback">("cdp");
  const [showActivity, setShowActivity] = useState<boolean>(false);
  const [recentFiles, setRecentFiles] = useState<FileActivity[]>([]);
  const [messages, setMessages] = useState<MessageHistory[]>([
    {
      id: "initial",
      sender: "agent",
      text: "⚡ **GravKtrl Dual-Mode Agent Bridge Connected.**\n\nDirectly inject prompts into Gemini 3.8 Flash inside Google Antigravity on your PC (both normal Antigravity.exe Win32 and CDP port 9222 supported). Live thoughts and file edits will stream here in real time.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);

  useEffect(() => {
    // Check initial agent status and recent file activity
    client.getAgentStatus()
      .then((st) => {
        if (st.mode) {
          setAttachMode(st.mode === "offline" ? "win32" : st.mode);
        }
      })
      .catch(() => {});

    client.getRecentWorkspaceActivity()
      .then((res) => {
        if (res && res.recentFiles) {
          setRecentFiles(res.recentFiles);
        }
      })
      .catch(() => {});

    // Subscribe to live agent streaming chunks
    const unsubStream = client.on("agent.streamChunk", (chunk: any) => {
      if (!chunk || !chunk.text) return;

      setAgentStatus(chunk.status || "generating");

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.sender === "agent") {
          return [
            ...prev.slice(0, -1),
            { ...last, text: chunk.text, status: chunk.status },
          ];
        } else {
          return [
            ...prev,
            {
              id: "agent-" + Date.now(),
              sender: "agent",
              text: chunk.text,
              status: chunk.status,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ];
        }
      });
    });

    // Subscribe to live workspace file modification events
    const unsubFiles = client.on("agent.fileModified", (evt: any) => {
      if (!evt || !evt.file) return;
      setRecentFiles((prev) => [evt, ...prev.slice(0, 39)]);
    });

    // Voice recognition setup
    speechRef.current = client.createVoiceRecognition(
      (transcript) => {
        setPrompt((prev) => (prev ? prev + " " + transcript : transcript));
        setIsListening(false);
      },
      (err) => {
        console.warn("[Voice] Error:", err);
        setIsListening(false);
      }
    );

    return () => {
      unsubStream();
      unsubFiles();
    };
  }, [client]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentStatus]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || prompt).trim();
    if (!text || isSending) return;

    setIsSending(true);
    setPrompt("");

    const userMsg: MessageHistory = {
      id: "user-" + Date.now(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      setAgentStatus("injecting");
      const res = await client.sendPromptToAgent(text);

      if (res.mode) {
        setAttachMode(res.mode);
      }

      if (res.mode === "win32") {
        setAgentStatus("win32_dispatched");
      } else if (res.mode === "fallback") {
        setAgentStatus("staged_on_pc");
      } else {
        setAgentStatus("generating");
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "agent",
          text: `❌ **Failed to inject prompt:** ${err.message || String(err)}`,
          status: "error",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setAgentStatus("idle");
    } finally {
      setIsSending(false);
    }
  };

  const handleStop = async () => {
    try {
      await client.stopAgent();
      setAgentStatus("stopped");
    } catch (e: any) {
      console.error("Stop agent failed:", e);
    }
  };

  const toggleVoice = () => {
    if (!speechRef.current?.isSupported) {
      alert("Voice recognition is not supported in this browser/device.");
      return;
    }

    if (isListening) {
      speechRef.current.stop();
      setIsListening(false);
    } else {
      speechRef.current.start();
      setIsListening(true);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#08090d] text-slate-100 select-text">
      {/* Active Workspace / Agent Status Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d1117] border-b border-[#21262d] text-xs">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-semibold text-cyan-400">Gemini 3.8 Flash</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400 truncate max-w-[130px]" title={activeWorkspace}>
            {activeWorkspace.split(/[\\/]/).pop() || "Workspace"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Exact attach mode badge */}
          {attachMode === "cdp" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 text-[10px]" title="Chrome DevTools Protocol Port 9222 Active">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              CDP 9222
            </span>
          ) : attachMode === "win32" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-800/60 text-purple-300 text-[10px]" title="Normal Windows Antigravity.exe Window Attached">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              WIN32
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-800/60 text-amber-300 text-[10px]">
              STAGED
            </span>
          )}

          {/* Activity Drawer Toggle */}
          <button
            onClick={() => setShowActivity(!showActivity)}
            className={`p-1 px-2 rounded text-[10px] flex items-center gap-1 border transition-colors ${
              showActivity
                ? "bg-cyan-900/80 border-cyan-600 text-cyan-200"
                : "bg-[#161b22] border-[#30363d] text-slate-300 hover:text-white"
            }`}
            title="Toggle live workspace file activity feed"
          >
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>Files ({recentFiles.length})</span>
          </button>

          {agentStatus === "generating" && (
            <button
              onClick={handleStop}
              className="p-1 px-2 rounded bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 text-[10px] flex items-center gap-1"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              STOP
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Live File Activity Stream */}
      {showActivity && (
        <div className="shrink-0 max-h-48 overflow-y-auto bg-[#070a12] border-b border-[#1b212c] p-2 space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 flex items-center justify-between">
            <span>Live Workspace File Feed</span>
            <span className="text-cyan-400 font-mono text-[10px]">{activeWorkspace.split(/[\\/]/).pop()}</span>
          </div>
          {recentFiles.length === 0 ? (
            <div className="text-[11px] text-slate-500 py-3 text-center">No file modifications detected yet</div>
          ) : (
            recentFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-[#0e131f] border border-[#1e2738] text-[11px]">
                <span className="font-mono text-slate-200 truncate max-w-[70%]">
                  <span className={f.action === "created" ? "text-emerald-400 font-bold" : f.action === "deleted" ? "text-rose-400 font-bold" : "text-cyan-400 font-bold"}>
                    [{f.action.toUpperCase()}]
                  </span>{" "}
                  {f.file}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(f.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Preset Macro Pills */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar bg-[#090b10] border-b border-[#1b212c]">
        {PRESET_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p.prompt)}
            disabled={isSending || agentStatus === "generating"}
            className="whitespace-nowrap px-2.5 py-1 text-[11px] rounded bg-[#161b22] hover:bg-[#21262d] text-slate-300 border border-[#30363d] transition-colors disabled:opacity-50 shrink-0 active:scale-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Message Feed / Streaming Window */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.sender === "user"
                  ? "bg-cyan-950/80 border border-cyan-800/70 text-cyan-100 shadow-sm"
                  : "bg-[#0f141c] border border-[#21262d] text-slate-200 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between gap-4 mb-1 border-b border-white/5 pb-1">
                <span className="font-semibold text-[10px] text-slate-400 uppercase tracking-wider">
                  {m.sender === "user" ? "YOU (MOBILE)" : "ANTIGRAVITY AGENT"}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">{m.timestamp}</span>
                  <button
                    onClick={() => copyToClipboard(m.text, m.id)}
                    className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Copy response"
                  >
                    {copiedId === m.id ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="whitespace-pre-wrap font-sans text-[12px] leading-5">
                {m.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input Bar */}
      <div className="shrink-0 px-3 py-2 bg-[#0d1117] border-t border-[#21262d] z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
              isListening
                ? "bg-rose-900 border-rose-500 text-rose-100 animate-pulse glow-rose"
                : "bg-[#161b22] border-[#30363d] text-slate-300 hover:text-white"
            }`}
            title="Voice to Prompt"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <div className="flex-1 min-w-0 relative">
            <textarea
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Antigravity agent on PC..."
              className="w-full min-h-[40px] max-h-24 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none resize-none font-sans"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isSending}
            className="w-10 h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 font-medium shadow transition-all active:scale-95"
            title="Inject Prompt"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
