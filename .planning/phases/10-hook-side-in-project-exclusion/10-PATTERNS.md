# Phase 10: Hook-Side In-Project Exclusion — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 6 (2 new, 4 modified)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/hooks/wolf-ignore.ts` (NEW) | utility/module | transform | `src/hooks/wolf-misc.ts` (shape) + `src/scanner/anatomy-scanner.ts` L31–150 (logic source) | exact (move) |
| `src/scanner/anatomy-scanner.ts` (MODIFY) | service | batch | itself — remove defs, add import | self-analog |
| `src/hooks/shared.ts` (MODIFY) | barrel | — | itself — existing re-export lines | self-analog |
| `src/hooks/post-write.ts` (MODIFY) | hook | request-response | itself L26–33 + scanner L272–295 for config pattern | self + role-match |
| `tests/hooks/wolf-ignore.test.ts` (NEW) | test | — | `tests/scanner/anatomy-scanner.test.ts` | exact |
| `tests/hooks/post-write.test.ts` (MODIFY) | test | — | itself L111–143 | self-analog |

---

## Pattern Assignments

### `src/hooks/wolf-ignore.ts` (NEW — utility, transform)

**Logic source (MOVE FROM):** `src/scanner/anatomy-scanner.ts` lines 31–150
**Module shape analog:** `src/hooks/wolf-misc.ts` (zero-import, pure-exports structure)

**Module shape to copy** (`src/hooks/wolf-misc.ts` lines 1–24 — no file-level imports, pure named exports):
```typescript
// wolf-misc.ts — zero imports, plain named exports
export function estimateTokens(...): number { ... }
export function timestamp(): string { ... }
export function timeShort(): string { ... }
export function readStdin(): Promise<string> { ... }
```

**Constants to move** (`src/scanner/anatomy-scanner.ts` lines 31–36, 59):
```typescript
// anatomy-scanner.ts — source of truth to MOVE (delete here, define in wolf-ignore.ts)
const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules", ".git", "dist", "build", ".wolf",
  ".next", ".nuxt", "coverage", "__pycache__", ".cache",
  "target", ".vscode", ".idea", ".turbo", ".vercel",
  ".netlify", ".output", "*.min.js", "*.min.css",
];
const ALWAYS_EXCLUDE_FILES = new Set([".env", ".env.local", ".env.production", ".env.staging", ".env.development"]);
```

**`globToRegExp` to move** (`src/scanner/anatomy-scanner.ts` lines 66–84, kept PRIVATE):
```typescript
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; }
      else { re += "[^/]*"; }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
```

**`matchesPattern` to move** (`src/scanner/anatomy-scanner.ts` lines 98–131, kept PRIVATE):
```typescript
function matchesPattern(relPath: string, parts: string[], pattern: string): boolean {
  if (pattern.length === 0) return false;
  if (pattern.startsWith("*.") && !pattern.includes("/")) return relPath.endsWith(pattern.slice(1));
  const hasSlash = pattern.includes("/");
  const hasGlob = pattern.includes("*");
  if (!hasSlash && !hasGlob) return parts.includes(pattern);
  if (hasSlash) {
    if (!hasGlob) return relPath === pattern || relPath.startsWith(`${pattern}/`);
    return globToRegExp(pattern).test(relPath);
  }
  const segRe = globToRegExp(pattern);
  return parts.some((p) => segRe.test(p));
}
```

**`shouldExclude` to move** (`src/scanner/anatomy-scanner.ts` lines 134–150, EXPORTED):
```typescript
// anatomy-scanner.ts line 133 — export comment; preserve export in wolf-ignore.ts
export function shouldExclude(relPath: string, excludePatterns: string[]): boolean {
  const parts = relPath.split("/");
  const basename = parts[parts.length - 1];
  if (ALWAYS_EXCLUDE_FILES.has(basename)) return true;
  if (basename.startsWith(".env.") || basename === ".env") return true;
  for (const pattern of excludePatterns) {
    if (matchesPattern(relPath, parts, pattern)) return true;
  }
  return false;
}
```

**New `parseAndMatchGitignore` — net-new code** (no codebase analog; use RESEARCH.md design):
- Private `GitignoreEntry` discriminated union type
- Private `parseGitignoreLine(raw)` classifier (from RESEARCH.md lines 225–240)
- Public `parseAndMatchGitignore(relPath, content): boolean` — parse lines, match each entry
- Negation lines (`!`) → `{ kind: "skip" }` — fail-closed, pinned by mandatory test

**ESM import rule (C2):** `wolf-ignore.ts` must have ZERO `node_modules` imports.
Only `node:path` or `node:fs` if needed (the matcher functions need neither).
The `tsconfig.hooks.json` `rootDir: "src/hooks"` requires the file to live at
`src/hooks/wolf-ignore.ts` exactly.

---

### `src/scanner/anatomy-scanner.ts` (MODIFY — remove moved defs, add import)

**Analog:** itself — the existing cross-directory import at line 6 is the exact pattern to replicate:
```typescript
// anatomy-scanner.ts line 6 — EXISTING cross-dir import (verified working pattern)
import { parseAnatomy, type AnatomyEntry } from "../hooks/shared.js";
```

**New import to add** (replace the removed local definitions):
```typescript
// Replace lines 31–36, 59, 66–150 with this single import:
import {
  shouldExclude,
  DEFAULT_EXCLUDE_PATTERNS,
  ALWAYS_EXCLUDE_FILES,
} from "../hooks/wolf-ignore.js";
```

**Key:** use `.js` extension (Node16 moduleResolution — verified by the existing
`../hooks/shared.js` import at line 6). `loadGitignoreMatcher` (lines 157–165)
is NOT moved — stays in anatomy-scanner.ts unchanged (D-18: keep `ignore` dep
in CLI/daemon only).

---

### `src/hooks/shared.ts` (MODIFY — add re-exports)

**Analog:** itself — the entire file is the pattern. Each existing line follows
the same form:
```typescript
// shared.ts lines 14–28 — EXISTING barrel re-export pattern (every line follows this form)
export { getWolfDir, getSessionDir, getWorktreeContext, normalizePath } from "./wolf-paths.js";
export { ensureSessionDir, ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown, appendProposal } from "./wolf-files.js";
export { readJSON, writeJSON, updateJSON } from "./wolf-json.js";
export { withFileLock } from "./wolf-lock.js";
export { AnatomyEntry, parseAnatomy, serializeAnatomy } from "./wolf-anatomy.js";
export { extractDescription } from "./wolf-describe.js";
export { estimateTokens, timestamp, timeShort, readStdin } from "./wolf-misc.js";
export { appendBugEntry, readBugEntries, countBugEntries, newBugId, bugLogPath } from "./buglog-ndjson.js";
```

**Lines to append** (R6-D2: only public surface — NOT `globToRegExp`/`matchesPattern`):
```typescript
export {
  shouldExclude,
  parseAndMatchGitignore,
  DEFAULT_EXCLUDE_PATTERNS,
  ALWAYS_EXCLUDE_FILES,
} from "./wolf-ignore.js";
```

---

### `src/hooks/post-write.ts` (MODIFY — inject gates in `recordAnatomyWrite`)

**Analog for gate injection point:** itself lines 26–33 (the existing `recordAnatomyWrite`
function opening and R3 guard):
```typescript
// post-write.ts lines 26–33 — EXISTING function opening + R3 guard (UNCHANGED)
export function recordAnatomyWrite(
  wolfDir: string,
  absolutePath: string,
  projectRoot: string,
  contentFallback: string,
): void {
  const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
  if (relPathLocal.startsWith("../")) return;   // ← R3 guard stays FIRST, unchanged
  // ← INSERT new Gates 2/3 HERE (immediately after line 33)
```

**Analog for config read pattern:** `src/scanner/anatomy-scanner.ts` lines 272–295
(the `buildAnatomy` config read with `??` fallbacks). The hook cannot use
`readJSON` from `../utils/fs-safe.js` — it must use raw `fs.readFileSync` + `JSON.parse`
in a try/catch. Pattern verified in RESEARCH.md lines 345–363:
```typescript
// Copy this config-read block (from RESEARCH.md RQ4 — mirrors anatomy-scanner.ts L285–295)
let excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS;
let respectGitignore = false;
try {
  const raw = fs.readFileSync(path.join(wolfDir, "config.json"), "utf-8");
  const cfg = JSON.parse(raw) as {
    openwolf?: { anatomy?: { exclude_patterns?: string[]; respect_gitignore?: boolean; } };
  };
  excludePatterns = cfg.openwolf?.anatomy?.exclude_patterns ?? DEFAULT_EXCLUDE_PATTERNS;
  respectGitignore = cfg.openwolf?.anatomy?.respect_gitignore ?? false;
} catch { /* missing/unreadable/malformed → use defaults */ }
```

**Gate 2 + Gate 3 calls (after config read block):**
```typescript
if (shouldExclude(relPathLocal, excludePatterns)) return;

if (respectGitignore) {
  try {
    const gi = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8");
    if (parseAndMatchGitignore(relPathLocal, gi)) return;
  } catch { /* no .gitignore or unreadable — skip gitignore gate */ }
}
// ... existing anatomy upsert continues unchanged at line 35
```

**New imports to add to top of post-write.ts** (alongside existing `from "./shared.js"`):
```typescript
// post-write.ts lines 4–8 — EXISTING import (add shouldExclude/parseAndMatchGitignore/DEFAULT_EXCLUDE_PATTERNS)
import {
  getWolfDir, ensureWolfDir, getSessionDir, updateJSON, readMarkdown, parseAnatomy, serializeAnatomy,
  extractDescription, estimateTokens, appendMarkdown, timeShort, timestamp, readStdin, normalizePath, isWolfFile,
  appendBugEntry, newBugId,
  shouldExclude, parseAndMatchGitignore, DEFAULT_EXCLUDE_PATTERNS,   // ← add these three
} from "./shared.js";
```

---

### `tests/hooks/wolf-ignore.test.ts` (NEW — unit test)

**Analog:** `tests/scanner/anatomy-scanner.test.ts` lines 1–30 (imports, describe structure):
```typescript
// anatomy-scanner.test.ts lines 1–9 — import pattern to copy
import { describe, it, expect } from "vitest";
import { shouldExclude, buildAnatomy } from "../../src/scanner/anatomy-scanner.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

const DEFAULTS = ["node_modules", ".git", ".wolf", "*.min.js"];

describe("shouldExclude", () => {
  describe("backward-compatible behavior", () => {
    it("excludes bare directory names at any depth", () => {
      expect(shouldExclude("node_modules/foo/index.js", DEFAULTS)).toBe(true);
```

**For this new file** — change the import to point at `wolf-ignore.js`:
```typescript
import { shouldExclude, parseAndMatchGitignore, DEFAULT_EXCLUDE_PATTERNS }
  from "../../src/hooks/wolf-ignore.js";
```

No filesystem setup needed for the `shouldExclude` and `parseAndMatchGitignore`
unit tests — they are pure string functions. Only the E6/gitignore integration
tests (in `post-write.test.ts`) need tmpdir setup.

**Mandatory pinned test (R6-D5):**
```typescript
it("negation lines are skipped (fail-closed — no leak)", () => {
  const gi = "*.log\n!important.log\n";
  expect(parseAndMatchGitignore("important.log", gi)).toBe(true);
});
```

---

### `tests/hooks/post-write.test.ts` (MODIFY — extend with E6/gitignore/backslash cases)

**Analog for new tests:** its own existing R3 block at lines 111–143 — use the
same tmpdir setup / wolfDir scaffold / `recordAnatomyWrite` call structure:
```typescript
// post-write.test.ts lines 111–125 — R3 out-of-project test (EXISTING — copy structure for new tests)
describe("recordAnatomyWrite — out-of-project guard (R3)", () => {
  it("does NOT write anatomy for a path outside the project root", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-oop-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      const outside = path.join(tmpdir(), "ow-scratch-zzz", "note.md");
      recordAnatomyWrite(wolfDir, outside, dir, "# scratch\n");
      expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

```typescript
// post-write.test.ts lines 127–143 — positive control (EXISTING — mirror for "file IS recorded" assertions)
  it("DOES record an in-project file (positive control)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-ip-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      const inProject = path.join(dir, "src", "foo.ts");
      mkdirSync(path.dirname(inProject), { recursive: true });
      writeFileSync(inProject, "export const x = 1;\n");
      recordAnatomyWrite(wolfDir, inProject, dir, "");
      const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
      expect(anatomy).toContain("foo.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

**E6 regression test to add** — write `config.json` with `exclude_patterns`,
write a file under the excluded path, call `recordAnatomyWrite`, assert anatomy
does not contain that file. Same tmpdir scaffold as above.

**Gitignore-gate test to add** — write `config.json` with `respect_gitignore: true`,
write `.gitignore` at project root containing `scratch/`, write a file under
`scratch/`, assert anatomy absent.

**Backslash seam test** — `normalizePath` is already applied at line 32 of
`post-write.ts`; the test verifies a Windows-style path constructed with
`path.win32.join` and then passed through `normalizePath` is still caught by the
exclude gate.

---

### `tests/scanner/anatomy-scanner.test.ts` (POSSIBLY MODIFY — import fixup)

**Current import (line 2):**
```typescript
import { shouldExclude, buildAnatomy } from "../../src/scanner/anatomy-scanner.js";
```

**After the move, this import breaks** unless anatomy-scanner.ts re-exports
`shouldExclude`. Preferred fix (RESEARCH.md Pitfall 2, Option 2): update the
import to point at the authoritative source:
```typescript
import { shouldExclude } from "../../src/hooks/wolf-ignore.js";
import { buildAnatomy } from "../../src/scanner/anatomy-scanner.js";
```

This is the only change needed to this file — the test bodies are unchanged.

---

## Shared Patterns

### ESM `.js` Extension Requirement
**Source:** `src/scanner/anatomy-scanner.ts` line 6 (verified working cross-dir import)
**Apply to:** Every new import specifier added in this phase
```typescript
// Correct — Node16 moduleResolution requires .js extension in specifier
import { parseAnatomy } from "../hooks/shared.js";   // ← existing, verified
import { shouldExclude } from "../hooks/wolf-ignore.js";   // ← new, same pattern
```

### Hook `fs.readFileSync` + try/catch (fail-safe reads)
**Source:** `src/hooks/post-write.ts` lines 37–41 and lines 82–90 (anatomy read + write)
**Apply to:** config read and `.gitignore` read in `recordAnatomyWrite`
```typescript
// post-write.ts lines 37–41 — EXISTING try/catch read pattern in a hook
try {
  anatomyContent = fs.readFileSync(anatomyPath, "utf-8");
} catch {
  anatomyContent = "# anatomy.md\n\n> Auto-maintained by OpenWolf.";
}
```

### `?? false` / `?? DEFAULT` Fallback Shape
**Source:** `src/scanner/anatomy-scanner.ts` lines 287, 294
**Apply to:** config read in `recordAnatomyWrite`
```typescript
// anatomy-scanner.ts lines 285–295 — config ?? fallback pattern (MIRROR EXACTLY per R6-D3/D4)
const ig = loadGitignoreMatcher(projectRoot, config.openwolf?.anatomy?.respect_gitignore ?? false);
// ...
config.openwolf?.anatomy?.exclude_patterns ?? DEFAULT_EXCLUDE_PATTERNS,
```

### Zero `node_modules` in Hook Modules (C2)
**Source:** All existing `src/hooks/wolf-*.ts` files — none import from `node_modules`
**Apply to:** `src/hooks/wolf-ignore.ts` (enforced by `tsconfig.hooks.json` compile check)
The `import ignore from "ignore"` that STAYS in `anatomy-scanner.ts` is the
deliberate boundary marker — that line must never appear in `wolf-ignore.ts`.

---

## No Analog Found

All files have analogs. No entries here.

---

## Metadata

**Analog search scope:** `src/hooks/`, `src/scanner/`, `tests/hooks/`, `tests/scanner/`
**Files read:** 8
**Pattern extraction date:** 2026-06-25
