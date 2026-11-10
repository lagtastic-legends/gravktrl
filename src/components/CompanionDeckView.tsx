"use client";

import React, { useState } from "react";
import {
  Globe,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Camera,
  X,
  Laptop,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  History,
} from "lucide-react";
import type { AntigravityScanResult } from "./CameraQrScannerModal";

interface CompanionDeckViewProps {
  companion: AntigravityScanResult | null;
  onScanNewCompanion: () => void;
  onDisconnectCompanion?: () => void;
  companionHistory?: AntigravityScanResult[];
  onSelectCompanion?: (companion: AntigravityScanResult) => void;
}

export const CompanionDeckView: React.FC<CompanionDeckViewProps> = ({
  companion,
  onScanNewCompanion,
  onDisconnectCompanion,
  companionHistory = [],
  onSelectCompanion,
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  const handleCopyLink = () => {
    if (!companion) return;
    navigator.clipboard.writeText(companion.companionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    if (!companion) return;
    window.open(companion.accountChooserUrl, "_blank", "noopener,noreferrer");
  };

  // If no companion active, show the zero-state with 1-tap scan launcher
  if (!companion) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[500px] max-w-md mx-auto space-y-6 animate-in fade-in select-none">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-indigo-500/20 to-purple-500/20 p-1 flex items-center justify-center shadow-neo-soft border border-indigo-200/50">
            <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center shadow-inner">
              <Globe className="w-9 h-9 text-indigo-600 animate-pulse" />
            </div>
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500 border-2 border-white"></span>
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center justify-center gap-1.5">
            ANTIGRAVITY REMOTE COMPANION
            <Sparkles className="w-4 h-4 text-cyan-500" />
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
            Work with local agents on your computer from this phone in real time.
          </p>
        </div>

        <div className="w-full p-4 rounded-2xl bg-white shadow-neo-flat border border-white/80 space-y-3 text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Laptop className="w-4 h-4 text-indigo-600" />
            <span>How to connect in 5 seconds:</span>
          </div>
          <ol className="text-[11px] text-slate-500 space-y-1.5 pl-5 list-decimal font-medium">
            <li>Open Antigravity on your PC</li>
            <li>Go to <strong className="text-slate-700">Settings &gt; Application</strong></li>
            <li>Under <strong className="text-slate-700">Remote Control</strong>, toggle on</li>
            <li>Tap the button below and point your camera at the QR code</li>
          </ol>
        </div>

        <button
          onClick={onScanNewCompanion}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all"
        >
          <Camera className="w-4 h-4" />
          <span>Scan Antigravity Screen QR</span>
        </button>

        {/* Previous Session History */}
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
                  className="w-full p-2.5 rounded-xl bg-white/80 hover:bg-white shadow-neo-soft border border-white/80 flex items-center justify-between transition-all"
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

  // Active Companion Viewport
  return (
    <div className="flex flex-col h-full w-full bg-[#0a0d14] text-white select-none">
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
                <span>LIVE</span>
              </span>
            </div>
            <div className="text-[9px] font-mono text-cyan-300 truncate max-w-[150px] sm:max-w-xs">
              {companion.instanceId}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
            title="Copy Companion URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Refresh Iframe */}
          <button
            onClick={() => {
              setIsLoading(true);
              setIframeKey((k) => k + 1);
            }}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95"
            title="Reload Companion Web Session"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          {/* Open in Chrome Browser */}
          <button
            onClick={handleOpenExternal}
            className="h-7 px-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
            title="Open in Google Chrome (Authenticated)"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Chrome</span>
          </button>

          {/* Scan Another Rig */}
          <button
            onClick={onScanNewCompanion}
            className="h-7 px-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95"
            title="Scan Another Antigravity Rig"
          >
            <Camera className="w-3 h-3" />
            <span className="hidden sm:inline">Scan</span>
          </button>

          {/* Disconnect */}
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

      {/* Embedded Viewport */}
      <div className="flex-1 relative bg-black overflow-hidden flex flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-[#0a0d14] flex flex-col items-center justify-center text-center p-6 space-y-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-200">Connecting to Google Antigravity...</div>
              <div className="text-[10px] text-slate-500 font-mono">
                Instance: {companion.instanceId}
              </div>
            </div>
          </div>
        )}

        <iframe
          key={iframeKey}
          src={companion.companionUrl}
          onLoad={() => setIsLoading(false)}
          className="flex-1 w-full h-full border-none bg-black"
          title="Antigravity Cloud Companion"
          allow="camera; microphone; clipboard-write; clipboard-read; display-capture"
        />
      </div>

      {/* Bottom Status Ribbon */}
      <div className="h-6 px-3 bg-[#0c1018] border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-mono shrink-0">
        <span className="flex items-center gap-1.5 text-cyan-400/90 truncate">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Antigravity Remote Control Bridge</span>
        </span>
        <span className="text-[9px] text-slate-400">Google Cloud Companion</span>
      </div>
    </div>
  );
};
