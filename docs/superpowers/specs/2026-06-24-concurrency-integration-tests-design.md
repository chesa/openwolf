# Concurrency & Integration Tests — Phase 7 Design

**Date:** 2026-06-24
**Phase:** 7 (final phase of milestone v1.1 Shared-Checkout Concurrency — Pillar C)
**Depends on:** Phase 5 (appendProposal), Phase 6 (learnings CLI list/merge)

## Objective

Automated tests confirming the propose-and-merge workflow survives concurrent sessions without data loss, and that `openwolf learnings` correctly enumerates proposals across session directories.

## Success Criteria

1. Concurrency test simulates two sessions, each appending a distinct proposal; after `openwolf learnings merge`, both entries are present in `cerebrum.md` with no loss.
2. Integration test asserts `openwolf learnings` enumerates proposals from multiple session directories, including edge cases (empty staging file, missing session dir).
3. Both tests pass in the existing vitest suite (`pnpm test`) with no regressions.

## Test Plan

### File 1: `tests/cli/concurrency.test.ts`

- **Mock setup:** `getWolfDir` → temp dir; `withFileLock` → pass-through; `readline` → programmatic answers (`['a', 'y']`)
- **Two-session scenario:**
  1. Create `.wolf/sessions/sess001/proposed-learnings.md` with one `→ cerebrum` entry
  2. Create `.wolf/sessions/sess002/proposed-learnings.md` with a distinct `→ cerebrum` entry
  3. Call `learningsMergeCommand()`
  4. Assert `cerebrum.md` contains both entries
  5. Assert both `merged-learnings.md` files exist with consumed entries

### File 2: `tests/cli/learnings-integration.test.ts`

- **Multi-session enumeration:**
  1. Create 3 session dirs: two with proposals, one empty, one missing
  2. Call `learningsCommand()` (no filter)
  3. Assert table output contains proposals from both populated sessions
  4. Assert no crash for empty/missing dirs

## What IS NOT tested

- Real concurrent file writes (OS-level race) — `withFileLock` is already unit-tested in Phase 3; the staging files are per-session so no shared-file race exists
- Dashboard integration — deferred to v1.2
- readline interactive edge cases — manual test path documented in Phase 6 summary

## Risk

Low. Both tests use the same mocking infrastructure as existing Phase 6 tests. The concurrency test validates the end-to-end merge path that was previously only manually tested.
