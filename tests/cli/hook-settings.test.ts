import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { makeHookSettings } from "../../src/cli/hook-settings.js";

const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// process.env with CLAUDE_PROJECT_DIR removed (not set to the string
// "undefined"). Proves the baked-in path drives resolution without the env var.
const ENV_WITHOUT_CPD: NodeJS.ProcessEnv = { ...process.env };
delete ENV_WITHOUT_CPD.CLAUDE_PROJECT_DIR;

// ---------------------------------------------------------------------------
// makeHookSettings — validation
// ---------------------------------------------------------------------------
describe("makeHookSettings validation", () => {
  it("throws when projectRoot is empty", () => {
    expect(() => makeHookSettings("")).toThrow(/non-empty/);
  });

  it("throws when projectRoot is relative (re-introduces the MODULE_NOT_FOUND bug)", () => {
    expect(() => makeHookSettings("meep")).toThrow(/absolute/);
    expect(() => makeHookSettings("./meep")).toThrow(/absolute/);
  });

  it("throws when projectRoot contains a single quote", () => {
    expect(() => makeHookSettings("/Users/brian/it's-bad")).toThrow(/single-quote/);
  });

  it("accepts a normal absolute path without throwing", () => {
    expect(() => makeHookSettings("/Users/bfs/bitbucket/meep")).not.toThrow();
  });

  it("safely embeds a path containing a double quote (no JS syntax break)", () => {
    // A double-quote in the path must not break the `const base = "..."` literal.
    const weird = path.join(tmpdir(), 'ow-dq"x');
    const wolfRootShell = makeHookSettings(weird).SessionStart[0].hooks[0].command
      .split(" && node ")[0];
    // The dir does not exist → git fails → catch → console.log(base). If the
    // generated JS were malformed, node would error and WOLF_ROOT would be empty.
    const out = execFileSync("bash", ["-c", `${wolfRootShell} && printf '%s' "$WOLF_ROOT"`], {
      cwd: tmpdir(),
      encoding: "utf-8",
    });
    expect(out).toBe(weird);
  });
});

// ---------------------------------------------------------------------------
// makeHookSettings — generated command structure
// ---------------------------------------------------------------------------
describe("makeHookSettings generated commands", () => {
  const SAMPLE_ROOT = "/Users/bfs/bitbucket/meep";

  it("bakes the absolute project root into the generated command", () => {
    const settings = makeHookSettings(SAMPLE_ROOT);
    const cmd = settings.SessionStart[0].hooks[0].command;
    // The baked root must appear literally in the command string.
    expect(cmd).toContain(SAMPLE_ROOT);
    // CLAUDE_PROJECT_DIR must NOT appear in the generated command —
    // that is the runtime env var whose relative value caused the bug.
    expect(cmd).not.toContain("CLAUDE_PROJECT_DIR");
    // process.cwd() must not be called at hook runtime either.
    expect(cmd).not.toContain("process.cwd()");
  });

  it("retains worktree support via git rev-parse --git-common-dir", () => {
    const settings = makeHookSettings(SAMPLE_ROOT);
    const cmd = settings.SessionStart[0].hooks[0].command;
    // Worktree-aware: git still runs to resolve main repo root for
    // linked worktrees. The fix only removes the *runtime* env var
    // dependency — git cwd is now the baked-in absolute root.
    expect(cmd).toContain("git rev-parse --git-common-dir");
    expect(cmd).toContain("cwd: base");
    expect(cmd).toContain(`const base = "${SAMPLE_ROOT}"`);
  });

  it("renders hook commands that invoke node with WOLF_ROOT", () => {
    const settings = makeHookSettings(SAMPLE_ROOT);
    const allCommands = [
      ...settings.SessionStart,
      ...settings.PreToolUse,
      ...settings.PostToolUse,
      ...settings.Stop,
    ].flatMap((entry) => entry.hooks.map((h) => h.command));
    for (const cmd of allCommands) {
      expect(cmd).toContain('node "$WOLF_ROOT/.wolf/hooks/');
    }
  });

  it("different projectRoots produce different commands", () => {
    const cmdA = makeHookSettings("/a/b/c").SessionStart[0].hooks[0].command;
    const cmdB = makeHookSettings("/x/y/z").SessionStart[0].hooks[0].command;
    expect(cmdA).not.toBe(cmdB);
    expect(cmdA).toContain("/a/b/c");
    expect(cmdB).toContain("/x/y/z");
  });
});

// ---------------------------------------------------------------------------
// Runtime shell execution — WOLF_ROOT resolves correctly
// ---------------------------------------------------------------------------
describe("generated WOLF_ROOT shell snippet", () => {
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

      const settings = makeHookSettings(dir);
      // Extract just the WOLF_ROOT assignment portion (everything before " &&")
      const wolfRootShell = settings.SessionStart[0].hooks[0].command
        .split(" && node ")[0];

      const out = execFileSync(
        "bash",
        ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`],
        {
          // Hook CWD is deliberately set to an unrelated directory —
          // this proves the baked-in path, not process CWD, drives resolution.
          cwd: tmpdir(),
          // CLAUDE_PROJECT_DIR is intentionally NOT set —
          // the fix must not rely on it at all.
          env: ENV_WITHOUT_CPD,
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

      // Run the baked-in shell snippet with an explicit process cwd
      // (simulating the hook's actual execution environment).
      const wolfRoot = (bakedRoot: string, runFrom: string) => {
        const settings = makeHookSettings(bakedRoot);
        const wolfRootShell = settings.SessionStart[0].hooks[0].command
          .split(" && node ")[0];
        return execFileSync("bash", ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`], {
          cwd: runFrom,
          // No CLAUDE_PROJECT_DIR — the fix must not rely on it.
          env: ENV_WITHOUT_CPD,
          encoding: "utf-8",
        }).trim();
      };

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

        // A linked worktree resolves to the MAIN repo root — and crucially
        // does so even when the hook process cwd is somewhere unrelated.
        // This is the worktree-shared-wolf feature.
        expect(wolfRoot(wt, wt)).toBe(main);
        expect(wolfRoot(wt, elsewhere)).toBe(main);
      } finally {
        try { git(["worktree", "remove", "--force", wt], main); } catch { /* best effort */ }
        rmSync(main, { recursive: true, force: true });
        rmSync(wtParent, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(!HAS_GIT)(
    "reproduce-gone check: relative CLAUDE_PROJECT_DIR cannot misroute the hook",
    () => {
      // This test directly demonstrates the fix for the bug reported in
      // debug session openwolf-hook-module-missing.
      //
      // Bug scenario: Claude Code sets CLAUDE_PROJECT_DIR="meep" (a bare relative
      // name). The OLD runtime shim used `process.env.CLAUDE_PROJECT_DIR || cwd()`
      // as base, which resolved "meep" against ~/.claude/hooks/ → wrong path.
      //
      // With the fix: the base is the BAKED-IN absolute path. CLAUDE_PROJECT_DIR
      // is never read at runtime, so a relative value is irrelevant.
      const dir = realpathSync(
        mkdtempSync(path.join(tmpdir(), "openwolf-repro-gone-"))
      );
      try {
        execFileSync("git", ["init", "-q"], { cwd: dir });
        execFileSync("git", ["-c", "commit.gpgsign=false", "commit",
          "--allow-empty", "-m", "init", "-q"], {
          cwd: dir,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
          },
        });

        const settings = makeHookSettings(dir);
        const wolfRootShell = settings.SessionStart[0].hooks[0].command
          .split(" && node ")[0];

        // Simulate the exact failing condition:
        // - process cwd is ~/.claude/hooks/ (not the project)
        // - CLAUDE_PROJECT_DIR is "meep" (relative, the bug trigger)
        const hooksCwd = path.join(process.env.HOME ?? "/tmp", ".claude", "hooks");
        const out = execFileSync(
          "bash",
          ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`],
          {
            cwd: hooksCwd,
            env: { ...process.env, CLAUDE_PROJECT_DIR: "meep" },
            encoding: "utf-8",
          }
        ).trim();

        // With the fix, WOLF_ROOT is the baked-in absolute project root —
        // NOT ~/.claude/hooks/meep or any other relative-anchored path.
        expect(out).toBe(dir);
        expect(out).not.toContain("/.claude/hooks/");
        expect(out).not.toContain("meep");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
