# Plan 06-01: Learnings Review CLI

**Phase:** 6 — Learnings Review CLI
**Plan:** 01
**Status:** Complete ✓

## What Was Built

### Task 1: `openwolf learnings list` command

- Created `src/cli/learnings-cmd.ts` with:
  - `ProposalEntry` interface (sessionId, timestamp, target, content, raw)
  - `parseProposals()` — reads and parses `proposed-learnings.md` entries with error handling
  - `listProposals()` — formatted table display with columns: Session ID, Timestamp, Target, Preview
  - `learningsCommand()` — scans all session directories, with `--session` filter support
- Registered `learnings list` in `src/cli/index.ts` via lazy `import()`
- Created `tests/cli/learnings.test.ts` with 8 passing tests

### Task 2: `openwolf learnings merge` command

- `learningsMergeCommand()` — interactive merge with readline selection:
  - Phase A: Parse and display all proposals
  - Phase B: Interactive selection (numbers, ranges, 'a' for all, 'q' to cancel)
  - Phase C: Lock-protected append to `cerebrum.md`/`anatomy.md` via `withFileLock`
  - Phase D: Archive consumed entries from `proposed-learnings.md` to `merged-learnings.md`
  - Phase E: Summary output
- Registered `learnings merge` in `src/cli/index.ts`

## Requirements Covered
- MERGE-01 ✓ — `openwolf learnings list` shows proposals across all sessions
- MERGE-02 ✓ — `openwolf learnings merge` with interactive selection, withFileLock-protected write
- MERGE-03 ✓ — After merge, entries moved to `merged-learnings.md`

## Verification
- `pnpm build` — passes
- `node dist/bin/openwolf.js learnings --help` — shows list and merge subcommands
- `npx vitest run tests/cli/learnings.test.ts` — 8/8 passed
