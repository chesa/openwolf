# Feature Landscape

**Domain:** OpenWolf Maintenance & Security Hardening Sprint
**Researched:** 2026-06-01
**Project type:** Brownfield CLI/context-manager with daemon, hooks, and dashboard

---

## Executive Summary

This sprint addresses 11 accumulated items across security hardening, code maintainability, test organization, and repository hygiene. The items split cleanly into three priority tiers:

- **P0**: Two active failures (memory bloat from zero-action sessions, credential leakage via URL) plus required threat modeling
- **P1**: Code modularization, documentation, and test consolidation that any mature project must address
- **P2**: Developer experience polish (clean script, repo hygiene)

None of these items introduce new features or change existing behavior beyond the security fix and modularization. The sprint operates within the existing architecture.

---

## Feature Categorization

### Table Stakes

Behaviors and patterns any well-engineered project must get right. Missing these makes the project feel incomplete or broken.

| # | Feature | Why Table Stakes | Complexity |
|---|---------|-----------------|------------|
| 1 | Daemon consolidator deletes zero-action sessions; never writes marker entries | Bug fix: broken behavior causes memory bloat and spurious log entries | Low |
| 2 | Dashboard WebSocket auth migrates from URL query param to Authorization header | Security fix: token-in-URL leaks via referer headers, proxy logs, browser history | Medium |
| 3 | Threat model document for dashboard auth | Security documentation: required for any credential handling change | Medium |
| 4 | E2E integration test for WebSocket auth path | Test coverage for security-sensitive code path | Medium |
| 6 | shared.ts split into modules ≤ 4,000 tokens each | Code maintainability: prevents TypeScript performance degradation, keeps modules navigable | Medium |
| 7 | description-extractor.ts per-language handlers split out | Code maintainability: modularity improves testability and prevents monolith | Medium |
| 8 | All tests consolidated under tests/; vitest.config.ts updated | Test organization: standard practice for any project | Low |
| 10 | Remove .DS_Store from .claude/ and repo root; add to .gitignore | Repo hygiene: prevents committed junk files | Trivial |
| 11 | Backward compatibility for hook re-exports after split | Constraint: existing hook consumers must not break | Low |

**Table stakes count: 9/11 items**

### Differentiators

Features that set the project apart. Not expected, but valued. They represent investment in developer experience.

| # | Feature | Value Proposition | Complexity |
|---|---------|-------------------|------------|
| 5 | docs/hooks.md documenting worktree-helper.js hook contract | Lowers barrier to entry for hook customization; distinguishes a mature, documented project | Low |
| 9 | pnpm clean script (dist/, .wolf/designqc-captures/, tmp.*) | Faster iteration; removes build artifacts without manual cleanup | Low |

**Differentiators count: 2/11 items**

### Anti-Features

Things to NOT build as part of these items. Scope creep that would distract from the core goal.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| - | Full authentication rewrite (SSO, OAuth, multi-user) | Out of scope per PROJECT.md; transport change only, not auth model | Keep Authorization: Bearer as JS-memory token |
| - | Dashboard UI redesign | Unrelated to the 11 items | Focus on security and modularization |
| - | Dependency version bumps | Not required by the 11 items | Only update deps if needed for the fixes |
| - | New features beyond the 11 items | Sprint is deliberately scoped | Complete the 11 items first |

---

## Feature Details

### P0: Must Fix

#### 1. Daemon consolidator deletes zero-action sessions; never writes marker entries

**What:** Fix `src/daemon/cron-engine.ts` session consolidation to delete sessions with zero actions rather than writing `Consolidated session (0 actions)` marker entries.

**Why expected:** Broken behavior leaks memory and produces meaningless log entries. Any user who runs the daemon long enough sees this.

**Complexity:** Low

**Approach:**
- Find the session consolidation logic in cron-engine.ts
- Add conditional: if `actions === 0`, delete the session file instead of writing a marker
- Write a unit test for the zero-action edge case

**No dependencies on other items.**

---

#### 2. Dashboard WebSocket auth migrates from URL query param to Authorization header

**What:** Change `src/daemon/wolf-daemon.ts` WebSocket upgrade to read token from `Authorization: Bearer <token>` header instead of `?token=` URL query param. Update `src/dashboard/app/` WebSocket client to send the header on connect.

**Why expected:** Token in URL leaks through:
- `Referer` header when clicking external links
- Web server access logs (URLs logged in plain text)
- Browser history
- Proxy server logs
- Share dialogs or copy-url actions

**Complexity:** Medium

**Approach:**
- Server side (wolf-daemon.ts): Extract `Authorization` header during WebSocket upgrade handshake
- Client side (dashboard): Read token from memory, send as `Authorization: Bearer` header on `ws://` connect (not yet supported by `ws` library; may need upgrade to `wss` or use the `headers` option on the WebSocket constructor)
- Note: Standard `ws` WebSocket client cannot send custom headers during initial CONNECT; may need to switch to a client that supports headers (e.g., `websocket` npm package or Node's native `WebSocket` with headers), or use a subprotocol token exchange

**Status:** BLOCKED by research - need to verify Node.js WebSocket client header support

**Dependencies:** None (independent item)

---

#### 3. Threat model document for dashboard auth

**What:** Write `docs/threat-model.md` covering XSS scope, logout behavior, token rotation for the dashboard auth flow.

**Why expected:** Security fix without a threat model is incomplete. Reviewers and auditors need to understand the attack surface.

**Complexity:** Medium

**Approach:**
- Document the credential (token) lifecycle: generation, storage, transmission, revocation
- Cover XSS scope: what can malicious script in the dashboard do with the token?
- Cover logout: how is the token invalidated? Is it a sliding window?
- Cover token rotation: can the client request a new token?
- Cover deployment considerations: reverse proxy token handling, logs

**Dependencies:** Item #2 (threat model documents the new state, not the old state)

---

### P1: Should Fix

#### 4. E2E integration test for WebSocket auth path

**What:** Add end-to-end integration test covering the full WebSocket auth flow: dashboard client connects with `Authorization: Bearer`, daemon validates and accepts/rejects.

**Why expected:** Security-sensitive path without E2E test coverage is fragile. Unit tests mock the transport; integration tests verify the real flow.

**Complexity:** Medium

**Approach:**
- Create `tests/websocket-auth.e2e.ts` (or similar)
- Spin up a minimal daemon instance with a test token
- Connect a WebSocket client with `Authorization: Bearer <test-token>`
- Verify connection succeeds
- Try connecting with bad token, verify rejection
- Use a real WebSocket client (not mocked)

**Dependencies:** Item #2 (auth must be implemented before it can be tested)

---

#### 5. docs/hooks.md documenting worktree-helper.js hook contract

**What:** Write documentation describing the hook contract for `worktree-helper.js` — what inputs it receives, what outputs it produces, what side effects it has, and how it integrates with Claude Code hooks.

**Why expected:** Hooks are the integration surface with Claude Code. Users customizing hooks need clear documentation of what they can and cannot depend on.

**Complexity:** Low

**Approach:**
- Document the event model (session-start, pre-read, post-read, pre-write, post-write, stop)
- Document the stdin/stdout contract (JSON events in, JSON or text out)
- Document `.wolf/` file dependencies and side effects
- Document the worktree-helper.js role in session directory creation

**Dependencies:** None

---

#### 6. shared.ts split into modules ≤ 4,000 tokens each

**What:** Split `src/hooks/shared.ts` (currently ~34K tokens) into focused concern modules, each under 4,000 tokens. Maintain a re-export layer for backward compatibility.

**Why expected:** A 34K-token file is hard to navigate and edit safely. TypeScript analysis slows down. Modular structure enables parallel work and targeted testing.

**Complexity:** Medium

**Approach:**
- Identify logical concerns within shared.ts (file I/O, path resolution, worktree detection, anatomy parsing, session management, etc.)
- Extract each concern into its own module (e.g., `shared/file-io.ts`, `shared/worktree.ts`, `shared/anatomy.ts`)
- Create `shared/index.ts` that re-exports all public APIs (backward compat)
- Update all hook files to import from `shared/index.ts` (should be no change if using named imports)
- Verify: each module ≤ 4,000 tokens; all hooks still work

**Dependencies:** Item #11 (backward compat re-export is a constraint)

---

#### 7. description-extractor.ts per-language handlers split out

**What:** Extract per-language description handlers from `src/scanner/description-extractor.ts` into separate modules (one per language: TypeScript, Python, Markdown, etc.).

**Why expected:** Monolithic description extractor is hard to extend and test. Adding a new language requires editing one large file with many concerns.

**Complexity:** Medium

**Approach:**
- Identify existing language handlers in description-extractor.ts (likely switch/if statements per file extension)
- Extract each into `src/scanner/extractors/{typescript,python,markdown,etc}.ts`
- Create `src/scanner/extractors/index.ts` with a registry pattern: `extension -> handler` map
- Update `description-extractor.ts` to delegate to the registry
- Target: each module ≤ 5,000 tokens (per PROJECT.md constraint)
- Test: add a new language handler without modifying main file

**Dependencies:** None

---

#### 8. All tests consolidated under tests/; vitest.config.ts updated

**What:** Move any tests outside `tests/` into `tests/` directory. Update `vitest.config.ts` include path to only reference `tests/**/*.test.ts`.

**Why expected:** Scattered tests are hard to find and run consistently. A single test directory is a standard convention.

**Complexity:** Low

**Approach:**
- Find all `*.test.ts` files outside `tests/` (currently `src/hooks/*.test.ts`)
- Move each to `tests/hooks/*.test.ts`
- Update `vitest.config.ts` `include` pattern: `["tests/**/*.test.ts"]`
- Verify: `pnpm test` runs all tests from single location

**Dependencies:** None

---

### P2: Nice to Have

#### 9. pnpm clean script (dist/, .wolf/designqc-captures/, tmp.*)

**What:** Add a `clean` script to `package.json` that removes `dist/`, `.wolf/designqc-captures/`, and files matching `tmp.*` (but NOT `.wolf/` state files).

**Why expected:** Convenience for developers resetting state. Avoids manual deletion or running rm commands.

**Complexity:** Low

**Approach:**
```json
"scripts": {
  "clean": "pnpm run clean:dist && pnpm run clean:captures && pnpm run clean:tmp",
  "clean:dist": "rm -rf dist/",
  "clean:captures": "rm -rf .wolf/designqc-captures/",
  "clean:tmp": "rm -f tmp.*"
}
```
- Note: `clean:tmp` must NOT use `rm -rf` or glob that could expand to unintended targets. Use explicit `tmp.*` pattern.

**Dependencies:** None

---

#### 10. Remove .DS_Store from .claude/ and repo root; add to .gitignore

**What:** Delete any committed `.DS_Store` files in `.claude/` and repo root. Add `.DS_Store` to `.gitignore`.

**Why expected:** macOS generates these automatically; committed junk pollutes the repo and causes unnecessary diffs.

**Complexity:** Trivial

**Approach:**
```bash
git rm .DS_Store
git rm .claude/.DS_Store
echo ".DS_Store" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .DS_Store files"
```

**Dependencies:** None

---

## Feature Dependencies

```
Item 2 (WebSocket auth header) ──┬── Item 3 (threat model document)
                                 └── Item 4 (E2E integration test)

Item 6 (shared.ts split) ───────── Item 11 (backward compat re-export)

Item 7 (description-extractor split)
  └── No dependencies, but could be done in parallel with item 6

Items 1, 5, 8, 9, 10 ─ No dependencies, fully parallelizable
```

---

## MVP Recommendation

**Phase 1 (P0 - Must Fix):**
1. Fix daemon consolidator (item 1) — quick win, validates build/test pipeline
2. Migrate WebSocket auth (item 2) — security fix, central to sprint
3. Write threat model (item 3) — documents security decisions while fresh

**Phase 2 (P1 - Should Fix):**
4. E2E test for WebSocket auth (item 4) — covers the P0 security fix
5. Split shared.ts (item 6) — large file, most benefit per effort
6. Backward compat re-export (item 11) — natural outcome of item 6

**Phase 3 (P1 - Should Fix, parallel):**
7. docs/hooks.md (item 5) — documentation, can be written independently
8. Split description-extractor (item 7) — modularization, can be parallel
9. Consolidate tests (item 8) — simple file moves, quick win

**Phase 4 (P2 - Nice to Have):**
10. pnpm clean script (item 9) — DX improvement
11. .DS_Store cleanup (item 10) — trivial, quick close

---

## Open Questions

- **Item 2 (WebSocket header auth):** Standard Node.js `ws` library WebSocket clients cannot send custom headers during the initial HTTP upgrade handshake. Need to verify whether the project should switch client library, use a subprotocol token exchange, or accept that `Authorization` header on native `WebSocket` is not supported in browser environments. This affects the implementation approach for item 2 and consequently item 4.

---

## Sources

- Project context: `.planning/PROJECT.md`
- Stack: `.planning/codebase/STACK.md`
- Architecture: `.planning/codebase/ARCHITECTURE.md`
- Security consideration: WebSocket auth header transport — standard practice for SPA to avoid token-in-URL leakage (OWASP, MDN WebSocket best practices)