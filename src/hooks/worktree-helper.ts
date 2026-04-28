import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export type WorktreeId = string & { readonly __brand: "WorktreeId" };

export type WorktreeContext =
  | { isWorktree: false; mainRepoRoot: string; worktreePath: string; branch: string }
  | { isWorktree: true; mainRepoRoot: string; worktreePath: string; worktreeId: WorktreeId; branch: string };

// Capture stderr so we can classify errors by status/code, not by substring.
// Discarding stderr ("ignore") strips the only signal that distinguishes
// "not a repo" (status 128) from a missing binary (code ENOENT) from a
// transient failure.
const GIT_OPTS = {
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
  encoding: "utf-8" as const,
  timeout: 2000,
};

interface GitExecError extends Error {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  code?: string;
  stderr?: string | Buffer;
}

export function isNotARepoError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as GitExecError;
  return e.status === 128;
}

export function isMissingGitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as GitExecError;
  return e.code === "ENOENT";
}

export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as GitExecError;
  return e.signal === "SIGTERM" || e.code === "ETIMEDOUT";
}

export function detectWorktreeContextRaw(dir: string): WorktreeContext {
  const opts = { ...GIT_OPTS, cwd: dir };
  // Combine the two queries into one `git rev-parse` call (git supports it;
  // the result is two whitespace-separated lines). Cuts hook latency and the
  // worst-case timeout budget in half.
  const combined = execFileSync(
    "git",
    ["rev-parse", "--git-dir", "--git-common-dir"],
    opts,
  ).toString().trim().split(/\r?\n/);
  if (combined.length < 2) {
    throw new Error(`git rev-parse returned unexpected output: ${combined.join("|")}`);
  }
  const gitDir = path.resolve(dir, combined[0]);
  const commonGitDir = path.resolve(dir, combined[1]);
  const mainRepoRoot = path.resolve(path.dirname(commonGitDir));

  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts)
      .toString()
      .trim();
  } catch (branchErr) {
    // Detached HEAD or empty repo -> status 128 with a "HEAD" stderr.
    // Anything else is genuinely unexpected — surface it.
    if (!isNotARepoError(branchErr)) {
      const e = branchErr as GitExecError;
      const detail = (e.stderr ? e.stderr.toString() : e.message).trim();
      process.stderr.write(`OpenWolf: branch detection failed (${detail})\n`);
    }
  }

  if (gitDir === commonGitDir) {
    return { isWorktree: false, mainRepoRoot, worktreePath: dir, branch };
  }
  const worktreeId = crypto
    .createHash("sha256")
    .update(dir)
    .digest("hex")
    .slice(0, 8) as WorktreeId;
  return { isWorktree: true, mainRepoRoot, worktreePath: dir, worktreeId, branch };
}
