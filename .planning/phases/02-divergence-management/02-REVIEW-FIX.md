---
phase: 02-divergence-management
fixed_at: 2026-06-07T00:00:00Z
review_path: .planning/phases/02-divergence-management/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-06-07T00:00:00Z
**Source review:** `.planning/phases/02-divergence-management/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-05: Temp directory leak — `setup_test_repo()` overwrites global `$TEST_TMP_DIR`

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `4c6a9de`
**Applied fix:** Changed `setup_test_repo()` to track temp directories in a `TEST_TMP_DIRS` array instead of overwriting a single global. The `cleanup()` trap now iterates over all tracked directories on exit, ensuring every temp directory created during the test run is cleaned up. Previously, `setup_test_repo()` overwrote `TEST_TMP_DIR` on each call, leaving N-1 temp directories leaked per run.

### WR-06: Tests 4, 9, 12 are network-dependent and fail in offline CI

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `0a6538b`
**Applied fix:** Replaced the real GitHub upstream URL (`https://github.com/cytostack/openwolf.git`) with a local bare repository in tests 4, 9, and 12, following the same pattern used by tests 5-8. Each test now:
- Creates a local bare repo as a simulated upstream
- Pushes the initial commit (and develop branch for test 12) to establish refs
- Sets the upstream remote to the local bare repo
- Runs the script against the local repo, which fetches deterministically without network access

### WR-07: Test function calls lack `|| true` guards — single failure aborts entire suite

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `c2eb633`
**Applied fix:** Added `|| true` guards to all 12 test function calls at the top level of the test suite. With `set -euo pipefail`, any unhandled non-zero return from a test function (e.g., from `setup_test_repo()` failing or a subshell crash) would previously abort the entire suite. Now each test runs independently: a failure in one test does not prevent the remaining tests from executing. The `FAIL` counter is already tracked by `print_result()` calls within each test, so `exit $FAIL` at the end still reports the correct failure count.

### WR-08: Silent "IN SYNC" when upstream branch does not exist

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** `134b926`
**Applied fix:** Added a `git show-ref --verify` check in `report_divergence()` before computing ahead/behind counts. If the specified upstream ref does not exist (e.g., `upstream/develop` was never created on the remote, was deleted, or has a typo), the script now prints a clear error message and exits with code 1 instead of silently reporting "Status: IN SYNC" (which happened because both `rev-list` commands errored, fell through to `|| echo "0"`, and produced 0/0 counts).

---

_Fixed: 2026-06-07T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
