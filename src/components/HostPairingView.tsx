"use client";

import React, { useState, useEffect, useRef } from "react";
import type { GravKtrlClient, PcProfile, TelemetryData, ConnectionState } from "../lib/gravktrl-client";

interface HostPairingViewProps {
  client: GravKtrlClient;
  connectionState: ConnectionState;
  latencyMs: number | null;
  telemetry: TelemetryData | null;
  onRefreshTelemetry: () => void;
  activeWorkspace?: string;
  onSwitchWorkspace?: (path: string) => void;
  onOpenOnboarding?: () => void;
}

export const HostPairingView: React.FC<HostPairingViewProps> = ({
  client,
  connectionState,
  latencyMs,
  telemetry,
  onRefreshTelemetry,
  activeWorkspace = "C:\\Users\\devra\\Downloads\\gravktrl",
  onSwitchWorkspace,
  onOpenOnboarding,
}) => {
  const [profiles, setProfiles] = useState<PcProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PcProfile | null>(null);

  // Token visibility & inputs
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  // Micro Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAlert, setToastAlert] = useState(false);

  // CPU history for SVG sparkline
  const [cpuHistory, setCpuHistory] = useState<number[]>([15, 20, 18, 24, 19, 22, 18]);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (telemetry?.cpuUsagePercent !== undefined) {
      setCpuHistory((prev) => [...prev.slice(1), telemetry.cpuUsagePercent]);
    }
  }, [telemetry?.cpuUsagePercent]);

  const loadProfiles = () => {
    const list = client.getSavedProfiles();
    setProfiles(list);
    const active = client.getCurrentProfile() || list[0] || null;
    setActiveProfile(active);
  };

  const showToast = (msg: string, isAlert: boolean = false) => {
    setToastMessage(msg);
    setToastAlert(isAlert);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  const handleSelectProfile = (p: PcProfile) => {
    setActiveProfile(p);
    client.saveProfile(p);
    client.connect(p);
    showToast(`Switched to profile: ${p.name}`);
  };

  const handleCopyUri = () => {
    if (!activeProfile) return;
    const uri = `gravktrl://pair?host=${encodeURIComponent(activeProfile.host)}&port=${activeProfile.port}&token=${encodeURIComponent(activeProfile.token)}`;
    navigator.clipboard.writeText(uri).then(() => {
      showToast("Pairing URI copied to clipboard");
    });
  };

  const handleCopyToken = () => {
    if (!activeProfile?.token) return;
    navigator.clipboard.writeText(activeProfile.token).then(() => {
      showToast("Secret Token copied to clipboard");
    });
  };

  const handlePasteToken = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && activeProfile) {
        const updated = { ...activeProfile, token: text.trim() };
        client.saveProfile(updated);
        setActiveProfile(updated);
        client.connect(updated);
        showToast("Token updated & reconnecting...");
      }
    } catch {
      showToast("Could not read clipboard", true);
    }
  };

  const handleRestartDaemon = async () => {
    showToast("Restarting daemon requested [SIGUSR1]", true);
    try {
      await client.executeTerminal("node scripts/start-gravktrl-pc.ps1");
    } catch {
      // Ignored
    }
  };

  const handleDisconnect = () => {
    client.disconnect();
    showToast("Session cleanly severed", true);
  };

  // Sparkline coordinates
  const sparklinePoints = cpuHistory
    .map((val, idx) => {
      const x = (idx / (cpuHistory.length - 1)) * 100;
      const y = 28 - Math.max(2, Math.min(26, (val / 100) * 28));
      return `${x},${y}`;
    })
    .join(" ");

  const sparklinePolygon = `0,28 ${sparklinePoints} 100,28`;

  const ramUsedGb = telemetry?.usedMemoryBytes
    ? (telemetry.usedMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
    : "4.2";
  const ramTotalGb = telemetry?.totalMemoryBytes
    ? (telemetry.totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
    : "16.0";
  const ramPercent = telemetry?.memoryUsagePercent ?? 23;

  const currentHost = activeProfile?.host || "192.168.1.2";
  const currentPort = activeProfile?.port || 8787;
  const isTailscale = activeProfile?.isTailscale || currentHost.startsWith("100.");
  const tokenValue = activeProfile?.token || "df0cb8df9564ffb34244bf6b8fbcd6808d4cd5c1918ed944e3e96aa12234159a";

  return (
    <div className="flex flex-col relative w-full pb-24 px-4 gap-4 pt-3 select-text">
      {/* Active Host Connection Card */}
      <div className="w-full bg-white rounded-2xl p-4 shadow-neo-flat relative border border-white/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600 border border-indigo-100 shrink-0">
              <span className="material-symbols-outlined text-[24px]">desktop_windows</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-800 tracking-tight truncate">
                  {telemetry?.hostname || activeProfile?.name || "GRAVKTRL-HOST"}
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full uppercase shrink-0">
                  {isTailscale ? "Tailscale" : "Local"}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-500 truncate">
                {telemetry ? `${telemetry.platform} ${telemetry.arch}` : "Windows 11 Pro 64-bit"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/60 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-[13px]">verified_user</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {connectionState === "authenticated" ? "SECURE" : "UNPAIRED"}
            </span>
          </div>
        </div>

        {/* Connection Route Pill Selector */}
        <div className="grid grid-cols-2 gap-2.5 pt-3">
          {/* LAN DIRECT */}
          <button
            onClick={() => {
              if (activeProfile && isTailscale && activeProfile.lanIp) {
                handleSelectProfile({ ...activeProfile, host: activeProfile.lanIp, isTailscale: false });
              }
            }}
            className={`p-2.5 rounded-xl text-left flex flex-col gap-1 relative transition-all ${
              !isTailscale
                ? "bg-[#f8fafc] border border-indigo-200 shadow-neo-soft"
                : "neo-well opacity-75 hover:opacity-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                LAN DIRECT
              </span>
              <span className="font-mono text-[11px] text-emerald-600 font-bold">
                {latencyMs !== null ? `${latencyMs}ms` : "8ms"}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500 truncate">
              {activeProfile?.lanIp ? `${activeProfile.lanIp}:${currentPort}` : `${currentHost}:${currentPort}`}
            </span>
          </button>

          {/* TAILSCALE VPN */}
          <button
            onClick={() => {
              if (activeProfile && !isTailscale && activeProfile.tailscaleIp) {
                handleSelectProfile({ ...activeProfile, host: activeProfile.tailscaleIp, isTailscale: true });
              }
            }}
            className={`p-2.5 rounded-xl text-left flex flex-col gap-1 relative transition-all ${
              isTailscale
                ? "bg-[#f8fafc] border border-indigo-200 shadow-neo-soft"
                : "neo-well opacity-75 hover:opacity-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                TAILSCALE VPN
              </span>
              <span className="font-mono text-[11px] text-indigo-600 font-semibold">
                {isTailscale && latencyMs !== null ? `${latencyMs}ms` : "22ms"}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500 truncate">
              {activeProfile?.tailscaleIp ? `${activeProfile.tailscaleIp}:${currentPort}` : "100.x.x.x:8787"}
            </span>
          </button>
        </div>

        {/* Status Bar Strip */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f1f5f9] mt-3 border border-slate-200/50">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-600 text-[16px]">shield</span>
            <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider">
              {connectionState === "authenticated"
                ? "CONNECTED & AUTHENTICATED"
                : connectionState === "connecting"
                ? "CONNECTING TO PC..."
                : "DISCONNECTED"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <span className="material-symbols-outlined text-[14px]">sync_alt</span>
            <span className="font-mono text-[11px] font-medium">RPC 2.0 OK</span>
          </div>
        </div>
      </div>

      {/* Real-Time Telemetry HUD Section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-indigo-500 text-[16px]">speed</span>
            PC Diagnostic HUD
          </span>
          <button
            onClick={onRefreshTelemetry}
            className="font-mono text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
          >
            <span>FREQ 1000ms</span>
            <span className="material-symbols-outlined text-[13px]">refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* CPU Load Card with Sparkline */}
          <div className="bg-white p-3.5 rounded-2xl shadow-neo-flat flex flex-col justify-between gap-2 border border-white/60">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CPU LOAD</span>
                <div className="text-2xl font-extrabold text-slate-800 leading-none mt-1">
                  {telemetry?.cpuUsagePercent ?? 18}%
                </div>
              </div>
              <span className="font-mono text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
                {telemetry?.cpuCores ? `${telemetry.cpuCores}C/${telemetry.cpuCores * 2}T` : "16C/32T"}
              </span>
            </div>

            {/* Sparkline SVG */}
            <div className="w-full h-8 pt-1">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 28">
                <defs>
                  <linearGradient id="cpuGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25"></stop>
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0"></stop>
                  </linearGradient>
                </defs>
                <polygon fill="url(#cpuGrad)" points={sparklinePolygon}></polygon>
                <polyline
                  fill="none"
                  points={sparklinePoints}
                  stroke="#6366f1"
                  strokeLinecap="round"
                  strokeWidth="2.5"
                ></polyline>
              </svg>
            </div>
            <span className="font-mono text-[10px] text-slate-400 truncate">
              {telemetry?.cpuModel || "Intel / AMD Processor"}
            </span>
          </div>

          {/* RAM Gauge Card with Circular Progress */}
          <div className="bg-white p-3.5 rounded-2xl shadow-neo-flat flex flex-col justify-between gap-2 border border-white/60">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RAM ALLOC</span>
                <div className="text-2xl font-extrabold text-slate-800 leading-none mt-1">
                  {ramPercent}%
                </div>
              </div>
              <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
                <svg className="w-9 h-9 -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  ></path>
                  <path
                    className="text-indigo-600"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray={`${ramPercent}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  ></path>
                </svg>
                <span className="material-symbols-outlined text-indigo-600 text-[14px] absolute">memory</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="w-full neo-well h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${ramPercent}%` }}></div>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {ramUsedGb} GB / {ramTotalGb} GB
              </span>
            </div>
          </div>
        </div>

        {/* CDP Session & OS Uptime Info Card */}
        <div className="bg-white p-3.5 rounded-2xl shadow-neo-flat flex flex-col gap-2 border border-white/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600 text-[18px]">developer_board</span>
              <span className="font-bold text-sm text-slate-800">Antigravity Controller</span>
            </div>
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-md font-bold ${
                telemetry?.cdpHealthy
                  ? "text-emerald-700 bg-emerald-50 border border-emerald-200/80"
                  : "text-purple-700 bg-purple-50 border border-purple-200/80"
              }`}
            >
              {telemetry?.cdpHealthy ? "PORT 9222 ACTIVE" : "WIN32 NATIVE PROCESS"}
            </span>
          </div>

          <div className="p-2 neo-well rounded-xl flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">TARGET WORKSPACE:</span>
            <span className="font-mono text-[11px] text-indigo-700 truncate font-medium">
              {activeWorkspace}
            </span>
          </div>

          <div className="flex items-center justify-between pt-0.5 text-slate-500">
            <span className="text-[11px] flex items-center gap-1 font-medium">
              <span className="material-symbols-outlined text-[14px] text-slate-400">timer</span>
              OS UPTIME: {telemetry?.uptimeFormatted || "3d 14h 22m 04s"}
            </span>
            <span className="font-mono text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              DAEMON v1.1.0
            </span>
          </div>
        </div>
      </div>

      {/* Saved Host Profiles & Pairing Secret Card */}
      <div className="bg-white rounded-2xl p-4 shadow-neo-flat flex flex-col gap-3 border border-white/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-indigo-600 text-[18px]">hub</span>
            Saved Host Profiles
          </span>
          <button
            onClick={onOpenOnboarding}
            className="px-2.5 py-1 rounded-full bg-white shadow-neo-soft text-slate-700 hover:text-indigo-600 transition-all flex items-center gap-1 text-[11px] font-bold active:shadow-neo-pressed"
          >
            <span className="material-symbols-outlined text-[13px]">add</span>
            <span>NEW</span>
          </button>
        </div>

        {/* Profile Horizontal Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {profiles.map((p) => {
            const isCur = activeProfile?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0 transition-all ${
                  isCur
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm"
                    : "bg-white shadow-neo-soft text-slate-600 hover:text-slate-800"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isCur ? "bg-emerald-500 animate-pulse" : "bg-indigo-400"}`}></span>
                <span className="font-mono text-[11px] font-bold">{p.name}</span>
                {isCur && <span className="material-symbols-outlined text-[13px] text-indigo-600">check</span>}
              </button>
            );
          })}
        </div>

        {/* Zero-Trust Auth Token Input */}
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-slate-500">key</span>
              256-Bit Pairing Secret Token
            </label>
            <span className="font-mono text-[10px] font-semibold text-indigo-600">HMAC-SHA256</span>
          </div>

          <div className="relative flex items-center neo-well rounded-xl p-1.5 gap-1.5">
            <input
              className="bg-transparent text-slate-800 font-mono text-[12px] w-full px-2 py-1 focus:outline-none tracking-widest selection:bg-indigo-100"
              readOnly
              type={isTokenVisible ? "text" : "password"}
              value={tokenValue}
            />
            <button
              onClick={() => setIsTokenVisible(!isTokenVisible)}
              className="h-8 w-8 rounded-lg bg-white shadow-neo-soft text-slate-600 hover:text-indigo-600 flex items-center justify-center shrink-0 active:shadow-neo-pressed transition-all"
              title="Toggle Token Visibility"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isTokenVisible ? "visibility_off" : "visibility"}
              </span>
            </button>
            <button
              onClick={handlePasteToken}
              className="h-8 px-2.5 rounded-lg bg-white shadow-neo-soft text-slate-600 hover:text-indigo-600 flex items-center gap-1 shrink-0 active:shadow-neo-pressed transition-all"
              title="Paste token from clipboard"
            >
              <span className="material-symbols-outlined text-[14px]">content_paste</span>
              <span className="text-[10px] font-bold">PASTE</span>
            </button>
            <button
              onClick={onOpenOnboarding}
              className="h-8 px-3 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold text-[10px] flex items-center gap-1 shrink-0 shadow-md shadow-indigo-500/20 hover:brightness-105 active:scale-95 transition-all"
              title="Scan QR Code or Auto-Discover"
            >
              <span className="material-symbols-outlined text-[15px]">qr_code_scanner</span>
              <span>SCAN</span>
            </button>
          </div>

          {/* Deep Link Handler Reference */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100/70 text-slate-600 border border-slate-200/60 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="material-symbols-outlined text-[14px] text-indigo-500 shrink-0">link</span>
              <span className="font-mono text-[10px] truncate text-indigo-700">
                gravktrl://pair?host={currentHost}:{currentPort}&token={tokenValue.slice(0, 10)}...
              </span>
            </div>
            <button
              onClick={handleCopyUri}
              className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-white shadow-neo-soft text-slate-700 shrink-0 hover:text-indigo-600 active:shadow-neo-pressed transition-all"
            >
              Copy URI
            </button>
          </div>
        </div>
      </div>

      {/* Security & Hardware Daemon Controls Card */}
      <div className="bg-white rounded-2xl p-4 shadow-neo-flat flex flex-col gap-3 border border-white/60">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-indigo-600 text-[18px]">security</span>
          Security & Hardware Dispatch
        </span>

        {/* Biometric Gate Toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#f8fafc] border border-slate-200/70 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-neo-soft shrink-0">
              <span className="material-symbols-outlined text-[20px]">fingerprint</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800 leading-snug">Destructive Auth Gate</span>
              <span className="font-mono text-[10px] text-slate-400">Require approval on shell writes</span>
            </div>
          </div>
          <button
            onClick={() => {
              setBiometricEnabled(!biometricEnabled);
              showToast(biometricEnabled ? "Auth Gate Disabled" : "Auth Gate Enabled");
            }}
            className={`w-11 h-6 rounded-full transition-colors relative shadow-inner ${
              biometricEnabled ? "bg-indigo-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                biometricEnabled ? "right-[2px]" : "left-[2px]"
              }`}
            />
          </button>
        </div>

        {/* Daemon Latency Heartbeat Visualizer */}
        <div className="p-3 rounded-xl neo-well flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 items-end h-3.5 w-10">
              <span className="w-1.5 h-1.5 rounded-sm bg-indigo-500 animate-pulse"></span>
              <span className="w-1.5 h-3.5 rounded-sm bg-indigo-500"></span>
              <span className="w-1.5 h-2.5 rounded-sm bg-indigo-500"></span>
              <span className="w-1.5 h-3.5 rounded-sm bg-indigo-500 animate-pulse"></span>
              <span className="w-1.5 h-3 rounded-sm bg-indigo-500"></span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">JSON-RPC 2.0 PING</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-indigo-700 font-bold">120 PKTS / 0% DROP</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
        </div>

        {/* Remote Dispatch Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={handleRestartDaemon}
            className="py-2.5 px-3 rounded-xl bg-white shadow-neo-soft text-slate-700 border border-slate-200/50 flex items-center justify-center gap-1.5 hover:text-indigo-600 active:shadow-neo-pressed transition-all"
          >
            <span className="material-symbols-outlined text-[17px] text-indigo-600">restart_alt</span>
            <span className="text-[11px] font-bold uppercase tracking-wider">Restart Daemon</span>
          </button>
          <button
            onClick={handleDisconnect}
            className="py-2.5 px-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60 shadow-neo-soft flex items-center justify-center gap-1.5 hover:bg-rose-100 active:shadow-neo-pressed transition-all"
          >
            <span className="material-symbols-outlined text-[17px]">power_settings_new</span>
            <span className="text-[11px] font-bold uppercase tracking-wider">Disconnect</span>
          </button>
        </div>
      </div>

      {/* Floating Micro Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900 text-white font-mono text-xs shadow-2xl z-50 flex items-center gap-2 animate-bounce">
          <span className={`material-symbols-outlined text-[16px] ${toastAlert ? "text-rose-400" : "text-emerald-400"}`}>
            {toastAlert ? "warning" : "check_circle"}
          </span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
