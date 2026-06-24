# Requirements: CHESA Fork Team Toolkit — v1.1

**Defined:** 2026-06-23
**Milestone:** v1.1 Shared-Checkout Concurrency — Pillar C
**Core Value:** Make the CHESA fork of OpenWolf easy to install, safe to collaborate on, and manageable to keep synced with upstream.

## v1.1 Requirements

### Propose-mode Infrastructure (PROP)

- [ ] **PROP-01**: `appendProposal(target: 'cerebrum' | 'anatomy', content: string)` helper exists in `src/hooks/wolf-files.ts` and appends a timestamped proposal entry to `.wolf/sessions/<worktreeId|sessionId>/proposed-learnings.md` (per-session file; no contention possible)
- [ ] **PROP-02**: Any hook currently calling `appendMarkdown` targeting `cerebrum.md` or `anatomy.md` is updated to call `appendProposal()` instead

### Protocol Update (PROTO)

- [ ] **PROTO-01**: `src/templates/OPENWOLF.md` is updated to instruct Claude to write learnings to the per-session staging file rather than directly editing `cerebrum.md` or `anatomy.md`

### Review/Merge CLI (MERGE)

- [ ] **MERGE-01**: `openwolf learnings` lists all pending proposal entries across all session staging files, showing session ID, timestamp, target file, and content preview
- [ ] **MERGE-02**: `openwolf learnings merge` interactively merges selected proposals into `cerebrum.md` and/or `anatomy.md`; this command is the only process that writes the shared files; the write is protected by `withFileLock`
- [ ] **MERGE-03**: After a successful merge, processed entries are moved from `proposed-learnings.md` to `merged-learnings.md` in the same session directory (history preserved, staging file stays clean)

### Tests (TEST)

- [ ] **TEST-01**: Concurrency test — two simulated sessions each append a distinct proposal to their respective staging files; after `openwolf learnings merge`, both entries are present in `cerebrum.md` with no loss
- [ ] **TEST-02**: Integration test — `openwolf learnings` correctly enumerates proposals from multiple session directories

## v2 Requirements

### Dashboard

- **DASH-01**: Dashboard panel lists pending proposals across all sessions (mirrors `openwolf learnings` output)
- **DASH-02**: Dashboard panel allows approving and merging proposals without using the CLI

## Out of Scope

| Feature | Reason |
|---------|--------|
| `memory.md` propose-mode | Per-dev append-only log; interleaving is acceptable and the file is gitignored; excluded per spec |
| Scanner-initiated `anatomy.md` rewrites | The scanner writes the full file from scratch as an authoritative operation; single-process, no concurrency concern |
| Dashboard learning panel | Deferred to v1.2 — ship CLI first, add UI in a follow-on milestone |
| Real-time CRDT semantics | Human-merge (propose-mode) is the chosen model; CRDT would be a different system entirely |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROP-01 | — | Pending |
| PROP-02 | — | Pending |
| PROTO-01 | — | Pending |
| MERGE-01 | — | Pending |
| MERGE-02 | — | Pending |
| MERGE-03 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |

**Coverage:**
- v1.1 requirements: 8 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 8 ⚠️

---
*Requirements defined: 2026-06-23*
*Last updated: 2026-06-23 after initial definition*
