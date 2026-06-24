<!-- generated-by: gsd-doc-writer -->

# Getting Started

## Prerequisites

Before installing OpenWolf, make sure you have the following installed:

- **Node.js** `>= 20.0.0`
  - OpenWolf hooks run as Node.js scripts, so Node is required even if you installed Claude Code via a native installer.
  - Download from [nodejs.org](https://nodejs.org) or use a version manager such as `nvm`.
- **Claude Code**
  - OpenWolf is middleware for Claude Code. Any installation method works: native installer, npm, Homebrew, or WinGet. The Claude Code desktop app is also supported.

## Installation steps

### Install from GitHub (CHESA fork)

This is the **CHESA fork** — do not use `npm install -g openwolf`, which installs
the upstream release and lacks worktree support and team features.

Install directly from the GitHub repository:

```bash
# Latest development (bleeding edge)
npm install -g --install-links "chesa/openwolf#develop"

# Pinned to a stable release tag (recommended for team environments)
npm install -g --install-links "chesa/openwolf#release/1.1.0-beta"
```

npm accepts a branch name, tag name, or commit SHA after the `#`. Use `#develop`
to always get the latest; use a `#release/X.Y.Z-beta` tag to pin to a
known-good version. To list available release tags:

```bash
git ls-remote --tags https://github.com/chesa/openwolf
```

The `--install-links` flag is required — without it, npm 11 creates a symlink to
a temp directory that is deleted after install. The build runs automatically from
source on first install (requires `git` and Node 20+).

1. Verify the installation:

   ```bash
   openwolf --version
   ```

   You should see the installed version printed (e.g., `1.1.0-beta`).

3. (Optional) If you plan to use **Design QC**, install the optional dependency:

   ```bash
   npm install -g puppeteer-core
   ```

   Design QC requires a Chrome or Chromium browser installation to capture screenshots.

### Build from source

1. Clone the repository:

   ```bash
   git clone https://github.com/chesa/openwolf.git
   cd openwolf
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

4. After building, verify the CLI works (this file is a build artifact created by `pnpm build`):

   ```bash
   node dist/bin/openwolf.js --help
   ```

## First run

1. Navigate to the project you want to manage:

   ```bash
   cd your-project
   ```

2. Initialize OpenWolf in the project:

   ```bash
   openwolf init
   ```

   This creates a `.wolf/` directory with the project brain files, registers Claude Code hooks, and performs an initial anatomy scan.

3. Verify everything is ready:

   ```bash
   openwolf status
   ```

   You should see confirmation that all core files and hooks are present, along with token stats and daemon status.

That is it. Use `claude` as you normally would. OpenWolf runs invisibly through its hooks.

### Team Workflow: Mixed Commit Strategy

By default, OpenWolf ignores all `.wolf/` files at the project level. For teams,
a **mixed commit strategy** is recommended:

- **Commit shared knowledge:** `anatomy.md`, `cerebrum.md`, `OPENWOLF.md`,
  `config.json`, `buglog.ndjson`, `identity.md`, `hooks/`
- **Ignore per-developer state:** `memory.md`, `token-ledger.json`, `sessions/`,
  `backups/`, lock files

Starting with `openwolf init` (v1.1.0+), a `.wolf/.gitignore` is created
automatically with the mixed strategy. If your project's root `.gitignore`
still contains `.wolf/`, remove that line to adopt the mixed strategy.

## Common setup issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `openwolf: command not found` after global install | npm global bin directory is not in your shell `PATH` | Add the npm global prefix `bin` directory to your `PATH` |
| Commands say "OpenWolf not initialized" | The project has not been initialized with OpenWolf. These commands require the `.wolf/` directory and its configuration files to exist. | Run `openwolf init` from your project root |
| `Credit balance is too low` when running AI tasks | `ANTHROPIC_API_KEY` is set in your environment, but the key has no credits | OpenWolf automatically strips `ANTHROPIC_API_KEY` when running AI tasks so that `claude -p` uses your subscription credentials from `~/.claude/.credentials.json` instead |
| Design QC fails with browser not found | Chrome or Chromium is not installed, or `puppeteer-core` is missing | Install a Chromium-based browser (Chrome, Edge, or Chromium) and install `puppeteer-core` globally |

## Concurrent write safety

OpenWolf hooks run as separate Node.js processes. When multiple hooks execute concurrently, they may write to the same `.wolf/` JSON files. To prevent data corruption, OpenWolf uses **advisory per-file locking**:

- Each write acquires an exclusive lock using `writeFileSync` with `{ flag: "wx" }` (atomic create-or-fail)
- Lock files contain the PID and timestamp of the holder (reliable on network filesystems)
- If another process holds the lock, the writer retries 5 times with 80ms base delay plus random jitter (0–70ms)
- If the lock is stale (older than 10 seconds — matching the hook timeout), it is automatically removed
- After all retries are exhausted, the write proceeds **without a lock** and a warning is printed to stderr (preferring hook responsiveness over strict write serialization)

The locking is transparent — hooks continue to call `writeJSON()` through the `shared.ts` facade without any code changes. Only the write path is affected; reads are lock-free and never block.

This feature requires no configuration. If you frequently see "Could not acquire lock" warnings in stderr, investigate why hooks are racing on the same file.

## Next steps

- **Learn the commands** -- See `docs/commands.md` for the full CLI reference.
- **Configuration** -- See `docs/configuration.md` for environment variables and config files.
- **Architecture** -- See `docs/ARCHITECTURE.md` for an overview of the system components.
- **Contributing** -- See `CONTRIBUTING.md` for development setup and contribution guidelines.
