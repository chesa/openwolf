# Phase 5: Propose-Mode Infrastructure - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Hooks write learnings to a per-session staging file rather than directly editing shared markdown. This eliminates the race condition where two concurrent Claude Code sessions overwrite each other's entries in `cerebrum.md` or `anatomy.md`.

**Deliverables:**
1. `appendProposal(target, content)` helper in `src/hooks/wolf-files.ts` — writes timestamped entries to `.wolf/sessions/<id>/proposed-learnings.md`
2. All hooks that directly write to `cerebrum.md` or `anatomy.md` are updated to use `appendProposal()` instead
3. `src/templates/OPENWOLF.md` template updated to instruct Claude to use the proposal path rather than editing shared files directly
4. Per-session staging files eliminate contention — two sessions can each write proposals simultaneously

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/wolf-files.ts:83` — `appendMarkdown()` function exists and can serve as a template
- `src/hooks/wolf-paths.ts` — `getSessionDir()`, `getWorktreeContext()` already provide session isolation
- `src/hooks/shared.ts` — barrel export pattern for adding new public API functions

### Established Patterns
- Hook utilities live in `src/hooks/wolf-*.ts` modules, exported via `shared.ts`
- Session-scoped paths via `getSessionDir()` already exist (worktree sessions use `.wolf/sessions/<id>/`)
- `appendMarkdown()` uses `fs.appendFileSync` — no lock needed for append-only files
- Template files in `src/templates/` are copied to `.wolf/` on `openwolf init`

### Integration Points
- `src/hooks/wolf-files.ts` — new `appendProposal()` function
- `src/hooks/shared.ts` — export `appendProposal`
- `src/templates/OPENWOLF.md` — update Cerebrum Learning section to reference proposal path
- No hooks currently call `appendMarkdown` targeting `cerebrum.md` or `anatomy.md` — they only write to `memory.md`. The concurrency issue is that Claude edits `cerebrum.md`/`anatomy.md` directly per OPENWOLF.md instructions.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
