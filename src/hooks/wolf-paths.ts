import * as path from "node:path";
import {
  detectWorktreeContextRaw,
  isMissingGitError,
  isNotARepoError,
  isTimeoutError,
  type WorktreeContext,
} from "./worktree-helper.js";

let _cachedWorktreeCtx: WorktreeContext | null = null;

function detectWorktreeContext(): WorktreeContext {
  if (_cachedWorktreeCtx) return _cachedWorktreeCtx;
  const dir = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  try {
    _cachedWorktreeCtx = detectWorktreeContextRaw(dir);
    return _cachedWorktreeCtx;
  } catch (err) {
    const classified =
      isNotARepoError(err) || isMissingGitError(err) || isTimeoutError(err);
    if (!classified) {
      const e = err as { stderr?: string | Buffer; message?: string };
      const detail = (e.stderr ? e.stderr.toString() : e.message ?? String(err)).trim();
      process.stderr.write(
        `OpenWolf: worktree detection failed (${detail}). Falling back to non-worktree mode.\n`,
      );
    }
    const fallback: WorktreeContext = {
      isWorktree: false,
      mainRepoRoot: dir,
      worktreePath: dir,
      branch: "",
    };
    // Cache classified failures so a broken-git project doesn't re-pay the
    // 2s timeout on every getWolfDir/getSessionDir call inside a single hook.
    // Unclassified errors stay uncached so a transient mid-process problem
    // can recover.
    if (classified) _cachedWorktreeCtx = fallback;
    return fallback;
  }
}

export function getWolfDir(): string {
  const ctx = detectWorktreeContext();
  return path.join(ctx.mainRepoRoot, ".wolf");
}

export function getSessionDir(): string {
  const ctx = detectWorktreeContext();
  if (!ctx.isWorktree) return getWolfDir();
  return path.join(getWolfDir(), "sessions", ctx.worktreeId);
}

export function getWorktreeContext(): WorktreeContext {
  return detectWorktreeContext();
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export type { WorktreeContext };
