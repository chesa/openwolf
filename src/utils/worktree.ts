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
    const commonGitDir = execGit(
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
    );
    const mainRepoRoot = path.resolve(path.dirname(commonGitDir));
    let branch = "";
    try {
      branch = execGit(
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
      );
    } catch {}
    if (mainRepoRoot === dir) {
      return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch };
    }
    const sessionId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
    return { isWorktree: true, mainRepoRoot, worktreePath: dir, sessionId, branch };
  } catch {
    return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch: "" };
  }
}
