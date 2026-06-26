---
phase: 12-framework-blind-curation-machinery
plan: 02
subsystem: cli
name: R7b/R9 framework-blind curation machinery
tags: [cli, curation, learnings, freshness, tdd, r7b, r9]

dependency_graph:
  requires:
    - phase: 12-01
      provides: "collectAllEntries, hashCerebrumBody, ProposalEntry in src/hooks/wolf-pantry.ts"
  provides:
    - "openwolf learnings check subcommand with 0|1|2 exit codes"
    - "openwolf learnings accept subcommand for sanctioned baseline writes"
    - "R9 baseline re-baseline after successful cerebrum merge"
    - "Stub entries blocked from silent cerebrum merge"
  affects:
    - "Plan 03 (status command consumes pending count)"
    - "Plan 04 (verification of framework-blind boundaries)"

tech-stack:
  added: []
  patterns:
    - "Lazy subcommand imports in src/cli/index.ts to keep CLI startup fast"
    - "writeJSON for atomic freshness sidecar writes (single lock, no nested withFileLock)"
    - "Synthetic stub marker on ProposalEntry to separate check visibility from merge candidacy"

key-files:
  created:
    - "tests/cli/learnings-check.test.ts"
    - "tests/cli/learnings-accept.test.ts"
  modified:
    - "src/cli/learnings-cmd.ts"
    - "src/cli/index.ts"
    - "src/hooks/wolf-pantry.ts"

key-decisions:
  - "Synthetic stub entries carry isStub=true so they surface in check but are never merge candidates"
  - "learnings accept is the explicit sanctioned writer for hand-edited cerebrum.md (captured_by: learnings-accept)"
  - "Merge re-baseline runs only after at least one cerebrum append succeeded (captured_by: learnings-merge)"
  - "Command descriptions stay host/layer neutral (C1)"

requirements-completed: [R7b, R9]

metrics:
  duration: "2 min"
  completed: "2026-06-26"
  status: complete
---

# Phase 12 Plan 02: R7b/R9 framework-blind curation machinery

**Shipped the `openwolf learnings check` exit-code primitive, the `openwolf learnings accept` sanctioned baseline writer, and the merge-time cerebrum-freshness re-baseline — all with host/layer-neutral CLI descriptions and TDD coverage.**

## Performance

- **Duration:** 2 min
- **Tasks:** 3
- **Files modified:** 5
- **Completed:** 2026-06-26

## Accomplishments

- `openwolf learnings check` returns 0 (clean), 1 (pending), or 2 (operational error), with `--json` structured stdout and `--quiet` exit-code-only modes.
- Bounded human summary to stderr when pending: headline count, up to 5 sessions, then a continuation line, plus a remediation pointer to `openwolf learnings merge`.
- Stub files (non-empty `proposed-learnings.md` with no `→ target` grammar) trip the gate (exit 1) but never merge into `cerebrum.md`.
- `openwolf learnings accept` re-baselines `.wolf/cerebrum-freshness.json` with `captured_by: learnings-accept` after a blessed hand-edit.
- `openwolf learnings merge` re-baselines the same sidecar with `captured_by: learnings-merge` after a successful cerebrum append.

## Task Commits

1. **Task 1: RED — tests/cli/learnings-check.test.ts + learnings-accept.test.ts** — `9d2c700` (test)
2. **Task 2: GREEN — implement check + accept + merge baseline; register subcommands** — `4d80ff9` (feat)
3. **Task 3: REFACTOR — C1 host/layer grep; full type-check; build smoke** — verification-only, no code changes

## Files Created/Modified

- `src/cli/learnings-cmd.ts` — Added `learningsCheckCommand`, `learningsAcceptCommand`, `emitLearningsSummaryToStderr`, merge baseline write, and stub filtering in `learningsMergeCommand`.
- `src/cli/index.ts` — Registered `learnings check` and `learnings accept` subcommands with lazy imports.
- `src/hooks/wolf-pantry.ts` — Added optional `isStub` field to `ProposalEntry` and set it on synthetic stub entries.
- `tests/cli/learnings-check.test.ts` — Exit-code matrix, json/quiet, stub-trips-gate, bounded list, and operational error coverage.
- `tests/cli/learnings-accept.test.ts` — `learnings accept` baseline, merge re-baseline, and stub-only merge guard coverage.

## Decisions Made

- Followed the plan's D-19 subcommand shape (`learnings check` instead of a `--check` flag) and D-20 principle that baseline updates only happen on sanctioned writes.
- Kept command descriptions framework-blind and host-neutral per C1; verification confirms zero new `gsd|superpowers|gstack|\.planning` or `bitbucket|github|pipelines|pre-push` matches in the changed files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `isStub` marker to `ProposalEntry` to prevent stub merge**
- **Found during:** Task 2 GREEN implementation
- **Issue:** The plan's must-haves and threat model (T-12-07) require that a stub-only session never append `cerebrum.md`, but `collectAllEntries()` synthesizes stub entries that `learningsMergeCommand` would otherwise append.
- **Fix:** Added an optional `isStub?: boolean` field to `ProposalEntry` in `src/hooks/wolf-pantry.ts`, set it to `true` for synthetic stub entries, and filtered `!e.isStub` in `learningsMergeCommand` before presenting/merging candidates.
- **Files modified:** `src/hooks/wolf-pantry.ts`, `src/cli/learnings-cmd.ts`
- **Verification:** `tests/cli/learnings-accept.test.ts` asserts a stub-only session produces no `cerebrum.md`; all CLI tests pass.
- **Committed in:** `4d80ff9`

---

**Total deviations:** 1 auto-fixed (Rule 2 — correctness/security)
**Impact on plan:** Required to honor the plan's own "stub never merges" invariant. No scope creep.

## Issues Encountered

- The operational-error test fixture initially created a file *inside* the `sessions` directory, which `fs.readdirSync` lists rather than throwing. Fixed by creating `sessions` itself as a file so `readdirSync` throws ENOTDIR and exercises the `learningsCheckCommand` error path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `learningsCheckCommand` is ready for Plan 03's `openwolf status` integration.
- Freshness sidecar schema (`version`, `content_sha256`, `last_updated_seen`, `captured_at`, `captured_by`) is established for Plan 04 verification.
- No blockers.


## Self-Check: PASSED

- `12-02-SUMMARY.md` exists at `.planning/phases/12-framework-blind-curation-machinery/12-02-SUMMARY.md`.
- Task commits found in git history: `9d2c700`, `4d80ff9`.
- Summary commit found in git history: `c8394ce`.
- No shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`) were modified.

---

*Phase: 12-framework-blind-curation-machinery*
*Completed: 2026-06-26*
