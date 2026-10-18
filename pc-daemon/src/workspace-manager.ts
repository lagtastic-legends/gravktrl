import * as fs from "node:fs";
import * as path from "node:path";

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  isGitRepo: boolean;
  isCurrent: boolean;
  lastAccessed: string;
}

interface WorkspaceConfig {
  activeWorkspace: string;
  workspaces: Array<{
    id: string;
    name: string;
    path: string;
    lastAccessed: string;
  }>;
}

const WORKSPACE_FILE_NAME = ".gravktrl-workspaces.json";

export class WorkspaceManager {
  private configFilePath: string;
  private activeWorkspace: string;
  private bookmarks: Map<string, { id: string; name: string; path: string; lastAccessed: string }> = new Map();

  constructor(defaultBaseDir: string = process.cwd()) {
    this.configFilePath = path.join(defaultBaseDir, WORKSPACE_FILE_NAME);
    this.activeWorkspace = path.resolve(defaultBaseDir);
    this.loadWorkspaces();
  }

  private loadWorkspaces(): void {
    const defaultCandidates = [
      this.activeWorkspace,
      "C:\\Users\\devra\\Downloads\\omni-tool",
      "C:\\Users\\devra\\Downloads\\gravktrl",
    ];

    if (fs.existsSync(this.configFilePath)) {
      try {
        const raw = fs.readFileSync(this.configFilePath, "utf-8");
        const parsed = JSON.parse(raw) as WorkspaceConfig;
        if (parsed.activeWorkspace && fs.existsSync(parsed.activeWorkspace)) {
          this.activeWorkspace = path.resolve(parsed.activeWorkspace);
        }

        if (Array.isArray(parsed.workspaces)) {
          for (const ws of parsed.workspaces) {
            const resolved = path.resolve(ws.path);
            this.bookmarks.set(resolved.toLowerCase(), {
              id: ws.id || Buffer.from(resolved).toString("base64url").slice(0, 10),
              name: ws.name || path.basename(resolved),
              path: resolved,
              lastAccessed: ws.lastAccessed || new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn("[WorkspaceManager] Failed to read workspace config:", err);
      }
    }

    // Ensure candidate workspaces are added if they exist on disk
    for (const candidate of defaultCandidates) {
      const resolved = path.resolve(candidate);
      const key = resolved.toLowerCase();
      if (!this.bookmarks.has(key) && fs.existsSync(resolved)) {
        this.bookmarks.set(key, {
          id: Buffer.from(resolved).toString("base64url").slice(0, 10),
          name: path.basename(resolved),
          path: resolved,
          lastAccessed: new Date().toISOString(),
        });
      }
    }

    this.saveWorkspaces();
  }

  private saveWorkspaces(): void {
    const config: WorkspaceConfig = {
      activeWorkspace: this.activeWorkspace,
      workspaces: Array.from(this.bookmarks.values()),
    };

    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
    } catch (err) {
      console.error("[WorkspaceManager] Failed to write workspace config:", err);
    }
  }

  public getActiveWorkspace(): string {
    return this.activeWorkspace;
  }

  public listWorkspaces(): WorkspaceItem[] {
    const items: WorkspaceItem[] = [];

    for (const ws of this.bookmarks.values()) {
      const exists = fs.existsSync(ws.path);
      let isGitRepo = false;
      if (exists) {
        try {
          isGitRepo = fs.existsSync(path.join(ws.path, ".git"));
        } catch {
          isGitRepo = false;
        }
      }

      items.push({
        id: ws.id,
        name: ws.name,
        path: ws.path,
        exists,
        isGitRepo,
        isCurrent: path.resolve(ws.path).toLowerCase() === this.activeWorkspace.toLowerCase(),
        lastAccessed: ws.lastAccessed,
      });
    }

    return items;
  }

  public addWorkspace(targetPath: string, customName?: string): WorkspaceItem {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolved}`);
    }

    const key = resolved.toLowerCase();
    const id = Buffer.from(resolved).toString("base64url").slice(0, 10);
    const name = customName?.trim() || path.basename(resolved);
    const item = {
      id,
      name,
      path: resolved,
      lastAccessed: new Date().toISOString(),
    };

    this.bookmarks.set(key, item);
    this.saveWorkspaces();

    return {
      ...item,
      exists: true,
      isGitRepo: fs.existsSync(path.join(resolved, ".git")),
      isCurrent: resolved.toLowerCase() === this.activeWorkspace.toLowerCase(),
    };
  }

  public switchWorkspace(targetPath: string): { success: boolean; activeWorkspace: string; error?: string } {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        activeWorkspace: this.activeWorkspace,
        error: `Directory does not exist: ${resolved}`,
      };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        success: false,
        activeWorkspace: this.activeWorkspace,
        error: `Path is not a directory: ${resolved}`,
      };
    }

    this.activeWorkspace = resolved;
    const key = resolved.toLowerCase();

    // If bookmark exists, update lastAccessed
    const existing = this.bookmarks.get(key);
    if (existing) {
      existing.lastAccessed = new Date().toISOString();
      this.bookmarks.set(key, existing);
    } else {
      this.bookmarks.set(key, {
        id: Buffer.from(resolved).toString("base64url").slice(0, 10),
        name: path.basename(resolved),
        path: resolved,
        lastAccessed: new Date().toISOString(),
      });
    }

    this.saveWorkspaces();
    console.log(`[WorkspaceManager] Switched active workspace to: ${this.activeWorkspace}`);

    return {
      success: true,
      activeWorkspace: this.activeWorkspace,
    };
  }

  public removeWorkspace(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    const key = resolved.toLowerCase();
    const deleted = this.bookmarks.delete(key);
    if (deleted) {
      this.saveWorkspaces();
    }
    return deleted;
  }
}
