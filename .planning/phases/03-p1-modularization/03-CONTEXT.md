# Phase 3: P1 Modularization - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

## Phase Boundary

Complete remaining modularization work and test consolidation:
1. Extract `description-extractor.ts` per-language handlers into focused modules under `src/scanner/extractors/` (SCAN-01, SCAN-02)
2. Consolidate all tests under `tests/` directory and update `vitest.config.ts` (TEST-01, TEST-02)
3. Document the `worktree-helper.js` hook contract in `docs/hooks.md` (HOOK-03)

The phase operates within the existing OpenWolf architecture — no new subsystems are introduced.

---

## Implementation Decisions

### D-01: Scanner extractor organization — language-family modules

Split `src/scanner/description-extractor.ts` (1001 lines, ~46 KB) into 4 extractor modules under `src/scanner/extractors/`, plus the main file retaining shared infrastructure:

| New file | Languages | Approx LOC | Approx tokens |
|----------|-----------|------------|---------------|
| `extract-web.ts` | TS/JS/Vue/Svelte/Astro/CSS | ~152 | ~1,800–2,000 |
| `extract-systems.ts` | Go/Rust/Java/Kotlin/C#/Swift/Dart/Zig | ~213 | ~2,500–2,800 |
| `extract-scripting.ts` | PHP/Python/Ruby/Elixir/Lua | ~248 | ~2,900–3,300 |
| `extract-data.ts` | SQL/Proto/GraphQL/YAML/TOML | ~72 | ~850–1,000 |

**Main file retains:** `extractDescription` entry point, `KNOWN_FILES` map, `extractDocblock`, `extractHeaderComment`, `extractGenericFallback`, `isGenericComment`, `extractSmart` router (updated to import from new modules).

**Rationale (recommended default — language-family grouping):** Keeps module count manageable (4 extractors + main file), every module well under the 5,000-token budget (SCAN-02), and groups by domain expertise (web frontend, compiled systems, scripting, data/config) for easier maintenance. Individual files per language would create 20+ modules with many under 50 lines — excessive fragmentation.

**Rationale (rejected — individual files per language):** Would produce 20+ modules, many under 50 lines. Harder to navigate and review. No token-budget benefit since even the largest group stays under 5,000 tokens.

**Rationale (rejected — keep all in one file):** Violates SCAN-01 outright. The file is already 1,001 lines and the largest single module in the scanner subsystem.

### D-02: Test consolidation — mirror `src/` structure under `tests/`

Move all `*.test.ts` files from `src/` co-location to `tests/` directory, preserving subsystem organization:

| Source | Destination |
|--------|-------------|
| `src/cli/hook-settings.test.ts` | `tests/cli/hook-settings.test.ts` |
| `src/cli/init.test.ts` | `tests/cli/init.test.ts` |
| `src/cli/status.test.ts` | `tests/cli/status.test.ts` |
| `src/hooks/session-start.test.ts` | `tests/hooks/session-start.test.ts` |
| `src/hooks/shared.test.ts` | `tests/hooks/shared.test.ts` |
| `src/hooks/stop.test.ts` | `tests/hooks/stop.test.ts` |
| `src/utils/worktree.integration.test.ts` | `tests/utils/worktree.integration.test.ts` |
| `src/utils/worktree.test.ts` | `tests/utils/worktree.test.ts` |
| `src/tests/security.test.ts` | `tests/security.test.ts` |

Update `vitest.config.ts` `include` from `src/**/*.test.ts` to `tests/**/*.test.ts`.
Update import paths in every moved test file to resolve correctly from the new location (e.g., `../../src/cli/init` instead of `./init`).

**Rationale (recommended):** Mirrors the `src/` structure under `tests/`, making it easy to locate tests by subsystem. Matches the majority convention in the Node.js ecosystem. The existing `src/tests/security.test.ts` already hints at a top-level `tests/` intent.

**Rationale (rejected — flat tests/ directory):** All 9 files in one directory would be hard to navigate as the project grows. Subsystem folders scale better.

**Rationale (rejected — only move scattered tests):** Would leave a mixed co-located + top-level structure, violating TEST-01 ("all tests consolidated under tests/ directory").

### D-03: Hook contract docs — API reference + usage example

Add a dedicated "Worktree Helper" section to `docs/hooks.md` documenting the `worktree-helper.js` contract:

- **Purpose:** Git worktree detection for session isolation
- **Exports table:** `detectWorktreeContextRaw`, `isNotARepoError`, `isMissingGitError`, `isTimeoutError` with signatures and descriptions
- **Types:** `WorktreeContext`, `WorktreeId` with shape documentation
- **Error handling contract:** When each error type is thrown and how callers should handle them
- **Usage example:** Minimal code snippet showing `detectWorktreeContextRaw` call and error classification

**Rationale (recommended):** `worktree-helper.js` is a shared utility imported by hooks and the CLI. Documenting its contract helps developers understand worktree mode behavior and error handling without reading source.

**Rationale (rejected — minimal signatures only):** Would not explain the error-handling contract, which is the most subtle part of the API (distinguishing "not a repo" from "git missing" from "timeout").

**Rationale (rejected — full algorithm documentation):** Would over-document implementation details that may change. The contract (inputs, outputs, errors) is the stable surface.

### Claude's Discretion

- **Exact import path updates in moved tests:** The planner should verify each test's imports after moving and adjust relative paths. If Vitest alias support is available, consider adding a `@/` alias to simplify imports, but this is optional.
- **Whether to delete empty `src/tests/` directory after moving `security.test.ts`:** Yes, remove the empty directory to avoid confusion.
- **docs/hooks.md section placement:** Append the Worktree Helper section after the existing hook lifecycle sections, before the Session State section.

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 3 — SCAN-01, SCAN-02, TEST-01, TEST-02, HOOK-03 success criteria
- `.planning/REQUIREMENTS.md` §SCAN-01, §SCAN-02, §TEST-01, §TEST-02, §HOOK-03 — exact requirement text
- `.planning/PROJECT.md` Key Decisions — "Test consolidation target is tests/", "Token budget: ≤ 4,000 tokens per hook module, ≤ 5,000 tokens per scanner module"

### Codebase context
- `.planning/codebase/STRUCTURE.md` — `src/scanner/` layout, test file locations, naming conventions
- `.planning/codebase/ARCHITECTURE.md` — scanner/anatomy flow, hook layer, worktree isolation
- `.planning/codebase/STACK.md` — Vitest config, TypeScript strict mode

### Source files (in scope)
- `src/scanner/description-extractor.ts` — current monolithic file (1001 lines) to be split
- `src/scanner/anatomy-scanner.ts` — imports `extractDescription` from `./description-extractor.js`
- `vitest.config.ts` — current include path `src/**/*.test.ts`
- `src/hooks/worktree-helper.ts` — contract to document
- `docs/hooks.md` — existing hook documentation to extend

### Source files (out of scope this phase)
- `src/hooks/shared.ts` and `src/hooks/wolf-*.ts` — split completed in Phase 2
- `src/daemon/wolf-daemon.ts` — auth migration completed in Phase 1
- `src/daemon/cron-engine.ts` — session consolidation completed in Phase 1

### Consumer files (must not break)
- `src/scanner/anatomy-scanner.ts` (line 4: `import { extractDescription } from "./description-extractor.js"`) — must continue working after extraction
- All existing `src/**/*.test.ts` — must pass after moving to `tests/`

---

## Existing Code Insights

### Reusable Assets
- `src/scanner/description-extractor.ts` — `extractSmart` router function already maps extensions to extractors; can be updated to import from new modules
- `src/scanner/anatomy-scanner.ts` — imports `extractDescription` from `./description-extractor.js`; no change needed if main file keeps the entry point
- `vitest.config.ts` — simple config; only `include` path needs updating

### Established Patterns
- **One-file-per-concern:** `src/hooks/worktree-helper.ts` already demonstrates separated concerns. Extending this to scanner extractors follows the same pattern established in Phase 2.
- **Kebab-case filenames:** All scanner files use kebab-case (`anatomy-scanner.ts`, `description-extractor.ts`). New extractor modules follow `extract-{family}.ts`.
- **Barrel re-export:** Not needed here — `description-extractor.ts` is the entry point and new modules are internal implementation details.

### Integration Points
- `src/scanner/anatomy-scanner.ts` → `description-extractor.ts` `extractDescription()` — must remain importable from the same path after split
- `src/hooks/post-write.ts` → `shared.ts` → `extractDescription` (hook-time compact version) — NOT affected by this phase (scanner version is separate)
- Test runner → `vitest.config.ts` `include` — changing from `src/**/*.test.ts` to `tests/**/*.test.ts` must not drop any tests

---

## Specific Ideas

- The `extractSmart` router in `description-extractor.ts` currently has a large `switch` statement. After extraction, it can be simplified to import the family extractors and delegate, or each family module can export a ` Map<ext, handler>` that the main file merges.
- `src/tests/security.test.ts` is the only test not co-located with its source. Moving it to `tests/security.test.ts` aligns it with the new structure.
- `docs/hooks.md` already has a comprehensive hook lifecycle diagram. The Worktree Helper section should fit after the 6 hook descriptions and before the Session State section.

---

## Deferred Ideas

- **De-duplicating `extractDescription` between `src/hooks/wolf-describe.ts` and `src/scanner/description-extractor.ts`:** Still a future refactor. Phase 3 only splits the scanner version; unification is out of scope.
- **Adding `src/scanner/extractors/` tests:** Optional. No requirement mandates extractor-specific tests. The existing scanner tests (if any) should suffice.
- **Converting `docs/hooks.md` to a generated API doc from JSDoc:** Out of scope. Manual documentation is acceptable for this sprint.

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended option:

```
[auto] [Scanner extraction organization] — Q: "Group by language family or individual language?" → Selected: "language-family modules (4 files: extract-web, extract-systems, extract-scripting, extract-data)" (recommended: manageable module count, all under 5,000-token budget)
[auto] [Test consolidation strategy] — Q: "Mirror src structure or flat tests/ directory?" → Selected: "mirror src structure under tests/" (recommended: scales with project growth, matches ecosystem convention)
[auto] [Hook contract docs scope] — Q: "Minimal signatures or API reference + usage example?" → Selected: "API reference + usage example with error handling contract" (recommended: error classification is the subtlest part of the API)
```

---

## Decisions Index

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | Extract language handlers into 4 family modules under `src/scanner/extractors/` | SCAN-02 token budget satisfied; domain grouping aids maintenance |
| D-02 | Move all tests to `tests/` mirroring `src/` structure; update `vitest.config.ts` include | TEST-01 / TEST-02 requirements; common Node.js convention |
| D-03 | Document `worktree-helper.js` in `docs/hooks.md` with API reference + usage example | HOOK-03 requirement; error-handling contract is the key value |

---

*Phase: 3-P1 Modularization*
*Context gathered: 2026-06-01*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
