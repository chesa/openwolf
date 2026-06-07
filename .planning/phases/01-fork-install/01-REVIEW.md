---
phase: 01-fork-install
reviewed: 2026-06-07T18:30:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/install-dev.sh
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 01: Code Review Report — Fork Install

**Reviewed:** 2026-06-07T18:30:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed `scripts/install-dev.sh` and `docs/DEVELOPMENT.md` at standard depth. The shell script is well-structured with proper error handling (`set -euo pipefail`, argument validation, version checks). The documentation is accurate and all cross-references point to existing files. No security vulnerabilities, injection vectors, or critical logic bugs were found. Three warnings were identified — primarily concerning inconsistent version sanitization, incomplete help/usage documentation, and a misleading conflict warning. Three informational items note minor improvements for defensive coding and documentation completeness.

---

## Warnings

### WR-01: pnpm version string not sanitized for potential `v` prefix

**File:** `scripts/install-dev.sh:117`
**Issue:** The Node.js version check strips the `v` prefix with `sed 's/^v//'` (line 99), but the pnpm version check on lines 116–117 does not. While `pnpm --version` currently outputs an unprefixed version (e.g., `9.0.0`), several Node.js tool version commands (nvm, fnm, Corepack wrappers) can produce `v`-prefixed output in some configurations. If the pnpm version string contained a `v` prefix, `cut -d. -f1` would yield `v8` and the `-lt 8` integer comparison would produce a shell error (stderr message + exit code 2), causing the `||` chain to enter the error branch with a false-positive "pnpm >= 8.0.0 required" message.

**Fix:** Apply consistent `sed 's/^v//'` prefix stripping to the pnpm version string before the numeric comparison:

```bash
PNPM_MAJOR=$(printf '%s' "$PNPM_VERSION" | sed 's/^v//' | cut -d. -f1)
```

Alternatively, validate that the extracted major version is numeric before comparison:

```bash
if ! [ "$PNPM_MAJOR" -eq "$PNPM_MAJOR" ] 2>/dev/null; then
  printf 'Error: unexpected pnpm version format: %s\n' "$PNPM_VERSION" >&2
  exit 1
fi
```

---

### WR-02: Help and usage text omit `-h`/`-v` shorthands

**File:** `scripts/install-dev.sh:14-16,33-36`
**Issue:** The script's:
- Header comment block (lines 14–16): only shows `--help` and `--version`
- `show_help()` function (lines 33–36): only shows `--help` and `--version`
- Error fallback message (line 83): only shows `--help` and `--version`

However, the argument parser on lines 72–79 also handles `-h` and `-v` as case alternatives. Users reading the help text won't discover these shorthands.

**Fix:** Update all three locations to include the short flags. For example in `show_help()`:

```
USAGE:
  ./scripts/install-dev.sh                     Full setup
  ./scripts/install-dev.sh [-h | --help]       Show this help message
  ./scripts/install-dev.sh [-v | --version]    Show version
```

And the error fallback (line 83):
```
printf 'Usage: ./scripts/install-dev.sh [--help|-h] [--version|-v]\n' >&2
```

---

### WR-03: Global conflict warning doesn't explain script continuation

**File:** `scripts/install-dev.sh:136-142`
**Issue:** The warning block instructs users to "uninstall the existing global package first" with `npm uninstall -g openwolf` / `pnpm unlink --global openwolf`. It does not clarify that the script **will continue execution** regardless, and that the `pnpm link --global` on line 153 will override any existing global installation anyway. Users unfamiliar with the script may interpret this as a hard failure and either stop the script or attempt to resolve the conflict unnecessarily.

**Fix:** Add an explicit continuation note after the uninstall instructions:

```bash
if command -v openwolf >/dev/null 2>&1; then
  printf 'Warning: openwolf is already globally installed.\n' >&2
  printf '  The script will continue and link the local build globally,\n' >&2
  printf '  overriding the existing installation. To avoid potential\n' >&2
  printf '  confusion, you may uninstall the existing package first:\n' >&2
  printf '    npm uninstall -g openwolf\n' >&2
  printf '    pnpm unlink --global openwolf\n' >&2
fi
```

---

## Info

### IN-01: No post-link verification step

**File:** `scripts/install-dev.sh:153-177`
**Issue:** After `pnpm link --global` succeeds, the script tells the user to run `node dist/bin/openwolf.js --help` manually (line 177) but does not verify the link itself. If the global `pnpm` bin directory is not in `PATH` (common on systems where `pnpm setup` hasn't been run), the link step succeeds silently but the CLI won't be accessible. The script could optionally run a quick verification:

```bash
printf 'Verifying global link...\n'
node dist/bin/openwolf.js --help >/dev/null 2>&1 && \
  printf '  openwolf linked successfully.\n' || \
  printf '  Warning: link verification failed. Ensure pnpm bin dir is in PATH.\n'
```

---

### IN-02: Version prefix handling inconsistency (maintenance trap)

**File:** `scripts/install-dev.sh:99,116-117`
**Issue:** The Node.js version check strips the leading `v` with `sed 's/^v//'` before extracting the major version (line 99). The pnpm version check does not apply this stripping (line 116). While both are correct for current tool output, the inconsistency is a maintenance trap — a future contributor might copy one pattern to the other context incorrectly, or update one path but not the other when accommodating a change in tool output format. Defensive coding would apply the same sanitization pattern to both.

---

### IN-03: DEVELOPMENT.md doesn't document setup script flags

**File:** `docs/DEVELOPMENT.md:20`
**Issue:** The local setup section recommends `./scripts/install-dev.sh` without mentioning that the script accepts `--help`/`--version` (and the undocumented `-h`/`-v`). Users reading only the development docs won't know about these options unless they run the script or read its code.

**Fix:** Consider adding a brief note:
```markdown
2. Run the automated setup script (recommended):
   ```bash
   ./scripts/install-dev.sh
   ```
   Run `./scripts/install-dev.sh --help` for available options.
```

---

_Reviewed: 2026-06-07T18:30:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
