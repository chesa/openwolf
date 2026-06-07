#!/usr/bin/env bash
set -euo pipefail

# OpenWolf CHESA Fork — upstream divergence report
# Shows commits ahead/behind upstream/main and recommends actions.
# This script is read-only — no merging or rebasing.
# Usage: bash scripts/sync-upstream.sh

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Error: not in a git repository" >&2; exit 1; }
cd "$ROOT"

# --- Ensure upstream remote ---
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding upstream remote (read-only)..."
  git remote add upstream https://github.com/cytostack/openwolf.git
fi

# --- Fetch ---
echo "Fetching upstream..."
git fetch upstream

# --- Divergence report ---
AHEAD=$(git rev-list --count upstream/main..main 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count main..upstream/main 2>/dev/null || echo "0")

echo ""
echo "=== Divergence Report ==="
echo "  Ahead of upstream:  ${AHEAD} commits"
echo "  Behind upstream:    ${BEHIND} commits"
echo ""

if [ "$AHEAD" -gt 0 ]; then
  echo "--- CHESA commits not in upstream ---"
  git log --oneline upstream/main..main
  echo ""
fi

if [ "$BEHIND" -gt 0 ]; then
  echo "--- Upstream changes not in fork ---"
  git log --oneline main..upstream/main
  echo ""
fi

# --- Upstream tags ---
UPSTREAM_TAGS=$(git tag --list --merged upstream/main 2>/dev/null | head -20)
if [ -n "$UPSTREAM_TAGS" ]; then
  echo "--- Upstream tags (recent) ---"
  echo "$UPSTREAM_TAGS"
  echo ""
fi

# --- Recommendation ---
echo "=== Recommendation ==="
if [ "$BEHIND" -eq 0 ] && [ "$AHEAD" -eq 0 ]; then
  echo "  Fork is in sync with upstream. No action needed."
elif [ "$BEHIND" -eq 0 ]; then
  echo "  You are ${AHEAD} ahead, 0 behind — upstream has no new changes."
  echo "  Ready to open PRs against upstream."
elif [ "$AHEAD" -eq 0 ]; then
  echo "  You are 0 ahead, ${BEHIND} behind — fork is behind upstream."
  echo "  Review upstream changes and consider:"
  echo "    git merge upstream/main   # simple sync"
  echo "    git rebase upstream/main  # clean history"
else
  echo "  You are ${AHEAD} ahead, ${BEHIND} behind — fork has diverged."
  echo "  Review upstream changes: git log --oneline main..upstream/main"
  echo "  Then consider:"
  echo "    git merge upstream/main   # simple sync"
  echo "    git rebase upstream/main  # clean history"
fi
echo ""
echo "  Upstream PR status: git log --oneline --cherry-mark upstream/main...main"
