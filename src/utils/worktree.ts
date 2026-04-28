import * as path from "node:path";
import { detectWorktreeContextRaw, type WorktreeContext } from "../hooks/worktree-helper.js";

export type { WorktreeContext };

export function detectWorktreeContext(projectDir?: string): WorktreeContext {
  const dir = path.resolve(projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  try {
    return detectWorktreeContextRaw(dir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not a git repository") || msg.includes("ENOENT")) {
      return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch: "" };
    }
    throw err;
  }
}
