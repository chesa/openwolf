# Phase 12: Framework-Blind Curation Machinery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 12-framework-blind-curation-machinery
**Areas discussed:** R7a hook role, R9 status bootstrap, cerebrum hashing rule, `collectAllEntries()` extraction, `learnings check` output contract

> Captured under `--auto`. The four load-bearing decisions were resolved
> directly by the user during the preceding `--assumptions` discussion; `--auto`
> selected the recommended option for the remaining mechanical choices.

---

## R7a — role of the `stop` hook in capture

| Option | Description | Selected |
|--------|-------------|----------|
| Hook authors a heuristic/fallback proposal from file diffs | Hook inspects edits and writes a guessed "learning" entry | |
| Hook is structural insurance only; model owns semantic content | Hook drops a gate-tripping stub when code changed but no learning was staged | ✓ |

**User's choice:** Structural insurance only — the hook **cannot** know what was
learned and must never synthesize one. The model authors content; the hook
guarantees a breadcrumb so the promotion gate forces curation.
**Notes:** User explicitly flagged the "hook authors a fallback proposal" reading
as a dangerous trap. Stub fires only when (code mutated) AND (model wrote no
`proposed-learnings.md`). Surfaced the stub-vs-`parseProposals`-grammar tension as
the one open mechanism for research/planner (invariant: stub MUST trip
`learnings check`).

---

## R9 — `status` bootstrap-on-missing vs. strict read-only

| Option | Description | Selected |
|--------|-------------|----------|
| `status` always strictly read-only | Never writes the sidecar, even on fresh clone (no baseline ⇒ cannot flag) | |
| Read-only except bootstrap-when-absent | Self-heals only if sidecar entirely missing; committed `cerebrum.md` is sanctioned | ✓ |

**User's choice:** Read-only with the single bootstrap exception. If the sidecar
is absent (fresh clone — it is gitignored), `status` computes the pristine
baseline from the committed `cerebrum.md`. If it exists, `status` flags but never
overwrites.
**Notes:** Routine baseline updates stay confined to `learnings merge` +
`learnings accept`. "Baseline = last *sanctioned* content, not last observed"
(D-20).

---

## R9 — cerebrum content hashing rule

| Option | Description | Selected |
|--------|-------------|----------|
| Hash raw file bytes | SHA-256 over the whole file | |
| Normalization razor before hashing | Strip `> Last updated:` line, collapse all whitespace, then SHA-256 | ✓ |

**User's choice:** Normalization razor — strip the timestamp line
(`/^>\s*Last\s+updated\s*:.*$/gim`), collapse whitespace (`/\s+/g`), trim, then
hash. A date-only bump = 0 normalized-byte delta = identical hash = theater
flagged.
**Notes:** `node:crypto` only, no new dependency. Proven by a test pair
(date-only bump flagged; real content change not flagged).

---

## `collectAllEntries()` extraction home

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in `learnings-cmd.ts`, import from `status.ts` | CLI imports CLI — risks an import cycle through the hooks layer | |
| Relocate to `src/hooks/wolf-pantry.ts` (peer module) | Both `status.ts` and `learnings-cmd.ts` import it as peers | ✓ |

**User's choice:** Relocate to `src/hooks/wolf-pantry.ts`; both consumers import
as peers, no cycle.
**Notes:** Living under `src/hooks/` puts it in the hook build, so it is
dep-free by construction (C2) — mirrors the `wolf-ignore.ts` precedent. Re-export
through `shared.ts` only what a hook actually consumes.

---

## R7b — `learnings check` output contract

| Option | Description | Selected |
|--------|-------------|----------|
| Single-line total count to stderr | "N pending" and nothing more | |
| Headline + bounded bulleted session list + remediation | Count, then ≤5 blocking sessions w/ per-session counts, then the fix command | ✓ |

**User's choice:** Headline + bounded bullets (cap ≈ 5, then `… + N more`) + a
concrete remediation line to stderr; clean JSON on stdout only under `--json`;
`--quiet` mutes both and relies on the `0/1/2` exit code.
**Notes:** A bare count blocks without directing; the session/worktree ID is the
curation unit, mapping the failure straight onto `learnings merge`. Bounding
prevents log pollution on busy multi-worktree repos.

---

## Claude's Discretion

- The stub-vs-`parseProposals`-grammar mechanism (bounded by "stub must trip
  `learnings check`").
- Whether the R9 hash util lives in `wolf-pantry.ts` or a sibling
  `wolf-freshness.ts`.
- Exact `cerebrum-freshness.json` schema.
- Exact `status` rendering of the freshness flag / pending count (must stay
  plain `console.log` + `✓/✗/-`, no banner).
- Test file organization.

## Deferred Ideas

- R10 (cerebrum provenance + prune ritual) — later rollout milestone (D-16).
- R12 (pantry-owner role + runbook) — deferred (D-16).
- OpenWolf shipping its own pre-push/Pipelines/Actions step — permanently out
  (gate is a primitive; host wiring is docs-only, C1).
- Removing the `stop.ts` mtime-based `checkCerebrumFreshness` nudge now that R9
  supersedes it — future hygiene pass, not this phase.
