# Codebase Structure

**Analysis Date:** 2025-02-20

## Directory Layout

```
openwolf/
├── bin/                # CLI entry point
├── src/                # Source code
│   ├── cli/            # CLI commands implementation
│   ├── daemon/         # Background processes/watchers
│   ├── designqc/       # Design QC capture/analysis
│   ├── hooks/          # Git/workflow hook implementations
│   ├── scanner/        # Project anatomy scanning
│   ├── templates/      # Blueprint files
│   ├── tracker/        # Token usage tracking
│   └── utils/          # Common shared utilities
├── docs/               # Documentation
└── tests/              # Test suites
```

## Directory Purposes

**`src/cli/`:**
- Purpose: Command implementation for CLI.
- Contains: `*.ts` command definitions.
- Key files: `src/cli/index.ts` (program entry), `src/cli/init.ts`.

**`src/daemon/`:**
- Purpose: Logic for long-running processes (e.g., cron jobs, file watchers).
- Key files: `src/daemon/wolf-daemon.ts`, `src/daemon/cron-engine.ts`.

**`src/hooks/`:**
- Purpose: Logic for hooks (`pre-read`, `post-write`, etc.).
- Key files: `src/hooks/post-read.ts`, `src/hooks/pre-write.ts`.

**`src/utils/`:**
- Purpose: Shared utilities across the codebase.
- Key files: `src/utils/fs-safe.ts`, `src/utils/logger.ts`.

## Key File Locations

**Entry Points:**
- `bin/openwolf.ts`: CLI entry point defined in `package.json`.

**Configuration:**
- `package.json`: Project dependencies and script definitions.
- `tsconfig.json`: TypeScript configuration.

## Naming Conventions

**Files:**
- kebab-case: `src/cli/daemon-cmd.ts`

**Functions/Variables:**
- camelCase: `export function createProgram()`, `const daemonStart`

## Where to Add New Code

**New CLI Command:**
- Add command definition in `src/cli/index.ts`.
- Implement action in `src/cli/<name>-cmd.ts`.

**New Daemon Task:**
- Add to `src/daemon/` or `src/daemon/cron-engine.ts` if it is a periodic task.

**New Utility:**
- Add to `src/utils/` if generally reusable.

---

*Structure analysis: 2025-02-20*
