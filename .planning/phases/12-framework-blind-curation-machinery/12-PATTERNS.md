# Phase 12: Framework-Blind Curation Machinery — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/hooks/wolf-pantry.ts` | utility/module | transform | `src/hooks/wolf-ignore.ts` | exact (dep-free hook module) |
| `src/hooks/stop.ts` | hook | event-driven | `src/hooks/stop.ts` (self — extend) | exact |
| `src/cli/learnings-cmd.ts` | CLI command | CRUD | `src/cli/learnings-cmd.ts` (self — extend) | exact |
| `src/cli/status.ts` | CLI command | request-response | `src/cli/status.ts` (self — extend) | exact |
| `src/cli/index.ts` | CLI route/registry | request-response | `src/cli/index.ts` (self — extend) | exact |
| `tests/hooks/wolf-pantry.test.ts` | test | transform | `tests/hooks/wolf-ignore.test.ts` | exact |
| `tests/hooks/stop.test.ts` | test | event-driven | `tests/hooks/stop.test.ts` (self — extend) | exact |
| `tests/cli/learnings-check.test.ts` | test | request-response | `tests/cli/learnings.test.ts` | role-match |
| `tests/cli/status.test.ts` | test | request-response | `tests/cli/status.test.ts` (self — extend) | exact |

---

## Pattern Assignments

### `src/hooks/wolf-pantry.ts` (utility, transform — NEW)

**Analog:** `src/hooks/wolf-ignore.ts`

This is the D10-02 template. `wolf-ignore.ts` is the canonical dep-free hook
module that lives in `src/hooks/` and is imported by both hook and CLI code
without polluting `shared.ts` with CLI-only exports.

**Imports pattern** (`wolf-ignore.ts` lines 1–19):
```typescript
/**
 * wolf-pantry.ts — dependency-free staging aggregator (R7 / D12-09).
 *
 * Provides collectAllEntries() (moved from learnings-cmd.ts:92) and
 * parseProposals() for use by both status.ts and learnings-cmd.ts.
 * Zero node_modules imports — safe for tsconfig.hooks.json (C2 boundary).
 *
 * NOT re-exported via shared.ts (D12-10 / D10-09): collectAllEntries is
 * CLI-only; hook barrel is for hook-consumed utilities only.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getWolfDir } from "./wolf-paths.js";
```

**Module structure pattern** (`wolf-ignore.ts` lines 24–45 — constants block):
```typescript
// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export interface ProposalEntry {
  sessionId: string;
  timestamp: string;
  target: "cerebrum" | "anatomy";
  content: string;
  raw: string;
}

// Synthetic entry used for presence-based stub detection (D12-05b)
export const STUB_ENTRY_MARKER = "stub";
```

**Private helper / public export split** (`wolf-ignore.ts` lines 43–45, 128–149):
```typescript
// Private helpers: globToRegExp, matchesPattern (NOT exported — D10-09)
// Public API: shouldExclude, parseAndMatchGitignore, constants

// wolf-pantry.ts follows the same split:
// Private: parseProposals (move from learnings-cmd.ts:18)
// Public:  collectAllEntries, ProposalEntry (the CLI consumer surface)
// Private: normalizeCerebrumBody (R9 normalize step)
// Public:  hashCerebrumBody (R9 hash, called by status.ts and learnings-cmd.ts)
```

**Defensive error handling pattern for directory walk** (`learnings-cmd.ts` lines 92–117):
```typescript
function collectAllEntries(): ProposalEntry[] {
  const wolfDir = getWolfDir();
  const sessionsDir = path.join(wolfDir, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  const entries: ProposalEntry[] = [];

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const sessionDir = path.join(sessionsDir, dirent.name);
    let parsed: ProposalEntry[];
    try {
      parsed = parseProposals(sessionDir, dirent.name);
    } catch {
      process.stderr.write(
        `OpenWolf: cannot read session directory ${dirent.name}, skipping\n`
      );
      continue;
    }
    entries.push(...parsed);
  }
  return entries;
}
```

**R9 normalization + hash to add** (`wolf-json.ts` line 3 — same `node:crypto` import):
```typescript
// R9 (D12-11): normalize then hash
export function normalizeCerebrumBody(content: string): string {
  const stripped = content.replace(/^>\s*Last\s+updated\s*:.*$/gim, "");
  return stripped.replace(/\s+/g, "").trim();
}

export function hashCerebrumBody(content: string): string {
  return crypto.createHash("sha256")
    .update(normalizeCerebrumBody(content))
    .digest("hex");
}
```

**D12-05b presence-based stub detection to add** (extends existing walk):
```typescript
// After parseProposals returns, check for non-empty file that parsed to 0 entries
// (stub content lacks "→ target" grammar)
const proposalPath = path.join(sessionDir, "proposed-learnings.md");
const rawContent = fs.existsSync(proposalPath)
  ? fs.readFileSync(proposalPath, "utf-8").trim()
  : "";
if (rawContent && parsed.length === 0) {
  // Presence-based: non-empty file with no parseable entries = stub pending
  entries.push({
    sessionId: dirent.name,
    timestamp: new Date().toISOString(),
    target: "cerebrum",
    content: "(staged stub — review and replace with explicit learning)",
    raw: rawContent,
  });
}
```

---

### `src/hooks/stop.ts` — R7a stub injection (MODIFIED)

**Analog:** `src/hooks/stop.ts` (self — extend `finalizeSession`)

**Injection site** (lines 52–71 — after the two existing checks):
```typescript
export function finalizeSession(wolfDir: string, sessionDir: string, session: SessionData): void {
  // ...existing early-return on zero activity...

  // Check for files edited many times without a buglog entry
  checkForMissingBugLogs(wolfDir, session);

  // Check if cerebrum was updated this session
  checkCerebrumFreshness(wolfDir, session);

  // R7a: structural breadcrumb — ensure staging file exists if code was written
  captureStubIfNeeded(wolfDir, sessionDir, session);  // ← NEW

  // ...rest of finalizeSession (ledger, memory.md)...
}
```

**Code-writes filter pattern** (reuse from `stop.ts` lines 234–239 — the
`checkStatusFreshness` predicate that Phase 11 deleted but its logic survives
as the D12-02 filter):
```typescript
const codeWrites = session.files_written.filter(
  (w) => !w.file.includes("/.wolf/") && !w.file.endsWith(".tmp")
);
```

**New function shape** (modeled after `checkCerebrumFreshness` lines 228–250 —
same defensive `try/catch`, same `process.stderr.write` for errors):
```typescript
function captureStubIfNeeded(
  wolfDir: string,
  sessionDir: string,
  session: SessionData
): void {
  // (a) D12-02 guard: code writes only (not .wolf/, not .tmp)
  const codeWrites = session.files_written.filter(
    (w) => !w.file.includes("/.wolf/") && !w.file.endsWith(".tmp")
  );
  if (codeWrites.length === 0) return;

  // (b) D12-02 guard: model already wrote a proposal
  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  const existingContent = readMarkdown(proposalPath); // from shared.js
  if (existingContent.trim().length > 0) return;

  // (c) D12-03 idempotency: stop fires multiple times; check stop_count
  const STUB_MARKER = "### Staged Session Metadata";
  if (session.stop_count > 1 && existingContent.includes(STUB_MARKER)) return;

  // Append stub via already-exported helper (D12-04 — no new hook import)
  try {
    appendProposal(
      "cerebrum",
      `${STUB_MARKER}\n\nSession ended with code changes but no explicit learning recorded. Review and add context if relevant.`
    );
  } catch (err) {
    process.stderr.write(
      `OpenWolf: could not stage learning breadcrumb: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}
```

**Import additions** (`stop.ts` line 3 — already imports from `shared.js`):
```typescript
// appendProposal and readMarkdown are already in shared.js (re-exports of wolf-files.ts)
import {
  getWolfDir, ensureWolfDir, getSessionDir,
  readJSON, updateJSON, appendMarkdown, timeShort,
  appendProposal, readMarkdown  // ← add these two
} from "./shared.js";
```

---

### `src/cli/learnings-cmd.ts` — add `check` + `accept` exports (MODIFIED)

**Analog:** `src/cli/learnings-cmd.ts` (self — existing `learningsMergeCommand`)

**Import change** — replace the private `collectAllEntries` with the public
import from `wolf-pantry.ts`:
```typescript
// Remove: private function collectAllEntries() at line 92
// Add:
import { collectAllEntries, ProposalEntry } from "../hooks/wolf-pantry.js";
// Keep existing: hashCerebrumBody imported from wolf-pantry.js for R9 baseline
import { hashCerebrumBody } from "../hooks/wolf-pantry.js";
```

**New `learningsCheckCommand` export** (modeled on `learningsMergeCommand`
lines 150–157 — same `collectAllEntries()` call, same error handling shape):
```typescript
export function learningsCheckCommand(
  opts: { json?: boolean; quiet?: boolean }
): 0 | 1 | 2 {
  try {
    const entries = collectAllEntries();

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          pending: entries.length,
          entries: entries.map((e) => ({
            sessionId: e.sessionId,
            timestamp: e.timestamp,
            target: e.target,
            content: e.content.slice(0, 120),
          })),
        }) + "\n"
      );
    }

    if (entries.length === 0) return 0;

    if (!opts.quiet && !opts.json) {
      emitLearningsSummaryToStderr(entries);
    }

    return 1;
  } catch (err) {
    if (!opts.quiet) {
      process.stderr.write(
        `OpenWolf: cannot check learnings: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return 2;
  }
}
```

**Bounded stderr summary** (D12-07 — bounded list, no ANSI):
```typescript
function emitLearningsSummaryToStderr(entries: ProposalEntry[]): void {
  const bySession = new Map<string, ProposalEntry[]>();
  for (const e of entries) {
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }
  process.stderr.write(
    `⚠ ${entries.length} learnings awaiting review across ${bySession.size} sessions:\n`
  );
  const sessions = [...bySession.entries()];
  for (const [sessionId, ses] of sessions.slice(0, 5)) {
    process.stderr.write(`  • ${sessionId} (${ses.length})\n`);
  }
  if (sessions.length > 5) {
    process.stderr.write(`  … + ${sessions.length - 5} more sessions\n`);
  }
  process.stderr.write(`Run \`openwolf learnings merge\` to review and promote.\n`);
}
```

**R9 baseline write in `learningsMergeCommand`** (after line 273 — after
successful append, modeled on existing `withFileLock` usage at line 218):
```typescript
// After the merge loop, re-baseline cerebrum-freshness.json if any cerebrum
// entries were merged (D12-13 sanctioned writer #1)
if (successEntries.some((e) => e.target === "cerebrum")) {
  try {
    const cerebrumPath = path.join(wolfDir, "cerebrum.md");
    const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");
    const content = fs.readFileSync(cerebrumPath, "utf-8");
    const hash = hashCerebrumBody(content);
    const dateMatch = content.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
    const lastSeen = dateMatch ? dateMatch[1].trim() : new Date().toISOString().split("T")[0];
    await withFileLock(sidecarPath, () => {
      writeJSON(sidecarPath, {
        version: 1,
        content_sha256: hash,
        last_updated_seen: lastSeen,
        captured_at: new Date().toISOString(),
        captured_by: "learnings-merge",
      });
    });
  } catch (err) {
    process.stderr.write(
      `OpenWolf: could not update freshness baseline: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}
```

**New `learningsAcceptCommand` export** (D12-13 sanctioned writer #2):
```typescript
export function learningsAcceptCommand(): void {
  const wolfDir = getWolfDir();
  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");
  try {
    const content = fs.readFileSync(cerebrumPath, "utf-8");
    const hash = hashCerebrumBody(content);
    const dateMatch = content.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
    const lastSeen = dateMatch ? dateMatch[1].trim() : new Date().toISOString().split("T")[0];
    writeJSON(sidecarPath, {
      version: 1,
      content_sha256: hash,
      last_updated_seen: lastSeen,
      captured_at: new Date().toISOString(),
      captured_by: "learnings-accept",
    });
    console.log("✓ cerebrum.md freshness baseline updated");
  } catch (err) {
    process.stderr.write(
      `OpenWolf: could not accept cerebrum baseline: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}
```

---

### `src/cli/status.ts` — add pending count + freshness check (MODIFIED)

**Analog:** `src/cli/status.ts` (self — extend after anatomy block at line 141)

**Import additions** (lines 1–6 — same pattern as existing imports):
```typescript
import { collectAllEntries } from "../hooks/wolf-pantry.js";
import { hashCerebrumBody } from "../hooks/wolf-pantry.js";
```

**Pending count block** (insert after anatomy block, D12-08, D11-07 plain-text style):
```typescript
// Pending learnings count — R7b pull surface (D12-08)
// collectAllEntries imported from wolf-pantry (peer dep, no CLI↔CLI cycle)
try {
  const pendingEntries = collectAllEntries();
  console.log(`\nCuration:`);
  if (pendingEntries.length > 0) {
    console.log(`  - ${pendingEntries.length} learnings awaiting review`);
  } else {
    console.log(`  ✓ No pending learnings`);
  }
} catch {
  console.log(`  - Curation: (unavailable)`);
}
```

**Freshness check block** (D12-14 — bootstrap-on-missing, read-only thereafter):
```typescript
// R9 freshness integrity check (D12-14)
const cerebrumPath = path.join(wolfDir, "cerebrum.md");
const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");
try {
  const cerebrumContent = readText(cerebrumPath);
  const currentHash = hashCerebrumBody(cerebrumContent);
  const sidecar = readJSON<{
    version: number;
    content_sha256: string;
    last_updated_seen: string;
    captured_at: string;
    captured_by: string;
  } | null>(sidecarPath, null);

  if (!sidecar) {
    // D12-14 bootstrap: sidecar absent (fresh clone) — write initial baseline
    const dateMatch = cerebrumContent.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
    const lastSeen = dateMatch ? dateMatch[1].trim() : "—";
    // writeJSON from fs-safe (CLI context, not hook context)
    const { writeJSON: writeJSONSafe } = await import("../utils/fs-safe.js");
    writeJSONSafe(sidecarPath, {
      version: 1,
      content_sha256: currentHash,
      last_updated_seen: lastSeen,
      captured_at: new Date().toISOString(),
      captured_by: "status-bootstrap",
    });
    console.log(`  - cerebrum.md: baseline captured (no prior history)`);
  } else if (currentHash === sidecar.content_sha256) {
    // Same normalized body — check whether just the date line moved
    const dateMatch = cerebrumContent.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
    const currentDate = dateMatch ? dateMatch[1].trim() : "—";
    if (currentDate !== sidecar.last_updated_seen) {
      console.log(`  ✗ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`);
    } else {
      console.log(`  ✓ cerebrum.md: current`);
    }
  } else {
    // Hash changed — real content update, no flag
    console.log(`  ✓ cerebrum.md: current`);
  }
} catch {
  // Non-fatal: status must never crash for missing/unreadable freshness state
  console.log(`  - cerebrum.md: (freshness check unavailable)`);
}
```

**Rendering conventions** (D11-07 — plain text, no ANSI, three markers only):
- `✓` for clean/present
- `✗` for hard error / actionable flag
- `-` for informational / not-yet-created (soft)

---

### `src/cli/index.ts` — register `check` + `accept` subcommands (MODIFIED)

**Analog:** `src/cli/index.ts` lines 169–188 (existing `learnings` group)

**Exact pattern to copy** (lines 175–188):
```typescript
learnings
  .command("list")
  .description("List pending proposal entries across all sessions")
  .option("--session <id>", "Filter by session ID")
  .action(async (opts: { session?: string }) => {
    const { learningsCommand } = await import("./learnings-cmd.js");
    learningsCommand(opts.session);
  });

learnings
  .command("merge")
  .description("Interactively merge selected proposals into shared markdown")
  .action(async () => {
    const { learningsMergeCommand } = await import("./learnings-cmd.js");
    await learningsMergeCommand();
  });
```

**New registrations to append after line 188**:
```typescript
learnings
  .command("check")
  .description("Exit non-zero if staged learnings await review (for git hooks / CI)")
  .option("--json", "Emit structured result to stdout")
  .option("--quiet", "Suppress stderr summary (exit code only)")
  .action(async (opts: { json?: boolean; quiet?: boolean }) => {
    const { learningsCheckCommand } = await import("./learnings-cmd.js");
    process.exitCode = learningsCheckCommand(opts); // 0 | 1 | 2
  });

learnings
  .command("accept")
  .description("Re-baseline cerebrum.md after a blessed hand-edit (R9)")
  .action(async () => {
    const { learningsAcceptCommand } = await import("./learnings-cmd.js");
    learningsAcceptCommand();
  });
```

---

## Test Pattern Assignments

### `tests/hooks/wolf-pantry.test.ts` (NEW)

**Analog:** `tests/hooks/wolf-ignore.test.ts`

**Test file structure** (`wolf-ignore.test.ts` lines 1–11):
```typescript
import { describe, it, expect } from "vitest";
import {
    shouldExclude,
    parseAndMatchGitignore,
    DEFAULT_EXCLUDE_PATTERNS,
    ALWAYS_EXCLUDE_FILES,
} from "../../src/hooks/wolf-ignore.js";
```

For `wolf-pantry.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  collectAllEntries,
  hashCerebrumBody,
  normalizeCerebrumBody,
  type ProposalEntry,
} from "../../src/hooks/wolf-pantry.js";
```

**Filesystem-based test setup** (`tests/hooks/stop.test.ts` lines 78–110):
```typescript
describe("wolf-pantry - collectAllEntries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ow-pantry-"));
    // wolf-pantry calls getWolfDir() — override via env or mock
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
  // ...
});
```

**Mock shape for `wolf-paths.js`** (`tests/cli/learnings.test.ts` lines 12–16):
```typescript
vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));
```

**Key test cases for `wolf-pantry.test.ts`**:
- `collectAllEntries` returns `[]` when sessions dir absent
- `collectAllEntries` returns parsed entries from well-formed `proposed-learnings.md`
- `collectAllEntries` returns synthetic stub entry when file is non-empty but `parseProposals` yields 0 (D12-05b invariant)
- `collectAllEntries` skips unreadable session dirs with stderr warning (not throw)
- `normalizeCerebrumBody` strips `> Last updated:` line, collapses whitespace
- `hashCerebrumBody` returns same hash for date-only bump (normalization proof)
- `hashCerebrumBody` returns different hash for real content change

---

### `tests/hooks/stop.test.ts` — extend for R7a (MODIFIED)

**Analog:** `tests/hooks/stop.test.ts` (self — extend existing suite)

**Mock pattern** (lines 6–40 — full `shared.js` mock with `readMarkdown` + `appendProposal` added):
```typescript
vi.mock("../../src/hooks/shared.js", async () => {
  return {
    getWolfDir: vi.fn(),
    getSessionDir: vi.fn(),
    ensureWolfDir: vi.fn(),
    readJSON: vi.fn((fp, fallback) => { ... }),
    updateJSON: vi.fn((fp, fallback, mutate) => { ... }),
    appendMarkdown: vi.fn(),
    timeShort: vi.fn(() => "12:34"),
    // R7a additions:
    readMarkdown: vi.fn(() => ""),     // ← returns "" by default (no proposal)
    appendProposal: vi.fn(),           // ← spy on the breadcrumb write
  };
});
```

**R7a test cases to add** (pattern: `finalizeSession(wolfDir, sessionDir, session)` calls):
```typescript
it("stages a stub when code was written and no proposed-learnings.md exists", () => {
  // readMarkdown returns "" (no existing proposal)
  // session.files_written has a non-.wolf code file
  // expect appendProposal to have been called once
});

it("does NOT stage a stub when model already wrote proposed-learnings.md", () => {
  // readMarkdown returns non-empty string
  // expect appendProposal NOT called
});

it("does NOT stage a stub when only .wolf/ files were written", () => {
  // files_written contains only .wolf/ paths
  // expect appendProposal NOT called
});

it("is idempotent: does not re-append stub on second stop when stub already present", () => {
  // session.stop_count = 2 AND readMarkdown returns existing stub text
  // expect appendProposal NOT called on second stop
});
```

---

### `tests/cli/learnings-check.test.ts` (NEW)

**Analog:** `tests/cli/learnings.test.ts`

**Mock setup** (same pattern as `learnings.test.ts` lines 1–23):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
}));
vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn(async (_path: string, fn: () => void) => fn()),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";
```

**Exit-code matrix tests** (`learningsCheckCommand`):
```typescript
it("exits 0 when sessions dir does not exist", ...);
it("exits 0 when all proposed-learnings.md files are empty", ...);
it("exits 1 when at least one session has pending entries", ...);
it("exits 1 when a stub file (non-empty, no → grammar) is present (D12-05b)", ...);
it("exits 2 when sessions dir throws on read", ...);
it("--json emits valid JSON to stdout with pending count", ...);
it("--quiet suppresses stderr; exit code unchanged", ...);
```

**stderr capture pattern** (`learnings.test.ts` lines 9–11):
```typescript
const originalStderrWrite = process.stderr.write;
let stderrOutput: string[] = [];
// in beforeEach:
process.stderr.write = vi.fn((chunk: string) => { stderrOutput.push(chunk); return true; }) as any;
// in afterEach:
process.stderr.write = originalStderrWrite;
```

---

### `tests/cli/status.test.ts` — extend for R7b + R9 (MODIFIED)

**Analog:** `tests/cli/status.test.ts` (self — existing suite)

**Existing test template to copy** (lines 19–50 — full `statusCommand()` invocation with tmpdir):
```typescript
it("new test case description", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
  fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
  // write required files...

  vi.mocked(findProjectRoot).mockReturnValue(dir);
  vi.mocked(detectWorktreeContext).mockReturnValue({
    isWorktree: false, mainRepoRoot: dir, worktreePath: dir, branch: "main",
  });

  await statusCommand();
  const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
  // assert...

  rmSync(dir, { recursive: true, force: true });
});
```

**R9 test cases to add**:
```typescript
it("bootstraps sidecar when absent and does not flag theater");
it("flags theater when only Last updated line changed (same hash)");
it("does not flag when real content was added (different hash)");
it("shows pending learnings count from collectAllEntries()");
```

---

## Shared Patterns

### Dep-Free Hook Module (`src/hooks/wolf-*.ts` family)

**Source:** `src/hooks/wolf-ignore.ts` lines 1–19
**Apply to:** `src/hooks/wolf-pantry.ts`

```typescript
// File header comment block — describes public API and private exclusions
// Imports: ONLY node: builtins and sibling wolf-*.ts modules
// Never: import from src/utils/, node_modules
// Pattern: export const/interface + export function; private helpers unexported
```

### Defensive Error Handling (stderr, never throw)

**Source:** `src/hooks/stop.ts` lines 228–250 (`checkCerebrumFreshness`)
**Apply to:** `captureStubIfNeeded` in `stop.ts`, freshness block in `status.ts`

```typescript
try {
  // ...operation...
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    process.stderr.write(
      `OpenWolf: <description>: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}
```

### Atomic JSON Read-Modify-Write

**Source:** `src/hooks/wolf-json.ts` lines 98–107 (`updateJSON`)
**Apply to:** R9 sidecar writes in `learnings-cmd.ts` (via `withFileLock`)

```typescript
// For the freshness sidecar: write-only (no read-modify-write needed)
// Use withFileLock + writeJSON (not updateJSON, which is for RMW)
await withFileLock(sidecarPath, () => {
  writeJSON(sidecarPath, freshnessSidecar);
});
// writeJSON itself calls withFileLock internally — use _writeJSONUnsafe
// equivalent or rely on wolf-json's own locking (do not double-lock)
```

**IMPORTANT: `writeJSON` already calls `withFileLock` internally** (line 93).
Do NOT wrap `writeJSON` in an outer `withFileLock` — that would double-lock.
Use `withFileLock + fs.writeFileSync` directly for the sidecar, or use
`updateJSON` for the full RMW pattern.

### Commander Lazy-Import Subcommand

**Source:** `src/cli/index.ts` lines 175–188
**Apply to:** `check` + `accept` registrations in `index.ts`

```typescript
learnings
  .command("<name>")
  .description("...")
  .option("--flag", "description")
  .action(async (opts: { flag?: boolean }) => {
    const { commandFn } = await import("./learnings-cmd.js");
    // For exit-code commands: process.exitCode = commandFn(opts);
    // For void commands:      commandFn();
  });
```

### Status Output Convention (D11-07)

**Source:** `src/cli/status.ts` lines 20–155
**Apply to:** All new blocks added to `status.ts`

- No ANSI escape codes or color libraries
- Plain `console.log(...)` only
- Three markers: `✓` (clean), `✗` (hard error/flag), `-` (informational/soft)
- Section headers: `console.log("\nSection Name:")`
- Items: `console.log("  marker text")`

### Hook Test Mock Pattern

**Source:** `tests/hooks/stop.test.ts` lines 6–40
**Apply to:** `tests/hooks/wolf-pantry.test.ts` (mock `wolf-paths.js`),
extended `tests/hooks/stop.test.ts`

```typescript
vi.mock("../../src/hooks/shared.js", async () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  ensureWolfDir: vi.fn(),
  readJSON: vi.fn((fp, fallback) => { /* real fs read or fallback */ }),
  updateJSON: vi.fn((fp, fallback, mutate) => { /* apply mutate, write */ }),
  appendMarkdown: vi.fn(),
  timeShort: vi.fn(() => "12:34"),
}));
```

### CLI Test Mock Pattern

**Source:** `tests/cli/learnings.test.ts` lines 12–22
**Apply to:** `tests/cli/learnings-check.test.ts`, extended `tests/cli/status.test.ts`

```typescript
vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));
vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn(async (_path: string, fn: () => void) => fn()),
}));
```

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Key File:Line References for Planner

| Symbol | File | Lines | Phase 12 Role |
|--------|------|-------|---------------|
| `collectAllEntries()` | `src/cli/learnings-cmd.ts` | 92–117 | Move to `wolf-pantry.ts` |
| `parseProposals()` | `src/cli/learnings-cmd.ts` | 18–63 | Move to `wolf-pantry.ts` |
| `ProposalEntry` | `src/cli/learnings-cmd.ts` | 8–14 | Move to `wolf-pantry.ts` |
| `finalizeSession()` | `src/hooks/stop.ts` | 52–160 | Inject `captureStubIfNeeded()` at line 70 |
| `checkCerebrumFreshness()` | `src/hooks/stop.ts` | 228–250 | Shape analog for `captureStubIfNeeded` |
| code-writes filter | `src/hooks/stop.ts` | 234–239 | Reuse predicate verbatim in D12-02 |
| `appendProposal()` | `src/hooks/wolf-files.ts` | 89–96 | Already exported; no new dep (D12-04) |
| `withFileLock()` | `src/hooks/wolf-lock.ts` | all | Sidecar writes in `learnings-cmd.ts` |
| `learningsMergeCommand()` | `src/cli/learnings-cmd.ts` | 150–279 | Add R9 baseline write after line 273 |
| `learnings` group | `src/cli/index.ts` | 169–188 | Append `check` + `accept` after line 188 |
| `statusCommand()` | `src/cli/status.ts` | 8–156 | Inject pending count + freshness after line 141 |
| `node:crypto` SHA-256 | `src/hooks/wolf-json.ts` | 3, 66 | Exact import pattern for R9 hash |

---

## Metadata

**Analog search scope:** `src/hooks/`, `src/cli/`, `tests/hooks/`, `tests/cli/`
**Files read:** `wolf-ignore.ts`, `stop.ts`, `learnings-cmd.ts`, `status.ts`,
`index.ts`, `wolf-files.ts`, `wolf-json.ts`, `wolf-ignore.test.ts`,
`stop.test.ts`, `learnings.test.ts`, `status.test.ts`
**Pattern extraction date:** 2026-06-25
