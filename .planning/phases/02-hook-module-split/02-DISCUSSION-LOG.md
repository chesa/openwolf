# Phase 2: Hook Module Split - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 2-Hook Module Split
**Areas discussed:** Module organization, Re-export strategy, extractDescription handling, Test handling, Compatibility verification
**Mode:** `--auto` (no user prompts; recommended option auto-selected for each gray area)

---

## Module Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Flat siblings in `src/hooks/` (wolf-paths.ts, wolf-files.ts, wolf-json.ts, wolf-anatomy.ts, wolf-describe.ts, wolf-misc.ts, plus shared.ts barrel) | No build/config changes; matches existing `worktree-helper.ts` precedent | ✓ |
| Subfolder `src/hooks/shared/` | Groups concerns visually; breaks the implicit "all hook source files are siblings" convention; requires .gitignore / build output path updates | |

**User's choice (auto):** Flat siblings in `src/hooks/`
**Notes:** Recommended default. `tsconfig.hooks.json` already includes `src/hooks/**/*.ts`; flat layout avoids touching the build pipeline.

---

## Re-export Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Barrel re-export — `shared.ts` becomes ~20-line facade that re-exports every named export from the new modules | HOOK-02 / COMPAT-01 require zero consumer changes; preserves every public named export | ✓ |
| Update all 6 hook consumers to import from new modules directly | Cleaner long-term, but violates HOOK-02; requires 6 source files + 6 compiled `.wolf/hooks/*.js` files to be updated and re-deployed | |

**User's choice (auto):** Barrel re-export
**Notes:** Recommended default. HOOK-02 explicitly states "Hook re-exports from `shared.ts` maintain backward compatibility with existing hook imports (no changes required by consumers)".

---

## extractDescription Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Compact subset in `wolf-describe.ts` (drop PHP/Ruby/Java/Kotlin/Swift/Dart/Vue/Svelte/Astro/CSS/SQL/Proto/GraphQL/YAML/TOML/Elixir/Lua/Zig branches) IF the full body exceeds 4,000 tokens; otherwise keep the full body | HOOK-01 ≤4,000 token constraint; hook-time extractor is allowed to be a subset of the scanner's full version | ✓ |
| Full 450-line body in `wolf-describe.ts` regardless of token count | Maximizes hook-time language coverage but risks HOOK-01 violation | |
| Extract to a `src/hooks/description/` subfolder with one file per language | Splits `extractDescription` itself; complex; not required by Phase 2 scope | |

**User's choice (auto):** Compact subset if needed, full body otherwise
**Notes:** Recommended default. The hook-time `extractDescription` is a separate, smaller copy of `src/scanner/description-extractor.ts`; the scanner's full version remains the source of truth. The two implementations are intentionally divergent (Phase 3 splits the scanner version; it does not unify them).

---

## Test Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `shared.test.ts` as-is (267 lines, exercises public surface) | No churn; tests still pass through the barrel | ✓ |
| Add per-module `*.test.ts` files for the new modules | Better isolation, but Phase 3 (TEST-01) consolidates all tests under `tests/` anyway — splitting now creates churn that's reverted in Phase 3 | |

**User's choice (auto):** Keep `shared.test.ts` as-is
**Notes:** Recommended default. Phase 3 plan 03-02 is "Consolidate all tests under `tests/` and update `vitest.config.ts` include path". Defer per-module tests.

---

## Compatibility Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Required: `tsc --noEmit -p tsconfig.hooks.json` passes (no circular imports). Optional bonus (Claude's discretion): vitest run + `pnpm build:hooks` + `openwolf update` smoke check. | COMPAT-02 mandates tsc; bonus checks catch barrel-resolution failures and consumer-import regressions | ✓ |
| tsc only | Minimum required by COMPAT-02 | |
| Full smoke test (start daemon, hit WebSocket, etc.) | Beyond Phase 2 scope (daemon is not affected) | |

**User's choice (auto):** tsc required + optional vitest + build:hooks
**Notes:** Recommended default. The bonus checks (vitest, build:hooks) are cheap and catch the failure mode where the barrel compiles but the runtime re-export resolution fails.

---

## Claude's Discretion

- **Token-budget verification order:** Planner measures `wolf-describe.ts`
  token count BEFORE locking D-04's shrinkage. If full body ≤ 4,000 tokens,
  no shrinkage.
- **Per-module `*.test.ts` files:** Optional; only add if it speeds up
  test debugging. Phase 3 moves tests anyway.
- **Internal naming:** `wolf-*` prefix is recommended. Planner may use
  a different convention if the project has an established one.

---

## Deferred Ideas

- **De-duplicating `extractDescription` between `src/hooks/shared.ts`
  and `src/scanner/description-extractor.ts`:** Code-quality
  improvement, not a Phase 2 requirement. Future refactor phase (or
  optionally fold into Phase 3 SCAN-01, though Phase 3 is scoped to
  splitting the scanner version, not unifying the two).
- **Splitting `wolf-describe.ts` further by language family:** Only
  worth doing if even the trimmed hook-time extractor exceeds 4,000
  tokens. Defer until measured.
- **Adding per-module `*.test.ts` files for the new modules:** Phase 3
  consolidates tests; defer.
- **Renaming the public facade to something more explicit:** Would
  break HOOK-02 (every consumer imports from `./shared.js`). Defer
  indefinitely.
