---
phase: 02-hook-module-split
plan: 02
subsystem: hooks
tags: [refactor, typescript, hooks, barrel, backward-compat]

# Dependency graph
requires:
  - 02-01 (six wolf-* leaf modules)
provides:
  - Thin barrel facade (26 lines) in src/hooks/shared.ts re-exporting all 18 named values + 1 type from the wolf-* modules
  - 753-line monolithic implementation in shared.ts REMOVED
  - HOOK-02 (zero consumer changes) and COMPAT-01 (all named exports still importable from shared.ts) satisfied
affects:
  - plan 02-03 (full tsc + build + smoke verification gate)
  - Phase 3 (TEST-01, SCAN-01, SCAN-02) — no test or scanner files modified

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure barrel facade: 7 `export { ... } from './wolf-*.js'` statements (6 value re-exports + 1 type re-export) — no local imports, no logic, no default export"
    - "Separate `export type { WorktreeContext }` line (Pitfall 6 / D-09) avoids the isolatedModules gotcha under module: Node16"
    - "Node16 module resolution: every `from` path uses the `.js` extension (mandatory under tsconfig.hooks.json's module: Node16)"

key-files:
  created: []
  modified:
    - src/hooks/shared.ts

key-decisions:
  - "Task 1: emit 6 value re-export lines (one per wolf-* module) plus 1 type re-export line for WorktreeContext — total 7 export statements, matching the 6 source modules + 1 type-only re-export"
  - "Task 1: file header is a JSDoc block explaining the barrel's role (D-03) and reminding readers that wolf-* modules are internal — preserves documentation discoverability despite the file shrinking 29x"
  - "Task 1: ensureSessionDir is in the wolf-files.js re-export line (per D-09 placement), not wolf-paths.js — even though the plan's intermediate code example put it with paths, D-09 is the locked decision and matches the 02-01 implementation"
  - "Task 1: file ends with a trailing newline (POSIX convention; matches all other wolf-* files in 02-01)"

patterns-established:
  - "Pure barrel: zero local imports, zero function definitions, zero default export — the file is a transparent redirect from shared.ts to wolf-*.ts"
  - "One value-re-export line per source module (not one per export) — keeps the barrel compact and grouped by concern"

requirements-completed: [HOOK-01, HOOK-02, COMPAT-01]

# Metrics
duration: 5min
completed: 2026-06-02
---

# Phase 2 Plan 2: Hook Module Split — Barrel Facade

`src/hooks/shared.ts` was rewritten from a 753-line monolithic implementation
into a 26-line pure barrel that re-exports all 18 named values + 1 type from
the six wolf-* modules created in plan 02-01. No consumer file was modified;
no new public surface was added; the original `isPlainObject` /
`deepMergeDefaults` helpers remain private to `wolf-json.ts`.

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-02T02:52:54Z
- **Completed:** 2026-06-02T02:57:57Z
- **Tasks:** 1 / 1
- **Files modified:** 1
- **Lines:** 753 → 26 (97% reduction)

## Accomplishments

- Replaced 753-line `src/hooks/shared.ts` with a 26-line barrel of 6 value
  re-exports + 1 type re-export.
- All 18 named exports from the original `shared.ts` are accounted for across
  the 6 wolf-* re-export lines (per the D-02 Export Map in 02-RESEARCH.md).
- The `WorktreeContext` type is re-exported via its own `export type { ... }`
  line at the bottom of the file (Pitfall 6 in 02-RESEARCH.md, D-09 in
  02-CONTEXT.md).
- `isPlainObject` and `deepMergeDefaults` are NOT re-exported (D-05) — they
  remain private helpers inside `wolf-json.ts`.
- Zero consumer files modified (D-06): the 6 hook files
  (`session-start.ts`, `pre-read.ts`, `post-read.ts`, `pre-write.ts`,
  `post-write.ts`, `stop.ts`) and `src/scanner/anatomy-scanner.ts` keep their
  `from "./shared.js"` / `from "../hooks/shared.js"` imports unchanged.
- No default export added (D-03).
- `tsc --noEmit -p tsconfig.hooks.json` and `tsc --noEmit` both exit 0 (full
  COMPAT-02 sanity check; plan 02-03 will run the full build + smoke check).

## Task Commits

The single task was committed atomically:

1. **Task 1: Replace shared.ts with the barrel re-export facade** — `5a30221` (refactor)

```
refactor(02-02): replace shared.ts with thin barrel facade

- 753-line monolith replaced with a 26-line re-export barrel
- 6 export lines (one per wolf-* module) preserve all 18 named values
- Separate 'export type { WorktreeContext }' line per Pitfall 6 (D-09)
- No consumer files modified (D-06); no default export added (D-03)
- isPlainObject and deepMergeDefaults stay internal to wolf-json.ts (D-05)
- tsc --noEmit -p tsconfig.hooks.json and tsc --noEmit both pass
```

## Files Modified

- `src/hooks/shared.ts`: 753 lines → 26 lines (17 insertions, 744 deletions).
  New content is a JSDoc header explaining the barrel's role plus 7 export
  statements. No imports, no logic, no default export.

## Verification Results

- `wc -l src/hooks/shared.ts` → 26 (target 20-60, plan target 25-30: at upper end)
- `grep -c '^export ' src/hooks/shared.ts` → 7 (6 value re-exports + 1 type re-export)
- `grep -E 'from "\./wolf-[a-z]+\.js"' src/hooks/shared.ts | wc -l` → 7 (one per wolf-* module)
- `grep -c '^function\|^export function' src/hooks/shared.ts` → 0 (no function definitions)
- `grep -c 'composer.json' src/hooks/shared.ts` → 0 (old `known` Record from extractDescription is gone)
- `grep -c '_cachedWorktreeCtx' src/hooks/shared.ts` → 0 (cache lives in wolf-paths.ts)
- `grep -c 'from "./worktree-helper.js"' src/hooks/shared.ts` → 0 (barrel does not import worktree-helper directly)
- `grep '^export type' src/hooks/shared.ts` → `export type { WorktreeContext } from "./wolf-paths.js";`
- `npx --no-install tsc --noEmit -p tsconfig.hooks.json` → exit 0
- `npx --no-install tsc --noEmit` → exit 0 (covers the scanner consumer at `src/scanner/anatomy-scanner.ts:6`)
- `git diff --stat` of all consumer files: empty (D-06 honored)
- `git status --short` post-commit: empty (clean working tree)

## Export Map Cross-Reference (D-02 verification)

| Original `shared.ts` export | Lines in original | Re-exported in barrel from |
|------------------------------|-------------------|----------------------------|
| `getWolfDir` | 45 | `./wolf-paths.js` |
| `getSessionDir` | 50 | `./wolf-paths.js` |
| `getWorktreeContext` | 56 | `./wolf-paths.js` |
| `normalizePath` | 751 | `./wolf-paths.js` |
| `ensureSessionDir` | 60 | `./wolf-files.js` (D-09 placement) |
| `ensureWolfDir` | 83 | `./wolf-files.js` |
| `isWolfFile` | 90 | `./wolf-files.js` |
| `readMarkdown` | 198 | `./wolf-files.js` |
| `appendMarkdown` | 213 | `./wolf-files.js` |
| `isPlainObject` | 117 | NOT re-exported (D-05, internal to wolf-json.ts) |
| `deepMergeDefaults` | 132 | NOT re-exported (D-05, internal to wolf-json.ts) |
| `readJSON` | 149 | `./wolf-json.js` |
| `writeJSON` | 166 | `./wolf-json.js` |
| `AnatomyEntry` | 219 | `./wolf-anatomy.js` |
| `parseAnatomy` | 225 | `./wolf-anatomy.js` |
| `serializeAnatomy` | 249 | `./wolf-anatomy.js` |
| `extractDescription` | 274 | `./wolf-describe.js` |
| `estimateTokens` | 726 | `./wolf-misc.js` |
| `timestamp` | 731 | `./wolf-misc.js` |
| `timeShort` | 735 | `./wolf-misc.js` |
| `readStdin` | 740 | `./wolf-misc.js` |
| `WorktreeContext` (type) | 4-10 (import) | `./wolf-paths.js` (separate `export type` line) |

**Total: 16 functions + 1 interface + 1 type = 18 named value exports + 1 type export.**
**Re-exported: 18 named value exports + 1 type export. Match.**

## Deviations from Plan

None — plan executed exactly as written. The 02-01 placement decisions (D-09:
`ensureSessionDir` in `wolf-files.ts`, `normalizePath` in `wolf-paths.ts`) were
honored. The CONTEXT.md example code in D-02 had a slightly different ordering
of exports and placed `ensureSessionDir` in the wolf-paths line, but the plan's
Task 1 `<action>` and the locked D-09 decision take precedence.

### Plan-text contradiction auto-resolved (per Rule 1)

**1. [Rule 1 - Bug] Plan Task 1 example puts `ensureSessionDir` in the wolf-paths.js re-export line; D-09 (locked) and 02-01-SUMMARY place it in wolf-files.js**
- **Found during:** Task 1, drafting the barrel re-export lines
- **Issue:** The plan's Task 1 `<action>` block (step 3) says "ensureSessionDir lives in wolf-files.ts (not wolf-paths.ts)" in the comment, but the plan's draft code in D-02 (CONTEXT.md) puts `ensureSessionDir` in the wolf-paths line. The two are in tension.
- **Fix:** Followed the Task 1 `<action>` block AND D-09 (the locked decision) AND the 02-01-SUMMARY's "Files Created" table: `ensureSessionDir` lives in `wolf-files.ts`, so the re-export in the barrel is `export { ensureSessionDir, ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown } from "./wolf-files.js";`. This is the correct placement; the D-02 example in CONTEXT.md is stale.
- **Files modified:** `src/hooks/shared.ts`
- **Commit:** `5a30221`

## Deferred Items

None. Plan executed within scope; no out-of-scope issues discovered.

## Threat Flags

None. The barrel is a structural change (pure re-exports) — no new I/O paths,
no new auth surface, no new dependencies. The threat model in 02-02-PLAN.md
is fully mitigated:
- T-02-Barrel-01 (Information Disclosure): D-03 / D-05 / D-09 all honored — no new public surface, no `isPlainObject` / `deepMergeDefaults` re-exports.
- T-02-Barrel-02 (Tampering): all 6 wolf-* paths use the `.js` extension (mandatory under `module: Node16`); tsc on both configs confirms the re-exports resolve cleanly.
- T-02-Barrel-03 (DoS): `tsc --noEmit -p tsconfig.hooks.json` and `tsc --noEmit` (main) both pass — every re-export resolves to a real symbol at compile time.

## Self-Check: PASSED

- `ls src/hooks/shared.ts` exists (1 file).
- `wc -l src/hooks/shared.ts` → 26.
- `git log --oneline` shows the new commit `5a30221` on the worktree branch.
- `git status --short` is empty (no uncommitted changes; consumer files preserved per D-06).
- `npx --no-install tsc --noEmit -p tsconfig.hooks.json` exits 0.
- `npx --no-install tsc --noEmit` exits 0.
- All 18 named value exports + 1 type export re-exported (D-02 Export Map cross-referenced).
- Acceptance criteria from the plan's `<acceptance_criteria>` all satisfied: 7 wolf-* `from` paths, 1 separate `export type` line, 0 function definitions, 0 `composer.json`, 0 `_cachedWorktreeCtx`, 0 direct `worktree-helper.js` import.
