# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```
openwolf/
├── bin/                           # CLI entry point
│   └── openwolf.ts                # Thin wrapper, exports createProgram()
├── src/
│   ├── cli/                       # User commands (init, status, daemon, etc.)
│   │   ├── index.ts               # Command factory, registers all subcommands
│   │   ├── init.ts                # openwolf init — set up .wolf/ in project
│   │   ├── status.ts              # openwolf status — daemon health, last session stats
│   │   ├── scan.ts                # openwolf scan — force anatomy rescan
│   │   ├── dashboard.ts           # openwolf dashboard — open browser to dashboard
│   │   ├── daemon-cmd.ts          # daemon start/stop/restart/logs
│   │   ├── cron-cmd.ts            # cron list/run/retry
│   │   ├── bug-cmd.ts             # bug search <term>
│   │   ├── designqc-cmd.ts        # designqc [target] — screenshot capture
│   │   ├── update.ts              # openwolf update — update all projects
│   │   ├── hook-settings.ts       # Shared hook constants, merge logic
│   │   ├── templates.ts           # findTemplatesDir() helper
│   │   ├── registry.ts            # Project registry management
│   │   └── *.test.ts              # Unit tests for CLI commands
│   ├── hooks/                     # Claude Code integration (6 hooks)
│   │   ├── session-start.ts       # Initialize session state
│   │   ├── pre-read.ts            # Before file read
│   │   ├── post-read.ts           # After file read (log, token estimate)
│   │   ├── pre-write.ts           # Before file write (warn if risky)
│   │   ├── post-write.ts          # After file write (update anatomy, detect fixes)
│   │   ├── stop.ts                # Session end (warn if unsaved edits)
│   │   ├── shared.ts              # Utilities used by all hooks
│   │   ├── worktree-helper.ts     # Git worktree detection
│   │   └── *.test.ts              # Hook unit tests
│   ├── daemon/                    # Background services
│   │   ├── wolf-daemon.ts         # Express server, WebSocket, main entry
│   │   ├── cron-engine.ts         # Task scheduler (node-cron)
│   │   ├── file-watcher.ts        # Monitor .wolf/ for changes
│   │   └── health.ts              # GET /api/health endpoint
│   ├── scanner/                   # Project file analysis
│   │   ├── anatomy-scanner.ts     # Enumerate files, estimate tokens
│   │   ├── description-extractor.ts # Extract JSDoc, file purpose
│   │   └── project-root.ts        # Detect project root
│   ├── tracker/                   # Token usage accounting
│   │   ├── token-ledger.ts        # Read/write token-ledger.json
│   │   ├── token-estimator.ts     # Character-to-token ratio estimation
│   │   └── waste-detector.ts      # Detect unused imports (placeholder)
│   ├── dashboard/app/             # React 19 frontend (separate Vite build)
│   │   ├── App.tsx                # Root component
│   │   ├── main.tsx               # React mount point
│   │   ├── index.html             # Dashboard HTML
│   │   ├── vite.config.ts         # Vite build config
│   │   ├── components/
│   │   │   ├── layout/            # Header, Sidebar, Layout
│   │   │   ├── panels/            # ProjectOverview, ActivityTimeline, BugLog, etc.
│   │   │   └── shared/            # StatusBadge, TokenBadge, EmptyState
│   │   ├── hooks/                 # React hooks (useLiveUpdates, useWolfData, useTheme)
│   │   ├── lib/                   # Client utilities
│   │   │   ├── wolf-client.ts     # WebSocket client
│   │   │   ├── file-parsers.ts    # Parse anatomy.md, cerebrum.md, etc.
│   │   │   └── utils.ts           # formatTokens(), relativeTime(), etc.
│   │   └── styles/                # globals.css, TailwindCSS
│   ├── designqc/                  # Screenshot capture for UI review
│   │   ├── designqc-engine.ts     # Main orchestrator
│   │   ├── designqc-capture.ts    # Puppeteer integration
│   │   └── designqc-types.ts      # DesignQCOptions, Viewport
│   ├── buglog/                    # Bug log helpers
│   │   ├── bug-tracker.ts         # readBugLog, logBug, searchBugs
│   │   └── bug-matcher.ts         # Re-export for convenience
│   ├── utils/                     # Shared utilities (used everywhere)
│   │   ├── fs-safe.ts             # readJSON, writeJSON, readText, appendText (atomic writes)
│   │   ├── logger.ts              # Custom Logger (file + console, levels)
│   │   ├── paths.ts               # Path normalization, getWolfDir, ensureDir
│   │   ├── platform.ts            # Platform detection (isWindows, isMac, isLinux)
│   │   ├── worktree.ts            # Git worktree detection and routing
│   │   └── *.test.ts              # Utility tests
│   └── templates/                 # Files copied to .wolf/ on init
│       ├── OPENWOLF.md            # Operating protocol (user reads this)
│       ├── cerebrum.md            # Learning memory template
│       ├── anatomy.md             # Initial anatomy template
│       ├── memory.md              # Session timeline template
│       ├── config.json            # Default daemon/dashboard config
│       ├── cron-manifest.json     # Default cron tasks (empty)
│       ├── cron-state.json        # Cron state tracking
│       ├── buglog.json            # Empty bug log
│       ├── token-ledger.json      # Empty token ledger
│       ├── identity.md            # Project identity (name, owner)
│       ├── reframe-frameworks.md  # UI framework migration guide
│       ├── claude-md-snippet.md   # Snippet to add to CLAUDE.md
│       └── claude-rules-openwolf.md # Rules to add to .claude/rules/
├── docs/                          # VitePress documentation site
│   ├── index.md, getting-started.md, commands.md, etc.
│   ├── .vitepress/config.ts       # VitePress config
│   └── .vitepress/theme/          # Custom theme CSS
├── .github/workflows/             # CI/CD
│   └── docs.yml                   # Deploy docs on push
├── .claude/                       # Claude Code project config
│   ├── rules/openwolf.md          # Project-specific rules
│   └── settings.json              # IDE settings
├── .codegraph/                    # CodeGraph (semantic index, if initialized)
├── .wolf/                         # OpenWolf instance for this project (auto-created)
│   ├── anatomy.md                 # Project file inventory
│   ├── cerebrum.md                # Learning memory
│   ├── memory.md                  # Session timeline
│   ├── config.json                # Daemon/dashboard config
│   ├── buglog.json                # Bug log
│   ├── token-ledger.json          # Token usage history
│   ├── cron-manifest.json         # Scheduled tasks
│   ├── daemon.log                 # Daemon output (if running)
│   └── hooks/                     # Compiled Claude Code hooks (copied from dist/hooks/)
├── dist/                          # Compiled output (gitignored)
│   ├── bin/                       # Compiled CLI entry
│   ├── src/                       # Compiled CLI + core (tsc output)
│   ├── hooks/                     # Compiled hooks (tsconfig.hooks.json output)
│   ├── dashboard/                 # Dashboard SPA (Vite output)
│   └── templates/                 # Template files (copied verbatim)
├── package.json                   # Node.js manifest
├── pnpm-lock.yaml                 # pnpm lock file
├── tsconfig.json                  # TypeScript config (CLI + core)
├── tsconfig.hooks.json            # TypeScript config (hooks only)
├── vitest.config.ts               # Test runner config
├── CLAUDE.md                      # Claude Code guidance (this project)
├── README.md                      # Project readme
├── LICENSE                        # AGPL-3.0 license
└── CONTRIBUTING.md                # Contribution guidelines
```

## Directory Purposes

**`bin/`:**
- Purpose: CLI executable entry point
- Contains: `openwolf.ts` (wraps `src/cli/index.ts`)
- Compiled to: `dist/bin/openwolf.js`
- Distributed as: `bin` field in package.json (symlinked to global `openwolf` command)

**`src/cli/`:**
- Purpose: All user-facing commands
- Contains: Command handlers (init, status, scan, daemon, etc.), registry, template locator
- Key files: `index.ts` (router), `init.ts` (setup), `update.ts` (bulk update)
- Tests: `*.test.ts` files (Vitest)

**`src/hooks/`:**
- Purpose: Claude Code IDE integration (fires on session/tool events)
- Contains: 6 hooks + shared utilities (worktree detection, token estimation, file I/O)
- Compiled to: `dist/hooks/` (then copied to `.wolf/hooks/` by `openwolf update`)
- Critical: `shared.ts` re-exports utilities (cannot import from `src/utils/` at hook runtime)

**`src/daemon/`:**
- Purpose: Optional background services (HTTP API, WebSocket, cron scheduling)
- Contains: Express server, cron engine, file watcher, health checks
- Listens: Ports 18790 (API/WebSocket), 18791 (dashboard static files)
- Logs to: `.wolf/daemon.log`

**`src/scanner/`:**
- Purpose: Analyze project filesystem and generate `anatomy.md`
- Contains: File enumeration, token ratio calibration, JSDoc/comment extraction
- Called by: `openwolf scan` (CLI), `post-write` hook (incremental)
- Respects: `.gitignore`, `config.json` exclude patterns

**`src/tracker/`:**
- Purpose: Token usage accounting and ledger maintenance
- Contains: Token estimation, session aggregation, waste detection
- Writes to: `.wolf/token-ledger.json` (append-only)
- Used by: Dashboard (visualize token usage over time)

**`src/dashboard/app/`:**
- Purpose: React SPA for project monitoring
- Contains: Components (panels, layout, shared), hooks, WebSocket client
- Built with: Vite + React 19 + TailwindCSS 4
- Output: `dist/dashboard/` (static files served by daemon)
- Entry: `App.tsx` (root component), `main.tsx` (React mount)

**`src/utils/`:**
- Purpose: Shared utilities used across CLI, hooks, daemon, scanner
- Contains: Path normalization, JSON I/O, logging, worktree detection, platform detection
- Critical for hooks: `src/hooks/shared.ts` re-exports needed functions (cannot depend on `src/utils/` at runtime)

**`src/templates/`:**
- Purpose: Canonical `.wolf/` files copied to projects on `openwolf init`
- Contains: `OPENWOLF.md`, `cerebrum.md`, `config.json`, etc.
- Update strategy: Changes here affect all future `openwolf init` runs
- Distributed as: Copied to `dist/templates/` during build, included in npm package

**`docs/`:**
- Purpose: User-facing documentation (VitePress site)
- Built with: VitePress 1.6.4
- Output: `dist/docs/` (hosted at docs.openwolf.io)
- CI: GitHub Actions deploy on push

## Key File Locations

**Entry Points:**
- CLI: `bin/openwolf.ts` → `src/cli/index.ts`
- Daemon: `src/daemon/wolf-daemon.ts` (Express app, WebSocket, cron)
- Dashboard: `src/dashboard/app/index.html` (HTML entry), `App.tsx` (React root)
- Hooks: Each of `src/hooks/{session-start,pre-read,post-read,pre-write,post-write,stop}.ts`

**Configuration:**
- `tsconfig.json` - TypeScript compiler options (CLI + core)
- `tsconfig.hooks.json` - TypeScript for hooks (separate build)
- `vitest.config.ts` - Test runner
- `.wolf/config.json` - Daemon/dashboard settings (created by init)
- `.claude/rules/openwolf.md` - Project-specific Claude Code rules

**Core Logic:**
- Scanner: `src/scanner/anatomy-scanner.ts` (enumerates files)
- Token tracker: `src/tracker/token-ledger.ts` (maintains ledger)
- Daemon: `src/daemon/wolf-daemon.ts` (HTTP API, WebSocket)
- Hooks: `src/hooks/shared.ts` (utilities), `post-write.ts` (auto-updates)

**Testing:**
- Test files: `src/**/*.test.ts` (co-located with source)
- Config: `vitest.config.ts` (Node environment, includes pattern)
- Run: `pnpm test` (all), `pnpm test:watch` (watch mode)

## Naming Conventions

**Files:**
- Kebab-case for files: `anatomy-scanner.ts`, `token-ledger.ts`, `file-watcher.ts`
- Exception: Component files PascalCase: `App.tsx`, `Header.tsx`
- Test files: `*.test.ts` (co-located with source)

**Directories:**
- Kebab-case for directories: `src/cli/`, `src/utils/`, `src/scanner/`
- React components: PascalCase under `dashboard/app/components/`

**Exports:**
- Named exports for utilities: `export function getWolfDir()`, `export interface WorktreeContext`
- Default export for CLI commands: `export default async function initCommand()`
- React components: Default export for lazy-loaded panels

**Variables:**
- camelCase for functions, variables: `parseAnatomy()`, `ensureWolfDir()`
- UPPER_SNAKE_CASE for constants: `BINARY_EXTENSIONS`, `ALWAYS_EXCLUDE_FILES`, `HOOK_FILES`
- kebab-case for JSON keys (snake_case): `"token_ledger"`, `"files_read"`, `"session_id"`

**Types:**
- PascalCase for interfaces/types: `WorktreeContext`, `AnatomyEntry`, `SessionData`, `BugEntry`
- PascalCase for classes: `Logger`, `WolfClient`, `CronEngine`

## Where to Add New Code

**New CLI Command:**
- Implementation: `src/cli/new-cmd.ts` (export function)
- Registration: Add to `src/cli/index.ts` (add `.command('name')` to program)
- Tests: `src/cli/new-cmd.test.ts` (co-located)
- Example: `src/cli/designqc-cmd.ts`

**New Hook Event:**
- File: `src/hooks/event-name.ts`
- Shared utilities: Add to `src/hooks/shared.ts` (self-contained, no imports from `src/utils/`)
- Tests: `src/hooks/event-name.test.ts`
- Note: Must be compiled to `dist/hooks/`, then copied to `.wolf/hooks/` via `openwolf update`

**New Dashboard Panel:**
- Component: `src/dashboard/app/components/panels/PanelName.tsx`
- Register in: `src/dashboard/app/components/layout/Sidebar.tsx` (add navItem)
- Hook for data: Create/use in `src/dashboard/app/hooks/useWolfData.ts`
- Style: Use TailwindCSS utility classes (no separate CSS files needed)

**New Daemon Endpoint:**
- Implementation: Add route to `src/daemon/wolf-daemon.ts` (e.g., `app.get('/api/...', ...)`)
- Logic: Extract to separate file if >50 lines (e.g., `src/daemon/health.ts`)
- WebSocket broadcast: Use `wsClients.forEach(ws => ws.send(...))` in file-watcher callback

**New Utility:**
- File: `src/utils/feature.ts` (or expand existing file if <50 lines)
- Export: Named exports (no default export)
- Usage: Import in CLI, daemon, scanner (hooks must re-export via shared.ts if needed)

**New Template:**
- File: `src/templates/template-name.{md|json}`
- Distribution: Automatically copied to `dist/templates/` during build
- Used by: `openwolf init` (via `findTemplatesDir()`)

## Special Directories

**`.wolf/` (Instance Directory):**
- Purpose: OpenWolf state for a specific project
- Generated by: `openwolf init`
- Committed: Typically YES (except `.wolf/daemon.log`, `.wolf/sessions/`)
- Anatomy: Created per-project; shared across users if repository is multi-user
- Worktree support: `.wolf/sessions/{worktreeId}/` per branch (if using git worktrees)

**`.gitignore` inclusions:**
- `dist/` - Compiled output (rebuild with `pnpm build`)
- `node_modules/` - Dependencies (run `pnpm install`)
- `.DS_Store` - macOS metadata
- `.env*` - Environment variables (explicitly excluded from anatomy)

**`dist/` (Compile Output):**
- Generated by: `pnpm build` (or `pnpm build:*`)
- Not committed: Listed in `.gitignore`
- Contents:
  - `dist/bin/` - Compiled CLI
  - `dist/src/` - Compiled core and daemon
  - `dist/hooks/` - Compiled hooks (copied to `.wolf/hooks/` on update)
  - `dist/dashboard/` - Vite SPA build
  - `dist/templates/` - Template files

---

*Structure analysis: 2026-05-14*
