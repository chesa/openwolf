---
phase: "concurrency-phase1 (superpowers/SDD, not a GSD phase)"
phase_name: "Shared-Checkout Concurrency — Phase 1 (Pillars A+B)"
project: "OpenWolf (CHESA fork)"
generated: "2026-06-23"
counts:
  decisions: 7
  lessons: 5
  patterns: 5
  surprises: 5
source_basis: "Sourced from superpowers/SDD artifacts (no GSD phase dir exists): docs/superpowers/specs/2026-06-23-shared-checkout-concurrency-design.md, docs/superpowers/plans/2026-06-23-shared-checkout-concurrency-phase1.md, .superpowers/sdd/progress.md (ledger), per-task review verdicts, and the final whole-branch review."
missing_artifacts:
  - "GSD *-PLAN.md / *-SUMMARY.md (work was superpowers-tracked, not GSD)"
  - "VERIFICATION.md / UAT.md (not produced; verification was the per-task reviews + cross-process e2e test)"
---

# Phase Learnings: Shared-Checkout Concurrency — Phase 1 (Pillars A+B)

> Delivered on branch `feat/concurrency-phase1` (PR #18 → develop), 15 commits, 112 tests, final whole-branch review passed with fixes.

## Decisions

### Buglog moves to append-only NDJSON
`.wolf/buglog.json` (single JSON array, sequential `bug-NNN` ids) → `.wolf/buglog.ndjson` (one JSON object per line).

**Rationale:** Conflict-free concurrent appends (different lines → clean git merges for 3-4 devs committing the buglog), and a single `appendFileSync` of one line is atomic on local POSIX — so the hot path needs no lock at all.
**Source:** design spec Pillar B1; plan Global Constraints.

### Append-only, no in-place occurrence bump (compaction deferred)
Recurrence appends a fresh entry; `occurrences` stays 1. A `bug compact` command is a deferred Phase-1.5 follow-up.

**Rationale:** Keeps every buglog write lock-free and merge-clean; in-place occurrence bumping would reintroduce a read-modify-write (and a cross-context lock requirement).
**Source:** plan B3 (chose B3a); final review (accepted the dormant `occurrences` UI badge as a tracked follow-up).

### `updateJSON` extracts a lock-free `_writeJSONUnsafe` (lock taken once)
`withFileLock` is non-reentrant; `writeJSON` and `updateJSON` both delegate to `_writeJSONUnsafe` and each take the lock exactly once.

**Rationale:** A naive `updateJSON` that called `writeJSON` inside its own lock would re-acquire the same per-file lock → `EEXIST` → burn the retry budget → spurious "proceeding unlocked" on every call. Rejected making the lock reentrant or going async (would ripple through the whole synchronous hook codebase).
**Source:** plan A1; Task 1 review (#1).

### Collision-free UUID-derived bug ids
`bug-${crypto.randomUUID().slice(0,8)}` instead of `bug-${bugs.length+1}`.

**Rationale:** Sequential ids derived from array length produce duplicates across concurrent processes; UUID-derived ids need no coordination.
**Source:** plan B2.

### Pillar C (propose-mode) deferred to Phase 2
Phase 1 = Pillars A+B (mechanical, high-value lock + NDJSON); Pillar C (propose-mode for shared cerebrum/anatomy markdown) is its own later cycle.

**Rationale:** A+B deliver the concurrency-safety win without the larger UX change of propose-mode (which alters the core auto-learning loop and adds a review/merge surface).
**Source:** design spec sequencing; plan "Recommended sequencing".

### `_session.json` RMW is locked, but semantic session-conflation is an accepted limitation
The reads/writes are wrapped in `updateJSON`, but in a single shared checkout two concurrent sessions still share one `_session.json`.

**Rationale:** Locking prevents corruption/lost-updates; the file only drives in-session nudges (not permanent accounting — the token-ledger stays correct). Fully separating concurrent sessions would need per-session-id namespacing (out of scope; worktree-per-dev avoids it).
**Source:** design spec A2 caveat; Task 4.

### Execute via subagent-driven-development, not /gsd-import
Ran the superpowers plan as-authored (fresh implementer + review per task) instead of importing into GSD.

**Rationale:** The plan was authored in superpowers' exact format; `/gsd-import` would re-ingest/re-shape it. (Tradeoff acknowledged: this milestone is therefore not tracked in `.planning/`.)
**Source:** session execution choice (finish-branch decision).

---

## Lessons

### In-process JS tests cannot demonstrate cross-process concurrency
A "concurrency" test that wraps synchronous functions in `Promise.resolve().then(...)` is a tautology: the microtask queue serializes them, so it passes WITH or WITHOUT the lock.

**Context:** Task 3's first concurrency test was permanently green under both locked and unlocked code. It was relabeled an honest "accumulation" test; the real guard is the cross-process e2e (spawned `node` children).
**Source:** Task 3 review + fix; Task 9b.

### `npm pack` honors a nested `.gitignore` and silently strips siblings
A file literally named `.gitignore` inside `src/templates/` (and its `cp`-copied `dist/templates/` twin) caused `npm pack` to strip 11 of 16 templates; the `files` allowlist did not override it. Result: a silently broken `openwolf init`.

**Context:** Surfaced in the readiness audit (earlier this session, PR #16). Template files must use plain names mapped via `TEMPLATE_NAME_MAP` in `init.ts`.
**Source:** rollout readiness audit; PR #16.

### The hooks compile boundary forces (and must guard) duplication
`tsconfig.hooks.json` (`rootDir: src/hooks`) means hooks cannot import `src/buglog/` or `src/utils/`. The NDJSON read/append logic therefore exists twice (`src/hooks/buglog-ndjson.ts` + `src/buglog/bug-tracker.ts`). DRY is impossible; a format-drift test guards the contract instead.

**Context:** Flagged pre-emptively to per-task reviewers so they wouldn't loop on "removable duplication"; the final review recommended (and got) a format-drift test.
**Source:** review #2; final whole-branch review.

### The advisory lock is best-effort, not a hard guarantee
Finite retry budget (5, jittered) then an UNLOCKED fallback. Cross-process `total_sessions === N` holds at modest N (verified to N=64 on this machine) but is not guaranteed under extreme contention. The append-only buglog path is the truly robust one.

**Context:** The e2e test uses N=8 for the lock case (large headroom) and documents the caveat.
**Source:** Task 9b; final review.

### A diff-only reviewer produces false positives about cross-file usage
Task 3's reviewer flagged `readJSON` as an "unused import" — but it was still used at a call site OUTSIDE the diff. The controller must verify reviewer claims against the working tree before acting.

**Context:** The import was genuinely removed two tasks later (Task 8) once its last consumer was replaced.
**Source:** Task 3 review (false positive, dismissed after verification).

---

## Patterns

### Lock-once read-modify-write: `updateJSON` + shared `_writeJSONUnsafe`
For a non-reentrant file lock, expose a lock-free internal write and have both the plain write and the RMW wrapper take the lock exactly once around it.

**When to use:** Any time concurrent processes do read→mutate→write on a shared JSON file and a naive lock would nest.
**Source:** plan A1; `src/hooks/wolf-json.ts`.

### Append-only NDJSON for concurrent-write logs
One object per line, single `appendFileSync(JSON.stringify(x)+"\n")`; readers split/parse line-by-line and skip blank/torn/corrupt lines.

**When to use:** Append-heavy logs that multiple processes (and git branches) write — gets conflict-free, lock-free, merge-clean writes.
**Source:** `src/hooks/buglog-ndjson.ts`, `src/buglog/bug-tracker.ts`.

### Format-drift test for mandated duplicate implementations
When a compile/runtime boundary forces two copies of a serializer, add a test asserting each side reads the other's output identically.

**When to use:** Any time you cannot DRY two implementations that must agree on an on-disk/wire format.
**Source:** `tests/buglog/ndjson-format-drift.test.ts` (final-review fix).

### Cross-process E2E concurrency: spawn-all-then-await-all real processes
Build the full array of `spawn(node, ...)` child promises FIRST, then `await Promise.all` — guarantees OS-level overlap. Drive the COMPILED modules, not in-process calls.

**When to use:** Proving a concurrency guarantee that single-threaded in-process tests cannot exercise.
**Source:** `tests/e2e-concurrency.test.ts` (Task 9b).

### Model-tiering in subagent-driven execution
Cheapest tier (haiku) for complete-code transcription tasks; standard (sonnet) for multi-file integration; most-capable (opus) for the critical E2E test design and the final whole-branch review.

**When to use:** Executing a well-specified plan task-by-task with subagents; saves cost without sacrificing the judgment-heavy steps.
**Source:** session execution (per superpowers SDD model-selection guidance).

---

## Surprises

### The plan listed a token-ledger write in `post-write.ts` that doesn't exist
The A2 conversion table had a phantom "post-write.ts token-ledger" row; post-write only writes `_session.json`. Caught by verifying before dispatching the task.

**Impact:** Avoided sending an implementer after a non-existent call site; scoped Task 3 to the two real ledger sites.
**Source:** Task 3 (pre-dispatch verification).

### `pre-write.ts` was an unlisted buglog reader
The plan's B4 reader table missed `pre-write.ts`, which still read the legacy `buglog.json`. The Task 9a implementer found and migrated it.

**Impact:** Would have left a reader pointing at a file that no longer exists; caught during migration, not in production.
**Source:** Task 9a report.

### An implementer subagent spontaneously created a git worktree and mis-landed a commit
Task 7's implementer committed on a branch off `main` (in a self-created worktree), then cherry-picked onto the feature branch. Required controller cleanup of the stray worktree/branch.

**Impact:** No lost work, but added a verification + cleanup step; subsequent dispatches were told explicitly to work on the current branch in the main checkout.
**Source:** Task 7 report; controller cleanup.

### The org monthly spend cap halted execution mid-run
A reviewer dispatch failed with "hit your org's monthly spend limit" after Task 2. The SDD ledger (`.superpowers/sdd/progress.md`) made the run fully resumable once the cap was lifted.

**Impact:** Zero rework on resume — proof of the ledger's value as a durable recovery map.
**Source:** session (Task 2 review interruption + resume).

### OpenWolf does not dogfood its own context
This repo's `.gitignore` excludes `.wolf/`, `.claude/`, AND `CLAUDE.md` — so none of OpenWolf's own AI-context is shared via git, and the worktree-sharing flow can't even be exercised here.

**Impact:** `.wolf/` learnings (buglog/cerebrum updates) and CLAUDE.md edits are local-only; notable gap for a tool whose pitch is shared team context.
**Source:** rollout readiness audit; revise-claude-md exercise.
