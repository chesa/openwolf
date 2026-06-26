# Phase 11: Framework-Blind Resume Protocol — Research

**Researched:** 2026-06-25
**Domain:** OpenWolf template deletion + prose rewrite; CLI framework decoupling
**Confidence:** HIGH

## Summary

Phase 11 is a surgical deletion + prose-rewrite operation: remove OpenWolf's mandate that `.wolf/STATUS.md` exist and be updated, replace it with a framework-blind resume seam that delegates status ownership to the execution layer (GSD, Superpowers, etc.), and add an optional `config.json → openwolf.execution_layer` hint that OpenWolf surfaces non-intrusively.

The phase involves 14 explicit locked decisions and affects 13 source files across templates, CLI, hooks, docs, and tests. C1 (zero hardcoded framework references) and C2 (no npm deps in hook code) are already satisfied across the codebase. The primary complexity lies in coordinating the three call-site removals in `init.ts` (function + two invocations must all be removed together) and the hook copy discipline (edits to `stop.ts` inert until `pnpm build:hooks` → `openwolf update`).

**Primary recommendation:** Implementation can proceed via sequential edits to template files, CLI code, and hook code, followed by immediate `pnpm build:hooks` verification. No architectural risk; all decisions are locked and mutually consistent.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session resume (reads context files) | Execution layer | OpenWolf nudges | Status/roadmap belong to GSD/Superpowers; OpenWolf only surfaces an optional hint |
| Curation capture (append learnings) | OpenWolf hooks | Execution layer protocol | `stop` hook is universal (Claude Code); curation layer is execution-agnostic |
| Framework-agnostic operation | OpenWolf CLI + templates | — | No hardcoded tool names in code paths; C1 verified |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D11-01** through **D11-14**: All 14 decisions finalized and user-confirmed via CONTEXT.md.
- **D-14 (Project.md):** Remove STATUS.md; OpenWolf stays framework-blind; optional `config.json → execution_layer` slot.
- **Sequencing:** Phase 11 before Phase 12 (both edit `src/hooks/stop.ts`); Phase 11 must leave `stop.ts` free of STATUS coupling.

### Claude's Discretion
- Exact prose of the new `OPENWOLF.md` negative-boundary section (constraint: names no tool; preserves "resume in few reads" spirit).
- The `execution_layer` "comment" mechanism: sibling note key vs `docs/configuration.md`-only vs both (D11-06 flags strict-JSON constraint).
- Whether `session-start.ts` hint read is inline or a small helper; whether `status.ts` reads via existing `readJSON` config load or dedicated read.

### Deferred Ideas (OUT OF SCOPE)
- Acting on `execution_layer` beyond reading + surfacing (D-14 explicit).
- R7a/R7b/R9 curation machinery on `stop.ts` (Phase 12).
- Migrating existing consumer `STATUS.md` content into cerebrum/memory (D11-08 explicit: non-destructive = leave it).

## Codebase Baseline — Current STATE

### STATUS.md Footprint

| File | Line(s) | Role | Touch Required |
|------|---------|------|----------------|
| `src/templates/STATUS.md` | All (65 lines) | Template source, deleted outright | DELETE |
| `src/templates/OPENWOLF.md` | 5–24 (STATUS block), 162 (Session End) | Prose rewrite ✓ | REWRITE |
| `src/templates/claude-rules-openwolf.md` | 6–7 (two STATUS lines) | Rule statement, mirror OPENWOLF.md ✓ | REWRITE |
| `src/templates/wolf-gitignore` | 27 (comment line) | Docstring for deleted file | REMOVE |
| `src/cli/init.ts` | 45 (CREATE_IF_MISSING), 276–291 (seedStatus), 453, 458 (call sites) | Seeding logic, two invocations | DELETE FUNCTION + BOTH CALLS |
| `src/hooks/stop.ts` | 73 (call), 228–263 (checkStatusFreshness) | Nudge + missing-file check | DELETE FUNCTION + CALL |
| `src/cli/status.ts` | (not yet: execution_layer read) | Add key-value output line | ADD |
| `src/hooks/session-start.ts` | (not yet: execution_layer read) | Add hint greeting | ADD |
| `tests/cli/init.test.ts` | 296 (REQUIRED array) | STATUS.md in required-templates list | INVERT / DROP |
| `README.md` | 143 (table entry) | Docs, one line | REWRITE |
| `docs/ARCHITECTURE.md` | 65 (mention in lifecycle) | Docs, one mention | REWRITE |
| `docs/configuration.md` | 220 (commented line) | Docs, gitignore table | REWRITE |
| `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md` | (STATUS design) | Historical design artifact | BANNER ONLY |
| `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` | (STATUS design) | Historical design artifact | BANNER ONLY |

### Current Code State Verification

**`src/templates/STATUS.md`** (65 lines)
- Standard template with `{{PROJECT_NAME}}` and `{{DATE}}` placeholders.
- Mandate: "Single source of truth. Read FIRST." — exactly what D11-02 removes.
- No other files import it; deletion is clean.

**`src/cli/init.ts`** — seedStatus() function signature and call sites:
```
Line 45: "STATUS.md" in CREATE_IF_MISSING array
Line 276–291: seedStatus(wolfDir, projectRoot) {
  - Reads STATUS.md template
  - Replaces {{PROJECT_NAME}} and {{DATE}} placeholders
  - Writes back
  - No error if file absent (early return on ENOENT)
}
Line 452–453: Fresh init call (after writeIdentity, seedCerebrum, THEN seedStatus)
Line 454–458: Upgrade branch: if (newlyCreated.has("STATUS.md")) { seedStatus(...) }
```

**Failure mode:** Removing seedStatus() but leaving the call sites (or vice versa) leaves an orphaned invocation → runtime error. The planner must remove all three together.

**`src/hooks/stop.ts`** — checkStatusFreshness():
```
Line 73: checkStatusFreshness(wolfDir, session) call site
Line 228–263: Function definition:
  - Checks if STATUS.md exists and is older than session start
  - If exists + old + 3+ code writes: nudge to update it
  - If missing + 3+ code writes: nudge to create it
  - Both nudges go to stderr
```

**Integration context:** This function is one of three checks called in `finalizeSession` (line 67–73):
```
checkForMissingBugLogs(wolfDir, session);        // Line 67 — KEEP
checkCerebrumFreshness(wolfDir, session);        // Line 70 — KEEP
checkStatusFreshness(wolfDir, session);          // Line 73 — DELETE THIS LINE + FUNCTION
```

**Constraint:** Line 70's `checkCerebrumFreshness` and Line 67's `checkForMissingBugLogs` must NOT be removed; they are the seam Phase 12's `appendProposal()` extends (R7a). Phase 11 must leave a clean, empty seam.

**`src/templates/OPENWOLF.md`** — Current "STATUS.md — Single Source of Truth" block:
```
Lines 5–24: The full mandate
Line 162: Session End step mandating "Update .wolf/STATUS.md"
```

Replacement prose (D11-02, tool-agnostic, constraint: no "GSD" / "Superpowers" / "gstack" / ".planning"):
```
## Resume Protocol

OpenWolf does not own status, roadmap, or intent — those belong to your execution layer.
When resuming a session, read in this order:

1. **Execution-layer plan/status** (if present) — e.g., GSD `.planning/PHASE-PLAN.md`, Superpowers `/phase-state`, or your tool's equivalent.
2. **Cerebrum** (`.wolf/cerebrum.md`) — your learnings, conventions, and past mistakes.
3. **Recent memory** (`.wolf/memory.md`) — what happened in the last few sessions.

(Optional: if your project sets `config.json → openwolf.execution_layer`, OpenWolf will display that hint below.)
```

Session End rewrite (D11-02, preserve memory/cerebrum/buglog duties):
```
1. Update your **execution layer's plan/status** (GSD PLAN.md, Superpowers phase state, etc.) — that's OpenWolf's job boundary.
2. Write a session summary to `.wolf/memory.md`.
3. Review the session: did you learn anything? Did the user correct you? Did you fix a bug? If yes, update `.wolf/cerebrum.md` and/or `.wolf/buglog.ndjson`.
```

**`src/templates/config.json`** — Current structure:
```json
{
  "version": 1,
  "openwolf": {
    "enabled": true,
    "anatomy": { ... },
    "token_audit": { ... },
    ...
  }
}
```

**D11-06 addition:** Add `"execution_layer": null` to the `openwolf` block (no template comments possible — strict JSON). Discovery will be via `docs/configuration.md` + optional sibling note key.

Example:
```json
"openwolf": {
  "enabled": true,
  "execution_layer": null,
  "execution_layer_note": "Optional: set to your tool name (e.g., 'gsd') for OpenWolf to surface it in status and resume greeting.",
  "anatomy": { ... },
```

**`src/templates/wolf-gitignore`** — Line 27:
```
#   STATUS.md         — project status
```
Delete this comment line only; surrounding comments stay.

**`src/cli/status.ts`** — Current top environment block:
```
Lines 28–32: Mode / worktree context
```

**D11-07 addition:** After line 32, add one line:
```
if (hasExecutionLayerHint) {
  console.log(`  Execution layer: ${hintValue}`);
}
```

**`src/hooks/session-start.ts`** — Current cerebrum-freshness block (`:65–88`):
```
Reading cerebrum, checking age, emitting stderr line if stale.
```

**D11-07 addition:** Mirror this pattern for the `execution_layer` hint (read if present, one stderr line, silent if null/absent).

**`tests/cli/init.test.ts:296`** — Current REQUIRED array:
```typescript
const REQUIRED = [
  "OPENWOLF.md", "reframe-frameworks.md", "wolf-gitignore",
  "config.json", "identity.md", "cerebrum.md", "memory.md", "anatomy.md",
  "STATUS.md", "token-ledger.json", "buglog.ndjson", "cron-manifest.json", "cron-state.json",
];
```

**D11-11 requirement:** Remove `"STATUS.md"` from this list (assert it is NOT seeded). Add a separate focused test for the `execution_layer` hint behavior.

**Historical docs** (D11-09):
- `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` — mentions STATUS.md protocol extensively.
- `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md` — references STATUS as a design artifact.

**Prepend deprecation banner** (verbatim from D11-09):
```markdown
> **NOTE:** Historical design artifact (v1.2-beta era). The `STATUS.md` protocol described below is deprecated and replaced by the framework-blind resume seam in `OPENWOLF.md`.
```

## Decision Validation Against Code

### D11-01: Delete `src/templates/STATUS.md`
**Status:** ✓ **READY**
- File exists at expected path (65 lines).
- No other code imports or references it (verified via grep).
- Deletion is safe, non-breaking for new projects (they won't be seeded STATUS.md).
- **Risk mitigation (D11-08, user-locked):** Existing consumer repos keep their `.wolf/STATUS.md` untouched; `openwolf init` / `openwolf update` simply stops seeding it.

### D11-02: Rewrite `OPENWOLF.md` — negative boundary + generic resume order
**Status:** ✓ **READY**
- Current lines 5–24 and line 162 identified.
- Prose must name no tool (constraint verified: test phrase "GSD" / "Superpowers" / "gstack" for absence in proposed text).
- Existing pattern (`checkCerebrumFreshness` in session-start `:65–88`) shows the resume-order spirit ("read these files in order").
- **Integration risk (LOW):** Prose rewrite only; no code change.

### D11-03: Rewrite `claude-rules-openwolf.md:6–7` — mirror OPENWOLF.md
**Status:** ✓ **READY**
- Lines 6–7 currently read: "Read .wolf/STATUS.md FIRST when resuming a session — it contains current quest, next steps, decisions"
- Replace with tool-agnostic prose.
- File is a Claude Code hook rule file (minimal, 18 lines); rewrite is surgical.

### D11-04: Remove STATUS.md from CREATE_IF_MISSING array + delete seedStatus()
**Status:** ✓ **READY — Critical constraint**
- Line 45: `"STATUS.md"` in CREATE_IF_MISSING array (remove this entry).
- Lines 276–291: seedStatus() function (delete entirely).
- Call sites: Line 453 (fresh init), Line 458 (upgrade branch) — **both must be removed**.

**Failure mode:** Removing only the function definition leaves orphaned call sites → `TypeError: seedStatus is not defined` at runtime.
**Failure mode:** Removing only the call sites leaves the function defined but unreachable → dead code (low-severity, but untidy).

**Planner verification:** Check that all three removals appear in the same commit or are coordinated (the diff should show function deletion + both call-site removals together).

### D11-05: Delete checkStatusFreshness() and call site from stop.ts
**Status:** ✓ **READY — Critical for Phase 12 sequencing**
- Function: Lines 228–263 (36-line function, two nudges)
- Call site: Line 73
- **Constraint:** Must NOT remove Line 67 (checkForMissingBugLogs) or Line 70 (checkCerebrumFreshness).
- **Rationale:** Phase 12 (R7a) appends `appendProposal()` to the `finalizeSession` call sequence, right after the freshness checks. Removing STATUS coupling from `stop.ts` is the precondition.

**Planner verification:** After deletion, lines 67 and 70 should still be present and unmodified.

### D11-06: Seed `config.json → openwolf.execution_layer: null`
**Status:** ✓ **READY**
- Template config.json currently has no `execution_layer` key.
- Strict JSON constraint (no `//` comments) is real (file is parsed by `readJSON`).
- **D11-06 option A:** Add key `"execution_layer": null` + sibling note key `"execution_layer_note": "..."`.
- **D11-06 option B:** Add key only; document in `docs/configuration.md`.
- **Recommendation:** Both (discoverable in config, authoritative in docs).

### D11-07: Surface execution_layer hint (two consumers)
**Status:** ✓ **READY — Two reading locations**

**Consumer 1: `src/cli/status.ts`**
- Current top block (lines 28–32) shows `Mode:` and optional worktree context.
- Add one line: `Execution layer: {value}` (if set, silent if null/absent).
- **Pattern:** Matches existing key-value style (no ANSI color, no banner).
- **Integration:** Read via `readJSON(configPath).openwolf.execution_layer`; config is already loaded in status.ts for `token_audit` and daemon config.

**Consumer 2: `src/hooks/session-start.ts`**
- Current block (lines 65–88): `checkCerebrumFreshness()` reads cerebrum, checks age, emits one stderr line if stale.
- Add equivalent: read `config.json`, check for `openwolf.execution_layer !== null`, emit one stderr line if set.
- **Pattern:** `process.stderr.write("OpenWolf: execution layer = {value} — read its plan/status first.\n")`.
- **Integration:** Config file must be read in session-start; easiest path is a small helper or inline `readJSON`.

**Both silent when null/absent** (D11-07 explicit: "no '(none)' noise").

### D11-08: Non-destructive upgrade (leave existing STATUS.md alone)
**Status:** ✓ **ALREADY SATISFIED BY D11-01**
- By deleting STATUS.md from the template and CREATE_IF_MISSING list, `openwolf init` / `openwolf update` will simply not write or overwrite a consumer's `.wolf/STATUS.md`.
- Existing files are left untouched (no explicit code to delete them).
- **Verification:** Grep for any `fs.unlinkSync` / `fs.rmSync` targeting STATUS.md — should be zero.

### D11-09: Prepend deprecation banner to historical docs
**Status:** ✓ **READY**
- Two files affected: `2026-06-06-chesa-fork-team-toolkit-design.md` and `2026-06-07-chesa-fork-team-toolkit.md`.
- Prepend the exact banner verbatim (from CONTEXT.md specifics section).
- C1 constraint: Banner text must not introduce new hardcoded tool names.

### D11-10: Remove STATUS comment from wolf-gitignore
**Status:** ✓ **READY**
- Line 27: `#   STATUS.md  — project status`.
- Surrounding comments on lines 22–26 and 28–36 are preserved.

### D11-11: Invert/drop STATUS.md from tests; add execution_layer test
**Status:** ✓ **READY**
- Test file: `tests/cli/init.test.ts:296` (REQUIRED array).
- Remove `"STATUS.md"` from the array.
- Add focused test: verify that `openwolf status` reads a set `openwolf.execution_layer` and outputs the key-value line; verify silent output when `null`/absent.
- **Integration:** Test must use `readJSON` to mock a config with `execution_layer: "gsd"` and verify console output includes `Execution layer: gsd`.

### D11-12: Version — already at 1.3.0-beta (≥ minor bump satisfied)
**Status:** ✓ **VERIFIED**
- Package.json shows `"version": "1.3.0-beta"`.
- This satisfies criterion 4 (≥ minor protocol bump over `1.1` baseline).
- **Action:** Add changelog entry describing the protocol change (D11-12 explicit: "just add a changelog entry").

### D11-13: Build & copy verification (pnpm build:hooks → openwolf update)
**Status:** ✓ **READY — Build discipline**
- After editing `src/hooks/stop.ts`, run `pnpm build:hooks` (compiles stop.ts to `dist/hooks/stop.js`).
- Then `node dist/bin/openwolf.js update` (or `openwolf update` if installed) copies `dist/hooks/*.js` to `.wolf/hooks/`.
- **Verification:** `tsc --noEmit -p tsconfig.hooks.json` must stay clean (C2 — no npm deps in hook build).
- **Gotcha:** Edits to stop.ts are inert in `.wolf/hooks/` until the copy step runs; Phase 12 expects the new `.wolf/hooks/stop.js` to be generated and copied.

### D11-14: Grep C1 verification (zero framework mentions)
**Status:** ✓ **ALREADY PASSING**
- Current codebase: `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` returns **zero matches** (verified).
- **Constraint:** Must remain zero after all edits (no-regression gate).
- **Full suite test:** `pnpm test` must pass (all existing tests + the new execution_layer test).

## File-by-File Impact Summary

| File | Current State | Exact Changes | Context | Risk |
|------|---------------|---------------|---------|------|
| `src/templates/STATUS.md` | 65 lines | DELETE entire file | Template source | LOW — clean deletion |
| `src/templates/OPENWOLF.md` | 165 lines | Lines 5–24 rewrite + line 162 rewrite (2 edits) | Prose only | LOW — no code impact |
| `src/templates/claude-rules-openwolf.md` | 18 lines | Lines 6–7 rewrite (1 edit) | Rule statement | LOW |
| `src/templates/config.json` | 75 lines | Add key `execution_layer: null` + sibling note (1 addition) | Config template | LOW — JSON syntax must validate |
| `src/templates/wolf-gitignore` | 36 lines | Remove line 27 (1 deletion) | Comment line | LOW |
| `src/cli/init.ts` | 470 lines | Remove line 45 entry (1 edit) + delete lines 276–291 (1 deletion) + remove call sites 453 + 458 (2 edits) | Three-part coordinated change | **HIGH** — all three must align |
| `src/cli/status.ts` | 80 lines (approx) | Add 1–2 lines in top block (read config, emit key-value) | New read + output | MEDIUM — integration with existing config read |
| `src/hooks/stop.ts` | 293 lines | Delete line 73 (1 edit) + delete lines 228–263 (1 deletion) | Two-part coordinated change | MEDIUM — must not break surrounding checks |
| `src/hooks/session-start.ts` | 125 lines (approx) | Add 5–8 lines (read config, emit hint) | New read + output | MEDIUM — mirror existing pattern |
| `tests/cli/init.test.ts` | 300+ lines | Remove STATUS from REQUIRED array (1 edit) + add execution_layer test | Test suite | MEDIUM — must cover both read + silent cases |
| `README.md` | 200+ lines | Rewrite 1 table entry (line 143) | Docs | LOW |
| `docs/ARCHITECTURE.md` | 100+ lines | Rewrite 1 mention (line 65) | Docs | LOW |
| `docs/configuration.md` | 400+ lines | Rewrite 1 comment line + add execution_layer documentation | Docs | LOW |
| `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` | Historical | Prepend deprecation banner | Docs | LOW — history preserved |
| `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md` | Historical | Prepend deprecation banner | Docs | LOW — history preserved |

## Testing & Verification

### Current Test Coverage

**`tests/cli/init.test.ts:296` — REQUIRED array:**
- Currently asserts that `STATUS.md` is among the files seeded by `openwolf init`.
- **Change (D11-11):** Remove `"STATUS.md"` from the array, OR invert the assertion to assert it is NOT in the created files.
- **Rationale:** If STATUS.md is no longer in CREATE_IF_MISSING, the test must reflect that.

### New Tests Required (D11-11)

**Test 1: execution_layer read and output in status command**
```typescript
it("displays execution_layer hint if set in config.json", () => {
  // Setup: mock config.json with openwolf.execution_layer = "gsd"
  // Run: statusCommand()
  // Verify: stdout includes "Execution layer: gsd"
});

it("silent on execution_layer when null or absent", () => {
  // Setup: mock config.json with openwolf.execution_layer = null
  // Run: statusCommand()
  // Verify: stdout does NOT include "Execution layer:" line
});
```

**Test 2: session-start greeting when execution_layer is set**
```typescript
// Integration test or hook test
// Setup: config.json with openwolf.execution_layer = "superpowers"
// Run: session-start.ts main()
// Verify: stderr includes "OpenWolf: execution layer = superpowers — read its plan/status first."
```

### Hook Build Verification (D11-13)

After editing `src/hooks/stop.ts`:
```bash
# Compile hooks
pnpm build:hooks

# Type-check (must pass C2 — no npm deps in hook build)
tsc --noEmit -p tsconfig.hooks.json

# Copy to .wolf/hooks/ (if running in an initialized project)
node dist/bin/openwolf.js update   # or openwolf update if installed

# Verify .wolf/hooks/stop.js reflects the deletion
grep -c "checkStatusFreshness" .wolf/hooks/stop.js  # should be 0
```

### Full Test Suite (D11-14)

```bash
pnpm test   # Must pass green (no new failures)
pnpm build  # Verify all three compile units (CLI, hooks, dashboard) succeed
```

### Grep Verification (C1 no-regression gate)

```bash
grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli
# Expected output: (empty — zero matches)
```

## Constraints & Gotchas

### C1: Framework-Blind (Already Satisfied)
- Current codebase has zero hardcoded references to GSD, Superpowers, gstack, or `.planning`.
- **Gotcha:** When writing the new OPENWOLF.md prose, be careful not to name tools. Use phrases like "your execution layer's plan/status" instead of "GSD PLAN.md" or "Superpowers phase state."
- **Verification:** Grep the prose before commit.

### C2: No npm Deps in Hook Build (Already Satisfied)
- `tsc --noEmit -p tsconfig.hooks.json` already passes.
- Removal of `checkStatusFreshness()` does NOT add any new imports to stop.ts.
- **Gotcha:** If the new `execution_layer` read in session-start.ts uses `readJSON`, verify it's already imported (it is: `const { ..., readJSON, ... } = require('./shared')`).

### Template `config.json` is Strict JSON
- **Constraint (D11-06 explicit):** Cannot carry `//` comments (the file is parsed by `readJSON` and served as JSON).
- **Gotcha:** A stray trailing comma or unclosed brace breaks the template.
- **Solution:** Either add a sibling string key (`"execution_layer_note": "..."`) for in-file documentation, OR rely entirely on `docs/configuration.md` for the explanation.

### Hooks are Inert Until Copied
- **Constraint (D11-13 explicit):** Edits to `src/hooks/stop.ts` are invisible to Claude Code until:
  1. `pnpm build:hooks` compiles them to `dist/hooks/stop.js`.
  2. `openwolf update` copies `dist/hooks/` to `.wolf/hooks/`.
- **Gotcha:** If the planner runs the phase but forgets the copy step, Phase 12 (R7a) will call a `checkStatusFreshness` function that no longer exists in the deployed `.wolf/hooks/stop.js`.
- **Mitigation:** D11-13 explicitly lists the build + copy step; the verification stage will catch missing `.wolf/hooks/stop.js` updates.

### Non-Destructive Upgrade (D11-08)
- **Constraint:** `openwolf init` / `openwolf update` must NEVER delete an existing `.wolf/STATUS.md` in a consumer repo.
- **Gotcha:** If code accidentally adds an `fs.unlinkSync(statusPath)` during the upgrade, existing consumer projects lose their STATUS.md.
- **Mitigation:** Do NOT add any deletion logic. Simply remove STATUS.md from the template list and the seeding function. Existing files are untouched automatically.

### Three-Part Removal in init.ts
- **Constraint (D11-04 explicit):** The seedStatus() function + both call sites (fresh + upgrade branch) must be removed together.
- **Gotcha:** If only the function is deleted but the call sites remain, runtime error at line 453 or 458: `TypeError: seedStatus is not defined`.
- **Gotcha:** If only the call sites are removed but the function stays, dead code accumulates (low-severity, but untidy).
- **Mitigation:** The planner must coordinate the three edits in a single task or verify all three are present before marking complete.

### OPENWOLF.md Prose Rewrite
- **Constraint:** Must assert the negative boundary ("OpenWolf does NOT own status / roadmap / intent").
- **Gotcha:** If the rewrite says "use GSD for status" or "configure Superpowers for roadmap," it violates the negative boundary (C1).
- **Mitigation:** Use tool-agnostic language ("your execution layer's plan/status") and test the prose against the grep C1 gate.

## Precedent & Patterns

### checkCerebrumFreshness() — Model for Optional Nudges
**Location:** `session-start.ts:269–298` (in stop.ts as well)
**Pattern:**
```typescript
function checkCerebrumFreshness(wolfDir: string, ...): void {
  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  try {
    const stat = fs.statSync(cerebrumPath);
    const daysSinceUpdate = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    // ... logic to detect staleness ...
    if (staleness_condition) {
      process.stderr.write(`💡 OpenWolf: [message]\n`);
    }
  } catch (err) {
    // Silently skip non-critical errors
  }
}
```

**Reuse for execution_layer:** Mirror this structure for the hint read in session-start.ts.

### readJSON Usage in status.ts
**Location:** `src/cli/status.ts:4` (already imported)
**Pattern:**
```typescript
const configPath = path.join(wolfDir, "config.json");
const config = readJSON(configPath) || {};
const executionLayer = config.openwolf?.execution_layer;
if (executionLayer) {
  console.log(`  Execution layer: ${executionLayer}`);
}
```

**Reuse:** Same pattern in session-start.ts (must import `readJSON` from shared.js).

### Established Key-Value Vocabulary in status.ts
**Location:** `src/cli/status.ts:27–33`
**Example:**
```
  Mode: Main checkout
```

**Pattern:** The `Execution layer:` line joins this vocabulary, same indentation + format.

### CREATE_IF_MISSING Surgical Edit Pattern
**Location:** `src/cli/init.ts:39–52`
**Pattern:** Array of filenames; removal is a simple filter operation. The array is later iterated (line 415) — removing an entry is safe if the corresponding template is also deleted.

## Key Risks & Blockers

### Risk 1: Three-Part Coordination in init.ts (MEDIUM)
**Risk:** Removing the function but not the call sites (or vice versa) leaves the code broken.
**Mitigation:** Planner creates a single task that covers all three removals (line 45, 276–291, 453, 458). Verification: grep for `seedStatus` post-edit should return zero.

### Risk 2: Hook Copy Discipline (MEDIUM)
**Risk:** Phase 11 edits `stop.ts`, but Phase 12 (R7a) needs the new `.wolf/hooks/stop.js` without the `checkStatusFreshness` call.
**Mitigation:** D11-13 explicitly lists the `pnpm build:hooks` → `openwolf update` copy step. Phase execution gates on this.

### Risk 3: OPENWOLF.md Prose Naming Tool Names (LOW)
**Risk:** New prose accidentally names GSD / Superpowers / gstack, violating C1.
**Mitigation:** Test new prose against `grep -iE 'gsd|superpowers|gstack|\.planning'` before commit.

### Risk 4: config.json JSON Syntax (LOW)
**Risk:** If adding `execution_layer` + sibling note key, trailing comma or bracket error breaks the template.
**Mitigation:** Validate JSON: `node -e "console.log(require('./src/templates/config.json'))"` after the edit.

### Risk 5: Non-Destructive Upgrade Not Enforced (LOW)
**Risk:** Future refactoring accidentally adds code to delete STATUS.md from consumer repos.
**Mitigation:** D11-08 is explicit and documented; code review should flag any `fs.unlinkSync`/`fs.rmSync` on STATUS.md paths.

## Sources

### PRIMARY (VERIFIED)
- **CONTEXT.md:** All 14 decisions (D11-01 through D11-14), constraints, and rationale — user-locked via `/gsd-discuss-phase`.
- **REQUIREMENTS.md §R11:** Full requirement text, touch-point list, accept criteria.
- **PROJECT.md §Key Decisions:** D-14 (framework-blind boundary), project alignment.
- **Codebase grep:** C1 status (zero hardcoded tool names), file locations, line numbers, current code state.

### SECONDARY (CITED)
- **CLAUDE.md §Development Gotchas:** Hook build discipline, template naming constraints, version policy.
- **source files (init.ts, stop.ts, session-start.ts, etc.):** Current code structure, function signatures, integration points.

### VERIFIED THIS SESSION
- [VERIFIED: codebase grep] C1 already satisfied (zero GSD/Superpowers/gstack/`.planning` mentions).
- [VERIFIED: codebase grep] STATUS.md touched in all expected locations; no unexpected references.
- [VERIFIED: package.json] Version 1.3.0-beta satisfies ≥ minor bump criterion.
- [VERIFIED: file reads] seedStatus() signature and two call sites located at expected line numbers.
- [VERIFIED: file reads] checkStatusFreshness() function definition and call site located.

## Metadata

**Confidence breakdown:**
- **Standard stack:** N/A (deletion + prose phase)
- **Architecture:** HIGH — decisions are locked, code changes are surgical and well-understood
- **Pitfalls:** HIGH — C1 and C2 constraints are already satisfied; failure modes are clearly identified (three-part removal, hook copy discipline)

**Research date:** 2026-06-25
**Valid until:** 2026-07-09 (14 days for stable, locked scope)

---

*Phase: 11-framework-blind-resume-protocol*
*Research completed: 2026-06-25*
