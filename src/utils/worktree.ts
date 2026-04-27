import * as path from "node:path";
import * as crypto from "node:crypto";
import { execGit } from "./git-wrapper.js";

export interface WorktreeContext {
  isWorktree: boolean;
  mainRepoRoot: string;
  worktreePath: string;
  sessionId: string;
  branch: string;
}

export function detectWorktreeContext(projectDir?: string): WorktreeContext {
  const dir = path.resolve(projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  try {
    const opts = { cwd: dir, stdio: ["pipe", "pipe", "ignore"] as ["pipe", "pipe", "ignore"], encoding: "utf-8" as const, timeout: 500 };
    const gitDir = execGit(["rev-parse", "--path-format=absolute", "--git-dir"], opts);
    const commonGitDir = execGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], opts);
    const mainRepoRoot = path.resolve(path.dirname(commonGitDir));
    let branch = "";
    try {
      branch = execGit(["rev-parse", "--abbrev-ref", "HEAD"], opts);
    } catch {}
    if (gitDir === commonGitDir) {
      return { isWorktree: false, mainRepoRoot, worktreePath: dir, sessionId: "", branch };
    }
    const sessionId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
    return { isWorktree: true, mainRepoRoot, worktreePath: dir, sessionId, branch };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("not a git repository") && !msg.includes("ENOENT")) {
      console.warn(`OpenWolf: worktree detection failed (${msg}). Falling back to non-worktree mode.`);
    }
    return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch: "" };
  }
}
