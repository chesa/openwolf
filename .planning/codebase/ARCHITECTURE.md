# Architecture

**Analysis Date:** 2026-05-14

## System Overview

OpenWolf is a token-conscious context manager for Claude Code. It runs as three independently compiled subsystems that coordinate via the `.wolf/` filesystem directory.

```text
┌──────────────────────────────────────────────────────────────────┐
│                    Claude Code IDE Events                         │
│                                                                   │
│ session-start │ pre-read │ post-read │ pre-write │ post-write   │
│                                                                   │
└─────────┬──────────────────────┬──────────────────────┬──────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│             Claude Code Hooks (6 Node.js scripts)                 │
│                       src/hooks/                                   │
│ session-start.ts │ pre-read.ts │ post-read.ts │ post-write.ts    │
│ pre-write.ts │ stop.ts │ shared.ts (utilities)                    │
└─────────┬──────────────────────────┬──────────────────────────────┘
          │                          │
          ▼                          ▼
┌────────────────────────────────────────────────────────────────────┐
│          .wolf/ Filesystem Layer (shared data store)               │
│                                                                    │
│ anatomy.md │ cerebrum.md │ memory.md │ token-ledger.json          │
│ buglog.json │ config.json │ cron-manifest.json                    │
│ _session.json (ephemeral per session)                             │
└────────────────────────────────────────────────────────────────────┘
           │                              │
           │                              │
       ┌───┴──────────┬───────────────────┴──────┐
       │              │                          │
       ▼              ▼                          ▼
    CLI          Daemon + WebSocket        Scanner/Tracker
 (src/cli/)      (src/daemon/)            (src/scanner/,
                                          src/tracker/)
       │              │                          │
       │         ┌────┴────┐                     │
       │         ▼         ▼                     │
       │    Express    File Watcher             │
       │              + Cron Engine            │
       │                 │                      │
       └─────────────────┴──────────────────────┘
                        │
                        ▼
          ┌──────────────────────────┐
          │    Dashboard SPA          │
          │  (React 19 + Vite)        │
          │  src/dashboard/app/       │
          │  served: dist/dashboard/  │
          │                           │
          │ WebSocket client connects │
          │ to daemon for live updates│
          └──────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI | User commands: init, status, scan, dashboard, daemon, cron, update, restore, designqc, bug | `src/cli/index.ts` |
| Hooks | Integration with Claude Code IDE; runs on session and tool events | `src/hooks/session-start.ts`, etc. |
| Daemon | Express server, WebSocket broadcaster, cron scheduler | `src/daemon/wolf-daemon.ts` |
| File Watcher | Monitors `.wolf/` for changes, broadcasts updates via WebSocket | `src/daemon/file-watcher.ts` |
| Cron Engine | Schedules and executes cron tasks (defined in `.wolf/cron-manifest.json`) | `src/daemon/cron-engine.ts` |
| Scanner | Builds `anatomy.md` by scanning project filesystem | `src/scanner/anatomy-scanner.ts` |
| Token Tracker | Estimates token usage per file, maintains `token-ledger.json` | `src/tracker/token-ledger.ts`, `token-estimator.ts` |
| Dashboard | React UI for monitoring sessions, bugs, anatomy, memory | `src/dashboard/app/` |
| Utilities | Path resolution, worktree detection, file I/O, logging | `src/utils/` |

## Pattern Overview

**Overall:** Event-driven, filesystem-first architecture with decoupled subsystems

**Key Characteristics:**
- **No shared runtime state** — All subsystems communicate via `.wolf/` files
- **Event-based hooks** — Claude Code fires hooks at session/tool boundaries
- **Worktree-aware** — Supports git worktrees with session isolation per branch
- **Single entry point** — CLI (`openwolf` command) orchestrates initialization and daemon lifecycle
- **Opt-in daemon** — Dashboard and cron are background services (not required for CLI usage)

## Layers

**Hook Layer (Claude Code Integration):**
- Purpose: Capture IDE events and update `.wolf/` state
- Location: `src/hooks/`
- Contains: Session tracking, token estimation, file read/write logging, bug detection
- Depends on: `.wolf/` files, `src/utils/` helpers
- Used by: Claude Code IDE (direct invocation of compiled `.wolf/hooks/*.js`)
- Lifecycle: Compiled to `dist/hooks/`, copied to `.wolf/hooks/` via `openwolf update`

**CLI Layer (User Commands):**
- Purpose: Initialize projects, manage daemon, trigger scans, display status
- Location: `src/cli/`
- Contains: Commander subcommands, project registry management, template copying
- Depends on: Scanner, tracker, daemon control scripts
- Used by: User shell, CI/CD pipelines
- Key files: `init.ts` (setup), `index.ts` (command router), `daemon-cmd.ts` (lifecycle)

**Daemon + Server Layer (Background Services):**
- Purpose: HTTP API, WebSocket streaming, cron scheduling
- Location: `src/daemon/`
- Contains: Express app, WebSocket server, cron scheduler, file watcher
- Depends on: `.wolf/` config and state files
- Used by: Dashboard, CLI status checks
- Key files: `wolf-daemon.ts` (main), `cron-engine.ts` (scheduler), `file-watcher.ts` (change detection)

**Analysis Layer (Project Understanding):**
- Purpose: Scan filesystem, extract descriptions, estimate tokens
- Location: `src/scanner/`, `src/tracker/`
- Contains: File enumeration, token ratio calibration, session accounting
- Depends on: Project filesystem, `.wolf/config.json`
- Used by: CLI scan command, hooks (post-write auto-update)
- Key files: `anatomy-scanner.ts`, `description-extractor.ts`, `token-estimator.ts`

**Filesystem Store (Shared State):**
- Purpose: Persistent, multi-process-safe state
- Location: `.wolf/` directory
- Contains: Project inventory, learning memory, session ledgers, bug logs, cron definitions
- Format: JSON, Markdown, plain text
- Used by: All layers (hooks, CLI, daemon, dashboard)

**Dashboard Layer (UI):**
- Purpose: Visualize project state, monitor sessions, review bugs and memory
- Location: `src/dashboard/app/`
- Contains: React components, WebSocket client, file parsers
- Depends on: Daemon WebSocket, `.wolf/` files via API
- Used by: Developer viewing browser

## Data Flow

### Primary Request Path (Hook Execution)

1. **Session Start** (`src/hooks/session-start.ts`)
   - Claude Code session begins
   - Hook: Initialize `_session.json` with session ID, timestamp
   - Creates per-worktree session directory if needed (`src/hooks/shared.ts` → `ensureSessionDir()`)

2. **File Read** (`src/hooks/pre-read.ts` → `post-read.ts`)
   - User/AI reads a file via Claude Code
   - `pre-read`: Prepare (validate path exists)
   - `post-read`: Log read event, estimate tokens, check anatomy cache hits/misses
   - Stores in `_session.json` → `files_read: { file: { timestamp, tokens, was_repeated, anatomy_hit } }`

3. **File Write** (`src/hooks/pre-write.ts` → `post-write.ts`)
   - User/AI writes/edits a file
   - `pre-write`: Warn if cerebrum or buglog suggest caution
   - `post-write`: 
     - Increment `edit_counts[file]`
     - Detect if this is a bug fix (via buglog.json parsing)
     - Auto-update `anatomy.md` with new token estimate
     - Update `token-ledger.json` with aggregate stats
   - Appends to `_session.json` → `files_written: [{ file, action, tokens, at }]`

4. **Session Stop** (`src/hooks/stop.ts`)
   - Session ends
   - Check `edit_counts` — warn if file edited 2+ times without buglog entry
   - Append session summary to `.wolf/memory.md`
   - No cleanup of `_session.json` (preserved for audit)

### Background Daemon Flow (Optional)

1. **Daemon Start** (`openwolf daemon start`)
   - `src/daemon/wolf-daemon.ts` initializes Express app on port 18790 (default)
   - Loads `.wolf/config.json` for settings
   - Starts `CronEngine` (reads `cron-manifest.json`)
   - Starts `FileWatcher` (watches `.wolf/` for changes)
   - WebSocket server ready for dashboard connections

2. **File Change Broadcasting**
   - `FileWatcher` detects change to `.wolf/anatomy.md`, `cerebrum.md`, etc.
   - Emits to `CronEngine` and daemon WebSocket
   - Connected dashboard clients receive update message
   - Dashboard re-parses updated file and re-renders

3. **Cron Execution**
   - `CronEngine` evaluates cron schedules every heartbeat (30 min default)
   - Matches due tasks from `cron-manifest.json`
   - Executes task (typically shell command)
   - Logs result to daemon.log and broadcasts to dashboard

### Scanner/Anatomy Flow

1. **CLI Scan** (`openwolf scan`)
   - Calls `src/cli/scan.ts` → `anatomy-scanner.ts`
   - Recursively enumerates project files (respects `.gitignore`, excludes node_modules)
   - For each file:
     - Detect description via `description-extractor.ts` (JSDoc, comments, file purpose heuristics)
     - Estimate tokens via `token-estimator.ts` (chars/token ratio by file type)
   - Write to `.wolf/anatomy.md` with format: `- file.ts — Description (~XXX tok)`

2. **Auto-Update** (triggered by hooks)
   - `src/hooks/post-write.ts` calls scanner for newly written files
   - Incremental update: parse existing anatomy, upsert new entries, re-serialize
   - Prevents full rescan on every write (performance)

### Token Ledger Flow

1. **Per-Session Tracking** (in hooks)
   - Hook reads/writes update `_session.json`
   - At session end (`stop.ts`), compute totals: input/output tokens, read/write counts

2. **Ledger Persistence** (token-ledger.ts)
   - Session summary appended to `.wolf/token-ledger.json`
   - Structure: `{ version, created_at, lifetime: { ... }, sessions: [ { id, started, ended, reads: [...], writes: [...], totals: {...} } ] }`
   - Lifetime stats aggregate across all sessions
   - Used to calculate "estimated savings vs. bare CLI usage"

**State Management:**
- **Ephemeral:** `_session.json` (cleared at next session start)
- **Accumulating:** `token-ledger.json`, `memory.md`, `buglog.json` (append-only)
- **Refreshable:** `anatomy.md` (overwritten on scan)
- **Manual:** `cerebrum.md` (user edits learning notes)
- **Generated:** `config.json`, `cron-manifest.json` (created by `init`, user maintains)

## Key Abstractions

**WorktreeContext:**
- Purpose: Represents git worktree or monorepo branch session isolation
- Examples: `src/utils/worktree.ts`, `src/hooks/worktree-helper.ts`
- Pattern: Detect via `git worktree list` (or fallback to single-repo mode)
- Provides: `isWorktree`, `worktreeId`, `mainRepoRoot`, `branch`, `worktreePath`
- Used by: Hooks to route session files to per-branch directories

**AnatomyEntry:**
- Purpose: Represents a single file in the project inventory
- Definition: `{ file: string, description: string, tokens: number }`
- Serialized: Human-readable Markdown lines in `anatomy.md`
- Used by: Hooks for quick lookups, dashboard for browsing, CLI for reporting

**SessionData:**
- Purpose: In-memory snapshot of current session activity
- Stored: `_session.json` (JSON)
- Structure: `{ session_id, started, files_read, files_written, edit_counts, anatomy_hits, buglog_warnings, ... }`
- Used by: Hooks to append reads/writes before terminating

**BugEntry:**
- Purpose: Linked data structure for issue tracking
- Structure: `{ id, timestamp, error_message, file, root_cause, fix, tags, related_bugs, occurrences, last_seen }`
- Stored: Array in `.wolf/buglog.json`
- Used by: Pre-write hook (warnings), post-write hook (auto-detect fixes), CLI (search)

## Entry Points

**CLI:**
- Location: `bin/openwolf.ts` (thin wrapper), `src/cli/index.ts` (command factory)
- Triggers: `openwolf <command> [options]` from user shell
- Responsibilities: Parse args, load registry, dispatch to subcommand handlers

**Hooks:**
- Locations: `src/hooks/{session-start,pre-read,post-read,pre-write,post-write,stop}.ts`
- Triggers: Claude Code IDE (automatic on IDE events)
- Execution: Each hook reads stdin (JSON event), updates `.wolf/` files, exits

**Daemon:**
- Location: `src/daemon/wolf-daemon.ts`
- Triggers: `openwolf daemon start` or `pm2` auto-restart
- Listens: HTTP (port 18790) and WebSocket (port 18790/ws)

**Dashboard:**
- Location: `src/dashboard/app/App.tsx` (root component)
- Triggers: Browser fetch of `http://localhost:18791/` (or opened by `openwolf dashboard`)
- Loads: `dist/dashboard/index.html` (static), then connects to daemon WebSocket

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js). Cron engine runs on main loop (no worker threads). File watcher uses chokidar async callbacks.
- **Global state:** `src/daemon/wolf-daemon.ts` maintains `wsClients: Set<WebSocket>` (all connected dashboard clients). `CronEngine` maintains cron task state.
- **Circular imports:** None detected (TypeScript strict mode enforces acyclic dependency graph).
- **Process isolation:** Hooks run as separate Node processes (one per Claude Code tool call). Daemon runs as background process (pm2 or manual). CLI runs on-demand.
- **Filesystem locking:** `.wolf/` writes use atomic write-to-temp-then-rename pattern (`src/utils/fs-safe.ts` → `writeJSON`, `appendText`). No advisory locking (assumes single user).
- **Worktree isolation:** Session directories nested under `.wolf/sessions/{worktreeId}/` to avoid cross-branch state pollution.

## Anti-Patterns

### Duplicated Hook Merge Logic

**What happens:** `init.ts` and `update.ts` both contain logic to merge user-modified hook files with new versions. Their implementations diverge (different argument ordering, shallow-copy bugs).

**Why it's wrong:** When OpenWolf updates, projects with custom hooks may lose changes or receive incorrect merges. Future developers editing one file won't realize the other file needs the same fix.

**Do this instead:** Extract shared logic to `src/cli/hook-settings.ts` (centralized `HOOK_SETTINGS`, `HOOK_FILES` constants) and `src/cli/templates.ts` (`findTemplatesDir` function). Both `init.ts` and `update.ts` import and reuse. See `.wolf/cerebrum.md` decision log (2026-04-29).

### Path.basename("") Edge Case

**What happens:** Using `path.basename(filePath)` in template strings without validation. If `filePath` is empty, returns `""` silently, producing misleading output like `"Error in "` with trailing space and no filename.

**Why it's wrong:** Bug reports and error logs become unreadable. User cannot identify which file caused an issue.

**Do this instead:** Always validate that `filePath` is non-empty before passing to `path.basename()`. Use: `const basename = filePath ? path.basename(filePath) : "unknown";`. See `.wolf/cerebrum.md` do-not-repeat (2026-04-29).

### Missing .wolf/ Graceful Bailout

**What happens:** Hook runs in a non-OpenWolf project (no `.wolf/` directory). Hook tries to read/write `.wolf/` files and crashes.

**Why it's wrong:** Hooks are registered globally in Claude Code. They run on every project. Crashes pollute user's session logs and break IDE experience for non-OpenWolf projects.

**Do this instead:** Every hook must call `ensureWolfDir()` at the top (`src/hooks/shared.ts`). If `.wolf/` is missing, exit 0 silently. Done in all hooks.

## Error Handling

**Strategy:** Bail out silently (exit 0) in hooks to avoid crashing Claude Code. Log errors to daemon.log and buglog.json for async debugging.

**Patterns:**
- Hooks: `try { ... } catch { process.exit(0); }` — Silent exit prevents IDE crash
- Daemon: `logger.error(msg)` writes to daemon.log and console
- CLI: `throw new Error(msg)` propagates to user; Commander catches and displays
- Buglog: Hooks auto-detect failures in post-write phase and log to buglog.json

## Cross-Cutting Concerns

**Logging:** 
- Hooks: Write to stderr for user visibility (e.g., worktree mode banner)
- Daemon: `src/utils/logger.ts` custom logger (time-stamped, file + console)
- Dashboard: Console.log (browser DevTools)
- CLI: console.log, console.error

**Validation:**
- Paths: `src/utils/paths.ts` normalizePath (OS-agnostic path handling)
- JSON: `src/utils/fs-safe.ts` readJSON with default fallback
- Markdown: `src/hooks/shared.ts` parseAnatomy (regex-based entry parsing)
- Worktrees: `src/utils/worktree.ts` detects via `git worktree list` with 2-second timeout

**Authentication:**
- None — OpenWolf is local-only. All `.wolf/` operations assume single user.

---

*Architecture analysis: 2026-05-14*
