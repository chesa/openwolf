# Phase 2: Fork Divergence Management — Research

**Researched:** 2026-06-06
**Domain:** Git workflow automation / Fork management
**Confidence:** HIGH

## Summary

This phase delivers the tooling and documentation needed for the CHESA team to track and manage divergence between their fork (`chesa/openwolf`) and upstream (`cytostack/openwolf`). The core deliverables are: (1) automatic configuration of a read-only `upstream` git remote, and (2) an operator-guided shell script `scripts/sync-upstream.sh` that reports commits ahead/behind and suggests next actions without performing destructive operations automatically.

The design spec (`docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md`) already defines the behavior for both the remote configuration and the sync script in Pillar 2. No external libraries or services are required; the solution is pure Bash + Git. The upstream remote uses HTTPS intentionally (read-only, no SSH key needed) while the fork remote uses SSH for developer pushes.

**Primary recommendation:** Implement `scripts/sync-upstream.sh` as a read-only reporting tool that fetches upstream, counts commits ahead/behind using `git rev-list --count`, prints a categorized divergence report, and suggests (but does not execute) merge or rebase actions. Configure the `upstream` remote automatically inside `scripts/install-global.sh` (Phase 1 deliverable) and document the workflow in `README.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Upstream remote config | Dev Environment | — | Local git configuration, no server involvement |
| Divergence detection | Dev Environment | — | Runs `git fetch` + `git rev-list` locally |
| Sync reporting | Dev Environment | — | Shell script output for human operators |
| Documentation | Repository | — | README.md and CONTRIBUTING.md updates |

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git | 2.39+ | Remote management, divergence detection | Already required for all development |
| bash | 3.2+ | Scripting | macOS default, project requires 3.2 compatibility |
| shellcheck | 0.11.0 | Linting | Available in dev environment, enforces script quality |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `git rev-list --count` | built-in | Exact ahead/behind counts | Preferred over `git status` for scripting |
| `git merge-base` | built-in | Divergence detection | Confirms whether branches have diverged |
| `git log --cherry-mark` | built-in | Detect upstream-merged PRs | Shows commits present in both branches |

**No installation required:** All tools are already part of the Git distribution and the target OS (macOS/Linux via CHESA infrastructure).

## Package Legitimacy Audit

No external packages are installed in this phase. All tools are system-provided (git, bash). No audit required.

## Architecture Patterns

### System Architecture Diagram

```
Developer workstation
|
|-- git remote: origin (ssh)  <---> chesa/openwolf (read/write)
|-- git remote: upstream (https) <---> cytostack/openwolf (read-only)
|
v
scripts/sync-upstream.sh
  |
  |-- git fetch upstream
  |-- git rev-list --count upstream/main..main   (ahead count)
  |-- git rev-list --count main..upstream/main   (behind count)
  |-- git log --oneline --cherry upstream/main...main  (merged PR detection)
  |
  v
Divergence Report (stdout)
  |
  |-- "Ahead N, Behind M" summary
  |-- Recommended next action (merge vs rebase)
  |-- Optional: commit list for review
```

### Recommended Project Structure

```
scripts/
├── install-global.sh    # Phase 1 deliverable; adds upstream remote if missing
└── sync-upstream.sh     # Phase 2 deliverable; divergence reporting tool
```

### Pattern 1: Read-Only Divergence Reporter
**What:** A shell script that fetches upstream and prints a report showing how the local fork differs, without modifying any local branches.
**When to use:** Daily/weekly check-ins, before starting new feature work, or when upstream releases a new version.
**Example:**
```bash
#!/bin/bash
set -euo pipefail

LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
UPSTREAM_BRANCH="upstream/${LOCAL_BRANCH}"

git fetch upstream

AHEAD=$(git rev-list --count "${UPSTREAM_BRANCH}..${LOCAL_BRANCH}")
BEHIND=$(git rev-list --count "${LOCAL_BRANCH}..${UPSTREAM_BRANCH}")

echo "Local '${LOCAL_BRANCH}' is ${AHEAD} ahead and ${BEHIND} behind '${UPSTREAM_BRANCH}'"

if [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -gt 0 ]; then
    echo "Status: DIVERGED — review with: git log --oneline --left-right ${LOCAL_BRANCH}...${UPSTREAM_BRANCH}"
elif [ "$AHEAD" -gt 0 ]; then
    echo "Status: Local has unpushed commits"
elif [ "$BEHIND" -gt 0 ]; then
    echo "Status: Upstream has new changes — consider:"
    echo "  git merge ${UPSTREAM_BRANCH}     (simple sync)"
    echo "  git rebase ${UPSTREAM_BRANCH}    (clean history)"
else
    echo "Status: In sync"
fi
```

### Pattern 2: Conditional Remote Setup
**What:** Check for `upstream` remote existence before adding; use HTTPS for read-only upstream.
**When to use:** Install script (`scripts/install-global.sh`) and sync script startup.
**Example:**
```bash
if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream https://github.com/cytostack/openwolf.git
    echo "Added upstream remote (https://github.com/cytostack/openwolf.git)"
else
    echo "Upstream remote already configured: $(git remote get-url upstream)"
fi
```

### Anti-Patterns to Avoid
- **Auto-merge or auto-rebase in a fork sync script:** The CHESA fork has 183+ commits of divergence; automatic merges risk conflict loss and history corruption. Always leave merge/rebase decisions to a human operator.
- **Using SSH for the upstream remote:** Upstream is read-only; HTTPS avoids SSH key management issues for all team members.
- **Comparing SHAs directly without `git fetch` first:** Stale remote refs produce stale reports. Always `git fetch upstream` before computing divergence.
- **Modifying `main` directly on the fork:** Per best-practice guidance, all work should happen on `develop` or feature branches; `main` should mirror upstream where possible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ahead/behind counting | Custom diff parsing | `git rev-list --count A..B` | Git already computes this precisely with a single graph walk |
| Merge-base detection | Manual ancestor walking | `git merge-base A B` | Git optimizes this via commit graph |
| Upstream commit categorization | External changelog scraper | `git log --oneline` + human review | Upstream commit messages are the authoritative source |
| Remote existence check | `git remote -v | grep` | `git remote get-url <name>` | Built-in, exit-code based, no parsing fragility |

**Key insight:** Git's built-in porcelain and plumbing commands already solve every sub-problem in divergence detection. A 30-line shell script using `git rev-list`, `git merge-base`, and `git log` is more reliable than any custom implementation.

## Runtime State Inventory

This phase does not rename, refactor, or migrate existing runtime state. However, the following git-level state will be created or modified:

| Category | Items Found | Action Required |
|----------|-------------|---------------|
| Stored data | None — no databases or external stores involved | N/A |
| Live service config | None — no services or UIs involved | N/A |
| OS-registered state | None — no OS-level registrations | N/A |
| Secrets/env vars | None — HTTPS upstream remote needs no credentials for public repo fetch | N/A |
| Build artifacts | None — shell scripts are not compiled | N/A |

**New runtime state introduced:**
- Git remote `upstream` pointing to `https://github.com/cytostack/openwolf.git` (read-only)
- This is stored in the local `.git/config` file per clone and is not committed to the repository.

## Common Pitfalls

### Pitfall 1: Stale Remote References
**What goes wrong:** The divergence report shows "0 ahead, 0 behind" even though upstream has new commits because `git fetch upstream` was never run.
**Why it happens:** Git's local refs for `upstream/*` branches do not auto-update; they reflect the state at the last `fetch`.
**How to avoid:** The sync script must run `git fetch upstream` as its first action and print a clear message when the network fetch fails (e.g., no internet, upstream repo deleted).
**Warning signs:** Report shows "In sync" immediately after a known upstream release.

### Pitfall 2: Wrong Branch Comparison
**What goes wrong:** The script compares `upstream/main` against `main`, but the developer is on `develop` and thinks the report is about their current branch.
**Why it happens:** Gitflow uses `main` as the stable branch and `develop` for active work. The divergence report must be explicit about which branches are being compared.
**How to avoid:** Always print the exact branch names in the report header (e.g., "Comparing `main` vs `upstream/main`"). Provide a `--branch` flag or environment variable for developers who want to check divergence on `develop` instead.
**Warning signs:** Developer tries to merge upstream changes into `develop` after reading a report about `main`.

### Pitfall 3: Accidentally Pushing to Upstream
**What goes wrong:** A developer with multiple remotes runs `git push upstream main` instead of `origin`, polluting the upstream repository.
**Why it happens:** Default push remote is `origin`, but muscle memory or autocomplete can select `upstream`.
**How to avoid:** Configure the upstream remote as `fetch` only in documentation and script comments. The actual git command (`git remote add upstream <url>`) does not enforce read-only; enforcement is social (docs) and procedural (no push instructions in the script).
**Warning signs:** Upstream repo suddenly has a `chesa-fixes` branch.

### Pitfall 4: Merge-Base Misunderstanding on Diverged Branches
**What goes wrong:** When both ahead and behind are > 0, the script simply says "diverged" without helping the developer understand which commits are unique to each side.
**Why it happens:** `git rev-list --count` gives numbers but no context. A developer may not know how to inspect the actual commits.
**How to avoid:** Include sample `git log` commands in the output for the diverged case, showing how to view the unique commits on each side.
**Warning signs:** Developer manually runs `git log` with incorrect ranges and gets confused by the output.

## Code Examples

### Verified pattern: Ahead/behind count with fetch guard
```bash
#!/bin/bash
set -euo pipefail

UPSTREAM_URL="https://github.com/cytostack/openwolf.git"

# Ensure upstream remote exists
if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream "$UPSTREAM_URL"
    echo "Added upstream remote: $UPSTREAM_URL"
fi

# Fetch upstream (fail fast with clear message)
if ! git fetch upstream; then
    echo "ERROR: Failed to fetch from upstream remote." >&2
    echo "Check network connectivity and remote URL: $UPSTREAM_URL" >&2
    exit 1
fi

LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
UPSTREAM_BRANCH="upstream/${LOCAL_BRANCH}"

AHEAD=$(git rev-list --count "${UPSTREAM_BRANCH}..${LOCAL_BRANCH}")
BEHIND=$(git rev-list --count "${LOCAL_BRANCH}..${UPSTREAM_BRANCH}")

echo ""
echo "=== Fork Divergence Report ==="
echo "Local branch:  ${LOCAL_BRANCH}"
echo "Upstream ref:  ${UPSTREAM_BRANCH}"
echo ""
echo "Commits ahead of upstream:  ${AHEAD}"
echo "Commits behind upstream:  ${BEHIND}"
echo ""

if [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -gt 0 ]; then
    echo "Status: DIVERGED"
    echo ""
    echo "Unique to local:"
    echo "  git log --oneline --left-only ${LOCAL_BRANCH}...${UPSTREAM_BRANCH}"
    echo ""
    echo "Unique to upstream:"
    echo "  git log --oneline --right-only ${LOCAL_BRANCH}...${UPSTREAM_BRANCH}"
    echo ""
    echo "Recommended: review upstream changes, then choose merge or rebase."
elif [ "$AHEAD" -gt 0 ]; then
    echo "Status: AHEAD"
    echo "Your fork has unpushed/local commits not present in upstream."
    echo "(This is normal if you have open PRs or fork-specific changes.)"
    echo ""
    echo "To see your unique commits:"
    echo "  git log --oneline ${UPSTREAM_BRANCH}..${LOCAL_BRANCH}"
elif [ "$BEHIND" -gt 0 ]; then
    echo "Status: BEHIND"
    echo "Upstream has new commits. Review them before syncing."
    echo ""
    echo "To review upstream changes:"
    echo "  git log --oneline ${LOCAL_BRANCH}..${UPSTREAM_BRANCH}"
    echo ""
    echo "To sync (choose one):"
    echo "  git merge ${UPSTREAM_BRANCH}     # preserve history"
    echo "  git rebase ${UPSTREAM_BRANCH}    # linear history"
else
    echo "Status: IN SYNC"
    echo "Your local branch matches upstream."
fi
```

### Verified pattern: Detect upstream-merged PRs with cherry-mark
```bash
# Show commits that exist in both local and upstream (likely merged PRs)
echo ""
echo "=== Potentially Upstream-Merged Commits ==="
git log --oneline --cherry-mark --left-right "${LOCAL_BRANCH}...${UPSTREAM_BRANCH}" || true
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `git remote add` + `git log` | Scripted `sync-upstream.sh` with categorized output | 2026-06-06 (this phase) | Team has a single command to assess fork health |
| SSH for all remotes | HTTPS for upstream (read-only), SSH for origin (read/write) | 2026-06-06 (this phase) | Removes SSH key requirement for upstream fetch; simplifies onboarding |
| Divergence checked ad-hoc | Weekly/daily script run + README documentation | 2026-06-06 (this phase) | Reduces "fork drift" risk by making divergence visible |

**Deprecated/outdated:**
- None identified for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Upstream repository `cytostack/openwolf` remains public and accessible via HTTPS without authentication | Standard Stack, Code Examples | Script fails at `git fetch upstream`; developer must manually check access |
| A2 | The CHESA fork's default branch for comparison is `main` (not `develop`) | Code Examples | Report compares wrong branches; `develop` may be the intended comparison target for active work |
| A3 | All CHESA developers have Git >= 2.39 (supports `git remote get-url` and modern porcelain) | Standard Stack | Older Git versions may lack `get-url` subcommand; fallback to `git remote -v` grep needed |
| A4 | `shellcheck` 0.11.0 is available in the development environment for linting new shell scripts | Standard Stack | Scripts won't be linted automatically; CI may fail if shellcheck step is added later |
| A5 | The fork's origin remote is already configured as SSH (`git@github.com:chesa/openwolf.git`) | Project Context | If origin is HTTPS, the script still works, but documentation about "SSH for origin" is inaccurate |

## Open Questions

1. **Should the sync script compare `develop` instead of `main`?**
   - What we know: The CHESA fork uses gitflow (`develop` for active work, `main` for stable releases). The design spec says compare `main` to `upstream/main`.
   - What's unclear: Whether developers primarily care about divergence on `main` (release tracking) or `develop` (daily work).
   - Recommendation: Default to `main` as specified, but add a `--branch` flag so developers can check `develop` divergence.

2. **Should the script detect and report on upstream tags/releases?**
   - What we know: The design spec mentions "upstream tags newer than the fork's base" as a report item.
   - What's unclear: Whether upstream uses annotated tags, lightweight tags, or GitHub releases, and how to reliably compare them.
   - Recommendation: Start with commit divergence only. Tag comparison can be added in a follow-up if the team requests it.

3. **What should happen when run from a non-default branch (e.g., a feature branch)?**
   - What we know: `git rev-parse --abbrev-ref HEAD` returns the current branch.
   - What's unclear: Whether the script should warn when not on `main`/`develop`, or always compare the current branch to its upstream counterpart.
   - Recommendation: Print a clear warning when on a feature branch: "You are on branch 'feature-x'. Comparing against upstream/main. Use --branch to specify a different branch."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | All | ✓ | 2.39+ | — |
| bash | All | ✓ | 3.2+ (macOS default) | — |
| shellcheck | Linting | ✓ | 0.11.0 | Manual review |
| network (GitHub HTTPS) | `git fetch upstream` | ✓ | — | Script prints error and exits |

**Missing dependencies with no fallback:**
- None identified.

**Missing dependencies with fallback:**
- None identified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification only |
| Config file | none |
| Quick run command | `bash scripts/sync-upstream.sh` |
| Full suite command | `bash scripts/sync-upstream.sh` + compare output against `git log` manually |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (from REQUIREMENTS.md) | Configure upstream remote | manual | `git remote -v` after running install script | N/A |
| (from REQUIREMENTS.md) | Divergence report accurate | manual | Compare `sync-upstream.sh` counts to `git rev-list --count` | N/A |
| (from REQUIREMENTS.md) | README documents fork management | manual | Read `README.md` section | N/A |

### Sampling Rate
- **Per task commit:** Run `bash scripts/sync-upstream.sh` and verify output.
- **Per wave merge:** Manual review of README changes.
- **Phase gate:** Script runs without errors and produces coherent divergence report before `/gsd-verify-work`.

### Wave 0 Gaps
- None — this phase has no automated test infrastructure requirement. The script is a read-only reporting tool validated by manual inspection.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Upstream remote uses HTTPS for public repo; no auth needed |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Script is read-only; no privilege escalation |
| V5 Input Validation | Yes | Validate branch names with `git rev-parse --abbrev-ref` before using in commands |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns for Git Shell Scripts

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via malicious branch name | Tampering | Use `git rev-parse` to canonicalize branch names; never pass untrusted input to shell eval |
| Information disclosure via verbose error messages | Information Disclosure | Print generic "fetch failed" message to stderr; log detailed errors only if `--verbose` flag is set |
| Accidental push to upstream | Error | Document upstream as fetch-only; never include push commands in sync script |

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` — Pillar 2 specification (design spec checked into repo, verified by reading)
- `git help rev-list`, `git help merge-base`, `git help remote` — built-in documentation (verified by local `git` commands)
- `CONTRIBUTING.md` — existing branch conventions (`main`/`develop` gitflow, verified by reading)
- Local git repository inspection (`git remote -v`, `git log`, `git rev-list --count`) — verified against live repo state

### Secondary (MEDIUM confidence)
- [Atlassian Git Tutorial: Git Upstreams and Forks](https://www.atlassian.com/git/tutorials/git-forks-and-upstreams) — upstream remote configuration best practice
- [GitHub Docs: Fork a repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) — official fork workflow guidance
- [conda-forge docs: How to keep your fork in sync](https://conda-forge.org/docs/how-to/basics/fork-sync/) — fast-forward only recommendation
- [Mark Hazleton blog: Fork Management automation](https://markhazleton.com/blog/automating-fork-sync-upstream-integration) — categorization and checkpoint patterns

### Tertiary (LOW confidence)
- Web search community scripts for `gitcheck.sh` and `git-branch-status` — patterns verified against official `git` documentation before inclusion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are built-in, verified locally
- Architecture: HIGH — design spec is explicit, no ambiguity
- Pitfalls: MEDIUM-HIGH — derived from community best practices and the project's gitflow model

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (git porcelain is stable; upstream repo structure could change)
