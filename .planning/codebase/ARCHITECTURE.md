<!-- refreshed: 2026-06-07 -->
# Architecture

**Analysis Date:** 2026-06-07

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                      Claude Code Hooks                           │
│  session-start  │  pre-read  │  post-read  │  pre-write          │
│  post-write     │  stop                                          │
│  src/hooks/*.ts                                                   │
├──────────────────────┬───────────────────────────────────────────┤
│                      │                                           │
│         ▼            │               ▼                            │
│  ┌──────────────┐    │    ┌──────────────────┐                    │
│  │   CLI  Tool  │    │    │  Daemon (Express  │                   │
│  │  openwolf    │    │    │  + WebSocket)     │                   │
│  │  src/cli/    │    │    │  src/daemon/      │                   │
│  └──────┬───────┘    │    └────────┬─────────┘                   │
│         │            │             │                              │
│         ▼            │             ▼                              │
│  ┌───────────────────────────────────────────────┐                │
│  │              Core Subsystems                   │               │
│  │  Scanner  │  Tracker  │  Buglog  │  DesignQC   │              │
│  │  src/scanner/  │  src/tracker/  │  src/buglog/ │  src/designqc/│
│  └───────────────────────┬───────────────────────┘                │
│                          │                                        │
│                          ▼                                        │
│  ┌─────────────────────────────────────┐                         │
│  │         .wolf/ State Files          │                         │
│  │  (anatomy.md, cerebrum.md,          │                          │
│  │   token-ledger.json, buglog.json,   │                           │
│  │   memory.md, config.json, ...)      │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
│  ┌─────────────────────────────────────┐                            │
│  │   Dashboard (React SPA)             │                            │
│  │   src/dashboard/app/                │                            │
│  └─────────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

OpenWolf is structured as a **hook-driven context assistant** that lives inside Claude Code sessions. It has three independently compiled parts that all run as Node.js processes:

1. **CLI + Core** (`tsc` via `tsconfig.json`) — compiles `bin/` and `src/` to `dist/`.
2. **Hooks** (`tsc -p tsconfig.hooks.json`) — standalone Node scripts run by Claude Code on tool events.
3. **Dashboard** (Vite build) — React 19 + TailwindCSS 4 SPA for visual monitoring.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI Entry | Parse commands, dispatch to command handlers | `bin/openwolf.ts`, `src/cli/index.ts` |
| Init | Initialize `.wolf/` in a project, write templates, register hooks | `src/cli/init.ts` |
| Scan | Walk filesystem, build `anatomy.md` with descriptions/token estimates | `src/cli/scan.ts`, `src/scanner/anatomy-scanner.ts` |
| Daemon | Express HTTP + WebSocket server; serves dashboard, cron scheduling, file watching | `src/daemon/wolf-daemon.ts` |
| Cron Engine | node-cron scheduler for periodic tasks (scan, waste detection) | `src/daemon/cron-engine.ts` |
| Dashboard | React SPA for monitoring token usage, anatomy, activity, bugs, cron | `src/dashboard/app/` |
| 6 Hooks | Intercept Read/Write/Edit tool events and session lifecycle | `src/hooks/*.ts` |
| Scanner | Walk project files, extract descriptions, write `anatomy.md` | `src/scanner/anatomy-scanner.ts` |
| Description Extractor | Language-aware description extraction for file types | `src/scanner/description-extractor.ts`, `src/scanner/extractors/*.ts` |
| Token Tracker | Estimate token usage, maintain `token-ledger.json`, detect waste | `src/tracker/` |
| Buglog | Read/write `buglog.json`, fuzzy search, deduplication | `src/buglog/` |
| DesignQC | Capture full-page screenshots for design review | `src/designqc/` |
| Registry | Track all OpenWolf-managed projects at `~/.openwolf/registry.json` | `src/cli/registry.ts` |

## Pattern Overview

**Overall:** Hook-based middleware architecture with a CLI tool and background daemon.

**Key Characteristics:**
- **Claude Code hooks** are the primary integration point — 7 hook scripts registered in `.claude/settings.json` fire on session start (`session-start`), tool calls (`pre-read`, `post-read`, `pre-write`, `post-write`), and session stop (`stop`)
- **File-based persistence** — all state lives in `.wolf/` as markdown and JSON files; no database
- **Hook scripts are self-contained** — the 6 hook scripts are compiled independently with `tsconfig.hooks.json` and run as standalone Node.js processes. They bundle their own copy of shared utilities in `src/hooks/shared.ts` (a barrel re-exporting the six internal `wolf-*.ts` modules)
- **Daemon is forked** — `openwolf dashboard` forks `wolf-daemon.ts` via `child_process.fork()`
- **CLI commands lazy-load** — heavy imports are deferred with dynamic `import()` in command `.action()` callbacks

## Layers

**Hooks Layer (src/hooks/):**
- Purpose: Intercept and augment Claude Code's tool events
- Location: `src/hooks/`
- Contains: 6 hook scripts, `shared.ts` barrel, 7 internal modules (`wolf-paths.ts`, `wolf-files.ts`, `wolf-json.ts`, `wolf-lock.ts`, `wolf-anatomy.ts`, `wolf-describe.ts`, `wolf-misc.ts`), `worktree-helper.ts`
- Depends on: Node.js builtins only (no external deps)
- Used by: Claude Code's hook runtime; deployed to `.wolf/hooks/`
- Constraint: Hooks **cannot import from `src/utils/`** at runtime — `src/hooks/shared.ts` is a self-contained copy

**CLI Layer (src/cli/):**
- Purpose: User-facing commands for project management
- Location: `src/cli/`
- Contains: 14 modules — command registration and handlers
- Depends on: `src/utils/`, `src/scanner/`, `src/tracker/`, `src/buglog/`, `src/designqc/`
- Used by: `bin/openwolf.ts` entry point

**Core Subsystems (src/scanner/, src/tracker/, src/buglog/, src/designqc/):**
- Purpose: Individual functional domains
- Location: `src/scanner/`, `src/tracker/`, `src/buglog/`, `src/designqc/`
- Contains: Domain logic for anatomy scanning, token estimation, bug tracking, design QC captures
- Depends on: `src/utils/`

**Daemon Layer (src/daemon/):**
- Purpose: Long-running HTTP/WebSocket server for dashboard and cron
- Location: `src/daemon/`
- Contains: Express app, WebSocket server, cron engine, file watcher, health check
- Depends on: `src/utils/`, `src/scanner/`, `src/tracker/`

**Dashboard Layer (src/dashboard/app/):**
- Purpose: Visual monitoring SPA
- Location: `src/dashboard/app/`
- Contains: React 19 components, Vite config, TailwindCSS 4 styles
- Depends on: Daemon's REST + WebSocket API (no direct file access)

**Utilities Layer (src/utils/):**
- Purpose: Shared infrastructure
- Location: `src/utils/`
- Contains: 6 modules — logger, path helpers, file-safe I/O, platform detection, worktree detection, file extensions
- Depends on: Node.js builtins only

## Data Flow

### Primary Request Path — Hook Execution

1. **Claude Code fires a tool event** (e.g., Read tool is used)
2. **Claude Code reads `.claude/settings.json`** to find registered hooks for the event
3. **Claude Code spawns the hook as a subprocess** (`node .wolf/hooks/pre-read.js`), piping tool input JSON to stdin
4. **Hook calls `ensureWolfDir()`** (`src/hooks/wolf-files.ts:29`) — exits 0 silently if `.wolf/` absent
5. **Hook reads stdin** via `readStdin()` (`src/hooks/wolf-misc.ts:15`) — receives tool input JSON
6. **Hook performs its function** (e.g., `pre-read.ts` checks for repeated reads, `post-write.ts` updates anatomy descriptions)
7. **Hook reads/writes session state** in `_session.json` via `readJSON()`/`writeJSON()` (`src/hooks/wolf-json.ts`)
8. **Hook exits** — Claude Code continues with the tool execution

### Primary CLI Command Path

1. `bin/openwolf.ts` calls `createProgram()` (`src/cli/index.ts:23`)
2. User invokes `openwolf init`, `openwolf scan`, `openwolf status`, etc.
3. CLI handler calls into subsystems: `src/scanner/anatomy-scanner.ts`, `src/tracker/token-ledger.ts`, `src/cli/registry.ts`
4. Results written to `.wolf/` files or printed to stdout

### Session Lifecycle

1. **session-start hook** (`src/hooks/session-start.ts`):
   - Cleans stale `.tmp` files
   - Creates `_session.json` with session ID, start time
   - Updates worktree context if in a git worktree
   - Writes session start to `memory.md`

2. **During session** — pre-read/post-read/pre-write/post-write hooks fire per tool call:
   - `pre-read.ts`: Track file read counts, warn on repeated reads
   - `post-read.ts`: Estimate tokens of file content read
   - `pre-write.ts`: Check cerebrum for do-not-repeat rules; check buglog for similar bugs
   - `post-write.ts`: Track writes, update anatomy descriptions, prompt `cerebrum.md`/`STATUS.md` updates

3. **stop hook** (`src/hooks/stop.ts`):
   - `finalizeSession()` computes totals, updates `token-ledger.json`
   - Checks for missing buglog entries (files edited 3+ times)
   - Checks STATUS.md freshness
   - Checks cerebrum.md freshness
   - Writes summary to `memory.md`

**State Management:**
- All state is file-based in `.wolf/`
- JSON files use atomic writes (write to `.tmp` then `rename`)
- JSON reads use `deepMergeDefaults()` for forward-compatible schema evolution
- Lock files (`withFileLock` in `src/hooks/wolf-lock.ts`) prevent concurrent write corruption
- Session isolation for git worktrees via `.wolf/sessions/{worktreeId}/`

### Daemon Request Path

1. `openwolf dashboard` (`src/cli/dashboard.ts`) forks `wolf-daemon.ts`
2. Express server starts on configurable port (default 18790)
3. REST endpoints serve `.wolf/` file contents (anatomy, ledger, state)
4. WebSocket server pushes real-time file change notifications
5. `chokidar` file watcher (`src/daemon/file-watcher.ts`) broadcasts `.wolf/` file changes over WebSocket
6. `CronEngine` (`src/daemon/cron-engine.ts`) runs scheduled tasks (anatomy scan, waste detection)

## Key Abstractions

**Hook Script Pattern:**
- Purpose: Independent Node.js process that reads tool input from stdin and exits
- Examples: `src/hooks/session-start.ts`, `src/hooks/pre-read.ts`, `src/hooks/post-read.ts`, `src/hooks/pre-write.ts`, `src/hooks/post-write.ts`, `src/hooks/stop.ts`
- Pattern: `async function main(): Promise<void> { ensureWolfDir(); ... readStdin() ...; process.exit(0) }`

**File-Safe I/O:**
- Purpose: Atomic, crash-safe JSON and text file operations
- Examples: `src/utils/fs-safe.ts`, `src/hooks/wolf-json.ts`
- Pattern: Write to `.tmp` file → `rename()` to target (atomic on same filesystem)

**Worktree Awareness:**
- Purpose: Detect git worktrees and share `.wolf/` state across them
- Examples: `src/hooks/worktree-helper.ts`, `src/hooks/wolf-paths.ts`, `src/utils/worktree.ts`
- Pattern: `git rev-parse --git-dir --git-common-dir` comparison; if different, we're in a worktree

**Deep-Merge Configuration:**
- Purpose: Forward-compatible defaults for JSON config files
- Examples: `src/utils/fs-safe.ts:20` (`deepMergeDefaults`), `src/hooks/wolf-json.ts:21`
- Pattern: Recursive merge: loaded values win, defaults fill gaps, skip prototype keys

**Session State:**
- Purpose: Track per-session read/write activity
- Examples: `src/hooks/stop.ts` (`_session.json` → `token-ledger.json`)
- Pattern: Accumulate in `_session.json` through hooks → finalize on stop → flush to `token-ledger.json`

## Entry Points

| Entry Point | Location | Triggers | Responsibilities |
|-------------|----------|----------|------------------|
| CLI binary | `bin/openwolf.ts` | User shell | Parse args, run command |
| CLI program factory | `src/cli/index.ts` | `bin/openwolf.ts` | Register all subcommands |
| session-start hook | `src/hooks/session-start.ts` | Claude Code session start | Init session state, cleanup, worktree setup |
| pre-read hook | `src/hooks/pre-read.ts` | Claude Code Read tool | Track reads, warn on repeats |
| post-read hook | `src/hooks/post-read.ts` | Claude Code Read return | Token estimation |
| pre-write hook | `src/hooks/pre-write.ts` | Claude Code Write/Edit tool | Cerebrum check, buglog lookup |
| post-write hook | `src/hooks/post-write.ts` | Claude Code Write/Edit return | Track writes, update anatomy, nudge updates |
| stop hook | `src/hooks/stop.ts` | Claude Code session stop | Finalize session, update ledger, health checks |
| Daemon server | `src/daemon/wolf-daemon.ts` | `openwolf dashboard` fork | HTTP API, WebSocket, cron, file watching |

## Architectural Constraints

- **Hook isolation:** Hook scripts cannot import from `src/utils/` at runtime. `src/hooks/shared.ts` bundles self-contained copies of all needed utilities. This is enforced by `tsconfig.hooks.json` which compiles only `src/hooks/` with rootDir set to `src/hooks`.
- **Three-build pipeline:** CLI + core, hooks, and dashboard are built separately. All three must be built for a working CLI (`pnpm build`).
- **Worktree sharing:** In git worktrees, `.wolf/` is shared from the main repository, but sessions are isolated via `.wolf/sessions/{worktreeId}/`.
- **No database:** All persistence is file-based (`.wolf/` directory). No external databases.
- **Graceful non-OpenWolf fallback:** Hooks call `ensureWolfDir()` first and `process.exit(0)` silently if `.wolf/` is absent — safe in non-OpenWolf projects.
- **Single daemon per project:** Daemon binds to a configurable port (default 18790). `dashboard.ts` checks port availability before forking.
- **Token auth for API:** Daemon generates a random token at startup (`daemon-token.tmp`) for authenticating dashboard API calls.

## Anti-Patterns

### Duplicate I/O implementations

**What happens:** Both `src/utils/fs-safe.ts` and `src/hooks/wolf-json.ts` implement nearly identical `readJSON`/`writeJSON` functions. The hooks version uses `withFileLock` while the utils version uses a different locking strategy (no advisory lock).
**Why it's wrong:** Violates DRY. Changes to JSON I/O behavior (e.g., new fallback handling) must be made in two places. The hooks version exists because hooks can't import from `src/utils/` at runtime.
**Do this instead:** Both files are intentional — hooks are independently compiled and cannot depend on `src/utils/`. The duplication is acceptable given the architectural constraint.

### Hook timeout asymmetry

**What happens:** All hooks except `post-write` and `stop` have a 5-second timeout in `.claude/settings.json`. `post-write` and `stop` have 10 seconds. If `post-write.ts` has heavy work (anatomy updates, description extraction), it can hit the 10s limit.
**Why it's wrong:** Users may see incomplete anatomy updates if `post-write` is cut off.
**Do this instead:** Reduce `post-write.ts` workload or increase timeout to 15s. File in `src/cli/hook-settings.ts:79-82`.

## Error Handling

**Strategy:** Fail-safe. Hooks never crash the Claude Code session:
- `ensureWolfDir()` → `process.exit(0)` if `.wolf/` missing
- Top-level `main().catch()` in every hook: log to stderr, exit 0
- File read failures return defaults (never throw in hooks)
- `writeJSON` has a Windows fallback path when `rename()` fails

**Patterns:**
- **Read-with-defaults:** `readJSON(path, fallback)` — file missing returns fallback, parse error warns to stderr
- **Atomic writes:** Write to `.tmp` → `renameSync()` — prevents partial file reads
- **Best-effort cleanup:** Lock releases, tmp file deletions in `finally` blocks
- **Stale lock recovery:** Lock files older than 30s TTL are deleted and retried (`src/hooks/wolf-lock.ts:26-27`)

## Cross-Cutting Concerns

**Logging:** `src/utils/logger.ts` — writes to `daemon.log` plus console. Hook output goes to stderr (captured by Claude Code). No structured logging.

**Validation:** Minimal. Config files use `deepMergeDefaults` for schema evolution. There is no runtime input validation library (no zod, no ajv). File paths are validated for path traversal in `src/utils/paths.ts:15-26`.

**Authentication:** Random 256-bit hex token generated at daemon start, stored in `daemon-token.tmp` with `0o600` permissions. Constant-time comparison in `wolf-daemon.ts:80`. Token passes through URL query param on dashboard bootstrap, then stored in sessionStorage.

---

*Architecture analysis: 2026-06-07*
