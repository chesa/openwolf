# Worktree Fixes Implementation Summary

This document summarizes the three worktree-related bugs that were fixed in OpenWolf.

## Bug 1: Status Crash on Partial Ledger Schema

**Problem:** The `status` command crashed when the token-ledger.json file was missing Lifetime fields (e.g., `total_tokens_estimated`, `estimated_savings_vs_bare_cli`, `total_reads`, `total_writes`).

**Root Cause:** The `session-start` hook only initialized a partial ledger schema with only `total_sessions`, causing subsequent `status` calls to fail when trying to access undefined properties.

**Fix:**
1. Extracted ledger initialization into a testable `initializeSessionLedger()` function in `session-start.ts`
2. Added all missing Lifetime fields to the default ledger schema:
   - `total_reads`
   - `total_writes`
   - `total_tokens_estimated`
   - `anatomy_hits`
   - `anatomy_misses`
   - `repeated_reads_blocked`
   - `estimated_savings_vs_bare_cli`
3. Added defensive fallbacks in `status.ts` using nullish coalescing (`?? 0`) for all Lifetime fields

**Files Changed:**
- `src/hooks/session-start.ts` - Added `initializeSessionLedger()` function with complete schema
- `src/hooks/session-start.test.ts` - New test file with 2 tests
- `src/cli/status.ts` - Added defensive fallbacks for missing fields
- `src/cli/status.test.ts` - New test file with 2 tests

## Bug 2: Stop Hook Silent Failure

**Problem:** The `stop` hook could fail silently when writing to the token-ledger.json, and the `stop_count` increment could be lost if an error occurred during ledger updates.

**Root Cause:** The hook didn't have proper error handling around the ledger write operations, and the `stop_count` was incremented early in the flow without protection.

**Fix:**
1. Extracted the core session finalization logic into a testable `finalizeSession()` function
2. Wrapped the `finalizeSession()` call in a try/catch block
3. Moved the `stop_count` increment to inside `finalizeSession()`
4. Added a finally block to ensure `stop_count` is always persisted even if ledger writes fail
5. Added stderr diagnostics to report errors to the user

**Files Changed:**
- `src/hooks/stop.ts` - Refactored with try/finally and `finalizeSession()` function
- `src/hooks/stop.test.ts` - New test file with 2 tests

## Bug 3: Worktree Sessions Polluting Main Checkout

**Problem:** Worktree sessions were writing all OpenWolf data (token-ledger, memory, etc.) to the main repo's `.wolf/` directory instead of keeping it isolated in the worktree's own `.wolf/` directory.

**Root Cause:** The `getWolfDir()` function always returned the main repo root path, even when running in a worktree context.

**Fix:**
1. Modified `getWolfDir()` to return the worktree's `.wolf/` directory when:
   - Running in a worktree AND
   - `OPENWOLF_WRITE_MAIN` environment variable is NOT set to "1"
2. Added `OPENWOLF_WRITE_MAIN=1` as an opt-in escape hatch for users who want to share knowledge across worktrees
3. Updated `getSessionDir()` to follow the wolf directory location (worktree-local by default)
4. Updated tests to reflect the new behavior

**Files Changed:**
- `src/hooks/shared.ts` - Modified `getWolfDir()` to be worktree-local
- `src/hooks/shared.test.ts` - Updated 2 existing tests and added 1 new test

## Testing

All fixes include comprehensive test coverage:
- `src/hooks/session-start.test.ts` - 2 tests for ledger initialization
- `src/cli/status.test.ts` - 2 tests for defensive fallbacks
- `src/hooks/stop.test.ts` - 2 tests for error handling
- `src/hooks/shared.test.ts` - 9 tests (2 updated, 1 new)

Total: 15 new tests

## Backward Compatibility

The changes maintain backward compatibility:
- Existing ledger files will work (missing fields default to 0)
- The `OPENWOLF_WRITE_MAIN` environment variable provides an opt-in path for the old behavior
- All hooks continue to work in both main checkouts and worktrees

## Verification

Run the following to verify all tests pass:
```bash
npx vitest run src/hooks/ src/cli/status.test.ts
```

Build the project:
```bash
pnpm build
```
