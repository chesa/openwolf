---
title: Upstream v2.x divergence analysis
date: 2026-08-24
context: /gsd-explore — scoping the reconciliation strategy (rebase vs cherry-pick vs reimplement) before committing to a milestone
---

# Upstream v2.x Divergence Analysis

Measured 2026-08-24 against `upstream/main` (`cytostack/openwolf`, last updated
2026-08-23). Fork at `1.3.3-beta` on `develop`. Upstream tagged `v2.4.1`
2026-08-21; npm ships `2.5.0`.

**Decision reached:** stay forked, reset the baseline onto v2.5.0. Not a rebase,
not a cherry-pick campaign.

## The gap is smaller than the commit count suggests

Merge base is `f68be48` (2026-04-06, "feat: add dart support") — 4.5 months.

| Measure | Value |
|---|---|
| Commits ahead of `upstream/main` | 386 |
| …of which touch only `.planning/` | 142 |
| …of which touch `src`/`tests`/`bin`/`scripts` | 184 |
| Commits behind `upstream/main` | 86 |
| Files changed fork-side only | 185 |
| Files changed upstream-side only | 119 |
| Files changed by **both** sides | 45 (28 under `src/`) |
| Fork churn, `src`+`tests` | 91 files, +10,769 / −2,504 |
| Upstream churn, `src`+`tests` | 135 files, +13,357 / −2,319 |

37% of the fork's lead is GSD planning bookkeeping that never needs reconciling.
The real question is the 184 code commits — and even those represent roughly
five durable features, not 184 units of work.

## Why rebase and cherry-pick were both rejected

Upstream v2.x is a near-rewrite, not an increment. New since the merge base:

- `src/agents/` — 9 files (antigravity, codex, cursor, gemini, opencode,
  skills, markers, types, index)
- Hooks went from 6 to ~15+: `pre-bash`, `post-bash`, `post-batch`,
  `precompact`, `session-end`, `bash-output-governor`, `bash-filter`,
  `bash-path-parser`, `rule-reinjection`, `anatomy-lock`, `anatomy-store`,
  `ledger`, `ledger-math`, `symbol-extractor`, `bug-index`,
  `hook-attachments`
- New CLI: `bench`, `map`, `find`, `report`, `config-merge`, `hook-manifest`,
  `memory-migrate`
- New `src/anatomy/` — importance ranking, TS symbol extraction
- New `src/daemon/context-audit.ts`

Replaying 184 commits across 45 mutually-touched files — several of which
upstream restructured wholesale — costs more than rebuilding five features on a
clean base. Cherry-picking has the same conflict surface, just serialized.

## Feature survival table

Verified by file presence and keyword search against `upstream/main`, not
assumed.

| Fork work | Status | Evidence |
|---|---|---|
| R7a/R7b + R9 — curation machinery (propose-mode, `openwolf learnings check/accept`, `wolf-pantry`, freshness sidecar) | **Fork-unique — re-port** | `proposed`/`propose`/`staging` → 0 hits in upstream `src`; upstream CLI registers no `learnings` command |
| R4 — authored-vs-derived `.wolf/.gitignore` | **Fork-unique — re-port** | No `src/templates/wolf-gitignore` upstream |
| R11 — framework-blind resume + `execution_layer` slot | **Fork-unique — re-port** | Upstream still ships `src/templates/STATUS.md` |
| Registry canonicalization (symlink dedup) | **Fork-unique — re-port** | `realpathSync` → 0 hits upstream |
| `buglog.ndjson` + `migrate-buglog` | **Fork-unique — re-port** | Upstream template set still has `buglog.json` |
| R6 — hook-side exclusion matcher (`wolf-ignore.ts`) | **Candidate duplicate** | Upstream `exclude_patterns` in 4 files; no `wolf-ignore.ts` |
| Pillar C locking (`wolf-lock.ts`, `wolf-json.ts`) | **Candidate duplicate** | Upstream `withFileLock` in 4 files; no `wolf-lock.ts` |
| R1/R2/R3/R5/Q1/Q2 — P0 hygiene | **Unmeasured** | Upstream added `anatomy-store`/`anatomy-lock`; overlap not yet tested |

Both candidate duplicates are convergent-but-differently-structured: upstream
solved the same problems without the fork's files. Reconciling them means
**deleting** fork code, not merging it. See the research question on whether
upstream's versions satisfy the acme field cases.

## D-14 scope correction

An earlier pass in this exploration wrongly framed upstream's `memory-migrate.ts`
(mirrors `cerebrum.md` into `~/.claude/projects/<slug>/memory/`) as a D-14
violation. It is not.

D-14 is about the **execution layer**, not the host agent. As written in
`PROJECT.md`: *"Status belongs to the execution layer (abandoned after 225 acme
sessions); negative boundary + optional config.json `execution_layer` slot, no
tool names hardcoded."* The template heading is `## Resume Protocol — Execution
Layer Boundary` (`src/templates/OPENWOLF.md:5`), scoped to "a planner, a task
tracker, an agent" — GSD, Superpowers, plan-mode.

D-15's own rationale settles it: capture runs *"via the universal Claude Code
`stop` primitive… blind to both execution layer and VCS/CI host."* The fork
already depends on a Claude Code primitive and classifies that as
framework-blind. Host-agent integration is sanctioned; execution-layer coupling
is not.

Corollary: the fork is the *less* host-agnostic of the two. It ships only
`claude-md-snippet.md` and `claude-rules-openwolf.md`; upstream ships snippets
for Claude, OpenCode, Codex, Cursor, Gemini, and Antigravity.

**D-14 reaffirmed 2026-08-24**, correctly scoped. This belongs in the
`PROJECT.md` Key Decisions table.

## What the de-coupling layer actually is

Only one artifact is a genuine D-14 tripwire: `STATUS.md` must not reappear in
the template set on any sync. That guard already exists and passes —
`tests/cli/init.test.ts:462`, `expect(content).not.toMatch(/STATUS\.md/)`.

`buglog.ndjson` is a format improvement, not a coupling concern — it needs
porting forward, not guarding against.

Generalize the existing negative-assertion pattern rather than inventing a
mechanism. Sequence it **before** the reset: build the contract on the
known-good 1.3.3-beta baseline where it demonstrably passes, then merge and let
the tripwire report what v2.5.0 dragged in. The coupled-artifact list is
derivable now by diffing the two template sets — the merge is not needed to
discover it.

## Adoption candidate

Upstream's `memory-migrate.ts` also suppresses session-start digest
re-injection to fix a double-injection token waste. That specific bug is
**not** the fork's — `src/hooks/session-start.ts` has no Do-Not-Repeat digest
injector at all. The half worth adopting is the cerebrum → native-memory
mirror itself.
