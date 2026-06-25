/**
 * hook-settings.ts
 *
 * Canonical Claude Code hook registration for OpenWolf.
 * Both `openwolf init` and `openwolf update` write these entries into
 * .claude/settings.json. Keep this file as the single source of truth —
 * drift between init and update silently broke worktree-aware commands
 * in PR #25.
 */

import * as path from "node:path";

// ---------------------------------------------------------------------------
// makeWolfRootShell — bake the project root at generation time
// ---------------------------------------------------------------------------
//
// Strategy: embed the KNOWN-ABSOLUTE project root directly into the generated
// shell snippet so that runtime CLAUDE_PROJECT_DIR is never consulted.
//
// This eliminates the MODULE_NOT_FOUND bug where Claude Code supplied a bare
// relative project name (e.g. "meep") as CLAUDE_PROJECT_DIR, causing
// path.resolve() to anchor against the hook process CWD
// (~/.claude/hooks/) rather than the project directory.
//
// Worktree support is preserved: git rev-parse --git-common-dir still runs,
// but it now runs with cwd set to the BAKED-IN absolute root (not a runtime-
// detected value), so linked worktrees correctly resolve to the main repo
// root — independent of both CLAUDE_PROJECT_DIR and process CWD.
//
// `--git-common-dir` returns ".git" (relative) for a main checkout and an
// absolute path for a linked worktree; path.resolve(bakedRoot, gitDir, "..")
// yields the main repo root in both cases.
//
// Falls back to the baked root on any failure (non-git dir, missing git).
//
// Single-quote safety: the baked path is embedded inside a node -e string
// wrapped in shell single quotes. A path containing ' would break the shell
// parser. Callers MUST validate the path via validateProjectRoot() before
// calling this function (makeHookSettings() does this automatically).
function makeWolfRootShell(projectRoot: string): string {
  // projectRoot is validated (no single quotes) before this is called, keeping
  // it safe inside the shell single-quoted node -e string. JSON.stringify then
  // produces a properly escaped JS string literal, so an embedded double-quote
  // or backslash in the path cannot break out of `const base = ...`.
  const baseLiteral = JSON.stringify(projectRoot);
  return (
    `WOLF_ROOT=$(node -e 'const path = require("path"); ` +
    `const { execSync } = require("child_process"); ` +
    `const base = ${baseLiteral}; ` +
    `try { const gitDir = execSync("git rev-parse --git-common-dir", ` +
    `{ cwd: base, stdio: "pipe" }).toString().trim(); ` +
    `console.log(path.resolve(base, gitDir, "..")); } ` +
    `catch (e) { console.log(base); }')`
  );
}

// ---------------------------------------------------------------------------
// validateProjectRoot — fail fast at generation time
// ---------------------------------------------------------------------------
//
// A project root containing a single-quote (') would break the shell-quoted
// node -e string produced by makeWolfRootShell. It must also be ABSOLUTE: the
// whole point of baking the root in is that WOLF_ROOT resolves the same no
// matter the hook's runtime cwd — a relative root would re-introduce the exact
// MODULE_NOT_FOUND bug this fix closes (path.resolve anchoring it against
// ~/.claude/hooks/). Validate both before embedding.
function validateProjectRoot(projectRoot: string): void {
  if (!projectRoot || projectRoot.trim().length === 0) {
    throw new Error(
      `OpenWolf: projectRoot must be a non-empty string (got ${JSON.stringify(projectRoot)})`
    );
  }
  if (!path.isAbsolute(projectRoot)) {
    throw new Error(
      `OpenWolf: projectRoot must be an absolute path so the generated hook ` +
      `command resolves independently of the hook's runtime cwd. ` +
      `Path: ${projectRoot}`
    );
  }
  if (projectRoot.includes("'")) {
    throw new Error(
      `OpenWolf: projectRoot contains a single-quote character which cannot be ` +
      `safely embedded in the generated hook command. ` +
      `Path: ${projectRoot}`
    );
  }
}

// ---------------------------------------------------------------------------
// makeHookSettings — factory that bakes projectRoot at generation time
// ---------------------------------------------------------------------------
//
// Returns the Claude Code hook configuration with absolute paths baked in.
// Call this from `openwolf init` and `openwolf update` — never use a
// static HOOK_SETTINGS constant, which would rely on runtime env vars.
//
// @param projectRoot - Absolute path to the project root directory.
//   Must not contain single-quote characters (validated here, throws if violated).
export function makeHookSettings(projectRoot: string) {
  validateProjectRoot(projectRoot);

  const wolfRootShell = makeWolfRootShell(projectRoot);

  const hookCmd = (script: string): string =>
    `${wolfRootShell} && node "$WOLF_ROOT/.wolf/hooks/${script}"`;

  return {
    SessionStart: [
      {
        matcher: "",
        hooks: [{
          type: "command",
          command: hookCmd("session-start.js"),
          timeout: 5,
          _managedBy: "openwolf",
        }],
      },
    ],
    PreToolUse: [
      {
        matcher: "Read",
        hooks: [{
          type: "command",
          command: hookCmd("pre-read.js"),
          timeout: 5,
          _managedBy: "openwolf",
        }],
      },
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [{
          type: "command",
          command: hookCmd("pre-write.js"),
          timeout: 5,
          _managedBy: "openwolf",
        }],
      },
    ],
    PostToolUse: [
      {
        matcher: "Read",
        hooks: [{
          type: "command",
          command: hookCmd("post-read.js"),
          timeout: 5,
          _managedBy: "openwolf",
        }],
      },
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [{
          type: "command",
          command: hookCmd("post-write.js"),
          timeout: 10,
          _managedBy: "openwolf",
        }],
      },
    ],
    Stop: [
      {
        matcher: "",
        hooks: [{
          type: "command",
          command: hookCmd("stop.js"),
          timeout: 10,
          _managedBy: "openwolf",
        }],
      },
    ],
  };
}

// NOTE: `_managedBy` is NOT a documented Claude Code field. It is an
// empirically observed passthrough — Claude Code preserves unknown fields
// in settings.json during its own read/write cycles as of the versions
// tested. If a future Claude Code release performs schema-validated
// serialization and strips unknown fields, `_managedBy` will silently
// disappear and identification will fall back to the `.wolf/hooks/`
// substring match in `isOpenWolfHook`. Monitor for unexpected hook
// re-registration or spurious duplicate entries as a symptom of this.

// HOOK_FILES (static file list) removed in v0 — dynamic discovery via
// hook-copy.ts getHookFileNames() replaced it.

/**
 * Returns true if a hook entry was registered by OpenWolf.
 *
 * Primary check: `_managedBy === "openwolf"` (set on every hook object
 * written by this module). Fallback: `.wolf/hooks/` path substring, for
 * backward compatibility with pre-tag installs that predate this field.
 */
export function isOpenWolfHook(hook: unknown): boolean {
  if (typeof hook !== "object" || hook === null) return false;
  const h = hook as Record<string, unknown>;
  if (h._managedBy === "openwolf") return true;
  if (typeof h.command === "string" && h.command.includes(".wolf/hooks/")) return true;
  return false;
}

/**
 * Replace OpenWolf hooks in an existing settings object while preserving
 * any user-added hooks that are NOT OpenWolf hooks.
 */
export function replaceOpenWolfHooks(
  existing: Record<string, unknown>,
  newHooks: ReturnType<typeof makeHookSettings>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  const existingHooks = (typeof existing.hooks === "object" && existing.hooks !== null)
    ? { ...(existing.hooks as Record<string, unknown>) }
    : {};

  for (const event of Object.keys(newHooks) as Array<keyof ReturnType<typeof makeHookSettings>>) {
    const existing_entries = Array.isArray(existingHooks[event])
      ? (existingHooks[event] as unknown[])
      : [];
    // Keep non-OpenWolf entries the user may have added.
    //
    // ASSUMPTION: OpenWolf writes exactly one inner hook per outer matcher
    // entry. Co-locating a user-defined command inside the same outer entry
    // as an OpenWolf hook is unsupported — the entire outer entry is dropped
    // and replaced if *any* inner hook matches `isOpenWolfHook`. Users who
    // need custom hooks for the same event should add a separate outer
    // matcher entry in settings.json.
    const userEntries = existing_entries.filter((entry) => {
      if (typeof entry !== "object" || entry === null) return true;
      const e = entry as Record<string, unknown>;
      const hooks = Array.isArray(e.hooks) ? e.hooks : [];
      return !hooks.some(isOpenWolfHook);
    });
    existingHooks[event] = [...newHooks[event], ...userEntries];
  }

  merged.hooks = existingHooks;
  return merged;
}
