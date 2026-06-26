---
phase: 8
slug: verify-landed-p0-hygiene
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | package.json (vitest config inline) |
| **Quick run command** | `npx vitest run tests/hooks/post-write.test.ts` |
| **Full suite command** | `npx vitest run tests/hooks/post-write.test.ts tests/hooks/wolf-selfheal.test.ts tests/scanner/anatomy-scanner.test.ts` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/hooks/post-write.test.ts`
- **After every plan wave:** Run `npx vitest run tests/hooks/post-write.test.ts tests/hooks/wolf-selfheal.test.ts tests/scanner/anatomy-scanner.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | VER-01 | T-08-01/T-08-03 | Frozen fixture uses no real machine paths or secrets | unit | `test -f tests/fixtures/acme-snapshot-verify/config.json && test -f tests/fixtures/acme-snapshot-verify/anatomy-leak.md && node -e "const c=require('./tests/fixtures/acme-snapshot-verify/config.json'); const p=c.openwolf.anatomy.exclude_patterns; if(!p.includes('docs/superpowers')||!p.includes('.claude/plans/tmp.pwYfhCNiar')){process.exit(1)}"` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | VER-01 | T-08-02 | No src/ modification; no acme mutation | tdd | `npx vitest run tests/hooks/post-write.test.ts` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | VER-01 | T-08-01/T-08-02 | No acme mutation; no src/ change; R2/Q1/Q2 green on current src/ | auto | `npx vitest run tests/hooks/wolf-selfheal.test.ts tests/scanner/anatomy-scanner.test.ts && grep -q "anatomy.md" src/templates/wolf-gitignore` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | VER-01 | T-08-04/T-08-05 | No src/ or tests/ modification; verdicts sourced from Plan 01 SUMMARY | execute | `test -f .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md && grep -q 'cac925a' .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md && grep -q 'c430a9b' .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md && grep -q '9f63395' .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md && grep -q '3ef255c' .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md && grep -q '2f3e1f6' .planning/phases/08-verify-landed-p0-hygiene/08-VERIFICATION.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*File Exists: ✅ = exists on disk now · ❌ W0 = created during plan execution (Wave 0 not applicable — see below)*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- vitest is already installed in devDependencies
- `tests/hooks/post-write.test.ts`, `tests/hooks/wolf-selfheal.test.ts`, and `tests/scanner/anatomy-scanner.test.ts` already exist
- No stubs or framework installation needed before execution begins
- New fixture files (`tests/fixtures/acme-snapshot-verify/`) and the VERIFICATION.md are created during Wave 1/Wave 2 execution (Tasks 08-01-01 and 08-02-01), not as Wave 0 stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VERIFICATION.md verdict quality — PASS/FAIL are correctly sourced from 08-01-SUMMARY (no fabricated verdicts) | VER-01 | Automated command verifies file existence and commit hashes but cannot assert verdict-to-command-output fidelity | Open 08-VERIFICATION.md and cross-check each behavior's PASS/FAIL against the captured command output in 08-01-SUMMARY.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed — existing vitest infrastructure)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter ← already set above

**Approval:** pending
