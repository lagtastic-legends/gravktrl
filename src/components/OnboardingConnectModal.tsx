"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Copy,
  Check,
  Radar,
  KeyRound,
  QrCode,
  ShieldCheck,
  Terminal,
  Cpu,
  ArrowRight,
  Wifi,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { GravKtrlLogo } from "./GravKtrlLogo";
import type { GravKtrlClient, DiscoveryBeacon, ConnectionState } from "../lib/gravktrl-client";

interface OnboardingConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: GravKtrlClient;
  connectionState: ConnectionState;
  latencyMs: number | null;
  onConnected?: () => void;
}

type ModalTab = "start" | "pair" | "diagnostic";

export const OnboardingConnectModal: React.FC<OnboardingConnectModalProps> = ({
  isOpen,
  onClose,
  client,
  connectionState,
  latencyMs,
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
  const [targetHost, setTargetHost] = useState("192.168.1.3");
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isExchangingPin, setIsExchangingPin] = useState(false);

  // URI paste
  const [uriInput, setUriInput] = useState("");

  // Diagnostic states
  const [isTestingCdp, setIsTestingCdp] = useState(false);
  const [cdpActive, setCdpActive] = useState<boolean | null>(null);

  const pcStartCommand = "powershell -ExecutionPolicy Bypass -File .\\scripts\\start-gravktrl-pc.ps1";

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

  const testCdpHealth = async () => {
    setIsTestingCdp(true);
    try {
      const telem = await client.getTelemetry();
      setCdpActive(telem.cdpHealthy);
    } catch {
      setCdpActive(false);
    } finally {
      setIsTestingCdp(false);
    }
  };

  const scanRadar = async () => {
    setIsScanningRadar(true);
    setRadarError(null);
    try {
      const results = await client.scanSubnet([targetHost]);
      setDiscoveredPcs(results);
      if (results.length > 0 && results[0]) {
        setTargetHost(results[0].lanIp);
      } else if (results.length === 0) {
        setRadarError("No PC daemon detected yet. Ensure start-gravktrl-pc.ps1 is running on PC.");
      }
    } catch {
      setRadarError("Subnet scan timed out. Enter IP manually or check Wi-Fi.");
    } finally {
      setIsScanningRadar(false);
    }
  };

  const handlePinChange = (index: number, val: string) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...pinDigits];
    next[index] = val;
    setPinDigits(next);
    setPinError(null);

    // Auto-advance
    if (val && index < 5) {
      const el = document.getElementById(`pin-input-${index + 1}`);
      el?.focus();
    }

    // When 6 digits filled, trigger exchange
    const combined = next.join("");
    if (combined.length === 6) {
      submitPinExchange(combined);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      const el = document.getElementById(`pin-input-${index - 1}`);
      el?.focus();
    }
  };

  const submitPinExchange = async (fullPin?: string) => {
    const pin = fullPin || pinDigits.join("");
    if (pin.length !== 6) {
      setPinError("Please enter all 6 digits.");
      return;
    }

    if (!targetHost.trim()) {
      setPinError("Please enter your PC's IP address.");
      return;
    }

    setIsExchangingPin(true);
    setPinError(null);

    try {
      await client.pairWithPin(targetHost.trim(), 8787, pin);
      setActiveTab("diagnostic");
      onConnected?.();
    } catch (err: any) {
      setPinError(err.message || "Invalid PIN or connection refused.");
    } finally {
      setIsExchangingPin(false);
    }
  };

  const handlePasteUri = () => {
    if (!uriInput.trim()) return;
    try {
      const cleanUri = uriInput.trim();
      const urlObj = new URL(cleanUri.replace("gravktrl://", "http://"));
      const h = urlObj.searchParams.get("host") || urlObj.hostname;
      const p = parseInt(urlObj.searchParams.get("port") || "8787", 10);
      const t = urlObj.searchParams.get("token") || "";

      if (h && t) {
        const isTailscale = h.startsWith("100.");
        const profile = {
          id: "profile-" + Date.now(),
          name: `${h} (${isTailscale ? "Tailscale" : "Wi-Fi"})`,
          host: h,
          port: p,
          token: t,
          isTailscale,
          lastConnected: new Date().toISOString(),
        };
        client.saveProfile(profile);
        client.connect(profile);
        setActiveTab("diagnostic");
        onConnected?.();
      }
    } catch {
      alert("Invalid pairing URI format.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0d1117] border border-[#21262d] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] text-slate-100">
        {/* Modal Header */}
        <div className="px-4 py-3.5 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <GravKtrlLogo size="sm" withGlow={false} />
            <div>
              <div className="font-extrabold text-xs tracking-wider text-white flex items-center gap-1.5">
                <span>GRAVKTRL ONBOARDING</span>
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-[9px] text-cyan-300 font-mono">
                  v1.0
                </span>
              </div>
              <div className="text-[10px] text-slate-400">Mobile-to-PC Agent Commander</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Step Tabs Navigation */}
        <div className="grid grid-cols-3 bg-[#090a0f] border-b border-[#21262d] text-xs font-semibold text-center shrink-0">
          <button
            onClick={() => setActiveTab("start")}
            className={`py-2.5 px-1 border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "start"
                ? "border-cyan-500 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="truncate">1. PC Start</span>
          </button>

          <button
            onClick={() => setActiveTab("pair")}
            className={`py-2.5 px-1 border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "pair"
                ? "border-cyan-500 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="truncate">2. Quick Pair</span>
          </button>

          <button
            onClick={() => setActiveTab("diagnostic")}
            className={`py-2.5 px-1 border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "diagnostic"
                ? "border-emerald-500 text-emerald-400 bg-emerald-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="truncate">3. Diagnostic</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: 1-COMMAND PC START */}
          {activeTab === "start" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-3.5 bg-gradient-to-br from-cyan-950/40 to-purple-950/40 border border-cyan-800/50 rounded-2xl">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  How GravKtrl Works
                </h3>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Your phone securely commands Google Antigravity on your PC. It connects over
                  <b> local Wi-Fi</b> or <b>Tailscale VPN</b> with zero-trust token authentication,
                  injects agent prompts, streams thoughts, and executes native terminal commands.
                </p>
              </div>

              {/* Start Command Card */}
              <div className="p-3 bg-[#161b22] border border-[#21262d] rounded-2xl space-y-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider block">
                  Run on your PC terminal (PowerShell):
                </span>
                <div className="p-2.5 bg-black/60 border border-[#30363d] rounded-xl font-mono text-xs text-cyan-300 break-all select-all flex items-center justify-between gap-2">
                  <span>{pcStartCommand}</span>
                  <button
                    onClick={copyPcCommand}
                    className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-white shrink-0 transition-colors"
                    title="Copy command"
                  >
                    {copiedCmd ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  This boots the daemon on port <b>8787</b>, checks Antigravity CDP port <b>9222</b>,
                  and displays your <b>6-digit Quick PIN</b>.
                </p>
              </div>

              {/* Next Step Button */}
              <button
                onClick={() => setActiveTab("pair")}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow active:scale-95 transition-all"
              >
                <span>Continue to Step 2: Quick Pair</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 2: ZERO-TYPING PAIRING MODES */}
          {activeTab === "pair" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Pairing Sub-Tabs */}
              <div className="flex rounded-xl bg-[#161b22] p-1 border border-[#21262d]">
                <button
                  onClick={() => setPairMode("pin")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    pairMode === "pin"
                      ? "bg-cyan-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  6-Digit PIN
                </button>
                <button
                  onClick={() => setPairMode("radar")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    pairMode === "radar"
                      ? "bg-cyan-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Wi-Fi Radar
                </button>
                <button
                  onClick={() => setPairMode("qr")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    pairMode === "qr"
                      ? "bg-cyan-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  QR / URI
                </button>
              </div>

              {/* MODE 1: 6-DIGIT QUICK PIN */}
              {pairMode === "pin" && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      PC Host IPv4 (from PC terminal)
                    </label>
                    <input
                      type="text"
                      value={targetHost}
                      onChange={(e) => setTargetHost(e.target.value)}
                      placeholder="192.168.1.3 or 100.x.x.x"
                      className="w-full bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Enter 6-Digit PIN from PC terminal:
                      </label>
                      <span className="text-[10px] text-cyan-400 font-mono">e.g. 482 - 910</span>
                    </div>

                    {/* Giant 6-Box PIN Input */}
                    <div className="flex items-center justify-center gap-2">
                      {pinDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`pin-input-${idx}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handlePinChange(idx, e.target.value)}
                          onKeyDown={(e) => handlePinKeyDown(idx, e)}
                          className="w-11 h-13 text-center bg-[#161b22] border-2 border-[#30363d] focus:border-cyan-400 rounded-xl font-mono text-lg font-bold text-white focus:outline-none shadow-sm transition-all"
                        />
                      ))}
                    </div>
                  </div>

                  {pinError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px] text-center">
                      {pinError}
                    </div>
                  )}

                  <button
                    onClick={() => submitPinExchange()}
                    disabled={isExchangingPin || pinDigits.join("").length !== 6}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow active:scale-95 transition-all"
                  >
                    {isExchangingPin ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    <span>Exchange PIN & Connect</span>
                  </button>
                </div>
              )}

              {/* MODE 2: WI-FI AUTO-RADAR */}
              {pairMode === "radar" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Radar className="w-4 h-4 text-cyan-400" />
                      Discovered PCs on Subnet
                    </span>
                    <button
                      onClick={scanRadar}
                      disabled={isScanningRadar}
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isScanningRadar ? "animate-spin" : ""}`} />
                      <span>{isScanningRadar ? "Scanning..." : "Rescan"}</span>
                    </button>
                  </div>

                  {discoveredPcs.length > 0 ? (
                    <div className="space-y-2">
                      {discoveredPcs.map((pc, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setTargetHost(pc.lanIp);
                            setPairMode("pin");
                          }}
                          className="p-3 bg-[#161b22] hover:bg-[#21262d] border border-cyan-800/60 rounded-xl cursor-pointer flex items-center justify-between transition-colors glow-cyan"
                        >
                          <div className="flex items-center gap-2.5">
                            <Server className="w-4 h-4 text-cyan-400" />
                            <div>
                              <div className="text-xs font-bold text-white">{pc.name}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {pc.lanIp}:{pc.port}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded-lg bg-cyan-600 text-white text-[10px] font-semibold">
                            Select PC
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-black/40 border border-[#21262d] text-center text-xs text-slate-400 space-y-1">
                      <div>No PC beacons detected on current subnet.</div>
                      <div className="text-[10px] text-slate-500">
                        Make sure your phone is on the same Wi-Fi as your PC.
                      </div>
                    </div>
                  )}

                  {radarError && (
                    <div className="text-[11px] text-amber-400 text-center">{radarError}</div>
                  )}
                </div>
              )}

              {/* MODE 3: QR CODE & DEEP-LINK */}
              {pairMode === "qr" && (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-300">
                    Paste the <b>gravktrl://pair?...</b> URI printed in your PC terminal:
                  </div>

                  <input
                    type="text"
                    value={uriInput}
                    onChange={(e) => setUriInput(e.target.value)}
                    placeholder="gravktrl://pair?host=192.168.1.3&token=..."
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  />

                  <button
                    onClick={handlePasteUri}
                    disabled={!uriInput.trim()}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <span>Import & Connect</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE 4-STAGE CONNECTION DIAGNOSTIC */}
          {activeTab === "diagnostic" && (
            <div className="space-y-4 animate-in fade-in">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                Live Connection Diagnostic Sequence:
              </span>

              <div className="space-y-2">
                {/* Stage 1: Network Socket */}
                <div className="p-2.5 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-cyan-400" />
                    <span>[1] Network WebSocket Socket</span>
                  </div>
                  {connectionState === "authenticated" || connectionState === "connected" ? (
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {latencyMs ? `${latencyMs}ms` : "CONNECTED"}
                    </span>
                  ) : (
                    <span className="text-amber-400 text-[11px]">{connectionState.toUpperCase()}</span>
                  )}
                </div>

                {/* Stage 2: Zero-Trust Auth */}
                <div className="p-2.5 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>[2] Zero-Trust 256-Bit Token Handshake</span>
                  </div>
                  {connectionState === "authenticated" ? (
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      AUTHENTICATED
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">PENDING</span>
                  )}
                </div>

                {/* Stage 3: CDP Port 9222 */}
                <div className="p-2.5 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>[3] Antigravity CDP Port 9222 Bridge</span>
                  </div>
                  {cdpActive === true ? (
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      ONLINE (:9222)
                    </span>
                  ) : cdpActive === false ? (
                    <span className="text-amber-400 text-[11px]">FALLBACK (Clipboard & Inbox)</span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">CHECKING...</span>
                  )}
                </div>

                {/* Stage 4: PowerShell Shell Readiness */}
                <div className="p-2.5 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>[4] PowerShell PTY Shell Engine</span>
                  </div>
                  {connectionState === "authenticated" ? (
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      READY
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[11px]">AWAITING SOCKET</span>
                  )}
                </div>
              </div>

              {/* Launch Workspace Button */}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <span>🚀 Launch Workspace HUD</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
