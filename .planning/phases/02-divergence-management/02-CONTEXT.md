# Phase 2 Context: Fork Divergence Management

## Decisions

### 1. Divergence Reporting (Tooling)
- **Decision:** Implement a read-only shell script (`scripts/sync-upstream.sh`).
- **Rationale:** Avoid automated destructive actions (merge/rebase); provide the operator with accurate data and suggested actions instead.
- **Constraints:** Must use pure Bash + standard Git commands (`rev-list`, `merge-base`).

### 2. Git Remote Configuration
- **Decision:** Upstream remote uses HTTPS (`https://github.com/cytostack/openwolf.git`).
- **Rationale:** Enables read-only access without SSH key management for all team members.
- **Implementation:** Configuration handled by the install script (Phase 1) and ensured at script runtime (Phase 2).

### 3. Branching Strategy
- **Decision:** Default branch comparison is `main`.
- **Constraint:** Support a `--branch` flag (or env var) for comparing other branches (e.g., `develop`).

### 4. Safety & Security
- **Decision:** Scripts must explicitly forbid automatic `push` commands to the upstream remote.
- **Constraint:** Validate branch names using `git rev-parse` to avoid command injection.

## Open/Deferred Items (Out of Scope for Phase 2)
- Auto-tag/release tracking (Deferred).
- Automatic merge/rebase execution (Strictly out of scope).
