# Phase 12: Framework-Blind Curation Machinery — Research

**Researched:** 2026-06-25
**Domain:** Shared-context curation discipline (learning capture, promotion gate, freshness integrity)
**Confidence:** HIGH
**Status:** Ready for planning

---

## Problem Statement

OpenWolf's three-mechanism curation discipline ensures committed shared context (`cerebrum.md`, `anatomy.md`) stays owned and current:

1. **R7a — Continuous capture** via Claude Code `stop` hook: guarantee learning stubs exist even when the model doesn't author formal `proposed-learnings.md`
2. **R7b — Promotion gate** via `openwolf learnings check`: exit-code primitive for gating un-curated staging at the Git push/PR boundary (framework/host-blind)
3. **R9 — Freshness integrity** via SHA-256 hash baseline: detect "Last updated" date bumps with no content delta (freshness theater), flag in `openwolf status`

**Why it matters:** Acme field data (3 devs, 225 sessions) showed staging was *never* created and STATUS.md was abandoned with date-only bumps. The curation discipline closes both gaps structurally (R7a hooks it), operationally (R7b gates it), and detects theater (R9 hashes it).

---

## Architecture Analysis

### Current State: Learnings & Status Infrastructure

**Existing `parseProposals()` + `collectAllEntries()` flow:**
- `.wolf/sessions/<sessionId>/proposed-learnings.md` is the staging format (grammar: `## ISO → {cerebrum|anatomy}\n\ncontent`)
- `parseProposals(sessionDir, sessionId)` parses one session's file into `ProposalEntry[]` (timestamp, target, content, raw)
- `collectAllEntries()` walks all `sessions/*/` dirs, aggregates parsed entries
- `learningsCommand()` lists entries; `learningsMergeCommand()` merges selected entries to `cerebrum.md` / `anatomy.md`
- **Key fact:** `collectAllEntries()` is today **private in `learnings-cmd.ts:92`** and **not reused** — `status.ts` has no pending-count line

**Existing `stop.ts` hook structure:**
- `finalizeSession()` (:52–163) is the hook's main work function, called on every session end
- **Surviving checks** (Phase 11 left intact):
  - `checkForMissingBugLogs()` (:206–225) — files edited 3+ times without buglog entry → stderr nudge
  - `checkCerebrumFreshness()` (:269–291) — mtime-based "cerebrum.md hasn't been updated in 24h" nudge
- **Removed** (Phase 11): `checkStatusFreshness()` (lines 232–263) — the `STATUS.md` update nudge
- **Session data structure** (`SessionData:18–29`): tracks `files_written`, `files_read`, `stop_count` (idempotency guard)
- **Code writes filter** (:234–239): `codeWrites = files_written.filter(w => !w.includes(".wolf/") && !w.endsWith(".tmp"))`

**Existing `status.ts` implementation:**
- Resolves `wolfDir` via `detectWorktreeContext()` (worktree-aware)
- Reports: Mode (main/worktree), file integrity (✓/✗/—), hook scripts, token stats, anatomy count, daemon heartbeat
- **No pending-learnings line** (this phase adds it)
- **No freshness check** (R9 adds it)
- Color-free, plain `console.log`, three markers (`✓/✗/—`), no ANSI banner (D11-07 rule)

**Hook build system:**
- `tsconfig.hooks.json` compiles `src/hooks/*.ts` → `dist/hooks/`
- Hooks are **dep-free** (node: builtins only)
- After edit, `pnpm build:hooks` → `openwolf update` copies to `.wolf/hooks/` (live in project)
- `shared.ts` is a thin barrel re-exporting hook-public functions (`appendProposal`, `readJSON`, etc.)

**CLI registration (index.ts:169–188):**
- `learnings` command group (two leaves: `list`, `merge`)
- Uses lazy-import pattern: `await import("./learnings-cmd.js")`
- Calls `process.exitCode = value` to set exit code
- R7b adds `check` and `accept` as new leaves with exit-code contract

### Where R7a, R7b, R9 Touch the Codebase

| Requirement | Module | Action | Reason |
|---|---|---|---|
| **R7a (capture)** | `src/hooks/stop.ts:finalizeSession()` | Add `appendProposal()` call (idempotent stub) | Must trigger on code writes with no staged learning |
| **R7b (gate)** | `src/cli/learnings-cmd.ts` | Export new `learningsCheckCommand(opts)` → 0/1/2; relocate `collectAllEntries()` | New CLI surface; shared counting logic |
| **R7b (gate)** | `src/cli/index.ts:169–188` | Register `learnings check` + `learnings accept` leaves | CLI registration for exit-code contract |
| **R7b (pull)** | `src/cli/status.ts` | Import `collectAllEntries()`, add pending-count line | Pull-side surface; same count source |
| **R9 (hash)** | `src/cli/learnings-cmd.ts:150` | After merge append, compute + write freshness sidecar | Baseline capture on content write |
| **R9 (detect)** | `src/cli/status.ts` | Compare body hash to sidecar; bootstrap if missing; flag if theater | Integrity check in read-only context |
| **R9 (util)** | `src/cli/` (TBD location) | Helper module for normalize/hash (dep-free) | Shared between learnings-cmd and status |
| **R9 (template)** | `src/templates/wolf-gitignore` | Ensure `.cerebrum-freshness.json` gitignored | Preserve runtime-state integrity |
| **R7a (idempotency)** | `src/hooks/stop.ts` | Guard on `stop_count`; skip stub if already staged this session | D12-03: prevent duplicate stubs |

---

## Standard Stack & Implementation Patterns

### Established Conventions (to match)

**Hook-side patterns:**
- Use `shared.ts` barrel for all hook imports (e.g., `appendProposal`, `readJSON`, `updateJSON`)
- Dep-free: `node:fs`, `node:path`, `node:crypto` (builtin) only
- Error handling: swallow silently on expected issues (file not found), emit to `process.stderr.write()` on unexpected
- Idempotency guards: check for existence/state before writing (e.g., `fs.existsSync(sessionDir)`)
- Re-export via `shared.ts` barrel ONLY functions a hook actually imports; keep CLI-only surface private

**CLI-side patterns:**
- Lazy imports with `await import("./module.js")` in action handlers (avoid circular cycles, lazy-load heavy deps)
- Return exit code or set `process.exitCode` before process.exit()
- `--flag` style for boolean options; `--option <value>` for args
- Existing precedent: `bug search <term>` (read-only search), `scan --check` (verification mode)
- Output: `console.log()` for normal, `process.stderr.write()` for diagnostics/errors
- Parse errors: tolerate gracefully with stderr warning; return empty/0 on "no data found"

**Status output format (D11-07):**
- Plain text, no ANSI color codes
- Three markers: `✓` (pass), `✗` (fail), `—` (informational / not yet created)
- Key-value simple: `  Key: value` (2-space indent)
- No banner/boxes, no emojis
- Example: `  ✓ All 7 shared knowledge files present` / `  - Not yet created: .wolf/memory.md (per-developer session log)`

**JSON utils (already in codebase):**
- `readJSON<T>(path, defaults)` → reads with fallback to defaults
- `writeJSON(path, data)` → atomic write
- `updateJSON<T>(path, defaults, transform)` → read-modify-write under lock
- All in `src/utils/fs-safe.js` or re-exported via hook `shared.ts`
- Concurrency: use `withFileLock(path, callback)` for multi-session safety

**Hashing (node:crypto, free in hooks):**
- `crypto.createHash("sha256")` already used in `post-write.ts:3`, `wolf-json.ts:3`, `worktree-helper.ts:82`
- Pattern: `.createHash("sha256").update(body).digest("hex")`

### Exit Code Contract (R7b)

| Code | Meaning | Streams |
|---|---|---|
| **0** | No pending staged learnings | stdout: empty (or `{pending:0,...}` under `--json`) / stderr: empty |
| **1** | Pending staged learnings exist | stdout: empty (or JSON under `--json`) / stderr: summary (unless `--quiet`) |
| **2** | Operational error (cannot read `.wolf/sessions/`, not OpenWolf project) | stdout: empty (or `{error:...}` under `--json`) / stderr: error line (always) |

**Flags:**
- `--json` → emit structured result to stdout, suppress stderr human summary
- `--quiet` → suppress stderr summary (exit code only; operational errors still print)
- Both can be passed independently; if both, `--json` owns stdout and stderr stays empty

**stderr summary format (human, on pending):**
- One headline: `⚠ N learnings awaiting review across M sessions:`
- Bounded list of sessions (cap ≈5): `  • <sessionId> (K pending)`
- Single pointer: `  Run 'openwolf learnings merge' to review and promote.`
- **No markdown bodies, no code blocks** (just teasers with slug+date truncation)

**stdout JSON format (machine, under `--json`):**
```json
{
  "pending": 3,
  "entries": [
    { "sessionId": "abc123", "timestamp": "2026-06-25T...", "target": "cerebrum", "content": "..." },
    ...
  ]
}
```

### R9 Freshness Hashing

**Normalization (D12-11), in order:**
1. Strip the entire line matching `/^\s*>?\s*Last updated:.*$/m` (blockquote format)
2. Normalize line endings: `\r\n` → `\n`
3. Strip trailing whitespace per line: `/[ \t]+$/`
4. Trim trailing blank-line run to single `\n`
5. `sha256` the result

**Result:**
- Date-only change → same hash → **flagged** (freshness theater detected)
- Any section change (Preferences, Learnings, Do-Not-Repeat, Decision Log) → different hash → **not flagged**
- Whitespace-only → same hash → not flagged

**Sidecar schema (`cerebrum-freshness.json`, gitignored):**
```json
{
  "version": 1,
  "content_sha256": "<hash of normalized body, date line excluded>",
  "last_updated_seen": "2026-06-25",
  "captured_at": "2026-06-25T18:04:11.000Z",
  "captured_by": "learnings-merge" | "status-bootstrap" | "learnings-accept"
}
```

**Baseline write discipline (D12-13, D12-14):**
1. **`learnings merge`** — sole content writer; re-baseline after append (learnings-cmd.ts:150)
2. **`learnings accept`** — new explicit affordance for hand-edits to cerebrum.md
3. **Bootstrap-on-missing** — if `.wolf/cerebrum-freshness.json` absent, `status` computes baseline silently, no flag

**Bootstrap rationale:** fresh clone gets `cerebrum.md` (committed) but no sidecar (gitignored). Status self-heals by writing the baseline. Only theater introduced *after* the local baseline is captured gets flagged.

---

## Implementation Patterns & Gotchas

### Pattern 1: Hook-side `appendProposal()` (R7a capture)

**Status:** Already exists in `src/hooks/wolf-files.ts:89–96`, re-exported via `shared.ts:16`.

```typescript
export function appendProposal(target: "cerebrum" | "anatomy", content: string): void {
  const sessionDir = getSessionDir();
  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  const dir = path.dirname(proposalPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const entry = `\n## ${new Date().toISOString()} → ${target}\n\n${content.trim()}\n`;
  fs.appendFileSync(proposalPath, entry, "utf-8");
}
```

**R7a's job:** Call this in `stop.ts:finalizeSession()` as a **fallback** when:
- Session had **code writes** (≥1 file outside `.wolf/` and `.tmp`)
- Model wrote **no** `proposed-learnings.md` (file absent or empty in session dir)

**Stub content:** A bare marker, e.g. `### Staged Session Metadata\n\nSession ended with code changes but no explicit learning recorded. Review and add context if relevant.`

**Idempotency (D12-03):** Must not append the same stub twice. Guard: check if stub already exists in the session's `proposed-learnings.md` (e.g., grep for a marker string or check `stop_count` against the count of stubs).

### Pattern 2: Shared `collectAllEntries()` Relocation (R7b / R7 pull)

**Current state:** Private in `learnings-cmd.ts:92–117`. Walks `.wolf/sessions/*/` and aggregates `ProposalEntry[]`.

**R7b requirement:** Make it **public** and relocate to a new shared module `src/hooks/wolf-pantry.ts` so both `learnings-cmd.ts` (R7b gate) and `status.ts` (R7 pull) import it.

**Why `wolf-pantry.ts`?**
- Lives in `src/hooks/` → compiled into hook build (`tsconfig.hooks.json`)
- Must be dep-free (C2) ← already is, only uses `node:fs`, `node:path`, `getWolfDir()`, `parseProposals()`
- Matches `wolf-*.ts` naming convention (D12-09)
- Re-export from `shared.ts` only if a *hook* consumes it; `collectAllEntries` is CLI-only, so don't add to barrel

**Export from `wolf-pantry.ts`:**
```typescript
export function collectAllEntries(): ProposalEntry[] {
  // ... (same logic as current learnings-cmd.ts:92–117)
}
```

**Import in `learnings-cmd.ts` + `status.ts`:**
```typescript
import { collectAllEntries } from "../hooks/wolf-pantry.js";
```

**Why not add to `shared.ts` barrel?**
- D10-09 precedent: keep CLI-only functions out of the barrel to avoid polluting hook surface
- `collectAllEntries()` is not called by any hook; it's a CLI analysis function
- The barrel is for hook-needed utilities; this is CLI plumbing

### Pattern 3: R9 Hash Utility Module

**Decision:** Create a dep-free hash helper, location TBD (either in `wolf-pantry.ts` or a sibling `wolf-freshness.ts`).

**Functions needed:**
```typescript
export function stripDateLine(content: string): string {
  // Remove line matching /^\s*>?\s*Last updated:.*$/m
  return content.replace(/^\s*>?\s*Last updated:.*$/m, "");
}

export function normalizeContent(content: string): string {
  // 1. Strip date line
  let normalized = stripDateLine(content);
  // 2. Normalize line endings: \r\n → \n
  normalized = normalized.replace(/\r\n/g, "\n");
  // 3. Strip trailing whitespace per line: /[ \t]+$/
  normalized = normalized.replace(/[ \t]+$/gm, "");
  // 4. Trim trailing blank lines to single \n
  normalized = normalized.replace(/\n\n+$/, "\n");
  return normalized;
}

export function hashBody(content: string): string {
  const normalized = normalizeContent(content);
  return require("node:crypto").createHash("sha256").update(normalized).digest("hex");
}
```

**Import pattern:**
- `learnings-cmd.ts`: import `{ hashBody }` to compute baseline after merge
- `status.ts`: import `{ hashBody }` to compare against sidecar

### Pattern 4: R7b `learningsCheckCommand()` in CLI

**New function in `src/cli/learnings-cmd.ts`:**
```typescript
export function learningsCheckCommand(opts: { json?: boolean; quiet?: boolean }): 0 | 1 | 2 {
  try {
    const entries = collectAllEntries();

    if (opts.json) {
      const result = { pending: entries.length, entries: entries.map(e => ({
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        target: e.target,
        content: e.content
      })) };
      process.stdout.write(JSON.stringify(result) + "\n");
    }

    if (entries.length === 0) return 0;

    if (!opts.quiet && !opts.json) {
      emitSummaryToStderr(entries);
    }

    return 1;
  } catch (err) {
    if (!opts.quiet) {
      process.stderr.write(`OpenWolf: cannot check learnings: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    return 2;
  }
}

function emitSummaryToStderr(entries: ProposalEntry[]): void {
  // Group by session
  const bySession = new Map<string, ProposalEntry[]>();
  for (const e of entries) {
    const list = bySession.get(e.sessionId) || [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  const sessionList = [...bySession.entries()].slice(0, 5);
  process.stderr.write(`⚠ ${entries.length} learnings awaiting review across ${bySession.size} sessions:\n`);
  for (const [sessionId, sessionEntries] of sessionList) {
    process.stderr.write(`  • ${sessionId} (${sessionEntries.length})\n`);
  }
  if (bySession.size > 5) {
    process.stderr.write(`  … + ${bySession.size - 5} more sessions\n`);
  }
  process.stderr.write(`Run 'openwolf learnings merge' to review and promote.\n`);
}
```

### Pattern 5: R7b `learnings accept` Subcommand (R9 re-baseline)

**Purpose:** After a developer hand-edits `cerebrum.md`, re-baseline the freshness sidecar so a real change isn't flagged as theater.

**New function in `learnings-cmd.ts`:**
```typescript
export function learningsAcceptCommand(): void {
  const wolfDir = getWolfDir();
  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  const freshnessSidecarPath = path.join(wolfDir, "cerebrum-freshness.json");

  try {
    const content = readText(cerebrumPath);
    const hash = hashBody(content);
    const now = new Date();
    const dateValue = now.toISOString().split("T")[0]; // YYYY-MM-DD

    withFileLock(freshnessSidecarPath, () => {
      writeJSON(freshnessSidecarPath, {
        version: 1,
        content_sha256: hash,
        last_updated_seen: dateValue,
        captured_at: now.toISOString(),
        captured_by: "learnings-accept",
      });
    });

    console.log(`✓ cerebrum.md baseline updated. Next status check will compare against this version.`);
  } catch (err) {
    process.stderr.write(`OpenWolf: failed to accept cerebrum.md edits: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  }
}
```

**Register in `index.ts`:**
```typescript
learnings
  .command("accept")
  .description("Re-baseline cerebrum.md after manual edits")
  .action(async () => {
    const { learningsAcceptCommand } = await import("./learnings-cmd.js");
    learningsAcceptCommand();
  });
```

### Pattern 6: R9 Freshness Check in `status.ts`

**Location:** After the Anatomy block (~line 131), before cron state.

```typescript
// Freshness integrity check
const cerebrumPath = path.join(wolfDir, "cerebrum.md");
const freshnessSidecarPath = path.join(wolfDir, "cerebrum-freshness.json");

try {
  const cerebrumContent = readText(cerebrumPath);
  const currentHash = hashBody(cerebrumContent);
  const sidecar = readJSON<any>(freshnessSidecarPath, null);

  if (!sidecar) {
    // Bootstrap: fresh clone, no sidecar yet
    withFileLock(freshnessSidecarPath, () => {
      const now = new Date();
      writeJSON(freshnessSidecarPath, {
        version: 1,
        content_sha256: currentHash,
        last_updated_seen: now.toISOString().split("T")[0],
        captured_at: now.toISOString(),
        captured_by: "status-bootstrap",
      });
    });
    console.log(`  - cerebrum.md: baseline captured (no prior history)`);
  } else if (sidecar.content_sha256 === currentHash) {
    // Content unchanged; check if date line changed
    const dateMatch = cerebrumContent.match(/Last updated:\s*(.+)/);
    const currentDate = dateMatch ? dateMatch[1].trim() : "—";
    if (currentDate !== sidecar.last_updated_seen) {
      console.log(`  ⚠ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`);
    } else {
      console.log(`  ✓ cerebrum.md: current`);
    }
  } else {
    // Content changed; not flagged
    console.log(`  ✓ cerebrum.md: current`);
  }
} catch (err) {
  process.stderr.write(`OpenWolf: cannot check cerebrum freshness: ${err instanceof Error ? err.message : String(err)}\n`);
}
```

### Pattern 7: R7 Pull-Side Line in `status.ts`

**Location:** After Anatomy block, before Freshness/Cron (or integrated into a "Curation" section).

```typescript
// Pending learnings count
const pendingEntries = collectAllEntries();
if (pendingEntries.length > 0) {
  console.log(`\nCuration:`);
  console.log(`  - ${pendingEntries.length} learnings awaiting review`);
} else {
  console.log(`\nCuration:`);
  console.log(`  ✓ No pending learnings`);
}
```

### Pattern 8: R7a Stub in `stop.ts:finalizeSession()`

**Location:** After the existing `checkCerebrumFreshness()` call (:70), before ledger building (:75).

```typescript
// R7a: Ensure a learning breadcrumb exists if model wrote code without explicit learning
captureStubIfNeeded(wolfDir, sessionDir, session);
```

**Implementation:**
```typescript
function captureStubIfNeeded(wolfDir: string, sessionDir: string, session: SessionData): void {
  // Trigger only if:
  // (a) There were code writes (non-.wolf/, non-.tmp files)
  // (b) Model wrote no proposed-learnings.md (or it's empty)

  const codeWrites = session.files_written.filter(
    (w) =>
      !w.file.includes(`${path.sep}.wolf${path.sep}`) &&
      !w.file.includes("/.wolf/") &&
      !w.file.endsWith(".tmp")
  );

  if (codeWrites.length === 0) return; // No code activity; nothing to do

  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  const existingProposal = readMarkdown(proposalPath); // uses the existing helper

  // Check if model already wrote entries this session
  if (existingProposal && existingProposal.trim().length > 0) {
    return; // Model wrote something; hook does nothing (D12-01, D12-02)
  }

  // Guard: has the hook already appended a stub this session?
  // Use stop_count as a proxy: if stop_count > 1 and proposal already mentions
  // the stub marker, skip to avoid duplicates (D12-03)
  if (session.stop_count > 1) {
    const stubMarker = "### Staged Session Metadata";
    if (existingProposal && existingProposal.includes(stubMarker)) {
      return;
    }
  }

  // Append the stub (reuses appendProposal, which is hook-available)
  try {
    appendProposal("cerebrum", "### Staged Session Metadata\n\nSession ended with code changes but no explicit learning recorded. Review cerebrum.md / Key Learnings and add context if this session revealed new conventions or gotchas.");
  } catch (err) {
    // Swallow silently; a failed stub append is not fatal
    process.stderr.write(`OpenWolf: could not stage learning breadcrumb: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
```

**Key facts:**
- Reuses existing `appendProposal()` from `shared.ts` (D12-04 — no new hook import)
- Guards on `codeWrites` (same filter as `checkStatusFreshness` :234–239)
- Idempotent via `stop_count` + stub marker check
- Swallows errors gracefully (stop hook must not crash)

---

## Risk Assessment & Gotchas

### Gotcha 1: Hook/CLI Circular Import Cycle

**Risk:** If `wolf-pantry.ts` calls `parseProposals()` from `learnings-cmd.ts`, and `learnings-cmd.ts` imports from `wolf-pantry.ts`, you have a cycle.

**Mitigation:** `parseProposals()` is in `learnings-cmd.ts` (CLI layer). Relocate it to `wolf-pantry.ts` or keep both there. `collectAllEntries()` calls `parseProposals()` — if both are in `wolf-pantry.ts`, no cycle. If they remain split, ensure directionality: `learnings-cmd.ts` → `wolf-pantry.ts` (one-way).

**Best approach:** Move `parseProposals()` and `collectAllEntries()` together to `wolf-pantry.ts`. Import `ProposalEntry` type from `learnings-cmd.ts` or export it from `wolf-pantry.ts`.

### Gotcha 2: Hook Isolation (Dependency-Free)

**Risk:** `wolf-pantry.ts` in `src/hooks/` must not import from `src/utils/` at runtime. Only `node:` builtins + peer wolf-* modules.

**Mitigation:** 
- `collectAllEntries()` uses `getWolfDir()` (from `shared.ts` ✓) + `fs` (builtin ✓) + `parseProposals()` (same module ✓)
- No external deps introduced
- **Check:** `tsc --noEmit -p tsconfig.hooks.json` must stay clean after changes

### Gotcha 3: Stub-vs-Parser Grammar Reconciliation (D12-05)

**Risk:** If the stub content (`### Staged Session Metadata`) doesn't match the `parseProposals()` grammar (which expects `## ISO → target`), the stub will be skipped as unparseable, defeating the gate.

**Design space (Claude's Discretion):**
1. **(a) Recognized metadata block grammar** — extend `parseProposals()` to recognize a `### Staged Session Metadata` block (not requiring the `→ target` arrow) and count it as pending
2. **(b) Presence-based counting** — have `collectAllEntries()` and `learningsCheckCommand` check if `proposed-learnings.md` exists *and is non-empty*, even if unparseable
3. **(c) Distinct stub filename** — write stubs to a separate `_staged-stub.md` that the gate counts

**Recommended approach:** (b) — presence-based. Rationale: simplest, doesn't extend parser, any content (even junk) in `proposed-learnings.md` is pending. `parseProposals()` parses valid entries; if there's unparseable content, that's still pending work.

**Implementation sketch:**
```typescript
export function hasUncuratedProposals(sessionDir: string): boolean {
  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  if (!fs.existsSync(proposalPath)) return false;
  const content = readMarkdown(proposalPath);
  return content.trim().length > 0;
}

// In collectAllEntries():
const allEntries: ProposalEntry[] = [];
for (const dirent of dirs) {
  const sessionDir = path.join(sessionsDir, dirent.name);
  if (hasUncuratedProposals(sessionDir)) {
    // This session has *something* — parse it and include whatever is valid
    const parsed = parseProposals(sessionDir, dirent.name);
    allEntries.push(...parsed);
  }
}
return allEntries;
```

This way, a stub file (any content) will be counted as pending, but the merge command will skip unparseable blocks with a warning (current behavior).

### Gotcha 4: Worktree Session Aggregation

**Risk:** In a worktree, sessions live at `.wolf/sessions/<worktreeId>/`. The `status` command must aggregate across worktrees (main repo) while respecting worktree isolation where needed.

**Mitigation:**
- `status.ts:detectWorktreeContext()` already resolves `wolfDir` to the **main repo's** `.wolf/` root (lines 10–13)
- `collectAllEntries()` walks `wolfDir/sessions/*/` from the main repo, so it naturally aggregates across all worktrees
- **Verification:** Run `openwolf status` from a worktree; should show aggregated pending count, not just the current worktree's

### Gotcha 5: Bootstrap Race on Fresh Clone

**Risk:** Multiple developers clone the repo in parallel, both try to bootstrap `cerebrum-freshness.json` at the same time.

**Mitigation:**
- Use `withFileLock(sidecarPath, () => writeJSON(...))` for atomic writes (already used in `learningsMergeCommand` :218)
- `withFileLock` is **not reentrant** (per CLAUDE.md), but a single `status` command is single-threaded, so no issue
- If two `status` runs overlap, the lock serializes them; the second will read the freshly-written sidecar

### Gotcha 6: Date Line Format in `cerebrum.md`

**Risk:** The date line might be edited by the model in multiple formats (e.g., `> Last updated: 2026-06-25` vs. `> Last updated: 2026-06-25T18:00:00Z`).

**Mitigation:**
- Normalization strips the **entire line** (regex `/^\s*>?\s*Last updated:.*$/m`), not just the date value
- The sidecar stores `last_updated_seen` (the literal value from the date line) for display, but the hash comparison ignores it
- Test pair: (1) only date changes → flagged; (2) date format changes but nothing else → flagged (correctly)

### Gotcha 7: `learnings merge` Must Update R9 Baseline

**Risk:** A developer runs `learnings merge`, appends content, but the R9 freshness baseline is not updated. Next `status` run compares the *new* content to the *old* baseline → hashes differ, appears as a real change (correct), but when the developer later hand-edits and runs `learnings accept`, the two baselines might diverge.

**Mitigation:**
- **Required:** After `learningsMergeCommand` succeeds in appending entries (line 218–220 in current code), immediately compute the new body hash and write the sidecar via `withFileLock`
- This is the **sole content writer** (D12-13); no other path appends to cerebrum.md

**Code insertion point:** After line 271 in `learnings-cmd.ts` (after the archive write, before the success message).

---

## Recommended Implementation Sequence

### Phase 1: Setup — Utility Modules (No Execution Yet)

**Task 1.1:** Create `src/hooks/wolf-pantry.ts` (dep-free, hook-isolated)
- Move `collectAllEntries()` from `learnings-cmd.ts:92–117` into `wolf-pantry.ts`
- Move `parseProposals()` from `learnings-cmd.ts:18–63` into `wolf-pantry.ts` (or keep in learnings-cmd and import from there)
- Move `ProposalEntry` type export
- **Verify:** `tsc --noEmit -p tsconfig.hooks.json` clean

**Task 1.2:** Create hash/normalization utility (location: `src/cli/freshness-util.ts` or within `wolf-pantry.ts`)
- Implement `stripDateLine()`, `normalizeContent()`, `hashBody()`
- **Verify:** No new npm deps; `node:crypto` only

**Task 1.3:** Update `src/cli/learnings-cmd.ts` imports
- Remove `collectAllEntries()` + `parseProposals()` (moving to pantry)
- Import from `../hooks/wolf-pantry.js`
- Import hash utils from freshness module

**Task 1.4:** Add `cerebrum-freshness.json` to `src/templates/wolf-gitignore`
- Verify line 6 in Phase 9 reserved the slot; add the actual line

### Phase 2: R7b Gate — Exit-Code CLI Primitive

**Task 2.1:** Add `learningsCheckCommand()` to `learnings-cmd.ts`
- Implement exit-code logic (0/1/2)
- Implement stderr summary + bounded session list
- Implement `--json` + `--quiet` flag handling
- **Tests:** Exit-code matrix (6 cells: clean/pending/error × with/without flags)

**Task 2.2:** Register `learnings check` subcommand in `src/cli/index.ts`
- Add to `learnings` group alongside `list` + `merge`
- Pattern: `async (opts) => { const { learningsCheckCommand } = await import(...); process.exitCode = learningsCheckCommand(opts); }`

**Task 2.3:** Register `learnings accept` subcommand in `src/cli/index.ts`
- Implement R9 re-baseline trigger
- Add to `learnings` group

### Phase 3: R7 Pull-Side Surface

**Task 3.1:** Update `src/cli/status.ts`
- Import `collectAllEntries()` from `../hooks/wolf-pantry.js`
- Add "Curation" section with pending count line after Anatomy block
- Simple line: `✓ No pending learnings` or `- N learnings awaiting review`

### Phase 4: R9 Freshness Integrity

**Task 4.1:** Add baseline capture to `learnings merge`
- After merge completes (line 271), compute normalized body hash
- Write `.wolf/cerebrum-freshness.json` via `withFileLock` + `writeJSON`
- Log: `Merged ... and updated freshness baseline.`

**Task 4.2:** Add freshness check to `status.ts`
- After Curation/Anatomy block: read cerebrum, compute hash
- Bootstrap-on-missing: if no sidecar, write baseline silently, print `- cerebrum.md: baseline captured`
- If content unchanged but date changed → `⚠ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`
- If content changed → `✓ cerebrum.md: current`

### Phase 5: R7a Hook-Side Capture

**Task 5.1:** Implement `captureStubIfNeeded()` in `src/hooks/stop.ts`
- Guard on `codeWrites.length > 0` + `proposed-learnings.md` empty or missing
- Idempotency: check `stop_count` + stub marker
- Call `appendProposal("cerebrum", stub content)`
- Insert call at line 70 (after `checkCerebrumFreshness`, before ledger)

**Task 5.2:** Verify hook isolation
- **Check:** `tsc --noEmit -p tsconfig.hooks.json` clean
- **Check:** `pnpm build:hooks` succeeds
- **Check:** `openwolf update` copies new `stop.js` to `.wolf/hooks/`

### Phase 6: Integration & Testing

**Task 6.1:** Unit tests
- `tests/cli/learnings-check.test.ts` (or extend `learnings.test.ts`) — exit codes, JSON output, quiet mode
- `tests/cli/learnings-merge.test.ts` (or extend) — R9 baseline capture after merge
- `tests/hooks/wolf-pantry.test.ts` — `collectAllEntries()`, presence-based pending detection
- `tests/cli/status.test.ts` (or new) — R9 freshness flag, bootstrap, pending count line

**Task 6.2:** Integration test (new)
- `tests/e2e-curation.test.ts` (or add to existing e2e suite)
- Scenario: model writes code without learning → `openwolf learnings check` exits 1 (stub exists)
- Scenario: `learnings merge` writes baseline → `status` does not flag
- Scenario: model bumps date only → `status` flags theater
- Scenario: model adds learning → `status` does not flag

**Task 6.3:** Smoke test
- Build full suite: `pnpm build && pnpm build:hooks && openwolf update`
- Manual test in a fresh project:
  - `openwolf init`
  - (Edit a code file, no explicit learning)
  - `openwolf learnings check --quiet` → exit 1
  - `openwolf learnings check --json` → JSON output
  - `openwolf learnings merge` → prompts, merges, updates baseline
  - `openwolf status` → shows R9 check
  - Edit cerebrum.md date only, run `openwolf status` → flags theater
  - Run `openwolf learnings accept` → baseline updated
  - Run `openwolf status` → no flag

### Phase 7: Verification Gates (C1, C2)

**Task 7.1:** Framework-blind check
- `grep -rIiE 'bitbucket|github|gitlab|pre-push|\.github|pipelines|actions/checkout|gsd|superpowers|gstack|\.planning' src/cli src/hooks src/templates` → **zero** hits

**Task 7.2:** Hook isolation check
- `tsc --noEmit -p tsconfig.hooks.json` → **clean** (no errors)
- `npm ls` shows no new prod deps in `src/hooks/`

**Task 7.3:** Changelog & version
- Version bump: `1.3.0-beta` is the pre-agreed tag (format change + new API)
- Add changelog entry: "Framework-Blind Curation Machinery (R7a/R7b/R9): continuous capture via stop hook, promotion gate via learnings check, freshness integrity via SHA-256 baseline"

---

## Code Examples (Verified Patterns)

### Example 1: Exit-Code-as-Contract Pattern (precedent: ESLint, pytest, Ruff)

From R7b-GATE.md research:
- ESLint: 0 = no errors, 1 = ≥1 error, 2 = configuration/internal error
- pytest: 0 = passed, 1 = tests failed, 3+ = internal/usage error
- Ruff: 0 = no violations, non-zero = violations found, supports `--quiet` + `--output-format json`

**OpenWolf `learnings check` mirrors this:**
```bash
openwolf learnings check       # exit 0 if clean, 1 if pending, 2 if error
openwolf learnings check --json --quiet  # structured output, no stderr
openwolf learnings check 2>/dev/null     # human tests exit code only
```

### Example 2: Worktree-Aware Status (existing precedent in `status.ts`)

From current `status.ts:10–13`:
```typescript
const wtCtx = detectWorktreeContext(projectRoot);
const wolfDir = wtCtx.isWorktree
  ? path.join(wtCtx.mainRepoRoot, ".wolf")
  : path.join(projectRoot, ".wolf");
```

`collectAllEntries()` uses the same `wolfDir` resolution, so it naturally aggregates worktrees.

### Example 3: Defensive File Handling (precedent in `stop.ts`)

From `checkCerebrumFreshness()` (:269–291):
```typescript
try {
  const stat = fs.statSync(cerebrumPath);
  // ... check logic
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    process.stderr.write(`OpenWolf: error message\n`);
  }
  // ENOENT is silent (expected on first init)
}
```

R9 freshness check follows the same pattern: ENOENT → bootstrap silently; other errors → logged.

---

## Confidence Breakdown

| Finding | Level | Reason |
|---|---|---|
| `collectAllEntries()` location + relocation safety | HIGH | Function is standalone, no internal cycles; moving to `wolf-pantry.ts` is straightforward |
| Exit-code contract (0/1/2, stderr/stdout/quiet) | HIGH | Grounded in ESLint/pytest/Ruff precedents; R7b-GATE.md research locked these |
| Hook isolation (dependency-free `wolf-pantry.ts`) | HIGH | Matches `wolf-*.ts` pattern (D10 precedent); only uses `node:fs`, `node:path`, sibling wolf-* functions |
| R9 hash normalization (date-line stripping, whitespace) | HIGH | Concrete regex defined in CONTEXT.md D12-11; simple string operations |
| Bootstrap-on-missing freshness sidecar | HIGH | Mirrors existing `wolf-selfheal.ts` precedent; self-healing is an established pattern |
| R7a stub idempotency via `stop_count` + marker check | MEDIUM | Guard condition is sound, but `stop_count` is an incremented counter; need to verify it's available in `finalizeSession()` (it is, line 28) |
| Stub-vs-parser grammar reconciliation (D12-05) | MEDIUM | Three approaches exist; planner chooses (a) recognized block, (b) presence-based, or (c) distinct file. (b) is simplest and already in notes. |
| Worktree aggregation for learnings count | HIGH | `status.ts` already handles worktrees correctly; `collectAllEntries()` reuses same `wolfDir` resolution |

---

## Open Questions for Planner

1. **D12-05 stub grammar:** Will the planner go with presence-based counting, recognized metadata block, or distinct stub file? (Recommend: presence-based, simplest)
2. **Freshness sidecar schema:** Confirm `{ version, content_sha256, last_updated_seen, captured_at, captured_by }` is the agreed schema, or adjust.
3. **Status output format for R9/R7:** Exact wording of the freshness flag line? Examples:
   - `  ⚠ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`
   - `  - cerebrum.md: content unchanged since baseline`
4. **E2E test scope:** Should the integration test include hook execution via subprocess (full `stop.ts` flow), or mock the hook's `appendProposal()` call?
5. **Changelog entry:** Confirm version `1.3.0` is correct, and the exact changelog format for "curation machinery" features.

---

## Verification Checklist (for planner & plan-checker)

- [ ] `tsc --noEmit` + `tsc --noEmit -p tsconfig.hooks.json` both clean
- [ ] `grep -rIiE 'bitbucket|github|gsd|superpowers' src/` → zero hits
- [ ] `pnpm test` passes (all new + modified tests green)
- [ ] `pnpm build && pnpm build:hooks && openwolf update` succeeds
- [ ] Manual smoke test: learnings capture/merge/check/accept workflow
- [ ] `openwolf status` shows pending count + freshness check (if applicable)
- [ ] Worktree isolation test: run in main checkout, then worktree; counts match
- [ ] `openwolf learnings check --json | jq` produces valid JSON
- [ ] Exit codes: 0 (clean), 1 (pending), 2 (error) on the appropriate scenarios
- [ ] `cerebrum-freshness.json` is gitignored (verify in `.wolf/.gitignore`)
- [ ] Changelog entry present and accurate
- [ ] D-15/D-19/D-20 constraints documented in code comments where applicable

---

## Sources & References

**Canonical research docs:**
- `.planning/phases/12-framework-blind-curation-machinery/12-CONTEXT.md` — Decision mapping, D12-01 through D12-16 (HIGH)
- `.planning/research/R7b-GATE.md` — Exit-code contract, CLI precedents (HIGH)
- `.planning/research/R9-FRESHNESS.md` — Hash normalization, sidecar schema, bootstrap rule (HIGH)

**Source code (file:line):**
- `src/cli/learnings-cmd.ts:92–117` — `collectAllEntries()` (HIGH, to relocate)
- `src/cli/learnings-cmd.ts:18–63` — `parseProposals()` (HIGH, to relocate)
- `src/cli/status.ts:8–146` — Status output structure (HIGH)
- `src/hooks/stop.ts:52–163` — `finalizeSession()`, `checkCerebrumFreshness()` pattern (HIGH)
- `src/hooks/wolf-files.ts:89–96` — `appendProposal()` (HIGH, reuse for R7a)
- `src/hooks/shared.ts` — Hook barrel re-exports (HIGH)
- `src/cli/index.ts:169–188` — Learnings command group, registration pattern (HIGH)
- `src/templates/cerebrum.md`, `wolf-gitignore` — File structure, ignore list (HIGH)

**External precedents:**
- ESLint CLI exit codes (https://eslint.org/docs/latest/use/command-line-interface) — 0/1/2 model (HIGH)
- pytest exit codes (https://docs.pytest.org/en/stable/reference/exit-codes.html) — expected vs. operational failure (HIGH)
- Ruff linter `--quiet` + `--output-format json` (https://docs.astral.sh/ruff/linter/) — flag precedent (HIGH)

---

**Phase 12 Research — Complete**
**Ready for Planning**
