# Roadmap: CHESA Fork Team Toolkit

## Milestones

- ✅ **v1.0 CHESA Fork Team Toolkit** — Phases 0-4 (shipped 2026-06-07)
- ✅ **v1.1 Shared-Checkout Concurrency — Pillar C** — Phases 5-7 (shipped 2026-06-24)
- ✅ **v1.2 Shared-Context Tracking & Curation** — Phases 8-12 (shipped 2026-06-26)

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
<summary>✅ v1.2 Shared-Context Tracking & Curation (Phases 8-12) — SHIPPED 2026-06-26</summary>

- [x] **Phase 8: Verify Landed P0 Hygiene** - Map each shipped P0 behavior to its commit and confirm it holds on the acme replay (VER-01) (completed 2026-06-26)
- [x] **Phase 9: Tracking Hygiene — One Authoritative Ignore List** - Correct the `.wolf/.gitignore` template; untrack derived `hooks/`/`buglog.json`/`suggestions.json` (R4) (2 plans) (completed 2026-06-26)
- [x] **Phase 10: Hook-Side In-Project Exclusion** - Dependency-free shared matcher honoring `exclude_patterns` + root `.gitignore` in the post-write hook (R6) (completed 2026-06-26)
- [x] **Phase 11: Framework-Blind Resume Protocol** - Remove STATUS.md; assert the negative boundary + generic resume seam in OPENWOLF.md (R11) (3 plans) (completed 2026-06-25)
- [x] **Phase 12: Framework-Blind Curation Machinery** - Continuous capture, Git-boundary promotion gate, and cerebrum freshness integrity (R7a, R7b, R9) (4 plans) (completed 2026-06-26)

</details>

## Current Status

All planned milestones shipped. The CHESA fork team toolkit is complete through v1.2.

For historical detail see `.planning/milestones/v1.2-ROADMAP.md`.
