import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface AntigravityRemoteControlStatus {
  available: boolean;
  enabled: boolean;
  instanceId: string;
  companionOrigin: string;
  url: string;
  accountChooserUrl?: string;
  hostname: string;
  httpPort?: number;
  pid?: number;
  error?: string;
}

export interface AntigravityHubMetadata {
  pid: number;
  httpsPort: number;
  httpPort: number;
  lsVersion?: string;
  csrfToken: string;
}

export class AntigravityHubDriver {
  private daemonDir: string;
  private cachedHub: AntigravityHubMetadata | null = null;
  private lastHubCheck: number = 0;

  constructor() {
    const userProfile = process.env.USERPROFILE || os.homedir();
    this.daemonDir = path.join(userProfile, ".gemini", "antigravity", "daemon");
  }

  /**
   * Discovers the active Antigravity Language Server hub_*.json metadata.
   */
  public discoverHub(): AntigravityHubMetadata | null {
    const now = Date.now();
    // Cache for 3 seconds unless missing
    if (this.cachedHub && now - this.lastHubCheck < 3000) {
      return this.cachedHub;
    }

    this.lastHubCheck = now;
    if (!fs.existsSync(this.daemonDir)) {
      this.cachedHub = null;
      return null;
    }

    try {
      const files = fs.readdirSync(this.daemonDir)
        .filter((f) => f.startsWith("hub_") && f.endsWith(".json"))
        .map((f) => ({
          name: f,
          fullPath: path.join(this.daemonDir, f),
          stat: fs.statSync(path.join(this.daemonDir, f)),
        }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

      for (const entry of files) {
        try {
          const content = fs.readFileSync(entry.fullPath, "utf-8");
          const parsed = JSON.parse(content) as AntigravityHubMetadata;
          if (parsed.httpPort && parsed.csrfToken) {
            this.cachedHub = parsed;
            return parsed;
          }
        } catch {}
      }
    } catch (err) {
      console.warn("[AntigravityHubDriver] Error reading daemon directory:", err);
    }

    this.cachedHub = null;
    return null;
  }

  /**
   * Retrieves Antigravity's native Remote Control status from the language server.
   */
  public async getRemoteControlInfo(): Promise<AntigravityRemoteControlStatus> {
    const hub = this.discoverHub();
    if (!hub) {
      return {
        available: false,
        enabled: false,
        instanceId: "",
        companionOrigin: "",
        url: "",
        hostname: "",
        error: "Antigravity Language Server not detected",
      };
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:${hub.httpPort}/exa.language_server_pb.LanguageServerService/GetRemoteControlInfo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
            "x-codeium-csrf-token": hub.csrfToken,
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        throw new Error(`GetRemoteControlInfo returned HTTP ${res.status}`);
      }

      const data = await res.json() as {
        enabled?: boolean;
        instanceId?: string;
        companionOrigin?: string;
      };

      const enabled = Boolean(data.enabled);
      const instanceId = data.instanceId || "";
      const companionOrigin = data.companionOrigin || "https://antigravity.google.com";
      const url = instanceId ? `${companionOrigin}/r/${encodeURIComponent(instanceId)}` : "";
      const accountChooserUrl = url
        ? `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(url)}`
        : "";

      // Also read configured hostname if available
      let hostname = "";
      try {
        const userConfigRes = await fetch(
          `http://127.0.0.1:${hub.httpPort}/exa.language_server_pb.LanguageServerService/JetboxReadUserConfig`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Connect-Protocol-Version": "1",
              "x-codeium-csrf-token": hub.csrfToken,
            },
            body: JSON.stringify({}),
          }
        );
        if (userConfigRes.ok) {
          const configData = await userConfigRes.json() as any;
          hostname = configData?.userConfig?.userSettings?.remoteControlHostname || "";
        }
      } catch {}

      return {
        available: true,
        enabled,
        instanceId,
        companionOrigin,
        url,
        accountChooserUrl,
        hostname: hostname || os.hostname(),
        httpPort: hub.httpPort,
        pid: hub.pid,
      };
    } catch (err: any) {
      return {
        available: false,
        enabled: false,
        instanceId: "",
        companionOrigin: "",
        url: "",
        hostname: os.hostname(),
        httpPort: hub.httpPort,
        error: err.message || "Failed to communicate with Antigravity",
      };
    }
  }

  /**
   * Sets Antigravity's native Remote Control state and optional device name.
   */
  public async setRemoteControl(
    enabled: boolean,
    hostname?: string
  ): Promise<{ success: boolean; status: AntigravityRemoteControlStatus }> {
    const hub = this.discoverHub();
    if (!hub) {
      throw new Error("Antigravity Language Server is not running");
    }

    const userSettings: Record<string, unknown> = {
      remoteControlEnabled: enabled,
    };
    if (hostname !== undefined) {
      userSettings.remoteControlHostname = hostname;
    }

    const payload = {
      userConfig: {
        userSettings,
      },
    };

    const res = await fetch(
      `http://127.0.0.1:${hub.httpPort}/exa.language_server_pb.LanguageServerService/JetboxWriteState`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          "x-codeium-csrf-token": hub.csrfToken,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      throw new Error(`JetboxWriteState returned HTTP ${res.status}`);
    }

    // Refresh updated info
    const updated = await this.getRemoteControlInfo();
    updated.enabled = enabled;
    if (hostname) {
      updated.hostname = hostname;
    }
    return {
      success: true,
      status: updated,
    };
  }
}
