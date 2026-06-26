---
phase: 10-hook-side-in-project-exclusion
plan: "02"
subsystem: post-write-hook
tags: [feat, tdd, wolf-ignore, anatomy-exclusion, gitignore-gate, e6-regression, roadmap-sc2, roadmap-sc4]
dependency_graph:
  requires: [10-01]
  provides: [r6-hook-gate-chain, anatomy-exclusion-live]
  affects: [src/hooks/post-write.ts, tests/hooks/post-write.test.ts]
tech_stack:
  added: []
  patterns: [fresh-config-read-per-call, gate-chain-injection, dep-free-hook-imports]
key_files:
  created: []
  modified:
    - src/hooks/post-write.ts
    - tests/hooks/post-write.test.ts
decisions:
  - "D10-07 honored: config read is a fresh fs.readFileSync inside recordAnatomyWrite, no module-level caching"
  - "D10-08 honored: respect_gitignore defaults to false via ?? false — gitignore gate is strictly opt-in"
  - "D10-11 honored: gate order is R3 ../ → shouldExclude → parseAndMatchGitignore"
  - "D10-10 honored: relPathLocal (already normalized) fed to both predicates — no redundant path.relative call"
  - "openwolf update manages registered consumer projects; the dev repo .wolf/hooks/ requires a manual cp step"
metrics:
  duration: 309
  completed: "2026-06-26"
  tasks_completed: 3
  files_changed: 2
status: complete
requirements: [R6]
---

# Phase 10 Plan 02: Wire R6 Gate Chain into recordAnatomyWrite Summary

## One-Line Summary

Wired shouldExclude + optional parseAndMatchGitignore gate chain into recordAnatomyWrite (after R3 guard) with fresh per-call config read, 4 integration tests, and verified live in .wolf/hooks/post-write.js.

## What Was Built

Extended `src/hooks/post-write.ts` to gate `recordAnatomyWrite` on two new R6 checks
immediately after the existing R3 `../` guard:

- **Import extension:** Added `shouldExclude`, `parseAndMatchGitignore`,
  `DEFAULT_EXCLUDE_PATTERNS` to the existing `from "./shared.js"` import.
- **Gate 1 — exclude_patterns:** Reads `.wolf/config.json` fresh on every call
  (D10-07/R6-D3, no caching). Falls back to `DEFAULT_EXCLUDE_PATTERNS` and
  `respectGitignore=false` on any I/O or JSON.parse error (T-10-03). Calls
  `shouldExclude(relPathLocal, excludePatterns)` and returns early if matched.
- **Gate 2 — root .gitignore:** Only when `respect_gitignore: true` in config
  (D10-08/R6-D4 — defaults to false). Reads the root `.gitignore` and calls
  `parseAndMatchGitignore(relPathLocal, gi)`, returning early if matched. Silently
  skips if `.gitignore` is absent or unreadable.
- **Gate order preserved:** R3 `../` check (line 34) → shouldExclude (line 50) →
  parseAndMatchGitignore (line 56+) — D10-11 order.

Extended `tests/hooks/post-write.test.ts` with a new `describe("recordAnatomyWrite — in-project exclusion (R6)")` block containing 4 integration tests:

1. **E6 regression:** path under `.claude/plans` excluded via `exclude_patterns` — anatomy.md does NOT contain it.
2. **respect_gitignore gate:** root `.gitignore` lists `scratch/` and `respect_gitignore: true` — `scratch/x.ts` NOT recorded.
3. **Default-false control:** same `.gitignore` but NO `respect_gitignore` key — path IS recorded (opt-in confirmed, D10-08).
4. **No config fallback:** absent `.wolf/config.json` — `node_modules/some-pkg/index.js` NOT recorded (DEFAULT_EXCLUDE_PATTERNS fallback fires).

Built hooks (`pnpm build:hooks`) and manually copied `dist/hooks/{post-write.js,shared.js,wolf-ignore.js}` to `.wolf/hooks/` so the gate is live (ROADMAP SC4). The `openwolf update` command was also run but manages registered consumer projects (not the dev repo itself).

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 1 | feat | Inject R6 gate chain into recordAnatomyWrite after R3 guard | 465de61 |
| 2 | test | Add E6 exclude + gitignore-gate + default-false integration tests | fe7d0c9 |
| 3 | build | Exercise build:hooks → copy to .wolf/hooks/ — gate live | 7abf525 |

## Acceptance Criteria — Verified

- [x] `src/hooks/post-write.ts` imports `shouldExclude`, `parseAndMatchGitignore`, `DEFAULT_EXCLUDE_PATTERNS` from `"./shared.js"`
- [x] Gate order: `grep -n 'shouldExclude\|parseAndMatchGitignore\|relPathLocal.startsWith' src/hooks/post-write.ts` → R3 at line 34, shouldExclude at line 50, parseAndMatchGitignore at line 56
- [x] Config read uses `?? DEFAULT_EXCLUDE_PATTERNS` and `?? false` (mirrors scanner, D10-08)
- [x] Config read wrapped in try/catch, no module-level caching (D10-07/R6-D3)
- [x] `parseAndMatchGitignore` only called inside `if (respectGitignore)` branch
- [x] `tsc --noEmit -p tsconfig.hooks.json` exits 0 (C2 — dep-free imports only)
- [x] `tsc --noEmit` exits 0 (main build clean)
- [x] `tests/hooks/post-write.test.ts` contains `describe` block referencing in-project exclusion / R6
- [x] E6 regression asserts anatomy.md does NOT contain the excluded path's filename
- [x] Default-false control asserts gitignored path IS recorded when `respect_gitignore` absent (D10-08)
- [x] Existing R3 + positive-control tests unchanged and passing
- [x] `npx vitest run tests/hooks/post-write.test.ts` exits 0 (13/13 tests)
- [x] `pnpm build:hooks` exits 0
- [x] `.wolf/hooks/post-write.js` contains `shouldExclude` and `parseAndMatchGitignore` (gate live — ROADMAP SC4)
- [x] `pnpm test` exits 0 (198/198 tests across 25 files)

## Deviations from Plan

### Deviation 1 — openwolf update does not self-update the dev repo's .wolf/hooks/

**Found during:** Task 3

**Issue:** `node dist/bin/openwolf.js update` updated the 5 registered consumer projects
but did NOT copy hooks to the openwolf dev repo's own `.wolf/hooks/`. The command's project
registry only contains consumer projects, not the openwolf repo itself.

**Fix:** Applied the manual copy fallback documented in CLAUDE.md — `cp dist/hooks/*.js .wolf/hooks/` (using `command cp -f` to bypass the interactive `cp='cp -i'` shell alias). The task outcome is identical; only the mechanism differed. This is expected behavior per CLAUDE.md "Or copy manually".

**Classification:** [Rule 1 - Behavior Match] — The plan's `node dist/bin/openwolf.js update` step worked correctly for its intended consumers; the self-dogfood copy required the CLAUDE.md-documented fallback.

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

The threat mitigations from the plan's STRIDE register are all implemented:
- **T-10-03** (malformed config): `JSON.parse` wrapped in try/catch — bad config falls back silently.
- **T-10-04** (E6 anatomy leak): Gate 1 returns before anatomy upsert for any matched path; pinned by E6 regression test.
- **T-10-05** (R3 out-of-project leak): R3 guard preserved and still runs first; pinned by existing regression test.

## Self-Check: PASSED

Files verified:
- `src/hooks/post-write.ts` — FOUND (modified, 27 lines added)
- `tests/hooks/post-write.test.ts` — FOUND (modified, 162 lines added)

Commits verified:
- 465de61 — feat(10-02): gate recordAnatomyWrite on exclude_patterns + root .gitignore — FOUND
- fe7d0c9 — test(10-02): add E6 exclude + gitignore-gate + default-false integration tests — FOUND
- 7abf525 — build(10-02): compile hooks and copy to .wolf/hooks/ — exclusion gate live — FOUND
