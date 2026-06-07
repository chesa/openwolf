# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — CHESA Fork Team Toolkit

**Shipped:** 2026-06-07
**Phases:** 5 | **Plans:** 8 | **Sessions:** ~20

### What Was Built
- Automated local dev setup script with prerequisite checks, upstream remote config, and global link
- Read-only divergence reporting script tracking AHEAD/BEHIND/DIVERGED/IN SYNC status
- Dynamic hook discovery replacing static HOOK_FILES array across init/update/status
- Advisory per-file locking for concurrent .wolf/ write safety (zero-dependency Node.js O_EXCL)
- OPENWOLF_METADATA_DIR env var for flexible metadata storage location
- .wolf/.gitignore template with `*` ignore-all + 4 opt-in exceptions
- Team onboarding documentation covering mixed commit strategy and concurrent write safety
- pnpm clean dev script with explicit path guards and .DS_Store cleanup

### What Worked
- Dynamic hook discovery eliminated deployment gap where 6 wolf-* modules were never copied
- Dual-path resolution (metadata vs hooks) cleanly separated concerns for init/update
- withFileLock zero-dependency design with staleness TTL handles crash-orphaned locks
- .gitignore template approach (`*` + opt-in exceptions) is the safest default
- GSD workflow enabled rapid iteration through all 8 plans in ~2 days

### What Was Inefficient
- TDD test framework for bash: subshell isolation means PASS/FAIL counts don't propagate
- REQUIREMENTS.md checkboxes fell out of sync with actual completion — many items completed but not checked off
- Multiple phase directory naming conventions (01-p0-security-fixes-quick-win vs 01-fork-install) created confusion in roadmap analysis
- Static HOOK_FILES array was a repeated source of deployment bugs before dynamic discovery

### Patterns Established
- Dynamic directory scanning replaces static file lists for hook deployment
- Advisory per-file locking using zero-length sentinel `.lock` files with O_EXCL
- Metadata path resolution: check env var → validate absolute → fall back to default
- Hooks path separation: always projectRoot/.wolf/hooks/ regardless of metadata dir
- Template files in src/templates/ + ALWAYS_OVERWRITE pattern for init/upgrade deployment
- Node.js `-e` inline pattern for package.json scripts with existsSync guards
- Fork management: read-only divergence reporting with upstream HTTPS remote

### Key Lessons
1. Document checkboxes in REQUIREMENTS.md must be updated after each plan, not deferred until milestone close
2. Test framework choice matters — bash subshell test harnesses have fundamental isolation limitations
3. Zero-dependency Node.js built-ins (O_EXCL, Atomics.wait) are viable for file locking without external deps
4. Phase directory naming should follow a single convention from the start to avoid roadmap analysis confusion

### Cost Observations
- Model mix: ~100% Claude (claude-sonnet-4 and opus)
- Sessions: ~20 sessions
- Notable: Highly efficient milestone — 8 plans completed in ~2 days with thorough verification

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~20 | 5 | Initial milestone — all patterns established from scratch |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 12 (bash) + existing TS | N/A | 2 (wolf-lock.ts, hook-copy.ts — both use Node builtins only) |

### Top Lessons (Verified Across Milestones)

1. Dynamic discovery beats static enumeration — HOOK_FILES replacement eliminated a recurring deployment gap
2. Per-file O_EXCL locking is sufficient for hook-level concurrency without distributed coordination
