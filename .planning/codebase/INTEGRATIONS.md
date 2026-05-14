# External Integrations

**Analysis Date:** 2026-05-14

## APIs & External Services

**Claude Code (IDE Integration):**
- OpenWolf hooks integrate with Claude Code's hook system
- Hooks: `session-start`, `pre-read`, `post-read`, `pre-write`, `post-write`, `stop`
- Mechanism: Claude Code executes hooks as Node.js scripts during tool calls and session lifecycle
- File location: `src/hooks/` (compiled to `.wolf/hooks/` per `openwolf update`)

**File Browser:**
- Integration point: Claude Code's file read/write tools
- Input: JSON stdin with `tool_name`, `tool_input` containing file paths and content
- Processing: `src/hooks/pre-read.ts`, `src/hooks/post-read.ts`, `src/hooks/post-write.ts`

## Data Storage

**Local Filesystem Only:**
- `.wolf/` directory structure (single project)
- Worktree support: `src/utils/worktree.ts` routes to `.wolf/sessions/{worktreeId}/` per branch
- No cloud/remote storage

**Files Generated/Managed:**
- `.wolf/anatomy.md` - Project file inventory (auto-scanned by `src/scanner/anatomy-scanner.ts`)
- `.wolf/cerebrum.md` - Learning memory and session notes
- `.wolf/memory.md` - Timeline of AI interactions
- `.wolf/config.json` - Daemon/dashboard configuration
- `.wolf/buglog.json` - Bug and issue tracking log
- `.wolf/token-ledger.json` - Token accounting and session history
- `.wolf/cron-manifest.json` - Scheduled task definitions
- `.wolf/hooks/` - Compiled Claude Code integration scripts (copied from `dist/hooks/`)
- `.wolf/sessions/{worktreeId}/` - Per-worktree session state (if using git worktrees)

## Authentication & Identity

**Auth Provider:**
- None - OpenWolf is local-only

**Identity:**
- Project registry: `src/cli/registry.ts` maintains global registry of initialized projects
- Registry stored at: platform-specific (macOS: `~/Library/Application Support/openwolf/`)
- Session identification: UUID format in `_session.json` (started, ended, reads, writes per session)

## Monitoring & Observability

**Error Tracking:**
- `.wolf/buglog.json` - Manual bug logging by user or auto-detected by hooks
- Structure: `id`, `timestamp`, `error_message`, `file`, `root_cause`, `fix`, `tags`, `related_bugs`
- Written by: `src/hooks/post-write.ts` (auto-detects fixes), user via `openwolf bug search`

**Logs:**
- Daemon logs: `.wolf/daemon.log` (file path configured in `src/daemon/wolf-daemon.ts`)
- Log level: Configurable via `.wolf/config.json` (`openwolf.daemon.log_level`)
- Logger: `src/utils/logger.ts` (custom with info/warn/error/debug levels)
- Activity: `.wolf/memory.md` - Human-readable timeline of session summaries

**Token Accounting:**
- `.wolf/token-ledger.json` - Session-by-session token tracking
- Tracks: input/output estimates, reads/writes per file, anatomy hits/misses
- Estimator: `src/tracker/token-estimator.ts` (chars/token ratios by file type)
- Use: Calculate token savings vs. raw CLI usage

## CI/CD & Deployment

**Hosting:**
- npm package (published to npm registry)
- Distributable as global CLI tool: `npm install -g openwolf`
- Git repository: GitHub (https://github.com/cytostack/openwolf.git)

**CI Pipeline:**
- GitHub Actions: `.github/workflows/docs.yml` - Deploys VitePress docs
- No automated test CI detected (tests run locally: `pnpm test`)

**Versioning:**
- Current: 1.0.5-beta
- Package exports: `dist/bin/openwolf.js` (CLI entry point)

## Environment Configuration

**Required env vars (at runtime):**
- `CLAUDE_PROJECT_DIR` - Current project directory (set by Claude Code environment)
- `OPENWOLF_PROJECT_ROOT` - Override for daemon to find `.wolf/` (set by CLI commands)

**Secrets location:**
- `.env*` files explicitly excluded from anatomy scanning (`src/scanner/anatomy-scanner.ts` ALWAYS_EXCLUDE_FILES)
- No secrets management built-in (projects use their own .env handling)

**Optional Configuration:**
- `.wolf/config.json` - Daemon port (default 18790), dashboard port (18791), log level, cron settings
- `.wolf/cron-manifest.json` - Custom cron task definitions

## Webhooks & Callbacks

**Incoming:**
- Daemon WebSocket: `ws://localhost:18790/ws` (live dashboard updates)
- Daemon REST API: `GET /api/health`, `GET /api/files/*`, `POST /api/cron/run`
- File watcher: `src/daemon/file-watcher.ts` watches `.wolf/` for changes, broadcasts via WebSocket

**Outgoing:**
- None - OpenWolf does not call external services
- Design QC can capture screenshots if Puppeteer Core available (optional, used for UI review)

## Dashboard Client-Server

**Connection:**
- Dashboard: Served from `dist/dashboard/` by Express static middleware
- WebSocket client: `src/dashboard/app/lib/wolf-client.ts` (auto-reconnect, message handlers)
- Heartbeat: Cron engine sends heartbeat every 30 minutes (configurable in config.json)

**Data Sync:**
- File watcher (`src/daemon/file-watcher.ts`) detects `.wolf/` file changes
- Pushes file updates via WebSocket to connected dashboard clients
- Dashboard parses: `anatomy.md`, `cerebrum.md`, `memory.md`, `buglog.json`, `token-ledger.json`

---

*Integration audit: 2026-05-14*
