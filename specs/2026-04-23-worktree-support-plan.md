# OpenWolf Git Worktree Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenWolf fully functional inside git worktrees by routing `.wolf/` state
through the git common directory instead of CWD, with namespaced session state per worktree.

**Architecture:** A new `src/utils/worktree.ts` utility provides canonical worktree
detection via `git rev-parse --git-common-dir`; `src/hooks/shared.ts` carries a
self-contained copy (hooks can't import from `src/utils/` at runtime). All hooks switch
to `getSessionDir()` for transient state files while retaining `getWolfDir()` for shared
knowledge files. CLI commands gain a worktree guard (`init`) and a mode banner (`status`).

**Tech Stack:** Node.js 20+, TypeScript 5.7, pnpm, ESM modules, vitest (new)

**Spec:** `specs/2026-04-23-worktree-support-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `src/utils/worktree.ts` | Canonical `detectWorktreeContext()` — used by CLI |
| **Create** | `src/utils/worktree.test.ts` | Unit tests for detection logic |
| **Create** | `vitest.config.ts` | Vitest configuration |
| **Modify** | `package.json` | Add `test` script |
| **Modify** | `src/hooks/shared.ts` | Self-contained copy of detection; new `getSessionDir()`, `getWorktreeContext()`, `ensureSessionDir()` |
| **Modify** | `src/hooks/session-start.ts` | Use `getSessionDir()` for session files; emit worktree banner |
| **Modify** | `src/hooks/pre-read.ts` | Route `_session.json` to `getSessionDir()` |
| **Modify** | `src/hooks/post-read.ts` | Route `_session.json` to `getSessionDir()` |
| **Modify** | `src/hooks/post-write.ts` | Route `_session.json`, `token-ledger.json`, `memory.md` to `getSessionDir()` |
| **Modify** | `src/hooks/stop.ts` | Route `_session.json`, `token-ledger.json`, `memory.md` to `getSessionDir()` |
| **No change** | `src/hooks/pre-write.ts` | Only uses shared knowledge files (`cerebrum.md`, `buglog.json`) |
| **Modify** | `src/cli/init.ts` | Add worktree guard at top of `initCommand()` |
| **Modify** | `src/cli/status.ts` | Add mode banner; route session file checks to session dir |
| **Modify** | `docs/troubleshooting.md` | Add "Git Worktrees" section |

**Note on `execFileSync`:** All git subprocess calls use `execFileSync` (not `execSync`)
so arguments are passed as an array rather than a shell string — no shell injection surface
even though the commands are hardcoded.

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
pnpm add -D vitest
```

Expected: vitest appears in `package.json` devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, add after `"dev"`:
```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 4: Write a trivial smoke test to verify the setup works**

Create `src/utils/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("vitest smoke test", () => {
  it("1 + 1 equals 2", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test**

```bash
pnpm test
```

Expected output:
```
✓ src/utils/smoke.test.ts (1)
  ✓ 1 + 1 equals 2

Test Files  1 passed (1)
Tests       1 passed (1)
```

- [ ] **Step 6: Delete the smoke test file**

```bash
rm src/utils/smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add vitest test infrastructure"
```

---

## Task 2: Create `src/utils/worktree.ts`

**Files:**
- Create: `src/utils/worktree.ts`
- Create: `src/utils/worktree.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/utils/worktree.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

import { detectWorktreeContext } from "./worktree.js";
import * as childProcess from "node:child_process";
const mockExec = vi.mocked(childProcess.execFileSync);

describe("detectWorktreeContext", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns non-worktree context when git command fails (non-git dir)", () => {
    mockExec.mockImplementation(() => { throw new Error("not a git repo"); });
    const result = detectWorktreeContext("/tmp/not-a-git-repo");
    expect(result.isWorktree).toBe(false);
    expect(result.sessionId).toBe("");
    expect(result.mainRepoRoot).toBe("/tmp/not-a-git-repo");
    expect(result.branch).toBe("");
  });

  it("returns non-worktree context when in the main checkout", () => {
    mockExec
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("main");
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.branch).toBe("main");
    expect(result.sessionId).toBe("");
  });

  it("returns worktree context when in a linked worktree", () => {
    mockExec
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("feature/25-git-worktree-support");
    const result = detectWorktreeContext("/path/to/project/.worktrees/feature-25");
    expect(result.isWorktree).toBe(true);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.worktreePath).toBe("/path/to/project/.worktrees/feature-25");
    expect(result.sessionId).toHaveLength(8);
    expect(result.branch).toBe("feature/25-git-worktree-support");
  });

  it("produces consistent sessionId for the same worktree path", () => {
    mockExec.mockReturnValue("/path/to/project/.git");
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    mockExec.mockReturnValue("/path/to/project/.git");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    expect(r1.sessionId).toBe(r2.sessionId);
  });

  it("produces different sessionIds for different worktree paths", () => {
    mockExec.mockReturnValue("/path/to/project/.git");
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat-a");
    mockExec.mockReturnValue("/path/to/project/.git");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat-b");
    expect(r1.sessionId).not.toBe(r2.sessionId);
  });

  it("returns empty branch when branch detection fails (e.g., detached HEAD)", () => {
    mockExec
      .mockReturnValueOnce("/path/to/project/.git")
      .mockImplementationOnce(() => { throw new Error("detached HEAD"); });
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests — confirm they FAIL**

```bash
pnpm test
```

Expected: `Cannot find module './worktree.js'` or similar. Tests should not pass yet.

- [ ] **Step 3: Create `src/utils/worktree.ts`**

```typescript
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export interface WorktreeContext {
  isWorktree: boolean;
  mainRepoRoot: string;
  worktreePath: string;
  sessionId: string;
  branch: string;
}

export function detectWorktreeContext(projectDir?: string): WorktreeContext {
  const dir = path.resolve(projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  try {
    const commonGitDir = execFileSync(
      "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
    ).trim();
    const mainRepoRoot = path.resolve(path.dirname(commonGitDir));
    let branch = "";
    try {
      branch = execFileSync(
        "git", ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
      ).trim();
    } catch {}
    if (mainRepoRoot === dir) {
      return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch };
    }
    const sessionId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
    return { isWorktree: true, mainRepoRoot, worktreePath: dir, sessionId, branch };
  } catch {
    return { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch: "" };
  }
}
```

- [ ] **Step 4: Run the tests — confirm they PASS**

```bash
pnpm test
```

Expected:
```
✓ src/utils/worktree.test.ts (6)
Test Files  1 passed (1)
Tests       6 passed (6)
```

- [ ] **Step 5: Type-check**

```bash
tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/worktree.ts src/utils/worktree.test.ts
git commit -m "feat: add worktree detection utility"
```

---

## Task 3: Update `src/hooks/shared.ts`

`shared.ts` must be self-contained — hooks run from `.wolf/hooks/` at runtime and cannot
import from `src/utils/`. Add a private copy of the detection logic plus new public exports.

**Files:**
- Modify: `src/hooks/shared.ts`

- [ ] **Step 1: Add `execFileSync` import (after the existing `import * as crypto` line)**

Add on a new line:
```typescript
import { execFileSync } from "node:child_process";
```

- [ ] **Step 2: Replace `getWolfDir()` and add new exports**

Find this exact block:
```typescript
export function getWolfDir(): string {
  // Prefer CLAUDE_PROJECT_DIR so hooks work even if CWD changes during a session
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(projectDir, ".wolf");
}
```

Replace it with:
```typescript
interface WorktreeContext {
  isWorktree: boolean;
  mainRepoRoot: string;
  worktreePath: string;
  sessionId: string;
  branch: string;
}

let _cachedWorktreeCtx: WorktreeContext | null = null;

function detectWorktreeContext(): WorktreeContext {
  if (_cachedWorktreeCtx) return _cachedWorktreeCtx;
  const dir = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  try {
    const commonGitDir = execFileSync(
      "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
    ).trim();
    const mainRepoRoot = path.resolve(path.dirname(commonGitDir));
    let branch = "";
    try {
      branch = execFileSync(
        "git", ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: dir, stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", timeout: 500 }
      ).trim();
    } catch {}
    if (mainRepoRoot === dir) {
      _cachedWorktreeCtx = { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch };
    } else {
      const sessionId = crypto.createHash("sha256").update(dir).digest("hex").slice(0, 8);
      _cachedWorktreeCtx = { isWorktree: true, mainRepoRoot, worktreePath: dir, sessionId, branch };
    }
  } catch {
    _cachedWorktreeCtx = { isWorktree: false, mainRepoRoot: dir, worktreePath: dir, sessionId: "", branch: "" };
  }
  return _cachedWorktreeCtx;
}

export function getWolfDir(): string {
  return path.join(detectWorktreeContext().mainRepoRoot, ".wolf");
}

export function getSessionDir(): string {
  const ctx = detectWorktreeContext();
  if (!ctx.isWorktree) return getWolfDir();
  return path.join(getWolfDir(), "sessions", ctx.sessionId);
}

export function getWorktreeContext(): WorktreeContext {
  return detectWorktreeContext();
}

export function ensureSessionDir(): void {
  const ctx = detectWorktreeContext();
  if (!ctx.isWorktree) return;
  const sessionDir = getSessionDir();
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  const metaPath = path.join(sessionDir, "worktree.json");
  if (!fs.existsSync(metaPath)) {
    writeJSON(metaPath, {
      worktreePath: ctx.worktreePath,
      branch: ctx.branch,
      mainRepo: ctx.mainRepoRoot,
      created: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 3: Type-check the hooks build**

```bash
tsc --noEmit -p tsconfig.hooks.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/shared.ts
git commit -m "feat(hooks): add worktree detection and getSessionDir to shared.ts"
```

---

## Task 4: Update `src/hooks/session-start.ts`

**Files:**
- Modify: `src/hooks/session-start.ts`

- [ ] **Step 1: Update the import line (line 3)**

Find:
```typescript
import { getWolfDir, ensureWolfDir, writeJSON, appendMarkdown, readJSON, timestamp, timeShort } from "./shared.js";
```

Replace with:
```typescript
import { getWolfDir, ensureWolfDir, getSessionDir, ensureSessionDir, getWorktreeContext, writeJSON, appendMarkdown, readJSON, timestamp, timeShort } from "./shared.js";
```

- [ ] **Step 2: Update the setup block after `ensureWolfDir()` (around line 17–18)**

Find:
```typescript
  ensureWolfDir();
  const wolfDir = getWolfDir();
```

Replace with:
```typescript
  ensureWolfDir();
  ensureSessionDir();
  const wolfDir = getWolfDir();
  const sessionDir = getSessionDir();

  // Announce worktree mode in the Claude transcript
  const wtCtx = getWorktreeContext();
  if (wtCtx.isWorktree) {
    process.stderr.write(
      `🐺 OpenWolf: Worktree mode (${wtCtx.branch || wtCtx.sessionId}) — shared state from ${wtCtx.mainRepoRoot}\n`
    );
  }
```

- [ ] **Step 3: Update the session file path (lines 19–21)**

Find:
```typescript
  const hooksDir = path.join(wolfDir, "hooks");
  const sessionFile = path.join(hooksDir, "_session.json");
```

Replace with:
```typescript
  const sessionFile = path.join(sessionDir, "_session.json");
```

- [ ] **Step 4: Update `memoryPath` to use `sessionDir`**

Find:
```typescript
  const memoryPath = path.join(wolfDir, "memory.md");
```

Replace with:
```typescript
  const memoryPath = path.join(sessionDir, "memory.md");
```

- [ ] **Step 5: Update `ledgerPath` to use `sessionDir`**

Find:
```typescript
  const ledgerPath = path.join(wolfDir, "token-ledger.json");
```

Replace with:
```typescript
  const ledgerPath = path.join(sessionDir, "token-ledger.json");
```

- [ ] **Step 6: Type-check**

```bash
tsc --noEmit -p tsconfig.hooks.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/session-start.ts
git commit -m "feat(hooks): route session state to session dir in session-start"
```

---

## Task 5: Update `pre-read.ts` and `post-read.ts`

Both hooks read and write `_session.json`. Change the path from `wolfDir/hooks/` to
`getSessionDir()`.

**Files:**
- Modify: `src/hooks/pre-read.ts`
- Modify: `src/hooks/post-read.ts`

### `pre-read.ts`

- [ ] **Step 1: Update the import line (line 3–5)**

Find:
```typescript
import {
  getWolfDir, ensureWolfDir, readJSON, writeJSON, readMarkdown, parseAnatomy,
  estimateTokens, readStdin, normalizePath
} from "./shared.js";
```

Replace with:
```typescript
import {
  getWolfDir, ensureWolfDir, getSessionDir, readJSON, writeJSON, readMarkdown, parseAnatomy,
  estimateTokens, readStdin, normalizePath
} from "./shared.js";
```

- [ ] **Step 2: Update the session file path (lines 18–20)**

Find:
```typescript
  const wolfDir = getWolfDir();
  const hooksDir = path.join(wolfDir, "hooks");
  const sessionFile = path.join(hooksDir, "_session.json");
```

Replace with:
```typescript
  const wolfDir = getWolfDir();
  const sessionFile = path.join(getSessionDir(), "_session.json");
```

### `post-read.ts`

- [ ] **Step 3: Update the import line (line 2)**

Find:
```typescript
import { getWolfDir, ensureWolfDir, readJSON, writeJSON, readMarkdown, parseAnatomy, estimateTokens, readStdin, normalizePath } from "./shared.js";
```

Replace with:
```typescript
import { getWolfDir, ensureWolfDir, getSessionDir, readJSON, writeJSON, readMarkdown, parseAnatomy, estimateTokens, readStdin, normalizePath } from "./shared.js";
```

- [ ] **Step 4: Update the session file path (lines 11–13)**

Find:
```typescript
  const wolfDir = getWolfDir();
  const hooksDir = path.join(wolfDir, "hooks");
  const sessionFile = path.join(hooksDir, "_session.json");
```

Replace with:
```typescript
  const wolfDir = getWolfDir();
  const sessionFile = path.join(getSessionDir(), "_session.json");
```

- [ ] **Step 5: Type-check**

```bash
tsc --noEmit -p tsconfig.hooks.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/pre-read.ts src/hooks/post-read.ts
git commit -m "feat(hooks): route _session.json to session dir in pre/post-read"
```

---

## Task 6: Update `post-write.ts` and `stop.ts`

These hooks write to `_session.json`, `token-ledger.json`, and `memory.md` — all three
must route to `getSessionDir()`.

**Files:**
- Modify: `src/hooks/post-write.ts`
- Modify: `src/hooks/stop.ts`

### `post-write.ts`

- [ ] **Step 1: Update the import line (lines 5–7)**

Find:
```typescript
import {
  getWolfDir, ensureWolfDir, readJSON, writeJSON, readMarkdown, parseAnatomy, serializeAnatomy,
  extractDescription, estimateTokens, appendMarkdown, timeShort, readStdin, normalizePath
} from "./shared.js";
```

Replace with:
```typescript
import {
  getWolfDir, ensureWolfDir, getSessionDir, readJSON, writeJSON, readMarkdown, parseAnatomy,
  serializeAnatomy, extractDescription, estimateTokens, appendMarkdown, timeShort, readStdin,
  normalizePath
} from "./shared.js";
```

- [ ] **Step 2: Update `hooksDir`/`sessionFile` block (lines 35–37)**

Find:
```typescript
  const wolfDir = getWolfDir();
  const hooksDir = path.join(wolfDir, "hooks");
  const sessionFile = path.join(hooksDir, "_session.json");
```

Replace with:
```typescript
  const wolfDir = getWolfDir();
  const sessionDir = getSessionDir();
  const sessionFile = path.join(sessionDir, "_session.json");
```

- [ ] **Step 3: Update `ledgerPath` to use `sessionDir`**

Find:
```typescript
  const ledgerPath = path.join(wolfDir, "token-ledger.json");
```

Replace with:
```typescript
  const ledgerPath = path.join(sessionDir, "token-ledger.json");
```

- [ ] **Step 4: Update `memoryPath` to use `sessionDir`**

Find:
```typescript
      const memoryPath = path.join(wolfDir, "memory.md");
```

Replace with:
```typescript
      const memoryPath = path.join(sessionDir, "memory.md");
```

### `stop.ts`

- [ ] **Step 5: Update the import line (line 3)**

Find:
```typescript
import { getWolfDir, ensureWolfDir, readJSON, writeJSON, appendMarkdown, timeShort } from "./shared.js";
```

Replace with:
```typescript
import { getWolfDir, ensureWolfDir, getSessionDir, readJSON, writeJSON, appendMarkdown, timeShort } from "./shared.js";
```

- [ ] **Step 6: Update `hooksDir`/`sessionFile` block (lines 53–56)**

Find:
```typescript
  const wolfDir = getWolfDir();
  const hooksDir = path.join(wolfDir, "hooks");
  const sessionFile = path.join(hooksDir, "_session.json");
```

Replace with:
```typescript
  const wolfDir = getWolfDir();
  const sessionDir = getSessionDir();
  const sessionFile = path.join(sessionDir, "_session.json");
```

- [ ] **Step 7: Update `ledgerPath` to use `sessionDir` (around line 123)**

Find:
```typescript
  const ledgerPath = path.join(wolfDir, "token-ledger.json");
```

Replace with:
```typescript
  const ledgerPath = path.join(sessionDir, "token-ledger.json");
```

- [ ] **Step 8: Update `memoryPath` to use `sessionDir` (around line 170)**

Find:
```typescript
      const memoryPath = path.join(wolfDir, "memory.md");
```

Replace with:
```typescript
      const memoryPath = path.join(sessionDir, "memory.md");
```

- [ ] **Step 9: Type-check**

```bash
tsc --noEmit -p tsconfig.hooks.json
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/post-write.ts src/hooks/stop.ts
git commit -m "feat(hooks): route session-scoped files to session dir in post-write/stop"
```

---

## Task 7: Build hooks and copy to `.wolf/hooks/`

No source changes — build and deploy step only.

- [ ] **Step 1: Compile the hooks**

```bash
pnpm build:hooks
```

Expected: `dist/hooks/*.js` updated. No TypeScript errors.

- [ ] **Step 2: Copy compiled hooks to the project's `.wolf/hooks/`**

```bash
node dist/bin/openwolf.js update
```

Expected output includes: `✓ Hook scripts updated`.

- [ ] **Step 3: Verify timestamps are current**

```bash
ls -la .wolf/hooks/*.js | head -10
```

Expected: all `.js` files have timestamps within the last minute.

- [ ] **Step 4: Commit**

```bash
git add .wolf/hooks/
git commit -m "chore: update compiled hook scripts with worktree support"
```

---

## Task 8: Update `src/cli/init.ts`

**Files:**
- Modify: `src/cli/init.ts`

- [ ] **Step 1: Add import for `detectWorktreeContext` (after existing imports)**

Add after the last existing import:
```typescript
import { detectWorktreeContext } from "../utils/worktree.js";
```

- [ ] **Step 2: Add worktree guard after the Node version check (after line 127)**

The Node version check ends with `process.exit(1)`. Add the worktree guard immediately
after that block:

```typescript
  // Worktree guard — init must run from the main checkout
  const wtCtx = detectWorktreeContext(process.cwd());
  if (wtCtx.isWorktree) {
    const mainWolfDir = path.join(wtCtx.mainRepoRoot, ".wolf");
    if (fs.existsSync(mainWolfDir)) {
      console.log(`OpenWolf is already initialized at: ${wtCtx.mainRepoRoot}`);
      console.log(`Worktrees automatically use the shared .wolf/ state — no action needed.`);
      process.exit(0);
    } else {
      console.error(`You're running in a git worktree: ${wtCtx.worktreePath}`);
      console.error(`OpenWolf must be initialized from the main checkout. Run:`);
      console.error(`  cd ${wtCtx.mainRepoRoot} && openwolf init`);
      process.exit(1);
    }
  }
```

- [ ] **Step 3: Type-check**

```bash
tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli/init.ts
git commit -m "feat(cli): add worktree guard to openwolf init"
```

---

## Task 9: Update `src/cli/status.ts`

**Files:**
- Modify: `src/cli/status.ts`

- [ ] **Step 1: Add import for `detectWorktreeContext` (after existing imports)**

Add after the last existing import:
```typescript
import { detectWorktreeContext } from "../utils/worktree.js";
```

- [ ] **Step 2: Add mode detection after the `wolfDir` not-found guard (line 13)**

After `const wolfDir = path.join(projectRoot, ".wolf");` and the `if (!fs.existsSync(wolfDir))` block, add:

```typescript
  const wtCtx = detectWorktreeContext(projectRoot);
  const sessionFileDir = wtCtx.isWorktree
    ? path.join(wolfDir, "sessions", wtCtx.sessionId)
    : wolfDir;

  if (wtCtx.isWorktree) {
    console.log(`  Mode: Worktree  (${wtCtx.branch || wtCtx.sessionId})`);
    console.log(`  Main repo: ${wtCtx.mainRepoRoot}`);
    console.log(`  Session: .wolf/sessions/${wtCtx.sessionId}/`);
  } else {
    console.log(`  Mode: Main checkout`);
  }
  console.log("");
```

- [ ] **Step 3: Replace the `requiredFiles` block with split shared/session checks**

Find:
```typescript
  const requiredFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md", "memory.md",
    "anatomy.md", "config.json", "token-ledger.json", "buglog.json",
    "cron-manifest.json", "cron-state.json",
  ];

  let missingCount = 0;
  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.join(wolfDir, file));
    if (!exists) {
      console.log(`  ✗ Missing: .wolf/${file}`);
      missingCount++;
    }
  }
  if (missingCount === 0) {
    console.log(`  ✓ All ${requiredFiles.length} core files present`);
  }
```

Replace with:
```typescript
  const sharedFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md",
    "anatomy.md", "config.json", "buglog.json",
    "cron-manifest.json", "cron-state.json",
  ];
  const sessionFiles = ["memory.md", "token-ledger.json"];

  let missingCount = 0;
  for (const file of sharedFiles) {
    if (!fs.existsSync(path.join(wolfDir, file))) {
      console.log(`  ✗ Missing: .wolf/${file}`);
      missingCount++;
    }
  }
  for (const file of sessionFiles) {
    if (!fs.existsSync(path.join(sessionFileDir, file))) {
      const loc = wtCtx.isWorktree
        ? `.wolf/sessions/${wtCtx.sessionId}/${file}`
        : `.wolf/${file}`;
      console.log(`  - Not yet created: ${loc} (appears after first session)`);
    }
  }
  if (missingCount === 0) {
    console.log(`  ✓ All ${sharedFiles.length} shared knowledge files present`);
  }
```

- [ ] **Step 4: Update the token ledger read to use `sessionFileDir`**

Find:
```typescript
  const ledger = readJSON<{
    lifetime: {
      total_sessions: number;
      total_reads: number;
      total_writes: number;
      total_tokens_estimated: number;
      estimated_savings_vs_bare_cli: number;
    };
  }>(path.join(wolfDir, "token-ledger.json"), {
```

Replace `path.join(wolfDir, "token-ledger.json")` with `path.join(sessionFileDir, "token-ledger.json")`.

- [ ] **Step 5: Add the worktree ledger footnote after the token stats block**

After the `console.log(\`  Estimated savings: ~...\`)` line, add:
```typescript
  if (wtCtx.isWorktree) {
    console.log(`  (This worktree session only — main checkout ledger: .wolf/token-ledger.json)`);
  }
```

- [ ] **Step 6: Type-check**

```bash
tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Build and run status**

```bash
pnpm build
node dist/bin/openwolf.js status
```

Expected (main checkout):
```
OpenWolf Status
===============

  Mode: Main checkout

  ✓ All 8 shared knowledge files present
  ...
```

- [ ] **Step 8: Commit**

```bash
git add src/cli/status.ts
git commit -m "feat(cli): add worktree mode banner and session-aware checks to status"
```

---

## Task 10: Update `docs/troubleshooting.md`

**Files:**
- Modify: `docs/troubleshooting.md`

- [ ] **Step 1: Append the "Git Worktrees" section to `docs/troubleshooting.md`**

Add the following at the end of the file:

```markdown
## Git Worktrees

OpenWolf supports git worktrees (created via `git worktree add`, `claude --worktree`, or
the Superpowers `using-git-worktrees` skill) as of v1.1.0. No special setup is required.

### How it works

When Claude Code launches inside a linked worktree, OpenWolf automatically:

- Resolves `.wolf/` to the main checkout using `git rev-parse --git-common-dir`
- Reads shared knowledge files (`cerebrum.md`, `anatomy.md`, `buglog.json`) from the main
  checkout — all worktrees contribute to and benefit from the same brain
- Writes session-scoped state (`memory.md`, `token-ledger.json`) to an isolated namespace
  at `.wolf/sessions/<worktree-id>/` to prevent context leakage between parallel sessions

You will see a confirmation in the Claude transcript at session start:

```
🐺 OpenWolf: Worktree mode (feature/my-branch) — shared state from /path/to/main-repo
```

### Requirements

**`openwolf init` must be run from the main checkout**, not from inside a worktree. If you
accidentally run it in a worktree:

- If the main checkout already has `.wolf/`: OpenWolf prints a message and exits cleanly.
- If the main checkout has no `.wolf/`: OpenWolf prints the correct command to run.

### Cleaning up worktree session data

When you remove a worktree (`git worktree remove <name>`), the session data in
`.wolf/sessions/<id>/` remains in the main checkout. To identify which session belongs to
which worktree, read its metadata:

```bash
cat .wolf/sessions/*/worktree.json
```

To remove orphaned session directories manually:

```bash
rm -rf .wolf/sessions/<id>
```

### Confirming worktree mode with `openwolf status`

Run `openwolf status` from inside a worktree to confirm instrumentation is active:

```
  Mode: Worktree  (feature/my-branch)
  Main repo: /path/to/main-repo
  Session: .wolf/sessions/a3f8c2d1/
```

Token stats shown are for this worktree session only. Run `openwolf status` from the main
checkout to see lifetime totals.
```

- [ ] **Step 2: Verify the docs build**

```bash
pnpm docs:build
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add docs/troubleshooting.md
git commit -m "docs: add git worktree support section to troubleshooting"
```

---

## Task 11: Full build and final smoke test

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all 6 tests pass.

- [ ] **Step 2: Full build**

```bash
pnpm build
```

Expected: TypeScript compiles, hooks bundle, dashboard builds — no errors.

- [ ] **Step 3: Type-check both build targets separately**

```bash
tsc --noEmit
tsc --noEmit -p tsconfig.hooks.json
```

Expected: zero errors in both.

- [ ] **Step 4: Smoke-test the CLI**

```bash
node dist/bin/openwolf.js --help
node dist/bin/openwolf.js status
```

Expected: no crashes. Status shows `Mode: Main checkout`.

- [ ] **Step 5: Update `.wolf/hooks/` one final time**

```bash
node dist/bin/openwolf.js update
```

Expected: `✓ Hook scripts updated`.

- [ ] **Step 6: Commit if `.wolf/hooks/` changed**

```bash
git add .wolf/hooks/
git diff --staged --quiet || git commit -m "chore: final hook update after full build"
```

---

## Implementation Notes

- **`pre-write.ts` has no changes** — it only reads `cerebrum.md` and `buglog.json`,
  both shared knowledge files that stay in `getWolfDir()`.
- **`_session.json` moves** from `.wolf/hooks/_session.json` to `.wolf/_session.json`
  (main checkout) and `.wolf/sessions/<hash>/_session.json` (worktrees). File is
  transient — recreated every `SessionStart`. No migration needed.
- **`cron-state.json` stays shared** — project-wide scheduler state. Multiple worktrees
  sharing it prevents redundant anatomy scans ("thundering herd").
- **`execFileSync` throughout** (not `execSync`) — arguments passed as an array, not a
  shell string. No injection surface even with hardcoded commands.
- **500ms timeout on all git calls** — hooks are in the prompt critical path.
