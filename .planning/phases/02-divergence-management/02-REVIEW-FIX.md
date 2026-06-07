---
phase: 02-divergence-management
fixed_at: 2026-06-07T17:10:00Z
review_path: .planning/phases/02-divergence-management/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-06-07T17:10:00Z
**Source review:** .planning/phases/02-divergence-management/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Silent "IN SYNC" when local branch does not exist

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** 9fabcb6
**Applied fix:** Added a local branch existence check (`git show-ref --verify refs/heads/${branch}`) in `report_divergence()` before the upstream ref check, with a clear error message. Removed the `|| echo "0"` fallback from both `git rev-list --count` commands so failures propagate via `set -e` instead of silently producing "0" counts.

### WR-02: Branch name validation is weaker than git's rules

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** 14b1dbe
**Applied fix:** Replaced the hand-written regex validation in `validate_branch_name()` with `git check-ref-format --branch "$branch"`, which provides canonical git branch name validation. This rejects double-dot sequences, trailing dots, `.lock` suffixes, and other edge cases that the previous regex allowed.

### WR-03: Tests never assert exit codes

**Files modified:** `tests/sync-upstream.sh`
**Commit:** 3d399b1
**Applied fix:** Updated all 12 behavioral tests to capture the exit code alongside script output. Each test uses `set +e` / `set -e` wrapping around the command substitution, then asserts the expected exit code (`-eq 0` for success tests, `-ne 0` for failure tests) before checking output string content. Failure messages now include the exit code for diagnosis.

- Tests expecting exit 0 (success): 4 (default branch header), 5 (AHEAD), 6 (BEHIND), 7 (DIVERGED), 8 (IN SYNC), 9 (feature branch warning), 10 (--help), 11 (--version), 12 (--branch develop)
- Tests expecting exit != 0 (expected failure): 1 (missing upstream — fetch fails), 2 (existing upstream — fetch fails), 3 (fetch failure)

### WR-04: `ensure_upstream_remote` does not verify remote URL matches expected

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** 3207ef0
**Applied fix:** Added a URL comparison in `ensure_upstream_remote()` when an existing `upstream` remote is found. If the existing URL differs from `$UPSTREAM_URL`, a warning is printed to stderr showing both URLs and noting that the script will continue with the existing remote.

---

_Fixed: 2026-06-07T17:10:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
