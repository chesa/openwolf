# External Integrations

**Analysis Date:** [YYYY-MM-DD]

## APIs & External Services

**None:**
- This tool is a locally-running CLI and daemon. It interacts with the local file system and Git worktrees, not external APIs.

## Data Storage

**Databases:**
- None.

**File Storage:**
- Local filesystem only. Stores metadata and logs in `.wolf/` and JSON files within the project root.

**Caching:**
- None.

## Authentication & Identity

**Auth Provider:**
- None (Local tool).

## Monitoring & Observability

**Error Tracking:**
- None.

**Logs:**
- File-based logging to local files (managed by `src/utils/logger.ts`).

## CI/CD & Deployment

**Hosting:**
- Distributed as an NPM package.

**CI Pipeline:**
- GitHub Actions (`.github/workflows/docs.yml` for documentation).

## Environment Configuration

**Required env vars:**
- None strictly required.

**Secrets location:**
- Not applicable.

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing:**
- None.

---

*Integration audit: [YYYY-MM-DD]*
