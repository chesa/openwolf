---
phase: 02-divergence-management
reviewed: 2026-06-07T20:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/sync-upstream.sh
  - tests/sync-upstream.sh
  - README.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-07T20:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed `scripts/sync-upstream.sh`, `tests/sync-upstream.sh`, and `README.md` at standard depth. The prior review findings (WR-01 through WR-04) have been fixed in commits 9fabcb6, 14b1dbe, 3d399b1, and 3207ef0. Two new warnings and two info items were identified in the current state.

The primary concern is a bash version compatibility issue: both scripts use `set -euo pipefail`, which requires bash >= 4.0, but the macOS default `/bin/bash` is 3.2.57 and the project's root CLAUDE.md states "Bash 3.2+ compatible" compatibility. The scripts will fail immediately on the primary development platform.

## Warnings

### WR-05: `set -euo pipefail` incompatible with macOS default bash 3.2

**File:** `scripts/sync-upstream.sh:24`
**File:** `tests/sync-upstream.sh:4`
**Issue:** Both scripts use `set -euo pipefail` on line 24 (sync-upstream.sh) and line 4 (tests/sync-upstream.sh). The `pipefail` shell option was introduced in **bash 4.0**. macOS ships **bash 3.2.57(1)** as its default `/bin/bash` (confirmed on this system). Running either script with `/bin/bash` on macOS produces:

```
set: pipefail: invalid option
```

The project's root CLAUDE.md states "Shell: Bash 3.2+ compatible (prefer built-ins over external commands)", establishing bash 3.2+ as the compatibility target. The scripts violate this target.

Note: This same pattern is also used in `scripts/install-dev.sh:21` (not in review scope), suggesting the issue may be project-wide.

**Fix (option A — prefer built-in pipe safety over `pipefail`):**
Replace `set -euo pipefail` with:
```bash
set -eu
# Manual pipe-failure guard: capture PIPESTATUS at each critical pipe
```
This avoids the bash 4.0 dependency entirely. Individual pipe failures are handled explicitly where needed.

**Fix (option B — runtime feature check if bash >= 4.0 is acceptable):**
Add a version check and clear error message:
```bash
if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
  echo "Error: This script requires bash >= 4.0 (current: $BASH_VERSION)" >&2
  echo "Install a newer bash via: brew install bash" >&2
  exit 1
fi
set -euo pipefail
```

**Fix (option C — compatible guard):**
```bash
set -eu
if ! set -o pipefail 2>/dev/null; then
  echo "Warning: pipefail not supported (bash < 4.0). Pipeline errors may be masked." >&2
fi
```

### WR-06: Suppressed error output on git rev-list commands hinders debugging

**File:** `scripts/sync-upstream.sh:167-168`
**Issue:** Both `git rev-list --count` commands redirect stderr to `/dev/null`:
```bash
ahead=$(git rev-list --count "${upstream_ref}..${branch}" 2>/dev/null)
behind=$(git rev-list --count "${branch}..${upstream_ref}" 2>/dev/null)
```

If these commands fail unexpectedly (e.g., repository corruption, race condition from a concurrent `git fetch`, or filesystem error), the git error message is discarded. With `set -e` in effect, the shell exits silently — leaving the user with no diagnostic information. The preceding ref validation (lines 154-165) catches the most common failure modes, but unexpected errors produce a confusing silent-abort scenario.

**Fix:** Remove `2>/dev/null` to let git errors surface naturally:
```bash
ahead=$(git rev-list --count "${upstream_ref}..${branch}")
behind=$(git rev-list --count "${branch}..${upstream_ref}")
```

If the intent was to suppress common "ambiguous argument" errors that are already guarded by the ref validation above, an alternative is to keep the suppression but add explicit failure handling:
```bash
ahead=$(git rev-list --count "${upstream_ref}..${branch}" 2>/dev/null) || {
  printf "Error: Failed to compute ahead/behind count.\n" >&2
  printf "  upstream ref: %s  local branch: %s\n" "$upstream_ref" "$branch" >&2
  exit 1
}
```

## Info

### IN-03: Tests 1 and 2 depend on network failure for expected behavior

**File:** `tests/sync-upstream.sh:50-65` (Test 1)
**File:** `tests/sync-upstream.sh:68-82` (Test 2)
**Issue:** Tests 1 and 2 depend on `git fetch upstream` from `https://github.com/cytostack/openwolf.git` failing because test machines typically lack GitHub network access:

- **Test 1** (line 57): expects non-zero exit because the script adds the upstream remote, then tries to fetch from GitHub and fails
- **Test 2** (line 76): expects non-zero exit because upstream remote is pre-set to the real GitHub URL, then fetch fails

If these tests run on a machine with network access to GitHub, the fetch would succeed, the script would exit 0, both tests would produce false negatives, and report failure incorrectly.

Test 3 (lines 85-99) handles this more robustly by using an explicit nonexistent URL (`https://github.com/nonexistent-user/nonexistent-repo.git`), guaranteeing fetch failure regardless of network environment.

**Fix:** Standardize on the Test 3 approach — use a guaranteed-nonexistent URL or a local-only strategy for all tests that expect fetch failure:

```bash
# In test setup (Test 1 equivalent):
git remote add upstream "$TEST_TMP_DIR/nonexistent-upstream"
# Instead of relying on the real GitHub URL
```

### IN-04: UPPER_CASE naming for local variable

**File:** `scripts/sync-upstream.sh:222`
**Issue:** `VERBOSE` is declared as a `local` variable in `main()` using UPPER_CASE. In shell scripting, UPPER_CASE is conventionally reserved for exported environment variables. Lowercase is standard for function-local variables. While `local` prevents accidental collision with the environment, `VERBOSE` could be confused with an environment variable by future maintainers.

**Fix:** Use lowercase for the local variable:
```bash
local verbose="false"
```

And update the reference in `fetch_upstream()`:
```bash
fetch_upstream() {
  if [ "$verbose" = "true" ]; then
```

---

_Reviewed: 2026-06-07T20:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
