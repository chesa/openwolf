---
phase: 12
slug: framework-blind-curation-machinery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/hooks/wolf-pantry.test.ts tests/hooks/stop.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/hooks/wolf-pantry.test.ts tests/hooks/stop.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | R7a | — | N/A | unit | `npx vitest run tests/hooks/wolf-pantry.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | R7a | — | N/A | unit | `npx vitest run tests/hooks/stop.test.ts` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | R7b | — | N/A | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | R9 | — | N/A | unit | `npx vitest run tests/cli/learnings-cmd.test.ts` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | R7b | — | N/A | unit | `npx vitest run tests/cli/learnings-check.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | R9 | — | N/A | unit | `npx vitest run tests/cli/status.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/hooks/wolf-pantry.test.ts` — stubs for R7a/R7b `collectAllEntries()` + presence-based pending detection
- [ ] `tests/cli/learnings-check.test.ts` — stubs for R7b `openwolf learnings check` exit-code contract (0/1/2)

*Existing infrastructure (vitest) covers all phase requirements — no new test runner install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pnpm build:hooks` → `openwolf update` copy step live | R7a | Cannot unit-test file copy via exec | Run `pnpm build:hooks && node dist/bin/openwolf.js update` and verify `.wolf/hooks/stop.js` is updated |
| C1 grep gate | C1 | Grep of output, not behavior | `grep -rIiE 'bitbucket\|github\|pipelines\|pre-push' src/` and `grep -rIiE 'gsd\|superpowers\|gstack\|\.planning' src/templates src/hooks src/cli` both return zero |
| C2 type-check gate | C2 | Compiler, not runtime | `tsc --noEmit -p tsconfig.hooks.json` exits 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
