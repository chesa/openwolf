# Project: CHESA Fork Team Toolkit

## What This Is
The CHESA Fork Team Toolkit is a set of enhancements for the OpenWolf project (forked from `cytostack/openwolf`) designed to support team adoption, streamline fork management, and ensure concurrent-write safety.

## Core Value
Make the CHESA fork of OpenWolf easy to install, safe to collaborate on, and manageable to keep synced with upstream.

## Goals
1.  **Simplify installation and team onboarding** for 4-5 developers.
2.  **Enable fork divergence management** to easily stay synced with upstream.
3.  **Improve team workflow** with concurrent write protection and flexible metadata storage.

## Scope
- Pillar 1: Fork Installation & Team Onboarding
- Pillar 2: Fork Divergence Management
- Pillar 3: .wolf/ Team Workflow Improvements
- P2 Cleanup — hygiene items (clean script, .DS_Store removal)

## Requirements

### Validated

- ✓ Automated local dev setup (`scripts/install-dev.sh`, `install:dev` script) — v1.0
- ✓ Upstream remote auto-configuration for `cytostack/openwolf` — v1.0
- ✓ Fork divergence reporting (`scripts/sync-upstream.sh`) — v1.0
- ✓ Fork management documentation in README.md — v1.0
- ✓ Dynamic hook discovery replacing static HOOK_FILES — v1.0
- ✓ Advisory per-file locking (`withFileLock`) for concurrent .wolf/ write safety — v1.0
- ✓ OPENWOLF_METADATA_DIR env var support — v1.0
- ✓ .wolf/.gitignore template with mixed commit strategy — v1.0
- ✓ Documentation update (configuration.md, getting-started.md) — v1.0
- ✓ `pnpm clean` script with explicit path guards — v1.0
- ✓ `appendProposal()` per-session staging helper — v1.1
- ✓ Hooks redirect cerebrum/anatomy writes to propose-mode — v1.1
- ✓ OPENWOLF.md protocol updated for propose-mode — v1.1
- ✓ `openwolf learnings` list + interactive merge CLI — v1.1
- ✓ `openwolf learnings merge` with withFileLock-protected writes — v1.1
- ✓ Post-merge archive to `merged-learnings.md` — v1.1
- ✓ Concurrency accumulation test (multi-session merge, lock asserted) — v1.1
- ✓ Integration enumeration test (edge cases: empty, missing staging files) — v1.1

### Active

v1.2 — Shared-Context Tracking & Curation (see `.planning/REQUIREMENTS.md`):
- Verify landed P0 hygiene (R1/R2/R3/R5/Q1/Q2) against acme replay
- R4 `.wolf/.gitignore` template correction + hooks/ tracking (Q4)
- R6 hook-side in-project exclusion (dependency-free)
- R11 remove STATUS.md → framework-blind seam
- R7a/R7b + R9 framework-blind curation machinery

### Out of Scope

| Feature | Reason |
|---------|--------|
| `memory.md` propose-mode | Per-dev append-only log; interleaving acceptable; file is gitignored |
| Scanner-initiated `anatomy.md` rewrites | Authoritative single-process operation; no concurrency concern |
| Dashboard learning panel | Deferred to v1.2 — ship CLI first (DASH-01, DASH-02) |
| Real-time CRDT semantics | Human-merge (propose-mode) is the chosen model |

## Status
**v1.0 shipped** (2026-06-07) — 5 phases, 8 plans. Team toolkit ready.
**v1.1 shipped** (2026-06-24) — 3 phases, 3 plans. Propose-mode + learnings CLI + concurrency tests.
**v1.2 in planning** (2026-06-25) — Shared-Context Tracking & Curation.

## Current Milestone: v1.2 Shared-Context Tracking & Curation

**Goal:** Re-base OpenWolf's `.wolf/` commit model on *authored-vs-derived* (not shared-vs-per-dev) and ship the curation discipline, so committed shared context stays true, owned, and current instead of rotting into a "bigger junk drawer."

**Primary context:** `PRD-OpenWolf-Shared-Context-and-Curation.md` (repo root, untracked) — grounded in the `acme_translators` field deployment (3 devs, ~3 mo, 225 sessions).

**Target features:**
- Verify the already-landed P0 hygiene (R1 untrack anatomy.md, R2 self-heal scan, R3 out-of-project guard, R5 buglog code-file gating, Q1 `respect_gitignore`, Q2 nested/glob excludes) against the acme replay + commits — verification, not re-implementation.
- R4 — correct the `.wolf/.gitignore` template (drop false "hooks/ committed" claim; untrack `buglog.json`, `suggestions.json`, `hooks/`) + resolve compiled-`hooks/` tracking (Q4).
- R6 — hook-side in-project exclusion: dependency-free matcher honoring `exclude_patterns` + root `.gitignore` (closes the in-project leak R3 doesn't catch).
- R11 — remove `STATUS.md`; replace with the framework-blind resume seam (negative boundary in `OPENWOLF.md` + optional `config.json → openwolf.execution_layer` slot). Protocol change → ≥ minor bump.
- R7a/R7b + R9 — framework-blind curation machinery: continuous capture via the universal `stop` hook; promotion gated at the Git/PR boundary via a pull-based `openwolf status` count + an opt-in exit-code primitive; cerebrum freshness-delta integrity.

**Hard constraints:**
- **Framework-blind** — zero hardcoded GSD/`.planning`/Superpowers/gstack references in `src/templates`, `src/hooks`, `src/cli`.
- **No npm deps in hook-imported modules** — parse `.gitignore` into the existing regex matcher; never import `ignore` into the hook build.

**Deferred to a later rollout milestone:** R10 (provenance on cerebrum entries) and R12 (named pantry-owner role + curation runbook) — behavioral/org-design, not core engine code.

## Context

**Tech stack:** TypeScript (Node.js), pnpm, Bash (scripts), OpenWolf (forked from cytostack/openwolf)
**Codebase:** ~19,300 LOC across .ts, .js, .json, .md files (excluding node_modules, dist, .wolf, .planning)
**Git:** 330+ total commits; v1.1 added 18 commits, 21 files changed, +1,421 / −99 lines
**Version:** 1.2.0-beta (release tag: `release/1.2.0-beta`)

## Key Decisions

| Decision | Outcome | Status |
|----------|---------|--------|
| D-01: Name script install-dev.sh (not install-global) | Developer-focused onboarding, avoids global conflict | ✓ Good |
| D-02: Include upstream remote in install script | Idempotent HTTPS config for cytostack/openwolf | ✓ Good |
| D-03: Warn on global openwolf, don't auto-unlink | Non-destructive install, user chooses | ✓ Good |
| D-04: .wolf/.gitignore uses `*` + opt-in exceptions | Safest default for mixed commit strategy | ✓ Good |
| D-05: Read-only divergence reporter | No auto-merge/rebase; 170+ commits need human judgment | ✓ Good |
| D-06: Zero-consumer-changes for lock wrapper | 6 hook consumers unchanged | ✓ Good |
| D-07: Dual-path resolution (metadata vs hooks dirs) | Hooks always deploy to projectRoot/.wolf/hooks/ | ✓ Good |
| D-08: Propose-mode over direct edit for shared markdown | Per-session staging eliminates contention; human reviews via CLI | ✓ Good |
| D-09: Dashboard deferred to v1.2 — CLI ships first | Reduced v1.1 scope; DASH-01/DASH-02 tracked as follow-on | ✓ Good |
| D-10: Accumulation test, not cross-process concurrency test | In-process JS cannot prove cross-process safety; withFileLock assertion guards the contract | ✓ Good |
| D-11: Semver bump 1.0.5 → 1.1.0 for format-breaking change | NDJSON buglog + new CLI/API = minor, not patch | ✓ Good |
| D-12: release/ tag prefix for npm installs | Distinguishes package releases from GSD milestone tags (v1.0, v1.1) | ✓ Good |
| D-13: Commit model = authored-vs-derived (not shared-vs-per-dev) | Untrack anatomy.md + derived/noise; commit only what a named human can own, date, and validate | ✓ Good |
| D-14: Remove STATUS.md; OpenWolf stays framework-blind | Status belongs to the execution layer (abandoned after 225 acme sessions); negative boundary + optional config.json execution_layer slot, no tool names hardcoded | ✓ Good |
| D-15: R7 split — capture via stop hook, promotion at the Git boundary | Capture is continuous via the universal Claude Code `stop` primitive; promotion gated by a pull-based status count + opt-in exit-code check wired to pre-push/PR/CI — blind to both execution layer and VCS/CI host. Avoids the session-end lifecycle-modeling trap | ✓ Good |
| D-16: Defer R10/R12 to a later rollout milestone | Provenance + pantry-owner role are behavioral/org-design; don't block core engine code on team rituals | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

## Reference
- Specification (v1.0): `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md`
- Specification (v1.1): `docs/superpowers/specs/2026-06-23-shared-checkout-concurrency-design.md`
- Archive: `.planning/milestones/v1.0-ROADMAP.md`
- Archive: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Archive: `.planning/milestones/v1.1-ROADMAP.md`
- Archive: `.planning/milestones/v1.1-REQUIREMENTS.md`

---
*Last updated: 2026-06-25 — v1.2 milestone started*
