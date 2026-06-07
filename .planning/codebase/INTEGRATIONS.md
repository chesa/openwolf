# External Integrations

**Analysis Date:** 2026-06-07

## APIs & External Services

**External APIs:**
- None. OpenWolf operates entirely locally. It does not call any third-party REST APIs, SaaS services, or external HTTP endpoints.

**Google Fonts (Dashboard):**
- The SPA dashboard loads Inter and JetBrains Mono fonts from Google Fonts CDN at page load
- Declared in `src/dashboard/app/index.html:7-9`:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  ```
- This is the only external network request made by the dashboard SPA at runtime

## Data Storage

**Databases:**
- None. No database client dependencies are declared. All state is stored as files on the local filesystem under `.wolf/`

**File Storage:**
- Local filesystem only
- `.wolf/` directory holds all persistent state:
  - `.wolf/config.json` — Daemon and dashboard configuration
  - `.wolf/token-ledger.json` — Token usage accounting
  - `.wolf/buglog.json` — Bug tracking entries
  - `.wolf/cron-manifest.json` — Cron task definitions
  - `.wolf/cron-state.json` — Cron engine runtime state
  - `.wolf/designqc-report.json` — Design QC screenshot metadata
  - `.wolf/memory.md` — Session memory
  - `.wolf/anatomy.md` — Project file anatomy map
  - `.wolf/cerebrum.md` — Learning and preferences
  - `.wolf/identity.md` — AI assistant identity
  - `.wolf/OPENWOLF.md` — Project-level OpenWolf configuration
  - `.wolf/daemon-token.tmp` — Random auth token (generated at daemon start, cleaned on shutdown)
  - `.wolf/daemon.log` — Daemon log output

**Caching:**
- None external. The project uses file-based token tracking to cache anatomy lookups (`src/tracker/token-ledger.ts`)

## Authentication & Identity

**Auth Provider:**
- No external auth provider. The daemon generates a random 32-byte hex token at startup (`src/daemon/wolf-daemon.ts:22`)
- Token is written to `.wolf/daemon-token.tmp` with mode `0o600`
- Token is cleaned up on graceful shutdown
- All API requests require `X-Api-Token` header (`src/daemon/wolf-daemon.ts:99-106`)
- WebSocket connections require `Authorization: Bearer` header (`src/daemon/wolf-daemon.ts:333-343`)
- Token is bootstrapped to the browser via URL parameter `?token=` then stored in `sessionStorage` (`src/dashboard/app/main.tsx:10-17`)
- Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks (`src/daemon/wolf-daemon.ts:80-91`)

## Monitoring & Observability

**Error Tracking:**
- None external. Daemon logs to file `.wolf/daemon.log` via `src/utils/logger.ts` (custom Logger class)
- Console output also used (stdout for info, stderr for errors)

**Logs:**
- File-based: `.wolf/daemon.log` with ISO-8601 timestamps and log levels (`debug`, `info`, `warn`, `error`)
- Log level configurable in `.wolf/config.json` under `openwolf.daemon.log_level`

## CI/CD & Deployment

**Hosting:**
- npm registry for CLI package distribution (`package.json` declares `"files": ["dist/", "src/templates/", "LICENSE", "README.md"]`)

**CI Pipeline:**
- GitHub Actions workflow at `.github/workflows/docs.yml`:
  - Triggers on push to `main` affecting `docs/**` or the workflow itself
  - Builds VitePress documentation site
  - Deploys to GitHub Pages using `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`
  - Node.js 20 runtime, `ubuntu-latest` runner

**No other CI/CD pipelines detected.** No Docker, no cloud deployment infrastructure.

## Environment Configuration

**Required env vars:**
- None required at runtime. All configuration is file-based via `.wolf/config.json`

**Optional env vars:**
- `OPENWOLF_PROJECT_ROOT` — Override the project root detection (`src/daemon/wolf-daemon.ts:18`, `src/cli/` commands)

**Secrets location:**
- `.wolf/daemon-token.tmp` — Auto-generated auth token, owner-only read/write, cleaned on shutdown
- `.env`, `.env.*` are gitignored but no code reads them

## Webhooks & Callbacks

**Incoming:**
- None. The daemon is a local-only HTTP server (defaults to `127.0.0.1:18791`) with no webhook endpoints

**Outgoing:**
- None. The daemon does not make any outbound HTTP requests

## Browser Automation (Optional)

**Puppeteer:**
- `puppeteer-core` is an optional dependency (`package.json` optionalDependencies)
- Used by the DesignQC subsystem (`src/designqc/`) for capturing full-page screenshots
- Dynamic import at `src/designqc/designqc-engine.ts:74-76` — graceful fallback if not installed
- Auto-discovers Chrome/Chromium/Edge on the system (`src/designqc/designqc-capture.ts:7-52`)
- Cross-platform detection: macOS (`/Applications/`), Windows (`Program Files`), Linux (`which google-chrome`, `which chromium-browser`)

## Local File System Hooks Integration

**Claude Code Hooks:**
- OpenWolf registers itself as a Claude Code hooks provider (6 hooks at `.wolf/hooks/`)
- Hooks are standalone Node.js scripts compiled from `src/hooks/`
- Hook lifecycle managed by Claude Code CLI, not by OpenWolf's own infrastructure
- Hook settings stored in `.claude/settings.json` (`src/cli/hook-settings.ts`)
- Hooks enforce `ensureWolfDir()` check — silent exit 0 if `.wolf/` not present (safe in non-OpenWolf projects)

---

*Integration audit: 2026-06-07*
