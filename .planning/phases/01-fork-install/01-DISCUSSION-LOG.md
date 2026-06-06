# Phase 01: Fork Installation & Team Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 01-fork-install
**Areas discussed:** Script naming and scope, Upstream remote configuration, Global install conflict handling, Documentation placement, Script robustness

---

## Script Naming and Scope

| Option | Description | Selected |
|--------|-------------|----------|
| `install-global.sh` / `install:global` | Aligns with REQUIREMENTS.md; implies end-user global install | |
| `install-dev.sh` / `install:dev` | Aligns with RESEARCH.md and PLAN.md; targets developer onboarding | ✓ |
| Both scripts | One for end-user, one for developers | |

**User's choice:** `install-dev.sh` / `install:dev` (auto-selected)
**Notes:** Phase goal explicitly says "streamline onboarding for new team members" — these are developers, not end users. End-user installation already exists via `npm install -g openwolf`. Research and existing plan both use `install-dev` naming.

---

## Upstream Remote Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Include in install script | Add `upstream` remote to `cytostack/openwolf` during setup | ✓ |
| Defer to Phase 2 | Let `scripts/sync-upstream.sh` handle remote setup | |
| Separate setup command | Add a dedicated `openwolf setup-fork` CLI command | |

**User's choice:** Include in install script (auto-selected)
**Notes:** Phase 2 context (`02-CONTEXT.md`) explicitly states "Configuration handled by the install script (Phase 1)." Including it in the install script eliminates a manual step for every new team member.

---

## Global Install Conflict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Warn only | Detect existing global `openwolf`, print warning with instructions | ✓ |
| Auto-unlink | Automatically remove existing global install before linking | |
| Ignore | Do not check; let pnpm handle conflicts natively | |

**User's choice:** Warn only (auto-selected)
**Notes:** Safe default. Auto-unlinking is destructive and surprising. Research identified linking conflicts as a common pitfall; warning addresses it without side effects.

---

## Documentation Placement

| Option | Description | Selected |
|--------|-------------|----------|
| README.md only | Update Installation section with dev setup reference | |
| docs/DEVELOPMENT.md only | Update Local Setup section | |
| Both | Synchronized updates across both files | ✓ |

**User's choice:** Both (auto-selected)
**Notes:** README.md has high visibility for new contributors. docs/DEVELOPMENT.md is the canonical developer reference and already has a Local Setup section. Both must stay synchronized.

---

## Script Robustness

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Just `pnpm install && pnpm build && pnpm link --global` | |
| With checks | Verify Node.js >= 20, pnpm installed, git repo | ✓ |
| Full validation | All of above plus check for uncommitted changes, existing global install | |

**User's choice:** With checks (auto-selected)
**Notes:** Catches the most common onboarding failures upfront. Consistent with the project's fail-fast philosophy. Uncommitted changes check deferred as too opinionated for an install script.

---

## Claude's Discretion

- **Script location:** Planner should check if `scripts/` exists and create if needed.
- **Upstream remote URL:** HTTPS (`https://github.com/cytostack/openwolf.git`) preferred over SSH for read-only access without SSH key management (per Phase 2 context).
- **Script output style:** Recommend `echo` progress statements; `set -x` trace mode as future enhancement.
- **pnpm vs npm for global link:** Follow research recommendation (`pnpm link --global`).

## Deferred Ideas

- Windows/PowerShell install script — deferred (team is macOS/Linux based)
- Docker-based dev environment — deferred (overkill for 4-5 developers)
- Post-install `openwolf init` automation — deferred (not all projects use OpenWolf)
- Automatic dependency update check — deferred (belongs in CI/pre-commit phase)
