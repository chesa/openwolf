<!-- generated-by: gsd-doc-writer -->

# Configuration

OpenWolf is configured through a JSON file in the project workspace and a small set of environment variables. All settings have sensible defaults, so no configuration is required for normal use.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENWOLF_PROJECT_ROOT` | Optional | Auto-detected | Absolute path to the project root. The CLI sets this when spawning the daemon and dashboard so they resolve the correct `.wolf/` directory regardless of working directory. |
| `CLAUDE_PROJECT_DIR` | Optional | `process.cwd()` | Set by Claude Code to the active project directory. Hooks read this to locate the `.wolf/` folder and write session data. |
| `PROGRAMFILES` | Optional | `C:\Program Files` | Windows only. Used by DesignQC to discover Chrome or Edge installations. |
| `PROGRAMFILES(X86)` | Optional | `C:\Program Files (x86)` | Windows only. Used by DesignQC to discover 32-bit browser installations. |
| `LOCALAPPDATA` | Optional | — | Windows only. Used by DesignQC to discover user-local Chrome installations. |
| `ANTHROPIC_API_KEY` | Optional | — | If present in the environment, the cron engine removes it before invoking `claude -p` so that OAuth subscription credentials are used instead of a potentially depleted API key. |

## Config file format

The primary configuration file is `.wolf/config.json` in the project root. It is created automatically by `openwolf init` and is never overwritten by `openwolf update` so that user customizations are preserved.

The file is a single JSON object with a `version` key and an `openwolf` namespace:

```json
{
  "version": 1,
  "openwolf": {
    "anatomy": { ... },
    "token_audit": { ... },
    "cron": { ... },
    "memory": { ... },
    "cerebrum": { ... },
    "daemon": { ... },
    "dashboard": { ... },
    "designqc": { ... }
  }
}
```

### `anatomy`

Controls the project file scanner.

| Key | Default | Description |
|-----|---------|-------------|
| `auto_scan_on_init` | `true` | Run a full scan during `openwolf init` (template default; not yet read by source code) |
| `rescan_interval_hours` | `6` | How often the daemon rescans the project (template default; not yet read by source code) |
| `max_description_length` | `100` | Max characters for file descriptions (template default; not yet read by source code — description length is hardcoded to 150 in `src/scanner/description-extractor.ts`) |
| `max_files` | `500` | Stop scanning after this many files |
| `exclude_patterns` | *(see below)* | Directories and patterns to skip |

**Default `exclude_patterns`:**

```json
[
  "node_modules", ".git", "dist", "build", ".wolf",
  ".next", ".nuxt", "coverage", "__pycache__", ".cache",
  "target", ".vscode", ".idea", ".turbo", ".vercel",
  ".netlify", ".output", "*.min.js", "*.min.css"
]
```

### `token_audit`

Controls token estimation and waste detection.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable token tracking (template default; not yet read by source code) |
| `report_frequency` | `"weekly"` | How often to generate waste reports (template default; not yet read by source code) |
| `waste_threshold_percent` | `15` | Alert when waste exceeds this percentage (template default; not yet read by source code) |
| `chars_per_token_code` | `3.5` | Character-to-token ratio for code files (template default; not yet read by source code — the scanner uses hardcoded ratios in `src/scanner/anatomy-scanner.ts`) |
| `chars_per_token_prose` | `4.0` | Character-to-token ratio for prose files (template default; not yet read by source code — the scanner uses hardcoded ratios in `src/scanner/anatomy-scanner.ts`) |

### `cron`

Controls the daemon's task scheduler.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable cron tasks |
| `max_retry_attempts` | `3` | Times to retry a failed task before dead-lettering (template default; not yet read by source code — retry configuration comes from each task's definition in `cron-manifest.json`) |
| `dead_letter_enabled` | `true` | Move exhausted tasks to dead letter queue (template default; not yet read by source code — dead-letter behavior is per-task in `cron-manifest.json`) |
| `heartbeat_interval_minutes` | `30` | Daemon health check frequency |
| `use_claude_p` | `true` | Use `claude -p` (subscription) for AI-powered tasks (template default; not yet read by source code — AI tasks always invoke `claude -p` regardless of this setting) |
| `api_key_env` | `null` | Environment variable name for an API key override (template default; not yet read by source code — the cron engine always deletes `ANTHROPIC_API_KEY` unconditionally) |

### `memory`

Controls the action log.

| Key | Default | Description |
|-----|---------|-------------|
| `consolidation_after_days` | `7` | Compress sessions older than this (template default; not yet read by source code — the consolidation task uses a hardcoded default of `7` days) |
| `max_entries_before_consolidation` | `200` | Force consolidation at this count (template default; not yet read by source code) |

### `cerebrum`

Controls the learning memory.

| Key | Default | Description |
|-----|---------|-------------|
| `max_tokens` | `2000` | Keep `cerebrum.md` under this token count (template default; not yet read by source code) |
| `reflection_frequency` | `"weekly"` | How often AI reviews and prunes `cerebrum.md` (template default; not yet read by source code) |

### `daemon`

Controls the background daemon process.

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `18790` | Daemon HTTP API port |
| `log_level` | `"info"` | Log verbosity: `"debug"`, `"info"`, `"warn"`, or `"error"` |

### `dashboard`

Controls the web dashboard.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Serve the dashboard (template default; not yet read by source code — the dashboard is always started when the daemon runs) |
| `port` | `18791` | Dashboard HTTP and WebSocket port |
| `bind` | `"127.0.0.1"` | Interface to bind. Defaults to loopback so unauthenticated endpoints are not exposed to the LAN |

### `designqc`

Controls the DesignQC screenshot capture system.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable DesignQC features (template default; not yet read by source code) |
| `viewports` | `[{desktop: 1440x900}, {mobile: 375x812}]` | Capture viewports. Each entry has `name`, `width`, and `height` |
| `max_screenshots` | `6` | Maximum screenshots per run (template default is `6`; code fallback when key is absent is `16`) |
| `chrome_path` | `null` | Custom Chrome or Edge executable path. Auto-detected if `null` |

**Default `viewports`:**

```json
[
  { "name": "desktop", "width": 1440, "height": 900 },
  { "name": "mobile", "width": 375, "height": 812 }
]
```

## Required vs optional settings

No settings are strictly required. OpenWolf seeds `.wolf/config.json` with defaults on `openwolf init`, and every subsystem falls back to hard-coded defaults if the file or a specific key is missing. The application starts successfully even when `.wolf/config.json` does not exist.

Settings that are safe to leave at their defaults for most users:

- `anatomy.max_files` — only increase if your project has more than 500 source files and you want them all scanned.
- `dashboard.bind` — only change to `"0.0.0.0"` if you need network access to the dashboard from another machine.
- `designqc.chrome_path` — only set if auto-detection fails on your system.

## Defaults

Default values are defined in two places:

1. **Template file:** `src/templates/config.json` contains the canonical defaults that are copied into `.wolf/config.json` during `openwolf init`.
2. **Code-level fallbacks:** Each subsystem passes a fallback object to `readJSON` in `src/utils/fs-safe.ts`. If a key is missing from the user's config file, the fallback value is used. This ensures backward compatibility when new settings are added in later releases.

For example, the daemon uses this fallback object (`src/daemon/wolf-daemon.ts`):

```typescript
{
  openwolf: {
    daemon: { port: 18790, log_level: "info" },
    dashboard: { enabled: true, port: 18791, bind: "127.0.0.1" },
    cron: { enabled: true, heartbeat_interval_minutes: 30 },
  }
}
```

## Per-environment overrides

OpenWolf does not use `.env.*` files or `NODE_ENV`-based configuration layers. Per-environment behavior is controlled through `.wolf/config.json` directly:

- **Development vs. network exposure:** Change `dashboard.bind` to `"0.0.0.0"` in `.wolf/config.json` only if you explicitly need the dashboard and WebSocket endpoints accessible from the LAN. The default `"127.0.0.1"` keeps the server local.
- **API key behavior:** The cron engine strips `ANTHROPIC_API_KEY` from the environment before invoking `claude -p`, ensuring that subscription OAuth credentials take precedence.

Because `.wolf/` is typically gitignored, each checkout or deployment can maintain its own `.wolf/config.json` without affecting other environments.
