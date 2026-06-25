# R6 — Hook-side in-project path exclusion (dependency-free)

**Milestone:** OpenWolf v1.2 (CHESA fork) — Phase R6
**Researched:** 2026-06-25
**Mode:** Targeted implementation research (internal tooling)
**Confidence:** HIGH (grounded in source at cited file:line)

## Question

The post-write hook injects file entries into `.wolf/anatomy.md` with **no
in-project exclusion**. R3 only guards out-of-project `../` paths. We need the
incremental hook path to honor **both** `config.json` `exclude_patterns` **and**
the repo-root `.gitignore` — **without** importing any npm package (`ignore` or
otherwise) into a hook-imported module, because a runtime dep in the standalone
hook bundle is a `MODULE_NOT_FOUND` failure class (real past bug; see
`src/hooks/wolf-selfheal.ts:28-29`, `src/scanner/anatomy-scanner.ts:8-12`).

## Existing matcher (file:line + semantics)

All matcher code lives in **`src/scanner/anatomy-scanner.ts`** and is **not
currently exported** except `shouldExclude` (line 134). The three relevant
symbols:

### `globToRegExp(glob: string): RegExp` — `anatomy-scanner.ts:66`

Anchored (`^...$`) glob→regex translator.

- `*` → `[^/]*` (stays within one path segment)
- `**` → `.*` (spans path segments, including `/`)
- Escapes regex metachars `\ ^ $ . | ? + ( ) [ ] { }`
- Everything else copied literally.

**Limitations:** no character classes, no `?` single-char glob, no brace
expansion. `**` is treated as plain `.*` (does not special-case the
`a/**/b` "zero-or-more-dirs" semantics of gitignore — `a/**/b` only matches
when something sits between, because the literal `/` on each side stays).

### `matchesPattern(relPath, parts, pattern): boolean` — `anatomy-scanner.ts:98`

Decides whether one `exclude_patterns` entry matches a **project-relative,
forward-slashed** path. `parts = relPath.split("/")`. Branch order:

| Pattern form | Example | Semantics |
|---|---|---|
| Extension glob (no `/`) | `*.min.js` | `relPath.endsWith(".min.js")` |
| Bare name (no `/`, no `*`) | `node_modules` | `parts.includes(pattern)` — matches that **segment at any depth** |
| Path, no glob | `docs/superpowers` | `relPath === pattern \|\| relPath.startsWith(pattern + "/")` — dir + everything under it |
| Path, with glob | `.claude/**/cache`, `docs/sp/*` | `globToRegExp(pattern).test(relPath)` against full relPath |
| Single-segment glob | `tmp*` | `parts.some(p => segRe.test(p))` — any one segment |

Empty pattern → `false`.

**Documented prior bug (comment at `:95-97`):** before this matcher, any
pattern containing `/` silently matched nothing (`parts.includes` only). That
is the **E6 leak class** — `.claude/plans/tmp.pwYfhCNiar` was in
`config.json` `exclude_patterns` yet appeared in the committed map. This
matcher fixes it **for the full scan only**; the hook never calls it.

### `shouldExclude(relPath, excludePatterns): boolean` — `anatomy-scanner.ts:134` (exported)

Wraps `matchesPattern` over all patterns, **plus** an unconditional secrets
guard: `ALWAYS_EXCLUDE_FILES` (`.env`, `.env.local`, …) and any
`.env` / `.env.*` basename (lines 142-144). The hook **partially duplicates**
this `.env` guard inline at `post-write.ts:124-125`.

### `.gitignore` handling — `anatomy-scanner.ts:152-165` (CLI/daemon ONLY)

`loadGitignoreMatcher()` reads **only the project-root `.gitignore`**, feeds it
to the `ignore` npm package (`anatomy-scanner.ts:12`), returns an `Ignore` or
`null`. Used in `walkDir` at `:194` (`ig.ignores(relPath)`). Opt-in via
`config.openwolf.anatomy.respect_gitignore` (default `false`,
`config.json` template + `:287`). **Nested `.gitignore` files and global
excludes are explicitly out of scope** (comment `:154-156`). The `ignore`
import is fenced off with a loud comment (`:8-12`) — must never reach a hook.

## Port strategy (dep-free) — *share, don't copy*

**Key architectural finding that changes the PRD's framing.** The PRD (R6) says
"port the matcher into `src/hooks/shared.ts`." But the dependency direction is
already **scanner → hooks**, one-way:

- `src/scanner/anatomy-scanner.ts:6` imports `parseAnatomy`, `AnatomyEntry`
  **from `../hooks/shared.js`**.
- `src/hooks/shared.ts` is a thin barrel (31 lines) re-exporting from
  `wolf-*.ts` leaf modules (`wolf-anatomy`, `wolf-misc`, `wolf-json`, …).
- No hook module imports `ignore` or anything from `src/scanner/`
  (grep-verified — only comments reference the scanner).

Therefore the matcher can become a **single shared implementation living on the
hook side**, consumed by *both* builds — eliminating divergence rather than
managing it:

1. Create **`src/hooks/wolf-ignore.ts`** (new leaf module, zero npm deps,
   `node:` builtins only — matches the `wolf-misc.ts` style). Move the
   pure functions `globToRegExp`, `matchesPattern`, `shouldExclude` verbatim
   from `anatomy-scanner.ts` into it and `export` them. Add a dep-free
   `.gitignore` parser (next section) here too.
2. Re-export them from the **`src/hooks/shared.ts`** barrel (one line, matching
   the existing pattern).
3. **Scanner** deletes its local copies and imports `shouldExclude` (and
   optionally the new gitignore parser) from `../hooks/shared.js` — exactly as
   it already imports `parseAnatomy`. The `ignore` package stays in the scanner
   **only if** you keep the richer full-scan gitignore engine; otherwise the
   scanner can adopt the dep-free parser and `ignore` is dropped (see Divergence
   Risk for the tradeoff).
4. **post-write hook** imports `shouldExclude` + the gitignore matcher from
   `./shared.js` and calls them in `recordAnatomyWrite` before injecting.

Why this beats a literal copy: a copy in `shared.ts` + the original in the
scanner is **two implementations of the same regex semantics** — exactly the
"silent under-support" hazard the prompt flags. One module, two importers, no
drift. The compile boundary is preserved because `wolf-ignore.ts` lives under
`src/hooks/**` (the only glob `tsconfig.hooks.json` includes) and pulls no
`node_modules`.

> Compile/runtime guarantee: `tsconfig.hooks.json` `include: ["src/hooks/**/*.ts"]`.
> A new pure-TS file there compiles standalone. The risk is **only** introduced
> if `wolf-ignore.ts` ever imports `ignore` — it must not. Enforce with a code
> comment mirroring `anatomy-scanner.ts:8-12`.

## .gitignore subset to support + documented gaps

The hook needs its **own** dep-free `.gitignore` parse (cannot use `ignore`).
Parse the **project-root `.gitignore` only** (consistent with the scanner's
documented scope) into the existing `globToRegExp`/`matchesPattern` engine.

**Supported subset (the lines that actually cause leaks):**

| Syntax | Handling |
|---|---|
| Comment `# …` | skip line |
| Blank line | skip |
| Trailing whitespace | trim (unless `\ ` escaped — see gaps) |
| `dir/` (trailing slash) | strip the slash → directory-prefix match (same as a slashless path; matches dir + contents) |
| `/foo` (leading slash) | anchor to root → strip leading `/`, match as a rooted path (no "any depth") |
| `foo` (no slash) | bare-name → segment-at-any-depth (already `matchesPattern` default) |
| `*` / `**` | delegate to `globToRegExp` (`*` = within-segment, `**` = cross-segment) |
| `!neg` (negation) | track as an override: a path is ignored iff it matches a positive pattern AND no later `!` pattern re-includes it. Evaluate in file order. |

**Explicit GAPS — NOT supported (document loudly; silent under-support is the
hazard):**

- **Nested `.gitignore` files** anywhere below root. Scanner already excludes
  these (`anatomy-scanner.ts:154-156`); the hook matches that gap. A subdir
  `.gitignore` will NOT be honored by either path.
- **Global/core excludes** (`core.excludesFile`, `.git/info/exclude`). Out.
- **Escaped metacharacters** (`\#`, `\!`, `\ ` trailing-space escape). Treat
  `#`/`!` as literal only via their normal leading-char rules; do not implement
  backslash escaping. Rare in practice; document as a known divergence.
- **`?` single-char wildcard and `[a-z]` character classes.** `globToRegExp`
  does not implement these (it escapes `?`, `[`, `]`). A pattern like `file?.ts`
  or `[Tt]emp` will not match as gitignore intends. Document; these are rare in
  ignore files.
- **gitignore's "`**` between slashes = zero-or-more dirs" optional-match.**
  `a/**/b` in real git matches `a/b` too; `globToRegExp` keeps both literal
  slashes so `a/**/b` requires at least one intervening char. Minor; document.
- **Anchoring nuance of a slash *in the middle*** (e.g. `foo/bar` is implicitly
  root-anchored in git). `matchesPattern`'s path-without-glob branch
  (`relPath===pattern || startsWith(pattern+"/")`) already root-anchors any
  pattern containing `/`, so this is consistent.

The subset above covers every leak observed in the field (E5/E6/E7: `tmp.*`
scratch dirs, `.claude/plans/...`, `/tmp` review artifacts) — those are bare
names, `dir/`, and rooted paths, all in-subset.

## Divergence risk

The **named hazard** is two regex engines drifting. The recommended
share-don't-copy strategy reduces it to one engine for `exclude_patterns`. The
residual risk is the **`.gitignore` engine split**:

- Scanner full-scan uses the **`ignore` npm package** (full git-spec fidelity:
  nested-ignore-aware in principle, `?`, char classes, escapes).
- Hook uses the **dep-free subset parser**.

So a `.gitignore` pattern using `?`, `[…]`, escapes, or relying on git's `**`
optional-dir semantics could be honored by a full scan but **missed by the
incremental hook** — producing a transient leak that the *next* full scan
silently corrects. This is acceptable (the scan is the backstop) but MUST be
documented in `wolf-ignore.ts` and surfaced in the acceptance tests, so a future
maintainer does not assume parity.

**Mitigation options (pick one, record the decision):**

1. **Accept the split (recommended for v1.2).** Hook uses the subset; full scan
   remains authoritative via `ignore`. Lowest risk to the hook bundle. Document
   the gap list verbatim in both files.
2. **Unify on the dep-free parser** (drop `ignore` from the scanner too). Total
   consistency, removes a dependency, but loses git-spec edge fidelity on the
   full scan. Only do this if the team confirms no real `.gitignore` in their
   repos relies on `?`/char-classes/escapes (acme's did not — its ignore lines
   are bare names + `dir/` + `*.local.*`-style globs).

Either way: the `exclude_patterns` matcher MUST be the single shared
implementation. Only the `.gitignore` engine choice is open.

## Recommended touch-points & build order

1. **`src/hooks/wolf-ignore.ts`** (NEW) — move `globToRegExp`, `matchesPattern`,
   `shouldExclude` here + add dep-free `parseGitignore(content): string[]` and a
   `gitignoreMatches(relPath, parts, patterns, negations)` (or fold into
   `shouldExclude` with a second pattern list). Zero npm deps; loud no-`ignore`
   comment.
2. **`src/hooks/shared.ts`** — re-export the new symbols (one barrel line).
3. **`src/scanner/anatomy-scanner.ts`** — delete the local `globToRegExp` /
   `matchesPattern` / `shouldExclude`; import from `../hooks/shared.js`. Decide
   `.gitignore` engine per Divergence Risk (keep `ignore` = option 1).
4. **`src/hooks/post-write.ts` `recordAnatomyWrite`** (`:26-92`) — after the
   existing `relPathLocal.startsWith("../")` guard (`:33`), read
   `wolfDir/config.json` (`exclude_patterns`, `respect_gitignore`) via the
   hook's `readJSON` (already imported through `shared.js`), compute
   `parts = relPathLocal.split("/")`, and **return early** if
   `shouldExclude(relPathLocal, patterns)` OR (respect_gitignore &&
   gitignore-match). This is the single injection point — `main()` calls
   `recordAnatomyWrite` once (`:132`).
5. **`pnpm build:hooks` → `node dist/bin/openwolf.js update`** (copy
   `dist/hooks/*.js` → `.wolf/hooks/`). Hook edits are inert until this copy
   step runs (CLAUDE.md "Hook changes require a copy step").
6. **Type-check both targets:** `tsc --noEmit` and
   `tsc --noEmit -p tsconfig.hooks.json` (the latter proves the hook bundle has
   no stray `node_modules` import).

**Build order rationale:** create the leaf (1) → expose it (2) → repoint the two
importers (3, 4) → compile both (5/6). Steps 3 and 4 are independent after 1-2.

**Versioning:** new hook behavior + matcher relocation is at minimum a **minor**
bump (CONTRIBUTING.md / CLAUDE.md: format change or new API ≥ minor).

## Acceptance criteria

Shape: **an excluded OR gitignored in-project directory must never enter
anatomy.md via the hook.** Tests live in `tests/hooks/post-write.test.ts`
(extend the existing `recordAnatomyWrite` import) and `tests/scanner/...` for
the shared matcher.

1. **exclude_patterns honored (incremental):** with `config.json`
   `exclude_patterns` containing `.claude/plans` (a slash pattern — the E6
   class), call `recordAnatomyWrite` for
   `<root>/.claude/plans/tmp.X/draft/foo.md`; assert `anatomy.md` gains **no**
   entry for it. (Reproduces E6 on the hook path.)
2. **bare-name exclude:** `node_modules` in patterns → a write under
   `node_modules/x/y.js` adds no entry.
3. **ext glob:** `*.min.js` → write `dist/app.min.js` adds no entry (also
   covered by `dist` bare name; test the glob independently).
4. **gitignore honored (opt-in):** with `respect_gitignore: true` and a root
   `.gitignore` containing `scratch/` and `/tmp-review`, writes under
   `scratch/notes.md` and `tmp-review/pr82.md` add **no** entry. (Reproduces
   E7.) With `respect_gitignore: false`, the same writes DO add entries
   (proves opt-in gate).
5. **negation:** `.gitignore` = `logs/\n!logs/keep.md` → `logs/x.md` excluded,
   `logs/keep.md` included.
6. **out-of-project still skipped (R3 regression):** write to a `../sibling`
   path → no entry (existing behavior preserved).
7. **in-project normal file still recorded:** `src/foo.ts` (not excluded, not
   gitignored) → entry IS added (no over-exclusion).
8. **matcher parity:** the shared `shouldExclude` produces identical results
   when called from the scanner test and the hook test for the same inputs
   (guards against future re-divergence).
9. **bundle purity:** `tsc --noEmit -p tsconfig.hooks.json` succeeds (no
   `ignore`/scanner import leaked into the hook build).

## Sources

- `src/scanner/anatomy-scanner.ts` — matcher (`:66` globToRegExp, `:98`
  matchesPattern, `:134` shouldExclude), gitignore loader (`:152-165`,
  `:194`), `ignore` dep fence (`:8-12`). **HIGH** (primary source).
- `src/hooks/post-write.ts` — injection point `recordAnatomyWrite` (`:26-92`),
  R3 `../` guard (`:33`), single call site (`:132`), inline `.env` guard
  (`:124-125`). **HIGH** (primary source).
- `src/hooks/shared.ts` — barrel re-export pattern (31 lines); scanner imports
  from it (`anatomy-scanner.ts:6`). **HIGH**.
- `src/hooks/wolf-misc.ts`, `wolf-anatomy.ts` — leaf-module style to mirror for
  `wolf-ignore.ts`. **HIGH**.
- `src/hooks/wolf-selfheal.ts:28-29` — confirms scanner is CLI-only (pulls
  `ignore`); rationale for spawning CLI not importing scanner. **HIGH**.
- `src/templates/config.json` + live `.wolf/config.json` — `exclude_patterns`
  shape, `respect_gitignore` default `false`. **HIGH**.
- `tsconfig.hooks.json` — `include: ["src/hooks/**/*.ts"]`; the compile
  boundary. **HIGH**.
- `PRD-OpenWolf-Shared-Context-and-Curation.md` — §3.2 E5/E6/E7 leak evidence,
  §4.3/§4.4, §6 R3/R5/R6, §7 (`3ef255c` scanner gitignore landed; hook still
  blind). **HIGH** (requirements context).
- `tests/hooks/post-write.test.ts` — existing test harness shape
  (`recordAnatomyWrite` already imported). **HIGH**.
