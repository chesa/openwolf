# Phase 4: P2 Cleanup - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Repository hygiene — the final sprint phase delivering two discrete items:

1. Add `pnpm clean` script to `package.json` that removes `dist/`, `.wolf/designqc-captures/`, and any `tmp.*` directories — without touching `.wolf/` state files (CLEAN-01)
2. Delete committed `.DS_Store` files from `.claude/` and repo root (CLEAN-02)

No new subsystems. No new dependencies. No behavioral changes to existing features.

</domain>

<decisions>
## Implementation Decisions

### pnpm clean script

- **D-01: Implementation approach — inline Node.js (`node -e`)**
  Use the same pattern as the existing `prebuild` script in `package.json`:
  ```
  node -e "const fs=require('fs'); ..."
  ```
  No new dependencies (`rimraf`, `del-cli`, etc.). Cross-platform. Consistent with existing project convention.

- **D-02: Paths to remove — explicit list only**
  The script MUST explicitly name each path:
  - `dist/`
  - `.wolf/designqc-captures/`
  - Any `tmp.*` directories (discovered via `fs.readdirSync('.').filter(f => f.startsWith('tmp.'))`)

  **Never** glob `.wolf/` root or use `rm -rf .wolf/*`. Prior decision from STATE.md: "pnpm clean explicit paths only; never glob at .wolf/ root."

- **D-03: `prebuild` relationship — leave untouched**
  The existing `prebuild` script already removes `dist/` before a build. `pnpm clean` is a standalone script for developer use. Both coexist independently; no change to `prebuild`.

- **D-04: Guard for non-existent paths**
  Wrap each `fs.rmSync` call with an existence check (like `prebuild` does: `if(fs.existsSync('dist'))fs.rmSync(...)`) to avoid errors when paths don't exist.

### .DS_Store cleanup

- **D-05: Strategy — delete physical files only**
  Both `.DS_Store` files (`./.DS_Store` and `./.claude/.DS_Store`) exist on disk but are **not tracked in git** (`git ls-files` returns nothing). No `git rm --cached` step is needed.
  Simply delete both files:
  - `rm .DS_Store`
  - `rm .claude/.DS_Store`
  Then commit the deletion (git will see them as untracked deletions — actually they won't show in git status since they're untracked; just delete them physically).

- **D-06: `.gitignore` — no change needed**
  The existing `.gitignore` already has a bare `DS_Store` entry which git treats as a pattern matching `.DS_Store` in any directory. No addition of `**/.DS_Store` is required.

### Claude's Discretion

- How to structure the `node -e` command for `tmp.*` discovery — the planner may split it into a multi-line script or keep it inline, whichever is readable.
- Whether to add a `clean` npm lifecycle note in `package.json` `scripts` comments (not standard in JSON, so probably skip).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 4 — CLEAN-01, CLEAN-02 success criteria and the "pnpm clean does NOT delete .wolf/ state files" constraint
- `.planning/REQUIREMENTS.md` §CLEAN-01, §CLEAN-02 — exact requirement text

### Existing files to modify
- `package.json` — add `clean` script entry to the `scripts` object
- `.gitignore` — review only; no changes expected (`.DS_Store` entry already present)

### Files to delete
- `.DS_Store` (repo root)
- `.claude/.DS_Store`

### Reference patterns
- `package.json` `prebuild` script — use the same `node -e "const fs=require('fs');if(fs.existsSync(...))fs.rmSync(...,{recursive:true})"` pattern for the `clean` script

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` `prebuild` script — already uses `node -e` with `fs.existsSync` + `fs.rmSync({recursive:true})` guard pattern. The `pnpm clean` script should follow this exactly.

### Established Patterns
- **No new dependencies for tooling scripts**: The project avoids adding runtime or dev dependencies for simple file operations. Inline Node.js is the established approach.
- **Explicit path safety**: STATE.md decision "pnpm clean explicit paths only; never glob at .wolf/ root" — this prevents accidental deletion of `.wolf/` session state.

### Integration Points
- `package.json` `scripts` — add `"clean": "node -e \"...\""` alongside existing scripts
- No source code changes. No TypeScript compilation involved. No tests to update.

</code_context>

<specifics>
## Specific Ideas

- The `pnpm clean` script should handle `tmp.*` by scanning the current directory: `fs.readdirSync('.').filter(f => /^tmp\./.test(f)).forEach(d => fs.rmSync(d, {recursive:true,force:true}))` — or equivalent. The `tmp.7Djh6LTePQ/` directory in the repo root is exactly the kind of artifact `clean` should remove.
- Consider whether `pnpm clean` should also remove `.wolf/designqc-captures/` only if the directory exists (guard like `prebuild` does for `dist/`). Yes — follow the guard pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

## Auto-Mode Decisions Log

Per `--auto` mode, gray areas auto-selected with the recommended option:

```
[auto] [pnpm clean implementation] — Q: "Node.js inline vs shell vs rimraf?" → Selected: "Node.js inline (node -e)" (recommended: consistent with prebuild pattern, no new deps, cross-platform)
[auto] [tmp.* discovery] — Q: "Shell glob vs fs.readdirSync filter?" → Selected: "fs.readdirSync filter" (recommended: cross-platform, explicit, no shell glob)
[auto] [.DS_Store cleanup] — Q: "git rm --cached + delete vs delete only?" → Selected: "delete physical files only" (recommended: files not tracked in git; .gitignore already covers all dirs)
[auto] [.gitignore change] — Q: "Add **/.DS_Store or keep bare .DS_Store?" → Selected: "no change needed" (recommended: bare .DS_Store in gitignore already matches all subdirectories)
```

---

*Phase: 4-P2 Cleanup*
*Context gathered: 2026-06-02*
*Mode: --auto (gray areas auto-selected with recommended option, no user prompts)*
