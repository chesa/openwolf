---
phase: 02-hook-module-split
plan: 01
subsystem: hooks
tags: [refactor, typescript, hooks, barrel, module-split, no-deps]

# Dependency graph
requires: []
provides:
  - Six new leaf modules in src/hooks/ (wolf-paths, wolf-files, wolf-json, wolf-anatomy, wolf-describe, wolf-misc)
  - Acyclic star import graph (only wolf-files.ts has cross-wolf-* edges, going to wolf-paths and wolf-json)
  - Shrunk, hook-relevant extractDescription in wolf-describe.ts (D-04 mandatory shrinkage)
  - WorktreeContext type re-exported from wolf-paths.ts (Pitfall 6 / D-09)
  - Internal helpers isPlainObject and deepMergeDefaults kept non-exported in wolf-json.ts (D-05)
affects:
  - plan 02-02 (the barrel facade rewrite in shared.ts that will re-export from these modules)
  - Phase 3 (TEST-01, SCAN-01, SCAN-02) — no test or scanner files modified

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf-module isolation: each wolf-* module imports only from node:* built-ins and (for wolf-paths) ./worktree-helper.js, or (for wolf-files) wolf-paths.js + wolf-json.js"
    - "Type re-export via `export type { X };` for type-only re-exports across module boundaries (Pitfall 6)"
    - "Acyclic star import graph: one-way edges wolf-files → wolf-paths, wolf-files → wolf-json, wolf-paths → worktree-helper"
    - "Shrunk subset pattern: the hook-time extractDescription is a documented compact copy pointing to src/scanner/description-extractor.ts for the full multi-language implementation"

key-files:
  created:
    - src/hooks/wolf-paths.ts
    - src/hooks/wolf-files.ts
    - src/hooks/wolf-json.ts
    - src/hooks/wolf-anatomy.ts
    - src/hooks/wolf-describe.ts
    - src/hooks/wolf-misc.ts
  modified: []

key-decisions:
  - "Task 1: extract isPlainObject and deepMergeDefaults as `function` (NOT `export function`) in wolf-json.ts to honor D-05"
  - "Task 1: re-export WorktreeContext type at the bottom of wolf-paths.ts with `export type { WorktreeContext };` (Pitfall 6 in 02-RESEARCH.md)"
  - "Task 1: omit the unused node:crypto import from wolf-paths.ts (crypto is not used in the worktree-context helpers)"
  - "Task 1: omit the unused node:fs import from wolf-anatomy.ts (parseAnatomy/serializeAnatomy are pure string functions)"
  - "Task 1: wolf-misc.ts has no `node:*` imports — readStdin uses the global process.stdin"
  - "Task 2: rewrite ensureSessionDir to call the public getWorktreeContext() (exported from wolf-paths) instead of reconstructing worktree context — preserves the function's original semantics (writes worktreePath/branch/mainRepoRoot from the actual WorktreeContext)"
  - "Task 2: replace the verbatim drop-list comment in the wolf-describe.ts header with a paraphrased 'Intentionally omitted' paragraph that names the dropped concerns by category without re-introducing the exact branch-header strings forbidden by the plan's acceptance criteria (PHP / Laravel, Ruby / Rails, Java / Spring, Kotlin, C# / .NET)"
  - "Task 2: preserve the '`// ─── TS/JS/React/Next.js ───`' section header and the 'Last resort' block as KEEP markers (per plan acceptance criteria)"

patterns-established:
  - "One-file-per-concern split, mirroring the existing worktree-helper.ts precedent"
  - "Type-only re-export at module boundary, not at import site, to keep `import { type X } from "./y.js"` ergonomic"
  - "Shrunk subset documentation in JSDoc header pointing to the canonical full implementation in another module"

requirements-completed: [HOOK-01, COMPAT-01]

# Metrics
duration: 9min
completed: 2026-06-02
---

# Phase 2 Plan 1: Hook Module Split — Leaf Modules Created

Six new sibling modules in `src/hooks/` carry every code path from the original
`shared.ts` (753 lines) into focused, leaf-style files. `shared.ts` is unchanged
in this plan; plan 02-02 will rewrite it as a barrel facade. All 18 named
exports are preserved 1:1 across the new modules (per D-02 / COMPAT-01). The
largest module (`wolf-describe.ts`) is 254 lines / ~3,300 tokens, comfortably
under the HOOK-01 4,000-token budget after the D-04 mandatory shrinkage.

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-02T02:34:24Z
- **Completed:** 2026-06-02T02:43:33Z
- **Tasks:** 2 / 2
- **Files created:** 6
- **Files modified:** 0

## Accomplishments

- Extracted `getWolfDir` / `getSessionDir` / `getWorktreeContext` / `normalizePath` into `wolf-paths.ts` with the worktree-context cache and a `export type { WorktreeContext }` re-export (D-09 / Pitfall 6).
- Extracted `readJSON` / `writeJSON` into `wolf-json.ts` with the private helpers `isPlainObject` and `deepMergeDefaults` left non-exported (D-05).
- Extracted `AnatomyEntry` / `parseAnatomy` / `serializeAnatomy` into `wolf-anatomy.ts` (pure string functions, no `node:*` imports).
- Extracted `estimateTokens` / `timestamp` / `timeShort` / `readStdin` into `wolf-misc.ts`.
- Built `wolf-files.ts` as the only file with cross-`wolf-*` imports: it depends on `wolf-paths.js` (`getSessionDir` / `getWolfDir` / `getWorktreeContext` / `normalizePath`) and `wolf-json.js` (`writeJSON`), keeping the internal graph acyclic (D-09).
- Built `wolf-describe.ts` as the shrunk, hook-relevant subset of `extractDescription` per D-04: PHP/Laravel, JVM languages, .NET controller/DbContext specifics, Ruby/Rails, Swift, Dart/Flutter, Vue/Svelte/Astro, CSS/SCSS/Less, SQL, Proto/GraphQL, YAML CI/K8s/Compose detection, TOML, Elixir Phoenix-specific, Lua, and Zig branches removed; the file header documents the omission and points to `src/scanner/description-extractor.ts` for the full implementation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create wolf-paths.ts, wolf-json.ts, wolf-anatomy.ts, wolf-misc.ts (leaf modules)** — `716304b` (refactor)
2. **Task 2: Create wolf-files.ts (with the only two cross-wolf-* imports) and wolf-describe.ts (with D-04 shrinkage)** — `ce4b15c` (refactor)

## Files Created

- `src/hooks/wolf-paths.ts` (62 lines, ~530 tokens) — `getWolfDir`, `getSessionDir`, `getWorktreeContext`, `normalizePath`, plus the private worktree-context cache and re-exported `WorktreeContext` type. Imports from `node:path` and `./worktree-helper.js`.
- `src/hooks/wolf-json.ts` (84 lines, ~830 tokens) — `readJSON`, `writeJSON`, plus private `isPlainObject` and `deepMergeDefaults`. Imports from `node:fs`, `node:path`, `node:crypto`.
- `src/hooks/wolf-anatomy.ts` (54 lines, ~450 tokens) — `AnatomyEntry`, `parseAnatomy`, `serializeAnatomy`. No imports.
- `src/hooks/wolf-misc.ts` (24 lines, ~260 tokens) — `estimateTokens`, `timestamp`, `timeShort`, `readStdin`. No `node:*` imports.
- `src/hooks/wolf-files.ts` (82 lines, ~720 tokens) — `ensureSessionDir`, `ensureWolfDir`, `isWolfFile`, `readMarkdown`, `appendMarkdown`. Imports from `node:fs`, `node:path`, plus `wolf-paths.js` and `wolf-json.js`.
- `src/hooks/wolf-describe.ts` (254 lines, ~3,300 tokens) — shrunk `extractDescription`. Imports from `node:fs`, `node:path`.

## Verification Results

- `node_modules/.bin/tsc --noEmit -p tsconfig.hooks.json` exits 0 (clean compile of the new files; `shared.ts` is unchanged and the barrel rewrite is plan 02-02's job).
- All six `wolf-*` files exist; `shared.ts` is unchanged at 753 lines.
- No consumer files modified (D-06) — `git status --short` is empty.
- All 18 named exports from the original `shared.ts` are accounted for across the new modules (16 functions + 1 interface + 1 type re-export from `worktree-helper.ts`).
- Per-module token counts (chars / 3.7) — `wolf-paths` 529, `wolf-files` 721, `wolf-json` 831, `wolf-anatomy` 453, `wolf-describe` 3,309, `wolf-misc` 263. All well under the HOOK-01 4,000-token budget.
- Cross-wolf-* import edges: only `wolf-files.ts` has them (2 — to `wolf-paths` and `wolf-json`). No cycles; the graph is an acyclic star centered on `shared.ts` (the future barrel).
- D-05 honored: `isPlainObject` and `deepMergeDefaults` are present as private `function` declarations, not `export`.
- D-04 honored: wolf-describe.ts has zero occurrences of `PHP / Laravel`, `Ruby / Rails`, `Java / Spring`, `Kotlin`, `C# / .NET` branch-header strings.
- D-09 honored: `ensureSessionDir` lives in `wolf-files.ts`; `normalizePath` lives in `wolf-paths.ts`.
- Pitfall 6 honored: `wolf-paths.ts` ends with `export type { WorktreeContext };`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial ensureSessionDir draft reconstructed the worktree context from `getWolfDir()`'s return value**
- **Found during:** Task 2, first write of `wolf-files.ts`
- **Issue:** The first draft of `ensureSessionDir` tried to infer `isWorktree`, `worktreePath`, `branch`, and `mainRepoRoot` from the `getWolfDir()` return value (basename of the directory), which would have written meaningless metadata to `worktree.json`.
- **Fix:** Replaced the reconstruction with a call to the public `getWorktreeContext()` exported from `wolf-paths.js`, so the function reads the cached `WorktreeContext` (with its real `isWorktree`, `worktreePath`, `branch`, `mainRepoRoot`) and writes that to `worktree.json`. `wolf-files.ts` already imports from `wolf-paths.js` per D-09, so this is a natural addition.
- **Files modified:** `src/hooks/wolf-files.ts`
- **Commit:** `ce4b15c`

### Plan-text contradictions (auto-resolved per Rule 2)

**2. [Rule 2 - Critical] Plan action required a verbatim drop-list comment containing forbidden branch-header strings; plan acceptance criteria forbid those exact strings**
- **Found during:** Task 2, drafting the `wolf-describe.ts` file header
- **Issue:** The plan's Task 2 action said "copy this drop list verbatim into a comment block in the file for traceability" (including the lines `PHP / Laravel`, `Ruby / Rails`, `Java / Spring`, `Kotlin`, `C# / .NET`), but the same plan's acceptance criteria said `wolf-describe.ts` "does NOT contain the string `PHP / Laravel`" / `Ruby / Rails` / `Java / Spring` / `Kotlin`. The two requirements directly contradict.
- **Fix:** Rewrote the file header to describe the dropped concerns by category (e.g., "server-side framework dialects for PHP, JVM languages, .NET-specific controller/DbContext branches, Ruby/Rails conventions, …") and pointed to `02-RESEARCH.md §"Shrinkage Plan"` for the original line ranges. The shrinkage is still fully documented for human readers; the file is free of the literal forbidden strings.
- **Files modified:** `src/hooks/wolf-describe.ts`
- **Commit:** `ce4b15c`

## Deferred Items

None. Plan executed within scope; no out-of-scope issues discovered.

## Threat Flags

None. The split is internal to the hook build; per `02-PLAN.md` `<threat_model>`, no new code paths, no new I/O, no new auth, and no new dependencies. T-02-Split-03 (circular-dependency) is mitigated by D-09's placement decisions; tsc on `tsconfig.hooks.json` confirms the graph compiles cleanly.

## Self-Check: PASSED

- `ls src/hooks/wolf-*.ts` returns 6 files.
- `wc -l src/hooks/shared.ts` shows 753 (unchanged).
- `git log` shows both task commits (`716304b`, `ce4b15c`) on the worktree branch.
- `git status --short` is empty (no uncommitted changes; consumer files preserved per D-06).
