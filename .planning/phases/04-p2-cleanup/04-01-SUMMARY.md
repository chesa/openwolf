---
phase: 04-p2-cleanup
plan: "01"
subsystem: tooling
tags: [clean-script, hygiene, ds-store, package-json]
dependency_graph:
  requires: []
  provides: [pnpm-clean-script]
  affects: [package.json]
tech_stack:
  added: []
  patterns: [node-e-inline-script, existsSync-guard]
key_files:
  created: []
  modified:
    - package.json
decisions:
  - "clean script uses node -e inline pattern matching prebuild (D-01)"
  - "explicit path list only: dist/, .wolf/designqc-captures/, tmp.* via regex (D-02)"
  - "prebuild script left untouched (D-03)"
  - ".DS_Store files deleted with rm -f (D-05); untracked, no git rm needed"
  - ".gitignore unchanged; bare DS_Store entry already matches all subdirectories (D-06)"
metrics:
  duration: "2 minutes"
  completed: "2026-06-02T04:54:06Z"
  tasks_completed: 2
  files_modified: 1
  files_deleted: 2
requirements: [CLEAN-01, CLEAN-02]
---

# Phase 04 Plan 01: P2 Cleanup - Clean Script and DS_Store Removal Summary

**One-liner:** Add `pnpm clean` dev script to package.json with explicit path guards for dist/, .wolf/designqc-captures/, and tmp.* directories; delete two untracked .DS_Store files from repo root and .claude/.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add pnpm clean script (CLEAN-01) | e7b7d19 | package.json |
| 2 | Delete .DS_Store files (CLEAN-02) | *(no commit — untracked files, invisible to git)* | .DS_Store (deleted), .claude/.DS_Store (deleted) |

## What Was Built

**Task 1 — pnpm clean script (CLEAN-01)**

Added a `"clean"` key to `package.json` scripts using the same `node -e` inline pattern as the existing `prebuild` script. The script:
- Removes `dist/` if it exists (guarded with `fs.existsSync`)
- Removes `.wolf/designqc-captures/` if it exists (guarded with `fs.existsSync`)
- Discovers and removes all `tmp.*` directories via `fs.readdirSync('.').filter(f => /^tmp\./.test(f))`
- Never globs `.wolf/` root — only the explicit `.wolf/designqc-captures/` subpath

The `/^tmp\./` regex correctly matches `tmp.7Djh6LTePQ` and does not match `tmpfoo`.

**Task 2 — .DS_Store removal (CLEAN-02)**

Both `.DS_Store` files (`./.DS_Store` and `./.claude/.DS_Store`) existed on disk but were untracked by git. Deleted with `rm -f`. No `git rm --cached` was needed. The `.gitignore` bare `DS_Store` entry is unchanged and continues to prevent future commits.

## Deviations from Plan

**1. [Rule 3 - Blocking Fix] rm alias required -f flag**
- **Found during:** Task 2
- **Issue:** Shell `rm` was aliased to `rm -i` (interactive), causing the deletion to prompt for confirmation and fail silently
- **Fix:** Used `rm -f` per bash.md standard to override interactive alias
- **Files modified:** None (workaround applied inline)
- **Commit:** N/A (no code change)

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm clean` exit code | 0 (PASS) |
| `dist/` removed after clean | PASS |
| `tmp.*` dirs removed after clean | PASS |
| `.wolf/` dir preserved | Confirmed by script logic (no root glob) |
| `.DS_Store` absent at repo root | PASS |
| `.claude/.DS_Store` absent | PASS |
| `package.json` `clean` script present | PASS |
| `.gitignore` DS_Store entry intact | PASS (1 match) |
| `prebuild` script unchanged | PASS |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The clean script operates on local filesystem only (dist/, .wolf/designqc-captures/, tmp.* via readdirSync). Threats T-04-01 (tampering) and T-04-02 (DoS via .wolf deletion) mitigated by explicit path guards per D-02.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `package.json` contains "clean" script — confirmed via `node -e` read
- [x] `pnpm clean` exits 0 — confirmed by run
- [x] `.DS_Store` files absent — confirmed by `test ! -f`
- [x] `.gitignore` DS_Store entry present — confirmed by `grep -c`
- [x] Commit e7b7d19 exists in git log
