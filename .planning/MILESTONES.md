# Milestones

## v1.2 Shared-Context Tracking & Curation (Shipped: 2026-06-26)

**Phases completed:** 5 phases, 13 plans, 17 tasks

**Key accomplishments:**

- Verified all six P0 behaviors map to `develop-preview` commits and are regression-tested (`08-VERIFICATION.md`)
- Grounded permanent R3 (`../` guard) and R5 (code-file gate) regression tests in the test suite
- Documented the v1.2 tracking-hygiene migration in `docs/updating.md` (untrack step, root `.gitignore` override, clone-time `hooks/` rebuild)
- Deleted `STATUS.md` template and `seedStatus`, rewrote `OPENWOLF.md`/claude-rules to a tool-agnostic 3-step resume order with an `execution_layer` config slot
- Shipped `openwolf learnings check` (exit-code primitive), `openwolf learnings accept` (sanctioned baseline writer), and merge-time `cerebrum-freshness.json` re-baseline — all host/layer-neutral and TDD-covered
- Wired a fixed-literal structural learning breadcrumb into the universal stop hook so code-mutating sessions without model-authored proposals always trip the Plan 02 promotion gate
- Added read-only curation surfaces to `openwolf status`: pending learnings aggregation and an R9 freshness check that bootstraps a missing sidecar once, flags date-only `> Last updated:` bumps as freshness theater, and stays read-only when the sidecar exists

---

## v1.1 Shared-Checkout Concurrency — Pillar C (Shipped: 2026-06-24)

**Phases completed:** 3 phases, 3 plans, 7 tasks

**Key accomplishments:**

- Propose-mode infrastructure: `appendProposal` helper, hook redirect, `OPENWOLF.md` protocol update
- Learnings review CLI: `openwolf learnings list` and merge commands with consumed-tracking
- Accumulation merge and integration enumeration tests for the propose-and-merge workflow

---

## v1.0 CHESA Fork Team Toolkit (Shipped: 2026-06-07)

**Phases completed:** 5 phases, 8 plans

**Key accomplishments:**

- HOOK_FILES cleanup — removed vestigial constant, migrated tests to dynamic discovery verification
- Automated local dev setup script (`scripts/install-dev.sh`) with prerequisite checks, pnpm install/build/link, idempotent upstream remote config
- Read-only divergence reporting script (`scripts/sync-upstream.sh`) with upstream remote auto-configuration and team documentation
- Dynamic hook discovery replacing static `HOOK_FILES` — all `.js` files in `dist/hooks/` auto-deployed
- Advisory per-file locking (`withFileLock`) for concurrent `.wolf/` write safety using Node.js `O_EXCL`
- `OPENWOLF_METADATA_DIR` env var support for flexible metadata storage location
- `.wolf/.gitignore` template with `*` ignore-all + opt-in exceptions for mixed commit strategy
- Updated reference (`docs/configuration.md`) and onboarding (`docs/getting-started.md`) documentation
- `pnpm clean` dev script with explicit path guards and `.DS_Store` cleanup

---

## v1.2 — Shared-Context Tracking & Curation

- **Shipped:** 2026-06-26
- **Software version:** 1.3.0-beta
- **Phases:** 8-12
- **Plans:** 13
- **Open debug sessions acknowledged:** 3 (see STATE.md Deferred Items)
- **Archive:** [.planning/milestones/v1.2-ROADMAP.md](.planning/milestones/v1.2-ROADMAP.md)
