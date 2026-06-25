# Phase 8: Verify Landed P0 Hygiene - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a **commit↔behavior verification record** proving that the 6 already-shipped P0 hygiene fixes still behave per their PRD acceptance criteria, replayed against the `acme_translators` field data. This is **evidence, not code** — none of the 6 behaviors is re-implemented.

The 6 behaviors and their `develop-preview` commits:

| Behavior | What it does | Commit |
|----------|--------------|--------|
| **R1** | Untrack `anatomy.md` (shipped `.wolf/.gitignore`) | `cac925a` |
| **R2** | Self-heal scan — regenerate `anatomy.md` when missing/stub | `c430a9b` |
| **R3** | Post-write hook out-of-project `../` guard | `cac925a` |
| **R5** | Buglog auto-detect gated to code files | `9f63395` |
| **Q1** | Opt-in `respect_gitignore` for the scanner | `3ef255c` |
| **Q2** | Nested-path + glob `exclude_patterns` honored | `2f3e1f6` |

**In scope:** verifying these 6 behaviors; recording the commit↔behavior map; confirming R3's `../` guard and R5's exclude semantics still hold (the foundation Phase 10/R6 extends).

**Out of scope (new capabilities, other phases):** R4 ignore-list correction (Phase 9), R6 hook-side in-project exclusion (Phase 10), R11 STATUS.md removal (Phase 11), R7a/R7b/R9 curation machinery (Phase 12). The post-write hook applying **no** in-project exclusion (PRD evidence E6) is the R6 gap — NOT a P0-verification failure.

</domain>

<decisions>
## Implementation Decisions

### Evidence depth — Hybrid (read + targeted runtime)
- **VER-D1:** Prove behaviors at two depths depending on what's at stake downstream.
  - **Static ground-truth read** for **R1, Q1, Q2** — confirm the effect from acme's committed artifacts + git log + commit diffs (PRD Source-A approach). Q2's pre/post is corroborated by PRD evidence **E6** (the leak that survived an explicit exclude) and **E7** (`/tmp` review scratch scanned in).
  - **Dynamic runtime** for **R2 (self-heal), R3 (`../` guard), R5 (buglog gate)** — actually execute the current `src/` code path and observe the result, because these are the foundation Phase 10 (R6) builds on and must be re-proven live, not merely observed in history.

### Deliverable form — VERIFICATION.md + regression tests for R3/R5 only
- **VER-D2:** The phase leaves behind:
  1. `08-VERIFICATION.md` — the commit↔behavior record, PASS/FAIL + evidence per behavior.
  2. Permanent vitest regression tests for **R3's `../` guard** and **R5's exclude/code-file semantics** specifically — the two foundations Phase 10 extends. Tests are *evidence*, not feature re-implementation, so they satisfy "no re-implementation" while giving Phase 10 a safety net.
- **Note for planner:** `tests/hooks/post-write.test.ts` ALREADY exists and commit `9f63395` (R5) added ~32 lines of tests there; both R3 and R5 live in `src/hooks/post-write.ts`. **Extend existing coverage — do not duplicate.** Audit what's already asserted before adding.

### On failure — record gap + file a follow-up
- **VER-D3:** Verification reports the truth (PASS/FAIL per behavior). A FAIL is recorded in `08-VERIFICATION.md` AND filed as a follow-up item (buglog entry and/or a noted backlog item); the phase still **completes as a verification phase**. Fixing a failing P0 behavior is a separate decision — this phase never re-implements (ROADMAP success criterion 4).

### Replay target — frozen snapshot fixture
- **VER-D4:** Copy the relevant acme state into a scratch fixture and run the **current `src/` behavior** against it — isolated, reproducible, and non-mutating to Brian's `../acme_translators` working copy.
  - Rationale: acme's *installed* hooks predate the variant's `withFileLock` hardening (PRD line 146), so we verify current source behavior against acme **data**, not acme's stale installed hooks.
  - Reconciliation with VER-D1/VER-D2: the frozen snapshot grounds the **field-replay evidence**; the R3/R5 **regression tests** are synthetic-input unit tests (e.g. call `recordAnatomyWrite('../x')`, assert skipped). The two are complementary, not redundant.

### Claude's Discretion
- Exact snapshot contents (which acme artifacts to copy: `anatomy.md`, `config.json`, buglog, `.gitignore`, `git log` excerpts) — researcher/planner to determine from the acceptance criteria.
- VERIFICATION.md table/section structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Acceptance criteria & field evidence (PRIMARY)
- `.planning/tmp/PRD-OpenWolf-Shared-Context-and-Curation.md` — the acceptance-criteria source for VER-01.
  - §284 **P0 — Stop the bleeding** — R1/R2/R3/R5 definitions + accept criteria.
  - §92 **Source A** — disk/git ground-truth method (the static-read basis for VER-D1).
  - Evidence table **E6** (leak survived explicit exclude → Q2 bug + hook applies no exclusion) and **E7** (`/tmp` scratch scanned in) — corroborate Q2 static read.
  - §376 — the acme replay command block.
- `.planning/REQUIREMENTS.md` — **VER-01** requirement + accept criterion; Hard Constraints C1 (framework-blind) / C2 (no hook deps).
- `.planning/ROADMAP.md` — **Phase 8** goal + Success Criteria 1–4 (esp. #3: R3 guard + R5 semantics must be confirmed; #4: evidence not code).

### Commits under verification (`develop-preview`)
- `cac925a` — R1 (untrack anatomy.md) + R3 (`../` guard). *"fix(anatomy): stop leaking machine-local paths into committed anatomy.md"*
- `c430a9b` — R2 self-heal. *"feat(hooks): self-heal anatomy.md on session start when missing/stub (R2)"*
- `9f63395` — R5 buglog code-file gating. *"fix(hooks): skip auto bug-detection on non-code files"*
- `3ef255c` — Q1 `respect_gitignore`. *"feat(scanner): opt-in respect_gitignore for the anatomy scanner"*
- `2f3e1f6` — Q2 nested/glob excludes. *"fix(scanner): honor nested-path and glob exclude_patterns"*

### Field data (Brian's machine only)
- `/Users/bfs/bitbucket/acme_translators` — the field deployment repo (disk/git ground truth; SNAPSHOT source, do not mutate).
- `~/.claude/projects/-Users-bfs-bitbucket-acme-translators*/` — 225 session transcripts (Source B).

### Source under verification
- `src/hooks/post-write.ts` — R3 `../` guard + R5 buglog code-file gate (`recordAnatomyWrite`).
- `src/hooks/wolf-selfheal.ts` + `src/hooks/session-start.ts` — R2 self-heal scan.
- `src/scanner/anatomy-scanner.ts` — Q1 `respect_gitignore` + Q2 `globToRegExp` / `shouldExclude` / `matchesPattern`.

### Existing tests (extend, don't duplicate)
- `tests/hooks/post-write.test.ts` — already covers some R3/R5 behavior (added by `9f63395`).
- `tests/scanner/anatomy-scanner.test.ts` — scanner exclude/gitignore coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/hooks/post-write.test.ts` + `tests/scanner/anatomy-scanner.test.ts` — existing vitest suites to extend with the R3/R5 regression tests (VER-D2). `tests/` mirrors `src/`; framework is vitest (`npx vitest run <file>`).
- `src/hooks/wolf-selfheal.ts` — the R2 self-heal entry point; can be invoked directly in a dynamic-runtime check against the snapshot fixture.
- Scratch fixtures belong in the session scratchpad / a `tests/`-local fixture dir, never in `../acme_translators`.

### Established Patterns
- Hooks are framework-blind and exit 0 silently when `.wolf/` is absent (`ensureWolfDir()` in `src/hooks/shared.ts`) — runtime checks must seed a `.wolf/` in the fixture first.
- Hooks cannot import from `src/utils/` at runtime; `src/hooks/shared.ts` is the self-contained utility copy.
- Constraint reminder (not this phase's deliverable, but don't violate): C2 — no `node_modules` imports reachable from the hook build (`tsc --noEmit -p tsconfig.hooks.json` must stay clean).

### Integration Points
- The verification operates against current `src/` (not `dist/` or `.wolf/hooks/`) per VER-D4 — verifying source behavior, not the stale installed acme hooks.
- This phase writes only `.planning/phases/08-.../08-VERIFICATION.md` and new/extended assertions in `tests/hooks/` + `tests/scanner/`. No `src/` behavior changes.

</code_context>

<specifics>
## Specific Ideas

- Q2 verification should explicitly reference PRD evidence **E6** — `.claude/plans/tmp.pwYfhCNiar` was in `config.json:42` `exclude_patterns` yet appeared in the committed map — as the concrete pre-fix field symptom the `2f3e1f6` fix addresses.
- "Replayed against the acme repo" (VER-01) is satisfied by the frozen-snapshot fixture derived from `../acme_translators`, not by mutating the live working copy.

</specifics>

<deferred>
## Deferred Ideas

- **Full P0 regression suite (all 6 behaviors)** — considered for the deliverable; scoped down to R3/R5 only (the Phase-10 foundation) per VER-D2. R1/R2/Q1/Q2 get report-level evidence, not permanent tests, this phase. Revisit if a later phase needs them locked.
- The post-write hook applying **no** in-project exclusion (PRD E6) — this is the R6 gap, owned by **Phase 10**, not a Phase 8 failure.

</deferred>

---

*Phase: 8-verify-landed-p0-hygiene*
*Context gathered: 2026-06-25*
