# Phase 3: P1 Modularization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 03-P1 Modularization
**Areas discussed:** Scanner extraction organization, Test consolidation strategy, Hook contract docs scope

---

## Scanner extraction organization

| Option | Description | Selected |
|--------|-------------|----------|
| Language-family modules (4 files) | Group by domain: web, systems, scripting, data. Main file keeps shared infrastructure. | ✓ |
| Individual files per language | 20+ modules, many under 50 lines. | |
| Keep monolithic | Violates SCAN-01 outright. | |

**User's choice:** [auto] Selected "language-family modules" (recommended default)
**Notes:** All 4 modules well under 5,000-token budget. extract-web (~1,800–2,000 tok), extract-systems (~2,500–2,800 tok), extract-scripting (~2,900–3,300 tok), extract-data (~850–1,000 tok).

---

## Test consolidation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror src/ under tests/ | tests/cli/, tests/hooks/, tests/utils/, tests/security.test.ts | ✓ |
| Flat tests/ directory | All 9 files in one folder | |
| Move only scattered tests | Mixed co-located + top-level structure | |

**User's choice:** [auto] Selected "mirror src/ under tests/" (recommended default)
**Notes:** Matches Node.js ecosystem convention. Import paths must be updated in every moved test. vitest.config.ts include changes from src/**/*.test.ts to tests/**/*.test.ts.

---

## Hook contract docs scope

| Option | Description | Selected |
|--------|-------------|----------|
| API reference + usage example | Exports table, types, error handling contract, minimal code snippet | ✓ |
| Minimal signatures only | Function names and parameter types | |
| Full algorithm documentation | Implementation details that may change | |

**User's choice:** [auto] Selected "API reference + usage example" (recommended default)
**Notes:** Error classification (isNotARepoError vs isMissingGitError vs isTimeoutError) is the subtlest part of the API and the most valuable to document.

---

## Claude's Discretion

- Import path updates in moved tests (planner's discretion)
- Deletion of empty src/tests/ directory after move
- docs/hooks.md section placement (after hook lifecycle, before Session State)

## Deferred Ideas

- De-duplicating extractDescription between wolf-describe.ts and description-extractor.ts — future refactor phase
- Adding extractor-specific tests — optional, no requirement
- Converting docs/hooks.md to generated API doc from JSDoc — out of scope
