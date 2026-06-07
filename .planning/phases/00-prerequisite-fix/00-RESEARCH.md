# Phase 0: Prerequisite Fix — Research

**Researched:** 2026-06-07
**Domain:** Code cleanup / vestigial constant removal + test migration
**Confidence:** HIGH

## Summary

Phase 0's original scope — fixing the `HOOK_FILES` deployment gap — was **already resolved by Phase 3 (plan 03-01)**. Dynamic hook discovery via `hook-copy.ts` (`copyHookFiles()` using `fs.readdirSync`) now scans the source directory at runtime, copying all `.js` files present. Any new hook module is automatically deployed.

The remaining scope is **vestigial cleanup**: `HOOK_FILES` in `hook-settings.ts:98` still exists as an exported constant but is no longer consumed by any production code. Only `tests/cli/init.test.ts` imports it (two test cases at lines 259–271).

**Key finding:** `HOOK_FILES` was removed by plan 03-01, then **re-added** during UAT because the test at `init.test.ts:259-271` imported it and would fail without it. The constant was retained as a stopgap to keep tests passing. Phase 0's job is to do it properly: remove the constant and rewrite the tests to validate dynamic discovery instead of a static file list.

**Primary recommendation:** Remove `HOOK_FILES` from `src/cli/hook-settings.ts`, rewrite the "hook-file copy list" test block in `init.test.ts` to test `getHookFileNames()` from `hook-copy.ts`, and mark Phase 0 complete.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Remove `HOOK_FILES` from `hook-settings.ts`** — the constant is dead code (only tests import it); removing prevents future drift between the file list and actual compiled modules.
- **D-02: Update test to verify dynamic discovery** — the test should verify that `copyHookFiles()` discovers and copies files dynamically, testing the behavior not the static constant.
- **D-03: Phase 0's original scope is already resolved — proceed with cleanup** — the HOOK_FILES deployment gap was addressed in Phase 3. Complete with a single cleanup plan, then mark Phase 0 complete.

### The Agent's Discretion

1. Whether the test update should verify the complete list of expected hook files from the HOOK_CONFIG registration array, or use a simpler assertion (e.g., verifying `getHookFileNames()` returns non-empty and contains `shared.js`).
2. Whether to add a comment in `hook-settings.ts` documenting the historical purpose of HOOK_FILES for future readers.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HOOK_FILES constant removal | Source code | — | Single constant extraction from `src/cli/hook-settings.ts`; pure code removal |
| Test migration to dynamic discovery | Test suite | — | Rewrite test assertions to call `getHookFileNames()` instead of importing a static array |
| Documentation comment (discretion) | Source code | — | Optional inline comment in `hook-settings.ts` for historical traceability |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >= 20 | Runtime | Project requirement [CITED: STACK.md] |
| TypeScript | (from build) | Language | Project standard [CITED: STACK.md] |
| Vitest | (from build) | Test runner | Project standard [CITED: STACK.md] |
| `node:fs` | built-in | File system operations | Dynamic discovery uses `fs.readdirSync` [VERIFIED: src/cli/hook-copy.ts] |

**No new dependencies.** This phase touches only existing code and removes dead code. No packages to install.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Removing HOOK_FILES entirely | Keeping with deprecation comment | Keeping dead code that drifts from reality; defeats the purpose of cleanup |

## Package Legitimacy Audit

**No external packages are installed or required by this phase.** All changes are source-code only (removing a dead constant, rewriting test assertions). No audit needed.

## Architecture Patterns

### System Architecture Diagram

**This phase has no architecture changes.** It removes a vestigial constant and migrates test coverage from a static list to dynamic discovery. The data flow is unchanged:

```
                         ┌─────────────────┐
                         │  hook-settings.ts │
                         │  (HOOK_CONFIG)    │
                         └────────┬─────────┘
                                  │ NO LONGER exports
                                  │ HOOK_FILES
                                  ▼
┌──────────────┐    ┌──────────────────────┐    ┌────────────────┐
│ init.ts      │───▶│ hook-copy.ts         │───▶│ .wolf/hooks/   │
│ update.ts    │    │ getHookFileNames()   │    │ (all .js files)│
│ status.ts    │    │ copyHookFiles()      │    └────────────────┘
└──────────────┘    └──────────────────────┘
                    ▲
                    │ tests/cli/init.test.ts
                    │ was importing HOOK_FILES
                    │ now tests getHookFileNames()
```

### Recommended Project Structure

**No structural changes.** The files involved are:

```
src/cli/
├── hook-settings.ts    # [MODIFY] Remove HOOK_FILES constant (line 98-114)
├── hook-copy.ts        # No change — already provides getHookFileNames, copyHookFiles
├── init.ts             # No change — already uses hook-copy.ts, not HOOK_FILES
├── update.ts           # No change — already uses hook-copy.ts, not HOOK_FILES
└── status.ts           # No change — already uses dynamic scan

tests/cli/
└── init.test.ts        # [MODIFY] Rewrite "hook-file copy list" block (lines 257-273)
```

### Pattern 1: Dynamic Discovery Over Static Lists
**What:** Replace hardcoded enumerations with filesystem-based discovery at runtime.
**When to use:** Any time a list of files, modules, or resources must stay synchronized with actual files on disk.
**Evidence:** Already implemented in `hook-copy.ts:36-40` — `getHookFileNames()` uses `fs.readdirSync` + `.endsWith(".js")` filter. Phase 3 established this pattern.

### Anti-Patterns to Avoid
- **Re-adding HOOK_FILES as a stopgap for test failures:** The original reason HOOK_FILES persists today. Instead of keeping dead code to satisfy a fragile test, rewrite the test to exercise the behavior directly.
- **Freezing an exact file list in a new test:** If the new test hardcodes all 15 filenames (like the old test did), it recreates the same drift problem. Test the discovery mechanism, not the specific files present today.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N/A | — | — | This phase removes dead code. No new problems to solve. |

## Runtime State Inventory

> Omitted — this phase is a pure code cleanup (constant removal + test update). No rename, refactor, or migration of runtime state.

## Common Pitfalls

### Pitfall 1: Changing the hook registration mechanism unintentionally
**What goes wrong:** A careless removal of HOOK_FILES could also remove the HOOK_SETTINGS export.
**Why it happens:** Both are in the same file (`hook-settings.ts`). The export statements look similar.
**How to avoid:** Remove the `export const HOOK_FILES = [...]` block (lines 98-114) and its JSDoc comment only. Do NOT touch `HOOK_SETTINGS`, `isOpenWolfHook`, `replaceOpenWolfHooks`, or `WOLF_ROOT_SHELL`.
**Warning signs:** Tests for `isOpenWolfHook`, `replaceOpenWolfHooks`, or `HOOK_SETTINGS` break.

### Pitfall 2: New test fails because `dist/hooks/` doesn't exist
**What goes wrong:** If the test calls `getHookFileNames(findHookSourceDir())` and `dist/hooks/` hasn't been built (CI, fresh checkout), the test fails with ENOENT.
**Why it happens:** `findHookSourceDir()` returns null if no candidate directory has `shared.js`.
**How to avoid:** Use a temporary directory with fixture files (following the `mkdtempSync` + `rmSync` pattern from `hook-settings.test.ts`). Don't rely on `dist/hooks/` existing.
**Warning signs:** Test passes locally but fails in CI.

### Pitfall 3: Re-adding the exact file list into a new test
**What goes wrong:** The new test hardcodes all 15 hook filenames, recreating the same drift problem that HOOK_FILES had.
**Why it happens:** It's the natural translation of the old test — just swap import source.
**How to avoid:** Test the discovery behavior (returns `.js` files, excludes non-`.js` files, sorts alphabetically) rather than asserting an exact list. A count + contains check is sufficient.

## Code Examples

### Pattern: Removing the HOOK_FILES constant

Source: `src/cli/hook-settings.ts`, lines 98-114

Remove this block entirely:
```typescript
export const HOOK_FILES = [
  "post-read.js",
  "post-write.js",
  "pre-read.js",
  "pre-write.js",
  "session-start.js",
  "shared.js",
  "stop.js",
  "worktree-helper.js",
  "wolf-anatomy.js",
  "wolf-describe.js",
  "wolf-files.js",
  "wolf-json.js",
  "wolf-lock.js",
  "wolf-misc.js",
  "wolf-paths.js",
];
```

Verify that nothing else in the file references `HOOK_FILES` (it doesn't — the constant was standalone).

### Pattern: Replace the HOOK_FILES tests with dynamic discovery tests

Source: `tests/cli/init.test.ts`, lines 257-273

Replace the entire `"hook-file copy list"` describe block. Two approaches at planner discretion:

**Option A (recommended — temp dir with fixtures):**
```typescript
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

describe("hook-file copy list", () => {
  it("discovers all .js files from a source directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "openwolf-hook-copy-"));
    try {
      // Create fixture .js files
      writeFileSync(path.join(dir, "shared.js"), "");
      writeFileSync(path.join(dir, "worktree-helper.js"), "");
      writeFileSync(path.join(dir, "post-read.js"), "");
      writeFileSync(path.join(dir, "post-write.js"), "");
      writeFileSync(path.join(dir, "pre-read.js"), "");
      writeFileSync(path.join(dir, "pre-write.js"), "");
      writeFileSync(path.join(dir, "session-start.js"), "");
      writeFileSync(path.join(dir, "stop.js"), "");
      writeFileSync(path.join(dir, "wolf-anatomy.js"), "");
      writeFileSync(path.join(dir, "wolf-describe.js"), "");
      writeFileSync(path.join(dir, "wolf-files.js"), "");
      writeFileSync(path.join(dir, "wolf-json.js"), "");
      writeFileSync(path.join(dir, "wolf-lock.js"), "");
      writeFileSync(path.join(dir, "wolf-misc.js"), "");
      writeFileSync(path.join(dir, "wolf-paths.js"), "");

      const { getHookFileNames } = await import("../../src/cli/hook-copy.js");
      const files = getHookFileNames(dir);

      expect(files).toContain("shared.js");
      expect(files).toContain("worktree-helper.js");
      expect(files.length).toBeGreaterThanOrEqual(8);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Option B (simpler — count + contains only):**
```typescript
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

describe("hook-file copy list", () => {
  it("discovers all .js files and filters out non-js files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "openwolf-hook-copy-"));
    try {
      writeFileSync(path.join(dir, "shared.js"), "");
      writeFileSync(path.join(dir, "worktree-helper.js"), "");
      writeFileSync(path.join(dir, "not-a-hook.txt"), ""); // should be excluded

      const { getHookFileNames } = await import("../../src/cli/hook-copy.js");
      const files = getHookFileNames(dir);

      expect(files).toContain("shared.js");
      expect(files).toContain("worktree-helper.js");
      expect(files).not.toContain("not-a-hook.txt");
      expect(files.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Recommendation:** Option B — it tests the actual mechanism (`.js` filter, sort, discovery) without freezing an exact file list that will become stale. Adding a test for correct sort order would be a refinement if the planner deems it worthwhile.

### Pattern: Temp directory cleanup (project convention)

From `hook-settings.test.ts:25-74` — the `mkdtempSync` + `rmSync` in `try/finally` pattern is the established test convention for filesystem operations:

```typescript
const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-hook-settings-")));
try {
  // ... test using dir ...
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `HOOK_FILES` array in `hook-settings.ts` | Dynamic `fs.readdirSync` scan in `hook-copy.ts` | Phase 3 (03-01) | All `.js` files in `dist/hooks/` are deployed automatically |
| Tests verify exact file list from `HOOK_FILES` | Tests should verify `getHookFileNames()` behavior | This phase | Tests validate the discovery mechanism, not a static list |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Temp directory test pattern (`mkdtempSync`/`rmSync`) is the correct pattern for hook-copy tests | Code Examples | LOW — pattern already established in `hook-settings.test.ts` |

**No other claims require user confirmation.** All factual claims about source code structure are verified by direct codebase inspection.

## Open Questions

None — all research questions resolved:

1. **Is HOOK_FILES truly dead in production?** Confirmed — `grep HOOK_FILES src/` returns only the declaration in `hook-settings.ts`. No production imports.
2. **What should the test update look like?** Documented two approaches above (Option A: temp dir with full fixture list; Option B: temp dir with minimal behavior test). Planner discretion choice.
3. **Any edge cases or risks in removing the constant?** No — `init.ts`, `update.ts`, `status.ts` already import from `hook-copy.ts` instead. Only `init.test.ts` will break.
4. **Any other cleanup items?** None — this is the sole remaining cleanup from the HOOK_FILES deployment gap.

## Environment Availability

**Step 2.6:** SKIPPED — this phase is pure code cleanup (remove dead constant + update tests). No external dependencies beyond Node.js and Vitest (both verified as project standards).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/cli/init.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A | HOOK_FILES removed from hook-settings.ts | static analysis | `grep -c "export const HOOK_FILES" src/cli/hook-settings.ts` must return 0 | ❓ Wave 0 |
| N/A | HOOK_FILES not imported by any production code | static analysis | `grep -c "HOOK_FILES" src/cli/*.ts` must return 0 | ❓ Wave 0 |
| N/A | getHookFileNames discovers .js files | unit | `npx vitest run tests/cli/init.test.ts` | ✅ exists |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/cli/init.test.ts` (single test file)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] No verification step for "HOOK_FILES not imported by src/cli/*.ts" — planner should add as a verification task or manual check in wave plan

## Security Domain

**Security enforcement disabled by phase type.** This phase removes a dead constant and updates a test. No authentication, input validation, cryptography, or access control changes. No ASVS categories apply.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase read] — `src/cli/hook-settings.ts:98-114` — HOOK_FILES constant declaration
- [VERIFIED: codebase read] — `src/cli/hook-copy.ts:36-40` — `getHookFileNames()` dynamic discovery implementation
- [VERIFIED: codebase read] — `src/cli/init.ts:54-57` — imports from hook-settings.ts without HOOK_FILES
- [VERIFIED: codebase read] — `src/cli/update.ts:58` — imports from hook-copy.ts, not HOOK_FILES
- [VERIFIED: grep across src/] — Only `src/cli/hook-settings.ts` references HOOK_FILES in production code
- [VERIFIED: grep across tests/] — `tests/cli/init.test.ts:259,264` — only tests import HOOK_FILES
- [VERIFIED: codebase read] — `tests/cli/hook-settings.test.ts:25-74` — established `mkdtempSync`/`rmSync` test pattern
- [CITED: .planning/codebase/STACK.md] — Node.js >= 20, pnpm, Vitest
- [CITED: .planning/codebase/CONVENTIONS.md] — named exports, `.js` extension in imports, `node:` prefix

### Secondary (MEDIUM confidence)
- [ASSUMED] — No other modules in the project reference HOOK_FILES (verified only in `src/` and `tests/`; build scripts, config files not exhaustively checked but unlikely to import a TypeScript constant)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by codebase read and project documentation
- Architecture: HIGH — no changes to architecture; straight code removal
- Pitfalls: HIGH — verified through codebase inspection of what went wrong when 03-01 originally removed HOOK_FILES

**Research date:** 2026-06-07
**Valid until:** No expiration — this is cleanup of current state
