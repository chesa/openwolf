---
phase: 02-divergence-management
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/sync-upstream.sh
  - tests/sync-upstream.sh
  - README.md
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the fork divergence management implementation: `scripts/sync-upstream.sh` (242 lines, bash divergence reporter), `tests/sync-upstream.sh` (209 lines, bash test suite), and `README.md` (200 lines, with fork management section). Found 2 critical, 4 warning, and 2 info findings.

The production script is functionally sound with well-structured functions, input validation, and proper error handling. The test suite, however, has a **structural bug that causes all tests involving temp directories to silently fail** — the relative script path cannot be resolved after `cd` into a temporary directory. Additionally, a grep regex portability issue on macOS will cause the help flag test to always fail. The test suite also skips 5 of 12 tests, leaving the core divergence logic (AHEAD/BEHIND/DIVERGED/IN SYNC status determination) completely untested.

---

## Critical Issues

### CR-01: Tests silently fail because relative `$SCRIPT` path cannot be resolved from temp directory

**File:** `tests/sync-upstream.sh:9,33-41`
**Issue:** `SCRIPT="scripts/sync-upstream.sh"` (line 9) is a relative path. Tests 1, 2, 3, 4, 9, and 12 all call `setup_test_repo()` which does `cd "$TEST_TMP_DIR"`, then run `cd "$TEST_TMP_DIR"` in a subshell before invoking `bash "$SCRIPT"`. At that point, the relative path `scripts/sync-upstream.sh` resolves against the temp directory (`/tmp/sync-upstream-test-XXXXXX`), not the project root. The script file does not exist at that path, so bash emits "No such file or directory" to stderr. The `|| true` swallows the non-zero exit, and `$output` captures the bash error message instead of the script's actual output. All test assertions then fail to match, producing false negatives.

**Affected test functions:**
- `test_1_missing_upstream_remote` (line 45) — checks for "Added upstream remote", never sees it because script never ran
- `test_2_existing_upstream_remote` (line 61) — checks for "Using existing upstream remote", never sees it
- `test_3_fetch_failure` (line 76) — checks for "error" or "failed", bash's "No such file" message happens to match "Error"... actually, let me re-check. On macOS, bash error: `bash: scripts/sync-upstream.sh: No such file or directory`. This DOES contain "No such file" which is not "error" or "failed". So this test fails too.
- `test_4_default_branch_header` (line 91) — checks for "Fork Divergence Report", never produced
- `test_9_feature_branch_warning` (line 128) — checks for "Warning:", never produced  
- `test_12_branch_flag` (line 173) — checks for "upstream/develop", never produced

**Fix:** Use an absolute path for `SCRIPT`. Compute from the test script's own location or the project root:

```bash
# Option A: Resolve relative to the test script's directory
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/sync-upstream.sh"

# Option B: Resolve at the start of the test suite (simpler)
SCRIPT="$(pwd)/scripts/sync-upstream.sh"
```

Or, alternatively, resolve the path in each test subshell by passing it as an absolute reference:

```bash
SCRIPT_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/sync-upstream.sh"
# Then in sub-shells:
output=$(bash "$SCRIPT_ABS" 2>&1 || true)
```

---

### CR-02: `grep` regex uses BRE alternation (`\|`) without `-E` flag — always fails on macOS

**File:** `tests/sync-upstream.sh:150`
**Issue:** The `--help` test checks output using `grep -qi "usage\|Usage\|Usage:"`. Without the `-E` (extended regex) flag, `grep` operates in basic regex mode. On macOS's BSD grep, `\|` is a **literal pipe character** in basic mode, not an alternation operator. (GNU grep supports `\|` as a BRE extension, but BSD grep does not.) The pattern therefore looks for the exact string "usage|Usage|Usage:" which does not appear in the help text. The test always fails on macOS with a misleading message.

`grep -qi` combined with the pattern means the pattern `usage\|Usage\|Usage:` is interpreted as looking for the literal sequence `usage|Usage|Usage:` (with pipe characters), which never appears in the help output.

**Fix:** Add `-E` for extended regex, or better, simplify since `-i` already handles case:

```bash
# Option A: Add -E flag
if echo "$output" | grep -qiE "usage|Usage|Usage:"; then

# Option B: Simplify with case-insensitive match (preferred)
if echo "$output" | grep -qi "usage"; then

# Option C: Match the exact help header
if echo "$output" | grep -q "Usage:"; then
```

---

## Warnings

### WR-01: `script_exists()` requires execute permission but tests use `bash` directly

**File:** `tests/sync-upstream.sh:29-31`
**Issue:** The `script_exists()` function checks `[ -f "$SCRIPT" ] && [ -x "$SCRIPT" ]`, requiring the script to be executable. However, every test invocation uses `bash "$SCRIPT"` which reads the file as a script directly — the shebang line (`#!/bin/bash`) is irrelevant when bash is explicitly invoked. A file without execute permission (e.g., `644` instead of `755`) would cause `script_exists()` to return false and tests 10 and 11 to report FAIL, even though `bash "$SCRIPT"` works perfectly fine.

**Fix:** Remove the `-x` check since execute permission is unnecessary:

```bash
script_exists() {
  [ -f "$SCRIPT" ]
}
```

---

### WR-02: Global variable `VERBOSE` not declared with `local` in `main()`

**File:** `scripts/sync-upstream.sh:202`
**Issue:** `VERBOSE="false"` is set in `main()` without a `local` declaration, making it a global variable. It is later read in `fetch_upstream()` (line 108). Bash uses dynamic scoping, so this works as long as `fetch_upstream` is called from `main`. However, if `fetch_upstream` is ever called from a different context, or if another function inadvertently writes to `VERBOSE`, behavior becomes unpredictable. This is also a maintainability concern — a reader scanning `fetch_upstream` sees an undeclared variable with no clear origin.

**Fix:** Declare `VERBOSE` as local in `main()`:

```bash
main() {
  local branch="$DEFAULT_BRANCH"
  local VERBOSE="false"
  ...
}
```

---

### WR-03: Core divergence status logic is entirely untested (5 of 12 tests skipped)

**File:** `tests/sync-upstream.sh:108-125`
**Issue:** Tests 5 (AHEAD), 6 (BEHIND), 7 (DIVERGED), and 8 (IN SYNC) — the four status states that constitute the core business logic of `report_divergence()` — are all unconditionally skipped with the note "Requires controlled git divergence; verified in real run". These tests cover 46 lines of the 64-line `report_divergence()` function (lines 161-195), leaving the entire status-determination logic untested in CI. Any regression in the ahead/behind calculation or branch comparison logic would go undetected by the test suite.

While setting up controlled divergence in a temp repo is nontrivial, it is achievable:
- **AHEAD**: create a commit on local, do not add to upstream
- **BEHIND**: create a commit on upstream, reset local to before it
- **DIVERGED**: create commits on both sides
- **IN SYNC**: use the bare repo after init (both refs point to the same commit — but wait, upstream/main doesn't exist, so `git rev-list --count` fails and both return 0)

The IN SYNC case actually works by accident with the current pattern (when upstream ref doesn't exist, `|| echo "0"` kicks in, both ahead/behind are 0, status shows IN SYNC). But this is accidental — the IN SYNC test should verify that when both refs exist and point to the same commit, the status is IN SYNC, not when the upstream ref is missing.

**Fix:** Implement controlled divergence tests using `git commit --allow-empty` and local references:

```bash
test_5_ahead_status() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    # Make upstream ref point here, then add commits only to local
    git branch upstream_main HEAD  # simulated upstream/main
    git commit --allow-empty -m "Ahead commit"
    # Point upstream to same place
    output=$(bash "$SCRIPT" 2>&1 || true)
    if echo "$output" | grep -q "Status: AHEAD"; then
      print_result PASS "Test 5: AHEAD status" ""
      return
    fi
    print_result FAIL "Test 5: AHEAD status" "Did not detect AHEAD status"
  )
}
```

---

### WR-04: Branch name validation regex allows leading hyphen

**File:** `scripts/sync-upstream.sh:127`
**Issue:** The validation regex `^[a-zA-Z0-9._/-]+$` allows branch names starting with `-` (hyphen). While the validated name is used only in revision range arguments (e.g., `"${upstream_ref}..${branch}"`), which git interprets as refs rather than flags, this is still an unnecessarily permissive validation. Branch names like `--help` or `-L` would pass validation but could cause confusing error messages or unexpected behavior in edge cases.

**Fix:** Require the branch name to start with an alphanumeric character:

```bash
if ! printf "%s" "$branch" | grep -qE '^[a-zA-Z0-9][a-zA-Z0-9._/-]*$'; then
```

---

## Info

### IN-01: Overly complex grep pattern with redundant alternation

**File:** `tests/sync-upstream.sh:150`
**Issue:** The pattern `usage\|Usage\|Usage:` in the `--help` test combines case alternatives with a trailing `:` variation. Since `grep -i` provides case-insensitive matching, `usage` alone suffices. The current pattern is harder to read and, due to CR-02, broken on macOS.

**Fix:** 
```bash
if echo "$output" | grep -qi usage; then
```

---

### IN-02: Double newline pattern in warning output

**File:** `scripts/sync-upstream.sh:155-156`
**Issue:** The warning message uses a `\n` at the end of the format string followed by a separate `printf "\n"` on the next line. This produces a double blank line which is inconsistent with the rest of the script's output formatting. The same pattern appears on line 157 (`printf "\n"` after the warning).

**Fix:** Consolidate newlines into the format string or remove the extra `printf "\n"`:

```bash
# Current (awkward double blank line):
printf "Warning: ...\n" >&2
printf "\n"

# Better:
printf "Warning: ...\n\n" >&2
```

---

## Files Reviewed

| File | Lines | Type |
|------|-------|------|
| `scripts/sync-upstream.sh` | 242 | Bash script (divergence reporter) |
| `tests/sync-upstream.sh` | 209 | Bash script (test suite) |
| `README.md` | 200 | Documentation |

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
