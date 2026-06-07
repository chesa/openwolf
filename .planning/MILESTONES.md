# Milestones

## v1.0 CHESA Fork Team Toolkit (Shipped: 2026-06-07)

**Phases completed:** 5 phases, 8 plans

**Key accomplishments:**

- HOOK_FILES cleanup — removed vestigial constant, migrated tests to dynamic discovery verification
- Automated local dev setup script (scripts/install-dev.sh) with prerequisite checks, pnpm install/build/link, idempotent upstream remote config
- Read-only divergence reporting script (scripts/sync-upstream.sh) with upstream remote auto-configuration and team documentation
- Dynamic hook discovery replacing static HOOK_FILES — all .js files in dist/hooks/ auto-deployed
- Advisory per-file locking (withFileLock) for concurrent .wolf/ write safety using Node.js O_EXCL
- OPENWOLF_METADATA_DIR env var support for flexible metadata storage location
- .wolf/.gitignore template with `*` ignore-all + opt-in exceptions for mixed commit strategy
- Updated reference (docs/configuration.md) and onboarding (docs/getting-started.md) documentation
- pnpm clean dev script with explicit path guards and .DS_Store cleanup

---
