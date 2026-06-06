# Phase 3: .wolf/ Team Workflow Improvements - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Team-workflow safety and deployment flexibility for the `.wolf/` subsystem:

1. **Fix `HOOK_FILES` deployment gap** — include all `wolf-*.js` compiled hook modules in the build-copy pipeline (HOOK-03 deployment gap)
2. **Implement `withFileLock`** for concurrent `.wolf/` write safety — wrap `writeJSON` in `wolf-json.ts` (SCAN-04)
3. **Enable `OPENWOLF_METADATA_DIR`** environment variable for flexible metadata storage location (META-01)
4. **Add `.wolf/.gitignore` template** for mixed commit strategy — update `init.ts` to write it (GIT-01)
5. **Document configuration and mixed strategy** (`docs/configuration.md`, `docs/getting-started.md`) (DOC-01)

No new subsystems. No new external dependencies. Existing patterns guide implementation.

</domain>

<decisions>
## Implementation Decisions

### File Locking Mechanism

- **D-01: `withFileLock` using Node.js built-in exclusive file creation**
  Implement a `withFileLock(path, fn)` utility in `src/hooks/wolf-json.ts` (or a new `wolf-lock.ts`) that uses `fs.openSync(path + ".lock", fs.constants.O_CREAT | fs.constants.O_EXCL)` for advisory per-file locking. Wrap `writeJSON` calls with it.
  - **Rationale (recommended):** No new npm dependencies. Built-ins work across all Node.js platforms. Exclusive file creation (`O_EXCL`) is the simplest correct cross-platform lock primitive for concurrent Node.js processes (hooks run in separate processes). The lock file is a zero-length sentinel — if the creating process crashes, the lock file remains and must be manually cleaned or have a staleness TTL.
  - **Rationale (rejected — external npm `proper-lockfile`):** Adds a dependency for what is conceptually a few dozen lines of Node.js built-in code. Inconsistent with the project's established "no new deps for tooling" pattern.
  - **Rationale (rejected — in-process mutex):** Hooks run as separate Node.js processes. An in-process mutex provides zero cross-process synchronization.

### HOOK_FILES Deployment Gap

- **D-02: Dynamic discovery — copy all `.js` files from `dist/hooks/` to `.wolf/hooks/**
  Replace the explicit `HOOK_FILES` array in `writeHooks()` with a glob/directory-scan of `dist/hooks/`. Copy every `.js` file found. This ensures `wolf-paths.js`, `wolf-files.js`, `wolf-json.js`, `wolf-anatomy.js`, `wolf-describe.js`, `wolf-misc.js` (and any future modules) are always deployed without updating the `HOOK_FILES` list.
  - **Rationale (recommended):** Won't drift when new `wolf-*` modules are added. The `HOOK_FILES` list already missed the 6 `wolf-*` modules created in Phase 2 — dynamic discovery prevents this class of bug.
  - **Details:** The `HOOK_FILES` constant in `src/cli/hook-settings.ts` can be replaced with a `getHookFiles(sourceDir: string): string[]` function, or the pattern can be changed in `src/cli/init.ts` `writeHooks()`. Either approach works — the planner should choose based on whether any other consumer still needs the static list for registry/status commands. Keep the 6 hook runner files + `shared.js` + `worktree-helper.js` as the minimum required set for `hook-settings.ts` hook registration entries; only the copy step switches to dynamic.

### OPENWOLF_METADATA_DIR

- **D-03: Absolute path with `.wolf/` fallback**
  Read `OPENWOLF_METADATA_DIR` env var. If set and non-empty, use its value as the metadata root. If unset, fall back to `<project-root>/.wolf/`. Must be an absolute path (reject relative).
  - **Rationale (recommended):** Supports alternate mount points, network shares, and user-defined locations. Absolute path means no ambiguity about resolution relative to `cwd`.
  - **Affected functions:** `getWolfDir()` in `wolf-paths.ts` (or `shared.ts` facade). All consumers of the current hardcoded `.wolf/` path must either go through `getWolfDir()` or be updated to respect the env var.
  - **`init.ts` update:** On `init`, if `OPENWOLF_METADATA_DIR` is set, create the metadata dir at that path instead of `<project-root>/.wolf/`. Write hooks to the correct metadata dir. Write `.claude/settings.json` `hookCmd` entries that point at the correct `$WOLF_ROOT/.wolf/hooks/` path (the hooks binary location stays under `$WOLF_ROOT/.wolf/hooks/`; only metadata/config files move).

### .wolf/.gitignore Template

- **D-04: `*` + `!.gitignore` + `!OPENWOLF.md` + `!config.json` + `!identity.md`**
  Write `.wolf/.gitignore` on `init` containing:
  ```
  *
  !.gitignore
  !OPENWOLF.md
  !config.json
  !identity.md
  ```
  Users can then un-ignore additional files by removing lines or adding `!` patterns.
  - **Rationale (recommended):** Default-exclude-all with opt-in exceptions. This is the safest starting point — the worst outcome of forgetting to add an exception is a file not being tracked, not a file accidentally being committed. The 4 exceptions cover the minimal committed surface: the gitignore itself, the project context doc, the tool config, and the project identity.
  - **Rationale (rejected — track nothing):** Users would need to manually create a `.gitignore` every time they want to track any `.wolf/` file. No discoverability.
  - **Rationale (rejected — track everything):** Session state files (`anatomy.md`, `cerebrum.md`, `token-ledger.json`, etc.) would flood every commit with churn.
  - **Update `init.ts`:** The current `writeGitIgnore` writes `.wolf/` to the project-root `.gitignore`. This phase REPLACES that with the `.wolf/.gitignore` internal template. Remove the `writeGitIgnore()` call that appends `.wolf/` to `.gitignore`; instead, write the `.wolf/.gitignore` template during `init` in the `writeTemplateFile` phase for `ALWAYS_OVERWRITE` files. The `CREATE_IF_MISSING` section may need a new entry.

### Documentation Scope

- **D-05: Two separate doc files — `docs/configuration.md` and `docs/getting-started.md`**
  - `docs/configuration.md`: Reference for all config options (`OPENWOLF_METADATA_DIR`, `.wolf/.gitignore`, file locking behavior). A reference, not a tutorial.
  - `docs/getting-started.md`: Team onboarding walkthrough. Covers mixed commit strategy (what to commit, what to ignore), concurrent write safety, and how the team's `.wolf/` workflow works.
  - **Rationale (recommended):** Reference docs and onboarding docs have different readers and different purposes. Splitting them keeps each focused.
  - **Anchor in `README.md`:** Both docs should be linked from `README.md`.

### Claude's Discretion

- **`withFileLock` location:** Whether to add it to `wolf-json.ts` alongside `writeJSON`/`readJSON`, or create a new `wolf-lock.ts` sibling. The planner should decide based on module cohesion — if the lock utility is generic enough for future non-JSON use, a separate file is cleaner.
- **Lock staleness TTL:** Whether to add a max-age check (e.g., `fs.stat` on the lock file; if older than 5 seconds, treat as stale and break it). This handles the crash-without-cleanup edge case. Recommended default: 30-second TTL, configurable via `WITH_FILE_LOCK_TTL_MS` env var.
- **`getWolfDir()` refactoring scope:** Whether to extract a single `resolveWolfDir()` function that checks the env var and caches the result, or to update individual callers one by one. The planner should evaluate the number of callers and choose the minimal safe change.
- **Template for `.wolf/.gitignore`:** Whether the template should live as a file in `src/templates/` (alongside `OPENWOLF.md`, `config.json`, etc.) or be an inline string in `init.ts`. The template file approach is preferred for consistency.
- **`pnpm clean` update:** Whether `pnpm clean` (from Phase 4 of previous roadmap) should remove the alternate metadata dir when `OPENWOLF_METADATA_DIR` is used. Defer to planner discretion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 3 — scope items for HOOK-03, SCAN-04, META-01, GIT-01, DOC-01
- `.planning/REQUIREMENTS.md` §Pillar 3 — exact requirement text for all 5 requirements

### Source files (in scope)
- `src/cli/hook-settings.ts` — `HOOK_FILES` constant (line 156) and `hookCmd` path resolution
- `src/cli/init.ts` — `writeHooks()` copy loop (line 90-100), `writeGitIgnore()` (line 159-175), `ALWAYS_OVERWRITE` and `CREATE_IF_MISSING` lists
- `src/hooks/wolf-json.ts` — `writeJSON()` (line 54-83) to wrap with `withFileLock`
- `src/hooks/shared.ts` — barrel re-export; may need to export `withFileLock`
- `src/cli/templates.ts` — template discovery for `.wolf/.gitignore` template
- `src/templates/` — directory where `.gitignore` template file should live

### Source files (out of scope this phase)
- `src/hooks/session-start.ts`, `pre-read.ts`, etc. — 6 hook consumers are NOT modified (they call `writeJSON` through `shared.ts` facade)
- `src/scanner/description-extractor.ts` — not affected by this phase
- `src/daemon/wolf-daemon.ts` — not affected by this phase

### Codebase context
- `.planning/codebase/ARCHITECTURE.md` — FS-as-Database pattern, `.wolf/` as persistence layer
- `.planning/codebase/CONVENTIONS.md` — named exports, `node:` prefix, `.js` extension in imports
- `.planning/codebase/CONCERNS.md` — tech debt in monolithic modules
- `.planning/codebase/STACK.md` — Node.js >= 20, pnpm, no specialized config provider

### Prior phase context (relevant decisions)
- `02-hook-module-split/02-CONTEXT.md` — barrier re-export pattern; `wolf-json.ts` with `writeJSON`; D-06: zero consumer changes
- `04-p2-cleanup/04-CONTEXT.md` — no new dependencies for tooling scripts; explicit path safety

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/wolf-json.ts` `writeJSON()` — already uses temp-file + atomic rename pattern. Adding `withFileLock` wraps this with a file-level advisory lock.
- `src/cli/hook-settings.ts` `HOOK_FILES` — static array that can be replaced or supplemented with dynamic discovery.
- `src/cli/init.ts` `writeHooks()` — copy loop that iterates `HOOK_FILES`; needs to switch to directory scan.
- `src/hooks/wolf-paths.ts` — `getWolfDir()`, `getSessionDir()` are the canonical path resolvers that need `OPENWOLF_METADATA_DIR` awareness.
- `src/cli/templates.ts` — `findTemplatesDir()` locates the `src/templates/` directory; new `.gitignore` template fits here.

### Established Patterns
- **No new dependencies for tooling:** The project avoids npm packages for simple file operations. `withFileLock` uses Node.js built-ins.
- **Barrel re-export via shared.ts:** New `withFileLock` should be exported through the facade if any hook consumer needs it.
- **Temp-file + atomic rename:** `writeJSON` already uses this pattern. The lock file follows the same discipline.
- **FS-as-Database:** All state is `.wolf/` JSON files. Locking is per-file, not global.
- **Flat sibling modules:** New `wolf-lock.ts` (if chosen) lives in `src/hooks/` alongside `wolf-json.ts`.

### Integration Points
- `src/hooks/post-write.ts` — heaviest consumer of `shared.ts`; calls `writeJSON` through the facade. Will automatically get `withFileLock` if `writeJSON` wraps it.
- `src/cli/init.ts` `initCommand()` — the top-level init flow. Needs updates for `.wolf/.gitignore` template, `OPENWOLF_METADATA_DIR` support.
- `src/hooks/shared.ts` — barrel re-exports. If `withFileLock` is a public API, export it here.
- `docs/` — new `configuration.md` and `getting-started.md` files.

</code_context>

<specifics>
## Specific Ideas

- The `HOOK_FILES` gap was introduced when `wolf-*.ts` modules were created in the hook module split (Phase 2 of prior roadmap) but the `HOOK_FILES` list in `hook-settings.ts` was not updated. `writeHooks()` only copies files in `HOOK_FILES`, so `wolf-paths.js`, `wolf-files.js`, `wolf-json.js`, `wolf-anatomy.js`, `wolf-describe.js`, `wolf-misc.js` are currently NOT deployed to `.wolf/hooks/`. This would cause runtime import failures when `shared.js` tries to `import { ... } from "./wolf-paths.js"` at runtime.
- `writeJSON` already has temp-file + atomic rename (write to `.tmp`, then rename). Adding a file lock with staleness TTL is the minimal addition for concurrent safety.
- The `.wolf/.gitignore` template approach is inspired by how many dot-directory tools handle selective tracking (e.g., `.terraform/`, `.direnv/`).
- Consider whether `writeGitIgnore()` in `init.ts` (which appends `.wolf/` to project-root `.gitignore`) should be removed entirely or modified to coexist with the new `.wolf/.gitignore` — having both `../.gitignore` ignoring `.wolf/` AND `.wolf/.gitignore` inside `.wolf/` is redundant but not harmful.

</specifics>

<deferred>
## Deferred Ideas

- **De-duplicating `extractDescription` between hooks and scanner:** Still a future refactor. Not related to this phase's scope.
- **Adding `.wolf/` FS watcher for automatic lock cleanup:** If a lock file is not cleaned up (process crash, SIGKILL), currently a manual or TTL-based cleanup is needed. An automatic watcher is a future enhancement.
- **`OPENWOLF_METADATA_DIR` support in the daemon:** The daemon's file watcher and cron engine may need updates for alternate metadata paths. Defer unless testing reveals breakage.
- **Multiple metadata directories:** Support for multiple `OPENWOLF_METADATA_DIR` paths (e.g., read-only config + writable state). Defer — single path covers the requirement.

None — discussion stayed within phase scope.

</deferred>

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended option:

```
[auto] [File locking mechanism] — Q: "Use Node.js built-in file locking or external npm package?" → Selected: "custom withFileLock wrapping writeJSON using Node.js built-in exclusive file creation (fs.openSync with O_EXCL)" (recommended: no new deps, consistent with prior pattern, handles multi-process hook runtime)
[auto] [HOOK_FILES deployment gap] — Q: "Fix via explicit list update or dynamic discovery?" → Selected: "dynamic discovery — copy all .js files from dist/hooks/ to .wolf/hooks/" (recommended: won't drift if new wolf-* modules are added later)
[auto] [OPENWOLF_METADATA_DIR] — Q: "Absolute path, relative, or both?" → Selected: "absolute path, falling back to .wolf/ when unset" (recommended: most flexible; update getWolfDir/getSessionDir to check env var)
[auto] [.wolf/.gitignore strategy] — Q: "* + tracked exceptions or track nothing?" → Selected: "* + !.gitignore + !OPENWOLF.md + !config.json + !identity.md" (recommended: users opt-in to tracking by removing entries; worst-case scenario is a missing gitignore entry, not forgotten state)
[auto] [Documentation scope] — Q: "Single or split doc files?" → Selected: "docs/configuration.md (config ref) + docs/getting-started.md (mixed strategy walkthrough)" (recommended: two concerns, two files)
```

---

## Decisions Index

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | `withFileLock` using `fs.openSync(O_EXCL)` — Node.js built-in only | No new deps; cross-process; project's "no new deps" pattern |
| D-02 | Dynamic discovery of hook `.js` files in `writeHooks()` | Won't drift when new `wolf-*` modules are added |
| D-03 | `OPENWOLF_METADATA_DIR` as absolute path with `.wolf/` fallback | Flexible deployment; unambiguous path resolution |
| D-04 | `.wolf/.gitignore` with `*` + exceptions for committed files | Safest default (opt-in tracking); consistent with dot-directory conventions |
| D-05 | Split docs: `docs/configuration.md` + `docs/getting-started.md` | Different readers and purposes for reference vs. onboarding docs |

---

*Phase: 3-.wolf/ Team Workflow Improvements*
*Context gathered: 2026-06-06*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
