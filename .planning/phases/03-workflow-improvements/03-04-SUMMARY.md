---
phase: 03-workflow-improvements
plan: 04
subsystem: gitignore, init
tags: gitignore, template, init, cli, git, d-04

# Dependency graph
requires:
  - phase: 02-hook-module-split
    provides: Init with writeTemplateFile, ALWAYS_OVERWRITE pattern
provides:
  - .wolf/.gitignore template with `*` ignore-all and opt-in exceptions
  - init.ts: ALWAYS_OVERWRITE writes .gitignore on init/upgrade; old writeGitIgnore call removed
affects: [03-05-documentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Template file for .wolf/.gitignore, deployed via ALWAYS_OVERWRITE writeTemplateFile loop
    - Old project-root `.wolf/` append replaced by internal .wolf/.gitignore

key-files:
  created:
    - src/templates/.gitignore
  modified:
    - src/cli/init.ts

key-decisions:
  - "D-04: `.wolf/.gitignore` uses `*` with exceptions (`.gitignore`, `OPENWOLF.md`, `config.json`, `identity.md`)"
  - "Template approach preferred over inline string for consistency with existing template pattern"
  - "writeGitIgnore() function kept with @deprecated JSDoc rather than deleted (valid utility for legacy projects)"

patterns-established:
  - "Template file in src/templates/ + ALWAYS_OVERWRITE in init.ts = automatic deployment on init/upgrade"

requirements-completed: [GIT-01]

# Metrics
duration: 3min
completed: 2026-06-06
---

# Phase 3 Plan 4: .wolf/.gitignore Template Summary

**.wolf/.gitignore template (`*` + 4 opt-in exceptions) replacing the old project-root `.gitignore` append, with init.ts updated for ALWAYS_OVERWRITE deployment**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-06T20:57:00Z
- **Completed:** 2026-06-06T20:59:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/templates/.gitignore` template with `*` ignore-all and exceptions for `.gitignore`, `OPENWOLF.md`, `config.json`, `identity.md`
- Added `.gitignore` to `ALWAYS_OVERWRITE` array so the template is written to `.wolf/.gitignore` on every init and upgrade
- Removed the `writeGitIgnore(projectRoot)` call from `initCommand()` — `init` no longer appends `.wolf/` to the project-root `.gitignore`
- Added `@deprecated` JSDoc to `writeGitIgnore()` function definition (kept as utility for legacy projects)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/templates/.gitignore template file** - `75e0d8d` (feat)
2. **Task 2: Update init.ts to write .wolf/.gitignore and remove old writeGitIgnore() call** - `ef23de8` (feat)

## Files Created/Modified

- `src/templates/.gitignore` (NEW) — Template file with `*` ignore-all and 4 opt-in exceptions
- `src/cli/init.ts` (MODIFIED) — `.gitignore` added to `ALWAYS_OVERWRITE`; `writeGitIgnore(projectRoot)` call removed; `@deprecated` JSDoc added to `writeGitIgnore()` function

## Decisions Made

- **D-04 template content:** `*` + `!.gitignore` + `!OPENWOLF.md` + `!config.json` + `!identity.md` — ignore-all with opt-in exceptions. Users add `!` lines to track additional files. Safest default: worst case is a missed file, not leaked state.
- **Template file vs. inline string:** Used `src/templates/.gitignore` file for consistency with all other template files (OPENWOLF.md, config.json, identity.md, etc.)
- **writeGitIgnore() kept, not deleted:** The function is still a valid utility for legacy projects that want the old `.wolf/` append behavior. Added `@deprecated` JSDoc to signal the shift.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks completed without issues.

## Threat Flags

None — no new threat surface introduced. Template is a static file in source repo; init.ts changes are straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Phase 3 Plan 5 (documentation): docs/configuration.md and docs/getting-started.md need updates covering the mixed commit strategy
- The `.wolf/.gitignore` template is in place and deployed on init/upgrade

## Self-Check: PASSED

- [x] src/templates/.gitignore exists with correct content
- [x] src/cli/init.ts ALWAYS_OVERWRITE includes ".gitignore"
- [x] writeGitIgnore(projectRoot) call removed from initCommand()
- [x] writeGitIgnore() function definition kept with @deprecated JSDoc
- [x] tsc --noEmit passes with zero errors
- [x] Both commits exist in git log
- [x] SUMMARY.md created

---

*Phase: 03-workflow-improvements*
*Completed: 2026-06-06*
