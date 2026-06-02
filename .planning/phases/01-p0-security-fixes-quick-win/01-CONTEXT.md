# Phase 1: P0 Security Fixes + Quick Win - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

## Phase Boundary

Fix the two active failures in OpenWolf's session and authentication systems:
1. Session consolidator deletes zero-action sessions and never writes marker entries (SESS-01, SESS-02)
2. Dashboard WebSocket auth migrates from URL query param (`?token=`) to `Authorization: Bearer` header (AUTH-01, AUTH-02)
3. Threat model document written covering XSS scope, logout, and token rotation (AUTH-03)

---

## Implementation Decisions

### Zero-action session deletion (SESS-01, SESS-02)

- **D-01:** Zero-action session blocks are **deleted entirely** from `memory.md` — no `## Session` header, no `> Consolidated session (0 actions)` marker. Only sessions with at least one action are preserved as `> Consolidated session (N actions)` (N > 0).

**Rationale:** A session with zero actions provides no useful history. Deleting it entirely keeps `memory.md` clean and avoids the misleading "0 actions" marker that suggests a bug in the consolidation logic.

**Implementation notes from codebase:**
- `cron-engine.ts` `consolidateMemory()` iterates `memory.md` lines looking for `## Session: YYYY-MM-DD HH:MM` headers (regex: `^## Session: (\d{4}-\d{2}-\d{2})`)
- Action rows are identified by `| Time |` table rows
- Change required: when `actionCount === 0`, skip writing the header AND skip writing the `> Consolidated session (0 actions)` marker — completely delete the session block

### WebSocket auth transport (AUTH-01, AUTH-02)

- **D-02:** WebSocket authentication uses `Authorization: Bearer` header on the upgrade request (not URL query param `?token=`)

**Rationale:** URL tokens appear in browser history, proxy logs, and server access logs. Moving to a header keeps the token in memory only and out of persistent logs. This is the standard approach for SPA WebSocket auth.

**Implementation notes from codebase:**
- Dashboard client connects via WebSocket URL: `ws://localhost:18790/ws?token=...` currently
- Daemon `verifyClient` callback currently parses `wsUrl.searchParams.get("token")`
- Change required: client sends `Authorization: Bearer <token>` header on WebSocket upgrade; daemon parses from `req.headers.authorization`
- Token is already in `sessionStorage` on the client — no storage change needed, only how it's sent
- HTTP API routes already use `X-Api-Token` header (separate concern, not changed here)

### Auth transport: `Authorization: Bearer` header

- **D-03:** Single-origin SPA; CSRF not a concern; token kept in JS memory, out of URL and proxy logs

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Session consolidation
- `.planning/ROADMAP.md` §Phase 1 — SESS-01, SESS-02 success criteria (delete zero-action sessions, never write marker entries)
- `.planning/REQUIREMENTS.md` §SESS-01, SESS-02 — exact requirement text

### WebSocket auth migration
- `.planning/ROADMAP.md` §Phase 1 — AUTH-01, AUTH-02 success criteria (Bearer header, no token in proxy logs)
- `.planning/REQUIREMENTS.md` §AUTH-01, AUTH-02 — exact requirement text

### Threat model
- `.planning/ROADMAP.md` §Phase 1 — AUTH-03 (threat model document at `docs/threat-model.md`)
- `.planning/REQUIREMENTS.md` §AUTH-03 — exact requirement text

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — daemon layer, WebSocket auth flow, session consolidation architecture

---

## Existing Code Insights

### Reusable Assets
- `src/daemon/cron-engine.ts` `consolidateMemory()` — existing consolidation logic; needs modification to handle zero-action deletion
- `src/daemon/wolf-daemon.ts` `safeCompareToken()` — existing constant-time token comparison (use for Bearer token parsing)
- `src/daemon/wolf-daemon.ts` `verifyClient` — current WebSocket auth entry point; will be refactored to read Authorization header
- `src/hooks/shared.ts` `getSessionDir()` — worktree-aware session directory (used for token-ledger.json, not directly relevant here)
- `src/hooks/stop.ts` `finalizeSession()` — session-end writer; not affected by consolidation changes (only cron-engine consolidates)

### Established Patterns
- Session block in `memory.md`: `## Session: YYYY-MM-DD HH:MM` header + table rows + `> Consolidated session (N actions)` marker
- Token stored in `daemon-token.tmp` with mode `0o600`; read on daemon startup
- WebSocket `verifyClient` does origin check + token validation before accepting connection

### Integration Points
- `wolf-daemon.ts` `verifyClient` → change auth from URL param to Authorization header
- `wolf-daemon.ts` `safeCompareToken()` → reuse for Bearer token extraction
- Dashboard `wolf-client.ts` → change WebSocket connect to send `Authorization: Bearer` header instead of `?token=` URL param
- `cron-engine.ts` `consolidateMemory()` → delete zero-action session blocks entirely, skip marker writing

---

## Specific Ideas

No specific requirements — open to standard approaches.

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

## Decisions Index

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | Delete zero-action session blocks entirely (no header, no marker) | No useful history; clean memory.md |
| D-02 | WebSocket auth via `Authorization: Bearer` header (not URL query param) | Keep token out of URL and proxy logs |
| D-03 | Bearer token in Authorization header; CSRF not a concern (single-origin SPA) | Standard SPA practice |

---

*Phase: 1-P0 Security Fixes + Quick Win*
*Context gathered: 2026-06-01*