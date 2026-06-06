---
phase: 03-workflow-improvements
plan: 01
subsystem: hooks
tags: hook-deployment, dynamic-discovery, file-copy, init-update-status
requires: []
provides:
  - Dynamic hook file discovery — all .js files in dist/hooks/ are copied to .wolf/hooks/
  - Shared hook-copy module (findHookSourceDir, getHookFileNames, copyHookFiles, writeHooksPackageJson)
  - Removed static HOOK_FILES array from hook-settings.ts
affects: hook-deployment, init-workflow, update-workflow, status-reporting

tech-stack:
  added: []
  patterns:
    - Dynamic directory scanning replaces static file lists for hook deployment
    - Shared module consolidates duplicated candidate-search and copy logic

key-files:
  created:
    - src/cli/hook-copy.ts — shared hook discovery and copy utilities
  modified:
    - src/cli/init.ts — writeHooks() uses dynamic discovery via hook-copy
    - src/cli/update.ts — copyHookScripts() uses dynamic discovery via hook-copy
    - src/cli/status.ts — hook presence check uses fs.readdirSync directory scan
    - src/cli/hook-settings.ts — HOOK_FILES constant removed

key-decisions:
  - "Dynamic discovery (D-02): replace static HOOK_FILES with fs.readdirSync scan of dist/hooks/"
  - "4-candidate search: combined init.ts (2 candidates) and update.ts (3 candidates) into a single findHookSourceDir with 4 candidates"
  - "Shared module in hook-copy.ts consolidates duplicated logic from init.ts and update.ts"

requirements-completed: [HOOK-03]

duration: 63min
completed: 2026-06-06
---

# Phase 3: Workflow Improvements — Plan 01: Dynamic Hook Deployment Summary

**Replaced static HOOK_FILES array with dynamic directory scanning across init/update/status, eliminating the deployment gap where 6 wolf-*.js modules were never copied to .wolf/hooks/**

## Performance

- **Duration:** 63 min
- **Started:** 2026-06-06T19:45:00Z
- **Completed:** 2026-06-06T20:48:15Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Created `src/cli/hook-copy.ts` with 4 exported functions: `findHookSourceDir`, `getHookFileNames`, `copyHookFiles`, `writeHooksPackageJson`
- `init.ts` `writeHooks()` now uses dynamic discovery — copies all `.js` files from `dist/hooks/` instead of iterating a static array
- `update.ts` `copyHookScripts()` now uses dynamic discovery — same dynamic scan approach
- `status.ts` hook presence check uses `fs.readdirSync(.wolf/hooks/)` directory scan instead of `HOOK_FILES`
- `hook-settings.ts` `HOOK_FILES` constant removed entirely — no more drift between file list and compiled modules
- Eliminated the deployment gap: the 6 `wolf-*.js` modules (wolf-paths, wolf-files, wolf-json, wolf-anatomy, wolf-describe, wolf-misc) are now automatically deployed
- Consolidated duplicated candidate-search logic from `init.ts` and `update.ts` into a single shared module

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/cli/hook-copy.ts** - `ca98e12` (feat)
2. **Task 2: Update init.ts and update.ts** - `907764f` (feat)
3. **Task 3: Update status.ts and remove HOOK_FILES** - `11a5ec7` (feat)

## Files Created/Modified
- `src/cli/hook-copy.ts` — New shared module for hook discovery and copy (findHookSourceDir, getHookFileNames, copyHookFiles, writeHooksPackageJson)
- `src/cli/init.ts` — writeHooks() refactored to use findHookSourceDir + copyHookFiles + writeHooksPackageJson; removed HOOK_FILES import
- `src/cli/update.ts` — copyHookScripts() refactored to use findHookSourceDir + copyHookFiles + writeHooksPackageJson; removed HOOK_FILES import
- `src/cli/status.ts` — Hook presence check uses fs.readdirSync directory scan instead of HOOK_FILES iteration
- `src/cli/hook-settings.ts` — HOOK_FILES constant removed; HOOK_SETTINGS unchanged

## Decisions Made
- **Dynamic discovery (D-02):** All `.js` files from `dist/hooks/` are now copied to `.wolf/hooks/` via directory scan. Any new `wolf-*` module added in the future is automatically deployed without updating a separate list.
- **4-candidate search path consolidation:** The `findHookSourceDir` function combines 2 candidates from `init.ts` and 3 from `update.ts` into a unified set of 4 candidates, removing future drift between the two functions.
- **Shared module extraction:** The candidate-search and file-copy logic was duplicated between `init.ts` and `update.ts` — now consolidated into `src/cli/hook-copy.ts`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. After `pnpm build:hooks && openwolf init` or `openwolf update`, all hook `.js` files from `dist/hooks/` (including `wolf-*` modules) are deployed to `.wolf/hooks/`.

## Next Phase Readiness

- Hook deployment gap fixed — all 6 `wolf-*` modules are now copied to `.wolf/hooks/`
- Ready for Phase 3 Plan 02: Implement `withFileLock` for concurrent `.wolf/` write safety
- Ready for Phase 3 Plan 03: `OPENWOLF_METADATA_DIR` environment variable support

## Self-Check: PASSED

- ✅ File `src/cli/hook-copy.ts` exists with 4 named exports (verified at runtime)
- ✅ `init.ts` no longer imports `HOOK_FILES` — uses dynamic discovery
- ✅ `update.ts` no longer imports `HOOK_FILES` — uses dynamic discovery
- ✅ `status.ts` hook presence check uses `fs.readdirSync` directory scan
- ✅ `hook-settings.ts` `HOOK_FILES` constant removed
- ✅ `HOOK_SETTINGS` unchanged
- ✅ No `HOOK_FILES` references remain in any `src/cli/*.ts` file
- ✅ TypeScript compilation passes (`tsc --noEmit` — 0 errors)
- ✅ CLI smoke test passes (`openwolf --help`)
- ✅ All 3 task commits exist (`ca98e12`, `907764f`, `11a5ec7`)
- ✅ SUMMARY.md created at `.planning/phases/03-workflow-improvements/03-01-SUMMARY.md`

---

*Phase: 03-workflow-improvements*
*Completed: 2026-06-06*
