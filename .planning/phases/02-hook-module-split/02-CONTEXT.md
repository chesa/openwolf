# Phase 2: Hook Module Split - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

## Phase Boundary

Split `src/hooks/shared.ts` (753 lines, ~34 KB) into focused concern modules
inside the hook build, while keeping `import { ... } from "./shared.js"` working
for all 6 hook consumers with zero changes.

The phase does NOT split `src/scanner/description-extractor.ts` — that work
belongs to Phase 3 (SCAN-01, SCAN-02). The compact `extractDescription` that
lives in `src/hooks/shared.ts` is a separate (smaller) copy used only by the
`post-write` hook; it stays in the hook subsystem and is split into its own
module here.

**Locked requirements (from REQUIREMENTS.md):**
- HOOK-01 — split into focused modules; each ≤ 4,000 tokens
- HOOK-02 — re-export facade keeps existing hook imports working
- COMPAT-01 — all named exports remain importable from `shared.ts`
- COMPAT-02 — `tsc --noEmit -p tsconfig.hooks.json` passes (no circular imports)

---

## Implementation Decisions

### D-01: Module organization — flat siblings, not a subfolder

Split `src/hooks/shared.ts` into a flat set of new files in `src/hooks/`:

| New file | Source range | Concern | Approx LOC | Approx tokens |
|----------|--------------|---------|------------|---------------|
| `wolf-paths.ts` | lines 1-58, 90-115, 751-753 | Worktree context + path resolution (getWolfDir, getSessionDir, getWorktreeContext, isWolfFile, normalizePath, _cachedWorktreeCtx, detectWorktreeContext) | ~100 | ~1,300 |
| `wolf-files.ts` | lines 60-77, 83-88, 198-217 | File/dir/markdown utilities (ensureWolfDir, ensureSessionDir, readMarkdown, appendMarkdown) | ~60 | ~800 |
| `wolf-json.ts` | lines 117-196 | JSON read/write (isPlainObject, deepMergeDefaults, readJSON, writeJSON) | ~80 | ~1,100 |
| `wolf-anatomy.ts` | lines 219-272 | anatomy.md parse/serialize (AnatomyEntry, parseAnatomy, serializeAnatomy) | ~55 | ~750 |
| `wolf-describe.ts` | lines 274-381, 432-540, 712-724 (PHP/Java/Kotlin/C#/Ruby/Swift/Dart/Vue/Svelte/Astro/CSS/SQL/Proto/GraphQL/YAML/TOML/Elixir/Lua/Zig dropped) | Multi-language description extraction (extractDescription) | ~230 | ~3,000 |
| `wolf-misc.ts` | lines 726-749 | Token/time/stdin helpers (estimateTokens, timestamp, timeShort, readStdin) | ~25 | ~300 |
| `shared.ts` (facade) | full re-exports | Backward-compat barrel | ~25 | ~350 |

**Rationale (recommended default — flat):** Keep all split modules at
`src/hooks/<name>.ts` so the existing `tsconfig.hooks.json` `include`
(`src/hooks/**/*.ts`) and the existing build/copy pipeline (`pnpm build:hooks`
+ `node dist/bin/openwolf.js update`) work without changes. A subfolder like
`src/hooks/shared/` would force updates to `.gitignore`-like assumptions, the
anatomy scanner, and the build output layout. **HOOK-01 token limit concern:**
`wolf-describe.ts` is the only module that may exceed 4,000 tokens. The
planner must verify token count and, if it exceeds 4,000, either (a) shrink
the hook-time description extractor to just the language families hooks
actually emit (most-likely: TS/TSX, JS, MD, JSON, package.json) and add a
note that the canonical full version is `src/scanner/description-extractor.ts`,
or (b) split `wolf-describe.ts` further by language family. **Decision D-04
below locks option (a).**

**Rationale (rejected — subfolder):** A `src/hooks/shared/` subfolder would
group concerns visually but adds nesting with no functional benefit and breaks
the implicit "all hook source files are siblings" convention.

### D-02: Re-export facade in `shared.ts`

`src/hooks/shared.ts` becomes a thin barrel that re-exports every named export
from the new modules:

```typescript
// src/hooks/shared.ts (new contents)
export { getWolfDir, getSessionDir, getWorktreeContext, ensureSessionDir } from "./wolf-paths.js";
export { ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown, normalizePath } from "./wolf-files.js";
export { readJSON, writeJSON } from "./wolf-json.js";
export { AnatomyEntry, parseAnatomy, serializeAnatomy } from "./wolf-anatomy.js";
export { extractDescription } from "./wolf-describe.js";
export { estimateTokens, timestamp, timeShort, readStdin } from "./wolf-misc.js";
```

**Rationale (recommended):** All 6 existing hook consumers
(`session-start.ts`, `pre-read.ts`, `post-read.ts`, `pre-write.ts`,
`post-write.ts`, `stop.ts`) and the compiled `.wolf/hooks/*.js` copies
already import from `./shared.js`. A barrel file preserves every public
named export, satisfies HOOK-02 and COMPAT-01 verbatim, and the only
non-obvious change is that the file becomes ~20 lines instead of 753.

**Rationale (rejected — update consumers to import from new modules):**
Forces 6 hook files + 6 compiled `.wolf/hooks/*.js` files to be updated and
re-deployed. Violates HOOK-02 ("Hook re-exports from shared.ts maintain
backward compatibility... no changes required by consumers") and breaks the
zero-change goal.

### D-03: Re-export facade is the only public API of the hook subsystem

The new modules (`wolf-paths.ts`, `wolf-files.ts`, `wolf-json.ts`,
`wolf-anatomy.ts`, `wolf-describe.ts`, `wolf-misc.ts`) are **internal**. The
facade (`shared.ts`) is the supported public API. New code that wants
`getWolfDir()` still imports from `./shared.js`. This is a barrel-only
re-export — no new public surface area.

### D-04: `extractDescription` in `wolf-describe.ts` is the compact, hook-relevant subset (MANDATORY shrinkage)

The `extractDescription` in `src/hooks/shared.ts` (450 lines) is a smaller
copy of `src/scanner/description-extractor.ts` (1001 lines). The hook-time
version is used by `post-write.ts` to auto-describe files it just wrote.
Files written during a session are overwhelmingly: `.ts`, `.tsx`, `.js`,
`.jsx`, `.md`, `.mdx`, `.json`, `.yaml`, `.yml`.

**Measured token count of the full `extractDescription` body in `src/hooks/shared.ts`:**
5,578 tokens (chars/4.0) — 6,375 tokens (chars/3.5). **Consistently
exceeds the 4,000-token budget (HOOK-01) by every estimator.**
**MANDATORY SHRINKAGE.**

**Drop (in order):**
- Lines 383-431: `// ─── PHP / Laravel ───` block
- Lines 542-555: `// ─── Java / Spring ───` block
- Lines 557-565: `// ─── Kotlin ───` block
- Lines 567-581: `// ─── C# / .NET ───` block
- Lines 583-600: `// ─── Ruby / Rails ───` block
- Lines 602-614: `// ─── Swift ───` block
- Lines 616-624: `// ─── Dart / Flutter ───` block
- Lines 626-636: `// ─── Vue / Svelte / Astro ───` block
- Lines 638-646: `// ─── CSS / SCSS / Less ───` block
- Lines 648-653: `// ─── SQL ───` block
- Lines 655-667: `// ─── Proto / GraphQL ───` block
- Lines 669-683: `// ─── YAML ───` block
- Lines 685-689: `// ─── TOML ───` block
- Lines 691-699: `// ─── Elixir ───` block (the second occurrence at lines 691-699, since the first at 361-365 is kept as part of the Elixir moduledoc detector)
- Lines 701-705: `// ─── Lua ───` block
- Lines 707-711: `// ─── Zig ───` block

**Keep:** Markdown heading, HTML title, JSDoc/PHPDoc/Javadoc, Python
docstring, Rust doc comments, Go package comment, C# XML doc summary,
Elixir `@moduledoc` (the first occurrence), header-comment fallback, the
full TS/JS/React/Next.js branch, Python (Django/FastAPI/Flask/Pydantic/
Celery) branch, Go HTTP handlers + interface/struct/func branch, Rust
struct/trait/enum/fn branch, the "last resort" generic decl-finder.

**Rationale (validated by RESEARCH.md):** The shrinkage keeps the
language families most likely to be touched by Claude Code's
write/edit operations in a session (TS/TSX, JS, Markdown, JSON, YAML,
Python, Go, Rust). Dropped branches fall through to the "last resort"
generic decl-finder, which still returns a useful description for
uncommon languages. The scanner's full version
(`src/scanner/description-extractor.ts`) remains the source of truth and
is used by `anatomy-scanner.ts` when it next scans the project, so no
information is permanently lost. The header comment of `wolf-describe.ts`
must note "intentionally limited; see `src/scanner/description-extractor.ts`
for the full implementation that the anatomy scanner uses".

**Post-shrinkage target: ~230 lines, ~3,000 tokens — well under the
4,000-token budget.**

### D-05: Internal helper `isPlainObject` and `deepMergeDefaults` stay non-exported in `wolf-json.ts`

`isPlainObject` and `deepMergeDefaults` are private helpers used only by
`readJSON` and `writeJSON` in `wolf-json.ts`. They are NOT re-exported
from `shared.ts` (they are not in the original `shared.ts` exports, so
no consumer imports them). Internal-only.

### D-06: No consumer changes — zero changes to hook files (and the scanner import is preserved by the barrel)

The 6 hook consumer files (`session-start.ts`, `pre-read.ts`, `post-read.ts`,
`pre-write.ts`, `post-write.ts`, `stop.ts`) and `src/scanner/anatomy-scanner.ts`
(line 6: `import { parseAnatomy, type AnatomyEntry } from "../hooks/shared.js";`)
are NOT touched. Neither is `worktree-helper.ts` (already separately
imported by `wolf-paths.ts`). The `.wolf/hooks/*.js` compiled files are
regenerated by `pnpm build:hooks` + `openwolf update` and end up identical
in behavior to the pre-split versions (modulo the barrel in `shared.js`).
**Total: 7 consumers, all preserved by the barrel re-export.**

### D-09: Module placement refinements to keep the dependency graph acyclic

RESEARCH.md identified two placement refinements to D-01 that keep the
internal `wolf-*` import graph as a clean star (no `wolf-*` module imports
from another `wolf-*` module except for two specific edges):

1. **`ensureSessionDir` moves to `wolf-files.ts`** (not `wolf-paths.ts`):
   `ensureSessionDir` calls `writeJSON` (from `wolf-json.ts`) and
   `getSessionDir` (from `wolf-paths.ts`). If `ensureSessionDir` lives in
   `wolf-paths.ts`, then `wolf-paths.ts → wolf-json.ts`, which risks a
   future cycle if `wolf-json.ts` ever needs path utilities. Keeping
   `ensureSessionDir` in `wolf-files.ts` means the only edge is
   `wolf-files.ts → wolf-paths.ts` and `wolf-files.ts → wolf-json.ts`,
   both unidirectional.

2. **`normalizePath` moves to `wolf-paths.ts`** (not `wolf-files.ts`):
   `normalizePath` is a pure path-string utility that is conceptually a
   path concern, not a file-IO concern. It also has zero dependencies
   (no fs, no path, no other module). Living in `wolf-paths.ts` keeps
   the path-concern modules cohesive.

**Resulting internal import graph (acyclic star):**
- `wolf-paths.ts` imports: `node:fs`, `node:path`, `./worktree-helper.js`
- `wolf-files.ts` imports: `node:fs`, `node:path`, `./wolf-paths.js`, `./wolf-json.js`
- `wolf-json.ts` imports: `node:fs`, `node:path`, `node:crypto`
- `wolf-anatomy.ts` imports: (nothing)
- `wolf-describe.ts` imports: `node:fs`, `node:path`
- `wolf-misc.ts` imports: (nothing, except `process` for stdin)
- `shared.ts` (barrel) imports: `./wolf-paths.js`, `./wolf-files.js`, `./wolf-json.js`, `./wolf-anatomy.js`, `./wolf-describe.js`, `./wolf-misc.js`, `./worktree-helper.js`

### D-07: Tests stay consolidated in `shared.test.ts`

`src/hooks/shared.test.ts` (267 lines) tests the public surface of
`shared.ts` (getWolfDir, getSessionDir, ensureSessionDir, getWorktreeContext,
writeJSON). After the split, those tests still import from `./shared.js`
and exercise the barrel — no test files need to be moved, renamed, or
split. The planner may optionally add tiny per-module `*.test.ts` files
alongside the new modules for direct internal coverage, but this is not
required by the requirements and is left to Claude's discretion.

**Rationale:** Per-Phase-3 plan 03-02, all tests consolidate under
`tests/` later. Splitting hook tests now would create churn that's
reverted in Phase 3. Keep `shared.test.ts` as-is; Phase 3 moves it.

### D-08: COMPAT-02 verification — `tsc` MUST pass on BOTH tsconfigs, plus build + smoke checks

`src/scanner/anatomy-scanner.ts:6` imports `parseAnatomy` and `AnatomyEntry`
from `../hooks/shared.js`. The barrel re-export in the new `shared.ts`
preserves the import path, but the **scanner is compiled by
`tsconfig.json` (not `tsconfig.hooks.json`)** — so verification must
include the main build, not just the hooks build.

**Required verification (MUST pass):**
1. `tsc --noEmit -p tsconfig.hooks.json` — covers the 6 hook consumers
   (HOOK-02, COMPAT-02)
2. `tsc --noEmit` — covers the scanner that imports `parseAnatomy` from
   `../hooks/shared.js`
3. `pnpm build:hooks` — confirms the hooks build emits the barrel
   correctly to `dist/hooks/shared.js`
4. `node dist/bin/openwolf.js update` — confirms the barrel copies to
   `.wolf/hooks/shared.js` and is importable from `.wolf/hooks/*.js`

**Optional bonus (Claude's discretion):**
5. `pnpm test` — confirms the existing `shared.test.ts` suite passes
   through the barrel
6. `pnpm build` — full build covers scanner + dashboard
7. Runtime smoke check: trigger a hook on a sample project and confirm
   `parseAnatomy` resolves correctly at runtime (not just compile-time)

### Claude's Discretion

- **Token-budget verification order:** The planner should measure
  `wolf-describe.ts` token count BEFORE locking D-04's shrinkage. If
  the full body fits in 4,000 tokens, do not shrink.
- **Per-module `*.test.ts` files:** Optional; only add if it speeds up
  test debugging. Phase 3 will move tests anyway.
- **Internal naming:** `wolf-*` prefix is a recommended convention to
  visually distinguish the internal modules from the public facade.
  The planner may choose a different prefix if the project already
  uses another convention.

### Folded Todos

None — no pending todos matched this phase (`todo.match-phase 2` returned 0
matches).

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 2 — HOOK-01, HOOK-02, COMPAT-01, COMPAT-02 success criteria (≤4,000 tokens per module, backward compat, no circular imports)
- `.planning/REQUIREMENTS.md` §HOOK-01, §HOOK-02, §COMPAT-01, §COMPAT-02 — exact requirement text
- `.planning/PROJECT.md` Key Decisions — "`shared.ts` split: re-export for backward compat" (already locked)
- `.planning/STATE.md` §Accumulated Context — "Phase 2: shared.ts split uses barrel re-export pattern for backward compat" (already locked)

### Codebase context
- `.planning/codebase/STRUCTURE.md` — `src/hooks/shared.ts` re-export pattern, build pipeline (`pnpm build:hooks` → `dist/hooks/` → copied to `.wolf/hooks/` by `openwolf update`)
- `.planning/codebase/ARCHITECTURE.md` — hook lifecycle, "hooks must re-export via shared.ts if needed" (lines 253, 271, 286)
- `.planning/codebase/STACK.md` — TypeScript config (`tsconfig.hooks.json` with `module: Node16`, `rootDir: src/hooks`)

### Source files (in scope)
- `src/hooks/shared.ts` — current monolithic file (753 lines) to be split
- `src/hooks/worktree-helper.ts` — already separated; re-imported by the new `wolf-paths.ts`
- `src/hooks/shared.test.ts` — current tests, stays unchanged
- `tsconfig.hooks.json` — `include: ["src/hooks/**/*.ts"]`; `rootDir: "src/hooks"` — flat siblings fit cleanly

### Source files (out of scope this phase)
- `src/scanner/description-extractor.ts` — separate, larger version of `extractDescription`; split belongs to Phase 3 (SCAN-01, SCAN-02)
- `src/hooks/post-write.ts` (consumer) — NOT modified; only used to enumerate which `extractDescription` branches are exercised by the hook (per D-04)

### Consumer files (must not be modified)
- `src/hooks/session-start.ts` — imports from `./shared.js`
- `src/hooks/pre-read.ts` — imports from `./shared.js`
- `src/hooks/post-read.ts` — imports from `./shared.js`
- `src/hooks/pre-write.ts` — imports from `./shared.js`
- `src/hooks/post-write.ts` — imports from `./shared.js` (heaviest user)
- `src/hooks/stop.ts` — imports from `./shared.js`
- **`src/scanner/anatomy-scanner.ts` (line 6) — imports `parseAnatomy` and `AnatomyEntry` from `../hooks/shared.js` (NOT modified; barrel preserves the import)**
- `.wolf/hooks/*.js` (compiled) — regenerated by `pnpm build:hooks` + `openwolf update`

### CodeGraph (project has `.codegraph/`)
- Use `codegraph_callers` on each split-out function to verify no
  consumer outside `src/hooks/` depends on the current
  `src/hooks/shared.ts` (none should, but worth a quick check
  during planning).

---

## Existing Code Insights

### Reusable Assets
- `src/hooks/worktree-helper.ts` — already a separate concern (worktree detection). The new `wolf-paths.ts` re-imports from it. No change needed to `worktree-helper.ts`.
- `src/hooks/shared.test.ts` — exercises the public surface (`getWolfDir`, `getSessionDir`, `ensureSessionDir`, `getWorktreeContext`, `writeJSON`). After the split, the tests still pass through the barrel unchanged.
- `tsconfig.hooks.json` — already configured for `src/hooks/**/*.ts`; the new sibling files compile without config changes.

### Established Patterns
- **Barrel re-export:** the `src/hooks/shared.ts` facade is itself an example of a barrel pattern. Mirroring that pattern internally (no changes needed to consumers) is the cleanest fit.
- **One-file-per-concern:** `src/hooks/worktree-helper.ts` already demonstrates this pattern (worktree context is its own file). Extending the same pattern to other concerns follows the existing convention.
- **No `src/utils/` at hook runtime:** hook-compiled files cannot import from `src/utils/`. The new sibling modules are also "hook-runtime" and follow the same self-contained discipline (only `node:fs`, `node:path`, `node:crypto` from Node built-ins, plus the local `./worktree-helper.js`).

### Integration Points
- `src/hooks/post-write.ts` uses the widest surface of `shared.ts` (15 named imports including `extractDescription`, `parseAnatomy`, `serializeAnatomy`, `estimateTokens`, `timeShort`, `readStdin`, `normalizePath`, `isWolfFile`). This file is the most representative consumer for backward-compat verification.
- `src/scanner/anatomy-scanner.ts` (line 6) imports `parseAnatomy` and `AnatomyEntry` from `../hooks/shared.js`. The barrel re-export preserves the import path; the scanner does NOT define its own `parseAnatomy` (despite what earlier drafts of this file claimed). This makes the scanner a 7th consumer of the shared.ts facade.
- `.wolf/hooks/*.js` (compiled) — `pnpm build:hooks` compiles `src/hooks/**/*.ts` to `dist/hooks/`; `openwolf update` copies them to `.wolf/hooks/`. The pipeline is unchanged by the split.

---

## Specific Ideas

- The `extractDescription` in `src/hooks/shared.ts` and the one in
  `src/scanner/description-extractor.ts` are TWO SEPARATE implementations
  with the same name. They diverge (the scanner version is larger and
  covers more languages). **This duplication is out of scope for Phase
  2** — both files are independently maintained, and Phase 3 splits
  the scanner version. The hook version stays as a self-contained,
  compact copy in `wolf-describe.ts`.

- Internal helper modules use the `wolf-` prefix (`wolf-paths`,
  `wolf-files`, `wolf-json`, `wolf-anatomy`, `wolf-describe`,
  `wolf-misc`). This makes the public/private distinction visible at
  a glance: `shared.ts` is the supported public API, `wolf-*.ts` are
  internal.

- If `wolf-describe.ts` exceeds the 4,000-token budget, drop language
  branches in the order PHP → Ruby → Java → C# → Kotlin → Swift →
  Dart → Vue/Svelte/Astro → CSS → SQL → Proto/GraphQL → YAML → TOML →
  Elixir → Lua → Zig. Keep Markdown, HTML, JSDoc, Python, Rust, Go,
  C# summary, Elixir module, and the TS/JS branch — those cover
  ~95% of files written during a Claude Code session.

---

## Deferred Ideas

- **De-duplicating `extractDescription` between `src/hooks/shared.ts`
  and `src/scanner/description-extractor.ts`:** This is a code-quality
  improvement, not a Phase 2 requirement. Belongs in a future
  refactor phase (or could be folded into Phase 3 SCAN-01 if desired,
  but Phase 3 is scoped to splitting the scanner version, not
  unifying the two).
- **Splitting `wolf-describe.ts` further by language family** (e.g.,
  one file per language): only worth doing if even the trimmed
  hook-time `extractDescription` exceeds 4,000 tokens. Defer until
  measured.
- **Adding per-module `*.test.ts` files for the new modules:**
  Optional. Phase 3 (TEST-01, TEST-02) consolidates all tests under
  `tests/`, so any per-module tests added now would be moved in
  Phase 3 anyway. Defer.
- **Renaming the public facade to something more explicit** (e.g.,
  `shared-facade.ts`): the existing name `shared.ts` is what every
  consumer imports. Renaming breaks HOOK-02. Defer indefinitely.

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended
option:

```
[auto] [Module organization] — Q: "flat siblings vs subfolder?" → Selected: "flat siblings in src/hooks/" (recommended: no .gitignore/build changes, matches worktree-helper.ts precedent)
[auto] [Re-export strategy] — Q: "barrel-only vs update consumers?" → Selected: "barrel-only re-export" (recommended: HOOK-02 / COMPAT-01 require zero consumer changes)
[auto] [extractDescription handling] — Q: "full body vs compact subset?" → Selected: "compact subset (MANDATORY: drops PHP/Java/Kotlin/C#/Ruby/Swift/Dart/Vue/Svelte/Astro/CSS/SQL/Proto/GraphQL/YAML/TOML/Lua/Zig branches)" (recommended: HOOK-01 ≤4,000 token constraint; measured 5,578-6,375 tokens pre-shrinkage)
[auto] [Test handling] — Q: "split per-module or keep consolidated?" → Selected: "keep shared.test.ts as-is" (recommended: Phase 3 consolidates tests anyway)
[auto] [Compatibility verification] — Q: "tsc only or tsc + smoke test?" → Selected: "tsc --noEmit -p tsconfig.hooks.json AND tsc --noEmit (scanner) AND pnpm build:hooks AND openwolf update" (recommended: COMPAT-02 + scanner consumer that imports parseAnatomy from ../hooks/shared.js requires main tsconfig)
[auto] [Module placement refinements] — Q: "ensureSessionDir + normalizePath placement?" → Selected: "ensureSessionDir → wolf-files.ts; normalizePath → wolf-paths.ts" (recommended: keeps internal import graph acyclic star)
```

---

## Decisions Index

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | Split into flat sibling files: wolf-paths, wolf-files, wolf-json, wolf-anatomy, wolf-describe, wolf-misc | No config/build changes; matches worktree-helper.ts pattern |
| D-02 | Re-export facade in `shared.ts` (barrel) | HOOK-02 / COMPAT-01 require zero consumer changes |
| D-03 | New modules are internal; `shared.ts` is the only public API | Barrel pattern; no new public surface area |
| D-04 | `extractDescription` in `wolf-describe.ts` is the compact subset (MANDATORY: drops PHP, Java, Kotlin, C#, Ruby, Swift, Dart, Vue/Svelte/Astro, CSS, SQL, Proto/GraphQL, YAML, TOML, second Elixir, Lua, Zig) | HOOK-01 token budget: measured 5,578-6,375 tokens pre-shrinkage; post-shrinkage target ~3,000 tokens |
| D-05 | `isPlainObject` and `deepMergeDefaults` stay non-exported (internal to wolf-json.ts) | No consumer imports them; not part of public API |
| D-06 | Zero changes to 6 hook consumers + 1 scanner consumer (anatomy-scanner.ts:6); barrel preserves the `parseAnatomy` import | HOOK-02 / COMPAT-01 verbatim |
| D-07 | `shared.test.ts` stays as-is (no per-module tests now) | Phase 3 (TEST-01) consolidates tests; splitting now creates churn |
| D-08 | Verification: `tsc --noEmit -p tsconfig.hooks.json` AND `tsc --noEmit` (scanner) AND `pnpm build:hooks` AND `openwolf update` | COMPAT-02 + scanner consumer requires main tsconfig; barrel resolution is a runtime check, not just compile-time |
| D-09 | `ensureSessionDir` → `wolf-files.ts`; `normalizePath` → `wolf-paths.ts`; star-shaped acyclic internal import graph | Avoids future cycle risk; keeps path-concern modules cohesive |

---

*Phase: 2-Hook Module Split*
*Context gathered: 2026-06-01*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
