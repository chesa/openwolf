# Domain Pitfalls

**Domain:** Node.js/TypeScript Maintenance and Security Hardening Sprint
**Project:** OpenWolf
**Analysis Date:** 2026-06-01
**Confidence:** MEDIUM-HIGH (based on direct code inspection; context7 verification applied to WebSocket auth patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites, security vulnerabilities, or broken backward compatibility.

---

### Pitfall 1: Module Split Breaks Re-Exports (shared.ts, description-extractor.ts)

**What goes wrong:** Splitting a 750+ line module into focused concern modules breaks every consumer that imports from the original module's named exports. Claude Code hooks import specific functions from `shared.ts` by name. After the split, those imports silently get the old module instead of the new module, or TypeScript compilation fails because the export no longer exists.

**Why it happens:** The backward-compatibility re-export strategy (Item 9: "Maintain backward compatibility for hook re-exports after split") requires intentional aliasing in the old module that delegates to new modules. This is easy to skip under time pressure.

**Consequences:**
- Hooks silently use stale `shared.ts` instead of new split modules (no compile error, runtime behavioral drift)
- TypeScript errors if re-export is not aliased properly
- Runtime failures if new modules have different initialization requirements

**Prevention:**
1. List every named export from `shared.ts` that hooks consume
2. Before splitting, write a smoke test that imports each exported symbol and calls it
3. Create re-export file (e.g., `shared.backcompat.ts`) that imports from new modules and re-exports all original symbols
4. Update original `shared.ts` to be a thin re-export facade (or keep as facade to avoid import path changes in hooks)
5. Verify: `node -e "import('./dist/hooks/shared.js').then(m => console.log(Object.keys(m)))"` shows all original exports

**Detection:**
```bash
# Check for import breakage across hook files
grep -r "from.*shared" src/hooks/*.ts | grep -v "\.backcompat"
```

**Phase/Item mapping:** Item 6 (shared.ts split), Item 7 (description-extractor.ts split), Item 9 (backward compat)

---

### Pitfall 2: WebSocket Token-in-URL Leak During Transition (wolf-daemon.ts)

**What goes wrong:** Migrating from `?token=` (URL query param) to `Authorization: Bearer` header requires a transition window. If the server still accepts `?token=` during the transition, clients that have not yet updated continue leaking tokens via browser history, Referer headers, and server access logs. The threat model document may describe the target state but not enforce the transition timeline.

**Why it happens:** The WebSocket `verifyClient` callback currently (lines 330-346) parses `?token=` from the URL. The dashboard currently reads the token from the URL, strips it via `history.replaceState`, and stores in sessionStorage. Changing the server first creates a window where the new server rejects old clients; changing the client first leaks tokens until server is updated.

**Consequences:**
- Token exposure via browser history (anyone with access to browser history sees the token)
- Token in Referer header when navigating away from dashboard
- Token in server access logs (anyone with log access can impersonate the dashboard)

**Prevention:**
1. Coordinate client and server changes in a single commit/change
2. If a transition window is unavoidable, add a server-side flag `ALLOW_URL_TOKEN_TRANSITION=false` and set it to `true` only during the coordinated rollout window, then remove
3. Document the threat model precisely: what the URL query param leak enables vs. what header auth prevents

**Detection:**
- Dashboard WebSocket connects with `new WebSocket("ws://host?token=...")` instead of header
- Server logs show tokens in query strings

**Phase/Item mapping:** Item 2 (WebSocket auth migration), Item 3 (threat model document)

---

### Pitfall 3: Session Consolidator Writes Zero-Action Markers (cron-engine.ts)

**What goes wrong:** The `consolidateMemory` method (line 237-288 in cron-engine.ts) writes `> Consolidated session (0 actions)` marker entries when a session had zero tracked actions. This is the active failure in Item 1.

**Why it happens:** The consolidation logic computes `actionCount` from lines starting with `|` (data rows), but when a session has no reads/writes/writes after session-start, the loop still triggers and writes the marker. The condition `if (inOldSession && oldSessionLines.length > 0)` at line 281 does not guard against sessions where `oldSessionLines` has content but all lines are non-action rows.

**Consequences:**
- memory.md accumulates "Consolidated session (0 actions)" entries that are meaningless noise
- Every cron consolidation run adds another marker, growing memory.md indefinitely
- The feature does not actually fix the problem it claims to solve

**Prevention:**
1. Only write the consolidated session marker if `actionCount > 0`
2. Add an integration test: create a zero-action session, run consolidation, assert no marker is written

**Detection:**
```bash
grep "Consolidated session (0 actions)" .wolf/memory.md
```

**Phase/Item mapping:** Item 1 (session consolidator fix)

---

### Pitfall 4: Clean Script Deletes .wolf/ State Files

**What goes wrong:** `pnpm clean` script removes `dist/`, `.wolf/designqc-captures/`, and `tmp.*` but an incorrect glob pattern could also delete `.wolf/` itself or critical state files like `cerebrum.md`, `memory.md`, `buglog.json`.

**Why it happens:** `rm -rf .wolf` or a malformed glob like `.wolf/**` that expands incorrectly under certain conditions. The constraint is explicit (Item 8): must NOT delete `.wolf/` state files.

**Consequences:**
- User loses all learning memory, bug history, and session state
- Undo is impossible (state files are not in git)
- Project becomes a fresh initialization

**Prevention:**
1. Write `pnpm clean` as explicit path removals, not glob patterns at directory root
2. Test the clean script in a temp project with real `.wolf/` content before committing
3. Use `trash` or `mv` instead of `rm` for a safety net

```bash
# Safe pattern (explicit paths)
rm -rf dist/
rm -rf .wolf/designqc-captures/
rm -f tmp.*
```

**Detection:**
- Run `ls .wolf/` before and after clean script to verify state files remain

**Phase/Item mapping:** Item 8 (clean script)

---

## Moderate Pitfalls

### Pitfall 5: Vitest Config include Path Leaves Tests Invisible

**What goes wrong:** `vitest.config.ts` has `include: ["src/**/*.test.ts"]`. The sprint moves tests to `tests/` directory (Item 8) but forgets to update this include pattern. Tests run, pass, and are checked in, but CI runs zero tests because the include path is wrong.

**Why it happens:** `vitest.config.ts` is a separate file from the test files themselves. When consolidating tests to `tests/`, the config file is not automatically updated.

**Consequences:**
- CI passes with zero tests run (false positive)
- Tests in `tests/` are never executed
- No test coverage for the sprint changes

**Prevention:**
1. Update `include` in vitest.config.ts as part of the same commit that moves tests
2. Run `vitest --run` locally after moving and verify test count
3. Add a CI smoke check: `vitest --run 2>&1 | grep "tests run"` or equivalent

**Detection:**
```bash
vitest --run 2>&1 | grep -E "test suites?|tests|passed"
# Should show non-zero tests
```

**Phase/Item mapping:** Item 8 (test consolidation)

---

### Pitfall 6: TypeScript Compilation Skips Hook Files After Split

**What goes wrong:** `tsconfig.hooks.json` compiles `src/hooks/*.ts` to `dist/hooks/`. If the split creates new files (e.g., `src/hooks/worktree-context.ts`, `src/hooks/fs-helpers.ts`) that are not listed in tsconfig.hooks.json, those files are not compiled and hooks run with stale compiled code.

**Why it happens:** The hooks TypeScript project (`tsconfig.hooks.json`) likely has specific file includes or a glob that does not cover newly created split files.

**Consequences:**
- Hooks silently use old `shared.js` from previous build
- No TypeScript error because the old file still exists in `dist/hooks/`
- Runtime behavior does not reflect source changes

**Prevention:**
1. Check `tsconfig.hooks.json` include patterns before and after split
2. After `pnpm build:hooks`, verify all expected `.js` files exist in `dist/hooks/`
3. Run `openwolf update` to copy new hooks to `.wolf/hooks/` and smoke test

**Detection:**
```bash
ls dist/hooks/
# Compare file list with expected split outputs
```

**Phase/Item mapping:** Item 6 (shared.ts split), Item 9 (backward compat)

---

### Pitfall 7: .DS_Store Already Committed to Git

**What goes wrong:** Adding `.DS_Store` to `.gitignore` only prevents future additions. Previously committed `.DS_Store` files remain in the repository. The cleanup step (Item 9) needs to actually remove them from git history.

**Why it happens:** `.gitignore` only affects untracked files. Committed files must be explicitly removed with `git rm`.

**Consequences:**
- `.DS_Store` files remain in repo history and clones
- A fresh clone still has `.DS_Store` files
- The fix is incomplete

**Prevention:**
1. Run `git ls-files | grep DS_Store` to find already-committed instances
2. `git rm --cached .DS_Store .claude/.DS_Store` and commit (with `.gitignore` update)
3. Verify: `git ls-files | grep DS_Store` returns empty

**Detection:**
```bash
git ls-files | grep -i ".ds_store"
```

**Phase/Item mapping:** Item 9 (.DS_Store removal)

---

### Pitfall 8: Hook Documentation Describes Intended Not Actual Behavior

**What goes wrong:** `docs/hooks.md` documents the `worktree-helper.js` hook contract as it should work or as the author intended, not as it actually works. The gap between documented and actual behavior misleads future developers who rely on the documentation.

**Why it happens:** Documentation is written before or during implementation and not updated when implementation changes. The "threat model" framing (Item 3) especially is aspirational — it describes what the system should prevent, not what it currently does.

**Prevention:**
1. Write docs against actual runtime behavior, not design docs
2. Extract contract from code: what does the hook actually do when `.wolf/` is missing? When worktree detection fails? When stdin is empty?
3. Add a test that verifies documented behavior matches actual behavior

**Phase/Item mapping:** Item 4 (hook documentation), Item 3 (threat model)

---

## Minor Pitfalls

### Pitfall 9: Cron Consolidation Deletes Session Metadata

**What goes wrong:** The `consolidateMemory` method in cron-engine.ts replaces session content with a `> Consolidated session (N actions)` marker but drops all session header metadata (session date, branch, worktree path). If a session is inspected later, there is no way to tell when it occurred or in which worktree.

**Prevention:** Preserve at least session date in the consolidated marker, e.g., `> Consolidated session from 2026-05-28 (3 actions)`.

**Phase/Item mapping:** Item 1 (session consolidator)

---

### Pitfall 10: WebSocket VerifyClient Parsing Fails on Non-URL Characters

**What goes wrong:** The current URL parsing in `verifyClient` (wolf-daemon.ts line 334-337) uses `new URL(req.url, ...)` to extract query params. If `req.url` contains non-URL characters or is malformed, this throws and the connection is rejected with "could not parse upgrade URL" rather than "invalid or missing token".

**Why it happens:** The `try/catch` around URL parsing catches the exception and returns `false`, but the error message is misleading about the actual cause.

**Prevention:**
1. Add specific error messages in catch block distinguishing parse failures from auth failures
2. Add test with malformed URL to verify error message clarity

**Phase/Item mapping:** Item 2 (WebSocket auth)

---

### Pitfall 11: Token Size Estimation Causes Hooks to Exceed Claude Code Limits

**What goes wrong:** `estimateTokens` in shared.ts uses fixed ratios (3.5 for code, 4.0 for prose). If the token budget (Item 6: "Target <= 4 000 tokens per hook module") is based on incorrect token estimates, the split produces modules that still exceed the limit at runtime. Claude Code has hard limits on hook script size.

**Prevention:**
1. Use a realistic tokenizer (e.g., `tiktoken` or the actual Claude tokenization API) to verify estimates
2. Build hooks and check compiled size in bytes, convert to approximate tokens
3. Set a conservative byte-size limit (roughly 15KB for a 4000-token budget) as a compile-time guard

**Phase/Item mapping:** Item 6 (shared.ts split)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **WebSocket auth migration** (Items 2-3) | Pitfall 2 (token leak during transition) | Coordinate client+server change in single commit; add transition flag |
| **Hook split** (Items 6, 9) | Pitfalls 1, 6 (broken re-exports, missed compilation) | Smoke test exports before/after; verify dist/hooks/ contents |
| **Session consolidator** (Item 1) | Pitfall 3 (zero-action markers), Pitfall 9 (metadata loss) | Add integration test for zero-action case; preserve session date |
| **Test consolidation** (Item 8) | Pitfall 5 (include path not updated) | Run vitest locally and verify test count; add CI smoke check |
| **Clean script** (Item 8) | Pitfall 4 (.wolf deletion) | Explicit path removal; test in temp project |
| **.DS_Store removal** (Item 9) | Pitfall 7 (already committed) | Check `git ls-files` and `git rm --cached` |

---

## Sources

- Direct code inspection of `src/daemon/wolf-daemon.ts` (WebSocket verifyClient, lines 319-349)
- Direct code inspection of `src/daemon/cron-engine.ts` (consolidateMemory, lines 237-288)
- Direct code inspection of `src/hooks/shared.ts` (exports, token estimation)
- Direct code inspection of `vitest.config.ts` (include pattern)
- NODE_ENV=production WebSocket security patterns via Context7 verification