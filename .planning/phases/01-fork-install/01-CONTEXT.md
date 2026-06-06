# Phase 01: Fork Installation & Team Onboarding - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated development environment setup for new CHESA team members working on the OpenWolf fork. This phase delivers:

1. A single bash script (`scripts/install-dev.sh`) that installs dependencies, builds the project, links the CLI globally, and configures the upstream git remote.
2. An `install:dev` npm script in `package.json` as a convenience wrapper.
3. Updated documentation in `README.md` and `docs/DEVELOPMENT.md` pointing to the new script.

No new subsystems. No new dependencies. Pure Bash + pnpm + standard Git commands.

</domain>

<decisions>
## Implementation Decisions

### Script Naming and Scope

- **D-01: `scripts/install-dev.sh` and `install:dev` (not `install-global`)**
  The phase targets developer onboarding (team members working on the fork), not end-user global installation. End users already install via `npm install -g openwolf`. The script name must clearly signal "development setup" to avoid confusion.
  - **Rationale (recommended):** Phase goal says "streamline onboarding for new team members via automated environment setup" — these are developers, not end users. The prior research (`01-RESEARCH.md`) and existing plan (`01-01-PLAN.md`) both use `install-dev`. Using `install-global` would mislead users into thinking this replaces `npm install -g openwolf`.
  - **Rationale (rejected — `install-global`):** Would imply end-user installation. Already exists as `npm install -g openwolf`. Would create confusion.

- **D-02: Include upstream git remote configuration in the install script**
  The script must add the `upstream` remote pointing to `https://github.com/cytostack/openwolf.git` (HTTPS for read-only access without SSH key management). This is expected by Phase 2 (`02-divergence-management/02-CONTEXT.md` states "Configuration handled by the install script (Phase 1)").
  - **Rationale:** Configuring the upstream remote during onboarding eliminates a manual step every new team member would otherwise have to do before using divergence reporting.
  - **Details:** Use `git remote add upstream https://github.com/cytostack/openwolf.git` if `upstream` does not already exist. Verify we're in a git repo before running git commands.

### Global Install Conflict Handling

- **D-03: Detect existing global `openwolf` and warn, do not auto-unlink**
  The script should check if `openwolf` is already globally installed (via `which openwolf` or `npm list -g openwolf`). If found, print a warning explaining the conflict and suggest `npm uninstall -g openwolf` or `pnpm unlink --global openwolf` before proceeding. Do NOT auto-unlink — that is destructive and surprising.
  - **Rationale (recommended):** Safe default. The user decides whether to remove the existing global install. The research (`01-RESEARCH.md`) identified linking conflicts as a common pitfall; warning addresses it without side effects.
  - **Rationale (rejected — auto-unlink):** Removes a globally installed package without explicit user consent. Could break other workflows relying on the global binary.

### Documentation Placement

- **D-04: Update both `README.md` and `docs/DEVELOPMENT.md`**
  - `README.md`: Add a brief "Development Setup" subsection under Installation referencing `./scripts/install-dev.sh`. This is the first place new contributors look.
  - `docs/DEVELOPMENT.md`: Update the "Local Setup" section to reference the script instead of the manual `pnpm install / pnpm build` steps. Keep the manual steps as a fallback for users who prefer them.
  - **Rationale (recommended):** README.md has high visibility; docs/DEVELOPMENT.md is the canonical developer reference. Both should be synchronized.
  - **Rationale (rejected — README.md only):** docs/DEVELOPMENT.md already has a Local Setup section; leaving it outdated creates conflicting instructions.
  - **Rationale (rejected — docs/DEVELOPMENT.md only):** New contributors often look at README.md first and may miss the dedicated dev docs.

### Script Robustness

- **D-05: Include prerequisite checks (Node.js >= 20, pnpm installed, git repo)**
  The script must:
  1. Verify `node` is available and `node --version` meets `>= 20.0.0`.
  2. Verify `pnpm` is available.
  3. Verify the current directory is a git repository (needed for upstream remote config).
  4. Fail fast with a clear error message if any check fails (`set -e` + explicit checks).
  - **Rationale (recommended):** Catches the most common onboarding failures upfront. Node.js version mismatch and missing pnpm are the #1 and #2 support questions for Node projects.
  - **Rationale (rejected — minimal script with no checks):** Saves a few lines of Bash but increases support burden when prerequisites are missing. Inconsistent with the phase goal of "streamlining" onboarding.

### Claude's Discretion

- **Script location:** Whether `scripts/` directory needs to be created or already exists. Planner should check and create if needed.
- **Upstream remote URL format:** Whether to use HTTPS (`https://github.com/cytostack/openwolf.git`) or SSH (`git@github.com:cytostack/openwolf.git`). Phase 2 context chose HTTPS for read-only access without SSH keys — recommend planner respects that unless there's a reason to change.
- **Script output style:** Whether to use `set -x` (trace mode) for verbose output or `echo` statements for user-friendly progress. Recommend `echo` statements with a `--verbose` flag as future enhancement; keep default output concise.
- **pnpm vs npm for global link:** Whether to use `pnpm link --global` or `npm link`. The research recommends `pnpm link --global` since the project uses pnpm. Planner should follow the research recommendation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 1 — goal and success criteria
- `.planning/REQUIREMENTS.md` §Pillar 1 — exact requirement text (note: uses `install-global` naming, but D-01 overrides this per research consensus)
- `.planning/phases/01-fork-install/01-RESEARCH.md` — research findings, recommended stack, common pitfalls
- `.planning/phases/01-fork-install/01-01-PLAN.md` — existing execution plan (autonomous)

### Prior phase context (integration expectations)
- `.planning/phases/02-divergence-management/02-CONTEXT.md` §Git Remote Configuration — upstream remote must be configured by Phase 1 install script

### Source files to modify
- `package.json` — add `install:dev` script to `scripts` object
- `README.md` — update Installation section with development setup reference
- `docs/DEVELOPMENT.md` — update Local Setup section

### Source files to create
- `scripts/install-dev.sh` — new bash script (create `scripts/` directory if missing)

### Reference patterns
- `package.json` `prebuild` script — uses inline Node.js (`node -e`) with guards; not directly reused but establishes the project's "inline Node.js for simple scripts" pattern
- Existing `docs/DEVELOPMENT.md` "Local Setup" section — manual steps that the script automates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` `scripts` object — already has `prebuild`, `build`, `clean`, etc. `install:dev` fits alongside these.
- `docs/DEVELOPMENT.md` — already documents manual local setup steps; the script automates these exact steps.
- `README.md` Installation section — already has end-user install instructions; needs a dev-setup subsection.

### Established Patterns
- **No new dependencies for tooling scripts:** The project avoids npm packages for simple operations. A Bash script using standard tools (`git`, `pnpm`, `node`) is consistent.
- **Inline Node.js for JSON/package operations:** `package.json` scripts use `node -e` for simple filesystem tasks. The install script is Bash (not Node.js inline) because it orchestrates multiple commands across tools.
- **Fail fast:** `set -euo pipefail` is the project's Bash convention (per `bash.md` rules).

### Integration Points
- `src/cli/init.ts` — not directly modified in this phase, but the install script's upstream remote config complements `init.ts`'s project initialization.
- Phase 2 (`scripts/sync-upstream.sh`) — depends on the upstream remote being configured by this phase's install script.

</code_context>

<specifics>
## Specific Ideas

- The script should be executable (`chmod +x scripts/install-dev.sh`) and include a `--help` flag for basic usage info, matching the verification in `01-01-PLAN.md`.
- Upstream remote configuration should be idempotent: if `upstream` already exists, skip or verify the URL matches. This prevents errors on re-runs.
- Consider adding a `--skip-build` flag for users who only want dependency install + linking (future enhancement, not required for this phase).
- The `install:dev` script in `package.json` should mirror the script exactly: `"install:dev": "bash scripts/install-dev.sh"` or the equivalent pnpm commands. Using the script directly is preferred over duplicating commands in package.json.
</specifics>

<deferred>
## Deferred Ideas

- **Windows/PowerShell install script:** A `scripts/install-dev.ps1` for Windows team members. Deferred — current team is macOS/Linux based (per PROJECT.md and bash.md rules).
- **Docker-based dev environment:** A `Dockerfile` or `devcontainer.json` for fully containerized onboarding. Deferred — overkill for 4-5 developers.
- **Post-install hook registration:** Automatically running `openwolf init` after the dev install. Deferred — not all team members will use OpenWolf on every project they work on.
- **Automatic dependency update check:** Warning if `pnpm-lock.yaml` is out of date. Deferred — belongs in a CI or pre-commit phase.

None — discussion stayed within phase scope.

</deferred>

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended option:

```
[auto] [Script naming and scope] — Q: "Use install-global (end-user) or install-dev (developer) naming?" → Selected: "install-dev.sh / install:dev" (recommended: phase targets team onboarding, not end-user installation; research and plan both use dev naming)
[auto] [Upstream remote config] — Q: "Should install script also configure upstream git remote?" → Selected: "Yes, include upstream remote configuration" (recommended: Phase 2 expects this; eliminates manual step for every new team member)
[auto] [Global install conflict] — Q: "Auto-unlink existing global openwolf or warn only?" → Selected: "Warn only, do not auto-unlink" (recommended: safe default; auto-unlink is destructive)
[auto] [Documentation placement] — Q: "Update README.md only, DEVELOPMENT.md only, or both?" → Selected: "Both README.md and docs/DEVELOPMENT.md" (recommended: high visibility + canonical dev reference)
[auto] [Script robustness] — Q: "Minimal script or include prerequisite checks?" → Selected: "Include Node.js >= 20, pnpm, and git repo checks" (recommended: catches common failures upfront; consistent with fail-fast philosophy)
```

---

## Decisions Index

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | `scripts/install-dev.sh` and `install:dev` (developer-focused, not end-user) | Phase goal is team onboarding; end-user install already exists |
| D-02 | Include upstream git remote configuration in install script | Expected by Phase 2; eliminates manual step |
| D-03 | Warn on existing global `openwolf`, do not auto-unlink | Safe default; avoids destructive side effects |
| D-04 | Update both `README.md` and `docs/DEVELOPMENT.md` | High visibility + canonical reference |
| D-05 | Include prerequisite checks (Node.js, pnpm, git repo) | Catches common failures; fail-fast philosophy |

---

*Phase: 01-fork-install*
*Context gathered: 2026-06-06*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
