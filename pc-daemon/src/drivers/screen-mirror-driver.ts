import * as path from "node:path";
import * as fs from "node:fs";
import * as http from "node:http";
import { spawn, execSync, type ChildProcess } from "node:child_process";

export interface ScreenInfo {
  screenWidth: number;
  screenHeight: number;
  antigravity: {
    found: boolean;
    hWnd: number;
    title: string;
    rect: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  };
}

export interface ScreenInputEvent {
  type: "click" | "right_click" | "double_click" | "scroll" | "text" | "focus";
  normX?: number;
  normY?: number;
  deltaY?: number;
  text?: string;
  button?: "left" | "right" | "double";
  target?: "desktop" | "antigravity";
}

interface PendingRequest {
  type: "info" | "shot" | "cmd";
  resolve: (value: any) => void;
  reject: (err: any) => void;
  timeoutTimer: NodeJS.Timeout;
}

export class ScreenMirrorDriver {
  private baseDir: string;
  private exePath: string;
  private csPath: string;
  private child: ChildProcess | null = null;
  private isStarting: boolean = false;
  private requestQueue: PendingRequest[] = [];
  private activeRequest: PendingRequest | null = null;
  private incomingBuffer: Buffer = Buffer.alloc(0);

  // Streaming clients & broadcast ticker
  private activeStreams: Set<{
    res: http.ServerResponse;
    target: "desktop" | "antigravity";
    quality: number;
    scale: number;
  }> = new Set();
  private streamTimer: NodeJS.Timeout | null = null;
  private lastCachedFrame: Buffer | null = null;
  private lastCachedTime: number = 0;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    this.exePath = path.join(this.baseDir, "pc-daemon", "bin", "gravktrl-screen.exe");
    this.csPath = path.join(this.baseDir, "pc-daemon", "src", "drivers", "screen-service.cs");

    this.ensureBinaryExists();
    this.startChildProcess();
  }

  /**
   * Automatically compiles gravktrl-screen.exe via csc.exe if missing.
   */
  private ensureBinaryExists(): void {
    if (fs.existsSync(this.exePath)) return;

    const binDir = path.dirname(this.exePath);
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
    if (fs.existsSync(cscPath) && fs.existsSync(this.csPath)) {
      try {
        console.log("[ScreenMirrorDriver] Compiling native screen capture service via csc.exe...");
        execSync(`"${cscPath}" /nologo /optimize+ /target:exe /out:"${this.exePath}" /r:System.Drawing.dll "${this.csPath}"`, {
          timeout: 10000,
          windowsHide: true,
        });
        console.log("[ScreenMirrorDriver] gravktrl-screen.exe compiled successfully.");
      } catch (err) {
        console.error("[ScreenMirrorDriver] Failed to compile screen-service.cs:", err);
      }
    }
  }

  /**
   * Spawns the persistent screen capture child process.
   */
  private startChildProcess(): void {
    if (this.child || this.isStarting) return;
    if (!fs.existsSync(this.exePath)) {
      console.warn("[ScreenMirrorDriver] Binary not available at:", this.exePath);
      return;
    }

    this.isStarting = true;
    try {
      this.child = spawn(this.exePath, [], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.child.stderr?.on("data", (d) => {
        const text = d.toString().trim();
        if (text && !text.includes("Started")) {
          console.warn("[ScreenMirrorDriver Stderr]:", text);
        }
      });

      this.child.stdout?.on("data", (chunk: Buffer) => {
        this.handleProcessData(chunk);
      });

      this.child.on("exit", (code, signal) => {
        console.warn(`[ScreenMirrorDriver] Service exited with code ${code}, signal ${signal}`);
        this.child = null;
        this.isStarting = false;
        this.incomingBuffer = Buffer.alloc(0);

        // Fail pending request if any
        if (this.activeRequest) {
          clearTimeout(this.activeRequest.timeoutTimer);
          this.activeRequest.reject(new Error("Screen capture process terminated unexpectedly"));
          this.activeRequest = null;
        }

        // Auto restart if streaming is active
        if (this.activeStreams.size > 0) {
          setTimeout(() => this.startChildProcess(), 500);
        }
      });

      this.isStarting = false;
    } catch (err) {
      this.isStarting = false;
      this.child = null;
      console.error("[ScreenMirrorDriver] Failed to start child process:", err);
    }
  }

  /**
   * Processes incoming data from stdout.
   */
  private handleProcessData(chunk: Buffer): void {
    this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

    if (!this.activeRequest) return;

    if (this.activeRequest.type === "shot") {
      // Look for FRAME <length>\n<data>\n
      const str = this.incomingBuffer.toString("ascii", 0, Math.min(100, this.incomingBuffer.length));
      const match = str.match(/^FRAME (\d+)\n/);
      if (match) {
        const frameLen = parseInt(match[1], 10);
        const headerLen = match[0].length;
        const totalNeeded = headerLen + frameLen + 1; // including trailing \n

        if (this.incomingBuffer.length >= totalNeeded) {
          const frameData = this.incomingBuffer.slice(headerLen, headerLen + frameLen);
          this.incomingBuffer = this.incomingBuffer.slice(totalNeeded);

          const req = this.activeRequest;
          this.activeRequest = null;
          clearTimeout(req.timeoutTimer);
          req.resolve(frameData);

          this.processNextInQueue();
        }
      }
    } else {
      // Line-based text response: INFO {json}\n or OK\n or NOT_FOUND\n
      const newlineIdx = this.incomingBuffer.indexOf(10); // \n
      if (newlineIdx !== -1) {
        const line = this.incomingBuffer.slice(0, newlineIdx).toString("utf-8").trim();
        this.incomingBuffer = this.incomingBuffer.slice(newlineIdx + 1);

        const req = this.activeRequest;
        this.activeRequest = null;
        clearTimeout(req.timeoutTimer);

        if (req.type === "info") {
          try {
            const jsonText = line.startsWith("INFO ") ? line.slice(5) : line;
            const parsed = JSON.parse(jsonText);
            req.resolve(parsed);
          } catch (e) {
            req.reject(new Error("Failed to parse INFO response: " + line));
          }
        } else {
          // Command response (OK, NOT_FOUND, etc.)
          req.resolve({ success: line === "OK", message: line });
        }

        this.processNextInQueue();
      }
    }
  }

  private processNextInQueue(): void {
    if (this.activeRequest || this.requestQueue.length === 0) return;
    this.startChildProcess();

    if (!this.child || !this.child.stdin) {
      const next = this.requestQueue.shift();
      next?.reject(new Error("Screen capture service not running"));
      return;
    }

    const next = this.requestQueue.shift()!;
    this.activeRequest = next;
  }

  private sendCommand<T>(cmd: string, type: "info" | "shot" | "cmd", timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      this.startChildProcess();

      const timeoutTimer = setTimeout(() => {
        if (this.activeRequest === req) {
          this.activeRequest = null;
          this.incomingBuffer = Buffer.alloc(0);
          this.processNextInQueue();
        }
        reject(new Error(`Screen capture command timed out: ${cmd}`));
      }, timeoutMs);

      const req: PendingRequest = {
        type,
        resolve,
        reject,
        timeoutTimer,
      };

      if (!this.activeRequest && this.requestQueue.length === 0 && this.child?.stdin) {
        this.activeRequest = req;
        try {
          this.child.stdin.write(cmd + "\n");
        } catch (e) {
          clearTimeout(timeoutTimer);
          this.activeRequest = null;
          reject(e);
        }
      } else {
        this.requestQueue.push(req);
        // Write queued command when previous finishes
      }
    });
  }

  /**
   * Retrieves screen resolution and detected Antigravity window geometry.
   */
  public async getScreenInfo(): Promise<ScreenInfo> {
    try {
      return await this.sendCommand<ScreenInfo>("INFO", "info", 2500);
    } catch {
      return {
        screenWidth: 1920,
        screenHeight: 1080,
        antigravity: {
          found: false,
          hWnd: 0,
          title: "",
          rect: { left: 0, top: 0, width: 0, height: 0 },
        },
      };
    }
  }

  /**
   * Captures a single JPEG frame.
   */
  public async captureFrame(
    target: "desktop" | "antigravity" = "desktop",
    quality: number = 65,
    scale: number = 1.0
  ): Promise<Buffer> {
    const qualityClamped = Math.max(10, Math.min(quality, 95));
    const scaleClamped = Math.max(0.2, Math.min(1.0, scale));
    const cmd = `SHOT ${target} ${qualityClamped} ${scaleClamped.toFixed(2)}`;
    return await this.sendCommand<Buffer>(cmd, "shot", 2500);
  }

  /**
   * Injects remote touch, click, scroll, or text input to the PC.
   */
  public async injectInput(event: ScreenInputEvent): Promise<{ success: boolean; message?: string }> {
    if (event.type === "click" || event.type === "right_click" || event.type === "double_click") {
      const nx = event.normX ?? 0.5;
      const ny = event.normY ?? 0.5;
      const btn = event.type === "right_click" ? "right" : event.type === "double_click" ? "double" : "left";
      return await this.sendCommand<{ success: boolean; message?: string }>(
        `CLICK ${nx.toFixed(4)} ${ny.toFixed(4)} ${btn}`,
        "cmd",
        1500
      );
    }

    if (event.type === "scroll") {
      const nx = event.normX ?? 0.5;
      const ny = event.normY ?? 0.5;
      const delta = event.deltaY ?? -120;
      return await this.sendCommand<{ success: boolean; message?: string }>(
        `SCROLL ${nx.toFixed(4)} ${ny.toFixed(4)} ${delta}`,
        "cmd",
        1500
      );
    }

    if (event.type === "text" && event.text) {
      const b64 = Buffer.from(event.text, "utf-8").toString("base64");
      return await this.sendCommand<{ success: boolean; message?: string }>(`TEXT ${b64}`, "cmd", 2000);
    }

    if (event.type === "focus") {
      return await this.sendCommand<{ success: boolean; message?: string }>("FOCUS", "cmd", 1500);
    }

    return { success: false, message: "Unknown input type" };
  }

  /**
   * Registers an HTTP response stream for continuous MJPEG streaming.
   * Returns an unregister cleanup function.
   */
  public addStreamClient(
    res: http.ServerResponse,
    target: "desktop" | "antigravity" = "antigravity",
    fps: number = 10,
    quality: number = 60,
    scale: number = 0.75
  ): () => void {
    const clientEntry = { res, target, quality, scale };
    this.activeStreams.add(clientEntry);

    // Write initial MJPEG headers
    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=--frame",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "close",
      Pragma: "no-cache",
    });

    // Start streaming loop if not already running
    this.ensureStreamLoop(fps);

    const cleanup = () => {
      this.activeStreams.delete(clientEntry);
      if (this.activeStreams.size === 0 && this.streamTimer) {
        clearInterval(this.streamTimer);
        this.streamTimer = null;
      }
    };

    res.on("close", cleanup);
    res.on("error", cleanup);

    return cleanup;
  }

  private ensureStreamLoop(fps: number = 10): void {
    if (this.streamTimer) return;

    const intervalMs = Math.max(50, Math.round(1000 / Math.max(1, Math.min(20, fps))));

    this.streamTimer = setInterval(async () => {
      if (this.activeStreams.size === 0) {
        if (this.streamTimer) {
          clearInterval(this.streamTimer);
          this.streamTimer = null;
        }
        return;
      }

      // Capture single frame
      const firstClient = Array.from(this.activeStreams)[0];
      const target = firstClient?.target || "antigravity";
      const quality = firstClient?.quality || 60;
      const scale = firstClient?.scale || 0.75;

      try {
        const frame = await this.captureFrame(target, quality, scale);
        if (!frame || frame.length === 0) return;

        this.lastCachedFrame = frame;
        this.lastCachedTime = Date.now();

        const frameHeader = Buffer.from(
          `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
        );
        const frameFooter = Buffer.from("\r\n");

        for (const client of this.activeStreams) {
          try {
            if (!client.res.writableEnded) {
              client.res.write(frameHeader);
              client.res.write(frame);
              client.res.write(frameFooter);
            }
          } catch {
            this.activeStreams.delete(client);
          }
        }
      } catch (err) {
        // Drop frame on error / timeout
      }
    }, intervalMs);
  }

  public dispose(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }

    for (const client of this.activeStreams) {
      try {
        client.res.end();
      } catch {}
    }
    this.activeStreams.clear();

    if (this.child) {
      try {
        this.child.stdin?.write("QUIT\n");
        this.child.kill();
      } catch {}
      this.child = null;
    }
  }
}
