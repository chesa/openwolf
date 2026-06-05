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

## Common setup issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `openwolf: command not found` after global install | npm global bin directory is not in your shell `PATH` | Add the npm global prefix `bin` directory to your `PATH` |
| Commands say "OpenWolf not initialized" | The project has not been initialized with OpenWolf. These commands require the `.wolf/` directory and its configuration files to exist. | Run `openwolf init` from your project root |
| `Credit balance is too low` when running AI tasks | `ANTHROPIC_API_KEY` is set in your environment, but the key has no credits | OpenWolf automatically strips `ANTHROPIC_API_KEY` when running AI tasks so that `claude -p` uses your subscription credentials from `~/.claude/.credentials.json` instead |
| Design QC fails with browser not found | Chrome or Chromium is not installed, or `puppeteer-core` is missing | Install a Chromium-based browser (Chrome, Edge, or Chromium) and install `puppeteer-core` globally |

## Next steps

- **Learn the commands** -- See `docs/commands.md` for the full CLI reference.
- **Configuration** -- See `docs/configuration.md` for environment variables and config files.
- **Architecture** -- See `docs/ARCHITECTURE.md` for an overview of the system components.
- **Contributing** -- See `CONTRIBUTING.md` for development setup and contribution guidelines.
