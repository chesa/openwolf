# Phase 10: Hook-Side In-Project Exclusion - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the **in-project anatomy leak** that the R3 `../` guard cannot catch: a developer-excluded (`exclude_patterns`) **or** root-`.gitignore`-ignored *in-project* directory must never enter `anatomy.md` via the post-write hook (`recordAnatomyWrite`). The fix uses a **dependency-free** matcher so the compiled hook bundle imports no `node_modules` package (constraint C2).

**In scope:**
- Create `src/hooks/wolf-ignore.ts` — a self-contained, zero-dep module that **owns** the `exclude_patterns` matcher (`globToRegExp`, `matchesPattern`, `shouldExclude`) **moved out of** `src/scanner/anatomy-scanner.ts`; the scanner re-imports them (single source — no copy drift).
- Add a dep-free **root-`.gitignore`** parser/matcher in `wolf-ignore.ts`.
- Re-export the public surface via `src/hooks/shared.ts`.
- Wire both `exclude_patterns` and `.gitignore` into `recordAnatomyWrite`, **immediately after** the R3 `../` guard (`src/hooks/post-write.ts:33`).
- Exercise the `pnpm build:hooks` → `openwolf update` copy step so the new behavior is live in `.wolf/hooks/`, not inert in `dist/hooks/`.
- Unit + regression tests for the new module and the hook path.

**Out of scope (other phases / explicitly deferred):**
- Removing the scanner's `ignore` npm dependency — **D-18 keeps it** as the authoritative full-scan backstop for edge-case `.gitignore` syntax.
- Nested `.gitignore` files, global gitignore, `core.excludesFile` — root `.gitignore` only (matches scanner scope).
- Full gitignore-spec parity in the hand-rolled matcher (negation, char ranges, escapes) — backstop owns these.
- R4 ignore-list correction (Phase 9), R11 STATUS removal (Phase 11), R7a/R7b/R9 curation (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Module boundary & dependency split (D-18)
- **D10-01:** **Move** (not copy) `globToRegExp`, `matchesPattern`, `shouldExclude` and their supporting constants (`ALWAYS_EXCLUDE_FILES`, the `.env`/`.env.*` guard, and `DEFAULT_EXCLUDE_PATTERNS` if `shouldExclude` depends on it) from `src/scanner/anatomy-scanner.ts` into a new `src/hooks/wolf-ignore.ts`. The scanner **imports them back** — this is what enforces "one shared module, no copy drift" (ROADMAP SC1).
- **D10-02:** `wolf-ignore.ts` is **strictly dependency-free** — no `import … from "ignore"`, no other `node_modules` package. The scanner **keeps** its `ignore` dependency for the CLI/daemon full scan (D-18). The hook/scanner `.gitignore` engine split is **accepted by design**: the hook gets a fast "good-enough" matcher; the full scan stays authoritative.
- **D10-03 (verification gate):** `tsc --noEmit -p tsconfig.hooks.json` must be clean (C2). This is the structural check that proves no `node_modules` import leaked into the hook bundle.

### `.gitignore` matcher — supported subset (fail-closed)
- **D10-04:** The hand-rolled root-`.gitignore` matcher (`parseAndMatchGitignore`) natively supports this subset:
  | Form | Example | Semantics |
  |------|---------|-----------|
  | Comment / blank | `# foo`, `` | skipped |
  | Bare name | `node_modules` | matches that segment at **any** depth |
  | Trailing slash | `node_modules/` | directory + everything under it |
  | Leading slash (anchored) | `/dist` | root-anchored only |
  | Extension / segment glob | `*.log`, `tmp*` | within-segment `*` (reuses `globToRegExp`) |
  | Double-star | `.cache/**` | spans segments |
- **D10-05 (negation deferred, fail-closed):** Negation lines (`!important.log`) are **skipped entirely** (no-op) rather than interpreted. Bias is fail-**closed**: the hook may under-include a re-included file, but it will **never leak**; the authoritative full scan reconciles. Pin this omission with an explicit test so it is deliberate, not a bug.
- **D10-06 (ambiguity rule):** When a pattern is unsupported or ambiguous, **exclude rather than include**. A leak-prevention gate fails toward not-leaking.
- Char ranges (`[abc]`), escapes (`\#`), nested/global gitignore → out of scope; backstop owns them.

### Config access in the hook
- **D10-07:** `recordAnatomyWrite` reads `.wolf/config.json` **fresh via `readFileSync` on every invocation — no caching.** Hooks are short-lived transient processes with no shared memory; the file is sub-KB so the cost is negligible. Read the same keys the scanner reads: `openwolf.anatomy.exclude_patterns` and `openwolf.anatomy.respect_gitignore`.
- **D10-08:** `respect_gitignore` **defaults to `false`**, mirroring the scanner exactly (`anatomy-scanner.ts:287` → `?? false`). Missing key ⇒ `.gitignore` is NOT consulted. `exclude_patterns` falls back to the same `DEFAULT_EXCLUDE_PATTERNS` the scanner uses (`:294`).
- **Signature note for planner:** `recordAnatomyWrite(wolfDir, absolutePath, projectRoot, content)` currently reads no config — it must gain a config read (or a new param) to obtain the patterns + gitignore opt-in.

### Public export surface (`shared.ts`)
- **D10-09:** `shared.ts` re-exports **only** the high-level interface: `shouldExclude(relPath, excludePatterns)`, the new `parseAndMatchGitignore(...)`, and the re-imported structural constants (`ALWAYS_EXCLUDE_FILES`, etc.). Keep `globToRegExp` and `matchesPattern` **private to `wolf-ignore.ts`** — do not pollute the barrel with low-level path-munging internals.

### Path normalization (already half-solved)
- **D10-10:** Feed the matcher the **already-normalized** `relPathLocal = normalizePath(path.relative(projectRoot, absolutePath))` computed at `post-write.ts:32`, **before** the R3 `../` guard. The normalization seam (root-relative + forward-slashed) already exists — no new normalization pass is required. Add a regression test that passes a backslash-style path and asserts `node_modules\` is still caught (guards the Windows code path).

### Ordering & integration
- **D10-11:** Apply exclusion checks in `recordAnatomyWrite` in this order: (1) normalize → (2) R3 `../` out-of-project guard (preserved, unchanged) → (3) read config → (4) `shouldExclude` against `exclude_patterns` → (5) `parseAndMatchGitignore` (only if `respect_gitignore: true`) → (6) record to `anatomy.md` only if all gates pass. R3 out-of-project skip and normal in-project recording must both still work (ROADMAP SC2).

### Claude's Discretion
- Exact `wolf-ignore.ts` internal API shape (single `shouldExcludePath()` aggregator vs. two separate predicates) — planner/researcher to design, honoring D10-09's public surface.
- Whether config is read inside `recordAnatomyWrite` or threaded in as a new parameter from the hook entry point.
- Test file organization (new `tests/hooks/wolf-ignore.test.ts` vs. extending existing files) — but see Code Insights for what already exists.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement & roadmap
- `.planning/REQUIREMENTS.md` §R6 — the requirement text and `*Accept:*` criteria (promote matcher, dep-free gitignore parser, apply after R3 guard).
- `.planning/ROADMAP.md` §"Phase 10" — the 4 success criteria (shared module, leak closed, `tsc` clean, build→update copy step).
- `.planning/STATE.md` §Decisions — D-18 (keep `ignore` dep CLI/daemon-only; zero-dep matcher in the hook).

### Source files (the work surface)
- `src/scanner/anatomy-scanner.ts` — current home of `globToRegExp` (:66), `matchesPattern` (:98), `shouldExclude` (:134), `ALWAYS_EXCLUDE_FILES`, `loadGitignoreMatcher` (:152, the `ignore`-based reference behavior to mirror), config reads (:287 `respect_gitignore`, :294 `exclude_patterns`).
- `src/hooks/post-write.ts` — `recordAnatomyWrite` (:26), R3 `../` guard + normalized `relPathLocal` (:32–33), anatomy update call site (:130–134).
- `src/hooks/shared.ts` — the thin barrel; add the new re-exports here.

### Phase 8 dependency (verified foundation R6 extends)
- `.planning/phases/08-verify-landed-p0-hygiene/08-CONTEXT.md` — R3 `../` guard and R5 exclude semantics verification; R6 injects after the R3 guard Phase 8 confirms.
- `tests/hooks/post-write.test.ts` — existing R3/R5 coverage; extend, don't duplicate.
- `tests/scanner/anatomy-scanner.test.ts` — existing `shouldExclude`/glob unit tests; these move/extend when the matcher relocates.

### Conventions
- `.planning/codebase/TESTING.md` — Vitest, tests under `tests/` mirroring `src/` (no co-located tests); hook tests use `process.exit` trapping + `vi.mock` of `shared.js`.
- `CLAUDE.md` §"Development Gotchas" — hooks can't import `src/utils/` at runtime; `build:hooks` → `openwolf update` copy discipline; version bump policy (new API ≥ minor).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`globToRegExp` / `matchesPattern` / `shouldExclude`** (`anatomy-scanner.ts:66–149`): the exact matcher to relocate. `matchesPattern` already handles bare-name (any depth), `*.ext`, path-prefix, path-glob, `**`, and single-segment glob — most of the D10-04 gitignore subset is already expressible through `globToRegExp`.
- **`loadGitignoreMatcher`** (`anatomy-scanner.ts:152`): the `ignore`-package reference behavior the dep-free parser must approximate (root `.gitignore` only, returns null when disabled/absent).
- **`normalizePath`** (re-exported via `shared.ts` from `wolf-paths.js`): already used at `post-write.ts:32`; gives forward-slashed, root-relative paths to the matcher for free.

### Established Patterns
- **`shared.ts` is a thin barrel** (re-exports only, 18 values + 1 type). The new module follows the existing `wolf-*.ts` naming (`wolf-lock.ts`, `wolf-json.ts`, `wolf-anatomy.ts`) and is re-exported, never imported deep by other hooks.
- **Hooks are dep-free by construction** (compiled via `tsconfig.hooks.json`, run standalone from `.wolf/hooks/`); `shared.ts` is the self-contained utility copy. `wolf-ignore.ts` extends this discipline.
- **Scanner reads config** via `wolfDir/config.json` with `?? DEFAULT` fallbacks — the hook should mirror the same key paths and defaults.

### Integration Points
- `recordAnatomyWrite` in `post-write.ts` — the single injection site, right after the R3 guard at `:33`.
- The scanner (`walkDir`, `:170`) consumes `shouldExclude` + the `ignore` matcher — after relocation it imports `shouldExclude` from the shared module while keeping its own `loadGitignoreMatcher`.
- `pnpm build:hooks` emits to `dist/hooks/`; `node dist/bin/openwolf.js update` copies to `.wolf/hooks/` — both must run for the behavior to be live (ROADMAP SC4).

</code_context>

<specifics>
## Specific Ideas

- Fail-closed is the governing principle for the hand-rolled matcher: ambiguous/unsupported pattern ⇒ exclude. The full scan is the safety net for the inverse (under-exclusion).
- The engine split is deliberate and documented (D-18) — not technical debt. Tests should assert the *intended hook subset*, so any divergence from `ignore` is a known, tested boundary rather than a silent bug.

</specifics>

<deferred>
## Deferred Ideas

- **Full gitignore-spec parity in the hook** (negation re-inclusion, char ranges, escapes, nested/global gitignore) — intentionally left to the scanner's `ignore`-backed full scan (D-18). Not a future phase; a permanent design boundary.
- **Removing the `ignore` dependency entirely** — would require porting full gitignore semantics to dep-free code; explicitly rejected for v1.2 (D-18).

None of the above is scope creep into another phase — they are boundaries of *this* phase, recorded so the planner doesn't try to "complete" the gitignore engine.

</deferred>

---

*Phase: 10-hook-side-in-project-exclusion*
*Context gathered: 2026-06-25*
