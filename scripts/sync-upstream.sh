#!/usr/bin/env bash
set -euo pipefail

# OpenWolf CHESA Fork — upstream divergence report
# Shows commits ahead/behind upstream/main and recommends actions.
# This script is read-only — no merging or rebasing.
# Usage: bash scripts/sync-upstream.sh [local-branch]
#
# The local branch defaults to whatever is checked out. Do NOT assume 'main':
# this fork's branches are 'Maine' and 'develop', and origin/HEAD is a stale
# symbolic ref pointing at a non-existent origin/main.

case "${1:-}" in
  -h | --help)
    echo "Usage: bash scripts/sync-upstream.sh [local-branch]"
    echo ""
    echo "Reports how far [local-branch] is ahead of and behind upstream/main."
    echo "Read-only — never merges, rebases, or pushes."
    echo ""
    echo "  local-branch  Branch to compare (default: current checkout)"
    echo ""
    echo "Examples:"
    echo "  bash scripts/sync-upstream.sh            # compare current branch"
    echo "  bash scripts/sync-upstream.sh develop    # compare develop"
    echo "  bash scripts/sync-upstream.sh Maine      # compare Maine"
    exit 0
    ;;
esac

ROOT=$(git rev-parse --show-toplevel 2> /dev/null) || {
  echo "Error: not in a git repository" >&2
  exit 1
}
cd "$ROOT"

# --- Resolve the local branch (fail loud; never silently substitute 0) ---
if [ $# -gt 0 ]; then
  LOCAL_BRANCH="$1"
else
  LOCAL_BRANCH=$(git symbolic-ref --quiet --short HEAD || true)
  [ -n "$LOCAL_BRANCH" ] || {
    echo "Error: detached HEAD — pass a branch name explicitly." >&2
    exit 1
  }
fi

git rev-parse --verify --quiet "refs/heads/${LOCAL_BRANCH}" > /dev/null ||
  {
    echo "Error: local branch '${LOCAL_BRANCH}' does not exist." >&2
    exit 1
  }

UPSTREAM_REF="upstream/main"

# --- Ensure upstream remote ---
if ! git remote get-url upstream > /dev/null 2>&1; then
  echo "Adding upstream remote (read-only)..."
  git remote add upstream https://github.com/cytostack/openwolf.git
fi

# --- Fetch ---
echo "Fetching upstream..."
git fetch upstream

git rev-parse --verify --quiet "refs/remotes/${UPSTREAM_REF}" > /dev/null ||
  {
    echo "Error: '${UPSTREAM_REF}' not found after fetch." >&2
    exit 1
  }

# --- Divergence report ---
AHEAD=$(git rev-list --count "${UPSTREAM_REF}..${LOCAL_BRANCH}")
BEHIND=$(git rev-list --count "${LOCAL_BRANCH}..${UPSTREAM_REF}")

echo ""
echo "=== Divergence Report ==="
echo "  Comparing:          ${LOCAL_BRANCH} vs ${UPSTREAM_REF}"
echo "  Ahead of upstream:  ${AHEAD} commits"
echo "  Behind upstream:    ${BEHIND} commits"
echo ""

if [ "$AHEAD" -gt 0 ]; then
  echo "--- CHESA commits not in upstream ---"
  git log --oneline "${UPSTREAM_REF}..${LOCAL_BRANCH}"
  echo ""
fi

if [ "$BEHIND" -gt 0 ]; then
  echo "--- Upstream changes not in fork ---"
  git log --oneline "${LOCAL_BRANCH}..${UPSTREAM_REF}"
  echo ""
fi

# --- Upstream tags ---
UPSTREAM_TAGS=$(git tag --list --merged "${UPSTREAM_REF}" 2> /dev/null | head -20)
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
  echo "    git merge ${UPSTREAM_REF}   # simple sync"
  echo "    git rebase ${UPSTREAM_REF}  # clean history"
else
  echo "  You are ${AHEAD} ahead, ${BEHIND} behind — fork has diverged."
  echo "  Review upstream changes: git log --oneline ${LOCAL_BRANCH}..${UPSTREAM_REF}"
  echo "  Then consider:"
  echo "    git merge ${UPSTREAM_REF}   # simple sync"
  echo "    git rebase ${UPSTREAM_REF}  # clean history"
fi
echo ""
echo "  Upstream PR status: git log --oneline --cherry-mark ${UPSTREAM_REF}...${LOCAL_BRANCH}"
