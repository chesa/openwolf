# R9 — Freshness Integrity for `cerebrum.md`

**Milestone:** v1.2 Shared-Context Tracking & Curation
**Requirement:** R9 (P1) — flag a "Last updated" bump with no content delta; ban "freshness theater."
**Researched:** 2026-06-25
**Confidence:** HIGH (grounded in actual template + `status.ts`/`learnings-cmd.ts` source; no external claims)

## Question

The acme field evidence (PRD §3.3) showed `STATUS.md` was abandoned: its "Last
updated" was bumped without any meaningful content change. PRD principle 4 names
this "freshness theater" and bans it for the committed, curated `cerebrum.md`.
R9: detect a "Last updated" date change with **no content delta** and surface it
in `openwolf status`. A real content change must NOT be flagged.

Deliver to the roadmapper/planner: the delta-detection approach, where the
baseline is stored (cross-session/clone survival), where the check runs, what
counts as "content," file touch-points, and the acceptance criterion.

## cerebrum.md structure (file:line)

Template: `src/templates/cerebrum.md` (24 lines).

```
src/templates/cerebrum.md:1   # Cerebrum
src/templates/cerebrum.md:3   > OpenWolf's learning memory. Updated automatically ...
src/templates/cerebrum.md:4   > Do not edit manually unless correcting an error.
src/templates/cerebrum.md:5   > Last updated: —          ← THE FRESHNESS MARKER
src/templates/cerebrum.md:7   ## User Preferences
src/templates/cerebrum.md:11  ## Key Learnings
src/templates/cerebrum.md:15  ## Do-Not-Repeat        (dated entries: [YYYY-MM-DD] ...)
src/templates/cerebrum.md:20  ## Decision Log
```

- The freshness marker is a **blockquote line** `> Last updated: <value>`
  (seeded as `—`). It is the only date-bearing line outside the dated
  Do-Not-Repeat entries.
- Section structure matches OPENWOLF.md exactly: User Preferences, Key
  Learnings, Do-Not-Repeat, Decision Log.
- A live example was not present in this repo (this repo gitignores its own
  `.wolf/`, per CLAUDE.md "Development Gotchas"); the template is canonical and
  the dashboard parser confirms the real shape.

**Existing parser to reuse (do not reinvent the regex):**
`src/dashboard/app/lib/file-parsers.ts:89`
```ts
const lastUpdatedMatch = content.match(/Last updated:\s*(.+)/);
```
This is the established way OpenWolf extracts the marker. The detector should
use the same regex so "the date line" is identified identically everywhere.

**Critical writer fact — who bumps "Last updated":**
The sole programmatic writer of `cerebrum.md` is `learningsMergeCommand`
(`src/cli/learnings-cmd.ts:150`). It **only appends** entry content:

```
src/cli/learnings-cmd.ts:214-219
  const targetPath = path.join(wolfDir, entry.target + ".md");
  const appendText = "\n" + entry.content.trim() + "\n";
  await withFileLock(targetPath, () => {
    fs.appendFileSync(targetPath, appendText, "utf-8");
  });
```

It **never touches the `> Last updated:` line.** That line is bumped *by the AI
agent editing the file by hand* under the OPENWOLF.md protocol (the same protocol
that bumps STATUS.md — `src/templates/OPENWOLF.md:20` "Bump 'Last updated' date").
This is exactly the mechanism that produced freshness theater on STATUS.md.

Implication for R9: "freshness theater" on cerebrum is an **agent edit that
touches only the date line** — distinct from a legitimate `learnings merge`
(which appends content but leaves the date alone unless the agent also edits it).
The detector compares *content body* against a *baseline*, so it catches the
theater regardless of who bumped the date.

## Delta-detection candidates + recommendation

Constraint (CLAUDE.md): no new npm deps; if unavoidable, CLI/daemon-only, NEVER
in a hook-imported module. **`node:crypto` is already imported in hooks**
(`src/hooks/post-write.ts:3`, `src/hooks/wolf-json.ts:3`, `buglog-ndjson.ts:3`,
`worktree-helper.ts:82` uses `.createHash("sha256")`) — so SHA-256 of a string
is free and hook-safe. No candidate needs a new dependency.

| # | Approach | How | Verdict |
|---|----------|-----|---------|
| (a) | **Content-body hash in a sidecar** | Strip the date line + normalize whitespace, `sha256(body)`, store the hash. On check: recompute body hash, compare to stored. If equal but date changed → theater. | **RECOMMENDED** |
| (b) | **Git diff of prior committed cerebrum** | When the working/committed body equals the prior committed version but only the date line differs → theater. | Reject as primary |
| (c) | **Stored last-content-hash field** (variant of a) | Same as (a); the only open question is *where* the field lives. | Folded into (a) |

**Why (b) is rejected as the mechanism (but useful as a backstop):**
- OpenWolf is **VCS-host-blind and must work without git** — hooks already guard
  for non-git projects, and `status.ts` does no git calls today. Spawning `git`
  from a hook is the kind of host coupling D-15 explicitly avoids.
- Git can only compare *committed* states; freshness theater happens in the
  working tree **before** commit, which is when `openwolf status` runs. A staged
  but uncommitted date-only bump would be invisible to a `git show HEAD:` diff
  until after it is committed — too late.
- Shallow clones / detached states / squash merges make "the prior committed
  version" ambiguous.
- It does still make a fine *optional, additive* signal at PR/CI time (R7's
  exit-code primitive boundary), but the primary detector must be self-contained.

**Why (a) wins:** self-contained, deterministic, no git, no clock-skew issues,
runs in any context (CLI, daemon, or a hook if ever needed), and the hashing
primitive is already in the codebase. False-positive surface is tiny and fully
controlled by the normalization rule (see "What counts as content").

## Baseline storage decision

**Decision: store the baseline as a small dedicated sidecar JSON,
`.wolf/cerebrum-freshness.json`, written by `learnings merge` (the sole content
writer) and gitignored.**

```jsonc
// .wolf/cerebrum-freshness.json   (gitignored — per-checkout runtime state)
{
  "version": 1,
  "content_sha256": "<hash of normalized body, date line excluded>",
  "last_updated_seen": "2026-06-25",   // the date-line value at baseline time
  "captured_at": "2026-06-25T18:04:11.000Z",
  "captured_by": "learnings-merge"     // or "status-bootstrap"
}
```

**Rationale and the cross-session / clone survival analysis:**

- **Not `token-ledger.json`.** The ledger lives at
  `sessions/<worktreeId>/token-ledger.json` in worktree mode
  (`src/cli/status.ts:23-25, 111`), whereas `cerebrum.md` always lives at the
  **main repo** `.wolf/` root (`status.ts:11-13` resolves `wolfDir` to
  `mainRepoRoot/.wolf`). Co-locating the cerebrum baseline with a per-worktree,
  per-session ledger would split the baseline across worktrees and conflate two
  unrelated lifecycles. Keep the baseline next to `cerebrum.md` at the wolf root.
- **Gitignored, like all runtime state** (`memory.md`, `token-ledger.json`,
  `cron-state.json`, `*.lock` per PRD §4.2). Committing the baseline would
  reintroduce exactly the churn/leak problem R1 removes.
- **Cross-session survival:** the file persists on disk between sessions in a
  checkout, so the baseline from the last `learnings merge` is available to every
  subsequent `openwolf status` in that checkout. This is the normal case.
- **Fresh clone survival (the one wrinkle):** a teammate who clones the repo gets
  `cerebrum.md` (committed) but **no** `cerebrum-freshness.json` (gitignored).
  Resolve this with a **bootstrap-on-first-check**: when `openwolf status` finds
  no sidecar, it computes the current body hash, writes the sidecar
  (`captured_by: "status-bootstrap"`), and reports **no** flag (you cannot have
  committed theater you didn't author). The baseline is thereby self-healing — it
  mirrors the R2 anatomy self-heal pattern (PRD §4.3, `src/hooks/wolf-selfheal.ts`
  already exists for the analogous case). This means the check only ever flags
  theater introduced **after** the local baseline was captured — which is the
  exact semantic we want: "did *this* checkout bump the date without changing
  content."

**Where the baseline is (re)captured:**
1. **At `learnings merge`** — after a successful append, recompute the body hash
   and write the sidecar. This is the authoritative capture point (sole content
   writer). Touch-point: end of `learningsMergeCommand`, `src/cli/learnings-cmd.ts`
   after line 271.
2. **At `status` bootstrap** — if sidecar missing (fresh clone / first run),
   capture silently, no flag.
3. **After a flagged-then-acknowledged real edit:** not needed — once real content
   changes, the next `learnings merge` (or an explicit re-capture) updates the
   hash; until then the flag is correct (date moved, content didn't).

## Where the check runs

**Primary: `openwolf status`** (`src/cli/status.ts`). This is a CLI/daemon
context where deps are allowed and where the PRD acceptance criterion lives
("flagged in status"). The check slots in next to the existing cerebrum/anatomy
reporting (e.g. after the "Anatomy: N files tracked" block, `status.ts:129-131`).

Algorithm in `status`:
1. Read `cerebrum.md`; extract date via `/Last updated:\s*(.+)/`; compute
   `bodyHash = sha256(normalize(stripDateLine(content)))`.
2. Read `cerebrum-freshness.json`. If absent → bootstrap (write sidecar, no flag).
3. If `bodyHash === sidecar.content_sha256` **and**
   `dateValue !== sidecar.last_updated_seen` → **FLAG: freshness theater.**
4. If `bodyHash !== sidecar.content_sha256` → real change; not flagged. (Status
   may optionally refresh the sidecar here, or leave refresh to `learnings merge`.)

**Should it also run at `stop` or merge time?**
- **`stop` hook: NO.** Per D-15 the stop hook is reserved for *continuous capture*
  (appending proposals), and adding a freshness diff there risks noisy
  end-of-turn output and couples the integrity check to every turn. Keep `stop`
  dumb; surface integrity in the pull-based `status`, consistent with R7's
  pull-based design (PROJECT.md D-15, R7).
- **`merge` time: YES, but only to (re)write the baseline**, not to flag. Merge is
  the legitimate content-write; it should refresh `content_sha256`. It does not
  flag because a merge is a real change by definition.

This keeps the detector entirely in CLI/daemon code (`status.ts`,
`learnings-cmd.ts`) — no hook involvement, so the no-dep-in-hooks rule is moot
here, and `node:crypto` would be safe even if it later moved into a hook.

## What counts as content

"Content" = everything in `cerebrum.md` **except** the freshness marker, compared
after normalization to avoid trivial-diff false positives.

**Normalization (`normalize(body)`), in order:**
1. **Remove the date line.** Drop the single line matching
   `/^\s*>?\s*Last updated:.*$/m`. (Match the dashboard regex semantics; the line
   is a blockquote `> Last updated: ...`.) Removing the whole line, not just the
   value, avoids the marker prefix affecting the hash.
2. **Normalize line endings** `\r\n` → `\n` (clone/OS portability — teammates on
   Windows/macOS/Linux per platform.ts).
3. **Strip trailing whitespace per line** (`/[ \t]+$/`) — a trailing-whitespace-only
   diff is not a content change.
4. **Trim a trailing blank-line run** to a single `\n` (append helper writes
   `"\n" + content + "\n"`, `learnings-cmd.ts:215`, so blank-line drift is normal
   and must not count).
5. `sha256` the result.

**Therefore:**
- Date-line-only change → same hash → **flagged.** ✓ (acceptance: stale-bump flagged)
- Any added/removed/edited entry (Preferences, Learnings, Do-Not-Repeat,
  Decision Log) → different hash → **not flagged.** ✓ (acceptance: real change passes)
- Whitespace-only / EOL-only diff → same hash → not flagged (and also not a date
  bump, so nothing reported). Correct — that is not theater.

**False-positive risk:** essentially nil for the "real change passes" direction —
any substantive byte change in the body changes the hash. The only residual risk
is a *legitimate* date bump that intentionally accompanies a non-content event
(e.g. "I reviewed it and it's still true, no edits") — but that **is** the pattern
the PRD bans by name (principle 4), so flagging it is the desired behavior, not a
false positive. If the team later wants a "reviewed, no change" affordance, that's
a separate metadata field, out of R9 scope.

## Touch-points & acceptance criteria

**Build order (dependency-respecting):**

1. **`src/cli/learnings-cmd.ts`** — after the merge append loop (after line 271),
   recompute the normalized body hash of `cerebrum.md` and write
   `.wolf/cerebrum-freshness.json` (`captured_by: "learnings-merge"`). Add a small
   shared helper for `stripDateLine`/`normalize`/`hashBody` (export from a CLI util
   so both files use the same logic).
2. **`src/cli/status.ts`** — add the freshness check (after the Anatomy block,
   ~line 131): read cerebrum + sidecar, bootstrap-if-missing, flag if
   `bodyHash` matches sidecar but date differs. Output a `✗`/`⚠` line, e.g.
   `⚠ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`.
3. **`src/templates/wolf-gitignore`** — add `cerebrum-freshness.json` to the
   gitignored runtime set (alongside token-ledger.json/cron-state.json), per R4's
   "one authoritative ignore list." Verify against the R4 documented `git ls-files`
   set.
4. **Tests (`tests/cli/`)** — mirror the existing `tests/cli/init.test.ts` layout:
   - date-only bump on identical body → flagged
   - any body content change → not flagged
   - trailing-whitespace-only / CRLF-only diff → not flagged
   - missing sidecar (fresh clone) → bootstrap, no flag
   - `learnings merge` writes/refreshes the sidecar hash
5. **(Optional) dashboard** — `CerebrumViewer.tsx:17` already shows `lastUpdated`;
   a freshness-theater badge could surface there later, but it is not required by
   the R9 acceptance criterion.

**Reuse, don't reinvent:**
- Date extraction regex: `/Last updated:\s*(.+)/` (already in `file-parsers.ts:89`).
- Hashing: `crypto.createHash("sha256")` (already used at `worktree-helper.ts:82`,
  `post-write.ts`).
- JSON read/write: `readJSON`/`writeJSON` from `src/utils/fs-safe.ts` (used
  throughout `status.ts`/`token-ledger.ts`); guard the write with `withFileLock`
  (`src/hooks/wolf-lock.ts`) since `cerebrum.md` and its sidecar may see
  concurrent merges (CLAUDE.md concurrency rule).

**Acceptance criteria (R9, restated for the planner):**
- A `cerebrum.md` "Last updated" change with an unchanged normalized body **is
  flagged** in `openwolf status`.
- A real content change (any section entry added/edited/removed) is **not
  flagged**, even if the date also changed.
- Trailing-whitespace-only and EOL-only diffs are **not** treated as content
  (not flagged, not theater).
- A fresh clone (no sidecar) **bootstraps silently** and does not false-flag.
- `git ls-files .wolf/` does not include `cerebrum-freshness.json`.

## Sources

- `src/templates/cerebrum.md:1-24` — template structure + `> Last updated:` marker (HIGH, curated source).
- `src/cli/learnings-cmd.ts:150-279` — `learningsMergeCommand` is the sole writer; append-only, never touches the date line (HIGH).
- `src/cli/status.ts:8-146` — `statusCommand`; wolfDir resolution to mainRepoRoot, ledger at sessions/<worktreeId>, insertion point for the check (HIGH).
- `src/dashboard/app/lib/file-parsers.ts:86-104` — existing `parseCerebrum` + `Last updated` regex to reuse (HIGH).
- `src/tracker/token-ledger.ts:46-86` — ledger shape + per-worktree path; rationale for NOT co-locating the baseline (HIGH).
- `src/hooks/post-write.ts:3`, `wolf-json.ts:3`, `worktree-helper.ts:82` — `node:crypto`/`createHash` already in hooks → SHA-256 is dependency-free and hook-safe (HIGH).
- `PRD-OpenWolf-Shared-Context-and-Curation.md` §3.3, §5 principle 4, §6 R9 — freshness-theater evidence + ban + acceptance (HIGH).
- `.planning/PROJECT.md` D-15 (pull-based status, stop hook = capture only), §Hard constraints (framework-blind, no hook deps) (HIGH).
- `CLAUDE.md` — hook isolation, no-deps-in-hooks, `learnings merge` sole writer, `updateJSON`/`withFileLock` concurrency rule (HIGH).
