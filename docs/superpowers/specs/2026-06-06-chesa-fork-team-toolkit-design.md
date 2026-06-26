> **NOTE:** Historical design artifact (v1.2-beta era). The `STATUS.md` protocol described below is deprecated and replaced by the framework-blind resume seam in `OPENWOLF.md`.

# CHESA Fork Team Toolkit — Design Spec

> Date: 2026-06-06
> Author: Brian Summa / Claude
> Status: Draft
> Scope: Fork installation, upstream sync, and .wolf/ team workflow improvements

## Background

OpenWolf upstream (cytostack/openwolf v1.0.4) has no worktree support, slow PR
merges, and assumes a single-developer-per-checkout model. The CHESA fork
(chesa/openwolf, v1.0.5-beta) already solved the hardest problems — worktree
detection via `git rev-parse --git-common-dir`, `WOLF_ROOT_SHELL` hook path
resolution, per-worktree session isolation — but lacks tooling for team
adoption, fork management, and concurrent-write safety.

This spec covers three pillars designed together:

1. **Fork installation & team onboarding** — reliable install path for 4-5
   developers with mixed build-tool comfort
2. **Fork divergence management** — track upstream, stay mergeable, know when
   PRs land
3. **`.wolf/` team workflow improvements** — lockfile for concurrent writes,
   `OPENWOLF_METADATA_DIR` env var, `.wolf/.gitignore` template for mixed
   commit strategy

### Prerequisite: Fix `HOOK_FILES` deployment gap

The existing `HOOK_FILES` array in `src/cli/hook-settings.ts` only lists 8
files (6 hook scripts + `shared.js` + `worktree-helper.js`). The 6 internal
`wolf-*.js` modules (`wolf-anatomy.js`, `wolf-describe.js`, `wolf-files.js`,
`wolf-json.js`, `wolf-misc.js`, `wolf-paths.js`) are NOT listed and therefore
are not copied to `.wolf/hooks/` during `openwolf init` or `openwolf update`.
This is a pre-existing bug — fresh installs that don't have manually-copied
wolf-* files will crash with `ERR_MODULE_NOT_FOUND`.

**This must be fixed before implementing Pillar 3a.** The new `wolf-lock.js`
module inherits this gap. The fix: add all `wolf-*.js` modules to `HOOK_FILES`
in a standalone commit before any Pillar 3 work begins.

### What's deferred

**"Propose" mode for learnings** — hooks would buffer cerebrum/memory
suggestions for human review instead of auto-writing. This is a significant UX
change requiring a review/approve flow in the CLI or dashboard. It gets its own
design cycle after the team is stable on the fork.

## Pillar 1: Fork Installation & Team Onboarding

### 1a. Install script — `scripts/install-global.sh`

A self-contained Bash script in the repo that automates the verified
installation procedure.

**Behavior:**

1. Validate prerequisites:
   - Node.js >= 20 (via `node --version`)
   - pnpm installed (via `which pnpm`)
   - git installed (via `which git`)
   - Print clear install instructions for any missing prerequisite
2. Run `pnpm install`
3. Run `pnpm build` (which chains: tsc, build:hooks, build:dashboard,
   build:templates)
4. Run `npm install -g .`
5. Verify: run `openwolf --version` and print the installed path
6. If an `upstream` remote doesn't exist, add it (see Pillar 2)

**Error handling:** If any step fails, print the exact error and the manual
command to retry from that point. Don't leave partial state.

**Upgrade detection:** If `openwolf` is already on `$PATH`, print
"Upgrading from vX to vY" before proceeding.

**Script standards:** `set -euo pipefail`, shellcheck-clean, Bash 3.2
compatible (no bash 4+ features).

### 1b. Package.json script alias

Add to `package.json`:

```json
"install:global": "pnpm build && npm install -g ."
```

This is the "already cloned, just want to rebuild and reinstall" shortcut.
The upgrade workflow becomes: `git pull && pnpm install && pnpm run install:global`

### 1c. README section

Add an "Installing from the CHESA Fork" section to README.md:

- **First-time setup:**
  ```
  git clone git@github.com:chesa/openwolf.git
  cd openwolf
  bash scripts/install-global.sh
  ```
- **Upgrade:**
  ```
  cd <your-openwolf-clone>
  git pull
  pnpm install && pnpm run install:global
  ```
- **Why not `npm install -g chesa/openwolf`?** — The `dist/` directory is a
  build artifact and is not committed. A local build is required.

### 1d. Upgrade path

Same `pnpm run install:global` command works for upgrades. The script is
idempotent — running it twice produces the same result.

After upgrading, developers should run `openwolf update` in each initialized
project to sync hooks.

### Files created/modified

| File | Action |
|------|--------|
| `scripts/install-global.sh` | Create |
| `package.json` | Add `install:global` script |
| `README.md` | Add installation section |

## Pillar 2: Fork Divergence Management

### 2a. Upstream remote

The repo gets a second git remote tracking the original upstream:

```
git remote add upstream https://github.com/cytostack/openwolf.git
```

HTTPS is used intentionally — the upstream remote is read-only (fetch only,
never push), so no SSH key is needed. The CHESA fork clone itself uses SSH
(`git@github.com:chesa/openwolf.git`) because developers push to it.

This is:
- Added automatically by `scripts/install-global.sh` (if not present)
- Documented in README and CONTRIBUTING.md
- Read-only (fetch only, never push)

### 2b. Sync script — `scripts/sync-upstream.sh`

An operator-guided (not automated) script that shows fork divergence and
recommends actions.

**Behavior:**

1. Verify `upstream` remote exists; add it if missing
2. `git fetch upstream`
3. Show divergence report:
   - Commits ahead of upstream: `git log --oneline upstream/main..main`
   - Commits behind upstream: `git log --oneline main..upstream/main`
   - Upstream tags newer than the fork's base
4. Print recommended action based on state:
   - "You are N ahead, 0 behind — upstream has no new changes."
   - "You are N ahead, M behind — review upstream changes with:
     `git log --oneline main..upstream/main`"
   - "Upstream merged your PR(s) — these commits are now in both:
     `git log --oneline --cherry-mark upstream/main...main`"
5. If upstream has new changes, suggest (but don't execute):
   - `git merge upstream/main` (for simple syncs)
   - `git rebase upstream/main` (for clean history)

The script does NOT auto-merge or auto-rebase. Rebasing a fork with 183+
commits needs human judgment.

### 2c. Branch strategy

- `main` / `develop` gitflow stays unchanged
- `upstream` remote is fetch-only
- When upstream merges a CHESA PR, `sync-upstream.sh` detects the commit
  is no longer in the "ahead" list
- Cherry-picked upstream fixes go onto `develop` via normal gitflow

### 2d. Version convention

- Fork uses `X.Y.Z-beta` suffix (currently `1.0.5-beta`)
- The `-beta` signals "fork build, not official release"
- When upstream releases a new version, bump the fork version after syncing
- The version is the single source of truth in `package.json`

### Files created/modified

| File | Action |
|------|--------|
| `scripts/sync-upstream.sh` | Create |
| `README.md` | Add fork management section |

## Pillar 3: .wolf/ Team Workflow Improvements

### 3a. Lockfile for concurrent `.wolf/` writes

**Problem:** Two concurrent Claude sessions can lose each other's writes to
shared `.wolf/` files (cerebrum.md, buglog.json, memory.md). The existing
`writeJSON` uses atomic rename (protects against corruption), but doesn't
prevent read-modify-write races (last writer wins).

**Mechanism:** A `withFileLock(filePath, fn)` utility function.

**Lock acquisition:**
1. Attempt `fs.writeFileSync(filePath + '.lock', pid + '\n' + Date.now(), { flag: 'wx' })`
   - `wx` = exclusive create; fails with `EEXIST` if lock file already exists
2. On `EEXIST`:
   a. Read the lock file contents and parse the embedded `Date.now()`
      timestamp (second line). Use the embedded timestamp, not file mtime,
      because mtime is unreliable on network filesystems.
   b. If lock is older than 10 seconds, consider it stale — remove it and
      immediately retry the `wx` create (step 1). This is one atomic retry
      step: remove + re-attempt. If the re-attempt fails with `EEXIST`
      again (another process grabbed the lock between remove and create),
      fall through to step 2c.
   c. Otherwise (lock is fresh), wait 100ms and retry (up to 3 attempts
      total including stale-removal retries)
3. After 3 failed attempts, proceed without lock and write a warning to stderr:
   `"OpenWolf: could not acquire lock for <file>, proceeding unlocked"`

**Lock release:**
- `fs.unlinkSync(filePath + '.lock')` in a `finally` block
- If unlink fails (file already removed), swallow silently

**Why 10-second stale threshold?** Hook timeout is 5-10 seconds (per
`hook-settings.ts`). A lock older than 10 seconds means the owning process
was killed or timed out.

**Why not `flock(2)`?** Node.js doesn't expose POSIX `flock` natively.
The `wx`-flag lockfile pattern is portable (macOS, Linux, Windows), requires
no native dependencies, and is the standard Node.js approach (npm uses it).

**Scope:** Only wraps functions that do read-modify-write cycles:
- `writeJSON()` in `wolf-json.ts` — the primary read-modify-write path
  (buglog dedup, token ledger updates, config merges)

`appendMarkdown()` is NOT locked — `fs.appendFileSync` is a single atomic
append on local POSIX filesystems. Two concurrent appends to `memory.md`
interleave lines but don't lose data. Locking it would add 100ms+ retry
latency for no benefit.

The lock is per-file — two hooks writing to different files don't block
each other.

**Location:** `withFileLock` lives in a new `wolf-lock.ts` module in
`src/hooks/`, re-exported through `shared.ts`. It's part of the hooks build
(tsconfig.hooks.json), not the main CLI build.

#### Files created/modified

| File | Action |
|------|--------|
| `src/hooks/wolf-lock.ts` | Create — `withFileLock()` implementation |
| `src/hooks/shared.ts` | Add re-export of `withFileLock` |
| `src/hooks/wolf-json.ts` | Wrap `writeJSON` with lock |
| `src/cli/hook-settings.ts` | Add `wolf-lock.js` + all `wolf-*.js` to `HOOK_FILES` (prerequisite fix) |

### 3b. `OPENWOLF_METADATA_DIR` environment variable

**Problem:** `.wolf/` is always at `<git-common-dir>/.wolf/`. This doesn't
work for CI runners (ephemeral state), shared network paths, or developers
who want `.wolf/` elsewhere.

**Mechanism:** `getWolfDir()` checks `process.env.OPENWOLF_METADATA_DIR`
first. If set, it returns that path directly — no git detection needed.

**Affected code paths:**

1. **Hooks** (`src/hooks/wolf-paths.ts`):
   ```typescript
   export function getWolfDir(): string {
     if (process.env.OPENWOLF_METADATA_DIR) {
       return path.resolve(process.env.OPENWOLF_METADATA_DIR);
     }
     const ctx = detectWorktreeContext();
     return path.join(ctx.mainRepoRoot, ".wolf");
   }
   ```

2. **CLI** (`src/utils/paths.ts`):
   Same pattern — check env var before git-based resolution.

3. **Hook shell commands** (`src/cli/hook-settings.ts`):
   Update `WOLF_ROOT_SHELL` to check the env var first:
   ```bash
   WOLF_ROOT="${OPENWOLF_METADATA_DIR:-$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null \
     && cd "$(dirname "$(git rev-parse --git-common-dir 2>/dev/null)")" \
     2>/dev/null && pwd || echo "$CLAUDE_PROJECT_DIR")}"
   ```

4. **Init/Update** (`src/cli/init.ts`, `src/cli/update.ts`):
   Both hardcode `path.join(projectRoot, ".wolf")` for `wolfDir`. Update
   to check `process.env.OPENWOLF_METADATA_DIR` first, same as hooks.
   The worktree guard in `init.ts` (lines 301-313) must also use the
   env var resolution — if the env var is set, the worktree guard is
   irrelevant (the metadata dir is explicit, not derived from git).

**Validation:**
- If env var is set but directory doesn't exist:
  - **Hooks:** `ensureWolfDir()` creates the directory with
    `mkdirSync({ recursive: true })` when the env var is set. This is
    different from the "no .wolf/ means not an OpenWolf project" check
    (which exits silently). When the env var is set, the user explicitly
    asked for this path — creating it is the right default.
  - **CLI commands:** same behavior — create if env var is set, print
    warning otherwise
- The env var must be an absolute path; relative paths are resolved against
  `process.cwd()`

**Session directory with env var:** When `OPENWOLF_METADATA_DIR` is set,
`getSessionDir()` still namespaces by worktree ID (if in a worktree) under
the custom path. If not in a worktree, session dir equals the metadata dir.

#### Files modified

| File | Action |
|------|--------|
| `src/hooks/wolf-paths.ts` | Check env var in `getWolfDir()` |
| `src/hooks/wolf-files.ts` | `ensureWolfDir()` creates dir when env var is set |
| `src/utils/paths.ts` | Check env var in `getWolfDir()` |
| `src/cli/hook-settings.ts` | Update `WOLF_ROOT_SHELL` |
| `src/cli/init.ts` | Check env var for `wolfDir` resolution |
| `src/cli/update.ts` | Check env var for `wolfDir` resolution |
| `docs/configuration.md` | Document env var |

### 3c. `.wolf/.gitignore` template for mixed commit strategy

**Problem:** `openwolf init` currently adds `.wolf/` to the project root
`.gitignore`, which gitignores everything. Teams using the mixed strategy
(commit shared knowledge, ignore per-dev state) have to manually craft
the gitignore.

**Mechanism:** A new template file `src/templates/wolf-gitignore` (no dot
prefix — template files use plain names) that gets copied to
`.wolf/.gitignore` during `openwolf init`. The `init.ts` copy logic maps
the template name `wolf-gitignore` to the destination `.gitignore` inside
`.wolf/`, similar to how other templates are name-mapped.

**Template contents:**

```gitignore
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

# Transient lock files from concurrent-write protection
*.lock

# Shared knowledge files are NOT listed here, so they ARE committed:
#   anatomy.md        — project file map
#   cerebrum.md       — learned conventions and do-not-repeat list
#   OPENWOLF.md       — operating protocol
#   config.json       — project configuration
#   buglog.json       — known bugs and fixes
#   identity.md       — project identity
#   STATUS.md         — project status (may be per-dev depending on workflow)
#   hooks/            — compiled hook scripts
#   reframe-frameworks.md
#   cron-manifest.json  — cron config (cron-state.json is per-dev, above)
```

**Changes to `writeGitIgnore()` in `init.ts`:**

The current behavior adds `.wolf/` to the project root `.gitignore`. The new
behavior:

1. Write `.wolf/.gitignore` from the template (always — it's in
   `ALWAYS_OVERWRITE` so it stays current on upgrades)
2. Do NOT add `.wolf/` to the root `.gitignore`
3. If the root `.gitignore` already contains `.wolf/`:
   - Print a notice to the developer:
     ```
     ℹ Your .gitignore contains '.wolf/' which blocks all wolf files.
       To use the mixed commit strategy (recommended for teams), remove
       the '.wolf/' line — the new .wolf/.gitignore handles per-file
       exclusions.
     ```
   - Do NOT auto-remove the line (destructive; developer decides)

**Migration for existing projects:** Running `openwolf init` (upgrade) on an
existing project writes `.wolf/.gitignore` and prints the notice if the root
`.gitignore` has `.wolf/`. The developer manually removes the root entry when
ready to adopt the mixed strategy.

#### Files created/modified

| File | Action |
|------|--------|
| `src/templates/wolf-gitignore` | Create — template for .wolf/.gitignore |
| `src/cli/init.ts` | Update `writeGitIgnore()`, add to `ALWAYS_OVERWRITE` |
| `docs/getting-started.md` | Document mixed commit strategy |

## Architecture Summary

```
scripts/
  install-global.sh          # Pillar 1: one-command install
  sync-upstream.sh           # Pillar 2: upstream divergence report

src/hooks/
  wolf-lock.ts               # Pillar 3a: withFileLock() utility (NEW)
  wolf-paths.ts              # Pillar 3b: OPENWOLF_METADATA_DIR check
  wolf-files.ts              # Pillar 3b: ensureWolfDir() auto-create when env var set
  wolf-json.ts               # Pillar 3a: lock-wrapped writeJSON
  shared.ts                  # Re-export withFileLock

src/cli/
  hook-settings.ts           # Pillar 3a: add wolf-*.js to HOOK_FILES (prereq fix)
                              # Pillar 3b: WOLF_ROOT_SHELL env var check
  init.ts                    # Pillar 3b: env var in wolfDir resolution
                              # Pillar 3c: .wolf/.gitignore, root gitignore notice
  update.ts                  # Pillar 3b: env var in wolfDir resolution

src/utils/
  paths.ts                   # Pillar 3b: OPENWOLF_METADATA_DIR check

src/templates/
  wolf-gitignore             # Pillar 3c: .wolf/.gitignore template (NEW)

package.json                 # Pillar 1b: install:global script
README.md                    # Pillars 1c, 2: install + fork management docs
docs/configuration.md        # Pillar 3b: OPENWOLF_METADATA_DIR docs
docs/getting-started.md      # Pillar 3c: mixed commit strategy docs
```

## Testing Strategy

### Pillar 1 (install script)
- Manual: clone into a temp directory, run `bash scripts/install-global.sh`,
  verify `openwolf --version` works
- The script itself validates each step; no unit tests needed for shell scripts

### Pillar 2 (sync script)
- Manual: run `bash scripts/sync-upstream.sh` and verify the divergence report
  against `git log` output
- No automated tests — it's a read-only reporting tool

### Pillar 3a (lockfile)
- Unit test: two concurrent `withFileLock` calls on the same file — verify
  second caller retries and both writes succeed
- Unit test: stale lock (mtime > 10s) is forcibly removed
- Unit test: lock contention timeout — verify stderr warning and unlocked
  write proceeds

### Pillar 3b (env var)
- Unit test: `getWolfDir()` returns env var value when set
- Unit test: `getWolfDir()` falls back to git-common-dir when env var unset
- Integration test: hook command with `OPENWOLF_METADATA_DIR` set to a temp
  directory

### Pillar 3c (.gitignore template)
- Unit test in `init.test.ts`: fresh init creates `.wolf/.gitignore` and does
  NOT add `.wolf/` to root `.gitignore`
- Unit test: upgrade with existing root `.wolf/` gitignore entry prints notice

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Lockfile left behind by killed process | 10-second stale threshold; worst case: next session cleans it up |
| `OPENWOLF_METADATA_DIR` set to a relative path | `path.resolve()` normalizes it; documented as "should be absolute" |
| Root `.gitignore` change confuses existing teams | Init prints a notice but does NOT auto-remove; migration is opt-in |
| Upstream rebases/force-pushes break sync script | Script uses `--oneline` log comparison, not SHAs; prints raw output for human review |
| Lock contention in high-concurrency scenarios (3+ sessions) | 3-retry limit prevents hanging; unlocked fallback preserves hook responsiveness over write safety |

## Success Criteria

1. A developer with Node 20 and pnpm can go from zero to `openwolf --version`
   in under 5 minutes using the install script
2. `scripts/sync-upstream.sh` accurately reports the commit delta between fork
   and upstream
3. Two concurrent Claude sessions writing to the same `cerebrum.md` do not
   lose either session's entries
4. Setting `OPENWOLF_METADATA_DIR=/tmp/wolf-test` causes all hooks and CLI
   commands to use that directory instead of `.wolf/`
5. Running `openwolf init` on a fresh project creates `.wolf/.gitignore` with
   the mixed strategy and does not add `.wolf/` to the root `.gitignore`
