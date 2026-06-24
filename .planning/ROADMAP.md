# Roadmap: CHESA Fork Team Toolkit

## Milestones

- ✅ **v1.0 CHESA Fork Team Toolkit** — Phases 0-4 (shipped 2026-06-07)
- 🚧 **v1.1 Shared-Checkout Concurrency — Pillar C** — Phases 5-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 CHESA Fork Team Toolkit (Phases 0-4) — SHIPPED 2026-06-07</summary>

- [x] **Phase 0: Prerequisite Fix** - Remove vestigial HOOK_FILES constant (1 plan) — completed 2026-06-06
- [x] **Phase 1: Fork Installation & Team Onboarding** - Automated setup script + upstream remote (2 plans) — completed 2026-06-06
- [x] **Phase 2: Fork Divergence Management** - Read-only divergence reporter (1 plan) — completed 2026-06-06
- [x] **Phase 3: .wolf/ Team Workflow Improvements** - Dynamic hook discovery, file locking, metadata dir, gitignore template, docs (5 plans) — completed 2026-06-06
- [x] **Phase 4: P2 Cleanup** - pnpm clean script + .DS_Store removal (1 plan) — completed 2026-06-06

</details>

### 🚧 v1.1 Shared-Checkout Concurrency — Pillar C (In Progress)

**Milestone Goal:** Add a propose-and-review layer for shared markdown so concurrent Claude Code sessions cannot silently overwrite each other's learnings.

- [ ] **Phase 5: Propose-Mode Infrastructure** - appendProposal helper, hook redirect, and OPENWOLF.md protocol update
- [ ] **Phase 6: Learnings Review CLI** - openwolf learnings list and merge commands with consumed-tracking
- [ ] **Phase 7: Concurrency & Integration Tests** - Verify two-session propose-and-merge produces no data loss

## Phase Details

### Phase 5: Propose-Mode Infrastructure
**Goal**: Hooks write learnings to a per-session staging file rather than directly editing shared markdown
**Depends on**: Phase 4 (v1.0 complete — withFileLock already available)
**Requirements**: PROP-01, PROP-02, PROTO-01
**Success Criteria** (what must be TRUE):
  1. `appendProposal('cerebrum', content)` and `appendProposal('anatomy', content)` append a timestamped entry to `.wolf/sessions/<id>/proposed-learnings.md` without touching `cerebrum.md` or `anatomy.md`
  2. Every hook that previously called `appendMarkdown` targeting `cerebrum.md` or `anatomy.md` now calls `appendProposal()` instead — no hook writes shared markdown directly
  3. The `src/templates/OPENWOLF.md` template instructs Claude to use the proposal path rather than editing shared files directly
  4. Two simultaneous sessions can each write proposals without contention (per-session files eliminate the race)
**Plans**: 1 plan

### Phase 6: Learnings Review CLI
**Goal**: `openwolf learnings` lets the developer review, select, and merge staged proposals into shared markdown
**Depends on**: Phase 5
**Requirements**: MERGE-01, MERGE-02, MERGE-03
**Success Criteria** (what must be TRUE):
  1. `openwolf learnings` lists all pending proposals across all session directories, showing session ID, timestamp, target file, and a content preview
  2. `openwolf learnings merge` interactively merges selected proposals into `cerebrum.md` and/or `anatomy.md`; the write is protected by `withFileLock`
  3. After a successful merge, processed entries move from `proposed-learnings.md` to `merged-learnings.md` in the same session directory; the staging file contains only unmerged proposals
  4. No other process writes `cerebrum.md` or `anatomy.md` — the merge command is the single writer
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — openwolf learnings list and merge commands with consumed-tracking archive

### Phase 7: Concurrency & Integration Tests
**Goal**: Automated tests confirm the propose-and-merge workflow survives concurrent sessions without data loss
**Depends on**: Phase 6
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. A concurrency test that simulates two sessions each appending a distinct proposal runs `openwolf learnings merge` once and asserts both entries appear in `cerebrum.md` with no loss
  2. An integration test asserts that `openwolf learnings` correctly enumerates proposals from multiple session directories, including edge cases (empty staging file, missing session dir)
  3. All new tests pass in the existing vitest suite (`pnpm test`) with no regressions
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 0. Prerequisite Fix | v1.0 | 1/1 | Complete | 2026-06-06 |
| 1. Fork Installation & Team Onboarding | v1.0 | 2/2 | Complete | 2026-06-06 |
| 2. Fork Divergence Management | v1.0 | 1/1 | Complete | 2026-06-06 |
| 3. .wolf/ Team Workflow Improvements | v1.0 | 5/5 | Complete | 2026-06-06 |
| 4. P2 Cleanup | v1.0 | 1/1 | Complete | 2026-06-06 |
| 5. Propose-Mode Infrastructure | v1.1 | 0/1 | Planning | - |
| 6. Learnings Review CLI | v1.1 | 0/1 | Planned | - |
| 7. Concurrency & Integration Tests | v1.1 | 0/? | Not started | - |
