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
  // OPENWOLF_METADATA_DIR overrides default .wolf/ location (D-03)
  const envDir = process.env.OPENWOLF_METADATA_DIR;
  if (envDir && envDir.trim().length > 0) {
    // Reject relative paths — path.resolve would make them absolute from cwd,
    // but the user intent is ambiguous. Log warning and fall back to .wolf/.
    if (!path.isAbsolute(envDir.trim())) {
      process.stderr.write(
        `OpenWolf: OPENWOLF_METADATA_DIR must be an absolute path, got "${envDir.trim()}". Falling back to .wolf/\n`,
      );
    } else {
      return path.resolve(envDir.trim());
    }
  }
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

// Re-exported here so the barrel in shared.ts can re-export it as a type-only
// import without needing to inline the WorktreeContext interface. The barrel's
// `export type { WorktreeContext } from "./wolf-paths.js"` keeps type imports
// isolated under Node16 module resolution (RESEARCH.md Pitfall 6).
export type { WorktreeContext };
