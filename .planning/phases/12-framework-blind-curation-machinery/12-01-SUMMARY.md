---
phase: 12
plan: 01
subsystem: framework-blind-curation-machinery
name: wolf-pantry dep-free staging aggregator + R9 freshness hash
tags: [hooks, curation, aggregator, sha256, tdd]
dependency_graph:
  requires: []
  provides: [src/hooks/wolf-pantry.ts]
  affects: [src/cli/learnings-cmd.ts, tests/hooks/wolf-pantry.test.ts]
tech_stack:
  added: []
  patterns:
    - node:fs / node:path / node:crypto builtins only in hook module
    - ENOENT-safe reads with non-ENOENT errors surfaced to stderr
    - per-session try/catch in directory walk for DoS mitigation (T-12-01)
key_files:
  created:
    - src/hooks/wolf-pantry.ts
    - tests/hooks/wolf-pantry.test.ts
  modified:
    - src/cli/learnings-cmd.ts
decisions:
  - Synthetic stub entry target is "cerebrum" (the primary shared context file per D12-05b)
  - collectAllEntries is not re-exported via shared.ts (CLI-only per D12-10/D10-09)
  - parseProposals/ProposalEntry re-exported from learnings-cmd.ts to preserve existing import paths
  - normalizeCerebrumBody strips the "Last updated" line before whitespace collapse
metrics:
  duration: 121s
  completed_date: 2026-06-26
  tasks: 3
  files_changed: 3
status: complete
---

# Phase 12 Plan 01: wolf-pantry dep-free staging aggregator + R9 freshness hash Summary

Created the dependency-free `src/hooks/wolf-pantry.ts` module that becomes the single source of truth for pending learning proposals and the R9 cerebrum freshness hash. The aggregator was relocated out of `src/cli/learnings-cmd.ts` to break the CLI↔CLI import cycle (D12-09), and presence-based stub detection was added so a non-empty `proposed-learnings.md` that yields zero parseable entries still surfaces exactly one synthetic pending entry (D12-05b).

## What Was Built

- `src/hooks/wolf-pantry.ts`
  - `ProposalEntry` interface exported.
  - `parseProposals(sessionDir, sessionId)` — relocated from `learnings-cmd.ts` with ENOENT-safe reads (no `../utils/` imports).
  - `collectAllEntries()` — walks `.wolf/sessions/*/proposed-learnings.md`, skips unreadable sessions, and synthesizes one stub entry per non-empty but unparseable staging file.
  - `normalizeCerebrumBody(content)` — removes the `> Last updated:` line, collapses whitespace, trims.
  - `hashCerebrumBody(content)` — `node:crypto` SHA-256 hex digest over the normalized body.
- `src/cli/learnings-cmd.ts` — removed the local `ProposalEntry`, `ENTRY_HEADER_REGEX`, `parseProposals`, and `collectAllEntries`; imports them from `wolf-pantry.js` and re-exports `parseProposals`/`ProposalEntry` for backward compatibility.
- `tests/hooks/wolf-pantry.test.ts` — full TDD coverage for all behavior bullets in the plan.

## Verification

- `npx vitest run tests/hooks/wolf-pantry.test.ts` — 13/13 passed.
- `npx vitest run tests/cli/learnings.test.ts` — 8/8 passed.
- `npx vitest run tests/cli/learnings-integration.test.ts` — 4/4 passed.
- `npx tsc --noEmit` — CLI build clean.
- `npx tsc --noEmit -p tsconfig.hooks.json` — hook build clean (C2).
- `grep` confirms zero imports from `../utils/` and zero references to `learnings-cmd.js` inside `src/hooks/wolf-pantry.ts`.

## Deviations from Plan

### Auto-fixed Issues

None.

### Test Implementation Adjustment

**[Rule 3 - Blocking issue] Replaced `vi.spyOn(fs, "readFileSync")` with a directory-as-file fixture**
- **Found during:** Task 1 RED / Task 2 GREEN verification
- **Issue:** Vitest in ESM mode cannot spy on `node:fs` namespace exports (`TypeError: Cannot redefine property: readFileSync`). The drafted test tried to mock `fs.readFileSync` to simulate a non-ENOENT read failure.
- **Fix:** Changed the unreadable-session fixture to create `sessions/<bad>/proposed-learnings.md` as a directory instead of a file. `fs.readFileSync` then throws a non-ENOENT error, exercising the exact per-session skip path and outer try/catch required by the plan. The test still asserts that the bad session is skipped, the stderr warning contains "cannot read session directory", and the good session is still counted.
- **Files modified:** `tests/hooks/wolf-pantry.test.ts`
- **Commit:** `0940d89`

No other deviations from the plan.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `815e52b` | test(12-01): add failing tests for wolf-pantry dep-free aggregator | `tests/hooks/wolf-pantry.test.ts` |
| `0940d89` | feat(12-01): create dep-free wolf-pantry hook module and relocate aggregator | `src/hooks/wolf-pantry.ts`, `src/cli/learnings-cmd.ts`, `tests/hooks/wolf-pantry.test.ts` |
| `708c457` | refactor(12-01): verify no circular imports and both type-checks pass | (verification-only, no code changes) |

## Self-Check: PASSED

- `src/hooks/wolf-pantry.ts` exists.
- `tests/hooks/wolf-pantry.test.ts` exists.
- All three commits are present in `git log`.
- No shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`) were modified.
