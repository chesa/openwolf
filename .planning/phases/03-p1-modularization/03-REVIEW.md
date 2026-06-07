---
phase: 03-p1-modularization
reviewed: 2026-06-07T20:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/scanner/description-extractor.ts
  - src/scanner/extractors/extract-data.ts
  - src/scanner/extractors/extract-scripting.ts
  - src/scanner/extractors/extract-systems.ts
  - src/scanner/extractors/extract-web.ts
  - tests/cli/hook-settings.test.ts
  - tests/cli/init.test.ts
  - tests/cli/status.test.ts
  - tests/hooks/session-start.test.ts
  - tests/hooks/shared.test.ts
  - tests/hooks/stop.test.ts
  - tests/security.test.ts
  - tests/utils/worktree.integration.test.ts
  - tests/utils/worktree.test.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-07T20:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This review covers 5 scanner description-extractor source files and 9 test files. The scanner extractors are well-structured heuristic description generators with acceptable heuristic trade-offs for a description tool. The test files reveal a **CRITICAL** test isolation issue in `session-start.test.ts` where module-level `main()` execution during import can write to the real project `.wolf/` directory. Several WARNING-level issues were also found, including regex gaps in the extractors and mock patterns that could enable subtle test pollution.

---

## Critical Issues

### CR-01: Module-level `main()` execution during test import can corrupt real project `.wolf/` state

**File:** `tests/hooks/session-start.test.ts:37-58`
**Issue:** `freshSessionStart()` (line 6) deletes `CLAUDE_PROJECT_DIR` then imports `session-start.ts`. The module-level `main().catch(...)` on line 132 of `session-start.ts` executes during import. With `process.exit` mocked (line 26-29), code after `process.exit(0)` continues executing. Since `CLAUDE_PROJECT_DIR` is deleted, `getWolfDir()` falls back to `process.cwd()`, which is the real project root (e.g., `/Users/bfs/bitbucket/openwolf`). If `.wolf/` exists there — which it does in any OpenWolf-initialized project — `main()` will:

1. Write `_session.json` to `.wolf/sessions/`
2. Append to `.wolf/memory.md` with a session header
3. Read and evaluate `.wolf/cerebrum.md` freshness
4. Read `.wolf/buglog.json`
5. Increment `total_sessions` in `.wolf/token-ledger.json`

This corrupts the developer's actual project state. The two `it()` blocks at lines 37 and 52 each trigger `freshSessionStart()`, compounding the damage.

**Fix:** Refactor `session-start.ts` so `main()` is NOT called at module level, or guard it behind a check that skips execution when `CLAUDE_PROJECT_DIR` is empty (rather than falling back to `cwd()`). A simpler test-level fix: mock `wolf-paths.ts`'s internal `detectWorktreeContext` to point at the temp dir, or use `OPENWOLF_METADATA_DIR` env var to redirect writes:

```typescript
// In beforeEach, redirect .wolf/ to the temp dir:
process.env.OPENWOLF_METADATA_DIR = dir;  // absolute path to temp dir
// Restore in afterEach
```

---

## Warnings

### WR-01: `filePath.endsWith(k)` false positive risk

**File:** `src/scanner/description-extractor.ts:134`

**Issue:** The directory-prefixed known-files check uses `filePath.endsWith(k)` which matches any path ending with the same suffix, without enforcing a path separator boundary:

```typescript
const dirKey = Object.keys(KNOWN_FILES).find(k => k.includes("/") && filePath.endsWith(k));
```

A file at `fake.github/workflows/ci.yml` would erroneously match `.github/workflows/ci.yml`. While unlikely in practice, the lack of a path boundary is a correctness gap.

**Fix:** Wrap `k` with `/` boundaries in the check, or match the full path against a regex with path separators:

```typescript
const dirKey = Object.keys(KNOWN_FILES).find(
  k => k.includes("/") && (filePath === k || filePath.endsWith(path.sep + k) || filePath.endsWith("/" + k))
);
```

### WR-02: PHP `implements` not checked for framework type classification

**File:** `src/scanner/extractors/extract-scripting.ts:74-84`

**Issue:** The `types` record (ServiceProvider, ShouldQueue, Notification, etc.) is checked only against `parent` (captured from `extends`). The `implements` clause is captured in `classM[3]` on line 21 but never checked. A PHP class that implements `ShouldQueue` without extending it would not be classified:

```php
class SendWelcomeEmail implements ShouldQueue
{
    // ...
}
```

This class would fall through to the generic handler rather than being classified as "Queued job".

**Fix:** Either export `classM[3]` values or split them and add a second check:

```typescript
const implementsList = (classM?.[3] || "").split(/\s*,\s*/);
for (const [p, label] of Object.entries(types)) {
  if (parent === p || implementsList.includes(p) || basename.endsWith(`${p}.php`)) {
    return `${label}: ${className}`;
  }
}
```

### WR-03: Next.js API route regex misses `const` handler pattern

**File:** `src/scanner/extractors/extract-web.ts:45-47`

**Issue:** The regex only matches `export function GET` style handlers, missing the `export const GET = async () => {}` pattern that is equally common in Next.js App Router route handlers:

```typescript
const methods = [...new Set((content.match(
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g
) || []).map(...)];
```

The `export const` pattern is not matched.

**Fix:** Add an alternation to also match `const` exports:

```typescript
/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)|
 export\s+(?:const|let)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[=:]/g
```

### WR-04: Zustand store heuristic is excessively broad

**File:** `src/scanner/extractors/extract-web.ts:64`

**Issue:** The Zustand store detection uses `content.includes("create(") && content.includes("set(")` which matches any file containing these two common substrings. This produces false positives for files using `document.createElement()`, `Map.set()`, `Set.add()` alongside unrelated `create(` calls, etc.

**Fix:** Add more specific patterns. Look for `create` imported from `zustand`, or at minimum require proximity between the two calls:

```typescript
if (
  content.includes("zustand") &&
  /create\s*\(/.test(content) &&
  /\.set\s*\(/.test(content)
) return "Zustand store";
```

### WR-05: `process.exit` mock in `session-start.test.ts` allows continued execution with side effects

**File:** `tests/hooks/session-start.test.ts:26-29`

**Issue:** The `beforeEach` spies on `process.exit` with a mock that returns `undefined as never`. This allows code after `process.exit(0)` to execute. Combined with the module-level `main()` call during import, this contributes to the CR-01 issue. Additionally, after `ensureWolfDir()` calls `process.exit(0)` (mocked), execution continues through the rest of `main()` — `ensureSessionDir()`, writing session files, checking cerebrum/buglog — none of which is intended during test setup.

**Fix:** Make the `process.exit` mock throw instead of returning normally, which prevents subsequent code from executing:

```typescript
vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
  throw new Error(`exit:${code}`);
});
```

This way, if `main()` is triggered during import, it halts at the first `process.exit(0)` call, which is the intended behavior.

### WR-06: `stop.test.ts` module-level `process.exit` mock persists without restore

**File:** `tests/hooks/stop.test.ts:6`

**Issue:** `vi.spyOn(process, "exit").mockImplementation(() => undefined as never)` is set at module level with no `afterAll(() => vi.restoreAllMocks())` or equivalent cleanup. While vitest normally isolates per-worker, having module-level side-effects that persist through the entire test file is fragile — if the test is ever run with `pool: 'forks'` and `fileParallelism: true`, or if a future vitest version changes isolation guarantees, the mock could leak.

**Fix:** Add an `afterAll` restore or wrap in a `describe`-scoped setup:

```typescript
afterAll(() => {
  vi.restoreAllMocks();
});
```

### WR-07: `shared.test.ts` `renameSync` mock wraps and persists for entire file

**File:** `tests/hooks/shared.test.ts:15-21`

**Issue:** The module-level `vi.mock("node:fs", ...)` wraps `renameSync` in `vi.fn(actual.renameSync)` so individual tests can override it. This mock is active for every test in the file, not just the EBUSY test that needs it. If a test were added after the EBUSY test, it would inherit a potentially dirty `renameSync` mock (if `mockImplementationOnce` left residual state).

**Fix:** Either (a) scope the `renameSync` override to the specific test using `vi.mocked(renameSync).mockImplementation(actual.renameSync)` in a `beforeEach`, or (b) restructure the mock to only wrap `renameSync`:

```typescript
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mockedFs = { ...actual };
  // Only mock renameSync; everything else is real
  mockedFs.renameSync = vi.fn(actual.renameSync);
  return mockedFs;
});
```

### WR-08: `worktree.test.ts` `mockGitContext` uses substring matching on joined args

**File:** `tests/utils/worktree.test.ts:16-27`

**Issue:** The `mockGitContext` helper joins all args into a string and uses `arg.includes("--git-dir") && arg.includes("--git-common-dir")` to match the combined `git rev-parse` call. This has two issues:

1. It would match these flags even if they appeared in separate git calls within the same mocked invocation.
2. If production code ever changes argument ordering or adds new flags, the mock silently returns the "combined" response for unintended arg combinations.

The `.trim().split()` in `worktree-helper.ts:55` handles trailing newlines correctly, so this works in practice, but it's fragile.

**Fix:** Match the specific argument pattern more precisely:

```typescript
if (args?.includes("rev-parse") && args?.includes("--git-dir") && args?.includes("--git-common-dir")) {
```

Or better, match the exact args array:

```typescript
const isCombinedCall = cmd === "git" && 
  args?.length === 3 && 
  args[0] === "rev-parse" && 
  args[1] === "--git-dir" && 
  args[2] === "--git-common-dir";
```

---

## Info

### IN-01: Description length threshold in extractDocblock may skip valid short descriptions

**File:** `src/scanner/description-extractor.ts:193`

**Issue:** The check `line.length > 5` excludes descriptions shorter than 6 characters. Valid descriptions like "API routes", "CLI tool", or "Config" would be skipped. Consider lowering to `> 2` or removing the length check entirely since the upstream caller already enforces a minimum via `extractGenericFallback`.

### IN-02: Ruby method regex has redundant alternation

**File:** `src/scanner/extractors/extract-scripting.ts:192`

**Issue:** The regex `/def\s+(index|show|new|create|edit|update|destroy|search|\w+)/g` lists specific CRUD actions but ends with `\w+` which matches any word character. The explicit list is therefore redundant:

```typescript
/def\s+(index|show|new|create|edit|update|destroy|search|\w+)/g
// The \w+ at the end already matches everything the explicit list covers.
```

**Fix:** Simplify to `/def\s+(\w+)/g` and filter for Rails actions separately if categorization is needed.

### IN-03: `isGenericComment` prefix matching may filter unintended comments

**File:** `src/scanner/description-extractor.ts:261`

**Issue:** The prefix check `l.startsWith("strict")` matches comments like "Strictly confidential: do not modify" just as it matches 'use strict'. Consider using word boundary checks or matching the exact expected prefixes.

### IN-04: `status.test.ts` console spy not restored at module level

**File:** `tests/cli/status.test.ts:8-10`

**Issue:** `consoleSpy.log` is created at module level with `vi.spyOn(console, "log").mockImplementation(() => {})`. No `afterAll` restores it. While vitest isolates per-file by default, this is a best-practice gap.

### IN-05: `security.test.ts` duplicated production guard is intentionally fragile

**File:** `tests/security.test.ts:53-60`

**Issue:** The `isPathAllowed` function is a copy of the production guard in `cron-engine.ts`. The comment acknowledges the drift risk. This is intentional defense-in-depth for security testing, but a future refactor must remember to update both copies. Consider extracting to a shared module instead.

### IN-06: Go struct field count regex is a rough heuristic

**File:** `src/scanner/extractors/extract-systems.ts:18`

**Issue:** `/^\s+\w+\s+\w+/gm` matches any two-token indented line, which includes function signatures, method receivers, and comments — not just struct fields. For a description extractor this is acceptable, but the count may be misleading in files with complex Go code.

---

_Reviewed: 2026-06-07T20:00:00Z_
_Reviewer: gsd-code-reviewer (standard depth)_
_Depth: standard_
