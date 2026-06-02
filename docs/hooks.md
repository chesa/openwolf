# Hooks

OpenWolf registers 6 hooks with Claude Code. They fire automatically on every action. No user interaction required.

All hooks are **pure Node.js file I/O**. No network calls, no AI, no external dependencies. They read JSON on stdin from Claude Code and communicate via exit codes and stderr.

## Hook Lifecycle

```
┌──────────────┐
│ Claude Code   │
│ session start │──→  session-start.js  ──→ creates _session.json, logs to memory.md
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│ Claude wants  │──→   │ pre-read.js  │──→ warns on repeated reads, shows anatomy info
│ to READ      │      └──────────────┘
└──────┬───────┘
       │ (read happens)
       ▼
┌──────────────┐      ┌──────────────┐
│ Read complete │──→   │ post-read.js │──→ estimates tokens, records to _session.json
└──────────────┘      └──────────────┘

┌──────────────┐      ┌───────────────┐
│ Claude wants  │──→   │ pre-write.js  │──→ checks cerebrum Do-Not-Repeat patterns
│ to WRITE     │      └───────────────┘
└──────┬───────┘
       │ (write happens)
       ▼
┌──────────────┐      ┌────────────────┐
│ Write done    │──→   │ post-write.js  │──→ updates anatomy.md, appends to memory.md
└──────────────┘      └────────────────┘

┌──────────────┐      ┌──────────┐
│ Claude stops  │──→   │ stop.js  │──→ writes session summary to token-ledger.json
└──────────────┘      └──────────┘
```

## `session-start.js`

**Fires:** When a Claude Code session begins.

**What it does:**
1. Creates a fresh `_session.json` in the session directory (`.wolf/` or `.wolf/sessions/<id>/` in worktree mode)
2. Appends a session header to `.wolf/memory.md` with a table template
3. Increments the `total_sessions` counter in `token-ledger.json`

**Timeout:** 5 seconds

---

## `pre-read.js`

**Fires:** Before Claude reads any file (via the Read tool).

**Stdin:** `{ "tool_name": "Read", "tool_input": { "file_path": "src/index.ts" } }`

**What it does:**
1. Checks if this file was already read this session
2. If repeated: writes a warning to stderr. _"⚡ OpenWolf: file.ts was already read this session (~380 tokens)"_
3. Looks up the file in `anatomy.md` and prints the description. _"📋 OpenWolf anatomy: file.ts, Main entry point (~380 tok)"_
4. Records anatomy hit or miss in the session tracker

**Behavior:** Always exits 0 (allows the read). Warnings only, never blocks.

**Timeout:** 5 seconds

---

## `pre-write.js`

**Fires:** Before Claude writes, edits, or multi-edits any file.

**Stdin:** `{ "tool_name": "Write", "tool_input": { "file_path": "...", "content": "..." } }`

**What it does:**
1. Reads `cerebrum.md` and extracts entries from the `## Do-Not-Repeat` section
2. For each entry, checks if the content being written contains flagged patterns
3. If matched: writes a warning to stderr. _"⚠️ OpenWolf cerebrum warning: 'never use var', check your code"_

**Pattern matching:** Simple regex on quoted strings and "never use X" / "avoid X" phrases. No LLM involved.

**Behavior:** Always exits 0 (allows the write). Warnings only, never blocks.

**Timeout:** 5 seconds

---

## `post-read.js`

**Fires:** After Claude successfully reads a file.

**Stdin:** `{ "tool_input": { "file_path": "..." }, "tool_output": { "content": "..." } }`

**What it does:**
1. Estimates token count of the file content (character ratio based on file extension)
2. Updates the file's entry in `_session.json` with the actual token count

**Timeout:** 5 seconds

---

## `post-write.js`

**Fires:** After Claude writes, edits, or multi-edits a file. This is the most important hook.

**Stdin:** `{ "tool_name": "Write", "tool_input": { "file_path": "...", "content": "..." } }`

**What it does:**
1. **Updates `anatomy.md`**: reads the written file, extracts a description, estimates tokens, upserts the entry in the correct directory section. Writes atomically (temp + rename).
2. **Appends to `memory.md`**: logs the action with timestamp, file path, and token estimate.
3. **Records in `_session.json`**: file, action type, tokens, timestamp.

**Timeout:** 10 seconds (longer because anatomy update involves file parsing)

---

## `stop.js`

**Fires:** When Claude finishes a response.

**What it does:**
1. Reads `_session.json` for accumulated session data
2. If there's been any activity (reads or writes):
   - Builds a session entry with read/write totals
   - Appends the session to `token-ledger.json`
   - Updates lifetime counters
   - Calculates estimated savings (anatomy hits + blocked repeated reads)

**Note:** The stop hook fires every time Claude finishes a response, not just at session end. It only writes to the ledger when there's significant data.

**Timeout:** 10 seconds

---

## Worktree Helper (`worktree-helper.js`)

**Purpose:** Git worktree detection for session isolation per branch.

### Exports

| Export | Signature | Description |
|--------|-----------|-------------|
| `detectWorktreeContextRaw` | `(dir: string) => WorktreeContext` | Detects whether `dir` is in a git worktree; returns context object |
| `isNotARepoError` | `(err: unknown) => boolean` | Classifies error as "not a git repo" (exit status 128) |
| `isMissingGitError` | `(err: unknown) => boolean` | Classifies error as "git binary not found" (ENOENT) |
| `isTimeoutError` | `(err: unknown) => boolean` | Classifies error as "git command timed out" (SIGTERM / ETIMEDOUT) |

### Types

```typescript
type WorktreeId = string & { readonly __brand: "WorktreeId" };

type WorktreeContext =
  | { isWorktree: false; mainRepoRoot: string; worktreePath: string; branch: string }
  | { isWorktree: true; mainRepoRoot: string; worktreePath: string; worktreeId: WorktreeId; branch: string };
```

### Error Handling Contract

| Error | Condition | Callers Should |
|-------|-----------|----------------|
| Not a repo | `git rev-parse` exits 128 | Use main repo root directly |
| Git missing | `git` binary not found (ENOENT) | Log warning, fall back to single-repo mode |
| Timeout | Command exceeds 2 s (SIGTERM / ETIMEDOUT) | Log warning, treat as single-repo mode |

### Usage Example

```typescript
import {
  detectWorktreeContextRaw,
  isNotARepoError,
  isMissingGitError,
  isTimeoutError,
} from "./worktree-helper.js";

const ctx = detectWorktreeContextRaw(process.cwd());

if (ctx.isWorktree) {
  console.log(`Worktree ${ctx.worktreeId} on branch "${ctx.branch}"`);
  console.log(`Main repo: ${ctx.mainRepoRoot}`);
} else {
  console.log(`Single-repo mode, branch "${ctx.branch}"`);
}

// Classify errors from git operations
try {
  // ... git operation ...
} catch (err) {
  if (isNotARepoError(err)) {
    // Handle no-repo gracefully
  } else if (isMissingGitError(err)) {
    console.warn("git not found — falling back to single-repo mode");
  } else if (isTimeoutError(err)) {
    console.warn("git command timed out — falling back to single-repo mode");
  } else {
    throw err;
  }
}
```

---

## Session State (`_session.json`)

An ephemeral file in the session directory (`.wolf/` normally, or `.wolf/sessions/<id>/` in worktree mode) that tracks the current session:

```json
{
  "session_id": "session-2026-03-09-1430",
  "started": "2026-03-09T14:30:00Z",
  "files_read": {
    "src/index.ts": { "count": 1, "tokens": 380, "first_read": "..." }
  },
  "files_written": [
    { "file": "src/api.ts", "action": "edit", "tokens": 620, "at": "..." }
  ],
  "anatomy_hits": 4,
  "anatomy_misses": 1,
  "repeated_reads_warned": 1,
  "cerebrum_warnings": 0,
  "stop_count": 0
}
```

This file is deleted and recreated on each `SessionStart`. It does not persist across sessions.
