# Requirements: CHESA Fork Team Toolkit

## Pillar 1: Fork Installation & Team Onboarding
- [ ] Create `scripts/install-global.sh` for automated install.
- [ ] Add `install:global` script to `package.json`.
- [ ] Document installation in `README.md`.

## Pillar 2: Fork Divergence Management
- [ ] Configure `upstream` git remote automatically.
- [ ] Create `scripts/sync-upstream.sh` for divergence reporting.
- [ ] Document fork management in `README.md`.

## Pillar 3: .wolf/ Team Workflow Improvements
- [ ] Fix `HOOK_FILES` deployment gap (include all `wolf-*.js`).
- [ ] Implement `withFileLock` for concurrent `.wolf/` write safety.
- [ ] Enable `OPENWOLF_METADATA_DIR` environment variable for flexible metadata location.
- [ ] Add `.wolf/.gitignore` template for mixed commit strategy and update `init.ts` logic.
- [ ] Document configuration (`docs/configuration.md`) and mixed strategy (`docs/getting-started.md`).
