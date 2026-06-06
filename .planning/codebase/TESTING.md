# Testing Patterns

**Analysis Date: 2025-05-22**

## Test Framework

**Runner:**
- `vitest`
- Config: `vitest.config.ts`

**Assertion Library:**
- Built-in `vitest` assertions (expect).

**Run Commands:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Test File Organization

**Location:**
- Tests are located in a top-level `tests/` directory, mirroring `src/`.

**Naming:**
- Use `*.test.ts` suffix.

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ComponentName", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should do X when Y", () => {
    // Test code
  });
});
```

## Mocking

**Framework:** `vi` (vitest)

**Patterns:**
```typescript
import { vi } from "vitest";
import { execFileSync } from "node:child_process";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, execFileSync: vi.fn() };
});

// Using the mock:
vi.mocked(execFileSync).mockImplementation((...) => { ... });
```

## Test Types

**Unit Tests:**
- Test individual functions/classes by mocking dependencies (`src/utils/`, `src/hooks/`).

**Integration Tests:**
- Tests that cover broader interactions (`tests/utils/worktree.integration.test.ts`).

---

*Testing analysis: 2025-05-22*
