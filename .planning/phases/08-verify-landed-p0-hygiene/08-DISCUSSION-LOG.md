# Phase 8: Verify Landed P0 Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 8-verify-landed-p0-hygiene
**Areas discussed:** Evidence depth, Deliverable form, On failure, Replay target

---

## Evidence depth

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic replay (run it) | Execute every behavior against an acme-derived fixture and observe the result. Strongest proof; most setup. | |
| Static ground-truth read | Confirm each behavior from acme's committed artifacts + git log + diffs (PRD Source-A). Faster, observational. | |
| Hybrid — read + targeted runtime | Static for R1/Q1/Q2; dynamic runtime for R2/R3/R5 (the foundation Phase 10 extends). | ✓ |

**User's choice:** Hybrid — read + targeted runtime
**Notes:** Static read for R1, Q1, Q2 (acme artifacts + commits); dynamic runtime for R2 self-heal, R3 `../` guard, R5 buglog gate — the behaviors Phase 10/foundation depend on.

---

## Deliverable form

| Option | Description | Selected |
|--------|-------------|----------|
| Report + regression tests for R3/R5 | VERIFICATION.md + permanent vitest tests for R3's `../` guard and R5's exclude semantics (the Phase 10 foundation). | ✓ |
| Report only | Single VERIFICATION.md; zero files touched outside `.planning/`. | |
| Report + full regression suite | VERIFICATION.md + regression tests for all 6 behaviors. | |

**User's choice:** Report + regression tests for R3/R5
**Notes:** Tests count as evidence, not feature re-implementation. Planner caveat recorded in CONTEXT.md: `tests/hooks/post-write.test.ts` already covers some R3/R5 behavior (commit `9f63395`) — extend, don't duplicate.

---

## On failure

| Option | Description | Selected |
|--------|-------------|----------|
| Record gap + open follow-up | Report PASS/FAIL; log any FAIL as a follow-up; phase completes as verification. | ✓ |
| Stop and convert to fix | A failing behavior blocks the phase; fix in-place before continuing. | |
| Record gap, don't file anything | Note PASS/FAIL only; no follow-up bookkeeping. | |

**User's choice:** Record gap + open follow-up
**Notes:** Honors "no re-implementation" (ROADMAP criterion 4). Fixing a failing P0 behavior is a separate decision.

---

## Replay target

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen snapshot fixture | Copy acme state into a scratch fixture; run current `src/` behavior against it. Isolated, reproducible, non-mutating. | ✓ |
| Live acme working copy | Run/read against `../acme_translators` as-is. Authentic but mutable and Brian's-machine-only. | |
| Synthetic per-behavior fixtures | Minimal fixtures per acceptance scenario. Clean/CI-friendly but not literally "the acme repo." | |

**User's choice:** Frozen snapshot fixture
**Notes:** acme's installed hooks predate `withFileLock` (PRD line 146), so verify current `src/` against acme **data**, not stale installed hooks. Frozen snapshot grounds field-replay evidence; R3/R5 regression tests use synthetic inputs — complementary.

---

## Claude's Discretion

- Exact snapshot contents (which acme artifacts to copy).
- VERIFICATION.md table/section structure.

## Deferred Ideas

- Full P0 regression suite (all 6 behaviors) — scoped down to R3/R5 only this phase.
- Post-write hook applies no in-project exclusion (PRD E6) — that's the R6 gap, owned by Phase 10, not a Phase 8 failure.
