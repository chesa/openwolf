---
phase: 01-fork-install
plan: 01
subsystem: developer-experience
tags: [bash, pnpm, git, setup-script, fork-management]

# Dependency graph
requires:
  - phase: 00-prerequisite-fix
    provides: Project state ready for development
provides:
  - Automated local dev environment setup (scripts/install-dev.sh)
  - install:dev npm script in package.json
  - Documentation in README.md and docs/DEVELOPMENT.md
affects: [02-divergence-management]

# Tech tracking
tech-stack:
  added: [bash-conventions, pnpm-global-link]
  patterns: [set -euo pipefail, printf over echo, idempotent git remote config, prerequisite fail-fast checks]

key-files:
  created:
    - scripts/install-dev.sh
  modified:
    - package.json
    - README.md
    - docs/DEVELOPMENT.md

key-decisions:
  - "D-01: Name script install-dev.sh (developer-focused, not end-user installation)"
  - "D-02: Include upstream remote config for https://github.com/cytostack/openwolf.git"
  - "D-03: Warn on existing global openwolf, do not auto-unlink"
  - "D-04: Update both README.md and docs/DEVELOPMENT.md"
  - "D-05: Include prerequisite checks (Node.js >= 20, pnpm, git repo)"

patterns-established:
  - "Bash script structure: set -euo pipefail, copyright header, pragma marks, printf over echo"
  - "Idempotent git remote: check existence & URL match before adding upstream"
  - "Non-destructive conflict handling: warn and continue rather than auto-unlink"

requirements-completed: [R-01-01, R-01-02, R-01-03]

# Metrics
duration: 2min
completed: 2026-06-06
---

# Phase 01: Fork Installation & Team Onboarding — Plan 01 Summary

**Automated local dev setup script (scripts/install-dev.sh) with prerequisite checks, pnpm install/build/link, idempotent upstream remote config, and global binary conflict warning**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-06T20:22:58Z
- **Completed:** 2026-06-06T20:24:48Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `scripts/install-dev.sh` — an executable bash script that automates local development setup for CHESA team members working on the OpenWolf fork
- Added `install:dev` npm script in `package.json` as a convenience wrapper (`pnpm run install:dev`)
- Updated `README.md` with a Development Setup subsection referencing the script
- Updated `docs/DEVELOPMENT.md` to use the script as the primary setup path while preserving manual `pnpm install` / `pnpm build` fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/install-dev.sh** - `b4ad3c8` (feat)
2. **Task 2: Update package.json** - `df7bfa6` (feat)
3. **Task 3: Update README.md and docs/DEVELOPMENT.md** - `a05cba5` (docs)

**Plan metadata:** (committed after SUMMARY.md)

## Files Created/Modified

- `scripts/install-dev.sh` — Automated bash setup script with prerequisite checks (Node.js >= 20, pnpm, git repo), pnpm install/build/global-link, idempotent upstream remote config, and global openwolf conflict warning. Supports `--help` and `--version`.
- `package.json` — Added `"install:dev": "bash scripts/install-dev.sh"` script entry. All existing scripts preserved.
- `README.md` — Added `### Development Setup` subsection under `## Installation` with script usage and description.
- `docs/DEVELOPMENT.md` — Updated `## Local Setup` to reference `./scripts/install-dev.sh` as the primary path, with manual steps as fallback.

## Decisions Made

- **D-01** (`install-dev.sh` naming, not `install-global`): Script targets developer onboarding, not end-user global installation. Explicitly avoids confusion with the existing `npm install -g openwolf` path.
- **D-02** (Include upstream remote config): Added `https://github.com/cytostack/openwolf.git` as upstream remote with idempotent logic — skips if already configured with matching URL, warns on URL mismatch.
- **D-03** (Warn, don't auto-unlink): Script detects existing global `openwolf` and prints a warning with unlink instructions but continues execution. Prevents destructive side effects.
- **D-04** (Both README.md and docs/DEVELOPMENT.md): README.md provides high-visibility quick reference; docs/DEVELOPMENT.md serves as the canonical developer onboarding reference.
- **D-05** (Prerequisite checks): Node.js >= 20, pnpm installed, and git repository checks fail fast with clear error messages, catching the most common onboarding issues upfront.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Known Stubs

None

## Threat Flags

None - no security-relevant surface introduced beyond what the plan's threat model already covers.

## Next Phase Readiness

- Phase 1 Plan 1 is complete. The upstream remote (`https://github.com/cytostack/openwolf.git`) is configured by the install script, which Phase 2 (Divergence Management) depends on.
- Ready for the next plan in Phase 01 or transition to Phase 02-divergence-management.

---

## Self-Check: PASSED

All created files verified on disk. All three task commits confirmed in git log.
SUMMARY.md content verified for key references and commit hashes.

*Phase: 01-fork-install*
*Completed: 2026-06-06*
