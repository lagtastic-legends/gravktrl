"use client";

import React, { useState, useEffect } from "react";
import { GitBranch, GitCommit, FolderGit2, FolderPlus, RefreshCw, FileText, Send, CheckCircle2, ChevronRight } from "lucide-react";
import type { GravKtrlClient, WorkspaceItem, GitStatusData } from "../lib/gravktrl-client";

interface GitWorkspaceViewProps {
  client: GravKtrlClient;
  activeWorkspace: string;
  onWorkspaceSwitched: (newWorkspace: string) => void;
}

export const GitWorkspaceView: React.FC<GitWorkspaceViewProps> = ({
  client,
  activeWorkspace,
  onWorkspaceSwitched,
}) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [newPathInput, setNewPathInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Git state
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);
  const [diffContent, setDiffContent] = useState<string>("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  useEffect(() => {
    loadWorkspaces();
    loadGitStatus();
  }, [activeWorkspace]);

  const loadWorkspaces = async () => {
    try {
      const res = await client.listWorkspaces();
      setWorkspaces(res.workspaces || []);
    } catch (e) {
      console.error("Failed to load workspaces:", e);
    }
  };

  const loadGitStatus = async () => {
    try {
      const status = await client.getGitStatus();
      setGitStatus(status);
      loadDiff();
    } catch {
      setGitStatus(null);
    }
  };

  const loadDiff = async (file?: string) => {
    setIsLoadingDiff(true);
    try {
      const res = await client.getGitDiff(file);
      setDiffContent(res.diff);
      setSelectedFile(file);
    } catch {
      setDiffContent("Failed to load git diff.");
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleSwitchWorkspace = async (targetPath: string) => {
    if (targetPath.toLowerCase() === activeWorkspace.toLowerCase() || isSwitching) return;
    setIsSwitching(true);
    try {
      const res = await client.switchWorkspace(targetPath);
      if (res.success) {
        onWorkspaceSwitched(res.activeWorkspace);
      }
    } catch (e: any) {
      alert("Failed to switch workspace: " + (e.message || String(e)));
    } finally {
      setIsSwitching(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!newPathInput.trim()) return;
    try {
      await client.addWorkspace(newPathInput.trim());
      setNewPathInput("");
      setShowAddModal(false);
      loadWorkspaces();
    } catch (e: any) {
      alert("Failed to add workspace: " + (e.message || String(e)));
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim() || isCommitting) return;
    setIsCommitting(true);
    setCommitResult(null);

    try {
      const res = await client.gitCommitAndPush(commitMessage.trim());
      setCommitResult(res.log);
      if (res.success) {
        setCommitMessage("");
        loadGitStatus();
      }
    } catch (e: any) {
      setCommitResult("Error: " + (e.message || String(e)));
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#08090d] text-slate-100 select-text overflow-y-auto">
      {/* Workspace Switcher Bar */}
      <div className="p-3 bg-[#0d1117] border-b border-[#21262d]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <FolderGit2 className="w-4 h-4 text-cyan-400" />
            <span>PC Workspaces ({workspaces.length})</span>
          </div>

          <button
            onClick={() => setShowAddModal(!showAddModal)}
            className="p-1 px-2 rounded-lg bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-cyan-400 text-[11px] flex items-center gap-1 transition-colors"
          >
            <FolderPlus className="w-3 h-3" />
            Add Path
          </button>
        </div>

        {/* Workspace Pill Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {workspaces.map((ws) => {
            const isCurrent = ws.path.toLowerCase() === activeWorkspace.toLowerCase();
            return (
              <button
                key={ws.id}
                onClick={() => handleSwitchWorkspace(ws.path)}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 active:scale-95 ${
                  isCurrent
                    ? "bg-cyan-950/80 border-cyan-500/80 text-cyan-200 glow-cyan"
                    : "bg-[#161b22] border-[#30363d] text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isCurrent ? "bg-cyan-400" : "bg-slate-600"}`} />
                <span>{ws.name}</span>
              </button>
            );
          })}
        </div>

        {/* Add Workspace Modal Dropdown */}
        {showAddModal && (
          <div className="mt-2.5 p-2.5 bg-[#161b22] border border-[#30363d] rounded-xl flex items-center gap-2 animate-in fade-in">
            <input
              type="text"
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              placeholder="C:\Users\devra\Downloads\project..."
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              onClick={handleAddWorkspace}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Git Branch & Status Card */}
      <div className="p-3">
        <div className="p-3 bg-[#0d1117] border border-[#21262d] rounded-xl">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#21262d]">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-xs font-bold text-white">
                {gitStatus?.branch || "No Git repository"}
              </span>
            </div>

            <button
              onClick={loadGitStatus}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh git status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {gitStatus ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-amber-400">
                  Modified: <b>{gitStatus.modified.length}</b>
                </span>
                <span className="text-emerald-400">
                  Staged: <b>{gitStatus.staged.length}</b>
                </span>
                <span className="text-slate-400">
                  Untracked: <b>{gitStatus.untracked.length}</b>
                </span>
              </div>

              {/* Modified Files List */}
              <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
                {gitStatus.modified.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => loadDiff(f.replace(/^[AMD\s]+/, ""))}
                    className="w-full text-left px-2 py-1 rounded bg-[#161b22] hover:bg-[#21262d] text-amber-300 font-mono text-[11px] flex items-center justify-between"
                  >
                    <span className="truncate">{f}</span>
                    <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                  </button>
                ))}
                {gitStatus.untracked.map((f, i) => (
                  <div
                    key={"u-" + i}
                    className="px-2 py-1 rounded bg-[#161b22] text-slate-400 font-mono text-[11px]"
                  >
                    ? {f}
                  </div>
                ))}
                {gitStatus.clean && (
                  <div className="text-emerald-400 text-xs flex items-center gap-1.5 py-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Working tree is completely clean.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-1">
              Active workspace does not contain an initialized Git repo.
            </div>
          )}
        </div>
      </div>

      {/* Unified Diff Viewer */}
      <div className="px-3 flex-1 flex flex-col min-h-[160px]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            {selectedFile ? `Diff: ${selectedFile}` : "Unified Git Diff"}
          </span>
          {selectedFile && (
            <button
              onClick={() => loadDiff()}
              className="text-[11px] text-cyan-400 hover:underline"
            >
              Show All Changes
            </button>
          )}
        </div>

        <div className="flex-1 bg-[#050608] border border-[#21262d] rounded-xl p-3 font-mono text-[11px] overflow-auto max-h-56 leading-relaxed">
          {isLoadingDiff ? (
            <div className="text-slate-500 animate-pulse">Loading git diff...</div>
          ) : diffContent ? (
            diffContent.split("\n").map((line, idx) => {
              const isAdd = line.startsWith("+") && !line.startsWith("+++");
              const isDel = line.startsWith("-") && !line.startsWith("---");
              const isHeader = line.startsWith("@@") || line.startsWith("diff");

              return (
                <div
                  key={idx}
                  className={`whitespace-pre ${
                    isAdd
                      ? "text-emerald-400 bg-emerald-950/20"
                      : isDel
                      ? "text-rose-400 bg-rose-950/20"
                      : isHeader
                      ? "text-cyan-400 font-semibold"
                      : "text-slate-400"
                  }`}
                >
                  {line || " "}
                </div>
              );
            })
          ) : (
            <div className="text-slate-500">No diff to display.</div>
          )}
        </div>
      </div>

      {/* Commit & Push Dock */}
      <div className="p-3 bg-[#0d1117] border-t border-[#21262d] mt-3">
        <div className="space-y-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message (e.g. feat: integrate mobile bridge)..."
            className="w-full bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-sans"
          />

          <button
            onClick={handleCommitAndPush}
            disabled={!commitMessage.trim() || isCommitting}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all"
          >
            {isCommitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <GitCommit className="w-4 h-4" />
            )}
            <span>Stage, Commit & Push on PC</span>
          </button>

          {commitResult && (
            <div className="p-2 rounded bg-black/60 border border-[#21262d] font-mono text-[10px] text-slate-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
              {commitResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
