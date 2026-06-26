# R7b — Framework-Blind, Host-Blind Promotion Gate (`openwolf learnings --check`)

**Researched:** 2026-06-25
**Milestone:** v1.2 — Shared-Context Tracking & Curation
**Downstream consumer:** gsd-roadmapper / gsd-planner (curation-machinery phase R7a/R7b/R9)
**Confidence:** HIGH (decision pre-settled; existing CLI/hook patterns grounded at file:line; stream conventions cited from authoritative sources + real CLI precedents)

---

## Question

Design a framework-blind, VCS/CI-host-blind **promotion gate** for OpenWolf's
`proposed-learnings` staging. The decision is **already made** (record + detail,
don't re-litigate): the gate anchors to the **universal Git branch/PR boundary**,
not to any execution layer's session-end. OpenWolf ships a **primitive** — an
exit-code command `openwolf learnings --check` — and the *team* wires it to their
own boundary (a `pre-push` git hook, a Bitbucket Pipelines step, a GitHub Actions
PR check, …). OpenWolf must name no execution layer and no specific VCS/CI host.

This file specifies: the exit-code/stream contract, host-blind wiring docs for all
three targets, the existing CLI surface to extend (file:line), the R7a/R7b boundary,
and acceptance criteria.

---

## Decision (locked) — gate at the Git boundary

| ID | Decision | Source |
|----|----------|--------|
| **D-15** | R7 split: **capture** is continuous via the universal Claude Code `stop` primitive (R7a); **promotion** is gated by a pull-based status count + an **opt-in exit-code check** wired to pre-push/PR/CI — blind to both execution layer and VCS/CI host. Avoids the session-end lifecycle-modeling trap. | `.planning/PROJECT.md:110` |
| **D-14** | OpenWolf stays framework-blind; no tool names hardcoded. | `.planning/PROJECT.md:109` |

**Why the Git boundary and not session-end (record the rationale):**

- The `acme_translators` field data showed the `proposed-learnings` staging *and*
  the designed compost→pantry promotion gate were **never used** — directories were
  never even created (PRD §3.3, `PRD…md:132`). The lesson: an *optional, invisible*
  gate gets bypassed. The gate must fire at a boundary the team **already crosses
  involuntarily**.
- Every developer pushes/opens a PR. That is the universal, host-agnostic
  synchronization seam — the moment local context becomes *shared* context. It is
  exactly where un-promoted learnings would otherwise be lost or silently diverge.
- Session-end is an *execution-layer* concept (varies per Superpowers/GSD/gstack/plan
  mode); modeling it would re-introduce the framework coupling D-14 forbids. The Git
  push/PR boundary is owned by **git + the host**, not by the execution layer.
- OpenWolf therefore ships a **primitive, not a policy**: an exit-code command. The
  team decides *where* to wire it. OpenWolf depends on, and detects, **none** of the
  wiring hosts — satisfying the host-blind quality gate.

**Settled output contract (this file validates it, below):**

1. **Exit code is THE contract.** `0` = no pending staged learnings; **non-zero** = pending.
2. **On failure:** concise human summary to **STDERR** — count + one teaser line per
   entry (`slug + date + the single pointer "run 'openwolf learnings' to review/merge"`).
   **Not** full markdown bodies.
3. **stdout stays clean**; reserved for opt-in structured output via `--json`.
4. **`--quiet`** suppresses the stderr summary (exit-code only) for CI.

---

## Exit-code & stream contract

### Stream split (the load-bearing convention)

| Stream | FD | Carries | When |
|--------|----|---------|------|
| **stdout** | 1 | *Nothing* by default. Machine-readable JSON **only** under `--json`. | Reserved for pipeable structured output. |
| **stderr** | 2 | Human-readable summary (count + one teaser line per pending entry + the single pointer). | Default on non-zero, unless `--quiet`. |
| **exit code** | — | THE contract: `0` clean / non-zero pending / `2` operational error. | Always. |

This split is the canonical Unix diagnostic convention: file descriptor 1 is stdout,
2 is stderr; programs emit results on stdout and **diagnostic/error messages on
stderr**, so stderr can be separated from a piped data stream
([POSIX basics — stdin/stdout/stderr](https://udhayakumarc.medium.com/posix-basics-9848481e4bd)).
Exit status `0` = success, `1`–`255` = failure, machine-interpretable for chaining
([Unix exit codes](https://shapeshed.com/unix-exit-codes/)). Putting the summary on
**stderr** (not stdout) is what lets `--json` own stdout cleanly and lets a CI step
silence the human text with `2>/dev/null` while still trusting the exit code.

### Exit-code table

| Code | Meaning | Streams emitted |
|------|---------|-----------------|
| **0** | No pending staged learnings (clean — nothing awaiting review). | stdout: empty (or `{"pending":0,"entries":[]}` under `--json`). stderr: empty. |
| **1** | One or more pending staged learnings exist. | stdout: empty (or JSON under `--json`). stderr: summary unless `--quiet`. |
| **2** | Operational error (cannot read `.wolf/sessions/`, malformed staging, not an OpenWolf project). | stdout: empty (or `{"error":...}` under `--json`). stderr: error line (always — `--quiet` does not silence operational errors, only the pending-summary). |

**Rationale for the 0/1/2 trichotomy — validated against real CLIs:**

- **ESLint** uses exactly this shape: `0` = no errors, `1` = ≥1 lint error (the
  expected "found problems" failure), `2` = configuration/internal error
  ([ESLint CLI exit codes](https://eslint.org/docs/latest/use/command-line-interface)).
  R7b mirrors it: `1` = "found pending learnings" (the expected gate trip),
  `2` = "couldn't even run the check."
- **pytest** distinguishes "tests ran and some failed" (`1`) from "internal error"
  (`3`) / "usage error" (`4`) — same principle: a clean nonzero for the *expected*
  failure mode, separate codes for *operational* failure
  ([pytest exit codes](https://docs.pytest.org/en/stable/reference/exit-codes.html)).
- **Ruff** exits `0` when no violations, non-zero (typically `1`) when violations are
  found, and supports `--quiet` (diagnostics only, suppress other logging) plus a
  machine `--output-format json` — the precedent for our `--quiet` + `--json` pair
  ([Ruff linter docs](https://docs.astral.sh/ruff/linter/),
  [Ruff configuration](https://docs.astral.sh/ruff/configuration/)).

Keeping the **"found something" failure = 1** distinct from **"broke" = 2** lets a CI
step react differently (block the merge on `1`; alert/log on `2`) and avoids a
misconfigured environment masquerading as "clean."

### Flag design

| Flag | Behavior | Precedent |
|------|----------|-----------|
| `--check` | Subcommand mode flag on `openwolf learnings`: count pending staged entries, set exit code, emit stderr summary. No interactive prompts, no writes. | eslint/ruff "check" semantics; `openwolf scan --check` (already exists, `src/cli/index.ts:44`). |
| `--json` | Emit structured result to **stdout** (`{"pending":N,"entries":[{slug,date,session,target}]}`); suppress the stderr human summary. Exit code unchanged. | Ruff `--output-format json`; jest/eslint `--format json`. |
| `--quiet` | Suppress the stderr human summary; exit-code-only. Operational errors (code 2) still print. For CI that trusts the code alone. | Ruff `--quiet`; git hook bodies. |

`--json` and `--quiet` are independently meaningful: `--json` redirects machine output
to stdout (and implicitly quiets the human summary); `--quiet` alone silences the
human summary without producing JSON. If both are passed, `--json` wins for stdout
content and stderr stays empty.

**Note on `scan --check` precedent:** `openwolf scan --check` already exists
(`src/cli/index.ts:43-46`, "Verify anatomy.md matches filesystem (no changes)"). R7b
should align verb semantics with it — `--check` = read-only verification that sets an
exit code — so the CLI surface stays internally consistent.

---

## Cross-host wiring (git-hook / Bitbucket / GitHub — host-blind)

**The host-blind principle, restated for the docs author:** OpenWolf ships *one*
command and *one* exit-code contract. The wiring snippets below live in **OpenWolf's
docs**, never in OpenWolf's code. OpenWolf does not read `bitbucket-pipelines.yml`,
does not look for `.github/`, does not install git hooks, does not detect a CI
environment. The same `openwolf learnings --check` line drops into all three. This is
the entire reason the contract is an exit code: it is the one interface every host
already understands.

> Document **both** Bitbucket Pipelines (the upstream CHESA workflow) **and** GitHub
> Actions (this repo is the GitHub variant). Lead with the host-agnostic `pre-push`
> hook, because it requires no host at all.

### (a) Git `pre-push` hook (host-agnostic, runs locally)

`.git/hooks/pre-push` (or a tracked `hooks/` dir wired via `core.hooksPath`):

```sh
#!/bin/sh
# Block a push that leaves un-promoted OpenWolf learnings behind.
if ! openwolf learnings --check --quiet; then
  echo "OpenWolf: un-promoted learnings staged. Run 'openwolf learnings' to review/merge, or re-push with --no-verify to skip." >&2
  exit 1
fi
```

- `--quiet` keeps the hook output minimal; the wrapper prints its own one-liner.
- Drop `--quiet` if the team wants OpenWolf's per-entry teaser inline.
- `git push --no-verify` is the built-in escape hatch — OpenWolf provides no override
  flag of its own (the host already owns the bypass).
- No OpenWolf code is involved in *installing* this; the docs may optionally suggest a
  `core.hooksPath` convention, but that is a team choice, not an OpenWolf feature.

### (b) Bitbucket Pipelines step (`bitbucket-pipelines.yml`)

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: OpenWolf learnings gate
          script:
            - npx openwolf learnings --check --quiet
            # non-zero exit fails the step → blocks the PR merge check
```

- Runs in the standard Linux Docker container; the non-zero exit fails the step,
  which the team can attach as a **Merge Check** (Bitbucket terminology — not "branch
  protection"). OpenWolf neither knows nor cares it is inside a Pipeline.
- For a human-readable failure in the build log, omit `--quiet` so the stderr summary
  is captured by the Pipelines log.

### (c) GitHub Actions step

```yaml
# .github/workflows/openwolf-gate.yml
on: [pull_request]
jobs:
  learnings-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx openwolf learnings --check --quiet
        # non-zero exit fails the job → blocks the PR via a required check
```

- Identical command. The team marks the job a **required status check** on the
  protected branch. OpenWolf is unaware it is an Action.
- `--json` is the integration path if a team wants to post a PR annotation/comment:
  pipe stdout JSON into their own annotator. OpenWolf ships only the data, not the
  annotator.

### Host-blindness verification (acceptance signal)

```sh
grep -rIiE 'bitbucket|github|gitlab|pre-push|\.github|pipelines|actions/checkout' \
  src/cli src/hooks src/templates
# → MUST return zero hits. Wiring lives in docs/ only.
```

---

## Existing CLI surface to extend (file:line)

R7b is a **pure extension** of an already-shipped subcommand group — no new top-level
command, no new dependency.

### Where `learnings` registers

`src/cli/index.ts:168-188` — the `learnings` command group, today with two leaves:

```
169  const learnings = program.command("learnings")...
173  learnings.command("list")  --session <id>   → learningsCommand(opts.session)
182  learnings.command("merge")                  → learningsMergeCommand()
```

**R7b adds a third leaf** following the identical lazy-import pattern (all leaves
`await import("./learnings-cmd.js")`):

```ts
learnings
  .command("check")
  .description("Exit non-zero if staged learnings await review (for git hooks / CI)")
  .option("--json", "Emit structured result to stdout")
  .option("--quiet", "Suppress the stderr summary (exit code only)")
  .action(async (opts: { json?: boolean; quiet?: boolean }) => {
    const { learningsCheckCommand } = await import("./learnings-cmd.js");
    process.exitCode = learningsCheckCommand(opts); // 0 | 1 | 2
  });
```

> **Naming note:** the question frames it as `openwolf learnings --check`. Commander
> idiom (and the existing `scan --check` group) makes a **`learnings check`
> subcommand** the cleaner registration; functionally identical exit-code contract.
> The roadmapper/planner should pick one spelling and keep it consistent with
> `scan --check`. Recommendation: **`learnings check`** subcommand (matches the
> `bug search` / `daemon start` subcommand style already in `index.ts`), and
> optionally alias `--check` on the bare `learnings` command if the literal spelling
> in the PRD must be honored.

### Where the pending count comes from

The staging files are `.wolf/sessions/<sessionId>/proposed-learnings.md` (one per
session), exactly as OPENWOLF.md mandates ("Append to
`.wolf/sessions/<worktreeId>/proposed-learnings.md`"). The counting logic **already
exists** and must be **reused, not re-implemented**:

- `src/cli/learnings-cmd.ts:18-63` — `parseProposals(sessionDir, sessionId)` parses a
  single session's staging file into `ProposalEntry[]` (`{sessionId, timestamp,
  target, content, raw}`), tolerantly skipping unparseable blocks with a stderr warn.
- `src/cli/learnings-cmd.ts:92-117` — `collectAllEntries()` walks every
  `.wolf/sessions/<dir>/` and aggregates all `ProposalEntry`. **This is the count
  source.** `learningsCheckCommand` is essentially:

```ts
export function learningsCheckCommand(opts): 0 | 1 | 2 {
  // reuse collectAllEntries(); guard for missing sessions dir → return 0
  const entries = collectAllEntries();      // existing fn, learnings-cmd.ts:92
  if (opts.json) { process.stdout.write(JSON.stringify({pending: entries.length, entries: ...})); }
  if (entries.length === 0) return 0;
  if (!opts.quiet && !opts.json) emitSummaryToStderr(entries);  // count + teasers
  return 1;
}
```

- The teaser line per entry = `entry.target` + `entry.timestamp` (the "slug + date")
  + the single pointer `run 'openwolf learnings' to review/merge`. The `slug` is best
  derived from the first line of `entry.content` (truncated) — `listProposals`
  already truncates previews to 60 chars (`learnings-cmd.ts:84-88`); reuse that
  truncation helper for the teaser.

### How `openwolf status` is implemented (R7's pull-side surface)

`src/cli/status.ts:8-146` — `statusCommand()`:

- Resolves `wolfDir` honoring worktree context (`detectWorktreeContext`,
  `status.ts:9-14`) — **note:** in a worktree the shared `.wolf/` lives at
  `mainRepoRoot/.wolf` but **sessions live under `.wolf/sessions/<worktreeId>/`**.
  `collectAllEntries()` already walks `<wolfDir>/sessions/*`, so it aggregates across
  worktrees correctly from the main checkout.
- Prints sectioned status (file integrity, hooks, token stats, anatomy count, daemon).
- **R7 (pull side) adds one line to this output**: "N learnings awaiting review"
  using the same `collectAllEntries().length`. PROJECT.md R7 acceptance: *"status
  reports it."* This is the **passive/pull** surface; `learnings check` is the
  **active/gate** surface. Both read the same count from the same function — keep them
  consistent by routing both through `collectAllEntries()`.

### Precedent for a read-only search/report leaf

`src/cli/bug-cmd.ts:6-33` (`bugSearch`) — the minimal pattern for a read-only
`learnings` reporter: resolve project root, guard `if (!fs.existsSync(wolfDir))`,
print to console, no writes. `learningsCheckCommand` follows this shape but returns an
exit code instead of always-0.

---

## R7a capture boundary

**Crisp split — R7a writes, R7b reads. They never share logic beyond the staging file
format.**

| Half | Role | Mechanism | Lives in |
|------|------|-----------|----------|
| **R7a (capture)** | Continuously *append* a staged proposal whenever a session learns something. | The universal Claude Code **`stop` hook** — a Claude Code primitive present under every execution layer. | `src/hooks/stop.ts` + `appendProposal()` |
| **R7b (gate)** | *Read* the accumulated staging and exit non-zero if any pending. | `openwolf learnings check` exit-code primitive wired at the Git boundary. | `src/cli/learnings-cmd.ts` + `index.ts` |

### Capture mechanism (R7a), confirmed in source

- **Where:** `src/hooks/stop.ts` — the stop hook's `main()` (`stop.ts:165-200`) and
  `finalizeSession()` (`stop.ts:52-163`). It already runs on every session end, writes
  the token ledger, and appends a session summary to `memory.md` (`stop.ts:150-160`).
- **The append helper already exists:** `appendProposal(target, content)` at
  `src/hooks/wolf-files.ts:89-96`, re-exported through `src/hooks/shared.ts:16`. It:
  - resolves the per-session dir via `getSessionDir()`,
  - writes to `<sessionDir>/proposed-learnings.md`,
  - in the exact block format R7b parses:
    `\n## ${ISO-timestamp} → ${target}\n\n${content}\n` (`wolf-files.ts:94`).
  This is the **same format** `parseProposals` consumes (`ENTRY_HEADER_REGEX`,
  `learnings-cmd.ts:16`) — so R7a and R7b are already format-compatible; the contract
  between them is the staging-file grammar, nothing else.
- R7a's job in this milestone is to make capture the **default learning path** (per
  PRD §5.1 principle 3) — i.e. ensure the stop hook (and/or session protocol) actually
  *calls* `appendProposal` when a learning occurs, since the acme data showed staging
  was never written. **The boundary holds:** R7a does not count, does not gate, does
  not touch exit codes. R7b does not write, does not capture.

### STATUS.md nudge removal (R11) — adjacent, don't conflate

`src/hooks/stop.ts:232-263` (`checkStatusFreshness`) emits the "update STATUS.md
before /clear" nudge. **R11 removes this** (PROJECT.md R11; `PRD…md:338`
"`src/hooks/stop.ts` (drop the 'update STATUS before /clear' nudge)"). R7a/R7b must
**not** re-introduce any STATUS.md or session-end-status coupling — doing so would
violate the framework-blind constraint. The stop hook's *learning-capture* role (R7a)
stays; its *status-nudge* role (R11) goes.

---

## Touch-points & acceptance criteria

### File touch-points

| File | Change | R |
|------|--------|---|
| `src/cli/index.ts` | Register `learnings check` leaf (`--json`, `--quiet`); set `process.exitCode` from its return. (~12 lines, mirrors `bug search` / existing `learnings list`.) | R7b |
| `src/cli/learnings-cmd.ts` | Add `learningsCheckCommand(opts): 0|1|2`; reuse `collectAllEntries()` (line 92); add `emitSummaryToStderr` + `buildJsonResult`; reuse the 60-char truncation from `listProposals` (line 84). | R7b |
| `src/cli/status.ts` | Add "N learnings awaiting review" line via `collectAllEntries().length`. | R7 (pull) |
| `src/hooks/stop.ts` | Ensure learning-capture path invokes `appendProposal`; (R11) remove `checkStatusFreshness` nudge (lines 232-263) and its call site (line 73). | R7a / R11 |
| `docs/` (e.g. `docs/configuration.md` or a new `docs/curation-gate.md`) | Host-blind wiring snippets: pre-push, Bitbucket Pipelines, GitHub Actions. **Code stays host-blind; only docs name hosts.** | R7b |
| `tests/cli/learnings-cmd.test.ts` (or new) | Exit-code matrix tests (see below). | R7b |

**Constraint reminders (from PROJECT.md "Hard constraints"):**
- The `learnings check` command runs in the **CLI build** (`src/cli/`), not the hook
  build — so it may freely import from `src/cli/`/`src/utils/`. No hook-isolation
  concern for R7b. (R7a in `src/hooks/` must remain dependency-free per the hook
  isolation rule in `CLAUDE.md`.)
- **Zero** hardcoded execution-layer or VCS/CI-host strings in `src/`.

### Acceptance criteria

1. **Clean exit.** No `proposed-learnings.md` files (or all empty) →
   `openwolf learnings check` exits **0**, stdout empty, stderr empty.
2. **Pending trips the gate.** ≥1 staged entry → exits **1**; stderr shows `N
   learnings awaiting review` + one teaser line per entry (slug + date + the single
   pointer `run 'openwolf learnings' to review/merge`); **no full markdown bodies** on
   stderr; stdout empty.
3. **`--json` owns stdout.** With `--json`, stdout = valid JSON
   (`{"pending":N,"entries":[...]}`), parseable by `jq`; stderr empty; exit code still
   0/1 by pending count.
4. **`--quiet` is exit-code-only.** With `--quiet` and pending entries → exits 1,
   stderr empty, stdout empty. (Operational errors still print on stderr.)
5. **Operational error = 2.** Unreadable `.wolf/sessions/` or not an OpenWolf project →
   exits **2** with an error line on stderr (even under `--quiet`).
6. **Pull surface agrees with gate.** `openwolf status` shows the same pending count
   `learnings check` would gate on (both via `collectAllEntries()`).
7. **Host-blind.** `grep -rIiE 'bitbucket|github|gitlab|pre-push|pipelines|actions/checkout'
   src/cli src/hooks src/templates` → **zero** hits.
8. **Framework-blind.** `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/cli src/hooks
   src/templates` → **zero** hits (joint with R11 acceptance).
9. **R7a/R7b boundary.** A session that records a learning leaves a staged entry via
   `appendProposal` (R7a); `learnings check` then reports it (R7b). The two communicate
   only through the staging-file grammar.
10. **Worktree-correct.** Run from a worktree, `learnings check` aggregates staging
    across `<mainRepo>/.wolf/sessions/*` (matching `status.ts` worktree resolution).

---

## Sources

- [POSIX basics — stdin, stdout, stderr (FDs 0/1/2; errors to stderr)](https://udhayakumarc.medium.com/posix-basics-9848481e4bd) — MEDIUM (community explainer of the POSIX convention)
- [Unix exit codes — 0 = success, 1–255 = failure, machine-interpretable for chaining](https://shapeshed.com/unix-exit-codes/) — MEDIUM
- [ESLint CLI exit codes (0 clean / 1 problems found / 2 config-or-internal error)](https://eslint.org/docs/latest/use/command-line-interface) — HIGH (official docs; primary precedent for the 0/1/2 trichotomy)
- [pytest exit codes (separates "tests failed" from "internal/usage error")](https://docs.pytest.org/en/stable/reference/exit-codes.html) — HIGH (official docs; the clean-nonzero-vs-broken distinction)
- [Ruff linter — non-zero on violations; `--quiet`; `--output-format json`](https://docs.astral.sh/ruff/linter/) — HIGH (official docs; precedent for `--quiet` + `--json`)
- [Ruff configuration — output formats incl. json, `--exit-zero`](https://docs.astral.sh/ruff/configuration/) — HIGH
- Source (this repo): `src/cli/index.ts` (CLI registration), `src/cli/learnings-cmd.ts` (`parseProposals`, `collectAllEntries`, format grammar), `src/cli/status.ts` (status surface + worktree resolution), `src/cli/bug-cmd.ts` (read-only leaf precedent), `src/hooks/stop.ts` (R7a capture + R11 STATUS nudge), `src/hooks/wolf-files.ts:89` (`appendProposal`), `.planning/PROJECT.md` (D-14/D-15), `PRD-OpenWolf-Shared-Context-and-Curation.md` (§4.5 seam, §5 curation contract, §6 R7/R11) — HIGH (direct file:line grounding)
