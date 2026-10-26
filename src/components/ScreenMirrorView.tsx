"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Monitor,
  Sparkles,
  MousePointer,
  Hand,
  Maximize2,
  RotateCw,
  Camera,
  Keyboard,
  Zap,
  Sliders,
  ChevronDown,
  X,
  Send,
  CheckCircle2,
  Eye,
} from "lucide-react";
import type { GravKtrlClient, ScreenInfo } from "../lib/gravktrl-client";

interface ScreenMirrorViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
}

interface TouchRipple {
  id: number;
  x: number;
  y: number;
}

export const ScreenMirrorView: React.FC<ScreenMirrorViewProps> = ({ client, activeWorkspace }) => {
  const [target, setTarget] = useState<"antigravity" | "desktop">("antigravity");
  const [fps, setFps] = useState<number>(10);
  const [quality, setQuality] = useState<number>(65);
  const [interactionMode, setInteractionMode] = useState<"touch" | "view">("touch");
  const [screenInfo, setScreenInfo] = useState<ScreenInfo | null>(null);

  // Zoom & Pan state (for view mode)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stream URL & key for forcing reconnects
  const [streamKey, setStreamKey] = useState<number>(Date.now());
  const [streamError, setStreamError] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Soft Keyboard Prompt Modal
  const [showKeyboardModal, setShowKeyboardModal] = useState<boolean>(false);
  const [keyboardText, setKeyboardText] = useState<string>("");
  const [isSendingText, setIsSendingText] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Touch feedback ripples
  const [ripples, setRipples] = useState<TouchRipple[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Fetch initial screen information
  const loadScreenInfo = useCallback(async () => {
    try {
      const info = await client.getScreenInfo();
      if (info) {
        setScreenInfo(info);
      }
    } catch (e) {
      console.warn("[ScreenMirror] Failed to get screen info:", e);
    }
  }, [client]);

  useEffect(() => {
    loadScreenInfo();
    const interval = setInterval(loadScreenInfo, 10000);
    return () => clearInterval(interval);
  }, [loadScreenInfo]);

  // Construct stream URL
  const streamUrl = `${client.getScreenStreamUrl(target, fps, quality, 0.75)}&_k=${streamKey}`;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleRefreshStream = () => {
    setIsLoading(true);
    setStreamError(false);
    setStreamKey(Date.now());
    loadScreenInfo();
    triggerToast("Stream refreshed");
  };

  const handleFocusAntigravity = async () => {
    try {
      await client.sendScreenInput({ type: "focus" });
      triggerToast("Antigravity window focused on PC");
    } catch {
      triggerToast("Could not focus Antigravity window");
    }
  };

  const handleSendText = async () => {
    if (!keyboardText.trim() || isSendingText) return;
    setIsSendingText(true);
    try {
      await client.sendScreenInput({ type: "text", text: keyboardText });
      setKeyboardText("");
      setShowKeyboardModal(false);
      triggerToast("Text typed into PC window");
    } catch {
      triggerToast("Failed to send text");
    } finally {
      setIsSendingText(false);
    }
  };

  const handleSaveSnapshot = () => {
    const url = client.getScreenShotUrl(target, 85, 1.0);
    window.open(url, "_blank");
    triggerToast("Snapshot opened in new tab");
  };

  // Image Click Handler (Touch-to-Click)
  const handleImagePointerDown = async (e: React.PointerEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;

    if (interactionMode === "view") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    const rect = imgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
      return;
    }

    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    // Show visual ripple dot
    const rippleId = Date.now();
    setRipples((prev) => [...prev, { id: rippleId, x: e.clientX, y: e.clientY }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 600);

    // Send click to PC
    const buttonType = e.button === 2 ? "right_click" : "click";
    try {
      await client.sendScreenInput({
        type: buttonType,
        normX,
        normY,
        target,
      });
    } catch (err) {
      console.warn("[ScreenMirror] Click injection failed:", err);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (interactionMode === "view" && isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 select-none relative overflow-hidden">
      {/* 1. TOP SILK NEOMORPHIC CONTROL BAR */}
      <div className="mx-3 mt-3 p-2.5 rounded-2xl bg-white shadow-neo-flat border border-white/60 flex flex-col gap-2 shrink-0 z-20">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Target Mode Switcher (Antigravity vs Desktop) */}
          <div className="flex items-center gap-1 p-1 bg-[#f0f3f8] rounded-xl neo-well border border-slate-200/50">
            <button
              type="button"
              onClick={() => setTarget("antigravity")}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                target === "antigravity"
                  ? "bg-white text-indigo-600 shadow-neo-soft"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Antigravity</span>
            </button>
            <button
              type="button"
              onClick={() => setTarget("desktop")}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                target === "desktop"
                  ? "bg-white text-indigo-600 shadow-neo-soft"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Monitor className="w-3 h-3 text-indigo-600" />
              <span>Full Desktop</span>
            </button>
          </div>

          {/* Interaction Mode Switcher (Touch vs View/Pan) */}
          <div className="flex items-center gap-1 p-1 bg-[#f0f3f8] rounded-xl neo-well border border-slate-200/50">
            <button
              type="button"
              onClick={() => {
                setInteractionMode("touch");
                handleResetZoom();
              }}
              className={`h-7 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                interactionMode === "touch"
                  ? "bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-neo-soft"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Touch to Click PC Cursor"
            >
              <MousePointer className="w-3 h-3 text-indigo-600" />
              <span className="hidden min-[340px]:inline">Click Mode</span>
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode("view")}
              className={`h-7 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                interactionMode === "view"
                  ? "bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-neo-soft"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Pan & Zoom Mode"
            >
              <Hand className="w-3 h-3 text-indigo-600" />
              <span className="hidden min-[340px]:inline">Pan & Zoom</span>
            </button>
          </div>
        </div>

        {/* Secondary Info & Performance Row */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE MJPEG
            </span>
            <span>•</span>
            <span>
              {screenInfo?.screenWidth || 1920}×{screenInfo?.screenHeight || 1080}
            </span>
            {target === "antigravity" && screenInfo?.antigravity.found && (
              <>
                <span>•</span>
                <span className="text-indigo-600 font-bold truncate max-w-[120px]">
                  {screenInfo.antigravity.title || "Antigravity.exe"}
                </span>
              </>
            )}
          </div>

          {/* FPS Selector Pill */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400">FPS:</span>
            {[5, 10, 15].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setFps(val)}
                className={`px-1.5 py-0.5 rounded-md font-bold transition-all ${
                  fps === val
                    ? "bg-indigo-100 text-indigo-700 font-extrabold"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. MAIN MIRROR CANVAS CONTAINER */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex-1 min-h-0 mx-3 my-2 rounded-2xl bg-slate-950 shadow-inner border border-slate-800 flex items-center justify-center overflow-hidden relative cursor-crosshair"
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-10 text-white gap-2">
            <div className="w-7 h-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-indigo-400">Connecting to PC display stream...</span>
          </div>
        )}

        {streamError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 gap-3">
            <Monitor className="w-10 h-10 text-slate-600" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-300">Stream Connection Paused</span>
              <span className="text-[11px] font-mono mt-0.5">Host daemon stream disconnected</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshStream}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-neo-soft flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry Stream</span>
            </button>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={streamUrl}
            alt="PC Remote Screen Mirror"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setStreamError(true);
            }}
            onPointerDown={handleImagePointerDown}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
              transition: isPanning ? "none" : "transform 0.15s ease-out",
            }}
            className="max-w-full max-h-full object-contain pointer-events-auto select-none touch-none"
          />
        )}

        {/* Visual Touch Ripples */}
        {ripples.map((r) => (
          <div
            key={r.id}
            style={{ left: r.x, top: r.y }}
            className="fixed -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-indigo-400 bg-indigo-500/30 pointer-events-none animate-ping z-30"
          />
        ))}

        {/* Zoom Controls Overlay (Visible in Pan & Zoom mode) */}
        {interactionMode === "view" && (
          <div className="absolute top-3 right-3 flex items-center gap-1 p-1 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/60 z-20">
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-7 h-7 rounded-lg text-white font-bold flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-xs"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] font-mono text-indigo-400 font-bold px-1">{zoomLevel.toFixed(1)}x</span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-7 h-7 rounded-lg text-white font-bold flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-xs"
              title="Zoom In"
            >
              +
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center hover:bg-slate-800 transition-all text-xs ml-1"
                title="Reset Zoom"
              >
                1x
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. TACTICAL FLOATING ACTION BAR */}
      <div className="mx-3 mb-20 p-2 rounded-2xl bg-white shadow-neo-soft border border-white/80 flex items-center justify-around gap-1 shrink-0 z-20">
        {/* Focus Antigravity Button */}
        <button
          type="button"
          onClick={handleFocusAntigravity}
          className="flex-1 h-9 px-2 rounded-xl bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed border border-white/80 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1.5 hover:text-indigo-600 transition-all"
          title="Bring Antigravity window to front on PC"
        >
          <Zap className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">Focus App</span>
        </button>

        {/* Soft Keyboard Input Button */}
        <button
          type="button"
          onClick={() => setShowKeyboardModal(true)}
          className="flex-1 h-9 px-2 rounded-xl bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed border border-white/80 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1.5 hover:text-indigo-600 transition-all"
          title="Send keystrokes or text to PC"
        >
          <Keyboard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">Type Text</span>
        </button>

        {/* Save Snapshot Button */}
        <button
          type="button"
          onClick={handleSaveSnapshot}
          className="h-9 px-3 rounded-xl bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed border border-white/80 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1 hover:text-indigo-600 transition-all shrink-0"
          title="Capture and download full-res screenshot"
        >
          <Camera className="w-3.5 h-3.5 text-indigo-600" />
          <span className="hidden min-[360px]:inline">Snap</span>
        </button>

        {/* Refresh Stream Button */}
        <button
          type="button"
          onClick={handleRefreshStream}
          className="w-9 h-9 rounded-xl bg-white shadow-neo-soft hover:shadow-neo-pressed active:shadow-neo-pressed border border-white/80 flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-all shrink-0"
          title="Refresh stream connection"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4. SOFT KEYBOARD TYPING MODAL */}
      {showKeyboardModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full sm:max-w-md mx-auto bg-[#f6f8fb] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/80 flex flex-col overflow-hidden animate-in slide-in-from-bottom p-4 gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-xs text-slate-800">Remote Keyboard Input</span>
                  <span className="text-[10px] text-slate-400 font-mono">Types text directly into the PC active window</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyboardModal(false)}
                className="w-7 h-7 rounded-full bg-white shadow-neo-soft flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="neo-well rounded-2xl p-2">
              <textarea
                rows={3}
                value={keyboardText}
                onChange={(e) => setKeyboardText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                placeholder="Type text or code to send to PC..."
                className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none font-mono"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 font-mono">Press Enter to inject to PC</span>
              <button
                type="button"
                onClick={handleSendText}
                disabled={!keyboardText.trim() || isSendingText}
                className="h-9 px-4 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-xs shadow-neo-soft flex items-center gap-1.5 hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to PC</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white font-mono text-[11px] shadow-2xl backdrop-blur-md flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
