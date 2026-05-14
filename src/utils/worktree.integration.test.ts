// Real filesystem, real `git` binary, no module mocks. Lives outside
// worktree.test.ts so vi.mock("node:child_process") in that file does not
// leak into this one.
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { detectWorktreeContext } from "./worktree.js";

const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!HAS_GIT)("detectWorktreeContext (integration)", () => {
  it("returns non-worktree fallback for a real non-git directory", () => {
    // realpathSync canonicalizes macOS /var/folders → /private/var/folders
    const dir = realpathSync(
      mkdtempSync(path.join(tmpdir(), "openwolf-nogit-")),
    );
    try {
      const result = detectWorktreeContext(dir);
      expect(result.isWorktree).toBe(false);
      expect(result.mainRepoRoot).toBe(path.resolve(dir));
      expect(result.branch).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns non-worktree context for a real main checkout", () => {
    const dir = realpathSync(
      mkdtempSync(path.join(tmpdir(), "openwolf-main-")),
    );
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      execFileSync(
        "git",
        ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "init", "-q"],
        {
          cwd: dir,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        },
      );
      const result = detectWorktreeContext(dir);
      expect(result.isWorktree).toBe(false);
      expect(result.branch).toBe("main");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns worktree context for a real linked worktree", () => {
    const dir = realpathSync(
      mkdtempSync(path.join(tmpdir(), "openwolf-wt-")),
    );
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      execFileSync(
        "git",
        ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "init", "-q"],
        {
          cwd: dir,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        },
      );
      const wtPath = path.join(dir, "..", `${path.basename(dir)}-feat`);
      execFileSync(
        "git",
        ["worktree", "add", "-b", "feat", wtPath, "HEAD"],
        { cwd: dir },
      );
      try {
        const result = detectWorktreeContext(wtPath);
        expect(result.isWorktree).toBe(true);
        if (!result.isWorktree) throw new Error("guard");
        expect(result.mainRepoRoot).toBe(path.resolve(dir));
        expect(result.branch).toBe("feat");
        expect(result.worktreeId).toHaveLength(8);
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
