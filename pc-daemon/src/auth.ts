import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import qrcode from "qrcode-terminal";

export interface GravKtrlAuthData {
  token: string;
  pin?: string;
  createdAt: string;
  daemonVersion: string;
}

export interface NetworkEndpoint {
  interfaceName: string;
  ip: string;
  type: "tailscale" | "lan" | "loopback";
}

export interface DiscoveryBeacon {
  name: string;
  lanIp: string;
  tailscaleIp?: string;
  port: number;
  cdpActive: boolean;
  version: string;
  pairingPinFormatted?: string;
}

const AUTH_FILE_NAME = ".gravktrl-auth.json";

export class GravKtrlAuth {
  private authFilePath: string;
  private token: string;
  private pairingPin: string;
  private pinAttempts: number[] = []; // Timestamp array for rate limiting (max 5/min)

  constructor(baseDir: string = process.cwd()) {
    this.authFilePath = path.join(baseDir, AUTH_FILE_NAME);
    this.token = this.loadOrGenerateToken();
    this.pairingPin = this.generate6DigitPin();
  }

  public getToken(): string {
    return this.token;
  }

  public getMasterToken(): string {
    return this.token;
  }

  public getPin(): string {
    return this.pairingPin;
  }

  public getFormattedPin(): string {
    return `${this.pairingPin.slice(0, 3)} - ${this.pairingPin.slice(3, 6)}`;
  }

  private generate6DigitPin(): string {
    // Generate secure 6-digit numeric PIN: 100000 to 999999
    const val = crypto.randomInt(100000, 1000000);
    return val.toString();
  }

  private loadOrGenerateToken(): string {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const raw = fs.readFileSync(this.authFilePath, "utf-8");
        const parsed = JSON.parse(raw) as GravKtrlAuthData;
        if (parsed.token && typeof parsed.token === "string" && parsed.token.length >= 32) {
          return parsed.token;
        }
      }
    } catch (err) {
      console.warn("[Auth] Failed to read existing auth file, generating new token:", err);
    }

    // Generate 256-bit cryptographically secure random token (64 hex characters)
    const newToken = crypto.randomBytes(32).toString("hex");
    const authData: GravKtrlAuthData = {
      token: newToken,
      createdAt: new Date().toISOString(),
      daemonVersion: "1.0.0",
    };

    try {
      fs.writeFileSync(this.authFilePath, JSON.stringify(authData, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      console.log(`[Auth] New 256-bit pairing token saved to ${this.authFilePath}`);
    } catch (err) {
      console.error(`[Auth] Failed to write token file ${this.authFilePath}:`, err);
    }

    return newToken;
  }

  public verifyToken(providedToken: string | undefined | null): boolean {
    if (!providedToken || typeof providedToken !== "string") {
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(this.token, "utf-8");
    const providedBuf = Buffer.from(providedToken, "utf-8");

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  public exchangePin(providedPin: string): { success: boolean; masterToken: string } {
    const now = Date.now();
    // Clean attempts older than 60 seconds
    this.pinAttempts = this.pinAttempts.filter((t) => now - t < 60000);

    if (this.pinAttempts.length >= 5) {
      throw new Error("Rate limit exceeded: Too many PIN attempts. Please wait 1 minute before trying again.");
    }

    const cleanInput = providedPin.replace(/\s|-/g, "").trim();
    const expectedBuf = Buffer.from(this.pairingPin, "utf-8");
    const providedBuf = Buffer.from(cleanInput, "utf-8");

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      this.pinAttempts.push(now);
      throw new Error(`Invalid pairing PIN. (${5 - this.pinAttempts.length} attempts remaining)`);
    }

    // Success - reset attempts
    this.pinAttempts = [];
    return {
      success: true,
      masterToken: this.token,
    };
  }

  public discoverNetworkEndpoints(): NetworkEndpoint[] {
    const interfaces = os.networkInterfaces();
    const endpoints: NetworkEndpoint[] = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        // Enforce IPv4 only
        const fam = addr.family as unknown;
        if (fam !== "IPv4" && fam !== 4) {
          continue;
        }

        const ip = addr.address;
        const lowerName = name.toLowerCase();

        if (addr.internal || ip === "127.0.0.1") {
          endpoints.push({ interfaceName: name, ip, type: "loopback" });
        } else if (
          ip.startsWith("100.") ||
          lowerName.includes("tailscale") ||
          lowerName.includes("utun")
        ) {
          endpoints.push({ interfaceName: name, ip, type: "tailscale" });
        } else if (
          ip.startsWith("192.168.") ||
          ip.startsWith("10.") ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
        ) {
          endpoints.push({ interfaceName: name, ip, type: "lan" });
        }
      }
    }

    return endpoints;
  }

  public getDiscoveryBeacon(port: number = 8787, cdpActive: boolean = false): DiscoveryBeacon {
    const endpoints = this.discoverNetworkEndpoints();
    const primaryLan = endpoints.find((e) => e.type === "lan");
    const primaryTailscale = endpoints.find((e) => e.type === "tailscale");

    return {
      name: os.hostname(),
      lanIp: primaryLan?.ip || "127.0.0.1",
      tailscaleIp: primaryTailscale?.ip,
      port,
      cdpActive,
      version: "1.0.0",
    };
  }

  public printStartupBanner(port: number = 8787): void {
    const endpoints = this.discoverNetworkEndpoints();
    const primaryLan = endpoints.find((e) => e.type === "lan");
    const primaryTailscale = endpoints.find((e) => e.type === "tailscale");

    const preferredIp = primaryTailscale?.ip || primaryLan?.ip || "127.0.0.1";
    const webPairUrl = `http://${preferredIp}:${port}/?token=${this.token}&pin=${this.pairingPin}`;
    const nativePairUri = `gravktrl://pair?host=${preferredIp}&port=${port}&token=${this.token}&pin=${this.pairingPin}`;
    const apkDownloadUrl = `http://${preferredIp}:${port}/download-apk`;

    console.log("\n" + "=".repeat(74));
    console.log("  🚀 GRAVKTRL PC DAEMON — REMOTE AGENT COMMANDER & TERMINAL BRIDGE");
    console.log("=".repeat(74));
    console.log(`  Host PC Name   : ${os.hostname()}`);
    console.log(`  Daemon Version : 1.0.0`);
    console.log(`  Local Service  : http://${preferredIp}:${port}`);
    console.log(`  Master Token   : ${this.token.slice(0, 16)}... (256-bit secure)`);
    console.log("-".repeat(74));
    console.log(`  🔢 6-DIGIT QUICK PAIRING PIN :  ${this.getFormattedPin()}  (Enter this on phone)`);
    console.log("-".repeat(74));
    console.log("  DISCOVERED IP ENDPOINTS:");
    endpoints.forEach((ep) => {
      const tag = ep.type.toUpperCase().padEnd(9);
      console.log(`   • [${tag}] http://${ep.ip}:${port} (${ep.interfaceName})`);
    });
    console.log("-".repeat(74));
    console.log("  📱 ZERO-TYPING CONNECTION OPTIONS:");
    console.log(`   1. 6-Digit PIN on Phone    : ${this.getFormattedPin()} (Enter in Onboarding Popup)`);
    console.log(`   2. 1-Tap Browser HUD       : ${webPairUrl}`);
    console.log(`   3. Native Android Deep-Link: ${nativePairUri}`);
    console.log(`   4. Direct APK Download     : ${apkDownloadUrl}`);
    console.log("-".repeat(74));
    console.log("  📷 SCAN QR CODE WITH PHONE CAMERA (INSTANT AUTO-PAIRING):");

    try {
      qrcode.generate(webPairUrl, { small: true }, (qr) => {
        console.log(qr);
      });
    } catch {
      console.log("  [Use the Instant Web HUD or 6-digit PIN above]");
    }

    console.log("=".repeat(74) + "\n");
  }
}
