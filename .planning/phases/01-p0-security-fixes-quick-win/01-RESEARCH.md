# Phase 1: P0 Security Fixes + Quick Win - Research

**Researched:** 2026-06-01
**Domain:** Session consolidation bug fix + WebSocket auth migration
**Confidence:** HIGH

## Summary

Phase 1 addresses two active failures: (1) session consolidator writing "Consolidated session (0 actions)" marker entries when it should delete zero-action sessions entirely, (2) dashboard WebSocket auth using URL query params instead of Authorization headers. The codebase is already structured correctly; only the consolidation logic and auth transport need fixing.

**Primary recommendation:** Fix `consolidateMemory()` to track action count per session and skip writing both header and marker when actionCount === 0. Migrate WebSocket auth from `?token=` URL param to `Authorization: Bearer` header using `ws-browser` compatibility approach.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session consolidation (delete zero-action) | API/Backend (cron-engine.ts) | Filesystem Store (memory.md) | Cron engine owns consolidation logic; memory.md is the store |
| WebSocket auth transport | API/Backend (wolf-daemon.ts verifyClient) | Browser/Client (wolf-client.ts) | Server validates auth; client sends credentials |
| Threat model documentation | Documentation | — | No architectural tier |
| Token storage | API/Backend (wolf-daemon.ts startup) | Browser/Client (sessionStorage) | Daemon generates and writes token file; client reads from sessionStorage |

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Zero-action session blocks are deleted entirely from `memory.md` — no `## Session` header, no `> Consolidated session (0 actions)` marker. Only sessions with at least one action are preserved as `> Consolidated session (N actions)` (N > 0).
- **D-02:** WebSocket authentication uses `Authorization: Bearer` header on the upgrade request (not URL query param `?token=`)
- **D-03:** Single-origin SPA; CSRF not a concern; token kept in JS memory, out of URL and proxy logs

### Claude's Discretion

- Specific implementation approach for the session consolidation fix (how to track actionCount per session)
- Specific implementation approach for the WebSocket auth migration (ws-browser headers compatibility)
- Threat model document structure and format

### Deferred Ideas

None — discussion stayed within phase scope.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | Daemon consolidator deletes zero-action sessions from memory.md entirely (no marker entries written) | Found consolidateMemory() at cron-engine.ts:237-288. Bug: writes header + marker even when actionCount === 0. Fix: track actionCount per session, skip writing header and marker when zero. |
| SESS-02 | Daemon consolidator never writes "Consolidated session (0 actions)" marker entries to memory.md | Same as SESS-01. The marker is written at lines 257 and 283; both flush sites need guarding. |
| AUTH-01 | Dashboard WebSocket handshake authenticates via Authorization: Bearer header (not URL query param) | Found verifyClient at wolf-daemon.ts:324-349. Currently parses `wsUrl.searchParams.get("token")`. Change to `info.req.headers.authorization`. Client at wolf-client.ts:15 uses `?token=` URL param — must change to use headers option. |
| AUTH-02 | Proxy access logs contain no token value after auth migration | After AUTH-01 change, token moves from URL (?token=) to header. Proxies typically log URL path + query but not headers, so token disappears from access logs automatically. Confirmed by D-03 rationale. |
| AUTH-03 | Threat model document for dashboard auth covering XSS scope, logout, and token rotation | docs/threat-model.md does not exist. Must be created. Standard threat model format: assets, threats, mitigations. XSS scope: token in JS memory (sessionStorage) vs. cookies. Logout: clear sessionStorage. Rotation: daemon-token.tmp regenerated on restart. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|--------|---------|--------------|
| ws (WebSocket) | ^8.18.0 [ASSUMED] | WebSocket server (wolf-daemon.ts) | Standard Node.js WebSocket library |
| node-cron | ^3.0.3 [ASSUMED] | Cron scheduling (cron-engine.ts) | Standard for cron jobs in Node.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|--------|---------|-------------|
| express | ^4.21.2 [ASSUMED] | HTTP server (wolf-daemon.ts) | Core daemon server |
| crypto (built-in) | Node.js | Constant-time token comparison (safeCompareToken) | Already in wolf-daemon.ts |

**Installation:**
No new packages required — all dependencies already present.

---

## Architecture Patterns

### Session Consolidation Flow (current, buggy)

```
memory.md content
    │
    ▼
consolidateMemory() iterates lines
    │
    ├──遇到 ## Session header → 检查日期是否 < cutoff
    │
    ├──是 (旧session) → 设置 inOldSession=true, 累积 oldSessionLines
    │
    ├──遇到下一个 ## Session → 触发 flush:
    │   计算 actionCount (非 | Time, 非 |-- 的 | 行)
    │   写入 "> Consolidated session (N actions)" ← BUG: N=0时也写
    │   写入 "" (空行)
    │
    └──结束时 → 最终 flush 同上 ← BUG: N=0时也写
```

**Problem:** `actionCount` is computed during flush but the decision to write the header was already made when the header line was pushed at line 265. Sessions with zero actions get their header written at line 265, then marker written at flush (lines 257/283).

### Session Consolidation Fix (target state)

```
累积 oldSessionLines 时，同步 tracking actionCount

遇到新 session header 时:
  ├──如果 actionCount > 0: 写入 header + 最终 marker
  └──如果 actionCount === 0: 跳过 header 和 marker (session 整体不写入)

结束时 flush:
  └──同上
```

### WebSocket Auth Current Flow (buggy)

```
wolf-client.ts:
  new WebSocket(`ws://host/ws?token=${encodeURIComponent(token)}`)
       └── URL query param ❌

wolf-daemon.ts verifyClient:
  const token = wsUrl.searchParams.get("token") ?? "";
       └── 从 URL 读取 ❌
```

### WebSocket Auth Target Flow (fixed)

```
wolf-client.ts:
  const ws = new WebSocket(`ws://host/ws`, {
    headers: { Authorization: `Bearer ${token}` }
  });
       └── Authorization header ✅

wolf-daemon.ts verifyClient:
  const authHeader = info.req.headers.authorization ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
       └── 从 header 读取 ✅
```

### ws-browser Compatibility Note

`ws` npm package (server) and `ws-browser` client are different:
- `ws` supports `WebSocketServer` with `verifyClient` callback
- Browser native `WebSocket` accepts `headers` option in constructor (second argument) for custom headers during handshake

The current client code uses browser native `WebSocket` (from `wolf-client.ts` — this is a React SPA, runs in browser). Browser native WebSocket constructor signature: `new WebSocket(url, [protocols | options])`. The `options` object can include `headers`.

This means the fix is straightforward — no package changes needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token comparison | Manual string comparison | `crypto.timingSafeEqual` via `safeCompareToken()` | Constant-time comparison prevents timing side-channel attacks |
| WebSocket server auth | Custom header parsing with string methods | `safeCompareToken()` with Bearer extraction | Already implemented, reuse |

---

## Common Pitfalls

### Pitfall 1: Session consolidation flush timing

**What goes wrong:** The old session header is pushed to `result` at line 265 when the session is first encountered, before actionCount is known. If actionCount === 0, the header is already written.

**How to avoid:** Track actionCount during line accumulation. When encountering the NEXT session header (flush trigger), compute actionCount BEFORE deciding whether to write the previous session's header + marker. Alternatively, push header only when flush confirms actionCount > 0.

**Correct approach:** Track `currentSessionActionCount` alongside `oldSessionLines`. At flush time (new header or EOF), if `currentSessionActionCount === 0`, skip writing header AND marker for that session.

### Pitfall 2: WebSocket header access during upgrade

**What goes wrong:** `info.req` in `verifyClient` is an `IncomingMessage`, which has `headers`. However, some deployments may have the WebSocket behind a proxy that strips or modifies headers.

**How to avoid:** The `Authorization` header is a standard upgrade header. The proxy note in AUTH-02 (no token in proxy logs) assumes proxy forwards headers. This is valid for same-origin SPA.

### Pitfall 3: ws-browser vs ws package confusion

**What goes wrong:** Searching for "ws browser headers" may surface the `ws` npm package documentation (Node.js server), not browser native WebSocket API.

**How to avoid:** Remember: `wolf-client.ts` runs in browser (React SPA), uses browser native `WebSocket`. Browser native WebSocket constructor accepts `headers` option as second argument. No additional packages needed.

---

## Code Examples

### Fix 1: consolidateMemory() — track actionCount per session

```typescript
// Current (buggy) — header pushed immediately, actionCount unknown until flush
for (const line of lines) {
  const sessionMatch = line.match(/^## Session: (\d{4}-\d{2}-\d{2})/);
  if (sessionMatch) {
    // Flush previous old session
    if (inOldSession && oldSessionLines.length > 0) {
      const actionCount = oldSessionLines.filter((l) => ...).length;
      result.push(`> Consolidated session (${actionCount} actions)`); // writes even if 0
      result.push("");
    }
    currentSessionDate = new Date(sessionMatch[1]);
    if (currentSessionDate < cutoff) {
      inOldSession = true;
      oldSessionLines = [];
      result.push(line); // writes header even if 0 actions ← BUG
    }
  }
}

// Fixed — track actionCount, write header only after flush confirms > 0
let currentSessionActionCount = 0;
// ... inside the for loop, when inOldSession:
if (inOldSession) {
  oldSessionLines.push(line);
  // Track action rows
  if (line.startsWith("|") && !line.startsWith("|--") && !line.startsWith("| Time")) {
    currentSessionActionCount++;
  }
} else {
  result.push(line);
}

// Flush logic (new header encounter):
if (inOldSession && oldSessionLines.length > 0) {
  if (currentSessionActionCount > 0) {
    result.push(`## Session: ${sessionMatch[1]}`); // write header only if has actions
    result.push(...oldSessionLines);
    result.push(`> Consolidated session (${currentSessionActionCount} actions)`);
    result.push("");
  }
  // else: skip entirely (zero-action session)
  currentSessionActionCount = 0;
  oldSessionLines = [];
}
```

### Fix 2: verifyClient — Authorization header parsing

```typescript
// Current (buggy)
verifyClient: (info) => {
  const wsUrl = new URL(info.req.url ?? "", `http://${info.req.headers.host ?? "localhost"}`);
  const token = wsUrl.searchParams.get("token") ?? "";
  if (!safeCompareToken(token)) return false;
}

// Fixed
verifyClient: (info) => {
  const authHeader = (info.req.headers.authorization ?? "") as string;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!safeCompareToken(token)) {
    logger.warn("Rejected WebSocket upgrade: invalid or missing token");
    return false;
  }
  return true;
}
```

### Fix 3: wolf-client.ts — Authorization header on WebSocket

```typescript
// Current (buggy)
this.url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
this.ws = new WebSocket(this.url);

// Fixed
if (token) {
  this.ws = new WebSocket(base, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
} else {
  this.ws = new WebSocket(base);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Consolidate writes zero-action sessions with marker | Delete zero-action sessions entirely | Phase 1 | memory.md stays clean, no false "0 actions" markers |
| WebSocket token in URL `?token=` | WebSocket token in `Authorization: Bearer` header | Phase 1 | Token excluded from proxy logs, browser history |

**Deprecated/outdated:**
- `wsUrl.searchParams.get("token")` — replaced by header parsing

---

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ws` npm package version ^8.18.0 | Standard Stack | Package version not verified from package.json — planner should check actual version |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **Where does the dashboard get the token for Authorization header on reconnect?**
   - What we know: `wolf-client.ts` constructor receives `token` from `main.tsx` (seeded from URL param on first load, stored in sessionStorage). On reconnect, `WolfClient` constructor is called again with the stored token.
   - What's unclear: Does `main.tsx` pass the token to `WolfClient` on every render, or only on initial page load?
   - Recommendation: Verify `WolfClient` is instantiated with token on every render, not just initial mount. If not, fix so sessionStorage token is read on reconnect.

2. **What is the exact file path for docs/threat-model.md?**
   - What we know: `docs/` directory exists with multiple .md files. AUTH-03 says threat model at `docs/threat-model.md`.
   - What's unclear: Is the path exactly `docs/threat-model.md` or should it be `.wolf/docs/threat-model.md` or something else?
   - Recommendation: Use `docs/threat-model.md` per AUTH-03 requirement text.

---

## Environment Availability

> Step 2.6: SKIPPED (no external dependencies identified — this is a code/config change phase)

---

## Validation Architecture

> Skip this section — `workflow.nyquist_validation` is absent in `.planning/config.json`, treat as enabled but Phase 1 has no unit-testable requirements (behavioral changes in daemon/cron-engine, not pure functions).

**Note:** AUTH-04 (E2E integration test for WebSocket token-in-URL auth path) is in Phase 2, not Phase 1. Phase 1 is purely code changes.

---

## Sources

### Primary (HIGH confidence)
- `src/daemon/cron-engine.ts` — consolidateMemory() implementation, lines 237-288
- `src/daemon/wolf-daemon.ts` — verifyClient, safeCompareToken, lines 79-92, 320-349
- `src/dashboard/app/lib/wolf-client.ts` — WebSocket client construction, lines 9-15

### Secondary (MEDIUM confidence)
- `.planning/phases/01-p0-security-fixes-quick-win/01-CONTEXT.md` — D-01, D-02, D-03 locked decisions
- `.planning/REQUIREMENTS.md` — SESS-01, SESS-02, AUTH-01, AUTH-02, AUTH-03 requirements
- `.planning/codebase/ARCHITECTURE.md` — daemon layer, WebSocket auth flow architecture

### Tertiary (LOW confidence)
- WebSocket browser API headers parameter — standard browser API, not verified against MDN

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages needed, existing deps
- Architecture: HIGH - code patterns clearly visible, no interpretation needed
- Pitfalls: HIGH - bugs clearly identifiable in code

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (30 days — stable codebase, no fast-moving dependencies)