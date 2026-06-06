# Phase 3: .wolf/ Team Workflow Improvements - Research

**Researched:** 2026-06-06
**Domain:** Hook deployment pipeline, file locking, environment configuration, gitignore strategy, documentation
**Confidence:** HIGH

## Summary

Phase 3 addresses five interconnected improvements to the `.wolf/` subsystem: fixing a critical hook deployment gap that causes runtime import failures, adding per-file advisory locking for concurrent hook process safety, enabling flexible metadata storage location via environment variable, implementing a `.wolf/.gitignore` template for mixed commit strategies, and updating reference documentation.

The **most critical finding** is that the `HOOK_FILES` static array is missing all 6 `wolf-*.js` modules (`wolf-paths.js`, `wolf-files.js`, `wolf-json.js`, `wolf-anatomy.js`, `wolf-describe.js`, `wolf-misc.js`). These are never copied to `.wolf/hooks/` during `init` or `update`, meaning `shared.js` will fail with `ERR_MODULE_NOT_FOUND` when any hook tries to import from `./wolf-paths.js` at runtime. This is a **deployed bug** — any user running `openwolf init` or `openwolf update` after Phase 2's hook module split has broken hooks. The fix (dynamic discovery of `.js` files in `dist/hooks/`) must be the highest-priority change.

The locking solution is well-defined by D-01: Node.js built-in `fs.openSync` with `O_EXCL` for advisory per-file locks, wrapping only the hook-side `writeJSON` in `wolf-json.ts`. The `fs-safe.ts` CLI-side `writeJSON` is used from serial user-invoked commands and does not require locking.

Two separate concerns exist for `getWolfDir()` refactoring: the hook-side `wolf-paths.ts` (consumed by all 6 hook runners) and the CLI-side hardcoded `path.join(projectRoot, ".wolf")` in `init.ts:317`. Both must respect `OPENWOLF_METADATA_DIR`.

The docs exist but are generated stubs from a prior doc-writer run — they need substantial revision to cover the new features and the team mixed commit strategy.

**Primary recommendation:** Fix the HOOK_FILES deployment gap first (it's a deployed breakage), then layer locking, env var support, gitignore template, and doc updates on top. Each feature is independently meaningful and can be planned as separate waves.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | `withFileLock` using `fs.openSync(O_EXCL)` — Node.js built-in only | No new deps; cross-process; project's "no new deps" pattern |
| D-02 | Dynamic discovery of hook `.js` files in `writeHooks()` | Won't drift when new `wolf-*` modules are added |
| D-03 | `OPENWOLF_METADATA_DIR` as absolute path with `.wolf/` fallback | Flexible deployment; unambiguous path resolution |
| D-04 | `.wolf/.gitignore` with `*` + exceptions for committed files | Safest default (opt-in tracking); consistent with dot-directory conventions |
| D-05 | Split docs: `docs/configuration.md` + `docs/getting-started.md` | Different readers and purposes for reference vs. onboarding docs |

### Claude's Discretion (Research Required)

- **`withFileLock` location:** Whether in `wolf-json.ts` alongside `writeJSON`/`readJSON`, or new `wolf-lock.ts` sibling
- **Lock staleness TTL:** 30-second default TTL, configurable via `WITH_FILE_LOCK_TTL_MS` env var (planner choice)
- **`getWolfDir()` refactoring scope:** Extract `resolveWolfDir()` vs. update individual callers
- **Template for `.wolf/.gitignore`:** Live as file in `src/templates/` (preferred for consistency) or inline string in `init.ts`
- **`pnpm clean` update:** Whether to clean alternate metadata dir when `OPENWOLF_METADATA_DIR` is used

### Deferred Ideas (OUT OF SCOPE)
- De-duplicating `extractDescription` between hooks and scanner
- Adding `.wolf/` FS watcher for automatic lock cleanup
- `OPENWOLF_METADATA_DIR` support in the daemon
- Multiple metadata directories

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| pillar-3-1 | Fix HOOK_FILES deployment gap (include all wolf-*.js) | Confirmed: 6 wolf-* modules missing from static array; D-02 prescribes dynamic discovery |
| pillar-3-2 | Implement withFileLock for concurrent .wolf/ write safety | Confirmed: 6 hook files call hook-side writeJSON; D-01 prescribes fs.openSync(O_EXCL) |
| pillar-3-3 | Enable OPENWOLF_METADATA_DIR env var | Confirmed: getWolfDir() in wolf-paths.ts + init.ts:317 both hardcoded; D-03 prescribes absolute path fallback |
| pillar-3-4 | Add .wolf/.gitignore template, update init.ts | Confirmed: writeGitIgnore() appends to project-root .gitignore; D-04 prescribes internal .wolf/.gitignore |
| pillar-3-5 | Document configuration and mixed strategy | Confirmed: both doc files exist as stubs from prior doc-writer run; need substantial revision |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hook file deployment | CLI (init/update commands) | Build system (tsc compilation) | `writeHooks()` and `copyHookScripts()` in CLI copy compiled files from dist/ to .wolf/hooks/ |
| File locking | Hook subsystem (wolf-json.ts) | — | Hooks run as separate concurrent Node.js processes; locking prevents race conditions on .wolf/ JSON files |
| Metadata directory resolution | Path utilities (wolf-paths.ts / init.ts) | Env var (OPENWOLF_METADATA_DIR) | `getWolfDir()` resolves the path; env var overrides the default .wolf/ location |
| .gitignore strategy | CLI (init.ts) | Template file (src/templates/) | `init` writes the .wolf/.gitignore template; the template defines the pattern |
| Documentation | docs/ directory | README.md (links) | Reference and onboarding docs are separate concerns (D-05) |

## Standard Stack

This phase uses **zero new external packages** per D-01 and the project's established "no new deps" pattern.

### Core
| Library | Version (in project) | Purpose | Why Standard |
|---------|----------------------|---------|--------------|
| Node.js `fs.openSync` | built-in (`node:fs`) | Advisory per-file locking with `O_EXCL` | Cross-platform, no deps, multi-process safe [VERIFIED: codebase uses node:fs throughout] |
| Node.js `fs.renameSync` | built-in (`node:fs`) | Atomic file writes (temp+rename pattern) | Already used by writeJSON in both wolf-json.ts and fs-safe.ts [VERIFIED: codebase grep] |
| TypeScript `tsc` | ^5.7.0 | Compile hooks to dist/hooks/ | Existing build pipeline; tsconfig.hooks.json already configured [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto.randomBytes` | built-in | Temp file suffix generation | Already used by writeJSON for atomic write temp files |
| `node:path` | built-in | Path resolution and joining | All path operations |
| `node:fs.readdirSync` | built-in | Directory scan for dynamic hook discovery | New — replaces static HOOK_FILES iteration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs.openSync(O_EXCL)` built-in locking | `proper-lockfile` npm package | Adds dep for ~40 lines of code; inconsistent with "no new deps" pattern [CITED: D-01 rationale] |
| `fs.openSync(O_EXCL)` built-in locking | In-process `Mutex` | Hooks are separate processes — in-process mutex provides zero cross-process sync [CITED: D-01 rationale] |

**Installation:**
```bash
# No new packages needed — all changes use Node.js built-ins
```

## Package Legitimacy Audit

> No external packages are introduced in this phase. All changes use Node.js built-in modules (`node:fs`, `node:path`, `node:crypto`). No audit required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BUILD PIPELINE                              │
│  pnpm build:hooks → tsc compiles src/hooks/ → dist/hooks/ *.js     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     CLI COMMANDS (serial)                            │
│                                                                      │
│  openwolf init / openwolf update                                     │
│    │                                                                 │
│    ├── writeHooks() ─── Dynamic discovery: readdirSync(dist/hooks/) │
│    │                   Copy ALL .js files → .wolf/hooks/            │
│    │                                                                 │
│    ├── writeSettings() ─── Write .claude/settings.json with hooks   │
│    │                                                                 │
│    ├── writeGitIgnore() ── [REPLACED] Write .wolf/.gitignore from   │
│    │                       template (remove project-root append)    │
│    │                                                                 │
│    └── [NEW] OPENWOLF_METADATA_DIR check ── If set, metadata path   │
│                        = env var (absolute); else = .wolf/          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     HOOK PROCESSES (concurrent)                      │
│                                                                      │
│  Claude Code spawns: session-start, pre-read, post-read,            │
│                      pre-write, post-write, stop                     │
│    │  (each is a separate Node.js process)                            │
│    │                                                                  │
│    └── shared.ts facade ──→ wolf-json.ts                             │
│                              │                                        │
│                              ├── readJSON() ── reads .wolf/*.json    │
│                              │                                        │
│                              └── writeJSON()                          │
│                                    │                                   │
│                                    ├── withFileLock() ── O_EXCL lock │
│                                    │   ├── Acquire lock (.lock file) │
│                                    │   ├── Write (temp+rename)       │
│                                    │   └── Release lock              │
│                                    │                                   │
│                                    └── Staleness TTL check ── if     │
│                                        lock >30s old, break + retry  │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── hooks/                     # (existing — no structural changes)
│   ├── wolf-json.ts           # [MODIFY] Add withFileLock, wrap writeJSON
│   ├── wolf-paths.ts          # [MODIFY] getWolfDir() reads OPENWOLF_METADATA_DIR
│   ├── shared.ts              # [MODIFY] Export withFileLock if public
│   └── ... (other wolf-*.ts, hook runners) — unchanged
│
├── cli/
│   ├── hook-settings.ts       # [MODIFY] Replace HOOK_FILES with getHookFiles() or remove
│   ├── init.ts                # [MODIFY] Dynamic discovery, .wolf/.gitignore, OPENWOLF_METADATA_DIR
│   ├── update.ts              # [MODIFY] copyHookScripts() use dynamic discovery
│   └── status.ts              # [MODIFY] Hook presence check uses dynamic discovery
│
├── templates/                 # [ADD] .gitignore template file
│   ├── .gitignore             # [NEW] Template for .wolf/.gitignore
│   └── ... (14 existing templates)
│
└── utils/
    └── fs-safe.ts             # Optionally add withFileLock here too (planner discretion)

docs/
├── configuration.md           # [MODIFY] Add OPENWOLF_METADATA_DIR, .wolf/.gitignore, withFileLock
└── getting-started.md         # [MODIFY] Add mixed commit strategy, team workflow
```

### Pattern 1: Advisory Per-File Locking with O_EXCL
**What:** Use exclusive file creation (`fs.openSync(path + ".lock", O_CREAT | O_EXCL)`) as a lock primitive. The lock file is a zero-byte sentinel. If `openSync` succeeds, the lock is acquired. If it throws `EEXIST`, another process holds the lock. Clean up by deleting the `.lock` file after the write completes.

**When to use:** Wrapping every `writeJSON()` call in the hook subsystem where concurrent Node.js processes may write to the same `.wolf/` JSON file (`_session.json`, `token-ledger.json`, `buglog.json`).

**Key considerations:**
- **Staleness:** A crashed process leaves a `.lock` file. Check `fs.stat()` mtime; if older than TTL (default 30s), delete and retry.
- **Blocking vs non-blocking:** Use a short spin-loop (e.g., 10 retries with 50ms backoff) rather than blocking indefinitely.
- **Scope:** Lock per-file (`_session.json.lock`), not global. This matches the FS-as-Database pattern.

**Example:**
```typescript
// Source: Node.js fs docs + D-01 decision
import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_TTL_MS = parseInt(process.env.WITH_FILE_LOCK_TTL_MS || "30000", 10);
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 50;

function acquireLock(lockPath: string): number | null {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Check staleness
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_TTL_MS) {
          fs.unlinkSync(lockPath);
          continue; // retry
        }
      } catch { /* stale check race — retry */ }
      // Backoff
      if (i < MAX_RETRIES - 1) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
      }
    }
  }
  return null; // could not acquire
}

function releaseLock(fd: number, lockPath: string): void {
  try { fs.closeSync(fd); } catch { /* ignore */ }
  try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
}

export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = filePath + ".lock";
  const fd = acquireLock(lockPath);
  if (fd === null) {
    throw new Error(`Could not acquire lock for ${filePath} after ${MAX_RETRIES} retries`);
  }
  try {
    return fn();
  } finally {
    releaseLock(fd, lockPath);
  }
}
```

### Pattern 2: Dynamic Hook File Discovery
**What:** Replace the static `HOOK_FILES` array iteration with `fs.readdirSync(sourceDir).filter(f => f.endsWith(".js"))` to copy all compiled hook modules from `dist/hooks/` to `.wolf/hooks/`.

**When to use:** In `writeHooks()` (init.ts) and `copyHookScripts()` (update.ts).

**Example:**
```typescript
// Source: Project pattern — replaces HOOK_FILES iteration
function writeHooks(wolfDir: string): void {
  const hooksDir = path.join(wolfDir, "hooks");
  ensureDir(hooksDir);
  
  // Find source directory (same candidate logic as current)
  const sourceDir = findHookSourceDir();
  if (!sourceDir) { /* warn and return */ return; }
  
  // Dynamic discovery — copy ALL .js files
  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith(".js"));
  let copiedCount = 0;
  for (const file of files) {
    safeCopyFile(path.join(sourceDir, file), path.join(hooksDir, file));
    copiedCount++;
  }
  
  // Always write package.json with type:module
  fs.writeFileSync(
    path.join(hooksDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2) + "\n"
  );
}
```

### Anti-Patterns to Avoid
- **Maintaining two file lists:** After D-02, don't keep `HOOK_FILES` and a dynamic scan. Remove the static array entirely or keep it only for status reporting (with a comment noting it may drift).
- **Global lock for all writes:** Lock per-file, not per-directory. The FS-as-Database pattern means files are independent.
- **Silently infinite-retry on lock:** Always have a max retry count and TTL. A stuck lock should surface as an error, not a silent hang.
- **Lock without cleanup in finally:** Always use try/finally to release locks, even if the write throws.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-process file locking | Custom IPC/lock server | `fs.openSync(O_EXCL)` | Built-in, cross-platform, no deps. The OS kernel provides the atomicity. |
| File copy with atomicity | Raw `fs.copyFileSync` | `safeCopyFile()` from `src/utils/fs-safe.ts` | Handles EPERM on WSL2/EFS, preserves permissions, uses temp+rename for atomicity. Already exists. |

**Key insight:** Every problem in this phase has a simple Node.js built-in solution. Adding npm packages for file locking or directory scanning would violate the project's "no new deps for tooling" pattern established in prior phases.

## Common Pitfalls

### Pitfall 1: Lock file orphaned after crash
**What goes wrong:** A hook process crashes (SIGKILL, power loss) while holding a lock. The `.lock` file remains forever, causing all future writes to that file to fail.
**Why it happens:** `O_EXCL` creates a file on disk; if the process doesn't reach the `unlinkSync` cleanup, the file persists.
**How to avoid:** Implement staleness TTL (30s default, configurable). On encountering an existing lock, check `fs.stat().mtime` and break if expired. For extra safety, include the hostname/PID in a lock metadata file.
**Warning signs:** Hooks consistently report "Could not acquire lock for X" on the same file.

### Pitfall 2: HOOK_FILES used in status check after dynamic discovery removal
**What goes wrong:** After D-02 removes the static `HOOK_FILES` array, `status.ts` (line 66) still references it for hook presence checks. Either the status output breaks or a stale `HOOK_FILES` gives inaccurate information.
**Why it happens:** `status.ts` imports `HOOK_FILES` from `hook-settings.ts` at line 6.
**How to avoid:** Replace the `HOOK_FILES` import in `status.ts` with a dynamic directory scan of `.wolf/hooks/`, matching the same logic in the copy step.
**Warning signs:** `status` command shows wrong hook count after deployment.

### Pitfall 3: writeGitIgnore() not removed — both project-root .gitignore AND .wolf/.gitignore active
**What goes wrong:** The old `writeGitIgnore()` appends `.wolf/` to `../.gitignore`, AND the new `.wolf/.gitignore` contains `*`. Combined, `.wolf/` is doubly ignored. This is redundant but not harmful — however, a user expecting the `.wolf/.gitignore` to control tracking may be confused when `.gitignore` also ignores `.wolf/`.
**Why it happens:** D-04 says to REPLACE, not add to, the gitignore strategy. If the old function isn't removed, both operate.
**How to avoid:** Remove the `writeGitIgnore()` call from `initCommand()` and either delete the function or leave it dormant.
**Warning signs:** `.wolf/` appears in both `../.gitignore` and `.wolf/.gitignore`.

### Pitfall 4: OPENWOLF_METADATA_DIR used in init.ts but not in update.ts
**What goes wrong:** `init.ts` checks `OPENWOLF_METADATA_DIR` and creates the metadata dir at the alternate path. `update.ts` does NOT check the env var and looks for `.wolf/` at the hardcoded path — silently updating a non-existent directory.
**Why it happens:** `update.ts` has its own `wolfDir = path.join(root, ".wolf")` at line 148, and `copyHookScripts()` in update.ts uses `HOOK_FILES` iteration.
**How to avoid:** Apply env var resolution and dynamic discovery to both `init.ts` AND `update.ts`.
**Warning signs:** `openwolf update` reports success but hooks are missing from the alternate metadata dir.

### Pitfall 5: CLAUDE.md already has OpenWolf reference — duplicate insertion
**What goes wrong:** `writeClaudeRules()` at line 188-199 of init.ts prepends `@.wolf/OPENWOLF.md` to CLAUDE.md. After the `init.ts` refactoring, this logic must be preserved alongside the new .wolf/.gitignore logic. If the init flow is reorganized, the CLAUDE.md check could produce duplicates.
**Why it happens:** The marker check (`!content.includes("OpenWolf")`) guards against this, but relocation of the call could cause issues.
**How to avoid:** Keep the guard logic but refactor the CLAUDE.md write into a standalone function called from `initCommand()`.
**Warning signs:** Multiple `@.wolf/OPENWOLF.md` lines in CLAUDE.md.

## Code Examples

### Key Call Sites for withFileLock (hook-side writeJSON callers)

All six callers below go through `shared.ts` → `wolf-json.ts` `writeJSON()`. Wrapping at the `wolf-json.ts` level means all six automatically get locking without per-caller changes.

| Hook File | Line(s) | File Written | Concurrent Risk |
|-----------|---------|-------------|-----------------|
| `session-start.ts` | 40, 129 | `_session.json`, `token-ledger.json` | Medium — session start races with stop |
| `pre-read.ts` | 55, 93 | `_session.json` | Medium — multiple read tools in rapid succession |
| `post-read.ts` | 68 | `_session.json` | Medium — follows pre-read |
| `post-write.ts` | 174, 326, 345 | `_session.json`, `buglog.json` | HIGH — multiple write tools in parallel |
| `stop.ts` | 148, 192 | `token-ledger.json`, `_session.json` | HIGH — stop races with session-start |
| `wolf-files.ts` | 16 | `worktree.json` | Low — written once per session init |

### Existing writeJSON in wolf-json.ts (unchanged structure — add withFileLock wrapper)
```typescript
// Source: src/hooks/wolf-json.ts line 54-83
// MODIFIED: wrapped with withFileLock
export function writeJSON(filePath: string, data: unknown): void {
  withFileLock(filePath, () => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
    const payload = JSON.stringify(data, null, 2);
    try {
      fs.writeFileSync(tmp, payload, "utf-8");
      fs.renameSync(tmp, filePath);
    } catch (renameErr) {
      // ... existing fallback logic ...
    }
  });
}
```

### getWolfDir() with OPENWOLF_METADATA_DIR support
```typescript
// Source: src/hooks/wolf-paths.ts line 43-46
// MODIFIED: checks env var with .wolf/ fallback
export function getWolfDir(): string {
  const envDir = process.env.OPENWOLF_METADATA_DIR;
  if (envDir && envDir.trim().length > 0) {
    const resolved = path.resolve(envDir.trim());
    if (!path.isAbsolute(resolved)) {
      // Reject relative paths — use .wolf/ fallback
      // (though path.resolve with cwd makes it absolute; edge case for explicit rejection)
    }
    return resolved;
  }
  const ctx = detectWorktreeContext();
  return path.join(ctx.mainRepoRoot, ".wolf");
}
```

### .wolf/.gitignore template content
```
*
!.gitignore
!OPENWOLF.md
!config.json
!identity.md
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `HOOK_FILES` array | Dynamic `readdirSync` scan of `dist/hooks/` | This phase | Eliminates drift between file list and compiled modules |
| No file locking for writeJSON | `withFileLock` wrapping writeJSON | This phase | Prevents race conditions from concurrent hook processes |
| Hardcoded `.wolf/` in getWolfDir() | `OPENWOLF_METADATA_DIR` env var with `.wolf/` fallback | This phase | Supports alternate mount points, network shares |
| `.wolf/` appended to project-root .gitignore | `.wolf/.gitignore` with `*` + opt-in exceptions | This phase | Finer-grained control over what gets committed |
| Single merged docs | `docs/configuration.md` + `docs/getting-started.md` | This phase | Separation of reference and onboarding concerns |

**Deprecated/outdated:**
- The `HOOK_FILES` constant in `hook-settings.ts` — will be replaced by dynamic discovery (D-02). Status command must also switch to dynamic scan.
- `writeGitIgnore()` in `init.ts` — will be replaced by `.wolf/.gitignore` template (D-04).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fs.openSync` with `O_EXCL` is available on all Node.js >= 20 platforms (macOS, Linux, Windows) | Standard Stack | LOW — confirmed via Node.js docs; O_EXCL is POSIX and Windows-compatible in Node.js |
| A2 | No performance bottleneck from lock acquisition (10 retries × 50ms = 500ms worst case) | Architecture Patterns | LOW — hooks have 5-10s timeout; 500ms lock wait is 5-10% of budget |
| A3 | `shared.ts` barrel import works unchanged after withFileLock is added | Code Examples | MEDIUM — must verify the export is properly re-exported through the barrel |
| A4 | `status.ts` hook presence check can use dynamic scan instead of HOOK_FILES | Pitfalls | MEDIUM — depends on whether the status check should verify specific known files or just count files |
| A5 | Existing docs/configuration.md and docs/getting-started.md need full rewrite, not edit | State of the Art | MEDIUM — both exist from a prior doc-writer run; may contain valuable content to merge |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Lock scope: apply to CLI-side writeJSON (fs-safe.ts) too?**
   - What we know: D-01 specifically targets the hook-side writeJSON in wolf-json.ts. CLI commands (init, update, cron) are user-invoked serial operations.
   - What's unclear: Whether the daemon's concurrent cron tasks (cron-engine.ts uses writeJSON) also need locking.
   - Recommendation: Apply to hook-side only for now. Daemon uses a single process with sequential task execution — unlikely to race. Add daemon locking in a future phase if needed.

2. **Should HOOK_FILES be removed or kept with a comment?**
   - What we know: D-02 says "replace" HOOK_FILES. But `hook-settings.ts` is imported by `status.ts` for hook presence checks.
   - What's unclear: Whether to keep a minimal HOOK_FILES for status reporting or fully remove it and have status.ts read the dir.
   - Recommendation: Remove HOOK_FILES from the copy path (D-02). Keep it in status.ts only if status needs to verify specific hook files exist — otherwise switch to dynamic scan there too.

3. **OPENWOLF_METADATA_DIR in update.ts?**
   - What we know: D-03 targets getWolfDir() and init.ts. update.ts (line 148) hardcodes `path.join(root, ".wolf")`.
   - What's unclear: Whether update should also use the env var for finding .wolf/ state.
   - Recommendation: Yes — update.ts should check the env var for the metadata directory path. Otherwise, a user who inits with OPENWOLF_METADATA_DIR gets broken updates.

## Environment Availability

> Skip — phase is index 3 (team workflow improvements). Phase 0 (prerequisite fix) and Phases 1-2 run first. Verify the environment in Phase 0. This phase assumes pnpm build works, `node >= 20`, and the hooks compile. No additional tools required.

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled per instructions.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.5 |
| Config file | none detected — defaults apply |
| Quick run command | `pnpm test` (vitest run) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| pillar-3-1 | Dynamic hook discovery copies all .js files | unit | `vitest run src/hooks/wolf-json.test.ts` | ❌ Wave 0 |
| pillar-3-2 | withFileLock acquires/releases lock | unit | `vitest run src/hooks/wolf-json.test.ts` | ❌ Wave 0 |
| pillar-3-2 | withFileLock respects staleness TTL | unit | `vitest run src/hooks/wolf-json.test.ts` | ❌ Wave 0 |
| pillar-3-2 | withFileLock handles EEXIST retry | unit | `vitest run src/hooks/wolf-json.test.ts` | ❌ Wave 0 |
| pillar-3-3 | getWolfDir() reads OPENWOLF_METADATA_DIR env var | unit | `vitest run src/hooks/wolf-paths.test.ts` | ❌ Wave 0 |
| pillar-3-4 | init writes .wolf/.gitignore template | integration | manual or integration test | ❌ Wave 0 |
| pillar-3-5 | Docs mention all new features | manual | — | ❌ Wave 0 (manual review) |

### Sampling Rate
- **Per task commit:** Not applicable — no test infrastructure exists yet
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test` must pass before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/hooks/wolf-json.test.ts` — unit test for `writeJSON` with `withFileLock`
- [ ] `src/hooks/wolf-paths.test.ts` — unit test for `getWolfDir` with env var
- [ ] `src/cli/init.test.ts` — integration test for .wolf/.gitignore creation

## Security Domain

> `security_enforcement` key is absent from `.planning/config.json`. Per instructions, absent = enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `OPENWOLF_METADATA_DIR` is absolute path; reject relative |
| V6 Cryptography | no | No cryptographic operations in this phase |
| V7 Error Handling | yes | Lock staleness TTL prevents permanent DoS from orphaned locks |

### Known Threat Patterns for Node.js + file operations

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lock file DoS (attacker fills disk with .lock files) | Denial of Service | TTL-based staleness check; locks limited to files being written |
| Symlink attack on lock file | Tampering | `O_CREAT | O_EXCL` prevents following symlinks (open fails on symlink) |
| Race condition in lock-acquire-check | Tampering | `O_EXCL` provides atomic create-and-check; eliminate TOCTOU by using a single syscall |
| Path traversal via OPENWOLF_METADATA_DIR | Tampering | Reject non-absolute paths; only one level of indirection |

## Sources

### Primary (HIGH confidence)
- [Codebase: src/cli/hook-settings.ts] — HOOK_FILES array at line 156, missing 6 wolf-* modules [VERIFIED: codebase read]
- [Codebase: src/cli/init.ts] — writeHooks() at line 68-112 uses HOOK_FILES; writeGitIgnore() at line 159-175 appends .wolf/ to project .gitignore [VERIFIED: codebase read]
- [Codebase: src/hooks/wolf-json.ts] — writeJSON at line 54-83 with temp+rename pattern [VERIFIED: codebase read]
- [Codebase: src/hooks/wolf-paths.ts] — getWolfDir() at line 43-46 hardcoded to .wolf/ [VERIFIED: codebase read]
- [Codebase: src/hooks/shared.ts] — barrel re-export at line 18 exports writeJSON from wolf-json [VERIFIED: codebase read]
- [Codebase: src/cli/update.ts] — copyHookScripts() at line 321-351 uses HOOK_FILES [VERIFIED: codebase read]
- [Codebase: src/cli/status.ts] — line 66 uses HOOK_FILES for hook presence check [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- [Context from CONTEXT.md] — D-01 through D-05 locked decisions and rationale [CITED: 03-CONTEXT.md]

### Tertiary (LOW confidence)
- None — all findings are verified against the codebase or CONTEXT.md

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against codebase; no new packages needed
- Architecture: HIGH — patterns verified against existing code; D-01 through D-05 provide clear direction
- Pitfalls: HIGH — all based on codebase analysis of existing callers and integration points

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (30 days — stable Node.js features, no fast-moving dependencies)
