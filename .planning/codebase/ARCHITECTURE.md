<!-- refreshed: 2025-02-20 -->
# Architecture

**Analysis Date:** 2025-02-20

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      [CLI Interface]                        │
│             `src/cli/` (Commander commands)                 │
├──────────────────┬──────────────────┬───────────────────────┤
│   [Daemon Ctrl]  │   [Operations]   │    [Hook Settings]    │
│  `src/daemon/`   │  `src/scanner/`  │    `src/hooks/`       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    [Shared Utilities]                        │
│         `src/utils/` (fs, logger, platform)                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  [Data Persistence / State]                                 │
│  `.wolf/` (config, state, anatomy)                          │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI | Entry points, argument parsing | `src/cli/` |
| Daemon | Background tasks, file watching | `src/daemon/` |
| Scanner | Repository anatomy, project indexing | `src/scanner/` |
| Hooks | Intercepting/Augmenting workflows | `src/hooks/` |
| Tracker | Token usage monitoring | `src/tracker/` |
| Utils | Common helpers, FS operations | `src/utils/` |

## Pattern Overview

**Overall:** Modular CLI Command Pattern

**Key Characteristics:**
- **Lazy Loading:** CLI commands lazily load implementations (e.g., `import("./daemon-cmd.js")` in `src/cli/index.ts`).
- **Decoupled Modules:** Distinct functional domains (`daemon`, `scanner`, `hooks`) facilitate maintenance.
- **FS-as-Database:** State is primarily managed via JSON files in the `.wolf/` directory.

## Layers

**[CLI Layer]:**
- Purpose: Provides user interface and command routing.
- Location: `src/cli/`
- Contains: Commander definitions, command actions.
- Depends on: All modules.
- Used by: User.

**[Core Modules Layer]:**
- Purpose: Implements business logic.
- Location: `src/daemon/`, `src/hooks/`, `src/scanner/`, `src/tracker/`
- Contains: Logic for respective domains.
- Depends on: `src/utils/`.
- Used by: `src/cli/`.

## Data Flow

### Primary Command Path

1. **User input:** `openwolf init` (`bin/openwolf.ts`)
2. **Command parsing:** `src/cli/index.ts` matches `init` command.
3. **Execution:** Calls `initCommand` from `src/cli/init.ts`.
4. **Logic:** Performs operations, interacts with FS, updates `.wolf/` configuration.

## Architectural Constraints

- **Threading:** Uses `node:child_process` / PM2 for daemon management to handle background tasks.
- **Global state:** No shared memory state; all state is persisted to `.wolf/` JSON files to ensure persistence across sessions.
- **Circular imports:** Potential risk due to interconnectedness of modules; enforce strict dependency graph via linting/reviews.

## Error Handling

**Strategy:** Centralized logging and explicit error catching within command actions.

**Patterns:**
- `src/utils/logger.ts` for consistent logging.
- `src/utils/fs-safe.ts` for robust filesystem operations.

## Cross-Cutting Concerns

**Logging:** Managed via `src/utils/logger.ts`.
**Validation:** CLI arguments validated via `commander`.

---

*Architecture analysis: 2025-02-20*
