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

This is the **CHESA fork** of OpenWolf -- it adds git worktree support, team
workflow improvements, and fixes for concurrent sessions that are not yet in the
upstream release. Install it directly from the fork:

```bash
# Latest development (bleeding edge)
npm install -g --install-links "chesa/openwolf#develop"

# Pinned to a stable release tag
npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"
```

npm accepts a branch name, tag name, or commit SHA after the `#`. Use `#develop`
to track the latest; use a `#release/X.Y.Z-beta` tag to pin to a known-good
version. Available tags: `git ls-remote --tags https://github.com/chesa/openwolf`.

The `--install-links` flag is required -- without it, npm 11 creates a symlink to
a temp directory that gets deleted after install. The `dist/` build artifact is
not committed, so the install builds from source automatically via a `prepare`
step (this needs `git` and Node 20+; the build runs on first install).

Verify the installation:

```bash
openwolf --version   # → 1.3.x-beta   (the -beta suffix marks the fork build)
```

**Upgrade** -- same command; afterward run `openwolf update <name>` in each initialized
project to sync hooks (use `openwolf update --all` to sync every registered project at once):

```bash
npm install -g --install-links "chesa/openwolf#develop"
# or pin to a specific release:
npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"
```

**Alternative: clone and build locally** (handy for contributors, or if the
git-URL install fails behind a proxy):

```bash
git clone git@github.com:chesa/openwolf.git
cd openwolf
bash scripts/install-global.sh
```

> ⚠️ **Do not** run `npm install -g openwolf`. That installs the upstream
> [`cytostack/openwolf`](https://www.npmjs.com/package/openwolf) release from the
> public npm registry, which lacks this fork's worktree and team features. Use
> the `chesa/openwolf#develop` command above.

### Development Setup

For **contributors** working on the CHESA OpenWolf fork, use the automated setup script:

```bash
./scripts/install-dev.sh
```

The script verifies Node.js >= 20, pnpm, and git repository prerequisites, installs dependencies, builds the project, links the CLI globally, and configures the upstream git remote for fork divergence management.

## Fork Management

The CHESA fork tracks upstream [`cytostack/openwolf`](https://github.com/cytostack/openwolf) as a read-only remote.

### Check divergence

```bash
bash scripts/sync-upstream.sh
```

This shows commits ahead/behind upstream and recommends actions. It is read-only -- no merging or rebasing.

### Sync with upstream

Review upstream changes, then:

```bash
git merge upstream/main   # simple sync
# or
git rebase upstream/main  # clean history
```

### Version convention

The fork uses `X.Y.Z-beta` to distinguish from official releases.

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
| `buglog.ndjson` | Bug fix memory, searchable, prevents re-discovery |
| `token-ledger.json` | Lifetime token tracking and session history |
| `config.json` | Project configuration (ports, intervals, thresholds) |
| `identity.md` | Project name and description |
| `OPENWOLF.md` | Framework-blind resume seam: on resume, check your execution layer's plan/status first (if present), then `cerebrum.md`, then recent `memory.md` |
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
openwolf daemon status     Show daemon runtime status
openwolf daemon start      Start background task scheduler
openwolf daemon stop       Stop the scheduler
openwolf daemon restart    Restart the scheduler
openwolf daemon logs       View scheduler logs
openwolf cron list         Show all scheduled tasks
openwolf cron run <id>     Trigger a task manually
openwolf cron retry <id>   Retry a dead-lettered task
openwolf designqc          Capture screenshots for design evaluation
openwolf bug search <term> Search bug memory for known fixes
openwolf update <name>     Update a specific project (partial name match)
openwolf update --all      Update all registered projects
openwolf update --list     List all registered projects
openwolf learnings list    Show staged learnings awaiting review
openwolf learnings merge   Merge staged learnings into cerebrum.md
openwolf learnings check   Exit non-zero if staged learnings await review
openwolf learnings accept  Accept and apply staged learnings
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
