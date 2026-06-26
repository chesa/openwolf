---
phase: 9
slug: tracking-hygiene-one-authoritative-ignore-list
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v1.x (project-standard) |
| **Config file** | `vitest.config.ts` (root) + `tsconfig.json` |
| **Quick run command** | `npx vitest run tests/cli/init.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds (unit); ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/cli/init.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 0 | R4 | — | N/A | unit | `npx vitest run tests/cli/init.test.ts` | ✅ | ⬜ pending |
| 9-01-02 | 01 | 0 | R4 | — | N/A | unit | `npx vitest run tests/cli/init.test.ts` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 0 | R4 | — | N/A | unit | `npx vitest run tests/cli/init.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | R4 | — | N/A | integration | `git ls-files .wolf/` in test repo | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/cli/init.test.ts` — add assertions for corrected ignore-rule content:
  - No `hooks/` in "shared knowledge / ARE committed" comment block
  - Active ignore rule for `hooks/` in derived section
  - Active ignore rule for `buglog.json` with legacy-format comment
  - Active ignore rule for `cerebrum-freshness.json` with D-20 comment
  - No `STATUS.md` in false "ARE committed" comment
- [ ] Integration migration test: `git rm --cached` step documented and verifiable on acme_translators

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `git ls-files .wolf/` matches documented authored set exactly | R4 (acceptance) | Requires a real consumer repo post-migration | Run `git ls-files .wolf/` in acme_translators after `openwolf update`; compare output against authored list in template comments |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
