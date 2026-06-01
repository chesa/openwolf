# Technology Stack: Hardening Sprint

**Project:** OpenWolf
**Analysis Date:** 2026-06-01
**Domain:** Context manager for Claude Code (brownfield Node.js/TypeScript)

## Rationale

This sprint addresses 11 tech-debt and security items. The stack research focuses on four dimensions:
1. WebSocket authentication transport (moving token out of URL)
2. Large module splitting (src/hooks/shared.ts is oversized)
3. Vitest test consolidation (broken include path)
4. pnpm clean script pattern (missing build cleanup)

---

## 1. WebSocket Authentication: Bearer Token Migration

**Recommendation:** Authenticate post-connection via `AUTH` message with Bearer token. Keep client sending token via `Authorization` header on initial HTTP request, then validate during WebSocket upgrade.

**Confidence:** MEDIUM — This is the 2025 pattern for single-origin SPAs where CSRF is not a concern.

### Analysis

Browser WebSocket API (`new WebSocket(url, protocols)`) does not allow setting custom headers during the HTTP upgrade request. This is a browser security constraint, not a library limitation. Therefore "moving from URL to Authorization header" for WebSocket is not literally possible in browser environments.

**Available patterns:**

| Pattern | Token Location | Security | Complexity |
|---------|---------------|----------|-------------|
| Query param (`?token=`) | URL | Low — logged in proxy logs, referrer, browser history | Low |
| `Sec-WebSocket-Protocol` | Header | Medium — not logged by proxies | Medium |
| Post-connection AUTH message | Message body | High — token in JS memory, not URL | Medium |
| Cookie (HTTP-only) | Cookie | High — CSRF concern for SPAs | High |

### Recommended Approach

1. **Dashboard client** sends token via standard `Authorization: Bearer <token>` header when establishing connection (via HTTP upgrade request to `/ws` endpoint)
2. **Express middleware** validates the Bearer token on the upgrade request (not HTTP routes)
3. **ws library** intercepts the `upgrade` event and reads the Authorization header before completing WebSocket handshake

### Implementation Pattern (ws + Express)

```typescript
// wolf-daemon.ts — HTTP upgrade handler
server.on('upgrade', (req, socket, head) => {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token || !validateToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.userToken = token; // attach to WebSocket for later use
    wss.emit('connection', ws, req);
  });
});
```

### Why Not Authorization Header?

Browsers don't allow custom headers during WebSocket upgrade. The closest equivalent is `Sec-WebSocket-Protocol` which allows a single header with protocol strings. However, the post-connection AUTH message pattern is more widely documented and works consistently across browsers.

### Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `ws` | 8.18.0 | WebSocket server (already in use) |
| `jsonwebtoken` | 9.0.2 | Token validation (install if not present) |

---

## 2. Node.js File Splitting: Barrel + Re-export Pattern

**Recommendation:** Split `src/hooks/shared.ts` into focused concern modules (fs-safe, path-utils, anatomy-parser, session-manager) using a barrel re-export file (`shared.ts`) that re-exports the original API surface for backward compatibility.

**Confidence:** HIGH — Barrel re-export is the standard 2025 pattern for library-style module splitting in Node.js/TypeScript applications.

### Pattern: Barrel Re-export for Backward Compatibility

```
src/hooks/
  shared.ts          ← original, now a barrel (re-exports)
  fs-safe.ts         ← new: atomic write, readJSON
  path-utils.ts      ← new: validateFilePath, ensure WolfDir
  anatomy-parser.ts  ← new: parseAnatomy, serializeAnatomy
  session-manager.ts ← new: SessionData type, session helpers
```

```typescript
// src/hooks/shared.ts — barrel re-export (new content after split)
export { validateFilePath, ensureWolfDir } from './path-utils';
export { readJSONSafe, writeJSONSafe, appendText } from './fs-safe';
export { parseAnatomy, serializeAnatomy } from './anatomy-parser';
export type { SessionData } from './session-manager';
// ... re-export everything that was exported before
```

### Key Principles

1. **Named exports over wildcard** (`export { Foo } from './Foo'` not `export * from './Foo'`)
2. **Keep barrels shallow** — splitting into 4 focused modules is fine; creating nested barrels is an anti-pattern
3. **Backward compat via re-export** — existing hook imports like `import { ensureWolfDir } from '../shared'` continue working because shared.ts re-exports everything
4. **Token budget** — each module target is ≤ 4,000 tokens

### Anti-Patterns to Avoid

- **Mega-barrels** — A single `index.ts` that re-exports everything in the project slows TypeScript compilation (Atlassian reported 75% build time reduction after removing barrel files at scale)
- **Circular re-exports** — A re-exporting from B which re-exports from A
- **Wildcard exports in barrels** — `export *` makes tree-shaking ineffective and hides what is actually public

### Libraries

No new libraries required. Uses Node.js built-in `fs`, `path`, `crypto` modules.

---

## 3. Vitest Test Consolidation: Project-based Include

**Recommendation:** Fix `vitest.config.ts` to use `test.projects` array targeting `tests/` as the single test directory. Move any `src/**/*.test.ts` files into `tests/` if not already there.

**Confidence:** HIGH — `test.projects` is the documented 2025 approach for multi-directory test consolidation in Vitest.

### Pattern

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
```

### For OpenWolf (Single Directory)

OpenWolf consolidates to one `tests/` directory per sprint requirement. Use a simple include pattern:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

### Run Commands

```bash
vitest              # run all tests
vitest --project unit    # run unit only
vitest --project integration  # run integration only
```

### Known Limitation

Issue #5530: Vitest Workspaces may only use the first config file when multiple configs exist in the same workspace package. Workaround: use a single `vitest.config.ts` with `test.projects` rather than workspace `vitest.workspace.ts` files.

### Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `vitest` | 4.1.5 | Test runner (already in use) |

---

## 4. pnpm clean Script: rimraf Pattern

**Recommendation:** Add `pnpm clean` script using `rimraf` for cross-platform `dist/` removal. Since pnpm v11.0.0, `pnpm clean` runs the custom `"clean"` script instead of the built-in (which removes `node_modules`).

**Confidence:** HIGH — This is the documented 2025 pnpm behavior.

### Pattern

```json
{
  "scripts": {
    "clean": "rimraf dist .wolf/designqc-captures/ \"tmp.\"*"
  }
}
```

### Important Notes

1. **Quote glob patterns** — `"tmp.*"` must be quoted to prevent shell expansion before pnpm passes it to rimraf
2. **Explicit paths only** — `dist/` is explicit; `.wolf/` is NOT targeted (only `.wolf/designqc-captures/` which is a generated artifact directory)
3. **rimraf for cross-platform** — `rm -rf` is Unix-specific; rimraf works on Windows/macOS/Linux
4. **`pnpm clean` vs `pnpm pm clean`** — Since pnpm v11.0.0, `pnpm clean` runs the custom script. Use `pnpm pm clean` for the built-in (removes `node_modules`)

### Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `rimraf` | 6.0.1 | Cross-platform file removal (install as dev dependency) |

---

## Summary

| Dimension | Recommendation | Key Library | Confidence |
|-----------|---------------|-------------|------------|
| WebSocket auth | Post-connection AUTH with Bearer token validation in `upgrade` handler | `ws` 8.18.0 | MEDIUM |
| Module splitting | Barrel re-export for backward compat; focused concern modules | None (built-in) | HIGH |
| Vitest consolidation | Single `include` pattern targeting `tests/` directory | `vitest` 4.1.5 | HIGH |
| pnpm clean | `rimraf dist` script; explicit paths to avoid `.wolf/` deletion | `rimraf` 6.0.1 | HIGH |

---

## Sources

- [pnpm clean script documentation](https://pnpm.io/cli/clean)
- [ws WebSocket library](https://github.com/websockets/ws)
- [Barrel exports in TypeScript](https://basarat.gitbook.io/TypeScript/main-1/barrel)
- [Vitest multi-project configuration](https://deepwiki.com/vitest-dev/vitest/4.6-multi-project-and-workspace-support)
- [Atlassian barrel file case study](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)
- [WebSocket authentication patterns](https://oneuptime.com/blog/post/2026-01-24-websocket-authentication/view)