# OpenWolf Maintenance & Security Hardening Sprint

## What This Is

A focused sprint addressing 11 accumulated tech-debt, security, and housekeeping items across the OpenWolf daemon, dashboard auth, hooks, and source tree. The sprint closes broken behavior (memory bloat, zero-action sessions), eliminates a security exposure (token-in-URL), reduces file sizes to maintainable levels, consolidates test directories, and cleans the repo of committed junk files.

## Core Value

Fix the two active failures (broken session consolidation and credential leakage) while proactively closing the nine items that will become failures if left unaddressed.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Fix daemon session-consolidator to delete zero-action sessions; never write `Consolidated session (0 actions)` marker entries
- [ ] Migrate dashboard WebSocket auth from URL query param (`?token=`) to `Authorization: Bearer` header
- [ ] Write threat model document for dashboard auth covering XSS scope, logout, token rotation
- [ ] E2E integration test for WebSocket token-in-URL auth path (end-to-end, not unit only)
- [ ] Write `docs/hooks.md` documenting the `worktree-helper.js` hook contract
- [ ] Split `src/hooks/shared.ts` into focused concern modules; each ≤ 4 000 tokens
- [ ] Extract per-language description handlers from `description-extractor.ts` into separate modules
- [ ] Consolidate all tests under one directory; fix `vitest.config.ts` include path
- [ ] Add `pnpm clean` script removing `dist/`, `.wolf/designqc-captures/`, and `tmp.*`
- [ ] Remove `.DS_Store` entries from `.claude/` and repo root; add to `.gitignore`
- [ ] Maintain backward compatibility for hook re-exports after split

### Out of Scope

- Full authentication rewrite (SSO, OAuth, multi-user) — transport only, not auth model
- Any new features unrelated to the 11 items
- Dashboard UI redesign
- Dependency version bumps not required by the above

## Context

OpenWolf is a token-conscious context manager for Claude Code with three independently compiled subsystems: CLI+core, hooks, and dashboard. The project already has architecture and stack documentation in `.planning/codebase/`. This sprint operates within the existing architecture — no new components are introduced.

Key subsystems affected:
- **Daemon** (`src/daemon/wolf-daemon.ts`, `src/daemon/cron-engine.ts`) — session consolidation
- **Dashboard** (`src/dashboard/app/`) — WebSocket auth transport
- **Hooks** (`src/hooks/`) — shared.ts split, docs
- **Scanner** (`src/scanner/`) — description-extractor.ts split

## Constraints

- **Backward compatibility**: Hook re-exports from `shared.ts` must continue working without changes to hook consumers
- **Auth transport**: `Authorization: Bearer` header preferred over HTTP-only cookie (single-origin SPA, no CSRF concern)
- **Test consolidation**: Target directory is `tests/` (not `src/tests/`)
- **Clean scope**: `pnpm clean` must NOT delete `.wolf/` state files (only `dist/`, `.wolf/designqc-captures/`, `tmp.*`)
- **Token budget**: Target ≤ 4 000 tokens per hook module, ≤ 5 000 tokens per scanner module after split

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auth transport: `Authorization: Bearer` header | Single-origin SPA; CSRF not a concern; keeps token in JS memory, out of URL and proxy logs | — Pending |
| Test consolidation: `tests/` | Majority of existing tests are in `tests/`; one file move vs. moving all | — Pending |
| `shared.ts` split: re-export for backward compat | Existing hook imports must not break | — Pending |
| `pnpm clean` explicit paths only | Avoids accidental deletion of `.wolf/` state files | — Pending |

---

*Last updated: 2026-06-01 after initialization from prd.md*
