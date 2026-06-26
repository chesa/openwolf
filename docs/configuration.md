<!-- generated-by: gsd-doc-writer -->

# Configuration

OpenWolf is configured through a JSON file in the project workspace and a small set of environment variables. All settings have sensible defaults, so no configuration is required for normal use. Advanced deployment scenarios may benefit from `OPENWOLF_METADATA_DIR` (alternate metadata storage location).

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENWOLF_METADATA_DIR` | Optional | `<project>/.wolf/` | Absolute path to an alternate metadata storage location. If set, OpenWolf stores config, state, and knowledge files at this path instead of the project's `.wolf/` directory. Useful for shared network drives, dedicated volumes, or multi-project setups. Must be an absolute path — relative paths are rejected with a warning and fall back to the default. Hook scripts remain at `<project>/.wolf/hooks/`. |
| `OPENWOLF_PROJECT_ROOT` | Optional | Auto-detected | Absolute path to the project root. The CLI sets this when spawning the daemon and dashboard so they resolve the correct `.wolf/` directory regardless of working directory. |
| `WOLF_ROOT` | Optional | — | Set by the shell wrapper in `.claude/settings.json` at runtime by resolving the git repo root from `CLAUDE_PROJECT_DIR`. Hooks prefer this over `CLAUDE_PROJECT_DIR` when both are present, ensuring the correct project root is used even in worktree or subdirectory invocations. |
| `CLAUDE_PROJECT_DIR` | Optional | `process.cwd()` | Set by Claude Code to the active project directory. Hooks fall back to this when `WOLF_ROOT` is not set (e.g., when hooks are invoked outside of the OpenWolf shell wrapper). |
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
    "enabled": true,
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
| `auto_scan_on_init` | `true` | Run a full scan during `openwolf init`. |
| `rescan_interval_hours` | `6` | How often the daemon rescans the project. |
| `max_description_length` | `100` | Max characters for file descriptions. |
| `max_files` | `500` | Stop scanning after this many files. |
| `exclude_patterns` | *(see below)* | Directories and patterns to skip. |
| `respect_gitignore` | `true` | When `true`, also skip files/dirs matched by the project-root `.gitignore` (union with `exclude_patterns`). Set to `false` to opt out. |

**Default `exclude_patterns`:**

```json
[
  "node_modules", ".git", "dist", "build", ".wolf",
  ".next", ".nuxt", "coverage", "__pycache__", ".cache",
  "target", ".vscode", ".idea", ".turbo", ".vercel",
  ".netlify", ".output", "*.min.js", "*.min.css"
]
```

**`respect_gitignore`.** With `respect_gitignore: true` (the default), the scanner
also loads the project-root `.gitignore` and skips anything it matches, in addition to
`exclude_patterns`. Set to `false` to opt out. Only the root `.gitignore` is read —
nested `.gitignore` files and global / `core.excludesFile` patterns are not consulted.

**Pattern matching.** Each entry is matched against every project-relative
path (forward-slash separated, anchored at the project root):

| Form | Example | Matches |
|------|---------|---------|
| Bare name | `node_modules` | a directory or file of that name at **any** depth |
| Extension glob | `*.min.js` | any path ending in `.min.js` (only when the pattern has **no** `/`) |
| Path prefix | `.claude/worktrees` | that directory **and everything under it** (a `/`-pattern with **no** `*`) |
| Path glob | `docs/superpowers/*` | the path as an anchored glob: `*` stays within one segment, `**` spans segments (a `/`-pattern that **contains** `*`) |
| Name glob | `tmp*` | any single path segment matching the glob (no `/`, contains `*`) |

> **The form is chosen by structure, not declared** — the presence of `/` and
> `*` selects the rule:
>
> - `*.ext` with no `/` → extension glob (so `src/*.min.js` is *not* an
>   extension glob; it falls through to the path-glob rule below).
> - A `/`-bearing pattern with **no** `*` → path prefix: it excludes that path
>   and its entire subtree (`docs/superpowers` excludes everything under
>   `docs/superpowers/`).
> - A `/`-bearing pattern **with** `*` → anchored path glob: `*` matches within
>   one segment (`docs/superpowers/*` = direct children only), `**` spans
>   segments (`docs/**/LEARNINGS.md`).
> - A `*`-bearing pattern with no `/` → name glob against any single segment.
>
> Previously only bare names and `*.ext` were honored — a pattern with a `/`
> silently matched nothing.

### `token_audit`

Controls token estimation and waste detection.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable token tracking. |
| `report_frequency` | `"weekly"` | How often to generate waste reports. |
| `waste_threshold_percent` | `15` | Alert when waste exceeds this percentage. |
| `chars_per_token_code` | `3.5` | Character-to-token ratio for code files. |
| `chars_per_token_prose` | `4.0` | Character-to-token ratio for prose files. |

### `cron`

Controls the daemon's task scheduler.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable cron tasks. |
| `max_retry_attempts` | `3` | Times to retry a failed task before dead-lettering. |
| `dead_letter_enabled` | `true` | Move exhausted tasks to dead letter queue. |
| `heartbeat_interval_minutes` | `30` | Daemon health check frequency. |
| `use_claude_p` | `true` | Use `claude -p` (subscription) for AI-powered tasks. |
| `api_key_env` | `null` | Environment variable name for an API key override. |

### `memory`

Controls the action log.

| Key | Default | Description |
|-----|---------|-------------|
| `consolidation_after_days` | `7` | Compress sessions older than this. |
| `max_entries_before_consolidation` | `200` | Force consolidation at this count. |

### `cerebrum`

Controls the learning memory.

| Key | Default | Description |
|-----|---------|-------------|
| `max_tokens` | `2000` | Keep `cerebrum.md` under this token count. |
| `reflection_frequency` | `"weekly"` | How often AI reviews and prunes `cerebrum.md`. |

### `daemon`

Controls the background daemon process.

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `18790` | Daemon HTTP API port. |
| `log_level` | `"info"` | Log verbosity: `"debug"`, `"info"`, `"warn"`, or `"error"`. |

### `dashboard`

Controls the web dashboard.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Serve the dashboard. |
| `port` | `18791` | Dashboard HTTP and WebSocket port. |
| `bind` | `"127.0.0.1"` | Interface to bind. |

### `designqc`

Controls the DesignQC screenshot capture system.

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable DesignQC features. |
| `viewports` | `[{ "name": "desktop", "width": 1440, "height": 900 }, { "name": "mobile", "width": 375, "height": 812 }]` | Capture viewports. |
| `max_screenshots` | `6` | Maximum screenshots per run. |
| `chrome_path` | `null` | Custom Chrome or Edge executable path. |

**Default `viewports`:**

```json
[
  { "name": "desktop", "width": 1440, "height": 900 },
  { "name": "mobile", "width": 375, "height": 812 }
]
```

### `execution_layer`

OpenWolf is execution-layer-agnostic: it does not own your project's plan, roadmap, or
intent files. The optional `execution_layer` key lets you record which tool your team
uses so OpenWolf can surface a reminder at session start.

| Key | Default | Description |
|-----|---------|-------------|
| `execution_layer` | `null` | Name of the execution layer in use (e.g. `"gsd"`, `"superpowers"`, `"gstack"`). When set to a non-empty string, `openwolf status` prints `Execution layer: <value>` and the session-start hook writes `OpenWolf: execution layer = <value> — read its plan/status first.` to stderr. When `null` or absent, both outputs are suppressed. |
| `execution_layer_note` | *(explanatory string)* | Human-readable hint about what the key does. This key is informational only — OpenWolf does not read it at runtime. |

**Resume order (framework-blind):** OpenWolf does not mandate a specific status file.
When resuming a session, follow this generic order regardless of execution layer:

1. Check your execution layer's own plan or status file first (if present).
2. Read `.wolf/cerebrum.md` for project conventions and do-not-repeat items.
3. Scan recent `.wolf/memory.md` entries for session context.

**Example `.wolf/config.json` snippet:**

```json
{
  "version": 1,
  "openwolf": {
    "execution_layer": "gsd",
    "execution_layer_note": "Optional: set to your execution layer name so OpenWolf can surface a resume hint. null = generic resume order."
  }
}
```

## Required vs optional settings

No settings are strictly required. OpenWolf seeds `.wolf/config.json` with defaults on `openwolf init`, and every subsystem falls back to hard-coded defaults if the file or a specific key is missing. The application starts successfully even when `.wolf/config.json` does not exist.

## Defaults

Default values are defined in `src/templates/config.json` and used as templates during `openwolf init`. Code-level fallbacks ensure backward compatibility if new settings are added.

## Per-environment overrides

OpenWolf does not use `.env.*` files or `NODE_ENV`-based configuration layers. Per-environment behavior is controlled through `.wolf/config.json` directly. Because `.wolf/` is typically gitignored, each checkout or deployment can maintain its own `.wolf/config.json`.

### `.wolf/.gitignore` (mixed commit strategy)

OpenWolf ships with a default `.wolf/.gitignore` template that implements a "mixed commit strategy": only configuration files are tracked in git, while session state and runtime data remain ignored.

**Default template (`src/templates/wolf-gitignore`):**

```
# OpenWolf — .wolf/.gitignore
# Per-developer state (don't commit)
memory.md
token-ledger.json
cron-state.json
designqc-captures/
designqc-report.json
suggestions.json
backups/
sessions/

# Derived / regenerated locally
anatomy.md

# Transient lock files from concurrent-write protection
*.lock

# Shared knowledge files are NOT listed here, so they ARE committed:
#   cerebrum.md       — learned conventions and do-not-repeat list
#   OPENWOLF.md       — operating protocol
#   config.json       — project configuration
#   buglog.ndjson     — known bugs and fixes
#   identity.md       — project identity
#   hooks/            — compiled hook scripts
#   reframe-frameworks.md
#   cron-manifest.json  — cron config (cron-state.json is per-dev, above)
```

The template implements a "mixed commit strategy": certain development-specific files (memory, token ledger, design captures) are ignored per-developer, while configuration and shared knowledge files remain unignored for team collaboration. Comments in the template document which files are shared (not listed in ignore rules) and which are per-developer.

To track additional files (e.g., `cerebrum.md` for team-wide learnings), add a `!` line to `.wolf/.gitignore`:

```gitignore
!cerebrum.md
```

To revert to the "ignore everything" behavior (the old approach), delete all `!` lines except `!.gitignore` — or simply add `.wolf/` to your project-root `.gitignore`.

The template is overwritten on every `openwolf init` or `openwolf update`. If you customize it, re-apply your changes after upgrading.
