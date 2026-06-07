---
phase: 01-fork-install
reviewed: 2026-06-07T22:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/install-dev.sh
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 01: Code Review Report — Fork & Install Setup

**Reviewed:** 2026-06-07T22:00:00Z  
**Depth:** standard  
**Files Reviewed:** 2  
**Status:** issues_found  

## Summary

Reviewed `scripts/install-dev.sh` (174 lines) and `docs/DEVELOPMENT.md` (162 lines) at standard depth. The automated setup script is well-structured with proper error handling via `set -euo pipefail`, consistent `printf` usage, and meaningful exit codes. The development documentation is clear and well-organized.

One **Warning** was found: the install script lacks a repository root guard, causing it to operate in the wrong directory when invoked from a subdirectory. Two **Info** items in the documentation are noted for consistency and clarity.

---

## Warnings

### WR-01: Missing repository root guard causes silent wrong-directory operations

**File:** `scripts/install-dev.sh:125-129` (git check), `144-150` (pnpm commands)  
**Issue:** The script verifies it is inside a git repository (line 125: `git rev-parse --git-dir`) but never anchors execution to the repository root. `git rev-parse --git-dir` succeeds from any subdirectory, creating a false sense of correctness. If a user runs `./scripts/install-dev.sh` from a subdirectory (e.g., `src/` or `docs/`), the pnpm commands on lines 144–150 run in the subdirectory rather than the repo root, which causes:

- `pnpm install` — fails with `ERR_PNPM_NO_PACKAGE_MANIFEST` because no `package.json` exists
- `pnpm build` — never reached because install fails first
- The upstream remote is never configured because the script exits on the install failure

The error from pnpm is clear, but the user has no indication *why* it failed — they're in the wrong directory and the script didn't redirect.

**Fix:** Add a `cd` to the repository root immediately after the git check succeeds, before any pnpm commands:

```bash
# After line 129 ("printf '  git repo OK\n'"), insert:
cd "$(git rev-parse --show-toplevel)"
printf '  Changed to repository root: %s\n' "$(pwd)"
```

This ensures all subsequent commands execute from the repo root regardless of invocation directory.

---

## Info

### IN-01: Clone URL contradicts "Fork and clone" instruction

**File:** `docs/DEVELOPMENT.md:13`  
**Issue:** Step 1 says "Fork and clone the repository" but provides the CHESA fork URL directly (`https://github.com/chesa/openwolf.git`). For external contributors, this is contradictory — forking upstream (cytostack/openwolf) yields a different URL. For CHESA team members who already have access, the URL is correct but the word "Fork" is misleading.

**Fix:** Either use a placeholder suitable for both audiences:
```diff
-   git clone https://github.com/chesa/openwolf.git
+   git clone <your-fork-url>    # CHESA contributors: https://github.com/chesa/openwolf.git
```
Or restructure to separate fork-from-upstream from clone:
```markdown
1. Fork the [cytostack/openwolf](https://github.com/cytostack/openwolf) repository, then clone your fork:
   ```bash
   git clone https://github.com/<your-username>/openwolf.git
   ```
   (CHESA team members may clone directly from `https://github.com/chesa/openwolf.git`.)
```

### IN-02: No mention of ensuring script is executable

**File:** `docs/DEVELOPMENT.md:20`  
**Issue:** The instruction `./scripts/install-dev.sh` assumes the script has execute permission (`+x`). While `git clone` typically preserves the file mode (755), some workflows do not:
- Zip downloads from GitHub (modes stripped)
- Deatched `git archive` exports
- Some CI artifact extraction methods

**Fix:** Add a brief note after the script invocation:
```diff
    ```bash
    ./scripts/install-dev.sh
    ```
+  If you encounter a "Permission denied" error, run `chmod +x scripts/install-dev.sh` first.
```

---

_Reviewed: 2026-06-07T22:00:00Z_  
_Reviewer: gsd-code-reviewer (standard depth)_  
_Depth: standard_
