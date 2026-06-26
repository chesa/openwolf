# Phase 12: Framework-Blind Curation Machinery - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

> **Auto-mode note:** This context was captured under `--auto` (single pass).
> Every gray area below was resolved interactively during the preceding
> `--assumptions` discussion — the user issued the four load-bearing
> architectural calls directly (R7a hook role, R9 status bootstrap exception,
> the cerebrum hashing rule, and the `learnings check` stderr rendering);
> `--auto` selected the recommended option for the remaining mechanical
> choices. No decision here is a blind default — each is either user-locked or
> the documented house pattern carried forward from Phases 9–11.

<domain>
## Phase Boundary

Ship the **curation discipline** that keeps committed shared context owned and
current. Three mechanisms, all framework-blind (name no execution layer, no VCS
or CI host — C1) and dependency-free on the hook path (C2):

1. **R7a — continuous capture.** The universal Claude Code `stop` hook becomes
   *structural lifecycle insurance*: when a session mutated code but the model
   wrote no formal `proposed-learnings.md`, the hook calls `appendProposal()` to
   drop a **stub** into the session staging dir so the promotion gate trips. The
   model still authors all *semantic* learning content (driven by
   `OPENWOLF.md` / `claude-rules-openwolf.md`); the hook only guarantees a
   breadcrumb exists.
2. **R7b — promotion-gate primitive.** A new `openwolf learnings check`
   subcommand (exit `0` clean / `1` pending / `2` operational error) plus a
   pending-count line in `openwolf status`, both routed through the shared
   `collectAllEntries()`. OpenWolf ships the primitive; consumers wire it to
   their own Git/PR boundary (pre-push / Pipelines / Actions) **in docs only**.
3. **R9 — freshness integrity.** A `> Last updated:` bump on `cerebrum.md` with
   no real content delta ("freshness theater") is flagged in `openwolf status`
   via a `node:crypto` SHA-256 of the **normalized** cerebrum body, stored in the
   gitignored `.wolf/cerebrum-freshness.json` sidecar (line already reserved by
   Phase 9 / D-09-06). `status` stays read-only; the baseline updates only on
   sanctioned curation.

**In scope:**
- **Relocate** `collectAllEntries()` (today private in `src/cli/learnings-cmd.ts:92`)
  into a new dep-free `src/hooks/wolf-pantry.ts`; `status.ts` and
  `learnings-cmd.ts` import it as peers (kills the would-be CLI↔CLI import cycle).
- **Add** `openwolf learnings check` (exit-code contract + `--json` + `--quiet`)
  to the `learnings` command group in `src/cli/index.ts`.
- **Add** a pending-learnings count line to `openwolf status` (read-only).
- **Build** the R9 freshness module (`node:crypto`, dep-free): normalize-and-hash
  `cerebrum.md`, read/write `.wolf/cerebrum-freshness.json`, compare, flag in
  `status`. Bootstrap-on-missing.
- **Add** `openwolf learnings accept` — re-baseline the sidecar for blessed
  hand-edits to `cerebrum.md`.
- **Capture the baseline at `learnings merge`** (the sole content writer,
  `learnings-cmd.ts:150`) so a normal merge never trips the theater flag.
- **Wire** `appendProposal()` into the `stop` hook's `finalizeSession`
  (`src/hooks/stop.ts`), beside the surviving `checkForMissingBugLogs` /
  `checkCerebrumFreshness` calls Phase 11 leaves intact.
- **Exercise** `pnpm build:hooks` → `openwolf update` so the new `stop.ts`
  behavior is live in `.wolf/hooks/`.
- Unit + regression tests for the new module, the CLI surface, and the hook path.

**Out of scope (other phases / explicitly deferred):**
- **R10** (cerebrum provenance: per-entry date + source link) and **R12**
  (pantry-owner role + prune runbook) — deferred to a later rollout milestone
  (D-16).
- **Host wiring** — pre-push hooks, Bitbucket Pipelines, GitHub Actions snippets
  live **only in docs**, never in `src/` (C1 grep gate).
- The Phase 9 ignore-list line (already landed) and Phase 11 STATUS teardown
  (precondition, already landed) — this phase consumes them, does not redo them.

</domain>

<decisions>
## Implementation Decisions

### R7a — the `stop` hook is structural insurance, not a semantic author (USER-LOCKED)
- **D12-01:** The `stop` hook **cannot** guess *what* was learned and must
  **never** synthesize a heuristic "learning" from file diffs. Its sole job is
  lifecycle insurance: ensure a staging breadcrumb exists so the promotion gate
  forces human curation. The **model** owns all semantic content (per
  `OPENWOLF.md` / `claude-rules-openwolf.md`); the hook is a fallback only.
  *(This reverses the tempting "hook authors a fallback proposal" reading — it
  was explicitly rejected as a dangerous trap.)*
- **D12-02:** **Stub trigger condition.** In `finalizeSession`, after the
  existing checks, stage a stub **only when both**: (a) the session mutated ≥1
  **code file** (reuse the non-`.wolf/`, non-`.tmp` "code writes" filter that
  Phase 11's deleted `checkStatusFreshness` used — same predicate, new purpose),
  **and** (b) the model wrote **no** `proposed-learnings.md` this session (the
  staging file is absent or empty in the current session dir). If the model
  already staged rich learnings, the hook does nothing.
- **D12-03 (idempotency — flagged for planner):** The `stop` hook can fire more
  than once per session (`stop_count`). The stub append MUST be idempotent — do
  not append a fresh stub on every stop. Guard on "a stub for this session does
  not already exist."
- **D12-04 (capture path is dep-free — C2):** R7a reuses the **already-exported**
  `appendProposal()` (`src/hooks/wolf-files.ts:89`, re-exported via
  `shared.ts:16`). No new hook import; `tsc --noEmit -p tsconfig.hooks.json` must
  stay clean.

### R7a/R7b — stub-vs-parser grammar reconciliation (KEY OPEN DESIGN POINT)
- **D12-05:** `appendProposal(target, content)` today writes a
  `## <ISO> → <cerebrum|anatomy>` block, and `parseProposals` (`learnings-cmd.ts:18`)
  **only** recognizes that grammar with `target ∈ {cerebrum, anatomy}`; anything
  else is skipped as "unparseable" with a stderr warning. A bare
  `### Staged Session Metadata` stub would therefore **not be counted** by a
  parser-based `collectAllEntries()`, defeating the gate.
  **Invariant the design MUST satisfy:** a stub the hook writes **must trip
  `openwolf learnings check` (exit 1)** and surface in the `status` count. How to
  satisfy it is research/planner's call (see Claude's Discretion) — the invariant
  is locked, the mechanism is not.

### R7b — `learnings check` output contract (USER-LOCKED rendering)
- **D12-06:** New subcommand `openwolf learnings check` under the existing
  `learnings` group (`src/cli/index.ts:169`), alongside `merge`. Exit codes:
  **`0`** clean (no pending), **`1`** pending uncurated staging, **`2`**
  operational error (unreadable sessions dir, etc.). Decided as a dedicated
  subcommand, not a `--check` flag (D-19 — keeps the namespace clean, scales to
  future `learnings list/prune`).
- **D12-07 (three clean output channels):**
  - **stderr (human, on pending):** a one-line headline count, then a **bounded**
    bulleted list of blocking sessions with per-session pending counts (cap ≈ 5,
    then `… + N more sessions`), then a concrete remediation line
    (`Run \`openwolf learnings merge\` …`). Example:
    `⚠ 7 uncurated learnings pending across 3 sessions:` / `  • <session> (4)` / …
  - **stdout (machine):** **clean** — emits raw JSON **only** under `--json`
    (full per-session / per-entry detail goes here, never to stderr).
  - **`--quiet` (CI):** mutes both streams; rely solely on the exit code.
- **D12-08:** Both `learnings check` and the `status` pending count are routed
  through the **same** `collectAllEntries()` (D-19) — one source of truth for
  "what is pending," no divergent counting logic.

### Shared module extraction (resolves the import cycle)
- **D12-09 (USER-LOCKED home):** Move `collectAllEntries()` out of
  `src/cli/learnings-cmd.ts` into a new **`src/hooks/wolf-pantry.ts`**. Both
  `status.ts` and `learnings-cmd.ts` import it as a **peer dependency**, avoiding
  a CLI↔CLI cycle. Naming follows the established `wolf-*.ts` family
  (`wolf-ignore.ts`, `wolf-lock.ts`, `wolf-json.ts`, `wolf-files.ts`).
- **D12-10 (C2 by location):** Because `wolf-pantry.ts` lives under `src/hooks/`
  it is in the hook build (`tsconfig.hooks.json`) and therefore **must be
  dependency-free** — `node:` builtins only, no `node_modules` import. This is a
  feature, not a constraint to fight (mirrors the `wolf-ignore.ts` precedent,
  D10-02). Re-export via `shared.ts` **only** what a hook actually consumes;
  `collectAllEntries` is CLI-only, so do **not** pollute the barrel with it
  (mirrors D10-09 — keep low-level/CLI-only surface out of `shared.ts`).

### R9 — freshness hashing & the normalization razor (USER-LOCKED)
- **D12-11:** Hash with `node:crypto` `createHash("sha256")` over a **normalized**
  cerebrum body. Normalization razor (locked): strip the `> Last updated:` line
  entirely (`/^>\s*Last\s+updated\s*:.*$/gim`), then collapse **all** whitespace
  (`/\s+/g → ""`), then trim. A date-only bump changes **0** normalized bytes ⇒
  identical hash ⇒ `status` flags "freshness theater." A real content change
  changes the hash ⇒ no flag.
- **D12-12:** Sidecar is `.wolf/cerebrum-freshness.json` — gitignored, line
  already reserved by Phase 9 (D-09-06) as "local integrity state / last
  *sanctioned* content baseline / bootstrap-on-missing," **not** "regenerated by
  scan." This phase fills in the engine behind that reserved line.

### R9 — baseline write discipline (USER-LOCKED, D-20)
- **D12-13:** Exactly **three** sanctioned baseline writers, no more:
  1. **`learnings merge`** — the sole content writer; re-baseline automatically
     after it appends to `cerebrum.md` (`learnings-cmd.ts:150` flow).
  2. **`learnings accept`** — new explicit affordance for blessed hand-edits to
     `cerebrum.md` (developer edited cerebrum directly, not via merge).
  3. **Bootstrap-on-missing** — see D12-14.
- **D12-14 (`status` read-only + the ONE bootstrap exception — USER-LOCKED):**
  `openwolf status` **never mutates** an existing sidecar — it detects and flags
  only. The **single** exception: if `.wolf/cerebrum-freshness.json` is **entirely
  absent** (fresh clone — the sidecar is gitignored, but the committed
  `cerebrum.md` on disk is inherently *sanctioned* because it is part of the git
  tree), `status` self-heals by computing the pristine baseline and writing the
  initial sidecar. If the sidecar **exists**, `status` is strictly read-only and
  may flag but never overwrite. "Baseline" = *last sanctioned content*, not *last
  content a `status` run happened to observe*.

### Verification gates (carried forward, no-regression)
- **D12-15:** `grep -rIiE 'bitbucket|github|pipelines|pre-push' src/` returns
  **zero** and `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli`
  returns **zero** (C1) — host wiring and execution-layer names live only in docs.
- **D12-16:** `tsc --noEmit -p tsconfig.hooks.json` clean (C2). After the
  `stop.ts` edit, run `pnpm build:hooks` → `node dist/bin/openwolf.js update` so
  `.wolf/hooks/stop.js` reflects R7a (edits to `src/hooks/` are inert until
  copied — same discipline STATE.md flags for Phases 10/11). Full `pnpm test`
  green. Version already `1.3.0-beta` satisfies the ≥ minor bump; add a changelog
  entry (format change + new API).

### Claude's Discretion
- **The D12-05 stub-vs-parser mechanism**, bounded by the locked invariant "the
  stub must trip `learnings check` and show in the `status` count." Candidate
  approaches for research/planner to weigh: (a) a recognized metadata block
  grammar that `parseProposals` counts-but-flags-as-stub and `merge` refuses to
  fold into cerebrum/anatomy; (b) `collectAllEntries`/check treating *any*
  non-empty `proposed-learnings.md` as pending (presence-based) rather than
  strictly parseable entries; (c) a distinct staging filename for stubs that the
  gate counts. Pick the lowest-noise option that does not let a stub silently
  merge into `cerebrum.md`.
- Whether the R9 hash util lives in `wolf-pantry.ts` or a sibling
  `wolf-freshness.ts` (must be dep-free / `node:crypto`-only either way).
- Exact `cerebrum-freshness.json` schema (e.g. `{ sha256, baseline_at }`).
- Exact `status` rendering of the freshness flag and pending count (must follow
  the existing plain `console.log` + `✓/✗/-` convention — **no ANSI/banner**,
  per the D11-07 house rule that `status` does not over-claim).
- Test file organization (new `tests/cli/learnings-check.test.ts`,
  `tests/hooks/wolf-pantry.test.ts`, freshness tests) vs. extending existing
  `tests/cli/learnings-cmd.test.ts` — see Code Insights.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement, roadmap & decision sources
- `.planning/REQUIREMENTS.md` §R7a, §R7b, §R9 — full requirement text, each
  `*Accept:*` clause, and the inline `→ D-19` / `→ D-20` decisions. Also §C1, §C2
  (the two hard constraints) at the top of the file.
- `.planning/ROADMAP.md` §"Phase 12" — the 4 success criteria; the `Depends on`
  edge (Phase 9 for the R9 ignore line; Phase 11 so R7a lands on a sterile
  `stop.ts` seam).
- `.planning/PROJECT.md` §Key Decisions — **D-19** (`learnings check` subcommand,
  not a flag), **D-20** (`status` read-only; baseline only via sanctioned
  curation), **D-18** (dep-free hook / `ignore`-only-in-scanner split — the C2
  precedent).
- `.planning/STATE.md` §Build-Order Dependency Edges — "R9 AFTER R4 (sidecar line
  must exist)"; "R11 before R7a (both edit `stop.ts`)"; the shared
  `build:hooks` → `openwolf update` copy step.

### Prior phase context this phase consumes
- `.planning/phases/11-framework-blind-resume-protocol/11-CONTEXT.md` — D11-05
  (`checkStatusFreshness` deleted; `checkForMissingBugLogs` +
  `checkCerebrumFreshness` survive — the exact seam R7a extends); D11-07 (`status`
  is color-free, key-value, no banner — the rendering rule R7b/R9 output must
  obey).
- `.planning/phases/10-hook-side-in-project-exclusion/10-CONTEXT.md` — D10-02 /
  D10-09 (`wolf-ignore.ts` precedent: dep-free `src/hooks/` module, selective
  `shared.ts` re-export — the template for `wolf-pantry.ts`).
- `.planning/phases/09-tracking-hygiene-one-authoritative-ignore-list/09-CONTEXT.md`
  — D-09-06 (`cerebrum-freshness.json` ignore line already reserved + the exact
  "local integrity state, not regenerated-by-scan" comment intent R9 must honor).

### Source files (the work surface)
- `src/cli/learnings-cmd.ts` — `collectAllEntries()` (:92, **relocate**),
  `parseProposals` (:18, the grammar D12-05 must reconcile with), `ProposalEntry`
  (:8), `learningsCommand` (:119), `learningsMergeCommand` (:150, the sole content
  writer where the R9 baseline is captured; appends to cerebrum/anatomy at
  :214–219).
- `src/cli/status.ts` — read-only command; top env block (`Mode:` ~:28–33, plus
  Phase 11's `Execution layer:` line), token-stats block (~:115), anatomy line
  (~:129). Add the pending-learnings count + freshness flag here; preserve
  read-only-ness (except the D12-14 bootstrap).
- `src/hooks/stop.ts` — `finalizeSession` (:52); surviving `checkForMissingBugLogs`
  (:67/:206) and `checkCerebrumFreshness` (:70/:269) calls — R7a's
  `appendProposal()` injects beside them; the non-`.wolf`/`.tmp` "code writes"
  filter pattern lives at :234–239 (reuse for D12-02). `stop_count` /
  `SessionData` (:18) for the D12-03 idempotency guard.
- `src/hooks/wolf-files.ts` — `appendProposal(target, content)` (:89); writes to
  `getSessionDir()/proposed-learnings.md` — same dir `collectAllEntries` scans.
- `src/hooks/shared.ts` — thin barrel (:16 re-exports `appendProposal`); add
  `wolf-pantry.ts` re-exports here **only** if a hook consumes them.
- `src/cli/index.ts` — `learnings` command group (:169), `merge` subcommand (:182)
  — register `check` and `accept` here.
- `src/templates/wolf-gitignore` — the reserved `cerebrum-freshness.json` line
  (Phase 9); confirm it covers the sidecar this phase writes.

### Conventions & tests
- `CLAUDE.md` §"Development Gotchas" — hooks cannot import `src/utils/` at runtime
  (`shared.ts` is the self-contained copy); `build:hooks` → `openwolf update` copy
  discipline; `withFileLock` not reentrant, use `updateJSON()` for `.wolf/` JSON
  read-modify-write; buglog is append-only NDJSON; version-bump policy.
- `.planning/codebase/TESTING.md` — Vitest, `tests/` mirrors `src/`; hook tests
  trap `process.exit` + `vi.mock` `shared.js`.
- `.planning/codebase/CONVENTIONS.md` — `kebab-case.ts`, `UPPER_SNAKE_CASE`
  consts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`collectAllEntries()`** (`learnings-cmd.ts:92`) — already does exactly the
  scan `learnings check` and the `status` count need (iterate `sessions/*/`, parse
  each `proposed-learnings.md`). Relocating it to `wolf-pantry.ts` is a *move*,
  not a rewrite — both consumers then import the one function (D-19's "both routed
  through `collectAllEntries()`").
- **`appendProposal()`** (`wolf-files.ts:89`, exported via `shared.ts`) — already
  the staging-write primitive; R7a calls it, adding no new hook dependency (C2
  stays clean).
- **`checkCerebrumFreshness()`** (`stop.ts:269`) — the existing pattern for an
  optional `.wolf/`-file-driven `stderr` nudge (stat a file, branch, emit one
  plain line, swallow errors). The R7a capture block sits beside it and should
  match its defensive shape. *(Note: this mtime-based nudge is distinct from R9's
  content-hash freshness check — R9 is the rigorous successor, but the hook-side
  nudge is out of scope to remove here.)*
- **`updateJSON()` / `withFileLock`** (`wolf-json.ts` / `wolf-lock.ts`) — the
  concurrency-safe `.wolf/` JSON read-modify-write path for the
  `cerebrum-freshness.json` sidecar; `learningsMergeCommand` already uses
  `withFileLock` for cerebrum/anatomy appends (:218).

### Established Patterns
- **`wolf-*.ts` dep-free hook modules** re-exported through the thin `shared.ts`
  barrel — `wolf-pantry.ts` joins this family (D10 precedent). Re-export only the
  hook-consumed surface; keep CLI-only functions out of the barrel.
- **`status.ts` is color-free** — plain `console.log`, three markers (`✓/✗/-`),
  no ANSI lib. The pending count + freshness flag must follow this (D11-07);
  introducing a banner/color would be a rejected new pattern.
- **Hooks run from `.wolf/hooks/`** — every `stop.ts` edit needs
  `pnpm build:hooks` → `openwolf update` to go live (D12-16).
- **Exit-code-as-contract** — `learnings check`'s `0/1/2` is a new but
  conventional CLI primitive; clean stdout / human stderr / `--quiet` is the
  standard Unix split.

### Integration Points
- `stop.ts:finalizeSession` — the single R7a injection site, beside the two
  surviving check calls Phase 11 left clean.
- `learnings-cmd.ts:150` (`learningsMergeCommand`) — the sole cerebrum content
  writer; the R9 baseline capture hooks in right after the successful append.
- `status.ts` — gains two read-only reads (pending count via `wolf-pantry`,
  freshness compare via the R9 module) plus the one bootstrap-on-missing write.
- `src/cli/index.ts:169` — the `learnings` group where `check` + `accept` register.

</code_context>

<specifics>
## Specific Ideas

- **Decouple semantic generation from automated execution.** This is the
  governing principle of R7a: the model (semantic) and the hook (structural) have
  strictly separated jobs. The hook never writes a "learning" — only a
  gate-tripping breadcrumb. Recorded so the planner does not let the hook drift
  into content synthesis.
- **The normalization razor is the whole point of R9.** Stripping the timestamp
  line + collapsing whitespace is what makes a date-only bump a 0-byte delta. The
  test pair that *proves* it: (1) bump only `> Last updated:` → flagged; (2) add a
  real cerebrum entry → not flagged.
- **"Baseline = last *sanctioned* content."** Not "last observed." This phrasing
  (D-20) is the reason `status` must not re-baseline on a plain read — doing so
  would let theater launder itself the moment someone runs `status`.
- **Bounded stderr list** prevents log pollution on busy multi-worktree repos
  while still telling the engineer *which* branch/worktree holds the uncurated
  staging file — solving the "blind block" problem at the pre-push boundary.

</specifics>

<deferred>
## Deferred Ideas

- **R10** — cerebrum entry provenance (per-entry date + source link) and the
  documented monthly prune ritual. Deferred to a later rollout milestone (D-16);
  behavioral/metadata, not core engine.
- **R12** — explicit pantry-owner role + curation runbook. Deferred (D-16).
- **Acting on the gate** — OpenWolf shipping its own pre-push hook / Pipelines /
  Actions step. Permanently out: the gate is a *primitive*; host wiring is a docs
  concern (C1). Not a future phase — a standing boundary.
- **Removing the `stop.ts` mtime-based `checkCerebrumFreshness` nudge** now that
  R9 provides a rigorous content-hash check — plausible cleanup, but not in R7a/
  R7b/R9's scope; note for a future hygiene pass, do not fold in here.

None of the above is scope creep introduced here — each is pre-mapped to its
owning milestone/phase by REQUIREMENTS.md (D-16) and the C1 constraint.

</deferred>

---

*Phase: 12-framework-blind-curation-machinery*
*Context gathered: 2026-06-25*
