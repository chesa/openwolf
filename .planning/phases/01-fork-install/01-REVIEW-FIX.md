---
phase: 01-fork-install
fixed_at: 2026-06-07T19:00:00Z
review_path: .planning/phases/01-fork-install/01-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-07T19:00:00Z
**Source review:** .planning/phases/01-fork-install/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: pnpm version string not sanitized for potential `v` prefix

**Files modified:** `scripts/install-dev.sh`
**Commit:** `0cf6815`
**Applied fix:** Added `sed 's/^v//'` to the pnpm version string before extracting the major version via `cut -d. -f1`, consistent with the Node.js version check on line 99. This prevents shell errors if `pnpm --version` ever outputs a `v`-prefixed string (e.g. via Corepack/nvm wrappers), which would cause `cut` to yield `v8` and produce a failed integer comparison.

### WR-02: Help and usage text omit `-h`/`-v` shorthands

**Files modified:** `scripts/install-dev.sh`
**Commit:** `bc02e87`
**Applied fix:** Updated all three locations that show usage text to include the `-h` and `-v` short flags:
- Header comment block (lines 14-16): `[-h | --help]` and `[-v | --version]`
- `show_help()` function (lines 33-36): `[-h | --help]` and `[-v | --version]`
- Error fallback message (line 83): `[--help|-h] [--version|-v]`

### WR-03: Global conflict warning doesn't explain script continuation

**Files modified:** `scripts/install-dev.sh`
**Commit:** `63aee97`
**Applied fix:** Revised the global openwolf conflict warning to explicitly explain that the script will continue execution and link the local build globally (overriding the existing installation). The uninstall instructions are re-framed as a suggestion ("to avoid potential confusion, you may uninstall") rather than an imperative, reducing the chance users misinterpret this as a hard failure.

---

_Fixed: 2026-06-07T19:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
