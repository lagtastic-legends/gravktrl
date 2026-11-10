import { spawn, type ChildProcess } from "node:child_process";
import * as os from "node:os";
import * as crypto from "node:crypto";

export interface TerminalSessionInfo {
  sessionId: string;
  name: string;
  shell: string;
  cwd: string;
  createdAt: string;
  active: boolean;
  cols: number;
  rows: number;
}

interface ActiveSession {
  info: TerminalSessionInfo;
  process: ChildProcess;
  inputBuffer: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
}

export interface TerminalApprovalEvent {
  approvalId: string;
  sessionId: string;
  command: string;
  riskReason: string;
}

export class InteractiveTerminalManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private dataListeners: Array<(event: TerminalDataEvent) => void> = [];
  private exitListeners: Array<(event: TerminalExitEvent) => void> = [];
  private approvalListeners: Array<(event: TerminalApprovalEvent) => void> = [];
  private pendingApprovals: Map<string, { approvalId: string; sessionId: string; command: string }> = new Map();

  // Destructive command guard patterns
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

  public onData(listener: (event: TerminalDataEvent) => void): void {
    this.dataListeners.push(listener);
  }

  public onExit(listener: (event: TerminalExitEvent) => void): void {
    this.exitListeners.push(listener);
  }

  public onApprovalRequired(listener: (event: TerminalApprovalEvent) => void): void {
    this.approvalListeners.push(listener);
  }

  private emitData(sessionId: string, data: string): void {
    for (const listener of this.dataListeners) {
      try {
        listener({ sessionId, data });
      } catch (err) {
        console.error("[InteractiveTerminal] Data listener error:", err);
      }
    }
  }

  private emitExit(sessionId: string, exitCode: number): void {
    for (const listener of this.exitListeners) {
      try {
        listener({ sessionId, exitCode });
      } catch (err) {
        console.error("[InteractiveTerminal] Exit listener error:", err);
      }
    }
  }

  private checkDestructiveRisk(command: string): string | null {
    for (const rule of this.destructivePatterns) {
      if (rule.pattern.test(command)) {
        return rule.reason;
      }
    }
    return null;
  }

  /**
   * Creates a new interactive terminal shell session or returns an existing active one.
   */
  public createSession(options?: {
    cwd?: string;
    shell?: string;
    cols?: number;
    rows?: number;
    name?: string;
  }): TerminalSessionInfo {
    const isWindows = os.platform() === "win32";
    const defaultShell = isWindows ? "powershell.exe" : "bash";
    const shell = options?.shell || defaultShell;
    const cwd = options?.cwd || process.cwd();
    const cols = options?.cols || 80;
    const rows = options?.rows || 24;
    const sessionId = "term_" + crypto.randomBytes(6).toString("hex");
    const name = options?.name || `Terminal ${this.sessions.size + 1}`;

    const args = isWindows
      ? ["-NoLogo", "-NoExit", "-Command", "-"]
      : ["-i"];

    const env = {
      ...process.env,
      FORCE_COLOR: "3",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LINES: rows.toString(),
      COLUMNS: cols.toString(),
    };

    const child = spawn(shell, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const info: TerminalSessionInfo = {
      sessionId,
      name,
      shell,
      cwd,
      createdAt: new Date().toISOString(),
      active: true,
      cols,
      rows,
    };

    const activeSession: ActiveSession = {
      info,
      process: child,
      inputBuffer: "",
    };

    this.sessions.set(sessionId, activeSession);

    // Initial greeting banner in ANSI
    const cyan = "\x1b[36m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";
    const welcome = `${cyan}${bold}⚡ GravKtrl Interactive REPL Terminal${reset} ${dim}[${shell}]${reset}\r\n${dim}Working directory: ${cwd}${reset}\r\n\r\n`;
    setTimeout(() => this.emitData(sessionId, welcome), 50);

    // Stream stdout chunks
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      this.emitData(sessionId, text);
    });

    // Stream stderr chunks
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      this.emitData(sessionId, text);
    });

    child.on("close", (code: number | null) => {
      const exitCode = code ?? 0;
      info.active = false;
      this.sessions.delete(sessionId);
      console.log(`[InteractiveTerminal] Session ${sessionId} exited with code ${exitCode}`);
      this.emitExit(sessionId, exitCode);
    });

    child.on("error", (err: Error) => {
      const errorMsg = `\r\n\x1b[31m[Terminal Process Error]: ${err.message}\x1b[0m\r\n`;
      this.emitData(sessionId, errorMsg);
      info.active = false;
      this.sessions.delete(sessionId);
      this.emitExit(sessionId, 1);
    });

    console.log(`[InteractiveTerminal] Session ${sessionId} started (${shell}) in ${cwd}`);
    return info;
  }

  /**
   * Writes raw keystrokes or string data into the shell's stdin.
   */
  public write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.info.active || !session.process.stdin || session.process.stdin.destroyed) {
      return false;
    }

    // Inspect buffer for destructive commands on Enter / Return (\r or \n)
    if (data.includes("\r") || data.includes("\n")) {
      const commandLine = (session.inputBuffer + data).replace(/[\r\n]+/g, " ").trim();
      session.inputBuffer = "";

      const risk = this.checkDestructiveRisk(commandLine);
      if (risk) {
        const approvalId = "appr_" + crypto.randomBytes(6).toString("hex");
        this.pendingApprovals.set(approvalId, {
          approvalId,
          sessionId,
          command: commandLine,
        });

        // Notify client
        for (const listener of this.approvalListeners) {
          listener({ approvalId, sessionId, command: commandLine, riskReason: risk });
        }

        const alertText = `\r\n\x1b[33m\x1b[1m[DESTRUCTIVE SAFETY GUARD]:\x1b[0m \x1b[33m${risk}\x1b[0m\r\n\x1b[2mAuthorization required from mobile operator before executing.\x1b[0m\r\n`;
        this.emitData(sessionId, alertText);
        return true;
      }
    } else {
      // Keep track of typing buffer
      if (data === "\x7f" || data === "\b") {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        session.inputBuffer += data;
      }
    }

    try {
      session.process.stdin.write(data);
      return true;
    } catch (err) {
      console.warn(`[InteractiveTerminal] Write error for session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Approves and executes a previously guarded command.
   */
  public approveCommand(approvalId: string): boolean {
    const item = this.pendingApprovals.get(approvalId);
    if (!item) return false;

    this.pendingApprovals.delete(approvalId);
    const session = this.sessions.get(item.sessionId);
    if (!session || !session.info.active || !session.process.stdin) return false;

    try {
      session.process.stdin.write(item.command + "\r\n");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resizes terminal dimensions.
   */
  public resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.info.active) return false;

    session.info.cols = cols;
    session.info.rows = rows;

    // Send dimension update to PowerShell / Bash environment if supported
    if (os.platform() === "win32") {
      try {
        session.process.stdin?.write(`$Host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows})\r\n`);
      } catch {}
    }

    return true;
  }

  /**
   * Terminates a terminal session.
   */
  public kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      session.info.active = false;
      if (os.platform() === "win32" && session.process.pid) {
        spawn("taskkill", ["/pid", session.process.pid.toString(), "/f", "/t"]);
      } else {
        session.process.kill("SIGTERM");
      }
      this.sessions.delete(sessionId);
      console.log(`[InteractiveTerminal] Session ${sessionId} terminated`);
      return true;
    } catch (err) {
      console.error(`[InteractiveTerminal] Error killing session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Returns list of active terminal sessions.
   */
  public listSessions(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s.info }));
  }

  /**
   * Returns a specific session info.
   */
  public getSession(sessionId: string): TerminalSessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.info } : undefined;
  }

  /**
   * Returns or creates the default primary session.
   */
  public getOrCreatePrimarySession(cwd?: string): TerminalSessionInfo {
    const existing = Array.from(this.sessions.values()).find((s) => s.info.active);
    if (existing) {
      return { ...existing.info };
    }
    return this.createSession({ cwd, name: "Primary Terminal" });
  }

  /**
   * Shuts down all active sessions.
   */
  public dispose(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
    this.sessions.clear();
    this.pendingApprovals.clear();
  }
}
