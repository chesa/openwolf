---
phase: 10-hook-side-in-project-exclusion
plan: "01"
subsystem: hook-matcher
tags: [refactor, tdd, wolf-ignore, matcher, gitignore-parser, c2-boundary]
dependency_graph:
  requires: []
  provides: [wolf-ignore-module, shared-matcher-api, dep-free-gitignore-parser]
  affects: [src/hooks/shared.ts, src/scanner/anatomy-scanner.ts]
tech_stack:
  added: [src/hooks/wolf-ignore.ts]
  patterns: [dep-free-hook-module, tdd-red-green-refactor, barrel-re-export]
key_files:
  created:
    - src/hooks/wolf-ignore.ts
    - tests/hooks/wolf-ignore.test.ts
  modified:
    - src/hooks/shared.ts
    - src/scanner/anatomy-scanner.ts
    - tests/scanner/anatomy-scanner.test.ts
decisions:
  - "D10-01 honored: single definition of the matcher in wolf-ignore.ts; scanner imports back"
  - "D10-09 honored: globToRegExp and matchesPattern stay private; public surface is exactly 4 symbols"
  - "D10-05 honored: negation lines skipped fail-closed, pinned by mandatory test"
  - "D-18 honored: import ignore preserved in anatomy-scanner.ts (scanner keeps full-spec backstop)"
  - "Pitfall 2 Option 2 applied: scanner test imports shouldExclude from wolf-ignore.js directly"
metrics:
  duration: 307
  completed: "2026-06-26"
  tasks_completed: 3
  files_changed: 5
status: complete
requirements: [R6]
---

# Phase 10 Plan 01: Create wolf-ignore.ts Shared Dep-Free Matcher Module Summary

## One-Line Summary

Moved glob matcher + constants from anatomy-scanner.ts into a new zero-dep shared module (wolf-ignore.ts) and added a dep-free root-gitignore parser (parseAndMatchGitignore), with shared.ts barrel re-export of exactly 4 public symbols.

## What Was Built

Created `src/hooks/wolf-ignore.ts` as the single authoritative home for:

- `globToRegExp` (private) — linear-only regex from glob, ReDoS-safe
- `matchesPattern` (private) — single-pattern match with all supported forms
- `shouldExclude` (exported) — full exclude check with ALWAYS_EXCLUDE_FILES guard
- `parseAndMatchGitignore` (exported) — dep-free root-gitignore parser supporting 6 syntax forms
- `DEFAULT_EXCLUDE_PATTERNS` (exported) — canonical default exclude list
- `ALWAYS_EXCLUDE_FILES` (exported) — canonical env-file deny set

Updated `src/hooks/shared.ts` to barrel-re-export the 4 public symbols from wolf-ignore.js.

Updated `src/scanner/anatomy-scanner.ts` to import `shouldExclude` and `DEFAULT_EXCLUDE_PATTERNS` from `../hooks/wolf-ignore.js` (removed the 93-line block of local definitions).

Updated `tests/scanner/anatomy-scanner.test.ts` to import `shouldExclude` from wolf-ignore.js (Pitfall 2 Option 2 — test now imports from the authoritative source).

Created `tests/hooks/wolf-ignore.test.ts` with 23 unit tests covering all RESEARCH RQ5 cases including the mandatory negation fail-closed pin and backslash-normalization seam.

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 1 | RED | Authored failing wolf-ignore.test.ts (23 cases, module-not-found RED state confirmed) | d5c82aa |
| 2 | GREEN | Created wolf-ignore.ts, wired shared.ts and scanner re-import, updated scanner test | 1749e18 |
| 3 | REFACTOR | Verified C2 hook boundary (tsc -p tsconfig.hooks.json) and main build clean | d6614d6 |

## Acceptance Criteria — Verified

- [x] `src/hooks/wolf-ignore.ts` contains `export function shouldExclude(` and `export function parseAndMatchGitignore(`
- [x] `grep -nE 'from "ignore"' src/hooks/wolf-ignore.ts` returns empty (zero node_modules imports — C2 compliant)
- [x] `grep -cE '^export +(function|const) +(globToRegExp|matchesPattern)' src/hooks/wolf-ignore.ts` returns 0 (private)
- [x] `grep -nE 'function globToRegExp|function matchesPattern|export function shouldExclude' src/scanner/anatomy-scanner.ts` returns nothing (moved, not duplicated)
- [x] `src/scanner/anatomy-scanner.ts` contains `from "../hooks/wolf-ignore.js"`
- [x] `src/hooks/shared.ts` contains `from "./wolf-ignore.js"` re-exporting 4 public symbols
- [x] `tests/scanner/anatomy-scanner.test.ts` imports `shouldExclude` from `../../src/hooks/wolf-ignore.js`
- [x] `npx vitest run tests/hooks/wolf-ignore.test.ts tests/scanner/anatomy-scanner.test.ts` exits 0 (35/35 tests)
- [x] `tsc --noEmit -p tsconfig.hooks.json` exits 0 (C2 boundary clean)
- [x] `tsc --noEmit` exits 0 (main build clean)
- [x] `import ignore` preserved in `src/scanner/anatomy-scanner.ts` (D-18)
- [x] Full suite: `pnpm test` 194/194 tests pass across 25 test files

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED gate: `test(10-01)` commit d5c82aa — test file created, import fails with MODULE_NOT_FOUND
- GREEN gate: `feat(10-01)` commit 1749e18 — implementation created, all 23 tests pass
- REFACTOR gate: `refactor(10-01)` commit d6614d6 — type-check gates verified, no source changes needed

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. `wolf-ignore.ts` is a pure string-matching module with no I/O. The ReDoS safety property of `globToRegExp` (linear-only `[^/]*` and `.*` patterns) is preserved from the original implementation.

## Self-Check: PASSED

Files verified:
- `src/hooks/wolf-ignore.ts` — FOUND (249 lines)
- `tests/hooks/wolf-ignore.test.ts` — FOUND (157 lines)
- Modified `src/hooks/shared.ts` — FOUND
- Modified `src/scanner/anatomy-scanner.ts` — FOUND
- Modified `tests/scanner/anatomy-scanner.test.ts` — FOUND

Commits verified:
- d5c82aa — test(10-01): add failing wolf-ignore matcher + gitignore parser tests — FOUND
- 1749e18 — feat(10-01): promote matcher to shared wolf-ignore.ts + add gitignore parser — FOUND
- d6614d6 — refactor(10-01): verify C2 hook boundary + main build clean after matcher move — FOUND
