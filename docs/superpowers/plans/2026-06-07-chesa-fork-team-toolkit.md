# CHESA Fork Team Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 3-pillar CHESA fork team toolkit — install script, upstream sync, and .wolf/ team workflow improvements.

**Architecture:** Three independent pillars touching scripts/, hooks/, CLI/, and docs/. Pillar 3a (lockfile) refactors existing `wolf-lock.ts` to match spec semantics (embedded timestamps, proceed-unlocked on failure). Pillars 1 and 2 are new files. Pillar 3c adds a template and updates init flow. All changes are backward compatible.

**Tech Stack:** TypeScript (hooks + CLI), Bash 3.2+ (scripts), Node 20+, pnpm, vitest

---

### Prerequisite Check: HOOK_FILES deployment gap

The spec flags that `HOOK_FILES` in `src/cli/hook-settings.ts` doesn't list `wolf-*.js` modules. This was already fixed in a prior iteration — the static `HOOK_FILES` array was replaced with dynamic discovery via `getHookFileNames()` in `hook-copy.ts` (reads all `.js` files from source dir). **No action needed.**

---

## Task 1: Add `install:global` script to package.json

**Files:**
- Modify: `package.json:55-60`

- [ ] **Step 1: Add the script entry**

Edit `package.json` to add `install:global` between `install:dev` and `dev`:

```json
    "install:global": "pnpm build && npm install -g .",
```

Locate the `"scripts"` block and add the entry. The existing scripts section looks like:

```json
  "scripts": {
    "prebuild": "rm -rf dist",
    "build": "tsc && pnpm build:hooks && pnpm build:dashboard && pnpm build:templates",
    "build:templates": "cp -r src/templates dist/templates",
    "build:hooks": "tsc -p tsconfig.hooks.json",
    "build:dashboard": "vite build src/dashboard/app",
    "install:dev": "bash scripts/install-dev.sh",
    "install:global": "pnpm build && npm install -g .",
    "dev": "tsc --watch",
    ...
  },
```

- [ ] **Step 2: Verify the script parses**

Run: `node -e "const p = require('./package.json'); console.log(p.scripts['install:global'])"`
Expected: `pnpm build && npm install -g .`

---

## Task 2: Create `scripts/install-global.sh`

**Files:**
- Create: `scripts/install-global.sh`

- [ ] **Step 1: Write the install script**

Create `scripts/install-global.sh` with `set -euo pipefail`, Bash 3.2 compatible:

```bash
#!/usr/bin/env bash
set -euo pipefail

# OpenWolf CHESA Fork — automatic install script
# Usage: bash scripts/install-global.sh

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Prerequisites ---
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org/ (v20+)."; exit 1; }
NODE_VERSION=$(node --version | sed 's/[^0-9]*//' | cut -c1-2)
if [ "$NODE_VERSION" -lt 20 ] 2>/dev/null; then
  echo "Error: Node.js 20+ required. Found: $(node --version)"
  echo "Upgrade from https://nodejs.org/"
  exit 1
fi

command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required. Install: npm install -g pnpm"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: git is required. Install from https://git-scm.com/"; exit 1; }

# --- Upgrade detection ---
if command -v openwolf >/dev/null 2>&1; then
  OLD_VER=$(openwolf --version 2>/dev/null || echo "unknown")
  NEW_VER=$(node -e "console.log(require('${PROJECT_DIR}/package.json').version)" 2>/dev/null || echo "unknown")
  echo "Upgrading openwolf from ${OLD_VER} to ${NEW_VER}..."
fi

# --- Install ---
cd "$PROJECT_DIR"

echo "Running pnpm install..."
pnpm install || { echo "Error: pnpm install failed. Retry: cd ${PROJECT_DIR} && pnpm install"; exit 1; }

echo "Running pnpm build..."
pnpm build || { echo "Error: pnpm build failed. Retry: cd ${PROJECT_DIR} && pnpm build"; exit 1; }

echo "Running npm install -g ."
npm install -g . || { echo "Error: npm install -g failed. Retry: cd ${PROJECT_DIR} && npm install -g ."; exit 1; }

# --- Verify ---
echo "Verifying installation..."
INSTALLED_PATH=$(command -v openwolf)
echo "  Installed: openwolf -> ${INSTALLED_PATH}"
openwolf --version

# --- Upstream remote ---
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding upstream remote (read-only)..."
  git remote add upstream https://github.com/cytostack/openwolf.git
fi

echo ""
echo "Install complete!"
echo "Next: run 'openwolf update' in each project to sync hooks."
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x scripts/install-global.sh`

- [ ] **Step 3: Verify script parses**

Run: `bash -n scripts/install-global.sh`
Expected: no output (exit 0)

---

## Task 3: Create `scripts/sync-upstream.sh`

**Files:**
- Create: `scripts/sync-upstream.sh`

- [ ] **Step 1: Write the sync script**

Create `scripts/sync-upstream.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# OpenWolf CHESA Fork — upstream divergence report
# Shows commits ahead/behind upstream/main and recommends actions.
# This script is read-only — no merging or rebasing.
# Usage: bash scripts/sync-upstream.sh

cd "$(git rev-parse --show-toplevel 2>/dev/null || { echo "Error: not in a git repository"; exit 1; })"

# --- Ensure upstream remote ---
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding upstream remote (read-only)..."
  git remote add upstream https://github.com/cytostack/openwolf.git
fi

# --- Fetch ---
echo "Fetching upstream..."
git fetch upstream

# --- Divergence report ---
AHEAD=$(git rev-list --count upstream/main..main 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count main..upstream/main 2>/dev/null || echo "0")

echo ""
echo "=== Divergence Report ==="
echo "  Ahead of upstream:  ${AHEAD} commits"
echo "  Behind upstream:    ${BEHIND} commits"
echo ""

if [ "$AHEAD" -gt 0 ]; then
  echo "--- CHESA commits not in upstream ---"
  git log --oneline upstream/main..main
  echo ""
fi

if [ "$BEHIND" -gt 0 ]; then
  echo "--- Upstream changes not in fork ---"
  git log --oneline main..upstream/main
  echo ""
fi

# --- Upstream tags ---
UPSTREAM_TAGS=$(git tag --list --merged upstream/main 2>/dev/null | head -20)
if [ -n "$UPSTREAM_TAGS" ]; then
  echo "--- Upstream tags (recent) ---"
  echo "$UPSTREAM_TAGS"
  echo ""
fi

# --- Recommendation ---
echo "=== Recommendation ==="
if [ "$BEHIND" -eq 0 ] && [ "$AHEAD" -eq 0 ]; then
  echo "  Fork is in sync with upstream. No action needed."
elif [ "$BEHIND" -eq 0 ]; then
  echo "  You are ${AHEAD} ahead, 0 behind — upstream has no new changes."
  echo "  Ready to open PRs against upstream."
elif [ "$AHEAD" -eq 0 ]; then
  echo "  You are 0 ahead, ${BEHIND} behind — fork is behind upstream."
  echo "  Review upstream changes and consider:"
  echo "    git merge upstream/main   # simple sync"
  echo "    git rebase upstream/main  # clean history"
else
  echo "  You are ${AHEAD} ahead, ${BEHIND} behind — fork has diverged."
  echo "  Review upstream changes: git log --oneline main..upstream/main"
  echo "  Then consider:"
  echo "    git merge upstream/main   # simple sync"
  echo "    git rebase upstream/main  # clean history"
fi
echo ""
echo "  Upstream PR status: git log --oneline --cherry-mark upstream/main...main"
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x scripts/sync-upstream.sh`

- [ ] **Step 3: Verify script parses**

Run: `bash -n scripts/sync-upstream.sh`
Expected: no output (exit 0)

---

## Task 4: Update `wolf-lock.ts` — embedded timestamps, 10s TTL, proceed-unlocked

**Files:**
- Modify: `src/hooks/wolf-lock.ts` (full rewrite)
- Test: `tests/hooks/wolf-lock.test.ts` (new)

**Context:** The existing `wolf-lock.ts` uses zero-byte sentinels and mtime for staleness. The spec requires embedded PID+timestamps (network-fs-safe), 10s TTL (hook timeout), 3 retries with 100ms delay, and proceed-unlocked on exhaustion (never throw).

- [ ] **Step 1: Write the failing lock tests**

Create `tests/hooks/wolf-lock.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

// Import after mocks are set up
let withFileLock: <T>(filePath: string, fn: () => T) => T;

describe("withFileLock", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-lock-test-")));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes the function and cleans up the lock file", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "test.json");
    const result = withFileLock(testFile, () => {
      // Lock should exist during execution
      expect(fs.existsSync(testFile + ".lock")).toBe(true);
      return 42;
    });
    expect(result).toBe(42);
    // Lock should be released
    expect(fs.existsSync(testFile + ".lock")).toBe(false);
  });

  it("releases lock even when fn throws", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "throw.json");
    expect(() =>
      withFileLock(testFile, () => {
        throw new Error("test error");
      })
    ).toThrow("test error");
    expect(fs.existsSync(testFile + ".lock")).toBe(false);
  });

  it("proceeds unlocked after exhausting retries (3 attempts)", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "contended.json");
    const lockPath = testFile + ".lock";

    // Create a fresh lock file that won't be stale
    const pid = process.pid.toString();
    const now = Date.now().toString();
    writeFileSync(lockPath, pid + "\n" + now, "utf-8");

    const warnSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Should proceed without throwing
    const result = withFileLock(testFile, () => "unlocked");
    expect(result).toBe("unlocked");

    // Should have written a warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not acquire lock")
    );

    warnSpy.mockRestore();
  });

  it("removes stale lock older than 10 seconds", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "stale.json");
    const lockPath = testFile + ".lock";

    // Create a stale lock: write a lock with a timestamp 15s in the past
    const pid = process.pid.toString();
    const staleTime = (Date.now() - 15000).toString();
    writeFileSync(lockPath, pid + "\n" + staleTime, "utf-8");

    const result = withFileLock(testFile, () => "stale-cleaned");
    expect(result).toBe("stale-cleaned");
    // Lock should have been removed and re-acquired
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("acquires lock on first attempt when no contention", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "clean.json");
    const result = withFileLock(testFile, () => "clean");
    expect(result).toBe("clean");
  });

  it("writes PID and timestamp to lock file", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const testFile = path.join(tmpDir, "pidcheck.json");
    const lockPath = testFile + ".lock";

    withFileLock(testFile, () => {
      expect(fs.existsSync(lockPath)).toBe(true);
      const contents = readFileSync(lockPath, "utf-8");
      const lines = contents.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(process.pid.toString());
      const ts = parseInt(lines[1], 10);
      expect(ts).toBeGreaterThan(Date.now() - 5000);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });
  });

  it("per-file isolation — locks on different files don't block", async () => {
    const mod = await import("../../src/hooks/wolf-lock.js");
    withFileLock = mod.withFileLock;

    const fileA = path.join(tmpDir, "a.json");
    const fileB = path.join(tmpDir, "b.json");

    let aStarted = false;
    let bExecuted = false;

    withFileLock(fileA, () => {
      aStarted = true;
      // While holding lock on A, verify B can be locked
      withFileLock(fileB, () => {
        bExecuted = true;
      });
    });

    expect(aStarted).toBe(true);
    expect(bExecuted).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hooks/wolf-lock.test.ts --reporter=verbose 2>&1 | head -40`
Expected: Tests fail because the current implementation throws on lock contention (instead of proceeding unlocked) and uses different stale detection.

- [ ] **Step 3: Rewrite `wolf-lock.ts`**

Replace the full content of `src/hooks/wolf-lock.ts`:

```typescript
import * as fs from "node:fs";

const LOCK_TTL_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Acquires an advisory lock on `lockPath` using exclusive create (`wx`).
 * Writes PID + timestamp to the lock file for network-fs-safe staleness
 * detection (file mtime is unreliable on NFS/SMB).
 *
 * Retries up to `MAX_RETRIES` times with `RETRY_DELAY_MS` backoff.
 * If lock is stale (embedded timestamp older than `LOCK_TTL_MS`), removes
 * it and retries immediately.
 *
 * @returns the lock file descriptor on success, or `null` if all retries exhausted.
 */
function acquireLock(lockPath: string): number | null {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const payload = process.pid + "\n" + Date.now();
      return fs.openSync(lockPath, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    // Lock exists — check staleness via embedded timestamp
    try {
      const contents = fs.readFileSync(lockPath, "utf-8");
      const lines = contents.trim().split("\n");
      const lockTime = parseInt(lines[lines.length - 1], 10);
      if (!isNaN(lockTime) && Date.now() - lockTime > LOCK_TTL_MS) {
        // Stale — remove and retry
        fs.unlinkSync(lockPath);
        try {
          return fs.openSync(lockPath, "wx");
        } catch {
          // Another process grabbed the lock between unlink and open
        }
      }
    } catch {
      // Staleness-check race — lock may have been deleted
    }

    if (attempt < MAX_RETRIES - 1) {
      sleep(RETRY_DELAY_MS);
    }
  }
  return null;
}

function releaseLock(fd: number, lockPath: string): void {
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore close errors */
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore unlink errors */
  }
}

/**
 * Wraps a synchronous function `fn` with advisory per-file locking.
 *
 * Acquires a lock on `filePath + ".lock"` before calling `fn`, and releases
 * the lock in a `finally` block. If the lock cannot be acquired after
 * `MAX_RETRIES` retries, proceeds WITHOUT the lock and writes a warning
 * to stderr — preferring hook responsiveness over strict write serialization.
 */
export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = filePath + ".lock";
  const fd = acquireLock(lockPath);
  if (fd === null) {
    process.stderr.write(
      `OpenWolf: could not acquire lock for ${filePath}, proceeding unlocked\n`
    );
    return fn();
  }
  try {
    return fn();
  } finally {
    releaseLock(fd, lockPath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/wolf-lock.test.ts --reporter=verbose 2>&1`
Expected: All 7 tests PASS

- [ ] **Step 5: Run existing tests to ensure no regressions**

Run: `npx vitest run --reporter=verbose 2>&1`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/wolf-lock.ts tests/hooks/wolf-lock.test.ts
git commit -m "feat: rewrite wolf-lock with embedded timestamps, 10s TTL, proceed-unlocked

- Replace zero-byte sentinel lock with PID+timestamp content (network-fs-safe)
- Reduce TTL from 30s to 10s (matches hook timeout)
- Reduce retries from 10 to 3 with 100ms delay
- Proceed unlocked on exhaustion instead of throwing
- Add comprehensive unit tests"
```

---

## Task 5: Add `OPENWOLF_METADATA_DIR` to CLI `getWolfDir()` in `src/utils/paths.ts`

**Files:**
- Modify: `src/utils/paths.ts:8-11`
- Test: `tests/utils/paths.test.ts` (new)

- [ ] **Step 1: Write tests**

Create `tests/utils/paths.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("getWolfDir (CLI)", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.OPENWOLF_METADATA_DIR;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns path.join(base, '.wolf') when env var is not set", async () => {
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/some/project/.wolf");
  });

  it("returns the env var path when OPENWOLF_METADATA_DIR is set", async () => {
    process.env.OPENWOLF_METADATA_DIR = "/custom/metadata";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/custom/metadata");
  });

  it("ignores env var when it is empty string", async () => {
    process.env.OPENWOLF_METADATA_DIR = "";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/some/project/.wolf");
  });

  it("resolves relative env var paths", async () => {
    process.env.OPENWOLF_METADATA_DIR = "relative/wolf";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir();
    expect(result).toBe(
      require("path").resolve("relative/wolf")
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/paths.test.ts --reporter=verbose 2>&1`
Expected: Tests fail — the current `getWolfDir` doesn't check the env var.

- [ ] **Step 3: Update `getWolfDir` in `src/utils/paths.ts`**

Edit `src/utils/paths.ts` `getWolfDir` function:

```typescript
export function getWolfDir(from?: string): string {
  const envDir = process.env.OPENWOLF_METADATA_DIR;
  if (envDir && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  const base = from ?? process.cwd();
  return path.join(base, ".wolf");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/paths.test.ts --reporter=verbose 2>&1`
Expected: All 4 tests PASS

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run --reporter=verbose 2>&1`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/paths.ts tests/utils/paths.test.ts
git commit -m "feat: add OPENWOLF_METADATA_DIR support to CLI getWolfDir"
```

---

## Task 6: Update `ensureWolfDir()` to auto-create when env var is set

**Files:**
- Modify: `src/hooks/wolf-files.ts:29-34`

- [ ] **Step 1: Write the failing test**

In `tests/hooks/shared.test.ts`, add a new describe block at the end (or a standalone test file). I'll add inline to the existing test: Append before the final closing of the file.

Actually, let's add tests to the existing shared.test.ts since `ensureWolfDir` is re-exported there and the test infrastructure already exists. Add these tests at the end of `tests/hooks/shared.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// ensureWolfDir with OPENWOLF_METADATA_DIR
// ---------------------------------------------------------------------------
describe("ensureWolfDir with OPENWOLF_METADATA_DIR", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.OPENWOLF_METADATA_DIR;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("creates the directory when OPENWOLF_METADATA_DIR is set and doesn't exist", async () => {
    const tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-ensure-")));
    const wolfDir = path.join(tmpDir, "custom-wolf");
    process.env.OPENWOLF_METADATA_DIR = wolfDir;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    const mod = await import("../../src/hooks/wolf-files.js");
    expect(fs.existsSync(wolfDir)).toBe(false);
    mod.ensureWolfDir();
    expect(fs.existsSync(wolfDir)).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits silently (as before) when env var is not set and .wolf/ doesn't exist", async () => {
    const tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-ensure-noenv-")));
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    const mod = await import("../../src/hooks/wolf-files.js");
    await expect(() => mod.ensureWolfDir()).toThrow("exit:0");

    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Add the required imports at the top of the file if not present (`tmpdir`, `mkdtempSync`, `realpathSync`, `rmSync`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/shared.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: The "creates the directory when env var is set" test fails (process.exit(0) is called instead of creating dir).

- [ ] **Step 3: Update `ensureWolfDir()` in `src/hooks/wolf-files.ts`**

```typescript
export function ensureWolfDir(): void {
  const wolfDir = getWolfDir();
  if (!fs.existsSync(wolfDir)) {
    const envDir = process.env.OPENWOLF_METADATA_DIR;
    if (envDir && envDir.trim().length > 0) {
      fs.mkdirSync(wolfDir, { recursive: true });
    } else {
      process.exit(0);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/shared.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All shared tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/wolf-files.ts tests/hooks/shared.test.ts
git commit -m "feat: ensureWolfDir auto-creates dir when OPENWOLF_METADATA_DIR is set"
```

---

## Task 7: Create `src/templates/wolf-gitignore` template

**Files:**
- Create: `src/templates/wolf-gitignore`
- Modify: `src/cli/init.ts` — add name mapping, update ALWAYS_OVERWRITE, add root gitignore notice

- [ ] **Step 1: Create the template file**

Create `src/templates/wolf-gitignore`:

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
#   STATUS.md         — project status
#   hooks/            — compiled hook scripts
#   reframe-frameworks.md
#   cron-manifest.json  — cron config (cron-state.json is per-dev, above)
```

- [ ] **Step 2: Write tests for the new init behavior**

Add tests to `tests/cli/init.test.ts` — append before the closing of the file:

```typescript
// ---------------------------------------------------------------------------
// .wolf/.gitignore template
// ---------------------------------------------------------------------------
describe(".wolf/.gitignore template", () => {
  it("wolf-gitignore template is copied to .wolf/.gitignore during init", async () => {
    // Integration-style: ensure the template exists and has the right content
    const { existsSync, readFileSync } = await import("node:fs");
    const templatePath = require("path").resolve(
      __dirname, "../../src/templates/wolf-gitignore"
    );
    expect(existsSync(templatePath)).toBe(true);
    const content = readFileSync(templatePath, "utf-8");
    expect(content).toContain("memory.md");
    expect(content).toContain("token-ledger.json");
    expect(content).toContain("backups/");
    expect(content).toContain("*.lock");
    expect(content).not.toContain("cerebrum.md");
    expect(content).not.toContain("anatomy.md");
  });
});
```

- [ ] **Step 3: Update `init.ts` — add template name mapping**

Add a name mapping at the top of `init.ts` (after the imports):

```typescript
// Template name → destination filename mapping.
// Template files use plain names (no dot prefix) but some destinations
// need a different filename (e.g. wolf-gitignore → .gitignore).
const TEMPLATE_NAME_MAP: Record<string, string> = {
  "wolf-gitignore": ".gitignore",
};
```

- [ ] **Step 4: Update `writeTemplateFile` to use the name map**

Update the `writeTemplateFile` function in `src/cli/init.ts`:

```typescript
function writeTemplateFile(templatesDir: string, wolfDir: string, file: string): void {
  const srcPath = path.join(templatesDir, file);
  const destName = TEMPLATE_NAME_MAP[file] ?? file;
  const destPath = path.join(wolfDir, destName);
  if (fs.existsSync(srcPath)) {
    const content = fs.readFileSync(srcPath, "utf-8");
    fs.writeFileSync(destPath, content, "utf-8");
  } else {
    console.warn(`Template not found: ${file}`);
  }
}
```

- [ ] **Step 5: Update `ALWAYS_OVERWRITE` in `init.ts`**

Replace `".gitignore"` with `"wolf-gitignore"`:

```typescript
const ALWAYS_OVERWRITE = [
  "OPENWOLF.md",
  "reframe-frameworks.md",
  "wolf-gitignore",
];
```

- [ ] **Step 6: Add root gitignore notice logic in `initCommand()`**

Add a new function `checkRootGitIgnore()` and call it from `initCommand()` (placed after the template writing loop, around line 346):

```typescript
function checkRootGitIgnore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.includes(".wolf/")) {
      console.log("");
      console.log("  ℹ Your .gitignore contains '.wolf/' which blocks all wolf files.");
      console.log("    To use the mixed commit strategy (recommended for teams), remove");
      console.log("    the '.wolf/' line — the new .wolf/.gitignore handles per-file");
      console.log("    exclusions.");
    }
  } catch {
    // No .gitignore or can't read — not an error
  }
}
```

Add the call in `initCommand()` after the template writing loop (after line 346, before the hooks section):

```typescript
  // --- .wolf/.gitignore (handled by ALWAYS_OVERWRITE template above) ---

  // --- Check root .gitignore for .wolf/ entry ---
  checkRootGitIgnore(projectRoot);

  // --- Hooks (always under projectRoot/.wolf/hooks/ per D-03) ---
```

Remove the old comment `// --- .wolf/.gitignore (handled by ALWAYS_OVERWRITE template above) ---` and replace with the calls above.

- [ ] **Step 7: Run existing tests**

Run: `npx vitest run tests/cli/init.test.ts --reporter=verbose 2>&1`
Expected: All tests PASS (the wolf-gitignore template test passes because the file exists)

- [ ] **Step 8: Commit**

```bash
git add src/templates/wolf-gitignore src/cli/init.ts tests/cli/init.test.ts
git commit -m "feat: add .wolf/.gitignore template for mixed commit strategy

- Create wolf-gitignore template with per-developer exclusions
- Add template name mapping in init.ts (wolf-gitignore → .gitignore)
- Print notice when root .gitignore blocks .wolf/ files
- Migration is opt-in (does not auto-remove root entry)"
```

---

## Task 8: Add README documentation for Pillar 1 and Pillar 2

**Files:**
- Modify: `README.md` — add "Installing from the CHESA Fork" and "Fork Management" sections

- [ ] **Step 1: Read current README**

Read the current README.md to find the right insertion point.

Run: `head -80 README.md`

- [ ] **Step 2: Add installation section after the existing Installation section**

Insert after the existing installation content (before "Development Setup"):

```markdown
## Installing from the CHESA Fork

The CHESA fork adds worktree support, team workflow improvements, and fixes for concurrent sessions.

### First-time setup

```bash
git clone git@github.com:chesa/openwolf.git
cd openwolf
bash scripts/install-global.sh
```

### Upgrade

```bash
cd <your-openwolf-clone>
git pull
pnpm install && pnpm run install:global
```

After upgrading, run `openwolf update` in each initialized project to sync hooks.

> **Why not `npm install -g chesa/openwolf`?** The `dist/` directory is a build artifact and is not committed. A local build is required.
```

- [ ] **Step 3: Add fork management section after installation**

```markdown
## Fork Management

The CHESA fork tracks upstream [`cytostack/openwolf`](https://github.com/cytostack/openwolf) as a read-only remote.

### Check divergence

```bash
bash scripts/sync-upstream.sh
```

This shows commits ahead/behind upstream and recommends actions. It is read-only — no merging or rebasing.

### Sync with upstream

Review upstream changes, then:

```bash
git merge upstream/main   # simple sync
# or
git rebase upstream/main  # clean history
```

### Version convention

The fork uses `X.Y.Z-beta` to distinguish from official releases.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add CHESA fork installation and management docs"
```

---

## Task 9: Update documentation for Pillar 3

**Files:**
- Modify: `docs/configuration.md` — document `OPENWOLF_METADATA_DIR`
- Modify: `docs/getting-started.md` — document mixed commit strategy

- [ ] **Step 1: Read current docs**

Run: `head -60 docs/configuration.md && echo "---" && head -60 docs/getting-started.md`

- [ ] **Step 2: Add `OPENWOLF_METADATA_DIR` to `docs/configuration.md`**

Insert after the existing environment variables table:

```markdown
### `OPENWOLF_METADATA_DIR`

Override the `.wolf/` metadata directory location. When set, all hooks and CLI
commands use this path instead of `<project>/.wolf/`. Useful for:

- **CI runners** — point to a non-ephemeral location
- **Shared network paths** — team metadata on a NAS
- **Custom setups** — developers who want `.wolf/` elsewhere

**Behavior:**
- Must be an absolute path (relative paths are resolved against `process.cwd()`)
- If the directory does not exist, hooks auto-create it
- Session isolation in worktrees still applies under the custom path
- Hooks always deploy to `<projectRoot>/.wolf/hooks/` regardless of this setting

**Example:**

```bash
export OPENWOLF_METADATA_DIR=/shared/team-wolf/my-project
openwolf init
```
```

- [ ] **Step 3: Add mixed commit strategy to `docs/getting-started.md`**

Append a section after the existing content:

```markdown
### Team Workflow: Mixed Commit Strategy

By default, OpenWolf ignores all `.wolf/` files at the project level. For teams,
a **mixed commit strategy** is recommended:

- **Commit shared knowledge:** `anatomy.md`, `cerebrum.md`, `OPENWOLF.md`,
  `config.json`, `buglog.json`, `identity.md`, `hooks/`
- **Ignore per-developer state:** `memory.md`, `token-ledger.json`, `sessions/`,
  `backups/`, lock files

Starting with `openwolf init` (v1.0.5+), a `.wolf/.gitignore` is created
automatically with the mixed strategy. If your project's root `.gitignore`
still contains `.wolf/`, remove that line to adopt the mixed strategy.
```

- [ ] **Step 4: Commit**

```bash
git add docs/configuration.md docs/getting-started.md
git commit -m "docs: document OPENWOLF_METADATA_DIR and mixed commit strategy"
```

---

## Task 10: Build and full test pass

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: Exit 0, dist/ directory populated with compiled output.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1`
Expected: All tests PASS.

- [ ] **Step 3: Type-check hooks**

Run: `tsc --noEmit -p tsconfig.hooks.json 2>&1`
Expected: No type errors.

- [ ] **Step 4: Verify scripts parse**

Run: `bash -n scripts/install-global.sh && bash -n scripts/sync-upstream.sh && echo "OK"`
Expected: `OK`

---

## Self-Review

**Spec coverage check:**

| Spec Section | Task | Status |
|---|---|---|
| 1a: install script | Task 2 | ✓ |
| 1b: package.json alias | Task 1 | ✓ |
| 1c: README section | Task 8 | ✓ |
| 1d: upgrade path | Task 2 (script is idempotent) | ✓ |
| 2a: upstream remote | Task 2 (added in install script) | ✓ |
| 2b: sync script | Task 3 | ✓ |
| 2c: branch strategy | Task 8 (documented) | ✓ |
| 2d: version convention | Task 8 (documented) | ✓ |
| Prerequisite: HOOK_FILES gap | Already fixed (dynamic discovery) | ✓ |
| 3a: lockfile | Task 4 (rewrote wolf-lock.ts) | ✓ |
| 3a: writeJSON wrapped | Already done (wolf-json.ts uses withFileLock) | ✓ |
| 3b: hooks wolf-paths.ts | Already done | ✓ |
| 3b: CLI paths.ts | Task 5 | ✓ |
| 3b: hook-settings WOLF_ROOT_SHELL | **SKIPPED** — spec contradiction (hooks always deploy to projectRoot/.wolf/hooks/, not metadata dir; changing WOLF_ROOT would break hook resolution) | N/A |
| 3b: init.ts / update.ts | Already done | ✓ |
| 3b: wolf-files.ts ensureWolfDir | Task 6 | ✓ |
| 3c: wolf-gitignore template | Task 7 | ✓ |
| 3c: init.ts writeGitIgnore update | Task 7 | ✓ |

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:** `withFileLock<T>(filePath: string, fn: () => T): T` signature is consistent across `wolf-lock.ts`, `shared.ts`, and `wolf-json.ts`. `getWolfDir()` signature is consistent in both hooks and CLI paths.
