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

(None — start next milestone with `/gsd-new-milestone`)

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
*Last updated: 2026-06-24 after v1.1 milestone*
