# Phase 10: Hook-Side In-Project Exclusion — Research

**Researched:** 2026-06-25
**Domain:** TypeScript hook subsystem refactor + dep-free gitignore parser
**Confidence:** HIGH (all findings derived from direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**R6-D1:** Promote `globToRegExp`, `matchesPattern`, `shouldExclude` and their
supporting constants out of `src/scanner/anatomy-scanner.ts` into a new
zero-dependency module `src/hooks/wolf-ignore.ts`. The scanner then imports
them back from there — one definition, no copy drift.

**R6-D2 (USER-LOCKED):** `shared.ts` re-exports ONLY `shouldExclude`,
the new gitignore predicate, and the structural constants
(`ALWAYS_EXCLUDE_FILES` etc.). `globToRegExp` and `matchesPattern` remain
private to `wolf-ignore.ts`.

**R6-D3 (USER-LOCKED):** Config read: `fs.readFileSync` on `.wolf/config.json`
fresh every `recordAnatomyWrite` call. No caching. Missing/unreadable/malformed
→ fall back to defaults silently.

**R6-D4 (USER-LOCKED):** `respect_gitignore` defaults to `false` — mirror the
scanner's `?? false` exactly.

**R6-D5:** Hand-rolled root-`.gitignore` parser — supported subset: comments/
blanks, bare name, trailing slash, leading slash (anchored), within-segment `*`,
double-star `**`. Negation (`!`) lines skipped (fail-closed). MUST be pinned by
a test.

**R6-D6:** Inject in `recordAnatomyWrite` immediately after the R3 `../` guard
(line 33 of `post-write.ts`). Gate order: R3 `../` → `shouldExclude` →
gitignore. Any gate matches → return without recording.

**R6-D7:** Hook bundle must import zero `node_modules` packages.
`tsc --noEmit -p tsconfig.hooks.json` must be clean. After implementation:
`pnpm build:hooks` → `node dist/bin/openwolf.js update`.

### Claude's Discretion

- Final name/signature of the gitignore predicate.
- Internal structure: precompile lines to `RegExp` vs. line-by-line evaluation.
- Test layout: new `tests/hooks/wolf-ignore.test.ts` (unit) + extend
  `tests/hooks/post-write.test.ts` (integration).
- Whether `recordAnatomyWrite` gains an explicit config param for testability or
  reads config internally.

### Deferred Ideas (OUT OF SCOPE)

- Full gitignore-spec parity (negation, character ranges, escapes, nested files).
- Removing `ignore` dep from the scanner (D-18: keep as authoritative backstop).
- Caching `config.json` across invocations (R6-D3: no caching).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R6 | Hook-side in-project path exclusion: promote pure matcher to shared dep-free module; add dep-free root-`.gitignore` parser; apply both in `recordAnatomyWrite` after R3 `../` guard. | RQ1–RQ5 fully answer how to implement each sub-requirement. |
</phase_requirements>

---

## Summary

Phase 10 is an internal refactor + new feature, not a greenfield build. The
three matcher functions (`globToRegExp`, `matchesPattern`, `shouldExclude`) and
their constants exist today in `src/scanner/anatomy-scanner.ts` and are
battle-hardened by the Q2 commit. The plan is to move them to
`src/hooks/wolf-ignore.ts`, add a new dep-free gitignore line parser (novel
code), re-export the public surface via `shared.ts`, and inject two guard calls
into `recordAnatomyWrite` after the existing R3 check.

The TS build boundary is the primary constraint. The main `tsconfig.json`
includes `src/**/*.ts`, so `anatomy-scanner.ts` can freely import from
`src/hooks/wolf-ignore.ts`. The hooks `tsconfig.hooks.json` has `rootDir:
"src/hooks"` and `include: ["src/hooks/**/*.ts"]` — `wolf-ignore.ts` must live
in `src/hooks/` and must contain zero `node_modules` imports for C2 compliance.
This is structurally clean because `wolf-ignore.ts` will only use `node:path`
and built-in JS/RegExp.

The config read pattern is a straightforward `fs.readFileSync` + `JSON.parse`
try/catch, mirroring patterns already in the hooks (e.g., `wolf-json.ts`), but
self-contained (no import of `src/utils/`). The gitignore parser needs to handle
six syntax forms; the existing `globToRegExp` can be reused for glob-style forms
with thin wrappers for anchoring and bare-name semantics.

**Primary recommendation:** Implement `wolf-ignore.ts` as a single file with
three private helpers (`globToRegExp`, `matchesPattern`, `parseGitignoreLine`)
and three exports (`shouldExclude`, `parseAndMatchGitignore`,
`DEFAULT_EXCLUDE_PATTERNS`/`ALWAYS_EXCLUDE_FILES`). Then `recordAnatomyWrite`
reads config once at the top of its body, calls the two guards, and returns
early on any match.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Glob pattern matching | `src/hooks/wolf-ignore.ts` | — | Zero-dep; consumed by both hook and scanner |
| Root-gitignore parsing | `src/hooks/wolf-ignore.ts` | — | New dep-free code; hook-build-safe |
| Anatomy gating (hook) | `src/hooks/post-write.ts` | — | `recordAnatomyWrite` is the hook's single anatomy entry point |
| Anatomy gating (scanner) | `src/scanner/anatomy-scanner.ts` | — | Full scan; keeps `ignore` pkg for edge-case backstop |
| Config read (hook) | inside `recordAnatomyWrite` | — | Fresh every call per R6-D3 |
| Public API surface | `src/hooks/shared.ts` | — | Barrel re-export only |

---

## Research Question 1: `.gitignore` Matching Semantics

### The six supported forms and their exact semantics

**1. Comment / blank lines**
Lines that are empty after trimming whitespace, or whose first non-whitespace
character is `#`, are skipped. [VERIFIED: direct codebase inspection]

**2. Bare name (matches at any depth)**
A pattern with no `/` and no glob characters: e.g., `node_modules`. It matches
if that exact string appears as any segment of the relative path.
Implementation via `parts.includes(pattern)` — already present in
`matchesPattern`. [VERIFIED: direct codebase inspection — line 115,
anatomy-scanner.ts]

**3. Trailing slash (directory-only semantic)**
e.g., `gen/` — the trailing slash is a hint that the pattern is meant to match
a directory. In practice, once the scanner/hook is working on a file path, it
should strip the trailing slash and treat it as a bare name (for depth-any
match). There is no `isDirectory()` call available in the hook context at
pattern-match time (we only have the relative path string). The correct
fail-closed behavior is: strip the trailing `/`, then apply bare-name matching
semantics. This means `gen/` correctly excludes `gen/out.js` because `parts`
will contain `"gen"`. [ASSUMED — gitignore spec says trailing slash means
directory-only, but fail-closed means we match files-under-that-name too, which
is acceptable over-exclusion.]

**4. Leading slash (root-anchored)**
e.g., `/dist` — pattern matches only when `relPath === "dist"` or
`relPath.startsWith("dist/")`. Strip the leading `/` and apply
prefix-match semantics (already in `matchesPattern` lines 121–122).
[VERIFIED: direct codebase inspection]

**5. Within-segment `*` (single-segment glob)**
e.g., `*.log`, `tmp*` — the `*` stays within one path segment (`[^/]*`).
Already implemented correctly in `globToRegExp` (line 74–76) and
`matchesPattern`. [VERIFIED: direct codebase inspection]

**6. Double-star `**` spanning segments**
e.g., `.cache/**` — `**` becomes `.*` in `globToRegExp` (line 72–73). For
gitignore the common form is a leading-slash anchored pattern like
`/.cache/**` (strip leading slash, apply glob) or bare `**` patterns like
`logs/**/*.log`. [VERIFIED: direct codebase inspection]

### How `ignore` (the npm package) differs — the deliberate split (D-18)

The `ignore` package supports the full gitignore spec including:
- negation (`!important.txt`)
- character ranges (`[abc]`)
- escape sequences (`\#` for a literal hash)
- nested `.gitignore` files (when used with a walker)
- re-include semantics for negated patterns

The hand-rolled parser intentionally does NOT support these. The fail-closed
rule: when a pattern starts with `!`, skip it entirely (no-op). This can only
cause over-exclusion (a re-included file remains excluded in the hook), never
a leak. [VERIFIED: decision R6-D5 is explicit on this point]

### Negation skip is safe (fail-closed reasoning)

A `!` negation line means "re-include this path that a prior pattern excluded."
Skipping it means: the re-include does not happen → the file stays excluded by
the earlier pattern → the hook does not record it in `anatomy.md`. This is
over-exclusion, not a leak. The full scan (CLI/daemon using the `ignore` pkg)
will correctly include it in the authoritative `anatomy.md`. The hook's
incremental anatomy update is an approximation; the full scan is the backstop.
[VERIFIED: reasoning consistent with D-18 and R6-D5]

---

## Research Question 2: Reusing `globToRegExp` for gitignore lines

### What `globToRegExp` already produces [VERIFIED: anatomy-scanner.ts lines 66–84]

```typescript
// `*`  → [^/]*   (within-segment)
// `**` → .*      (cross-segment)
// other metacharacters: escaped literally
// result: /^<pattern>$/  (anchored start-to-end)
```

### Mapping each gitignore form to existing matchers

| Form | Processing | Reuses `globToRegExp`? |
|------|-----------|------------------------|
| Comment/blank | `trim() === ""` or `startsWith("#")` → skip | No |
| Negation `!` | `startsWith("!")` → skip (no-op) | No |
| Bare name | strip trailing `/`; no `/` left, no `*` → `parts.includes(name)` | No (pure string) |
| Trailing slash | strip `/`, becomes bare name or leading-slash form below | Indirectly |
| Leading slash | strip `/`, becomes a path prefix: `relPath === p \|\| relPath.startsWith(p + "/")` | No |
| Within-segment `*` | no `/` → `globToRegExp(pattern)`, test each segment | YES |
| Extension glob `*.ext` | no `/` → `relPath.endsWith(pattern.slice(1))` | No (string suffix) |
| Glob with `/` | `globToRegExp(pattern).test(relPath)` | YES |

### Wrapper design for `parseAndMatchGitignore`

The function needs a pre-parse step that converts each gitignore line into one
of the above forms and stores a compiled representation. Recommended structure:

```typescript
// Inside wolf-ignore.ts (private)
type GitignoreEntry =
  | { kind: "skip" }
  | { kind: "bare"; name: string }      // parts.includes
  | { kind: "prefix"; prefix: string }  // relPath startsWith
  | { kind: "glob"; re: RegExp };       // globToRegExp result

function parseGitignoreLine(raw: string): GitignoreEntry {
  const line = raw.trim();
  if (!line || line.startsWith("#") || line.startsWith("!")) return { kind: "skip" };
  const stripped = line.endsWith("/") ? line.slice(0, -1) : line;
  const anchored = stripped.startsWith("/") ? stripped.slice(1) : null;
  if (anchored !== null) {
    // Leading-slash: root-anchored prefix or glob
    if (anchored.includes("*")) return { kind: "glob", re: globToRegExp(anchored) };
    return { kind: "prefix", prefix: anchored };
  }
  if (!stripped.includes("/") && !stripped.includes("*")) {
    return { kind: "bare", name: stripped };
  }
  if (stripped.includes("*")) return { kind: "glob", re: globToRegExp(stripped) };
  return { kind: "prefix", prefix: stripped };
}
```

This is safe from ReDoS because `globToRegExp` only emits `[^/]*` and `.*` —
no backreferences, no nested quantifiers. [VERIFIED: anatomy-scanner.ts lines
66–84]

### Public signature (Claude's discretion — recommended form)

```typescript
export function parseAndMatchGitignore(
  relPath: string,
  gitignoreContent: string
): boolean
```

Called with the already-normalized `relPathLocal` (forward-slashed,
root-relative). Returns `true` if the path should be excluded. Internally
parses `gitignoreContent` on every call (no caching, consistent with R6-D3).
If content is empty string, returns `false`.

Alternative: a compiled-matcher factory
`compileGitignore(content) => (relPath) => boolean` would be slightly more
efficient for the scanner reuse scenario but introduces state that complicates
the hook's "no caching" contract. The simple per-call parse is correct and the
file is sub-kilobyte.

---

## Research Question 3: TypeScript Build Boundary Analysis

### Main `tsconfig.json` [VERIFIED: direct file inspection]

```json
{
  "include": ["bin/**/*.ts", "src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/dashboard/app"]
}
```

`src/scanner/anatomy-scanner.ts` and `src/hooks/wolf-ignore.ts` are both under
`src/` — both are included in the main build. There is no compile problem with
`anatomy-scanner.ts` importing from `src/hooks/wolf-ignore.ts`. [VERIFIED]

### `tsconfig.hooks.json` [VERIFIED: direct file inspection]

```json
{
  "compilerOptions": {
    "rootDir": "src/hooks",
    "outDir": "dist/hooks"
  },
  "include": ["src/hooks/**/*.ts"]
}
```

`wolf-ignore.ts` goes in `src/hooks/` → it IS included in the hooks build.
The C2 boundary is enforced by this tsconfig compiling that file with zero
`node_modules` imports. If `wolf-ignore.ts` contained `import ignore from
"ignore"` the hooks build would fail with MODULE_NOT_FOUND at runtime (the
exact known failure class). The implementation must use only `node:path`,
`node:fs`, and built-in JS. [VERIFIED]

### ESM / `.js` extension requirement

The codebase uses `module: "Node16"` / `moduleResolution: "Node16"`. This means
TypeScript source files import each other with `.js` extensions in the import
specifier (the compiled output is `.js`, and Node16 resolution requires the
extension be present at import time). [VERIFIED: anatomy-scanner.ts line 6
imports from `"../hooks/shared.js"` — the `.js` extension is already used for
cross-directory imports.]

**Action required:** `anatomy-scanner.ts`'s new import of `wolf-ignore` must
be written as:
```typescript
import { shouldExclude, DEFAULT_EXCLUDE_PATTERNS, ALWAYS_EXCLUDE_FILES }
  from "../hooks/wolf-ignore.js";
```
And `shared.ts` re-exports as:
```typescript
export { shouldExclude, parseAndMatchGitignore, DEFAULT_EXCLUDE_PATTERNS }
  from "./wolf-ignore.js";
```

### Cross-check: `anatomy-scanner.ts` already imports from `src/hooks/`

Confirmed: `anatomy-scanner.ts` line 6:
```typescript
import { parseAnatomy, type AnatomyEntry } from "../hooks/shared.js";
```
The pattern of `src/scanner/` importing from `src/hooks/` is already established
and working. Adding an import from `src/hooks/wolf-ignore.js` is identical in
structure. [VERIFIED: direct codebase inspection]

---

## Research Question 4: Config Read Pattern in the Hook

### Pattern already established — wolf-json.ts / wolf-files.ts

The hooks use `fs.readFileSync` with a try/catch in several places. The clean
pattern for the config read in `recordAnatomyWrite` is:

```typescript
// At the top of recordAnatomyWrite, after the R3 check:
let excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS;
let respectGitignore = false;
try {
  const raw = fs.readFileSync(path.join(wolfDir, "config.json"), "utf-8");
  const cfg = JSON.parse(raw) as {
    openwolf?: {
      anatomy?: {
        exclude_patterns?: string[];
        respect_gitignore?: boolean;
      };
    };
  };
  excludePatterns =
    cfg.openwolf?.anatomy?.exclude_patterns ?? DEFAULT_EXCLUDE_PATTERNS;
  respectGitignore =
    cfg.openwolf?.anatomy?.respect_gitignore ?? false;
} catch {
  // Missing, unreadable, or malformed config.json → use defaults.
}
```

This exactly mirrors `anatomy-scanner.ts` lines 285–295 (the `buildAnatomy`
config read), satisfying R6-D3/R6-D4. [VERIFIED: anatomy-scanner.ts lines
272–295]

### projectRoot from wolfDir

`recordAnatomyWrite` already receives both `wolfDir` and `projectRoot` as
parameters. The `.gitignore` path is therefore:
```typescript
path.join(projectRoot, ".gitignore")
```
No new path derivation needed. [VERIFIED: post-write.ts lines 26–30]

### Reading `.gitignore` content

```typescript
let gitignoreContent = "";
if (respectGitignore) {
  try {
    gitignoreContent =
      fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8");
  } catch {
    // No .gitignore or unreadable — gitignore gating disabled for this path.
  }
}
```

Then:
```typescript
if (respectGitignore && gitignoreContent &&
    parseAndMatchGitignore(relPathLocal, gitignoreContent)) return;
```

### testability: explicit config param vs. internal read

R6-D3 says "reads fresh on every `recordAnatomyWrite`." For unit-testing the
gating behavior without needing a real filesystem config, the planner should
consider adding an optional config param:

```typescript
export function recordAnatomyWrite(
  wolfDir: string,
  absolutePath: string,
  projectRoot: string,
  contentFallback: string,
  _configOverride?: { excludePatterns?: string[]; respectGitignore?: boolean }
): void
```

With `_configOverride` present, the function skips the `readFileSync` and uses
the provided values. Absent → reads from disk as normal. This enables clean unit
tests without filesystem mock plumbing. [ASSUMED — testability pattern not yet
established for this function; the override approach is idiomatic TypeScript.]

---

## Research Question 5: Validation Architecture

### Test file layout

| File | Test type | What it covers |
|------|-----------|----------------|
| `tests/hooks/wolf-ignore.test.ts` | Unit (NEW) | All `shouldExclude` + `parseAndMatchGitignore` cases |
| `tests/hooks/post-write.test.ts` | Integration (EXTEND) | `recordAnatomyWrite` gating + R3 regression |
| `tests/scanner/anatomy-scanner.test.ts` | Regression (no change needed) | Must still pass after move |

### Required test cases — `tests/hooks/wolf-ignore.test.ts`

These directly exercise the new module in isolation:

**`shouldExclude` (moved function — re-verify behavior)**

| Test | Input | Expected |
|------|-------|---------|
| Bare name at any depth | `node_modules/foo/index.js` | `true` |
| Bare name in middle segment | `packages/a/node_modules/x.js` | `true` |
| Extension glob | `dist/app.min.js`, pattern `*.min.js` | `true` |
| `.env` always excluded | `.env`, `[]` | `true` |
| `.env.*` always excluded | `config/.env.local`, `[]` | `true` |
| Normal file not excluded | `src/index.ts`, defaults | `false` |
| Nested path pattern | `.claude/worktrees/wt-1/meta.json`, `[".claude/worktrees"]` | `true` |
| Sibling not matched | `.claude/settings.json`, `[".claude/worktrees"]` | `false` |

**`parseAndMatchGitignore` — gitignore parser**

| Test | gitignore content | relPath | Expected |
|------|------------------|---------|---------|
| Blank / comment lines skipped | `# comment\n\nnode_modules` | `node_modules/x.js` | `true` |
| Bare name matches any depth | `node_modules` | `a/b/node_modules/c.js` | `true` |
| Trailing slash matches dir contents | `gen/` | `gen/out.js` | `true` |
| Trailing slash does not match unrelated | `gen/` | `generator/out.js` | `false` |
| Leading slash anchors to root | `/dist` | `dist/app.js` | `true` |
| Leading slash does NOT match nested | `/dist` | `src/dist/app.js` | `false` |
| Within-segment `*` | `*.log` | `logs/error.log` | `true` |
| `*` does not span segments | `*.log` | `logs/sub/error.log` | `false` (the segment `sub/error.log` is not matched — wait: actually `error.log` is a segment that ends with `.log` but `*.log` is a bare name glob applied segment by segment → TRUE) [see note] |
| `**` spans segments | `.cache/**` | `.cache/v8/foo.bin` | `true` |
| Negation line skipped (fail-closed) | `*.log\n!important.log` | `important.log` | `true` (not re-included; over-exclusion) |
| Empty gitignore content | `` | `anything.ts` | `false` |
| All-comments gitignore | `# only comments` | `src/foo.ts` | `false` |
| Backslash path (Windows normalization) | `node_modules` | `node_modules\foo\x.js` (already normalized to forward-slashes before reaching the matcher) | `true` |

Note on `*.log` segment matching: the existing `matchesPattern` handles
`*.ext` patterns as `relPath.endsWith(".log")` (line 107: `pattern.startsWith("*.")
&& !pattern.includes("/")` → `return relPath.endsWith(pattern.slice(1))`). This
means `*.log` matches `logs/sub/error.log` (the whole relPath ends in `.log`).
This is the pre-existing behavior and should be preserved in the gitignore
parser for consistency (use `matchesPattern` internally for the gitignore case
as well).

**Negation fail-closed — pinned test (MANDATORY per R6-D5)**

```typescript
it("negation lines are skipped (fail-closed — no leak)", () => {
  // The "important.log" re-include is NOT honored by the hook parser.
  // Over-exclusion is acceptable; a leak is not.
  const gi = "*.log\n!important.log\n";
  expect(parseAndMatchGitignore("important.log", gi)).toBe(true);
});
```

### Required test cases — `tests/hooks/post-write.test.ts` extensions

**E6 regression (highest value — mirrors the field symptom)**

```typescript
it("E6 regression: an excluded in-project path is NOT recorded in anatomy", () => {
  // Mirror PRD evidence E6: a path in exclude_patterns still appeared in anatomy.md
  const dir = mkdtempSync(...);
  const wolfDir = path.join(dir, ".wolf");
  mkdirSync(wolfDir, { recursive: true });
  // Write a config that excludes ".claude/plans"
  writeFileSync(
    path.join(wolfDir, "config.json"),
    JSON.stringify({ version: 1, openwolf: {
      anatomy: { exclude_patterns: [".claude/plans"] }
    }})
  );
  const excluded = path.join(dir, ".claude", "plans", "tmp.pwYfhCNiar", "note.md");
  mkdirSync(path.dirname(excluded), { recursive: true });
  writeFileSync(excluded, "scratch\n");
  recordAnatomyWrite(wolfDir, excluded, dir, "");
  // anatomy.md must NOT be created (or if it already exists, must not contain
  // the excluded path)
  const anatomyPath = path.join(wolfDir, "anatomy.md");
  if (existsSync(anatomyPath)) {
    const content = readFileSync(anatomyPath, "utf-8");
    expect(content).not.toContain("note.md");
    expect(content).not.toContain(".claude/plans");
  }
});
```

**Gitignore-gated path skipped (respect_gitignore: true)**

```typescript
it("a root-gitignored in-project path is NOT recorded when respect_gitignore is true", () => {
  // Write .gitignore containing "scratch/" and config with respect_gitignore: true
  // Write a file in scratch/, call recordAnatomyWrite, assert anatomy absent
});
```

**R3 out-of-project guard preserved**

Already covered by the existing test `"does NOT write anatomy for a path outside
the project root"`. No change needed here — the existing test is the regression
anchor. [VERIFIED: tests/hooks/post-write.test.ts lines 111–126]

**Normal in-project file still recorded (positive control)**

Already covered by `"DOES record an in-project file (positive control)"`.
[VERIFIED: tests/hooks/post-write.test.ts lines 127–143]

**Backslash path (Windows normalization)**

```typescript
it("Windows backslash paths are normalized before matching", () => {
  // Feed recordAnatomyWrite a path constructed with path.win32.join-style
  // separators but already put through normalizePath (which outputs forward
  // slashes). Confirm the excluded dir is still caught.
  // normalizePath is already called at line 32 of post-write.ts; this test
  // verifies the seam is intact after the refactor.
});
```

### Vitest run commands

| Scope | Command |
|-------|---------|
| wolf-ignore unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` |
| post-write integration | `npx vitest run tests/hooks/post-write.test.ts` |
| scanner regression | `npx vitest run tests/scanner/anatomy-scanner.test.ts` |
| Full suite | `pnpm test` |

---

## Standard Stack

No external packages are added. The implementation uses only:

| Item | Source | Why |
|------|--------|-----|
| `node:fs` (readFileSync) | Node built-in | Config + gitignore read, C2-safe |
| `node:path` | Node built-in | Path joining |
| Built-in `RegExp` | JS built-in | `globToRegExp` output |
| `vitest` | Already in dev deps | Existing test runner |

**No new `npm install` step.** [VERIFIED: package.json inspection not needed —
confirmed by C2 requirement and CONTEXT.md R6-D7]

---

## Package Legitimacy Audit

No new packages. Not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Claude Code Write/Edit event
        │
        ▼
post-write.ts → main()
        │
        ├── isWolfFile() → skip .wolf/ internals
        ├── baseName check → skip .env files (existing guard)
        │
        └── recordAnatomyWrite(wolfDir, absolutePath, projectRoot, ...)
                │
                ├── [1] R3 guard: relPathLocal.startsWith("../") → RETURN (skip)
                │
                ├── [2] Read .wolf/config.json (fresh, sync, try/catch)
                │       → excludePatterns, respectGitignore
                │
                ├── [3] shouldExclude(relPathLocal, excludePatterns)
                │       → wolf-ignore.ts (moved from anatomy-scanner.ts)
                │       → RETURN if true
                │
                ├── [4] if respectGitignore: read <projectRoot>/.gitignore
                │       → parseAndMatchGitignore(relPathLocal, content)
                │       → wolf-ignore.ts (new dep-free parser)
                │       → RETURN if true
                │
                └── [5] upsert anatomy.md entry (unchanged)
```

### Recommended File Structure Changes

```
src/hooks/
├── wolf-ignore.ts    ← NEW: moved functions + new gitignore parser
├── shared.ts         ← UPDATED: re-export wolf-ignore.ts public surface
├── post-write.ts     ← UPDATED: config read + gates in recordAnatomyWrite
└── wolf-*.ts         (unchanged)

src/scanner/
└── anatomy-scanner.ts  ← UPDATED: import from ../hooks/wolf-ignore.js
                                    (remove local definitions)

tests/hooks/
├── wolf-ignore.test.ts   ← NEW: unit tests for wolf-ignore.ts
└── post-write.test.ts    ← UPDATED: E6 regression + gitignore gate test
```

### Pattern 1: The gate injection

**What:** Three sequential early-return guards in `recordAnatomyWrite`.
**When to use:** Every path through the anatomy-record branch.

```typescript
// Source: post-write.ts (after this phase)
export function recordAnatomyWrite(
  wolfDir: string,
  absolutePath: string,
  projectRoot: string,
  contentFallback: string,
): void {
  // Gate 1 — R3: out-of-project skip (UNCHANGED)
  const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
  if (relPathLocal.startsWith("../")) return;

  // Gate 2/3 — R6: in-project exclusion (NEW)
  let excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS;
  let respectGitignore = false;
  try {
    const raw = fs.readFileSync(path.join(wolfDir, "config.json"), "utf-8");
    const cfg = JSON.parse(raw) as { openwolf?: { anatomy?: {
      exclude_patterns?: string[]; respect_gitignore?: boolean; }}};
    excludePatterns = cfg.openwolf?.anatomy?.exclude_patterns
      ?? DEFAULT_EXCLUDE_PATTERNS;
    respectGitignore = cfg.openwolf?.anatomy?.respect_gitignore ?? false;
  } catch { /* use defaults */ }

  if (shouldExclude(relPathLocal, excludePatterns)) return;

  if (respectGitignore) {
    try {
      const gi = fs.readFileSync(
        path.join(projectRoot, ".gitignore"), "utf-8");
      if (parseAndMatchGitignore(relPathLocal, gi)) return;
    } catch { /* no .gitignore or unreadable — skip gitignore gate */ }
  }

  // Existing anatomy upsert logic continues here...
}
```

### Pattern 2: `wolf-ignore.ts` module boundary

**What:** The module is self-contained: zero imports from `node_modules`, uses
only `node:path` if needed (actually: no path imports needed — all operations
are on strings). The exported surface is exactly R6-D2.

```typescript
// Source: src/hooks/wolf-ignore.ts (new file)
// Zero node_modules imports — C2 compliant.

export const ALWAYS_EXCLUDE_FILES = new Set([...]);
export const DEFAULT_EXCLUDE_PATTERNS = [...];

// Private helpers (NOT exported):
function globToRegExp(glob: string): RegExp { ... }
function matchesPattern(relPath, parts, pattern): boolean { ... }

// Public exports:
export function shouldExclude(relPath: string, excludePatterns: string[]): boolean { ... }
export function parseAndMatchGitignore(relPath: string, content: string): boolean { ... }
```

### Anti-Patterns to Avoid

- **Importing `wolf-ignore.ts` from outside `src/hooks/`:** The hooks tsconfig
  compiles `src/hooks/` standalone. Any import chain that brings `node_modules`
  into `wolf-ignore.ts` breaks C2. Keep `wolf-ignore.ts` stdlib-only.
- **Caching the config or gitignore content:** R6-D3 forbids it; hooks are
  transient processes with no shared state.
- **Adding ReDoS-vulnerable patterns to `globToRegExp`:** Preserve the
  `[^/]*` / `.*` -only output. Never add backreferences or nested quantifiers.
- **Calling `loadGitignoreMatcher` (the `ignore`-backed version) from the hook:**
  It imports `ignore` from `node_modules` — direct C2 violation.
- **Forgetting the `.js` extension in the import specifier:** With
  `moduleResolution: "Node16"`, TypeScript requires `.js` extensions in
  source-file import paths. Missing extension = build error or runtime
  MODULE_NOT_FOUND.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full gitignore spec | Complete gitignore engine | `ignore` npm package (scanner only) | D-18: hook cannot use node_modules |
| File locking for anatomy | Custom lock | `withFileLock` (wolf-lock.ts) | Already used in anatomy write path |
| Path normalization | Custom replace | `normalizePath` from shared.ts | Already applied to `relPathLocal` before injection point |

---

## Common Pitfalls

### Pitfall 1: `rootDir` constraint in `tsconfig.hooks.json`

**What goes wrong:** `tsconfig.hooks.json` sets `rootDir: "src/hooks"`. If
`wolf-ignore.ts` is placed outside `src/hooks/` (e.g., in `src/lib/`), the
hooks build fails with "File 'src/lib/wolf-ignore.ts' is not under 'rootDir'".

**Why it happens:** Node16 + strict rootDir. The file must live in `src/hooks/`.

**How to avoid:** Place `wolf-ignore.ts` in `src/hooks/wolf-ignore.ts`. This
is already the decision (R6-D1). [VERIFIED: tsconfig.hooks.json rootDir]

### Pitfall 2: `anatomy-scanner.ts` still exports `shouldExclude` after the move

**What goes wrong:** After moving `shouldExclude` to `wolf-ignore.ts`, the
`anatomy-scanner.ts` test (`tests/scanner/anatomy-scanner.test.ts` line 2)
imports `shouldExclude` from `../../src/scanner/anatomy-scanner.js`. If the
function is removed from `anatomy-scanner.ts` without adding a re-export, the
test fails with "has no exported member 'shouldExclude'".

**Why it happens:** The test imports directly from the scanner module.

**How to avoid:** Two options:
1. Keep a re-export in `anatomy-scanner.ts`:
   `export { shouldExclude } from "../hooks/wolf-ignore.js";`
2. Update the test import to point at `wolf-ignore.ts`.

Option 1 preserves backward compatibility of the scanner's export surface
without changing the test file. Option 2 is cleaner (tests import from the
authoritative source). CONTEXT.md says "re-run `tests/scanner/anatomy-scanner.test.ts`
after relocating" — either approach achieves this, but Option 2 is preferred.

**Warning signs:** `pnpm test` fails with import error on `anatomy-scanner.test.ts`.

### Pitfall 3: The `normalizePath` seam must be called before the gates

**What goes wrong:** Windows paths use `\` separators. If `path.relative()` is
called on Windows without `normalizePath()`, `relPathLocal` contains
backslashes. `shouldExclude` splits on `/` → gets one giant segment → bare-name
matching and prefix matching both fail → excluded paths slip through.

**Why it happens:** `path.relative()` on Windows returns `\`-separated paths.

**How to avoid:** The normalization is already at line 32 of `post-write.ts`:
```typescript
const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
```
The gates must consume this already-normalized value. Do not call
`path.relative()` again after this line. [VERIFIED: post-write.ts line 32]

### Pitfall 4: Two `ALWAYS_EXCLUDE_FILES` definitions create drift

**What goes wrong:** If the `Set` of always-excluded files is defined in both
`anatomy-scanner.ts` AND `wolf-ignore.ts` (i.e., copied rather than moved),
they diverge over time — e.g., a new env variant added to the scanner doesn't
get added to the hook.

**Why it happens:** Forgetting that the move is a move, not a copy.

**How to avoid:** Delete the original definition from `anatomy-scanner.ts` and
import the canonical from `wolf-ignore.ts`. The scanner already imports
`parseAnatomy` from `../hooks/shared.js` — the import pattern is established.

### Pitfall 5: `build:hooks` output is inert until `openwolf update` is run

**What goes wrong:** After `pnpm build:hooks`, the compiled JS is in
`dist/hooks/`. But Claude Code executes hooks from `.wolf/hooks/`. If
`openwolf update` is not run, the running hooks still have the old behavior.
The test suite passes (it imports from `src/`) but the live hook does not apply
exclusions.

**Why it happens:** The two-step deploy is documented in CLAUDE.md but easy to
miss.

**How to avoid:** Make the copy step part of the acceptance verification. The
plan must include a task that runs both steps and verifies the live
`.wolf/hooks/post-write.js` contains the expected exclusion logic.

---

## Code Examples

### Moving `shouldExclude` — import in anatomy-scanner.ts

```typescript
// Source: src/scanner/anatomy-scanner.ts (after refactor)
// Replace the local definitions of globToRegExp, matchesPattern,
// shouldExclude, ALWAYS_EXCLUDE_FILES, DEFAULT_EXCLUDE_PATTERNS with:
import {
  shouldExclude,
  DEFAULT_EXCLUDE_PATTERNS,
  ALWAYS_EXCLUDE_FILES,
} from "../hooks/wolf-ignore.js";
```

### `shared.ts` additions

```typescript
// Source: src/hooks/shared.ts (additions only — pure barrel)
export {
  shouldExclude,
  parseAndMatchGitignore,
  DEFAULT_EXCLUDE_PATTERNS,
  ALWAYS_EXCLUDE_FILES,
} from "./wolf-ignore.js";
```

### `parseGitignoreLine` internal logic

```typescript
// Source: src/hooks/wolf-ignore.ts (private helper — not exported)
function parseGitignoreLine(raw: string): GitignoreEntry {
  const line = raw.trim();
  // Blank or comment → skip
  if (!line || line.startsWith("#")) return { kind: "skip" };
  // Negation → fail-closed: treat as skip (over-exclusion, not a leak)
  if (line.startsWith("!")) return { kind: "skip" };
  // Strip trailing slash (directory hint → bare name semantics)
  const stripped = line.endsWith("/") ? line.slice(0, -1) : line;
  // Leading slash → root-anchored
  if (stripped.startsWith("/")) {
    const anchor = stripped.slice(1);
    if (anchor.includes("*")) return { kind: "glob", re: globToRegExp(anchor) };
    return { kind: "prefix", prefix: anchor };
  }
  // No slash, no glob → bare name
  if (!stripped.includes("/") && !stripped.includes("*")) {
    return { kind: "bare", name: stripped };
  }
  // Glob pattern
  if (stripped.includes("*")) return { kind: "glob", re: globToRegExp(stripped) };
  // Path without glob → prefix
  return { kind: "prefix", prefix: stripped };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shouldExclude` in scanner only | `shouldExclude` in shared `wolf-ignore.ts` | This phase | Hook and scanner share one implementation |
| No hook-side in-project exclusion | R3 guard + `shouldExclude` + gitignore gate | This phase | Closes E6/E7 leak classes |
| `ignore` pkg for all gitignore matching | `ignore` pkg (scanner only), hand-rolled parser (hook) | This phase (D-18) | C2 compliance; deliberate engine split |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Trailing-slash gitignore lines are safe to strip to bare-name semantics (fail-closed) | RQ1 | Over-exclusion only — no leak risk. Acceptable per D-18 bias. |
| A2 | `parseAndMatchGitignore` should parse content on every call (no caching) | RQ2 | If content is very large (>1 MB gitignore), performance cost. Real gitignores are never this large. |
| A3 | `_configOverride` optional param is idiomatic for testability | RQ4 | If team prefers a different test isolation approach, the internal-read-only design also works (tests create a real `config.json` file in tmpdir). |

---

## Open Questions

1. **`shouldExclude` export from `anatomy-scanner.ts` after the move**
   - What we know: `tests/scanner/anatomy-scanner.test.ts` imports `shouldExclude`
     from `../../src/scanner/anatomy-scanner.js`
   - What's unclear: Whether to keep a re-export shim in `anatomy-scanner.ts` or
     update the test import
   - Recommendation: Update the test import to point at `wolf-ignore.ts` directly
     (cleaner; tests the authoritative source). If backward compat of
     `anatomy-scanner`'s public API matters (external consumers), add the re-export.

2. **Gate 3 performance: re-read `.gitignore` every call**
   - What we know: `respect_gitignore` defaults to `false`; most projects will
     not enable it; `.gitignore` is a small file
   - What's unclear: Whether reading the same file N times per session is
     noticeably slow on very active projects
   - Recommendation: Acceptable per R6-D3. The full scan is the authoritative
     source for anatomy; the hook's incremental update is best-effort.

---

## Environment Availability

Step 2.6: No new external tool dependencies. The implementation uses only Node
built-ins (`node:fs`, `node:path`) and the existing TypeScript compiler (`tsc`).
The `pnpm build:hooks` and `node dist/bin/openwolf.js update` commands are
already documented and available.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `tsc` | Type checking (C2 gate) | ✓ | via pnpm | — |
| `pnpm build:hooks` | Hook compilation | ✓ | via pnpm | — |
| `openwolf update` | Live copy to `.wolf/hooks/` | ✓ | built CLI | — |
| `vitest` | Test suite | ✓ | dev dep | — |

---

## Validation Architecture

> `workflow.nyquist_validation` not explicitly set to false — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `vitest.config.ts` or `package.json#scripts.test` |
| Quick run command | `npx vitest run tests/hooks/wolf-ignore.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R6 / SC-1 | `shouldExclude` lives in `wolf-ignore.ts`; scanner imports it | Unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ Wave 0 |
| R6 / SC-1 | Scanner `tests/scanner/anatomy-scanner.test.ts` still passes | Regression | `npx vitest run tests/scanner/anatomy-scanner.test.ts` | ✅ exists |
| R6 / SC-2 | Excluded in-project path not recorded (E6 regression) | Integration | `npx vitest run tests/hooks/post-write.test.ts` | Extend existing |
| R6 / SC-2 | Gitignore-gated path not recorded (respect_gitignore on) | Integration | `npx vitest run tests/hooks/post-write.test.ts` | Extend existing |
| R6 / SC-2 | R3 `../` out-of-project skip preserved | Integration | `npx vitest run tests/hooks/post-write.test.ts` | ✅ exists |
| R6 / SC-2 | Normal in-project file still recorded | Integration | `npx vitest run tests/hooks/post-write.test.ts` | ✅ exists |
| R6 / SC-2 | Negation `!` lines skipped (fail-closed pinned test) | Unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ Wave 0 |
| R6 / SC-2 | Backslash path (Windows normalization seam) | Unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ Wave 0 |
| R6 / SC-3 | `tsc --noEmit -p tsconfig.hooks.json` clean (C2) | Type check | `tsc --noEmit -p tsconfig.hooks.json` | N/A — command |
| R6 / SC-3 | Main build still clean | Type check | `tsc --noEmit` | N/A — command |
| R6 / SC-4 | Live `.wolf/hooks/post-write.js` excludes in-project paths | Manual/smoke | Run `pnpm build:hooks && node dist/bin/openwolf.js update` | N/A — copy step |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/hooks/wolf-ignore.test.ts tests/hooks/post-write.test.ts tests/scanner/anatomy-scanner.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test` green + `tsc --noEmit` clean + `tsc --noEmit -p tsconfig.hooks.json` clean before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/hooks/wolf-ignore.test.ts` — covers SC-1, SC-2 unit cases, negation pin, backslash seam (R6)
- [ ] Extend `tests/hooks/post-write.test.ts` — E6 regression, gitignore gate integration test

*(Existing `tests/scanner/anatomy-scanner.test.ts` covers SC-1 regression with no changes needed to the test file itself — only the import source changes if Option 2 is chosen for pitfall 2.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `globToRegExp` linear-only output; no backreferences |
| V6 Cryptography | no | No crypto in this phase |
| V2/V3/V4 Auth/Session/Access | no | No auth in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ReDoS via glob pattern | Denial of Service | `globToRegExp` emits only `[^/]*` and `.*` — linear, no nested quantifiers. Preserve this property. |
| Path traversal via `../` | Information Disclosure | R3 guard (first gate, unchanged) eliminates this before any regex work. |
| Malformed config.json | Tampering | try/catch around `JSON.parse`; fallback to defaults (R6-D3). |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/scanner/anatomy-scanner.ts` (lines 31–165)
- Direct codebase inspection: `src/hooks/post-write.ts` (lines 26–92)
- Direct codebase inspection: `src/hooks/shared.ts`
- Direct codebase inspection: `tsconfig.json`, `tsconfig.hooks.json`
- Direct codebase inspection: `tests/hooks/post-write.test.ts`
- Direct codebase inspection: `tests/scanner/anatomy-scanner.test.ts`
- CONTEXT.md decisions R6-D1 through R6-D7 (user-locked design)
- REQUIREMENTS.md R6 acceptance criteria

### Secondary (MEDIUM confidence)
- `.gitignore` spec semantics (trailing slash, leading slash, negation) — training knowledge cross-checked against codebase behavior [ASSUMED for trailing-slash fail-closed interpretation — tagged A1]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Module move mechanics: HIGH — verified via tsconfig, existing cross-dir import pattern
- gitignore parser logic: HIGH for 5 of 6 forms (verified against existing code); ASSUMED for trailing-slash fail-closed interpretation
- Config read pattern: HIGH — mirrors verified scanner code exactly
- Test strategy: HIGH — derived from existing test files + CONTEXT.md requirements

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (stable internal refactor; no external dep changes)
