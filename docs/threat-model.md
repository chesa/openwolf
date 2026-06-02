# OpenWolf Dashboard Authentication Threat Model

**Audience:** Security reviewers, developers integrating with the OpenWolf daemon
**Scope:** Dashboard WebSocket authentication transport and token lifecycle
**Last updated:** 2026-06-01

---

## Assets

- **Daemon auth token** (`daemon-token.tmp`): 256-bit random hex string (32 bytes from `crypto.randomBytes`), mode `0o600` (owner-only), generated on daemon startup. Stored in `.wolf/` directory.
- **sessionStorage token**: Client-side copy of the auth token, stored in browser `sessionStorage` (not persistent across browser sessions). Cleared on tab/window close.
- **WebSocket connection**: Real-time bidirectional channel between dashboard and daemon on the same origin.

---

## Threat Landscape

### 1. Token Disclosure via URL (RESOLVED)

**Threat:** Token appears in browser history, `Referer` headers, proxy logs, and server access logs when sent as a URL query parameter (`?token=`).

**Impact:** Attacker with access to logs or browser history can replay the token to authenticate as the user to the daemon WebSocket endpoint.

**Mitigation (AUTH-01 / AUTH-02):** Token is sent via the `Authorization: Bearer` HTTP header on WebSocket upgrade request. The HTTP Authorization header is:
- Not stored in browser history
- Not sent as a `Referer` header when navigating away
- Not logged by standard HTTP proxy software (only request path and method are logged by default)
- Not visible in server access logs unless header logging is explicitly configured

**Implementation:**
- Dashboard client (`src/dashboard/app/lib/wolf-client.ts`) receives the token via its constructor and sets `Authorization: Bearer <token>` on the WebSocket upgrade request. The token is read from `sessionStorage` by `src/dashboard/app/hooks/useWolfData.ts` and passed to `WolfClient`.
- Daemon (`src/daemon/wolf-daemon.ts`, `verifyClient` callback) reads the `Authorization` header and validates via constant-time comparison.

**Residual risk:** Proxy operators who explicitly configure header logging can capture the Authorization header. Mitigation: daemon binds to loopback (`127.0.0.1`) by default, confining traffic to the local machine. Network-exposed deployments should use `wss://` and consider certificate authentication.

**Previous state:** Token was transmitted via `?token=` query parameter in the WebSocket URL. This is now resolved.

---

### 2. XSS Token Theft

**Threat:** Malicious script injected into the dashboard page reads the auth token from `sessionStorage` and exfiltrates it.

**Impact:** Attacker can authenticate as the user to the daemon WebSocket endpoint using the stolen token.

**Attack surface:** The OpenWolf dashboard renders user-controlled content (project files, descriptions). A cross-site scripting (XSS) vulnerability in this content could allow an attacker to execute `sessionStorage.getItem("wolf_token")` in the browser context.

**Scope limitation:** The XSS attacker has the same session privileges as the user — this is inherent to any XSS in an application that stores secrets in JavaScript-accessible storage. The auth token being JS-readable (not in an `HttpOnly` cookie) is a known trade-off for this architecture.

**Mitigations:**
- Origin check on WebSocket upgrade: daemon rejects upgrade requests with mismatched `Origin` header (`src/daemon/wolf-daemon.ts` lines 285-316). Only same-origin requests from the dashboard are accepted.
- `location.host` check prevents cross-origin WebSocket dialdown.
- Token stored in `sessionStorage` (not `localStorage`) — cleared when the browser tab closes.
- Consider `Content-Security-Policy` to restrict inline script execution in future hardening.

**Notable:** Because the token is in `sessionStorage` (not an auto-transmitted cookie), an XSS payload must explicitly call `sessionStorage.getItem("wolf_token")`. The browser's same-origin policy prevents the injected script from reading `sessionStorage` for a different origin, but the dashboard and daemon share the same origin by design.

---

### 3. Logout / Token Invalidation

**Threat:** User wants to invalidate their token (e.g., leaving a shared workstation).

**Current behavior:** No active session invalidation list exists on the daemon. Token lifetime is bounded by:

1. **sessionStorage clear (immediate):** User opens browser DevTools, clears `sessionStorage`. On next reconnect attempt, the client has no token to send, and the daemon rejects the upgrade.

2. **Daemon restart (rotates token):** The daemon deletes `daemon-token.tmp` on graceful shutdown (SIGTERM/SIGINT). On next start, a new 256-bit token is generated (`src/daemon/wolf-daemon.ts` lines 22-35). The previous token is no longer valid.

**Limitation:** Active WebSocket connections are not immediately invalidated on daemon restart. Existing connections will receive an auth failure on next reconnect attempt. There is no server-side session revocation list — the daemon is stateless (validates against the secret file only).

**Acceptability:** This is acceptable for the single-user local SPA design. The token lifetime is naturally bounded by daemon uptime, and a restart rotates the secret.

---

### 4. Token Rotation

**Threat:** Token is suspected to be compromised and needs to be rotated.

**Mechanism:** Token is regenerated on every daemon restart. The file `daemon-token.tmp` is deleted on graceful shutdown (`src/daemon/wolf-daemon.ts` line 478).

**Trigger:** User runs `openwolf daemon restart` (or sends SIGTERM to the daemon process). Next start generates a new 256-bit token via `crypto.randomBytes(32)`.

**Limitation:** Active WebSocket connections are not immediately invalidated. They will reconnect with the new token or fail auth naturally. There is no scheduled rotation — rotation is on-demand only.

**No scheduled rotation** is implemented. Rotation is triggered manually via daemon restart.

---

### 5. Browser History / Cache

**Threat:** Token persists in browser back-forward cache or history after navigation.

**Mitigation:** Token is not placed in the URL. Browser history does not contain the token. The previous approach (token in `?token=` query param) is resolved.

---

### 6. Proxy / Server Access Logs

**Threat:** Standard HTTP access logs capture request URLs including query strings.

**Mitigation (AUTH-02):** Token is in the `Authorization` header — standard proxy access logs capture only the request path (e.g., `/ws`), not HTTP headers. The token does not appear in access logs.

**Note:** If the proxy is configured to log all headers, the `Authorization` header would be visible. This is rare for standard proxy software but possible for introspection proxies.

---

## Security Properties

| Property | Mechanism |
|----------|-----------|
| **Authentication** | Token validated via constant-time comparison (`crypto.timingSafeEqual`) in `safeCompareToken` (`src/daemon/wolf-daemon.ts` lines 80-91), called from `verifyClient` (lines 324-345). Prevents timing side-channel attacks from local co-tenants. |
| **Authorization** | Token grants access to the daemon WebSocket endpoint serving `.wolf/` state files and cron management. |
| **Transport security** | By default, daemon binds to `127.0.0.1` — not exposed to the LAN. Setting `dashboard.bind: "0.0.0.0"` in `.wolf/config.json` (under `openwolf.dashboard`) enables network access (with associated risk). |
| **Session model** | Stateless. Daemon does not track issued tokens — validation is against the secret file only. No revocation list. |
| **Token entropy** | 256-bit random hex string (`crypto.randomBytes(32)`) — infeasible to brute force. |

---

## Out of Scope

- **Authentication model rewrite** (SSO, OAuth, multi-user): this document covers transport only, not auth identity.
- **Multi-user auth**: single-user local daemon design.
- **HTTPS/TLS**: SPA connects over `ws://` on loopback — upgrade to `wss://` for network-exposed deployments.
- **Content injection in dashboard**: XSS in user project files is a known trade-off of the feature set and is out of scope for this document.

---

## References

- `src/daemon/wolf-daemon.ts` — Daemon token generation (lines 22-35), `safeCompareToken` (lines 80-91), `isAllowedOrigin` (lines 285-316), `verifyClient` (lines 324-345), graceful shutdown (lines 466-492)
- `src/dashboard/app/lib/wolf-client.ts` — WebSocket client, `Authorization: Bearer` header transport
- `src/dashboard/app/hooks/useWolfData.ts` — Reads `wolf_token` from `sessionStorage`, passes to `WolfClient`
- `src/dashboard/app/main.tsx` — Bootstrap: reads token from URL param, stores as `wolf_token` in `sessionStorage`
- `.wolf/config.json` — `openwolf.dashboard.bind` (loopback default), `openwolf.daemon.port`