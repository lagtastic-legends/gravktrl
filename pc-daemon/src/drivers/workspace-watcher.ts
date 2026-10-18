import * as fs from "node:fs";
import * as path from "node:path";

export interface FileChangeEvent {
  file: string; // Relative path from workspace root
  action: "created" | "modified" | "deleted";
  size?: number;
  timestamp: string;
}

export class WorkspaceWatcher {
  private activeWorkspace: string;
  private watcher: fs.FSWatcher | null = null;
  private changeListeners: Array<(event: FileChangeEvent) => void> = [];
  private recentHistory: FileChangeEvent[] = [];
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();
  private maxHistory: number = 50;

  private ignoredPatterns: RegExp[] = [
    /[\\/]\.git([\\/]|$)/,
    /[\\/]node_modules([\\/]|$)/,
    /[\\/]\.next([\\/]|$)/,
    /[\\/]out([\\/]|$)/,
    /[\\/]dist([\\/]|$)/,
    /[\\/]build([\\/]|$)/,
    /[\\/]\.antigravity([\\/]|$)/,
    /[\\/]\.turbo([\\/]|$)/,
    /[\\/]\.gradle([\\/]|$)/,
    /[\\/]android[\\/]app[\\/]build([\\/]|$)/,
    /[\\/]\.gravktrl-auth\.json$/,
    /\.tmp$/,
    /~$/,
  ];

  constructor(initialWorkspace: string) {
    this.activeWorkspace = path.resolve(initialWorkspace);
    this.startWatching();
  }

  public onFileChange(listener: (event: FileChangeEvent) => void): void {
    this.changeListeners.push(listener);
  }

  public getRecentHistory(): FileChangeEvent[] {
    return [...this.recentHistory];
  }

  public setWorkspace(newWorkspace: string): void {
    const resolved = path.resolve(newWorkspace);
    if (this.activeWorkspace === resolved && this.watcher) {
      return;
    }
    this.activeWorkspace = resolved;
    this.startWatching();
  }

  public getActiveWorkspace(): string {
    return this.activeWorkspace;
  }

  private isIgnored(filePath: string): boolean {
    for (const pattern of this.ignoredPatterns) {
      if (pattern.test(filePath)) {
        return true;
      }
    }
    return false;
  }

  private startWatching(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }

    if (!fs.existsSync(this.activeWorkspace)) {
      return;
    }

    try {
      this.watcher = fs.watch(
        this.activeWorkspace,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(this.activeWorkspace, filename);
          if (this.isIgnored(fullPath) || this.isIgnored(filename)) {
            return;
          }

          // Debounce rapid events on the same file
          const existingTimer = this.debounceMap.get(fullPath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          this.debounceMap.set(
            fullPath,
            setTimeout(() => {
              this.debounceMap.delete(fullPath);
              this.handleFileEvent(filename, fullPath);
            }, 150)
          );
        }
      );

      console.log(`[WorkspaceWatcher] Live file monitoring active on: ${this.activeWorkspace}`);
    } catch (err) {
      console.warn(`[WorkspaceWatcher] Could not start recursive watcher on ${this.activeWorkspace}:`, err);
    }
  }

  private handleFileEvent(relativeFile: string, fullPath: string): void {
    try {
      const exists = fs.existsSync(fullPath);
      let action: "created" | "modified" | "deleted" = "modified";
      let size: number | undefined;

      if (!exists) {
        action = "deleted";
      } else {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          return; // Skip directories, only track file edits
        }
        size = stats.size;
        // Check if seen before in history
        const hadPrevious = this.recentHistory.some((h) => h.file === relativeFile);
        action = hadPrevious ? "modified" : "created";
      }

      const event: FileChangeEvent = {
        file: relativeFile.replace(/\\/g, "/"),
        action,
        size,
        timestamp: new Date().toISOString(),
      };

      // Push to history
      this.recentHistory.unshift(event);
      if (this.recentHistory.length > this.maxHistory) {
        this.recentHistory.pop();
      }

      // Notify listeners
      for (const listener of this.changeListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("[WorkspaceWatcher] Listener error:", err);
        }
      }
    } catch {
      // Ignore transient file lock errors
    }
  }

  public stop(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
    for (const timer of this.debounceMap.values()) {
      clearTimeout(timer);
    }
    this.debounceMap.clear();
  }
}
