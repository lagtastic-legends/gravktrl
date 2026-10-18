"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Send, Square, Sparkles, Terminal, ShieldAlert, CheckCircle2, Copy, RefreshCw } from "lucide-react";
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
  const [messages, setMessages] = useState<MessageHistory[]>([
    {
      id: "initial",
      sender: "agent",
      text: "⚡ **GravKtrl Agent Bridge Connected.**\n\nDirectly inject prompts into Gemini 3.8 Flash inside Google Antigravity on your PC. Live thoughts and actions will stream here.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);

  useEffect(() => {
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

      if (res.mode === "fallback") {
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
          <span className="text-slate-400 truncate max-w-[170px]" title={activeWorkspace}>
            {activeWorkspace.split(/[\\/]/).pop() || "Workspace"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {agentStatus === "generating" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 text-[10px] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              THINKING
            </span>
          ) : agentStatus === "staged_on_pc" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-800/60 text-amber-300 text-[10px]">
              CLIPBOARD STAGED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px]">
              IDLE
            </span>
          )}

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
      <div className="p-2.5 bg-[#0d1117] border-t border-[#21262d]">
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={toggleVoice}
            className={`p-2.5 rounded-xl border transition-all ${
              isListening
                ? "bg-rose-900 border-rose-500 text-rose-100 animate-pulse glow-rose"
                : "bg-[#161b22] border-[#30363d] text-slate-300 hover:text-white"
            }`}
            title="Voice to Prompt"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <div className="flex-1 relative">
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Antigravity agent on PC..."
              className="w-full bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none resize-none font-sans"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isSending}
            className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-medium shadow transition-all active:scale-95"
            title="Inject Prompt"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
