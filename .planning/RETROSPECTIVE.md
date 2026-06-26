# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CHESA Fork Team Toolkit

**Shipped:** 2026-06-07
**Phases:** 5 | **Plans:** 8 | **Sessions:** ~20

### What Was Built
- Automated local dev setup script with prerequisite checks, upstream remote config, and global link
- Read-only divergence reporting script tracking AHEAD/BEHIND/DIVERGED/IN SYNC status
- Dynamic hook discovery replacing static HOOK_FILES array across init/update/status
- Advisory per-file locking for concurrent `.wolf/` write safety (zero-dependency Node.js `O_EXCL`)
- `OPENWOLF_METADATA_DIR` env var for flexible metadata storage location
- `.wolf/.gitignore` template with `*` ignore-all + 4 opt-in exceptions
- Team onboarding documentation covering mixed commit strategy and concurrent write safety
- `pnpm clean` dev script with explicit path guards and `.DS_Store` cleanup

### What Worked
- Dynamic hook discovery eliminated deployment gap where 6 wolf-* modules were never copied
- Dual-path resolution (metadata vs hooks) cleanly separated concerns for init/update
- `withFileLock` zero-dependency design with staleness TTL handles crash-orphaned locks
- `.gitignore` template approach (`*` + opt-in exceptions) is the safest default
- GSD workflow enabled rapid iteration through all 8 plans in ~2 days

### What Was Inefficient
- TDD test framework for bash: subshell isolation means PASS/FAIL counts don't propagate
- `REQUIREMENTS.md` checkboxes fell out of sync with actual completion — many items completed but not checked off
- Multiple phase directory naming conventions (`01-p0-security-fixes-quick-win` vs `01-fork-install`) created confusion in roadmap analysis
- Static `HOOK_FILES` array was a repeated source of deployment bugs before dynamic discovery

### Patterns Established
- Dynamic directory scanning replaces static file lists for hook deployment
- Advisory per-file locking using zero-length sentinel `.lock` files with `O_EXCL`
- Metadata path resolution: check env var → validate absolute → fall back to default
- Hooks path separation: always `projectRoot/.wolf/hooks/` regardless of metadata dir
- Template files in `src/templates/` + `ALWAYS_OVERWRITE` pattern for init/upgrade deployment
- Node.js `-e` inline pattern for `package.json` scripts with `existsSync` guards
- Fork management: read-only divergence reporting with upstream HTTPS remote

### Key Lessons
1. Document checkboxes in `REQUIREMENTS.md` must be updated after each plan, not deferred until milestone close
2. Test framework choice matters — bash subshell test harnesses have fundamental isolation limitations
3. Zero-dependency Node.js built-ins (`O_EXCL`, `Atomics.wait`) are viable for file locking without external deps
4. Phase directory naming should follow a single convention from the start to avoid roadmap analysis confusion

### Cost Observations
- Model mix: ~100% Claude (claude-sonnet-4 and opus)
- Sessions: ~20 sessions
- Notable: Highly efficient milestone — 8 plans completed in ~2 days with thorough verification

---

## Milestone: v1.1 — Shared-Checkout Concurrency (Pillar C)

**Shipped:** 2026-06-24
**Phases:** 3 | **Plans:** 3 | **Sessions:** ~8

### What Was Built
- `appendProposal()` per-session staging helper for cerebrum/anatomy writes
- Hook redirect so shared `.wolf/` markdown edits go to `proposed-learnings.md`
- `openwolf learnings` CLI (`list` + interactive `merge`)
- `withFileLock`-protected merge writes and post-merge archive to `merged-learnings.md`
- Accumulation merge test and integration enumeration test for propose-and-merge workflow

### What Worked
- Propose-mode eliminated direct-write contention on shared `.wolf/` files
- Per-session staging aligned with the "authored-vs-derived" commit model
- Interactive merge CLI kept the human-in-the-loop for shared context changes

### What Was Inefficient
- First cross-phase dependency chain surfaced late (R11/R7a both touching `stop.ts`)
- Dashboard panel deferred without a firm follow-up milestone slot

### Key Lessons
1. Staging + human review is the right default for shared context mutations
2. Merge-time locking is necessary but not sufficient — accumulation tests catch logical races
3. Deferring UI work is fine only if the follow-up milestone is scheduled promptly

### Cost Observations
- Model mix: Claude Sonnet 4 + Opus
- Sessions: ~8
- Notable: First milestone where concurrency became a first-class concern

---

## Milestone: v1.2 — Shared-Context Tracking & Curation

**Shipped:** 2026-06-26
**Phases:** 5 | **Plans:** 13 | **Sessions:** ~12

### What Was Built
- P0 hygiene verification (`08-VERIFICATION.md`) mapping all six landed behaviors to `develop-preview` commits
- `.wolf/.gitignore` template correction: untrack derived `buglog.json`, `suggestions.json`, and compiled `hooks/`
- Dependency-free hook-side in-project exclusion matcher honoring `exclude_patterns` + root `.gitignore`
- Framework-blind resume protocol: removed `STATUS.md`, rewrote `OPENWOLF.md` to a tool-agnostic 3-step order with an `execution_layer` config slot
- Framework-blind curation machinery:
  - Universal `stop` hook writes a structural learning breadcrumb when code changes lack explicit proposals
  - `openwolf learnings check` exit-code primitive + `openwolf learnings accept` sanctioned baseline writer
  - `openwolf status` read-only Curation section + R9 `cerebrum-freshness.json` integrity sidecar

### What Worked
- Verifying P0 first (Phase 8) prevented R6 from regressing assumptions
- Framework-blind gates (C1/C2) kept OpenWolf templates/hooks free of GSD/`.planning` references
- R7 split — continuous capture in stop hook, promotion at the Git/PR boundary — avoided session-end lifecycle modeling
- R9 freshness sidecar with "date-only bump = theater" detection keeps baselines honest
- Stale open debug artifact was acknowledged as deferred rather than blocking ship

### What Was Inefficient
- R7a stub initially used `appendProposal()`, which made the stub itself mergeable into `cerebrum.md` — caught only in milestone audit
- Compiled `hooks/` untrack required a one-time `git rm --cached` migration note rather than a safe automated command
- Integration recheck for the R7a fix added an unplanned verification cycle

### Patterns Established
- **Framework-blind/host-blind negative boundaries** instead of positive tool references in templates
- **Continuous capture + explicit promotion** for context that must cross the commit boundary
- **Read-only status + sanctioned writers** for freshness/curation state
- **Milestone audit before tag** catches integration gaps that per-phase tests miss

### Key Lessons
1. Audit the milestone *before* creating the release tag — real cross-phase gaps surface at integration time
2. A stub is not a proposal; if it can be parsed as a learning it will pollute `cerebrum.md`
3. Compiled hook artifacts must be untracked before the team clones the repo, or merge conflicts become routine
4. Date-only freshness updates are theater; always re-baseline on sanctioned content changes

### Cost Observations
- Model mix: Claude Sonnet 4 + Opus
- Sessions: ~12
- Notable: Audit phase found and closed one real integration defect; cost was lower than fixing it post-ship

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 | ~20 | 5 | 8 | Initial milestone — all patterns established from scratch |
| v1.1 | ~8 | 3 | 3 | Propose-mode + concurrency tests introduced |
| v1.2 | ~12 | 5 | 13 | Verification-first planning + framework-blind curation machinery |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 12 (bash) + existing TS | N/A | 2 (`wolf-lock.ts`, `hook-copy.ts`) |
| v1.1 | Existing TS + 4 new integration tests | N/A | 0 |
| v1.2 | Existing TS + 6 new regression/integration tests | N/A | 1 (`wolf-ignore.ts` matcher) |

### Top Lessons (Verified Across Milestones)

1. Dynamic discovery beats static enumeration — `HOOK_FILES` replacement eliminated a recurring deployment gap
2. Per-file `O_EXCL` locking is sufficient for hook-level concurrency without distributed coordination
3. Propose-mode + human merge is the right default for shared `.wolf/` context
4. Verify landed behavior before building on top of it (Phase 8 pattern)
5. Framework-blind/host-blind negative boundaries keep OpenWolf portable across execution layers
6. Milestone audit before tag is cheaper than a post-ship integration fix
