# Project: CHESA Fork Team Toolkit

## What This Is
The CHESA Fork Team Toolkit is a set of enhancements for the OpenWolf project (forked from `cytostack/openwolf`) designed to support team adoption, streamline fork management, ensure concurrent-write safety, and keep shared context curated instead of rotting.

## Core Value
Make the CHESA fork of OpenWolf easy to install, safe to collaborate on, manageable to keep synced with upstream, and honest about the context it shares.

## Goals
1.  **Simplify installation and team onboarding** for 4-5 developers.
2.  **Enable fork divergence management** to easily stay synced with upstream.
3.  **Improve team workflow** with concurrent write protection and flexible metadata storage.
4.  **Curate shared context** so committed `.wolf/` artifacts are authored, owned, and current.

## Scope
- Pillar 1: Fork Installation & Team Onboarding
- Pillar 2: Fork Divergence Management
- Pillar 3: `.wolf/` Team Workflow Improvements
- Pillar 4: Shared-Context Tracking & Curation
- P2 Cleanup — hygiene items (clean script, `.DS_Store` removal)

## Requirements

### Validated

- ✓ Automated local dev setup (`scripts/install-dev.sh`, `install:dev` script) — v1.0
- ✓ Upstream remote auto-configuration for `cytostack/openwolf` — v1.0
- ✓ Fork divergence reporting (`scripts/sync-upstream.sh`) — v1.0
- ✓ Fork management documentation in README.md — v1.0
- ✓ Dynamic hook discovery replacing static HOOK_FILES — v1.0
- ✓ Advisory per-file locking (`withFileLock`) for concurrent `.wolf/` write safety — v1.0
- ✓ `OPENWOLF_METADATA_DIR` env var support — v1.0
- ✓ `.wolf/.gitignore` template with mixed commit strategy — v1.0
- ✓ Documentation update (configuration.md, getting-started.md) — v1.0
- ✓ `pnpm clean` script with explicit path guards — v1.0
- ✓ `appendProposal()` per-session staging helper — v1.1
- ✓ Hooks redirect cerebrum/anatomy writes to propose-mode — v1.1
- ✓ `OPENWOLF.md` protocol updated for propose-mode — v1.1
- ✓ `openwolf learnings` list + interactive merge CLI — v1.1
- ✓ `openwolf learnings merge` with `withFileLock`-protected writes — v1.1
- ✓ Post-merge archive to `merged-learnings.md` — v1.1
- ✓ Concurrency accumulation test (multi-session merge, lock asserted) — v1.1
- ✓ Integration enumeration test (edge cases: empty, missing staging files) — v1.1
- ✓ P0 hygiene verification (R1/R2/R3/R5/Q1/Q2) grounded against acme replay — v1.2
- ✓ `.wolf/.gitignore` template correction + untrack derived `buglog.json`/`suggestions.json`/`hooks/` (R4, Q4) — v1.2
- ✓ Hook-side in-project exclusion matcher honoring `exclude_patterns` + root `.gitignore` with zero npm deps (R6) — v1.2
- ✓ Framework-blind resume protocol: remove `STATUS.md`, rewrite `OPENWOLF.md` to tool-agnostic 3-step order with `execution_layer` config slot (R11) — v1.2
- ✓ Framework-blind curation machinery: stop-hook capture, `openwolf learnings check`/`accept` primitives, `openwolf status` read-only curation + R9 freshness integrity (R7a, R7b, R9) — v1.2

### Active

No active requirements. All planned milestones have shipped.

### Out of Scope

| Feature | Reason |
|---------|--------|
| `memory.md` propose-mode | Per-dev append-only log; interleaving acceptable; file is gitignored |
| Scanner-initiated `anatomy.md` rewrites | Authoritative single-process operation; no concurrency concern |
| Dashboard learning panel | Deferred to a later rollout milestone (DASH-01, DASH-02) |
| Real-time CRDT semantics | Human-merge (propose-mode) is the chosen model |
| R10 provenance on cerebrum entries | Behavioral/org-design; defer to a later rollout milestone |
| R12 named pantry-owner role + curation runbook | Behavioral/org-design; defer to a later rollout milestone |

## Status
**v1.0 shipped** (2026-06-07) — 5 phases, 8 plans. Team toolkit ready.
**v1.1 shipped** (2026-06-24) — 3 phases, 3 plans. Propose-mode + learnings CLI + concurrency tests.
**v1.2 shipped** (2026-06-26) — 5 phases, 13 plans. Shared-context tracking & curation complete.

All planned milestones shipped. The CHESA fork team toolkit is complete through v1.2.

## Context

**Tech stack:** TypeScript (Node.js), pnpm, Bash (scripts), OpenWolf (forked from cytostack/openwolf)
**Codebase:** ~19,300 LOC across `.ts`, `.js`, `.json`, `.md` files (excluding node_modules, dist, .wolf, .planning)
**Git:** 330+ total commits; v1.2 added 21 commits, 25 files changed
**Version:** 1.2.0 (release tag: `release/1.2.0`, milestone tag: `v1.2`)

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
| D-17: Untrack compiled `hooks/` (Q4) | Derived build output; committing JS artifacts causes merge conflicts + path noise — rebuild on clone via self-heal / `openwolf update` | ✓ Good |
| D-18: R6 — keep `ignore` dep CLI/daemon-only; zero-dep matcher in the hook | Honors C2 (no deps in hook build); full scan stays the authoritative backstop; accept the hook/scanner `.gitignore` engine split | ✓ Good |
| D-19: R7b — `openwolf learnings check` subcommand (not a `--check` flag) | Keeps the top-level CLI namespace clean; scales with future `learnings list/prune` | ✓ Good |
| D-20: R9 — `status` is read-only; baseline updates only via sanctioned curation | A read command must not mutate state; baseline = "last *sanctioned* content" (merge + explicit `learnings accept` + bootstrap-on-missing), not "last content a status run observed" | ✓ Good |
| D-21: Reconciliation = baseline reset onto upstream v2.5.0 (not rebase or cherry-pick) | 386 ahead / 86 behind merge-base `f68be48` with 45 mutually-touched files, and upstream v2.x is a near-rewrite (hooks 6 → ~15+, new `src/agents/` + `src/anatomy/`, 7 new CLI subcommands); replaying 184 code commits costs more than rebuilding the 5 fork-unique pillars on a clean base. Retires `wolf-lock`/`wolf-ignore` as upstream duplicates pending Q-01 | ◻ Pending |
| D-22: D-14 reaffirmed — "framework-blind" scopes to the execution layer, not the host agent | D-14's own rationale binds status to the execution layer (planner / task tracker / agent), and D-15 already depends on the universal Claude Code `stop` primitive while claiming framework-blindness — so host-agent integration is sanctioned and execution-layer coupling is not. Makes upstream's `memory-migrate.ts` (cerebrum → native memory) an adoption candidate rather than a violation. Only `STATUS.md` is a genuine D-14 tripwire, already guarded by `tests/cli/init.test.ts:462` | ✓ Good |

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
- Specification (v1.2): `PRD-OpenWolf-Shared-Context-and-Curation.md` (repo root, untracked)
- Archive: `.planning/milestones/v1.0-ROADMAP.md`
- Archive: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Archive: `.planning/milestones/v1.1-ROADMAP.md`
- Archive: `.planning/milestones/v1.1-REQUIREMENTS.md`
- Archive: `.planning/milestones/v1.2-ROADMAP.md`
- Archive: `.planning/milestones/v1.2-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.2-MILESTONE-AUDIT.md`

---
*Last updated: 2026-08-24 — D-21/D-22 logged from upstream reconciliation exploration*
