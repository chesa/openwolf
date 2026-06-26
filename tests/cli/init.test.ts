import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { findProjectRoot } from "../../src/scanner/project-root.js";
import { detectWorktreeContext } from "../../src/utils/worktree.js";
import type { WorktreeId } from "../../src/hooks/worktree-helper.js";
import { makeHookSettings, isOpenWolfHook, replaceOpenWolfHooks } from "../../src/cli/hook-settings.js";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { initCommand, findMissingTemplates, checkRootGitIgnore } from "../../src/cli/init.js";

vi.mock("../../src/scanner/project-root.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/scanner/project-root.js")>();
  return { ...mod, findProjectRoot: vi.fn() };
});

vi.mock("../../src/utils/worktree.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/utils/worktree.js")>();
  return { ...mod, detectWorktreeContext: vi.fn() };
});

vi.mock("node:fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:fs")>();
  return { ...mod, existsSync: vi.fn() };
});

// A fixed test project root used wherever tests need a concrete HOOK_SETTINGS
// value. Must be absolute and single-quote-free.
const TEST_PROJECT_ROOT = "/Users/test/project";
const HOOK_SETTINGS = makeHookSettings(TEST_PROJECT_ROOT);

// ---------------------------------------------------------------------------
// isOpenWolfHook
// ---------------------------------------------------------------------------
describe("isOpenWolfHook", () => {
  it("returns true for hooks referencing .wolf/hooks/", () => {
    expect(
      isOpenWolfHook({
        type: "command",
        command: 'node "$CLAUDE_PROJECT_DIR/.wolf/hooks/session-start.js"',
      })
    ).toBe(true);
  });

  it("returns true regardless of extra properties", () => {
    expect(
      isOpenWolfHook({
        type: "command",
        command: 'node "$CLAUDE_PROJECT_DIR/.wolf/hooks/stop.js"',
        timeout: 10,
      })
    ).toBe(true);
  });

  it("returns false for non-OpenWolf hooks", () => {
    expect(
      isOpenWolfHook({ type: "command", command: "echo hello" })
    ).toBe(false);
  });

  it("returns false for hooks with unrelated paths", () => {
    expect(
      isOpenWolfHook({
        type: "command",
        command: 'node "/usr/local/bin/my-hook.js"',
      })
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isOpenWolfHook(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isOpenWolfHook(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isOpenWolfHook("string")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isOpenWolfHook(42)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isOpenWolfHook({})).toBe(false);
  });

  it("returns false when command is not a string", () => {
    expect(isOpenWolfHook({ command: 123 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// replaceOpenWolfHooks
// ---------------------------------------------------------------------------
describe("replaceOpenWolfHooks", () => {
  it("creates hooks key when settings has no hooks", () => {
    const result = replaceOpenWolfHooks({}, HOOK_SETTINGS);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks).toBeDefined();
    expect(hooks.SessionStart).toHaveLength(HOOK_SETTINGS.SessionStart.length);
    expect(hooks.PreToolUse).toHaveLength(HOOK_SETTINGS.PreToolUse.length);
    expect(hooks.PostToolUse).toHaveLength(HOOK_SETTINGS.PostToolUse.length);
    expect(hooks.Stop).toHaveLength(HOOK_SETTINGS.Stop.length);
  });

  it("replaces existing OpenWolf hooks on upgrade", () => {
    const existing = {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command:
                  'node "$CLAUDE_PROJECT_DIR/.wolf/hooks/session-start.js"',
                timeout: 3,
              },
            ],
          },
        ],
      },
    };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    const hooks = result.hooks as Record<
      string,
      Array<{ hooks: Array<{ timeout: number }> }>
    >;
    // Old hook (timeout 3) should be replaced with the new one (timeout 5)
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionStart[0].hooks[0].timeout).toBe(
      HOOK_SETTINGS.SessionStart[0].hooks[0].timeout
    );
  });

  it("preserves non-OpenWolf user hooks", () => {
    const existing = {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo custom-hook" }],
          },
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command:
                  'node "$CLAUDE_PROJECT_DIR/.wolf/hooks/session-start.js"',
                timeout: 3,
              },
            ],
          },
        ],
      },
    };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    const hooks = result.hooks as Record<
      string,
      Array<{ hooks: Array<{ command: string }> }>
    >;
    // OpenWolf (1 entry) + user (1 entry) = 2
    expect(hooks.SessionStart).toHaveLength(2);
    // OpenWolf hooks come first, user hooks after
    expect(hooks.SessionStart[0].hooks[0].command).toContain(".wolf/hooks/");
    expect(hooks.SessionStart[1].hooks[0].command).toBe("echo custom-hook");
  });

  it("preserves non-hooks settings keys", () => {
    const existing = {
      permissions: { allow: ["Bash"] },
      hooks: {},
    };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    expect(
      (result as Record<string, unknown>).permissions
    ).toEqual({ allow: ["Bash"] });
  });

  it("handles empty hooks object", () => {
    const existing = { hooks: {} };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(HOOK_SETTINGS.SessionStart.length);
    expect(hooks.Stop).toHaveLength(HOOK_SETTINGS.Stop.length);
  });

  it("handles null hooks value", () => {
    const existing = { hooks: null };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(HOOK_SETTINGS.SessionStart.length);
  });

  it("does not duplicate OpenWolf hooks on repeated calls", () => {
    let result = replaceOpenWolfHooks({}, HOOK_SETTINGS);
    result = replaceOpenWolfHooks(
      result as Record<string, unknown>,
      HOOK_SETTINGS
    );
    const hooks = result.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(HOOK_SETTINGS.SessionStart.length);
    expect(hooks.Stop).toHaveLength(HOOK_SETTINGS.Stop.length);
  });

  it("preserves multiple user hooks across different events", () => {
    const existing = {
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo start-hook" }],
          },
        ],
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo stop-hook" }],
          },
        ],
      },
    };
    const result = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    const hooks = result.hooks as Record<
      string,
      Array<{ hooks: Array<{ command: string }> }>
    >;
    // Each event: OpenWolf entries + 1 user entry
    expect(hooks.SessionStart).toHaveLength(
      HOOK_SETTINGS.SessionStart.length + 1
    );
    expect(hooks.Stop).toHaveLength(HOOK_SETTINGS.Stop.length + 1);
    // User hooks are appended after OpenWolf hooks
    const lastStart = hooks.SessionStart[hooks.SessionStart.length - 1];
    expect(lastStart.hooks[0].command).toBe("echo start-hook");
    const lastStop = hooks.Stop[hooks.Stop.length - 1];
    expect(lastStop.hooks[0].command).toBe("echo stop-hook");
  });

  it("does not mutate the original settings object", () => {
    const existing = {
      permissions: { allow: ["Bash"] },
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo custom" }],
          },
        ],
      },
    };
    const before = JSON.stringify(existing);
    replaceOpenWolfHooks(existing, HOOK_SETTINGS);
    expect(JSON.stringify(existing)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// hook-file copy list
// ---------------------------------------------------------------------------
describe("hook-file copy list", () => {
  it("discovers all .js files and filters out non-js files", async () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-hook-copy-")));
    try {
      writeFileSync(path.join(dir, "shared.js"), "");
      writeFileSync(path.join(dir, "worktree-helper.js"), "");
      writeFileSync(path.join(dir, "not-a-hook.txt"), ""); // excluded by .endsWith(".js")

      const { getHookFileNames } = await import("../../src/cli/hook-copy.js");
      const files = getHookFileNames(dir);

      expect(files).toContain("shared.js");
      expect(files).toContain("worktree-helper.js");
      expect(files).not.toContain("not-a-hook.txt");
      expect(files.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// findMissingTemplates — guards against a broken/incomplete package (the
// npm-pack template-stripping bug that produced a silently crippled .wolf/).
// ---------------------------------------------------------------------------
describe("findMissingTemplates", () => {
  // The full set of required source templates (mirrors init.ts: ALWAYS_OVERWRITE
  // + CREATE_IF_MISSING, minus the two runtime-created files with no template).
  const REQUIRED = [
    "OPENWOLF.md", "reframe-frameworks.md", "wolf-gitignore",
    "config.json", "identity.md", "cerebrum.md", "memory.md", "anatomy.md",
    "token-ledger.json", "buglog.ndjson", "cron-manifest.json", "cron-state.json",
  ];

  it("reports required templates absent from the directory", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-tmpl-")));
    try {
      writeFileSync(path.join(dir, "OPENWOLF.md"), "");
      writeFileSync(path.join(dir, "cerebrum.md"), "");
      const missing = findMissingTemplates(dir);
      expect(missing).toContain("wolf-gitignore");
      expect(missing).toContain("buglog.ndjson");
      expect(missing).toContain("anatomy.md");
      expect(missing).not.toContain("OPENWOLF.md");
      expect(missing).not.toContain("cerebrum.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty when every required template is present", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-tmpl-")));
    try {
      for (const f of REQUIRED) writeFileSync(path.join(dir, f), "");
      expect(findMissingTemplates(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not flag runtime-created files that have no template", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-tmpl-")));
    try {
      // Complete required set present; the two runtime files intentionally absent.
      for (const f of REQUIRED) writeFileSync(path.join(dir, f), "");
      const missing = findMissingTemplates(dir);
      expect(missing).not.toContain("designqc-report.json");
      expect(missing).not.toContain("suggestions.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports all required templates missing when the dir does not exist", () => {
    const missing = findMissingTemplates(path.join(tmpdir(), "openwolf-nope-xyz-12345"));
    expect(missing).toContain("OPENWOLF.md");
    expect(missing).toContain("wolf-gitignore");
    expect(missing).not.toContain("designqc-report.json");
  });
});

// ---------------------------------------------------------------------------
// initCommand worktree guard
// ---------------------------------------------------------------------------
describe("initCommand worktree guard", () => {
  const setupExitSpy = () => {
    return vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
      throw new Error(`exit:${code}`);
    });
  };

  it("exits gracefully when running in a worktree with existing .wolf", async () => {
    vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
    vi.mocked(detectWorktreeContext).mockReturnValue({
      isWorktree: true,
      mainRepoRoot: "/fake/main",
      worktreePath: "/fake/project",
      worktreeId: "abc123" as WorktreeId,
      branch: "feature/test",
    });
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p === "/fake/main/.wolf") return true;
      return false;
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = setupExitSpy();

    await expect(initCommand()).rejects.toThrow("exit:0");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("already initialized"));

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("errors when running in a worktree without existing .wolf", async () => {
    vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
    vi.mocked(detectWorktreeContext).mockReturnValue({
      isWorktree: true,
      mainRepoRoot: "/fake/main",
      worktreePath: "/fake/project",
      worktreeId: "abc123" as WorktreeId,
      branch: "feature/test",
    });
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p === "/fake/main/.wolf") return false;
      return false;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = setupExitSpy();

    await expect(initCommand()).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("main checkout"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// wolf-gitignore template content — D-09-01 through D-09-06
// Reads the real template file and asserts its corrected authored-vs-derived
// structure. These assertions MUST fail (RED) before Task 2 rewrites the
// template, proving they test real behavior.
// ---------------------------------------------------------------------------
describe("wolf-gitignore template content (D-09-01 through D-09-06)", () => {
  // Resolve the real template from src/templates/ relative to this test file.
  // ESM: use fileURLToPath(import.meta.url) — mirrors init.ts line 11 pattern.
  // (new URL(...).pathname breaks on Windows; fileURLToPath handles all platforms.)
  const templatePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/templates/wolf-gitignore"
  );

  // Read once at describe scope; wrap in try/catch so a missing file surfaces
  // as assertion failures, not a thrown import error.
  let content: string;
  try {
    content = fs.readFileSync(templatePath, "utf-8");
  } catch {
    content = "";
  }

  // D-09-02: compiled hooks/ is derived build output — must be an active rule
  it("has an active ignore rule for hooks/ (D-09-02)", () => {
    expect(content).toMatch(/^hooks\/$/m);
  });

  // D-09-02: the corrected template must NOT list bare `hooks/` in a comment
  // (the old false "ARE committed" comment had `#   hooks/  — compiled scripts`)
  // Uses /^#\s+hooks\// to match `# hooks/` or `#   hooks/` but NOT `.wolf/hooks/`
  // mentions in prose comments (those are valid advisory examples, not false claims).
  it("does NOT list bare hooks/ in a comment line (D-09-02)", () => {
    expect(content).not.toMatch(/^#\s+hooks\//m);
  });

  // D-09-03: legacy buglog.json must be an active ignore rule
  it("has an active ignore rule for buglog.json (D-09-03)", () => {
    expect(content).toMatch(/^buglog\.json$/m);
  });

  // D-09-03: buglog.ndjson is authored/committed — must NOT be an active rule
  it("does NOT have an active ignore rule for buglog.ndjson (D-09-03)", () => {
    expect(content).not.toMatch(/^buglog\.ndjson$/m);
  });

  // D-09-06: cerebrum-freshness.json line reserved for Phase 12 (R9)
  it("has an active ignore rule for cerebrum-freshness.json (D-09-06)", () => {
    expect(content).toMatch(/^cerebrum-freshness\.json$/m);
  });

  // D-09-05: STATUS.md was falsely listed as "ARE committed" — must be removed
  it("does NOT mention STATUS.md anywhere in the template (D-09-05)", () => {
    expect(content).not.toMatch(/STATUS\.md/);
  });
});

// ---------------------------------------------------------------------------
// checkRootGitIgnore advisory — D-09-09
// Tests the extended advisory that warns on both the blanket `.wolf/` rule
// and `.wolf/`-prefixed path overrides in a consumer repo's root .gitignore.
// ---------------------------------------------------------------------------
describe("checkRootGitIgnore advisory (D-09-09)", () => {
  // Each test creates a real tmpdir, writes a .gitignore, calls the function,
  // and asserts on console.log spy output. Uses real fs (the vi.mock only
  // overrides existsSync, not readFileSync).

  it("still warns when root .gitignore contains the blanket .wolf/ line", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-advisory-")));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      writeFileSync(path.join(dir, ".gitignore"), ".wolf/\n");
      checkRootGitIgnore(dir);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(".wolf/")
      );
    } finally {
      logSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("warns on a .wolf/-prefixed path rule even without the blanket .wolf/ line (D-09-09)", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-advisory-")));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // .wolf/hooks/ is the acme_translators regression vector — no blanket .wolf/
      writeFileSync(path.join(dir, ".gitignore"), ".wolf/hooks/\n");
      checkRootGitIgnore(dir);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(".wolf/-prefixed path rule")
      );
    } finally {
      logSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("logs nothing when root .gitignore has no .wolf references", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-advisory-")));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n*.log\n");
      checkRootGitIgnore(dir);
      // No advisory should fire
      const wolfCalls = logSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes(".wolf")
      );
      expect(wolfCalls).toHaveLength(0);
    } finally {
      logSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("logs nothing and does not throw when no .gitignore exists", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-advisory-")));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // No .gitignore written — function must catch the ENOENT silently
      expect(() => checkRootGitIgnore(dir)).not.toThrow();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});