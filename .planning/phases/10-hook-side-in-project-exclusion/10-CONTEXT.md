# Phase 10: Hook-Side In-Project Exclusion - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Assumptions-mode discussion (`/gsd-discuss-phase 10 --assumptions`, 2026-06-25). No interactive CONTEXT intake was run; the decisions below were resolved in that discussion (user-locked items are marked) and transcribed here so the planner consumes them rather than re-deriving.

<domain>
## Phase Boundary

Close the **in-project** anatomy leak that the R3 `../` guard structurally cannot catch: a developer-excluded (`exclude_patterns`) **or** root-`.gitignore`-ignored directory that lives *inside* the project root must never be recorded into `anatomy.md` by the post-write hook. Today the hook applies the R3 out-of-project skip and nothing else (PRD evidence E6 — a path in `config.json` `exclude_patterns` still appeared in the committed map; E7 — `/tmp` scratch scanned in). The scanner already honors excludes + opt-in gitignore; the **hook** does not.

**In scope:**
- Promote the scanner's pure matcher into one shared **zero-dependency** module consumed by both hook and scanner (kills copy-drift).
- Add a dependency-free **root `.gitignore`** parser usable from the hook (the scanner's `ignore` npm package is not importable under the hook build — C2).
- Apply both `exclude_patterns` and (opt-in) root `.gitignore` inside `recordAnatomyWrite`, **after** the R3 `../` guard.
- Exercise the `build:hooks` → `openwolf update` copy step so the behavior is live in `.wolf/hooks/`.

**Out of scope:**
- Removing the `ignore` dependency from the scanner — explicitly KEPT as the authoritative full-scan backstop (D-18).
- Nested `.gitignore` files, global/`core.excludesFile`, `.git/info/exclude` — root `.gitignore` only (matches the scanner's documented scope).
- Other `post-write.ts` side effects (buglog gating, edit tracking) beyond the anatomy-record path.
- Re-verifying R3 / R5 — that is Phase 8's deliverable; R6 builds on it.

</domain>

<decisions>
## Implementation Decisions

### R6-D1: One shared dep-free matcher module (move, don't copy)
Promote `globToRegExp`, `matchesPattern`, `shouldExclude` **and their supporting constants** (`ALWAYS_EXCLUDE_FILES`, the `.env` / `.env.*` guard, `DEFAULT_EXCLUDE_PATTERNS`) **out of** `src/scanner/anatomy-scanner.ts` **into** a new self-contained, zero-dependency module `src/hooks/wolf-ignore.ts`. The scanner then *imports them back* — there is exactly one definition, so hook and scanner can never drift. Re-export the public surface via the `src/hooks/shared.ts` barrel. This realizes ROADMAP success criterion 1 and the D-18 engine split.

### R6-D2: Export surface — high-level only (USER-LOCKED)
`shared.ts` re-exports **only** the clean matching interface plus the structural constants:
1. `shouldExclude(relPath, excludePatterns)`
2. the new root-`.gitignore` predicate (working name `parseAndMatchGitignore` — final name at Claude's discretion)
3. the re-imported constants (`ALWAYS_EXCLUDE_FILES`, etc.)

`globToRegExp` and `matchesPattern` stay **private** to `wolf-ignore.ts` — do not pollute the shared barrel with low-level path/regex utilities.

### R6-D3: Config read — fresh per invocation, no caching (USER-LOCKED)
The hook reads `.wolf/config.json` **fresh on every `recordAnatomyWrite`** via synchronous `fs.readFileSync`, using the self-contained path/fs already available in the hook (hooks cannot import `src/utils/`). No in-memory caching — Claude Code hooks are short-lived transient processes with no shared long-lived memory, and `config.json` is sub-kilobyte so a sync read is negligible. Parse `openwolf.anatomy.exclude_patterns` (fallback `DEFAULT_EXCLUDE_PATTERNS`) and `openwolf.anatomy.respect_gitignore` (fallback `false`). A missing/unreadable/malformed `config.json` must not throw — fall back to defaults and still record the file.

### R6-D4: `respect_gitignore` defaults to `false` (USER-LOCKED)
Mirror the scanner's `?? false` fallback (`anatomy-scanner.ts:287`) exactly. The root-`.gitignore` matcher only runs when the consumer has opted in via `openwolf.anatomy.respect_gitignore: true`. With it off, only `exclude_patterns` (+ the always-excluded sensitive files) gate the hook — identical fallback structure to the scanner for semantic parity.

### R6-D5: Hand-rolled root-`.gitignore` parser — supported subset + fail-closed bias
The dep-free `.gitignore` matcher is **net-new code** in `wolf-ignore.ts` (not a promotion — the scanner's gitignore support comes from the `ignore` npm package, which the hook cannot import). Per D-18 this is an **accepted engine split**: the hook gets a "good enough" matcher; the CLI/daemon full scan keeps `ignore` as the authoritative backstop for edge-case syntax.

**Supported natively (subset):**

| Form | Example | Semantics |
|------|---------|-----------|
| Comment / blank | `# foo`, `` (empty) | skipped |
| Bare name | `node_modules` | match that segment at **any** depth |
| Trailing slash | `node_modules/` | directory + everything beneath it |
| Leading-slash (anchored) | `/dist` | root-anchored only |
| Within-segment / ext glob | `*.log`, `tmp*` | `*` stays within one segment |
| Double-star | `.cache/**` | `**` spans path segments |

**Deferred to the full-scan backstop, handled fail-closed:**
- **Negation (`!important.log`)** — the hook **skips `!` lines entirely (no-op)** rather than misinterpret them. Bias is fail-*closed*: the hook may under-include a re-included file, but it must never leak. The authoritative scan reconciles. **This omission MUST be pinned by a test** so it is deliberate, not a bug.
- Character ranges (`[abc]`), escapes (`\#`), nested/global `.gitignore` — unsupported; backstop owns them.

**Guiding rule (MANDATORY):** when a pattern is ambiguous or unsupported, **exclude rather than include**. A leak-prevention gate must fail toward not-leaking.

Only the **root** `.gitignore` (`<projectRoot>/.gitignore`) is consulted.

### R6-D6: Injection point + path normalization seam
Apply the new gating inside `recordAnatomyWrite` **immediately after** the R3 `../` guard at `src/hooks/post-write.ts:33`, consuming the **already-normalized** `relPathLocal = normalizePath(path.relative(projectRoot, absolutePath))` computed at line 32 (forward-slashed, project-root-relative). Order of gates: (1) R3 `../` out-of-project skip [unchanged] → (2) `shouldExclude(relPathLocal, excludePatterns)` → (3) opt-in `.gitignore` match. Any gate that matches → return without recording; otherwise record as today.

**Verification must prove (ROADMAP criterion 2):** an excluded in-project dir is skipped; a root-`.gitignore`-ignored in-project dir is skipped when `respect_gitignore: true`; the R3 out-of-project `../` skip is preserved; a normal in-project file is still recorded. Add a regression test feeding a **backslash-separated** path through the Windows code path and asserting the matcher still catches it (the normalization seam already exists; the test locks it).

### R6-D7: Constraint C2 (zero hook deps) + live copy step
The hook bundle must import **no** `node_modules` package: `tsc --noEmit -p tsconfig.hooks.json` must be clean (ROADMAP criterion 3). The scanner KEEPS its `import ignore from "ignore"` (D-18). After implementation, exercise `pnpm build:hooks` → `node dist/bin/openwolf.js update` so the new behavior is live in `.wolf/hooks/`, not inert in `dist/hooks/` (ROADMAP criterion 4).

### Claude's Discretion
- Final name/signature of the gitignore predicate (`parseAndMatchGitignore(relPath, gitignoreContent)` vs. a compiled-matcher factory); whether to expose a single combined `shouldExcludeFromAnatomy()` convenience or keep `shouldExclude` + gitignore as two calls.
- Internal structure of the parser (precompile each line to a `RegExp` via the existing `globToRegExp` vs. line-by-line evaluation).
- Test layout: new `tests/hooks/wolf-ignore.test.ts` for the matcher unit tests vs. extending `tests/hooks/post-write.test.ts` for the integration assertions (likely both).
- Whether `recordAnatomyWrite` gains an explicit config param (testability) or reads config internally.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement & acceptance criteria (PRIMARY)
- `.planning/REQUIREMENTS.md` — **R6** definition + accept criterion; Hard Constraints **C1** (framework-blind) and **C2** (no `node_modules` imports reachable from the hook build).
- `.planning/ROADMAP.md` — **Phase 10** goal + Success Criteria 1–4 (one shared module / leak closed + R3 preserved / `tsc -p tsconfig.hooks.json` clean / copy step exercised).
- `.planning/PROJECT.md` — **D-18** (keep `ignore` dep CLI/daemon-only; zero-dep matcher in the hook).
- `.planning/STATE.md` — build-order edges: R6 extends R3's `../` guard + R5's exclude semantics (verify in Phase 8 first); R6 needs the `build:hooks` → `openwolf update` copy step.

### Source under change
- `src/scanner/anatomy-scanner.ts` — current home of `globToRegExp` (line 66), `matchesPattern` (98), `shouldExclude` (134, exported), `ALWAYS_EXCLUDE_FILES` + `.env` guard, `DEFAULT_EXCLUDE_PATTERNS`, `loadGitignoreMatcher` (uses `ignore` pkg, line 152), config read at 272–295. **Source to MOVE FROM.**
- `src/hooks/post-write.ts` — `recordAnatomyWrite` (line 26); R3 `../` guard at line 33; normalized `relPathLocal` at line 32. **Injection target.**
- `src/hooks/shared.ts` — the thin barrel (re-exports 18 values + 1 type). **Add the new re-exports here.**
- `src/hooks/wolf-ignore.ts` — **NEW** zero-dep module (does not exist yet).

### Build / config facts
- `CLAUDE.md` (project) — "Hooks run in isolation and **cannot import from `src/utils/`** at runtime; `src/hooks/shared.ts` is a self-contained copy." Hook-change copy step: `pnpm build:hooks` then `node dist/bin/openwolf.js update`. Type-check hooks: `tsc --noEmit -p tsconfig.hooks.json`.
- `tsconfig.hooks.json` — compiles `src/hooks/*.ts` standalone; the C2 boundary check.
- Tests mirror `src/`; vitest. `tests/hooks/post-write.test.ts` and `tests/scanner/anatomy-scanner.test.ts` already exist — extend, don't duplicate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The three matcher functions + constants are already written, tested, and battle-proven in `anatomy-scanner.ts` (Q2 fix `2f3e1f6` hardened `matchesPattern` for nested-path and glob patterns). The move must preserve that behavior exactly — re-run `tests/scanner/anatomy-scanner.test.ts` after relocating.
- `normalizePath` (re-exported from `wolf-paths.js` via `shared.ts`) already gives the hook a forward-slashed, root-relative path — the normalization trap is structurally half-solved; the parser just consumes `relPathLocal`.
- `shouldExclude` is the only one of the three currently `export`ed; `globToRegExp`/`matchesPattern` are module-private (keep them private per R6-D2).

### Established Patterns
- `shared.ts` is a **pure barrel** — it only `export { … } from "./wolf-*.js"`. Follow that: implementation lives in `wolf-ignore.ts`, `shared.ts` just re-exports.
- Every hook calls `ensureWolfDir()` first and exits 0 silently when `.wolf/` is absent — the new config read must tolerate a missing `.wolf/config.json` without throwing (defaults).
- Scanner reads config via `config.openwolf?.anatomy?.{exclude_patterns,respect_gitignore,max_files}` with `??` fallbacks (lines 287/294) — mirror this exact shape in the hook for parity (R6-D3/R6-D4).

### Integration Points
- `recordAnatomyWrite` is invoked from `post-write.ts:132` inside the broader post-write handler; only the anatomy-record path changes. The buglog/edit-tracking paths below it are untouched (out of scope).
- The scanner imports the moved symbols from `src/hooks/wolf-ignore.ts` — confirm `tsc --noEmit` (main `tsconfig.json`, which excludes `src/dashboard/app`) stays clean with the new cross-directory import, and that `tsconfig.hooks.json` still compiles `wolf-ignore.ts` with **zero** `node_modules` imports.

### Security note (ASVS L1, block-on: high)
- Untrusted-content surface: both `exclude_patterns` (from `config.json`) and root `.gitignore` are developer-authored, but the hand-rolled `globToRegExp` builds a `RegExp` from arbitrary pattern text — guard against **ReDoS** / pathological patterns (the existing `globToRegExp` only emits `.*`, `[^/]*`, and escaped literals, which is linear; preserve that property and do not introduce backreferences/nested quantifiers). Path-traversal is already mitigated by the R3 `../` guard, which stays first.

</code_context>

<specifics>
## Specific Ideas

- PRD evidence **E6** (`.claude/plans/tmp.pwYfhCNiar` was listed in `config.json` `exclude_patterns` yet appeared in the committed `anatomy.md`) is the concrete field symptom R6 closes — a test mirroring E6 (an excluded nested path fed to `recordAnatomyWrite`, asserted absent from the resulting anatomy) is the highest-value regression.
- The gate order matters: R3 `../` guard **must remain first** so out-of-project paths short-circuit before any config read or regex work.
- Keep the scanner's `loadGitignoreMatcher` (the `ignore`-backed one) intact — the hook's hand-rolled parser is a *parallel* implementation, not a replacement.

</specifics>

<deferred>
## Deferred Ideas

- Full gitignore-spec parity in the hook (negation, character ranges, escapes, nested files) — intentionally NOT supported; the CLI/daemon full scan (`ignore` pkg) is the authoritative backstop (D-18).
- Unifying the hook and scanner onto a single `.gitignore` engine — explicitly rejected by D-18 (would force a `node_modules` dep into the hook, violating C2).
- Caching `config.json` across hook invocations — rejected (R6-D3): no shared process memory, negligible read cost.

</deferred>

---

*Phase: 10-hook-side-in-project-exclusion*
*Context gathered: 2026-06-25 (transcribed from assumptions-mode discussion)*
