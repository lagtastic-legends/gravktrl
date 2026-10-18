import * as os from "node:os";
import * as http from "node:http";

export interface SystemTelemetry {
  cpuUsagePercent: number;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
  memoryUsagePercent: number;
  uptimeSeconds: number;
  uptimeFormatted: string;
  hostname: string;
  platform: string;
  arch: string;
  activeDirectory: string;
  cdpHealthy: boolean;
  cdpTargetCount: number;
  cdpDetails?: {
    browser?: string;
    protocolVersion?: string;
  };
  timestamp: string;
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

export class TelemetryCollector {
  private lastCpuSnapshot: CpuSnapshot | null = null;
  private cdpPort: number;

  constructor(cdpPort: number = 9222) {
    this.cdpPort = cdpPort;
    this.lastCpuSnapshot = this.sampleCpu();
  }

  private sampleCpu(): CpuSnapshot {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total +=
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.idle +
        cpu.times.irq;
    }

    return { idle, total };
  }

  public getCpuUsagePercent(): number {
    const current = this.sampleCpu();
    if (!this.lastCpuSnapshot) {
      this.lastCpuSnapshot = current;
      return 0;
    }

    const idleDelta = current.idle - this.lastCpuSnapshot.idle;
    const totalDelta = current.total - this.lastCpuSnapshot.total;
    this.lastCpuSnapshot = current;

    if (totalDelta <= 0) {
      return 0;
    }

    const usage = (1 - idleDelta / totalDelta) * 100;
    return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
  }

  public formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(" ");
  }

  public checkCdpHealth(): Promise<{ healthy: boolean; targetCount: number; browser?: string; protocolVersion?: string }> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.cdpPort}/json/version`,
        { timeout: 800 },
        (res) => {
          if (res.statusCode !== 200) {
            resolve({ healthy: false, targetCount: 0 });
            return;
          }

          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const versionInfo = JSON.parse(data);
              // Also query /json/list to get targets count
              http.get(
                `http://127.0.0.1:${this.cdpPort}/json`,
                { timeout: 800 },
                (listRes) => {
                  let listData = "";
                  listRes.on("data", (c) => (listData += c));
                  listRes.on("end", () => {
                    try {
                      const targets = JSON.parse(listData);
                      resolve({
                        healthy: true,
                        targetCount: Array.isArray(targets) ? targets.length : 1,
                        browser: versionInfo.Browser,
                        protocolVersion: versionInfo["Protocol-Version"],
                      });
                    } catch {
                      resolve({
                        healthy: true,
                        targetCount: 1,
                        browser: versionInfo.Browser,
                        protocolVersion: versionInfo["Protocol-Version"],
                      });
                    }
                  });
                }
              ).on("error", () => {
                resolve({
                  healthy: true,
                  targetCount: 1,
                  browser: versionInfo.Browser,
                });
              });
            } catch {
              resolve({ healthy: true, targetCount: 1 });
            }
          });
        }
      );

      req.on("error", () => {
        resolve({ healthy: false, targetCount: 0 });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ healthy: false, targetCount: 0 });
      });
    });
  }

  public async getTelemetry(activeDirectory: string): Promise<SystemTelemetry> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = Math.round((usedMem / totalMem) * 1000) / 10;
    const uptime = os.uptime();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : "Unknown";
    const cpuUsage = this.getCpuUsagePercent();
    const cdp = await this.checkCdpHealth();

    return {
      cpuUsagePercent: cpuUsage,
      cpuModel,
      cpuCores: cpus.length,
      totalMemoryBytes: totalMem,
      freeMemoryBytes: freeMem,
      usedMemoryBytes: usedMem,
      memoryUsagePercent: memUsagePercent,
      uptimeSeconds: uptime,
      uptimeFormatted: this.formatUptime(uptime),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      activeDirectory,
      cdpHealthy: cdp.healthy,
      cdpTargetCount: cdp.targetCount,
      cdpDetails: {
        browser: cdp.browser,
        protocolVersion: cdp.protocolVersion,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
