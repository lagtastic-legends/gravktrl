"use client";

import React, { useState, useEffect } from "react";
import { GitBranch, GitCommit, FolderGit2, FolderPlus, RefreshCw, FileText, Send, CheckCircle2, ChevronRight, X } from "lucide-react";
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
      setCommitResult(res.log || "Committed and pushed successfully!");
      setCommitMessage("");
      loadGitStatus();
    } catch (err: any) {
      setCommitResult(`Failed: ${err.message || String(err)}`);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f6f8fb] text-slate-800 overflow-y-auto p-3 space-y-4 select-text">
      {/* 1. Workspaces Section */}
      <div className="bg-white rounded-2xl p-4 shadow-neo-flat border border-white/60 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Project Workspaces</h2>
              <span className="text-[10px] text-slate-400 font-mono">Managed by PC Host Daemon</span>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-2.5 py-1 rounded-full bg-white shadow-neo-soft text-slate-700 hover:text-indigo-600 border border-white/80 transition-all flex items-center gap-1 text-[11px] font-bold active:shadow-neo-pressed"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>ADD PATH</span>
          </button>
        </div>

        {/* Workspace List */}
        <div className="space-y-2">
          {workspaces.map((ws) => {
            const isCur = ws.path.toLowerCase() === activeWorkspace.toLowerCase();
            return (
              <button
                key={ws.id}
                onClick={() => handleSwitchWorkspace(ws.path)}
                disabled={isSwitching}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between border ${
                  isCur
                    ? "bg-indigo-50 border-indigo-200/80 shadow-neo-soft"
                    : "bg-[#f8fafc] border-slate-200/60 shadow-sm hover:border-indigo-200"
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isCur ? "text-indigo-600" : "text-slate-400"
                    }`}
                  >
                    folder
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs text-slate-800 truncate">{ws.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 truncate">{ws.path}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isCur ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      ACTIVE
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Git Status & Diff Explorer */}
      <div className="bg-white rounded-2xl p-4 shadow-neo-flat border border-white/60 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 shadow-neo-soft flex items-center justify-center text-indigo-600">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Git Status</h2>
                {gitStatus && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono">
                    {gitStatus.branch}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">
                {gitStatus?.clean ? "Working tree clean" : "Uncommitted modifications detected"}
              </span>
            </div>
          </div>

          <button
            onClick={loadGitStatus}
            className="p-1.5 rounded-xl bg-white shadow-neo-soft border border-white/80 text-slate-600 hover:text-indigo-600 active:shadow-neo-pressed"
            title="Refresh Git Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Changed Files Chips */}
        {gitStatus && !gitStatus.clean && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Changed Files:</span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => loadDiff()}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold shrink-0 transition-all ${
                  selectedFile === undefined
                    ? "bg-indigo-600 text-white shadow-neo-soft"
                    : "bg-white shadow-neo-soft text-slate-700"
                }`}
              >
                ALL CHANGES
              </button>
              {gitStatus.modified.map((f) => (
                <button
                  key={f}
                  onClick={() => loadDiff(f)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono shrink-0 transition-all ${
                    selectedFile === f
                      ? "bg-indigo-600 text-white shadow-neo-soft"
                      : "bg-white shadow-neo-soft text-slate-700"
                  }`}
                >
                  <span className="text-amber-500 font-bold mr-1">M</span>
                  {f.split("/").pop()}
                </button>
              ))}
              {gitStatus.untracked.map((f) => (
                <button
                  key={f}
                  onClick={() => loadDiff(f)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono shrink-0 transition-all ${
                    selectedFile === f
                      ? "bg-indigo-600 text-white shadow-neo-soft"
                      : "bg-white shadow-neo-soft text-slate-700"
                  }`}
                >
                  <span className="text-emerald-500 font-bold mr-1">?</span>
                  {f.split("/").pop()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Diff Viewer Inset */}
        <div className="p-3 neo-well rounded-2xl max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed select-text">
          {isLoadingDiff ? (
            <div className="text-slate-400 text-center py-4">Generating diff...</div>
          ) : !diffContent || diffContent.trim() === "" ? (
            <div className="text-slate-400 text-center py-4">No git differences to display.</div>
          ) : (
            diffContent.split("\n").map((line, idx) => {
              const isAdd = line.startsWith("+") && !line.startsWith("+++");
              const isRem = line.startsWith("-") && !line.startsWith("---");
              const isHdr = line.startsWith("@@") || line.startsWith("diff");
              return (
                <div
                  key={idx}
                  className={`whitespace-pre-wrap ${
                    isAdd
                      ? "text-emerald-700 font-semibold"
                      : isRem
                      ? "text-rose-700 font-semibold"
                      : isHdr
                      ? "text-indigo-600 font-bold"
                      : "text-slate-700"
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
        </div>

        {/* 3. Commit & Push Form */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            One-Tap Commit &amp; Push
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message (e.g. feat: update mobile UI)..."
              className="flex-1 neo-well rounded-2xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            <button
              onClick={handleCommitAndPush}
              disabled={!commitMessage.trim() || isCommitting}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-neo-soft font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 hover:brightness-105 active:scale-95 transition-all"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>COMMIT</span>
            </button>
          </div>

          {commitResult && (
            <div className="p-2.5 rounded-xl neo-well font-mono text-[10px] text-slate-700 mt-1 whitespace-pre-wrap">
              {commitResult}
            </div>
          )}
        </div>
      </div>

      {/* Add Workspace Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-neo-flat border border-white/80 w-full max-w-md flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">Add Workspace Path</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-white shadow-neo-soft flex items-center justify-center text-slate-500 active:shadow-neo-pressed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter an absolute path to a project directory on your PC:
            </p>
            <input
              type="text"
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              placeholder="C:\Users\username\Projects\my-app"
              className="w-full neo-well rounded-2xl px-3.5 py-2 text-xs text-slate-800 font-mono focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-2 rounded-xl bg-white shadow-neo-soft text-slate-600 text-xs font-bold active:shadow-neo-pressed"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWorkspace}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white shadow-neo-soft text-xs font-bold active:scale-95"
              >
                Add Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
