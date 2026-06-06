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

### Install from npm (recommended)

1. Install OpenWolf globally:

   ```bash
   npm install -g openwolf
   ```

2. Verify the installation:

   ```bash
   openwolf --version
   ```

   You should see the installed version printed (e.g., `1.0.5-beta`).

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

4. After building, verify the CLI works:

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

## Mixed commit strategy

By default, OpenWolf uses a **mixed commit strategy** for `.wolf/`: configuration files are committed to git, while session state and runtime data stay ignored. This allows the team to share project context (`OPENWOLF.md`), tool configuration (`config.json`), and project identity (`identity.md`) without flooding every commit with session churn.

### What gets committed

After `openwolf init`, the `.wolf/.gitignore` file permits these files:

| File | Purpose |
|------|---------|
| `.wolf/.gitignore` | The ignore rules themselves — ensures correct behavior on clone |
| `.wolf/OPENWOLF.md` | Project context document (manually curated) |
| `.wolf/config.json` | Tool configuration (ports, scan intervals, exclude patterns) |
| `.wolf/identity.md` | Project name, description, creation date |

All other `.wolf/` files (`cerebrum.md`, `anatomy.md`, `memory.md`, `token-ledger.json`, `buglog.json`, session files, etc.) are ignored by default.

### Tracking additional files

To share more files with the team (e.g., team-wide learnings in `cerebrum.md`), edit `.wolf/.gitignore` and add:

```gitignore
!cerebrum.md
```

Commit the updated `.wolf/.gitignore` so the whole team gets the change.

### Reverting to full ignore

To go back to the traditional approach (`.wolf/` completely untracked), remove all `!` lines from `.wolf/.gitignore` except `!.gitignore`, or add `.wolf/` to your project-root `.gitignore`.

### Note for existing projects

If you initialized OpenWolf before this feature was introduced, your project-root `.gitignore` may still have `.wolf/` appended from the previous version. The two ignores coexist without conflict — the project-root `.gitignore` takes precedence. To use the new mixed strategy, remove `.wolf/` from your project-root `.gitignore`. The `.wolf/.gitignore` template will take over automatically after `openwolf update`.

## Common setup issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `openwolf: command not found` after global install | npm global bin directory is not in your shell `PATH` | Add the npm global prefix `bin` directory to your `PATH` |
| Commands say "OpenWolf not initialized" | The project has not been initialized with OpenWolf. These commands require the `.wolf/` directory and its configuration files to exist. | Run `openwolf init` from your project root |
| `Credit balance is too low` when running AI tasks | `ANTHROPIC_API_KEY` is set in your environment, but the key has no credits | OpenWolf automatically strips `ANTHROPIC_API_KEY` when running AI tasks so that `claude -p` uses your subscription credentials from `~/.claude/.credentials.json` instead |
| Design QC fails with browser not found | Chrome or Chromium is not installed, or `puppeteer-core` is missing | Install a Chromium-based browser (Chrome, Edge, or Chromium) and install `puppeteer-core` globally |

## Concurrent write safety

OpenWolf hooks (session-start, pre-read, post-read, pre-write, post-write, stop) run as separate Node.js processes. When multiple hooks execute concurrently — for example, during parallel tool calls — they may write to the same `.wolf/` JSON files (`_session.json`, `token-ledger.json`, `buglog.json`).

To prevent data corruption, OpenWolf uses **advisory per-file locking**:

- Each write acquires an exclusive lock on the target file using `fs.openSync` with `O_CREAT | O_EXCL`
- If another process holds the lock, the writer retries up to 10 times with 50ms backoff (500ms worst-case total)
- If the lock is stale (process crash without cleanup), it is automatically detected and broken after 30 seconds
- The staleness threshold is configurable via the `WITH_FILE_LOCK_TTL_MS` environment variable

The locking is transparent — hooks continue to call `writeJSON()` through the `shared.ts` facade without any code changes. Only the write path is affected; reads are lock-free and never block.

This feature requires no configuration for normal use. If you frequently see "Could not acquire lock" warnings in stderr, consider increasing `WITH_FILE_LOCK_TTL_MS` or investigating why hooks are racing on the same file.

## Next steps

- **Learn the commands** -- See `docs/commands.md` for the full CLI reference.
- **Configuration** -- See `docs/configuration.md` for environment variables and config files.
- **Architecture** -- See `docs/ARCHITECTURE.md` for an overview of the system components.
- **Contributing** -- See `CONTRIBUTING.md` for development setup and contribution guidelines.
