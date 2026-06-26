# Requirements — Milestone v1.2: Shared-Context Tracking & Curation

**Primary source:** `PRD-OpenWolf-Shared-Context-and-Curation.md` (repo root, untracked).
**Evidence base:** `acme_translators` field deployment (3 devs, ~3 mo, 225 sessions).
**IDs preserve the PRD's R-codes** for exact traceability. Phase numbering continues from v1.1 (ended Phase 7) → v1.2 begins at **Phase 8**.

## Hard Constraints (gate every requirement)

- **C1 — Framework-blind:** zero hardcoded execution-layer references (`gsd`, `superpowers`, `gstack`, `.planning`) in `src/templates`, `src/hooks`, `src/cli`. Grep-enforceable.
- **C2 — No npm deps in hook-imported modules:** never import `ignore` (or any `node_modules` package) into anything reachable from the hook build. Enforce with `tsc --noEmit -p tsconfig.hooks.json`. (Real past `MODULE_NOT_FOUND` failure class.)

## v1.2 Requirements

### Verification — confirm landed P0 hygiene (no re-implementation)

- [x] **VER-01**: Verify the already-shipped P0 hygiene against the acme replay and the `develop-preview` commits, mapping each behavior to its commit. Covers **R1** (untrack `anatomy.md`, `cac925a`), **R2** (self-heal scan, `c430a9b`), **R3** (out-of-project `../` guard, `cac925a`), **R5** (buglog code-file gating, `9f63395`), **Q1** (`respect_gitignore`, `3ef255c`), **Q2** (nested/glob excludes, `2f3e1f6`).
  *Accept:* each behaves per its PRD acceptance criterion on the acme repo; the verification report records commit↔behavior; nothing is re-implemented.

### Tracking Hygiene

- [x] **R4**: Correct the `.wolf/.gitignore` template — remove the false "hooks/ are committed" claim; untrack `buglog.json`, `suggestions.json`, `hooks/`; document the rule "the consumer root `.gitignore` must not re-list `.wolf/` paths." Establishes the **one authoritative ignore list**.
  *Accept:* `git ls-files .wolf/` matches the documented set exactly.
  *Decided (Q4 → D-17):* **untrack** compiled `hooks/` (derived build output; committing JS artifacts causes merge conflicts + path noise). Must then guarantee rebuild-on-clone — extend the R2 self-heal pattern and/or document the `openwolf update` discipline.

### Hook Exclusion

- [x] **R6**: Hook-side in-project path exclusion. Promote the scanner's pure matcher (`globToRegExp`, `matchesPattern`, `shouldExclude` — `src/scanner/anatomy-scanner.ts`) into a single shared dep-free module (`src/hooks/wolf-ignore.ts`, re-exported via `shared.ts`); add a dep-free root-`.gitignore` parser; apply both `exclude_patterns` and `.gitignore` in the post-write hook (`recordAnatomyWrite`, after the R3 `../` guard).
  *Accept:* an excluded **or** gitignored in-project dir never enters `anatomy.md` via the hook; R3 out-of-project skip preserved; normal in-project files still recorded; `tsc --noEmit -p tsconfig.hooks.json` clean (C2).
  *Decided (→ D-18):* keep the scanner's `ignore` dep for the **CLI/daemon full scan**; the **hook** uses a self-contained zero-dep regex matcher. Accept the hook/scanner `.gitignore` engine split — honors C2, and the full scan stays the authoritative backstop for edge-case syntax.

### Protocol — framework-blind (≥ minor bump)

- [x] **R11**: Remove `STATUS.md` from OpenWolf; replace with the framework-blind resume seam. `OPENWOLF.md` asserts the negative boundary (OpenWolf does not own status/roadmap/intent) + a generic resume order (execution-layer plan/status if present → `cerebrum.md` → recent `memory.md`), naming no tool; OpenWolf reads an optional `config.json → openwolf.execution_layer` hint if a repo sets one. Touch-points: `src/templates/{STATUS.md (delete),OPENWOLF.md,claude-rules-openwolf.md,wolf-gitignore}`, `src/cli/init.ts`, `src/hooks/stop.ts` (both the "/clear" nudge and the "STATUS.md missing — create it" nudge), `tests/cli/init.test.ts`, docs (`README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md`, and the missed `docs/superpowers/*`).
  *Accept:* `openwolf init` seeds no STATUS.md; `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` returns **zero** (C1); suite green; ≥ minor version bump.

### Curation Machinery — framework-blind

- [ ] **R7a**: `proposed-learnings` is the **default capture path**, written via the universal Claude Code `stop` hook (`appendProposal()`). Capture is continuous and execution-layer-agnostic.
  *Accept:* a session that learns something leaves a staged entry regardless of execution layer; capture path is dependency-free (C2).

- [ ] **R7b**: Promotion gate **primitive** anchored to the Git/PR boundary — `openwolf learnings check`: exit code `0` clean / `1` pending / `2` operational error; concise summary to **stderr** on pending; **stdout** clean (JSON only under `--json`); `--quiet` for CI. Plus a pending count in `openwolf status` (both routed through `collectAllEntries()`). OpenWolf names no execution layer and no VCS/CI host; host wiring (pre-push / Bitbucket Pipelines / GitHub Actions) lives only in docs.
  *Accept:* command exits non-zero when staging is pending; `openwolf status` reports the count; `grep -rIiE 'bitbucket|github|pipelines|pre-push' src/` returns zero (C1).
  *Decided (→ D-19):* dedicated **`openwolf learnings check`** subcommand (keeps the top-level CLI namespace clean; scales with future `learnings list/prune`). Exit-code contract unchanged.

- [ ] **R9**: Freshness integrity for `cerebrum.md` — flag a `> Last updated:` bump with no content delta ("freshness theater") via a content-body SHA-256 stored in a gitignored sidecar (`.wolf/cerebrum-freshness.json`); baseline captured at `learnings merge` (the sole content writer); surfaced in `openwolf status`; bootstrap-on-missing for fresh clones (self-healing, like R2). `node:crypto` only — no new dep.
  *Accept:* a date-only bump is flagged in `openwolf status`; a real content change is not flagged.
  *Re-baseline (→ D-20):* `openwolf status` is **read-only** — it detects and flags, never mutates. The baseline sidecar updates only on sanctioned curation: auto at `learnings merge` (sole content writer) + an explicit `openwolf learnings accept` affordance for blessed hand-edits; bootstrap-on-missing for fresh clones. Baseline means "last *sanctioned* content," not "last content a `status` run observed."

## Future Requirements (deferred to a later rollout milestone — D-16)

- **R10**: Provenance on cerebrum entries (date + source link) + documented monthly prune ritual. *Deferred — behavioral/metadata, not core engine.*
- **R12**: Named "pantry owner" role + one-page curation runbook in the team guide. *Deferred — org-design.*

## Out of Scope

| Item | Reason |
|------|--------|
| GSD / `.planning/` curation | Separate tool; OpenWolf is framework-blind toward it |
| `memory.md` propose-mode | Per-dev append-only log; interleaving acceptable; gitignored |
| Scanner-initiated `anatomy.md` rewrites | Authoritative single-process op; no concurrency concern |
| Dashboard learning panel (DASH-01/02) | Deferred since v1.1 |
| Real-time CRDT semantics | Human-merge (propose-mode) is the chosen model |
| Detecting "last session before PR" | The session-end lifecycle-modeling trap; the Git boundary is the gate instead (D-15) |

## Traceability

*(Every requirement maps to exactly one phase. Coverage: 7/7.)*

| Requirement | Phase |
|-------------|-------|
| VER-01 | Phase 8 — Verify Landed P0 Hygiene |
| R4 | Phase 9 — Tracking Hygiene (One Authoritative Ignore List) |
| R6 | Phase 10 — Hook-Side In-Project Exclusion |
| R11 | Phase 11 — Framework-Blind Resume Protocol |
| R7a | Phase 12 — Framework-Blind Curation Machinery |
| R7b | Phase 12 — Framework-Blind Curation Machinery |
| R9 | Phase 12 — Framework-Blind Curation Machinery |
