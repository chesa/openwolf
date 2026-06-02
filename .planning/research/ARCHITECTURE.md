# Architecture Patterns — OpenWolf Hardening Sprint

**Domain:** Node.js/TypeScript context manager for Claude Code
**Researched:** 2026-06-01
**Confidence:** HIGH (codebase analysis + existing architecture doc)

---

## Component Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Claude Code IDE Events                                  │
│            session-start | pre-read | post-read | pre-write | post-write | stop   │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
┌─────────────────────────────┐          ┌────────────────────────────────────┐
│   Hooks (compiled to        │          │  CLI (compiled to dist/bin/)       │
│   .wolf/hooks/*.js)         │          │  src/cli/index.ts + subcommands    │
│   src/hooks/{6 hooks}       │          └──────────────┬─────────────────────┘
│   src/hooks/shared.ts  ───────────────────────────────│
│   (worktree-helper.ts)       │                         │
└─────────────────────────────┘                         │
              │                                        │
              │  .wolf/ filesystem                     │
              ▼                                        ▼
┌──────────────────────────────────────────────────────┴──────────────────────────┐
│                           Shared .wolf/ Data Store                              │
│  anatomy.md | cerebrum.md | memory.md | token-ledger.json | buglog.json          │
│  daemon-token.tmp | cron-manifest.json | cron-state.json                         │
└──────────────────────────────────┬─────────────────────────────────────────────┘
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                      ▼
┌──────────────────────────────┐             ┌──────────────────────────────────┐
│  Scanner / Tracker            │             │  Daemon (Express + WebSocket)     │
│  src/scanner/                 │             │  src/daemon/wolf-daemon.ts        │
│  src/tracker/                 │             │  - HTTP API (X-Api-Token header)  │
│  description-extractor.ts     │             │  - WebSocket (ws://?token=)       │
│                               │             │  - Cron scheduler                  │
│                               │             │  - File watcher                    │
└───────────────────────────────┘             └─────────────┬────────────────────┘
                                                          │
                                                          ▼
                                          ┌──────────────────────────┐
                                          │  Dashboard SPA (React 19) │
                                          │  src/dashboard/app/       │
                                          │  served: dist/dashboard/  │
                                          │  WebSocket client         │
                                          │  (wolf-client.ts)         │
                                          └──────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Public API / Talk to |
|-----------|---------------|----------------------|
| Hooks | IDE event capture, .wolf/ state writes | Reads `.wolf/`, writes `_session.json` |
| CLI | User commands: init, scan, daemon, etc. | Calls scanner, daemon, writes .wolf/templates |
| Scanner | Filesystem scan, token estimation, description extraction | Writes `anatomy.md` |
| Daemon | HTTP API, WebSocket broadcast, cron, file watching | Serves dashboard, broadcasts to WS clients |
| Dashboard | React SPA, visualizes .wolf/ state | HTTP API + WebSocket to daemon |

### Data Flow for WebSocket Auth (Current)

```
Dashboard (main.tsx)
  ├─ Reads ?token= from URL on page load
  ├─ Stores in sessionStorage as "wolf_token"
  └─ Strips URL via history.replaceState

Dashboard (wolf-client.ts)
  └─ Connects: ws://host/ws?token=XXX   ← token in URL (THE PROBLEM)

Daemon (wolf-daemon.ts)
  ├─ verifyClient():
  │   ├─ parse ?token= from WebSocket upgrade URL
  │   └─ safeCompareToken(token) → accept/reject
  └─ HTTP /api/* middleware:
      └─ reads X-Api-Token header
```

### Data Flow for WebSocket Auth (Target: Authorization Header)

**Constraint:** WebSocket handshake does not support custom headers natively. The `Authorization` header cannot be sent during the WebSocket upgrade request from browser JavaScript.

**Viable approaches for SPA + WebSocket Bearer auth:**

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Cookie-based** | Daemon sets `Set-Cookie` on any HTTP response; browser sends cookie on WS upgrade | Native browser behavior | Requires daemon to manage cookie; needs `withCredentials: true` |
| **First-message auth** | Client connects, server challenges, client replies with signed token | No URL exposure | Protocol complexity, latency on reconnect |
| **Subprotocol** | `Sec-WebSocket-Protocol: Bearer <token>` header during handshake | Clean separation | Requires server and client support |
| **Query param (current)** | Token in URL | Simple | **Exposed in history, Referer, proxy logs** |

**Recommended:** Cookie-based authentication with `HttpOnly: false` (accessible to JS) and `SameSite=Strict`. The daemon sets the cookie on the initial page load response (when serving the SPA), and the browser automatically sends it during WebSocket upgrade.

The migration path:
1. Add `Set-Cookie: wolf_token=<value>; SameSite=Strict; Path=/` to daemon HTTP responses for SPA serving
2. wolf-client.ts: Remove `?token=` from URL, rely on cookie
3. Drop `verifyClient` token extraction from URL; read from cookie header instead
4. Dashboard bootstrap (main.tsx): Still reads `?token=` for initial backward compat, but also reads from cookie if available and sets one on first load

---

## Suggested Build Order

```
Phase 1: shared.ts split
  - Create src/hooks/worktree-context.ts   (WorktreeContext, detectWorktreeContextRaw, is*Error types)
  - Create src/hooks/fs-helpers.ts          (readJSON, writeJSON, readMarkdown, appendMarkdown, deepMergeDefaults)
  - Create src/hooks/anatomy-helpers.ts     (AnatomyEntry, parseAnatomy, serializeAnatomy)
  - shared.ts becomes a re-export facade (all existing exports, re-exported from new modules)
  - Verify: pnpm build:hooks && pnpm build && node dist/bin/openwolf.js update
  - Each module must stay ≤ 4000 tokens

Phase 2: description-extractor.ts split
  - Create src/scanner/extractors/ directory
  - src/scanner/extractors/base.ts        (KNOWN_FILES, MAX_DESC, READ_BYTES, capDescription, extractHeaderComment, isGenericComment)
  - src/scanner/extractors/smart.ts       (extractSmart router)
  - src/scanner/extractors/web.ts         (extractPhp)
  - src/scanner/extractors/compiled.ts    (extractTsJs)
  - src/scanner/extractors/scripting.ts  (extractPython)
  - src/scanner/extractors/native.ts     (extractGo, extractRust, extractJava, extractKotlin, extractCSharp)
  - src/scanner/extractors/other.ts      (Ruby, Swift, Dart, Vue, Svelte, Astro, CSS, SQL, Proto, GraphQL, YAML, TOML, Elixir, Lua, Zig)
  - src/scanner/description-extractor.ts re-exports everything, calls through to extractors/
  - Each module must stay ≤ 5000 tokens

Phase 3: Dashboard auth migration (depends on Phase 1 complete — shared tooling stable)
  - Add Set-Cookie to daemon HTTP responses for SPA
  - Update wolf-client.ts to drop ?token= from URL
  - Update verifyClient in daemon to read cookie instead of URL param
  - main.tsx: seed from cookie if no ?token=, otherwise set cookie too
  - Verify: Dashboard loads and connects to WebSocket without token in URL

Phase 4: Test consolidation (independent, can run parallel)
  - Create tests/ at repo root
  - Move src/tests/*.test.ts → tests/
  - Update vitest.config.ts: include: ["tests/**/*.test.ts"]
  - Remove src/tests/ directory

Phase 5: Hook contract docs + clean script (independent)
  - docs/hooks.md describing worktree-helper.js contract
  - Add pnpm clean script
```

### Why this order

- **Phase 1 before Phase 3**: WebSocket auth changes touch daemon and dashboard. Completing the file splits first means fewer conflicts when updating verifyClient and wolf-client.ts.
- **Phase 2 independent**: Scanner split does not affect hooks or daemon. Can run parallel to Phase 1.
- **Phase 4 independent**: Test consolidation is pure file moves + config change. Does not affect any runtime code.
- **Phase 5 last**: Documentation and cleanup after all code changes stabilize.

---

## File Split Strategies That Preserve Backward Compatibility

### shared.ts Split

**Current export surface** (all must still be importable from `shared.ts`):

```typescript
// These are the actual exports used by hooks and other consumers
export { detectWorktreeContextRaw, isMissingGitError, isNotARepoError, isTimeoutError, type WorktreeContext }
export { getWolfDir, getSessionDir, getWorktreeContext, ensureSessionDir, ensureWolfDir, isWolfFile }
export { readJSON, writeJSON, readMarkdown, appendMarkdown }
export { parseAnatomy, serializeAnatomy, type AnatomyEntry }
export { extractDescription, estimateTokens }
export { timestamp, timeShort, readStdin, normalizePath }
```

**Proposed module layout:**

```
src/hooks/
  worktree-context.ts    (moved from shared.ts + worktree-helper.ts)
  fs-helpers.ts           (readJSON, writeJSON, readMarkdown, appendMarkdown, deepMergeDefaults)
  anatomy-helpers.ts      (AnatomyEntry, parseAnatomy, serializeAnatomy)
  shared.ts               (re-exports facade — NO new logic)
```

**shared.ts after split:**
```typescript
// Re-export everything from new modules — zero logic changes
export { detectWorktreeContextRaw, isMissingGitError, isNotARepoError, isTimeoutError, type WorktreeContext } from "./worktree-context.js";
export { getWolfDir, getSessionDir, getWorktreeContext, ensureSessionDir, ensureWolfDir, isWolfFile } from "./worktree-context.js"; // Note: isWolfFile is currently in shared.ts — move to worktree-context or keep here
export { readJSON, writeJSON, readMarkdown, appendMarkdown } from "./fs-helpers.js";
export { parseAnatomy, serializeAnatomy, type AnatomyEntry } from "./anatomy-helpers.js";
export { extractDescription, estimateTokens } from "./description-helpers.js"; // extractDescription lives in shared.ts currently
export { timestamp, timeShort, readStdin, normalizePath } from "./fs-helpers.js";
```

**Token budget after split (shared.ts ~9256 tokens):**
- worktree-context.ts: ~1800 tokens
- fs-helpers.ts: ~2200 tokens
- anatomy-helpers.ts: ~800 tokens
- shared.ts facade: ~400 tokens (re-exports only)
- **Remaining for extractDescription + helpers:** ~4056 tokens → split into description-helpers.ts

### description-extractor.ts Split

**Current structure (~12506 tokens):** single file with `extractDescription` + all language extractors inline.

**Proposed module layout:**

```
src/scanner/
  description-extractor.ts    (re-export facade)
  extractors/
    base.ts                   (KNOWN_FILES, MAX_DESC, capDescription, extractHeaderComment, isGenericComment)
    smart.ts                  (extractSmart router — the switch on extension)
    docblock.ts               (extractDocblock — JSDoc/PHPDoc/Rustdoc/Javadoc/C# XML/Elixir @moduledoc)
    web.ts                    (extractPhp — largest single extractor, ~4000 tokens)
    compiled.ts               (extractTsJs — ~3000 tokens)
    scripting.ts              (extractPython — ~2000 tokens)
    native.ts                 (extractGo, extractRust, extractJava, extractKotlin, extractCSharp — ~3000 tokens)
    other.ts                  (Ruby, Swift, Dart, Vue, Svelte, Astro, CSS, SQL, Proto, GraphQL, YAML, TOML, Elixir, Lua, Zig — ~2500 tokens)
    fallback.ts              (extractGenericFallback)
```

**Token budget after split:**
- base.ts: ~1500 tokens
- smart.ts: ~300 tokens
- docblock.ts: ~600 tokens
- web.ts: ~4000 tokens
- compiled.ts: ~3000 tokens
- scripting.ts: ~2000 tokens
- native.ts: ~3000 tokens
- other.ts: ~2500 tokens
- fallback.ts: ~500 tokens
- description-extractor.ts facade: ~200 tokens
- **Total: ~17600 tokens across all modules (was 12506 in one file)**

The split increases total line count but each module is independently comprehensible and stays within the token budget. The facade approach means zero changes to callers.

---

## Anti-Patterns to Avoid During These Changes

### Do not break the hook contract

Hooks are invoked by Claude Code as standalone Node.js scripts. They cannot import from `src/utils/` at runtime — they run in isolation. The `shared.ts` re-export facade must continue to work as a standalone module. After splitting:
- Every hook file (session-start.ts, pre-read.ts, etc.) imports from `shared.ts` — unchanged
- `shared.ts` re-exports from the new module files — unchanged from hook perspective
- The build step must compile all new modules into `dist/hooks/`

### Do not add WebSocket auth state to daemon memory

The current daemon stores `wsClients: Set<WebSocket>`. After auth migration, do not add per-connection auth state that persists beyond the connection. Stateless connection auth (cookie verification on upgrade) is correct.

### Do not mix test file locations

vitest.config.ts currently includes `["src/**/*.test.ts"]`. The consolidation must update this include pattern before moving any files, otherwise tests disappear from the run.

---

## Threat Model Notes for Dashboard Auth

Key areas to document in the threat model deliverable:

1. **XSS scope**: If malicious JS runs in the dashboard origin, it can read `sessionStorage["wolf_token"]` and make API calls. Mitigant: token is scoped to a single origin, expires on browser close.
2. **Logout**: `sessionStorage.clear()` on explicit logout. No server-side session invalidation (stateless token).
3. **Token rotation**: Each daemon restart generates a new token. Old tokens become invalid — this is a feature, not a bug.
4. **Proxy logs**: With URL-based auth, tokens appear in proxy/access logs. Cookie-based auth avoids this.
5. **WebSocket URL exposure**: Current `?token=` in WS URL appears in browser history and Referer headers.

---

## Sources

- Existing architecture: `.planning/codebase/ARCHITECTURE.md` (2026-05-14)
- Project brief: `.planning/PROJECT.md` (2026-06-01)
- Codebase analysis: `src/hooks/shared.ts`, `src/scanner/description-extractor.ts`, `src/daemon/wolf-daemon.ts`, `src/dashboard/app/lib/wolf-client.ts`, `src/dashboard/app/main.tsx`, `vitest.config.ts`