# Roadmap: CHESA Fork Team Toolkit

## Phase 0: Prerequisite Fix
- Fix `HOOK_FILES` deployment gap in `src/cli/hook-settings.ts`.

## Phase 1: Fork Installation & Team Onboarding
**Goal:** Streamline onboarding for new team members via automated environment setup.

**Plans:** 1 plans
- [ ] 01-fork-install/01-01-PLAN.md — Automated local development environment setup

## Phase 2: Fork Divergence Management
- Configure `upstream` remote.
- Create `scripts/sync-upstream.sh` and update documentation.

## Phase 3: .wolf/ Team Workflow Improvements
- Implement `withFileLock` and wrap `writeJSON`.
- Enable `OPENWOLF_METADATA_DIR` support.
- Implement `.wolf/.gitignore` template and updated `init.ts` logic.
- Finalize documentation.
