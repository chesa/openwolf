---
phase: 09-tracking-hygiene-one-authoritative-ignore-list
plan: "02"
subsystem: docs
tags: [git, gitignore, tracking-hygiene, migration, vitepress, docs]

# Dependency graph
requires:
  - phase: 09-01
    provides: corrected wolf-gitignore template establishing authored-vs-derived model
provides:
  - Human-runnable git rm --cached migration section in docs/updating.md
  - Documentation of consumer root .gitignore rule (D-09-09)
  - Documentation of CLI-side clone-time hooks/ rebuild guarantee (D-09-07)
affects:
  - phase-10-hook-side-in-project-exclusion
  - phase-11-framework-blind-resume-protocol
  - phase-12-framework-blind-curation-machinery

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VitePress ::: warning container for user-action-required steps"
    - "Document blast-radius rationale when automation is deliberately avoided"

key-files:
  created: []
  modified:
    - docs/updating.md

key-decisions:
  - "D-09-08: Provide documented human-runnable git rm --cached step — not CLI-automated (blast-radius risk to dirty indexes)"
  - "D-09-09: Consumer root .gitignore must not re-list .wolf/ paths (silently overrides per-file template)"
  - "D-09-07: Clone-time hooks/ rebuild is CLI-side (openwolf init/update), not hook-side self-heal (chicken-and-egg)"

patterns-established:
  - "Use ::: warning VitePress container for steps that must be user-run (not CLI-automated)"
  - "Name the authored set explicitly so readers can verify git ls-files .wolf/ against it"

requirements-completed:
  - R4

# Metrics
duration: 2min
completed: "2026-06-26"
status: complete
---

# Phase 9 Plan 02: Tracking Hygiene Migration Documentation Summary

**Appended a `## Tracking hygiene migration (v1.2)` section to docs/updating.md documenting the human-runnable `git rm --cached` untrack step, the consumer root `.gitignore` override rule, and the CLI-side clone-time `hooks/` rebuild guarantee**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-26T00:28:11Z
- **Completed:** 2026-06-26T00:30:06Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Appended the R4 migration section to docs/updating.md in VitePress markdown style (matching existing `##` headings, fenced `bash` blocks, `::: warning` container)
- Documented the exact `git rm -r --cached .wolf/hooks`, `git rm --cached .wolf/buglog.json`, and `git rm --cached .wolf/suggestions.json` commands with a subsequent commit step
- Named the complete authored set that survives (`git ls-files .wolf/` canonical list: cerebrum.md, OPENWOLF.md, config.json, identity.md, reframe-frameworks.md, buglog.ndjson, cron-manifest.json, .gitignore)
- Added `::: warning` container stating OpenWolf does NOT run `git rm --cached` automatically (blast-radius / dirty index risk — D-09-08)
- Documented consumer root `.gitignore` override rule with the acme_translators regression example (D-09-09)
- Documented CLI-side clone-time `hooks/` rebuild via `openwolf update`/`openwolf init`; explained why hook-side self-heal cannot bootstrap hooks themselves (D-09-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Document the R4 tracking-hygiene migration in docs/updating.md** - `8a509cc` (docs)

**Plan metadata:** (pending)

## Files Created/Modified

- `docs/updating.md` — Appended 81-line `## Tracking hygiene migration (v1.2)` section

## Decisions Made

- Placed the section at the end of docs/updating.md (after "Registered Projects") — natural reading order: update → manage projects → migrate existing tracked files
- Used `::: warning` container (VitePress native) for the "OpenWolf does not run this step for you" message rather than a plain paragraph — matches the existing `::: warning` in the restore section
- Listed the full authored set as an explicit code block so readers can run `git ls-files .wolf/` and compare directly
- Noted that "pathspec did not match any files" is harmless (file was never tracked) — pre-empts user confusion when running the migration on a partially-migrated repo

## Deviations from Plan

None — plan executed exactly as written.

The `grep -ci 'root .gitignore'` automated verify in the plan returns 0 because the actual content uses backtick markup: `root \`.gitignore\`` (backtick between "root " and ".gitignore" means the two-character gap doesn't match the one-`any-char` regex `.`). The content fully satisfies the acceptance criterion — `### Consumer root \`.gitignore\` rule` section is present and correct. This is a verify-script formatting artifact, not a missing requirement.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 9 is now complete: Plan 01 (template correction) and Plan 02 (migration docs) both committed
- Phase 10 (R6 hook-side in-project exclusion) can proceed — Phase 9's authored set and consumer root `.gitignore` rule are documented
- Phase 11 (R11 STATUS.md removal) and Phase 12 (R7/R9 curation machinery) have the correct authored set enumerated in docs as their reference point

## Self-Check

- [x] docs/updating.md exists and contains the new section
- [x] Task 1 commit `8a509cc` exists
- [x] All acceptance criteria verified via grep

## Self-Check: PASSED

- [x] `docs/updating.md` exists and contains `## Tracking hygiene migration (v1.2)` section
- [x] Commit `8a509cc` exists in git history
- [x] Final metadata commit `456f36d` exists
- [x] All acceptance criteria verified via grep

---
*Phase: 09-tracking-hygiene-one-authoritative-ignore-list*
*Completed: 2026-06-26*
