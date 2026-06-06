# Codebase Concerns

**Analysis Date:** 2025-05-14

## Tech Debt

**Monolithic Core Modules:**
- Issue: Several core modules have grown large, reducing maintainability and increasing cognitive load.
- Files: 
  - `src/hooks/post-write.ts` (587 lines)
  - `src/daemon/wolf-daemon.ts` (495 lines)
  - `src/cli/update.ts` (449 lines)
- Impact: Difficulty in debugging and implementing new features without side effects.
- Fix approach: Refactor these files into smaller, domain-specific modules based on the functionality they provide (e.g., separating `post-write` logic into dedicated handlers).

## Fragile Areas

**Error Handling in DesignQC:**
- Files: `src/designqc/designqc-capture.ts`
- Why fragile: Multiple instances of `return null` for error conditions (e.g., file not found, failed capture) swallow errors, making it difficult to debug why design screenshots are missing or incomplete.
- Safe modification: Replace `return null` with explicit error throwing or a structured error result type that the caller can handle appropriately.
- Test coverage: Review and enhance unit tests for `src/designqc/designqc-capture.ts` to cover these edge cases.

## Performance Bottlenecks

**Daemon Responsibilities:**
- Problem: `src/daemon/wolf-daemon.ts` is responsible for multiple tasks including file watching and API endpoints, potentially causing performance degradation under high load.
- Files: `src/daemon/wolf-daemon.ts`, `src/daemon/file-watcher.ts`
- Improvement path: Monitor resource usage and consider offloading heavy tasks to separate processes or worker threads if latency becomes an issue.

## Test Coverage Gaps

**Coverage Unknown:**
- What's not tested: While `tests/` directory exists, thorough analysis of test coverage for critical files like `src/hooks/post-write.ts` and `src/daemon/wolf-daemon.ts` has not been performed.
- Risk: Critical path bugs may go unnoticed after refactoring or dependency updates.
- Priority: High - Prioritize adding unit/integration tests for these large, complex files.

---

*Concerns audit: 2025-05-14*
