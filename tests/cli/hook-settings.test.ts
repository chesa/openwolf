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

  it("accepts a relative projectRoot without throwing (no longer baked in)", () => {
    expect(() => makeHookSettings("meep")).not.toThrow();
    expect(() => makeHookSettings("./meep")).not.toThrow();
  });

  it("throws when projectRoot contains a single quote", () => {
    expect(() => makeHookSettings("/Users/brian/it's-bad")).toThrow(/single-quote/);
    expect(() => makeHookSettings("meep's")).toThrow(/single-quote/);
  });

  it("accepts a normal absolute path without throwing", () => {
    expect(() => makeHookSettings("/Users/bfs/bitbucket/meep")).not.toThrow();
  });

  it("safely handles a path containing a double quote (no JS syntax break)", () => {
    // The generated command is now portable and does not embed projectRoot, so
    // exotic paths in the validation argument must not break command generation.
    const weird = path.join(tmpdir(), 'ow-dq"x');
    const cmd = makeHookSettings(weird).SessionStart[0].hooks[0].command;
    expect(cmd).not.toContain(weird);
    expect(cmd).toContain('node "$WOLF_ROOT/.wolf/hooks/session-start.js"');
  });
});

// ---------------------------------------------------------------------------
// makeHookSettings — generated command structure
// ---------------------------------------------------------------------------
describe("makeHookSettings generated commands", () => {
  const SAMPLE_ROOT = "/Users/bfs/bitbucket/meep";

  it("does NOT bake the project root into the generated command", () => {
    const settings = makeHookSettings(SAMPLE_ROOT);
    const cmd = settings.SessionStart[0].hooks[0].command;
    // No machine-specific absolute path should be committed into settings.json.
    expect(cmd).not.toContain(SAMPLE_ROOT);
    // The portable command resolves the root at runtime.
    expect(cmd).toContain("CLAUDE_PROJECT_DIR");
    expect(cmd).toContain("process.cwd()");
  });

  it("retains worktree support via git rev-parse --git-common-dir", () => {
    const settings = makeHookSettings(SAMPLE_ROOT);
    const cmd = settings.SessionStart[0].hooks[0].command;
    // Worktree-aware: git runs from the runtime-detected base to resolve the
    // main repo root for linked worktrees.
    expect(cmd).toContain("git rev-parse --git-common-dir");
    expect(cmd).toContain("cwd: base");
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

  it("different projectRoots produce identical portable commands", () => {
    const cmdA = makeHookSettings("/a/b/c").SessionStart[0].hooks[0].command;
    const cmdB = makeHookSettings("/x/y/z").SessionStart[0].hooks[0].command;
    expect(cmdA).toBe(cmdB);
    expect(cmdA).not.toContain("/a/b/c");
    expect(cmdB).not.toContain("/x/y/z");
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
          // this proves CLAUDE_PROJECT_DIR, not process CWD, drives resolution.
          cwd: tmpdir(),
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

      // Run the portable shell snippet with an explicit process cwd
      // (simulating the hook's actual execution environment).
      const wolfRoot = (cpd: string | undefined, runFrom: string) => {
        const settings = makeHookSettings("/ignored-by-portable-command");
        const wolfRootShell = settings.SessionStart[0].hooks[0].command
          .split(" && node ")[0];
        const env = cpd ? { ...process.env, CLAUDE_PROJECT_DIR: cpd } : ENV_WITHOUT_CPD;
        return execFileSync("bash", ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`], {
          cwd: runFrom,
          env,
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

        // Main checkout resolves to itself via absolute CLAUDE_PROJECT_DIR,
        // from any process cwd.
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
    "absolute CLAUDE_PROJECT_DIR drives resolution even from an unrelated cwd",
    () => {
      // The portable command must not rely on process.cwd() when an absolute
      // CLAUDE_PROJECT_DIR is available.
      const dir = realpathSync(
        mkdtempSync(path.join(tmpdir(), "openwolf-portable-cpd-"))
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

        const settings = makeHookSettings("/ignored-in-portable-command");
        const wolfRootShell = settings.SessionStart[0].hooks[0].command
          .split(" && node ")[0];

        // Simulate a hook fired from an unrelated cwd, but with an absolute
        // CLAUDE_PROJECT_DIR pointing at the real project.
        const elsewhere = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-elsewhere-")));
        const out = execFileSync(
          "bash",
          ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`],
          {
            cwd: elsewhere,
            env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
            encoding: "utf-8",
          }
        ).trim();

        expect(out).toBe(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(!HAS_GIT)(
    "falls back to process.cwd() when CLAUDE_PROJECT_DIR is relative or missing",
    () => {
      // When CLAUDE_PROJECT_DIR is not absolute, the portable command falls
      // back to process.cwd(). This test documents the fallback behavior.
      const dir = realpathSync(
        mkdtempSync(path.join(tmpdir(), "openwolf-portable-cwd-"))
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

        const settings = makeHookSettings("/ignored-in-portable-command");
        const wolfRootShell = settings.SessionStart[0].hooks[0].command
          .split(" && node ")[0];

        const out = execFileSync(
          "bash",
          ["-c", `${wolfRootShell} && echo "$WOLF_ROOT"`],
          {
            cwd: dir,
            env: { ...process.env, CLAUDE_PROJECT_DIR: "relative-meep" },
            encoding: "utf-8",
          }
        ).trim();

        expect(out).toBe(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
