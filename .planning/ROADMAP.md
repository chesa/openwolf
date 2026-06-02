# Roadmap: OpenWolf Maintenance & Security Hardening Sprint

## Overview

Fix the two active failures (broken session consolidation and credential leakage) while proactively closing nine accumulated tech-debt items. Four phases move from critical security fixes through hook/scanner modularization to repository cleanup.

## Phases

- [x] **Phase 1: P0 Security Fixes + Quick Win** - Session consolidator bug fix, WebSocket cookie-based auth migration, threat model document (completed 2026-06-02)
- [ ] **Phase 2: Hook Module Split** - Split shared.ts into focused concern modules with re-export facade; verify backward compatibility
- [ ] **Phase 3: P1 Modularization** - description-extractor split, test consolidation, hook contract docs
- [ ] **Phase 4: P2 Cleanup** - pnpm clean script, .DS_Store removal from repo

## Phase Details

### Phase 1: P0 Security Fixes + Quick Win

**Goal**: Fix broken session consolidation and eliminate token-in-URL security exposure
**Depends on**: Nothing (first phase)
**Requirements**: SESS-01, SESS-02, AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):

  1. Daemon never writes zero-action session entries to memory.md (SESS-01)
  2. Daemon never writes "Consolidated session (0 actions)" marker entries (SESS-02)
  3. Dashboard WebSocket authenticates via Authorization: Bearer header, not URL query param (AUTH-01)
  4. Proxy access logs contain no token values after auth migration (AUTH-02)
  5. Threat model document exists at docs/threat-model.md covering XSS scope, logout, and token rotation (AUTH-03)

**Plans**: 3 plans

Plans:

- [x] 01-01: Fix daemon session-consolidator to delete zero-action sessions and skip marker entries
- [x] 01-02: Migrate dashboard WebSocket auth from URL query param to Authorization: Bearer header
- [x] 01-03: Write threat model document for dashboard auth covering XSS scope, logout, and token rotation

### Phase 2: Hook Module Split

**Goal**: Split shared.ts into focused concern modules while maintaining backward compatibility
**Depends on**: Phase 1
**Requirements**: HOOK-01, HOOK-02, COMPAT-01, COMPAT-02
**Success Criteria** (what must be TRUE):

  1. Each hook module is 4,000 tokens or fewer after split (HOOK-01)
  2. All named exports from shared.ts remain importable via re-export facade (HOOK-02, COMPAT-01)
  3. `tsc --noEmit -p tsconfig.hooks.json` passes with no circular imports (COMPAT-02)
  4. Hook consumers require no changes after split (HOOK-02)

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 02-01: Analyze shared.ts and identify natural split boundaries (worktree-context, fs-helpers, anatomy-helpers)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02: Extract modules and create re-export facade for backward compatibility

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-03: Verify TypeScript compilation and all named exports remain importable

### Phase 3: P1 Modularization

**Goal**: Complete remaining modularization work and test consolidation
**Depends on**: Phase 2
**Requirements**: SCAN-01, SCAN-02, TEST-01, TEST-02, HOOK-03
**Success Criteria** (what must be TRUE):

  1. description-extractor.ts per-language handlers extracted into separate modules under src/scanner/extractors/ (SCAN-01)
  2. Each scanner module is 5,000 tokens or fewer after extraction (SCAN-02)
  3. All tests consolidated under tests/ directory (not src/tests/) (TEST-01)
  4. vitest.config.ts include path updated to tests/**/*.test.ts (TEST-02)
  5. docs/hooks.md documents the worktree-helper.js hook contract (HOOK-03)

**Plans**: 3 plans

Plans:

- [ ] 03-01: Extract description-extractor.ts per-language handlers into src/scanner/extractors/ modules
- [ ] 03-02: Consolidate all tests under tests/ and update vitest.config.ts include path
- [ ] 03-03: Write docs/hooks.md documenting the worktree-helper.js hook contract

### Phase 4: P2 Cleanup

**Goal**: Add repository hygiene scripts and clean committed artifacts
**Depends on**: Phase 3
**Requirements**: CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):

  1. `pnpm clean` removes dist/, .wolf/designqc-captures/, and tmp.* directories (CLEAN-01)
  2. .DS_Store entries removed from .claude/ and repo root; added to .gitignore (CLEAN-02)
  3. `pnpm clean` does NOT delete .wolf/ state files (only dist/, designqc-captures/, tmp.*) (CLEAN-01)

**Plans**: 1 plan

Plans:

- [ ] 04-01: Add pnpm clean script and remove .DS_Store entries from repo

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. P0 Security Fixes | 3/3 | Complete    | 2026-06-02 |
| 2. Hook Module Split | 1/3 | In Progress|  |
| 3. P1 Modularization | 0/3 | Not started | - |
| 4. P2 Cleanup | 0/1 | Not started | - |

---

*Roadmap created: 2026-06-01*
*Coverage: 17/17 v1 requirements mapped*
