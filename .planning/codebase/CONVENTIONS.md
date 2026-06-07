# Coding Conventions

**Analysis Date:** 2026-06-07

## Languages

**TypeScript** (ES2022 target, Node16 module system) — 100% of backend and frontend code.
- TypeScript v5.7+ via `tsconfig.json` with `strict: true`
- ESM modules throughout (`"type": "module"` in `package.json`)
- React 19 + TSX for the dashboard frontend (`src/dashboard/app/`)

## Naming Patterns

**Files:**
- `kebab-case.ts` for utility modules: `fs-safe.ts`, `token-estimator.ts`, `worktree-helper.ts`
- `kebab-case.tsx` for React components: `EmptyState.tsx`, `TokenBadge.tsx`, `ActivityTimeline.tsx`
- Test files mirror source with `.test.ts` suffix: `shared.test.ts`, `init.test.ts`
- Integration tests use `.integration.test.ts` suffix: `worktree.integration.test.ts`
- Special entry-point files use single-word/dash names: `App.tsx`, `main.tsx`

**Functions:**
- `camelCase` for all function names: `ensureWolfDir`, `readJSON`, `detectWorktreeContext`, `findProjectRoot`
- Private helper functions use `camelCase` too (no underscore prefix convention observed):
  ```typescript
  // src/utils/fs-safe.ts
  function isPlainObject(v: unknown): v is Record<string, unknown> { ... }
  function deepMergeDefaults<T>(defaults: T, loaded: T): T { ... }
  ```
- Factory/constructor functions use `camelCase` (no PascalCase for non-class factories):
  ```typescript
  // src/cli/index.ts
  export function createProgram(): Command { ... }
  ```

**Classes:**
- `PascalCase` for class names:
  ```typescript
  // src/utils/logger.ts
  export class Logger { ... }
  // src/designqc/designqc-engine.ts
  export class DesignQCEngine { ... }
  // src/daemon/cron-engine.ts
  export class CronEngine { ... }
  ```

**Variables and Constants:**
- `camelCase` for variables: `projectRoot`, `wolfDir`, `settingsPath`, `metadataDirEnv`
- `UPPER_SNAKE_CASE` for module-level constants that are truly constant:
  ```typescript
  // src/utils/extensions.ts
  export const CODE_EXTENSIONS = new Set([...]);
  export const PROSE_EXTENSIONS = new Set([...]);
  // src/cli/hook-settings.ts
  export const WOLF_ROOT_SHELL = '...';
  // src/scanner/anatomy-scanner.ts
  const DEFAULT_MAX_FILES = 500;
  const BINARY_EXTENSIONS = new Set([...]);
  const ALWAYS_EXCLUDE_FILES = new Set([...]);
  export const HOOK_SETTINGS = { ... };
  ```
- Configuration arrays/lists use `UPPER_SNAKE_CASE`:
  ```typescript
  // src/cli/init.ts
  const ALWAYS_OVERWRITE = [...];
  const CREATE_IF_MISSING = [...];
  ```

**Types and Interfaces:**
- `PascalCase` for types and interfaces (no `I` prefix convention):
  ```typescript
  export type LogLevel = "debug" | "info" | "warn" | "error";
  export type ContentType = "code" | "prose" | "mixed";
  export type WorktreeId = string & { readonly __brand: "WorktreeId" };
  interface SessionData { ... }
  interface WolfConfig { ... }
  interface BugEntry { ... }
  ```
- Branded types for type safety (`WorktreeId`, `WorktreeContext` discriminated union)

## Code Style

**Formatting:** No Prettier or Biome configuration detected. Style is enforced by convention only:
- 2-space indentation (consistent across all files)
- Semicolons required
- Single quotes preferred for strings: `import { ... } from './shared.js'`
- Trailing commas on multiline objects/arrays
- Template literals over string concatenation: `` `OpenWolf: ${var}` ``

**Linting:** No ESLint or Biome configuration detected. TypeScript compiler (`strict: true`) is the primary quality gate.
- `skipLibCheck: true` — no checking of `.d.ts` files
- `forceConsistentCasingInFileNames: true` — prevents case-sensitivity issues

**TypeScript Features:**
- `strict: true` enabled
- `esModuleInterop: true` for default imports from CJS modules
- Explicit `.js` extensions in all local imports (ESM requirement):
  ```typescript
  import { readJSON, writeJSON } from "../utils/fs-safe.js";
  import type { WorktreeId } from "../../src/hooks/worktree-helper.js";
  ```
- Type-only imports use `import type`:
  ```typescript
  import type { IncomingMessage } from "node:http";
  import type { WorktreeContext } from "../hooks/worktree-helper.js";
  ```
- JSDoc/TSDoc on exported functions with purpose, edge cases, and return values:
  ```typescript
  /**
   * Returns a safe non-worktree fallback for any of:
   *  - non-git directories (status 128)
   *  - git binary missing (ENOENT)
   *  - slow filesystem timeout (SIGTERM / ETIMEDOUT)
   *
   * Other errors are rethrown — they indicate something the caller probably
   * wants to surface (e.g., permission denied on the project directory).
   */
  ```

## Import Organization

**Order:**
1. Node.js built-in modules (single `import * as` pattern):
   ```typescript
   import * as fs from "node:fs";
   import * as path from "node:path";
   import * as crypto from "node:crypto";
   ```
2. Third-party packages:
   ```typescript
   import { Command } from "commander";
   import express from "express";
   import { WebSocketServer, WebSocket } from "ws";
   ```
3. Internal project modules (with `.js` extension):
   ```typescript
   import { findProjectRoot } from "../scanner/project-root.js";
   import { readJSON, writeJSON } from "../utils/fs-safe.js";
   import { ensureDir } from "../utils/paths.js";
   ```

**Path Aliases:** None detected. All imports use relative paths with explicit `.js` extensions.

## Error Handling

**Patterns:**

1. **try/catch with type narrowing via `instanceof` and `as` casts:**
   ```typescript
   try {
     raw = fs.readFileSync(filePath, "utf-8");
   } catch (err) {
     if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
       process.stderr.write(`[openwolf] ...`);
     }
     return fallback;
   }
   ```

2. **Graceful fallback on errors (never crash for recoverable failures):**
   - `readJSON` returns `fallback` silently for missing files
   - `readJSON` logs to stderr and returns `fallback` for malformed JSON
   - `writeJSON` falls back to direct write if atomic rename fails (EBUSY on Windows)
   - `safeCopyFile` falls back silently on chmod EPERM/ENOTSUP
   - `detectWorktreeContext` catches git-related errors, returns safe defaults

3. **`process.exit(0)` as normal control flow in hooks** (hooks run as standalone Node scripts):
   ```typescript
   if (!filePath) { process.exit(0); return; }
   ```

4. **`process.stderr.write` for warnings/errors** (not `console.error` in hooks):
   ```typescript
   process.stderr.write(`OpenWolf pre-read: ${err instanceof Error ? err.message : String(err)}\n`);
   ```

5. **`err instanceof Error` pattern** to safely extract messages:
   ```typescript
   console.warn(`  ⚠ Could not read package.json: ${(err as Error).message}`);
   ```

6. **Custom error type for git execution** with `status`/`code`/`signal`:
   ```typescript
   interface GitExecError extends Error {
     status?: number | null;
     signal?: NodeJS.Signals | null;
     code?: string;
     stderr?: string | Buffer;
   }
   ```
   Error-type predicate functions (`isNotARepoError`, `isMissingGitError`, `isTimeoutError`) instead of string-matching stderr.

## Logging

**Framework:** Custom `Logger` class in `src/utils/logger.ts` with levels: `debug`, `info`, `warn`, `error`.

**Patterns:**
- Constructor takes optional log file path + minimum log level
- Dual-output: writes to console (via `console.log`/`console.error`) and optionally to a file
- Levels filtered at write time using numeric ordering

**In hooks:** No Logger instance available — hooks use `process.stderr.write()` directly.

**In CLI:** Uses `console.log` for output and `console.warn`/`console.error` for diagnostics.

**In daemon:** Uses `Logger` class configured from `config.json`.

## Comments

**When to Comment:**
- JSDoc/TSDoc on every exported function describing purpose, edge cases, and return behavior
- Inline comments for non-obvious logic (platform-specific workarounds, edge case handling)
- Section comments as separator banners (`// -----------`) in tests:
  ```typescript
  // ---------------------------------------------------------------------------
  // isOpenWolfHook
  // ---------------------------------------------------------------------------
  ```

**JSDoc/TSDoc Patterns:**
- `/** ... */` block comments at the top of files explaining module purpose
- `/** */` on class methods and exported functions
- Reference documentation via `@deprecated` tag:
  ```typescript
  /** @deprecated Replaced by .wolf/.gitignore template (D-04). */
  ```

**Design Decisions Documented:**
- Why `HTML/HTM` is excluded from `CODE_EXTENSIONS` (prose ratio more accurate)
- Why `protected `copy_file_range`` is avoided (WSL2 EPERM workaround)
- Why `_managedBy` field exists (empirically observed passthrough behavior)
- Why `stderr` capture is needed in git exec (distinguishes error types)

## Function Design

**Size:** Small, focused functions (5-50 lines typical). Complex operations broken into named helpers.

**Parameters:**
- Functions accept 1-3 parameters
- Options objects used for 3+ related parameters:
  ```typescript
  mockGitContext(opts: { gitDir: string; commonDir: string; branch?: string; branchError?: Error })
  ```
- Default parameters used for optional values:
  ```typescript
  export function readText(filePath: string, fallback: string = ""): string
  ```

**Return Values:**
- Union types for varied success/failure returns:
  ```typescript
  | { isWorktree: false; mainRepoRoot: string; worktreePath: string; branch: string }
  | { isWorktree: true; ... }
  ```
- `void` for functions with side effects (file writes, console output)
- Generic type parameters for reusable utilities:
  ```typescript
  export function readJSON<T = unknown>(filePath: string, fallback: T): T
  ```

## Module Design

**Exports:**
- Named exports only (no `default` exports on backend modules)
- Barrel file pattern via `shared.ts` re-exporting from internal modules:
  ```typescript
  // src/hooks/shared.ts
  export { getWolfDir, getSessionDir, getWorktreeContext, normalizePath } from "./wolf-paths.js";
  export { readJSON, writeJSON } from "./wolf-json.js";
  ```
- React components in dashboard use named exports too (no `export default function`):
  ```typescript
  // Layout.tsx
  export function Layout({ children }: { children: React.ReactNode }) { ... }
  // App.tsx
  export default function App() { ... }  // exception for root App component
  ```

**Barrel Files:**
- `src/hooks/shared.ts` is a barrel re-exporting 18 named values from 6 internal modules
- `src/cli/init.ts` re-exports `HOOK_SETTINGS`, `isOpenWolfHook`, `replaceOpenWolfHooks` from `hook-settings.ts`
- `src/utils/worktree.ts` re-exports `WorktreeContext` type from hooks module

## React / Dashboard Conventions

**Component Structure:**
- Named function components (no `const Component: React.FC`):
  ```typescript
  export function Sidebar({ ... }: { ... }) { ... }
  ```
- Props typed inline as object literal type (no separate interface):
  ```typescript
  export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string })
  ```
- All components in `src/dashboard/app/components/` organized by type: `shared/`, `layout/`, `panels/`

**Styling:** TailwindCSS v4 with CSS variables for theming:
- `className="..."` for layout/structure
- `style={{ color: "var(--text-secondary)" }}` for dynamic theme colors
- No CSS modules or styled-components

**Lazy Loading:**
- `React.lazy()` with `Suspense` for all panel components in `App.tsx`
- Loading skeleton component (`Skeleton`) as Suspense fallback

---

*Convention analysis: 2026-06-07*
