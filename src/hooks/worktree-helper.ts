import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export interface WorktreeContext {
  isWorktree: boolean;
  mainRepoRoot: string;
  worktreePath: string;
  sessionId: string;
  branch: string;
}

export function detectWorktreeContextRaw(dir: string): WorktreeContext {
  const opts = { cwd: dir, stdio: ["pipe", "pipe", "ignore"] as ["pipe", "pipe", "ignore"], encoding: "utf-8" as const, timeout: 500 };
  const gitDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], opts).toString().trim();
  const commonGitDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], opts).toString().trim();
  const mainRepoRoot = path.resolve(path.dirname(commonGitDir));
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts).toString().trim();
  } catch (branchErr) {
    const msg = branchErr instanceof Error ? branchErr.message : String(branchErr);
    if (!msg.includes("HEAD") && !msg.includes("unknown revision")) {
      process.stderr.write(`OpenWolf: branch detection failed (${msg})\n`);
    }
  }
  if (gitDir === commonGitDir) {
    return { isWorktree: false, mainRepoRoot, worktreePath: dir, sessionId: "", branch };
  }
  const sessionId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
  return { isWorktree: true, mainRepoRoot, worktreePath: dir, sessionId, branch };
}
