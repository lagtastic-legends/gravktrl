"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Camera,
  X,
  Laptop,
  Sparkles,
  ShieldCheck,
  History,
  Zap,
  Radio,
  Terminal,
  Monitor,
  MessageSquare,
  Clipboard,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { AntigravityScanResult } from "./CameraQrScannerModal";
import { parseDecodedScanText } from "./CameraQrScannerModal";
import type { GravKtrlClient } from "@/lib/gravktrl-client";

interface CompanionDeckViewProps {
  companion: AntigravityScanResult | null;
  onScanNewCompanion: () => void;
  onDisconnectCompanion?: () => void;
  companionHistory?: AntigravityScanResult[];
  onSelectCompanion?: (companion: AntigravityScanResult) => void;
  client?: GravKtrlClient;
  onNavigateToTab?: (tab: "agent" | "companion" | "terminal" | "git" | "host" | "screen") => void;
}

export const CompanionDeckView: React.FC<CompanionDeckViewProps> = ({
  companion,
  onScanNewCompanion,
  onDisconnectCompanion,
  companionHistory = [],
  onSelectCompanion,
  client,
  onNavigateToTab,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(true);
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [detectedHostRig, setDetectedHostRig] = useState<AntigravityScanResult | null>(null);

  // Load auto-open preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gravktrl_companion_auto_open");
      if (saved !== null) {
        setAutoOpenEnabled(saved === "true");
      }
    }
  }, []);

  // Check if connected PC host has Antigravity Remote Control active
  useEffect(() => {
    if (client && client.getConnectionState() === "authenticated") {
      client
        .getAntigravityRemoteControl()
        .then((rc) => {
          if (rc && rc.enabled && rc.instanceId) {
            const hostRig: AntigravityScanResult = {
              type: "antigravity",
              rawUrl: rc.url,
              instanceId: rc.instanceId,
              companionUrl: rc.url,
              accountChooserUrl: `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(
                rc.url
              )}`,
            };
            setDetectedHostRig(hostRig);
          }
        })
        .catch(() => {});
    }
  }, [client]);

  const toggleAutoOpen = (enabled: boolean) => {
    setAutoOpenEnabled(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("gravktrl_companion_auto_open", String(enabled));
    }
  };

  const handleCopyLink = () => {
    if (!companion) return;
    navigator.clipboard.writeText(companion.accountChooserUrl || companion.companionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyInstanceId = () => {
    if (!companion) return;
    navigator.clipboard.writeText(companion.instanceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Launch in native Android Chrome Custom Tabs (or browser fallback)
  const handleOpenCompanionChrome = async () => {
    if (!companion) return;
    const targetUrl = companion.accountChooserUrl || companion.companionUrl;
    setIsOpeningBrowser(true);
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({
        url: targetUrl,
        presentationStyle: "popover",
        toolbarColor: "#0f1117",
      });
    } catch {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } finally {
      setTimeout(() => setIsOpeningBrowser(false), 600);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const parsed = parseDecodedScanText(text.trim());
        if (parsed.type === "antigravity") {
          onSelectCompanion?.(parsed);
        } else {
          alert("The clipboard content is not an Antigravity companion URL or instance ID.");
        }
      }
    } catch {
      alert("Clipboard access was not permitted. Please paste manually into the input box below.");
    }
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    const parsed = parseDecodedScanText(manualInput.trim());
    if (parsed.type === "antigravity") {
      onSelectCompanion?.(parsed);
      setManualInput("");
    } else {
      alert("Unrecognized format. Please enter a valid Antigravity URL or instance ID.");
    }
  };

  // ZERO STATE: No companion currently paired
  if (!companion) {
    return (
      <div className="flex flex-col items-center justify-start p-5 text-center h-full max-w-md mx-auto space-y-5 animate-in fade-in select-none overflow-y-auto no-scrollbar pb-16">
        <div className="relative pt-2">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-indigo-500/20 to-purple-500/20 p-1 flex items-center justify-center shadow-neo-soft border border-indigo-200/50">
            <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center shadow-inner">
              <Globe className="w-9 h-9 text-indigo-600 animate-pulse" />
            </div>
          </div>
          <span className="absolute top-1 right-0 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500 border-2 border-white"></span>
          </span>
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center justify-center gap-1.5">
            ANTIGRAVITY REMOTE COMPANION
            <Sparkles className="w-4 h-4 text-cyan-500" />
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
            Work with local agents on your computer from this phone in real time with Google account passkeys.
          </p>
        </div>

        {/* Host Auto-Detected Banner */}
        {detectedHostRig && (
          <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-indigo-500/10 border border-emerald-500/30 text-left space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>Detected on Connected PC</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 font-bold">
                READY
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-mono truncate">
              ID: {detectedHostRig.instanceId}
            </p>
            <button
              onClick={() => onSelectCompanion?.(detectedHostRig)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Connect Detected Rig</span>
            </button>
          </div>
        )}

        {/* 4-Step Instructions Card */}
        <div className="w-full p-4 rounded-2xl bg-white shadow-neo-flat border border-white/80 space-y-3 text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Laptop className="w-4 h-4 text-indigo-600" />
            <span>Connect in 5 seconds:</span>
          </div>
          <ol className="text-[11px] text-slate-500 space-y-2 pl-5 list-decimal font-medium">
            <li>
              Open <strong className="text-slate-700">Antigravity</strong> on your PC
            </li>
            <li>
              Go to <strong className="text-slate-700">Settings &gt; Application</strong>
            </li>
            <li>
              Under <strong className="text-slate-700">Remote Control</strong>, toggle on
            </li>
            <li>
              Tap <strong className="text-slate-700">Scan QR</strong> below (or tap Copy Link on PC)
            </li>
          </ol>
        </div>

        {/* Primary Action Buttons */}
        <div className="w-full space-y-2">
          <button
            onClick={onScanNewCompanion}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Scan Antigravity Screen QR</span>
          </button>

          <button
            onClick={handlePasteClipboard}
            className="w-full py-3 px-4 rounded-2xl bg-white shadow-neo-soft border border-slate-200/60 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <Clipboard className="w-4 h-4 text-indigo-600" />
            <span>Paste Copied Link from PC</span>
          </button>
        </div>

        {/* Manual Input Entry Strip */}
        <div className="w-full p-2 rounded-2xl bg-white shadow-neo-soft border border-white flex items-center gap-1.5 text-left">
          <input
            type="text"
            placeholder="Or enter Antigravity URL / Instance ID..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none font-mono"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider transition-all"
          >
            Link
          </button>
        </div>

        {/* Previous Rig History */}
        {companionHistory.length > 0 && (
          <div className="w-full space-y-2 pt-2 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <History className="w-3 h-3" /> Recent Rigs
            </span>
            <div className="space-y-1.5">
              {companionHistory.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectCompanion?.(item)}
                  className="w-full p-3 rounded-xl bg-white/80 hover:bg-white shadow-neo-soft border border-white/80 flex items-center justify-between transition-all"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-[11px] font-bold text-slate-700 font-mono truncate">
                      {item.instanceId}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {item.companionUrl}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 shrink-0">
                    Resume &rarr;
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ACTIVE COMPANION CONTROL DECK (Obsidian Cyberpunk Design)
  return (
    <div className="flex flex-col h-full w-full bg-[#0a0d14] text-white select-none overflow-y-auto no-scrollbar">
      {/* Top Header Control Strip */}
      <div className="h-12 px-3 bg-[#111622] border-b border-white/10 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-400 to-indigo-500 p-0.5 flex items-center justify-center shrink-0 shadow-sm shadow-cyan-500/30">
            <div className="w-full h-full bg-[#0a0d14] rounded-[10px] flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-white">
                COMPANION
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>ACTIVE</span>
              </span>
            </div>
            <div className="text-[9px] font-mono text-cyan-300 truncate max-w-[150px] sm:max-w-xs">
              {companion.instanceId}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopyLink}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
            title="Copy Companion URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onScanNewCompanion}
            className="h-7 px-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
            title="Scan Another Antigravity Rig"
          >
            <Camera className="w-3 h-3" />
            <span className="hidden sm:inline">Scan</span>
          </button>

          {onDisconnectCompanion && (
            <button
              onClick={onDisconnectCompanion}
              className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-100 flex items-center justify-center transition-all active:scale-95"
              title="Disconnect Companion Session"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Command Room Body */}
      <div className="p-4 space-y-4 max-w-lg mx-auto w-full pb-16">
        {/* Hero Chrome Custom Tabs Launcher Card */}
        <div className="relative p-5 rounded-3xl bg-gradient-to-br from-[#131929] via-[#0d121c] to-[#0a0d14] border border-cyan-500/30 shadow-2xl overflow-hidden text-center space-y-4">
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-400 to-indigo-600 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-[#0a0d14] rounded-[14px] flex items-center justify-center">
              <Globe className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-black tracking-tight text-white flex items-center justify-center gap-1.5">
              ANTIGRAVITY CLOUD COMPANION
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Running live on Google Cloud with passkey security, real-time agent execution, and WebRTC streaming.
            </p>
          </div>

          {/* Primary CTA: Launch Chrome Custom Tabs */}
          <button
            onClick={handleOpenCompanionChrome}
            disabled={isOpeningBrowser}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-all"
          >
            {isOpeningBrowser ? (
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-200" />
            ) : (
              <ExternalLink className="w-4 h-4 text-cyan-200" />
            )}
            <span>Open Companion in Chrome</span>
          </button>

          {/* Auto-Open Preference Pill */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[11px] text-slate-300">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Auto-open upon scan
            </span>
            <button
              onClick={() => toggleAutoOpen(!autoOpenEnabled)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                autoOpenEnabled
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-white/5 text-slate-400 border border-white/10"
              }`}
            >
              {autoOpenEnabled ? "ENABLED" : "DISABLED"}
            </button>
          </div>
        </div>

        {/* Rig Details & Security Matrix */}
        <div className="p-4 rounded-2xl bg-[#111622] border border-white/10 space-y-3 text-left">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-white/5 pb-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Rig Telemetry & Target Details</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400">AUTHENTICATED</span>
          </div>

          {/* Instance ID */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="text-slate-400">Instance ID</span>
            <button
              onClick={handleCopyInstanceId}
              className="font-mono text-cyan-300 flex items-center gap-1 hover:text-white transition-colors"
            >
              <span className="truncate max-w-[200px]">{companion.instanceId}</span>
              {copiedId ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-slate-500 shrink-0" />
              )}
            </button>
          </div>

          {/* Direct Cloud URL */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Cloud Endpoint</span>
            <span className="font-mono text-slate-200 truncate max-w-[200px]">
              {companion.companionUrl}
            </span>
          </div>

          {/* Authentication Provider */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Auth Handshake</span>
            <span className="text-slate-200 font-medium">Google Account Chooser</span>
          </div>
        </div>

        {/* Quick Cross-Deck Navigation */}
        <div className="space-y-2 text-left">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" /> GravKtrl Host Tools
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onNavigateToTab?.("agent")}
              className="p-3 rounded-xl bg-[#111622] hover:bg-[#161d2d] border border-white/10 flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-bold text-slate-200">Agent Console</span>
            </button>

            <button
              onClick={() => onNavigateToTab?.("screen")}
              className="p-3 rounded-xl bg-[#111622] hover:bg-[#161d2d] border border-white/10 flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95"
            >
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-200">Screen Mirror</span>
            </button>

            <button
              onClick={() => onNavigateToTab?.("terminal")}
              className="p-3 rounded-xl bg-[#111622] hover:bg-[#161d2d] border border-white/10 flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95"
            >
              <Terminal className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] font-bold text-slate-200">Terminal REPL</span>
            </button>
          </div>
        </div>

        {/* Previous Session History */}
        {companionHistory.length > 1 && (
          <div className="w-full space-y-2 pt-2 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <History className="w-3 h-3" /> Switch Antigravity Rig
            </span>
            <div className="space-y-1.5">
              {companionHistory
                .filter((item) => item.instanceId !== companion.instanceId)
                .slice(0, 3)
                .map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectCompanion?.(item)}
                    className="w-full p-2.5 rounded-xl bg-[#111622] hover:bg-[#161d2d] border border-white/10 flex items-center justify-between transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] font-bold text-slate-200 font-mono truncate">
                        {item.instanceId}
                      </div>
                      <div className="text-[9px] text-slate-500 truncate">
                        {item.companionUrl}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-cyan-400 shrink-0 flex items-center gap-1">
                      Switch <ArrowRight className="w-3 h-3" />
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Ribbon */}
      <div className="h-6 px-3 bg-[#0c1018] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-mono shrink-0 fixed bottom-0 inset-x-0">
        <span className="flex items-center gap-1.5 text-cyan-400/90 truncate">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Antigravity Passkey Bridge</span>
        </span>
        <span className="text-[9px] text-slate-400">Chrome Custom Tabs Active</span>
      </div>
    </div>
  );
};
