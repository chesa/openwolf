# Phase 11: Framework-Blind Resume Protocol - Research

**Researched:** 2026-06-25
**Domain:** TypeScript source deletion/rewrite — OpenWolf templates, hooks, CLI, tests, docs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D11-01:** Delete `src/templates/STATUS.md` outright.
- **D11-02:** Rewrite `src/templates/OPENWOLF.md` lines `:5–24` — replace STATUS.md section with negative boundary + generic 3-step resume order (names no tool). Rewrite Session End step at `:162` to drop STATUS.md mandate; keep memory/cerebrum/buglog duties.
- **D11-03:** Rewrite `src/templates/claude-rules-openwolf.md:6–7` to mirror new OPENWOLF.md resume seam, tool-agnostic.
- **D11-04:** In `src/cli/init.ts`: remove `"STATUS.md"` from `CREATE_IF_MISSING` array (`:45`), delete `seedStatus()` function entirely (`~:277`), remove both call sites (`~:452` fresh-init, `~:454` upgrade branch). All three or none — partial removal is the failure mode.
- **D11-05:** Delete `checkStatusFreshness()` from `src/hooks/stop.ts` (`:228–265`) and its call at `:73`. Leave `checkForMissingBugLogs` and `checkCerebrumFreshness` intact.
- **D11-06:** Add `openwolf.execution_layer: null` to template `config.json` under the `openwolf` block. Strict JSON — no `//` comments. Use a sibling string key for discoverability + authoritative explanation in `docs/configuration.md`.
- **D11-07 (user-locked):** Surface non-null hint as plain key-value line only. `openwolf status` adds one line under `Mode:` — `  Execution layer: gsd`. `session-start.ts` adds one `stderr` line when hint is set — `OpenWolf: execution layer = gsd — read its plan/status first.` Both silent when null/absent. No ANSI color, no banner.
- **D11-08 (user-locked):** `openwolf init` / `openwolf update` must never delete an existing `.wolf/STATUS.md` in a consumer repo.
- **D11-09 (user-locked):** Historical `docs/superpowers/{plans,specs}/*` — prepend deprecation blockquote banner only, do not rewrite. Current guides (`README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md`) are rewritten normally.
- **D11-10:** Remove `#   STATUS.md  — project status` comment line from `src/templates/wolf-gitignore`.
- **D11-11:** Invert/drop STATUS.md assertion in `tests/cli/init.test.ts:296`; add execution_layer read test.
- **D11-12 (user-confirmed):** Version is already `1.3.0-beta` — satisfies >= minor bump. Add changelog entry only.
- **D11-13:** After editing `stop.ts`: run `pnpm build:hooks` then `node dist/bin/openwolf.js update` so `.wolf/hooks/stop.js` reflects the change.
- **D11-14:** `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` must return zero (C1 no-regression gate).

### Claude's Discretion

- Exact prose for the new OPENWOLF.md negative-boundary section and 3-step resume order (constraint: names no tool; preserves "resume in few reads" spirit).
- Whether `execution_layer` gets a sibling note key in `config.json` vs. `docs/configuration.md`-only vs. both (honoring D11-06 strict-JSON constraint).
- Whether `session-start.ts` hint read is inline or a small helper; whether `status.ts` reads value via existing `readJSON` config load or a dedicated read.

### Deferred Ideas (OUT OF SCOPE)

- Acting on `execution_layer` beyond reading + surfacing it (branching behavior, auto-detection, allow-list validation).
- R7a/R7b/R9 curation machinery on `stop.ts` — Phase 12.
- Migrating existing consumer STATUS.md content into cerebrum/memory automatically.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R11 | Remove `STATUS.md` from OpenWolf; replace with framework-blind resume seam. `OPENWOLF.md` asserts negative boundary + generic resume order naming no tool; OpenWolf reads optional `config.json -> openwolf.execution_layer` hint. `openwolf init` seeds no STATUS.md; C1 grep zero; suite green; >= minor version bump. | Full codebase audit completed — all 9 touch-point files read, exact line numbers confirmed, implementation paths mapped. |
</phase_requirements>

---

## Summary

Phase 11 is a **deletion and prose-rewrite** phase with zero new external dependencies and no new modules. The entire work surface is within the OpenWolf repository itself. The research exercise was a codebase audit: confirm exact line numbers, understand the functions to delete, map the integration points for the new `execution_layer` hint, and document the test mutations required.

All 9 canonical source files have been read in full. The `checkStatusFreshness()` function (`:228–265`) is confirmed as a self-contained block: it holds both R11-named nudges (stale-STATUS nudge + "STATUS.md missing" nudge), has one call site (`:73`), and shares no code with `checkForMissingBugLogs` or `checkCerebrumFreshness`. The `seedStatus()` function (`~:297–312`) is likewise fully self-contained with exactly two call sites. The `CREATE_IF_MISSING` array entry at line `:45` is a one-line surgical removal.

The new `execution_layer` hint has two lightweight consumers: `status.ts` (already imports `readJSON`) and `session-start.ts` (needs a small config read mirroring the cerebrum-freshness block at `:65–88`). The test impact is narrow: one assertion in `init.test.ts` to invert and focused new tests to add.

**Primary recommendation:** Sequence as three waves: (1) template + init.ts removals, (2) hook teardown + build verification, (3) execution_layer surfacing + tests + docs.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resume protocol prose | Templates (`.wolf/`) | None | OPENWOLF.md is the seeded operating protocol file |
| Hint storage | Templates (`config.json`) | None | Config file is the declared extension point |
| Hint surface in CLI status | CLI (`src/cli/status.ts`) | None | `openwolf status` owns the env block display |
| Hint surface at session start | Hooks (`src/hooks/session-start.ts`) | None | Session-start hook owns session-opening nudges |
| STATUS.md seeding (to remove) | CLI (`src/cli/init.ts`) | None | `initCommand()` owns all `.wolf/` file seeding |
| STATUS freshness check (to remove) | Hooks (`src/hooks/stop.ts`) | None | `finalizeSession()` owns session-end nudges |
| Test coverage | Tests (`tests/`) | None | Mirrors `src/` per project convention |
| Documentation | Docs (`README.md`, `docs/`) | None | Guides and historical design artifacts |

---

## Standard Stack

No new packages are introduced in this phase. The existing toolchain applies:

| Tool | Version | Purpose | Invocation |
|------|---------|---------|------------|
| TypeScript | (tsconfig.json) | All source compilation | `pnpm build` / `tsc --noEmit` |
| tsconfig.hooks.json | — | Hooks-only compilation | `pnpm build:hooks` / `tsc --noEmit -p tsconfig.hooks.json` |
| Vitest | 4.1.5 | Test runner | `pnpm test` |
| openwolf update | — | Copies `dist/hooks/` to `.wolf/hooks/` | `node dist/bin/openwolf.js update` |

[VERIFIED: codebase read] Vitest 4.1.5 per `.planning/codebase/TESTING.md`.

---

## Package Legitimacy Audit

No new packages are installed in this phase. Not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
src/templates/           (seeded at openwolf init)
  OPENWOLF.md          -> .wolf/OPENWOLF.md  (operating protocol — rewrite)
  config.json          -> .wolf/config.json   (add execution_layer: null)
  claude-rules-openwolf.md -> .claude/rules/openwolf.md (rewrite 2 lines)
  wolf-gitignore       -> .wolf/.gitignore    (remove STATUS comment line)
  STATUS.md            [DELETE this template]

src/cli/init.ts
  CREATE_IF_MISSING[]  -> remove "STATUS.md" entry
  seedStatus()         -> DELETE function + 2 call sites

src/hooks/stop.ts
  checkStatusFreshness() -> DELETE function + 1 call site (:73)
  remaining hooks: checkForMissingBugLogs, checkCerebrumFreshness (untouched)

src/cli/status.ts
  Mode/Main repo block -> ADD "Execution layer: X" line (plain console.log, silent if null)
  reads config.json via readJSON (already imported)

src/hooks/session-start.ts
  cerebrum-freshness block (:65-88) -> MIRROR pattern for execution_layer hint
  (add small config read using raw fs; emit one stderr line if hint set)

tests/cli/init.test.ts
  REQUIRED array (:297) -> remove "STATUS.md"
  findMissingTemplates "returns empty" test -> remove "STATUS.md" from fixture set
  [ADD] execution_layer read tests for status.ts / session-start.ts

docs/
  README.md                    -> 1 STATUS hit: rewrite
  docs/ARCHITECTURE.md         -> 1 STATUS hit: rewrite
  docs/configuration.md        -> 1 STATUS hit: rewrite
  docs/superpowers/plans/*.md  -> prepend deprecation banner (no rewrite)
  docs/superpowers/specs/*.md  -> prepend deprecation banner (no rewrite)
```

### Recommended Wave Structure

Wave 1 — Template + CLI plumbing (no build gate required):
- Delete `src/templates/STATUS.md`
- Rewrite `src/templates/OPENWOLF.md`
- Rewrite `src/templates/claude-rules-openwolf.md`
- Edit `src/templates/config.json` (add execution_layer)
- Edit `src/templates/wolf-gitignore` (remove STATUS comment)
- Edit `src/cli/init.ts` (remove STATUS.md from CREATE_IF_MISSING, delete seedStatus(), remove 2 call sites)

Wave 2 — Hook teardown + build verification:
- Edit `src/hooks/stop.ts` (delete checkStatusFreshness + call site)
- `pnpm build:hooks` then `node dist/bin/openwolf.js update` (D11-13)
- `tsc --noEmit -p tsconfig.hooks.json` (C2 gate)
- `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` (C1 gate)

Wave 3 — Surfacing + tests + docs:
- Edit `src/cli/status.ts` (add Execution layer line)
- Edit `src/hooks/session-start.ts` (add hint read + stderr emit)
- `pnpm build:hooks` then `node dist/bin/openwolf.js update` (session-start.ts changed)
- Edit tests (invert STATUS assertion, add execution_layer tests)
- Rewrite `README.md`, `docs/ARCHITECTURE.md`, `docs/configuration.md`
- Prepend banners to historical `docs/superpowers/*` files
- Add changelog entry
- `pnpm test` full suite green

---

### Pattern: Deletion Without Orphan (init.ts)

The three STATUS.md removal sites in `init.ts` are coupled — removing any subset creates broken code. The correct atomic edit touches:

1. Remove line `:45` (`"STATUS.md"`) from `CREATE_IF_MISSING` array.
2. Delete lines `~:297–312` (the `seedStatus()` function body).
3. Remove `seedStatus(wolfDir, projectRoot)` call at `~:474` (inside `if (!isUpgrade)`).
4. Remove the `else if (newlyCreated.has("STATUS.md"))` branch at `~:475–479`.

[VERIFIED: codebase read] Confirmed via reading `src/cli/init.ts` in full. The `seedCerebrum()` sibling (`:314–341`) is a surviving peer — leave intact.

### Pattern: Self-Contained Function Deletion (stop.ts)

`checkStatusFreshness()` at `:228–265` is fully self-contained:
- Its only call is `checkStatusFreshness(wolfDir, session)` at `:73`.
- It uses `fs`, `path`, `session`, `wolfDir` — all shared with surviving functions.
- No shared variables or closures are unique to it.
- The call at `:73` sits between `checkCerebrumFreshness(wolfDir, session)` at `:70` and the `// Build session entry` comment at `:76`. After removal those two lines become adjacent.

[VERIFIED: codebase read] Confirmed via reading `src/hooks/stop.ts` in full.

### Pattern: Execution Layer Hint — Reading config.json in status.ts

`status.ts` already imports `readJSON` from `../utils/fs-safe.js` and has `wolfDir` in scope. The read is three lines:

```typescript
// Source: mirrors existing readJSON usage in src/cli/status.ts
const config = readJSON<{
  openwolf?: { execution_layer?: string | null };
}>(path.join(wolfDir, "config.json"), {});
const executionLayer = config.openwolf?.execution_layer ?? null;

// In the Mode block (after existing Mode/Main repo lines):
if (executionLayer) {
  console.log(`  Execution layer: ${executionLayer}`);
}
```

[VERIFIED: codebase read] `readJSON` already imported in `status.ts`; `wolfDir` already computed at line `:11–13`.

### Pattern: Execution Layer Hint — Reading config.json in session-start.ts

Hooks run in isolation and cannot import from `src/utils/` at runtime (C2 constraint). Session-start must use raw `fs.readFileSync` + `JSON.parse` directly, mirroring the existing cerebrum check at `:67–69`:

```typescript
// Source: mirrors cerebrum check pattern in src/hooks/session-start.ts (:65-88)
// Add after the memory.md header write and before the cerebrum check.
try {
  const configPath = path.join(wolfDir, "config.json");
  const configText = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configText) as {
    openwolf?: { execution_layer?: string | null };
  };
  const hint = config.openwolf?.execution_layer ?? null;
  if (hint) {
    process.stderr.write(
      `OpenWolf: execution layer = ${hint} — read its plan/status first.\n`
    );
  }
} catch {
  // config.json missing or unparseable — silently skip (hint is optional)
}
```

[VERIFIED: codebase read] `session-start.ts` already uses raw `fs.readFileSync` at `:67–69`; `wolfDir` is in scope via `getWolfDir()`.

### Pattern: Template config.json — Strict JSON with Sibling Note Key

`src/templates/config.json` is strict JSON; no `//` comments. Add two fields under `openwolf`:

```json
{
  "openwolf": {
    "execution_layer": null,
    "execution_layer_note": "Optional: set to your execution layer name (e.g. \"gsd\") so OpenWolf can point resume at its plan/status. null = generic resume order.",
    ...existing fields...
  }
}
```

[VERIFIED: codebase read] `config.json` confirmed strict JSON with no comments; `openwolf` block exists with many existing keys.

### Anti-Patterns to Avoid

- **Partial seedStatus() removal:** Remove the function body but leave a call site (or vice-versa) — TypeScript compile error. All three sites must be removed together (D11-04).
- **Introducing ANSI color in status.ts:** The file uses only `console.log` with no color library today. Adding ANSI is a new pattern (D11-07 explicitly rejected).
- **Importing readJSON from src/utils/ in hooks:** Violates C2 (MODULE_NOT_FOUND at runtime). Use raw `fs.readFileSync` + `JSON.parse` in `session-start.ts`.
- **Deleting an existing consumer STATUS.md:** `openwolf init` must only stop *seeding* STATUS.md — it must not remove one if already present (D11-08). Removing `"STATUS.md"` from `CREATE_IF_MISSING` is sufficient; the `CREATE_IF_MISSING` loop only writes when absent.
- **Rewriting historical docs:** `docs/superpowers/*` design artifacts get a prepended banner only (D11-09).
- **Forgetting the build+copy step:** Editing `stop.ts` or `session-start.ts` TypeScript source is inert until compiled and copied. `pnpm build:hooks` then `node dist/bin/openwolf.js update` must follow every hook edit.
- **Breaking strict JSON with a comment:** A `//` comment in `config.json` causes `JSON.parse` to throw at init time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading config.json in session-start.ts | Import readJSON from src/utils/ | Raw `fs.readFileSync` + `JSON.parse` | C2: hooks cannot import node_modules or src/utils/ at runtime |
| Displaying execution_layer in status.ts | ANSI library or banner | Plain `console.log` key-value line | Matches existing no-color convention; D11-07 prohibits banner |
| Validating execution_layer value | Allow-list check | None — display as-is | R11 requires only reading + surfacing; validation is deferred |
| Documenting JSON config fields | Comment in JSON | Sibling note key + docs/configuration.md | Strict JSON constraint; sibling key is discoverable in the file |

---

## Runtime State Inventory

> Included because this phase removes a seeded protocol file consumed by running sessions.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `.wolf/STATUS.md` in consumer repos (e.g., acme_translators) — may contain user-authored content | Code-only: OpenWolf stops seeding; existing files become inert user prose, untouched (D11-08) |
| Live service config | None — STATUS.md is not used by the daemon, cron engine, or registry | None |
| OS-registered state | None — no OS registrations reference STATUS.md | None |
| Secrets/env vars | None — no env vars reference STATUS.md | None |
| Build artifacts | `.wolf/hooks/stop.js` in consumer repos — compiled from stop.ts; carries old checkStatusFreshness until consumer runs `openwolf update` | Post-upgrade behavior: STATUS nudges continue until consumer upgrades; acceptable per D11-08 non-destructive policy |

---

## Common Pitfalls

### Pitfall 1: Leaving a seedStatus() Call Site After Deleting the Function
**What goes wrong:** TypeScript compile error: `Cannot find name 'seedStatus'`. Fails `pnpm build`.
**Why it happens:** `init.ts` has two call sites — the `if (!isUpgrade)` block at `~:474` and the `else if (newlyCreated.has("STATUS.md"))` upgrade branch at `~:475–479`. Easy to delete the fresh-init call but miss the upgrade branch.
**How to avoid:** Delete `seedStatus()`, remove both call sites in the same edit pass. After editing, grep `init.ts` for `seedStatus` — must return zero.
**Warning signs:** TypeScript compile error immediately on `pnpm build`.

### Pitfall 2: findMissingTemplates Test Breaks Without STATUS.md Update
**What goes wrong:** `tests/cli/init.test.ts` has a `REQUIRED` array at `:294–298` that includes `"STATUS.md"`. If the template is deleted but the test REQUIRED array still lists it, the "returns empty" test passes incorrectly (it writes the file to satisfy the check), and missing-template detection is silently broken.
**Why it happens:** The test REQUIRED array is an in-test mirror of `ALWAYS_OVERWRITE + CREATE_IF_MISSING`. When source arrays change, the test mirror must change too.
**How to avoid:** After editing `CREATE_IF_MISSING`, grep `init.test.ts` for "STATUS.md" and update all fixture lists.
**Warning signs:** Test passes when it should catch a regression.

### Pitfall 3: Hook Source Edited but Not Compiled/Copied
**What goes wrong:** After editing `stop.ts` or `session-start.ts`, the `.wolf/hooks/stop.js` / `session-start.js` in the consumer project still have the old code. STATUS nudges continue.
**Why it happens:** Claude Code executes hooks from `.wolf/hooks/` (JavaScript), not from `src/hooks/` (TypeScript).
**How to avoid:** After any hook TypeScript edit: `pnpm build:hooks && node dist/bin/openwolf.js update`.
**Warning signs:** Running a session still emits STATUS.md nudges after the code change.

### Pitfall 4: C1 Grep Introduced Accidentally in Prose Rewrites
**What goes wrong:** A prose rewrite mentions a tool name (`gsd`, `superpowers`, etc.) in a code path — for example, inside OPENWOLF.md template or a comment in `session-start.ts`.
**Why it happens:** The OPENWOLF.md rewrite is guidance-prose; easy to write "check your GSD plan if present" while meaning to be tool-agnostic.
**How to avoid:** Run `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` after each prose edit. The check is already zero today (D11-14 is a no-regression gate).
**Warning signs:** The grep returns any hit in the listed directories.

### Pitfall 5: Strict JSON Broken in config.json
**What goes wrong:** A `//` comment in `config.json` causes `JSON.parse` (via `readJSON`) to throw at init time.
**Why it happens:** JavaScript object literals allow `//` comments; JSON does not.
**How to avoid:** Use the sibling-key approach (D11-06). Validate after editing: `node -e "JSON.parse(require('fs').readFileSync('src/templates/config.json','utf-8'))"`.
**Warning signs:** `SyntaxError: Unexpected token` on `openwolf init`.

### Pitfall 6: wolf-gitignore STATUS Line Location
**What goes wrong:** Editing line `:27` blindly without searching for the STATUS.md string, potentially editing the wrong line or missing the actual comment.
**Why it happens:** CONTEXT.md cites `:27` but the file content may shift with future edits.
**How to avoid:** Search for `STATUS.md` in `src/templates/wolf-gitignore` at implementation time rather than relying on a line number. The comment is in the "Not listed below — they ARE committed:" header block at the top.
**Warning signs:** File saved without the STATUS.md comment removed.

---

## Code Examples

### Exact function signature to delete in stop.ts

```typescript
// Source: src/hooks/stop.ts :228-265 (confirmed by direct file read)
// DELETE this entire function.
function checkStatusFreshness(wolfDir: string, session: SessionData): void {
  const statusPath = path.join(wolfDir, "STATUS.md");
  const codeWrites = session.files_written.filter(
    (w) =>
      !w.file.includes(`${path.sep}.wolf${path.sep}`) &&
      !w.file.includes("/.wolf/") &&
      !w.file.endsWith(".tmp")
  );
  try {
    const stat = fs.statSync(statusPath);
    const sessionStartMs = session.started ? Date.parse(session.started) : 0;
    if (!sessionStartMs) return;
    if (codeWrites.length >= 3 && stat.mtimeMs < sessionStartMs) {
      process.stderr.write(`... stale nudge ...`);
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (codeWrites.length >= 3) {
        process.stderr.write(`... missing nudge ...`);
      }
    }
  }
}
```

Call site to remove (`:73`):
```typescript
  // Check if STATUS.md is stale relative to this session
  checkStatusFreshness(wolfDir, session);
```

After removal, `:70` (`checkCerebrumFreshness(wolfDir, session)`) is immediately followed by `:76` (`// Build session entry`).

### Exact CREATE_IF_MISSING edit in init.ts

```typescript
// Current src/cli/init.ts :39-52 — remove "STATUS.md" line
const CREATE_IF_MISSING = [
  "config.json",
  "identity.md",
  "cerebrum.md",
  "memory.md",
  "anatomy.md",
  // "STATUS.md",   <-- DELETE THIS LINE
  "token-ledger.json",
  "buglog.ndjson",
  "cron-manifest.json",
  "cron-state.json",
  "designqc-report.json",
  "suggestions.json",
];
```

### Exact call sites to remove in init.ts (~:471-479)

```typescript
  // Current init.ts fresh-init block — remove seedStatus call
  if (!isUpgrade) {
    writeIdentity(projectRoot, wolfDir);
    seedCerebrum(wolfDir, projectRoot);
    seedStatus(wolfDir, projectRoot);   // <-- DELETE THIS LINE
  } else if (newlyCreated.has("STATUS.md")) {   // <-- DELETE THIS ENTIRE BRANCH
    seedStatus(wolfDir, projectRoot);
  }
```

### OPENWOLF.md Session End step to rewrite (:162)

Current line 162:
```
1. **Update `.wolf/STATUS.md`** — move concluded work to ✅, write next quest in 🚀, bump date. This is the most important step for next session efficiency.
```

Replacement (tool-agnostic):
```
1. **Update your execution layer's plan or status file** (if applicable) — record what was completed and what comes next so the following session can resume in one read.
```

### claude-rules-openwolf.md lines 6-7 to replace

Current:
```
- Read .wolf/STATUS.md FIRST when resuming a session — it contains current quest, next steps, decisions
- Update .wolf/STATUS.md (✅ done / 🚀 next quest) when a quest finishes or before suggesting /clear
```

Replacement:
```
- When resuming a session: check your execution layer's plan/status first (if present), then .wolf/cerebrum.md, then recent .wolf/memory.md
- At session end: update your execution layer's plan/status file (if applicable) so the next session resumes in one read
```

### Deprecation banner text for historical docs (D11-09 verbatim)

```markdown
> **NOTE:** Historical design artifact (v1.2-beta era). The `STATUS.md` protocol described below is deprecated and replaced by the framework-blind resume seam in `OPENWOLF.md`.
```

Prepend to:
- `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md`
- `docs/superpowers/plans/2026-06-23-shared-checkout-concurrency-phase1.md`
- `docs/superpowers/plans/2026-06-24-concurrency-integration-tests.md`
- `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md`
- `docs/superpowers/specs/2026-06-23-shared-checkout-concurrency-design.md`
- `docs/superpowers/specs/2026-06-24-concurrency-integration-tests-design.md`

Note: Only files with STATUS.md references need the banner per D11-09's intent. Confirmed STATUS.md references exist only in:
- `docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md` (line 733)
- `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md` (line 361)

The other four superpowers files may not reference STATUS.md — planner should confirm before prepending banners to all six.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `openwolf init` seeds STATUS.md | `openwolf init` seeds no STATUS.md | Phase 11 | Consumers must use their execution layer's own plan/status mechanism |
| `stop.ts` nudges Claude to update STATUS.md | No STATUS nudges from stop.ts | Phase 11 | STATUS.md becomes inert user-managed file in existing repos |
| OPENWOLF.md mandates "read STATUS.md first" | OPENWOLF.md defers to execution layer, generic 3-step resume order | Phase 11 | Protocol is tool-agnostic; works under GSD, Superpowers, gstack, or none |

**Deprecated/outdated after this phase:**
- `STATUS.md` as a framework-seeded artifact: becomes inert user prose in existing repos.
- `checkStatusFreshness()`: deleted from stop.ts; the nudge no longer fires.
- `seedStatus()`: deleted from init.ts; function no longer exists.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Historical superpowers docs without STATUS.md references do not need the deprecation banner | Code Examples | Planner might skip the banner for files that actually do reference STATUS.md — confirm with grep before editing |
| A2 | `execution_layer_note` (no underscore prefix) is the correct sibling key naming convention | Architecture Patterns | Wrong style for config.json — check existing key naming in the file before committing (all existing keys use lowercase + underscore, which matches) |

**A2 resolved:** [VERIFIED: codebase read] `config.json` uses lowercase snake_case for all keys (`auto_scan_on_init`, `rescan_interval_hours`, etc.). `execution_layer` and `execution_layer_note` follow this convention exactly.

---

## Open Questions (RESOLVED)

1. **Superpowers docs banner scope** — **RESOLVED:** banner only the two
   grep-confirmed files (`docs/superpowers/plans/2026-06-07-chesa-fork-team-toolkit.md`
   and `docs/superpowers/specs/2026-06-06-chesa-fork-team-toolkit-design.md`).
   - What we know: `grep -rIl 'STATUS' docs/superpowers/` confirmed STATUS.md
     references in `plans/2026-06-07` and `specs/2026-06-06` only — the other
     four superpowers files contain no STATUS reference and therefore receive no
     banner. CONTEXT.md D11-09 names exactly these two files.
   - Resolution: Banner is scoped to the two STATUS-referencing files. Plan
     11-03 Task 4 already targets exactly these two files and asserts
     `grep -rIl 'Historical design artifact' docs/superpowers/` lists exactly
     them. No "banner all six" fallback is needed — the grep result is
     authoritative.

2. **wolf-gitignore STATUS line exact location** — **RESOLVED:** search for the
   `STATUS` string at implementation time rather than relying on the `:27` line
   number.
   - What we know: The file was read in full. No active ignore rule line for
     STATUS.md exists. The `:27` line number cited in CONTEXT.md D11-10 is stale
     — line 27 is now `memory.md`; any STATUS.md comment in the header
     "Not listed below" block has already been removed in a prior edit.
   - Resolution: Plan 11-01 Task 1 removes any line matching `STATUS.md` in
     `src/templates/wolf-gitignore` by searching the string at implementation
     time (idempotent — a no-op for the current repo file, but correct for older
     consumer states), and gates on `grep -c 'STATUS.md' src/templates/wolf-gitignore`
     returning 0. The `:27` line number is NOT trusted.

---

## Environment Availability

This phase is purely code/config changes within the TypeScript repo. No external services required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Build, test | Confirmed (project uses pnpm per CLAUDE.md) | — | npm run |
| node 20+ | openwolf update | Confirmed (project requires Node 20+) | — | None |
| tsc | Type-check gate | Confirmed (TypeScript project) | — | None |
| vitest | Test suite | Confirmed per TESTING.md | 4.1.5 | None |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/cli/init.test.ts tests/hooks/stop.test.ts tests/cli/status.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R11-a | `openwolf init` does NOT seed STATUS.md | unit | `npx vitest run tests/cli/init.test.ts` | Yes — invert assertion at `:297` |
| R11-b | `findMissingTemplates` does not require STATUS.md | unit | `npx vitest run tests/cli/init.test.ts` | Yes — update REQUIRED fixture |
| R11-c | stop.ts no longer emits STATUS freshness nudge | unit | `npx vitest run tests/hooks/stop.test.ts` | Yes — confirm existing tests still pass after deletion |
| R11-d | `openwolf status` shows `Execution layer:` when hint is set | unit | `npx vitest run tests/cli/status.test.ts` | Yes — add new test |
| R11-e | `openwolf status` is silent for `Execution layer` when hint is null | unit | `npx vitest run tests/cli/status.test.ts` | Yes — add new test |
| R11-f | `session-start.ts` emits hint stderr line when execution_layer is set | unit | `npx vitest run tests/hooks/session-start.test.ts` | Yes — add new test |
| R11-g | `session-start.ts` is silent when execution_layer is null/absent | unit | `npx vitest run tests/hooks/session-start.test.ts` | Yes — add new test |
| C1 | grep returns zero in src/templates src/hooks src/cli | shell | `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` | N/A — shell gate |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/cli/init.test.ts tests/hooks/stop.test.ts tests/cli/status.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green + C1 grep zero + `tsc --noEmit -p tsconfig.hooks.json` clean

### Wave 0 Gaps

- [ ] New test in `tests/cli/status.test.ts` — "shows `Execution layer: gsd` when hint is set in config.json"
- [ ] New test in `tests/cli/status.test.ts` — "omits Execution layer line when hint is null/absent"
- [ ] New test in `tests/hooks/session-start.test.ts` — "emits hint stderr line when execution_layer is set"
- [ ] New test in `tests/hooks/session-start.test.ts` — "silent when execution_layer is null"

*(Existing test infrastructure covers init, stop, and status behaviors — only execution_layer surfacing tests are Wave 0 gaps. All gap files already exist.)*

---

## Security Domain

This phase has no authentication, session management, input validation, or cryptography surfaces. The `execution_layer` hint is a read-only string from a local config file displayed verbatim in stderr/console.log output visible only to the developer at their terminal. No ASVS categories apply.

---

## Sources

### Primary (HIGH confidence — VERIFIED: codebase read)

- `src/hooks/stop.ts` — read in full; `checkStatusFreshness()` at `:228–265`, call at `:73`
- `src/cli/init.ts` — read in full; `CREATE_IF_MISSING` at `:45`, `seedStatus()` at `~:297–312`, call sites at `~:474` and `~:475–479`
- `src/cli/status.ts` — read in full; Mode block at `:27–33`, `readJSON` already imported
- `src/hooks/session-start.ts` — read in full; cerebrum-freshness pattern at `:65–88`, uses raw `fs.readFileSync`
- `src/templates/OPENWOLF.md` — read in full; STATUS section at `:5–24`, Session End at `:162`
- `src/templates/claude-rules-openwolf.md` — read in full; STATUS lines at `:6–7`
- `src/templates/config.json` — read in full; strict JSON structure, `openwolf` block present
- `src/templates/wolf-gitignore` — read in full; STATUS.md in header comment block only
- `src/templates/STATUS.md` — read in full; template with `{{PROJECT_NAME}}`/`{{DATE}}` placeholders
- `tests/cli/init.test.ts` — `REQUIRED` array at `:294–298`, STATUS.md at `:297`
- `tests/hooks/stop.test.ts` — read in full; no test directly covers `checkStatusFreshness`
- `tests/cli/status.test.ts` — read in full; 3 existing tests
- `tests/hooks/session-start.test.ts` — read in full; 3 existing tests
- `.planning/phases/11-framework-blind-resume-protocol/11-CONTEXT.md` — all decisions verified
- `.planning/REQUIREMENTS.md` — R11 full text confirmed
- `.planning/codebase/TESTING.md` — Vitest 4.1.5 and patterns confirmed

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — build-order dependency edges; D-14 decision record
- `CONTRIBUTING.md` — version bump policy; `1.3.0-beta` satisfies >= minor requirement
- Shell grep: `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/hooks src/cli` — confirmed zero hits (C1 baseline)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing tools confirmed by direct file read
- Architecture: HIGH — all 9 touch-point files read in full; exact line numbers mapped
- Pitfalls: HIGH — derived from actual code structure and project-documented gotchas (C2, hook copy discipline)
- Test impact: HIGH — test files read in full; exact assertions identified; gap list complete

**Research date:** 2026-06-25
**Valid until:** Indefinite for this phase — codebase is the stable source; expires only if touch-point files are edited before planning begins.
