---
phase: 03-workflow-improvements
plan: 02
subsystem: hooks
tags: [locking, concurrency, file-system, node-builtins]

# Dependency graph
requires:
  - phase: 02-hook-module-split
    provides: wolf-json.ts with writeJSON, shared.ts barrel re-export pattern
provides:
  - Advisory per-file locking for concurrent `.wolf/` write safety
  - withFileLock utility wrapping writeJSON with O_EXCL-based exclusive file creation
  - Staleness TTL (30s default, configurable) for crash-orphaned lock recovery
affects:
  - "Any future .wolf/ file write path that needs locking"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory per-file locking via fs.openSync with O_CREAT | O_EXCL"
    - "Staleness TTL for crash-orphaned lock cleanup"
    - "Zero-dependency Node.js built-in locking (fs, Atomics.wait)"
    - "Lock propagation via shared.ts barrel — zero consumer hook changes"

key-files:
  created:
    - src/hooks/wolf-lock.ts
  modified:
    - src/hooks/wolf-json.ts
    - src/hooks/shared.ts

key-decisions:
  - "Separate wolf-lock.ts module for lock utility (not in wolf-json.ts) — generic enough for future non-JSON consumers"
  - "withFileLock wraps fn() synchronously — hook processes are synchronous by design"
  - "Atomics.wait for backoff sleep (not setTimeout) — synchronous, no async required"
  - "acquireLock and releaseLock exported for direct use if needed"

patterns-established:
  - "File locking: per-file advisory lock using zero-length sentinel `.lock` files"
  - "Staleness: process crash leaves .lock; mtime check with configurable 30s TTL breaks it"
  - "Lock propagation: writeJSON wrapper via shared.ts; 6 hook consumers unchanged"

requirements-completed: [SCAN-04]

# Metrics
duration: 7min
completed: 2026-06-06
---

# Phase 3 Plan 2: Advisory Per-File Locking Summary

**Advisory per-file locking for concurrent `.wolf/` write safety using Node.js built-in `O_EXCL` exclusive file creation, wrapping `writeJSON` with zero consumer hook changes**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-06T20:49:39Z
- **Completed:** 2026-06-06T20:56:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/hooks/wolf-lock.ts` with `withFileLock`, `acquireLock`, `releaseLock` using `fs.openSync(O_CREAT | O_EXCL)` — zero external dependencies
- Staleness TTL (30s default, configurable via `WITH_FILE_LOCK_TTL_MS`) automatically breaks locks orphaned by crashed processes
- Wrapped `writeJSON()` body in `withFileLock` — all existing logic (temp file, randomBytes, rename, EBUSY fallback) unchanged inside the lock lambda
- Re-exported `withFileLock` through `shared.ts` barrel — 6 hook consumers continue working unchanged per D-06's zero-consumer-changes principle
- `readJSON()` intentionally not locked (temp-file + atomic rename already safe for concurrent readers)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create `src/hooks/wolf-lock.ts` with withFileLock** - `40c7ec6` (feat)
2. **Task 2: Wrap writeJSON with withFileLock and re-export from shared.ts** - `f4cd507` (feat)

**Plan metadata:** Will be committed after SUMMARY.md.

_Note: Both tasks were `type="auto"` with no TDD required._

## Files Created/Modified

- `src/hooks/wolf-lock.ts` — New advisory per-file lock utility (84 lines)
- `src/hooks/wolf-json.ts` — `writeJSON()` body wrapped in `withFileLock(filePath, () => { ... })`
- `src/hooks/shared.ts` — Re-exports `withFileLock` from `./wolf-lock.js`

## Decisions Made

- **Separate `wolf-lock.ts` module**: The lock utility is generic enough for future non-JSON consumers (D-06 in CONTEXT.md suggested planner discretion; a dedicated module is cleaner)
- **Synchronous locking**: Hook processes are synchronous by design; `withFileLock` uses `Atomics.wait` for non-blocking sleep instead of `setTimeout`, avoiding async
- **Both `acquireLock` and `releaseLock` exported**: Enables direct use outside `withFileLock` if needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface Scan

All threat surface matches the plan's `<threat_model>`:

| Threat ID | Category | Disposition | Status |
|-----------|----------|-------------|--------|
| T-03-02-01 | DoS (orphaned lock) | mitigate | Mitigated: 30s TTL, configurable |
| T-03-02-02 | Tampering (symlink attack) | mitigate | Mitigated: O_EXCL refuses symlinks |
| T-03-02-03 | Info disclosure (lock path) | accept | Accepted: path visible in `.wolf/` listing |
| T-03-02-04 | Tampering (race on stale delete) | accept | Accepted: retry-loop handles races |

No new threat surface introduced beyond modeled boundaries.

## Known Stubs

None — all code is fully functional with no placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Locking foundation complete. Ready for remaining Phase 3 plans (HOOK_FILES deployment gap, OPENWOLF_METADATA_DIR, .wolf/.gitignore template, docs).

## Self-Check: PASSED

- ✅ `src/hooks/wolf-lock.ts` — created, 84 lines, 3 exported functions
- ✅ `src/hooks/wolf-json.ts` — writeJSON wrapped in withFileLock, all existing logic preserved
- ✅ `src/hooks/shared.ts` — re-exports withFileLock from ./wolf-lock.js
- ✅ `tsc --noEmit -p tsconfig.hooks.json` — zero errors
- ✅ Commit `40c7ec6` — feat(03-02): create advisory per-file locking
- ✅ Commit `f4cd507` — feat(03-02): wrap writeJSON with withFileLock
- ✅ Commit `071376e` — docs(03-02): complete plan

---

*Phase: 03-workflow-improvements*
*Completed: 2026-06-06*
