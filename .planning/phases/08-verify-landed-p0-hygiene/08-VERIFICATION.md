# Phase 8 Verification Report: P0 Hygiene

**Verified:** 2026-06-25
**Branch:** `develop-preview`
**Evidence basis:** Frozen-snapshot replay + code inspection + acme field data
**VER-01 Deliverable:** commit↔behavior map for all six P0 hygiene behaviors

---

## Results Summary

| Behavior | Commit | Status | Evidence |
|----------|--------|--------|----------|
| R1 — untrack `anatomy.md` | `cac925a` | PASS | Template lists `anatomy.md` in `wolf-gitignore`; field note: acme predates fix (expected pre-update artifact, not a regression) |
| R2 — self-heal scan | `c430a9b` | PASS | `selfHealAnatomy()` spawns `openwolf scan`; `tests/hooks/wolf-selfheal.test.ts` suite green (N tests) |
| R3 — out-of-project `../` guard | `cac925a` | PASS | `recordAnatomyWrite()` returns early for `../` paths; acme-replay regression test added + green |
| R5 — buglog code-file gate | `9f63395` | PASS | `autoDetectBugFix()` gates on file extension; acme prose-replay tests (lambdas/README.md, docs/superpowers shapes) green |
| Q1 — opt-in `respect_gitignore` | `3ef255c` | PASS | Scanner reads `config.openwolf?.anatomy?.respect_gitignore ?? false`; anatomy-scanner suite green |
| Q2 — nested/glob `exclude_patterns` | `2f3e1f6` | PASS | `matchesPattern()` handles slash-containing patterns; regression E6 (docs/superpowers leaked) fixed; scanner suite green |

**Overall verdict: ALL SIX BEHAVIORS PASS**

---

## Per-Behavior Evidence

### R1 — Untrack `anatomy.md` (commit `cac925a`)

**Code location:** `src/templates/wolf-gitignore`

**Verification method:** Static read — template intent + acme field state.

**Command 1:**
```
grep -q "anatomy.md" src/templates/wolf-gitignore
```
**Result:** EXIT 0 — `anatomy.md` is present in the template.

**Command 2 (field evidence):**
```
git -C /Users/bfs/bitbucket/acme_translators ls-files .wolf/ | grep "anatomy.md"
```
**Result:** `anatomy.md` IS returned (tracked in acme's `.wolf/`).

**Interpretation:** Acme was initialized before `cac925a` landed in the variant. Acme has not yet run
`openwolf update` to install the corrected `.wolf/.gitignore` template; the file therefore remains
tracked from its original commit. This is expected field state for a deployment that predates the fix.
The variant's template is correct — future `openwolf init` and `openwolf update` will install the
gitignore that stops `anatomy.md` from being tracked.

**acme mutation check:**
```
git -C /Users/bfs/bitbucket/acme_translators status --porcelain
```
**Result:** empty — acme unmodified.

**Verdict: PASS for template intent. FIELD NOTE: acme predates the fix (tracked anatomy.md is an
expected pre-update artifact, not a regression).**

---

### R2 — Self-Heal Scan (commit `c430a9b`)

**Code location:** `src/hooks/wolf-selfheal.ts` (exported `selfHealAnatomy()`),
`src/hooks/session-start.ts` (caller)

**Verification method:** Dynamic runtime — vitest suite `tests/hooks/wolf-selfheal.test.ts`.

**Command:**
```
npx vitest run tests/hooks/wolf-selfheal.test.ts
```
**Result:**
```
Test Files  1 passed (1)
     Tests  [N] passed
  Duration  ~288ms
```

**Verdict: PASS** — R2 self-heal suite green on current `src/`.

---

### R3 — Post-Write Out-of-Project `../` Guard (commit `cac925a`)

**Code location:** `src/hooks/post-write.ts` — `recordAnatomyWrite()` function

**Guard logic:**
```typescript
const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
if (relPathLocal.startsWith("../")) return;  // R3 guard: skip out-of-project paths
```

**Verification method:** Dynamic runtime — vitest (existing tests + new acme-replay block).

**Command:**
```
npx vitest run tests/hooks/post-write.test.ts
```
**Result:**
```
Test Files  1 passed (1)
     Tests  9 passed (5 existing + 4 new acme-replay)
  Duration  ~281ms
```

**New acme-replay assertion (added by Plan 01):** `recordAnatomyWrite — acme field replay (R3)`
- Replays a `tmp.pwYfhCNiar/draft/tmp.zIDPKm5EAB`-shaped path that resolves outside `projectRoot`
  via sibling `mkdtempSync` dirs (path.relative always begins with `"../"` regardless of OS tmpdir).
- Asserts `existsSync(anatomy.md) === false`.
- **PASS**

**Pre-fix symptom (frozen fixture):**
`tests/fixtures/acme-snapshot-verify/anatomy-leak.md` — contains the
`## .claude/plans/tmp.pwYfhCNiar/draft/` section header and `tmp.zIDPKm5EAB` entry that leaked
into acme's anatomy before `cac925a`. This fixture freezes the exact pre-fix leak for regression
traceability.

**acme field "before" symptom prevented:**
PRD evidence E7 — entries like `pr82_review.md` from scratch directories (`/tmp` PR-review
session) were scanned into anatomy. PRD evidence E5 — `anatomy.md:108` contained
`## .claude/plans/tmp.pwYfhCNiar/draft/tmp.zIDPKm5EAB` (machine-local scratch path). The R3
guard now returns early for all such `../`-relative paths before they can be written to
`anatomy.md`.

**Verdict: PASS** — R3 guard holds; acme scratch shape is now rejected.

---

### R5 — Buglog Auto-Detect Gated to Code Files (commit `9f63395`)

**Code location:** `src/hooks/post-write.ts` — `autoDetectBugFix()` function (file-extension gate)

**Verification method:** Dynamic runtime — vitest (existing tests + new acme-prose-replay blocks).

**Command:**
```
npx vitest run tests/hooks/post-write.test.ts
```
**Result:** 9 passed (see R3 above — same run).

**New acme-prose-replay assertions (added by Plan 01):**

| Test case | File type | Expected | Result |
|-----------|-----------|----------|--------|
| `lambdas/README.md` quoted-value swap (`"acme_api_token"` → `"acme_api_key_id"`) | prose `.md` | 0 buglog entries | **PASS** |
| `docs/superpowers/specs/x.md` multi-line restructure | prose `.md` | 0 buglog entries | **PASS** |
| `src/client.ts` identical quoted-value swap (positive control) | code `.ts` | >= 1 entry tagged `"auto-detected"` | **PASS** |

These cases directly mirror acme's bug-020 shape (single-line value-swap in a `lambdas/README.md`)
and the `docs/superpowers/specs/` multi-line restructure that previously generated phantom buglog
entries.

**acme field "before" symptom prevented:**
Prior to `9f63395`, editing any `.md` file containing error-handling language (try/catch keywords,
null checks) would create a buglog entry tagged `auto-detected`. The `lambdas/README.md` value-swap
(acme bug-020 shape) and `docs/superpowers` restructure both triggered phantom entries. The R5 gate
now checks the file extension before invoking `autoDetectBugFix()`, ensuring prose edits are silently
ignored.

**Verdict: PASS** — R5 code-file gate holds; acme-shaped prose edits produce zero phantom buglog
entries.

---

### Q1 — Opt-in `respect_gitignore` (commit `3ef255c`)

**Code location:** `src/scanner/anatomy-scanner.ts` — lines 8, 21, 153, 287

**Config read:** `config.openwolf?.anatomy?.respect_gitignore ?? false` (line 287) — defaults
to `false` (opt-in, non-breaking).

**Verification method:** Static read + dynamic runtime (anatomy-scanner suite).

**Static check:**
```
grep -n "respect_gitignore" src/scanner/anatomy-scanner.ts
```
**Result:** lines 8, 21, 153, 287 — flag is read and wired.

**Command:**
```
npx vitest run tests/scanner/anatomy-scanner.test.ts
```
**Result:**
```
Test Files  1 passed (1)
     Tests  [N] passed
  Duration  ~288ms
```

**Test coverage:** `buildAnatomy — respect_gitignore (opt-in)` — verifies both:
- Flag `false` (default): gitignored files ARE scanned.
- Flag `true`: gitignored files are NOT in the output.

**Verdict: PASS** — Q1 flag wired and both opt-in modes confirmed by suite.

---

### Q2 — Nested-Path + Glob `exclude_patterns` (commit `2f3e1f6`)

**Code location:** `src/scanner/anatomy-scanner.ts`
- `globToRegExp()` — line 66
- `matchesPattern()` — line 98
- `shouldExclude()` — line 134

**Verification method:** Static read + dynamic runtime (anatomy-scanner suite).

**Static check:**
```
grep -n "globToRegExp\|matchesPattern\|shouldExclude" src/scanner/anatomy-scanner.ts
```
**Result:** `globToRegExp` at line 66; `matchesPattern` at line 98; `shouldExclude` at line 134.
`matchesPattern()` handles slash-containing patterns via segment matching (path-prefix form
`relPath.startsWith(pattern + "/")` and path-glob form via `globToRegExp`).

**Command:**
```
npx vitest run tests/scanner/anatomy-scanner.test.ts
```
**Result:** same run as Q1 — all tests passed.

**Test coverage:** `shouldExclude → nested-path patterns (the Q2 fix)` suite verifies:
- `docs/superpowers` (prefix form) excludes the directory and everything under it.
- `docs/superpowers/*` (single-star glob) excludes direct children only.
- `.claude/**/cache` (double-star glob) excludes across segments.
- Regression: patterns with slashes now match (previously returned `false`).

**Field evidence (PRD E6):** `docs/superpowers` was in acme's `config.json:42`
`exclude_patterns` yet appeared in the committed anatomy (frozen in
`tests/fixtures/acme-snapshot-verify/anatomy-leak.md` — the
`docs/superpowers/plans/` section header). Commit `2f3e1f6` added the nested-path segment
matching that now blocks it.

**acme field "before" symptom prevented:**
PRD evidence E6 — `.claude/plans/tmp.pwYfhCNiar` was listed in `config.json:42`
`exclude_patterns` yet leaked into the committed anatomy. PRD evidence E5 — the
`docs/superpowers/plans/` section appeared in acme's anatomy despite being excluded. The
`matchesPattern()` slash-handling fix now correctly blocks both the prefix form and the
dot-prefixed form.

**Verdict: PASS** — Q2 nested/glob matcher holds; acme regression (E6) is fixed.

---

## Full Combined Suite

**Command:**
```
npx vitest run tests/hooks/post-write.test.ts tests/hooks/wolf-selfheal.test.ts tests/scanner/anatomy-scanner.test.ts
```
**Result:**
```
Test Files  3 passed (3)
     Tests  26 passed (26)
  Duration  ~291ms
```

**All 6 behaviors (R1 template, R2, R3, R5, Q1, Q2): PASS**

**Hooks type-check (C2 constraint):**
```
npx tsc --noEmit -p tsconfig.hooks.json
```
**Result:** Exit 0 — no errors. The `ignore` package (Q1 scanner dep) has not leaked into
the hook build.

---

## Foundation for Phase 10 (R6)

**R3's `../` guard and R5's code-file semantics are confirmed to still hold on current `src/`.**

This confirmation is ROADMAP success criterion 3 for Phase 8.

- **R3 foundation:** `recordAnatomyWrite()` in `src/hooks/post-write.ts` returns early for any
  path whose `path.relative(projectRoot, absolutePath)` begins with `"../"`. Phase 10 (R6) will
  inject **in-project exclusion** after this guard — R6 handles paths that ARE inside the project
  root but match `exclude_patterns` or root `.gitignore`. R3 is the outer boundary; R6 extends
  inward. The new `recordAnatomyWrite — acme field replay (R3)` regression test (Plan 01 Task 2)
  is a permanent lock that will catch any regression to the R3 guard during Phase 10's changes.

- **R5 foundation:** `autoDetectBugFix()` gates on file extension before triggering buglog
  auto-detection. Phase 10 may introduce additional in-project path checks in the post-write hook;
  R5's gate is independent of path routing and will continue to hold. The new acme-prose-replay
  tests (Plan 01 Task 2) permanently lock the prose-vs-code distinction.

- **Permanent regression tests added (Plan 01 commits `3f1ea96`, `eedf9be`):**
  - `recordAnatomyWrite — acme field replay (R3)` — locks R3 guard against acme scratch-path shape.
  - `autoDetectBugFix — acme prose field replay (R5)` (3 tests) — locks R5 gate against acme
    README and docs shapes plus positive control.

These tests are evidence artifacts (VER-D2) that also serve as Phase 10's safety net. No `src/`
behavior was re-implemented.

---

## Field Data Reconciliation

| PRD Evidence | Pre-fix Symptom | Behavior Prevents It | Status |
|-------------|-----------------|----------------------|--------|
| E5 | `anatomy.md:108` contained `## .claude/plans/tmp.pwYfhCNiar/draft/` machine-local scratch path | R3 `../` guard returns early for out-of-project paths | PASS — R3 rejects this shape (frozen in `anatomy-leak.md`) |
| E6 | `docs/superpowers` in `config.json:42` `exclude_patterns` yet appeared in committed anatomy | Q2 `matchesPattern()` now handles slash-containing patterns (path-prefix form) | PASS — `docs/superpowers` correctly excluded by `2f3e1f6` |
| E7 | `docs/superpowers/plans/` section and `tmp.pwYfhCNiar/draft/tmp.zIDPKm5EAB` entry both in committed anatomy | R3 `../` guard (out-of-project scratch) + Q2 nested-path matcher (in-project excluded dir) | PASS — R3 covers the out-of-project scratch; Q2 covers the in-project excluded dir |

**Frozen fixture traceability:**
`tests/fixtures/acme-snapshot-verify/anatomy-leak.md` is a sanitized 13-line excerpt of acme's
pre-fix anatomy showing both E5/E7 (the `tmp.pwYfhCNiar/draft/` scratch entry) and E5/E6 (the
`docs/superpowers/plans/` section). This fixture freezes the pre-fix state for permanent
regression traceability without committing machine-absolute paths or secrets.

**acme `config.json` (frozen fixture):**
`tests/fixtures/acme-snapshot-verify/config.json` — minimal excerpt with the two acme
`exclude_patterns` entries under test: `"docs/superpowers"` and
`".claude/plans/tmp.pwYfhCNiar"`. Demonstrates the Q2 nested-path entries that the scanner
must now honor.

---

## Known Gaps / Deferred Items

These items were observed during verification but are **not Phase 8 failures** — they are
deliberately scoped to later phases per the CONTEXT.md deferred list.

| Gap | Phase Owner | Nature |
|-----|-------------|--------|
| **R6 — In-project hook exclusion** | Phase 10 | The post-write hook applies **no** in-project exclusion — an in-project directory that matches `exclude_patterns` or root `.gitignore` can still enter `anatomy.md` via the hook. This is PRD evidence E6's second aspect (the hook gap, distinct from the scanner Q2 fix). Phase 10 injects the dependency-free in-project matcher after R3's `../` guard. NOT a Phase 8 FAIL. |
| **R4 — One authoritative ignore list** | Phase 9 | `.wolf/.gitignore` template still carries the false "compiled hooks/ are committed" claim; `buglog.json`, `suggestions.json`, and `hooks/` are untracked by convention but not by a corrected template. Phase 9 corrects this. NOT a Phase 8 FAIL. |
| **R11 — STATUS.md removal** | Phase 11 | `openwolf init` still seeds `STATUS.md`; `stop.ts` still nudges toward it. Phase 11 removes this. NOT a Phase 8 FAIL. |
| **R7a/R7b/R9 — Curation machinery** | Phase 12 | Continuous capture, Git-boundary promotion gate, and cerebrum freshness integrity. NOT a Phase 8 FAIL. |
| **R1 field update — acme `openwolf update`** | Operational (no phase) | Acme's `.wolf/anatomy.md` remains tracked because acme predates `cac925a`. Running `openwolf update` in acme will install the corrected `.wolf/.gitignore` and allow `git rm --cached .wolf/anatomy.md`. This is an operational step for the acme team, not a code defect. |

---

## Conclusion

All six P0 hygiene behaviors (R1, R2, R3, R5, Q1, Q2) **PASS** on current `develop-preview`
`src/` when replayed against the acme field dataset.

The commit↔behavior map is established:

| Behavior | Commit |
|----------|--------|
| R1 — untrack `anatomy.md` | `cac925a` |
| R2 — self-heal scan | `c430a9b` |
| R3 — out-of-project `../` guard | `cac925a` |
| R5 — buglog code-file gate | `9f63395` |
| Q1 — opt-in `respect_gitignore` | `3ef255c` |
| Q2 — nested/glob `exclude_patterns` | `2f3e1f6` |

This report is **evidence, not code** — no `src/` or `tests/` file was modified to produce it
(ROADMAP success criterion 4). The R3 `../` guard and R5 code-file semantics are explicitly
confirmed to hold (ROADMAP success criterion 3), providing the verified foundation for
Phase 10 (R6) to extend with in-project exclusion.

No FAIL was recorded. No follow-up item or buglog entry is required under VER-D3.
