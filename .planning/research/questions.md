---
title: Open research questions
date: 2026-08-24
---

# Open Research Questions

## Q-01 — Do upstream's `withFileLock` and `exclude_patterns` satisfy the acme field cases that drove Pillar C and R6?

**Raised:** 2026-08-24 (`/gsd-explore`, reconciliation scoping)
**Gates:** Milestone v1.3 sizing — decides whether five fork features get
re-ported or seven. See
[`../seeds/v1.3-baseline-reset-on-v2.5.0.md`](../seeds/v1.3-baseline-reset-on-v2.5.0.md).

### Context

Upstream independently converged on both of these without the fork's files:

| Fork | Upstream |
|---|---|
| `src/hooks/wolf-lock.ts`, `wolf-json.ts` | `withFileLock` present in 4 files; no `wolf-lock.ts` |
| `src/hooks/wolf-ignore.ts` | `exclude_patterns` present in 4 files; no `wolf-ignore.ts` |

Convergent but differently structured, so reconciling means deleting fork code
rather than merging it — *if* upstream's versions actually hold up.

### What to determine

1. Is upstream's `withFileLock` reentrant? The fork's is explicitly not, and
   `updateJSON()` exists because a separate `readJSON`+`writeJSON` loses
   concurrent updates. Does upstream have an equivalent read-modify-write
   primitive, or does it have the bug the fork designed around?
2. Does upstream's `exclude_patterns` honor the R3 out-of-project `../` guard
   and the R5 code-file gate, and does it read the consumer's root `.gitignore`?
3. Does upstream's matcher run **inside the hook** with zero npm dependencies?
   D-18 constrained the fork's to dep-free because hooks cannot import from
   `src/utils/` at runtime. Upstream may have taken the dependency.
4. Same question for the P0 hygiene set (R1/R2/R3/R5/Q1/Q2) against upstream's
   new `anatomy-store` / `anatomy-lock`.

### How to answer it

The fork already has acme-grounded regression tests built exactly for this —
Phase 08 produced "permanent R3 and R5 regression tests grounded in real acme
field inputs plus a frozen fixture capturing the pre-fix leak symptom." Port
those tests onto a v2.5.0 checkout and run them. Green means delete the fork's
implementation; red means keep it and the milestone grows by two features.

This is a measurement, not an opinion — the fixtures exist.
