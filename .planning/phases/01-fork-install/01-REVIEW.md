---
phase: 01-fork-install
reviewed: 2026-06-06T20:30:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - scripts/install-dev.sh
  - package.json
  - README.md
  - docs/DEVELOPMENT.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 01: Code Review Report — Fork Install &amp; Setup

**Reviewed:** 2026-06-06T20:30:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed four files from the OpenWolf fork install &amp; setup phase: the dev install script (`install-dev.sh`), the package manifest (`package.json`), the project README, and the development guide (`docs/DEVELOPMENT.md`). The code is generally well-structured with proper error handling in the shell script (uses `set -euo pipefail`, validates prerequisites, safe quoting). No security vulnerabilities (hardcoded secrets, injection vectors, eval usage) were found.

The issues center on fork-identity confusion in metadata and documentation, a deprecated Node.js API in build scripts, and a CI/CD documentation gap relative to project conventions. No critical correctness defects were identified.

---

## Warnings

### WR-01: Fork install instructions are misleading for repository URL

**File:** `README.md:19-21`
**Issue:** The primary install instruction `npm install -g openwolf` installs the upstream Cytostack npm package, not the CHESA fork's code. Since this repository's URL resolves to `github.com/chesa/openwolf` (the fork, per `package.json:61`), a user who clones this repo and follows the first install block will get the upstream package — not the forked code they just cloned. The development setup section (line 34) correctly points to `./scripts/install-dev.sh`, but the primary install path creates user confusion: clone the fork, then install the upstream.

Additionally, the npm badge on line 9 points to `openwolf` on npmjs.com — if the fork publishes under a different scope (e.g., `@chesa/openwolf`) or doesn't publish at all, this badge is inaccurate.

**Fix:** Either:
- Add a context note above the install block clarifying that `npm install -g openwolf` installs the upstream package and to use `./scripts/install-dev.sh` for the fork, OR
- Republish the fork under a scoped name and update both the install command and badge:

```markdown
> **Fork users:** This repository is the CHESA fork of OpenWolf.
> For the upstream package, see [cytostack/openwolf](https://github.com/cytostack/openwolf).
> For this fork's development setup, see [Development Setup](#development-setup) below.
```

### WR-02: Author/repo metadata mismatch indicates fork identity gap

**File:** `package.json:58`
**Issue:** The `author` field reads `"Cytostack Pvt Ltd"` (the upstream project owner), while the `repository` URL points to `github.com/chesa/openwolf` (the fork). This creates ambiguity about ownership and may cause downstream issues with license compliance tracking, attribution, or automated tooling that reads the `author` field. The install-dev.sh header (line 3) states `CHESA Fork Team Toolkit`, signaling fork intent, but the package metadata does not reflect this.

**Fix:** Update the `author` field to reflect fork attribution:

```json
"author": "Chesapeake Systems (CHESA) — fork of Cytostack OpenWolf",
"repository": {
  "type": "git",
  "url": "https://github.com/chesa/openwolf.git"
}
```

This retains upstream credit while clarifying the fork's provenance.

---

## Info

### IN-01: Deprecated `fs.existsSync()` in prebuild script

**File:** `package.json:10`
**Issue:** The `prebuild` script uses `fs.existsSync('dist')` then conditionally calls `fs.rmSync(...)`. `fs.existsSync` has been deprecated since Node.js 14. The simpler and non-deprecated approach is to call `fs.rmSync` with `{ force: true }`, which silently succeeds if the path does not exist:

```js
// Before (deprecated):
const fs=require('fs');if(fs.existsSync('dist'))fs.rmSync('dist',{recursive:true})

// After (no deprecation):
const fs=require('fs');fs.rmSync('dist',{recursive:true,force:true})
```

This also eliminates the TOCTOU window (theoretical in single-threaded scripts, but cleaner).

### IN-02: Deprecated `fs.existsSync()` in clean script

**File:** `package.json:22`
**Issue:** Same deprecated `fs.existsSync()` pattern in the `clean` script. The `.filter()` guard is unnecessary when `rmSync` already uses `{force:true}`. Apply the same fix as IN-01 for both the `dist` and `.wolf/designqc-captures` removals.

### IN-03: CI docs reference GitHub Actions while conventions specify Bitbucket Pipelines

**File:** `docs/DEVELOPMENT.md:127-134`
**Issue:** The CI/CD section documents `.github/workflows/docs.yml` (GitHub Actions) as the only CI workflow. However, project conventions in `CLAUDE.md` specify **Bitbucket-Only Workflow Constraints** — CI/CD should use `bitbucket-pipelines.yml` and "Pipes," not `.github/workflows`. This documentation gap will confuse contributors who expect the fork's CI to follow project conventions. Whether the fork intends to migrate or retain GitHub Actions, the docs should explain the rationale.

---

## Files with no issues found

- **`scripts/install-dev.sh`** — Clean implementation. Proper use of `set -euo pipefail`, fully quoted variable expansions, prerequisite validation with informative error messages, safe use of `|| true` to handle `set -e` in conditional checks. No injection vectors, no hardcoded secrets, no unchecked command substitutions.

---

_Reviewed: 2026-06-06T20:30:00Z_
_Reviewer: gsd-code-reviewer (standard depth)_
_Depth: standard_
