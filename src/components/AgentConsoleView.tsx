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
  MessageSquare,
  Folder,
  Plus,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  X,
  BrainCircuit,
  ExternalLink,
} from "lucide-react";
import type {
  GravKtrlClient,
  ProjectGroup,
  ConversationItem,
  ChatMessage,
} from "../lib/gravktrl-client";

interface AgentConsoleViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
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
  
  // Conversations Drawer & Selection State
  const [showConversationDrawer, setShowConversationDrawer] = useState<boolean>(false);
  const [projects, setProjects] = useState<ProjectGroup[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [isCreatingConvo, setIsCreatingConvo] = useState<boolean>(false);

  // Chat Messages & Thoughts State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);

  // Load conversations list and active conversation messages
  const loadConversations = async () => {
    try {
      const res = await client.listConversations();
      if (res && res.projects) {
        setProjects(res.projects);
        
        const activeId = res.activeConversationId;
        if (activeId) {
          setActiveConversationId(activeId);
          // Find active item
          for (const p of res.projects) {
            const found = p.conversations.find((c) => c.id === activeId);
            if (found) {
              setActiveConversation(found);
              break;
            }
          }
          // Fetch its real messages
          loadMessages(activeId);
        }
      }
    } catch (e) {
      console.warn("[AgentConsole] Failed to load conversations:", e);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const res = await client.getConversationMessages(convId, 80);
      if (res && res.messages && res.messages.length > 0) {
        setMessages(res.messages);
      } else {
        // Fallback default greeting if empty
        setMessages([
          {
            id: "initial",
            sender: "agent",
            text: "⚡ **Antigravity Agent Ready.**\n\nAsk anything or assign tasks. Thoughts, tool invocations, and responses stream here in real time.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            stepIndex: 0,
          },
        ]);
      }
    } catch (err) {
      console.warn("[AgentConsole] Failed to load messages:", err);
    }
  };

  useEffect(() => {
    // Initial data load
    loadConversations();

    // Check agent process status
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

    // Subscribe to live agent streaming chunks & thoughts
    const unsubStream = client.on("agent.streamChunk", (chunk: any) => {
      if (!chunk) return;

      setAgentStatus(chunk.status || "generating");

      setMessages((prev) => {
        // Check if message with this step/id already exists
        const chunkId = chunk.id || `agent-${chunk.stepIndex || Date.now()}`;
        const existingIdx = prev.findIndex((m) => m.id === chunkId);

        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            text: chunk.text || updated[existingIdx].text,
            thinking: chunk.thinking !== undefined ? chunk.thinking : updated[existingIdx].thinking,
            status: chunk.status,
          };
          return updated;
        }

        const last = prev[prev.length - 1];
        if (last && last.sender === "agent" && !last.text && chunk.text) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              id: chunkId,
              text: chunk.text,
              thinking: chunk.thinking || last.thinking,
              status: chunk.status,
            },
          ];
        }

        // New message turn
        return [
          ...prev,
          {
            id: chunkId,
            sender: chunk.sender || "agent",
            text: chunk.text || "",
            thinking: chunk.thinking || "",
            status: chunk.status,
            stepIndex: chunk.stepIndex || Date.now(),
            timestamp: chunk.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ];
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

  // Auto-scroll when messages or status changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentStatus]);

  const handleSelectConversation = async (conv: ConversationItem) => {
    try {
      setActiveConversationId(conv.id);
      setActiveConversation(conv);
      setShowConversationDrawer(false);

      const res = await client.selectConversation(conv.id);
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.warn("Failed to select conversation:", e);
    }
  };

  const handleNewConversation = async (projectId?: string) => {
    if (isCreatingConvo) return;
    setIsCreatingConvo(true);
    try {
      const res = await client.createConversation(projectId);
      if (res && res.conversationId) {
        setActiveConversationId(res.conversationId);
      }
      await loadConversations();
      setShowConversationDrawer(false);
      setMessages([
        {
          id: "new-session",
          sender: "agent",
          text: "✨ **New Conversation Initiated.**\n\nDirectly enter your instructions or choose a macro preset below.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          stepIndex: 0,
        },
      ]);
    } catch (e) {
      console.warn("Failed to create new conversation:", e);
    } finally {
      setIsCreatingConvo(false);
    }
  };

  const toggleProjectCollapse = (projectKey: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectKey]: !prev[projectKey],
    }));
  };

  const toggleThinking = (msgId: string) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || prompt).trim();
    if (!text || isSending) return;

    setIsSending(true);
    setPrompt("");

    const userMsg: ChatMessage = {
      id: "user-" + Date.now(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      stepIndex: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      setAgentStatus("injecting");
      const res = await client.sendPromptToAgent(text);

      if (res.mode) {
        setAttachMode(res.mode);
      }

      setAgentStatus("generating");
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "agent",
          text: `❌ **Failed to inject prompt:** ${err.message || String(err)}`,
          status: "error",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          stepIndex: Date.now(),
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

  // Format message text with basic markdown code formatting
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;

    // Detect fenced code blocks ```lang\ncode\n```
    const parts = rawText.split(/(```[\s\S]*?```)/g);

    return parts.map((part, idx) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const firstLineEnd = part.indexOf("\n");
        const lang = firstLineEnd !== -1 ? part.slice(3, firstLineEnd).trim() : "";
        const code = firstLineEnd !== -1 ? part.slice(firstLineEnd + 1, -3) : part.slice(3, -3);

        return (
          <div key={idx} className="my-2.5 rounded-xl overflow-hidden neo-well border border-slate-200/50">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 text-slate-300 text-[10px] font-mono">
              <span className="font-semibold uppercase tracking-wider">{lang || "CODE"}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(code, `code-${idx}`)}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                {copiedId === `code-${idx}` ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 text-[11px] font-mono bg-[#0d1117] text-slate-100 overflow-x-auto leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Regular text with bold / bullet point formatting
      return (
        <span key={idx} className="whitespace-pre-wrap font-sans text-[12px] leading-5 text-slate-800">
          {part}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 select-text relative">
      {/* 1. Neomorphic Status & Conversation Switcher Bar */}
      <div className="mx-3 mt-3 p-2.5 rounded-2xl bg-white shadow-neo-flat border border-white/60 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Active Conversation Drawer Button */}
          <button
            type="button"
            onClick={() => setShowConversationDrawer(true)}
            className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed flex items-center justify-between gap-2 border border-white/80 transition-all text-left group"
            title="Open Antigravity Conversations Drawer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-indigo-600 text-[18px] shrink-0">
                chat_bubble
              </span>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs text-slate-800 truncate">
                  {activeConversation?.title || "Conversations"}
                </span>
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <span>{activeConversation?.projectName || "Antigravity"}</span>
                  {activeConversation?.relativeTime && (
                    <>
                      <span>•</span>
                      <span>{activeConversation.relativeTime}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
          </button>

          {/* New Conversation Quick Action */}
          <button
            type="button"
            onClick={() => handleNewConversation()}
            disabled={isCreatingConvo}
            className="h-9 px-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-neo-soft flex items-center gap-1 text-[11px] font-bold shrink-0 hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
            title="Start New Conversation in Antigravity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden min-[380px]:inline">New Chat</span>
          </button>
        </div>

        {/* Status Strip & Mode Badges */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Gemini 3.8 Flash
            </span>
            <span className="text-slate-300">•</span>
            {attachMode === "cdp" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CDP:9222
              </span>
            ) : attachMode === "win32" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                WIN32 PROCESS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                STAGED
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* File activity toggle */}
            <button
              onClick={() => setShowActivity(!showActivity)}
              className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all border ${
                showActivity
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-neo-pressed"
                  : "bg-white shadow-neo-soft border-white/80 text-slate-700 hover:text-indigo-600 active:shadow-neo-pressed"
              }`}
              title="Toggle live workspace file activity feed"
            >
              <Activity className="w-3 h-3 text-indigo-600" />
              <span>Files ({recentFiles.length})</span>
            </button>

            {agentStatus === "generating" && (
              <button
                onClick={handleStop}
                className="h-7 px-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 shadow-neo-soft text-[10px] font-bold flex items-center gap-1 active:shadow-neo-pressed"
              >
                <Square className="w-2.5 h-2.5 fill-current text-rose-600" />
                STOP
              </button>
            )}
          </div>
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

      {/* 4. Real Conversation Messages Stream Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl p-3.5 text-xs leading-relaxed transition-all ${
                m.sender === "user"
                  ? "bg-indigo-50 border border-indigo-200 text-indigo-950 shadow-sm"
                  : "bg-white shadow-neo-flat border border-white/80 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-4 mb-2 border-b border-slate-100 pb-1.5">
                <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  {m.sender === "user" ? (
                    <>
                      <span className="material-symbols-outlined text-[13px] text-indigo-600">person</span>
                      YOU (MOBILE COMMANDER)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      GEMINI 3.8 FLASH
                    </>
                  )}
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

              {/* Expandable Thinking accordion (if model thought was captured) */}
              {m.thinking && m.thinking.trim() && (
                <div className="mb-2 rounded-xl bg-slate-50 border border-slate-200/80 overflow-hidden text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleThinking(m.id)}
                    className="w-full px-2.5 py-1.5 flex items-center justify-between text-slate-500 hover:text-slate-800 font-medium transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Thinking Process</span>
                    </div>
                    {expandedThinking[m.id] ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {expandedThinking[m.id] && (
                    <div className="p-2.5 bg-white border-t border-slate-100 text-[11px] text-slate-600 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {m.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Real Markdown & Content Render */}
              <div>{renderFormattedText(m.text)}</div>
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
              placeholder={`Message ${activeConversation?.title ? `"${activeConversation.title.slice(0, 20)}..."` : "Antigravity on PC"}...`}
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

      {/* 6. SILK NEOMORPHIC CONVERSATION DRAWER (Matching Antigravity Sidebar Image 2) */}
      {showConversationDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full sm:max-w-md mx-auto max-h-[85vh] bg-[#f6f8fb] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/80 flex flex-col overflow-hidden animate-in slide-in-from-bottom"
          >
            {/* Drawer Header */}
            <div className="p-4 bg-white/80 border-b border-slate-200/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                  <span className="material-symbols-outlined text-[18px]">forum</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-sm text-slate-800">Antigravity Conversations</span>
                  <span className="text-[10px] text-slate-400 font-mono">Select or switch active agent session</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConversationDrawer(false)}
                className="w-8 h-8 rounded-full bg-white shadow-neo-soft flex items-center justify-center text-slate-500 hover:text-slate-800 active:shadow-neo-pressed transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Bar: + New Conversation & Filter */}
            <div className="p-3 bg-white/40 border-b border-slate-200/40 flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleNewConversation()}
                disabled={isCreatingConvo}
                className="w-full h-10 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold text-xs shadow-neo-soft flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Conversation</span>
              </button>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter conversations & projects..."
                  className="w-full h-8 neo-well rounded-xl pl-8 pr-3 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none font-sans"
                />
              </div>
            </div>

            {/* Projects & Conversations Tree List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-sans">
                  No Antigravity conversations found in local database.
                </div>
              ) : (
                projects.map((proj) => {
                  const filteredConvs = proj.conversations.filter(
                    (c) =>
                      c.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      proj.name.toLowerCase().includes(searchFilter.toLowerCase())
                  );

                  if (searchFilter && filteredConvs.length === 0) return null;

                  const isCollapsed = Boolean(collapsedProjects[proj.id]);

                  return (
                    <div key={proj.id} className="rounded-2xl bg-white shadow-neo-flat border border-white/80 overflow-hidden">
                      {/* Project Header Accordion */}
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapse(proj.id)}
                        className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="font-bold text-xs text-slate-800 truncate">
                            {proj.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-mono font-semibold">
                            {filteredConvs.length}
                          </span>
                        </div>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      {/* Conversation Items List */}
                      {!isCollapsed && (
                        <div className="p-1.5 pt-0 space-y-1">
                          {filteredConvs.map((conv) => {
                            const isCurrent = conv.id === activeConversationId;
                            return (
                              <button
                                key={conv.id}
                                type="button"
                                onClick={() => handleSelectConversation(conv)}
                                className={`w-full p-2 rounded-xl flex items-center justify-between text-left transition-all ${
                                  isCurrent
                                    ? "bg-indigo-50/80 border border-indigo-200/70 shadow-sm"
                                    : "hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isCurrent
                                        ? "bg-emerald-500 ring-4 ring-emerald-100 animate-pulse"
                                        : "bg-slate-300"
                                    }`}
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span
                                      className={`text-xs truncate ${
                                        isCurrent ? "font-bold text-indigo-950" : "font-medium text-slate-700"
                                      }`}
                                    >
                                      {conv.title}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {conv.relativeTime}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 bg-white/60 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-400 font-mono shrink-0">
              <span>{projects.reduce((acc, p) => acc + p.conversations.length, 0)} Total Conversations</span>
              <button
                type="button"
                onClick={() => loadConversations()}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Refresh List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
