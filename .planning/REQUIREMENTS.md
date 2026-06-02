# Requirements: OpenWolf Maintenance & Security Hardening Sprint

**Defined:** 2026-06-01
**Core Value:** Fix the two active failures (broken session consolidation and credential leakage) while proactively closing the nine items that will become failures if left unaddressed.

## v1 Requirements

### Session Consolidation

- [x] **SESS-01**: Daemon consolidator deletes zero-action sessions from `memory.md` entirely (no marker entries written)
- [x] **SESS-02**: Daemon consolidator never writes `Consolidated session (0 actions)` marker entries to `memory.md`

### Dashboard Auth

- [x] **AUTH-01**: Dashboard WebSocket handshake authenticates via `Authorization: Bearer` header (not URL query param)
- [x] **AUTH-02**: Proxy access logs contain no token value after auth migration
- [x] **AUTH-03**: Threat model document for dashboard auth covering XSS scope, logout, and token rotation
- [ ] **AUTH-04**: E2E integration test for WebSocket token-in-URL auth path (end-to-end, not unit only)

### Hook Modularization

- [ ] **HOOK-01**: `src/hooks/shared.ts` split into focused concern modules with re-export facade; each module ≤ 4,000 tokens
- [ ] **HOOK-02**: Hook re-exports from `shared.ts` maintain backward compatibility with existing hook imports (no changes required by consumers)
- [ ] **HOOK-03**: `docs/hooks.md` documents the `worktree-helper.js` hook contract

### Scanner Modularization

- [ ] **SCAN-01**: `description-extractor.ts` per-language handlers extracted into separate modules under `src/scanner/extractors/`
- [ ] **SCAN-02**: Each scanner module ≤ 5,000 tokens after extraction

### Test Consolidation

- [ ] **TEST-01**: All tests consolidated under `tests/` directory (not `src/tests/`)
- [ ] **TEST-02**: `vitest.config.ts` `include` path updated to `tests/**/*.test.ts`

### Repository Hygiene

- [ ] **CLEAN-01**: `pnpm clean` script removes `dist/`, `.wolf/designqc-captures/`, and `tmp.*` directories
- [ ] **CLEAN-02**: `.DS_Store` removed from `.claude/` and repo root; added to `.gitignore`

### Backward Compatibility

- [ ] **COMPAT-01**: All existing hook re-export named exports remain importable from `shared.ts` after split
- [ ] **COMPAT-02**: `tsc --noEmit -p tsconfig.hooks.json` passes after all splits (no circular imports)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full authentication rewrite (SSO, OAuth, multi-user) | Transport only, not auth model |
| Dashboard UI redesign | Out of scope per PRD |
| New features unrelated to the 11 items | Sprint scope locked |
| Dependency version bumps | Only if required by changes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 1 | Complete |
| SESS-02 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 2 | Pending |
| HOOK-01 | Phase 2 | Pending |
| HOOK-02 | Phase 2 | Pending |
| COMPAT-01 | Phase 2 | Pending |
| COMPAT-02 | Phase 2 | Pending |
| SCAN-01 | Phase 3 | Pending |
| SCAN-02 | Phase 3 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| HOOK-03 | Phase 3 | Pending |
| CLEAN-01 | Phase 4 | Pending |
| CLEAN-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 (roadmap created, traceability updated)*