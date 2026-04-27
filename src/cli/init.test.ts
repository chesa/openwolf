import { describe, it, expect } from "vitest";
import {
  isOpenWolfHook,
  replaceOpenWolfHooks,
  HOOK_SETTINGS,
} from "./init.js";

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
