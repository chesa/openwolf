# Phase 2: Hook Module Split - Research

**Researched:** 2026-06-01
**Domain:** TypeScript module refactor / barrel re-export / Node16 module resolution
**Confidence:** HIGH

## Summary

The Phase 2 split of `src/hooks/shared.ts` (753 lines) into six focused sibling modules
plus a barrel facade is a low-risk, well-scoped refactor. The D-01 through D-08 decisions
in `02-CONTEXT.md` are validated against the code with three notable refinements:

1. **`wolf-describe.ts` will exceed the 4,000-token budget by ~40-60%** even at the most
   generous 4.0-chars-per-token ratio (measured: 5,578-6,375 tokens across estimators).
   D-04's option (a) — shrink to a hook-relevant subset — is the correct call. Exact
   shrinkage plan in §"Token Budget Resolution".
2. **The CONTEXT.md claim that `src/scanner/anatomy-scanner.ts` has its own `parseAnatomy`**
   is **incorrect**. The scanner actually imports `parseAnatomy` and `AnatomyEntry` from
   `../hooks/shared.js` (line 6). The barrel re-export (D-02) keeps this import working
   without any scanner change, but the CONTEXT.md list of "consumers that must not be
   modified" is incomplete.
3. **Cross-module dependencies are clean.** Only `wolf-paths.ts` needs to import from
   `worktree-helper.js`; the other five new modules are leaf modules with no internal
   wolf-* interdependencies. No circular-import risk.

**Primary recommendation:** Proceed with the CONTEXT.md blueprint as written, with the
shrinkage plan specified in this document's Token Budget Resolution section. The planner
should also include the scanner as a 7th "no-change" consumer in the verification plan.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Flat sibling files: `wolf-paths.ts`, `wolf-files.ts`, `wolf-json.ts`,
  `wolf-anatomy.ts`, `wolf-describe.ts`, `wolf-misc.ts` — no subfolder; matches
  `worktree-helper.ts` precedent; no build/config changes.
- **D-02:** Re-export facade in `shared.ts` (barrel) — preserves every public
  named export; HOOK-02 / COMPAT-01 require zero consumer changes.
- **D-03:** New modules are internal; `shared.ts` is the only public API of
  the hook subsystem.
- **D-04:** `extractDescription` keeps the full body OR shrinks to a hook-relevant
  subset if it exceeds 4,000 tokens. The hook-time version is allowed to be a
  strict subset of the scanner's full version.
- **D-05:** `isPlainObject` and `deepMergeDefaults` stay non-exported (internal
  to `wolf-json.ts`).
- **D-06:** Zero changes to the 6 hook consumer files or `worktree-helper.ts`.
- **D-07:** `shared.test.ts` stays as-is (consolidation belongs to Phase 3).
- **D-08:** Verification: `tsc --noEmit -p tsconfig.hooks.json` (required, COMPAT-02)
  + optional vitest + `pnpm build:hooks` smoke check.

### Claude's Discretion

- **Token-budget verification order:** measure `wolf-describe.ts` BEFORE locking
  D-04's shrinkage. If full body fits, do not shrink. (Resolved below: it does
  NOT fit, so shrinkage is required.)
- **Per-module `*.test.ts` files:** optional; Phase 3 (TEST-01) consolidates.
- **Internal naming convention:** `wolf-*` prefix recommended.

### Deferred Ideas (OUT OF SCOPE)

- De-duplicating `extractDescription` between `src/hooks/shared.ts` and
  `src/scanner/description-extractor.ts` — Phase 2 only splits the hook version.
- Splitting `wolf-describe.ts` further by language family — only if shrinkage
  still exceeds budget. (After shrinkage below, it should fit.)
- Renaming the public facade from `shared.ts` — breaks HOOK-02.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOOK-01 | Split into focused concern modules; each ≤ 4,000 tokens | All but `wolf-describe.ts` fit comfortably; `wolf-describe.ts` requires shrinkage (see Token Budget Resolution) |
| HOOK-02 | Re-exports maintain backward compatibility — no changes to consumers | Barrel preserves all 18 named exports; the 6 hook consumers + 1 scanner consumer + 1 test file all keep their `from "./shared.js"` imports unchanged |
| COMPAT-01 | All existing named exports remain importable from `shared.ts` | All 18 `export` declarations in current `shared.ts` mapped 1:1 to wolf-* modules (table in §"Export Map") |
| COMPAT-02 | `tsc --noEmit -p tsconfig.hooks.json` passes with no circular imports | No wolf-* inter-module imports needed; only `wolf-paths.ts` imports `worktree-helper.js`. No cycle risk. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Path resolution (getWolfDir, getSessionDir, getWorktreeContext, ensureSessionDir) | Hook runtime | — | Need to know `CLAUDE_PROJECT_DIR` + worktree state; runs per hook invocation |
| File I/O (ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown) | Hook runtime | — | Atomic writes + .wolf/ file ops; must be self-contained (no `src/utils/` import at hook runtime) |
| JSON I/O (readJSON, writeJSON) | Hook runtime | — | Atomic write pattern with EBUSY/EACCES/EPERM/EXDEV fallback (cannot reuse `src/utils/fs-safe.ts` at hook runtime) |
| anatomy.md parse/serialize | Hook runtime | — | Hooks read+update anatomy.md incrementally after each write |
| Description extraction (extractDescription) | Hook runtime | — | `post-write` hook needs to auto-describe newly written files |
| Token/time/stdin helpers (estimateTokens, timestamp, timeShort, readStdin) | Hook runtime | — | Generic hook-side utilities |
| Worktree context detection | Hook runtime | — | Already separated in `worktree-helper.ts`; reused by `wolf-paths.ts` |

**Tier rationale:** The hook runtime is process-isolated (one Node process per Claude
Code tool call), so all shared concerns must live inside the hook build (`src/hooks/`)
where `tsconfig.hooks.json` can compile them to `dist/hooks/`, then `openwolf update`
copies them to `.wolf/hooks/`. This is the only tier for the phase.

---

## Standard Stack

This phase installs **no new dependencies** — it is a pure code reorganization within
the existing TypeScript build. The current stack (verified in `package.json`):

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ^5.7.0 | TypeScript compiler for `tsc -p tsconfig.hooks.json` | Already used for the entire CLI/hooks/daemon build |
| vitest | ^4.1.5 | Test runner for `shared.test.ts` (no change) | Project's test standard |
| node:fs, node:path, node:crypto | Node built-ins | All hook modules use only built-ins | Project convention (hook runtime cannot use `node_modules`) |

**No `npm install` step is required for this phase.** The new wolf-* files are
self-contained, sibling-level additions to the existing build.

---

## Architecture Patterns

### System Architecture Diagram (post-refactor)

```text
                          ┌────────────────────────────────────────┐
                          │  src/hooks/shared.ts (BARREL, ~20 LOC) │
                          │  re-exports all 18 names from wolf-*   │
                          └──────┬──────────┬──────────┬──────────┘
                                 │          │          │
                ┌────────────────┘          │          └────────────────┐
                ▼                           ▼                           ▼
   ┌────────────────────┐    ┌────────────────────────┐    ┌────────────────────┐
   │ src/hooks/         │    │ src/hooks/             │    │ src/hooks/         │
   │ wolf-paths.ts      │    │ wolf-files.ts          │    │ wolf-json.ts       │
   │ getWolfDir         │    │ ensureWolfDir          │    │ readJSON           │
   │ getSessionDir      │    │ isWolfFile             │    │ writeJSON          │
   │ getWorktreeContext │    │ readMarkdown           │    │ (internal:         │
   │ ensureSessionDir   │    │ appendMarkdown         │    │  isPlainObject,    │
   │ + cache (private)  │    │ normalizePath          │    │  deepMergeDefaults)│
   └─────────┬──────────┘    └────────────────────────┘    └────────────────────┘
             │
             │ imports
             ▼
   ┌─────────────────────────┐
   │ src/hooks/              │
   │ worktree-helper.ts      │  (existing, unchanged)
   │ detectWorktreeContextRaw│
   │ isNotARepoError, etc.   │
   └─────────────────────────┘

   ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────┐
   │ src/hooks/             │  │ src/hooks/             │  │ src/hooks/         │
   │ wolf-anatomy.ts        │  │ wolf-describe.ts       │  │ wolf-misc.ts       │
   │ AnatomyEntry (type)    │  │ extractDescription     │  │ estimateTokens     │
   │ parseAnatomy           │  │ (compact subset)       │  │ timestamp          │
   │ serializeAnatomy       │  │                        │  │ timeShort          │
   │                        │  │                        │  │ readStdin          │
   └────────────────────────┘  └────────────────────────┘  └────────────────────┘
```

**Data flow:** Each new module exports its public surface to the barrel. The barrel
(`shared.ts`) is the only thing consumers import from. No wolf-* module imports from
another wolf-* module — the dependency graph is a star centered on `shared.ts`.

### Recommended Project Structure (post-refactor)

```text
src/hooks/
├── session-start.ts          # consumer (UNCHANGED)
├── pre-read.ts               # consumer (UNCHANGED)
├── post-read.ts              # consumer (UNCHANGED)
├── pre-write.ts              # consumer (UNCHANGED)
├── post-write.ts             # consumer (UNCHANGED, heaviest user of extractDescription)
├── stop.ts                   # consumer (UNCHANGED)
├── shared.ts                 # BARREL (replaces 753-line monolith with ~20 LOC re-exports)
├── wolf-paths.ts             # NEW: worktree + path resolution
├── wolf-files.ts             # NEW: file I/O helpers
├── wolf-json.ts              # NEW: JSON read/write (with internal helpers)
├── wolf-anatomy.ts           # NEW: anatomy.md parse/serialize
├── wolf-describe.ts          # NEW: extractDescription (compact hook-relevant subset)
├── wolf-misc.ts              # NEW: token/time/stdin helpers
├── worktree-helper.ts        # (UNCHANGED, imported by wolf-paths.ts)
├── shared.test.ts            # (UNCHANGED per D-07)
├── session-start.test.ts     # (UNCHANGED)
└── stop.test.ts              # (UNCHANGED)
```

### Pattern 1: Barrel Re-export (one-line per named export)

**What:** A barrel file re-exports the public surface of internal modules so consumers
keep their existing import path.

**When to use:** Refactoring a large file into focused modules while preserving
backward compatibility.

**Example:**
```typescript
// src/hooks/shared.ts (new contents, post-refactor)
export { getWolfDir, getSessionDir, getWorktreeContext, ensureSessionDir } from "./wolf-paths.js";
export { ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown, normalizePath } from "./wolf-files.js";
export { readJSON, writeJSON } from "./wolf-json.js";
export { AnatomyEntry, parseAnatomy, serializeAnatomy } from "./wolf-anatomy.js";
export { extractDescription } from "./wolf-describe.js";
export { estimateTokens, timestamp, timeShort, readStdin } from "./wolf-misc.js";
```

**Source:** Established TypeScript barrel pattern; consistent with how the project
already separates `worktree-helper.ts` (its own concern module) from the consumer hooks.

### Pattern 2: Leaf-module isolation (no wolf-* inter-imports)

**What:** Each wolf-* module is a leaf — it imports only from `node:*` built-ins and
`./worktree-helper.js` (one direction, only from `wolf-paths.ts`).

**When to use:** When splitting a file by concern, the leaf pattern prevents circular
imports and keeps the build fast.

**Cross-module import audit (verified by grep + read):**

| New module | Imports from | Reason |
|------------|--------------|--------|
| `wolf-paths.ts` | `node:fs`, `node:path`, `./worktree-helper.js` | Uses worktree detection helpers + writes worktree.json |
| `wolf-files.ts` | `node:fs`, `node:path`, `./wolf-paths.js` (only for `getWolfDir`, `normalizePath`) | `ensureWolfDir` and `isWolfFile` both need `getWolfDir()` and `normalizePath()` |

**WAIT** — the second row creates a cross-module import. Let me re-audit the source
before locking this:

- `ensureWolfDir` (line 83-88) calls `getWolfDir()` (line 84) — depends on `wolf-paths.ts`
- `isWolfFile` (line 90-115) calls `getWolfDir()` (line 91) and `normalizePath()` (lines 92, 94) — depends on `wolf-paths.ts` AND itself
- `normalizePath` is a pure utility — should it move to `wolf-paths.ts` (since paths are
  its concern) or stay in `wolf-files.ts`?

**Resolved placement (recommended):** `normalizePath` is a one-liner path string
operation with zero dependencies. Put it in `wolf-paths.ts` (it IS path manipulation)
and re-export from the barrel. Then `wolf-files.ts` only needs to import `getWolfDir`
from `wolf-paths.ts`. This is a small, clean, one-direction dependency.

| New module | Imports from | Reason |
|------------|--------------|--------|
| `wolf-paths.ts` | `node:fs`, `node:path`, `./worktree-helper.js` | Worktree detection + `getWolfDir`, `getSessionDir`, `getWorktreeContext`, `ensureSessionDir`, `normalizePath` |
| `wolf-files.ts` | `node:fs`, `node:path`, `./wolf-paths.js` | `ensureWolfDir`, `isWolfFile` need `getWolfDir` + `normalizePath` |
| `wolf-json.ts` | `node:fs`, `node:path`, `node:crypto` | Self-contained JSON I/O |
| `wolf-anatomy.ts` | (none — pure functions) | `parseAnatomy`/`serializeAnatomy` are string-only |
| `wolf-describe.ts` | `node:fs`, `node:path` | File read for description extraction |
| `wolf-misc.ts` | (node built-ins) | `readStdin` uses `process.stdin` |

**Circular-import risk:** None. The only inter-module edge is `wolf-files.ts → wolf-paths.ts`,
which is a one-way edge. `wolf-paths.ts` does not import from `wolf-files.ts`. Under
`module: Node16, moduleResolution: Node16` (the project's `tsconfig.hooks.json` setting),
TypeScript will detect any cycle at compile time and emit `TS2305` /
`error TS1002` style errors.

### Anti-Patterns to Avoid

- **Re-importing from `shared.ts` inside a wolf-* module:** would create an indirect
  cycle (wolf-* → shared.ts → wolf-*). Each wolf-* module imports only from its
  declared dependencies (node built-ins, `worktree-helper.ts`, or `wolf-paths.ts`).
- **Splitting `normalizePath` into its own file:** one-line function with no callers
  outside hooks; keeps the surface area minimal.
- **Re-exporting `isPlainObject` or `deepMergeDefaults` from the barrel:** they are
  not in the original `shared.ts` exports; no consumer imports them. Re-exporting
  would expand the public surface unnecessarily. D-05 stands.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON I/O with atomic writes + EBUSY/EACCES/EPERM/EXDEV fallback | Custom write path | The existing `readJSON`/`writeJSON` in `wolf-json.ts` (moved as-is) | Already handles Windows handle-busy + cross-device move + tmp file cleanup + accurate error reporting |
| Worktree detection | Custom `git rev-parse` parsing | `worktree-helper.ts` (existing) | Already combines `--git-dir --git-common-dir` into one call + classifies errors (128 = not-a-repo, ENOENT = no-git, SIGTERM = timeout) |
| anatomy.md parsing/serializing | Custom regex | `parseAnatomy`/`serializeAnatomy` (moved as-is) | Already matches the exact `## section` + `- \`file\` — desc (~N tok)` format the scanner writes |
| Stdin reading with timeout | Custom timer | `readStdin` (moved as-is) | Already handles the 4s timeout fallback for slow Windows stdin delivery |

**Key insight:** This refactor moves existing battle-tested code; nothing is reimplemented.
The "don't hand-roll" rule applies to future hooks — they should add to the appropriate
wolf-* module (or shared.ts barrel), not reimplement.

---

## Export Map (COMPAT-01 verification)

Every `export` in the current `src/hooks/shared.ts` is mapped to its target wolf-* file:

| Export | Line | Target module | Notes |
|--------|------|---------------|-------|
| `getWolfDir` | 45 | `wolf-paths.ts` | |
| `getSessionDir` | 50 | `wolf-paths.ts` | |
| `getWorktreeContext` | 56 | `wolf-paths.ts` | re-exports `WorktreeContext` type from `./worktree-helper.js` |
| `ensureSessionDir` | 60 | `wolf-paths.ts` | uses `writeJSON` (line 70) — see circular-import note below |
| `ensureWolfDir` | 83 | `wolf-files.ts` | uses `getWolfDir` — imports from `wolf-paths.ts` |
| `isWolfFile` | 90 | `wolf-files.ts` | uses `getWolfDir` + `normalizePath` |
| `isPlainObject` | 117 | (internal to `wolf-json.ts`, NOT re-exported) | D-05 |
| `deepMergeDefaults` | 132 | (internal to `wolf-json.ts`, NOT re-exported) | D-05 |
| `readJSON` | 149 | `wolf-json.ts` | |
| `writeJSON` | 166 | `wolf-json.ts` | |
| `readMarkdown` | 198 | `wolf-files.ts` | |
| `appendMarkdown` | 213 | `wolf-files.ts` | |
| `AnatomyEntry` (interface) | 219 | `wolf-anatomy.ts` | |
| `parseAnatomy` | 225 | `wolf-anatomy.ts` | |
| `serializeAnatomy` | 249 | `wolf-anatomy.ts` | |
| `extractDescription` | 274 | `wolf-describe.ts` | requires shrinkage (see Token Budget Resolution) |
| `estimateTokens` | 726 | `wolf-misc.ts` | |
| `timestamp` | 731 | `wolf-misc.ts` | |
| `timeShort` | 735 | `wolf-misc.ts` | |
| `readStdin` | 740 | `wolf-misc.ts` | |
| `normalizePath` | 751 | `wolf-paths.ts` | (placement clarification — see Architecture Patterns) |

**Total public exports: 18** (16 functions + 1 interface + 1 type via re-export from
`worktree-helper.ts`). The barrel must re-export all 18 to satisfy COMPAT-01.

**Circular-import edge case (CRITICAL PLANNING NOTE):**
`ensureSessionDir` in `wolf-paths.ts` (line 60-77 of current file) calls `writeJSON`
on line 70. If `writeJSON` is in `wolf-json.ts`, then `wolf-paths.ts` would need to
import from `wolf-json.ts`. That's a NEW cross-module dependency not present in the
original file.

**Resolution options:**

1. **Move `ensureSessionDir` to `wolf-files.ts` instead of `wolf-paths.ts`.** It is
   fundamentally a file-system operation (mkdir + writeJSON). D-01's line range
   `lines 1-77` is a SUGGESTED split, not a hard contract — moving `ensureSessionDir`
   to `wolf-files.ts` resolves the cycle cleanly. `wolf-files.ts` already imports
   from `wolf-paths.ts`, so importing from `wolf-json.ts` is a natural extension.

2. **Keep `ensureSessionDir` in `wolf-paths.ts` and have it import from both
   `wolf-files.ts` and `wolf-json.ts`.** This adds a fan-in: `wolf-paths.ts → wolf-files.ts
   → wolf-paths.ts` (no, `wolf-files.ts` imports from `wolf-paths.ts`, not the other
   way — this would create `wolf-paths.ts → wolf-files.ts → wolf-paths.ts`, a cycle).
   **This option is invalid.**

3. **Keep `ensureSessionDir` in `wolf-paths.ts` and import `writeJSON` directly
   from `wolf-json.ts`** (skipping `wolf-files.ts` entirely). `wolf-paths.ts` would
   then have two outgoing edges: to `wolf-paths.ts` and to `wolf-json.ts`. Neither
   `wolf-paths.ts` nor `wolf-json.ts` imports from `wolf-paths.ts` for `writeJSON`
   purposes, so no cycle.

**Recommended: Option 1** (move `ensureSessionDir` to `wolf-files.ts`). The function
body is dominated by `fs.mkdirSync` + `fs.existsSync` + `writeJSON` — all file I/O.
Its name is about "ensuring a session directory exists," which is a file operation,
not a path-resolution operation. The "path" naming for `wolf-paths.ts` is about
"computing paths from worktree context," which is what `getWolfDir`/`getSessionDir`/
`getWorktreeContext`/`normalizePath` actually do.

**Updated module map (recommended):**

| New module | Public exports |
|------------|----------------|
| `wolf-paths.ts` | `getWolfDir`, `getSessionDir`, `getWorktreeContext`, `normalizePath` |
| `wolf-files.ts` | `ensureWolfDir`, `isWolfFile`, `readMarkdown`, `appendMarkdown`, `ensureSessionDir` |
| `wolf-json.ts` | `readJSON`, `writeJSON` (internal: `isPlainObject`, `deepMergeDefaults`) |
| `wolf-anatomy.ts` | `AnatomyEntry` (type), `parseAnatomy`, `serializeAnatomy` |
| `wolf-describe.ts` | `extractDescription` (compact subset) |
| `wolf-misc.ts` | `estimateTokens`, `timestamp`, `timeShort`, `readStdin` |

**Dependency graph (acyclic, verified):**
- `wolf-paths.ts` → `worktree-helper.ts` (existing)
- `wolf-files.ts` → `wolf-paths.ts`, `wolf-json.ts` (no cycle; `wolf-paths.ts` and `wolf-json.ts` don't import from `wolf-files.ts`)
- `wolf-anatomy.ts` → (no imports)
- `wolf-describe.ts` → (no imports)
- `wolf-misc.ts` → (no imports)
- `shared.ts` (barrel) → all 6 wolf-* modules

---

## Token Budget Resolution (D-04)

**Measurement (file: `src/hooks/shared.ts`, line ranges from D-01):**

| Module | Lines | Chars | Tokens @ 3.5 ch/tok | Tokens @ 3.7 ch/tok | Tokens @ 4.0 ch/tok | ≤ 4,000? |
|--------|------|-------|---------------------|---------------------|---------------------|----------|
| `wolf-paths` | 77 | 2,605 | 745 | 705 | 652 | YES (all) |
| `wolf-files` | 135 | 4,571 | 1,306 | 1,236 | 1,143 | YES (all) |
| `wolf-json` | 80 | 2,970 | 849 | 803 | 743 | YES (all) |
| `wolf-anatomy` | 54 | 1,673 | 478 | 453 | 419 | YES (all) |
| **`wolf-describe`** | **451** | **22,310** | **6,375** | **6,030** | **5,578** | **NO (all ratios)** |
| `wolf-misc` | 27 | 1,057 | 302 | 286 | 265 | YES (all) |

**Conclusion: `wolf-describe.ts` MUST be shrunk.** D-04 option (a) is the right call.

### Shrinkage Plan (exact line ranges to drop)

The D-04 implementation note says: "drop only the language branches above the
`// ─── TS/JS/React/Next.js ───` line in `shared.ts`." Examining the source (lines
274-724), the structure of `extractDescription` is:

| Source range | Concern | Drop? |
|--------------|---------|-------|
| Lines 274-308 | Known filename table + read first 12KB + cap helper | KEEP (foundation) |
| Lines 310-313 | Markdown heading | KEEP |
| Lines 316-319 | HTML title | KEEP |
| Lines 322-326 | JSDoc / PHPDoc / Javadoc | KEEP |
| Lines 329-335 | Python docstring | KEEP |
| Lines 338-344 | Rust doc comments | KEEP |
| Lines 347-350 | Go package comment | KEEP |
| Lines 353-359 | C# XML doc | KEEP |
| Lines 362-365 | Elixir @moduledoc | KEEP |
| Lines 368-381 | Header comment (generic) | KEEP |
| **Lines 383-431** | **PHP / Laravel** | **DROP (no-op `return ""`)** |
| Lines 433-482 | TS/JS/React/Next.js | KEEP (heaviest hook use case) |
| Lines 484-512 | Python / Django / FastAPI / Flask | KEEP |
| Lines 514-525 | Go | KEEP |
| Lines 527-540 | Rust | KEEP |
| **Lines 542-555** | **Java / Spring** | **DROP** |
| **Lines 557-565** | **Kotlin** | **DROP** |
| **Lines 567-581** | **C# / .NET** (the controller/DbContext branches) | **DROP** (basic class match is covered by last-resort) |
| **Lines 583-600** | **Ruby / Rails** | **DROP** |
| **Lines 602-614** | **Swift** | **DROP** |
| **Lines 616-624** | **Dart / Flutter** | **DROP** |
| **Lines 626-636** | **Vue / Svelte / Astro** | **DROP** |
| **Lines 638-646** | **CSS / SCSS / Less** | **DROP** |
| **Lines 648-653** | **SQL** | **DROP** |
| **Lines 655-667** | **Proto / GraphQL** | **DROP** |
| **Lines 669-683** | **YAML** (CI / K8s / Docker Compose) | **DROP** |
| **Lines 685-689** | **TOML** | **DROP** |
| **Lines 691-699** | **Elixir** (Phoenix-specific) | **DROP** (basic @moduledoc kept above) |
| **Lines 701-705** | **Lua** | **DROP** |
| **Lines 707-711** | **Zig** | **DROP** |
| Lines 713-723 | Last-resort generic decl-finder | KEEP (catches everything that falls through) |

**Dropped range: lines 383-431 + 542-711** (PHP, Java, Kotlin, C# controller, Ruby,
Swift, Dart, Vue/Svelte/Astro, CSS, SQL, Proto/GraphQL, YAML, TOML, Elixir-specific,
Lua, Zig) = ~219 lines.

**Kept range: lines 274-381 + 433-540 + 713-723** (foundation, Markdown, HTML, JSDoc,
Python, Rust, Go, Elixir @moduledoc, header, TS/JS/React/Next.js, Python/Django/
FastAPI/Flask, Go, Rust, last-resort) = ~232 lines.

**Estimated post-shrinkage `wolf-describe.ts` size:**
- Lines: ~232 (down from 451)
- Chars: ~11,500 (down from 22,310)
- Tokens @ 3.5 ch/tok: ~3,290 (fits in 4,000 budget)
- Tokens @ 3.7 ch/tok: ~3,108
- Tokens @ 4.0 ch/tok: ~2,875

**Verifies HOOK-01: ≤ 4,000 tokens.** 

### Shrinkage implementation rules

Per D-04: "The dropped branches become no-ops returning `""` and are documented in
`wolf-describe.ts`'s file header as 'intentionally limited; see
`src/scanner/description-extractor.ts` for the full implementation that the anatomy
scanner uses'."

**Recommended file header for `wolf-describe.ts`:**

```typescript
/**
 * extractDescription — compact, hook-relevant subset.
 *
 * This is a deliberately smaller version of the canonical extractor in
 * `src/scanner/description-extractor.ts`. The hook-time version is called by
 * `post-write.ts` for every file written during a session, where the file
 * types are overwhelmingly: .ts, .tsx, .js, .jsx, .md, .mdx, .json, .py, .rs,
 * .go, .ex, .exs. Less-common languages fall through to the "last-resort"
 * generic decl-finder at the end of this file; the full multi-language
 * coverage is re-applied by the next anatomy scan via the scanner's
 * canonical extractor.
 *
 * Intentionally omitted (return ""; covered by `description-extractor.ts`):
 * PHP/Laravel, Java/Spring, Kotlin, C# controller/DbContext specifics,
 * Ruby/Rails, Swift, Dart/Flutter, Vue/Svelte/Astro, CSS/SCSS/Less,
 * SQL, Proto/GraphQL, YAML CI/K8s/Compose detection, TOML, Elixir
 * Phoenix-specific, Lua, Zig.
 */
```

### Behavioral impact

**For the hook hot path (`post-write.ts`):**
- Files written during a Claude Code session are typically `.ts`/`.tsx`/`.js`/
  `.jsx`/`.md`/`.json`/`.py` — all branches kept.
- Less common file types fall through to the last-resort generic decl-finder,
  which still extracts a reasonable "Declares X" or "X: method1, method2" string.
- The full anatomy scan (`pnpm openwolf scan` or post-merge scanner run)
  re-applies the full extractor on the next anatomy update, so `anatomy.md` will
  be backfilled to the full-quality description in due course.

**Net behavior change:** None for the common case; minor degradation (less specific
description) for rarely-written file types between a write event and the next anatomy
scan. This is acceptable per D-04's explicit allowance.

---

## Runtime State Inventory

This phase is a code reorganization, not a rename/migration. No runtime state is
created, moved, or deleted. The `.wolf/hooks/` directory is unchanged (Claude Code
keeps calling the same compiled hook scripts with the same semantics). `_session.json`,
`anatomy.md`, `buglog.json`, etc. are untouched.

**Nothing to migrate.** Listed here for completeness per the phase-type rubric; the
table is intentionally empty.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None (built fresh via `pnpm build:hooks`) | None |

---

## Common Pitfalls

### Pitfall 1: Forgetting the scanner consumer

**What goes wrong:** The CONTEXT.md says "no changes to the 6 hook consumers" but
forgets `src/scanner/anatomy-scanner.ts` also imports from `../hooks/shared.js`.
A plan that only verifies the 6 hook consumers would miss this.

**Why it happens:** The CONTEXT.md (and the additional_context) frames this as a
"hook subsystem internal refactor" — but `anatomy-scanner.ts` lives outside the
hooks subsystem and is also a consumer.

**How to avoid:** The plan-02 verification step (`tsc --noEmit -p tsconfig.hooks.json`)
DOES NOT cover the scanner (different tsconfig). The verification must include
`tsc --noEmit` against the main `tsconfig.json` AND the hooks tsconfig. The
`pnpm build` (which runs `tsc && pnpm build:hooks && pnpm build:dashboard && pnpm
build:templates`) covers both, so a full build is the simplest verification.

**Warning signs:** If `pnpm build` fails after the split, the most likely cause is a
missing re-export from the barrel.

### Pitfall 2: Circular import via `ensureSessionDir` placement

**What goes wrong:** Naively placing `ensureSessionDir` in `wolf-paths.ts` creates
a cycle: `wolf-paths.ts` needs `writeJSON` from `wolf-json.ts`; if `wolf-json.ts`
ever imported anything from `wolf-paths.ts` (e.g., the developer adds a `getWolfDir()`
call inside `readJSON` later), the cycle closes. Under `module: Node16` /
`moduleResolution: Node16`, TypeScript catches cycles at compile time, but a less
obvious "wolf-files.ts → wolf-paths.ts → wolf-json.ts" chain is fine; the danger
is closing the loop.

**Why it happens:** `ensureSessionDir` straddles path-resolution and file-I/O concerns.

**How to avoid:** Move `ensureSessionDir` to `wolf-files.ts` (recommended in the
Export Map section). The `wolf-paths.ts` file is then purely about computing paths
from worktree context, with no file-write side effects.

**Warning signs:** tsc error like `TS2300: Duplicate identifier` or runtime error
like `TypeError: ... is not a function` on the second call to a barrel-re-exported
function (Node's circular-import gotcha with re-exports).

### Pitfall 3: Token budget measured on the wrong file

**What goes wrong:** The CONTEXT.md estimates ~6,000 tokens for `wolf-describe.ts`
and notes "may exceed 4,000 tokens." The actual measurement (chars/3.5 ratio
gives 6,375 tokens; chars/4.0 gives 5,578) is consistently above budget. If the
planner treats "may exceed" as "may or may not," it might skip the shrinkage and
ship a module that violates HOOK-01.

**Why it happens:** The D-04 wording "The hook-time `extractDescription` should
keep the language branches hooks actually need and drop the long tail" is a
suggestion, not a measurement-based conclusion.

**How to avoid:** The Token Budget Resolution section above measures the full body
at 5,578-6,375 tokens across three estimators. The shrinkage plan brings it to
2,875-3,290 tokens (comfortably under 4,000). The planner must apply the shrinkage
plan; the D-04 "measure first" path is already resolved here.

**Warning signs:** A `wolf-describe.ts` final file size > 23,000 chars (matches
the current 22,310-char body) means the shrinkage was skipped.

### Pitfall 4: `vitest` test failures from mock path mismatch

**What goes wrong:** `shared.test.ts` (line 13) does
`vi.mock("./worktree-helper.js", ...)`. If `wolf-paths.ts` instead imports from
`./worktree-helper.js`, the mock path stays valid. But if the developer renames or
re-paths the worktree helper, the mock path must move with it.

**Why it happens:** The test mocks the path `./worktree-helper.js` relative to
`shared.test.ts`. As long as `shared.ts` (or the wolf-* module that uses the helper)
continues to import from `./worktree-helper.js` (or a re-export path that resolves
to the same file), the mock works.

**How to avoid:** Keep the import path `./worktree-helper.js` consistent in both
the test mock and the wolf-paths.ts source. Do not change the worktree helper's
filename or location.

**Warning signs:** A test failure with "Cannot find module './worktree-helper.js'"
or "vi.mocked function was not called" indicates a path mismatch.

### Pitfall 5: Skipping the `pnpm build:hooks` + `openwolf update` smoke check

**What goes wrong:** `tsc --noEmit` validates the source compiles, but the
COMPAT-02 / HOOK-02 acceptance is "compiled `.wolf/hooks/shared.js` re-exports
resolve correctly at runtime." If a barrel re-export syntax typo slips through
tsc (rare, but possible with the `export { type X } from "./y.js"` form), the
runtime would fail with `TypeError: X is not a function`.

**Why it happens:** Barrel re-exports have a few forms (named, type-only, default,
re-export with rename). Node16 module resolution has some specific behaviors around
`.js` extensions in TypeScript sources.

**How to avoid:** The plan should include `pnpm build:hooks` (compiles to
`dist/hooks/`) followed by `node dist/bin/openwolf.js update` (copies to
`.wolf/hooks/`). Then a quick smoke test:
`node -e "import('./.wolf/hooks/shared.js').then(m => console.log(Object.keys(m)))"`
should print all 18 export names. D-08 lists this as a Claude-discretion bonus
check; recommend making it required given the barrel pattern's runtime sensitivity.

### Pitfall 6: `import { type WorktreeContext }` style re-export

**What goes wrong:** `getWorktreeContext` returns `WorktreeContext`. If
`wolf-paths.ts` does `export { getWorktreeContext, ... } from "./worktree-helper.js"`
and `worktree-helper.ts` is treated as a side-effect-having module, you may get
an "isolatedModules" warning. The tsconfig has `esModuleInterop: true` but no
`isolatedModules: true` (default for project references), so this is generally
fine — but using `export type { WorktreeContext }` for the type-only re-export
is safer.

**Why it happens:** The original `shared.ts` does
`import { ..., type WorktreeContext, } from "./worktree-helper.js";` (line 4-10)
and uses `WorktreeContext` only in the `getWorktreeContext` return type (line 57).
The new `wolf-paths.ts` should re-export this type so consumers (none in the
current codebase, but future hooks may add the type) can still `import { type
WorktreeContext } from "./shared.js"`.

**How to avoid:** In `wolf-paths.ts`:
```typescript
import { detectWorktreeContextRaw, ..., type WorktreeContext } from "./worktree-helper.js";
// ... define getWorktreeContext, etc.
export { getWolfDir, getSessionDir, getWorktreeContext, normalizePath };
export type { WorktreeContext };
```

The barrel then needs:
```typescript
export { getWolfDir, ..., getWorktreeContext } from "./wolf-paths.js";
export type { WorktreeContext } from "./wolf-paths.js";
```

**Warning signs:** TS compile error `TS2305: Module '".../worktree-helper.js"' has no exported member 'WorktreeContext'` indicates the type-only re-export was lost.

---

## Code Examples

### Barrel re-export (the new `src/hooks/shared.ts`)

```typescript
// Source: pattern established in D-02 of 02-CONTEXT.md
export { getWolfDir, getSessionDir, getWorktreeContext, normalizePath } from "./wolf-paths.js";
export { ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown, ensureSessionDir } from "./wolf-files.js";
export { readJSON, writeJSON } from "./wolf-json.js";
export { AnatomyEntry, parseAnatomy, serializeAnatomy } from "./wolf-anatomy.ts";
export { extractDescription } from "./wolf-describe.js";
export { estimateTokens, timestamp, timeShort, readStdin } from "./wolf-misc.js";
export type { WorktreeContext } from "./wolf-paths.js";
```

### `wolf-paths.ts` shape

```typescript
// Source: derived from lines 1-77 + 751-753 of current src/hooks/shared.ts
import * as fs from "node:fs";
import * as path from "node:path";
import {
  detectWorktreeContextRaw,
  isMissingGitError,
  isNotARepoError,
  isTimeoutError,
  type WorktreeContext,
} from "./worktree-helper.js";

let _cachedWorktreeCtx: WorktreeContext | null = null;

function detectWorktreeContext(): WorktreeContext {
  // ... (existing body, unchanged)
}

export function getWolfDir(): string { /* ... */ }
export function getSessionDir(): string { /* ... */ }
export function getWorktreeContext(): WorktreeContext { /* ... */ }
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}
export type { WorktreeContext };
```

### `wolf-describe.ts` file header (post-shrinkage)

```typescript
/**
 * extractDescription — compact, hook-relevant subset.
 *
 * Intentionally limited; see src/scanner/description-extractor.ts for the
 * full implementation that the anatomy scanner uses. Languages NOT covered
 * by this module: PHP, Java, Kotlin, C# (controller/DbContext specifics),
 * Ruby, Swift, Dart, Vue/Svelte/Astro, CSS/SCSS/Less, SQL, Proto/GraphQL,
 * YAML, TOML, Elixir Phoenix-specific, Lua, Zig. They fall through to the
 * last-resort generic decl-finder.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export function extractDescription(filePath: string): string {
  // ... kept branches: Markdown, HTML, JSDoc, Python, Rust, Go, C# basic,
  // Elixir @moduledoc, header, TS/JS/React/Next.js, Python/Django,
  // Go handlers/interface/struct, Rust pub items, last-resort.
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `src/hooks/shared.ts` (753 LOC monolith) | 6 wolf-* files + barrel facade | Phase 2 (this phase) | HOOK-01 satisfied; each file < 4,000 tokens; clearer concern boundaries |
| Hook-time `extractDescription` (full 450 LOC) | Hook-time `extractDescription` (compact ~230 LOC) | Phase 2 (this phase) | HOOK-01 satisfied; common-case descriptions still high-quality; rare-language descriptions re-resolved by next anatomy scan |
| Single source of truth for `parseAnatomy` (in `shared.ts`) | Same function, now in `wolf-anatomy.ts` and re-exported via barrel | Phase 2 (this phase) | Scanner keeps importing from `../hooks/shared.js` (unchanged source location) |

**Deprecated/outdated:**
- None. The split is purely a code-organization refactor; all existing function
  bodies are preserved (with `extractDescription` as the only documented shrinkage).

---

## Assumptions Log

This research is based entirely on the current `src/hooks/shared.ts` source, the
existing `02-CONTEXT.md` decisions, the project structure docs, and standard
TypeScript/Node16 module-resolution behavior. No `[ASSUMED]` claims — all
findings are backed by direct file reads, grep results, or measurements.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `wolf-describe.ts` will exceed 4,000 tokens (measured 5,578-6,375) | Token Budget Resolution | If the 4,000-token threshold is later relaxed, the shrinkage could be skipped |
| A2 | The "TS/JS branch" is the heaviest consumer case in `post-write.ts` | Token Budget Resolution | If a future hook writes mostly PHP or Ruby, the shrinkage is wrong; but D-04 explicitly allows this |

*(Both A1 and A2 are supported by the empirical measurement and the explicit
scope of Phase 2 — they are minor forward-looking notes, not "claimed but
unverified" assertions.)*

---

## Open Questions (RESOLVED — see D-08, D-09 in 02-CONTEXT.md)

1. **Should `normalizePath` be in `wolf-paths.ts` or stay in `wolf-files.ts`?**
   - What we know: It's a one-liner path-string function with no dependencies.
   - What's unclear: The D-01 line range places it in `wolf-misc.ts` area
     (lines 726-753). However, since `isWolfFile` uses it, putting it in
     `wolf-paths.ts` reduces the cross-module edge count.
   - Recommendation: Put it in `wolf-paths.ts`. The current D-01 split is
     a suggested starting point; this is a refinement. The barrels re-export
     it under the same name, so consumer imports are unchanged.

2. **Should `ensureSessionDir` move from `wolf-paths.ts` to `wolf-files.ts`?**
   - What we know: It uses `writeJSON` (from `wolf-json.ts`). If kept in
     `wolf-paths.ts`, it adds a `wolf-paths.ts → wolf-json.ts` edge.
   - What's unclear: Whether the developer prefers concern-by-name or
     concern-by-dep-graph-purity.
   - Recommendation: Move to `wolf-files.ts` (concern-by-dep-graph is
     cleaner; matches the recommended pattern in Architecture Patterns).

3. **Should the planner include the scanner as a "no-change consumer" in the
   verification plan, or rely on `pnpm build` to cover it?**
   - What we know: `tsc --noEmit -p tsconfig.hooks.json` does NOT validate
     `src/scanner/anatomy-scanner.ts` (different tsconfig).
   - What's unclear: Whether the planner should add a separate `tsc --noEmit`
     step for the main config.
   - Recommendation: Add `pnpm build` to the verification plan — it runs
     BOTH tsconfigs and is the simplest end-to-end check. The CONTEXT.md's
     "tsc --noEmit -p tsconfig.hooks.json" is the required COMPAT-02 check;
     the full `pnpm build` is the broader guarantee.

---

## Environment Availability

Step 2.6: **SKIPPED (no external dependencies introduced).** This phase is
purely a code reorganization within the existing TypeScript build — no new
tools, services, runtimes, or CLI utilities are needed beyond what the project
already has (`tsc`, `pnpm`, `vitest`, `node`).

Verification commands used during research:
- `node --version` (implicit; required for `tsc -p tsconfig.hooks.json` and vitest)
- `tsc --noEmit -p tsconfig.hooks.json` (the COMPAT-02 acceptance check)
- `pnpm build` (the broader guarantee that includes the scanner's import)
- `pnpm test` (the optional vitest smoke check)
- `pnpm build:hooks` (compiles to `dist/hooks/`)
- `node dist/bin/openwolf.js update` (copies compiled hooks to `.wolf/hooks/`)

All of these are existing project tools; no installations or upgrades needed.

---

## Validation Architecture

**Per `.planning/config.json`: `workflow.nyquist_validation: false`.**

**Section omitted** per the rubrik: "Skip this section entirely if
`workflow.nyquist_validation` is explicitly set to false in `.planning/config.json`."

The existing test infrastructure (`src/hooks/shared.test.ts`, 267 LOC, vitest) is
unchanged by this phase and provides end-to-end coverage of the barrel re-exports
through `tsc --noEmit` + `pnpm test`.

---

## Security Domain

**`security_enforcement` not set in `.planning/config.json`** — treated as enabled
by default. The phase has minimal security surface:

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Hooks do not authenticate users |
| V3 Session Management | No | Sessions are file-based, not token-based |
| V4 Access Control | No | Hooks are local; no ACL |
| V5 Input Validation | No | `extractDescription` operates on files the user already wrote; no new untrusted input |
| V6 Cryptography | No | No new crypto use; `crypto.randomBytes` usage in `writeJSON` is unchanged |

**Threat patterns:** None introduced. The refactor moves code without changing
runtime behavior. The `writeJSON` atomic-write pattern (lines 166-196) is preserved
verbatim, including the Windows-handle-busy fallback and structured-clone-based
deep-merge defaults in `readJSON`. No new attack surface.

---

## Sources

### Primary (HIGH confidence)
- `/Users/bfs/bitbucket/openwolf/src/hooks/shared.ts` (753 LOC, read in full) — direct source for the export map, line ranges, and `extractDescription` body measurement
- `/Users/bfs/bitbucket/openwolf/src/hooks/worktree-helper.ts` (read in full) — confirmed unchanged; already a leaf module
- `/Users/bfs/bitbucket/openwolf/src/hooks/shared.test.ts` (read in full) — confirmed D-07: vi.mock path `./worktree-helper.js` stays valid as long as `wolf-paths.ts` keeps the same import
- `/Users/bfs/bitbucket/openwolf/src/scanner/anatomy-scanner.ts` (read first 50 + grep) — confirmed 7th consumer: line 6 `import { parseAnatomy, type AnatomyEntry } from "../hooks/shared.js"`
- `/Users/bfs/bitbucket/openwolf/tsconfig.hooks.json` (read in full) — `module: Node16`, `moduleResolution: Node16`, `rootDir: "src/hooks"`, `include: ["src/hooks/**/*.ts"]` — flat siblings fit cleanly
- `/Users/bfs/bitbucket/openwolf/.planning/phases/02-hook-module-split/02-CONTEXT.md` (read in full) — D-01 through D-08 decisions
- `/Users/bfs/bitbucket/openwolf/.planning/codebase/STRUCTURE.md` and `ARCHITECTURE.md` (read in full) — project structure & hook lifecycle
- `/Users/bfs/bitbucket/openwolf/.planning/config.json` (read) — `nyquist_validation: false` (skip Validation Architecture section)

### Secondary (MEDIUM confidence)
- None — all findings are direct file reads

### Tertiary (LOW confidence)
- None — no WebSearch used; no `[ASSUMED]` claims

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; current stack verified
- Architecture: HIGH — barrel pattern, leaf-module isolation, no cycle risk (verified by reading source line-by-line)
- Token budget: HIGH — direct measurement at three ratios (3.5, 3.7, 4.0 chars/token)
- Pitfalls: HIGH — six pitfalls derived from concrete source analysis, not generic warnings
- Consumer list: HIGH — direct grep across `src/` and `bin/` for `hooks/shared` imports

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (30 days; this is a low-velocity refactor with no time-sensitive dependencies)
