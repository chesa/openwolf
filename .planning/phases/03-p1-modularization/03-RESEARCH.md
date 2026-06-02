# Phase 3: P1 Modularization - Research

**Researched:** 2026-06-02
**Domain:** TypeScript module extraction, test consolidation, documentation
**Confidence:** HIGH

## Summary

Phase 3 completes remaining modularization work: splitting the 1,001-line `description-extractor.ts` into focused language-family modules, consolidating tests to a top-level `tests/` directory, and documenting the worktree-helper contract. All decisions are locked in 03-CONTEXT.md (D-01, D-02, D-03). Implementation is straightforward file operations with no architectural risk.

**Primary recommendation:** Execute D-01 first (extractor split), then D-02 (test move), then D-03 (docs). The extractor split must preserve the `extractDescription` entry point for `anatomy-scanner.ts` compatibility.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Extract language handlers into 4 family modules under `src/scanner/extractors/` (extract-web.ts, extract-systems.ts, extract-scripting.ts, extract-data.ts)
- **D-02:** Move all tests to `tests/` mirroring `src/` structure; update `vitest.config.ts` include
- **D-03:** Document `worktree-helper.js` in `docs/hooks.md` with API reference + usage example

### Claude's Discretion

- Exact import path updates in moved tests (verify each, adjust relative paths)
- Delete empty `src/tests/` after moving security.test.ts
- Append Worktree Helper section to docs/hooks.md after hook lifecycle sections, before Session State

### Deferred Ideas (OUT OF SCOPE)

- De-duplicating `extractDescription` between `src/hooks/wolf-describe.ts` and `src/scanner/description-extractor.ts`
- Adding `src/scanner/extractors/` tests (no requirement mandates)
- Converting docs/hooks.md to generated API doc from JSDoc

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAN-01 | description-extractor.ts per-language handlers extracted into separate modules under src/scanner/extractors/ | D-01 locks extraction into 4 family modules |
| SCAN-02 | Each scanner module ≤ 5,000 tokens after extraction | D-01 analysis shows largest module ~248 LOC / ~2,900–3,300 tokens — well under limit |
| TEST-01 | All tests consolidated under tests/ directory (not src/tests/) | D-02 locks target structure and 9 files to move |
| TEST-02 | vitest.config.ts include path updated to tests/**/*.test.ts | D-02 locks new include pattern; verify all 9 tests pass after move |
| HOOK-03 | docs/hooks.md documents the worktree-helper.js hook contract | D-03 locks section placement and content scope (API reference + usage) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| description-extractor.ts split | API / Backend | — | Scanner module; belongs in src/scanner/, extracted to src/scanner/extractors/ |
| Test consolidation | API / Backend | — | Test file reorganization; no tier change |
| docs/hooks.md extension | CDN / Static | — | Documentation file; no execution tier |

## Standard Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.7 | All source files | Project default |
| Vitest | 4.1.5 | Test runner | Already in use; only include path changes |
| Node.js | >= 20.0.0 | Runtime | Project requirement |

**No new packages are needed for this phase.**

## Package Legitimacy Audit

> No external packages are required for this phase. All work is file reorganization and documentation.

## Architecture Patterns

### System Architecture Diagram

No new architectural components are introduced. The extraction reorganizes existing code within the scanner subsystem:

```
src/scanner/
├── description-extractor.ts    # Entry point (extractDescription, KNOWN_FILES, extractDocblock, extractSmart router)
├── anatomy-scanner.ts           # Imports extractDescription from ./description-extractor.js (UNCHANGED)
└── extractors/                  # NEW directory
    ├── extract-web.ts           # TS/JS/Vue/Svelte/Astro/CSS handlers
    ├── extract-systems.ts       # Go/Rust/Java/Kotlin/C#/Swift/Dart/Zig handlers
    ├── extract-scripting.ts     # PHP/Python/Ruby/Elixir/Lua handlers
    └── extract-data.ts          # SQL/Proto/GraphQL/YAML/TOML handlers
```

### Recommended Project Structure

After Phase 3:

```
tests/                          # NEW consolidated test directory
├── cli/
│   ├── hook-settings.test.ts
│   ├── init.test.ts
│   └── status.test.ts
├── hooks/
│   ├── session-start.test.ts
│   ├── shared.test.ts
│   └── stop.test.ts
├── utils/
│   ├── worktree.integration.test.ts
│   └── worktree.test.ts
└── security.test.ts

src/scanner/
├── description-extractor.ts     # Refactored: entry point + shared infrastructure
├── anatomy-scanner.ts           # Unchanged import path
├── extractors/                  # NEW
│   ├── extract-web.ts
│   ├── extract-systems.ts
│   ├── extract-scripting.ts
│   └── extract-data.ts
└── project-root.ts
```

### Pattern 1: Language-Family Module Extraction

**What:** Split monolithic extractor into focused files by language domain.

**When to use:** Large single file with distinct functional sections that can be grouped by domain expertise.

**Implementation:** Main file retains entry point (`extractDescription`) and shared infrastructure. Each language-family module exports a mapping of extensions to handler functions. Router function delegates to imported modules.

**Example structure:**
```typescript
// extract-web.ts
export function extractWeb(content: string, ext: string, basename: string, filePath: string): string {
  switch (ext) {
    case ".vue": return extractVue(content);
    case ".svelte": return extractSvelte(content, basename);
    // ...
  }
  return "";
}

// description-extractor.ts (updated extractSmart)
import { extractWeb } from "./extractors/extract-web.js";
import { extractSystems } from "./extractors/extract-systems.js";
import { extractScripting } from "./extractors/extract-scripting.js";
import { extractData } from "./extractors/extract-data.js";

function extractSmart(content: string, ext: string, basename: string, filePath: string): string {
  return extractWeb(content, ext, basename, filePath)
    || extractSystems(content, ext, basename, filePath)
    || extractScripting(content, ext, basename, filePath)
    || extractData(content, ext, basename, filePath)
    || "";
}
```

### Anti-Patterns to Avoid

- **Individual files per language:** Would create 20+ modules, many under 50 lines. Hard to navigate. The 4-family grouping stays well under 5,000 tokens per module while maintaining manageability.
- **Flat tests/ directory:** All 9 files in one directory would scale poorly. Subsystem folders (`tests/cli/`, `tests/hooks/`, etc.) mirror `src/` structure.
- **Deleting empty src/tests/ without verification:** Must verify no other files remain in `src/tests/` before removing the directory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test file relocation | Custom script to move and rewrite imports | Manual move with path updates + vitest verification | 9 files only; simple enough to do correctly by hand |
| Extractor module routing | Dynamic require/import | Explicit import + fallback chain | TypeScript strict mode; explicit is safer |
| vitest include path | Glob patterns with negation | Simple `tests/**/*.test.ts` | Unambiguous; covers all moved tests |

**Key insight:** This phase is file reorganization, not new functionality. Custom tooling would cost more time than it saves.

## Common Pitfalls

### Pitfall 1: Import path breakage after extractor split

**What goes wrong:** `anatomy-scanner.ts` imports from `./description-extractor.js`. If the main file's exports change or the file location changes, the scanner breaks.

**Why it happens:** TypeScript resolves `.js` extensions at compile time. If `extractDescription` is removed or moved, `anatomy-scanner.ts` fails to compile.

**How to avoid:**
1. `description-extractor.ts` retains `extractDescription` export at same path (line 122) — no change needed
2. New extractor modules are internal; router delegates via imports
3. Run `tsc --noEmit` after split to verify no circular imports

**Warning signs:** `tsc --noEmit` fails, `anatomy-scanner.ts` shows "cannot find module"

### Pitfall 2: Test import paths broken after move

**What goes wrong:** Moved tests use relative paths like `../../src/cli/init` which may be incorrect from the new `tests/cli/` location.

**Why it happens:** Tests co-located in `src/cli/` used paths like `../utils/worktree`. After move to `tests/cli/`, path becomes `../../src/utils/worktree`.

**How to avoid:** For each moved test file, verify the import path resolves correctly from the new location before marking done. The most common pattern:
- `src/cli/init.test.ts` (co-located): `import { foo } from "./init";` → resolves to `./init.ts`
- `tests/cli/init.test.ts` (moved): `import { foo } from "../../src/cli/init";` → must be updated

**Warning signs:** `vitest run` shows "cannot find module" errors

### Pitfall 3: vitest.config.ts include not updated

**What goes wrong:** Tests moved to `tests/` but `vitest.config.ts` still includes `src/**/*.test.ts`. No tests run.

**Why it happens:** Developer moves files but forgets to update config, or updates config but misses one test file.

**How to avoid:** Update `vitest.config.ts` `include` to `["tests/**/*.test.ts"]` before running tests. Verify all 9 tests are discovered with `vitest run --reporter=verbose`.

**Warning signs:** `vitest run` shows "0 tests found"

### Pitfall 4: Security test at src/tests/ has co-dependency

**What goes wrong:** `src/tests/security.test.ts` may import from files in `src/tests/` directory itself.

**Why it happens:** If security.test.ts imports something else in `src/tests/` (e.g., a shared fixture), moving only security.test.ts would break the import.

**How to avoid:** Before moving, check `src/tests/security.test.ts` imports — only imports from `src/` (verified above), so safe to move independently.

## Code Examples

### Test file move with path updates

```typescript
// BEFORE (src/cli/init.test.ts)
import { init } from "./init";
import { readJsonSync } from "../utils/fs-safe";

// AFTER (tests/cli/init.test.ts)
import { init } from "../../src/cli/init";
import { readJsonSync } from "../../src/utils/fs-safe";
```

### vitest.config.ts update

```typescript
// BEFORE
include: ["src/**/*.test.ts"]

// AFTER
include: ["tests/**/*.test.ts"]
```

### Worktree Helper section in docs/hooks.md

```markdown
## Worktree Helper (`worktree-helper.js`)

**Purpose:** Git worktree detection for session isolation per branch.

### Exports

| Function | Signature | Description |
|----------|-----------|-------------|
| `detectWorktreeContextRaw` | `(dir: string) => WorktreeContext` | Detects whether `dir` is in a git worktree; returns context object |
| `isNotARepoError` | `(err: unknown) => boolean` | Classifies error as "not a git repo" (exit status 128) |
| `isMissingGitError` | `(err: unknown) => boolean` | Classifies error as "git binary not found" (ENOENT) |
| `isTimeoutError` | `(err: unknown) => boolean` | Classifies error as "git command timed out" (SIGTERM/ETIMEDOUT) |

### Types

```typescript
type WorktreeId = string & { readonly __brand: "WorktreeId" };

type WorktreeContext =
  | { isWorktree: false; mainRepoRoot: string; worktreePath: string; branch: string }
  | { isWorktree: true; mainRepoRoot: string; worktreePath: string; worktreeId: WorktreeId; branch: string };
```

### Error Handling Contract

| Error | Condition | Callers Should |
|-------|-----------|----------------|
| Not a repo | `git rev-parse` exits 128 | Use main repo root directly |
| Git missing | `git` binary not found (ENOENT) | Log warning, fall back to single-repo mode |
| Timeout | Command exceeds 2s (SIGTERM) | Log warning, treat as single-repo mode |

### Usage Example

```typescript
import { detectWorktreeContextRaw, isNotARepoError } from "./worktree-helper.js";

try {
  const ctx = detectWorktreeContextRaw(process.cwd());
  if (ctx.isWorktree) {
    console.log(`Worktree: ${ctx.worktreeId} (branch: ${ctx.branch})`);
  } else {
    console.log(`Standard repo at: ${ctx.mainRepoRoot}`);
  }
} catch (err) {
  if (isNotARepoError(err)) {
    // Not a git repo — use current directory as root
    console.log("Not a git repository");
  } else {
    throw err;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tests co-located with source | Tests in top-level `tests/` | Phase 3 | Clearer separation; matches Node.js ecosystem convention |
| Monolithic description-extractor.ts | Language-family modules | Phase 3 | Easier maintenance; better IDE support; token budget compliance |
| No worktree-helper docs | Hook contract documented in hooks.md | Phase 3 | Developers understand worktree mode without reading source |

**Deprecated/outdated:**
- `src/tests/security.test.ts` co-location — moved to `tests/` in Phase 3

## Assumptions Log

> All claims in this research were verified or cited — no user confirmation needed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 4-family extraction stays under 5,000 tokens per module | D-01 analysis (CONTEXT.md) | LOW — based on LOC estimates; actual token count may vary |
| A2 | `src/tests/` contains only security.test.ts | Environment audit | LOW — verified via ls; confirmed 9 test files in src/ with only security.test.ts in src/tests/ |

## Open Questions

1. **Vitest alias consideration**
   - What we know: D-02 notes planner may add `@/` alias to simplify imports
   - What's unclear: Whether adding a vitest alias is worth the configuration complexity for 9 test files
   - Recommendation: Skip alias for Phase 3; manual relative paths are clear enough for this scale

## Environment Availability

> Step 2.6: SKIPPED (no external dependencies identified)

This phase involves only file reorganization and documentation. No external tools, services, or CLIs are required beyond those already used in normal development.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | vitest.config.ts |
| Quick run command | `vitest run` |
| Full suite command | `vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAN-01 | extractors/ modules created with language handlers | Manual | `ls src/scanner/extractors/*.ts \| wc -l` | Pending |
| SCAN-02 | Each module ≤ 5,000 tokens | Manual | `wc -l src/scanner/extractors/*.ts` | Pending |
| TEST-01 | All tests in tests/ directory | Manual | `vitest run --reporter=verbose` | Pending |
| TEST-02 | vitest include updated | Manual | `grep "tests/\*\*" vitest.config.ts` | Pending |
| HOOK-03 | worktree-helper section in docs/hooks.md | Manual | `grep -c "Worktree Helper" docs/hooks.md` | Pending |

### Sampling Rate
- **Per task commit:** `vitest run` (all tests, fast enough for per-task)
- **Per wave merge:** Full suite via CI
- **Phase gate:** All 9 tests green before `/gsd-verify-work`

### Wave 0 Gaps
- `tests/cli/` directory — created during TEST-01 execution
- `tests/hooks/` directory — created during TEST-01 execution
- `tests/utils/` directory — created during TEST-01 execution

*(No framework install needed — Vitest already in package.json)*

## Security Domain

> Required when `security_enforcement` is enabled. Omit only if explicitly `false` in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | — |
| V6 Cryptography | No | — |

This phase is purely file reorganization and documentation. No authentication, session management, access control, input validation, or cryptography is involved.

## Sources

### Primary (HIGH confidence)
- `src/scanner/description-extractor.ts` (1001 lines) — verified line count and structure
- `src/hooks/worktree-helper.ts` — verified exports, types, error handling contract
- `docs/hooks.md` — verified existing structure to determine placement
- `vitest.config.ts` — verified current include pattern

### Secondary (MEDIUM confidence)
- CONTEXT.md D-01 extraction analysis — LOC estimates used for token budget verification

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing tools only
- Architecture: HIGH — file reorganization within existing structure
- Pitfalls: HIGH — verified file locations and current state

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days — stable phase, no fast-moving tech)