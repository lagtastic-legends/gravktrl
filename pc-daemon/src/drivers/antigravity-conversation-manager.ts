import * as path from "node:path";
import * as fs from "node:fs";
import { execFile } from "node:child_process";

export interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  lastModified: string;
  relativeTime: string;
  isActive: boolean;
  stepCount: number;
  workspacePath?: string;
  projectName: string;
  projectId: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  workspacePath?: string;
  conversations: ConversationItem[];
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  thinking?: string;
  timestamp: string;
  stepIndex: number;
  status?: string;
}

export class AntigravityConversationManager {
  private antigravityDir: string;
  private dbPath: string;
  private activeConversationId: string | null = null;
  private activeWatchTimer: NodeJS.Timeout | null = null;
  private activeFileWatcher: fs.FSWatcher | null = null;
  private lastFileOffset: number = 0;
  private streamListeners: Array<(event: { conversationId: string; chunk: any }) => void> = [];

  constructor() {
    const userProfile = process.env.USERPROFILE || "C:\\Users\\devra";
    this.antigravityDir = path.join(userProfile, ".gemini", "antigravity");
    this.dbPath = path.join(this.antigravityDir, "conversation_summaries.db");
  }

  private getDatabase(): any {
    try {
      // Use built-in node:sqlite DatabaseSync
      const sqlite = require("node:sqlite");
      if (sqlite && sqlite.DatabaseSync && fs.existsSync(this.dbPath)) {
        return new sqlite.DatabaseSync(this.dbPath, { readOnly: true });
      }
    } catch (err) {
      console.warn("[ConvManager] SQLite init error:", err);
    }
    return null;
  }

  public getActiveConversationId(): string | null {
    if (!this.activeConversationId) {
      const list = this.listProjectsAndConversations();
      return list.activeConversationId;
    }
    return this.activeConversationId;
  }

  public formatRelativeTime(dateString: string): string {
    try {
      const then = new Date(dateString).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - then);
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      const diffMonth = Math.floor(diffDay / 30);

      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m`;
      if (diffHour < 24) return `${diffHour}h`;
      if (diffDay < 30) return `${diffDay}d`;
      return `${diffMonth}mo`;
    } catch {
      return "";
    }
  }

  public listProjectsAndConversations(): {
    projects: ProjectGroup[];
    activeConversationId: string | null;
  } {
    const db = this.getDatabase();
    if (!db) {
      return { projects: [], activeConversationId: this.activeConversationId };
    }

    try {
      const rows = db.prepare(`
        SELECT 
          conversation_id, 
          title, 
          preview, 
          workspace_uris, 
          project_id, 
          last_modified_time, 
          step_count
        FROM conversation_summaries
        WHERE (parent_conversation_id IS NULL OR parent_conversation_id = '')
          AND (nesting_depth = 0 OR nesting_depth IS NULL)
        ORDER BY last_modified_time DESC
      `).all() as Array<{
        conversation_id: string;
        title: string;
        preview: string;
        workspace_uris: string;
        project_id: string;
        last_modified_time: string;
        step_count: number;
      }>;

      // If activeConversationId is not set, select the latest modified one
      if (!this.activeConversationId && rows.length > 0) {
        this.activeConversationId = rows[0].conversation_id;
      }

      const projectMap = new Map<string, ProjectGroup>();

      for (const row of rows) {
        let projectName = "Conversations";
        let workspacePath: string | undefined = undefined;

        if (row.workspace_uris && row.workspace_uris.trim()) {
          try {
            const uris = JSON.parse(row.workspace_uris);
            if (Array.isArray(uris) && uris.length > 0 && uris[0]) {
              const decoded = decodeURIComponent(uris[0]).replace(/^file:\/\/\/?/, "");
              // Normalize windows path
              const normalized = decoded.replace(/\//g, "\\");
              workspacePath = normalized;
              projectName = path.basename(normalized);
            }
          } catch {
            projectName = "Conversations";
          }
        }

        if (row.project_id === "outside-of-project" || !workspacePath) {
          projectName = "Conversations";
        }

        const projectKey = row.project_id || projectName;

        if (!projectMap.has(projectKey)) {
          projectMap.set(projectKey, {
            id: projectKey,
            name: projectName,
            workspacePath,
            conversations: [],
          });
        }

        const cleanTitle = (row.title || row.preview || "Untitled Conversation").trim();
        const item: ConversationItem = {
          id: row.conversation_id,
          title: cleanTitle,
          preview: (row.preview || cleanTitle).trim(),
          lastModified: row.last_modified_time,
          relativeTime: this.formatRelativeTime(row.last_modified_time),
          isActive: row.conversation_id === this.activeConversationId,
          stepCount: row.step_count || 0,
          workspacePath,
          projectName,
          projectId: row.project_id,
        };

        projectMap.get(projectKey)!.conversations.push(item);
      }

      return {
        projects: Array.from(projectMap.values()),
        activeConversationId: this.activeConversationId,
      };
    } catch (err) {
      console.error("[ConvManager] Error listing conversations:", err);
      return { projects: [], activeConversationId: this.activeConversationId };
    }
  }

  public getConversationMessages(conversationId: string, limit = 50): ChatMessage[] {
    const transcriptPath = path.join(
      this.antigravityDir,
      "brain",
      conversationId,
      ".system_generated",
      "logs",
      "transcript.jsonl"
    );

    if (!fs.existsSync(transcriptPath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(transcriptPath, "utf8");
      const lines = raw.trim().split("\n");
      const messages: ChatMessage[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);

          // User message
          if (entry.type === "USER_INPUT" || entry.source === "USER_EXPLICIT") {
            let text = entry.content || "";
            const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (match) {
              text = match[1].trim();
            } else {
              text = text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "").trim();
            }

            if (text) {
              messages.push({
                id: `user-${entry.step_index}`,
                sender: "user",
                text,
                timestamp: entry.created_at || new Date().toISOString(),
                stepIndex: entry.step_index,
              });
            }
          }

          // Model / Agent message
          else if (entry.type === "PLANNER_RESPONSE" && entry.source === "MODEL") {
            const text = (entry.content || "").trim();
            const thinking = (entry.thinking || "").trim();

            if (text || thinking) {
              messages.push({
                id: `agent-${entry.step_index}`,
                sender: "agent",
                text,
                thinking,
                timestamp: entry.created_at || new Date().toISOString(),
                stepIndex: entry.step_index,
              });
            }
          }
        } catch {
          // ignore corrupted JSON lines
        }
      }

      return messages.slice(-limit);
    } catch (err) {
      console.error("[ConvManager] Error reading transcript:", err);
      return [];
    }
  }

  public onStream(listener: (event: { conversationId: string; chunk: any }) => void): void {
    this.streamListeners.push(listener);
  }

  private emitStream(event: { conversationId: string; chunk: any }): void {
    for (const listener of this.streamListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[ConvManager] Stream listener error:", err);
      }
    }
  }

  public setActiveConversation(conversationId: string): {
    success: boolean;
    conversationId: string;
    messages: ChatMessage[];
  } {
    this.activeConversationId = conversationId;
    this.startWatchingConversation(conversationId);
    const messages = this.getConversationMessages(conversationId);
    return {
      success: true,
      conversationId,
      messages,
    };
  }

  public startWatchingConversation(conversationId: string): void {
    // Clear existing watch
    if (this.activeWatchTimer) {
      clearInterval(this.activeWatchTimer);
      this.activeWatchTimer = null;
    }
    if (this.activeFileWatcher) {
      this.activeFileWatcher.close();
      this.activeFileWatcher = null;
    }

    const transcriptPath = path.join(
      this.antigravityDir,
      "brain",
      conversationId,
      ".system_generated",
      "logs",
      "transcript.jsonl"
    );

    if (!fs.existsSync(transcriptPath)) {
      this.lastFileOffset = 0;
    } else {
      try {
        const stat = fs.statSync(transcriptPath);
        this.lastFileOffset = stat.size;
      } catch {
        this.lastFileOffset = 0;
      }
    }

    const pollNewLines = () => {
      if (!fs.existsSync(transcriptPath)) return;
      try {
        const stat = fs.statSync(transcriptPath);
        if (stat.size <= this.lastFileOffset) {
          if (stat.size < this.lastFileOffset) {
            this.lastFileOffset = 0;
          }
          return;
        }

        const bytesToRead = stat.size - this.lastFileOffset;
        const buffer = Buffer.alloc(bytesToRead);
        const fd = fs.openSync(transcriptPath, "r");
        fs.readSync(fd, buffer, 0, bytesToRead, this.lastFileOffset);
        fs.closeSync(fd);

        this.lastFileOffset = stat.size;

        const newChunkText = buffer.toString("utf8");
        const lines = newChunkText.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "PLANNER_RESPONSE" && entry.source === "MODEL") {
              const text = entry.content || "";
              const thinking = entry.thinking || "";
              this.emitStream({
                conversationId,
                chunk: {
                  id: `agent-${entry.step_index}`,
                  sender: "agent",
                  text,
                  thinking,
                  status: thinking && !text ? "thinking" : "streaming",
                  isComplete: Boolean(text && !thinking),
                  stepIndex: entry.step_index,
                  timestamp: entry.created_at || new Date().toISOString(),
                },
              });
            } else if (entry.type === "USER_INPUT" || entry.source === "USER_EXPLICIT") {
              let text = entry.content || "";
              const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
              if (match) text = match[1].trim();
              this.emitStream({
                conversationId,
                chunk: {
                  id: `user-${entry.step_index}`,
                  sender: "user",
                  text,
                  isComplete: true,
                  stepIndex: entry.step_index,
                  timestamp: entry.created_at || new Date().toISOString(),
                },
              });
            }
          } catch {
            // ignore partial line parse
          }
        }
      } catch {
        // error reading file
      }
    };

    // Fast 350ms interval polling guarantees immediate responsive update on Windows
    this.activeWatchTimer = setInterval(pollNewLines, 350);

    try {
      this.activeFileWatcher = fs.watch(path.dirname(transcriptPath), (eventType, filename) => {
        if (filename && filename.includes("transcript")) {
          pollNewLines();
        }
      });
    } catch {
      // fallback to polling timer
    }
  }

  public async createNewConversation(
    projectId?: string,
    win32Bridge?: any
  ): Promise<{ success: boolean; conversationId?: string; message: string }> {
    if (process.platform === "win32") {
      try {
        const psScript = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32Helper {
              [DllImport("user32.dll")]
              [return: MarshalAs(UnmanagedType.Bool)]
              public static extern bool SetForegroundWindow(IntPtr hWnd);
              [DllImport("user32.dll")]
              public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            }
"@
          $p = Get-Process | Where-Object { 
            ($_.ProcessName -match "^(Antigravity|antigravity)$") -and ($_.MainWindowHandle -ne 0) 
          } | Select-Object -First 1

          if ($p) {
            $hWnd = $p.MainWindowHandle
            [Win32Helper]::ShowWindow($hWnd, 9)
            [Win32Helper]::SetForegroundWindow($hWnd)
            Start-Sleep -Milliseconds 250
            $wshell = New-Object -ComObject WScript.Shell
            # Open command palette and execute New Conversation
            $wshell.SendKeys("^+p")
            Start-Sleep -Milliseconds 300
            $wshell.SendKeys("New Conversation")
            Start-Sleep -Milliseconds 300
            $wshell.SendKeys("{ENTER}")
          }
        `;
        await new Promise((resolve) => {
          execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", psScript], { timeout: 4000 }, () => resolve(true));
        });
      } catch (e) {
        console.warn("[ConvManager] Win32 new conversation trigger error:", e);
      }
    }

    // Wait for Antigravity to create the conversation session in DB
    await new Promise((r) => setTimeout(r, 1200));
    const list = this.listProjectsAndConversations();
    if (list.projects.length > 0) {
      const topConv = list.projects[0]?.conversations[0];
      if (topConv) {
        this.setActiveConversation(topConv.id);
        return {
          success: true,
          conversationId: topConv.id,
          message: `Created / focused conversation "${topConv.title}"`,
        };
      }
    }

    return {
      success: true,
      conversationId: this.activeConversationId || undefined,
      message: "Ready for new conversation prompt",
    };
  }

  public dispose(): void {
    if (this.activeWatchTimer) {
      clearInterval(this.activeWatchTimer);
      this.activeWatchTimer = null;
    }
    if (this.activeFileWatcher) {
      this.activeFileWatcher.close();
      this.activeFileWatcher = null;
    }
  }
}
