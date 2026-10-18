"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Radar,
  KeyRound,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Wifi,
  Sparkles,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { GravKtrlLogo } from "./GravKtrlLogo";
import type { GravKtrlClient, DiscoveryBeacon, ConnectionState } from "../lib/gravktrl-client";

interface OnboardingConnectModalProps {
  isOpen?: boolean;
  onClose: () => void;
  client: GravKtrlClient;
  connectionState?: ConnectionState;
  latencyMs?: number | null;
  onConnected?: () => void;
}

type ModalTab = "start" | "pair" | "diagnostic";

export const OnboardingConnectModal: React.FC<OnboardingConnectModalProps> = ({
  isOpen = true,
  onClose,
  client,
  connectionState = "disconnected",
  latencyMs = null,
  onConnected,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>("pair");
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Tab 2 Pairing States
  const [pairMode, setPairMode] = useState<"radar" | "pin" | "qr">("pin");
  const [discoveredPcs, setDiscoveredPcs] = useState<DiscoveryBeacon[]>([]);
  const [isScanningRadar, setIsScanningRadar] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);

  // PIN Keypad state
  const [targetHost, setTargetHost] = useState("192.168.1.2");
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isExchangingPin, setIsExchangingPin] = useState(false);

  // URI paste
  const [uriInput, setUriInput] = useState("");

  // Diagnostic states
  const [isTestingCdp, setIsTestingCdp] = useState(false);
  const [cdpActive, setCdpActive] = useState<boolean | null>(null);

  const pcStartCommand = "powershell -ExecutionPolicy Bypass -File .\\scripts\\launch-windows-app.ps1";

  useEffect(() => {
    if (isOpen) {
      scanRadar();
      testCdpHealth();
    }
  }, [isOpen]);

  const copyPcCommand = () => {
    navigator.clipboard.writeText(pcStartCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  const scanRadar = async () => {
    setIsScanningRadar(true);
    setRadarError(null);
    try {
      const candidates = ["127.0.0.1", "localhost"];
      if (typeof window !== "undefined" && window.location.hostname) {
        if (!candidates.includes(window.location.hostname)) {
          candidates.unshift(window.location.hostname);
        }
      }
      const activeProf = client.getCurrentProfile();
      if (activeProf?.host && !candidates.includes(activeProf.host)) {
        candidates.unshift(activeProf.host);
      }

      const results: DiscoveryBeacon[] = [];
      await Promise.all(
        candidates.map(async (ip) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1800);
            const res = await fetch(`http://${ip}:8787/api/discover`, {
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (res.ok) {
              const data = await res.json();
              if (data?.name && !results.some((r) => r.lanIp === data.lanIp)) {
                results.push(data);
              }
            }
          } catch {}
        })
      );

      setDiscoveredPcs(results);
      if (results.length > 0) {
        setTargetHost(results[0].lanIp);
      } else if (results.length === 0) {
        setRadarError("No hosts broadcasting on port 8787. Verify GravKtrl is running on your PC.");
      }
    } catch {
      setRadarError("Auto-discovery failed. Enter IP manually below.");
    } finally {
      setIsScanningRadar(false);
    }
  };

  const testCdpHealth = async () => {
    setIsTestingCdp(true);
    try {
      const host = targetHost || "127.0.0.1";
      const res = await fetch(`http://${host}:8787/api/discover`);
      if (res.ok) {
        const data = await res.json();
        setCdpActive(!!data.cdpActive);
      } else {
        setCdpActive(false);
      }
    } catch {
      setCdpActive(false);
    } finally {
      setIsTestingCdp(false);
    }
  };

  const handlePinDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean && val !== "") return;

    const lastChar = clean.slice(-1);
    const updated = [...pinDigits];
    updated[index] = lastChar;
    setPinDigits(updated);
    setPinError(null);

    // Auto-focus next input
    if (lastChar && index < 5) {
      const nextInput = document.getElementById(`pin-input-${index + 1}`);
      nextInput?.focus();
    }

    // If 6 digits filled, trigger exchange
    if (lastChar && index === 5 && updated.every((d) => d !== "")) {
      executePinExchange(updated.join(""));
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      const prevInput = document.getElementById(`pin-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const executePinExchange = async (pinCode: string) => {
    setIsExchangingPin(true);
    setPinError(null);

    try {
      const host = targetHost.trim() || "127.0.0.1";
      const port = 8787;
      const res = await client.pairWithPin(host, port, pinCode);

      if (res?.profile) {
        if (onConnected) onConnected();
        else onClose();
      }
    } catch (err: any) {
      setPinError(err.message || "Invalid PIN. Check PC terminal.");
    } finally {
      setIsExchangingPin(false);
    }
  };

  const handleConnectDiscoveredPc = async (beacon: DiscoveryBeacon) => {
    setTargetHost(beacon.lanIp);
    setPairMode("pin");
    const firstInput = document.getElementById("pin-input-0");
    firstInput?.focus();
  };

  const handleConnectWithUri = () => {
    if (!uriInput.trim()) return;
    try {
      const url = new URL(uriInput.trim().replace("gravktrl://", "http://"));
      const host = url.searchParams.get("host") || url.hostname;
      const port = parseInt(url.searchParams.get("port") || "8787", 10);
      const token = url.searchParams.get("token") || "";
      const pin = url.searchParams.get("pin") || undefined;
      const isTailscale = host.startsWith("100.");

      if (!token) throw new Error("Missing token parameter in pairing URI");

      const profile = {
        id: "profile-" + Date.now(),
        name: isTailscale ? "PC Host (Tailscale)" : "PC Host (Wi-Fi)",
        host,
        port,
        token,
        pin,
        isTailscale,
        lastConnected: new Date().toISOString(),
      };

      client.saveProfile(profile);
      client.connect(profile);

      if (onConnected) onConnected();
      else onClose();
    } catch (e: any) {
      alert("Invalid URI: " + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in select-text">
      <div className="relative w-full max-w-lg bg-[#f6f8fb] rounded-3xl p-5 shadow-neo-flat border border-white/80 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Strip */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white shadow-neo-soft flex items-center justify-center p-1.5 border border-white/80">
              <GravKtrlLogo size="sm" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">GRAVKTRL CONNECT</h2>
              <span className="text-[10px] text-slate-400 font-mono">Zero-Typing Radar Pairing</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white shadow-neo-soft flex items-center justify-center text-slate-500 hover:text-slate-800 active:shadow-neo-pressed border border-white/80 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher Pills */}
        <div className="grid grid-cols-3 gap-2 py-3 shrink-0">
          {[
            { id: "pair", label: "Instant PIN" },
            { id: "start", label: "PC Daemon" },
            { id: "diagnostic", label: "Diagnostic" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ModalTab)}
              className={`py-2 px-2 rounded-xl text-center text-xs font-bold transition-all border ${
                activeTab === tab.id
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-neo-pressed"
                  : "bg-white shadow-neo-soft border-white/80 text-slate-600 hover:text-indigo-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1">
          {/* TAB 1: PIN PAIRING (Instant 6-Digit) */}
          {activeTab === "pair" && (
            <div className="space-y-4">
              {/* Host IP Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Host PC IP Address
                  </label>
                  <button
                    onClick={scanRadar}
                    disabled={isScanningRadar}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningRadar ? "animate-spin" : ""}`} />
                    <span>Scan Wi-Fi Radar</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  placeholder="192.168.1.2 or hostname"
                  className="w-full neo-well rounded-2xl px-3.5 py-2 text-xs text-slate-800 font-mono focus:outline-none"
                />
              </div>

              {/* Wi-Fi Discovered PCs Card */}
              {discoveredPcs.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Discovered on Local Wi-Fi:
                  </span>
                  <div className="space-y-1.5">
                    {discoveredPcs.map((pc, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleConnectDiscoveredPc(pc)}
                        className="w-full p-3 rounded-2xl bg-white shadow-neo-soft border border-white/80 flex items-center justify-between hover:border-indigo-200 transition-all text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-indigo-600 text-[20px]">
                            desktop_windows
                          </span>
                          <div>
                            <div className="font-bold text-xs text-slate-800">{pc.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {pc.lanIp}:8787 • {pc.cdpActive ? "CDP:9222 OK" : "WIN32"}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                          Select <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 6-Digit PIN Keypad Entry */}
              <div className="bg-white rounded-2xl p-4 shadow-neo-flat border border-white/60 text-center space-y-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Enter 6-Digit PIN</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Check the PC terminal window or GravKtrl Desktop app.
                  </p>
                </div>

                {/* 6 Digit Inputs */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  {pinDigits.map((digit, idx) => (
                    <React.Fragment key={idx}>
                      {idx === 3 && <span className="text-slate-300 font-bold text-lg">-</span>}
                      <input
                        id={`pin-input-${idx}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown(idx, e)}
                        className="w-11 h-12 neo-well rounded-2xl text-center text-xl font-extrabold font-mono text-indigo-600 focus:outline-none transition-all"
                      />
                    </React.Fragment>
                  ))}
                </div>

                {pinError && <div className="text-xs font-semibold text-rose-600">{pinError}</div>}

                <button
                  onClick={() => executePinExchange(pinDigits.join(""))}
                  disabled={pinDigits.some((d) => d === "") || isExchangingPin}
                  className="w-full py-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-neo-soft font-bold text-xs uppercase tracking-wider disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all"
                >
                  {isExchangingPin ? "Exchanging Credentials..." : "Connect to PC"}
                </button>
              </div>

              {/* Alternative: Paste URI */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Or Paste Pairing URI / Deep Link:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={uriInput}
                    onChange={(e) => setUriInput(e.target.value)}
                    placeholder="gravktrl://pair?host=...&token=..."
                    className="flex-1 neo-well rounded-2xl px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none"
                  />
                  <button
                    onClick={handleConnectWithUri}
                    className="px-3.5 py-2 rounded-2xl bg-white shadow-neo-soft border border-white/80 text-indigo-600 font-bold text-xs active:shadow-neo-pressed"
                  >
                    Pair
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PC DAEMON SETUP COMMANDS */}
          {activeTab === "start" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-neo-flat border border-white/60 space-y-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-600 shrink-0" />
                  <h3 className="font-bold text-sm text-slate-800">1-Click Windows Launch</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  To control Google Antigravity and your native terminal, run the desktop launcher on your PC:
                </p>

                <div className="relative neo-well rounded-2xl p-3 font-mono text-xs text-slate-800 flex items-center justify-between">
                  <span className="truncate pr-2">{pcStartCommand}</span>
                  <button
                    onClick={copyPcCommand}
                    className="p-1.5 rounded-xl bg-white shadow-neo-soft text-slate-700 hover:text-indigo-600 active:shadow-neo-pressed shrink-0"
                    title="Copy command"
                  >
                    {copiedCmd ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <div>• Or double-click <strong className="text-indigo-600 font-mono">GravKtrl-Windows.bat</strong></div>
                  <div>• Double-click desktop shortcut <strong className="text-slate-800">GravKtrl Windows Control</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTIC */}
          {activeTab === "diagnostic" && (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl p-4 shadow-neo-flat border border-white/60 space-y-3">
                <h3 className="font-bold text-sm text-slate-800">Connection Diagnostics</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-xl neo-well text-xs">
                    <span>Host Daemon Connection:</span>
                    <span className="font-bold font-mono text-emerald-600">
                      {connectionState === "authenticated" ? "OK (200)" : "OFFLINE"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl neo-well text-xs">
                    <span>Antigravity CDP Session:</span>
                    <span className="font-bold font-mono text-indigo-600">
                      {cdpActive ? "PORT 9222 ACTIVE" : "WIN32 NATIVE PROCESS"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl neo-well text-xs">
                    <span>Round-Trip Latency:</span>
                    <span className="font-bold font-mono text-slate-700">
                      {latencyMs ? `${latencyMs}ms` : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
