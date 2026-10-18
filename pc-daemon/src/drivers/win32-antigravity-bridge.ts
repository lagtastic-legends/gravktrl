import * as path from "node:path";
import * as fs from "node:fs";
import { execFile, execSync, spawn } from "node:child_process";

export interface AntigravityProcessInfo {
  running: boolean;
  pid?: number;
  mainWindowHandle?: number;
  mainWindowTitle?: string;
  path?: string;
  mode: "cdp_ready" | "win32_normal" | "not_running";
}

export class Win32AntigravityBridge {
  private knownBinaryPaths: string[];

  constructor() {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    this.knownBinaryPaths = [
      path.join(localAppData, "Programs", "antigravity", "Antigravity.exe"),
      path.join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
      path.join(programFiles, "Antigravity", "Antigravity.exe"),
      path.join(programFilesX86, "Antigravity", "Antigravity.exe"),
      path.join(localAppData, "Programs", "Cursor", "Cursor.exe"),
      path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
    ];
  }

  /**
   * Find the installed Antigravity executable path on this Windows system.
   */
  public findExecutablePath(): string | null {
    for (const p of this.knownBinaryPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Inspect Windows processes to detect any running Antigravity instance.
   */
  public async getProcessInfo(): Promise<AntigravityProcessInfo> {
    if (process.platform !== "win32") {
      return { running: false, mode: "not_running" };
    }

    return new Promise((resolve) => {
      const psScript = `
        $p = Get-Process | Where-Object { 
          ($_.ProcessName -match "^(Antigravity|antigravity|Cursor|Code)$") -and ($_.MainWindowHandle -ne 0) 
        } | Select-Object -First 1 Id, ProcessName, MainWindowTitle, MainWindowHandle, Path
        if ($p) {
          $p | ConvertTo-Json -Compress
        } else {
          Write-Output "null"
        }
      `;

      execFile(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", psScript],
        { timeout: 3500 },
        (err, stdout) => {
          if (err || !stdout || stdout.trim() === "null" || stdout.trim() === "") {
            resolve({ running: false, mode: "not_running" });
            return;
          }

          try {
            const data = JSON.parse(stdout.trim());
            resolve({
              running: true,
              pid: data.Id,
              mainWindowHandle: data.MainWindowHandle,
              mainWindowTitle: data.MainWindowTitle || "Google Antigravity",
              path: data.Path || this.findExecutablePath() || undefined,
              mode: "win32_normal",
            });
          } catch {
            resolve({ running: false, mode: "not_running" });
          }
        }
      );
    });
  }

  /**
   * Cold-start Antigravity.exe with --remote-debugging-port=9222.
   * If a workspace is specified, opens that directory.
   */
  public async launchWithCdp(workspacePath?: string): Promise<{ success: boolean; message: string; pid?: number }> {
    const exePath = this.findExecutablePath();
    if (!exePath) {
      return {
        success: false,
        message: "Antigravity.exe not found in standard Windows installation directories.",
      };
    }

    const args = ["--remote-debugging-port=9222"];
    if (workspacePath && fs.existsSync(workspacePath)) {
      args.push(workspacePath);
    }

    try {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      return {
        success: true,
        message: `Launched Antigravity on CDP port 9222 (PID: ${child.pid})`,
        pid: child.pid,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Failed to launch Antigravity: ${errMsg}`,
      };
    }
  }

  /**
   * Injects a prompt into a normally-running Antigravity window via Win32 API.
   * 1. Copies prompt to Windows Clipboard.
   * 2. Brings Antigravity window to the foreground (ShowWindow + SetForegroundWindow).
   * 3. Simulates keystrokes: Ctrl+L (focus chat), Ctrl+V (paste), and {ENTER} (submit).
   * 4. Also persists prompt to <workspace>/.antigravity/GRAVKTRL_INBOX.md for audit trail.
   */
  public async injectPromptViaWin32(
    prompt: string,
    activeWorkspace: string
  ): Promise<{ success: boolean; message: string; windowTitle?: string }> {
    // 1. Audit write to GRAVKTRL_INBOX.md
    try {
      const inboxDir = path.join(activeWorkspace, ".antigravity");
      if (!fs.existsSync(inboxDir)) {
        fs.mkdirSync(inboxDir, { recursive: true });
      }
      const inboxFile = path.join(inboxDir, "GRAVKTRL_INBOX.md");
      const timestamp = new Date().toISOString();
      const content = `# GRAVKTRL WIN32 INBOX PROMPT\n- **Timestamp**: ${timestamp}\n- **Workspace**: ${activeWorkspace}\n- **Mode**: WIN32_NATIVE_KEYSTROKE\n\n---\n${prompt}\n`;
      fs.writeFileSync(inboxFile, content, "utf-8");
    } catch (fsErr) {
      console.warn("[Win32Bridge] Could not write audit inbox file:", fsErr);
    }

    // 2. Escape prompt for PowerShell string literal safely
    // Save prompt to a temporary file in user temp to avoid command-line quoting issues
    const tempFile = path.join(process.env.TEMP || "C:\\Windows\\Temp", `gravktrl-prompt-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tempFile, prompt, "utf-8");
    } catch {
      // Fallback if writing temp file fails
    }

    return new Promise((resolve) => {
      const psScript = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")]
            [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool SetForegroundWindow(IntPtr hWnd);

            [DllImport("user32.dll")]
            [return: MarshalAs(UnmanagedType.Bool)]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

            [DllImport("user32.dll")]
            public static extern bool IsIconic(IntPtr hWnd);
          }
"@

        $p = Get-Process | Where-Object { 
          ($_.ProcessName -match "^(Antigravity|antigravity|Cursor|Code)$") -and ($_.MainWindowHandle -ne 0) 
        } | Select-Object -First 1

        if (-not $p) {
          Write-Output '{"success": false, "error": "Antigravity window not found"}'
          exit 0
        }

        $hWnd = $p.MainWindowHandle
        if ([Win32]::IsIconic($hWnd)) {
          [Win32]::ShowWindow($hWnd, 9) # SW_RESTORE
        }
        [Win32]::SetForegroundWindow($hWnd)
        Start-Sleep -Milliseconds 250

        # Load prompt text
        $tempPath = "${tempFile.replace(/\\/g, "\\\\")}"
        if (Test-Path $tempPath) {
          $content = [System.IO.File]::ReadAllText($tempPath, [System.Text.Encoding]::UTF8)
          Set-Clipboard -Value $content
          Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue
        }

        # Send Keys using WScript.Shell
        $wshell = New-Object -ComObject WScript.Shell
        
        # Focus chat in Antigravity/Cursor (Ctrl+L)
        $wshell.SendKeys("^l")
        Start-Sleep -Milliseconds 200

        # Paste prompt into chat (Ctrl+V)
        $wshell.SendKeys("^v")
        Start-Sleep -Milliseconds 200

        # Submit prompt (Enter)
        $wshell.SendKeys("{ENTER}")

        $res = @{
          success = $true
          title = $p.MainWindowTitle
          pid = $p.Id
        }
        $res | ConvertTo-Json -Compress
      `;

      execFile(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", psScript],
        { timeout: 7000 },
        (err, stdout, stderr) => {
          // Clean up temp file if still present
          if (fs.existsSync(tempFile)) {
            try {
              fs.unlinkSync(tempFile);
            } catch {}
          }

          if (err) {
            resolve({
              success: false,
              message: `Win32 keystroke injection failed: ${err.message}`,
            });
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.success) {
              resolve({
                success: true,
                message: `Injected prompt into Antigravity window "${parsed.title}" via Win32 keystrokes`,
                windowTitle: parsed.title,
              });
            } else {
              resolve({
                success: false,
                message: parsed.error || "Antigravity window was not detected",
              });
            }
          } catch {
            resolve({
              success: true,
              message: "Keystroke sequence executed to Antigravity window",
            });
          }
        }
      );
    });
  }
}
