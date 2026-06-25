---
phase: 10
slug: hook-side-in-project-exclusion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 10-RESEARCH.md §"Research Question 5: Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in dev deps — no Wave 0 install) |
| **Config file** | existing repo vitest config; `tests/` mirrors `src/` |
| **Quick run command** | `npx vitest run tests/hooks/wolf-ignore.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–15 seconds (unit + hook/scanner suites) |

Also part of acceptance (not vitest): `tsc --noEmit -p tsconfig.hooks.json` (C2 boundary) and the `pnpm build:hooks` → `node dist/bin/openwolf.js update` copy step (ROADMAP criterion 4).

---

## Sampling Rate

- **After every task commit:** Run the relevant `npx vitest run tests/hooks/<file>.test.ts`
- **After every plan wave:** Run `pnpm test` + `tsc --noEmit -p tsconfig.hooks.json`
- **Before `/gsd-verify-work`:** Full suite green AND hooks type-check clean AND copy step exercised
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner (expected prefix `10-01-NN`); rows below map the **required behaviors → tests** that every plan must carry into `must_haves`. Threat ref T-10-01 = ReDoS-safety of hand-rolled regex (ASVS L1).

| Behavior (Requirement R6) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------------------------|------------|-----------------|-----------|-------------------|-------------|--------|
| `shouldExclude` behavior preserved after move (bare-name/glob/nested/.env) | — | N/A | unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ W0 | ⬜ pending |
| `parseAndMatchGitignore` supported subset (bare/trailing-slash/anchored/`*`/`**`) | — | N/A | unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ W0 | ⬜ pending |
| Negation `!` line skipped — fail-closed, no leak (R6-D5) | — | over-exclude, never leak | unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ W0 | ⬜ pending |
| ReDoS-safety: regex stays linear (only `.*`/`[^/]*`/escaped literals) | T-10-01 | no catastrophic backtracking on hostile pattern | unit | `npx vitest run tests/hooks/wolf-ignore.test.ts` | ❌ W0 | ⬜ pending |
| E6 regression: excluded in-project path NOT recorded in anatomy | — | leak closed | integration | `npx vitest run tests/hooks/post-write.test.ts` | ❌ W0 | ⬜ pending |
| Root-`.gitignore`-ignored path skipped when `respect_gitignore: true` | — | leak closed (opt-in) | integration | `npx vitest run tests/hooks/post-write.test.ts` | ❌ W0 | ⬜ pending |
| R3 `../` out-of-project skip preserved | — | no machine-local path leak | integration | `npx vitest run tests/hooks/post-write.test.ts` | ✅ (lines 111–126) | ⬜ pending |
| Normal in-project file still recorded (positive control) | — | N/A | integration | `npx vitest run tests/hooks/post-write.test.ts` | ✅ (lines 127–143) | ⬜ pending |
| Windows backslash path normalized before matching | — | N/A | integration | `npx vitest run tests/hooks/post-write.test.ts` | ❌ W0 | ⬜ pending |
| Scanner suite still green after the move | — | no behavior drift | regression | `npx vitest run tests/scanner/anatomy-scanner.test.ts` | ✅ (exists) | ⬜ pending |
| Hook bundle imports zero `node_modules` (C2) | — | no dep leak into hook | build | `tsc --noEmit -p tsconfig.hooks.json` | ✅ (exists) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/hooks/wolf-ignore.test.ts` — NEW unit suite for `shouldExclude` + `parseAndMatchGitignore` (incl. negation fail-closed + ReDoS-safety)
- [ ] `tests/hooks/post-write.test.ts` — EXTEND with E6 regression, gitignore-gated skip, backslash-normalization cases
- [ ] No framework install — vitest already present
- [ ] `tests/scanner/anatomy-scanner.test.ts` — update the `shouldExclude` import to the new authoritative source (`wolf-ignore.ts`) if the planner chooses to drop the scanner re-export shim

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live hook behavior in `.wolf/hooks/` | R6 (ROADMAP criterion 4) | The vitest suite imports TS source directly; the *running* hook is the compiled copy in `.wolf/hooks/`. Build+copy is not exercised by `pnpm test`. | Run `pnpm build:hooks` then `node dist/bin/openwolf.js update`; confirm `.wolf/hooks/post-write.js` contains the new gating and a smoke write to an excluded path is not recorded. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
