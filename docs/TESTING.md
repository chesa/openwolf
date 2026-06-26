<!-- generated-by: gsd-doc-writer -->
# Testing

OpenWolf uses [Vitest](https://vitest.dev/) as its test framework. Tests run in a Node.js environment and exercise both unit and integration surfaces.

---

## Test Framework and Setup

- **Framework:** Vitest `^4.1.5`
- **Environment:** Node.js (`environment: "node"` in `vitest.config.ts`)
- **File pattern:** `tests/**/*.test.ts`

No additional global setup is required beyond installing dependencies.

---

## Running Tests

### Full suite

```bash
pnpm test
```

Runs `vitest run` once and exits.

### Watch mode

```bash
pnpm test:watch
```

Runs `vitest` in watch mode, re-running affected tests on file changes.

### Running a subset

Vitest accepts file or directory patterns as positional arguments:

```bash
# Run only CLI tests
pnpm test tests/cli/

# Run a single file
pnpm test tests/utils/worktree.test.ts

# Run all integration tests
pnpm test tests/**/*.integration.test.ts
```

### Filter by test name

```bash
pnpm test -- -t "detectWorktreeContext"
```

---

## Writing New Tests

### File naming and location

- Name test files `*.test.ts`.
- Place them in `tests/` mirroring the `src/` directory structure:
  - `src/cli/` → `tests/cli/`
  - `src/hooks/` → `tests/hooks/`
  - `src/utils/` → `tests/utils/`

### Common patterns

**Module mocking**

Use `vi.mock()` to replace dependencies with mocks:

```typescript
vi.mock("../../src/utils/worktree.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/utils/worktree.js")>();
  return { ...mod, detectWorktreeContext: vi.fn() };
});
```

**Spying on globals**

Spy on `console` or `process.exit` to assert behavior without side effects:

```typescript
const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("exit");
});
```

**Temporary directories**

Create and clean up temp directories for filesystem tests:

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "openwolf-test-"));
// ... test code ...
rmSync(dir, { recursive: true, force: true });
```

**Fresh module state**

When a module caches internal state, reset modules between tests:

```typescript
async function freshModule() {
  vi.resetModules();
  return import("../../src/hooks/shared.js");
}
```

**Integration tests with real `git`**

Tests that exercise the real `git` binary are guarded with a runtime check and skipped when `git` is unavailable:

```typescript
describe.skipIf(!HAS_GIT)("detectWorktreeContext (integration)", () => {
  // uses real git init, git worktree add, etc.
});
```

### Mocking `node:fs` for CLI tests

When testing CLI commands that interact with the filesystem, mock `node:fs` selectively while preserving the rest of the module:

```typescript
vi.mock("node:fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:fs")>();
  return { ...mod, existsSync: vi.fn() };
});
```

---

## Coverage Requirements

No coverage threshold is configured. The project does not enforce minimum line, branch, function, or statement coverage in CI.

To generate a coverage report manually, install a coverage provider first — `@vitest/coverage-v8` is not included in the project's dependencies — then pass the `--coverage` flag:

```bash
pnpm add -D @vitest/coverage-v8
pnpm test -- --coverage
```

---

## CI Integration

There is no automated test or build CI pipeline at this time.

The only CI workflow is `.github/workflows/docs.yml`, which builds and deploys the VitePress documentation site to GitHub Pages on pushes to `main` that touch `docs/**`.

---

## Test Inventory

| File | Area | Type |
|------|------|------|
| `tests/buglog/bug-tracker.test.ts` | Bug tracker API | Unit |
| `tests/buglog/ndjson-format-drift.test.ts` | NDJSON format compliance | Unit |
| `tests/cli/hook-settings.test.ts` | Hook settings logic | Unit |
| `tests/cli/init.test.ts` | CLI init command | Unit |
| `tests/cli/learnings.test.ts` | Learnings command (unit) | Unit |
| `tests/cli/learnings-accept.test.ts` | Learnings accept / baseline writers | Unit |
| `tests/cli/learnings-check.test.ts` | Learnings check command exit codes | Unit |
| `tests/cli/learnings-integration.test.ts` | Learnings command (integration) | Integration |
| `tests/cli/merge-accumulation.test.ts` | In-process merge accumulation | Unit |
| `tests/cli/migrate-buglog.test.ts` | Buglog migration CLI command | Unit |
| `tests/cli/status.test.ts` | CLI status command | Unit |
| `tests/cli/update.test.ts` | `openwolf update` — portable hook generation & symlink resolution | Unit |
| `tests/e2e-concurrency.test.ts` | Cross-process concurrency | E2E |
| `tests/hooks/buglog-ndjson.test.ts` | NDJSON buglog helpers | Unit |
| `tests/hooks/post-write.test.ts` | Post-write hook | Unit |
| `tests/hooks/session-start.test.ts` | Session-start hook | Unit |
| `tests/hooks/shared.test.ts` | Shared hook utilities | Unit |
| `tests/hooks/stop.test.ts` | Stop hook / ledger finalize | Unit |
| `tests/hooks/wolf-files.test.ts` | Wolf directory creation | Unit |
| `tests/hooks/wolf-json.test.ts` | JSON file locking & updates | Unit |
| `tests/hooks/wolf-lock.test.ts` | File locking mechanism | Unit |
| `tests/security.test.ts` | Security guards | Structural / Unit |
| `tests/utils/paths.test.ts` | Path utilities (`getWolfDir`) | Unit |
| `tests/utils/worktree.test.ts` | Worktree detection (mocked) | Unit |
| `tests/utils/worktree.integration.test.ts` | Worktree detection (real git) | Integration |
