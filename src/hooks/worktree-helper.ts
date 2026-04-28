import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export type WorktreeContext =
  | { isWorktree: false; mainRepoRoot: string; worktreePath: string; branch: string }
  | { isWorktree: true; mainRepoRoot: string; worktreePath: string; worktreeId: string; branch: string };

export function detectWorktreeContextRaw(dir: string): WorktreeContext {
  const opts = { cwd: dir, stdio: ["pipe", "pipe", "ignore"] as ["pipe", "pipe", "ignore"], encoding: "utf-8" as const, timeout: 2000 };
  const gitDirRaw = execFileSync("git", ["rev-parse", "--git-dir"], opts).toString().trim();
  const commonGitDirRaw = execFileSync("git", ["rev-parse", "--git-common-dir"], opts).toString().trim();
  const gitDir = path.resolve(dir, gitDirRaw);
  const commonGitDir = path.resolve(dir, commonGitDirRaw);
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
    return { isWorktree: false, mainRepoRoot, worktreePath: dir, branch };
  }
  const worktreeId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
  return { isWorktree: true, mainRepoRoot, worktreePath: dir, worktreeId, branch };
}
