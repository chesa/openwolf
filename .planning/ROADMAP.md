# Roadmap: CHESA Fork Team Toolkit

## Milestones

- ✅ **v1.0 CHESA Fork Team Toolkit** — Phases 0-4 (shipped 2026-06-07)
- ✅ **v1.1 Shared-Checkout Concurrency — Pillar C** — Phases 5-7 (shipped 2026-06-24)
- 🚧 **v1.2 Shared-Context Tracking & Curation** — Phases 8-12 (≥ minor release: new matcher API + protocol change)

## Phases

<details>
<summary>✅ v1.0 CHESA Fork Team Toolkit (Phases 0-4) — SHIPPED 2026-06-07</summary>

- [x] **Phase 0: Prerequisite Fix** - Remove vestigial HOOK_FILES constant (1 plan) — completed 2026-06-06
- [x] **Phase 1: Fork Installation & Team Onboarding** - Automated setup script + upstream remote (2 plans) — completed 2026-06-06
- [x] **Phase 2: Fork Divergence Management** - Read-only divergence reporter (1 plan) — completed 2026-06-06
- [x] **Phase 3: .wolf/ Team Workflow Improvements** - Dynamic hook discovery, file locking, metadata dir, gitignore template, docs (5 plans) — completed 2026-06-06
- [x] **Phase 4: P2 Cleanup** - pnpm clean script + .DS_Store removal (1 plan) — completed 2026-06-06

</details>

<details>
<summary>✅ v1.1 Shared-Checkout Concurrency — Pillar C (Phases 5-7) — SHIPPED 2026-06-24</summary>

- [x] **Phase 5: Propose-Mode Infrastructure** - appendProposal helper, hook redirect, and OPENWOLF.md protocol update (1 plan) — completed 2026-06-23
- [x] **Phase 6: Learnings Review CLI** - openwolf learnings list and merge commands with consumed-tracking (1 plan) — completed 2026-06-24
- [x] **Phase 7: Concurrency & Integration Tests** - Verify two-session propose-and-merge produces no data loss (1 plan) — completed 2026-06-24

</details>

<details>
<summary>🚧 v1.2 Shared-Context Tracking & Curation (Phases 8-12) — IN PLANNING</summary>

- [ ] **Phase 8: Verify Landed P0 Hygiene** - Map each shipped P0 behavior to its commit and confirm it holds on the acme replay (VER-01)
- [x] **Phase 9: Tracking Hygiene — One Authoritative Ignore List** - Correct the `.wolf/.gitignore` template; untrack derived `hooks/`/`buglog.json`/`suggestions.json` (R4) (2 plans) (completed 2026-06-26)
- [x] **Phase 10: Hook-Side In-Project Exclusion** - Dependency-free shared matcher honoring `exclude_patterns` + root `.gitignore` in the post-write hook (R6) (completed 2026-06-26)
- [ ] **Phase 11: Framework-Blind Resume Protocol** - Remove STATUS.md; assert the negative boundary + generic resume seam in OPENWOLF.md (R11)
- [ ] **Phase 12: Framework-Blind Curation Machinery** - Continuous capture, Git-boundary promotion gate, and cerebrum freshness integrity (R7a, R7b, R9)

</details>

## Phase Details

### Phase 8: Verify Landed P0 Hygiene

**Goal**: Confirm the already-shipped P0 hygiene behaves correctly before anything builds on it — no re-implementation, just a commit↔behavior verification record.
**Depends on**: Nothing (first v1.2 phase; verifies work already on `develop-preview`)
**Requirements**: VER-01
**Success Criteria** (what must be TRUE):

  1. Each P0 behavior (R1 untrack `anatomy.md`, R2 self-heal scan, R3 out-of-project `../` guard, R5 buglog code-file gating, Q1 `respect_gitignore`, Q2 nested/glob excludes) behaves per its PRD acceptance criterion when replayed against the acme repo.
  2. A verification report records every behavior mapped to its `develop-preview` commit (R1→`cac925a`, R2→`c430a9b`, R3→`cac925a`, R5→`9f63395`, Q1→`3ef255c`, Q2→`2f3e1f6`).
  3. R3's out-of-project `../` guard and R5's exclude semantics are confirmed to still hold — the foundation Phase 10 (R6) extends.
  4. Nothing is re-implemented; the phase produces evidence, not code changes.

**Plans**: 2/2 plans complete
**Wave 1**

- [x] 08-01-PLAN.md — Lock R3/R5 with acme-grounded regression tests; confirm R2/Q1/Q2 suites green; capture field-data audit

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — Author 08-VERIFICATION.md commit↔behavior record (PASS/FAIL + evidence for all six P0 behaviors)

### Phase 9: Tracking Hygiene — One Authoritative Ignore List

**Goal**: Re-base the `.wolf/` commit model on authored-vs-derived (D-13) by establishing a single authoritative ignore list, so committed shared context contains only what a named human can own and validate.
**Depends on**: Phase 8 (P0 hygiene verified)
**Requirements**: R4
**Success Criteria** (what must be TRUE):

  1. The corrected `.wolf/.gitignore` template no longer carries the false "hooks/ are committed" claim and untracks `buglog.json`, `suggestions.json`, and compiled `hooks/` (D-17).
  2. `git ls-files .wolf/` matches the documented authored set exactly — derived build output is gone from version control.
  3. The template documents the rule "the consumer root `.gitignore` must not re-list `.wolf/` paths," and clone-time rebuild of untracked `hooks/` is guaranteed via the R2 self-heal pattern and/or documented `openwolf update` discipline.

**Plans**: 2/2 plans complete
**Wave 1** *(parallel — no file overlap)*

- [x] 09-01-PLAN.md — Rewrite `wolf-gitignore` (authored-vs-derived; untrack `hooks/`/`buglog.json`, reserve `cerebrum-freshness.json`) + extend `checkRootGitIgnore` advisory + lock with Vitest assertions
- [x] 09-02-PLAN.md — Document the human-runnable `git rm --cached` migration + consumer root-`.gitignore` rule + CLI-side clone-time `hooks/` rebuild in `docs/updating.md`

### Phase 10: Hook-Side In-Project Exclusion

**Goal**: Close the in-project anatomy leak the R3 `../` guard can't catch — a developer-excluded or gitignored in-project directory must never enter `anatomy.md` via the post-write hook, using a dependency-free matcher.
**Depends on**: Phase 8 (R3 `../` guard verified — R6 injects after it)
**Requirements**: R6
**Success Criteria** (what must be TRUE):

  1. The `exclude_patterns` matcher (`globToRegExp`, `matchesPattern`, `shouldExclude`) lives in one shared dep-free module (`src/hooks/wolf-ignore.ts`, re-exported via `shared.ts`) consumed by both the hook and the scanner — no copy drift.
  2. An excluded **or** root-`.gitignore`-ignored in-project directory never enters `anatomy.md` through the hook, while the R3 out-of-project skip is preserved and normal in-project files are still recorded.
  3. `tsc --noEmit -p tsconfig.hooks.json` is clean — the hook bundle imports no `node_modules` package (C2); the scanner keeps its `ignore` dep as the authoritative full-scan backstop (D-18).
  4. The `build:hooks` → `openwolf update` copy step is exercised so the new hook behavior is live in `.wolf/hooks/`, not inert in `dist/hooks/`.

**Plans**: 2/2 plans complete

**Wave 1**

- [x] 10-01-PLAN.md — Promote the matcher into a shared dep-free `wolf-ignore.ts` + add the root-`.gitignore` parser; scanner re-imports; unit tests + C2 `tsc` gate

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — Wire `exclude_patterns` + `.gitignore` gates into `recordAnatomyWrite` after the R3 guard; E6/gitignore integration tests; exercise `build:hooks` → `openwolf update`

### Phase 11: Framework-Blind Resume Protocol

**Goal**: Remove OpenWolf's ownership of status/roadmap/intent — replace STATUS.md with a generic, tool-agnostic resume seam so the protocol works under any execution layer (D-14).
**Depends on**: Phase 8 (independent of R4/R6; sequenced before Phase 12 because both touch `src/hooks/stop.ts`)
**Requirements**: R11
**Success Criteria** (what must be TRUE):

  1. `openwolf init` seeds no STATUS.md; `OPENWOLF.md` asserts the negative boundary (OpenWolf does not own status/roadmap/intent) plus a generic resume order (execution-layer plan/status if present → `cerebrum.md` → recent `memory.md`) naming no tool.
  2. OpenWolf reads an optional `config.json → openwolf.execution_layer` hint when a repo sets one; both `stop.ts` nudges (the "/clear" nudge and the "STATUS.md missing" nudge) are removed/replaced.
  3. `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` returns **zero** (C1).
  4. The test suite is green and the change carries a ≥ minor version bump (protocol change).

**Plans**: 3 plans

**Wave 1** *(parallel — no file overlap)*

- [ ] 11-01-PLAN.md — Delete STATUS.md template; rewrite OPENWOLF.md/claude-rules-openwolf.md to the framework-blind resume seam; add config.json `execution_layer` slot; strip `seedStatus()` from init.ts; invert init test
- [ ] 11-02-PLAN.md — Delete `checkStatusFreshness()` from stop.ts; make wolf-ignore.ts JSDoc C1-clean; rebuild + copy the hook bundle (C1/C2 gates)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 11-03-PLAN.md — Surface `execution_layer` in `openwolf status` + session-start (TDD); rewrite current guides; banner historical artifacts; create CHANGELOG entry

### Phase 12: Framework-Blind Curation Machinery

**Goal**: Ship the curation discipline so committed shared context stays owned and current — continuous capture, a promotion gate at the universal Git/PR boundary, and integrity against "freshness theater."
**Depends on**: Phase 9 (R9's `cerebrum-freshness.json` sidecar must land in R4's authoritative ignore list), Phase 11 (R7a's `stop` hook capture must not re-introduce STATUS/session-end coupling)
**Requirements**: R7a, R7b, R9
**Success Criteria** (what must be TRUE):

  1. A session that learns something leaves a staged `proposed-learnings` entry regardless of execution layer, written via the universal `stop` hook (`appendProposal()`), on a dependency-free path (C2 — `tsc --noEmit -p tsconfig.hooks.json` clean).
  2. `openwolf learnings check` exits `0` clean / `1` pending / `2` operational error (JSON on stdout only under `--json`; human summary to stderr; `--quiet` for CI), and `openwolf status` reports the pending learnings count — both routed through `collectAllEntries()` (D-19).
  3. A date-only `> Last updated:` bump on `cerebrum.md` is flagged in `openwolf status` while a real content change is not, via a `node:crypto` SHA-256 body hash in the gitignored `.wolf/cerebrum-freshness.json` sidecar; `status` stays read-only and baseline updates only on sanctioned curation (`learnings merge` + `learnings accept` + bootstrap-on-missing) (D-20).
  4. `grep -rIiE 'bitbucket|github|pipelines|pre-push' src/` returns zero and `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` returns zero (C1) — host wiring lives only in docs.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 0. Prerequisite Fix | v1.0 | 1/1 | Complete | 2026-06-06 |
| 1. Fork Installation & Team Onboarding | v1.0 | 2/2 | Complete | 2026-06-06 |
| 2. Fork Divergence Management | v1.0 | 1/1 | Complete | 2026-06-06 |
| 3. .wolf/ Team Workflow Improvements | v1.0 | 5/5 | Complete | 2026-06-06 |
| 4. P2 Cleanup | v1.0 | 1/1 | Complete | 2026-06-06 |
| 5. Propose-Mode Infrastructure | v1.1 | 1/1 | Complete | 2026-06-23 |
| 6. Learnings Review CLI | v1.1 | 1/1 | Complete | 2026-06-24 |
| 7. Concurrency & Integration Tests | v1.1 | 1/1 | Complete | 2026-06-24 |
| 8. Verify Landed P0 Hygiene | v1.2 | 2/2 | Complete   | 2026-06-26 |
| 9. Tracking Hygiene — One Authoritative Ignore List | v1.2 | 2/2 | Complete    | 2026-06-26 |
| 10. Hook-Side In-Project Exclusion | v1.2 | 2/2 | Complete    | 2026-06-26 |
| 11. Framework-Blind Resume Protocol | v1.2 | 0/3 | Not started | - |
| 12. Framework-Blind Curation Machinery | v1.2 | 0/? | Not started | - |
