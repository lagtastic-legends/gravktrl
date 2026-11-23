import * as dgram from "node:dgram";
import * as os from "node:os";

export interface NetworkEndpointInfo {
  interfaceName: string;
  ip: string;
  type: "tailscale" | "lan" | "loopback";
}

export interface DiscoveryBeaconPayload {
  service: "gravktrl-daemon";
  name: string;
  hostname: string;
  lanIp: string;
  tailscaleIp?: string;
  port: number;
  udpPort: number;
  version: string;
  pairingPinFormatted?: string;
  timestamp: number;
}

/**
 * Discovers available IPv4 network endpoints including LAN (192.168.x.x / 10.x.x.x)
 * and Tailscale mesh (100.x.y.z).
 */
export function getNetworkEndpoints(): {
  lanIp: string;
  tailscaleIp?: string;
  endpoints: NetworkEndpointInfo[];
} {
  const ifaces = os.networkInterfaces();
  const endpoints: NetworkEndpointInfo[] = [];
  let lanIp = "127.0.0.1";
  let tailscaleIp: string | undefined = undefined;

  for (const [name, netList] of Object.entries(ifaces)) {
    if (!netList) continue;
    for (const net of netList) {
      if (net.family !== "IPv4" || net.internal) continue;

      const ip = net.address;
      // Tailscale mesh CGNAT space: 100.64.0.0/10
      if (ip.startsWith("100.")) {
        tailscaleIp = ip;
        endpoints.push({ interfaceName: name, ip, type: "tailscale" });
      } else if (
        ip.startsWith("192.168.") ||
        ip.startsWith("10.") ||
        (ip.startsWith("172.") && isPrivate172(ip))
      ) {
        if (lanIp === "127.0.0.1") {
          lanIp = ip;
        }
        endpoints.push({ interfaceName: name, ip, type: "lan" });
      } else {
        endpoints.push({ interfaceName: name, ip, type: "lan" });
      }
    }
  }

  return { lanIp, tailscaleIp, endpoints };
}

function isPrivate172(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

/**
 * Tier 1 Auto-Discovery: Broadcasts UDP discovery beacons on port 8788 every 3s.
 */
export class GravKtrlDiscoveryBroadcaster {
  private socket: dgram.Socket | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isBroadcasting = false;

  constructor(
    private readonly httpPort: number = 8787,
    private readonly udpPort: number = 8788,
    private readonly version: string = "0.1.0"
  ) {}

  public start(getPinFormatted?: () => string): void {
    if (this.isBroadcasting) return;

    try {
      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        // Suppress benign broadcast errors on locked networks
        console.warn("[GravKtrlDiscovery] UDP socket error:", err.message);
      });

      this.socket.bind(0, () => {
        try {
          this.socket?.setBroadcast(true);
        } catch {}
      });

      this.intervalTimer = setInterval(() => {
        this.broadcastBeacon(getPinFormatted?.());
      }, 3000);

      this.isBroadcasting = true;
      // Immediate first beacon
      this.broadcastBeacon(getPinFormatted?.());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[GravKtrlDiscovery] Could not initialize UDP broadcast:", msg);
    }
  }

  public getBeaconPayload(getPinFormatted?: () => string): DiscoveryBeaconPayload {
    const { lanIp, tailscaleIp } = getNetworkEndpoints();
    return {
      service: "gravktrl-daemon",
      name: os.hostname(),
      hostname: os.hostname(),
      lanIp,
      tailscaleIp,
      port: this.httpPort,
      udpPort: this.udpPort,
      version: this.version,
      pairingPinFormatted: getPinFormatted ? getPinFormatted() : undefined,
      timestamp: Date.now(),
    };
  }

  private broadcastBeacon(pinFormatted?: string): void {
    if (!this.socket) return;
    try {
      const payload = this.getBeaconPayload(() => pinFormatted || "");
      const message = Buffer.from(JSON.stringify(payload));

      this.socket.send(message, 0, message.length, this.udpPort, "255.255.255.255", (err) => {
        if (err) {
          // Non-fatal broadcast warning
        }
      });
    } catch {}
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    this.isBroadcasting = false;
  }
}
