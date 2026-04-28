import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { HOOK_SETTINGS, WOLF_ROOT_SHELL } from "./hook-settings.js";

describe("WOLF_ROOT_SHELL", () => {
  it("contains the absolute-path resolution sequence", () => {
    expect(WOLF_ROOT_SHELL).toContain('cd "$CLAUDE_PROJECT_DIR"');
    expect(WOLF_ROOT_SHELL).toContain("git rev-parse --git-common-dir");
    expect(WOLF_ROOT_SHELL).toContain("&& pwd");
    expect(WOLF_ROOT_SHELL).toContain('|| echo "$CLAUDE_PROJECT_DIR"');
  });

  it("resolves to an absolute path in a real main checkout", () => {
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

  it("renders absolute hook commands for every event", () => {
    const allCommands = [
      ...HOOK_SETTINGS.SessionStart,
      ...HOOK_SETTINGS.PreToolUse,
      ...HOOK_SETTINGS.PostToolUse,
      ...HOOK_SETTINGS.Stop,
    ].flatMap((entry) => entry.hooks.map((h) => h.command));
    for (const cmd of allCommands) {
      expect(cmd).toMatch(/git rev-parse.*--git-common-dir/);
      expect(cmd).toContain("&& pwd ");
      expect(cmd).toContain('node "$WOLF_ROOT/.wolf/hooks/');
    }
  });
});
