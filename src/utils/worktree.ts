import * as path from "node:path";
import {
  detectWorktreeContextRaw,
  isMissingGitError,
  isNotARepoError,
  isTimeoutError,
  type WorktreeContext,
} from "../hooks/worktree-helper.js";

export type { WorktreeContext };

/**
 * Returns a safe non-worktree fallback for any of:
 *  - non-git directories (status 128)
 *  - git binary missing (ENOENT)
 *  - slow filesystem timeout (SIGTERM / ETIMEDOUT)
 *
 * Other errors are rethrown — they indicate something the caller probably
 * wants to surface (e.g., permission denied on the project directory).
 */
export function detectWorktreeContext(projectDir?: string): WorktreeContext {
  const dir = path.resolve(projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  try {
    return detectWorktreeContextRaw(dir);
  } catch (err) {
    if (isNotARepoError(err) || isMissingGitError(err) || isTimeoutError(err)) {
      return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, branch: "" };
    }
    throw err;
  }
}
