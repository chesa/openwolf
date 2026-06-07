---
phase: 02-divergence-management
fixed_at: 2026-06-07T00:00:00Z
review_path: .planning/phases/02-divergence-management/02-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-06-07T00:00:00Z
**Source review:** `.planning/phases/02-divergence-management/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Tests silently fail because relative `$SCRIPT` path cannot be resolved from temp directory

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `6a05d66`
**Applied fix:** Changed `SCRIPT="scripts/sync-upstream.sh"` to resolve the path
absolutely using `"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/sync-upstream.sh"`.
This ensures the script is found regardless of the current working directory,
fixing tests 1, 2, 3, 4, 9, and 12 which `cd` into a temp directory before
invoking `bash "$SCRIPT"`.

### CR-02: `grep` regex uses BRE alternation (`\|`) without `-E` flag — always fails on macOS

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `4e304a8`
**Applied fix:** Simplified the grep pattern in test 10 (`--help` flag) from
`grep -qi "usage\|Usage\|Usage:"` to `grep -qi "usage"`. The `-i` flag already
provides case-insensitive matching, so the alternation was redundant and,
on macOS BSD grep, the `\|` BRE extension is not supported, causing the
pattern to look for a literal `|` character.

### WR-01: `script_exists()` requires execute permission but tests use `bash` directly

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `74599c6`
**Applied fix:** Removed the `-x` check from `script_exists()` since every test
invocation uses `bash "$SCRIPT"` which reads the file directly (execute
permission is unnecessary). The function now only checks `[ -f "$SCRIPT" ]`.

### WR-02: Global variable `VERBOSE` not declared with `local` in `main()`

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** `d0e9079`
**Applied fix:** Added `local` keyword to the `VERBOSE="false"` declaration in
`main()` alongside the existing `local branch="$DEFAULT_BRANCH"`. This prevents
unintended global scope leakage and ensures proper dynamic scoping.

### WR-03: Core divergence status logic is entirely untested (5 of 12 tests skipped)

**Files modified:** `tests/sync-upstream.sh`
**Commit:** `3c279d1`
**Applied fix:** Implemented controlled divergence tests for AHEAD, BEHIND,
DIVERGED, and IN SYNC status (tests 5-8) using local bare repositories as
simulated upstream remotes. Each test:
- Creates a local bare repo as a simulated upstream
- Pushes the initial commit to establish a shared base
- Sets up the upstream remote pointing to the local bare repo
- Manipulates commits to create the desired divergence state
- Runs the script (which fetches from the local bare repo successfully)
- Checks for the expected status string in the output

This approach avoids network dependencies and ensures deterministic test
results. The bare repos are created inside `$TEST_TMP_DIR` and are
automatically cleaned up by the existing `cleanup()` trap.

### WR-04: Branch name validation regex allows leading hyphen

**Files modified:** `scripts/sync-upstream.sh`
**Commit:** `9842ac2`
**Applied fix:** Changed the branch name regex from
`^[a-zA-Z0-9._/-]+$` to `^[a-zA-Z0-9][a-zA-Z0-9._/-]*$`. The first
character class requires an alphanumeric start, and the second allows zero
or more additional valid characters. This prevents branch names like
`--help` or `-L` from passing validation.

---

_Fixed: 2026-06-07T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
