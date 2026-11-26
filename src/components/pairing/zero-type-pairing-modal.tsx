"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useGravStore, type DiscoveredPcDaemon } from "@/store/use-grav-store";
import { GravKtrlLogo } from "@/components/ui/gravktrl-logo";
import {
  X,
  Wifi,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Laptop,
  ArrowRight,
  Globe,
} from "lucide-react";

export function ZeroTypePairingModal() {
  const {
    isPairingModalOpen,
    setPairingModalOpen,
    host,
    lanIp,
    tailscaleIp,
    connectionMode,
    port,
    setConnectionConfig,
    setConnected,
    discoveredDaemons,
    setDiscoveredDaemons,
    isScanning,
    setScanning,
  } = useGravStore();

  const [pin, setPin] = useState("");
  const [targetHost, setTargetHost] = useState(host || "127.0.0.1");
  const [targetPort, setTargetPort] = useState(port ? port.toString() : "8787");
  const [isPairing, setIsPairing] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"auto" | "pin" | "manual">("auto");
  const [selectedEndpointType, setSelectedEndpointType] = useState<"lan" | "tailscale">(
    connectionMode === "tailscale" ? "tailscale" : "lan"
  );

  // Auto-scan local + saved endpoints
  const scanLocalDaemon = useCallback(async () => {
    setScanning(true);
    setPairingError(null);

    const parsedPort = parseInt(targetPort, 10) || 8787;
    const candidateIps = Array.from(
      new Set(
        [
          "127.0.0.1",
          targetHost,
          lanIp,
          tailscaleIp,
          "192.168.1.3",
          "192.168.1.5",
          "10.0.0.2",
        ].filter(Boolean)
      )
    );

    const found: DiscoveredPcDaemon[] = [];

    await Promise.allSettled(
      candidateIps.map(async (ip) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1600);
          const res = await fetch(`http://${ip}:${parsedPort}/api/discover`, {
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (res.ok) {
            const data = await res.json();
            if (data.service === "gravktrl-daemon" || data.hostname) {
              found.push({
                name: data.name || data.hostname || "PC Host",
                hostname: data.hostname || ip,
                lanIp: data.lanIp || ip,
                tailscaleIp: data.tailscaleIp,
                port: parsedPort,
                version: data.version || "0.1.0",
                pairingPinFormatted: data.pairingPinFormatted,
                pin: data.pin,
              });
            }
          }
        } catch {}
      })
    );

    const unique = found.filter(
      (v, i, a) => a.findIndex((t) => t.hostname === v.hostname && t.port === v.port) === i
    );

    setDiscoveredDaemons(unique);
    setScanning(false);
  }, [targetHost, targetPort, lanIp, tailscaleIp, setDiscoveredDaemons, setScanning]);

  useEffect(() => {
    if (isPairingModalOpen) {
      scanLocalDaemon();
    }
  }, [isPairingModalOpen, scanLocalDaemon]);

  const handlePairSubmit = async (
    customPin?: string,
    customHost?: string,
    customPort?: number,
    daemonInfo?: DiscoveredPcDaemon
  ) => {
    const pinToUse = customPin || pin;
    const hostToUse = customHost || targetHost;
    const portToUse = customPort || parseInt(targetPort, 10) || 8787;

    if (!pinToUse || pinToUse.replace(/\D/g, "").length < 6) {
      setPairingError("Please enter the 6-digit PIN displayed on your PC daemon.");
      return;
    }

    setIsPairing(true);
    setPairingError(null);

    try {
      const res = await fetch(`http://${hostToUse}:${portToUse}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pinToUse,
          deviceName: "GravKtrl Foldable Companion",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Pairing failed. Verify your PIN.");
      }

      const receivedToken = data.token || data.masterToken;
      setConnectionConfig({
        host: hostToUse,
        lanIp: daemonInfo?.lanIp || data.lanIp || hostToUse,
        tailscaleIp: daemonInfo?.tailscaleIp || data.tailscaleIp || "",
        connectionMode: selectedEndpointType,
        port: portToUse,
        token: receivedToken,
      });

      setPairingSuccess(true);
      setConnected(true);

      setTimeout(() => {
        setIsPairing(false);
        setPairingSuccess(false);
        setPairingModalOpen(false);
      }, 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPairingError(msg);
      setIsPairing(false);
    }
  };

  if (!isPairingModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090D0C]/95 p-4 transition-opacity duration-150">
      <div className="relative w-full max-w-md rounded-2xl border border-[#A79277]/35 bg-[#102C26] p-6 shadow-2xl text-[#F7E7CE] flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#A79277]/20 pb-4">
          <div className="flex items-center gap-3">
            <GravKtrlLogo size="sm" />
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#F7E7CE]">
                Zero-Typing PC Pairing
              </h2>
              <p className="text-xs text-[#A79277]">
                Tier 1–4 LAN &amp; Tailscale Mutual Auth
              </p>
            </div>
          </div>
          <button
            onClick={() => setPairingModalOpen(false)}
            className="rounded-lg p-1.5 text-[#A79277] hover:bg-[#090D0C]/50 hover:text-[#F7E7CE] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Preference Toggle: LAN vs Tailscale */}
        <div className="flex items-center justify-between rounded-xl border border-[#A79277]/25 bg-[#090D0C]/80 px-3 py-2">
          <span className="text-[11px] font-semibold text-[#A79277] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#F7E7CE]" /> Transport Route
          </span>
          <div className="flex gap-1">
            {(["lan", "tailscale"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setSelectedEndpointType(mode);
                  if (mode === "tailscale" && tailscaleIp) {
                    setTargetHost(tailscaleIp);
                  } else if (mode === "lan" && lanIp) {
                    setTargetHost(lanIp);
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-colors ${
                  selectedEndpointType === mode
                    ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/45"
                    : "text-[#A79277] hover:text-[#F7E7CE]"
                }`}
              >
                {mode === "lan" ? "LAN Wi-Fi" : "Tailscale"}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#090D0C]/70 p-1 border border-[#A79277]/20 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("auto")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${
              activeTab === "auto"
                ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/40"
                : "text-[#A79277] hover:text-[#F7E7CE]"
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            Radar
          </button>
          <button
            onClick={() => setActiveTab("pin")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${
              activeTab === "pin"
                ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/40"
                : "text-[#A79277] hover:text-[#F7E7CE]"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            6-Digit PIN
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${
              activeTab === "manual"
                ? "bg-[#102C26] text-[#F7E7CE] border border-[#A79277]/40"
                : "text-[#A79277] hover:text-[#F7E7CE]"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            Direct IP
          </button>
        </div>

        {/* Body based on Tab */}
        {activeTab === "auto" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#A79277] uppercase tracking-wider font-semibold">
                Detected PC Daemons
              </span>
              <button
                onClick={scanLocalDaemon}
                disabled={isScanning}
                className="flex items-center gap-1 text-xs text-[#F7E7CE] hover:text-white transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-[#F7E7CE]" : ""}`}
                />
                {isScanning ? "Scanning..." : "Rescan"}
              </button>
            </div>

            {discoveredDaemons.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#A79277]/30 bg-[#090D0C]/60 p-6 text-center">
                <Laptop className="w-8 h-8 text-[#A79277]/60 mb-2" />
                <p className="text-sm font-medium text-[#F7E7CE]">No Daemons Broadcasting</p>
                <p className="text-xs text-[#A79277] mt-1">
                  Run <code className="text-[#F7E7CE]">npm run daemon</code> on your PC (port 8787).
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                {discoveredDaemons.map((daemon) => {
                  const chosenIp =
                    selectedEndpointType === "tailscale" && daemon.tailscaleIp
                      ? daemon.tailscaleIp
                      : daemon.lanIp;
                  return (
                    <div
                      key={`${daemon.hostname}:${daemon.port}`}
                      className="flex items-center justify-between rounded-xl border border-[#A79277]/30 bg-[#090D0C]/80 p-3 hover:border-[#F7E7CE]/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#102C26] p-2 text-[#F7E7CE] border border-[#A79277]/30">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#F7E7CE]">{daemon.name}</p>
                          <p className="text-xs text-[#A79277]">
                            {chosenIp}:{daemon.port}
                            {daemon.tailscaleIp ? " • Tailscale Ready" : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setTargetHost(chosenIp);
                          setTargetPort(daemon.port.toString());
                          if (daemon.pin) {
                            handlePairSubmit(daemon.pin, chosenIp, daemon.port, daemon);
                          } else {
                            setActiveTab("pin");
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-[#F7E7CE] px-3 py-1.5 text-xs font-bold text-[#090D0C] hover:opacity-90 active:scale-95 transition-transform shadow-md"
                      >
                        Pair
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "pin" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#A79277]">
              Enter the 6-digit PIN displayed on your PC terminal or at{" "}
              <code className="text-[#F7E7CE]">http://localhost:8787</code>:
            </p>
            <div className="flex items-center justify-center py-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-48 text-center text-3xl font-mono tracking-widest rounded-xl border border-[#A79277]/40 !bg-[#090D0C] px-4 py-3 !text-[#F7E7CE] focus:border-[#F7E7CE] focus:outline-none"
              />
            </div>
            <button
              onClick={() => handlePairSubmit()}
              disabled={isPairing || pin.length < 6}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#F7E7CE] py-3 text-sm font-bold text-[#090D0C] hover:opacity-90 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {isPairing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Authenticating Token...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Exchange for 256-Bit Session Token
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === "manual" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-[#A79277] mb-1 block">PC IP Address (LAN or Tailscale 100.x)</label>
              <input
                type="text"
                value={targetHost}
                onChange={(e) => setTargetHost(e.target.value)}
                placeholder="192.168.1.x or 100.x.y.z"
                className="w-full rounded-xl border border-[#A79277]/40 !bg-[#090D0C] px-3 py-2 text-sm !text-[#F7E7CE] focus:border-[#F7E7CE] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#A79277] mb-1 block">Daemon Port</label>
              <input
                type="text"
                value={targetPort}
                onChange={(e) => setTargetPort(e.target.value)}
                placeholder="8787"
                className="w-full rounded-xl border border-[#A79277]/40 !bg-[#090D0C] px-3 py-2 text-sm !text-[#F7E7CE] focus:border-[#F7E7CE] focus:outline-none"
              />
            </div>
            <button
              onClick={() => {
                setConnectionConfig({
                  host: targetHost,
                  connectionMode: targetHost.startsWith("100.") ? "tailscale" : "lan",
                  port: parseInt(targetPort, 10) || 8787,
                });
                setActiveTab("pin");
              }}
              className="mt-2 w-full rounded-xl bg-[#F7E7CE] py-2.5 text-xs font-bold text-[#090D0C] hover:opacity-90 active:scale-[0.98] transition-transform"
            >
              Set Endpoint &amp; Enter PIN
            </button>
          </div>
        )}

        {/* Status Alerts */}
        {pairingError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{pairingError}</span>
          </div>
        )}

        {pairingSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Authenticated! 256-bit session token persisted.</span>
          </div>
        )}

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-[#A79277]/20 pt-3 text-[11px] text-[#A79277]">
          <span>Target: {targetHost}:{targetPort}</span>
          <span className="flex items-center gap-1 text-[#F7E7CE]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            256-Bit Mutual Auth
          </span>
        </div>
      </div>
    </div>
  );
}