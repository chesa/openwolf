# Phase 3: .wolf/ Team Workflow Improvements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 3-.wolf/ Team Workflow Improvements
**Areas discussed:** File locking mechanism, HOOK_FILES deployment gap, OPENWOLF_METADATA_DIR, .wolf/.gitignore strategy, Documentation scope
**Mode:** --auto

---

## File Locking Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Node.js built-in `withFileLock` (O_EXCL) | Custom utility using `fs.openSync` with exclusive flags — no new deps | ✓ |
| External npm (`proper-lockfile`) | Adds a dependency — inconsistent with project patterns | |
| In-process mutex | Doesn't work across separate hook processes | |

**User's choice:** Node.js built-in `withFileLock` (recommended)
**Notes:** No new dependencies. Handles multi-process hook runtime. Lock staleness TTL (30s default) recommended for crash recovery.

---

## HOOK_FILES Deployment Gap

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic discovery | Copy all `.js` files from `dist/hooks/` — won't drift | ✓ |
| Explicit list update | Add `wolf-*` entries to `HOOK_FILES` — manual maintenance | |

**User's choice:** Dynamic discovery (recommended)
**Notes:** Explicit list already missed 6 `wolf-*` modules. Dynamic discovery prevents this class of bug.

---

## OPENWOLF_METADATA_DIR

| Option | Description | Selected |
|--------|-------------|----------|
| Absolute path + `.wolf/` fallback | Full path when set, `.wolf/` default otherwise | ✓ |
| Relative path only | Resolved relative to `cwd` — ambiguous | |

**User's choice:** Absolute path + `.wolf/` fallback (recommended)
**Notes:** Update `getWolfDir()`/`getSessionDir()` in `wolf-paths.ts` to check env var.

---

## .wolf/.gitignore Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| `*` + exceptions | Ignore everything, opt-in tracking for committed files | ✓ |
| Track nothing | Empty .gitignore — users must know to add entries | |

**User's choice:** `*` + exceptions (recommended)
**Notes:** Exceptions: `.gitignore`, `OPENWOLF.md`, `config.json`, `identity.md`. Template lives in `src/templates/`.

---

## Documentation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Split: `configuration.md` + `getting-started.md` | Two files for two purposes | ✓ |
| Single `docs/configuration.md` | Everything in one file | |

**User's choice:** Split docs (recommended)
**Notes:** `configuration.md` = config reference; `getting-started.md` = team onboarding/mixed strategy walkthrough. Both linked from README.md.

---

## the agent's Discretion

- `withFileLock` location (wolf-json.ts vs wolf-lock.ts)
- Lock staleness TTL exact value (30s default recommended)
- `getWolfDir()` refactoring scope (single function vs per-caller)
- `.wolf/.gitignore` template as file vs inline string
- `pnpm clean` update for alternate metadata dir

## Deferred Ideas

- De-duplicating `extractDescription` between hooks and scanner
- Automatic FS watcher for lock cleanup
- Daemon updates for `OPENWOLF_METADATA_DIR`
- Multiple metadata directories

---

*Phase: 3-.wolf/ Team Workflow Improvements*
*Discussion logged: 2026-06-06*
*Mode: --auto*
