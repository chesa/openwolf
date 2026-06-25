# Phase 11: Framework-Blind Resume Protocol - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

> **Auto-mode note:** This context was captured under `--auto` (single pass).
> All gray areas below were resolved interactively during the preceding
> `--assumptions` discussion (the user issued the three architectural calls and
> the `openwolf status` rendering decision directly); `--auto` selected the
> recommended option for the remaining mechanical choices. No decision here is
> a blind default — each is either user-locked or the documented house pattern.

<domain>
## Phase Boundary

Remove OpenWolf's ownership of **status / roadmap / intent**. Delete `STATUS.md`
as a framework-mandated protocol file and replace it with a generic,
tool-agnostic **resume seam**: `OPENWOLF.md` asserts the negative boundary
(OpenWolf does not own status/roadmap/intent) and a generic resume order
(execution-layer plan/status *if present* → `cerebrum.md` → recent `memory.md`)
that **names no tool**. OpenWolf additionally **reads** an optional
`config.json → openwolf.execution_layer` hint when a repo sets one (D-14, R11).

This is a **deletion + prose-rewrite** phase — no new dependencies, no new
modules. It is sequenced **before** Phase 12 (R7a) because both edit
`src/hooks/stop.ts`; this phase must leave `stop.ts` free of STATUS /
session-end coupling so R7a's `appendProposal()` lands on a sterile seam.

**In scope:**
- **Delete** `src/templates/STATUS.md`.
- **Rewrite** `src/templates/OPENWOLF.md`: replace the "STATUS.md — Single Source of Truth (READ FIRST)" section (`:5–24`) with the negative boundary + generic 3-step resume order; rewrite the Session End step that mandates STATUS (`:162`).
- **Rewrite** `src/templates/claude-rules-openwolf.md` STATUS lines (`:6–7`) to the same framework-blind resume language, naming no tool.
- **Strip** `src/cli/init.ts` at **three** sites: the `"STATUS.md"` entry in `CREATE_IF_MISSING` (`:45`), the entire `seedStatus()` function (`~:277`), and **both** call sites (fresh-init `~:452` + upgrade `newlyCreated.has("STATUS.md")` branch `~:454`). Leave no orphan.
- **Strip** `src/hooks/stop.ts`: delete the whole `checkStatusFreshness()` function (`:228–265`) — it contains **both** R11-named nudges (the stale-STATUS nudge and the "STATUS.md missing — create it" nudge) — and its call site (`:73`).
- **Add** the optional `openwolf.execution_layer` slot (value `null`) to template `config.json`; **read it if present**; surface it (key-value, see D11-07).
- **Remove** the `STATUS.md` comment line from `src/templates/wolf-gitignore` (`:27`).
- **Update tests** (`tests/cli/init.test.ts:296` asserts STATUS.md is created — invert/drop; add a read-the-hint test).
- **Update docs**: `README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md` (current guides — rewrite); `docs/superpowers/{plans,specs}/*` (historical — banner, do not rewrite, see D11-09).
- **Exercise** `pnpm build:hooks` → `openwolf update` so the `stop.ts` change is live in `.wolf/hooks/` (D11-13).

**Out of scope (other phases / explicitly deferred):**
- R7a `stop`-hook capture (`appendProposal()`), R7b promotion gate, R9 freshness sidecar — **Phase 12**. This phase only *removes* from `stop.ts`; it adds **no** capture behavior.
- Any code path that *acts on* `execution_layer` beyond reading + surfacing it — R11 requires "reads the hint if set," nothing more.
- R4 ignore-list (Phase 9), R6 hook exclusion (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Template deletions & prose rewrites
- **D11-01:** **Delete** `src/templates/STATUS.md` outright. It stops being a framework artifact and becomes (at most) unmanaged user prose.
- **D11-02:** `src/templates/OPENWOLF.md` — replace the "Single Source of Truth (READ FIRST)" block (`:5–24`) with: (a) a **negative boundary** statement ("OpenWolf does not own status / roadmap / intent — those belong to your execution layer"), and (b) a **generic resume order**: *execution-layer plan/status if present → `cerebrum.md` → recent `memory.md`*. **Name no tool** (no GSD / Superpowers / gstack / `.planning`). Rewrite the Session End step (`:162`) to drop the STATUS.md mandate; keep the memory/cerebrum/buglog session-end duties.
- **D11-03:** `src/templates/claude-rules-openwolf.md:6–7` — rewrite the two STATUS lines to mirror the new OPENWOLF.md resume seam, tool-agnostic.

### CLI plumbing removal (`init.ts`)
- **D11-04:** Remove `STATUS.md` from `CREATE_IF_MISSING` (`:45`), **delete** `seedStatus()` entirely (`~:277`, including its `{{PROJECT_NAME}}`/`{{DATE}}` substitution), and remove **both** invocations — the fresh-init call (`~:452`) and the `else if (newlyCreated.has("STATUS.md"))` upgrade branch (`~:454`). Removing the function but leaving a call (or vice-versa) is the failure mode to avoid; the change is "all three or none."

### Hook teardown (`stop.ts`)
- **D11-05:** **Delete** `checkStatusFreshness()` (`:228–265`) and its call (`:73`). This single function holds *both* nudges R11 names. After removal, `stop.ts` retains `checkForMissingBugLogs` and `checkCerebrumFreshness` and the ledger write — and carries **zero** STATUS / session-end-handoff coupling, which is the precondition Phase 12 R7a builds on.

### `execution_layer` hint — template + consumption
- **D11-06:** Seed `openwolf.execution_layer: null` in template `config.json` (under the `openwolf` block) for **discoverability**. Read-only-if-present: `init` never sets a non-null value; absent/`null` ⇒ silent fallback to the generic resume order. **Constraint flagged for planner:** template `config.json` is **strict JSON** (parsed by `readJSON`) — it **cannot carry a `//` comment**. The "explanatory comment" must therefore be either a sibling string key (e.g. `"execution_layer_note": "Optional: name your execution layer (e.g. gsd) so OpenWolf can point resume at its plan/status. null = generic resume."`) **or** documented in `docs/configuration.md`. Recommended: do both — a null key for discoverability + the authoritative explanation in `docs/configuration.md`.
- **D11-07 (rendering — user-locked):** Surface a non-null hint as a **plain key-value line**, never a highlighted banner. Two consumers:
  - `openwolf status` (`src/cli/status.ts`): one line in the **top environment block**, directly under `Mode:` — e.g. `  Execution layer: gsd`. The command uses only plain `console.log` + `✓/✗/-` markers today; **introduce no ANSI color / banner** (matches existing convention; a banner would over-claim authority the negative boundary is renouncing).
  - `session-start.ts` resume greeting: one plain `stderr` line when the hint is set — e.g. `OpenWolf: execution layer = gsd — read its plan/status first.` (`session-start.ts` does not read `config.json` today; this is a small additive read, mirroring the cerebrum-freshness block's style at `:65–88`).
  - **Both silent** when the hint is `null`/absent — no "(none)" noise.

### Upgrade safety
- **D11-08 (non-destructive — user-locked):** `openwolf init` / `openwolf update` **must never delete** an existing `.wolf/STATUS.md` in a consumer repo. OpenWolf simply **stops** seeding it, **stops** requiring it, and **ignores** it in the `stop` hook. An older repo's STATUS.md becomes inert user prose, untouched.

### Documentation strategy
- **D11-09 (historical vs current — user-locked):** Do **not** rewrite the historical `docs/superpowers/{plans,specs}/*` design artifacts (rewriting history destroys the audit trail). **Prepend a deprecation blockquote banner** to each:
  > **NOTE:** Historical design artifact (v1.2-beta era). The `STATUS.md` protocol described below is deprecated and replaced by the framework-blind resume seam in `OPENWOLF.md`.

  C1 targets string literals in code paths (`src/templates`, `src/hooks`, `src/cli`) — not these docs — so a banner satisfies the "bring guides up to date" intent without altering past records. **Current** guides (`README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md` — 1 STATUS hit each) are rewritten normally.

### gitignore template
- **D11-10:** Remove the `#   STATUS.md  — project status` comment line from `src/templates/wolf-gitignore:27` (it documents a file that no longer exists).

### Tests & version
- **D11-11:** `tests/cli/init.test.ts:296` currently asserts `STATUS.md` is among created files — **invert** (assert it is **not** seeded) or drop it from the expected-files list. Add a focused test that `openwolf status` / resume reads a set `openwolf.execution_layer` and stays silent when `null`/absent.
- **D11-12 (version — user-confirmed):** Current branch is already `1.3.0-beta`, which **satisfies** the ≥ minor protocol bump over the `1.1` baseline (criterion 4). **No further version manipulation** — just add a changelog entry describing the protocol change.

### Verification gates
- **D11-13:** After editing `stop.ts`, run `pnpm build:hooks` → `node dist/bin/openwolf.js update` so `.wolf/hooks/stop.js` reflects the teardown (edits to `src/hooks/` are inert until copied). `tsc --noEmit -p tsconfig.hooks.json` must stay clean (C2).
- **D11-14:** `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` must remain **zero** (C1 — **already zero today**, so this is a no-regression gate, not new work). Full `pnpm test` green.

### Claude's Discretion
- Exact prose of the new OPENWOLF.md negative-boundary section and the 3-step resume order (constraint: names no tool; preserves the "resume in few reads" spirit).
- The `execution_layer` "comment" mechanism (sibling note key vs `docs/configuration.md`-only vs both) — honoring D11-06's strict-JSON constraint.
- Whether the `session-start.ts` hint read is inline or a small helper; whether `status.ts` reads the value via existing `readJSON` config load or a dedicated read.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement & roadmap
- `.planning/REQUIREMENTS.md` §R11 — full requirement text, touch-point list, and `*Accept:*` (no STATUS seeded; C1 grep zero; suite green; ≥ minor bump).
- `.planning/ROADMAP.md` §"Phase 11" — the 4 success criteria; the dependency note (sequenced before Phase 12, both touch `stop.ts`).
- `.planning/PROJECT.md` §Key Decisions — D-14 (remove STATUS.md; framework-blind; optional `execution_layer` slot, no tool names).
- `.planning/STATE.md` §Build-Order Dependency Edges — "R11 before R7a; both edit `src/hooks/stop.ts`"; "R6 + R11 both need the `build:hooks` → `openwolf update` copy step."

### Source files (the work surface)
- `src/templates/STATUS.md` — **delete**.
- `src/templates/OPENWOLF.md` — STATUS section `:5–24`; Session End STATUS step `:162`.
- `src/templates/claude-rules-openwolf.md` — STATUS lines `:6–7`.
- `src/templates/config.json` — `openwolf` block; **add** `execution_layer: null` (no slot exists today).
- `src/templates/wolf-gitignore` — STATUS comment `:27`.
- `src/cli/init.ts` — `CREATE_IF_MISSING` `:45`; `seedStatus()` `~:277`; call sites `~:452` (fresh) + `~:454` (upgrade branch).
- `src/hooks/stop.ts` — `checkStatusFreshness()` `:228–265`; call site `:73`; (leave `checkForMissingBugLogs`, `checkCerebrumFreshness` intact).
- `src/cli/status.ts` — top environment block (`Mode:` at `:30–32`) — add the key-value `Execution layer:` line here.
- `src/hooks/session-start.ts` — resume greeting; cerebrum-freshness emit block `:65–88` is the style to mirror for the hint line.

### Tests & docs
- `tests/cli/init.test.ts:296` — STATUS.md create assertion to invert/drop.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md` — 1 STATUS hit each; rewrite.
- `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md`, `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` — historical; **banner only** (D11-09).

### Conventions
- `CLAUDE.md` §"Development Gotchas" — hooks can't import `src/utils/` at runtime; `build:hooks` → `openwolf update` copy discipline; version bump policy (format change / new API ≥ minor); templates must not be named `.gitignore` (why `wolf-gitignore`).
- `.planning/codebase/TESTING.md` — Vitest, `tests/` mirrors `src/`; hook tests trap `process.exit` + `vi.mock` `shared.js`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`checkCerebrumFreshness()`** (`session-start.ts:65–88` / also in `stop.ts`): the exact pattern for an optional config-driven `stderr` nudge — read a `.wolf/` file, branch, emit one plain line, swallow errors. The `execution_layer` greeting line in `session-start.ts` should follow this shape.
- **`readJSON`** (`src/utils/fs-safe.ts`, already imported by `status.ts`): use it to read `openwolf.execution_layer` in `status.ts` — config is already loadable there.
- **`status.ts` top block** (`:20–33`): the `Mode:` / `Main repo:` lines are the established key-value environment vocabulary the hint line joins.

### Established Patterns
- **`CREATE_IF_MISSING` + `seedStatus()`** is the seed-once-with-placeholders pattern (`init.ts`). `STATUS.md` is the only member removed; `cerebrum.md`/`memory.md`/etc. stay — so the array edit is surgical, and `seedCerebrum()`/`writeIdentity()` are the surviving siblings of `seedStatus()`.
- **`status.ts` output is color-free** — plain `console.log`, three markers (`✓/✗/-`). No ANSI lib is imported; introducing one for the hint would be a new pattern (rejected — D11-07).
- **Hooks are dep-free** and run from `.wolf/hooks/` — every `stop.ts`/`session-start.ts` edit needs the `build:hooks` → `openwolf update` copy (D11-13).

### Integration Points
- `stop.ts:73` — single call-site removal; the surrounding `checkForMissingBugLogs` (`:67`) and `checkCerebrumFreshness` (`:70`) calls are the seam Phase 12 (R7a) extends — leave them clean.
- `init.ts` fresh-init block (`~:452`) and upgrade block (`~:454`) — the two `seedStatus()` call paths; both must drop together with the function.
- `pnpm build` runs all three compile units; the hook copy is the easy-to-forget step (STATE.md flags it for both Phase 10 and 11).

</code_context>

<specifics>
## Specific Ideas

- **Negative boundary as the centerpiece.** The OPENWOLF.md rewrite is not just "delete STATUS mentions" — it must *positively assert* that status/roadmap/intent belong to the execution layer, then defer to it. The resume order is the operational expression of that boundary.
- **Banner deprecation text** for historical docs (verbatim, D11-09):
  > **NOTE:** Historical design artifact (v1.2-beta era). The `STATUS.md` protocol described below is deprecated and replaced by the framework-blind resume seam in `OPENWOLF.md`.
- **Surfacing is a deliberate, minimal scope expansion.** R11 only requires *reading* the hint. Assigning the consumer to `status` + the session-start greeting (key-value, silent-when-null) is the chosen surface — recorded so the planner treats it as in-scope, not creep.

</specifics>

<deferred>
## Deferred Ideas

- **Acting on `execution_layer`** (branching hook/CLI behavior on its value, auto-detecting the layer, validating it against an allow-list) — beyond R11's "read if present." Belongs to a later rollout milestone if ever; not this phase.
- **R7a/R7b/R9 curation machinery** on `stop.ts` — **Phase 12**. This phase deliberately leaves the seam empty.
- **Migrating existing consumer `STATUS.md` content** into cerebrum/memory automatically — rejected; non-destructive means *leave it*, not *migrate it* (D11-08).

None of the above is scope creep into another phase — they are the recorded boundaries of *this* phase so the planner does not try to "finish" the execution-layer integration.

</deferred>

---

*Phase: 11-framework-blind-resume-protocol*
*Context gathered: 2026-06-25*
