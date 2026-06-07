# Testing Patterns

**Analysis Date:** 2026-06-07

## Test Framework

**Runner:**
- **Vitest** v4.1.5 — configured via `vitest.config.ts`
- Config: `tests/**/*.test.ts` (no co-located tests)

**Assertion Library:**
- Vitest built-in `expect` with standard matchers (`toBe`, `toEqual`, `toContain`, `toMatch`, `toHaveLength`, `toBeDefined`, `toBeGreaterThan`, `toThrow`)

**Mocking Library:**
- Vitest built-in `vi` (`vi.mock`, `vi.spyOn`, `vi.fn`, `vi.mocked`, `vi.clearAllMocks`, `vi.restoreAllMocks`, `vi.resetModules`)

**Run Commands:**
```bash
pnpm test                       # vitest run — single run
pnpm test:watch                 # vitest — watch mode
npx vitest --coverage           # Coverage (no threshold configured)
npx vitest run tests/cli/init.test.ts  # Run single test file
```

## Test File Organization

**Location:**
- All test files in a top-level `tests/` directory, mirroring `src/` structure:
  ```
  tests/
  ├── cli/
  │   ├── init.test.ts
  │   ├── status.test.ts
  │   └── hook-settings.test.ts
  ├── hooks/
  │   ├── shared.test.ts
  │   ├── session-start.test.ts
  │   └── stop.test.ts
  ├── utils/
  │   ├── worktree.test.ts
  │   └── worktree.integration.test.ts
  └── security.test.ts
  ```

**Naming Convention:**
- Unit tests: `*.test.ts` (e.g., `init.test.ts`, `shared.test.ts`)
- Integration tests: `*.integration.test.ts` (e.g., `worktree.integration.test.ts`) — kept in separate file to avoid `vi.mock` leaks from unit test files

**No co-located tests** — all tests live under `tests/`, not alongside source files.

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ModuleName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does something specific", () => {
    // Arrange
    // Act
    // Assert
    expect(result).toBe(expected);
  });
});
```

**Section separator pattern** used in larger test files:
```typescript
// ---------------------------------------------------------------------------
// isOpenWolfHook
// ---------------------------------------------------------------------------
describe("isOpenWolfHook", () => { ... });

// ---------------------------------------------------------------------------
// replaceOpenWolfHooks
// ---------------------------------------------------------------------------
describe("replaceOpenWolfHooks", () => { ... });
```

**Setup/Teardown Patterns:**
- `beforeEach` / `afterEach` for per-test state cleanup:
  ```typescript
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-sess-start-")));
    ledgerPath = path.join(dir, "token-ledger.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });
  ```
- `beforeAll` / `afterAll` for suite-level setup:
  ```typescript
  beforeAll(async () => {
    const mod = await import("../../src/hooks/stop.js");
    finalizeSession = mod.finalizeSession;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
  ```

**Key Testing Patterns:**
- Temp directories for filesystem tests via `mkdtempSync` + `realpathSync`:
  ```typescript
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-prefix-")));
  ```
- Always clean up temp dirs in `finally` or `afterEach`/`afterAll`:
  ```typescript
  try { ... } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  ```
- Environment variable management: save, unset, restore in `afterEach`:
  ```typescript
  const orig = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  // ... test ...
  if (orig !== undefined) process.env.CLAUDE_PROJECT_DIR = orig;
  ```

## Mocking

**Framework:** `vi.mock()` — Vitest's built-in hoisted mocking.

**Patterns:**

1. **Module-level mocking with `importOriginal` (preserving un-mocked exports):**
   ```typescript
   vi.mock("../../src/scanner/project-root.js", async (importOriginal) => {
     const mod = await importOriginal<typeof import("../../src/scanner/project-root.js")>();
     return { ...mod, findProjectRoot: vi.fn() };
   });
   ```
   This preserves all exports EXCEPT the one being mocked — prevents mock rot when new exports are added.

2. **Full module replacement (for tightly controlled test doubles):**
   ```typescript
   vi.mock("../../src/hooks/shared.js", async () => {
     return {
       getWolfDir: vi.fn(),
       getSessionDir: vi.fn(),
       readJSON: vi.fn((fp, fallback) => { ... }),
       writeJSON: vi.fn((fp, data) => { ... }),
     };
   });
   ```

3. **`vi.spyOn` for console/stdout/stderr spying:**
   ```typescript
   const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
   const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
   const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
   // ... assertions on spy calls ...
   logSpy.mockRestore();
   ```

4. **`vi.spyOn` for `process.exit` trapping** (hooks exit via `process.exit()`):
   ```typescript
   const exitMock = vi.spyOn(process, "exit");
   exitMock.mockImplementationOnce((code) => {
     throw new Error(`exit:${code}`);
   });
   ```

5. **`vi.mocked()` for type-safe mock access:**
   ```typescript
   vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
   vi.mocked(detectWorktreeContext).mockReturnValue({ ... });
   vi.mocked(execFileSync).mockImplementation((cmd, args) => { ... });
   ```

6. **Local helper factories for complex mock setup:**
   ```typescript
   function mockGitContext(opts: {
     gitDir: string; commonDir: string; branch?: string; branchError?: Error;
   }) {
     vi.mocked(execFileSync).mockImplementation((cmd, args) => {
       if (cmd === "git" && args?.[0] === "rev-parse") {
         return `${opts.gitDir}\n${opts.commonDir}\n`;
       }
       return "";
     });
   }
   ```

7. **`resetModules()` for module-level state:**
   Used when a module has module-level cache/singletons that must be reset between tests:
   ```typescript
   async function freshShared() {
     vi.resetModules();  // reset module-level _cachedWorktreeCtx
     return import("../../src/hooks/shared.js");
   }
   ```

**What to Mock:**
- External processes (`execFileSync` for git operations)
- Filesystem checks (`existsSync`) for path-dependent behavior
- Console output (`console.log`, `console.error`) to assert display output
- Worktree detection return values

**What NOT to Mock:**
- Pure utility functions (tested directly with real implementations)
- Filesystem read/write operations when testing the operation (test against real temp directory):
  ```typescript
  // security.test.ts — tests production code directly
  const result = readJSON(path.join(tmpDir, "partial.json"), { a: 0, b: 2 });
  ```

## Fixtures and Factories

**Test Data:**
- Inline fixtures defined per-test, not in separate files:
  ```typescript
  const session = {
    session_id: "test",
    started: new Date().toISOString(),
    files_read: { "/tmp/f.go": { count: 1, tokens: 100, first_read: "2026-01-01T00:00:00Z" } },
    files_written: [],
    edit_counts: {},
    ...
  };
  ```
- Factory helper functions for complex mock state:
  ```typescript
  function mockGitContext(opts: { ... }) { ... }  // worktree.test.ts
  function setupExitSpy() { ... }                  // init.test.ts
  function makeTmpDir(): string { ... }            // security.test.ts
  ```

**Location:** Fixtures are always defined inline within test files. No separate `fixtures/` or `__fixtures__/` directories.

## Coverage

**Requirements:** No coverage thresholds configured in `vitest.config.ts`. Only line count noted.

**View Coverage:**
```bash
npx vitest --coverage
```
(Requires `@vitest/coverage-v8` or similar — not currently in `devDependencies`.)

## Test Types

**Unit Tests (dominant pattern):**
- Test individual functions and modules in isolation
- Mock external dependencies (network, git, filesystem via `existsSync`)
- Focus on business logic: parsing, merging, context detection, JSON handling
- Examples: `shared.test.ts`, `worktree.test.ts`, `hook-settings.test.ts`, `init.test.ts`, `session-start.test.ts`

**Integration Tests (1 file):**
- Real filesystem, real `git` binary, no module mocks
- Separate file to avoid mock pollution: `worktree.integration.test.ts`
- Uses `describe.skipIf(!HAS_GIT)` to conditionally skip when git is unavailable:
  ```typescript
  const HAS_GIT = (() => {
    try { execFileSync("git", ["--version"], { stdio: "ignore" }); return true; }
    catch { return false; }
  })();
  describe.skipIf(!HAS_GIT)("detectWorktreeContext (integration)", () => { ... });
  ```

**E2E Tests:** Not used.

**Security Tests (1 file):**
- `security.test.ts` tests production code paths with real filesystem ops
- Verifies command injection guards, path traversal, DoS caps, auth token comparison
- Each test explicitly references the production guard it validates:
  ```typescript
  // Reproduces the exact check in CronEngine.runAiTask (src/daemon/cron-engine.ts).
  function isPathAllowed(projectRoot: string, file: string): boolean { ... }
  ```

## Common Patterns

**Async Testing:**
```typescript
it("handles async operations", async () => {
  await expect(initCommand()).rejects.toThrow("exit:0");
  await statusCommand();
});
```
Async tests used when the tested function is `async` (hooks, `initCommand`, `statusCommand`).

**Error Testing:**
```typescript
it("handles missing file gracefully", () => {
  expect(() => safeCopyFile("/nonexistent", "/dest")).toThrow();
  expect(isOpenWolfHook(null)).toBe(false);
  expect(isOpenWolfHook(undefined)).toBe(false);
});
```

**Edge Case Testing:**
- Null/undefined arguments: `isOpenWolfHook(null)`, `isOpenWolfHook(undefined)`
- Empty state: empty objects, empty arrays, empty hooks config
- Missing files: `readJSON` with non-existent path, `readText` with missing file
- Malformed data: bad JSON, truncated files, unexpected types (number, string, empty object)
- Idempotency: calling `replaceOpenWolfHooks` twice produces same result
- Mutability: verifying original object is not mutated

**Process exit pattern** for hook tests:
```typescript
it("exits gracefully", async () => {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit:${code}`);
  });
  await expect(initCommand()).rejects.toThrow("exit:0");
  exitSpy.mockRestore();
});
```

---

*Testing analysis: 2026-06-07*
