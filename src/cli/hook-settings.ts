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
// makeWolfRootShell — resolve WOLF_ROOT at hook runtime
// ---------------------------------------------------------------------------
//
// Strategy: generate a portable shell snippet that resolves the project root
// when the hook fires, rather than baking a machine-specific absolute path into
// the committed `.claude/settings.json`. This lets teammates clone the repo to
// any directory and share the same settings.json.
//
// Resolution order:
// 1. `process.env.CLAUDE_PROJECT_DIR` if it is an absolute path.
// 2. `process.cwd()` as a fallback.
// 3. Run `git rev-parse --git-common-dir` from that base to resolve linked
//    worktrees to the main repo root (worktree-shared `.wolf/`).
// 4. Fall back to the base itself if git is unavailable or the base is not a
//    git repository.
//
// The previous fix (PR #25) baked the absolute project root to avoid the
// MODULE_NOT_FOUND bug where a relative `CLAUDE_PROJECT_DIR` (e.g. "meep")
// resolved against the wrong cwd. That fix was correct but not portable.
// This version restores portability by resolving at runtime while still
// guarding against relative env values: a relative `CLAUDE_PROJECT_DIR` is
// ignored and `process.cwd()` is used instead.
function makeWolfRootShell(): string {
  return (
    `WOLF_ROOT=$(node -e 'const path = require("path"); ` +
    `const { execSync } = require("child_process"); ` +
    `const cpd = process.env.CLAUDE_PROJECT_DIR; ` +
    `let base = cpd && path.isAbsolute(cpd) ? cpd : process.cwd(); ` +
    `try { const gitDir = execSync("git rev-parse --git-common-dir", ` +
    `{ cwd: base, stdio: "pipe" }).toString().trim(); ` +
    `base = path.resolve(base, gitDir, ".."); } ` +
    `catch (e) { /* not a git repo or git missing — keep base */ } ` +
    `console.log(base);')`
  );
}

// ---------------------------------------------------------------------------
// validateProjectRoot — fail fast at generation time
// ---------------------------------------------------------------------------
//
// projectRoot is no longer baked into the hook command, but callers still
// supply it to identify which project is being configured. Reject empty
// roots and single-quote characters (which would break any future shell
// embedding or logging).
function validateProjectRoot(projectRoot: string): void {
  if (!projectRoot || projectRoot.trim().length === 0) {
    throw new Error(
      `OpenWolf: projectRoot must be a non-empty string (got ${JSON.stringify(projectRoot)})`
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
// makeHookSettings — factory that produces portable hook commands
// ---------------------------------------------------------------------------
//
// Returns the Claude Code hook configuration with runtime-resolved WOLF_ROOT.
// Call this from `openwolf init` and `openwolf update` — never use a static
// HOOK_SETTINGS constant, which would stale-date as soon as the project is
// cloned to a different path.
//
// @param projectRoot - Path to the project root directory (used for
//   validation/logging only; not embedded in the generated command).
export function makeHookSettings(projectRoot: string) {
  validateProjectRoot(projectRoot);

  const wolfRootShell = makeWolfRootShell();

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
