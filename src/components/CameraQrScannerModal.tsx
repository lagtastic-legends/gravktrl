"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Camera,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  Image as ImageIcon,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Laptop,
  Sparkles,
  Zap,
} from "lucide-react";
import jsQR from "jsqr";

export interface AntigravityScanResult {
  type: "antigravity";
  rawUrl: string;
  instanceId: string;
  companionUrl: string;
  accountChooserUrl: string;
}

export interface GravKtrlPairingScanResult {
  type: "gravktrl";
  rawUrl: string;
  host: string;
  port: number;
  token: string;
  pin?: string;
}

export interface GenericScanResult {
  type: "generic";
  text: string;
}

export type ScanResult =
  | AntigravityScanResult
  | GravKtrlPairingScanResult
  | GenericScanResult;

interface CameraQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (result: ScanResult) => void;
  hintText?: string;
}

export const CameraQrScannerModal: React.FC<CameraQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  hintText = "Point camera at Antigravity or PC screen QR code",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isTorchAvailable, setIsTorchAvailable] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDetected, setLastDetected] = useState<ScanResult | null>(null);
  const [autoConnect, setAutoConnect] = useState(true);

  const animationFrameId = useRef<number | null>(null);
  const barcodeDetectorRef = useRef<any>(null);

  // Initialize BarcodeDetector if available in browser
  useEffect(() => {
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });
      } catch (e) {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Play audio chime and haptic feedback on successful scan
  const triggerSuccessFeedback = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([50, 40, 50]);
      } catch (_) {}
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch (_) {}
  }, []);

  // Parse raw text into structured scan result
  const parseDecodedText = useCallback((raw: string): ScanResult => {
    const trimmed = raw.trim();

    // 1. Antigravity Remote Control Companion URL: https://antigravity.google.com/r/<instanceId>
    const antigravityMatch = trimmed.match(
      /(?:https?:\/\/)?antigravity\.google\.com\/r\/([a-zA-Z0-9_\-]+)/i
    );
    if (antigravityMatch) {
      const instanceId = antigravityMatch[1];
      const companionUrl = `https://antigravity.google.com/r/${instanceId}`;
      const accountChooserUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(
        companionUrl
      )}`;

      return {
        type: "antigravity",
        rawUrl: trimmed,
        instanceId,
        companionUrl,
        accountChooserUrl,
      };
    }

    // 2. GravKtrl Host Pairing Deep Link (gravktrl://pair?host=... or http://<ip>:8787/?token=...)
    if (trimmed.startsWith("gravktrl://") || trimmed.includes(":8787")) {
      try {
        const urlStr = trimmed.startsWith("gravktrl://")
          ? trimmed.replace("gravktrl://", "http://")
          : trimmed;
        const parsed = new URL(urlStr);
        const host = parsed.searchParams.get("host") || parsed.hostname;
        const port = parseInt(parsed.searchParams.get("port") || "8787", 10);
        const token = parsed.searchParams.get("token") || "";
        const pin = parsed.searchParams.get("pin") || undefined;

        if (token) {
          return {
            type: "gravktrl",
            rawUrl: trimmed,
            host,
            port,
            token,
            pin,
          };
        }
      } catch (_) {}
    }

    return {
      type: "generic",
      text: trimmed,
    };
  }, []);

  const handleSuccessfulScan = useCallback(
    (rawText: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      triggerSuccessFeedback();

      const parsed = parseDecodedText(rawText);
      setLastDetected(parsed);

      // Instant Auto-Connect: immediately hand over to caller to connect with zero clicks
      if (autoConnect) {
        setTimeout(() => {
          onScanSuccess(parsed);
        }, 80);
      } else {
        setTimeout(() => {
          onScanSuccess(parsed);
        }, 500);
      }
    },
    [isProcessing, triggerSuccessFeedback, parseDecodedText, onScanSuccess, autoConnect]
  );

  // Start Camera Stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsProcessing(false);
    setLastDetected(null);

    // Stop existing stream if any
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError("Camera API is not supported in this environment.");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }

      // Check for torch capability on active video track
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() as any) || {};
        setIsTorchAvailable(Boolean(capabilities.torch));
      }
    } catch (err: any) {
      console.error("[CameraQrScanner] Failed to open camera:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission was denied. Please allow camera access in Settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera device found on this system.");
      } else {
        setCameraError(err.message || "Unable to start camera viewfinder.");
      }
    }
  }, [facingMode, stream]);

  // Toggle Torch / Flashlight
  const toggleTorch = useCallback(async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      const targetState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: targetState } as any],
      });
      setIsTorchOn(targetState);
    } catch (e) {
      console.warn("Torch toggle failed:", e);
    }
  }, [stream, isTorchOn]);

  // Frame Processing Loop
  useEffect(() => {
    if (!isOpen || !stream || isProcessing) return;

    let isScanning = true;

    const scanFrame = async () => {
      if (!isScanning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        // 1. Try native BarcodeDetector if available
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              isScanning = false;
              handleSuccessfulScan(barcodes[0].rawValue);
              return;
            }
          } catch (_) {}
        }

        // 2. Fallback to jsQR via offscreen canvas
        if (canvas) {
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;

          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);

            const qrCode = jsQR(imageData.data, width, height, {
              inversionAttempts: "attemptBoth",
            });

            if (qrCode && qrCode.data) {
              isScanning = false;
              handleSuccessfulScan(qrCode.data);
              return;
            }
          }
        }
      }

      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    animationFrameId.current = requestAnimationFrame(scanFrame);

    return () => {
      isScanning = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen, stream, isProcessing, handleSuccessfulScan]);

  // Open/Close Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);
      }
      setIsProcessing(false);
      setLastDetected(null);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen]);

  // Gallery Image Upload Scanner
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const qrCode = jsQR(imageData.data, img.width, img.height, {
          inversionAttempts: "attemptBoth",
        });

        if (qrCode && qrCode.data) {
          handleSuccessfulScan(qrCode.data);
        } else {
          alert("No QR code was detected in the selected image. Please try another photo.");
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste Scanner
  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        handleSuccessfulScan(text.trim());
      } else {
        alert("Clipboard is empty or contains no readable text.");
      }
    } catch (e) {
      alert("Clipboard access was not permitted. Please paste manually.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xl animate-in fade-in select-none">
      <div className="relative w-full max-w-md bg-[#0f1117] rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#161a23]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <div className="w-full h-full bg-[#0f1117] rounded-[10px] flex items-center justify-center">
                <Camera className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                ANTIGRAVITY QR SCANNER
                <Sparkles className="w-3 h-3 text-cyan-400" />
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">Real-Time Screen & Host Linker</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
            title="Close Scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative flex-1 bg-black min-h-[340px] flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="px-6 text-center space-y-3 z-10 max-w-xs">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <div className="text-xs font-bold text-rose-300">{cameraError}</div>
              <button
                onClick={startCamera}
                className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition-all"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <>
              {/* Real Video Element */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Hidden Canvas for jsQR Frame Extraction */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Dimmed Mask Overlay */}
              <div className="absolute inset-0 bg-black/40 pointer-events-none" />

              {/* Viewfinder Target Window */}
              <div className="relative w-64 h-64 rounded-3xl border border-white/20 shadow-2xl flex items-center justify-center pointer-events-none">
                {/* 4 Neon Cyberpunk Brackets */}
                <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-cyan-400 rounded-tl-2xl shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-cyan-400 rounded-tr-2xl shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-cyan-400 rounded-bl-2xl shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-cyan-400 rounded-br-2xl shadow-[0_0_12px_rgba(34,211,238,0.8)]" />

                {/* Animated Laser Scanline */}
                {!isProcessing && (
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#22d3ee] animate-pulse top-0 animate-[scan_2s_ease-in-out_infinite]" />
                )}

                {/* Success Feedback Overlay */}
                {isProcessing && lastDetected && (
                  <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-xs rounded-3xl flex flex-col items-center justify-center text-white space-y-1.5 animate-in zoom-in-95">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 drop-shadow" />
                    <span className="text-xs font-black tracking-wider uppercase">
                      {lastDetected.type === "antigravity"
                        ? "Antigravity Linked!"
                        : lastDetected.type === "gravktrl"
                        ? "PC Paired!"
                        : "QR Detected!"}
                    </span>
                  </div>
                )}
              </div>

              {/* Status Hint Pill */}
              <div className="absolute bottom-4 inset-x-4 text-center pointer-events-none">
                <span className="inline-block px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-slate-200 shadow-lg">
                  {hintText}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-4 bg-[#131720] border-t border-white/10 space-y-3">
          {/* Instant Auto-Connect Toggle Strip */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold">Instant Auto-Connect</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoConnect(!autoConnect)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase transition-all ${
                autoConnect
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20"
                  : "bg-white/5 text-slate-400 border border-white/10"
              }`}
            >
              {autoConnect ? "ON (Instant Link)" : "OFF (Manual)"}
            </button>
          </div>

          <div className="flex items-center justify-around gap-2">
            {/* Torch Toggle */}
            <button
              onClick={toggleTorch}
              disabled={!isTorchAvailable}
              className={`flex-1 py-2.5 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                isTorchOn
                  ? "bg-amber-400/20 border-amber-400/40 text-amber-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white disabled:opacity-40"
              }`}
            >
              {isTorchOn ? <Flashlight className="w-4 h-4 text-amber-300" /> : <FlashlightOff className="w-4 h-4" />}
              <span>{isTorchOn ? "Flash On" : "Torch"}</span>
            </button>

            {/* Flip Camera */}
            <button
              onClick={() => {
                setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
              }}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <SwitchCamera className="w-4 h-4" />
              <span>Flip</span>
            </button>

            {/* Upload Image */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Gallery</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Clipboard Paste */}
            <button
              onClick={handleClipboardPaste}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <Clipboard className="w-4 h-4" />
              <span>Paste</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span className="flex items-center gap-1">
              <Laptop className="w-3 h-3 text-indigo-400" /> Antigravity Settings &gt; Application
            </span>
            <span className="font-mono text-cyan-400">BarcodeDetector + jsQR</span>
          </div>
        </div>
      </div>
    </div>
  );
};
