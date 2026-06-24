# Security Review: OpenWolf Repository

**Scope:** Full repository audit (`develop` branch)
**Date:** 2026-06-05
**Audited by:** Automated multi-agent security review (3 parallel analysis agents + 4 false-positive verification agents)
**Audited areas:** Daemon/API, hooks/file operations, CLI commands, dashboard

## Executive Summary

One confirmed HIGH-severity vulnerability was identified: the cron engine
can overwrite `cerebrum.md` (a core instruction file) with unvalidated AI
output, enabling prompt injection persistence. Four additional candidates
were investigated and filtered out as false positives after independent
verification.

The codebase demonstrates solid security engineering overall, with
timing-safe token comparison, shell-injection-safe subprocess calls,
path traversal guards on cron context files, atomic file writes, and
loopback-only default binding.

---

## Confirmed Vulnerabilities

### HIGH-001: Prompt Injection Persistence via `cerebrum.md` Overwrite

| Field | Value |
|-------|-------|
| **Status** | FIXED |
| **Severity** | HIGH (at time of discovery) |
| **Category** | Arbitrary file write / prompt injection persistence |
| **Original Confidence** | 9/10 |
| **File** | `src/daemon/cron-engine.ts:414-426` |
| **CWE** | CWE-74 (Injection), CWE-913 (Improper Control of Dynamically-Managed Code Resources) |

#### Description (Original Vulnerability)

The `runAiTask` method previously sent a user-defined prompt from
`cron-manifest.json` to `claude -p` and processed the raw output. If the
AI response was not valid JSON and contained any of three generic header
strings (`## User Preferences`, `## Key Learnings`, `# Cerebrum`), the
**entire output** would overwrite `cerebrum.md` via `writeText` — no backup,
no structural validation, no user confirmation.

`cerebrum.md` is a core instruction file read by Claude Code every
session (per the OpenWolf protocol). It governs coding conventions, the
"Do-Not-Repeat" list, and user preferences.

#### Remediation

The vulnerability has been **remediated via a staging-file design**.
Current code implements the following mitigations:

```typescript
// cron-engine.ts:414-426 (FIXED)
if (action.writes_to?.includes("cerebrum-draft.md")) {
  const draftPath = path.join(this.wolfDir, "cerebrum-draft.md");
  // Write to staging file for user review instead of direct overwrite
  writeText(draftPath, result);
  this.logger.warn(
    `⚠️  cerebrum.md draft generated at cerebrum-draft.md. Review and promote manually to avoid unintended instruction changes.`
  );
  // Also append to memory so the next Claude session sees the update
  appendText(
    path.join(this.wolfDir, "memory.md"),
    `\n| cron | cerebrum-draft.md updated by AI task | cerebrum-draft.md | pending-review | ~tokens |`
  );
}
```

**Mitigations implemented:**

1. ✅ **Staging file instead of direct overwrite:** Writes to `cerebrum-draft.md`
   instead of `cerebrum.md`. User must manually review and promote the draft
   to activate it.

2. ✅ **Explicit writes_to gating:** Requires an explicit `writes_to: ["cerebrum-draft.md"]`
   declaration in the cron task manifest. Without this gate, no write occurs.

3. ✅ **Warning logging:** Emits a prominent warning (not debug level) when
   the draft is generated, providing visibility into daemon-initiated changes.

4. ✅ **Memory audit trail:** Appends an entry to `memory.md` with the timestamp
   and pending-review status, creating a recoverable audit trail.

**On the original [MUST] backup requirement:** The original audit also
required a timestamped backup before any write to `cerebrum.md`. That
requirement is obsoleted by the staging design — the daemon never overwrites
`cerebrum.md` in place, so there is nothing to back up at AI-write time. The
eventual human promotion step (manually copying `cerebrum-draft.md` to
`cerebrum.md`) remains out-of-band and unbacked; that is a deliberate manual
action, not the daemon-driven path this finding covers.

**Attack vectors neutralized:**

- Malicious or accidental overwrites of `cerebrum.md` can no longer occur via
  AI output alone.
- Even if `cron-manifest.json` is compromised, the attacker must also enable
  the `writes_to` gate; manual review is always required before promotion.
- Legitimate AI tasks cannot accidentally destroy `cerebrum.md` via truncation
  or hallucination.
- The shipped default `cerebrum-reflection` task declares no
  `writes_to: ["cerebrum-draft.md"]`, so the gate never fires and the task
  writes nothing by default — a deliberate safe default; generating a draft
  requires opting in explicitly.

---

## Investigated and Filtered Out (False Positives)

These candidates were flagged by initial analysis but rejected after
independent false-positive verification.

### FP-001: Path Traversal in `restoreCommand`

| Field | Value |
|-------|-------|
| **File** | `src/cli/update.ts:407-417` |
| **Initial Confidence** | 0.9 |
| **Verified Confidence** | 2/10 |
| **Verdict** | False positive |

`backupName` comes from a CLI positional argument (`openwolf restore
<backup>`). The local user who types the command already has full
filesystem access. No privilege boundary is crossed, no remote input
reaches this code, and hooks do not invoke `openwolf restore`. This is
the "user attacking themselves" pattern.

### FP-002: Prototype Pollution in `deepMergeDefaults`

| Field | Value |
|-------|-------|
| **File** | `src/utils/fs-safe.ts:20-35` |
| **Initial Confidence** | 0.85 |
| **Verified Confidence** | 2/10 |
| **Verdict** | False positive |

The `__proto__` setter can be triggered on the result object, but this
is per-object prototype chain modification — NOT global
`Object.prototype` pollution. Input comes exclusively from local `.wolf/`
JSON files. Config objects are consumed with explicit property access and
nullish coalescing fallbacks, so injected prototype properties have no
downstream effect.

### FP-003: Unauthenticated Static File Serving

| Field | Value |
|-------|-------|
| **File** | `src/daemon/wolf-daemon.ts:70-76` |
| **Initial Confidence** | 0.9 |
| **Verified Confidence** | 3/10 |
| **Verdict** | False positive |

`express.static(dashboardDir)` serves the Vite build output without
auth. However: the build contains only `index.html` and content-hashed
JS/CSS bundles (no source maps, no `.env`, no dotfiles). Express's
default `dotfiles: 'ignore'` already hides hidden files. Default bind is
loopback-only. This is standard SPA architecture.

### FP-004: WebSocket Origin Check Bypass

| Field | Value |
|-------|-------|
| **File** | `src/daemon/wolf-daemon.ts:311-313` |
| **Initial Confidence** | 0.85 |
| **Verified Confidence** | N/A (not independently exploitable) |
| **Verdict** | Not exploitable |

The `Host`-header-based origin match on non-loopback bind is bypassable
in theory, but the WebSocket upgrade also requires a valid Bearer token
(lines 334-339). The token requirement prevents exploitation even if the
origin check is bypassed. Defense-in-depth only.

---

## Positive Security Patterns

The following security-positive patterns were observed during the audit:

| Pattern | Location | Notes |
|---------|----------|-------|
| Timing-safe token comparison | `wolf-daemon.ts:80-92` | `crypto.timingSafeEqual` with length pre-check |
| Token file permissions | `wolf-daemon.ts` | `0o600` (owner-only read/write) |
| Header-only auth transport | `wolf-daemon.ts:94-106` | No `?token=` in API calls; stripped from URL on page load |
| No shell injection | `worktree-helper.ts` | `execFileSync` with array args, not string interpolation |
| Stdin-piped prompts | `cron-engine.ts:372-382` | `claude -p` prompt via stdin, not shell argument |
| Path traversal guard (cron) | `cron-engine.ts:333-345` | `path.resolve` + prefix check + case-insensitive normalization |
| Atomic file writes | `fs-safe.ts` | temp+rename pattern in `writeJSON`, `writeText`, `safeCopyFile` |
| Loopback-only default | `wolf-daemon.ts:257-258` | `127.0.0.1` bind with documented warnings for `0.0.0.0` |
| No `dangerouslySetInnerHTML` | Dashboard (all `.tsx`) | React's built-in XSS protection fully in use |
| Dual-layer WebSocket auth | `wolf-daemon.ts:324-345` | Origin validation AND token auth on upgrade |

---

## Defense-in-Depth Recommendations

These are not vulnerabilities but low-effort hardening measures worth
considering:

1. **Add `dotfiles: 'deny'` to `express.static` options**
   (`wolf-daemon.ts:75`). Express default is `'ignore'` (silent 403),
   but `'deny'` returns an explicit error. Closes the edge case if
   build hygiene ever fails.

2. **Filter `__proto__`/`constructor` keys in `deepMergeDefaults`**
   (`fs-safe.ts:25`). Not exploitable today, but a one-line guard
   (`if (key === '__proto__' || key === 'constructor') continue;`)
   prevents the per-object prototype modification entirely.

3. **Add path containment check in `resolveWolfFile`**
   (`src/utils/paths.ts:13-15`). Verify the resolved path starts with
   the `.wolf/` directory prefix before returning. Prevents future
   callers from accidentally enabling path traversal.

4. **Validate `backupName` in `restoreCommand`**
   (`src/cli/update.ts:407`). Reject values containing `..` or path
   separators as a defense-in-depth measure, even though the CLI arg
   threat model is low.
