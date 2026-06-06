# Roadmap: CHESA Fork Team Toolkit

## Phase 0: Prerequisite Fix
- Fix `HOOK_FILES` deployment gap in `src/cli/hook-settings.ts`.

## Phase 1: Fork Installation & Team Onboarding
**Goal:** Streamline onboarding for new team members via automated environment setup.

**Plans:** 1 plans
- [ ] 01-fork-install/01-01-PLAN.md — Automated local development environment setup

## Phase 2: Fork Divergence Management
**Goal:** Enable the CHESA team to track and manage divergence between their fork (`chesa/openwolf`) and upstream (`cytostack/openwolf`).

**Plans:** 1 plan
- [ ] 02-divergence-management/02-01-PLAN.md — Divergence reporting script and documentation

## Phase 3: .wolf/ Team Workflow Improvements
- Implement `withFileLock` and wrap `writeJSON`.
- Enable `OPENWOLF_METADATA_DIR` support.
- Implement `.wolf/.gitignore` template and updated `init.ts` logic.
- Finalize documentation.
