---
phase: 01-fork-install
reviewed: 2026-06-07T20:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/install-dev.sh
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 01: Code Review Report — Fork Install Setup

**Reviewed:** 2026-06-07T20:00:00Z  
**Depth:** standard  
**Files Reviewed:** 2  
**Status:** issues_found

## Summary

Reviewed the automated dev environment setup script (`scripts/install-dev.sh`) and the development documentation (`docs/DEVELOPMENT.md`). The script is well-structured with proper `set -euo pipefail`, clear argument parsing, and version checks for Node.js and pnpm. The documentation accurately describes the build commands, branch conventions, and testing workflow, and cross-references against the actual repository state (`package.json`, `.github/workflows/docs.yml`, `tests/` directory) confirm the claims are correct.

Two warnings and three info items were identified. No critical security vulnerabilities or blocker bugs were found.

---

## Warnings

### WR-01: No cleanup trap on script failure leaves partial artifacts (scripts/install-dev.sh)

**File:** `scripts/install-dev.sh`  
**Lines:** (no trap exists anywhere in the file)  
**Severity:** Warning  

**Issue:** The script relies solely on `set -e` for error handling but has no `trap` for cleanup. If `pnpm install` fails midway, `node_modules/` may be partially populated. If `pnpm build` fails after a partial compilation, `dist/` can contain stale or incomplete build artifacts. A subsequent re-run of the script (or manual commands) could link a broken build via `pnpm link --global` on line 154 without warning the user.

**Fix:** Add a cleanup trap that removes the `dist/` directory on failure. Since `node_modules/` is large and expensive to reinstall, target only the build output:

```bash
# Add near line 23, after the readonly constants
CLEANUP_TRAP_RAN=false
_cleanup() {
  if [ "$CLEANUP_TRAP_RAN" = "true" ]; then return; fi
  CLEANUP_TRAP_RAN=true
  if [ -d dist ]; then
    printf '\nSetup failed. Removing incomplete build artifacts...\n' >&2
    rm -rf dist 2>/dev/null || true
  fi
}
trap _cleanup EXIT ERR
```

---

### WR-02: Troubleshooting advice for pnpm PATH silently insufficient (docs/DEVELOPMENT.md)

**File:** `docs/DEVELOPMENT.md`  
**Lines:** 40–46  
**Severity:** Warning  

**Issue:** The troubleshooting section recommends `pnpm setup` to resolve PATH issues with `pnpm link --global`. However, `pnpm setup` modifies shell rc files (`.bashrc`, `.zshrc`) — it does **not** reload the current shell session. After running `pnpm setup`, the user's `PATH` in the current terminal remains unchanged. If they immediately re-run `./scripts/install-dev.sh`, `pnpm link --global` will fail with the same error, causing confusion.

**Fix:** Add a step advising the user to source their shell config after `pnpm setup`:

```bash
pnpm setup
# After running pnpm setup, reload your shell configuration:
source ~/.zshrc   # or ~/.bashrc, depending on your shell
```

---

## Info

### IN-01: Subprocess pipeline for version extraction (scripts/install-dev.sh)

**File:** `scripts/install-dev.sh`  
**Lines:** 99, 116  
**Severity:** Info  

**Issue:** Lines 99 and 116 use a pipeline of `printf | sed | cut` (three subprocesses) to extract the major version number from `node --version` and `pnpm --version` output:
```bash
NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
```
Since the shebang is `#!/bin/bash`, bash built-in parameter expansion can achieve the same result more efficiently and with fewer failure modes:
```bash
NODE_MAJOR="${NODE_VERSION#v}"   # strip leading 'v'
NODE_MAJOR="${NODE_MAJOR%%.*}"   # keep only major number
```
Not a correctness bug, but unnecessary subprocess spawning for trivial string manipulation.

**Fix:** Replace the pipeline with bash parameter expansion on lines 99 and 116.

---

### IN-02: Inconsistent error-handling pattern between Node.js and pnpm checks (scripts/install-dev.sh)

**File:** `scripts/install-dev.sh`  
**Lines:** 93–103 vs 109–120  
**Severity:** Info  

**Issue:** The Node.js check (lines 93–103) captures the version via `node --version 2>/dev/null || true` and then tests `-z "$NODE_VERSION"` to detect missing Node. The pnpm check (lines 109–120) first validates the command exists via `command -v pnpm` then captures the version. Both approaches work, but the `-z "$PNPM_VERSION"` guard on line 117 is redundant because `command -v` on line 109 already confirmed the command exists. The inconsistency could lead to maintenance errors.

**Fix:** Align both checks to the same pattern — either both use `command -v` first (more explicit), or both rely on the version command with a `-z` guard.

---

### IN-03: Hook update command ordering dependency subtly contradictory (docs/DEVELOPMENT.md)

**File:** `docs/DEVELOPMENT.md`  
**Line:** 69  
**Severity:** Info  

**Issue:** The docs present the following as the canonical hook-update workflow:
> `pnpm build:hooks && node dist/bin/openwolf.js update`  
> (The `dist/bin/openwolf.js` file is generated by `pnpm build` and does not exist until after the build completes.)

The first part reads like a runnable one-liner, but the parenthetical contradicts it — `dist/bin/openwolf.js` doesn't exist after just `pnpm build:hooks`. A developer who has only run `pnpm build:hooks` (not a full `pnpm build`) will hit a `ENOENT` error. The note explains the issue but presenting it as a `&&` chain is misleading.

**Fix:** Rephrase to make the dependency explicit:
> After a full `pnpm build`, recompile hooks with `pnpm build:hooks` and copy them into `.wolf/hooks/` by running `node dist/bin/openwolf.js update`.

---

_Reviewed: 2026-06-07T20:00:00Z_  
_Reviewer: gsd-code-reviewer agent_  
_Depth: standard_
