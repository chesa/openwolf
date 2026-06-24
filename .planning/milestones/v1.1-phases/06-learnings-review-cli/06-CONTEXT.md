# Phase 6: Learnings Review CLI - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `openwolf learnings` CLI subcommand that lets developers review, select, and merge staged proposals from per-session staging files into shared markdown (`cerebrum.md` and `anatomy.md`). This is the second half of the propose-and-merge pattern — Phase 5 created the staging infrastructure, Phase 6 provides the review-and-consolidate tooling.

**Deliverables:**
1. `openwolf learnings` — lists pending proposals across all session staging files
2. `openwolf learnings merge` — interactively merges selected proposals into shared markdown
3. Post-merge archival: processed entries moved from `proposed-learnings.md` to `merged-learnings.md`

</domain>

<decisions>
## Implementation Decisions

### CLI List Format
- Table format with columns: session ID, timestamp, target, preview (truncated to 60 chars)
- `--session <id>` flag to filter; show all by default
- Empty state: "No pending proposals found" and exit 0

### Merge Interaction
- Interactive prompt: list proposals by number, user types numbers to select, then confirms
- Merge conflict: skip conflicting entry, print warning to stderr, continue with remaining entries
- Use `withFileLock` to protect the write to cerebrum.md/anatomy.md

### Error & Edge Cases
- Missing/corrupted session dirs: skip silently with stderr warning, continue processing other sessions
- Unparseable entries: skip with stderr warning, continue
- New file: `src/cli/learnings-cmd.ts`, lazy-loaded in `src/cli/index.ts`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/index.ts` — lazy-loading pattern via dynamic `import()` in `.action()` callbacks
- `src/hooks/wolf-files.ts` — `appendProposal()` writes proposals, reading them uses the same session path utilities
- `src/hooks/wolf-paths.ts` — `getSessionDir()`, `getWorktreeContext()` for session path resolution
- `src/hooks/wolf-lock.ts` — `withFileLock` for safe concurrent writes to shared markdown
- `src/hooks/wolf-json.ts` — `readJSON` for reading worktree.json metadata

### Established Patterns
- CLI commands are registered in `src/cli/index.ts` with lazy-loaded action handlers
- Subcommands use `.command()` chaining with `.description()` for help text
- Session directories live at `.wolf/sessions/<id>/` with a `proposed-learnings.md` file in each
- Each session has `worktree.json` with worktreePath and branch metadata

### Integration Points
- `src/cli/index.ts` — register `learnings` as a subcommand under the main `openwolf` program
- `src/cli/learnings-cmd.ts` — new file for the learnings command handler

</code_context>

<specifics>
## Specific Ideas

No specific requirements — refer to ROADMAP phase description, success criteria, and requirements.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
