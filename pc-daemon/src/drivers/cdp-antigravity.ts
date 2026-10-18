import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { WebSocket } from "ws";
import type { AgentDriver } from "../server.js";
import { Win32AntigravityBridge, type AntigravityProcessInfo } from "./win32-antigravity-bridge.js";

interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export class CdpAntigravityDriver implements AgentDriver {
  private cdpPort: number;
  private activeWs: WebSocket | null = null;
  private isAgentActive: boolean = false;
  private currentTask: string | undefined;
  private lastResponse: string = "";
  private streamListeners: Array<(chunk: { text: string; isComplete: boolean; status: string }) => void> = [];
  private pollingTimer: NodeJS.Timeout | null = null;
  private nextRpcId: number = 1;
  private win32Bridge: Win32AntigravityBridge;
  private lastAttachMode: "cdp" | "win32" | "fallback" = "cdp";

  constructor(cdpPort: number = 9222) {
    this.cdpPort = cdpPort;
    this.win32Bridge = new Win32AntigravityBridge();
  }

  public getWin32Bridge(): Win32AntigravityBridge {
    return this.win32Bridge;
  }

  public onStreamChunk(listener: (chunk: { text: string; isComplete: boolean; status: string }) => void): void {
    this.streamListeners.push(listener);
  }

  private emitStreamChunk(chunk: { text: string; isComplete: boolean; status: string }): void {
    for (const listener of this.streamListeners) {
      try {
        listener(chunk);
      } catch (err) {
        console.error("[CDP] Stream listener error:", err);
      }
    }
  }

  public getAgentStatus(): {
    isRunning: boolean;
    currentTask?: string;
    lastResponse?: string;
    cdpAttached: boolean;
    mode: "cdp" | "win32" | "offline";
    processName?: string;
  } {
    const isCdp = this.activeWs !== null && this.activeWs.readyState === WebSocket.OPEN;
    return {
      isRunning: this.isAgentActive,
      currentTask: this.currentTask,
      lastResponse: this.lastResponse,
      cdpAttached: isCdp,
      mode: isCdp ? "cdp" : this.lastAttachMode === "win32" ? "win32" : "offline",
      processName: "Antigravity.exe",
    };
  }

  private async fetchCdpTargets(): Promise<CdpTarget[]> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.cdpPort}/json`, { timeout: 1500 }, (res) => {
        if (res.statusCode !== 200) {
          resolve([]);
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const targets = JSON.parse(data);
            resolve(Array.isArray(targets) ? targets : []);
          } catch {
            resolve([]);
          }
        });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => {
        req.destroy();
        resolve([]);
      });
    });
  }

  private async connectToTarget(target: CdpTarget): Promise<WebSocket> {
    if (!target.webSocketDebuggerUrl) {
      throw new Error(`Target ${target.id} does not have a webSocketDebuggerUrl`);
    }

    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      return this.activeWs;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl!);
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error("Timeout connecting to CDP WebSocket"));
      }, 3000);

      ws.on("open", () => {
        clearTimeout(timeout);
        this.activeWs = ws;
        console.log(`[CDP] Attached to Antigravity IDE target: "${target.title}"`);
        resolve(ws);
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        this.activeWs = null;
        reject(err);
      });

      ws.on("close", () => {
        this.activeWs = null;
      });
    });
  }

  private callCdpMethod(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRpcId++;
      const message = JSON.stringify({ id, method, params });

      const onMessage = (raw: Buffer | string) => {
        try {
          const res = JSON.parse(raw.toString("utf-8"));
          if (res.id === id) {
            ws.removeListener("message", onMessage);
            if (res.error) {
              reject(new Error(res.error.message || "CDP Method Failed"));
            } else {
              resolve(res.result);
            }
          }
        } catch {}
      };

      ws.on("message", onMessage);
      ws.send(message, (err) => {
        if (err) {
          ws.removeListener("message", onMessage);
          reject(err);
        }
      });

      setTimeout(() => {
        ws.removeListener("message", onMessage);
        reject(new Error(`CDP method ${method} timed out`));
      }, 5000);
    });
  }

  public async sendPrompt(
    prompt: string,
    activeWorkspace: string
  ): Promise<{ success: boolean; mode: "cdp" | "win32" | "fallback"; message: string }> {
    this.currentTask = prompt;
    this.isAgentActive = true;

    // STEP 1: Check if CDP (port 9222) is listening
    try {
      const targets = await this.fetchCdpTargets();
      const candidate =
        targets.find((t) => t.type === "page" && (t.title.includes("Antigravity") || t.title.includes("Workspace"))) ||
        targets.find((t) => t.type === "page") ||
        targets[0];

      if (candidate && candidate.webSocketDebuggerUrl) {
        const ws = await this.connectToTarget(candidate);

        const injectionScript = `
          (() => {
            try {
              const selectors = [
                'textarea[placeholder*="Ask"]',
                'textarea[placeholder*="prompt"]',
                'textarea[placeholder*="agent"]',
                'div.monaco-editor [contenteditable="true"]',
                'textarea',
                '[contenteditable="true"]'
              ];

              let inputEl = null;
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0)) {
                  inputEl = el;
                  break;
                }
              }

              if (!inputEl) {
                return { success: false, reason: "No visible chat input found in DOM" };
              }

              inputEl.focus();
              const textToInsert = ${JSON.stringify(prompt)};

              if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
                const proto = Object.getPrototypeOf(inputEl);
                const valSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
                                  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                if (valSetter) {
                  valSetter.call(inputEl, textToInsert);
                } else {
                  inputEl.value = textToInsert;
                }
              } else {
                inputEl.innerText = textToInsert;
              }

              inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: textToInsert }));
              inputEl.dispatchEvent(new Event('change', { bubbles: true }));

              const enterEvtDown = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              });
              const enterEvtUp = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              });

              inputEl.dispatchEvent(enterEvtDown);
              inputEl.dispatchEvent(enterEvtUp);

              const sendBtn = document.querySelector('button[aria-label*="Send"], button[title*="Send"], button.send-button');
              if (sendBtn) {
                sendBtn.click();
              }

              return { success: true };
            } catch (e) {
              return { success: false, error: String(e) };
            }
          })()
        `;

        const evalResult = (await this.callCdpMethod(ws, "Runtime.evaluate", {
          expression: injectionScript,
          returnByValue: true,
        })) as { result?: { value?: { success?: boolean; reason?: string; error?: string } } };

        const value = evalResult?.result?.value;
        if (value && value.success) {
          this.lastAttachMode = "cdp";
          this.startDomStreamPoller(ws);
          this.emitStreamChunk({
            text: `[CDP Connected: Port ${this.cdpPort}]\nPrompt injected into Antigravity DOM:\n> ${prompt}\n\nObserving agent thoughts & stream...`,
            isComplete: false,
            status: "running",
          });
          return {
            success: true,
            mode: "cdp",
            message: "Prompt injected into Antigravity IDE successfully via Chrome DevTools Protocol",
          };
        }
      }
    } catch {
      // CDP not listening or error, proceed to Win32 check
    }

    // STEP 2: CDP is inactive. Check if normal Antigravity.exe is running on Windows!
    console.log("[DualDriver] CDP port 9222 inactive. Checking for running Antigravity.exe via Win32...");
    const procInfo: AntigravityProcessInfo = await this.win32Bridge.getProcessInfo();

    if (procInfo.running) {
      this.lastAttachMode = "win32";
      console.log(`[DualDriver] Found running Antigravity process PID ${procInfo.pid} ("${procInfo.mainWindowTitle}")`);
      
      const win32Res = await this.win32Bridge.injectPromptViaWin32(prompt, activeWorkspace);
      if (win32Res.success) {
        this.emitStreamChunk({
          text: `[Win32 Attached: Normal Process]\nInjected prompt into "${win32Res.windowTitle || procInfo.mainWindowTitle}"\n> ${prompt}\n\nAntigravity is now processing your request. Live file modifications will stream here in real time.`,
          isComplete: true,
          status: "dispatched",
        });

        this.isAgentActive = false;
        return {
          success: true,
          mode: "win32",
          message: win32Res.message,
        };
      }
    }

    // STEP 3: Antigravity is not running at all. Offer auto-launch with CDP or fallback queue.
    console.log("[DualDriver] Antigravity is not currently running. Attempting auto-launch with CDP port 9222...");
    const launchRes = await this.win32Bridge.launchWithCdp(activeWorkspace);
    
    if (launchRes.success) {
      // Wait for process to initialize and port 9222 to bind
      await new Promise((r) => setTimeout(r, 4000));
      const retryTargets = await this.fetchCdpTargets();
      if (retryTargets.length > 0) {
        this.lastAttachMode = "cdp";
        return await this.sendPrompt(prompt, activeWorkspace);
      }
    }

    // STEP 4: Ultimate Fallback: Stage to Clipboard & .antigravity/GRAVKTRL_INBOX.md
    return await this.fallbackPromptQueue(
      prompt,
      activeWorkspace,
      "Antigravity is not running or window focus could not be acquired"
    );
  }

  private startDomStreamPoller(ws: WebSocket): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    let pollCount = 0;
    this.pollingTimer = setInterval(async () => {
      pollCount++;
      if (!this.isAgentActive || ws.readyState !== WebSocket.OPEN) {
        if (this.pollingTimer) clearInterval(this.pollingTimer);
        return;
      }

      try {
        const pollScript = `
          (() => {
            try {
              const turns = document.querySelectorAll('.chat-turn, .conversation-turn, .message-bubble, [data-message-author="agent"]');
              if (turns.length > 0) {
                const lastTurn = turns[turns.length - 1];
                const text = lastTurn.innerText || "";
                const isWorking = document.querySelector('.spinner, .loading, [aria-busy="true"], .typing-indicator') !== null;
                return { text: text.trim(), isWorking };
              }
              return { text: "", isWorking: false };
            } catch (e) {
              return { text: "", isWorking: false, error: String(e) };
            }
          })()
        `;

        const res = (await this.callCdpMethod(ws, "Runtime.evaluate", {
          expression: pollScript,
          returnByValue: true,
        })) as { result?: { value?: { text?: string; isWorking?: boolean } } };

        const val = res?.result?.value;
        if (val && val.text && val.text !== this.lastResponse) {
          this.lastResponse = val.text;
          this.emitStreamChunk({
            text: val.text,
            isComplete: !val.isWorking,
            status: val.isWorking ? "generating" : "idle",
          });

          if (!val.isWorking && pollCount > 10) {
            this.isAgentActive = false;
            if (this.pollingTimer) clearInterval(this.pollingTimer);
          }
        }
      } catch {
        // Suppress poll errors
      }
    }, 350);
  }

  private async fallbackPromptQueue(
    prompt: string,
    activeWorkspace: string,
    reason: string
  ): Promise<{ success: boolean; mode: "fallback"; message: string }> {
    this.lastAttachMode = "fallback";
    console.warn(`[CDP] Using fallback queue: ${reason}`);

    const inboxDir = path.join(activeWorkspace, ".antigravity");
    const inboxFile = path.join(inboxDir, "GRAVKTRL_INBOX.md");

    try {
      if (!fs.existsSync(inboxDir)) {
        fs.mkdirSync(inboxDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const content = `# GRAVKTRL MOBILE INBOX PROMPT
- **Timestamp**: ${timestamp}
- **Workspace**: ${activeWorkspace}
- **Source**: GravKtrl Mobile Commander (com.gravktrl.app)
- **Status**: PENDING_PASTE

---
${prompt}
`;
      fs.writeFileSync(inboxFile, content, "utf-8");
      console.log(`[CDP Fallback] Saved prompt to: ${inboxFile}`);
    } catch (writeErr) {
      console.error("[CDP Fallback] Failed to write inbox file:", writeErr);
    }

    try {
      await new Promise<void>((resolve) => {
        const escaped = prompt.replace(/"/g, '`"');
        const psCommand = `Set-Clipboard -Value "${escaped}"`;
        execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", psCommand], () => {
          console.log("[CDP Fallback] Prompt copied directly to Windows system clipboard");
          resolve();
        });
      });
    } catch (clipErr) {
      console.error("[CDP Fallback] Failed to copy to clipboard:", clipErr);
    }

    const fallbackNotice =
      `[CDP Fallback Mode Active]\n` +
      `Reason: ${reason}\n\n` +
      `Prompt staged to:\n` +
      `1. Windows Clipboard (Press Ctrl+V in Antigravity chat)\n` +
      `2. Inbox File: ${inboxFile}\n\n` +
      `> "${prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt}"`;

    this.emitStreamChunk({
      text: fallbackNotice,
      isComplete: true,
      status: "staged_on_pc",
    });

    this.isAgentActive = false;

    return {
      success: true,
      mode: "fallback",
      message: `Prompt staged to Windows clipboard and ${inboxFile} (${reason})`,
    };
  }

  public async stopAgent(): Promise<{ success: boolean; message: string }> {
    this.isAgentActive = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      try {
        const stopScript = `
          (() => {
            const stopBtn = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"], .stop-button');
            if (stopBtn) {
              stopBtn.click();
              return true;
            }
            return false;
          })()
        `;
        await this.callCdpMethod(this.activeWs, "Runtime.evaluate", { expression: stopScript });
      } catch {}
    }

    this.emitStreamChunk({
      text: "[Agent stopped by Mobile Commander]",
      isComplete: true,
      status: "stopped",
    });

    return { success: true, message: "Agent stop signal dispatched" };
  }
}
