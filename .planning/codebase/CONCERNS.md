# Codebase Concerns

**Analysis Date:** 2026-06-07

## Tech Debt

### Synchronous FS Operations Blocking Event Loop

**Issue:** Every filesystem operation across the entire codebase uses synchronous `Sync` variants (`readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`, `unlinkSync`, etc.). This is especially problematic in the daemon (`src/daemon/wolf-daemon.ts`), which is an Express HTTP server handling concurrent requests — every `fs.readFileSync` in an API route blocks the entire event loop.

**Files:** All `src/` files, notably:
- `src/daemon/wolf-daemon.ts` (lines 25, 74, 115, 125, 136, 148, 207, 215, 245, 419, 449, 452, 458-461, 478)
- `src/daemon/cron-engine.ts` (lines 350, 371-384)
- `src/utils/fs-safe.ts` (entire file — every read/write is sync)
- `src/hooks/post-write.ts` (lines 73, 86, 119-120)
- `src/scanner/anatomy-scanner.ts` (lines 92, 113, 122, 232)

**Impact:** Under load, API latency spikes linearly with FS operation count. A single slow FS call (NFS, network drive) blocks all concurrent requests. This is the single largest architectural debt.

**Fix approach:** Adopt `fs.promises` API throughout. Replace `readFileSync` with `readFile`, `writeFileSync` with `writeFile`, etc. Prioritize the daemon routes first, then hooks (which run as short-lived processes and are less affected).

### Massive Empty Catch Block Pattern (~50+ instances)

**Issue:** The codebase has ~50+ empty catch blocks (`} catch {}` or `} catch { /* ignore */ }`) that silently swallow errors. While some of these are intentional (non-critical operations), the pattern is overused and conceals real failures.

**Files:** Spread across:
- `src/utils/fs-safe.ts` (lines 99-107, 140-149, 178)
- `src/tracker/waste-detector.ts` (lines 69, 87)
- `src/cli/daemon-cmd.ts` (lines 33, 155)
- `src/cli/cron-cmd.ts` (lines 101)
- `src/cli/update.ts` (lines 26, 254, 258, 308)
- `src/daemon/cron-engine.ts` (lines 323, 412)
- `src/daemon/wolf-daemon.ts` (lines 89, 265, 340, 478)
- `src/dashboard/app/hooks/useWolfData.ts` (lines 98, 101, 104, 107, 110, 113)
- `src/dashboard/app/lib/wolf-client.ts` (lines 27, 35)
- `src/designqc/designqc-capture.ts` (lines 24, 28, 41, 128, 194)
- All hook files (dozens of instances)

**Impact:** Failures in JSON parsing, file reads, and FS operations are invisible. When a user's `config.json` or `buglog.json` gets corrupted, the system silently falls back to defaults with no indication.

**Fix approach:** Audit each empty catch. For JSON parse failures, log a warning via `process.stderr.write`. For FS operations on non-critical temp files, keep the silence but add inline comments explaining why. Use `logger.warn()` instead of silent catches in the daemon.

### Excessive `any` Types in Dashboard

**Issue:** The React dashboard (`src/dashboard/app/`) heavily uses `any` types throughout, bypassing TypeScript's type safety. Data types for token ledger, cron state, buglog, and design QC reports are all typed as `any[]` or `any`.

**Files:**
- `src/dashboard/app/hooks/useWolfData.ts` (lines 17, 18, 24, 25, 29, 33, 38, 62, 86 — all `any[]` or `any`)
- `src/dashboard/app/components/panels/CronStatus.tsx` (lines 12, 13, 18, 45, 82, 110 — `any` on all callbacks)
- `src/dashboard/app/components/panels/BugLog.tsx` (lines 10, 30, 59 — `any`)
- `src/dashboard/app/components/panels/TokenUsage.tsx` (lines 11, 82 — `any`)
- `src/dashboard/app/components/panels/DesignQC.tsx` (line 45 — `any`)
- `src/dashboard/app/lib/wolf-client.ts` (line 1 — `any`)

**Impact:** Type-related bugs in the dashboard go undetected at build time. API shape changes in backend JSON files can silently break the dashboard.

**Fix approach:** Define proper TypeScript interfaces for all Wolf data structures (mirroring backend types) and replace all `any` references. Co-locate types in `src/dashboard/app/types/`.

### Monolithic post-write.ts (587 lines)

**Issue:** `src/hooks/post-write.ts` is the largest file in the codebase at 587 lines. It handles multiple unrelated responsibilities in a single main() function: anatomy update, memory append, session tracking, edit summarization, auto bug detection, and fix pattern detection.

**Impact:** Hard to test, hard to reason about, and any single bug brings down all subsystems. The `detectFixPattern()` function alone is 200 lines of nested if/else.

**Fix approach:** Split into focused modules: `hooks/anatomy-writer.ts`, `hooks/bug-detector.ts`, `hooks/edit-summarizer.ts`. Each module gets its own test file.

### process.exit(0) with Unreachable Code After

**Issue:** Multiple hooks call `process.exit(0)` followed immediately by `return;` statements that are dead code. The `return;` after `process.exit(0)` will never execute.

**Files:**
- `src/hooks/post-write.ts` (lines 45-46, 51, 57-58, 63, 194)
- `src/hooks/pre-read.ts` (lines 26, 31, 38, 56, 94)
- `src/hooks/pre-write.ts` (lines 28, 39, 51)
- `src/hooks/stop.ts` (line 195)

**Impact:** Misleading code that suggests a fallback path exists. Could confuse maintenance developers into adding dead code between `process.exit()` and `return`.

**Fix approach:** Remove all unreachable `return;` statements after `process.exit(0)`.

### Unused Dependencies

**Issue:** The `chalk` package is listed as a dependency in `package.json` but is never imported anywhere in `src/`.

**File:** `package.json` (line 25 — `"chalk": "^5.3.0"`)

**Impact:** 9KB+ of unnecessary dependency in the install tree. Increases install time and audit surface.

**Fix approach:** Remove `chalk` from `package.json` dependencies.

## Known Bugs

### Token Leak in CLI Console Output

**Symptoms:** When `openwolf dashboard` is run and the browser fails to open automatically, the auth token is printed to the console in the full URL: `URL: http://localhost:18791?token=<hex>` (`src/cli/dashboard.ts:137`). While the error URL is logged to the file via `logger.error` with the token stripped (line 131-132), the `console.log` on line 137 outputs the full URL with token.

**Files:** `src/cli/dashboard.ts` (line 137)

**Trigger:** Run `openwolf dashboard` on a system without a default browser or with broken `open` package.

**Impact:** The daemon auth token (which provides full API access) is visible in terminal scrollback, potentially captured by CI logs, terminal recording tools, or screen sharing.

**Fix approach:** Apply the same `safeUrl` stripping used for the log file (line 131) to the console output on line 137. Only display `http://localhost:18791` without the token.

### Dashboard API Error Fetching is Silent

**Symptoms:** `src/dashboard/app/hooks/useWolfData.ts` lines 137, 142, 147 use `.catch(() => {})` or `.catch(() => setLoading(false))` — all errors from the three initial API fetches are silently swallowed with no retry or user feedback.

**Files:** `src/dashboard/app/hooks/useWolfData.ts` (lines 137, 142, 147)

**Trigger:** Any network error, daemon restart, or temporary API unavailability.

**Impact:** The dashboard silently shows an empty/loading state. User has no indication that an error occurred or that they should refresh.

**Fix approach:** Set error state on catch and show a user-visible error banner. Consider adding retry logic with exponential backoff.

### DesignQC `shell: true` Spawn Risk

**Symptoms:** `src/designqc/designqc-capture.ts` line 214-219 spawns a dev server using `shell: true` with `stdio: ["ignore", "pipe", "pipe"]`. The `detectDevCommand` function at line 159-197 reads the dev script from `package.json` and constructs a string command. If a `package.json` dev script contains shell metacharacters (e.g., `dev; curl http://evil.com`), it would be executed.

**Files:** `src/designqc/designqc-capture.ts` (lines 159-197, 214-219)

**Trigger:** Running `openwolf designqc` in a project with a malicious or user-modified `package.json`.

**Impact:** Low in practice (user must run the command themselves), but the `shell: true` is unnecessary — use `spawn` with array arguments instead.

**Fix approach:** Split `shell: true` into array-based arguments. Use `"npm"`/`"pnpm"`/`"yarn"` as the command and `["run", scriptName]` as args.

## Security Considerations

### Prompt Injection via AI Task in Cron Engine (HIGH-001)

**Risk:** The `runAiTask` method in `src/daemon/cron-engine.ts` sends a user-defined prompt from `cron-manifest.json` to `claude -p` and processes the raw AI output. While the original vulnerability (direct overwrite of `cerebrum.md`) has been mitigated — the code now writes to `cerebrum-draft.md` and requires explicit `writes_to` declaration in the manifest — the current fix still has gaps:

1. The `cerebrum-draft.md` file is written silently by an automated daemon; users may not notice the file was created.
2. The cron task writes to memory.md indicating `pending-review`, but Claude Code's session-start hook could theoretically read `cerebrum-draft.md` and act on it.
3. No structural validation of AI output before writing.
4. No timestamped backup is created.

**Files:** `src/daemon/cron-engine.ts` (lines 328-431)

**Current mitigation:**
- Requires explicit `writes_to: ["cerebrum-draft.md"]` in the manifest
- Writes to `cerebrum-draft.md` (staging) instead of directly overwriting `cerebrum.md`
- Logs a warning that manual review is needed

**Recommendations:**
- Add timestamped backup creation before any write to core instruction files
- Validate structural integrity of AI output (required sections, reasonable length bounds)
- Restrict which cron task types can write to instruction files via a stricter allowlist
- Log a prominent warning (not just debug) when `cerebrum-draft.md` is modified

### Environment Variable Over-sharing in Daemon Fork

**Risk:** `src/cli/dashboard.ts:74` passes `{ ...process.env, OPENWOLF_PROJECT_ROOT: projectRoot }` to the forked daemon child process. This inherits the entire parent environment, including any secrets (API keys, tokens, etc.) that were in the shell environment.

**Files:** `src/cli/dashboard.ts` (line 74)

**Recommendations:** Create a whitelist of allowed env vars instead of spreading all of `process.env`. At minimum, filter out `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and similar credential vars.

### SECURITY-AUDIT.md Out of Date

**Issue:** `SECURITY-AUDIT.md` (dated 2026-06-05) documents HIGH-001 as an unfixed vulnerability where AI output directly overwrites `cerebrum.md`. The codebase has since been partially fixed (`cron-engine.ts` now writes to `cerebrum-draft.md`), but the document has not been updated to reflect this.

**Files:** `SECURITY-AUDIT.md`

**Recommendations:** Update SECURITY-AUDIT.md to reflect the current state of the fix. Either close HIGH-001 as remediated (with residual notes) or update the action items to match the partial fix.

## Performance Bottlenecks

### No Streaming in Daemon File Serving

**Problem:** `src/daemon/wolf-daemon.ts:207-220` reads all `.wolf/` files into memory at once via `fs.readFileSync` for the `/api/files` endpoint. The `request_full_state` WebSocket handler (lines 410-424) does the same. For projects with large `memory.md` or `anatomy.md` files, this creates an unnecessary memory spike.

**Files:**
- `src/daemon/wolf-daemon.ts` (lines 207-220, 410-424)

**Cause:** Using `readFileSync` to load every wolf file into a single response object.

**Improvement path:** Stream individual files on demand rather than all-at-once. At minimum, use `res.sendFile()` for files over a threshold. For WebSocket, send files individually rather than bundling all of them.

### Unbounded Token Ledger Growth

**Problem:** The token ledger (`token-ledger.json`) appends every session entry indefinitely with no pruning or archiving. A session entry contains all reads and writes with full file paths and token estimates.

**Files:**
- `src/tracker/token-ledger.ts` (line 99 — `ledger.sessions.push(session)`)
- `src/hooks/stop.ts` (line 133 — `ledger.sessions.push(sessionEntry)`)

**Cause:** No maximum session limit, no archival strategy, no data retention policy.

**Improvement path:** Implement a session cap (e.g., keep last 100 sessions, archive older ones). Optionally consolidate very old sessions into aggregated statistics.

## Fragile Areas

### Daemon Auth Token Lifecycle

**Files:** `src/daemon/wolf-daemon.ts` (lines 22-35, 257-275, 478)

**Why fragile:** The daemon writes the auth token to `daemon-token.tmp` before `listen()` binds the port. If `listen()` fails (EADDRINUSE), the token file is deleted. However, there's a window where the token exists but no server is running. The token TMP file is also cleaned up in `shutdown()` (line 478), but if the process is killed with SIGKILL (not SIGTERM/SIGINT), the stale token remains. Next startup will clean it up (line 265), but only on bind failure — if bind succeeds and a previous stale token exists, two token files coexist.

**Safe modification:** Always delete stale `daemon-token.tmp` at the start of the `listen()` callback (on success), not just on error. This ensures a clean token lifecycle.

### Worktree Detection in Hooks

**Files:** `src/hooks/worktree-helper.ts` (entire file, 87 lines)

**Why fragile:** The worktree detection runs two `git rev-parse` calls with a 2-second timeout. On very large repos or slow filesystems (NFS, EFS), this can timeout leading to incorrect non-worktree fallback. The `execFileSync` with timeout throws on timeout, which is caught by the caller, but the error classification functions (`isTimeoutError`, `isNotARepoError`) must be checked in the right order by callers.

**Test coverage:** Covered by `tests/utils/worktree.test.ts` and `tests/utils/worktree.integration.test.ts` — one of the few well-tested modules.

### Cross-platform Path Handling

**Files:**
- `src/utils/paths.ts`
- `src/hooks/wolf-paths.ts`

**Why fragile:** Path normalization is done manually with `normalizePath()` in `wolf-paths.ts` rather than using `path.normalize()`. The `path.sep` handling has separate branches for `/` vs `\\` (lines 33-48). Any missed separator case could cause path mismatches on Windows, especially in worktree mode.

### `shell: true` in cron-engine for claude -p

**Files:** `src/daemon/cron-engine.ts` (lines 374-384)

**Why fragile:** Uses `spawnSync("claude -p --output-format text", { ..., shell: true })`. The command string `claude -p --output-format text` is passed as a single string and resolved via shell. This is fragile because:
1. Space in the path to `claude` binary on Windows would break
2. Shell interpretation differs between cmd.exe, PowerShell, and bash
3. Error messages from the shell are harder to parse than from the child process directly

**Safe modification:** Use `spawnSync("claude", ["-p", "--output-format", "text"], { ... })` with array arguments and no `shell: true`.

### Orphaned Daemon Child Process

**Files:** `src/cli/dashboard.ts` (lines 72-86)

**Why fragile:** The daemon is forked with `detached: true` and `child.unref()`. If the parent CLI process exits before the daemon finishes starting, and then the daemon crashes shortly after, there is no cleanup. The orphaned daemon process's error output is lost because `stdio: "ignore"`. Additionally, if the parent is killed, the child continues running as an orphan.

**Safe modification:** Track the daemon PID in a file (similar to `daemon-token.tmp`) and check for it on startup. Use PM2's built-in persistence features first, fall back to managed processes.

## Scaling Limits

### Anatomy Scanner Hard Limit at 500 Files

**Current capacity:** `src/scanner/anatomy-scanner.ts` line 24 sets `DEFAULT_MAX_FILES = 500`. Any project with more than 500 files will have its anatomy truncated without warning.

**Limit:** Files beyond the 500th entry are silently dropped. The anatomy metadata shows `fileCount` but users may not notice the count is lower than expected.

**Scaling path:** Make the limit configurable in `config.json` (it already is via `openwolf.anatomy.max_files`), but add a visible warning when the limit is hit. Consider increasing the default to 2000 for large projects.

### Execution Log Retention Capped at 100

**Current capacity:** `src/daemon/cron-engine.ts` line 138 caps execution log at 100 entries with `state.execution_log.slice(-100)`.

**Limit:** For cron tasks that run every 5 minutes, this is only ~8 hours of history.

**Scaling path:** Increase default retention or make it configurable. Consider pruning by age rather than count.

## Dependencies at Risk

### puppeteer-core (Optional Dependency)

**Risk:** `puppeteer-core` is listed as an optional dependency in `package.json` (line 34), but the `src/designqc/designqc-engine.ts` dynamic import (line 76) has no fallback if npm/yarn/pnpm didn't download optional deps. If the user runs `openwolf designqc` without installing optional deps, it errors with a generic message.

**Files:**
- `package.json` (line 34)
- `src/designqc/designqc-engine.ts` (lines 73-78)

**Impact:** Confusing UX — user runs `openwolf designqc` and gets a puppeteer-not-found error with an install suggestion. The package should either be required or provide a graceful fallback with clear instructions.

### Express v5 (Pre-release)

**Risk:** The project depends on `express@^5.0.0` (package.json line 30). Express 5 is a major overhaul that had a long pre-release period and may have subtle API differences from Express 4. Several middleware packages (e.g., `@types/express`) still target Express 4.

**Impact:** Potential compatibility issues with middleware. Also, fewer community examples and StackOverflow answers reference Express 5 patterns.

## Missing Critical Features

### No Auto-retry for Dashboard API on Daemon Restart

**Problem:** The dashboard WebSocket client (`src/dashboard/app/lib/wolf-client.ts`) attempts reconnection every 3 seconds indefinitely with no backoff. The HTTP API hooks in `useWolfData.ts` make a single fetch call with no retry. If the daemon restarts (which can take 1-3 seconds), the initial API calls fail silently.

**Blocks:** Reliable dashboard experience during daemon lifecycle events (startup, restart, upgrade).

### No CI Pipeline for Build and Test

**Problem:** There is a GitHub Actions workflow for docs deployment (`.github/workflows/docs.yml`) but no CI pipeline that runs `pnpm test`, `pnpm build:hooks`, or TypeScript type-checking (`tsc --noEmit`). There is no `bitbucket-pipelines.yml` either.

**Blocks:** Pull requests can merge with broken builds, type errors, or test failures. Lowers confidence in code changes.

## Test Coverage Gaps

### Untested Areas

| Area | Files | Risk | Priority |
|------|-------|------|----------|
| **Daemon HTTP API** | `src/daemon/wolf-daemon.ts` | API endpoints have zero test coverage. Auth, file serving, cron trigger. | High |
| **Cron Engine** | `src/daemon/cron-engine.ts` | Complex scheduling, retry logic, dead letters. AI task execution path. | High |
| **post-write hook** | `src/hooks/post-write.ts` | 587 lines of anatomy update, memory append, auto bug detection — zero tests. | High |
| **Scanner** | `src/scanner/anatomy-scanner.ts` | File walk, exclusion patterns, binary detection. | Medium |
| **Dashboard** | `src/dashboard/app/**/*.tsx` | All React components, hooks, WebSocket client. | Medium |
| **DesignQC** | `src/designqc/designqc-*.ts` | Chrome detection, screenshot capture, dev server management. | Medium |
| **Bug tracker** | `src/buglog/bug-tracker.ts` | Dedup logic, similarity search. | Medium |
| **CLI commands** | `src/cli/daemon-cmd.ts`, `src/cli/cron-cmd.ts`, `src/cli/dashboard.ts`, `src/cli/scan.ts`, `src/cli/bug-cmd.ts`, `src/cli/designqc-cmd.ts` | Most CLI commands have zero tests. | Medium |
| **Waste detector** | `src/tracker/waste-detector.ts` | Pattern detection logic. | Low |
| **File lock** | `src/hooks/wolf-lock.ts` | Lock acquisition, staleness, retry. | Low |
| **Logger** | `src/utils/logger.ts` | Log rotation, formatting. | Low |
| **Platform detection** | `src/utils/platform.ts` | Simple but used everywhere for OS gates. | Low |

### Modules with Existing Tests (good)

- `tests/hooks/shared.test.ts` — Shared hook utilities
- `tests/hooks/stop.test.ts` — Session finalization
- `tests/hooks/session-start.test.ts` — Session initialization
- `tests/cli/init.test.ts` — Project initialization
- `tests/cli/status.test.ts` — Status command
- `tests/cli/hook-settings.test.ts` — Hook settings management
- `tests/utils/worktree.test.ts` + `.integration.test.ts` — Worktree detection
- `tests/security.test.ts` — Security gate (likely generated)

---

*Concerns audit: 2026-06-07*
