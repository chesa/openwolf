<!-- generated-by: gsd-doc-writer -->

# OpenWolf

**Token-conscious AI brain for Claude Code projects.**

OpenWolf gives Claude Code a persistent memory: a project map so it reads less, a learning brain so it remembers your corrections, and a token ledger so you see where tokens go. All through six invisible hook scripts that fire on every Claude action -- zero workflow changes.

[![npm version](https://img.shields.io/npm/v/openwolf.svg)](https://www.npmjs.com/package/openwolf)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

---

## Installation

Requires **Node.js 20 or later**.

```bash
npm install -g openwolf
```

Verify the installation:

```bash
openwolf --version
```

### Development Setup

For **contributors** working on the CHESA OpenWolf fork, use the automated setup script:

```bash
./scripts/install-dev.sh
```

The script verifies Node.js >= 20, pnpm, and git repository prerequisites, installs dependencies, builds the project, links the CLI globally, and configures the upstream git remote for fork divergence management.

## Quick start

1. Navigate to your project directory:
   ```bash
   cd your-project
   ```

2. Initialize OpenWolf:
   ```bash
   openwolf init
   ```

3. Verify everything is ready:
   ```bash
   openwolf status
   ```

That's it. Use `claude` normally. OpenWolf is watching.

## Usage examples

### Initialize a new project

```bash
openwolf init
```

Creates a `.wolf/` directory with the project brain files:

| File | Purpose |
|------|---------|
| `anatomy.md` | Project file map with descriptions and token estimates |
| `cerebrum.md` | Learned preferences, corrections, and Do-Not-Repeat list |
| `memory.md` | Chronological action log with token estimates |
| `buglog.json` | Bug fix memory, searchable, prevents re-discovery |
| `token-ledger.json` | Lifetime token tracking and session history |
| `config.json` | Project configuration (ports, intervals, thresholds) |
| `identity.md` | Project name and description |
| `STATUS.md` | Project health and next-phase tracker |
| `OPENWOLF.md` | Operating protocol for Claude Code sessions |
| `reframe-frameworks.md` | UI framework selection knowledge base |
| `hooks/` | Six Claude Code lifecycle hooks (pure Node.js) |

### Monitor project health

```bash
openwolf status
```

Shows daemon health, file integrity, token stats, and hook registration status.

### Launch the real-time dashboard

```bash
openwolf dashboard
```

Opens `http://localhost:18791` with live token usage, project anatomy, cron status, and cerebrum state.

### Force a full project rescan

```bash
openwolf scan
```

Refreshes `anatomy.md` to match the current filesystem. Use `--check` to verify without writing changes:

```bash
openwolf scan --check
```

### Capture design screenshots

```bash
openwolf designqc
```

Auto-detects your dev server, captures viewport-height JPEG sections of every route, and saves them to `.wolf/designqc-captures/` for design evaluation by Claude.

## Available commands

```
openwolf init              Initialize .wolf/ and register hooks
openwolf status            Show health, stats, file integrity
openwolf scan              Refresh the project structure map
openwolf scan --check      Verify anatomy matches filesystem
openwolf dashboard         Open the real-time web dashboard
openwolf daemon start      Start background task scheduler
openwolf daemon stop       Stop the scheduler
openwolf daemon restart    Restart the scheduler
openwolf daemon logs       View scheduler logs
openwolf cron list         Show all scheduled tasks
openwolf cron run <id>     Trigger a task manually
openwolf cron retry <id>   Retry a dead-lettered task
openwolf designqc          Capture screenshots for design evaluation
openwolf bug search <term> Search bug memory for known fixes
openwolf update            Update all registered projects
openwolf restore [backup]  Restore .wolf/ from a backup
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [How It Works](docs/how-it-works.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Commands Reference](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Hooks](docs/hooks.md)
- [Dashboard](docs/dashboard.md)
- [Design QC](docs/designqc.md)
- [Reframe](docs/reframe.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Updating](docs/updating.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)

## Fork Management

This repository is a **fork** of [cytostack/openwolf](https://github.com/cytostack/openwolf), used by the CHESA team to add worktree support, team workflow improvements, and concurrent-write safety features.

### Upstream Remote

The fork tracks the original repository via a read-only `upstream` remote:

```bash
git remote add upstream https://github.com/cytostack/openwolf.git
```

This is configured automatically when you run [scripts/install-dev.sh](#development-setup) or use the divergence report script directly.

### Check Divergence

To see how your fork compares to upstream:

```bash
bash scripts/sync-upstream.sh
```

To check a different branch (e.g., `develop`):

```bash
bash scripts/sync-upstream.sh --branch develop
```

### Report States

| Status     | Meaning                                                     | Next Steps                                     |
|------------|-------------------------------------------------------------|------------------------------------------------|
| **IN SYNC**  | Your branch matches upstream                                | Nothing to do                                  |
| **AHEAD**    | You have commits not present in upstream                    | Push to origin or submit PRs                   |
| **BEHIND**   | Upstream has new commits you don't have                     | Review changes and sync                        |
| **DIVERGED** | Both upstream and your branch have unique commits           | Review side-by-side before merging or rebasing |

> **Read-only safety:** This script is read-only. It never merges or rebases automatically. Review upstream changes and choose your sync strategy manually.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
