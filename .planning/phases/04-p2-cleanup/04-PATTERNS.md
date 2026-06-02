# Phase 4: P2 Cleanup - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 3 (1 modified, 2 deleted)
**Analogs found:** 1 / 1 (deleted files have no analog — deletion is the operation)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` (modify `scripts`) | config | batch | `package.json` `prebuild` script (same file, line 10) | exact |
| `.DS_Store` (delete) | artifact | n/a | n/a — deletion only | n/a |
| `.claude/.DS_Store` (delete) | artifact | n/a | n/a — deletion only | n/a |

---

## Pattern Assignments

### `package.json` — add `"clean"` script (config, batch)

**Analog:** `package.json` `prebuild` script (line 10)

**Exact analog excerpt** (`package.json` line 10):
```json
"prebuild": "node -e \"const fs=require('fs');if(fs.existsSync('dist'))fs.rmSync('dist',{recursive:true})\""
```

**Pattern components to replicate:**

| Component | Analog form | How `clean` extends it |
|-----------|-------------|------------------------|
| Runtime | `node -e "..."` inline | Same — no shell script file, no new dep |
| Existence guard | `if(fs.existsSync('dist'))` | One guard per explicit path |
| Removal call | `fs.rmSync('dist',{recursive:true})` | Add `force:true` to suppress ENOENT without guard (or keep guard — either acceptable) |
| Paths | Single path: `dist/` | Three targets: `dist/`, `.wolf/designqc-captures/`, `tmp.*` dirs |
| Discovery | Hardcoded path | `dist/` and `.wolf/designqc-captures/` are hardcoded; `tmp.*` uses `fs.readdirSync('.').filter(f=>/^tmp\./.test(f))` |

**Target script value** (reference implementation from RESEARCH.md — validate quoting with smoke-test before commit):
```json
"clean": "node -e \"const fs=require('fs');['dist','.wolf/designqc-captures'].forEach(p=>{if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:true})});fs.readdirSync('.').filter(f=>/^tmp\\./.test(f)).forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\""
```

**Insertion point:** Add `"clean"` as a new key in the `scripts` object (`package.json` lines 9-21), alongside existing entries. JSON does not support ordering requirements — place after `test:watch` or after `prebuild` for logical grouping.

**Critical constraint (from CONTEXT.md D-03):** Do NOT modify the existing `prebuild` entry. `clean` and `prebuild` coexist independently.

**Regex escaping note (RESEARCH.md Pitfall 2):** Inside the JSON string value, the regex dot must be written as `\\.` (double-backslash) so the JS runtime receives `\.` (literal dot). Verify by running `pnpm clean` manually against `tmp.7Djh6LTePQ/` before committing.

---

### `.DS_Store` and `.claude/.DS_Store` — delete (artifact, n/a)

**No analog.** Deletion is the entire operation.

**Operation:** Physical file removal only. No `git rm --cached` — both files are untracked (confirmed by `git ls-files --error-unmatch`).

```bash
rm .DS_Store
rm .claude/.DS_Store
```

**Post-delete git behavior:** Because both files are untracked (not in git history), `git status` will show no change after deletion. No commit for this operation — nothing to commit.

**`.gitignore`:** No change needed. The existing bare `DS_Store` entry (`.gitignore` line confirmed present) already matches `.DS_Store` in all subdirectories on git 2.x+. Adding `**/.DS_Store` would be a no-op.

---

## Shared Patterns

### Guarded removal with `fs.existsSync`

**Source:** `package.json` line 10 (`prebuild` script)
**Apply to:** Every `fs.rmSync` call in the `clean` script that targets a known path

```javascript
if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
```

This pattern prevents `ENOENT` errors on fresh clones where `dist/` or `.wolf/designqc-captures/` may not yet exist.

### `fs.readdirSync` filter for dynamic path discovery

**Source:** RESEARCH.md (verified by manual `node -e` test run against `tmp.7Djh6LTePQ/`)
**Apply to:** `tmp.*` directory discovery in the `clean` script

```javascript
fs.readdirSync('.').filter(f => /^tmp\./.test(f)).forEach(d => fs.rmSync(d, { recursive: true, force: true }))
```

No shell globbing. Cross-platform. No subprocess. Matches the project's established preference for inline Node.js over shell expansion.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.DS_Store` (repo root) | artifact | n/a | Deletion-only operation; no code pattern applies |
| `.claude/.DS_Store` | artifact | n/a | Deletion-only operation; no code pattern applies |

---

## Metadata

**Analog search scope:** `package.json` scripts object (the only file being modified)
**Files scanned:** 1 (`package.json`)
**Analogs identified:** 1 (`prebuild` script — exact role and data flow match)
**Pattern extraction date:** 2026-06-02

**Why no broader search was needed:** Phase 4 modifies exactly one source file (`package.json`) and deletes two OS artifact files. The analog lives in the same file as the modification target. No TypeScript, no new modules, no new subsystems. Early stopping applied after the first (and only) analog.
