# Codebase Structure

**Analysis Date:** 2026-06-07

## Directory Layout

```
openwolf/
├── bin/                    # CLI entry point
│   └── openwolf.ts
├── src/                    # All source code
│   ├── cli/                # Commander-based CLI commands
│   ├── hooks/              # Claude Code hook scripts (independently compiled)
│   ├── daemon/             # Express + WebSocket daemon server
│   ├── scanner/            # Filesystem scanner and anatomy builder
│   │   └── extractors/     # Language-specific description extractors
│   ├── tracker/            # Token estimation, ledger, waste detection
│   ├── buglog/             # Bug memory (JSON-based)
│   ├── designqc/           # Design QC screenshot capture engine
│   ├── dashboard/          # React SPA dashboard
│   │   └── app/            # Vite + React 19 + TailwindCSS 4
│   │       ├── components/ # React components
│   │       │   ├── layout/ # Header, Sidebar, Layout shell
│   │       │   ├── panels/ # 10 feature panels
│   │       │   └── shared/ # Shared UI components
│   │       ├── hooks/      # Custom React hooks
│   │       └── lib/        # API client, utilities
│   └── utils/              # Shared utilities
├── tests/                  # Test files (mirrors src/ layout)
│   ├── cli/
│   ├── hooks/
│   └── utils/
├── docs/                   # VitePress documentation site
├── .wolf/                  # Runtime state (generated, not committed)
└── scripts/                # Build/dev scripts
```

## Directory Purposes

**`bin/`:**
- Purpose: CLI entry point with Node.js version check
- Contains: `openwolf.ts` (12 lines) — imports and runs `createProgram()` from `src/cli/index.js`
- Key files: `bin/openwolf.ts`

**`src/cli/`:**
- Purpose: All user-facing CLI commands
- Contains: 14 TypeScript modules — one per command/concern
- Key files:
  - `src/cli/index.ts`: Registers all subcommands via Commander.js
  - `src/cli/init.ts`: `openwolf init` — project initialization and upgrades
  - `src/cli/scan.ts`: `openwolf scan` — force anatomy rescan
  - `src/cli/status.ts`: `openwolf status` — daemon health, file integrity, session stats
  - `src/cli/dashboard.ts`: `openwolf dashboard` — fork daemon, open browser
  - `src/cli/update.ts`: `openwolf update` — bulk upgrade all registered projects
  - `src/cli/registry.ts`: Central project registry at `~/.openwolf/registry.json`
  - `src/cli/hook-settings.ts`: Canonical hook registration with WOLF_ROOT resolution
  - `src/cli/hook-copy.ts`: Dynamic hook file deployment via directory scan
  - `src/cli/templates.ts`: Template directory resolver
  - `src/cli/daemon-cmd.ts`: Daemon lifecycle management (start/stop/restart/logs)
  - `src/cli/cron-cmd.ts`: Cron task inspection and manual trigger/retry
  - `src/cli/designqc-cmd.ts`: Design QC command handler
  - `src/cli/bug-cmd.ts`: Bug memory search command

**`src/hooks/`:**
- Purpose: Claude Code hook scripts — these run as standalone Node.js processes
- Contains: 6 hook scripts, `shared.ts` barrel, 8 internal modules
- Key files:
  - `src/hooks/shared.ts`: Public barrel API — re-exports 18 named values from internal modules
  - `src/hooks/session-start.ts`: Session initialization, worktree detection, memory logging
  - `src/hooks/pre-read.ts`: Track read counts, warn on repeated reads
  - `src/hooks/post-read.ts`: Token estimation after file read
  - `src/hooks/pre-write.ts`: Cerebrum DNR check, buglog lookup before edits
  - `src/hooks/post-write.ts`: Track writes, update anatomy descriptions, nudge cerebrum/STATUS
  - `src/hooks/stop.ts`: Session finalization, ledger update, health checks
  - `src/hooks/wolf-paths.ts`: Worktree-aware path resolution for `.wolf/` and session dirs
  - `src/hooks/wolf-files.ts`: Directory/file existence checks, `.wolf/` file detection
  - `src/hooks/wolf-json.ts`: Atomic JSON I/O with file locking
  - `src/hooks/wolf-lock.ts`: Advisory file locking with staleness recovery
  - `src/hooks/wolf-anatomy.ts`: Anatomy markdown parser/serializer
  - `src/hooks/wolf-describe.ts`: Compact hook-side file description extractor (subset of scanner's)
  - `src/hooks/wolf-misc.ts`: Token estimation, timestamps, stdin reader
  - `src/hooks/worktree-helper.ts`: Raw git worktree detection via `git rev-parse`

**`src/daemon/`:**
- Purpose: Long-running background server
- Contains: 4 modules
- Key files:
  - `src/daemon/wolf-daemon.ts`: Express + WebSocket server (495 lines) — main daemon
  - `src/daemon/cron-engine.ts`: node-cron scheduler with retry, dead-letter queue, cooldowns
  - `src/daemon/file-watcher.ts`: chokidar-based `.wolf/` file change watcher with WebSocket broadcast
  - `src/daemon/health.ts`: Health status endpoint logic

**`src/scanner/`:**
- Purpose: Project filesystem scanning and anatomy documentation
- Contains: 2 modules + 4 extractors
- Key files:
  - `src/scanner/anatomy-scanner.ts`: Full filesystem walker, exclude patterns, anatonomy build (286 lines)
  - `src/scanner/description-extractor.ts`: Language-aware description extraction (305 lines, 200+ known files)
  - `src/scanner/project-root.ts`: Project root detection via markers (.git, package.json, etc.)
  - `src/scanner/extractors/extract-web.ts`, `extract-systems.ts`, `extract-scripting.ts`, `extract-data.ts`: Specialized language extractors

**`src/tracker/`:**
- Purpose: Token usage tracking and analytics
- Contains: 3 modules
- Key files:
  - `src/tracker/token-estimator.ts`: Content-type based token estimation
  - `src/tracker/token-ledger.ts`: Ledger file read/write with session archival
  - `src/tracker/waste-detector.ts`: Pattern detection for token waste (repeated reads, large files)

**`src/buglog/`:**
- Purpose: Bug memory management
- Contains: 2 modules
- Key files:
  - `src/buglog/bug-tracker.ts`: Bug CRUD, fuzzy deduplication, search
  - `src/buglog/bug-matcher.ts`: Convenience re-exports

**`src/designqc/`:**
- Purpose: Design quality control screenshot capture
- Contains: 3 modules
- Key files:
  - `src/designqc/designqc-engine.ts`: Capture orchestration class
  - `src/designqc/designqc-capture.ts`: Chrome/puppeteer integration, route detection, screenshot capture
  - `src/designqc/designqc-types.ts`: TypeScript interfaces for DesignQC

**`src/dashboard/app/`:**
- Purpose: React SPA for visual monitoring
- Contains: Full Vite + React 19 + TailwindCSS 4 app
- Key files:
  - `src/dashboard/app/App.tsx`: Main app with lazy-loaded panels
  - `src/dashboard/app/components/layout/`: Sidebar, Header, Layout
  - `src/dashboard/app/components/panels/`: 10 panels (Overview, Activity, Tokens, Cron, Cerebrum, Memory, Anatomy, Bugs, AI Suggestions, DesignQC)
  - `src/dashboard/app/components/shared/`: EmptyState, TokenBadge, StatusBadge, LiveIndicator
  - `src/dashboard/app/hooks/`: useWolfData, useLiveUpdates, useTheme
  - `src/dashboard/app/lib/`: wolf-client.ts (API client), file-parsers.ts, utils.ts

**`src/utils/`:**
- Purpose: Shared infrastructure that hooks CANNOT depend on
- Contains: 6 modules
- Key files:
  - `src/utils/fs-safe.ts`: Atomic JSON/text I/O with deep merge defaults
  - `src/utils/logger.ts`: Level-based file + console logger
  - `src/utils/paths.ts`: Path resolution with traversal protection
  - `src/utils/platform.ts`: OS detection (win/mac/linux)
  - `src/utils/worktree.ts`: Safe worktree detection wrapper
  - `src/utils/extensions.ts`: File extension classification (code/prose)

**`src/templates/`:**
- Purpose: Canonical versions of all `.wolf/` initialization files
- Contains: 15 files copied verbatim on `openwolf init`
- Key files:
  - `OPENWOLF.md`: Primary protocol doc users read every session
  - `cerebrum.md`: Session-crossing learnings template
  - `memory.md`: Session log template
  - `anatomy.md`: Empty anatomy placeholder
  - `config.json`: Daemon/dashboard/cron config with defaults
  - `cron-manifest.json`, `cron-state.json`: Cron schedule templates
  - `identity.md`: Project identity template
  - `buglog.json`, `token-ledger.json`: Empty state templates

**`tests/`:**
- Purpose: Vitest test suite
- Contains: 10 test files mirroring `src/` structure
- Key files:
  - `tests/cli/init.test.ts`: Tests for init command
  - `tests/cli/status.test.ts`: Tests for status command
  - `tests/cli/hook-settings.test.ts`: Tests for hook settings merge logic
  - `tests/hooks/shared.test.ts`: Tests for hook shared utilities
  - `tests/hooks/stop.test.ts`: Tests for stop hook session finalization
  - `tests/hooks/session-start.test.ts`: Tests for session initialization
  - `tests/utils/worktree.test.ts`: Unit tests for worktree detection
  - `tests/utils/worktree.integration.test.ts`: Integration tests for worktree
  - `tests/security.test.ts`: Security-focused tests

**`docs/`:**
- Purpose: VitePress documentation site
- Contains: `.vitepress/` config/theme, 10+ markdown pages
- Key files: `docs/getting-started.md`, `docs/ARCHITECTURE.md`, `docs/hooks.md`, `docs/commands.md`, `docs/dashboard.md`

## Key File Locations

**Entry Points:**
- `bin/openwolf.ts`: CLI binary
- `src/cli/index.ts`: Commander program factory
- `src/daemon/wolf-daemon.ts`: Daemon server start
- `src/dashboard/app/main.tsx`: React SPA mount
- `src/hooks/session-start.ts`: Hook lifecycle start
- `src/hooks/stop.ts`: Hook lifecycle end

**Configuration:**
- `package.json`: npm package config, scripts (pnpm build, dev, test, etc.)
- `tsconfig.json`: TypeScript config for CLI + core (compiles to `dist/`)
- `tsconfig.hooks.json`: TypeScript config for hooks (compiles to `dist/hooks/`)
- `vitest.config.ts`: Test runner config
- `src/dashboard/app/vite.config.ts`: Dashboard build config

**Core Logic:**
- `src/cli/init.ts`: Project initialization
- `src/scanner/anatomy-scanner.ts`: File scanning and anatomy building
- `src/daemon/wolf-daemon.ts`: HTTP/WS server, API endpoints
- `src/daemon/cron-engine.ts`: Scheduled task engine
- `src/hooks/post-write.ts`: Most complex hook (587 lines) — tracks writes, updates anatomy, nudges user
- `src/hooks/stop.ts`: Session finalization
- `src/tracker/token-ledger.ts`: Token persistence

**Testing:**
- `tests/`: All tests are co-located here (not co-located with source)
- `vitest.config.ts`: Config at project root

## Naming Conventions

**Files:**
- `kebab-case.ts` for all TypeScript source files: `anatomy-scanner.ts`, `wolf-daemon.ts`, `token-ledger.ts`
- `PascalCase.tsx` for React components: `Sidebar.tsx`, `TokenBadge.tsx`
- `kebab-case.md` for documentation: `getting-started.md`, `how-it-works.md`

**Functions:**
- `camelCase` for all functions, methods, and variables: `extractDescription()`, `scanProject()`, `ensureWolfDir()`
- `PascalCase` for classes and types: `CronEngine`, `DesignQCEngine`, `Logger`, `WorktreeContext`

**Constants:**
- `UPPER_SNAKE_CASE` for module-level constants: `LOCK_TTL_MS`, `MAX_RETRIES`, `HOOK_SETTINGS`, `ALWAYS_OVERWRITE`

**Exports:**
- Named exports preferred over default exports
- Barrel pattern in `src/hooks/shared.ts` — single re-export hub

## Where to Add New Code

**New Feature:**
- Primary code: `src/cli/{feature-name}.ts` (CLI command handler), plus subsystem in appropriate directory
- Tests: `tests/cli/{feature-name}.test.ts` or `tests/{subsystem}/{feature-name}.test.ts`
- Example: A new `openwolf analyze` command would add `src/cli/analyze.ts`, `src/analyzer/`, and `tests/cli/analyze.test.ts`

**New Hook Script:**
- Implementation: `src/hooks/{hook-name}.ts`
- Registration: Add to `HOOK_SETTINGS` in `src/cli/hook-settings.ts`
- Shared utilities: Import from `src/hooks/shared.js` (not from `src/utils/`)
- Do NOT add new exports to `shared.ts` for barrel — add module then export it through `shared.ts`

**New React Dashboard Panel:**
- Component: `src/dashboard/app/components/panels/{PanelName}.tsx`
- Register in `src/dashboard/app/App.tsx` — add `lazy()` import and panel title mapping
- API/fetch logic goes in `src/dashboard/app/lib/` if shared, or inline in the panel

**New Utility:**
- If hooks need it: Add to `src/hooks/` (e.g., `src/hooks/wolf-{name}.ts`), export through `src/hooks/shared.ts`
- If only CLI/daemon needs it: Add to `src/utils/{name}.ts`

**New Configuration:**
- `.wolf/` template: Add file to `src/templates/` and reference in `src/cli/init.ts` as `ALWAYS_OVERWRITE` or `CREATE_IF_MISSING`
- Config schema: Add to `WolfConfig` interface in consumner file

## Special Directories

**`.wolf/`:**
- Purpose: Runtime state directory — all user data, session state, and configuration
- Generated: Yes (by `openwolf init`)
- Committed: No (in `.gitignore`)
- Key contents: `anatomy.md`, `cerebrum.md`, `memory.md`, `config.json`, `token-ledger.json`, `buglog.json`, `cron-manifest.json`, `cron-state.json`, `identity.md`, `STATUS.md`, `hooks/`, `sessions/` (for worktrees)

**`dist/`:**
- Purpose: Compiled output
- Generated: Yes (by `pnpm build`)
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: Dependencies
- Generated: Yes
- Committed: No

**`docs/.vitepress/dist/`:**
- Purpose: Compiled VitePress documentation site
- Generated: Yes (by `pnpm docs:build`)
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-06-07*
