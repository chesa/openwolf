/**
 * hook-settings.ts
 *
 * Canonical Claude Code hook registration for OpenWolf.
 * Both `openwolf init` and `openwolf update` write these entries into
 * .claude/settings.json. Keep this file as the single source of truth —
 * drift between init and update silently broke worktree-aware commands
 * in PR #25.
 */

// WOLF_ROOT must resolve to an ABSOLUTE path so the spawned `node` invocation
// works regardless of the cwd Claude Code uses when firing the hook.
//
// Strategy: resolve everything relative to `base` = $CLAUDE_PROJECT_DIR (the
// dir Claude Code reports for the project), falling back to the process cwd.
// Run `git rev-parse --git-common-dir` WITH `cwd: base` — NOT the process cwd —
// so this shell snippet computes the same root the compiled JS hook does
// (detectWorktreeContext also runs git from CLAUDE_PROJECT_DIR). Without
// cwd:base the two can diverge when the hook fires with a cwd outside the
// project, sending the shell to a different .wolf/ than the JS resolver.
// `--git-common-dir` is ".git" (relative) in a main checkout and an absolute
// path from a linked worktree; resolving it against `base` and taking the
// parent yields the MAIN repo root in both cases, so every worktree shares one
// .wolf/. Falls back to `base` on any failure (non-git dir, missing git, etc).
export const WOLF_ROOT_SHELL =
  'WOLF_ROOT=$(node -e \'const path = require("path"); const { execSync } = require("child_process"); const base = process.env.CLAUDE_PROJECT_DIR || process.cwd(); try { const gitDir = execSync("git rev-parse --git-common-dir", { cwd: base, stdio: "pipe" }).toString().trim(); console.log(path.resolve(base, gitDir, "..")); } catch (e) { console.log(base); }\')';

const hookCmd = (script: string): string =>
  `${WOLF_ROOT_SHELL} && node "$WOLF_ROOT/.wolf/hooks/${script}"`;

// NOTE: `_managedBy` is NOT a documented Claude Code field. It is an
// empirically observed passthrough — Claude Code preserves unknown fields
// in settings.json during its own read/write cycles as of the versions
// tested. If a future Claude Code release performs schema-validated
// serialization and strips unknown fields, `_managedBy` will silently
// disappear and identification will fall back to the `.wolf/hooks/`
// substring match in `isOpenWolfHook`. Monitor for unexpected hook
// re-registration or spurious duplicate entries as a symptom of this.
export const HOOK_SETTINGS = {
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
  newHooks: typeof HOOK_SETTINGS
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  const existingHooks = (typeof existing.hooks === "object" && existing.hooks !== null)
    ? { ...(existing.hooks as Record<string, unknown>) }
    : {};

  for (const event of Object.keys(newHooks) as Array<keyof typeof HOOK_SETTINGS>) {
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


