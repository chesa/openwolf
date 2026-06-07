---
phase: 02-divergence-management
reviewed: 2026-06-07T17:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/sync-upstream.sh
  - tests/sync-upstream.sh
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-07T17:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed `scripts/sync-upstream.sh` (249 lines) and `tests/sync-upstream.sh` (280 lines) — a fork divergence reporting utility and its test suite. The main script is well-structured with `set -euo pipefail`, clear function boundaries, input validation, and read-only semantics (no merge/rebase). The test suite covers 12 behavior scenarios with isolated temp repos.

Key concerns: the divergence computation silently produces "IN SYNC" when the local branch doesn't exist; the branch name validator allows characters that git itself rejects; tests verify output strings but never assert exit codes.

---

## Warnings

### WR-01: Silent "IN SYNC" when local branch does not exist

**File:** `scripts/sync-upstream.sh:154-155`
**Issue:** If a user passes `--branch nonexistent-branch` (validated name syntax but no local ref), both `git rev-list` commands fail, and the `|| echo "0"` fallback silently sets ahead=0 and behind=0, producing a "Status: IN SYNC" result. This is logically incorrect — a nonexistent branch is not "in sync" with anything. The misleading IN SYNC status masks the configuration error.

The script validates the branch name format (line 127) and checks the upstream ref exists (line 148), but never verifies that the local branch exists before computing divergence. The upstream-ref check at line 148 will exit with an unhelpful "Upstream branch was not found on remote" message — blaming the remote when the real problem is the missing local branch.

**Fix:** Add a local branch existence check early in `report_divergence()` before computing counts:

```bash
# In report_divergence(), before line 148:
if ! git show-ref --verify "refs/heads/${branch}" >/dev/null 2>&1; then
  printf "Error: Local branch '%s' does not exist.\n" "$branch" >&2
  printf "Use 'git branch' to list available branches.\n" >&2
  exit 1
fi
```

Alternatively, make the `git rev-list` failure explicit — remove the `|| echo "0"` fallback so that a failing `git rev-list` propagates the error instead of masking it:

```bash
ahead=$(git rev-list --count "${upstream_ref}..${branch}" 2>/dev/null)
behind=$(git rev-list --count "${branch}..${upstream_ref}" 2>/dev/null)
```

This causes the script to exit on failure (due to `set -e`), surfacing the error immediately.

---

### WR-02: Branch name validation is weaker than git's rules

**File:** `scripts/sync-upstream.sh:127`
**Issue:** The regex `^[a-zA-Z0-9][a-zA-Z0-9._/-]*$` allows branch names that git itself rejects. Specifically:
- Double-dot (`..`) is allowed but invalid in git refspecs
- Trailing `.` (dot) is allowed but invalid in git branch names
- Trailing `.lock` suffix is allowed (reserved by git)
- Names starting with `/` or containing `@{` are prevented by the regex, which is good, but the allowed false positives above create a false sense of security — the user sees "branch name validated" but git will still reject the name.

**Fix:** Tighten the regex to match git's actual branch name rules:

```bash
# Reject names that git would reject:
# - No two consecutive dots
# - No trailing .lock or .
# - No leading or trailing /
# - No @{
if ! printf "%s" "$branch" | grep -qE '^[a-zA-Z0-9][a-zA-Z0-9._/-]*$' ||
   printf "%s" "$branch" | grep -qE '\.\.|\.lock$|\.$|/$|@{'; then
```

Or use git itself for canonical validation:

```bash
if ! git check-ref-format --branch "$branch" 2>/dev/null; then
  printf "Error: Invalid branch name '%s'.\n" "$branch" >&2
  exit 1
fi
```

Using `git check-ref-format --branch` eliminates the need to maintain a parallel regex entirely.

---

### WR-03: Tests never assert exit codes

**File:** `tests/sync-upstream.sh`
**Issue:** Every behavioral test checks only string output (e.g., grepping for "AHEAD", "BEHIND", "Error:", etc.) but never verifies the script's exit code. A test could:
- Match "BEHIND" in output but the script could have exited 1 instead of 0
- Match "Error:" in output without confirming the exit code is non-zero
- Pass spuriously if the wrong output message coincidentally contains the grep target

Noteable examples:
- Test 3 (`test_3_fetch_failure`, line 86-91): Checks for "error" or "failed" in output but never asserts non-zero exit. The `|| true` on line 86 discards the exit code entirely.
- Test 5 (`test_5_ahead_status`, line 123-128): Checks for "AHEAD" but doesn't verify exit 0.

**Fix:** Capture exit code and assert it alongside output checks. Example for test 3:

```bash
test_3_fetch_failure() {
  setup_test_repo
  (
    cd "$TEST_TMP_DIR"
    git remote add upstream https://github.com/nonexistent-user/nonexistent-repo.git
    set +e
    bash "$SCRIPT" 2>&1; exit_code=$?
    set -e
    output=$(bash "$SCRIPT" 2>&1) || true
    if [ "$exit_code" -ne 0 ] && echo "$output" | grep -qi "error"; then
      print_result PASS "Test 3: Fetch failure - exits with error" ""
      return
    fi
    print_result FAIL "Test 3: Fetch failure" "exit code $exit_code, error not reported"
  )
}
```

---

### WR-04: `ensure_upstream_remote` does not verify remote URL matches expected

**File:** `scripts/sync-upstream.sh:95-103`
**Issue:** `ensure_upstream_remote` confirms an `upstream` remote exists but does not verify its URL matches `UPSTREAM_URL`. If a user has an `upstream` remote pointing to a different fork (e.g., their colleague's fork, or a stale URL after a repo transfer), the script silently uses the wrong remote for divergence comparison. The function prints the URL for awareness, but doesn't warn when it differs from the expected URL. This could produce a meaningful but incorrect divergence report against the wrong repository.

**Fix:** Add a URL comparison and warn (or exit) on mismatch:

```bash
ensure_upstream_remote() {
  local url
  if url=$(git remote get-url upstream 2>/dev/null); then
    if [ "$url" != "$UPSTREAM_URL" ]; then
      printf "Warning: Existing upstream remote URL differs from expected.\n" >&2
      printf "  Expected: %s\n" "$UPSTREAM_URL" >&2
      printf "  Found:    %s\n" "$url" >&2
      printf "Continuing with existing remote URL. Use --verbose for details.\n" >&2
    fi
    printf "Using existing upstream remote: %s\n" "$url"
  else
    git remote add upstream "$UPSTREAM_URL"
    printf "Added upstream remote: %s\n" "$UPSTREAM_URL"
  fi
}
```

---

## Info

### IN-01: `validate_branch_name` only checks syntax, not branch existence

**File:** `scripts/sync-upstream.sh:125-131`
**Issue:** The function validates the branch name format but doesn't verify the branch exists locally. If a user typos a branch name (e.g., `--branch devel` instead of `--branch develop`), the name format check passes but the script fails later at the upstream ref check with a misleading error message ("Upstream branch was not found on remote" when really the local branch is the problem).

Related to WR-01; documenting separately as the root cause is the missing validity check rather than the downstream symptom.

**Fix:** See WR-01 fix — add `git show-ref --verify "refs/heads/${branch}"` check in `report_divergence()`.

---

### IN-02: Non-sequential test execution order

**File:** `tests/sync-upstream.sh:263-274`
**Issue:** Tests are called in a mixed order (10, 11, 12, 1, 2, 3, 4, 9, 5, 6, 7, 8) rather than sequentially. While this doesn't affect correctness (tests are isolated), it makes the output harder to follow and makes it harder to map test functions to their numbered calls. A reader seeing "Test 8: IN SYNC status" after "Test 4: Default branch header" expects sequential ordering.

**Fix:** Reorder calls to follow numeric order:

```bash
echo "Behavioral Tests:"
test_1_missing_upstream_remote || true
test_2_existing_upstream_remote || true
test_3_fetch_failure || true
test_4_default_branch_header || true
test_5_ahead_status || true
test_6_behind_status || true
test_7_diverged_status || true
test_8_in_sync_status || true
test_9_feature_branch_warning || true
test_10_help_flag || true
test_11_version_flag || true
test_12_branch_flag || true
```

---

### IN-03: Unused variable `TEST_TMP_DIR`

**File:** `tests/sync-upstream.sh:10-11`
**Issue:** `TEST_TMP_DIR` is declared as an empty string at line 10, but its value is always overwritten by `setup_test_repo()` before any read. The initial assignment is dead code — the variable's first meaningful value comes from `setup_test_repo`. This is harmless but unnecessary.

**Fix:** Remove the initial assignment:

```bash
TEST_TMP_DIR=""
```

Or remove the variable entirely and use `TEST_TMP_DIRS[-1]` to reference the latest temp dir (requires bash 4.3+). However, since the script uses `#!/bin/bash` and macOS might ship bash 3.2, the explicit variable should be kept — just remove the `=""` initialization to signal it's intentional.

---

### IN-04: Non-verbose fetch error message lacks diagnostic detail

**File:** `scripts/sync-upstream.sh:115-118`
**Issue:** When `VERBOSE` is `false` (default), `fetch_upstream` suppresses git's stderr output (`2>/dev/null`) and prints only a generic "Check network connectivity" message. If the fetch fails due to a non-connectivity reason (e.g., authentication failure, SSL certificate issue, remote URL change), the user sees no actionable diagnostic. The user must know to re-run with `--verbose` to see the real error.

This is a deliberate tradeoff (clean output vs. verbosity), noted as info rather than a defect — but consider printing the error stderr inline when the fetch fails, even in non-verbose mode:

```bash
if ! git fetch upstream 2>/dev/null; then
  printf "Error: Failed to fetch from upstream remote.\n" >&2
  printf "Re-run with --verbose to see details.\n" >&2
  exit 1
fi
```

---

_Reviewed: 2026-06-07T17:00:00Z_
_Reviewer: gsd-code-reviewer agent_
_Depth: standard_
