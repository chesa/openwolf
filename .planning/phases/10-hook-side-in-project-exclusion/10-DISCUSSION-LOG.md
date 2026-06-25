# Phase 10: Hook-Side In-Project Exclusion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 10-hook-side-in-project-exclusion
**Areas discussed:** Module boundary & dependency split, `.gitignore` matcher subset, Config access, Public export surface, Path normalization, Integration ordering
**Mode:** `--auto` (single-pass autonomous). Decisions below were resolved by the user in the preceding `--assumptions` exchange and recorded here verbatim — they are user calls, not recommended defaults.

---

## Module boundary & dependency split

| Option | Description | Selected |
|--------|-------------|----------|
| Move matchers into shared dep-free module; scanner re-imports | Single source of truth, no copy drift (D-18) | ✓ |
| Copy matchers into the hook | Faster to write; risks drift between two copies | |
| Re-port full gitignore semantics dep-free, drop `ignore` | Maximal parity; large effort, rejected for v1.2 | |

**User's choice:** Move `globToRegExp`/`matchesPattern`/`shouldExclude` (+constants) into `src/hooks/wolf-ignore.ts`; scanner imports them back. Scanner keeps its `ignore` dep as the authoritative full-scan backstop.
**Notes:** Accepted engine split per D-18. `tsc --noEmit -p tsconfig.hooks.json` is the C2 gate proving no `node_modules` import leaked into the hook bundle.

---

## `.gitignore` matcher — supported subset

| Option | Description | Selected |
|--------|-------------|----------|
| Trailing slash + basic wildcards only | `node_modules/`, `*.log` | |
| Add path-anchoring (`/dist`) | Above + root-anchored dirs + `**` | ✓ |
| Full gitignore spec | Negation, ranges, escapes, nested | |

**User's choice:** Support bare name (any depth), trailing-slash dirs, leading-slash anchored, ext/segment globs, and `**`. Anchored `/dist` included because root-anchored build dirs are among the most common root-`.gitignore` lines and `globToRegExp` already anchors `^…$`.
**Notes:** Negation (`!…`) lines are **skipped entirely (no-op)** — fail-closed: hook may under-include a re-included file but never leaks; full scan reconciles. Char ranges/escapes/nested → backstop. Governing rule: ambiguous/unsupported ⇒ exclude. Pin the negation omission with a test so it is deliberate.

---

## Config access in the hook

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh `readFileSync` per invocation | No caching; sub-KB file, negligible cost | ✓ |
| In-memory cache | Non-starter — hooks are transient processes with no shared memory | |

**User's choice:** Read `.wolf/config.json` fresh on every invocation. `respect_gitignore` defaults to `false`, mirroring the scanner (`anatomy-scanner.ts:287`); `exclude_patterns` falls back to the scanner's `DEFAULT_EXCLUDE_PATTERNS`.
**Notes:** Maintains semantic parity with the scanner via identical key paths and fallbacks.

---

## Public export surface (`shared.ts`)

| Option | Description | Selected |
|--------|-------------|----------|
| Export high-level interface only | `shouldExclude` + `parseAndMatchGitignore` + constants | ✓ |
| Export everything incl. `globToRegExp` | Pollutes the barrel with path-munging internals | |

**User's choice:** Re-export only `shouldExclude`, `parseAndMatchGitignore`, and structural constants. Keep `globToRegExp`/`matchesPattern` private to `wolf-ignore.ts`.

---

## Path normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing normalized `relPathLocal` | Already forward-slashed + root-relative at `post-write.ts:32` | ✓ |
| Add a fresh normalization pass | Redundant — seam already exists | |

**User's choice:** Feed the matcher the existing `relPathLocal` (normalized before the R3 guard). Add a regression test passing a backslash path to assert `node_modules\` is still caught (Windows code path).
**Notes:** Surfaced as a "subtle trap"; confirmed already half-solved by `normalizePath` at the injection site.

---

## Claude's Discretion

- Exact internal API shape of `wolf-ignore.ts` (single aggregator vs. two predicates), honoring the locked public surface.
- Whether config is read inside `recordAnatomyWrite` or threaded in as a new parameter.
- Test file organization (new `tests/hooks/wolf-ignore.test.ts` vs. extending existing files).

## Deferred Ideas

- Full gitignore-spec parity in the hook (negation re-inclusion, char ranges, escapes, nested/global gitignore) — permanent design boundary owned by the scanner's `ignore`-backed full scan (D-18), not a future phase.
- Removing the `ignore` dependency entirely — explicitly rejected for v1.2.
