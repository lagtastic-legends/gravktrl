import * as path from "node:path";
import * as fs from "node:fs";

export interface ModelInfo {
  id: string;
  name: string;
  tier: string;
  badge: string;
  group: "gemini" | "claude_gpt";
  isAvailable: boolean;
  isSelected: boolean;
  notice?: string;
  description: string;
}

export interface LimitQuota {
  remainingPercent: number;
  resetFormatted: string;
  resetTimestamp: number;
}

export interface ModelUsageData {
  gemini: {
    weekly: LimitQuota;
    fiveHour: LimitQuota;
  };
  claudeGpt: {
    weekly: LimitQuota;
    fiveHour: LimitQuota;
  };
  activeModelId: string;
  lastUpdated: string;
}

export class ModelManager {
  private baseDir: string;
  private quotaFile: string;
  private statePbtxtFile: string;
  private activeModelId: string = "gemini-3.8-flash";
  private usageData: ModelUsageData;
  private listeners: Array<(usage: ModelUsageData) => void> = [];
  private tickerTimer: NodeJS.Timeout | null = null;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    this.quotaFile = path.join(this.baseDir, ".gravktrl-quota.json");
    
    const userProfile = process.env.USERPROFILE || "C:\\Users\\devra";
    this.statePbtxtFile = path.join(userProfile, ".gemini", "antigravity", "antigravity_state.pbtxt");

    this.usageData = this.loadInitialUsage();
    this.startLiveTicker();
  }

  private loadInitialUsage(): ModelUsageData {
    if (fs.existsSync(this.quotaFile)) {
      try {
        const raw = fs.readFileSync(this.quotaFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.gemini && parsed.claudeGpt) {
          if (parsed.activeModelId) {
            this.activeModelId = parsed.activeModelId;
          }
          return parsed;
        }
      } catch {}
    }

    // Default base limits matching Antigravity telemetry
    const now = Date.now();
    const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
    const fourHoursMs = 4 * 60 * 60 * 1000 + 4 * 60 * 1000;

    const initial: ModelUsageData = {
      gemini: {
        weekly: {
          remainingPercent: 72,
          resetFormatted: "Resets in 4d",
          resetTimestamp: now + fourDaysMs,
        },
        fiveHour: {
          remainingPercent: 89,
          resetFormatted: "Resets in 4h 4m",
          resetTimestamp: now + fourHoursMs,
        },
      },
      claudeGpt: {
        weekly: {
          remainingPercent: 100,
          resetFormatted: "Resets in 7d",
          resetTimestamp: now + 7 * 24 * 60 * 60 * 1000,
        },
        fiveHour: {
          remainingPercent: 100,
          resetFormatted: "Resets in 5h",
          resetTimestamp: now + 5 * 60 * 60 * 1000,
        },
      },
      activeModelId: "gemini-3.8-flash",
      lastUpdated: new Date().toISOString(),
    };

    this.saveUsage(initial);
    return initial;
  }

  private saveUsage(data: ModelUsageData): void {
    try {
      fs.writeFileSync(this.quotaFile, JSON.stringify(data, null, 2), "utf-8");
    } catch {}
  }

  public getModels(): ModelInfo[] {
    return [
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        tier: "High",
        badge: "High",
        group: "gemini",
        isAvailable: true,
        isSelected: this.activeModelId === "gemini-3.8-flash",
        description: "Google next-gen flagship agent model with real-time streaming",
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6 (Thinking)",
        tier: "Notice",
        badge: "Notice ⓘ",
        group: "claude_gpt",
        isAvailable: true,
        isSelected: this.activeModelId === "claude-sonnet-4.6",
        notice: "Thinking enabled",
        description: "Anthropic Sonnet 4.6 with extended chain-of-thought",
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6 (Thinking)",
        tier: "Notice",
        badge: "Notice ⓘ",
        group: "claude_gpt",
        isAvailable: true,
        isSelected: this.activeModelId === "claude-opus-4.6",
        notice: "Frontier reasoning",
        description: "Frontier reasoning model for complex architectural problems",
      },
      {
        id: "gpt-oss-120b",
        name: "GPT-OSS 120B (Medium)",
        tier: "Notice",
        badge: "Notice ⓘ",
        group: "claude_gpt",
        isAvailable: true,
        isSelected: this.activeModelId === "gpt-oss-120b",
        notice: "Open weights",
        description: "High-throughput open weight reasoning model",
      },
      {
        id: "gemini-4-argon",
        name: "Gemini 4 Argon",
        tier: "Unavailable",
        badge: "Unavailable ⓘ",
        group: "gemini",
        isAvailable: false,
        isSelected: false,
        notice: "Preview rollout",
        description: "Next generation prototype (preview rollout)",
      },
    ];
  }

  public getUsage(): ModelUsageData {
    // Recalculate formatted reset strings based on live elapsed time
    const now = Date.now();

    const formatDelta = (targetTs: number) => {
      const diff = Math.max(0, targetTs - now);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const days = Math.floor(hours / 24);

      if (days >= 1) {
        return `Resets in ${days}d`;
      }
      if (hours >= 1) {
        return `Resets in ${hours}h ${mins}m`;
      }
      return `Resets in ${mins}m`;
    };

    this.usageData.gemini.weekly.resetFormatted = formatDelta(this.usageData.gemini.weekly.resetTimestamp);
    this.usageData.gemini.fiveHour.resetFormatted = formatDelta(this.usageData.gemini.fiveHour.resetTimestamp);
    this.usageData.claudeGpt.weekly.resetFormatted = formatDelta(this.usageData.claudeGpt.weekly.resetTimestamp);
    this.usageData.claudeGpt.fiveHour.resetFormatted = formatDelta(this.usageData.claudeGpt.fiveHour.resetTimestamp);
    this.usageData.activeModelId = this.activeModelId;
    this.usageData.lastUpdated = new Date().toISOString();

    return this.usageData;
  }

  public selectModel(modelId: string): { success: boolean; model: ModelInfo | null; message: string } {
    const models = this.getModels();
    const target = models.find((m) => m.id === modelId);

    if (!target) {
      return { success: false, model: null, message: `Model '${modelId}' not found` };
    }

    if (!target.isAvailable) {
      return { success: false, model: target, message: `Model '${target.name}' is currently unavailable` };
    }

    this.activeModelId = modelId;
    this.usageData.activeModelId = modelId;
    this.saveUsage(this.usageData);

    // Update antigravity_state.pbtxt if accessible
    try {
      if (fs.existsSync(this.statePbtxtFile)) {
        let content = fs.readFileSync(this.statePbtxtFile, "utf-8");
        const placeholder =
          modelId === "gemini-3.8-flash"
            ? "MODEL_PLACEHOLDER_M318"
            : modelId === "claude-sonnet-4.6"
            ? "MODEL_CLAUDE_SONNET_46"
            : modelId === "claude-opus-4.6"
            ? "MODEL_CLAUDE_OPUS_46"
            : "MODEL_GPT_OSS_120B";

        content = content.replace(/last_selected_agent_model:\s*\S+/, `last_selected_agent_model: ${placeholder}`);
        fs.writeFileSync(this.statePbtxtFile, content, "utf-8");
      }
    } catch {}

    this.emitUsage();
    return {
      success: true,
      model: { ...target, isSelected: true },
      message: `Active model switched to ${target.name}`,
    };
  }

  public recordRequestUsage(): void {
    // Slightly decrease remaining quota on request to simulate real-time consumption
    if (this.usageData.gemini.fiveHour.remainingPercent > 5) {
      this.usageData.gemini.fiveHour.remainingPercent = Math.max(
        1,
        this.usageData.gemini.fiveHour.remainingPercent - 1
      );
    }
    this.saveUsage(this.usageData);
    this.emitUsage();
  }

  public onUsageUpdate(listener: (usage: ModelUsageData) => void): void {
    this.listeners.push(listener);
  }

  private emitUsage(): void {
    const usage = this.getUsage();
    for (const l of this.listeners) {
      try {
        l(usage);
      } catch {}
    }
  }

  private startLiveTicker(): void {
    // Emit live usage ticker every 15 seconds to update countdowns smoothly
    this.tickerTimer = setInterval(() => {
      this.emitUsage();
    }, 15000);
  }

  public dispose(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
  }
}
