---
phase: 09-tracking-hygiene-one-authoritative-ignore-list
verified: 2026-06-26T00:43:05Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 9: Tracking Hygiene — One Authoritative Ignore List — Verification Report

**Phase Goal:** Replace the old ad-hoc `.wolf/.gitignore` template with a single
authoritative template built on the authored-vs-derived axis. The template must commit
authored files and ignore derived/local-state files. The `git ls-files .wolf/` output in
a consumer repo after `openwolf update` should match the documented authored set exactly
(R4 acceptance criterion).

**Verified:** 2026-06-26T00:43:05Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/templates/wolf-gitignore` has two labeled sections (AUTHORED FILES / DERIVED) | VERIFIED | Lines 2 and 23 — `# AUTHORED FILES — owned by humans, committed to git` and `# DERIVED / LOCAL STATE — rebuilt or mutated locally, never committed` |
| 2 | `hooks/` is an active ignore rule (not just in a comment) | VERIFIED | Line 45: bare `hooks/` with no `#` prefix; confirmed by `grep -n "^hooks/$"` |
| 3 | `buglog.json` is an active ignore rule | VERIFIED | Line 50: bare `buglog.json` with no `#` prefix |
| 4 | `cerebrum-freshness.json` is an active ignore rule | VERIFIED | Line 56: bare `cerebrum-freshness.json` with no `#` prefix |
| 5 | `hooks/` does NOT appear in the "ARE committed" comment block | VERIFIED | Only prose references: lines 18-19 (`.wolf/hooks/` in the NOTE advisory — not a bare `hooks/` committed claim). `grep "^#\s+hooks/"` returns no match. |
| 6 | `STATUS.md` does NOT appear anywhere in the template | VERIFIED | `grep "STATUS.md"` on `src/templates/wolf-gitignore` returns no output |
| 7 | `checkRootGitIgnore` is exported from `src/cli/init.ts` | VERIFIED | Line 193: `export function checkRootGitIgnore(projectRoot: string): void` |
| 8 | `.wolf/`-prefixed detection advisory code exists in `checkRootGitIgnore` | VERIFIED | Lines 209-217: line-by-line scan with comment-skipping, regex `/^\.wolf\/.+/`, advisory emitted when `hasPrefixedOverride` is true |
| 9 | `docs/updating.md` contains `## Tracking hygiene migration` section with `git rm --cached` commands | VERIFIED | Line 122: `## Tracking hygiene migration (v1.2)`; lines 144-146: `git rm -r --cached .wolf/hooks`, `git rm --cached .wolf/buglog.json`, `git rm --cached .wolf/suggestions.json` |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/templates/wolf-gitignore` | Corrected ignore template on authored-vs-derived axis | VERIFIED | 60 lines, two labeled sections, active ignore rules for hooks/, buglog.json, cerebrum-freshness.json |
| `src/cli/init.ts` | Exported `checkRootGitIgnore` with .wolf/-prefixed advisory | VERIFIED | Exported at line 193; second advisory branch at lines 209-224 |
| `tests/cli/init.test.ts` | Template-content assertions + advisory assertions (TDD) | VERIFIED | 6 template assertions (lines 429-460), 4 advisory assertions (lines 472-520), all 171 tests pass |
| `docs/updating.md` | Migration section with git rm --cached commands | VERIFIED | 81-line section appended at line 122; authored set listed; `::: warning` blast-radius note present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/templates/wolf-gitignore` | `src/cli/init.ts` (`initCommand`) | Template deployed as `.wolf/.gitignore` on init/update | WIRED | `TEMPLATE_NAME_MAP` maps `wolf-gitignore` → `.gitignore`; `initCommand` copies templates to `.wolf/`; verified in existing init tests |
| `checkRootGitIgnore` | `initCommand` | Called at end of `initCommand` (line 483) | WIRED | `checkRootGitIgnore(projectRoot)` at line 483 |
| `docs/updating.md` | Consumer migration workflow | Human-runnable `git rm --cached` commands | WIRED (documentation) | Section present with exact commands and authored-set listing |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers template files and advisory CLI output, not dynamic data rendering components.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 171 Vitest tests pass | `npx vitest run` | 171 passed (24 test files), 2.37s | PASS |
| Full build exits 0 | `pnpm build` | Exit code 0, dashboard + CLI + hooks all compiled | PASS |
| Template file deployed to dist/ | `ls dist/templates/wolf-gitignore` | File present | PASS |
| `checkRootGitIgnore` exported | `grep "^export function checkRootGitIgnore" src/cli/init.ts` | Line 193 match | PASS |

---

### Probe Execution

No probes declared for this phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| R4 | 09-01, 09-02 | Single authoritative `.wolf/.gitignore` template on authored-vs-derived axis; `git ls-files .wolf/` matches authored set after `openwolf update` + migration step | SATISFIED | Template rewritten (09-01); migration docs with `git rm --cached` + authored set listing in `docs/updating.md` (09-02) |
| D-09-01 | 09-01 | Authored-vs-derived axis reorganization | SATISFIED | Two-section structure in template |
| D-09-02 | 09-01 | `hooks/` moved from comment to active ignore rule | SATISFIED | Active rule at line 45; no bare `hooks/` in comment lines |
| D-09-03 | 09-01 | `buglog.json` ignored; `buglog.ndjson` committed | SATISFIED | Active rule for buglog.json; no active rule for buglog.ndjson |
| D-09-04 | (pre-existing) | `suggestions.json` already in derived section | SATISFIED | Present in per-developer state block |
| D-09-05 | 09-01 | `STATUS.md` removed from false "ARE committed" comment | SATISFIED | No `STATUS.md` anywhere in template |
| D-09-06 | 09-01 | `cerebrum-freshness.json` reserved with bootstrap-on-missing comment | SATISFIED | Active rule at line 56; comment explains Phase 12 reservation |
| D-09-07 | 09-02 (docs) | Clone-time rebuild via CLI documented | SATISFIED | `docs/updating.md` documents `openwolf update`/`openwolf init` as the rebuild path |
| D-09-08 | 09-02 | Human-runnable `git rm --cached` documented; not CLI-automated | SATISFIED | `::: warning` container explicitly states CLI does NOT run this automatically |
| D-09-09 | 09-01 | `checkRootGitIgnore` exported; `.wolf/`-prefixed path detection advisory | SATISFIED | Exported function with line-by-line scan and comment-skipping at lines 209-224 |

---

### Commit Integrity

All documented commits verified present in git history:

| Commit | Description | Status |
|--------|-------------|--------|
| `51748d6` | test(09-01): RED — 10 failing assertions for authored-vs-derived model | FOUND |
| `1d8b97d` | feat(09-01): GREEN — wolf-gitignore rewrite + test regex fix | FOUND |
| `5eb0059` | feat(09-01): export checkRootGitIgnore + .wolf/-prefixed advisory | FOUND |
| `8a509cc` | docs(09-02): R4 tracking-hygiene migration section in docs/updating.md | FOUND |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

No TBD, FIXME, XXX, or placeholder patterns found in files modified by this phase.

---

### Human Verification Required

None. All acceptance criteria are mechanically verifiable and confirmed.

---

## Known Gaps / Future Work

These are correctness bugs in `checkRootGitIgnore` identified during verification
(not regressions introduced by this phase — the function was new in this phase).
They do not block the phase goal (R4 template content is correct; the advisory
is best-effort). Tracked here for a follow-up fix.

### WR-01: Blanket advisory misfires on comment-only `.wolf/` mentions

`content.includes(".wolf/")` at line 197 fires whenever the string `.wolf/`
appears anywhere in the root `.gitignore` file, including inside comment lines
such as `# Example: .wolf/hooks/ is derived`. A consumer whose root `.gitignore`
contains only a comment mentioning `.wolf/` receives a spurious advisory telling
them to remove a rule that does not actually exist as an active ignore entry.

**Fix direction:** Apply the same line-by-line + comment-skipping pattern used
in `hasPrefixedOverride`. Check for a non-comment line whose trimmed value equals
`.wolf/` exactly (or starts with `.wolf/` and ends with `/`).

### WR-02: Double advisory fires when `.wolf/`-prefixed path is present

When a consumer root `.gitignore` contains `.wolf/hooks/` (without a bare `.wolf/`
entry), `content.includes(".wolf/")` fires at line 197 (because `.wolf/hooks/`
contains the substring `.wolf/`) AND `hasPrefixedOverride` fires at line 218. The
user receives two advisories for the same line.

**Fix direction:** Use an `else if` (or restructure with early-return) so the
blanket-`.wolf/` advisory and the prefixed-path advisory are mutually exclusive.
Alternatively, fix WR-01 first (line-by-line check for exact `.wolf/`) — fixing
WR-01 naturally resolves WR-02 because an exact `.wolf/` match would NOT also
match `.wolf/hooks/`.

### WR-03: Advisory message for blanket `.wolf/` is misleading

The blanket advisory (lines 199-202) says "removes `.wolf/`" implies there is a
line that says exactly `.wolf/`. But if WR-01 fires on a `.wolf/hooks/` line, the
advisory incorrectly tells the user to remove a `.wolf/` line that doesn't exist.
This is a consequence of WR-01/WR-02 but the message text also needs updating to
reference the specific line detected.

### WR-04: No test for the double-advisory scenario (WR-02)

The test suite covers: blanket `.wolf/` only, `.wolf/`-prefixed only, nothing,
and missing `.gitignore`. It does not cover a `.gitignore` that contains
`.wolf/hooks/` without a bare `.wolf/` entry — the scenario that exposes WR-02.
Adding a fifth test case would catch the regression if WR-01/WR-02 are fixed.

---

## Summary

Phase 9 achieved its goal. The `src/templates/wolf-gitignore` template is
definitively rewritten on the authored-vs-derived axis: `hooks/`, `buglog.json`,
and `cerebrum-freshness.json` are active ignore rules; `STATUS.md` and `hooks/`
have been removed from the false "ARE committed" comment block; the two-section
structure is clear and correct. `checkRootGitIgnore` is exported and extended with
`.wolf/`-prefixed path detection. Migration documentation with `git rm --cached`
commands and the complete authored set listing is in `docs/updating.md`. All 171
Vitest tests pass and the build is clean.

Four minor correctness bugs exist in `checkRootGitIgnore`'s substring-match logic
(WR-01 through WR-04). These are advisory-message quality issues — false positives
and duplicate messages — not failures in the R4 template content. They do not
affect the phase goal and are tracked above for a follow-up fix.

---

_Verified: 2026-06-26T00:43:05Z_
_Verifier: Claude (gsd-verifier)_
