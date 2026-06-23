import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { HOOK_SETTINGS, WOLF_ROOT_SHELL } from "../../src/cli/hook-settings.js";

const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("WOLF_ROOT_SHELL", () => {
  it("resolves git relative to CLAUDE_PROJECT_DIR, not the process cwd", () => {
    expect(WOLF_ROOT_SHELL).toContain("git rev-parse --git-common-dir");
    expect(WOLF_ROOT_SHELL).toContain("CLAUDE_PROJECT_DIR");
    // The fix: git runs WITH cwd:base so the shell matches the JS resolver
    // (detectWorktreeContext runs git from CLAUDE_PROJECT_DIR too).
    expect(WOLF_ROOT_SHELL).toContain("cwd: base");
    expect(WOLF_ROOT_SHELL).toContain("path.resolve(base");
  });

  it.skipIf(!HAS_GIT)("resolves to an absolute path in a real main checkout", () => {
    // Resolve symlinks up front so that both the shell `pwd -P` and the
    // Node.js path agree on the canonical form (macOS /var → /private/var).
    const dir = realpathSync(
      mkdtempSync(path.join(tmpdir(), "openwolf-hook-settings-"))
    );
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      execFileSync(
        "git",
        [
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--allow-empty",
          "-m",
          "init",
          "-q",
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        }
      );

      const out = execFileSync(
        "bash",
        ["-c", `${WOLF_ROOT_SHELL} && echo "$WOLF_ROOT"`],
        {
          cwd: dir,
          env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
          encoding: "utf-8",
        }
      ).trim();

      const real = execFileSync(
        "bash",
        ["-c", `cd "${dir}" && pwd -P`],
        { encoding: "utf-8" }
      ).trim();
      expect(out).toBe(real);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!HAS_GIT)(
    "resolves a linked worktree to the MAIN repo root, independent of process cwd",
    () => {
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
      };
      const git = (args: string[], cwd: string) =>
        execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf-8" });
      // Run the baked-in shell snippet exactly as a hook would, with an
      // explicit CLAUDE_PROJECT_DIR and an explicit process cwd.
      const wolfRoot = (projectDir: string, runFrom: string) =>
        execFileSync("bash", ["-c", `${WOLF_ROOT_SHELL} && echo "$WOLF_ROOT"`], {
          cwd: runFrom,
          env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
          encoding: "utf-8",
        }).trim();

      const main = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-wt-main-")));
      const wtParent = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-wt-link-")));
      const wt = path.join(wtParent, "feature");
      const elsewhere = realpathSync(tmpdir());
      try {
        git(["init", "-q"], main);
        git(["commit", "--allow-empty", "-m", "init", "-q"], main);
        git(["worktree", "add", "-q", wt], main);

        // Main checkout resolves to itself, from any process cwd.
        expect(wolfRoot(main, main)).toBe(main);
        expect(wolfRoot(main, elsewhere)).toBe(main);

        // A linked worktree resolves to the MAIN repo root — and crucially does
        // so even when the hook process cwd is somewhere unrelated. This is the
        // exact shell-vs-JS divergence the cwd:base fix closes; with the old
        // snippet (git in process cwd) this assertion fails.
        expect(wolfRoot(wt, wt)).toBe(main);
        expect(wolfRoot(wt, elsewhere)).toBe(main);
      } finally {
        try { git(["worktree", "remove", "--force", wt], main); } catch { /* best effort */ }
        rmSync(main, { recursive: true, force: true });
        rmSync(wtParent, { recursive: true, force: true });
      }
    }
  );

  it("renders absolute hook commands for every event", () => {
    const allCommands = [
      ...HOOK_SETTINGS.SessionStart,
      ...HOOK_SETTINGS.PreToolUse,
      ...HOOK_SETTINGS.PostToolUse,
      ...HOOK_SETTINGS.Stop,
    ].flatMap((entry) => entry.hooks.map((h) => h.command));
    for (const cmd of allCommands) {
      expect(cmd).toMatch(/git rev-parse.*--git-common-dir/);
      expect(cmd).toContain('node "$WOLF_ROOT/.wolf/hooks/');
    }
  });
});