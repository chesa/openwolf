---
phase: 02-divergence-management
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - README.md
  - scripts/sync-upstream.sh
  - tests/sync-upstream.sh
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 02: Code Review Report — Iteration 2

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Re-review of the fork divergence management implementation after previous findings (2 critical, 4 warning, 2 info) were addressed in 5 commits. All previously scoped fixes (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04) are confirmed applied. The production script (`scripts/sync-upstream.sh`) is functionally sound with no blocker-level issues remaining.

However, 4 new warning-grade findings and 2 info items were identified in the test suite and production script:

- **Temp directory leak** — `setup_test_repo()` overwrites the global `TEST_TMP_DIR` on each call, leaving N-1 temp directories behind per run
- **Network-dependent tests** — Tests 4, 9, 12 rely on GitHub network access; they fail deterministically in offline CI
- **No test error resilience** — Test function calls lack `|| true` guards; a single subshell failure aborts the entire suite
- **Silent "IN SYNC" on missing upstream branch** — When the specified upstream branch doesn't exist, `git rev-list --count` fails silently and both ahead/behind default to 0, producing a misleading "IN SYNC" status
- **License inconsistency** — BSD 3-clause header in the script vs AGPL-3.0 project license
- **Minor BRE portability** — Test 3 uses `\|` alternation without `-E` flag; works on modern greps but is technically non-standard

---

## Warnings

### WR-05: Temp directory leak — `setup_test_repo()` overwrites global `$TEST_TMP_DIR`

**File:** `tests/sync-upstream.sh:33-42,12-17`

**Issue:** The `setup_test_repo()` function (line 33) sets the global variable `TEST_TMP_DIR` to a new `mktemp` path each time it is called. The `cleanup()` trap on EXIT (line 12) only removes the directory referenced by `$TEST_TMP_DIR` at exit time. Since `setup_test_repo()` is called 10 times (once per test), each call overwrites the previous value, and only the last temp directory is ever cleaned up.

This leaks up to 9 temp directories per test run (`/tmp/sync-upstream-test-XXXXXX`), each containing a git repository (~200-300 KB). Over CI runs or repeated local development, these accumulate.

**Root cause:** Tests that need isolated git repositories all call `setup_test_repo()`, which unconditionally assigns a new directory to the global `TEST_TMP_DIR`. The cleanup trap has no mechanism to track multiple directories.

**Fix:** Clean up the previous temp directory before allocating a new one, or track created directories in an array:

**Option A — Clean up before re-assigning:**
```bash
setup_test_repo() {
  # Clean up previous temp dir before creating a new one
  if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
    rm -rf "$TEST_TMP_DIR"
  fi
  TEST_TMP_DIR=$(mktemp -d /tmp/sync-upstream-test-XXXXXX)
  # ... rest of setup
}
```

**Option B — Track all dirs in an array (most robust):**
```bash
# At top level
TEST_TMP_DIRS=()

cleanup() {
  local d
  for d in "${TEST_TMP_DIRS[@]}"; do
    [ -d "$d" ] && rm -rf "$d"
  done
}

setup_test_repo() {
  local tmpdir
  tmpdir=$(mktemp -d /tmp/sync-upstream-test-XXXXXX)
  TEST_TMP_DIRS+=("$tmpdir")
  TEST_TMP_DIR="$tmpdir"
  cd "$tmpdir"
  # ... rest of setup
}
```

---

### WR-06: Tests 4, 9, 12 are network-dependent and fail in offline CI

**File:** `tests/sync-upstream.sh:91-105, 186-200, 232-244`

**Issue:** Three tests set the upstream remote to `https://github.com/cytostack/openwolf.git` and run the full script. The script's `fetch_upstream()` function (line 107) attempts a `git fetch` from that URL. If network access to GitHub is unavailable (offline CI, air-gapped environment, rate limiting, DNS failure), the fetch fails and the script exits before reaching the output sections these tests check:

| Test | Checks for | Printed by | Runs after fetch? |
|------|-----------|-----------|-------------------|
| Test 4 (header) | "Fork Divergence Report", "upstream/main" | `report_divergence()` | **YES — fails on network error** |
| Test 9 (warning) | "Warning:" | `report_divergence()` | **YES — fails on network error** |
| Test 12 (branch) | "upstream/develop" | `report_divergence()` | **YES — fails on network error** |

Tests 1 and 2 add the same GitHub URL but pass in offline environments because they check output produced by `ensure_upstream_remote()`, which runs *before* `fetch_upstream()`. This inconsistency is confusing — three tests silently depend on network access while two coincidentally don't.

The controlled divergence tests (5-8) demonstrate the correct pattern: use a local bare repository as the upstream remote, which works deterministically without network access.

**Fix:** Replace the real GitHub URL with a local bare repository in tests 4, 9, and 12, following the same pattern as tests 5-8:

```bash
# Test 4 (modified to use local bare repo):
test_4_default_branch_header() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git init --bare "$TEST_TMP_DIR/upstream-bare"
    git push "$TEST_TMP_DIR/upstream-bare" HEAD:main
    git remote add upstream "$TEST_TMP_DIR/upstream-bare"
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Fork Divergence Report"; then
      if echo "$output" | grep -q "upstream/main"; then
        print_result PASS "Test 4: Default branch - main vs upstream/main" ""
        return
      fi
    fi
    print_result FAIL "Test 4: Default branch header" "Missing Fork Divergence Report or upstream/main reference"
  )
}
```

The same pattern applies to tests 9 and 12 — initialize a bare repo, push to it, set it as upstream, then run the script. The `git fetch` then targets a local path and succeeds immediately.

---

### WR-07: Test function calls lack `|| true` guards — single failure aborts entire suite

**File:** `tests/sync-upstream.sh:251-262`

**Issue:** The test functions are called at the top level (lines 251-262) without `|| true` or similar error containment. With `set -euo pipefail` at line 4, if any test function returns a non-zero exit code (e.g., because a `git` command fails inside its subshell), the entire script exits immediately. Remaining tests never run.

Consider this scenario:
1. `setup_test_repo()` at line 34 does `cd "$TEST_TMP_DIR"` — if `$TEST_TMP_DIR` is empty (mktemp failure), `cd` fails, and with `set -e`, the function returns non-zero
2. The calling function (`test_12_branch_flag`) also returns non-zero
3. Line 253 calls `test_12_branch_flag` without `|| true` — `set -e` kills the suite
4. Even if test 12 would have reported FAIL, tests 1-8 never execute

Similarly, a failure inside any subshell that isn't guarded by `|| true` propagates upward. The tests that use `|| true` on `bash "$SCRIPT"` are safe for that line, but other `git` operations (clone, push, reset, branch) are not guarded.

**Fix:** Guard all test function calls with `|| true` to contain failures, and report them through the test framework's pass/fail tracking:

```bash
test_10_help_flag || true
test_11_version_flag || true
test_12_branch_flag || true
test_1_missing_upstream_remote || true
# ...

# At exit, use stored FAIL count (already tracked by $FAIL global):
exit $FAIL
```

Alternatively, invert the pattern: collect test return codes and let the suite always run to completion:

```bash
run_test() {
  local test_name="$1"
  shift
  "$@" || FAIL=$((FAIL + 1))
}

run_test "Test 10" test_10_help_flag
run_test "Test 11" test_11_version_flag
# ...
```

---

### WR-08: Silent "IN SYNC" when upstream branch does not exist

**File:** `scripts/sync-upstream.sh:147-148,192-194`

**Issue:** When the user specifies `--branch develop` but `upstream/develop` does not exist on the remote, the script silently reports "IN SYNC". This happens because:

1. `git fetch upstream` succeeds (fetching refs, but `upstream/develop` is never created)
2. `git rev-list --count "upstream/develop..main" 2>/dev/null` fails — ref `upstream/develop` doesn't exist
3. Stderr is suppressed (`2>/dev/null`), error code caught by `|| echo "0"`
4. Both `ahead` and `behind` default to `0`
5. The `else` branch (line 192) executes: "Status: IN SYNC"

This is misleading. The user asked to compare against a branch that doesn't exist upstream, and the script says "everything is in sync" without any warning that the comparison couldn't be performed.

The same issue can occur silently in other scenarios — if the remote was renamed, if the branch was deleted upstream, or if the branch name has a typo.

**Fix:** Verify that the upstream ref exists before attempting the comparison:

```bash
report_divergence() {
  local branch="$1"
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local upstream_ref="upstream/${branch}"

  # Verify the upstream ref exists
  if ! git show-ref --verify "refs/remotes/${upstream_ref}" >/dev/null 2>&1; then
    printf "\n"
    printf "=== Fork Divergence Report ===\n"
    printf "Local branch:  %s\n" "$current_branch"
    printf "Upstream ref:  %s\n" "$upstream_ref"
    printf "\n"
    printf "Error: Upstream branch '%s' was not found on remote.\n" "$upstream_ref" >&2
    printf "The branch may not exist upstream, or the branch name may be incorrect.\n" >&2
    exit 1
  fi

  # ... rest of function
}
```

---

## Info

### IN-03: License header in script conflicts with project-wide AGPL-3.0 license

**File:** `scripts/sync-upstream.sh:4-23`

**Issue:** The script carries a 20-line BSD 3-clause license header (lines 4-23) while the overall project is licensed under AGPL-3.0 (README line 200). This creates a licensing inconsistency — a contributor or downstream consumer reading just this file would see BSD 3-clause terms, while the rest of the project is AGPL-3.0. The project's license file (`LICENSE`) contains the AGPL-3.0 terms.

BSD 3-clause is more permissive than AGPL-3.0, so this likely doesn't create legal risk for the copyright holder. However, it's confusing and inconsistent. Either:
- Remove the BSD header and rely on the project-wide LICENSE file
- Or add a note that this file is part of the OpenWolf project licensed under AGPL-3.0

Both approaches should reference `SPDX-License-Identifier: AGPL-3.0-only` for clarity.

**Fix:** Replace the BSD 3-clause header with a short SPDX annotation:

```bash
#!/bin/bash
# sync-upstream.sh - Report fork divergence from upstream cytostack/openwolf
#
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of OpenWolf. See <root>/LICENSE for full terms.
set -euo pipefail
```

---

### IN-04: Test 3 uses `\|` BRE alternation without `-E` flag

**File:** `tests/sync-upstream.sh:82`

**Issue:** Test 3 checks fetch failure output using `grep -qi "error\|failed"`. The `\|` alternation operator is a GNU extension to basic regular expressions (BRE). In strict POSIX BRE, `\|` is a literal backslash followed by a pipe character. While it works on modern GNU grep and BSD grep 2.6.0 (current macOS), it is technically non-portable to strict POSIX environments or older grep implementations.

The correct, portable approach is to use `-E` for extended regular expressions:

```bash
if echo "$output" | grep -qiE "error|failed"; then
```

This was the same pattern found in the original CR-02 (test 10), which was fixed by simplification. The fix here is the same — use `-E` or simplify to check only the deterministic error string:

```bash
# Option A: Add -E for portable ERE
grep -qiE "error|failed"

# Option B: Check only the deterministic message (most robust)
grep -q "Failed to fetch from upstream remote"
```

---

## Files Reviewed

| File | Lines | Type |
|------|-------|------|
| `scripts/sync-upstream.sh` | 242 | Bash script (divergence reporter) |
| `tests/sync-upstream.sh` | 268 | Bash script (test suite) |
| `README.md` | 200 | Documentation (Fork Management section) |

## Fix Status Summary

| Previous Finding | Status | Notes |
|-----------------|--------|-------|
| CR-01: Relative SCRIPT path  | ✅ Fixed | Absolute path resolves from `BASH_SOURCE` |
| CR-02: BRE `\|` in test 10  | ✅ Fixed | Simplified to `grep -qi "usage"` |
| WR-01: `-x` check in `script_exists()` | ✅ Fixed | Removed `-x`, only checks `-f` |
| WR-02: `VERBOSE` not `local` | ✅ Fixed | Added `local` declaration |
| WR-03: Core status tests skipped | ✅ Fixed | Tests 5-8 now implemented with bare repos |
| WR-04: Leading hyphen in branch names | ✅ Fixed | Regex requires alphanumeric first char |
| IN-01: Redundant grep alternation | ✅ Fixed | Same as CR-02 fix |
| IN-02: Double newline | ⚠️ Unfixed | Trivial formatting, not re-filed |

**New findings this iteration:** 4 warnings (WR-05 through WR-08), 2 info (IN-03, IN-04)

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
