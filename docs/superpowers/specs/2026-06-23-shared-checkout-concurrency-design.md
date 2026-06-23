# Shared-Checkout Concurrency — Design Spec

> Date: 2026-06-23
> Author: Brian Summa / Claude
> Status: Draft v2 — code review incorporated (2026-06-23)
> Scope: Make OpenWolf safe for multiple developers writing concurrently in ONE
> shared checkout — closing the Q1 gap left by the v1.0 Team Toolkit milestone.

## Background

The v1.0 "CHESA Fork Team Toolkit" shipped the *plumbing* for team use
(advisory `withFileLock`, `OPENWOLF_METADATA_DIR`, `.wolf/.gitignore`
mixed-commit template, per-worktree session isolation). A 2026-06-23 readiness
audit (three parallel agents) confirmed:

- **Worktree-isolated multi-dev works** — two subagents in two worktrees share
  the main repo's knowledge base and never collide on session state. Verified
  end-to-end.
- **Shared-checkout concurrent writes do NOT work safely.** Three concrete
  defects:
  1. **The lock only wraps the WRITE, not the read-modify-write.**
     `autoDetectBugFix` (`src/hooks/post-write.ts`) reads `buglog.json`
     *outside* any lock, then calls the locked `writeJSON`. Two concurrent
     post-write hooks both read the same array, both compute
     `nextId = bug-${bugs.length + 1}`, and both write — one entry is lost AND
     both get the same `bug-NNN` id. Same unprotected RMW on the token ledger
     (`stop.ts` `finalizeSession`) and session counters (`session-start.ts`
     `initializeSessionLedger`).
  2. **`buglog.json` is a single committed JSON array** — a merge-conflict
     magnet. Independent branches each append to the array tail and mint
     duplicate sequential ids.
  3. **Shared markdown (`cerebrum.md`, `anatomy.md`, `memory.md`) has no
     concurrency protection at all.** `appendMarkdown` is a bare
     `fs.appendFileSync`, and `cerebrum.md`/`anatomy.md` are written by Claude's
     own Edit/Write tool — never through any locked path. The v1.0 spec's
     Success Criterion #3 ("two concurrent sessions writing `cerebrum.md` do not
     lose entries") is therefore **not met**.

This spec closes all three. Two design decisions were made up front with the
maintainer (2026-06-23): buglog moves to **NDJSON**, and shared markdown is
protected with a **propose-mode buffer**.

### What this builds on (already shipped, unchanged)

- `withFileLock` / `acquireLock` / `releaseLock` (`src/hooks/wolf-lock.ts`)
- `writeJSON` atomic temp-file-and-rename (`src/hooks/wolf-json.ts`)
- Per-worktree session dirs (`getSessionDir()` → `.wolf/sessions/<worktreeId>/`)
- `OPENWOLF_METADATA_DIR` resolution across hooks, CLI, daemon

## Recommended sequencing

The three pillars are independent and decreasing in value-per-effort. Recommend
shipping as **two phases**:

- **Phase 1 (Pillars A + B):** lost-update + duplicate-id + merge-conflict
  safety for the structured files. Smaller, mechanical, high-value. After this,
  3–4 devs can commit `buglog.json`/ledger state without losing or conflicting.
- **Phase 2 (Pillar C):** propose-mode for shared markdown. Larger — it changes
  the core auto-learning loop and adds a review/merge surface — and is worth its
  own discuss→plan→execute cycle.

---

## Pillar A — Lock the whole read-modify-write

### A1. `updateJSON()` helper

Add to `src/hooks/wolf-json.ts`. **`writeJSON` already wraps its entire body in
`withFileLock(filePath, …)`** (`wolf-json.ts:55-56`), and the lock is a
non-reentrant `wx` lockfile. So `updateJSON` must NOT call `writeJSON` from
inside its own lock — that re-acquires the same per-file lock, hits `EEXIST`,
burns the retry budget, and prints a spurious "proceeding unlocked" warning on
every call (the data is still safe under the outer lock, but the noise + latency
are unacceptable). Extract the lock-free write and have both callers share it:

```ts
// Lock-free atomic write (temp file + rename). Internal — callers MUST already
// hold the file lock: writeJSON wraps it, updateJSON owns the RMW lock.
function _writeJSONUnsafe(filePath: string, data: unknown): void { /* temp+rename body */ }

export function writeJSON(filePath: string, data: unknown): void {
  withFileLock(filePath, () => _writeJSONUnsafe(filePath, data));
}

// Read-modify-write under ONE lock — no nested re-acquire.
export function updateJSON<T>(filePath: string, fallback: T, mutate: (cur: T) => T): void {
  withFileLock(filePath, () => {
    const cur = readJSON<T>(filePath, fallback);
    _writeJSONUnsafe(filePath, mutate(cur));
  });
}
```

The lock spans read→mutate→write exactly once, closing the lost-update window
with no nested-lock false alarm. (Review #1.)

### A2. Convert the read-modify-write call sites

| Call site | Current | Change |
|-----------|---------|--------|
| `src/hooks/stop.ts` `finalizeSession` (ledger lifetime counters) | read → accumulate → `writeJSON` | wrap in `updateJSON` |
| `src/hooks/session-start.ts` `initializeSessionLedger` (`total_sessions++`) | read → `++` → `writeJSON` | wrap in `updateJSON` |
| `src/hooks/post-write.ts` token-ledger updates | read → add → `writeJSON` | wrap in `updateJSON` |
| `src/hooks/post-write.ts` `_session.json` (`files_written.push`, `edit_counts++`, `:156-174`) | read → mutate → `writeJSON` | wrap in `updateJSON` |
| `src/hooks/stop.ts` `_session.json` (`stop_count++`, `:171-192`) | read → `++` → `writeJSON` | wrap in `updateJSON` |

`buglog.json` is intentionally **not** in this table — Pillar B removes it from
the RMW path entirely (NDJSON appends are conflict-free and need no lock).

The token-ledger and `_session.json` are session-scoped
(`.wolf/sessions/<worktreeId>/`), so in the worktree-per-dev pattern they don't
contend. But in a **single shared checkout** (`getSessionDir()` returns
`getWolfDir()`), every developer shares one ledger and one `_session.json` —
that is exactly where the lock now matters.

**`_session.json` semantic caveat (review #4):** locking stops corruption and
lost updates, but in a shared checkout two concurrent Claude sessions still
write to ONE `_session.json`, so its `session_id` / `files_written` /
`edit_counts` conflate both sessions. That file only drives in-session nudges,
not permanent accounting (the token-ledger stays correct), so this is an
**accepted limitation** — fully separating concurrent sessions in one checkout
would require namespacing `_session.json` by Claude session id (out of scope;
worktree-per-dev avoids it).

### A3. Harden the lock (audit follow-ups)

- **Retry budget too thin.** `MAX_RETRIES = 3` with the sleep guarded by
  `attempt < MAX_RETRIES - 1` yields ~200 ms of back-off before abandoning the
  lock and writing **unlocked**. Raise the budget (e.g. 5 attempts, jittered
  back-off) so the unlocked fallback is genuinely last-resort, and `log()` to
  stderr when it fires so silent unlocked writes are visible.
- **TOCTOU on stale removal.** The stale branch does `unlink`-then-`wx`-create;
  two processes can each delete the other's freshly-written lock during a
  staleness storm. Keep the single-retry-after-stale-removal, and document the
  bound: when N processes all find one stale lock, at most one wins per embedded
  retry; losers retry and may briefly re-enter the race, but it is bounded —
  after `MAX_RETRIES × (staleness window + retry delay)` every process either
  holds the lock or has fallen through to the (now logged) unlocked write. Cover
  it with a test. (Review #8.)

---

## Pillar B — NDJSON buglog with collision-free IDs

### B1. Format

`.wolf/buglog.json` (a `{ "version": 1, "bugs": [ … ] }` array) becomes
`.wolf/buglog.ndjson` — one JSON object per line:

```
{"id":"bug-7f3a9c2e","timestamp":"2026-06-23T…","error_message":"…","file":"…","root_cause":"…","fix":"…","tags":[…],"related_bugs":[],"occurrences":1,"last_seen":"…"}
{"id":"bug-1b8d44a0", …}
```

Why NDJSON:

- **Conflict-free appends.** A new bug is a new line at EOF. Two branches that
  each append land on different lines → git merges them cleanly with no manual
  resolution. (The JSON array conflicted on the shared tail every time.)
- **No lock needed for appends.** `fs.appendFileSync` issues a single `write`
  syscall; at typical buglog line sizes (a few hundred bytes) on a local
  filesystem that is effectively atomic, so the post-write hook's bug append
  needs no `withFileLock` — it just appends. (Very long lines or network
  filesystems weaken this; the reader tolerates a torn final line — see Testing.
  Dedup/occurrence bumps are the exception — see B3.) (Review #6.)

### B2. Collision-free IDs

Replace `nextId = bug-${bugs.length + 1}` with an id that needs no coordination:

```ts
id: `bug-${crypto.randomUUID().slice(0, 8)}`
```

Astronomically unlikely to collide across concurrent sessions; `related_bugs`
references remain opaque strings, so existing cross-references keep working.

### B3. Dedup / occurrence bumps

The one buglog operation that is still read-modify-write is incrementing
`occurrences` / updating `last_seen` on a re-seen bug. This happens in TWO
places (review #5): the CLI helper `bug-tracker.ts` `logBug` (`:42-72`, reads
via `fs-safe`, **no lock**, and itself uses the buggy `bug-${length+1}` id at
`:57`) and the hook's `autoDetectBugFix` (`post-write.ts`). Options, decided at
implementation time:

- **B3a (recommended):** append-only — a re-seen bug appends a new line; a
  compaction step (`openwolf bug compact`, or the daemon on a schedule) folds
  duplicates by matcher key. Keeps both hot paths lock-free and sidesteps the
  cross-context lock problem below.
- **B3b:** wrap the occurrence-bump rewrite in `updateJSON`-style locking over
  the NDJSON file. Simpler semantics, reintroduces a lock — **and that lock must
  be reachable from BOTH the hook and CLI contexts** (today `withFileLock` is
  hooks-only; `logBug` uses `src/utils/fs-safe.ts`). So B3b additionally
  requires B6 below.

### B4. Reader/writer migration

Every touchpoint that reads or writes `buglog.json` must move to the new NDJSON
format. **Compilation-boundary constraint (review #2):** the hooks compile under
`tsconfig.hooks.json` (`rootDir: src/hooks`, `include: src/hooks/**`) and cannot
import `src/buglog/` or `src/utils/`. So the NDJSON read/append logic needs a
self-contained copy in `src/hooks/` (the same pattern `shared.ts` already uses
for utilities) AND the canonical helper in `src/buglog/bug-tracker.ts`; a shared
format test guards the two against drift.

| File | Role |
|------|------|
| `src/buglog/bug-tracker.ts` | CLI read/write helpers — **canonical format** |
| `src/hooks/` self-contained NDJSON helper (NEW) | hook-side append/read (can't import bug-tracker) |
| `src/buglog/bug-matcher.ts` | dedup/match logic |
| `src/cli/bug-cmd.ts` | `openwolf bug` command (list/search) |
| `src/hooks/post-write.ts` | `autoDetectBugFix` append |
| `src/hooks/session-start.ts` | empty-buglog reminder (counts entries) |
| `src/hooks/stop.ts` (review #3) | `checkForMissingBugLogs` matches `w.file.includes("buglog.json")` (`:212`) → change to `"buglog"` so the nudge still fires for `buglog.ndjson` |
| `src/daemon/wolf-daemon.ts` | serves buglog to the dashboard |
| `src/dashboard/app/hooks/useWolfData.ts`, `components/panels/BugLog.tsx` | dashboard reader/UI |
| `src/cli/init.ts` | seeds the template; `src/cli/status.ts` counts entries |
| `src/templates/` (buglog template), `.wolf/.gitignore` (`wolf-gitignore`) | filename change |
| `docs/`, `OPENWOLF.md`, `claude-rules-openwolf.md` | protocol references to `buglog.json` |

### B5. One-time migration

Ship a converter (`openwolf migrate-buglog`, or run automatically by `init`/
`update` when a legacy `buglog.json` is found): read the old array, write each
bug as an NDJSON line to `buglog.ndjson`, preserving ids, then rename the old
file to `buglog.json.bak`. Idempotent; no-op if `buglog.ndjson` already exists.
The fork's own `.wolf/buglog.json` (203 entries) is the first migration target.

### B6. (If B3b) lift `withFileLock` to a shared module

`withFileLock` currently lives in `src/hooks/wolf-lock.ts`, importable only by
the hooks build. The CLI buglog path (`bug-tracker.ts` → `fs-safe.ts`) and any
future CLI RMW cannot lock. If B3b is chosen — or whenever a CLI command needs
the same lock — lift `withFileLock` into a location both build graphs can import
(e.g. `src/utils/`), with a thin re-export from `src/hooks/wolf-lock.ts` to
preserve the self-contained hooks copy. With B3a (append-only) this is
unnecessary. (Review #5, recommendation #5.)

---

## Pillar C — Propose-mode for shared markdown

**Problem:** `cerebrum.md`/`anatomy.md` are written directly (by hooks via
`appendMarkdown`, and by Claude's own Edit/Write tool). Concurrent sessions race
with no serialization and no review.

**Mechanism:** sessions never write shared markdown directly. They write
*proposals* to a per-session staging file; a human-driven merge step is the only
writer of the shared file.

1. **Staging.** Learnings/anatomy updates are appended to
   `.wolf/sessions/<worktreeId|sessionId>/proposed-learnings.md` (per-session,
   already gitignored). Per-session files never contend.
2. **Protocol change.** `OPENWOLF.md` (and `claude-rules-openwolf.md`) instruct
   Claude to record learnings via the proposal path, not by editing
   `cerebrum.md` directly.
3. **Review/merge surface.** `openwolf learnings` (CLI) lists pending proposals
   across sessions and merges approved ones into `cerebrum.md` — the single
   writer, so no races. A dashboard panel mirrors this for non-CLI users.
4. **Spec correction.** Revise v1.0 Success Criterion #3 to: *programmatic and
   proposed writes never lose entries; the shared `cerebrum.md` is written only
   by the review/merge step.*

`memory.md` stays a per-dev, gitignored, append-only log (interleaving is
acceptable and it isn't shared), so it is **out of scope** for propose-mode.

**Why this is Phase 2:** it changes the core auto-learning UX and adds a new
review surface. It deserves its own discuss→plan→execute cycle; Pillars A+B
deliver the concurrency-safety win without it.

---

## Architecture summary

```
src/hooks/
  wolf-json.ts        # A1: _writeJSONUnsafe + writeJSON + updateJSON; A3: lock hardening
  wolf-lock.ts        # A3: retry budget + stderr on unlocked fallback
                      # B6 (if B3b): re-export a shared withFileLock
  buglog-ndjson.ts    # B4: self-contained NDJSON append/read for hooks (NEW)
  post-write.ts       # A2 ledger + _session.json via updateJSON; B4 NDJSON; uuid ids
  session-start.ts    # A2 initializeSessionLedger via updateJSON; B4 count
  stop.ts             # A2 finalizeSession + _session.json via updateJSON; B4 nudge string
  wolf-files.ts       # C1: appendProposal() helper (staging)

src/buglog/
  bug-tracker.ts      # B1/B4: canonical NDJSON read/write
  bug-matcher.ts      # B3: dedup over NDJSON

src/cli/
  bug-cmd.ts          # B4: read NDJSON
  migrate-buglog.ts   # B5: one-time converter (NEW)
  learnings.ts        # C3: review/merge proposals → cerebrum.md (NEW, Phase 2)
  init.ts, update.ts, status.ts  # B4/B5: NDJSON + auto-migrate

src/daemon/ + src/dashboard/app/
  wolf-daemon.ts, useWolfData.ts, BugLog.tsx  # B4: serve/read NDJSON
  (Phase 2) learnings panel

src/templates/ + docs/  # B4: buglog.ndjson naming; C2: protocol text
```

## Testing strategy

- **A — concurrency (the test the v1.0 spec required and never got):** fork N
  child processes that each append a distinct bug / increment the ledger through
  the real `updateJSON` path; assert all N survive with distinct ids and no
  corruption. This is the headline regression guard.
- **A — lock fallback:** simulate sustained contention; assert the unlocked
  fallback fires only after the (raised) retry budget and logs to stderr.
- **B — NDJSON round-trip:** write/read N bugs; assert parse tolerance of blank
  lines and a trailing newline; assert a malformed line is skipped, not fatal.
- **B — concurrent append + read (review #7):** while one process appends, a
  reader (`openwolf bug` / the daemon endpoint) must not return partial/corrupt
  entries — the reader skips an incomplete final line rather than throwing.
- **B — migration:** convert a fixture legacy `buglog.json` (incl. the 203-entry
  real file) → NDJSON; assert ids and counts preserved, idempotent on re-run.
- **C — propose/merge:** proposals from two sessions both survive a merge into
  `cerebrum.md`; direct concurrent writes to the staging files don't contend.

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| NDJSON migration misses a reader → dashboard/CLI shows empty buglog | Enumerate every touchpoint (B4 table); add a smoke test that `openwolf bug` + the daemon endpoint both read NDJSON |
| Auto-migration on `init`/`update` corrupts a buglog | Write `buglog.ndjson` fresh, rename old to `.bak`, never delete; idempotent guard |
| Propose-mode changes muscle memory (learnings no longer auto-land in cerebrum) | Phase 2 only; clear `openwolf learnings` UX + protocol docs; dashboard nudge for pending proposals |
| Lock fallback still drops protection under 3+ writers | Raised retry budget + visible stderr; NDJSON removes buglog (the hottest writer) from the locked path entirely |
| Existing `bug-NNN` references in `related_bugs` | uuid ids are opaque strings; old references remain valid post-migration |

## Success criteria

1. N concurrent processes appending bugs through the real path produce N
   entries with N distinct ids — zero lost, zero duplicate ids.
2. N concurrent ledger increments yield `total_sessions += N` (no lost updates).
3. Two branches that each add bugs merge with **no** git conflict in
   `buglog.ndjson`.
4. (Phase 2) Two concurrent sessions' proposed learnings both survive a merge
   into `cerebrum.md`.
5. `openwolf bug`, the dashboard, and `status` all read the NDJSON buglog; the
   203-entry fork buglog migrates cleanly and idempotently.

## Out of scope / deferred

- `memory.md` locking (per-dev, append-only, interleaving acceptable).
- Distributed locking across machines/network filesystems (the lock is
  single-host advisory; teams on a shared NFS path are explicitly unsupported).
- Real-time multi-writer CRDT semantics — propose-mode (human merge) is the
  deliberate, simpler choice.
