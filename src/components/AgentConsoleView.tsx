"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Send,
  Square,
  Sparkles,
  CheckCircle2,
  Copy,
  Activity,
} from "lucide-react";
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
      text: "⚡ **GravKtrl Dual-Mode Agent Bridge Connected.**\n\nDirectly inject prompts into Gemini 3.8 Flash inside Google Antigravity on your PC (both normal Antigravity.exe Win32 and CDP port 9222 supported). Live thoughts and file edits stream here in real time.",
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
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 select-text">
      {/* 1. Neomorphic Status Strip Card */}
      <div className="mx-3 mt-3 p-3 rounded-2xl bg-white shadow-neo-flat border border-white/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600 shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-slate-800">Gemini 3.8 Flash</span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] font-mono text-indigo-600 font-semibold truncate max-w-[120px]">
                {activeWorkspace.split(/[\\/]/).pop() || "Workspace"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {attachMode === "cdp" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  CDP:9222 ACTIVE
                </span>
              ) : attachMode === "win32" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  WIN32 PROCESS
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                  STAGED ON PC
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* File activity toggle */}
          <button
            onClick={() => setShowActivity(!showActivity)}
            className={`h-8 px-2.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-all border ${
              showActivity
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-neo-pressed"
                : "bg-white shadow-neo-soft border-white/80 text-slate-700 hover:text-indigo-600 active:shadow-neo-pressed"
            }`}
            title="Toggle live workspace file activity feed"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            <span>Files ({recentFiles.length})</span>
          </button>

          {agentStatus === "generating" && (
            <button
              onClick={handleStop}
              className="h-8 px-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 shadow-neo-soft text-[11px] font-bold flex items-center gap-1 active:shadow-neo-pressed"
            >
              <Square className="w-3 h-3 fill-current text-rose-600" />
              STOP
            </button>
          )}
        </div>
      </div>

      {/* 2. Collapsible Live Workspace File Feed Card */}
      {showActivity && (
        <div className="mx-3 mt-2 p-3 rounded-2xl bg-white shadow-neo-flat border border-white/60 shrink-0 max-h-48 overflow-y-auto space-y-1.5 animate-in fade-in">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center justify-between">
            <span>Live Workspace File Activity</span>
            <span className="font-mono text-indigo-600 font-semibold">{activeWorkspace.split(/[\\/]/).pop()}</span>
          </div>
          {recentFiles.length === 0 ? (
            <div className="text-[11px] text-slate-400 py-3 text-center">No file modifications detected yet</div>
          ) : (
            recentFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 rounded-xl neo-well text-[11px]"
              >
                <span className="font-mono text-slate-800 truncate max-w-[70%]">
                  <span
                    className={
                      f.action === "created"
                        ? "text-emerald-600 font-bold"
                        : f.action === "deleted"
                        ? "text-rose-600 font-bold"
                        : "text-indigo-600 font-bold"
                    }
                  >
                    [{f.action.toUpperCase()}]
                  </span>{" "}
                  {f.file}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(f.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. Preset Macro Pills */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar shrink-0">
        {PRESET_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p.prompt)}
            disabled={isSending || agentStatus === "generating"}
            className="whitespace-nowrap px-3 py-1.5 text-[11px] font-semibold rounded-full bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed text-slate-700 border border-white/80 transition-all disabled:opacity-50 shrink-0"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 4. Message Stream Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl p-3.5 text-xs leading-relaxed transition-all ${
                m.sender === "user"
                  ? "bg-indigo-50 border border-indigo-200 text-indigo-950 shadow-sm"
                  : "bg-white shadow-neo-flat border border-white/80 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-4 mb-1.5 border-b border-slate-100 pb-1">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  {m.sender === "user" ? "YOU (MOBILE COMMANDER)" : "GEMINI 3.8 FLASH AGENT"}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{m.timestamp}</span>
                  <button
                    onClick={() => copyToClipboard(m.text, m.id)}
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Copy message"
                  >
                    {copiedId === m.id ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="whitespace-pre-wrap font-sans text-[12px] leading-5 text-slate-800">
                {m.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 5. Inset Neomorphic Prompt Input Bar */}
      <div className="shrink-0 p-3 bg-[#f6f8fb]/95 backdrop-blur-xl border-t border-slate-200/60">
        <div className="flex items-center gap-2">
          {/* Voice to Text Button */}
          <button
            type="button"
            onClick={toggleVoice}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all border ${
              isListening
                ? "bg-rose-50 border-rose-300 text-rose-600 animate-pulse shadow-neo-pressed"
                : "bg-white shadow-neo-soft border-white/80 text-slate-600 hover:text-indigo-600 active:shadow-neo-pressed"
            }`}
            title="Voice to Prompt"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Prompt Well */}
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
              className="w-full min-h-[40px] max-h-24 neo-well rounded-2xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none font-sans"
            />
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isSending}
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 shadow-neo-soft text-white flex items-center justify-center shrink-0 font-medium disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all"
            title="Inject Prompt"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
