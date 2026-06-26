---
phase: 11-framework-blind-resume-protocol
plan: "01"
subsystem: templates, cli, tests
tags: [framework-blind, resume-protocol, STATUS.md-removal, execution_layer]
dependency_graph:
  requires: []
  provides: [STATUS.md-free-init, execution_layer-config-slot, framework-blind-OPENWOLF]
  affects: [src/templates, src/cli/init.ts, tests/cli/init.test.ts]
tech_stack:
  added: []
  patterns: [strict-JSON-sibling-note-key, tool-agnostic-prose]
key_files:
  created: []
  modified:
    - src/templates/OPENWOLF.md
    - src/templates/claude-rules-openwolf.md
    - src/templates/config.json
    - src/cli/init.ts
    - tests/cli/init.test.ts
  deleted:
    - src/templates/STATUS.md
decisions:
  - "D11-01: Delete STATUS.md template — openwolf init no longer seeds STATUS.md"
  - "D11-02: OPENWOLF.md asserts negative boundary; generic 3-step resume order (execution layer plan, cerebrum.md, memory.md)"
  - "D11-03: claude-rules-openwolf.md mirrors tool-agnostic resume seam"
  - "D11-04: All three seedStatus removal sites atomic — function + 2 call sites deleted together"
  - "D11-06: execution_layer: null + execution_layer_note in template config.json (strict JSON, no // comment)"
  - "D11-10: wolf-gitignore STATUS.md comment already absent (idempotent no-op)"
  - "D11-11: STATUS.md removed from REQUIRED fixture in init.test.ts"
metrics:
  duration: "154s"
  completed: "2026-06-26"
  tasks_completed: 3
  files_changed: 5
  files_deleted: 1
status: complete
---

# Phase 11 Plan 01: Framework-Blind Resume Protocol Summary

**One-liner:** Deleted STATUS.md template, removed seedStatus from init.ts, and rewrote OPENWOLF.md/claude-rules to a tool-agnostic 3-step resume order with an `execution_layer` config slot.

## Objective

Remove STATUS.md as a framework-seeded artifact and rewrite the resume protocol to be tool-agnostic, while introducing the optional `openwolf.execution_layer` config slot.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete STATUS.md template, remove seedStatus from init.ts, strip wolf-gitignore STATUS comment | ece37ad | src/templates/STATUS.md (deleted), src/cli/init.ts |
| 2 | Rewrite OPENWOLF.md and claude-rules-openwolf.md to framework-blind resume seam | adfc2e1 | src/templates/OPENWOLF.md, src/templates/claude-rules-openwolf.md |
| 3 | Add execution_layer slot to config.json and invert init test STATUS assertion | 308a791 | src/templates/config.json, tests/cli/init.test.ts |

## Verification

- `tsc --noEmit`: clean (no orphan seedStatus reference)
- `npx vitest run tests/cli/init.test.ts`: 36/36 pass
- `grep -rIiE 'gsd|superpowers|gstack|\.planning' src/templates src/cli`: zero hits (C1 pass)
- `test ! -f src/templates/STATUS.md`: template deleted
- `grep -c 'STATUS.md' src/templates/wolf-gitignore`: 0 (D11-10 satisfied, was already absent)
- `node -e "JSON.parse(require('fs').readFileSync('src/templates/config.json','utf-8'))"`: exits 0
- `config.json openwolf.execution_layer === null`: confirmed
- `grep -c '"STATUS.md"' tests/cli/init.test.ts`: 0

## Decisions Made

- **D11-04 (atomic removal):** All three seedStatus removal sites in init.ts were removed together — the function body, the fresh-init call site, and the upgrade `else if` branch. Partial removal is a compile error; the atomic approach is correct.
- **D11-06 (sibling note key):** `execution_layer_note` is a sibling JSON string key rather than a `//` comment. Strict JSON requires this; the note is discoverable in the file without breaking `JSON.parse`.
- **D11-10 (idempotent):** wolf-gitignore STATUS.md comment was already absent at implementation time (per RESEARCH.md Open Question 2 RESOLVED). The grep-and-remove approach was used and confirmed 0 matches — no-op, criterion satisfied.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/templates/STATUS.md`: MISSING (expected — deleted)
- `src/templates/OPENWOLF.md`: FOUND
- `src/templates/claude-rules-openwolf.md`: FOUND
- `src/templates/config.json`: FOUND
- `src/cli/init.ts`: FOUND
- `tests/cli/init.test.ts`: FOUND
- Commit ece37ad: FOUND
- Commit adfc2e1: FOUND
- Commit 308a791: FOUND
