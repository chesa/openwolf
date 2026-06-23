# Shared-Checkout Concurrency — Phase 1 (Pillars A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenWolf's structured `.wolf/` files safe for concurrent writes in one shared checkout — no lost updates, no duplicate bug IDs, no git merge conflicts on the buglog.

**Architecture:** (A) Wrap every read-modify-write of a JSON file in a single per-file lock via a new `updateJSON()` that shares a lock-free `_writeJSONUnsafe()` with `writeJSON()` (no nested re-acquire). (B) Move the buglog from a single JSON array to append-only NDJSON with collision-free UUID IDs, so concurrent appends never lose data or conflict. The buglog leaves the lock path entirely.

**Tech Stack:** TypeScript (ESM, `module: Node16`), Node ≥20, vitest. Two compile units: CLI/core (`tsconfig.json`) and hooks (`tsconfig.hooks.json`, `rootDir: src/hooks`, cannot import `src/buglog/` or `src/utils/`).

**Source spec:** `docs/superpowers/specs/2026-06-23-shared-checkout-concurrency-design.md` (Pillars A + B; Pillar C / propose-mode is Phase 2, out of scope here).

## Global Constraints

- Node ≥ 20; TypeScript strict; ESM with `.js` import specifiers.
- Hooks (`src/hooks/**`) are self-contained: NO imports from `src/utils/` or `src/buglog/`. Duplicate small helpers (the `shared.ts` precedent).
- `export type {...}` must be on its own statement under Node16 resolution (cerebrum learning) — never combine with value re-exports.
- After editing any hook, the build copies `dist/hooks/` → consumers; never hand-edit `.wolf/hooks/`.
- Bug IDs: `bug-<8 hex>` from `crypto.randomUUID().slice(0,8)`. Never `bug-${length+1}`.
- Buglog file: `.wolf/buglog.ndjson` (one JSON object per line). Legacy `.wolf/buglog.json` is migrated then renamed `.bak`.
- B3 decision for Phase 1: **append-only** (recurrence appends a fresh line; `occurrences` stays 1). No in-place occurrence bump, no compaction — a `compact` command is a documented Phase-1.5 follow-up. This keeps every write lock-free and merge-clean.
- Run on a feature branch off `develop`: `git checkout develop && git pull && git checkout -b feat/concurrency-phase1`.
- Each task ends green: `pnpm build` succeeds and `pnpm test` passes before commit.

---

### Task 1: `_writeJSONUnsafe` + `updateJSON` in wolf-json.ts

**Files:**
- Modify: `src/hooks/wolf-json.ts`
- Test: `tests/hooks/wolf-json.test.ts` (create)

**Interfaces:**
- Produces: `export function updateJSON<T>(filePath: string, fallback: T, mutate: (cur: T) => T): void` — read-modify-write under one lock.
- Produces (internal): `_writeJSONUnsafe(filePath, data)` — lock-free atomic write; not exported.
- `writeJSON(filePath, data)` keeps its existing signature/behavior (atomic + locked).

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/wolf-json.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { updateJSON, readJSON } from "../../src/hooks/wolf-json.js";

describe("updateJSON", () => {
  it("reads, mutates, and writes under one lock", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "ledger.json");
    try {
      writeFileSync(f, JSON.stringify({ n: 1 }));
      updateJSON<{ n: number }>(f, { n: 0 }, (cur) => ({ n: cur.n + 1 }));
      expect(readJSON<{ n: number }>(f, { n: 0 }).n).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the fallback when the file is absent, then persists it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "missing.json");
    try {
      updateJSON<{ n: number }>(f, { n: 10 }, (cur) => ({ n: cur.n + 5 }));
      expect(JSON.parse(readFileSync(f, "utf-8")).n).toBe(15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT emit an unlocked-fallback warning (no nested re-lock)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "x.json");
    const errs: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (s: string) => { errs.push(String(s)); return true; };
    try {
      updateJSON<{ n: number }>(f, { n: 0 }, (c) => ({ n: c.n + 1 }));
    } finally {
      (process.stderr as any).write = orig;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(errs.join("")).not.toMatch(/proceeding unlocked/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/wolf-json.test.ts`
Expected: FAIL — `updateJSON` is not exported.

- [ ] **Step 3: Refactor wolf-json.ts to extract the lock-free write and add updateJSON**

In `src/hooks/wolf-json.ts`, replace the body of `writeJSON` (currently the whole temp+rename inside `withFileLock`) with this structure. Move the existing temp+rename body verbatim into `_writeJSONUnsafe`; `writeJSON` and `updateJSON` both call it:

```ts
// Lock-free atomic write (temp file + rename, with the existing EBUSY/EXDEV
// fallback). INTERNAL — every caller must already hold the file lock.
function _writeJSONUnsafe(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  const payload = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, payload, "utf-8");
    fs.renameSync(tmp, filePath);
    return;
  } catch (renameErr) {
    const code = (renameErr as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EACCES" && code !== "EPERM" && code !== "EXDEV") {
      try { fs.unlinkSync(tmp); } catch { /* tmp may not exist */ }
      throw renameErr;
    }
    try {
      fs.writeFileSync(filePath, payload, "utf-8");
    } catch (fallbackErr) {
      const orig = renameErr instanceof Error ? renameErr.message : String(renameErr);
      const after = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      process.stderr.write(
        `OpenWolf: failed to write ${filePath} (rename: ${orig}; fallback: ${after})\n`,
      );
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* tmp may not exist */ }
    }
  }
}

export function writeJSON(filePath: string, data: unknown): void {
  withFileLock(filePath, () => _writeJSONUnsafe(filePath, data));
}

// Read-modify-write under ONE lock. `mutate` gets the current value (or
// `fallback` if the file is absent/corrupt) and returns the value to persist.
export function updateJSON<T>(filePath: string, fallback: T, mutate: (cur: T) => T): void {
  withFileLock(filePath, () => {
    const cur = readJSON<T>(filePath, fallback);
    _writeJSONUnsafe(filePath, mutate(cur));
  });
}
```

(`readJSON` already exists in this file and is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/wolf-json.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build to confirm both compile units are clean**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/wolf-json.ts tests/hooks/wolf-json.test.ts
git commit -m "feat(concurrency): add updateJSON + _writeJSONUnsafe (no nested re-lock)"
```

---

### Task 2: Harden the advisory lock

**Files:**
- Modify: `src/hooks/wolf-lock.ts`
- Test: `tests/hooks/wolf-lock.test.ts` (extend)

**Interfaces:**
- Consumes: existing `withFileLock(filePath, fn)` and its `acquireLock`/`releaseLock`.
- Produces: same API; raises `MAX_RETRIES` to 5 with jittered backoff and writes a one-time stderr warning when it falls through to an unlocked write.

- [ ] **Step 1: Read the current lock**

Run: `sed -n '1,80p' src/hooks/wolf-lock.ts` to confirm `MAX_RETRIES`, the retry-sleep guard, and the unlocked-fallback branch locations before editing.

- [ ] **Step 2: Write the failing test**

Add to `tests/hooks/wolf-lock.test.ts`:

```ts
it("warns to stderr when it gives up and proceeds unlocked", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ow-lock-"));
  const target = path.join(dir, "f.json");
  const held = target + ".lock";
  // Hold a FRESH lock (embedded timestamp = now) so it never looks stale.
  writeFileSync(held, `${process.pid}\n${Date.now()}`, { flag: "wx" });
  const errs: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (s: string) => { errs.push(String(s)); return true; };
  let ran = false;
  try {
    withFileLock(target, () => { ran = true; });
  } finally {
    (process.stderr as any).write = orig;
    rmSync(dir, { recursive: true, force: true });
  }
  expect(ran).toBe(true);                       // proceeds unlocked rather than hanging
  expect(errs.join("")).toMatch(/could not acquire lock/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/hooks/wolf-lock.test.ts -t "proceeds unlocked"`
Expected: FAIL — no stderr warning currently emitted (or message differs).

- [ ] **Step 4: Implement the hardening**

In `src/hooks/wolf-lock.ts`: set `const MAX_RETRIES = 5;`. In the retry loop, replace the fixed sleep with jitter, e.g. `sleepMs(80 + Math.floor(deterministicJitter(attempt)));` where the existing code uses a constant — keep using the existing synchronous busy-wait/`Atomics.wait` mechanism, only widening the budget. In the fall-through branch (after the loop exhausts), before running `fn` unlocked, emit exactly once:

```ts
process.stderr.write(
  `OpenWolf: could not acquire lock for ${path.basename(filePath)} after ${MAX_RETRIES} attempts, proceeding unlocked\n`,
);
```

Add a code comment documenting the TOCTOU bound (spec A3): under a staleness storm, at most one writer wins per embedded retry; the whole operation is bounded by `MAX_RETRIES × (staleness window + retry delay)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/hooks/wolf-lock.test.ts`
Expected: PASS (existing + new test).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/wolf-lock.ts tests/hooks/wolf-lock.test.ts
git commit -m "feat(concurrency): widen lock retry budget + warn on unlocked fallback"
```

---

### Task 3: Convert the token-ledger RMW sites to updateJSON

**Files:**
- Modify: `src/hooks/session-start.ts` (`initializeSessionLedger`, lines ~109-130)
- Modify: `src/hooks/stop.ts` (`finalizeSession` ledger block, lines ~108-148)
- Test: extend `tests/hooks/session-start.test.ts` with a concurrency assertion

**Interfaces:**
- Consumes: `updateJSON` from Task 1 (import via `shared.ts`).

- [ ] **Step 1: Re-export updateJSON through shared.ts**

In `src/hooks/shared.ts`, add `updateJSON` to the existing `export { ... } from "./wolf-json.js";` line (it already re-exports `readJSON`, `writeJSON`).

- [ ] **Step 2: Write the failing concurrency test**

Add to `tests/hooks/session-start.test.ts`:

```ts
it("N concurrent ledger increments do not lose updates", async () => {
  const { initializeSessionLedger } = await freshSessionStart();
  rmSync(ledgerPath, { force: true });
  const N = 20;
  await Promise.all(
    Array.from({ length: N }, () => Promise.resolve().then(() => initializeSessionLedger(dir))),
  );
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
  expect(ledger.lifetime.total_sessions).toBe(N);
});
```

(In-process concurrency exercises the read-modify-write path; the cross-process variant lives in Task 9's end-to-end test.)

- [ ] **Step 3: Run test to verify it fails or is flaky**

Run: `npx vitest run tests/hooks/session-start.test.ts -t "concurrent ledger"`
Expected: FAIL/flaky — current `read; ++; writeJSON` loses increments.

- [ ] **Step 4: Convert `initializeSessionLedger`**

Replace the read → `total_sessions++` → `writeJSON` body in `src/hooks/session-start.ts` with:

```ts
export function initializeSessionLedger(sessionDir: string): void {
  const ledgerPath = path.join(sessionDir, "token-ledger.json");
  updateJSON(ledgerPath, {
    version: 1,
    lifetime: {
      total_sessions: 0, total_reads: 0, total_writes: 0,
      total_tokens_estimated: 0, anatomy_hits: 0, anatomy_misses: 0,
      repeated_reads_blocked: 0, estimated_savings_vs_bare_cli: 0,
    },
  } as { version: number; lifetime: Record<string, number>; [k: string]: unknown },
  (ledger) => { ledger.lifetime.total_sessions++; return ledger; });
}
```

Update the import in `session-start.ts` to include `updateJSON` from `./shared.js`.

- [ ] **Step 5: Convert the ledger block in `finalizeSession`**

In `src/hooks/stop.ts`, replace the `const ledger = readJSON(ledgerPath, {...})` … `writeJSON(ledgerPath, ledger)` block (lines ~108-148) with a single `updateJSON(ledgerPath, <same fallback object>, (ledger) => { … all the existing `ledger.sessions.push(...)` and `ledger.lifetime.* +=` mutations … return ledger; })`. Keep the `sessionEntry` construction above the call unchanged. Add `updateJSON` to the `./shared.js` import.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run tests/hooks/session-start.test.ts tests/hooks/stop.test.ts && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/session-start.ts src/hooks/stop.ts src/hooks/shared.ts tests/hooks/session-start.test.ts
git commit -m "feat(concurrency): lock token-ledger read-modify-write via updateJSON"
```

---

### Task 4: Convert the `_session.json` RMW sites to updateJSON

**Files:**
- Modify: `src/hooks/post-write.ts` (`_session.json` block, lines ~156-174)
- Modify: `src/hooks/stop.ts` (`main()` finally block, line ~192; and `finalizeSession` mutates `session.stop_count`)
- Test: extend `tests/hooks/stop.test.ts`

**Note (spec A2 caveat):** locking prevents corruption/lost-updates; in a shared checkout two sessions still share one `_session.json` (semantic conflation accepted — it drives nudges, not accounting).

- [ ] **Step 1: Write the failing test**

Add to `tests/hooks/stop.test.ts` a test that two concurrent `_session.json` updates (push a write + bump `stop_count`) both survive — assert the final file has both writes and `stop_count === 2`. Use the existing test harness for `stop.ts` (mirror its setup of a temp `sessionDir` and `_session.json`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/hooks/stop.test.ts -t "session.json"`
Expected: FAIL — one update clobbers the other.

- [ ] **Step 3: Convert post-write.ts session write**

In `src/hooks/post-write.ts`, replace `const session = readJSON<SessionData>(sessionFile, {...}); … session.files_written.push(...); session.edit_counts[...] = ...; writeJSON(sessionFile, session);` with:

```ts
let editKeyCount = 0;
updateJSON<SessionData>(sessionFile, { files_written: [], edit_counts: {} } as SessionData, (session) => {
  if (!session.edit_counts) session.edit_counts = {};
  session.files_written.push({ file: relFile, action, tokens: writeTokens, at: timestamp() });
  session.edit_counts[editKey] = (session.edit_counts[editKey] || 0) + 1;
  editKeyCount = session.edit_counts[editKey];
  return session;
});
if (editKeyCount >= 3) {
  process.stderr.write(`⚠️ OpenWolf: ${baseName} has been edited ${editKeyCount} times this session. If you're fixing a bug, remember to log it to .wolf/buglog.ndjson.\n`);
}
```

Match the exact field names already used at the call site (`relFile`, `action`, `writeTokens`, `editKey`, `baseName`). Add `updateJSON` to the import.

- [ ] **Step 4: Convert stop.ts session persistence**

`finalizeSession` already mutates `session.stop_count++` on the in-memory object; the persistence is the `writeJSON(sessionFile, session)` in `main()`'s `finally`. Change that single line to `updateJSON<SessionData>(sessionFile, session, (cur) => { cur.stop_count = (cur.stop_count ?? 0) + 1; return cur; });` AND remove the `session.stop_count++` on line 53 (the increment now happens inside the lock so it can't be lost). Verify no other code reads `session.stop_count` between read and the finally (it doesn't).

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run tests/hooks/stop.test.ts tests/hooks/post-write.test.ts && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/post-write.ts src/hooks/stop.ts tests/hooks/stop.test.ts
git commit -m "feat(concurrency): lock _session.json read-modify-write"
```

---

### Task 5: Self-contained NDJSON helper for hooks

**Files:**
- Create: `src/hooks/buglog-ndjson.ts`
- Test: `tests/hooks/buglog-ndjson.test.ts` (create)

**Interfaces:**
- Produces:
  - `export interface BugEntry { id: string; timestamp: string; error_message: string; file: string; line?: number; root_cause: string; fix: string; tags: string[]; related_bugs: string[]; occurrences: number; last_seen: string; }`
  - `export function newBugId(): string` → `bug-<8 hex>`
  - `export function bugLogPath(wolfDir: string): string` → `<wolfDir>/buglog.ndjson`
  - `export function readBugEntries(wolfDir: string): BugEntry[]` — tolerant parse (skips blank/torn lines)
  - `export function appendBugEntry(wolfDir: string, entry: BugEntry): void` — single `appendFileSync` of `JSON.stringify(entry) + "\n"`
  - `export function countBugEntries(wolfDir: string): number`

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/buglog-ndjson.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { newBugId, appendBugEntry, readBugEntries, countBugEntries, bugLogPath } from "../../src/hooks/buglog-ndjson.js";

const mk = (over = {}) => ({
  id: newBugId(), timestamp: "t", error_message: "boom", file: "a.ts",
  root_cause: "rc", fix: "fx", tags: ["x"], related_bugs: [], occurrences: 1, last_seen: "t", ...over,
});

describe("buglog-ndjson", () => {
  it("ids are unique and prefixed", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newBugId()));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^bug-[0-9a-f]{8}$/);
  });

  it("append then read round-trips", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-ndjson-"));
    try {
      appendBugEntry(dir, mk({ error_message: "one" }));
      appendBugEntry(dir, mk({ error_message: "two" }));
      const got = readBugEntries(dir);
      expect(got.map((b) => b.error_message)).toEqual(["one", "two"]);
      expect(countBugEntries(dir)).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("tolerates blank lines and a torn final line", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-ndjson-"));
    try {
      appendBugEntry(dir, mk({ error_message: "good" }));
      appendFileSync(bugLogPath(dir), "\n{\"id\":\"bug-partial\",\"error_mess");  // no newline, truncated
      const got = readBugEntries(dir);
      expect(got).toHaveLength(1);
      expect(got[0].error_message).toBe("good");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/hooks/buglog-ndjson.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/hooks/buglog-ndjson.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface BugEntry {
  id: string;
  timestamp: string;
  error_message: string;
  file: string;
  line?: number;
  root_cause: string;
  fix: string;
  tags: string[];
  related_bugs: string[];
  occurrences: number;
  last_seen: string;
}

export function newBugId(): string {
  return `bug-${crypto.randomUUID().slice(0, 8)}`;
}

export function bugLogPath(wolfDir: string): string {
  return path.join(wolfDir, "buglog.ndjson");
}

export function readBugEntries(wolfDir: string): BugEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(bugLogPath(wolfDir), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(`OpenWolf: failed to read buglog.ndjson (${err instanceof Error ? err.message : String(err)})\n`);
    }
    return [];
  }
  const out: BugEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as BugEntry); } catch { /* skip blank/torn/corrupt line */ }
  }
  return out;
}

export function appendBugEntry(wolfDir: string, entry: BugEntry): void {
  const p = bugLogPath(wolfDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf-8");
}

export function countBugEntries(wolfDir: string): number {
  return readBugEntries(wolfDir).length;
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/hooks/buglog-ndjson.test.ts && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 5: Re-export through shared.ts and commit**

Add `export { appendBugEntry, readBugEntries, countBugEntries, newBugId, bugLogPath } from "./buglog-ndjson.js";` and, on its own line, `export type { BugEntry } from "./buglog-ndjson.js";` to `src/hooks/shared.ts`.

```bash
git add src/hooks/buglog-ndjson.ts src/hooks/shared.ts tests/hooks/buglog-ndjson.test.ts
git commit -m "feat(buglog): self-contained NDJSON helper for hooks"
```

---

### Task 6: Canonical NDJSON in bug-tracker.ts (CLI), API-stable

**Files:**
- Modify: `src/buglog/bug-tracker.ts`
- Test: `tests/buglog/bug-tracker.test.ts` (create)

**Interfaces:**
- Keep stable (so `bug-cmd.ts` and `bug-matcher.ts` need no change): `readBugLog(wolfDir): BugLog`, `searchBugs(wolfDir, term): BugEntry[]`, `findSimilarBugs(wolfDir, msg): ScoredBug[]`, `logBug(wolfDir, bug): void`.
- Internals switch to NDJSON; `logBug` appends with a UUID id (append-only — no in-place occurrence bump in Phase 1).

- [ ] **Step 1: Write the failing test**

Create `tests/buglog/bug-tracker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { logBug, readBugLog, searchBugs } from "../../src/buglog/bug-tracker.js";

describe("bug-tracker NDJSON", () => {
  it("logBug appends a UUID-id NDJSON line; readBugLog reads it back", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-bt-"));
    try {
      logBug(dir, { error_message: "TypeError x", file: "a.ts", root_cause: "rc", fix: "fx", tags: ["ts"] });
      logBug(dir, { error_message: "ENOENT y", file: "b.ts", root_cause: "rc2", fix: "fx2", tags: ["fs"] });
      const raw = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8").trim().split("\n");
      expect(raw).toHaveLength(2);
      const log = readBugLog(dir);
      expect(log.bugs).toHaveLength(2);
      expect(log.bugs[0].id).toMatch(/^bug-[0-9a-f]{8}$/);
      expect(log.bugs[0].id).not.toBe(log.bugs[1].id);
      expect(searchBugs(dir, "ENOENT").map((b) => b.file)).toEqual(["b.ts"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/buglog/bug-tracker.test.ts`
Expected: FAIL — still writes `buglog.json` / sequential ids.

- [ ] **Step 3: Rewrite bug-tracker internals to NDJSON**

In `src/buglog/bug-tracker.ts`:
- Add `import * as fs from "node:fs"; import * as crypto from "node:crypto";` (keep `path`, and the `readJSON/writeJSON` import may be dropped if now unused).
- Change `getBugLogPath` to return `path.join(wolfDir, "buglog.ndjson")`.
- Rewrite `readBugLog` to parse NDJSON (tolerant, same logic as Task 5's `readBugEntries`) and wrap into `{ version: 1, bugs }` so callers that read `.bugs` are unchanged.
- Rewrite `logBug` to be append-only:

```ts
export function logBug(wolfDir: string, bug: { error_message: string; file: string; line?: number; root_cause: string; fix: string; tags: string[]; }): void {
  const now = new Date().toISOString();
  const entry = {
    id: `bug-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now, error_message: bug.error_message, file: bug.file, line: bug.line,
    root_cause: bug.root_cause, fix: bug.fix, tags: bug.tags,
    related_bugs: [], occurrences: 1, last_seen: now,
  };
  fs.mkdirSync(path.dirname(getBugLogPath(wolfDir)), { recursive: true });
  fs.appendFileSync(getBugLogPath(wolfDir), JSON.stringify(entry) + "\n", "utf-8");
}
```

`searchBugs` / `findSimilarBugs` keep their bodies (they consume `readBugLog().bugs`). Add a code comment: "Phase 1 is append-only; occurrence folding is a deferred `bug compact` follow-up."

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run tests/buglog/bug-tracker.test.ts && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/buglog/bug-tracker.ts tests/buglog/bug-tracker.test.ts
git commit -m "feat(buglog): NDJSON + UUID ids in bug-tracker (API stable)"
```

---

### Task 7: One-time migration `buglog.json` → `buglog.ndjson`

**Files:**
- Create: `src/cli/migrate-buglog.ts`
- Modify: `src/cli/init.ts` and `src/cli/update.ts` (call the migration when a legacy file is present)
- Test: `tests/cli/migrate-buglog.test.ts` (create)

**Interfaces:**
- Produces: `export function migrateBugLog(wolfDir: string): "migrated" | "skipped"` — idempotent; converts `buglog.json` → `buglog.ndjson`, renames source to `buglog.json.bak`. No-op if `buglog.ndjson` exists or no `buglog.json`.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/migrate-buglog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { migrateBugLog } from "../../src/cli/migrate-buglog.js";

describe("migrateBugLog", () => {
  it("converts a legacy array, preserves ids/counts, renames .bak, idempotent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-mig-"));
    try {
      const legacy = { version: 1, bugs: [
        { id: "bug-001", error_message: "a", file: "x", root_cause: "", fix: "", tags: [], related_bugs: [], occurrences: 1, last_seen: "t", timestamp: "t" },
        { id: "bug-002", error_message: "b", file: "y", root_cause: "", fix: "", tags: [], related_bugs: [], occurrences: 2, last_seen: "t", timestamp: "t" },
      ]};
      writeFileSync(path.join(dir, "buglog.json"), JSON.stringify(legacy));
      expect(migrateBugLog(dir)).toBe("migrated");
      const lines = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe("bug-001");
      expect(existsSync(path.join(dir, "buglog.json"))).toBe(false);
      expect(existsSync(path.join(dir, "buglog.json.bak"))).toBe(true);
      expect(migrateBugLog(dir)).toBe("skipped");   // idempotent
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/cli/migrate-buglog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the converter**

Create `src/cli/migrate-buglog.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";

export function migrateBugLog(wolfDir: string): "migrated" | "skipped" {
  const ndjson = path.join(wolfDir, "buglog.ndjson");
  const legacy = path.join(wolfDir, "buglog.json");
  if (fs.existsSync(ndjson)) return "skipped";
  if (!fs.existsSync(legacy)) return "skipped";
  let parsed: { bugs?: unknown[] };
  try { parsed = JSON.parse(fs.readFileSync(legacy, "utf-8")); }
  catch { return "skipped"; }   // leave a corrupt legacy file untouched
  const bugs = Array.isArray(parsed.bugs) ? parsed.bugs : [];
  const tmp = ndjson + "." + Date.now() + ".tmp";
  fs.writeFileSync(tmp, bugs.map((b) => JSON.stringify(b)).join("\n") + (bugs.length ? "\n" : ""), "utf-8");
  fs.renameSync(tmp, ndjson);
  fs.renameSync(legacy, legacy + ".bak");
  return "migrated";
}
```

(`Date.now()` is fine in CLI/core code; the no-`Date.now` rule only applies to workflow scripts.)

- [ ] **Step 4: Wire into init and update**

In `src/cli/init.ts`, after `ensureDir(wolfDir)` and before the template loop, add: `migrateBugLog(wolfDir);` (import it). In `src/cli/update.ts`, add the same call near the top of the upgrade path. Both are no-ops on a clean install.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run tests/cli/migrate-buglog.test.ts && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/cli/migrate-buglog.ts src/cli/init.ts src/cli/update.ts tests/cli/migrate-buglog.test.ts
git commit -m "feat(buglog): one-time buglog.json -> buglog.ndjson migration"
```

---

### Task 8: Convert hook buglog writers + counters + nudge string

**Files:**
- Modify: `src/hooks/post-write.ts` (`autoDetectBugFix` — uses inline buglog read/write at lines ~301-345)
- Modify: `src/hooks/session-start.ts` (empty-buglog reminder, ~line 92-98)
- Modify: `src/hooks/stop.ts` (`checkForMissingBugLogs` string match, line 213)
- Test: extend `tests/hooks/post-write.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/hooks/post-write.test.ts` a test that two concurrent `autoDetectBugFix`-style appends produce two NDJSON lines with two distinct ids (no lost entry, no dup id). Use the hook's existing test harness; assert against `buglog.ndjson`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/hooks/post-write.test.ts -t "buglog"`
Expected: FAIL — current code reads/writes the JSON array with `bug-${length+1}`.

- [ ] **Step 3: Convert `autoDetectBugFix`**

In `src/hooks/post-write.ts`, replace the inline `const bugLog = readJSON<BugLog>(bugLogPath, {version:1,bugs:[]}); … nextId = bug-${bugLog.bugs.length+1} … writeJSON(bugLogPath, bugLog)` logic with the self-contained helper from Task 5:

```ts
import { appendBugEntry, newBugId } from "./shared.js";   // (add to existing import)
// …
appendBugEntry(wolfDir, {
  id: newBugId(),
  timestamp: new Date().toISOString(),
  error_message, file: relFile, root_cause, fix,
  tags, related_bugs: [], occurrences: 1, last_seen: new Date().toISOString(),
});
```

Map to the exact local variable names already in `autoDetectBugFix`. Remove the now-unused `BugLog` interface / `bugLogPath` JSON references and any duplicate-id logic (append-only — Phase 1).

- [ ] **Step 4: Convert the session-start empty-buglog reminder**

In `src/hooks/session-start.ts`, replace the `readJSON<{bugs:[]}>(buglogPath, …)` + `buglog.bugs.length === 0` check with `countBugEntries(wolfDir) === 0` (import `countBugEntries` from `./shared.js`). Update the message text `…log them to .wolf/buglog.ndjson.`

- [ ] **Step 5: Fix the stop.ts nudge string (review #3)**

In `src/hooks/stop.ts` line ~212-213, change `w.file.includes("buglog.json")` to `w.file.includes("buglog")` and update the message text to reference `buglog.ndjson`.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run tests/hooks/ && pnpm build`
Expected: PASS, build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/post-write.ts src/hooks/session-start.ts src/hooks/stop.ts tests/hooks/post-write.test.ts
git commit -m "feat(buglog): hooks append NDJSON with UUID ids; fix stop nudge match"
```

---

### Task 9: Convert direct readers (daemon, dashboard, status) + templates/docs + E2E

**Files:**
- Modify: `src/daemon/wolf-daemon.ts:211,423` (file-serving lists)
- Modify: `src/dashboard/app/hooks/useWolfData.ts:106-107` (parse buglog)
- Modify: `src/cli/status.ts:39` (file list) and `src/cli/update.ts:47` (preservation list) + the `claude-rules` protocol text at `update.ts:336`
- Rename: `src/templates/buglog.json` → `src/templates/buglog.ndjson` (empty file); update `src/cli/init.ts` `CREATE_IF_MISSING` (`buglog.json` → `buglog.ndjson`) and `src/templates/wolf-gitignore` if it lists `buglog.json`
- Modify docs/templates: `src/templates/OPENWOLF.md`, `src/templates/claude-rules-openwolf.md`, `docs/*` references `buglog.json` → `buglog.ndjson`
- Test: `tests/e2e-concurrency.test.ts` (create) — the headline cross-process guard

- [ ] **Step 1: Daemon + dashboard reader swap**

In `src/daemon/wolf-daemon.ts`, in both file-serving lists (lines 211 and 423) replace `"buglog.json"` with `"buglog.ndjson"`. In `src/dashboard/app/hooks/useWolfData.ts`, replace lines 106-107 with a tolerant NDJSON parse:

```ts
if (files["buglog.ndjson"] != null) {
  const bugs = files["buglog.ndjson"].split("\n").map((l) => l.trim()).filter(Boolean)
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  setBuglog({ bugs });
}
```

`BugLog.tsx` consumes `buglog.bugs` and is unchanged.

- [ ] **Step 2: status / update / template lists**

In `src/cli/status.ts:39` and `src/cli/update.ts:47`, change `"buglog.json"` → `"buglog.ndjson"`. In `src/cli/init.ts` `CREATE_IF_MISSING`, change `"buglog.json"` → `"buglog.ndjson"`. Rename the template `src/templates/buglog.json` → `src/templates/buglog.ndjson` (empty file — `git mv`). If `src/templates/wolf-gitignore` references `buglog.json`, update it (buglog stays committed, so it is NOT ignored — just the name).

- [ ] **Step 3: Docs/protocol text**

Replace `buglog.json` → `buglog.ndjson` in `src/templates/OPENWOLF.md`, `src/templates/claude-rules-openwolf.md`, the inline `claude-rules` string in `src/cli/update.ts:336`, and any `docs/*.md` hits (`grep -rl "buglog.json" docs src/templates`).

- [ ] **Step 4: Write the end-to-end cross-process concurrency test**

Create `tests/e2e-concurrency.test.ts`: build first (`dist/hooks` must exist), then spawn N child processes (`child_process.fork`/`execFile node dist/hooks/post-write.js`) that each log a distinct bug into one shared temp `OPENWOLF_METADATA_DIR`; assert `buglog.ndjson` has exactly N lines with N distinct ids. Add a second case: N processes each running the ledger-increment path; assert `total_sessions === N`. Mark with a generous timeout.

- [ ] **Step 5: Run full suite + build + smoke**

Run: `pnpm build && pnpm test`
Expected: all green. Then smoke-test migration on a copy: `cp .wolf/buglog.json /tmp/bl.json` is not needed — instead run `node -e` against `migrateBugLog` on a temp fixture (covered by Task 7). Confirm `node dist/bin/openwolf.js bug <term>` reads NDJSON.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(buglog): readers/templates/docs to NDJSON + e2e concurrency test"
```

---

## Self-review checklist (run after building the plan)

- Pillar A (lock RMW): Tasks 1–4 cover `updateJSON`, lock hardening, ledger sites, `_session.json` sites. ✓
- Pillar B (NDJSON): Tasks 5–9 cover hook helper, CLI bug-tracker, migration, hook writers, readers/templates/docs, UUID ids. ✓
- Review #1 (nested lock) → Task 1; #2 (hooks boundary) → Task 5 + Task 6 split; #3 (stop string) → Task 8 Step 5; #4 (_session.json) → Task 4; #5 (logBug) → Task 6; #6 (atomicity) → Task 5 torn-line test; #7 (read-during-append) → Task 5 + Task 9 e2e; #8 (TOCTOU bound) → Task 2 Step 4 comment. ✓
- Type consistency: `BugEntry` shape identical in `src/hooks/buglog-ndjson.ts` and `src/buglog/bug-tracker.ts`; `updateJSON<T>` signature identical across Tasks 1/3/4. ✓
- Deferred (NOT in Phase 1): `openwolf bug compact` (occurrence folding), Pillar C propose-mode, lifting `withFileLock` to `src/utils/` (only needed if B3b — not chosen).

## Execution note

This plan assumes a feature branch off `develop` (`feat/concurrency-phase1`). Each task is independently testable and ends green. The headline acceptance gate is Task 9's cross-process test: N concurrent writers → N entries, N distinct ids, zero loss.
