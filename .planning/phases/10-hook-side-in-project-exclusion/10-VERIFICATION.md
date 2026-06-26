---
phase: 10-hook-side-in-project-exclusion
verified: 2026-06-25T20:40:00Z
status: passed
score: 4/4
behavior_unverified: 0
overrides_applied: 0
---

# Phase 10: Hook-Side In-Project Exclusion — Verification Report

**Phase Goal:** Close the in-project anatomy leak the R3 `../` guard can't catch — a developer-excluded or gitignored in-project directory must never enter `anatomy.md` via the post-write hook, using a dependency-free matcher.
**Verified:** 2026-06-25T20:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The `exclude_patterns` matcher (`globToRegExp`, `matchesPattern`, `shouldExclude`) lives in one shared dep-free module (`src/hooks/wolf-ignore.ts`), re-exported via `shared.ts`, consumed by both the hook and the scanner — no copy drift | VERIFIED | `wolf-ignore.ts` owns all three functions; scanner imports `shouldExclude` + `DEFAULT_EXCLUDE_PATTERNS` from `../hooks/wolf-ignore.js`; `shared.ts` barrel re-exports exactly 4 public symbols; `globToRegExp`/`matchesPattern` are private (not exported); no duplicate definitions in scanner confirmed by grep |
| 2 | An excluded or root-`.gitignore`-ignored in-project directory never enters `anatomy.md` through the hook, while the R3 out-of-project skip is preserved and normal in-project files are still recorded | VERIFIED | Gate chain in `recordAnatomyWrite` (lines 36-60 of `post-write.ts`): R3 `../` check → `shouldExclude` → conditional `parseAndMatchGitignore`; 4 R6 integration tests in `post-write.test.ts` prove: E6 regression closed, gitignore gate fires, default-false opt-in honored, R3 and positive-control preserved; `npx vitest run tests/hooks/post-write.test.ts` exits 0 (13/13 tests) |
| 3 | `tsc --noEmit -p tsconfig.hooks.json` is clean — the hook bundle imports no `node_modules` package (C2); the scanner keeps its `ignore` dep as the authoritative full-scan backstop (D-18) | VERIFIED | `npx tsc --noEmit -p tsconfig.hooks.json` exits 0; `wolf-ignore.ts` has zero `node_modules` imports (only stdlib and JS language features); `import ignore` still present in `src/scanner/anatomy-scanner.ts` line 12; `npx tsc --noEmit` (main build) also exits 0 |
| 4 | The `build:hooks` → copy step is exercised so the new hook behavior is live in `.wolf/hooks/`, not inert in `dist/hooks/` | VERIFIED | `.wolf/hooks/post-write.js` (25,610 bytes, timestamp 20:13) and `.wolf/hooks/wolf-ignore.js` (9,109 bytes) both exist; `grep -E 'shouldExclude\|parseAndMatchGitignore' .wolf/hooks/post-write.js` confirms the gate symbols are present in the compiled live hook |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/hooks/wolf-ignore.ts` | Dep-free shared matcher: `shouldExclude`, `parseAndMatchGitignore`, `DEFAULT_EXCLUDE_PATTERNS`, `ALWAYS_EXCLUDE_FILES` (private: `globToRegExp`, `matchesPattern`) | VERIFIED | 249 lines; exports 4 public symbols; `globToRegExp`/`matchesPattern` unexported; zero `node_modules` imports |
| `src/hooks/shared.ts` | Re-exports `shouldExclude`, `parseAndMatchGitignore`, `DEFAULT_EXCLUDE_PATTERNS`, `ALWAYS_EXCLUDE_FILES` from `./wolf-ignore.js` | VERIFIED | Lines 30-35 export exactly these 4 symbols; barrel is unchanged for other subsystems |
| `src/hooks/post-write.ts` | `recordAnatomyWrite` with R3 → config-read → `shouldExclude` → conditional `parseAndMatchGitignore` gate chain before anatomy upsert | VERIFIED | Gate chain at lines 36-60; config read is fresh `fs.readFileSync` in try/catch (no caching); `?? DEFAULT_EXCLUDE_PATTERNS` and `?? false` fallbacks confirmed |
| `.wolf/hooks/post-write.js` | Compiled hook with live exclusion logic | VERIFIED | File exists (25,610 bytes); contains `shouldExclude` and `parseAndMatchGitignore` references |
| `.wolf/hooks/wolf-ignore.js` | Compiled wolf-ignore module in live hook directory | VERIFIED | File exists (9,109 bytes); exports `shouldExclude` and `parseAndMatchGitignore` |
| `tests/hooks/wolf-ignore.test.ts` | Unit tests for matcher module including negation fail-closed pin and backslash normalization | VERIFIED | 157 lines; covers all RESEARCH RQ5 cases (bare-name, extension glob, trailing slash, leading slash, `**`, empty content, backslash normalization, mandatory negation pin); 23 tests pass |
| `tests/hooks/post-write.test.ts` | R6 integration tests: E6 exclude regression, respect_gitignore gate, default-false control, no-config fallback | VERIFIED | 419 lines; `describe("recordAnatomyWrite — in-project exclusion (R6)")` block with 4 integration tests plus preserved R3 and positive-control regressions |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/scanner/anatomy-scanner.ts` | `src/hooks/wolf-ignore.ts` | `import { shouldExclude, DEFAULT_EXCLUDE_PATTERNS } from "../hooks/wolf-ignore.js"` | WIRED | Line 13-16 of scanner; no duplicate function definitions remain in scanner |
| `src/hooks/shared.ts` | `src/hooks/wolf-ignore.ts` | Barrel re-export of 4 public symbols from `"./wolf-ignore.js"` | WIRED | Lines 30-35 of `shared.ts` |
| `src/hooks/post-write.ts` | `src/hooks/shared.ts` | `import { ..., shouldExclude, parseAndMatchGitignore, DEFAULT_EXCLUDE_PATTERNS } from "./shared.js"` | WIRED | Line 8 of `post-write.ts`; symbols are used at lines 50 and 56 in the gate chain |
| `recordAnatomyWrite` | `.wolf/config.json` | Fresh `fs.readFileSync` of `openwolf.anatomy.exclude_patterns` + `respect_gitignore` on every call | WIRED | Lines 41-47 of `post-write.ts`; try/catch wraps the read; `?? DEFAULT_EXCLUDE_PATTERNS` and `?? false` fallbacks in place |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| wolf-ignore unit suite (23 tests) | `npx vitest run tests/hooks/wolf-ignore.test.ts` | 23/23 passed | PASS |
| post-write integration suite (13 tests) | `npx vitest run tests/hooks/post-write.test.ts` | 13/13 passed | PASS |
| scanner suite still passes after matcher relocation | `npx vitest run tests/scanner/anatomy-scanner.test.ts` | 12/12 passed | PASS |
| Combined 3-file suite (48 tests) | `npx vitest run tests/hooks/wolf-ignore.test.ts tests/hooks/post-write.test.ts tests/scanner/anatomy-scanner.test.ts` | 48/48 passed | PASS |
| Full vitest suite (198 tests across 25 files) | `npx vitest run` | 198/198 passed | PASS |
| C2 hook boundary TypeScript check | `npx tsc --noEmit -p tsconfig.hooks.json` | exit 0 | PASS |
| Main build TypeScript check (scanner re-import) | `npx tsc --noEmit` | exit 0 | PASS |
| Exclusion logic live in compiled hook | `grep -E 'shouldExclude\|parseAndMatchGitignore' .wolf/hooks/post-write.js` | Matches found | PASS |
| wolf-ignore.ts has zero node_modules imports | `grep -nE 'from "ignore"' src/hooks/wolf-ignore.ts` | No output | PASS |
| globToRegExp/matchesPattern not exported | `grep -nE '^export .+(globToRegExp\|matchesPattern)' src/hooks/wolf-ignore.ts` | No output | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| R6 | 10-01, 10-02 | Hook-side in-project path exclusion — promote matcher into dep-free shared module, add gitignore parser, apply both gates in `recordAnatomyWrite` after R3 guard | SATISFIED | All 4 ROADMAP success criteria verified; R6 accept criteria from REQUIREMENTS.md fully met: excluded/gitignored paths blocked, R3 preserved, normal files recorded, C2 boundary clean |

### Anti-Patterns Found

No anti-patterns found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers found in any phase-modified file | — | — |

The `return null` occurrences in `post-write.ts` at lines 576 and 601 are legitimate return values in `autoDetectBugFix` helper functions (not stubs), pre-existing from earlier phases.

### Human Verification Required

None. All must-haves are verified programmatically. No behavior-dependent state transitions or cancellation invariants require human exercise.

### Gaps Summary

No gaps. All four ROADMAP success criteria are satisfied:

1. Single dep-free matcher module with no copy drift — confirmed by imports and absence of duplicate definitions in scanner.
2. Excluded and gitignored in-project paths blocked by the gate chain — confirmed by 4 integration tests.
3. C2 hook boundary clean and scanner `ignore` dep preserved — confirmed by both `tsc` checks.
4. Build→copy step exercised with live hook carrying the gate symbols — confirmed by inspecting `.wolf/hooks/post-write.js`.

---

_Verified: 2026-06-25T20:40:00Z_
_Verifier: Claude (gsd-verifier)_
