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
// Strategy: cd into $CLAUDE_PROJECT_DIR (always absolute), then cd into the
// parent of `git rev-parse --git-common-dir` (which may be relative ".git" in
// the main checkout, or an absolute path in a worktree), then `pwd` to print
// the resolved absolute root. Falls back to $CLAUDE_PROJECT_DIR if anything
// fails (non-git dir, missing git, etc).
export const WOLF_ROOT_SHELL =
  'WOLF_ROOT="$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && cd "$(dirname "$(git rev-parse --git-common-dir 2>/dev/null)")" 2>/dev/null && pwd || echo "$CLAUDE_PROJECT_DIR")"';

const hookCmd = (script: string): string =>
  `${WOLF_ROOT_SHELL} && node "$WOLF_ROOT/.wolf/hooks/${script}"`;

export const HOOK_SETTINGS = {
  SessionStart: [
    { matcher: "", hooks: [{ type: "command", command: hookCmd("session-start.js"), timeout: 5, _managedBy: "openwolf" }] },
  ],
  PreToolUse: [
    { matcher: "Read", hooks: [{ type: "command", command: hookCmd("pre-read.js"), timeout: 5, _managedBy: "openwolf" }] },
    { matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: hookCmd("pre-write.js"), timeout: 5, _managedBy: "openwolf" }] },
  ],
  PostToolUse: [
    { matcher: "Read", hooks: [{ type: "command", command: hookCmd("post-read.js"), timeout: 5, _managedBy: "openwolf" }] },
    { matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: hookCmd("post-write.js"), timeout: 10, _managedBy: "openwolf" }] },
  ],
  Stop: [
    { matcher: "", hooks: [{ type: "command", command: hookCmd("stop.js"), timeout: 10, _managedBy: "openwolf" }] },
  ],
};

/**
 * Returns true if a hook entry was registered by OpenWolf
 * (i.e., its command references .wolf/hooks/).
 */
export function isOpenWolfHook(hook: unknown): boolean {
  if (typeof hook !== "object" || hook === null) return false;
  const h = hook as Record<string, unknown>;
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
    // Keep non-OpenWolf entries the user may have added
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

// Hook script basenames that get copied from dist/hooks/ into .wolf/hooks/.
// Single source of truth — duplication across init/update/status caused the
// worktree-helper.js bug surfaced in PR #25 review.
export const HOOK_FILES = [
  "session-start.js",
  "pre-read.js",
  "post-read.js",
  "pre-write.js",
  "post-write.js",
  "stop.js",
  "shared.js",
  "worktree-helper.js",
] as const;
