import { spawn, ChildProcess } from "node:child_process";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { TerminalDriver } from "../server.js";

interface RunningProcess {
  process: ChildProcess;
  command: string;
  cwd: string;
  startTime: number;
}

interface PendingApproval {
  approvalId: string;
  command: string;
  cwd: string;
  riskReason: string;
  timestamp: number;
}

export class TerminalEngineDriver implements TerminalDriver {
  private activeProcesses: Map<string, RunningProcess> = new Map();
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  private outputListeners: Array<(event: { executionId: string; chunk: string; stream: "stdout" | "stderr" }) => void> = [];
  private exitListeners: Array<(event: { executionId: string; exitCode: number; durationMs: number }) => void> = [];
  private approvalListeners: Array<(event: { approvalId: string; command: string; riskReason: string }) => void> = [];

  // Patterns that require explicit mobile operator confirmation
  private destructivePatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\brm\s+-rf\b/i, reason: "Recursive forced file deletion (rm -rf)" },
    { pattern: /\bRemove-Item\b.*-Recurse\b/i, reason: "PowerShell recursive item deletion (Remove-Item -Recurse)" },
    { pattern: /\brmdir\s+\/s\b/i, reason: "Windows recursive directory removal (rmdir /s)" },
    { pattern: /\bdel\s+\/s\b/i, reason: "Windows recursive file deletion (del /s)" },
    { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "Destructive Git reset (git reset --hard will discard uncommitted changes)" },
    { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, reason: "Forced Git untracked file purge (git clean -f)" },
    { pattern: /\bgit\s+push\b.*(--force|-f)\b/i, reason: "Forced Git branch overwrite (git push --force)" },
    { pattern: /\b(format|diskpart|mkfs|fdisk)\b/i, reason: "Disk partition or filesystem formatting command" },
    { pattern: /\bdrop\s+database\b/i, reason: "Database drop operation" },
  ];

  public onOutput(listener: (event: { executionId: string; chunk: string; stream: "stdout" | "stderr" }) => void): void {
    this.outputListeners.push(listener);
  }

  public onExit(listener: (event: { executionId: string; exitCode: number; durationMs: number }) => void): void {
    this.exitListeners.push(listener);
  }

  public onApprovalRequired(listener: (event: { approvalId: string; command: string; riskReason: string }) => void): void {
    this.approvalListeners.push(listener);
  }

  private checkDestructiveRisk(command: string): string | null {
    for (const rule of this.destructivePatterns) {
      if (rule.pattern.test(command)) {
        return rule.reason;
      }
    }
    return null;
  }

  public async execute(
    command: string,
    cwd: string,
    approvalId?: string
  ): Promise<{ executionId: string; status: "started" | "approval_required"; riskReason?: string }> {
    // If command is high risk and not yet approved
    if (!approvalId) {
      const risk = this.checkDestructiveRisk(command);
      if (risk) {
        const newApprovalId = "appr_" + crypto.randomBytes(8).toString("hex");
        this.pendingApprovals.set(newApprovalId, {
          approvalId: newApprovalId,
          command,
          cwd,
          riskReason: risk,
          timestamp: Date.now(),
        });

        // Broadcast to mobile
        for (const listener of this.approvalListeners) {
          listener({ approvalId: newApprovalId, command, riskReason: risk });
        }

        console.warn(`[Destructive Guard] Intercepted high-risk command: "${command}" (Reason: ${risk})`);
        return {
          executionId: newApprovalId,
          status: "approval_required",
          riskReason: risk,
        };
      }
    }

    return this.spawnProcess(command, cwd);
  }

  public async approveExecution(approvalId: string): Promise<{ executionId: string; status: "started" }> {
    const item = this.pendingApprovals.get(approvalId);
    if (!item) {
      throw new Error(`Approval request expired or not found: ${approvalId}`);
    }

    this.pendingApprovals.delete(approvalId);
    console.log(`[Destructive Guard] Command approved by mobile operator: "${item.command}"`);
    return this.spawnProcess(item.command, item.cwd);
  }

  private spawnProcess(command: string, cwd: string): { executionId: string; status: "started" } {
    const executionId = "exec_" + crypto.randomBytes(8).toString("hex");
    const isWindows = os.platform() === "win32";

    const shell = isWindows ? "powershell.exe" : "bash";
    const args = isWindows ? ["-NoLogo", "-NoProfile", "-Command", command] : ["-c", command];

    console.log(`[Terminal Engine] [${executionId}] Spawning in ${cwd}: ${command}`);

    const child = spawn(shell, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
      shell: false,
    });

    const startTime = Date.now();
    this.activeProcesses.set(executionId, {
      process: child,
      command,
      cwd,
      startTime,
    });

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString("utf-8");
      for (const listener of this.outputListeners) {
        listener({ executionId, chunk, stream: "stdout" });
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString("utf-8");
      for (const listener of this.outputListeners) {
        listener({ executionId, chunk, stream: "stderr" });
      }
    });

    child.on("close", (code: number | null) => {
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 0;
      this.activeProcesses.delete(executionId);

      console.log(`[Terminal Engine] [${executionId}] Exited with code ${exitCode} (${durationMs}ms)`);
      for (const listener of this.exitListeners) {
        listener({ executionId, exitCode, durationMs });
      }
    });

    child.on("error", (err: Error) => {
      const chunk = `[Process Launch Error]: ${err.message}\n`;
      for (const listener of this.outputListeners) {
        listener({ executionId, chunk, stream: "stderr" });
      }
      this.activeProcesses.delete(executionId);
      for (const listener of this.exitListeners) {
        listener({ executionId, exitCode: 1, durationMs: Date.now() - startTime });
      }
    });

    return { executionId, status: "started" };
  }

  public sendInput(executionId: string, input: string): boolean {
    const item = this.activeProcesses.get(executionId);
    if (!item || !item.process.stdin || item.process.stdin.destroyed) {
      return false;
    }

    try {
      item.process.stdin.write(input);
      return true;
    } catch {
      return false;
    }
  }

  public kill(executionId: string): boolean {
    const item = this.activeProcesses.get(executionId);
    if (!item) {
      return false;
    }

    try {
      if (os.platform() === "win32" && item.process.pid) {
        spawn("taskkill", ["/pid", item.process.pid.toString(), "/f", "/t"]);
      } else {
        item.process.kill("SIGTERM");
      }
      this.activeProcesses.delete(executionId);
      console.log(`[Terminal Engine] [${executionId}] Process killed`);
      return true;
    } catch (err) {
      console.error(`[Terminal Engine] Failed to kill ${executionId}:`, err);
      return false;
    }
  }
}
