---
phase: 01-fork-install
reviewed: 2026-06-07T12:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/install-dev.sh
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 01: Code Review Report — fork-install

**Reviewed:** 2026-06-07T12:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed `scripts/install-dev.sh` (167 lines) and `docs/DEVELOPMENT.md` (159 lines) for the CHESA Fork Team Toolkit Phase 01. The shell script is well-structured, passes shellcheck cleanly, and handles the happy path correctly with `set -euo pipefail` for safety. The documentation is generally accurate with good cross-references. However, four warnings and two info items were identified, primarily around a broken numbered list structure in the docs and gaps between the manual fallback instructions and the troubleshooting section.

---

## Warnings

### WR-01: Numbered list break between Step 3 and Step 4 in DEVELOPMENT.md

**File:** `docs/DEVELOPMENT.md:33-41`
**Issue:** A `### Troubleshooting` heading is placed between step 3 (line 32) and step 4 (line 41) of the numbered list. Markdown processors treat the heading as a list break, causing step 4 to either restart at "1" or render as an orphaned number, depending on the renderer.

```markdown
1. Fork and clone the repository:
2. Run the automated setup script (recommended):
3. **Manual fallback** — ...
### Troubleshooting                          ← breaks the list
4. Verify the CLI works:                    ← will restart at "1" in most renderers
```

**Fix:** Move the troubleshooting section to after the numbered list closes, or precede step 4 with a paragraph continuation (e.g., inline note) that doesn't break the list:

```markdown
3. **Manual fallback** — ...
   > **Troubleshooting:** If `pnpm link --global` fails ... `pnpm setup`
4. Verify the CLI works:
```

Alternatively, restructure to avoid interleaving:
```markdown
1. Fork and clone ...
2. Run the automated setup script (recommended) ...
3. Verify the CLI works ...
   ...
### Troubleshooting
- If `pnpm link --global` fails ...
```

---

### WR-02: Manual fallback steps omit `pnpm link --global`

**File:** `docs/DEVELOPMENT.md:26-32`
**Issue:** The "Manual fallback" section lists only `pnpm install` and `pnpm build`, omitting `pnpm link --global`. A developer using the manual path won't have the `openwolf` CLI available globally and won't be warned about it. The troubleshooting section that immediately follows (lines 33-39) discusses `pnpm link --global` failures, which is contextually confusing since the manual steps never ran that command.

**Fix:** Add `pnpm link --global` as an explicit step in the manual fallback, or add a note that the global link is optional:

```markdown
3. **Manual fallback** — If you prefer to run steps individually:

   ```bash
   pnpm install
   pnpm build
   pnpm link --global    # optional: makes 'openwolf' available globally
   ```
```

---

### WR-03: Troubleshooting references command not in manual path

**File:** `docs/DEVELOPMENT.md:33-39` (and `scripts/install-dev.sh:143`)
**Issue:** The troubleshooting block discusses errors from `pnpm link --global`. This makes sense only for the automated script path (which runs this command at line 143). A developer following the "manual fallback" (step 3) never runs that command, so the troubleshooting section appears to address an error they didn't encounter. The section lacks a clear contextual anchor.

**Fix:** Prepend a clarifying sentence to the troubleshooting block:

```markdown
### Troubleshooting

If the automated setup script (`./scripts/install-dev.sh`) fails during the global link step,
or if you manually ran `pnpm link --global` and encountered a path error, ensure the pnpm bin
directory is included in your `PATH`:
```

---

### WR-04: No pnpm minimum version validation

**File:** `scripts/install-dev.sh:109-113`
**Issue:** The script validates that `pnpm` is installed via `command -v pnpm`, but does not check its version. If the project requires a minimum pnpm version (e.g., pnpm >= 8 for workspaces or corepack integration), an older version could cause spurious build failures with confusing error messages. `pnpm --version` is trivial to check.

**Fix:** Add a version check after the existence check:

```bash
PNPM_VERSION=$(pnpm --version 2>/dev/null || true)
PNPM_MAJOR=$(printf '%s' "$PNPM_VERSION" | cut -d. -f1)
if [ -z "$PNPM_VERSION" ] || [ "$PNPM_MAJOR" -lt 8 ]; then
  printf 'Error: pnpm >= 8.0.0 required. Found: %s\n' "$PNPM_VERSION" >&2
  exit 1
fi
printf '  pnpm %s OK\n' "$PNPM_VERSION"
```

(Adjust minimum version to match `package.json`'s `packageManager` field if corepack is used.)

---

## Info

### IN-01: Unquoted `$#` in argument count check

**File:** `scripts/install-dev.sh:71`
**Issue:** `$#` is unquoted in `if [ $# -gt 0 ]`. While `$#` always resolves to a non-empty integer (so this is safe in practice with `set -u`), quoting positional and special parameters is a best practice per ShellCheck SC2254 to prevent word-splitting surprises in edge cases.

**Fix:**
```bash
if [ "$#" -gt 0 ]; then
```

---

### IN-02: Script assumes CWD is project root without verification

**File:** `scripts/install-dev.sh:137`
**Issue:** The script runs `pnpm install`, `pnpm build`, etc. without first verifying that the current working directory is the project root (i.e., contains `package.json`). If a user runs the script from outside the project root (e.g., `bash ../openwolf/scripts/install-dev.sh`), the commands will fail with confusing pnpm errors about missing `package.json`. The `pnpm` GitHub issue — users commonly run setup scripts from the wrong directory.

**Fix:** Add an early guard at the top of the script (before or after the git repo check):

```bash
if [ ! -f package.json ]; then
  printf 'Error: package.json not found in %s.\n' "$(pwd)" >&2
  printf '  Run this script from the project root directory.\n' >&2
  exit 1
fi
```

Or use `SCRIPT_DIR` to cd to the script's location robustly:
```bash
cd "$(dirname "$0")/.."   # if script is in scripts/
```

---

## Cross-File Observations

- The exit message from `scripts/install-dev.sh:167` ("Run `node dist/bin/openwolf.js --help`") matches `docs/DEVELOPMENT.md:43` — consistent. ✓
- The prerequisite statement ("Node.js >= 20.0.0") is the same in both files — consistent. ✓
- `package.json` line 2 confirms `"name": "openwolf"`, so `pnpm link --global` will correctly create a global `openwolf` alias. ✓
- The CI/CD workflow at `.github/workflows/docs.yml` correctly uses `npm` (not `pnpm`) and matches the description in DEVELOPMENT.md line 141. ✓

---

_Reviewed: 2026-06-07T12:00:00Z_
_Reviewer: gsd-code-reviewer (adversarial stance)_
_Depth: standard_
