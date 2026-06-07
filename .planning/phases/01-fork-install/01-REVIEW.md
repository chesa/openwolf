---
phase: 01-fork-install
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/install-dev.sh
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 01: Code Review Report — fork-install

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Re-reviewed `scripts/install-dev.sh` (174 lines) and `docs/DEVELOPMENT.md` (162 lines) after a previous review cycle fixed 4 warnings (WR-01 through WR-04). This review confirms all previous fixes are correctly applied and finds **1 new warning** (WR-05: missing pnpm >= 8 prerequisite in the documentation) plus **1 new info item** (IF-03: help text inconsistency). Two info findings from the previous review (IN-01: unquoted `$#`, IN-02: missing CWD guard) remain unfixed as they were out of scope for the Warning-only fix cycle.

**What changed:** All 4 prior warnings were fixed (targeted commits: `7795a3d`, `a552fbc`, `f82751a`, `2783b68`). The numbered list in DEVELOPMENT.md now flows 1→2→3→4 without breaks. The manual fallback includes `pnpm link --global`. The troubleshooting section now contextually anchors to both automated and manual paths. The install script validates pnpm >= 8. Cross-references between the two files remain consistent.

**No security issues or critical bugs found.**

---

## Warnings

### WR-01: Numbered list break between Step 3 and Step 4 in DEVELOPMENT.md
**Status: ✅ FIXED** (commit `7795a3d`)

The `### Troubleshooting` heading no longer interrupts the numbered list. Steps flow contiguously 1→2→3→4. The troubleshooting section now correctly appears after the list closes.

---

### WR-02: Manual fallback steps omit `pnpm link --global`
**Status: ✅ FIXED** (commit `a552fbc`)

Line 31 now includes `pnpm link --global    # optional: makes 'openwolf' available globally` in the manual fallback code block.

---

### WR-03: Troubleshooting references command not in manual path
**Status: ✅ FIXED** (commit `f82751a`)

The troubleshooting lead-in at lines 40-42 now correctly anchors to both the automated script and manual `pnpm link --global`:
> "If the automated setup script (\`./scripts/install-dev.sh\`) fails during the global link step, or if you manually ran \`pnpm link --global\` and encountered a path error..."

---

### WR-04: No pnpm minimum version validation
**Status: ✅ FIXED** (commit `2783b68`)

Lines 115-121 in `scripts/install-dev.sh` now extract the pnpm major version and reject pnpm < 8.0.0 with a clear error message. The guard correctly handles the edge cases (missing version, empty output) via `|| true` and `-z` checks.

---

### WR-05 (NEW): Missing pnpm >= 8 prerequisite in DEVELOPMENT.md

**File:** `docs/DEVELOPMENT.md:48`
**Issue:** The prerequisites blockquote at line 48 only mentions Node.js >= 20.0.0:
```markdown
> **Prerequisites:** Node.js >= 20.0.0. See [Getting Started](getting-started.md) for full prerequisite details.
```
The script now validates pnpm >= 8.0.0 (WR-04 fix), but a developer reading only the documentation would have no way of knowing this requirement exists. Combined with the fact that `getting-started.md` also omits pnpm from its prerequisites list, a developer could spend time debugging a build failure caused by an old pnpm version without any prior warning.

**Fix:** Update the prerequisites blockquote in `docs/DEVELOPMENT.md` to include the pnpm version:
```markdown
> **Prerequisites:** Node.js >= 20.0.0, pnpm >= 8.0.0. See [Getting Started](getting-started.md) for full prerequisite details.
```

Also consider adding `"packageManager": "pnpm@8.0.0"` to `package.json` for corepack-aware tooling, which would catch the issue even earlier (at the `pnpm install` stage).

---

## Info

### IN-01: Unquoted `$#` in argument count check
**Status: ❌ UNFIXED** (still present at line 71)

**File:** `scripts/install-dev.sh:71`
**Issue:** `$#` is unquoted in `if [ $# -gt 0 ]`. While `$#` always resolves to a non-empty integer (making this safe in practice), quoting positional and special parameters is a best practice per ShellCheck SC2254.

**Fix:**
```bash
if [ "$#" -gt 0 ]; then
```

---

### IN-02: Script assumes CWD is project root without verification
**Status: ❌ UNFIXED** (still present at lines 143-150)

**File:** `scripts/install-dev.sh:143-150`
**Issue:** The script runs `pnpm install`, `pnpm build`, and `pnpm link --global` without verifying that the current working directory contains `package.json`. The git repo check at line 125 only ensures the user is somewhere inside the OpenWolf repo, not necessarily at the project root. Running from a subdirectory causes pnpm to fail with "No package.json found", which is recoverable but confusing.

**Fix:** Add an early CWD guard:
```bash
if [ ! -f package.json ]; then
  printf 'Error: package.json not found in %s.\n' "$(pwd)" >&2
  printf '  Run this script from the project root directory.\n' >&2
  exit 1
fi
```

---

### IF-03 (NEW): Help text omits pnpm version requirement

**File:** `scripts/install-dev.sh:45-46`
**Issue:** The `show_help()` function lists prerequisites inconsistently:
```
  - Node.js >= 20.0.0
  - pnpm (package manager)
```
Node.js includes a version requirement but pnpm does not, despite the script validating pnpm >= 8. A user running `./scripts/install-dev.sh --help` to check requirements would not discover the pnpm version constraint until they actually run the script and get a hard error.

**Fix:** Update the help text's prerequisite list for consistency:
```
  - Node.js >= 20.0.0
  - pnpm >= 8.0.0 (package manager)
```

---

### IF-04 (NEW): Troubleshooting doesn't note shell restart after `pnpm setup`

**File:** `docs/DEVELOPMENT.md:40-46`
**Issue:** The troubleshooting section suggests `pnpm setup` to add pnpm's bin directory to PATH, but doesn't mention that a shell restart or sourcing (`source ~/.bashrc` / `source ~/.zshrc`) may be required for the change to take effect. A developer running `pnpm setup` followed immediately by `openwolf --help` would still get "command not found" if they don't reload their shell.

**Fix:** Append a note to the troubleshooting block:
```markdown
   After running `pnpm setup`, restart your terminal or run
   `source ~/.zshrc` (or `source ~/.bashrc`) for the PATH change
   to take effect.
```

---

## File-by-File Analysis

### scripts/install-dev.sh (174 lines)

**Structure:** Clean, well-commented, organized into clear sections with `set -euo pipefail` for safety.

**Strengths:**
- All prerequisite checks guard against missing tools with clear error messages to stderr.
- `|| true` idioms correctly prevent `set -e` from aborting checks for optional/missing commands.
- `"${1:-}"` guards against empty argument in the case pattern.
- The upstream remote configuration handles all three states correctly (not present → add; present with correct URL → confirm; present with wrong URL → warn and leave as-is).

**Remaining issues:**
- IN-01: Unquoted `$#` on line 71 (ShellCheck SC2254).
- IN-02: No CWD guard before running pnpm commands.
- IF-03: Help text omits pnpm version in prerequisites list.

**Edge cases handled:**
- `node --version` failure → exits 1 with clear message.
- `pnpm --version` failure or empty → exits 1 via `-z` check.
- `git remote get-url upstream` failure → set to empty string, then compared.
- Global `openwolf` already installed → prints warning but continues.
- Invalid CLI flags → prints error and exits 1.

**Edge cases NOT handled:**
- Script run from a git subdirectory (CWD guard missing).
- macOS bash 3.2 compatibility: verified OK (no bash 4+ features used).
- `--` argument terminator: Not supported; `--help` after `--` would be treated as an unknown argument. Low severity.

### docs/DEVELOPMENT.md (162 lines)

**Structure:** Well-organized with clear sections, consistent use of tables and code blocks.

**Strengths:**
- Cross-references (`CONTRIBUTING.md`, `TESTING.md`, `getting-started.md`) all resolve to existing files.
- Build commands table accurately covers all `pnpm` scripts from `package.json`.
- The three-part architecture description is accurate.
- CI/CD section matches the actual `.github/workflows/docs.yml` workflow.

**Remaining issues:**
- WR-05: Missing pnpm >= 8 in prerequisites.
- IF-04: Missing shell restart note after `pnpm setup`.
- The "See [Getting Started](getting-started.md) for full prerequisite details" reference leads to a page that also omits pnpm from its prerequisites.

---

## Cross-File Observations

| Check | Status |
|---|---|
| Exit message matches between script (line 174) and docs (line 36) | ✅ Consistent |
| "Node.js >= 20.0.0" requirement is the same in both files | ✅ Consistent |
| `package.json` name is `"openwolf"` → `pnpm link --global` creates correct alias | ✅ Consistent |
| CI workflow in `.github/workflows/docs.yml` uses `npm` inside `docs/` directory | ✅ Consistent (matches docs line 143) |
| pnpm >= 8 validated in script but missing from both docs' prerequisites | ❌ GAP |
| Troubleshooting `pnpm setup` in docs doesn't mention shell restart | ❌ MISSING |

---

## Recommendations (Priority Order)

1. **Update DEVELOPMENT.md prerequisites** (WR-05) — Add `pnpm >= 8.0.0` to the prerequisite blockquote at line 48. This is the most impactful remaining doc fix since the script already enforces this requirement.

2. **Add project root guard to the script** (IN-02) — Add a `package.json` existence check early in the script. While classified as Info due to pnpm's clear error message, this is a cheap check that saves developer confusion.

3. **Fix help text inconsistency** (IF-03) — Update line 46 in `show_help()` to include the pnpm version. Minor but quick.

4. **Add shell restart note to troubleshooting** (IF-04) — One-line addition after the `pnpm setup` suggestion.

5. **Quote `$#`** (IN-01) — ShellCheck compliance, purely stylistic.

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: gsd-code-reviewer (adversarial stance)_
_Depth: standard_
