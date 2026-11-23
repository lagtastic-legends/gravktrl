/**
 * Destructive Command Guard for GravKtrl PC Daemon
 * Enforces strict developer safety policies on remote terminal execution.
 */

export interface CommandSafetyResult {
  allowed: boolean;
  riskLevel: "safe" | "elevated" | "blocked";
  reason?: string;
}

// Patterns that MUST be blocked unconditionally without interactive host PC authorization
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Recursive directory deletion
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i, description: "Recursive forced removal (rm -rf)" },
  { pattern: /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i, description: "Recursive forced removal (rm -fr)" },
  { pattern: /\bRemove-Item\b.*-[rR]ecurse.*-[fF]orce\b/i, description: "PowerShell recursive force deletion (Remove-Item -Recurse -Force)" },
  { pattern: /\bRemove-Item\b.*-[fF]orce.*-[rR]ecurse\b/i, description: "PowerShell recursive force deletion (Remove-Item -Force -Recurse)" },
  { pattern: /\bdel\s+(?:\/[a-zA-Z]\s+)*\/s(?:\s+\/[a-zA-Z])*\s+(?:\/[a-zA-Z]\s+)*\/q\b/i, description: "Windows recursive quiet deletion (del /s /q)" },
  { pattern: /\bdel\s+(?:\/[a-zA-Z]\s+)*\/q(?:\s+\/[a-zA-Z])*\s+(?:\/[a-zA-Z]\s+)*\/s\b/i, description: "Windows recursive quiet deletion (del /q /s)" },
  { pattern: /\brd\s+\/s\s+\/q\b/i, description: "Windows directory tree removal (rd /s /q)" },
  { pattern: /\brmdir\s+\/s\s+\/q\b/i, description: "Windows directory tree removal (rmdir /s /q)" },

  // Disk & Filesystem Format/Destruction
  { pattern: /\bFormat-Volume\b/i, description: "PowerShell disk volume formatting" },
  { pattern: /\bformat\s+[a-zA-Z]:/i, description: "Drive format command" },
  { pattern: /\bdiskpart\b/i, description: "Disk partitioning utility (diskpart)" },

  // Host System Shutdown / Reboots
  { pattern: /\bshutdown\s+(?:\/[a-zA-Z]\s*)*\/s\b/i, description: "System shutdown (shutdown /s)" },
  { pattern: /\bshutdown\s+(?:-[a-zA-Z]\s*)*-[hHrRsS]\b/i, description: "System halt/shutdown command" },
  { pattern: /\bStop-Computer\b/i, description: "PowerShell Stop-Computer" },
  { pattern: /\bRestart-Computer\b/i, description: "PowerShell Restart-Computer" },

  // System Registry & Boot Config Modifications
  { pattern: /\breg\s+delete\b/i, description: "Registry key deletion (reg delete)" },
  { pattern: /\bbcdedit\b/i, description: "Boot Configuration Data editor (bcdedit)" },

  // Fork bombs and raw block device overwrites
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, description: "Bash fork bomb" },
  { pattern: /\bdd\s+if=.*of=\/dev\/(?:sd|nvme|hd|vd)/i, description: "Raw drive overwrite via dd" },
];

// Patterns categorized as elevated (allowed under safe presets or safe development workflows)
const ELEVATED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bkill\b|\btaskkill\b|\bStop-Process\b/i, description: "Process termination" },
  { pattern: /\bchmod\s+-R\b|\bchown\s+-R\b/i, description: "Recursive permission alteration" },
  { pattern: /\bnetsh\s+firewall\b|\bnetsh\s+advfirewall\b/i, description: "Firewall modifications" },
];

// Explicitly recognized safe workflows
const SAFE_WORKFLOW_PATTERNS: RegExp[] = [
  /^git\s+(?:status|pull|fetch|branch|diff|log|commit|add|push|checkout|switch|stash|show|rev-parse)/i,
  /^npm\s+(?:run\s+[\w:-]+|test|start|build|typecheck|audit|list|outdated|view)/i,
  /^npx\s+(?:tsx|tsc|cap|next)/i,
  /^adb\s+(?:devices|install|uninstall|shell|logcat|push|pull|reboot)/i,
  /^gh\s+(?:release|repo|pr|issue|run|workflow)/i,
  /^nvidia-smi/i,
  /^node\s+-[vV]|npm\s+-[vV]|git\s+--version/i,
  /^echo\b|^dir\b|^ls\b|^Get-ChildItem\b|^cat\b|^Get-Content\b|^pwd\b/i,
];

/**
 * Validates command safety before execution.
 * Strictly blocks destructive commands while allowing normal development workflows.
 */
export function validateCommandSafety(command: string): CommandSafetyResult {
  const trimmed = (command || "").trim();
  if (!trimmed) {
    return { allowed: false, riskLevel: "safe", reason: "Empty command string" };
  }

  // Check against strict blocked patterns first
  for (const entry of BLOCKED_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return {
        allowed: false,
        riskLevel: "blocked",
        reason: `Destructive command blocked by policy: ${entry.description}`,
      };
    }
  }

  // Check if matching safe developer and Android workflows
  for (const pattern of SAFE_WORKFLOW_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: true,
        riskLevel: "safe",
      };
    }
  }

  // Check for elevated risk commands
  for (const entry of ELEVATED_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return {
        allowed: true,
        riskLevel: "elevated",
        reason: `Elevated command risk: ${entry.description}`,
      };
    }
  }

  // Default: Allow standard developer shell commands that did not trip blocked rules
  return {
    allowed: true,
    riskLevel: "safe",
  };
}
