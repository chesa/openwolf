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

**Goal:** Deploy all hook modules reliably, protect concurrent write safety, support flexible metadata locations, establish a mixed commit strategy, and document the new capabilities.

**Plans:** 5 plans

Plans:

- [ ] 03-01-PLAN.md — Fix HOOK_FILES deployment gap via dynamic hook discovery
- [ ] 03-02-PLAN.md — Implement withFileLock for concurrent .wolf/ write safety
- [ ] 03-03-PLAN.md — Enable OPENWOLF_METADATA_DIR environment variable
- [ ] 03-04-PLAN.md — Add .wolf/.gitignore template and update init.ts
- [ ] 03-05-PLAN.md — Update configuration and getting-started documentation
