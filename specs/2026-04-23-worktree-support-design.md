# OpenWolf Git Worktree Support — Design Spec

**Date:** 2026-04-23
**Branch:** feature/25-git-worktree-support
**Scope:** Approach 2 — Hooks + CLI awareness (no dashboard changes)

---

## Problem

OpenWolf assumes a single-checkout-per-project model. When Claude Code runs inside a git
worktree — whether created by `git worktree add`, `claude --worktree`, or the Superpowers
`using-git-worktrees` skill — OpenWolf silently fails: hooks exit 0 immediately because
`.wolf/` doesn't exist in the worktree directory, and running `openwolf init` there creates
an empty orphaned `.wolf/` that fragments the team's shared knowledge base.

The failure is invisible. Nothing in the Claude Code transcript or CLI output tells the
developer that OpenWolf's instrumentation is off.

---

## Goals

1. All 6 hooks fire correctly when Claude Code runs inside any git worktree.
2. Shared knowledge files (`cerebrum.md`, `anatomy.md`, `buglog.json`) remain centralized
   in the main checkout's `.wolf/` — no per-worktree fragmentation.
3. Session-scoped state (`memory.md`, `token-ledger.json`, `_session.json`) is isolated
   per worktree to prevent write contention and context leakage.
4. `openwolf init` in a worktree produces a clear, actionable error instead of a broken
   state.
5. `openwolf status` reports worktree mode explicitly — "I see exactly where my data
   is flowing."
6. Zero breaking changes for users working in the main checkout.

---

## Non-Goals (deferred)

- Dashboard worktree session grouping (`ActivityTimeline.tsx`, `MemoryViewer.tsx`)
- `openwolf sessions list/prune` subcommand
- Merge-back of worktree session data into main memory/ledger
- Windows-specific worktree path normalization (addressed by `path.resolve()` but not
  tested)

---

## Design: Shared Knowledge / Namespaced Session

### State topology

```
.wolf/
  ├── cerebrum.md           ← SHARED (all worktrees read/write)
  ├── anatomy.md            ← SHARED
  ├── buglog.json           ← SHARED
  ├── config.json           ← SHARED
  ├── OPENWOLF.md           ← SHARED
  ├── reframe-frameworks.md ← SHARED
  ├── identity.md           ← SHARED
  ├── cron-manifest.json    ← SHARED
  ├── cron-state.json       ← SHARED (project-wide scheduler — see rationale below)
  ├── hooks/                ← SHARED (compiled hook scripts)
  │
  ├── memory.md             ← MAIN CHECKOUT only (flat layout, unchanged)
  ├── token-ledger.json     ← MAIN CHECKOUT only (flat layout, unchanged)
  │
  └── sessions/             ← NEW — created on first worktree session
      └── <8-char-hash>/
          ├── worktree.json    (metadata: branch, worktreePath, mainRepo, created)
          ├── memory.md        (chronological session log for this worktree)
          ├── token-ledger.json
          └── _session.json    (active hook state, replaces .wolf/hooks/_session.json)
```

**Why `cron-state.json` stays shared:** Cron jobs (anatomy scans, memory consolidation)
are project-wide tasks. If each worktree had its own `cron-state.json`, three active
worktrees would each fire the anatomy scanner on the same interval — a "thundering herd"
against the shared `anatomy.md`. The shared state ensures the scheduler fires once per
interval for the project.

**Worktree session ID:** 8-character SHA-256 hash of the worktree's absolute path.
Immutable for the life of the worktree, guaranteed unique even when multiple worktrees
share the same branch name. Human-readable context is in `worktree.json` and
`openwolf status`.

**`worktree.json` schema:**
```json
{
  "worktreePath": "/absolute/path/to/worktree",
  "branch": "feature/25-git-worktree-support",
  "mainRepo": "/absolute/path/to/main-project",
  "created": "2026-04-23T14:30:00.000Z"
}
```

---

## Detection Mechanism

```
git rev-parse --path-format=absolute --git-common-dir
```

- **Main checkout:** returns `/path/to/project/.git`
  → `path.dirname()` = `/path/to/project` = `$CLAUDE_PROJECT_DIR` → not a worktree
- **Any worktree:** returns `/path/to/project/.git`
  → `path.dirname()` ≠ `$CLAUDE_PROJECT_DIR` → worktree detected, `mainRepoRoot` resolved

Works for all worktree creation methods: `git worktree add`, `claude --worktree`,
Superpowers `.worktrees/`, Claude Code's `.claude/worktrees/`.

**Fallback:** If `git` is unavailable or the command fails (non-git project), catch the
error and return `isWorktree: false` with `mainRepoRoot = projectDir`. Existing behavior
is preserved.

---

## Files Changed

### New: `src/utils/worktree.ts`

Canonical worktree detection utility, importable by CLI code.

```typescript
export interface WorktreeContext {
  isWorktree: boolean;
  mainRepoRoot: string;   // main checkout root
  worktreePath: string;   // this process's $CLAUDE_PROJECT_DIR
  sessionId: string;      // 8-char hash; empty string when not a worktree
}

export function detectWorktreeContext(projectDir?: string): WorktreeContext
```

Accepts an optional `projectDir` so CLI commands can pass `findProjectRoot()` output
directly rather than relying on `$CLAUDE_PROJECT_DIR`.

### Modified: `src/hooks/shared.ts`

Self-contained copy of the detection logic (hooks cannot import from `src/utils/` at
runtime — architectural constraint). Adds:

- `WorktreeContext` interface (local, not exported beyond the compiled hook bundle)
- `detectWorktreeContext()` (private, module-level cached via `let _cachedCtx`)
- Updated `getWolfDir()`: returns `path.join(detectWorktreeContext().mainRepoRoot, ".wolf")`
  instead of `path.join($CLAUDE_PROJECT_DIR, ".wolf")`
- New export `getSessionDir()`: returns `getWolfDir()` for main checkout sessions;
  returns `path.join(getWolfDir(), "sessions", ctx.sessionId)` for worktree sessions
- New export `getWorktreeContext()`: exposes the context for use by `session-start.ts`
- New `ensureSessionDir()`: creates `.wolf/sessions/<hash>/` and writes `worktree.json`
  if entering a new worktree session

**File routing after changes:**

| File | Resolver |
|------|----------|
| `cerebrum.md`, `anatomy.md`, `buglog.json` | `getWolfDir()` |
| `config.json`, `cron-manifest.json`, `cron-state.json` | `getWolfDir()` |
| `memory.md`, `token-ledger.json` | `getSessionDir()` |
| `_session.json` | `getSessionDir()` — see note below |
| `worktree.json` | `getSessionDir()` (new file) |

**`_session.json` path note:** Currently written to `.wolf/hooks/_session.json` (the
`hooks/` subdir was incidental — session state doesn't logically belong with compiled
scripts). This change moves it to `.wolf/_session.json` for main checkout sessions and
`.wolf/sessions/<hash>/_session.json` for worktree sessions. Since `_session.json` is
transient (recreated on every `SessionStart`, never user-authored), this is a clean
relocation with no user-visible impact.

### Modified: `src/hooks/session-start.ts`

- Call `ensureSessionDir()` before creating session state
- Use `getSessionDir()` for `_session.json`, `memory.md`, `token-ledger.json`
- Keep `getWolfDir()` for `cerebrum.md`, `buglog.json`
- Emit to stderr when worktree mode is active:
  ```
  🐺 OpenWolf: Worktree mode (feature/25-git-worktree-support) — shared state from /path/to/main-repo
  ```
- Emit to stderr on degraded fallback:
  ```
  ⚠️ OpenWolf: Running in a worktree but cannot locate the main checkout. State resolution fell back to CWD.
  ```

### Modified: `src/hooks/pre-read.ts`, `post-read.ts`, `pre-write.ts`, `post-write.ts`, `stop.ts`

Each hook uses `getSessionDir()` instead of `getWolfDir()` for session-scoped files
(`_session.json`, `memory.md`). Knowledge files retain `getWolfDir()`. Mechanical
find-and-replace changes per the routing table above.

### Modified: `src/cli/init.ts`

Add worktree guard at the top of `initCommand()`, after `findProjectRoot()`:

```
if (isWorktree AND main repo .wolf/ exists)
  → "OpenWolf is already initialized at <main-path>. Worktrees use shared state automatically."
  → exit 0

if (isWorktree AND main repo .wolf/ does not exist)
  → "You're in a git worktree. Run openwolf init from the main checkout: cd <main-path> && openwolf init"
  → exit 1

else → normal init flow (unchanged)
```

### Modified: `src/cli/status.ts`

- Detect worktree context at top of `statusCommand()`
- Print mode banner before the file integrity section:
  ```
  Mode: Worktree  (feature/25-git-worktree-support)
  Main repo: /Users/bfs/bitbucket/openwolf
  Session: .wolf/sessions/a3f8c2d1/ (Active)
  ```
  or `Mode: Main checkout` for normal sessions.
- File integrity check: shared knowledge files checked in `wolfDir` (unchanged);
  session-scoped files (`memory.md`, `token-ledger.json`) checked in `getSessionDir()`,
  reported as "not yet created" (not "missing") if session dir doesn't exist.
- Token stats block: reads from session-scoped ledger in worktree mode. Footer note:
  `"(This worktree's session only — main checkout ledger at .wolf/token-ledger.json)"`

### Modified: `docs/troubleshooting.md`

New section "Git Worktrees":

- What works automatically once the fix is deployed
- Requirement: `openwolf init` must be run from the main checkout, not a worktree
- How `openwolf status` confirms worktree mode is active
- Where per-session state lives (`.wolf/sessions/<hash>/`)
- Cleanup note: `git worktree remove` does not clean `.wolf/sessions/`. Session dirs
  can be deleted manually from the main checkout's `.wolf/sessions/` when the worktree
  is retired.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `git` not installed | `detectWorktreeContext()` catches exception, returns non-worktree context |
| Not a git repo | Same as above |
| Main repo `.wolf/` missing | `ensureWolfDir()` exits 0 (unchanged — hook is silent in non-OpenWolf projects) |
| Worktree + main repo `.wolf/` present | Normal worktree mode |
| `openwolf init` in worktree (main has `.wolf/`) | Exit 0 with clear guidance |
| `openwolf init` in worktree (main has no `.wolf/`) | Exit 1 with clear guidance |

---

## What This Does Not Fix

The upstream Claude Code bugs in the research doc (issues #46808, #36360, #49989) remain
open. However, this design routes around them:

- **#46808** (hooks not triggered in worktrees): We resolve `.wolf/` via `git common-dir`,
  not `$CLAUDE_PROJECT_DIR`. Even if CC sets `CLAUDE_PROJECT_DIR` to the worktree path,
  our hooks find the shared `.wolf/` in the main repo.
- **#36360** (`$CLAUDE_PROJECT_DIR` expands to worktree path): Same mitigation — we use
  `CLAUDE_PROJECT_DIR` only as the *starting point* for git detection, then resolve to
  `mainRepoRoot` ourselves.
- **#27661** (subagents don't inherit hooks): Not addressed by this spec. Subagent sessions
  that pick up hooks will benefit from worktree support; those that don't inherit hooks
  are an upstream problem.
