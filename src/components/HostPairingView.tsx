"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Server,
  Wifi,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  Check,
  AlertCircle,
  RefreshCw,
  QrCode,
  Trash2,
  Plus,
  Camera,
  Search,
  Download,
  X,
  ExternalLink,
} from "lucide-react";
import type { GravKtrlClient, PcProfile, TelemetryData, ConnectionState } from "../lib/gravktrl-client";

interface HostPairingViewProps {
  client: GravKtrlClient;
  connectionState: ConnectionState;
  latencyMs: number | null;
  telemetry: TelemetryData | null;
  onRefreshTelemetry: () => void;
}

export const HostPairingView: React.FC<HostPairingViewProps> = ({
  client,
  connectionState,
  latencyMs,
  telemetry,
  onRefreshTelemetry,
}) => {
  const [profiles, setProfiles] = useState<PcProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PcProfile | null>(null);

  // Form fields
  const [profileName, setProfileName] = useState("Home PC (LAN)");
  const [hostIp, setHostIp] = useState("192.168.1.3");
  const [port, setPort] = useState(8787);
  const [token, setToken] = useState("");
  const [isTailscale, setIsTailscale] = useState(false);
  const [uriInput, setUriInput] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Auto-detect & Camera Scanner
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProfiles();
    return () => {
      stopCameraScanner();
    };
  }, []);

  const loadProfiles = () => {
    const list = client.getSavedProfiles();
    setProfiles(list);
    const active = client.getCurrentProfile() || list[0] || null;
    setActiveProfile(active);

    if (active) {
      setProfileName(active.name);
      setHostIp(active.host);
      setPort(active.port);
      setToken(active.token);
      setIsTailscale(active.isTailscale);
    }
  };

  const parseDeepLinkUri = (uri: string): boolean => {
    try {
      const cleanUri = uri.trim();
      let h = "";
      let p = 8787;
      let t = "";

      if (cleanUri.startsWith("gravktrl://")) {
        const urlObj = new URL(cleanUri.replace("gravktrl://", "http://"));
        h = urlObj.searchParams.get("host") || urlObj.hostname;
        p = parseInt(urlObj.searchParams.get("port") || "8787", 10);
        t = urlObj.searchParams.get("token") || "";
      } else if (cleanUri.startsWith("http://") || cleanUri.startsWith("https://")) {
        const urlObj = new URL(cleanUri);
        h = urlObj.hostname;
        p = parseInt(urlObj.port || "8787", 10);
        t = urlObj.searchParams.get("token") || "";
      } else if (cleanUri.length === 64 && /^[0-9a-fA-F]+$/.test(cleanUri)) {
        t = cleanUri;
      }

      if (h) setHostIp(h);
      if (p) setPort(p);
      if (t) setToken(t);
      if (h && h.startsWith("100.")) setIsTailscale(true);
      if (h) setProfileName(h.startsWith("100.") ? "PC (Tailscale VPN)" : "PC (Wi-Fi LAN)");

      setUriInput("");

      if (h && t) {
        // Auto-save and connect
        const profile: PcProfile = {
          id: "profile-" + Date.now(),
          name: h.startsWith("100.") ? "PC (Tailscale VPN)" : "PC (Wi-Fi LAN)",
          host: h,
          port: p,
          token: t,
          isTailscale: h.startsWith("100."),
          lastConnected: new Date().toISOString(),
        };
        client.saveProfile(profile);
        setActiveProfile(profile);
        setProfiles(client.getSavedProfiles());
        client.connect(profile);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveProfile = () => {
    if (!hostIp.trim() || !token.trim()) {
      alert("Please provide both Host IP and the 256-bit Pairing Token.");
      return;
    }

    const newProfile: PcProfile = {
      id: activeProfile?.id || "profile-" + Date.now(),
      name: profileName.trim() || "Host PC",
      host: hostIp.trim(),
      port,
      token: token.trim(),
      isTailscale,
      lastConnected: new Date().toISOString(),
    };

    client.saveProfile(newProfile);
    setActiveProfile(newProfile);
    setProfiles(client.getSavedProfiles());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);

    // Connect immediately
    client.connect(newProfile);
  };

  const handleSelectProfile = (p: PcProfile) => {
    setActiveProfile(p);
    setProfileName(p.name);
    setHostIp(p.host);
    setPort(p.port);
    setToken(p.token);
    setIsTailscale(p.isTailscale);
    client.connect(p);
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    client.deleteProfile(id);
    setProfiles(client.getSavedProfiles());
  };

  // --- Auto-Detect PC Daemon on Subnet ---
  const autoDetectHost = async () => {
    setIsDetecting(true);
    setDetectStatus("Scanning local subnet for GravKtrl daemon...");

    const candidates = [
      window?.location?.hostname,
      hostIp,
      "192.168.1.3",
      "192.168.1.2",
      "192.168.1.4",
      "192.168.0.2",
      "192.168.0.3",
      "127.0.0.1",
    ].filter(Boolean) as string[];

    // Remove duplicates
    const uniqueCandidates = Array.from(new Set(candidates));

    for (const ip of uniqueCandidates) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 800);
        const res = await fetch(`http://${ip}:${port}/health`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data.service === "gravktrl-daemon") {
            setHostIp(ip);
            setDetectStatus(`✅ Discovered GravKtrl PC Daemon at ${ip}:${port}`);
            setIsDetecting(false);
            return;
          }
        }
      } catch {}
    }

    setDetectStatus("No daemon found automatically. Please enter IP from PC terminal.");
    setIsDetecting(false);
  };

  // --- In-App Camera QR Code Scanner ---
  const startCameraScanner = async () => {
    setCameraError(null);
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Check if native BarcodeDetector API exists in browser/WebView
      const hasBarcodeDetector = "BarcodeDetector" in window;
      if (hasBarcodeDetector) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                const qrValue = barcodes[0].rawValue;
                stopCameraScanner();
                parseDeepLinkUri(qrValue);
              }
            } catch {}
          }
        }, 300);
      }
    } catch (err: any) {
      setCameraError("Camera access denied or unavailable: " + (err.message || String(err)));
    }
  };

  const stopCameraScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#08090d] text-slate-100 select-text overflow-y-auto p-3 space-y-4">
      {/* Seamless Pairing Quick Action Pill */}
      <div className="p-3 bg-gradient-to-r from-cyan-950/70 to-emerald-950/70 border border-cyan-500/50 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Seamless 1-Tap Pairing</div>
            <div className="text-[10px] text-cyan-200">
              Scan PC terminal QR code or auto-detect on Wi-Fi
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={startCameraScanner}
            className="px-2.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1 shadow active:scale-95 transition-all"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan QR</span>
          </button>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      {isScanning && (
        <div className="p-3 bg-black/90 border-2 border-cyan-500 rounded-2xl relative space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
              <Camera className="w-4 h-4" />
              Point Camera at PC Terminal QR Code
            </span>
            <button
              onClick={stopCameraScanner}
              className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {cameraError && (
              <div className="absolute inset-0 bg-black/80 p-4 text-xs text-rose-300 flex items-center justify-center text-center">
                {cameraError}
              </div>
            )}
            <div className="absolute inset-8 border-2 border-dashed border-cyan-400/80 rounded-lg pointer-events-none animate-pulse" />
          </div>

          <div className="text-[11px] text-slate-400 text-center">
            Camera will auto-detect token and connect instantly.
          </div>
        </div>
      )}

      {/* Telemetry Card (If Connected) */}
      <div className="p-3.5 bg-[#0d1117] border border-[#21262d] rounded-2xl">
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#21262d]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              PC Hardware Telemetry
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {connectionState === "authenticated" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE {latencyMs ? `• ${latencyMs}ms` : ""}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px]">
                {connectionState.toUpperCase()}
              </span>
            )}

            <button
              onClick={onRefreshTelemetry}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {telemetry ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-[#161b22] rounded-xl border border-[#21262d]">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 text-[11px]">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  CPU Load
                </span>
                <span className="font-bold text-white text-xs">
                  {telemetry.cpuUsagePercent}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, telemetry.cpuUsagePercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 truncate">
                {telemetry.cpuCores} Cores ({telemetry.arch})
              </div>
            </div>

            <div className="p-2.5 bg-[#161b22] rounded-xl border border-[#21262d]">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="flex items-center gap-1 text-[11px]">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  RAM Usage
                </span>
                <span className="font-bold text-white text-xs">
                  {telemetry.memoryUsagePercent}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, telemetry.memoryUsagePercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 truncate">
                {Math.round(telemetry.usedMemoryBytes / 1024 / 1024 / 1024 * 10) / 10}GB /{" "}
                {Math.round(telemetry.totalMemoryBytes / 1024 / 1024 / 1024 * 10) / 10}GB
              </div>
            </div>

            <div className="p-2 bg-[#161b22] rounded-xl border border-[#21262d] flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Uptime
              </span>
              <span className="font-mono text-[11px] text-slate-200">
                {telemetry.uptimeFormatted}
              </span>
            </div>

            <div className="p-2 bg-[#161b22] rounded-xl border border-[#21262d] flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                CDP :9222
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  telemetry.cdpHealthy
                    ? "bg-emerald-950/70 border border-emerald-800 text-emerald-300"
                    : "bg-amber-950/70 border border-amber-800 text-amber-300"
                }`}
              >
                {telemetry.cdpHealthy ? "ACTIVE" : "FALLBACK"}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-slate-500">
            {connectionState === "authenticated"
              ? "Loading system telemetry..."
              : "Connect to PC to view real-time CPU, RAM, and CDP health."}
          </div>
        )}
      </div>

      {/* Saved Profiles List */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Saved PC Host Profiles
        </span>
        <div className="space-y-1.5">
          {profiles.map((p) => {
            const isSelected = activeProfile?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  isSelected
                    ? "bg-cyan-950/40 border-cyan-500/80 text-white glow-cyan"
                    : "bg-[#0d1117] border-[#21262d] text-slate-300 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wifi
                    className={`w-4 h-4 ${p.isTailscale ? "text-amber-400" : "text-cyan-400"}`}
                  />
                  <div>
                    <div className="text-xs font-medium">{p.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {p.host}:{p.port} {p.isTailscale ? "• Tailscale VPN" : "• LAN"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 text-[10px] font-semibold">
                      ACTIVE
                    </span>
                  )}
                  {profiles.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteProfile(p.id, e)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connection & Auth Form */}
      <div className="p-3.5 bg-[#0d1117] border border-[#21262d] rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Host Connection & Auth Token
          </span>

          <button
            onClick={autoDetectHost}
            disabled={isDetecting}
            className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
          >
            <Search className="w-3 h-3" />
            <span>{isDetecting ? "Scanning..." : "Auto-Detect PC"}</span>
          </button>
        </div>

        {detectStatus && (
          <div className="p-2 rounded bg-cyan-950/40 border border-cyan-800 text-[11px] text-cyan-200">
            {detectStatus}
          </div>
        )}

        <div className="space-y-2.5">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">PC Host IPv4 (LAN / Tailscale)</label>
              <input
                type="text"
                value={hostIp}
                onChange={(e) => setHostIp(e.target.value)}
                placeholder="192.168.1.3 or 100.x.x.x"
                className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 8787)}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">256-bit Pairing Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token or gravktrl:// URI..."
              className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isTailscale}
                onChange={(e) => setIsTailscale(e.target.checked)}
                className="rounded border-[#30363d] text-cyan-500 focus:ring-0"
              />
              <span>Route via Tailscale VPN (100.x.x.x)</span>
            </label>
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all mt-2"
        >
          {saveSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Saved & Connecting...</span>
            </>
          ) : (
            <>
              <Server className="w-4 h-4" />
              <span>Save & Connect to PC Host</span>
            </>
          )}
        </button>
      </div>

      {/* Direct APK Download Link */}
      <div className="p-3 bg-[#0d1117] border border-[#21262d] rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-300">Direct APK Download for Phone</span>
        </div>
        <a
          href={`http://${hostIp}:${port}/download-apk`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
        >
          <span>Download</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
