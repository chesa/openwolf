# Phase 2 Validation: Fork Divergence Management

## Approach

Manual verification per `02-RESEARCH.md` Validation Architecture section.
This phase delivers a read-only shell script; validation is by inspection
and execution.

## Automated Checks (per task)

### Task 1 — `scripts/sync-upstream.sh`
```bash
shellcheck --exclude=SC1090 scripts/sync-upstream.sh && \
bash scripts/sync-upstream.sh --help && \
bash scripts/sync-upstream.sh --version && \
test -x scripts/sync-upstream.sh
```

### Task 2 — README.md documentation
```bash
grep -q "Fork Management" README.md && \
grep -q "scripts/sync-upstream.sh" README.md && \
grep -q "cytostack/openwolf" README.md && \
grep -q "read-only" README.md && \
grep -q "IN SYNC" README.md && \
grep -q "--branch develop" README.md
```

## Manual Checks

1. Run `bash scripts/sync-upstream.sh` from repo root and confirm divergence
   report output.
2. Run `bash scripts/sync-upstream.sh --branch develop` and confirm comparison
   branch changes.
3. Verify `git remote -v` shows `upstream` with HTTPS URL.
4. Review README.md "Fork Management" section for completeness.
