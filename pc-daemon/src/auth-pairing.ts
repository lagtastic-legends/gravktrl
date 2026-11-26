import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

export interface GravKtrlPairingRecord {
  token: string;
  createdAt: string;
  deviceName?: string;
  lastUsedAt?: string;
}

export interface GravKtrlAuthStorage {
  token?: string;
  masterToken: string;
  activePin: string;
  daemonVersion: string;
  createdAt?: string;
  pairedDevices: Record<string, GravKtrlPairingRecord>;
}

const AUTH_FILE_NAME = ".gravktrl-auth.json";

export class GravKtrlAuthPairing {
  private authFilePath: string;
  private masterToken: string;
  private activePin: string;
  private pinAttempts: number[] = [];
  private pairedTokens: Set<string> = new Set();

  constructor(baseDir: string = process.cwd()) {
    this.authFilePath = path.join(baseDir, AUTH_FILE_NAME);
    const data = this.loadOrCreateStorage();
    this.masterToken = data.masterToken;
    this.activePin = data.activePin || this.generateNew6DigitPin();
    this.pairedTokens.add(this.masterToken);
    for (const token of Object.keys(data.pairedDevices || {})) {
      this.pairedTokens.add(token);
    }
  }

  public getMasterToken(): string {
    return this.masterToken;
  }

  public getPin(): string {
    return this.activePin;
  }

  public setPin(pin: string): void {
    if (/^\d{6}$/.test(pin)) {
      this.activePin = pin;
    }
  }

  public getFormattedPin(): string {
    return `${this.activePin.slice(0, 3)} - ${this.activePin.slice(3, 6)}`;
  }

  public generateNew6DigitPin(): string {
    const val = crypto.randomInt(100000, 1000000);
    this.activePin = val.toString();
    this.persistStorage();
    return this.activePin;
  }

  /**
   * Tier 2 + Tier 3 Pairing: Validates the 6-digit PIN and issues a 64-char (256-bit) session token.
   */
  public pairWithPin(
    inputPin: string,
    deviceName: string = "Mobile Device"
  ): { success: boolean; token?: string; error?: string } {
    const now = Date.now();
    // Rate limiting: clean up attempts older than 60s
    this.pinAttempts = this.pinAttempts.filter((t) => now - t < 60000);
    if (this.pinAttempts.length >= 5) {
      return {
        success: false,
        error: "Rate limit exceeded: Too many incorrect PIN attempts. Try again in 60s.",
      };
    }

    const cleanInput = (inputPin || "").replace(/\D/g, "").trim();
    if (cleanInput !== this.activePin) {
      this.pinAttempts.push(now);
      return {
        success: false,
        error: "Invalid 6-digit pairing PIN.",
      };
    }

    // PIN is correct! Issue a 64-character (256-bit) cryptographically random hex token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    this.pairedTokens.add(sessionToken);

    // Save pairing record
    const storage = this.loadOrCreateStorage();
    if (!storage.pairedDevices) {
      storage.pairedDevices = {};
    }
    storage.pairedDevices[sessionToken] = {
      token: sessionToken,
      deviceName,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    this.persistStorage(storage);

    // Generate new PIN for subsequent pairing attempts
    this.generateNew6DigitPin();

    return {
      success: true,
      token: sessionToken,
    };
  }

  /**
   * Validates whether a token is authenticated (master token or paired device session token).
   */
  public validateToken(token?: string | null): boolean {
    if (!token) return false;
    const cleanToken = token.trim();
    return this.pairedTokens.has(cleanToken) || cleanToken === this.masterToken;
  }

  private loadOrCreateStorage(): GravKtrlAuthStorage {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const raw = fs.readFileSync(this.authFilePath, "utf-8");
        const parsed = JSON.parse(raw) as GravKtrlAuthStorage;
        const resolvedMaster = parsed.masterToken || parsed.token || "";
        if (resolvedMaster.length >= 32) {
          return {
            token: resolvedMaster,
            masterToken: resolvedMaster,
            activePin: parsed.activePin || crypto.randomInt(100000, 1000000).toString(),
            daemonVersion: parsed.daemonVersion || "0.1.0",
            createdAt: parsed.createdAt || new Date().toISOString(),
            pairedDevices: parsed.pairedDevices || {},
          };
        }
      }
    } catch {}

    const newMasterToken = crypto.randomBytes(32).toString("hex");
    const initialPin = crypto.randomInt(100000, 1000000).toString();
    const storage: GravKtrlAuthStorage = {
      token: newMasterToken,
      masterToken: newMasterToken,
      activePin: initialPin,
      daemonVersion: "0.1.0",
      createdAt: new Date().toISOString(),
      pairedDevices: {},
    };

    try {
      fs.writeFileSync(this.authFilePath, JSON.stringify(storage, null, 2), "utf-8");
    } catch {}

    return storage;
  }

  private persistStorage(data?: GravKtrlAuthStorage): void {
    try {
      const storage: GravKtrlAuthStorage = data || {
        token: this.masterToken,
        masterToken: this.masterToken,
        activePin: this.activePin,
        daemonVersion: "0.1.0",
        createdAt: new Date().toISOString(),
        pairedDevices: {},
      };
      if (!storage.token) storage.token = storage.masterToken;
      fs.writeFileSync(this.authFilePath, JSON.stringify(storage, null, 2), "utf-8");
    } catch {}
  }
}
