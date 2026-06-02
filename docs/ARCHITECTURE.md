<!-- generated-by: gsd-doc-writer -->

# Architecture

OpenWolf is a token-conscious AI brain for Claude Code projects. It operates as a Node.js CLI tool that installs itself into a project's `.wolf/` directory and provides filesystem scanning, session tracking, a local dashboard, and Claude Code hooks to reduce token waste and preserve context across sessions.

## System Overview

OpenWolf has three independently compiled artifacts that together form a working CLI:

1. **CLI + Core** (`tsc` via `tsconfig.json`) — compiles `bin/` and `src/` (excluding `src/dashboard/app`) to `dist/`. Entry point: `dist/bin/openwolf.js`.
2. **Hooks** (`tsc -p tsconfig.hooks.json`) — compiles `src/hooks/*.ts` into standalone Node scripts that Claude Code executes directly. Hooks run in isolation and cannot import from `src/utils/` at runtime; `src/hooks/shared.ts` is a self-contained copy of needed utilities.
3. **Dashboard** (Vite, `src/dashboard/app`) — a React 19 + TailwindCSS 4 SPA built to `dist/dashboard/`. Served by the Express daemon (`src/daemon/wolf-daemon.ts`).

The CLI is the user-facing interface. The daemon runs in the background, serving the dashboard and running scheduled cron tasks. Hooks integrate with Claude Code's lifecycle events (session start, pre-read, post-read, pre-write, post-write, stop). The scanner maintains an `anatomy.md` file that maps every tracked file to a description and token estimate, which the hooks consult to avoid re-reading files unnecessarily.

## Component Diagram

```mermaid
graph TD
    User[User / Developer]
    CC[Claude Code]
    CLI[CLI<br/>src/cli/]
    Daemon[Daemon<br/>src/daemon/]
    Dashboard[Dashboard SPA<br/>src/dashboard/app/]
    Hooks[Hooks<br/>src/hooks/]
    Scanner[Scanner<br/>src/scanner/]
    Tracker[Tracker<br/>src/tracker/]
    Buglog[Buglog<br/>src/buglog/]
    Templates[Templates<br/>src/templates/]
    Utils[Utils<br/>src/utils/]
    WolfDir[.wolf/ Directory]

    User -->|commands| CLI
    CLI -->|start/stop| Daemon
    CLI -->|init, scan, status| WolfDir
    Daemon -->|serve| Dashboard
    Daemon -->|cron| Scanner
    Daemon -->|API + WebSocket| Dashboard
    CC -->|lifecycle events| Hooks
    Hooks -->|read/write| WolfDir
    Hooks -->|consult| Scanner
    Scanner -->|write| WolfDir
    Tracker -->|read/write| WolfDir
    Buglog -->|read/write| WolfDir
    Templates -->|copy on init| WolfDir
    Utils -->|used by| CLI
    Utils -->|used by| Daemon
    Utils -->|used by| Scanner
    Utils -->|used by| Tracker
    Utils -->|used by| Buglog
```

## Data Flow

A typical OpenWolf interaction flows as follows:

1. **Initialization** (`openwolf init`): The CLI copies templates from `src/templates/` into the project's `.wolf/` directory, compiles hooks, and performs an initial filesystem scan.
2. **Scanning**: `src/scanner/anatomy-scanner.ts` walks the project tree, skipping excluded paths and binary files. For each file, it extracts a description and estimates token count, writing the results to `.wolf/anatomy.md`.
3. **Session Start**: When Claude Code starts a session, the `session-start` hook increments the session counter in `.wolf/token-ledger.json` and logs the start time.
4. **Pre-Read**: Before Claude Code reads a file, the `pre-read` hook checks `anatomy.md`. If the file is already described there, the hook returns the description, avoiding a costly re-read.
5. **Post-Read / Post-Write**: After file operations, these hooks update the token ledger, detect repeated reads, and check if buglog entries should be created or updated.
6. **Session Stop**: The `stop` hook finalizes the session, writes totals to the ledger, and triggers waste detection.
7. **Dashboard**: The user opens `openwolf dashboard`, which launches a browser connected to the local Express daemon. The dashboard fetches project state, health metrics, and file data via authenticated HTTP and WebSocket APIs.

## Key Abstractions

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `createProgram` | Function | Builds the Commander CLI with all subcommands | `src/cli/index.ts` |
| `CronEngine` | Class | Schedules and executes cron tasks, handles retries and dead-letter queue | `src/daemon/cron-engine.ts` |
| `WolfClient` | Class | Dashboard API client for HTTP and WebSocket communication | `src/dashboard/app/lib/wolf-client.ts` |
| `scanProject` | Function | Walks the project tree and writes `anatomy.md` | `src/scanner/anatomy-scanner.ts` |
| `addSessionToLedger` | Function | Appends a completed session to `token-ledger.json` | `src/tracker/token-ledger.ts` |
| `logBug` | Function | Appends a structured bug entry to `.wolf/buglog.json` | `src/buglog/bug-tracker.ts` |
| `safeCompareToken` | Function | Constant-time token comparison for daemon auth | `src/daemon/wolf-daemon.ts` |
| `ensureWolfDir` | Function | Returns the `.wolf/` path or exits silently if missing | `src/hooks/shared.ts` |
| `readJSON` / `writeJSON` | Functions | Safe filesystem helpers with defaults | `src/utils/fs-safe.ts` |
| `Logger` | Class | File-based logger with level filtering | `src/utils/logger.ts` |

## Directory Structure Rationale

The project is organized into three top-level build targets and supporting directories:

```
openwolf/
├── bin/                    # CLI entry point (Node.js shebang, version gate)
├── src/
│   ├── cli/                # Commander subcommands (init, scan, status, dashboard, daemon, cron, bug, update, restore, designqc)
│   ├── daemon/             # Express HTTP server + WebSocket + cron engine + file watcher
│   ├── dashboard/app/      # React 19 SPA (components, hooks, lib, styles)
│   ├── designqc/           # Screenshot capture engine for design quality checks
│   ├── hooks/              # Claude Code lifecycle hooks (6 hooks + shared utilities)
│   ├── scanner/            # Filesystem scanner and description extractors
│   ├── templates/          # Canonical `.wolf/` files copied on init
│   ├── tracker/            # Token estimation and ledger accounting
│   ├── buglog/             # Bug log read/write helpers
│   ├── utils/              # Shared utilities (paths, fs-safe, logger, platform, worktree)
│   └── tests/              # Security and integration tests
├── docs/                   # VitePress documentation site
├── tests/                  # Mirrored test structure (cli, hooks, utils)
├── dist/                   # Build output (CLI + core, hooks, dashboard, templates)
└── .wolf/                  # Runtime project directory (created by init in consumer projects)
```

- **`bin/`**: Contains the single entry point script that imports the compiled CLI from `dist/`. It includes a Node.js version gate (requires Node 20+).
- **`src/cli/`**: Each subcommand lives in its own file. Commands are registered in `index.ts` and loaded on demand to keep startup fast.
- **`src/daemon/`**: The daemon is a long-running Express server. It serves the dashboard static files, exposes authenticated REST and WebSocket APIs, and embeds the cron engine and file watcher.
- **`src/dashboard/app/`**: A modern React SPA built with Vite. It uses lazy-loaded panels, a custom hook (`useWolfData`) for API communication, and TailwindCSS for styling.
- **`src/hooks/`**: These are not imported by the CLI or daemon. They are standalone scripts executed by Claude Code. `shared.ts` is the public API barrel that re-exports utilities from the split internal modules.
- **`src/scanner/`**: `anatomy-scanner.ts` is the main scanner. `description-extractor.ts` and the `extractors/` subdirectory handle language-specific description extraction for TypeScript, JavaScript, Go, PHP, SQL, and other file types.
- **`src/templates/`**: The source of truth for every file that `openwolf init` copies into a project's `.wolf/` directory. Editing these changes what new projects receive.
- **`src/tracker/`**: `token-estimator.ts` calculates token counts. `token-ledger.ts` manages the session ledger. `waste-detector.ts` identifies token waste patterns.
- **`src/buglog/`**: Simple structured JSON read/write for the bug log, with similarity search.
- **`src/utils/`**: Cross-cutting utilities used by CLI, daemon, and scanner. Hooks do not import from here at runtime; they use `src/hooks/shared.ts` instead.
