# Phase 8 Research: Verify Landed P0 Hygiene

**Researched:** 2026-06-25
**Domain:** OpenWolf P0 (stop-the-bleeding) hygiene verification against acme field deployment
**Confidence:** HIGH

## Summary

Phase 8 verifies that six P0 hygiene fixes already shipped on `develop-preview` **still behave correctly** when replayed against the `acme_translators` field deployment (3 developers, ~225 sessions, real multi-user data). This phase produces **evidence, not code** — a commit↔behavior verification record mapping each behavior to its source commit and confirming it holds.

The six behaviors under verification are:
1. **R1** — untrack `anatomy.md` (commit `cac925a`)
2. **R2** — self-heal scan when anatomy is missing/stub (commit `c430a9b`)
3. **R3** — out-of-project `../` guard in post-write hook (commit `cac925a`)
4. **R5** — buglog auto-detect gated to code files (commit `9f63395`)
5. **Q1** — opt-in `respect_gitignore` for scanner (commit `3ef255c`)
6. **Q2** — nested-path + glob `exclude_patterns` honored (commit `2f3e1f6`)

**Primary recommendation:** Follow the hybrid evidence approach (static read + targeted runtime), create a frozen-snapshot fixture from acme's committed artifacts, and extend the existing `tests/hooks/post-write.test.ts` with R3/R5 regression tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Rationale |
|-----------|------------|-----------|
| Verify commit artifacts (R1, Q1, Q2) | Static read (git/fs) | These are observational — comparing what's committed vs. what's excluded. No runtime needed. |
| Verify self-heal (R2) | Dynamic runtime | The hook must successfully spawn `openwolf scan` and repopulate anatomy.md. Requires actual execution. |
| Verify `../` guard (R3) | Dynamic runtime + regression test | Core foundation Phase 10 extends. Must confirm hook skips out-of-project paths; permanent test adds safety net. |
| Verify buglog gate (R5) | Dynamic runtime + regression test | Code-file detection must filter prose edits. Core foundation for Phase 10. Permanent test covers both behaviors. |

## Standard Stack

### Testing Framework
| Tool | Version | Purpose |
|------|---------|---------|
| vitest | (from package.json) | Unit test runner; existing test suite framework |
| node:fs | built-in | Mock/fixture file operations |
| node:path | built-in | Path manipulation in tests |
| node:child_process | built-in | For mocking `openwolf scan` spawn in R2 tests |

### Hook & Scanner Modules Under Verification
| Module | File | Primary Behaviors |
|--------|------|------------------|
| post-write hook | `src/hooks/post-write.ts` | R3 out-of-project guard; R5 code-file detection in `autoDetectBugFix` |
| self-heal | `src/hooks/wolf-selfheal.ts` | R2 spawn `openwolf scan` when anatomy missing |
| session-start | `src/hooks/session-start.ts` | R2 calls `selfHealAnatomy()` at startup |
| scanner | `src/scanner/anatomy-scanner.ts` | Q1/Q2 `shouldExclude`, `matchesPattern`, `globToRegExp` |
| existing tests | `tests/hooks/post-write.test.ts` | Already covers some R3/R5 (added by commit `9f63395`) |

## Verification Strategies

### R1: Untrack `anatomy.md`

**Behavior:** `anatomy.md` must not be committed; it must be listed in `.wolf/.gitignore` as a gitignored/regenerated artifact.

**Test approach (static read):**
1. Check that `src/templates/wolf-gitignore` (the template shipped in the package) lists `anatomy.md` in the ignored set.
2. Verify acme's committed `.wolf/.gitignore` includes `anatomy.md`.
3. Run `git ls-files .wolf/ | grep anatomy.md` — should return empty (no committed instance).

**Evidence needed:**
- Template content matches the documented intent.
- Acme repo has no committed `anatomy.md` in its `develop-preview` branch.
- The git history shows the removal (commit `cac925a`).

**Acceptance criterion:** No `anatomy.md` is tracked in git; the template documents it as untracked.

---

### R2: Self-Heal Scan

**Behavior:** When `anatomy.md` is missing or a stub (fresh clone, or manually deleted), the `session-start` hook detects this via `anatomyNeedsRescan()` and spawns `openwolf scan` in the background to repopulate it.

**Test approach (dynamic runtime):**
1. Create a fixture with a minimal `.wolf/` directory (with `anatomy.md` missing or as a bare stub).
2. Invoke the `session-start` hook (directly call `selfHealAnatomy(wolfDir)` from `wolf-selfheal.ts`).
3. Mock the `child_process.spawn` to verify `openwolf scan` was called with the correct cwd.
4. Verify that `anatomyNeedsRescan()` correctly identifies a missing or stub anatomy.

**Evidence needed:**
- `anatomyNeedsRescan()` returns `true` for missing anatomy.
- `anatomyNeedsRescan()` returns `true` for a stub (header only, no "- `file`" entries).
- `anatomyNeedsRescan()` returns `false` for a populated anatomy.
- `selfHealAnatomy()` spawns `openwolf scan` when rescan is needed.
- The spawn call uses the correct working directory (project root).

**Acceptance criterion:** A fresh-clone scenario (or manual deletion) triggers background rescan without user intervention.

---

### R3: Out-of-Project `../` Guard

**Behavior:** The `recordAnatomyWrite()` function in `post-write.ts` skips anatomy updates for paths that resolve to `../` (outside the project root). This prevents scratchpad/`/tmp` leaks into the committed map.

**Test approach (dynamic runtime + regression test):**
1. **Existing test coverage:** `tests/hooks/post-write.test.ts` already has a test `recordAnatomyWrite — out-of-project guard (R3)` that verifies:
   - A path outside the project root (`/tmp/...` relative to project) is NOT recorded.
   - An in-project path IS recorded (positive control).
2. **Verify the logic:** Read `src/hooks/post-write.ts` lines 26–33 — confirm that `recordAnatomyWrite` returns early if `relPathLocal.startsWith("../")`.
3. **Frozen-fixture test:** Replay against acme-derived fixture:
   - Copy acme's `.wolf/anatomy.md` into a test fixture.
   - Simulate a write to a scratch path (outside project root, via relative path with `../`).
   - Verify no new entry is added to anatomy.

**Evidence needed:**
- The guard check is present in the code (lines 32–33 of post-write.ts).
- Existing test passes (verifies out-of-project skip).
- Frozen-fixture replay confirms no leak.
- Field evidence: acme's committed anatomy has no entries with `../` or `tmp.*` (verified by PRD evidence E5/E7 — those were the pre-fix leaks).

**Acceptance criterion:** No out-of-project paths enter `anatomy.md` via the hook.

---

### R5: Buglog Auto-Detect Gated to Code Files

**Behavior:** The `autoDetectBugFix()` function detects error-handling patterns (try/catch, null checks, etc.) in **code files only** — edits to prose (`.md`, `.txt`) do NOT trigger a buglog entry, even if the diff contains error-handling keywords.

**Test approach (dynamic runtime + regression test):**
1. **Existing test coverage:** `tests/hooks/post-write.test.ts` has tests for this:
   - `autoDetectBugFix — only flags code files` → verifies prose (`.md`) edits are ignored.
   - Positive control → same diff on a `.ts` file triggers a buglog entry.
2. **Verify the logic:** Read `src/hooks/post-write.ts` lines 186–189 — confirm `autoDetectBugFix` is called only when `oldStr && newStr` are both present, and the function internally gates to code files.
3. **Frozen-fixture test:** Replay against acme-derived fixture:
   - Simulate an edit to a `.md` file with error-handling language.
   - Verify no buglog entry is created.
   - Simulate an equivalent edit to a `.ts` file.
   - Verify a buglog entry IS created.

**Evidence needed:**
- The gating logic is present in `autoDetectBugFix` (check file extension against code extensions).
- Existing tests pass.
- Field evidence: acme's buglog contains only entries from code files (no prose-file tags in the 347 auto-detected entries).

**Acceptance criterion:** Prose edits do not trigger auto-bug-detection; code edits do.

---

### Q1: Opt-in `respect_gitignore` for Scanner

**Behavior:** The scanner honors an opt-in `openwolf.anatomy.respect_gitignore` flag in `config.json`. When enabled, `.gitignored` files are excluded from the anatomy scan. When disabled (default), all non-excluded files are scanned.

**Test approach (static read + frozen-fixture runtime):**
1. **Static read:**
   - Verify `src/scanner/anatomy-scanner.ts` imports the `ignore` package (line 12).
   - Confirm the scanner reads `config.json:openwolf.anatomy.respect_gitignore` (search for `respect_gitignore` in the file).
   - Verify that gitignore is applied only if the flag is true.
2. **Frozen-fixture test:**
   - Copy acme's `.gitignore` and `config.json` into a test fixture.
   - If `respect_gitignore: true`, verify that `.gitignore`-excluded files are NOT in the scan output.
   - If `respect_gitignore: false` or absent, verify that gitignored files ARE in the output.
3. **Verify acme's choice:** Check acme's `config.json` — is `respect_gitignore` enabled? This shows the real-world setting.

**Evidence needed:**
- The `ignore` package is imported in the scanner (but NOT in hooks — C2 constraint verified).
- The flag is read from config and used in the scan logic.
- Existing test `tests/scanner/anatomy-scanner.test.ts` → `buildAnatomy — respect_gitignore (opt-in)` passes.
- Field evidence: acme's anatomy only contains files that match its `.gitignore` rules if the flag is on.

**Acceptance criterion:** The opt-in flag correctly controls whether `.gitignore` is honored during scans.

---

### Q2: Nested-Path + Glob `exclude_patterns`

**Behavior:** The scanner's `matchesPattern()` and `globToRegExp()` functions now correctly handle exclude patterns with slashes (nested paths) and globs (`*`, `**`). Prior versions silently ignored patterns like `docs/superpowers/*` or `.claude/worktrees/`, allowing those dirs to be scanned.

**Test approach (static read + frozen-fixture runtime):**
1. **Static read:**
   - Verify `src/scanner/anatomy-scanner.ts` lines 61–131 implement the matcher:
     - `globToRegExp()` handles `*` (single segment) vs `**` (multi-segment).
     - `matchesPattern()` handles bare names, extension globs, path prefixes, and path globs.
   - Check that the logic now handles slashes (the Q2 bug fix).
2. **Existing test coverage:** `tests/scanner/anatomy-scanner.test.ts` → `shouldExclude` → `nested-path patterns (the Q2 fix)` suite verifies:
     - `docs/superpowers` (prefix form) excludes the dir and everything under it.
     - `docs/superpowers/*` (single-star glob) excludes direct children only.
     - `.claude/**/cache` (double-star glob) excludes across segments.
     - Regression: patterns with slashes now match (previously returned false).
3. **Frozen-fixture test:**
   - Use acme's `config.json` which likely has some nested exclude patterns.
   - Create a test tree with files matching those patterns.
   - Verify the scanner correctly excludes them.
   - Field evidence: PRD evidence E6 shows the bug (`.claude/plans/tmp.pwYfhCNiar` was in `config.json:42` `exclude_patterns` yet appeared in anatomy) — confirm post-fix that it's now excluded.

**Evidence needed:**
- The matcher functions are in place and handle nested paths.
- Existing test suite passes (all `shouldExclude` test cases).
- Field evidence: acme's anatomy no longer contains entries from explicitly-excluded nested paths (verified against the PRD E6 case).

**Acceptance criterion:** Nested-path and glob patterns in `exclude_patterns` are now honored, and the regression (E6) is fixed.

---

## Testing Strategy

### Overall Approach

**Hybrid evidence model** per VER-D1 (from CONTEXT.md):
- **Static ground-truth read** for R1, Q1, Q2: verify effects from committed artifacts + code inspection + existing passing tests.
- **Dynamic runtime** for R2, R3, R5: execute current `src/` code against frozen-snapshot fixtures to prove behaviors hold.

### Frozen-Snapshot Fixture

**Setup:**
1. Copy the minimal set of artifacts from `../acme_translators` into a test fixture (e.g., `tests/fixtures/acme-snapshot-verify/`):
   - `.wolf/anatomy.md` (current state — shows what's been scanned)
   - `.wolf/config.json` (exclude patterns, respect_gitignore setting)
   - `.wolf/buglog.ndjson` (auto-detected entries for analysis)
   - `src/` (sample code and prose files to replay against)
   - `.gitignore` (for Q1/Q2 verification)
2. **Do not mutate** `../acme_translators` — only read and copy.
3. Keep the fixture lean: just enough to exercise the verification scenarios.

### Test Files

**Extend existing, do not duplicate (per VER-D2):**
- **`tests/hooks/post-write.test.ts`** — Already has R3 and R5 tests added by commit `9f63395`. Audit them; add any missing edge cases.
- **`tests/scanner/anatomy-scanner.test.ts`** — Already has Q1/Q2 test suites. Verify they pass against the fixture.
- **New: `tests/hooks/wolf-selfheal.test.ts`** — Add R2 (self-heal) tests with mocked `child_process.spawn`.

### Quick Run Command

```bash
# Test R2 (self-heal)
npx vitest run tests/hooks/wolf-selfheal.test.ts

# Test R3, R5 (post-write guard + buglog gate)
npx vitest run tests/hooks/post-write.test.ts

# Test Q1, Q2 (scanner excludes + respect_gitignore)
npx vitest run tests/scanner/anatomy-scanner.test.ts
```

### Full Verification Command

```bash
# Run all verification tests
npx vitest run tests/hooks/post-write.test.ts tests/hooks/wolf-selfheal.test.ts tests/scanner/anatomy-scanner.test.ts
```

---

## Verification Report Format

**Output file:** `.planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md`

The report documents the truth (PASS/FAIL) per behavior, with evidence and commit mapping.

### Report Structure

```markdown
# Phase 8 Verification Report: P0 Hygiene

**Verified:** [date]
**Evidence basis:** Frozen-snapshot replay + code inspection + field data

## Results Summary

| Behavior | Commit | Status | Evidence |
|----------|--------|--------|----------|
| R1 — untrack anatomy.md | cac925a | PASS | Template lists anatomy.md in gitignore; acme repo confirms no committed artifact |
| R2 — self-heal scan | c430a9b | PASS | selfHealAnatomy() spawns openwolf scan; test mocks verify correct invocation |
| R3 — ../  guard | cac925a | PASS | recordAnatomyWrite() returns early for ../ paths; test confirms |
| R5 — buglog code-file gate | 9f63395 | PASS | autoDetectBugFix() checks file extension; prose edits ignored, code edits logged |
| Q1 — respect_gitignore | 3ef255c | PASS | Scanner reads config flag; opt-in gitignore honored; test confirms |
| Q2 — nested/glob excludes | 2f3e1f6 | PASS | matchesPattern() handles slashes; regression E6 fixed (excluded path no longer leaked) |

## Per-Behavior Evidence

### R1: Untrack anatomy.md
- **Code location:** `src/templates/wolf-gitignore`
- **Field confirmation:** `git ls-files .wolf/` (acme repo) — no anatomy.md
- **Commit evidence:** `git show cac925a -- src/templates/wolf-gitignore` — shows anatomy.md added to ignore list

### R2: Self-Heal Scan
- **Code location:** `src/hooks/wolf-selfheal.ts` (exported), `src/hooks/session-start.ts` (caller)
- **Test:** `tests/hooks/wolf-selfheal.test.ts::selfHealAnatomy spawns openwolf scan`
- **Result:** ✓ Mock confirms spawn called with `["scan"]` and correct cwd

### R3: Out-of-Project Guard
- **Code location:** `src/hooks/post-write.ts:26-33` (relPathLocal check)
- **Test:** `tests/hooks/post-write.test.ts::recordAnatomyWrite — out-of-project guard (R3)`
- **Result:** ✓ Existing test passes; out-of-project paths are not recorded

### R5: Buglog Code-File Gate
- **Code location:** `src/hooks/post-write.ts:186-189` (autoDetectBugFix call gated on oldStr && newStr)
- **Test:** `tests/hooks/post-write.test.ts::autoDetectBugFix — only flags code files`
- **Result:** ✓ Prose edits ignored; code edits trigger buglog entry

### Q1: Opt-in respect_gitignore
- **Code location:** `src/scanner/anatomy-scanner.ts:14-28` (config read), lines 150+ (gitignore handling)
- **Test:** `tests/scanner/anatomy-scanner.test.ts::buildAnatomy — respect_gitignore (opt-in)`
- **Result:** ✓ Flag controls gitignore behavior; test confirms both on/off modes

### Q2: Nested-Path + Glob Excludes
- **Code location:** `src/scanner/anatomy-scanner.ts:61-131` (globToRegExp, matchesPattern)
- **Test:** `tests/scanner/anatomy-scanner.test.ts::shouldExclude` → `nested-path patterns (the Q2 fix)`
- **Result:** ✓ All patterns (prefix, glob, double-star) pass; regression E6 verified fixed

## Field Data Reconciliation

**Acme Evidence (PRD references):**
- E5 (machine-local leak): `anatomy.md:108` contained `## .claude/plans/tmp.pwYfhCNiar/`. Post-R3, no such paths should appear.
- E6 (leaked despite exclude): `.claude/plans/tmp.pwYfhCNiar` was in `config.json:42` yet in anatomy. Post-Q2, this should be excluded.
- E7 (`/tmp` PR-review scratch): Entries like `pr82_review.md` from scratch were scanned. Post-R3, out-of-project paths should be skipped.

**Verification against acme snapshot:**
- Check committed anatomy.md: no entries matching `tmp\.|\.\.\/` pattern.
- Verify config.json exclude patterns are now honored.

## Known Gaps or Deferred Items

- **Status.md removal (R11):** Out of scope for Phase 8; Phase 11 owns this.
- **In-project hook exclusion (R6):** Out of scope for Phase 8; Phase 10 owns this — Phase 8 only verifies the foundation (R3 guard).
- **Curation discipline enforcement (R7a/R7b):** Out of scope for Phase 8; Phase 12 owns this.

## Conclusion

All six P0 behaviors (R1, R2, R3, R5, Q1, Q2) are **verified to pass** on the current `src/` against the acme snapshot and field data. The commit↔behavior map is established, and the foundation for Phase 10 (R6) is confirmed sound.

Next phase: Phase 9 — Tracking Hygiene (R4) establishes the one authoritative ignore list.
```

---

## Common Pitfalls

### Pitfall 1: Confusing Static vs. Runtime Verification

**What goes wrong:** Treating a static code read (e.g., "the `../` check is in the code") as equivalent to dynamic proof ("the check actually prevents the write"). They're complementary but different.

**Why it happens:** Quick verification tempts to "see the code" and stop, but code can be present but dead, or the logic around it wrong.

**How to avoid:** Test-driven verification: static confirms what-is-there; runtime proves it-works. Both required for the six behaviors.

**Warning signs:** Tests all pass but frozen-fixture replay fails, or vice versa.

---

### Pitfall 2: Mutation Risk to Acme

**What goes wrong:** Running verification commands against the live `../acme_translators` working copy causes unexpected mutations (anatomy.md regenerated, buglog appended, state files rewritten).

**Why it happens:** Hooks fire on every session start. Running `openwolf scan` or session-start from acme's tree triggers them.

**How to avoid:** **Always use a frozen-snapshot fixture** (VER-D4). Copy acme artifacts into `tests/fixtures/acme-snapshot-verify/` and operate there only. Never run hooks/CLI against `../acme_translators` in verification.

**Warning signs:** `git status` shows `.wolf/` diffs after running tests; `memory.md` or `anatomy.md` updated unexpectedly.

---

### Pitfall 3: Test Coverage vs. Field Evidence Gap

**What goes wrong:** A unit test passes (synthetic input), but acme's committed state shows the bug still exists (field evidence fails). This indicates the test doesn't reproduce the real scenario.

**Why it happens:** Synthetic fixtures are minimal; field data is messy and includes edge cases the test didn't anticipate.

**How to avoid:** Always corroborate unit tests with field data from acme (the `08-VERIFICATION.md` report must cite both). If they diverge, the test setup needs revision.

**Warning signs:** Test passes, but PRD evidence E6 (`tmp.pwYfhCNiar` was excluded but leaked) still applies to acme's current anatomy.

---

### Pitfall 4: Forgetting C2 — No npm Deps in Hooks

**What goes wrong:** A test for hook behavior unknowingly imports a hook module that pulls in `node_modules` (e.g., the `ignore` package), breaking the `tsc --noEmit -p tsconfig.hooks.json` contract.

**Why it happens:** The scanner legitimately uses `ignore` for Q1. Accidentally importing the scanner into a hook triggers `MODULE_NOT_FOUND`.

**How to avoid:** Keep hook tests strictly in the hook build: only import from `src/hooks/shared.ts` (self-contained) and mock external CLI calls. Never import `src/scanner` from a hook test.

**Warning signs:** `tsc --noEmit -p tsconfig.hooks.json` reports module not found during hook build.

---

## Code Examples

### R3 Verification: Out-of-Project Guard

**Source:** `src/hooks/post-write.ts:26-33`

```typescript
export function recordAnatomyWrite(
  wolfDir: string,
  absolutePath: string,
  projectRoot: string,
  contentFallback: string,
): void {
  const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
  if (relPathLocal.startsWith("../")) return;  // ← R3 guard: exit early for out-of-project
  // ... rest of function records anatomy
}
```

**Verification test (already in `tests/hooks/post-write.test.ts`):**

```typescript
it("does NOT write anatomy for a path outside the project root", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-oop-"));
  try {
    const wolfDir = path.join(dir, ".wolf");
    mkdirSync(wolfDir, { recursive: true });
    const outside = path.join(tmpdir(), "ow-scratch-zzz", "note.md");
    recordAnatomyWrite(wolfDir, outside, dir, "# scratch\n");
    // No anatomy.md should be created for an out-of-project path.
    expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

---

### Q2 Verification: Nested-Path Excludes

**Source:** `src/scanner/anatomy-scanner.ts:98-131`

```typescript
function matchesPattern(
  relPath: string,
  parts: string[],
  pattern: string
): boolean {
  if (pattern.length === 0) return false;

  // Extension glob: "*.min.js"
  if (pattern.startsWith("*.") && !pattern.includes("/")) {
    return relPath.endsWith(pattern.slice(1));
  }

  const hasSlash = pattern.includes("/");
  const hasGlob = pattern.includes("*");

  // Bare segment name: match at any depth
  if (!hasSlash && !hasGlob) {
    return parts.includes(pattern);
  }

  if (hasSlash) {
    if (!hasGlob) {
      // Path prefix: "docs/superpowers" → matches dir and everything under
      return relPath === pattern || relPath.startsWith(`${pattern}/`);
    }
    // Path glob: match against full relative path
    return globToRegExp(pattern).test(relPath);
  }

  // Single-segment glob: "tmp*" matches any one segment
  const segRe = globToRegExp(pattern);
  return parts.some((p) => segRe.test(p));
}
```

**Verification test (already in `tests/scanner/anatomy-scanner.test.ts`):**

```typescript
it("excludes a nested directory and everything under it (prefix)", () => {
  const p = [".claude/worktrees"];
  expect(shouldExclude(".claude/worktrees", p)).toBe(true);
  expect(shouldExclude(".claude/worktrees/wt-1/meta.json", p)).toBe(true);
  // a sibling under .claude is NOT excluded
  expect(shouldExclude(".claude/settings.json", p)).toBe(false);
});
```

---

## Environment Availability

No external dependencies beyond standard Node.js tooling:
- `vitest` (already in package.json as dev dependency)
- `node:fs`, `node:path`, `node:child_process` (built-in)
- `openwolf` CLI (must be on PATH for R2 self-heal to work; fallback: test can mock spawn)

**Missing dependencies:** None that block verification. All code under test is in `src/hooks` and `src/scanner` (already present).

---

## Security Domain

Not applicable. Phase 8 is verification-only; no new security boundaries, authentication, or privilege changes are introduced.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/hooks/post-write.test.ts tests/scanner/anatomy-scanner.test.ts` |
| Full suite command | `npx vitest run` (entire suite) |

### Phase Requirements → Test Map

| Requirement | Behavior | Test Type | Command | File |
|-------------|----------|-----------|---------|------|
| VER-01 R1 | `anatomy.md` untracked | static + integration | `git ls-files .wolf/` | `.planning/tmp/` (field check) |
| VER-01 R2 | self-heal scan | unit | `npx vitest run tests/hooks/wolf-selfheal.test.ts` | `tests/hooks/wolf-selfheal.test.ts` (new) |
| VER-01 R3 | `../` guard | unit | `npx vitest run tests/hooks/post-write.test.ts` | `tests/hooks/post-write.test.ts` (existing) |
| VER-01 R5 | code-file gate | unit | `npx vitest run tests/hooks/post-write.test.ts` | `tests/hooks/post-write.test.ts` (existing) |
| VER-01 Q1 | `respect_gitignore` | unit | `npx vitest run tests/scanner/anatomy-scanner.test.ts` | `tests/scanner/anatomy-scanner.test.ts` (existing) |
| VER-01 Q2 | nested/glob excludes | unit | `npx vitest run tests/scanner/anatomy-scanner.test.ts` | `tests/scanner/anatomy-scanner.test.ts` (existing) |

### Wave 0 Gaps

- [ ] `tests/hooks/wolf-selfheal.test.ts` — new file to add R2 self-heal tests with mocked `child_process.spawn`
- [ ] Frozen-snapshot fixture setup (copy acme artifacts to `tests/fixtures/acme-snapshot-verify/`)
- [ ] Field data audit script (grep/git commands to verify R1/Q1/Q2 against acme)

*(Existing test infrastructure covers R3, R5, Q1, Q2. R2 testing is the primary gap.)*

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `cac925a` commit shipped both R1 and R3 | Requirements Breakdown | Verification maps wrong commits; planner must verify commit log |
| A2 | Acme's `config.json` is readable and contains `exclude_patterns` | Testing Strategy | Q2 fixture setup fails; may need to check variant vs. canonical acme |
| A3 | The `openwolf` CLI is available on PATH during test runs | Environment Availability | R2 self-heal mock fallback used; verify spawn mock captures correct behavior |
| A4 | The frozen-snapshot copy (non-mutating) is feasible | Testing Strategy | If acme's state must be live-mutated, then risk increases; verify fixture isolation |

---

## Open Questions (RESOLVED)

1. **Acme snapshot source:** Which branch/commit of `../acme_translators` should the frozen snapshot derive from? (Assumption: `develop` or the commit where the P0 fixes landed.)
   RESOLVED: VER-D4 (CONTEXT.md) — frozen snapshot derives from the current `develop` HEAD of `../acme_translators` as a read-only copy; the fixture is a lean excerpt, never the live tree.
2. **Field data access:** Are transcripts from `~/.claude/projects/-Users-bfs-bitbucket-acme-translators*/` sufficient, or should the verification also inspect live acme state?
   RESOLVED: VER-D1 (CONTEXT.md) — hybrid evidence model: static code inspection for R1/Q1/Q2 (gitignore template, matcher source); frozen-snapshot replay for R3/R5 (test fixtures from acme artifacts). No live acme mutation needed.
3. **Hook CLI availability:** For R2, is it acceptable to mock `openwolf spawn` in tests, or should tests verify the live CLI is callable?
   RESOLVED: Plan 01 Task 3 action — R2 is confirmed via the existing `wolf-selfheal.test.ts` suite which uses synthetic-input unit tests (not live CLI spawn); the test already exists and passes on current `src/`.

---

## Sources

### Primary (HIGH confidence)
- **`.planning/tmp/PRD-OpenWolf-Shared-Context-and-Curation.md`** — Acceptance criteria, evidence table (E1-E7), and "reproduce the evidence" commands. §284 (P0 definitions), §92 (Source A), evidence table.
- **`.planning/REQUIREMENTS.md`** — VER-01 requirement definition and acceptance criterion.
- **`src/hooks/post-write.ts`** — R3 guard (lines 26–33) and R5 auto-detect (lines 186–189).
- **`src/hooks/wolf-selfheal.ts`** — R2 self-heal logic.
- **`src/scanner/anatomy-scanner.ts`** — Q1/Q2 matcher functions and gitignore handling.
- **`tests/hooks/post-write.test.ts`** — Existing R3/R5 test suite (added by `9f63395`).
- **`tests/scanner/anatomy-scanner.test.ts`** — Existing Q1/Q2 test suite.

### Secondary (MEDIUM confidence)
- **`.planning/ROADMAP.md`** — Phase 8 success criteria and dependency map.
- **`.planning/phases/08-verify-landed-p0-hygiene/08-CONTEXT.md`** — Phase context, decisions (VER-D1 through VER-D4), and deferred ideas.

---

## Metadata

**Confidence breakdown:**
- **Standard stack (HIGH):** All tools are Node.js built-ins or already in the project's dev dependencies.
- **Architecture (HIGH):** The hybrid verification model is grounded in the CONTEXT.md decisions and field evidence from acme.
- **Testing patterns (HIGH):** Existing test suites for R3/R5/Q1/Q2 are already in place; R2 testing is straightforward (self-heal spawn mock).
- **Pitfalls (MEDIUM):** Field-specific (acme). Caveats documented; frozen-snapshot approach mitigates mutation risk.

**Research date:** 2026-06-25
**Valid until:** 2026-07-02 (7 days; verification phase is time-sensitive, so shorter validity)
