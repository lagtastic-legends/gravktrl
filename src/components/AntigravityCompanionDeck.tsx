"use client";

import React, { useState } from "react";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Laptop,
  ShieldCheck,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { AntigravityScanResult } from "./CameraQrScannerModal";

interface AntigravityCompanionDeckProps {
  isOpen: boolean;
  onClose: () => void;
  data: AntigravityScanResult | null;
  onLinkPcHost?: () => void;
}

export const AntigravityCompanionDeck: React.FC<AntigravityCompanionDeckProps> = ({
  isOpen,
  onClose,
  data,
  onLinkPcHost,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "embedded">("card");
  const [iframeKey, setIframeKey] = useState(0);

  if (!isOpen || !data) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(data.companionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    window.open(data.accountChooserUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xl animate-in fade-in select-none">
      <div
        className={`relative w-full ${
          viewMode === "embedded" ? "max-w-4xl h-[92vh]" : "max-w-md"
        } bg-[#0f1117] rounded-3xl overflow-hidden border border-cyan-500/30 shadow-2xl flex flex-col transition-all duration-300`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#161a23]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-[#0f1117] rounded-[10px] flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                ANTIGRAVITY REMOTE COMPANION
                <Sparkles className="w-3 h-3 text-cyan-400" />
              </h3>
              <p className="text-[10px] text-cyan-400 font-mono truncate max-w-[200px]">
                ID: {data.instanceId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode((prev) => (prev === "card" ? "embedded" : "card"))}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              title={viewMode === "embedded" ? "Collapse" : "Expand"}
            >
              {viewMode === "embedded" ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embedded Iframe View */}
        {viewMode === "embedded" ? (
          <div className="flex-1 bg-black relative flex flex-col">
            <div className="bg-[#131720] px-4 py-2 flex items-center justify-between border-b border-white/10 text-xs">
              <span className="text-slate-400 font-mono text-[11px] truncate max-w-sm">
                {data.companionUrl}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                  title="Reload"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleOpenExternal}
                  className="p-1 rounded-lg hover:bg-white/10 text-cyan-400 hover:text-cyan-300"
                  title="Open in Chrome"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <iframe
              key={iframeKey}
              src={data.companionUrl}
              className="flex-1 w-full border-none bg-black"
              title="Antigravity Cloud Companion"
              allow="camera; microphone; clipboard-write; clipboard-read"
            />
          </div>
        ) : (
          /* Card View */
          <div className="p-5 space-y-4">
            <div className="bg-[#131720] rounded-2xl p-4 border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-slate-200">
                  Live Agent Session Identified
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                You successfully scanned the Antigravity Remote Control QR code from your PC. You
                can now interact with your local agent from this mobile device.
              </p>

              <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-cyan-300 flex items-center justify-between">
                <span className="truncate pr-2">{data.companionUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className="p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white shrink-0"
                  title="Copy Link"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                onClick={handleOpenExternal}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Launch in Google Chrome</span>
              </button>

              <button
                onClick={() => setViewMode("embedded")}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>Open Inside GravKtrl Web Deck</span>
              </button>

              {onLinkPcHost && (
                <button
                  onClick={onLinkPcHost}
                  className="w-full py-2.5 px-4 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Laptop className="w-4 h-4" />
                  <span>Sync with GravKtrl PC Daemon</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
