import { execFile } from "node:child_process";
import type { GitDriver } from "../server.js";

function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || "",
        stderr: stderr || "",
        code: err ? (err.code as number) || 1 : 0,
      });
    });
  });
}

export class GitEngineDriver implements GitDriver {
  public async getStatus(cwd: string): Promise<{
    branch: string;
    clean: boolean;
    modified: string[];
    untracked: string[];
    staged: string[];
  }> {
    // Current branch
    const branchRes = await runGit(["branch", "--show-current"], cwd);
    const branch = branchRes.stdout.trim() || "HEAD (detached)";

    // Status porcelain
    const statusRes = await runGit(["status", "--porcelain=v1"], cwd);
    const lines = statusRes.stdout.split("\n").filter((l) => l.trim().length > 0);

    const modified: string[] = [];
    const untracked: string[] = [];
    const staged: string[] = [];

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const filePath = line.slice(3).trim();

      if (x === "?" && y === "?") {
        untracked.push(filePath);
      } else {
        if (x !== " " && x !== "?") {
          staged.push(`${x} ${filePath}`);
        }
        if (y !== " " && y !== "?") {
          modified.push(`${y} ${filePath}`);
        }
      }
    }

    const clean = modified.length === 0 && untracked.length === 0 && staged.length === 0;

    return {
      branch,
      clean,
      modified,
      untracked,
      staged,
    };
  }

  public async getDiff(cwd: string, file?: string): Promise<{ diff: string }> {
    const args = ["diff"];
    if (file) {
      args.push("--", file);
    }

    const diffRes = await runGit(args, cwd);

    // Also include staged diff if regular diff is empty
    if (!diffRes.stdout.trim()) {
      const stagedArgs = ["diff", "--cached"];
      if (file) stagedArgs.push("--", file);
      const stagedDiff = await runGit(stagedArgs, cwd);
      return { diff: stagedDiff.stdout || "No changes detected." };
    }

    return { diff: diffRes.stdout };
  }

  public async commitAndPush(cwd: string, message: string): Promise<{ success: boolean; log: string }> {
    const logs: string[] = [];

    // 1. Stage all changes
    logs.push("> git add -A");
    const addRes = await runGit(["add", "-A"], cwd);
    if (addRes.stderr) logs.push(addRes.stderr.trim());

    // 2. Commit
    logs.push(`> git commit -m "${message}"`);
    const commitRes = await runGit(["commit", "-m", message], cwd);
    logs.push(commitRes.stdout.trim());
    if (commitRes.stderr) logs.push(commitRes.stderr.trim());

    if (commitRes.code !== 0 && !commitRes.stdout.includes("nothing to commit")) {
      return {
        success: false,
        log: logs.join("\n"),
      };
    }

    // 3. Push to current branch
    logs.push("> git push");
    const pushRes = await runGit(["push"], cwd);
    if (pushRes.stdout) logs.push(pushRes.stdout.trim());
    if (pushRes.stderr) logs.push(pushRes.stderr.trim());

    const success = pushRes.code === 0;

    return {
      success,
      log: logs.join("\n"),
    };
  }
}
