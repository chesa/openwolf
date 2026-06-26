# Phase 12: Framework-Blind Curation Machinery — Research

**Researched:** 2026-06-25
**Domain:** Shared-context curation discipline (continuous capture, promotion gate, freshness integrity)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**R7a — the `stop` hook is structural insurance, not a semantic author (USER-LOCKED)**
- **D12-01:** The `stop` hook **cannot** guess *what* was learned and must **never** synthesize a heuristic "learning" from file diffs. Its sole job is lifecycle insurance: ensure a staging breadcrumb exists so the promotion gate forces human curation.
- **D12-02:** **Stub trigger condition.** Stage a stub **only when both**: (a) the session mutated ≥1 **code file** (reuse the non-`.wolf/`, non-`.tmp` "code writes" filter that Phase 11's deleted `checkStatusFreshness` used — same predicate, new purpose), **and** (b) the model wrote **no** `proposed-learnings.md` this session (absent or empty).
- **D12-03 (idempotency):** The stub append MUST be idempotent — guard on "a stub for this session does not already exist."
- **D12-04 (capture path is dep-free — C2):** R7a reuses the **already-exported** `appendProposal()` from `src/hooks/wolf-files.ts:89`, re-exported via `shared.ts:16`. No new hook import.

**R7a/R7b — stub-vs-parser grammar reconciliation (D12-05 — INVARIANT LOCKED, mechanism is Claude's Discretion):**
- **INVARIANT (locked):** a stub the hook writes **must trip `openwolf learnings check` (exit 1)** and surface in the `status` count.
- The mechanism is left to the planner (see Claude's Discretion).

**R7b — `learnings check` output contract (USER-LOCKED)**
- **D12-06:** New subcommand `openwolf learnings check` under `learnings` group. Exit codes: **`0`** clean, **`1`** pending, **`2`** operational error.
- **D12-07 (output channels):**
  - stderr (human, on pending): headline count + bounded bulleted session list (cap ≈5, then `… + N more sessions`) + remediation line
  - stdout (machine): clean by default; JSON only under `--json`
  - `--quiet` (CI): mutes both streams; rely solely on exit code
- **D12-08:** Both `learnings check` and `status` pending count are routed through the **same** `collectAllEntries()` (D-19).

**Shared module extraction (USER-LOCKED)**
- **D12-09:** Move `collectAllEntries()` into a new **`src/hooks/wolf-pantry.ts`**. Both `status.ts` and `learnings-cmd.ts` import it as a peer.
- **D12-10 (C2):** Because `wolf-pantry.ts` lives under `src/hooks/` it is in the hook build and **must be dependency-free** — `node:` builtins only. Re-export via `shared.ts` **only** what a hook actually consumes; `collectAllEntries` is CLI-only, so do **not** add to the barrel.

**R9 — freshness hashing (USER-LOCKED)**
- **D12-11:** Hash with `node:crypto` `createHash("sha256")` over a **normalized** cerebrum body. Normalization: strip the `> Last updated:` line entirely (`/^>\s*Last\s+updated\s*:.*$/gim`), then collapse **all** whitespace (`/\s+/g → ""`), then trim.
- **D12-12:** Sidecar is `.wolf/cerebrum-freshness.json` — gitignored, line already reserved by Phase 9 (D-09-06).

**R9 — baseline write discipline (USER-LOCKED, D-20)**
- **D12-13:** Exactly **three** sanctioned baseline writers:
  1. **`learnings merge`** — re-baseline automatically after successful append
  2. **`learnings accept`** — new explicit affordance for blessed hand-edits
  3. **Bootstrap-on-missing** — see D12-14
- **D12-14 (`status` read-only + ONE bootstrap exception):** `openwolf status` **never mutates** an existing sidecar. The **single** exception: if `.wolf/cerebrum-freshness.json` is **entirely absent** (fresh clone), `status` computes the pristine baseline and writes the initial sidecar. If the sidecar **exists**, `status` is strictly read-only and may flag but never overwrite.

**Verification gates**
- **D12-15:** `grep -rIiE 'bitbucket|github|pipelines|pre-push' src/` → **zero**; `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` → **zero** (C1)
- **D12-16:** `tsc --noEmit -p tsconfig.hooks.json` clean (C2). After `stop.ts` edit: `pnpm build:hooks` → `openwolf update`. Full `pnpm test` green. Add changelog entry.

### Claude's Discretion

- **The D12-05 stub-vs-parser mechanism** (see Assumptions Log — A1)
- Whether R9 hash util lives in `wolf-pantry.ts` or a sibling `wolf-freshness.ts`
- Exact `cerebrum-freshness.json` schema
- Exact `status` rendering for freshness flag and pending count
- Test file organization

### Deferred Ideas (OUT OF SCOPE)

- **R10** (cerebrum provenance: per-entry date + source link) — deferred to D-16
- **R12** (pantry-owner role + prune runbook) — deferred to D-16
- **Host wiring** — pre-push hooks, Bitbucket Pipelines, GitHub Actions snippets live **only in docs**, never in `src/` (C1)
- The Phase 9 ignore-list line (already landed) and Phase 11 STATUS teardown (already landed) — consumed not redone
- Removing `stop.ts` mtime-based `checkCerebrumFreshness` nudge — note for future hygiene pass, not in scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R7a | `proposed-learnings` is the default capture path, written via universal Claude Code `stop` hook. A session that learns something leaves a staged entry regardless of execution layer; capture path is dependency-free (C2). | D12-01 through D12-04; Pattern 1 (`appendProposal()` re-use); stub idempotency via `stop_count`; code-writes filter |
| R7b | Promotion gate primitive: `openwolf learnings check` exit 0/1/2; human summary to stderr on pending; stdout clean; `--quiet` for CI; pending count in `openwolf status`; both through `collectAllEntries()`; grep gate returns zero (C1). | D12-06 through D12-09; Pattern 2 (wolf-pantry relocation); Pattern 3 (learningsCheckCommand); Pattern 4 (status pull-side); exit-code contract ESLint/Ruff/pytest precedent |
| R9 | Freshness integrity: date-only bump flagged in `openwolf status` via `node:crypto` SHA-256 of normalized cerebrum body in gitignored sidecar; baseline at `learnings merge` + `learnings accept` + bootstrap-on-missing. | D12-11 through D12-14; Pattern 5 (normalization + hashing); Pattern 6 (sidecar schema); Pattern 7 (status integration); wolf-gitignore reserved line |

</phase_requirements>

---

## Summary

Phase 12 ships three interlocking curation mechanisms: the `stop` hook as a structural breadcrumb guarantor (R7a), a CLI exit-code gate for the Git push/PR boundary (R7b), and a content-hash integrity check for `cerebrum.md` (R9). All three are framework-blind (no execution-layer names in `src/`) and dependency-free on the hook path (C2).

The central engineering insight is that **all four design points have settled solutions pre-mapped to exact file:line references**: `appendProposal()` already exists at `src/hooks/wolf-files.ts:89`; `collectAllEntries()` already exists at `src/cli/learnings-cmd.ts:92`; `node:crypto` SHA-256 is already used in three hook modules; and `cerebrum-freshness.json` ignore line is already reserved in `src/templates/wolf-gitignore`. This is a "move and wire" phase, not a "design and build" phase. The primary planner judgment calls are: (a) the D12-05 stub-vs-parser mechanism (presence-based counting is recommended), (b) whether R9 hash util co-lives in `wolf-pantry.ts` or a sibling module, and (c) exact `status` output wording.

The phase is a pure extension of the existing `learnings` command group and `stop` hook. No new production dependencies. No new CLI top-level commands. The entire change surface is: one new `wolf-pantry.ts` module, three new CLI sub-commands (`check`, `accept` + optional freshness sub-check), four new/modified tests, and the `stop.ts` stub injection.

**Primary recommendation:** Sequence plans as: (1) `wolf-pantry.ts` module creation + refactor, (2) R7b gate subcommands, (3) R9 freshness engine, (4) R7a hook wiring, (5) integration & verification.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Continuous capture (R7a) | Hook (`src/hooks/stop.ts`) | — | Claude Code executes hooks; must be dep-free; `stop` fires on every session end regardless of execution layer |
| Promotion gate (R7b) | CLI (`src/cli/learnings-cmd.ts` + `index.ts`) | — | Exit-code contract is a CLI concern; consumer wires to pre-push/CI; no hook involvement |
| Pending count pull-surface (R7b) | CLI (`src/cli/status.ts`) | — | `openwolf status` is the pull-based surface; must not gate/mutate |
| Shared staging entry aggregation | Hook module (`src/hooks/wolf-pantry.ts`) | CLI (importers) | Must be dep-free for C2; both CLI consumers import it as a peer |
| Freshness hash engine (R9) | CLI utility (to be located) | — | Pure Node.js: `node:crypto` SHA-256; not hook-time concern; CLI/daemon context |
| Freshness baseline write (R9) | CLI (`learnings-cmd.ts`, `learnings-accept`) | — | Only sanctioned writers: `learnings merge`, `learnings accept`, `status` bootstrap |
| Freshness integrity check (R9) | CLI (`src/cli/status.ts`) | — | Pull-based integrity surface; read-only (except bootstrap) |
| Git/CI gate wiring | Docs only (C1) | — | OpenWolf ships the primitive; consumers wire it; no host names in `src/` |

---

## Standard Stack

### Core (Existing — No New Deps)

| Library | Source | Purpose | Status |
|---------|--------|---------|--------|
| `node:fs` | Node.js stdlib | File read/write for staging files, sidecar, cerebrum.md | Already in use [VERIFIED: project source] |
| `node:path` | Node.js stdlib | Path construction for session dirs, wolf dirs | Already in use [VERIFIED: project source] |
| `node:crypto` | Node.js stdlib | SHA-256 hash of normalized cerebrum body (R9) | Already used in `wolf-json.ts:3`, `post-write.ts:3`, `worktree-helper.ts:82` [VERIFIED: project source] |
| `commander` v12 | `package.json` | CLI subcommand registration for `check` + `accept` | Already used in `index.ts` [VERIFIED: project source] |
| `vitest` v4.1.5 | `package.json` (dev) | Unit tests for all new logic | Already in use [VERIFIED: project source] |

### Supporting (Internal Modules to Create/Move)

| Module | Action | Purpose |
|--------|--------|---------|
| `src/hooks/wolf-pantry.ts` | **Create new** | Dep-free home for `collectAllEntries()` (and possibly `parseProposals()`) — the shared staging-file aggregator |
| `src/cli/freshness-util.ts` (or within `wolf-pantry.ts`) | **Create new** | `normalizeContent()` + `hashBody()` for R9 cerebrum hashing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:crypto` SHA-256 | `md5` / `xxhash` | MD5 has theoretical collision risk; SHA-256 is free, already in-codebase, and overkill-proof |
| Full D12-11 whitespace collapse (`/\s+/g → ""`) | Line-by-line normalization | Full collapse is simpler to implement and test; USER-LOCKED per D12-11 |
| Presence-based stub gate (D12-05b) | Parser grammar extension (D12-05a) or distinct filename (D12-05c) | Presence-based is simplest; avoids parser coupling; merge still refuses to fold stubs (stubs lack `→ target` grammar) |

**Installation:** No new `npm install` needed. Phase uses only existing deps and Node.js stdlib.

---

## Package Legitimacy Audit

No new external packages are introduced in Phase 12. All work uses:
- Existing `node:` stdlib modules (crypto, fs, path)
- Existing project dependencies (commander, vitest)
- Internal project modules (refactored/created within `src/`)

**No packages to audit.** The legitimacy gate is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Session Activity
     │
     ▼
[stop.ts hook]
  finalizeSession()
     │
     ├─ checkForMissingBugLogs()  (existing)
     ├─ checkCerebrumFreshness()  (existing, mtime-based)
     └─ captureStubIfNeeded()     ← R7a (NEW)
          │ code writes AND no proposed-learnings.md?
          │ yes → appendProposal("cerebrum", stub)
          │         writes to .wolf/sessions/<id>/proposed-learnings.md
          │
          ▼
  .wolf/sessions/<worktreeId>/
  └── proposed-learnings.md  ← staging file (R7a writes; R7b reads)


CLI Pull Surface
     │
     ├─── openwolf status
     │       │
     │       ├─ collectAllEntries()  ← from wolf-pantry.ts (R7 pull)
     │       │   "N learnings awaiting review"
     │       │
     │       └─ hashBody(cerebrum.md)  ← from freshness-util (R9)
     │           compare to cerebrum-freshness.json sidecar
     │           bootstrap if missing; flag if theater
     │
     └─── openwolf learnings
              │
              ├─ list     (existing)
              ├─ merge    (existing + R9 baseline write NEW)
              │     └─ after append → writeJSON(cerebrum-freshness.json)
              │
              ├─ check    ← R7b (NEW)
              │     collectAllEntries() → exit 0/1/2
              │     stderr: bounded summary (human)
              │     stdout: JSON under --json
              │
              └─ accept   ← R9 re-baseline (NEW)
                    hashBody(cerebrum.md) → writeJSON(cerebrum-freshness.json)


Shared Module: src/hooks/wolf-pantry.ts
  ┌──────────────────────────────────┐
  │ collectAllEntries(): ProposalEntry[] │
  │   walks .wolf/sessions/*/         │
  │   calls parseProposals()          │
  └──────────────────────────────────┘
      ▲                        ▲
      │                        │
  status.ts           learnings-cmd.ts
  (R7 pull)            (R7b gate)
```

### Recommended Project Structure

```
src/
├── hooks/
│   ├── wolf-pantry.ts   ← NEW — dep-free staging aggregator
│   ├── stop.ts          ← MODIFIED — R7a stub injection
│   └── shared.ts        ← UNCHANGED (wolf-pantry not in barrel unless hook needs it)
├── cli/
│   ├── learnings-cmd.ts ← MODIFIED — check + accept commands; import from wolf-pantry
│   ├── status.ts        ← MODIFIED — pending count + R9 freshness check
│   ├── index.ts         ← MODIFIED — register check + accept subcommands
│   └── freshness-util.ts ← NEW (or co-located in wolf-pantry.ts) — normalize + hash
└── templates/
    └── wolf-gitignore   ← VERIFY line exists for cerebrum-freshness.json (Phase 9 reserved it)

tests/
├── hooks/
│   ├── wolf-pantry.test.ts   ← NEW — collectAllEntries, presence detection
│   └── stop.test.ts          ← MODIFIED — stub capture tests
├── cli/
│   ├── learnings-check.test.ts  ← NEW — exit-code matrix
│   ├── learnings-accept.test.ts ← NEW — R9 re-baseline
│   ├── learnings.test.ts        ← POSSIBLY EXTENDED — R9 baseline-after-merge
│   └── status.test.ts           ← EXTENDED — pending count + freshness flag
```

### Pattern 1: Hook-Side Stub Capture (R7a)

**What:** `finalizeSession()` in `stop.ts` calls `captureStubIfNeeded()` as the third check (after the two surviving Phase 11 checks), which calls `appendProposal()` when code was written but no learning was staged.

**When to use:** Any session that mutated code files without leaving a `proposed-learnings.md` entry.

**Trigger guards (D12-02, D12-03):**
- Code writes: `session.files_written.filter(w => !w.file.includes("/.wolf/") && !w.file.endsWith(".tmp")).length > 0`
- No existing proposal: `!fs.existsSync(proposalPath) || readMarkdown(proposalPath).trim().length === 0`
- Idempotency: if `stop_count > 1` AND the proposal already contains the stub marker, skip

```typescript
// Source: src/hooks/stop.ts (to be added)
function captureStubIfNeeded(
  wolfDir: string,
  sessionDir: string,
  session: SessionData
): void {
  // (a) Guard: code writes only (not .wolf/, not .tmp)
  const codeWrites = session.files_written.filter(
    (w) => !w.file.includes("/.wolf/") && !w.file.endsWith(".tmp")
  );
  if (codeWrites.length === 0) return;

  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  const existingContent = readMarkdown(proposalPath); // already imported via shared.ts

  // (b) Guard: model already wrote a proposal
  if (existingContent.trim().length > 0) return;

  // (c) Idempotency: stub already staged for this session?
  const STUB_MARKER = "### Staged Session Metadata";
  if (session.stop_count > 1 && existingContent.includes(STUB_MARKER)) return;

  // Append the stub via existing hook-exported helper (D12-04 — no new hook import)
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

### Pattern 2: `wolf-pantry.ts` — Dep-Free Staging Aggregator (D12-09, D12-10)

**What:** New module `src/hooks/wolf-pantry.ts` that provides `collectAllEntries()` (moved from `learnings-cmd.ts:92`) and co-locates it with `parseProposals()` to avoid a CLI↔CLI import cycle.

**Why `src/hooks/`:** Must be dep-free for C2; matches `wolf-ignore.ts` precedent (D10-02); shared by both CLI importers without circular dependency.

**NOT added to `shared.ts` barrel** (D12-10 / D10-09 precedent): `collectAllEntries` is CLI-only; hook barrel is for hook-consumed utilities only.

```typescript
// Source: src/hooks/wolf-pantry.ts (NEW)
import * as fs from "node:fs";
import * as path from "node:path";
import { getWolfDir } from "./wolf-paths.js";

export interface ProposalEntry {
  sessionId: string;
  timestamp: string;
  target: "cerebrum" | "anatomy";
  content: string;
  raw: string;
}

const ENTRY_HEADER_REGEX = /^(.+?) → (.+)\n\n([\s\S]*)$/;

export function parseProposals(sessionDir: string, sessionId: string): ProposalEntry[] {
  // ... (moved from learnings-cmd.ts:18–63 verbatim)
}

export function collectAllEntries(): ProposalEntry[] {
  const wolfDir = getWolfDir();
  const sessionsDir = path.join(wolfDir, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  const entries: ProposalEntry[] = [];

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const sessionDir = path.join(sessionsDir, dirent.name);

    // D12-05b: presence-based — count any session with a non-empty proposed-learnings.md
    const proposalPath = path.join(sessionDir, "proposed-learnings.md");
    if (!fs.existsSync(proposalPath)) continue;
    const raw = fs.readFileSync(proposalPath, "utf-8").trim();
    if (!raw) continue; // empty file → not pending

    try {
      const parsed = parseProposals(sessionDir, dirent.name);
      // If parse yields nothing (e.g., stub), still count the session as pending
      // by pushing a synthetic "stub" entry so collectAllEntries returns non-empty
      if (parsed.length === 0) {
        // stub detected: push a synthetic entry counted as pending
        entries.push({
          sessionId: dirent.name,
          timestamp: new Date().toISOString(),
          target: "cerebrum",
          content: "(staged stub — review and replace with explicit learning)",
          raw,
        });
      } else {
        entries.push(...parsed);
      }
    } catch {
      process.stderr.write(`OpenWolf: cannot read session directory ${dirent.name}, skipping\n`);
    }
  }

  return entries;
}
```

**D12-05 resolution (presence-based, option b):** Any non-empty `proposed-learnings.md` counts as pending. If `parseProposals` returns nothing (stub content), a synthetic entry is pushed so the gate trips. The `merge` command still ignores stubs (they have no `→ target` grammar), keeping the barrier against stubs silently merging into `cerebrum.md`.

### Pattern 3: R7b `learningsCheckCommand()` Exit-Code Gate

**What:** New export from `learnings-cmd.ts` implementing the 0/1/2 exit-code contract with `--json` + `--quiet` flags.

```typescript
// Source: src/cli/learnings-cmd.ts (addition)
export function learningsCheckCommand(opts: { json?: boolean; quiet?: boolean }): 0 | 1 | 2 {
  try {
    const entries = collectAllEntries(); // from wolf-pantry.js

    if (opts.json) {
      process.stdout.write(JSON.stringify({
        pending: entries.length,
        entries: entries.map((e) => ({
          sessionId: e.sessionId,
          timestamp: e.timestamp,
          target: e.target,
          content: e.content.slice(0, 120), // cap to avoid giant JSON
        })),
      }) + "\n");
    }

    if (entries.length === 0) return 0;

    if (!opts.quiet && !opts.json) {
      emitLearningsSummaryToStderr(entries);
    }

    return 1;
  } catch (err) {
    // exit code 2: operational error
    if (!opts.quiet) {
      process.stderr.write(
        `OpenWolf: cannot check learnings: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return 2;
  }
}

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

**Registration in `index.ts` (after line 188):**
```typescript
learnings
  .command("check")
  .description("Exit non-zero if staged learnings await review (for git hooks / CI)")
  .option("--json", "Emit structured result to stdout")
  .option("--quiet", "Suppress the stderr summary (exit code only)")
  .action(async (opts: { json?: boolean; quiet?: boolean }) => {
    const { learningsCheckCommand } = await import("./learnings-cmd.js");
    process.exitCode = learningsCheckCommand(opts);
  });

learnings
  .command("accept")
  .description("Re-baseline cerebrum.md after a blessed hand-edit (R9)")
  .action(async () => {
    const { learningsAcceptCommand } = await import("./learnings-cmd.js");
    learningsAcceptCommand();
  });
```

### Pattern 4: R9 Freshness Normalization + Hash

**What:** Dep-free utility for normalizing `cerebrum.md` body and computing a SHA-256.

**D12-11 normalization razor (USER-LOCKED order):**
1. Strip `> Last updated:` line: `/^>\s*Last\s+updated\s*:.*$/gim` (removes the whole line, not just the value)
2. Collapse all whitespace: `/\s+/g → ""`
3. Trim

```typescript
// Source: (new module — wolf-pantry.ts or wolf-freshness.ts)
import * as crypto from "node:crypto";

export function normalizeCerebrumBody(content: string): string {
  // D12-11: strip date line, collapse whitespace, trim
  const stripped = content.replace(/^>\s*Last\s+updated\s*:.*$/gim, "");
  return stripped.replace(/\s+/g, "").trim();
}

export function hashCerebrumBody(content: string): string {
  return crypto.createHash("sha256").update(normalizeCerebrumBody(content)).digest("hex");
}
```

**Sidecar schema (`cerebrum-freshness.json`):**
```jsonc
{
  "version": 1,
  "content_sha256": "<sha256 of normalizeCerebrumBody(content)>",
  "last_updated_seen": "2026-06-25",       // value from the "Last updated:" line at baseline time
  "captured_at": "2026-06-25T18:04:11.000Z",
  "captured_by": "learnings-merge" | "status-bootstrap" | "learnings-accept"
}
```

### Pattern 5: R9 Baseline Write (in `learningsMergeCommand`)

**Insertion point:** After `learningsMergeCommand` appends entries (current line ~221, after `archivePath` write).

```typescript
// Source: src/cli/learnings-cmd.ts (addition to learningsMergeCommand)
// After the merge loop and archive write:
if (successEntries.some((e) => e.target === "cerebrum")) {
  // At least one entry was merged into cerebrum.md — update the freshness baseline
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

### Pattern 6: R9 Freshness Check in `status.ts`

**Insertion point:** After Anatomy block (~line 141), before Cron state.

```typescript
// Source: src/cli/status.ts (addition)
// Pending learnings count (R7b pull surface — D12-08)
import { collectAllEntries } from "../hooks/wolf-pantry.js";
const pendingEntries = collectAllEntries();
console.log(`\nCuration:`);
if (pendingEntries.length > 0) {
  console.log(`  - ${pendingEntries.length} learnings awaiting review`);
} else {
  console.log(`  ✓ No pending learnings`);
}

// Freshness integrity check (R9 — D12-14)
import { hashCerebrumBody } from "...freshness-util.js";
const cerebrumPath = path.join(wolfDir, "cerebrum.md");
const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");

const cerebrumContent = readText(cerebrumPath);
const currentHash = hashCerebrumBody(cerebrumContent);
const sidecar = readJSON<FreshnessSidecar | null>(sidecarPath, null);

if (!sidecar) {
  // D12-14 bootstrap: sidecar absent → fresh clone; write baseline, no flag
  const dateMatch = cerebrumContent.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
  const lastSeen = dateMatch ? dateMatch[1].trim() : "—";
  writeJSON(sidecarPath, {
    version: 1,
    content_sha256: currentHash,
    last_updated_seen: lastSeen,
    captured_at: new Date().toISOString(),
    captured_by: "status-bootstrap",
  });
  console.log(`  - cerebrum.md: baseline captured (no prior history)`);
} else if (currentHash === sidecar.content_sha256) {
  // Content unchanged; check if date line moved
  const dateMatch = cerebrumContent.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
  const currentDate = dateMatch ? dateMatch[1].trim() : "—";
  if (currentDate !== sidecar.last_updated_seen) {
    console.log(`  ✗ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`);
  } else {
    console.log(`  ✓ cerebrum.md: current`);
  }
} else {
  // Hash changed → real content update; not flagged
  console.log(`  ✓ cerebrum.md: current`);
}
```

### Anti-Patterns to Avoid

- **Anti-pattern: Hook synthesizing learning content.** D12-01 explicitly forbids the `stop` hook from diffing files and inferring what was learned. The hook appends only a structural stub — semantic content is authored by the model.
- **Anti-pattern: Re-baselining on every `status` read.** D12-14 strictly limits baseline writes. `status` writes the sidecar only once (bootstrap-on-missing). After that, `status` is read-only on the sidecar.
- **Anti-pattern: Adding `collectAllEntries` to `shared.ts` barrel.** D12-10 / D10-09 forbid CLI-only functions in the hook barrel. Import `wolf-pantry.ts` directly from CLI code.
- **Anti-pattern: Naming execution layers in `src/`.** C1 grep gate must return zero. Use generic language ("proposed-learnings", "staging", "curation") not "gsd", "superpowers", or "pre-push".
- **Anti-pattern: Importing `src/utils/` from `wolf-pantry.ts`.** The hook build (`tsconfig.hooks.json`) will fail. `wolf-pantry.ts` must use only `node:` builtins + sibling `wolf-*.ts` modules.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON read-modify-write | Custom file locking | `updateJSON()` (`wolf-json.ts`) | Already reentrant-safe via `withFileLock`; used throughout stop.ts + learnings-cmd.ts |
| SHA-256 content hash | Custom hash or external dep | `node:crypto createHash("sha256")` | Free, stdlib, already in three hook modules |
| Session dir discovery | Custom walk logic | `collectAllEntries()` (moved to `wolf-pantry.ts`) | Already implemented; just relocate |
| CLI option parsing | Manual `process.argv` | Commander `.option()` | Already used; `.command("check").option("--json")` follows existing patterns exactly |
| Worktree-aware root resolution | Custom git-dir detection | `detectWorktreeContext()` / `wolfDir` already computed in `status.ts` | Existing path already handles worktrees; `collectAllEntries` reuses same `wolfDir` |
| File staging grammar parsing | New regex | `parseProposals()` in `wolf-pantry.ts` | Existing parser; move it, don't replace it |

**Key insight:** Phase 12 is a wiring exercise on top of already-correct primitives. The plan's value is sequencing the wiring correctly, not building from scratch.

---

## Runtime State Inventory

Phase 12 is not a rename/refactor/migration phase. No runtime state inventory is required.

---

## Common Pitfalls

### Pitfall 1: Circular Import Between `learnings-cmd.ts` and `wolf-pantry.ts`

**What goes wrong:** If `wolf-pantry.ts` imports `ProposalEntry` from `learnings-cmd.ts` AND `learnings-cmd.ts` imports `collectAllEntries` from `wolf-pantry.ts`, Node.js module loading creates a cycle that resolves to `undefined` exports.

**Why it happens:** Moving `collectAllEntries()` while leaving `ProposalEntry` in `learnings-cmd.ts`.

**How to avoid:** Move `ProposalEntry` and `parseProposals()` into `wolf-pantry.ts` together with `collectAllEntries()`. `learnings-cmd.ts` then re-exports `ProposalEntry` from `wolf-pantry.ts` for backward compat.

**Warning signs:** TypeScript compiler reports circular import warning; `ProposalEntry` resolves as `undefined` at runtime.

### Pitfall 2: Hook Build Break from CLI Import in `wolf-pantry.ts`

**What goes wrong:** `wolf-pantry.ts` accidentally imports from `src/utils/` (e.g., `readText` from `fs-safe.ts`) which is a non-hook module. The hook build (`tsc -p tsconfig.hooks.json`) then fails with `MODULE_NOT_FOUND` at runtime.

**Why it happens:** `readText` from `src/utils/fs-safe.ts` vs. `readMarkdown` from `src/hooks/wolf-files.ts` — both read files, but only the hook version is available in hook context.

**How to avoid:** Use only `node:fs`, `node:path`, and sibling `wolf-*.ts` modules. Check: `tsc --noEmit -p tsconfig.hooks.json` must pass after every change to `src/hooks/`.

**Warning signs:** `tsc --noEmit -p tsconfig.hooks.json` emits error `TS2307: Cannot find module '../../utils/fs-safe.js'`.

### Pitfall 3: Stub Silently Merging into `cerebrum.md`

**What goes wrong:** A stub (`### Staged Session Metadata`) written by the hook gets merged into `cerebrum.md` by `learnings merge`, polluting the cerebrum with structural metadata noise.

**Why it happens:** If `collectAllEntries()` uses presence-based detection (D12-05b recommendation), it emits a synthetic entry. If `merge` doesn't filter stubs, the synthetic entry gets appended.

**How to avoid:** Stubs must never have `→ target` grammar, so `parseProposals()` will skip them as "unparseable" with a stderr warning. `merge` only processes `ProposalEntry[]` from `parseProposals` — stubs (which yield no parsed entries) will produce no merge candidates. Test this: `merge` on a session with only a stub → "No pending proposals found" or "0 proposals selected."

**Warning signs:** `cerebrum.md` contains `### Staged Session Metadata` literal text after a merge run.

### Pitfall 4: `status` Mutating an Existing Sidecar (D12-14 Violation)

**What goes wrong:** `status` re-hashes cerebrum every run and overwrites `cerebrum-freshness.json` with the current hash. This launders freshness theater: as soon as someone runs `status`, the theater is forgiven.

**Why it happens:** Confusing "baseline = last observed" with "baseline = last sanctioned content" (D-20 phrasing).

**How to avoid:** The bootstrap write is gated on `!sidecar` (sidecar absent). If sidecar exists, `status` is strictly read-only. The only path to updating an existing sidecar is via `learnings merge`, `learnings accept`, or the bootstrap trigger.

**Warning signs:** `cerebrum-freshness.json` timestamp updates on every `openwolf status` run without a corresponding merge or accept.

### Pitfall 5: D12-05 Stub Not Tripping the Gate

**What goes wrong:** `appendProposal("cerebrum", stubContent)` writes a stub, but `collectAllEntries()` uses the old parser-only logic (strict `→ target` grammar required). The stub yields no `ProposalEntry[]`, so `collectAllEntries` returns `[]`, and `learnings check` exits 0 incorrectly.

**Why it happens:** D12-05 open design point unresolved — stub grammar doesn't match parser grammar.

**How to avoid:** Implement the presence-based resolution (option b): before calling `parseProposals`, check if `proposed-learnings.md` is non-empty. If non-empty but parser yields zero entries, push a synthetic stub entry. Test pair: (1) stub file → check exits 1; (2) well-formed entry → check exits 1; (3) empty file → check exits 0.

**Warning signs:** `openwolf learnings check` exits 0 even though `.wolf/sessions/<id>/proposed-learnings.md` exists with stub content.

### Pitfall 6: `pnpm build:hooks` Not Followed by `openwolf update`

**What goes wrong:** `stop.ts` changes are compiled to `dist/hooks/stop.js` but `.wolf/hooks/stop.js` (the live file Claude Code executes) is stale. R7a stub capture doesn't fire in actual sessions.

**Why it happens:** The two-step copy is project-specific and not enforced by TypeScript compilation alone. Phase 11 notes this pattern as a persistent gotcha.

**How to avoid:** Every `stop.ts` edit requires `pnpm build:hooks && node dist/bin/openwolf.js update`. Add explicit verification step to each plan that touches `src/hooks/`.

**Warning signs:** `stop.ts` unit tests pass but manual testing shows no stub in session dirs.

---

## Code Examples

### Example 1: SHA-256 Hashing (Existing Pattern)

Already used in `src/hooks/wolf-json.ts:3` and `src/hooks/worktree-helper.ts:82`:

```typescript
// Source: src/hooks/wolf-json.ts:3 (existing usage) [VERIFIED: project source]
import * as crypto from "node:crypto";
// ...
const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";

// R9 pattern (new, same module):
const hash = crypto.createHash("sha256").update(normalizedBody).digest("hex");
```

### Example 2: `withFileLock` for Concurrent-Safe JSON Write (Existing Pattern)

From `src/cli/learnings-cmd.ts:218` [VERIFIED: project source]:
```typescript
await withFileLock(targetPath, () => {
  fs.appendFileSync(targetPath, appendText, "utf-8");
});
```

R9 baseline write follows same pattern:
```typescript
await withFileLock(sidecarPath, () => {
  writeJSON(sidecarPath, freshnessSidecar);
});
```

### Example 3: Commander Subcommand With Exit-Code Control (Existing Pattern)

From `src/cli/index.ts:175–180` [VERIFIED: project source]:
```typescript
learnings
  .command("list")
  .description("List pending proposal entries across all sessions")
  .option("--session <id>", "Filter by session ID")
  .action(async (opts: { session?: string }) => {
    const { learningsCommand } = await import("./learnings-cmd.js");
    learningsCommand(opts.session);
  });
```

R7b `check` follows same pattern with `process.exitCode` set:
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
```

### Example 4: Presence-Based Session Detection (D12-05 Resolution)

```typescript
// D12-05b: count any non-empty proposed-learnings.md as pending
// regardless of whether parseProposals() yields entries
const proposalPath = path.join(sessionDir, "proposed-learnings.md");
if (!fs.existsSync(proposalPath)) continue;
const rawContent = fs.readFileSync(proposalPath, "utf-8").trim();
if (!rawContent) continue; // empty file — not pending
// ... proceed to parse (or push synthetic stub entry if parse yields nothing)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| STATUS.md as session summary + planning state | Framework-blind resume protocol; OpenWolf owns none of it | Phase 11 (v1.2) | `stop.ts` no longer has STATUS freshness check; `checkStatusFreshness` removed |
| Proposed-learnings never created (acme field data) | R7a: `stop` hook guarantees a breadcrumb exists | Phase 12 (this phase) | Staging becomes a structural default rather than an opt-in |
| No promotion gate | `openwolf learnings check` exit-code primitive | Phase 12 (this phase) | Teams can wire to pre-push / CI; no execution-layer coupling |
| No freshness integrity for cerebrum | SHA-256 body hash baseline | Phase 12 (this phase) | Date-only bumps detected as theater |
| `collectAllEntries()` private to learnings-cmd | Public in `wolf-pantry.ts` | Phase 12 (this phase) | Both status + learnings check share one counting source |

**Deprecated/outdated:**
- The old `checkStatusFreshness()` function (removed in Phase 11) — `R7a` is its structural successor without the STATUS coupling
- `STATUS.md` template in `src/templates/` — still present per anatomy.md but was removed from `openwolf init` seeding in Phase 11; may be cleaned in a future phase

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | **D12-05 stub-vs-parser resolution:** Presence-based counting (option b) is recommended. A non-empty `proposed-learnings.md` whose content fails `parseProposals()` is synthesized as a pending entry. | Standard Stack > Alternatives; Pattern 2 | If planner chooses (a) extended grammar or (c) distinct file, the `wolf-pantry.ts` implementation changes. Low impact — three options are well-scoped. |
| A2 | R9 hash utility lives in `wolf-pantry.ts` alongside `collectAllEntries` (co-location keeps dep-free guarantee) | Pattern 4 | If planner prefers `wolf-freshness.ts`, files split but logic is identical |
| A3 | Status Curation section uses `✓ No pending learnings` / `- N learnings awaiting review` markers (plain text, no ANSI) | Pattern 6 | If exact wording differs, tests need updating — no functional risk |
| A4 | `learnings accept` is a distinct subcommand (not a `--accept` flag on `merge`) | Pattern 3 | Consistent with `learnings check` as a subcommand (D12-06 pattern) |

**If this table is complete:** All other claims are grounded in `src/` file:line readings or USER-LOCKED decisions.

---

## Open Questions

1. **D12-05 mechanism (Claude's Discretion)**
   - What we know: the stub-written-by-hook has no `→ target` arrow grammar; current `parseProposals()` will skip it as unparseable
   - What's unclear: which of the three approaches does the planner choose?
   - Recommendation: presence-based (option b) — least invasive; stubs are naturally "unfoldable by merge" since they lack valid grammar

2. **R9 hash module co-location**
   - What we know: must be dep-free; `node:crypto` is safe in hooks
   - What's unclear: separate `wolf-freshness.ts` or fold into `wolf-pantry.ts`?
   - Recommendation: fold into `wolf-pantry.ts` to keep the `wolf-*.ts` count minimal

3. **`status` freshness flag marker**
   - What we know: D11-07 rule is "no ANSI, plain text, `✓/✗/—` markers"
   - What's unclear: should theater use `✗` (hard error) or `⚠` (warning)?
   - Recommendation: `✗` to match the "hard missing file" pattern; the flag is actionable and users should act on it

---

## Environment Availability

Phase 12 is purely TypeScript code and test changes. No external services, CLIs, or runtimes beyond the project's normal build toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + runtime | ✓ | ≥20.0.0 (per package.json engines) | — |
| pnpm | Build commands | ✓ | Available in project | — |
| TypeScript | `tsc` compile + type-check | ✓ | 5.7+ (devDep) | — |
| Vitest | Test suite | ✓ | 4.1.5 (devDep) | — |
| `node:crypto` | R9 SHA-256 | ✓ | stdlib — always present | — |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v4.1.5 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/hooks/wolf-pantry.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R7a | Stop hook stages stub when code written, no learning | unit | `npx vitest run tests/hooks/stop.test.ts` | ✅ (extend) |
| R7a | Stub not staged when model already wrote proposals | unit | `npx vitest run tests/hooks/stop.test.ts` | ✅ (extend) |
| R7a | Stub idempotent across multiple `stop_count` increments | unit | `npx vitest run tests/hooks/stop.test.ts` | ✅ (extend) |
| R7b | `learnings check` exits 0 when no sessions | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| R7b | `learnings check` exits 1 when pending entries | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| R7b | `learnings check` exits 2 on unreadable sessions dir | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| R7b | `learnings check --json` emits valid JSON to stdout | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| R7b | `learnings check --quiet` suppresses stderr; exit code unchanged | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| R7b | Stub (no `→ target` grammar) still trips `learnings check` exit 1 | unit | `npx vitest run tests/hooks/wolf-pantry.test.ts` | ❌ Wave 0 |
| R7b | `status` shows pending count from same `collectAllEntries()` | unit | `npx vitest run tests/cli/status.test.ts` | ✅ (extend) |
| R9 | `learnings merge` writes freshness sidecar after successful cerebrum append | unit | `npx vitest run tests/cli/learnings.test.ts` | ✅ (extend) |
| R9 | Date-only bump on unchanged body → `status` flags theater | unit | `npx vitest run tests/cli/status.test.ts` | ✅ (extend) |
| R9 | Content change → `status` does not flag | unit | `npx vitest run tests/cli/status.test.ts` | ✅ (extend) |
| R9 | Missing sidecar (fresh clone) → bootstrap silently, no flag | unit | `npx vitest run tests/cli/status.test.ts` | ✅ (extend) |
| R9 | `learnings accept` re-baselines sidecar | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ Wave 0 |
| C1 | `grep` returns zero in src/ for banned terms | verification | `grep -rIiE 'bitbucket|github|gsd|superpowers' src/` | n/a — CLI gate |
| C2 | `tsc --noEmit -p tsconfig.hooks.json` clean | verification | `tsc --noEmit -p tsconfig.hooks.json` | n/a — build gate |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/hooks/stop.test.ts tests/cli/learnings-check.test.ts tests/hooks/wolf-pantry.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`; plus `tsc --noEmit` + `tsc --noEmit -p tsconfig.hooks.json`; plus grep gates C1/C2

### Wave 0 Gaps (New Test Files Required Before Implementation)

- [ ] `tests/cli/learnings-check.test.ts` — covers exit-code matrix (R7b): clean, pending, error, `--json`, `--quiet`, stub detection
- [ ] `tests/hooks/wolf-pantry.test.ts` — covers `collectAllEntries`: empty sessions, parsed entries, stub presence-based detection, error tolerance
- [ ] `tests/cli/learnings-accept.test.ts` — covers R9 re-baseline: writes sidecar, correct hash, `captured_by: "learnings-accept"`

---

## Security Domain

R9 reads and hashes `cerebrum.md` content. ASVS V5 (input validation) applies only trivially — the content is from a local filesystem file owned by the project, not from user-supplied network input. No authentication, session management, or cryptography beyond stdlib SHA-256 for content comparison.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | minimal | `fs.existsSync` guards; graceful ENOENT handling |
| V6 Cryptography | no | `node:crypto` SHA-256 used for integrity comparison (not security) |

No new threat patterns introduced. The sidecar is gitignored and local-only; it cannot be used as an injection vector.

---

## Project Constraints (from CLAUDE.md)

| Directive | Enforcement |
|-----------|-------------|
| Hooks cannot import `src/utils/` at runtime (`shared.ts` is the self-contained copy) | `wolf-pantry.ts` must use only `node:` + sibling `wolf-*.ts`; `tsc -p tsconfig.hooks.json` is the gate |
| `build:hooks` → `openwolf update` copy discipline | Every plan touching `src/hooks/` must include this step |
| `withFileLock` not reentrant; use `updateJSON` for read-modify-write | R9 sidecar writes use `withFileLock` + `writeJSON` (not nested `withFileLock` + `readJSON`) |
| Buglog is append-only NDJSON | Not affected by this phase |
| Version-bump policy: format change or new API ≥ minor | Phase 12 introduces new CLI subcommands + new module API; changelog entry required |
| 4-space indent | Follow existing codebase pattern (which uses 2-space) — codebase convention takes precedence |
| Spaces over tabs, 80-char line length | Already the project convention |
| No tabs in TypeScript | Enforced by existing project style |

---

## Sources

### Primary (HIGH confidence — verified against project source)

- `src/cli/learnings-cmd.ts` — `collectAllEntries()` :92, `parseProposals()` :18, `learningsMergeCommand` :150 [VERIFIED: project source]
- `src/hooks/stop.ts` — `finalizeSession()` :52, `checkCerebrumFreshness()` :228, `checkForMissingBugLogs()` :203, `SessionData` :18, code-writes filter :234–239 [VERIFIED: project source]
- `src/hooks/wolf-files.ts` — `appendProposal()` :89, `readMarkdown()` :68 [VERIFIED: project source]
- `src/hooks/shared.ts` — barrel exports :14–37 [VERIFIED: project source]
- `src/cli/status.ts` — status structure :8–156, worktree resolution :10–13 [VERIFIED: project source]
- `src/cli/index.ts` — learnings group :169–188, lazy-import pattern [VERIFIED: project source]
- `src/hooks/wolf-ignore.ts` — dep-free hook module precedent (D10-02 template for `wolf-pantry.ts`) [VERIFIED: project source]
- `src/hooks/wolf-json.ts` — `node:crypto` usage :3, `updateJSON` :98 [VERIFIED: project source]
- `src/templates/wolf-gitignore` — reserved `cerebrum-freshness.json` line (Phase 9) [VERIFIED: project source]
- `.planning/phases/12-framework-blind-curation-machinery/12-CONTEXT.md` — D12-01 through D12-16 [VERIFIED: project source]
- `.planning/research/R7b-GATE.md` — exit-code contract, ESLint/pytest/Ruff precedents [VERIFIED: project source]
- `.planning/research/R9-FRESHNESS.md` — normalization approach, sidecar schema, bootstrap rule [VERIFIED: project source]

### Secondary (MEDIUM confidence)

- ESLint CLI exit codes 0/1/2 pattern [CITED: eslint.org/docs/latest/use/command-line-interface] — primary precedent for the trichotomy
- Ruff `--quiet` + `--output-format json` pattern [CITED: docs.astral.sh/ruff/linter/]
- pytest exit-code model (clean vs. internal error) [CITED: docs.pytest.org/en/stable/reference/exit-codes.html]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all work uses existing project deps + Node.js stdlib
- Architecture (wolf-pantry, D12-05 resolution, D12-11 normalization): HIGH — grounded in file:line + USER-LOCKED decisions
- Pitfalls: HIGH — all pitfalls derived from actual bugs/decisions in CONTEXT.md and prior phase research
- Test architecture: HIGH — mirrors existing test patterns in `tests/hooks/stop.test.ts` and `tests/cli/learnings.test.ts`

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (30 days — stable internal TypeScript codebase)
