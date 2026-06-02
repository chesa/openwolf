# Phase 4: P2 Cleanup - Research

**Researched:** 2026-06-02
**Domain:** Repository hygiene — npm script authoring, git untracked file deletion
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: pnpm clean implementation — inline Node.js (`node -e`)**
  Same pattern as the existing `prebuild` script. No new dependencies
  (`rimraf`, `del-cli`, etc.). Cross-platform. Consistent with project convention.

- **D-02: Paths to remove — explicit list only**
  - `dist/`
  - `.wolf/designqc-captures/`
  - `tmp.*` directories (discovered via `fs.readdirSync('.')` filter)
  NEVER glob `.wolf/` root or use `rm -rf .wolf/*`.

- **D-03: `prebuild` relationship — leave untouched**
  Existing `prebuild` removes `dist/` before a build. `pnpm clean` is a
  standalone developer script. Both coexist independently.

- **D-04: Guard for non-existent paths**
  Wrap every `fs.rmSync` call with `fs.existsSync(...)` (same as `prebuild`).

- **D-05: .DS_Store strategy — delete physical files only**
  Both `.DS_Store` files (`./.DS_Store` and `./.claude/.DS_Store`) exist on
  disk but are NOT tracked in git (`git ls-files` returns nothing for both).
  No `git rm --cached` needed. Simply delete the files.

- **D-06: .gitignore — no change needed**
  The existing `.gitignore` already has a bare `DS_Store` entry. No addition
  of `**/.DS_Store` is required.

### Claude's Discretion

- How to structure the `node -e` command for `tmp.*` discovery — split into
  multi-line script or keep inline, whichever is more readable.
- Whether to add a `clean` npm lifecycle note in package.json scripts comments
  (not standard in JSON, so probably skip).

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAN-01 | `pnpm clean` script removes `dist/`, `.wolf/designqc-captures/`, and `tmp.*` directories | Verified: `prebuild` pattern in package.json directly reusable; `fs.readdirSync` filter confirmed for `tmp.*` discovery |
| CLEAN-02 | `.DS_Store` removed from `.claude/` and repo root; added to `.gitignore` | Verified: both files untracked (not in git), `.gitignore` already has bare `DS_Store` entry — no gitignore change needed |
</phase_requirements>

---

## Summary

Phase 4 is the final sprint phase and consists of exactly two discrete, self-contained
tasks with zero ambiguity. No new libraries, no new subsystems, no behavioral changes to
existing features.

**CLEAN-01** adds a `"clean"` entry to the `scripts` object in `package.json`. The
implementation pattern is fully established by the existing `prebuild` script: inline
`node -e` with `const fs=require('fs')`, `fs.existsSync(...)` guards, and
`fs.rmSync(..., {recursive:true, force:true})` calls. Verified: `dist/` exists on disk;
`.wolf/designqc-captures/` does not exist (guard required); `tmp.7Djh6LTePQ/` is present
and discovered correctly by the `fs.readdirSync('.').filter(f=>/^tmp\./.test(f))` pattern.

**CLEAN-02** deletes two `.DS_Store` files that exist on disk but are not tracked by git.
Confirmed via `git ls-files --error-unmatch`: both paths return "pathspec did not match
any file(s) known to git." The `.gitignore` bare `DS_Store` entry already matches all
subdirectories on git 2.x+. No git history surgery, no `.gitignore` edit — just `rm`
two files and commit.

**Primary recommendation:** Add the `clean` script to `package.json` in one task; delete
both `.DS_Store` files in a second task. Two commits, no dependencies between them.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| pnpm clean script | Build tooling (package.json) | — | npm lifecycle script; no runtime component |
| .DS_Store deletion | Repository / VCS | — | Filesystem hygiene; no code change |

---

## Standard Stack

### Core (existing — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs` | v22.22.3 (env) | `existsSync`, `rmSync`, `readdirSync` | Already used in `prebuild`; zero new deps |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node -e` inline | `rimraf` / `del-cli` | Project decision D-01: avoid new deps for simple file ops |
| `fs.readdirSync` filter | shell glob `tmp.*` | Cross-platform; no shell expansion edge cases |

**Installation:** None required. [VERIFIED: package.json inspection]

---

## Package Legitimacy Audit

No new packages are installed in this phase. This section is intentionally empty.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Developer invokes: pnpm clean
        |
        v
  node -e inline script
        |
        +--[existsSync?]--> dist/              --> rmSync(recursive)
        |
        +--[existsSync?]--> .wolf/designqc-captures/  --> rmSync(recursive)
        |
        +--readdirSync('.')
              .filter(/^tmp\./)
              .forEach --> rmSync(d, recursive, force)
```

`.DS_Store` deletion is a plain `rm` operation at the OS/shell level, committed as a
standard file deletion.

### Recommended Project Structure

No new directories or files are created. Changes are confined to:

```
package.json         # add "clean" script entry
.DS_Store            # deleted
.claude/.DS_Store    # deleted
```

### Pattern 1: Inline Node.js File Removal (established by prebuild)

**What:** Single-line Node.js script embedded in a package.json script value.
**When to use:** Simple filesystem cleanup with no external deps required.
**Example:**
```json
"prebuild": "node -e \"const fs=require('fs');if(fs.existsSync('dist'))fs.rmSync('dist',{recursive:true})\""
```
[VERIFIED: package.json lines 10 — existing prebuild script]

**Extension for `clean` (multiple paths + tmp.* discovery):**
```json
"clean": "node -e \"const fs=require('fs');['dist','.wolf/designqc-captures'].forEach(p=>{if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true})});fs.readdirSync('.').filter(f=>/^tmp\\./.test(f)).forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\""
```
[ASSUMED — exact formatting is Claude's discretion per D-01/D-02]

### Anti-Patterns to Avoid

- **Globbing .wolf/ root:** `rm -rf .wolf/*` or any pattern that could delete `.wolf/memory.md`,
  `.wolf/cerebrum.md`, etc. — locked decision from STATE.md.
- **Passing `--recursive` to git rm for .DS_Store:** Files are untracked; `git rm` would
  error. Physical `rm` is correct (D-05).
- **Adding `**/.DS_Store` to .gitignore:** Unnecessary — bare `DS_Store` already matches
  all subdirectories in git's pathspec. Adding it would be a no-op but introduces noise.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File removal with guards | Custom shell script | `node -e` + `fs` built-ins | Already established pattern; cross-platform |
| Directory discovery | Shell `find`/glob | `fs.readdirSync` + JS filter | Cross-platform; no subprocess; established pattern |

**Key insight:** The `prebuild` script already solves the guarded-removal pattern. The
`clean` script is a mechanical extension of it.

---

## Common Pitfalls

### Pitfall 1: Forgetting the existsSync guard for .wolf/designqc-captures

**What goes wrong:** `fs.rmSync('.wolf/designqc-captures', {recursive:true})` throws
`ENOENT` when the directory doesn't exist (e.g., in a fresh clone or after a previous
clean).
**Why it happens:** `rmSync` without `{force:true}` throws on missing paths.
**How to avoid:** Either `fs.existsSync(p)` guard (matching `prebuild` style) OR pass
`{recursive:true, force:true}` — `force:true` suppresses ENOENT. Either approach is
acceptable; using `force:true` alone is slightly simpler.
**Warning signs:** `Error: ENOENT: no such file or directory` during `pnpm clean` on a
fresh clone.

### Pitfall 2: tmp.* regex escaping in JSON string

**What goes wrong:** The regex `/^tmp\./` inside a JSON string double-escaped in a shell
argument can lose backslashes, making it match `tmp` + any char instead of literal dot.
**Why it happens:** JSON requires `\\` for a literal backslash; the shell then sees `\/`.
**How to avoid:** Use `\\.` (double-backslash) inside the JSON string value:
`/^tmp\\./.test(f)` in the JSON, which the JS runtime sees as `/^tmp\./.test(f)`.
Verify by running `node -e` manually before committing.
**Warning signs:** `tmp.7Djh6LTePQ` not deleted, but `tmpXfoo` would be deleted.

### Pitfall 3: Assuming .DS_Store files are git-tracked

**What goes wrong:** Running `git rm --cached .DS_Store` when the file is already
untracked causes a fatal error: "pathspec did not match any file(s) known to git."
**Why it happens:** `.DS_Store` is in `.gitignore`, so git never tracked it; it only
exists physically.
**How to avoid:** Just `rm .DS_Store` and `rm .claude/.DS_Store`. Confirmed: `git
ls-files --error-unmatch` returns error for both paths.
**Warning signs:** `git rm --cached` error message at plan execution time.

---

## Code Examples

### Complete clean script (reference implementation)

```json
"clean": "node -e \"const fs=require('fs');['dist','.wolf/designqc-captures'].forEach(p=>{if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true})});fs.readdirSync('.').filter(f=>/^tmp\\\\./.test(f)).forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\""
```
[ASSUMED — exact quoting to be validated at execution; planner should include a
`node -e` smoke-test task]

Alternative (more readable) using single quotes if run via sh on macOS/Linux — but
pnpm scripts use shell, and cross-platform safety favors the double-quote form above.

### .DS_Store deletion commands

```bash
rm .DS_Store
rm .claude/.DS_Store
```
[VERIFIED: both files confirmed present on disk; both confirmed untracked in git]

---

## Runtime State Inventory

This is not a rename/refactor/migration phase. Section omitted.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `rimraf` for cross-platform rm | `fs.rmSync` with `{recursive:true}` | Node.js 14.14+ | No extra deps needed |
| Shell glob `rm -rf tmp.*` | `fs.readdirSync` filter | n/a | Cross-platform; explicit |

**Deprecated/outdated:**
- `rimraf` (as a required dep for clean scripts): Node.js built-in `fs.rmSync` with
  `{recursive:true, force:true}` is the current standard since Node 14.14 (LTS).
  Project targets Node >=20.0.0 [VERIFIED: package.json engines field], so `fs.rmSync`
  is unconditionally available.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact JSON string escaping for the `clean` script value (double-backslash for regex dot) | Code Examples | Script would fail to match `tmp.*` correctly; caught by smoke-test |
| A2 | pnpm passes script values to sh on macOS (so double-quote escaping applies) | Code Examples | Low risk — pnpm uses `sh -c` on POSIX; verified behavior on macOS |

---

## Open Questions

1. **clean script quoting — validate before commit**
   - What we know: `node -e` pattern works (confirmed by running manually); JSON escaping
     in package.json requires care.
   - What's unclear: The exact character sequence for `/^tmp\\./.test(f)` inside
     double-quoted JSON inside a pnpm script. Three layers of quoting (JSON, shell, regex).
   - Recommendation: Plan should include a smoke-test task: run `pnpm clean` against the
     existing `tmp.7Djh6LTePQ` directory and confirm deletion before committing.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `fs` built-in | CLEAN-01 clean script | Yes | v22.22.3 | — |
| `rm` (coreutils) | CLEAN-02 .DS_Store deletion | Yes | macOS built-in | — |
| git | CLEAN-02 commit | Yes | (project is a git repo) | — |
| pnpm | CLEAN-01 smoke-test | Yes | (used by project already) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

---

## Validation Architecture

`nyquist_validation` is explicitly `false` in `.planning/config.json`. Section omitted.

---

## Security Domain

This phase performs no authentication, data storage, input handling, or cryptographic
operations. ASVS categories V2-V6 do not apply. No threat patterns are introduced by
a `pnpm clean` script or `.DS_Store` deletion.

---

## Sources

### Primary (HIGH confidence)
- `package.json` lines 9-21 — existing `prebuild` script pattern, exact syntax confirmed
- `.gitignore` lines 1-54 — confirmed bare `DS_Store` entry present
- `git ls-files --error-unmatch .DS_Store` / `.claude/.DS_Store` — confirmed untracked
- `ls -la .DS_Store .claude/.DS_Store` — confirmed both files physically exist
- `node -e "..."` manual test run — confirmed `fs.readdirSync` filter finds `tmp.7Djh6LTePQ`
- `package.json` engines field — `node >=20.0.0`; `fs.rmSync` with `recursive`+`force` available since Node 14.14

### Secondary (MEDIUM confidence)
- Node.js documentation: `fs.rmSync` added in v14.14.0, `{force: true}` option suppresses ENOENT

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- CLEAN-01 (pnpm clean): HIGH — pattern fully established by existing prebuild; only
  open item is JSON quoting validation (handled by smoke-test task)
- CLEAN-02 (.DS_Store deletion): HIGH — confirmed untracked, confirmed files present,
  confirmed .gitignore already covers them
- Architecture: HIGH — no new subsystems; two isolated edits

**Research date:** 2026-06-02
**Valid until:** n/a — findings are based on repo state, not ecosystem trends
