---
phase: pr-review
fixed_at: 2026-05-14T00:00:00Z
review_path: PR #5 comments (inline)
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# PR #5: Code Review Fix Report

**Fixed at:** 2026-05-14
**Source review:** PR #5 comments — `port/pr-26-fix/safe-config-access`
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Truncated `exclude_patterns` fallback in `anatomy-scanner.ts`

**Files modified:** `src/scanner/anatomy-scanner.ts`
**Commit:** `cfbc2c8`
**Applied fix:** Added `DEFAULT_EXCLUDE_PATTERNS` constant with all 19 patterns from
`src/templates/config.json` (was missing 14: `.next`, `.nuxt`, `coverage`,
`__pycache__`, `.cache`, `target`, `.vscode`, `.idea`, `.turbo`, `.vercel`,
`.netlify`, `.output`, `*.min.js`, `*.min.css`). Added `DEFAULT_MAX_FILES = 500`
constant. Both the `readJSON` fallback and the `??` expression now reference these
constants, eliminating the duplicate inline lists.

---

### WR-01: `WolfConfig` interfaces not updated to match optional-access reality

**Files modified:** `src/daemon/wolf-daemon.ts`, `src/cli/dashboard.ts`, `src/cli/cron-cmd.ts`
**Commit:** `0a43735`
**Applied fix:** All nested `WolfConfig` fields marked optional (`?:`) in all three
files. TypeScript will now emit errors if any future code accesses these fields
without `?.` or `??`, preventing recurrence of the partial-config crash this PR
addresses. `anatomy-scanner.ts` was handled in the CR-01/WR-02 commit.

---

### WR-02: Duplicate fallback values — two sources of truth for defaults

**Files modified:** `src/scanner/anatomy-scanner.ts`
**Commit:** `cfbc2c8`
**Applied fix:** Resolved as part of CR-01. The `DEFAULT_EXCLUDE_PATTERNS` and
`DEFAULT_MAX_FILES` constants are now the single source of truth for both the
`readJSON` file-missing fallback and the `??` key-absent fallback.

---

### WR-03: `cron.enabled ?? true` silently enables cron when key is absent

**Files modified:** `src/daemon/wolf-daemon.ts`
**Commit:** `0a43735`
**Applied fix:** Added inline comment above the guard:
`// Default to enabled if key is absent (matches template default)`
The behavior is unchanged — enabling cron by default is correct per the template —
but the intent is now explicit for future readers.

---

_Fixed: 2026-05-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
