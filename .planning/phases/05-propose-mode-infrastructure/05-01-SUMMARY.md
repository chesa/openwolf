# Plan 05-01: Propose-Mode Infrastructure

**Phase:** 5 — Propose-Mode Infrastructure
**Plan:** 01
**Status:** Complete ✓

## What Was Built

### Task 1: `appendProposal()` helper

Added `appendProposal(target: 'cerebrum' | 'anatomy', content: string)` to `src/hooks/wolf-files.ts`. The function:

- Resolves the session directory via `getSessionDir()` — worktree mode writes to `.wolf/sessions/<id>/proposed-learnings.md`, single-repo to `.wolf/proposed-learnings.md`
- Uses `fs.mkdirSync` + `fs.appendFileSync` (same pattern as `appendMarkdown`)
- Writes timestamped entries: `\n## TIMESTAMP → TARGET\n\nCONTENT\n`
- Re-exported from `src/hooks/shared.ts` via barrel

No hooks required migration — grep confirmed `appendMarkdown` is only called for `memory.md`, not `cerebrum.md` or `anatomy.md` (PROP-02 satisfied inherently).

### Task 2: OPENWOLF.md template redirect

Updated `src/templates/OPENWOLF.md` "Cerebrum Learning" section to instruct Claude to write learnings to `.wolf/sessions/<worktreeId>/proposed-learnings.md` instead of directly editing `cerebrum.md`. All learning categories (User Preferences, Key Learnings, Do-Not-Repeat, Decision Log) preserved — only the destination changed.

## Requirements Covered
- PROP-01 ✓ — `appendProposal` writes to per-session staging file
- PROP-02 ✓ — No hooks target cerebrum.md/anatomy.md via appendMarkdown
- PROTO-01 ✓ — OPENWOLF.md template redirects to staging path

## Verification
- `pnpm build:hooks` — passes
- `pnpm build` (full) — passes
- `grep -c 'appendProposal' src/hooks/wolf-files.ts` — 1
- `grep -c 'appendProposal' src/hooks/shared.ts` — 1
- `grep -c 'proposed-learnings' src/templates/OPENWOLF.md` — 1
- Old instruction "You MUST update .wolf/cerebrum.md" — removed ✓
