# Phase 0: Prerequisite Fix - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 0 "Prerequisite Fix" was originally scoped to fix the `HOOK_FILES` deployment gap in `src/cli/hook-settings.ts` — the gap where newly created `wolf-*.js` hook modules were not being copied to `.wolf/hooks/` because the copy step relied on a static file list.

**Key finding: This gap was already resolved by Phase 3 (plan 03-01).** Dynamic hook discovery via `copyHookFiles()` in `hook-copy.ts` now scans the source directory at runtime, copying all `.js` files present. Any new hook module is automatically deployed.

The remaining scope is **vestigial cleanup**: `HOOK_FILES` in `hook-settings.ts` still exists as an exported constant but is no longer consumed by any production code. Only `tests/cli/init.test.ts` imports it. Phase 0 should either be marked complete or handle this final cleanup.

</domain>

<decisions>
## Implementation Decisions

### HOOK_FILES vestigial constant

- **D-01: Remove `HOOK_FILES` from `hook-settings.ts`**
  The constant served as a static file list for the old copy pipeline. With dynamic discovery in `hook-copy.ts` (`copyHookFiles()` performs `fs.readdirSync + .filter(f => f.endsWith('.js'))`), the list is no longer used by any production code.
  - HOOK_FILES is only imported by `tests/cli/init.test.ts` for test assertions
  - `hook-settings.ts` still registers hooks via the `HOOK_CONFIG` array (lines 1–96), which is the correct mechanism for hook registration
  - Removing HOOK_FILES eliminates dead code and prevents the list from drifting from actual hook files

- **D-02: Update test to verify dynamic discovery**
  `tests/cli/init.test.ts` currently imports `HOOK_FILES` to verify the file list. After removal, the test should verify that `copyHookFiles()` discovers and copies files dynamically — testing the behavior, not the static constant.

### Phase 0 status

- **D-03: Phase 0's original scope is already resolved — proceed with cleanup**
  The HOOK_FILES deployment gap that Phase 0 was created to fix was addressed in Phase 3. This phase can be completed with a single cleanup plan: remove HOOK_FILES + update test. Mark Phase 0 complete after.

### Claude's Discretion

- Whether the test update should verify the complete list of expected hook files from the HOOK_CONFIG registration array, or use a simpler assertion (e.g., verifying `getHookFileNames()` returns non-empty and contains `shared.js`).
- Whether to add a comment in `hook-settings.ts` documenting the historical purpose of HOOK_FILES for future readers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §Phase 0 — original scope (gap already resolved by Phase 3)

### Source files (in scope)
- `src/cli/hook-settings.ts` line 98 — `HOOK_FILES` constant to remove
- `src/cli/hook-copy.ts` — `copyHookFiles()` dynamic discovery (already implemented)
- `tests/cli/init.test.ts` lines 259–266 — test assertions referencing `HOOK_FILES`

### Prior phase context (relevant decisions)
- `.planning/phases/03-workflow-improvements/03-CONTEXT.md` D-02 — "Dynamic discovery — copy all .js files from dist/hooks/ to .wolf/hooks/"
- `.planning/STATE.md` `03-01` — "HOOK_FILES constant removed from hook-settings.ts" (note: the constant was actually retained; this cleanup completes that intent)

### Codebase context
- `.planning/codebase/CONVENTIONS.md` — named exports, `.js` extension in imports
- `.planning/codebase/STACK.md` — Node.js >= 20, pnpm, Vitest

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/hook-copy.ts` `copyHookFiles()` — dynamic directory scan and copy. Already handles all `.js` files in the hooks source directory. No changes needed.
- `src/cli/hook-settings.ts` `HOOK_CONFIG` — hook registration array (lines 1–96). This is the correct mechanism for defining which hooks are registered. HOOK_FILES was a separate concern for file copying only.

### Established Patterns
- **No dead code left in source:** The project has consistently removed unused exports and constants during cleanup phases.
- **Dynamic discovery over static lists:** Phase 3 established that dynamic directory scanning replaces static file lists for deployment. This cleanup completes that transition.

### Integration Points
- `tests/cli/init.test.ts` — must be updated to remove `HOOK_FILES` imports and verify dynamic behavior instead
- No source code changes beyond removing the HOOK_FILES declaration

</code_context>

<specifics>
## Specific Ideas

- The `HOOK_FILES` constant lists 14 files: `post-read.js`, `post-write.js`, `pre-read.js`, `pre-write.js`, `session-start.js`, `shared.js`, `stop.js`, `worktree-helper.js`, `wolf-anatomy.js`, `wolf-describe.js`, `wolf-files.js`, `wolf-json.js`, `wolf-lock.js`, `wolf-misc.js`, `wolf-paths.js`. All are still deployed via dynamic discovery — removing the list loses nothing.
- The test at `tests/cli/init.test.ts:259-266` uses `HOOK_FILES` to verify that `writeHooks()` writes the correct files. After removal, the test should verify that `copyHookFiles()` returns the expected count and list from a known source directory.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended option:

```
[auto] [HOOK_FILES dead code] — Q: "Is HOOK_FILES vestigial and should be removed?" → Selected: "Yes — remove HOOK_FILES from hook-settings.ts and update test" (recommended: no production code imports it; only tests; removing prevents future drift)
[auto] [Phase 0 completeness] — Q: "Is Phase 0 already resolved by Phase 3?" → Selected: "Yes — original gap already fixed. Phase 0 handles vestigial cleanup (HOOK_FILES removal + test update), then marks complete." (recommended: minimum viable scope to close without reopening completed work)
```

---

*Phase: 0-Prerequisite Fix*
*Context gathered: 2026-06-07*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
