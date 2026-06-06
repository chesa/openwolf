# Coding Conventions

**Analysis Date: 2025-05-22**

## Naming Patterns

**Files:**
- Use kebab-case for all source and test files: `src/utils/worktree.ts`, `tests/utils/worktree.test.ts`.

**Functions/Variables:**
- Use camelCase for all functions and variables: `detectWorktreeContext`, `logFile`.

**Classes:**
- Use PascalCase for all classes: `Logger`, `WorktreeContext` (as a type).

## Code Style

**Formatting:**
- No automated formatter (prettier/eslint) explicitly detected. Follow consistent indentation and styling found in `src/utils/logger.ts`.

**Import Organization:**
- **Explicit Extensions:** Use `.js` extension for all relative imports, even for `.ts` files: `import { detectWorktreeContext } from "../../src/utils/worktree.js";`.
- **Node Native:** Import node built-ins using the `node:` prefix: `import * as fs from "node:fs";`.

## Error Handling

**Patterns:**
- Use `try-catch` blocks for operations that can fail, especially file system or external command execution.
- Create custom error predicates for expected failure scenarios: `isNotARepoError(err)`, `isMissingGitError(err)`.
- Rethrow unexpected errors.

## Logging

**Framework:**
- Custom `Logger` class defined in `src/utils/logger.ts`.

**Patterns:**
- Instantiate `Logger` with a log file path and log level.
- Log levels: `debug`, `info`, `warn`, `error`.
- Always include timestamps in logs.

## Module Design

**Exports:**
- Use named exports for modules and types.
- Use `export type { ... }` for type exports to ensure clean separation from runtime code.

---

*Convention analysis: 2025-05-22*
