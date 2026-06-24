---
phase: 07-concurrency-integration-tests
reviewed: 2026-06-24T17:25:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - tests/cli/merge-accumulation.test.ts
  - tests/cli/learnings-integration.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-24T17:25:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the two new test files added in Phase 7: `merge-accumulation.test.ts` (merge accumulation/concurrency guard test) and `learnings-integration.test.ts` (integration enumeration tests). All 7 tests pass. Cross-referencing against the source code (`src/cli/learnings-cmd.ts`), the mock wiring (`wolf-lock.ts`, `wolf-paths.ts`, `fs-safe.ts`) and the vitest runtime model.

No critical/security issues found. Three warnings concern test reliability and mock fidelity. Two info-level items flag dead test infrastructure and a redundant call.

## Warnings

### WR-01: `withFileLock` mock is async but real implementation is synchronous

**File:** `tests/cli/merge-accumulation.test.ts:21`
**Issue:** The mock declares `async (_path: string, fn: () => void) => fn()`, making it return a `Promise<void>`. The real `withFileLock` in `src/hooks/wolf-lock.ts:62` is synchronous: `function withFileLock<T>(filePath: string, fn: () => T): T`. The source code uses `await withFileLock(...)` (line 218 of `learnings-cmd.ts`), which is safe against both sync and async return values. However, this signature mismatch means the test cannot detect a regression where the source drops the `await` keyword — the sync real implementation would still work by accident, but a future async lock implementation would break silently. The mock should match the real signature to catch such drift.
**Fix:**
```typescript
vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn((_path: string, fn: () => void) => fn()),
}));
```

### WR-02: Dynamic `await import()` without `vi.resetModules()` provides false isolation

**File:** `tests/cli/merge-accumulation.test.ts:73,101,113` and `tests/cli/learnings-integration.test.ts:42,63,80,88`
**Issue:** Every `it()` block uses `await import("../../src/cli/learnings-cmd.js")` to obtain the function under test. In vitest, dynamic `import()` returns the **same cached module instance** unless `vi.resetModules()` is called between imports. Since no test calls `vi.resetModules()`, every test receives the identical module reference. The dynamic import pattern suggests per-test module isolation that does not actually happen. Today this is not a correctness bug because `learnings-cmd.ts` has no mutable module-level state. If module-level state (e.g., a cache or counter) were added later, tests could leak state across `it()` blocks with no visible warning.
**Fix:** Either add `vi.resetModules()` in each `beforeEach` to get real isolation, or switch to a top-level static import since the mocks are already hoisted:
```typescript
// Option A: real isolation
beforeEach(() => {
  vi.resetModules();
  // ... existing setup
});

// Option B: acknowledge shared module (simpler, honest)
import { learningsMergeCommand } from "../../src/cli/learnings-cmd.js";
// then use learningsMergeCommand() directly in each test
```

### WR-03: Merge tests do not assert staging-file cleanup after successful merge

**File:** `tests/cli/merge-accumulation.test.ts:57-83` (first test) and `tests/cli/merge-accumulation.test.ts:85-110` (second test)
**Issue:** After `learningsMergeCommand()` succeeds, the source code at `learnings-cmd.ts:264` deletes the staging file (`proposed-learnings.md`) when all entries have been consumed. Neither of the two merge tests asserts that the staging file was removed (or that it was replaced with leftover content when only partial entries are merged). A regression in the cleanup logic — e.g., accidentally leaving stale staging files — would not be caught by these tests.
**Fix:** Add an assertion to the first test after the merge:
```typescript
// After merge, staging files should be cleaned up
expect(fs.existsSync(path.join(sess1, "proposed-learnings.md"))).toBe(false);
expect(fs.existsSync(path.join(sess2, "proposed-learnings.md"))).toBe(false);
```

## Info

### IN-01: `stderrOutput` captured but never asserted — dead test infrastructure

**File:** `tests/cli/merge-accumulation.test.ts:12,44-45`
**Issue:** `stderrOutput` is declared (line 12), reset in `beforeEach` (line 44), and populated by the `process.stderr.write` mock (line 45), but is never referenced in any assertion or read in any test body. This is dead test infrastructure that adds noise to the file.
**Fix:** Either remove the `stderrOutput` array entirely (keep the stderr mock for suppression only), or add assertions that validate expected stderr warnings where appropriate.

### IN-02: Redundant `logSpy.mockClear()` after `vi.clearAllMocks()`

**File:** `tests/cli/merge-accumulation.test.ts:53`
**Issue:** `vi.clearAllMocks()` on line 52 already resets call history for all mocks, including `logSpy`. The explicit `logSpy.mockClear()` on line 53 is a no-op.
**Fix:** Remove the redundant line:
```typescript
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
  // logSpy.mockClear(); — already cleared by vi.clearAllMocks()
  process.stderr.write = originalStderrWrite;
});
```

---

_Reviewed: 2026-06-24T17:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
