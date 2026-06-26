---
phase: 12-framework-blind-curation-machinery
plan: 04
subsystem: cli
name: status Curation block + R9 freshness integrity
tags: [cli, status, curation, R7b, R9, freshness, tdd]
dependency_graph:
  requires:
    - phase: 12-01
      provides: "collectAllEntries, hashCerebrumBody, ProposalEntry in src/hooks/wolf-pantry.ts"
    - phase: 12-02
      provides: "learnings check/accept subcommands and cerebrum-freshness.json schema"
    - phase: 12-03
      provides: "R7a stop-hook capture stub"
  provides:
    - "openwolf status Curation section with pending count via collectAllEntries"
    - "R9 freshness check in status: bootstrap-on-missing, theater flag, read-only otherwise"
    - "FreshnessSidecar type and status-bootstrap captured_by provenance"
  affects:
    - "Phase 12 verification gates (C1/C2)"
    - "Future status.ts maintainers"
tech_stack:
  added: []
  patterns:
    - "Plain console.log output with ✓/✗/- markers (D11-07)"
    - "CLI imports from dep-free hook module wolf-pantry.ts as peer"
    - "Sidecar write gated strictly inside if (!sidecar) (D12-14)"
    - "writeJSON from fs-safe.ts for CLI context bootstrap write"
key_files:
  created: []
  modified:
    - "src/cli/status.ts"
    - "tests/cli/status.test.ts"
    - "CHANGELOG.md"
key-decisions:
  - "Reused fs-safe writeJSON for the bootstrap write instead of hook wolf-json writeJSON to keep CLI/hook separation"
  - "Placed Curation section after Anatomy and before Cron state to group knowledge-file checks together"
  - "Flag freshness theater with ✗ marker per D11-07 (actionable anomaly) rather than a softer warning marker"
patterns-established:
  - "status reads collectAllEntries directly from wolf-pantry.ts — same source of truth as the gate"
  - "status sidecar is the third sanctioned baseline writer (status-bootstrap) and never overwrites an existing sidecar"
requirements-completed:
  - R7b
  - R9
metrics:
  duration: "3 min"
  completed: "2026-06-26"
  tasks: 3
  files_changed: 3
status: complete
---

# Phase 12 Plan 04: status Curation block + R9 freshness integrity Summary

**Added the read-only pull surfaces to `openwolf status`: a Curation section reporting pending learnings through the same aggregator the gate uses, and an R9 freshness check that bootstraps a missing sidecar once, flags date-only `> Last updated:` bumps as freshness theater, and stays strictly read-only when the sidecar exists.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-26T03:55:00Z
- **Completed:** 2026-06-26T03:58:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `openwolf status` now shows a Curation section with the pending learnings count sourced from `collectAllEntries()` in `src/hooks/wolf-pantry.ts`.
- Added R9 freshness integrity check to `status`: compares a SHA-256 hash of the normalized `cerebrum.md` body against `.wolf/cerebrum-freshness.json`.
- Bootstrap-on-missing behavior: a fresh clone with no sidecar gets a baseline written once with `captured_by: status-bootstrap`, with no theater flag.
- Existing sidecars are read-only under `status`; a date-only bump on unchanged content is flagged, while real content changes are reported as current without rebaselining.
- Extended `tests/cli/status.test.ts` with six cases covering pending count, no-pending, bootstrap, theater, real content change, and read-only behavior.
- Updated `CHANGELOG.md` under the existing `[1.3.0-beta]` section to document the new Phase 12 curation API.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — extend tests/cli/status.test.ts with pending-count + R9 cases** — `31a1982` (test)
2. **Task 2: GREEN — add the Curation + freshness block to status.ts** — `884899f` (feat)
3. **Task 3: Phase gates — full suite, C1/C2 grep, CHANGELOG entry** — `7fdeb29` (docs)

## Files Created/Modified

- `src/cli/status.ts` — Added imports from `wolf-pantry.js`, local `FreshnessSidecar` type, Curation section, and R9 freshness block with bootstrap-on-missing.
- `tests/cli/status.test.ts` — Added six new status cases plus `wolf-paths.js` mock and `hashCerebrumBody` fixture helper.
- `CHANGELOG.md` — Added "Added" subsection under `[1.3.0-beta]` documenting `learnings check`, `learnings accept`, stop-hook capture, and R9 freshness.

## Decisions Made

- Followed the plan's peer-import pattern: `status.ts` imports `collectAllEntries` and `hashCerebrumBody` directly from `../hooks/wolf-pantry.js` rather than through any CLI re-export.
- Used `fs-safe.writeJSON` for the bootstrap write (CLI context) instead of the hook `wolf-json.writeJSON` to preserve CLI/hook separation, even though the sidecar file lives in `.wolf/`.
- Chose `✗` for the theater flag marker to match the existing "actionable anomaly" convention in `status.ts` rather than a softer informational marker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect assertion in R9 real-content-change test**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** The "does NOT flag on real content change" test asserted `lines.some((l) => l.includes("✓ current"))`, but the actual status output line is `  ✓ cerebrum.md: current`. The substring "✓ current" does not appear contiguously, so the assertion always failed despite the implementation being correct.
- **Fix:** Changed the assertion to `lines.some((l) => l.includes("✓ cerebrum.md: current"))`.
- **Files modified:** `tests/cli/status.test.ts`
- **Verification:** `npx vitest run tests/cli/status.test.ts` passes all 11 cases.
- **Committed in:** `884899f` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test bug)
**Impact on plan:** Minor test-only correction. No scope creep or implementation change.

## Issues Encountered

- None beyond the test assertion bug above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 is complete. All four plans in the phase are delivered and the phase gates pass.
- No blockers.

## Self-Check: PASSED

- `src/cli/status.ts` exists and contains `collectAllEntries`, `hashCerebrumBody`, `FreshnessSidecar`, and the bootstrap-only `writeJSON` call.
- `tests/cli/status.test.ts` exists with 11 passing tests.
- `CHANGELOG.md` contains the Phase 12 entry.
- Commits `31a1982`, `884899f`, `7fdeb29` are present in `git log`.
- No shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`) were modified.

---

*Phase: 12-framework-blind-curation-machinery*
*Completed: 2026-06-26*
