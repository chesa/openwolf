# Project: CHESA Fork Team Toolkit

## Overview
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

## Status
**v1.0 shipped** (2026-06-07) — all 5 phases complete (8 plans total). The toolkit is ready for team adoption.

## Context

**Tech stack:** TypeScript (Node.js), pnpm, Bash (scripts), OpenWolf (forked from cytostack/openwolf)
**Codebase:** ~17,890 LOC across .ts, .js, .json, .md files (excluding node_modules, dist, .wolf, .planning)
**Git:** 312 total commits, ~4,500 insertions in toolkit milestone

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

## Reference
- Specification: `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md`
- Archive: `.planning/milestones/v1.0-ROADMAP.md`
- Archive: `.planning/milestones/v1.0-REQUIREMENTS.md`

---
*Last updated: 2026-06-07 after v1.0 milestone*
