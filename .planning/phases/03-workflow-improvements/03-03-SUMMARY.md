---
phase: 03-workflow-improvements
plan: 03
subsystem: metadata-path
tags: [env-var, metadata, configuration, path-resolution]
requires:
  - phase: 03-workflow-improvements
    plan: 01
    provides: hook deployment pipeline structure for consistent hook paths
provides:
  - OPENWOLF_METADATA_DIR env var support in hook-side getWolfDir()
  - OPENWOLF_METADATA_DIR env var support in init.ts initCommand()
  - OPENWOLF_METADATA_DIR env var support in update.ts updateProject()
  - D-03 compliance: hooks always deploy to projectRoot/.wolf/hooks/ regardless of metadata dir
affects: [03-04 (gitignore template), docs, daemon metadata awareness]
tech-stack:
  added: []
  patterns:
    - "Dual-path resolution: metadata dir (from env var or default .wolf/) vs hooks dir (always projectRoot/.wolf/hooks/)"
key-files:
  created: []
  modified:
    - src/hooks/wolf-paths.ts
    - src/cli/init.ts
    - src/cli/update.ts
key-decisions:
  - "OPENWOLF_METADATA_DIR supports absolute paths only; relative paths rejected with warning per D-03"
  - "Hooks always deploy to projectRoot/.wolf/hooks/ regardless of metadata dir (D-03)"
  - "Worktree guard skips when OPENWOLF_METADATA_DIR is set (no path conflict)"
  - "createBackup() in update.ts uses projectWolfDir for hooks and .claude paths, wolfDir for metadata paths"
patterns-established:
  - "Metadata path resolution: check env var → validate absolute → resolve → fall back to default .wolf/"
  - "Hooks path separation: projectRoot/.wolf/hooks/ always used for hook scripts per D-03"
  - "Dual validation for update: check both metadata dir and project .wolf/ before skipping"
requirements-completed: [META-01]
duration: 2 min
completed: 2026-06-06
---

# Phase 3 Plan 3: OPENWOLF_METADATA_DIR Environment Variable — Summary

**OPENWOLF_METADATA_DIR env var support across hook-side getWolfDir(), init.ts, and update.ts with absolute-path-only validation and dual-path resolution (metadata vs hooks dirs)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-06T20:52:14Z
- **Completed:** 2026-06-06T20:54:58Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Hook-side `getWolfDir()` in `wolf-paths.ts` checks `OPENWOLF_METADATA_DIR` before falling back to `.wolf/` path
- `init.ts` `initCommand()` resolves metadata directory from env var; hooks always deploy to `projectRoot/.wolf/hooks/`
- `update.ts` `updateProject()` resolves metadata directory from env var; hooks backup/update at `projectRoot/.wolf/hooks/`
- Relative paths are rejected with a warning, falling back to default `.wolf/` behavior
- Worktree guard in init.ts intelligently skips when env var is set (no path conflict since metadata goes elsewhere)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update hook-side getWolfDir() in wolf-paths.ts** - `83f1602` (feat)
2. **Task 2: Update init.ts wolfDir resolution** - `f66b728` (feat)
3. **Task 3: Update update.ts wolfDir resolution** - `f21a569` (feat)

## Files Created/Modified

- `src/hooks/wolf-paths.ts` - `getWolfDir()` checks `OPENWOLF_METADATA_DIR` env var before computing `.wolf/` path; rejects relative paths with stderr warning
- `src/cli/init.ts` - `initCommand()` resolves metadata dir from env var; creates two paths: `wolfDir` (metadata) and `projectWolfDir` (hooks); worktree guard skips when env var is set; summary output indicates alternate metadata dir
- `src/cli/update.ts` - `updateProject()` resolves metadata dir from env var; `copyHookScripts()` uses `projectWolfDir`; `createBackup()` accepts both `wolfDir` and `projectWolfDir` parameters for correct backup of metadata files and hooks separately

## Decisions Made

- **Dual-path architecture:** The metadata directory (from `OPENWOLF_METADATA_DIR` or default `.wolf/`) stores data files (config, identity, anatomy, cerebrum, STATUS, token-ledger, buglog, etc.). The project-root `.wolf/hooks/` always stores hook scripts per D-03 (hooks binary stays under `$WOLF_ROOT/.wolf/hooks/`). These are separate paths — `writeHooks()` always targets `projectRoot/.wolf/hooks/`.
- **Relative path rejection:** `path.isAbsolute()` is checked on the raw env var value before `path.resolve()` normalizes it. This ensures user intent is clear — relative paths are ambiguous and get a warning + fallback.
- **Backward compatible:** When `OPENWOLF_METADATA_DIR` is unset, all three functions behave identically to before this change. No regressions.
- **No new dependencies:** All changes use Node.js built-in `path` and `process.env`. Consistent with project's "no new deps" pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: env-var-to-filesystem | src/hooks/wolf-paths.ts | `process.env.OPENWOLF_METADATA_DIR` controls filesystem write location |
| threat_flag: env-var-to-filesystem | src/cli/init.ts | `process.env.OPENWOLF_METADATA_DIR` controls metadata directory creation |
| threat_flag: env-var-to-filesystem | src/cli/update.ts | `process.env.OPENWOLF_METADATA_DIR` controls metadata backup/update location |

All threat flags are mitigated by the plan's threat model (T-03-03-01: relative path rejection; T-03-03-02/03: accepted risk for user-controlled env var).

## User Setup Required

None - no external service configuration required. The `OPENWOLF_METADATA_DIR` env var is documented for users who need alternate metadata storage.

## Next Phase Readiness

- Ready for Plan 04 (.wolf/.gitignore template) which also modifies init.ts
- Ready for documentation updates (doc-01) covering OPENWOLF_METADATA_DIR
- Daemon-side `OPENWOLF_METADATA_DIR` awareness deferred — test if needed

## Self-Check: PASSED

- [x] `src/hooks/wolf-paths.ts` — modified with env var support
- [x] `src/cli/init.ts` — modified with env var support and dual-path resolution
- [x] `src/cli/update.ts` — modified with env var support and dual-path backup
- [x] SUMMARY.md created at `.planning/phases/03-workflow-improvements/03-03-SUMMARY.md`
- [x] 3 commits present: `83f1602`, `f66b728`, `f21a569`
- [x] CLI compilation passes (`tsc --noEmit`)
- [x] Hook-side compilation passes (`tsc --noEmit -p tsconfig.hooks.json`)
- [x] No file deletions introduced
- [x] No untracked files left behind

---

*Phase: 03-workflow-improvements*
*Plan: 03*
*Completed: 2026-06-06*
