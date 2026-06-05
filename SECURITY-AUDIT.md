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
| **Severity** | HIGH |
| **Category** | Arbitrary file write / prompt injection persistence |
| **Confidence** | 9/10 |
| **File** | `src/daemon/cron-engine.ts:410-414` |
| **CWE** | CWE-74 (Injection), CWE-913 (Improper Control of Dynamically-Managed Code Resources) |

#### Description

The `runAiTask` method sends a user-defined prompt from
`cron-manifest.json` to `claude -p` and processes the raw output. If the
AI response is not valid JSON and contains any of three generic header
strings (`## User Preferences`, `## Key Learnings`, `# Cerebrum`), the
**entire output** overwrites `cerebrum.md` via `writeText` — no backup,
no structural validation, no user confirmation.

`cerebrum.md` is a core instruction file read by Claude Code every
session (per the OpenWolf protocol). It governs coding conventions, the
"Do-Not-Repeat" list, and user preferences.

```typescript
// cron-engine.ts:410-414
} catch {
  if (result.includes("## User Preferences") || result.includes("## Key Learnings") || result.includes("# Cerebrum")) {
    writeText(path.join(this.wolfDir, "cerebrum.md"), result);
  }
}
```

#### Attack Vectors

**Vector 1 — Malicious cron-manifest modification:**
An attacker who gains write access to `.wolf/cron-manifest.json` (e.g.,
via a malicious npm `postinstall` script, a compromised dependency, or a
rogue Claude Code hook) adds a cron task with a prompt engineered to
produce output containing the trigger headers. The daemon executes the
task, `cerebrum.md` is overwritten with attacker-controlled instructions,
and every subsequent Claude Code session follows those instructions.
Because `.wolf/` is gitignored, the modification leaves no audit trail
visible to `git status`.

**Vector 2 — Accidental destruction by legitimate tasks:**
The shipped default `cerebrum-reflection` task is designed to trigger
this exact code path. Since AI output is non-deterministic, a malformed,
truncated, or hallucinated response that happens to contain one of the
three trigger strings will destroy the entire `cerebrum.md` with no
recovery path.

#### Aggravating Factors

- No backup is created before overwrite
- No structural validation of output (only substring presence check)
- Trigger strings are extremely generic — `## Key Learnings` could
  appear in any knowledge-related AI response
- `.wolf/` is gitignored, so changes are invisible and unrecoverable
  via git
- Runs silently in an automated daemon with no user approval step
- Low trigger bar: only one of three strings needs to appear anywhere
  in the output

#### Action Items

1. **[MUST] Never overwrite `cerebrum.md` directly from AI output.**
   Write to a staging file (`cerebrum-draft.md` or append to
   `suggestions.json`) and require user review before promotion.

2. **[MUST] Create a timestamped backup before any write** to
   `cerebrum.md` (e.g., `cerebrum.md.bak.{ISO-timestamp}`), so
   accidental or malicious overwrites are recoverable.

3. **[SHOULD] Validate structural integrity** of AI output before
   writing: required sections present, output length within reasonable
   bounds relative to original, no preamble text before headers.

4. **[SHOULD] Restrict which cron task types can write to instruction
   files.** Consider requiring an explicit `"writes_to":
   ["cerebrum.md"]` declaration in the manifest, or limiting
   cerebrum writes to a dedicated task type with stricter controls.

5. **[SHOULD] Log a prominent warning** (not just debug) whenever
   `cerebrum.md` is modified by an automated task, so users have
   visibility into daemon-initiated changes.

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
