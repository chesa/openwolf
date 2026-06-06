#!/bin/bash
# sync-upstream.sh - Report fork divergence from upstream cytostack/openwolf
#
# Copyright (c) 2026 CHESA. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
# 1. Redistributions of source code must retain the above copyright notice,
#    this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
# 3. Neither the name of the copyright holder nor the names of its contributors
#    may be used to endorse or promote products derived from this software
#    without specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER "AS IS" AND ANY EXPRESS OR
# IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
# MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
# EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY DIRECT, INDIRECT,
# INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING IN ANY WAY
# OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
# DAMAGE.
set -euo pipefail

# pragma mark *** Constants ***

VERSION="1.0.0"
UPSTREAM_URL="https://github.com/cytostack/openwolf.git"
DEFAULT_BRANCH="main"

# pragma mark *** Validation ***

validate_dependencies() {
  if ! command -v git >/dev/null 2>&1; then
    printf "Error: git is not installed.\n" >&2
    printf "\n" >&2
    printf "Install git using one of these methods:\n" >&2
    printf "  macOS:   brew install git\n" >&2
    printf "  Ubuntu:  sudo apt-get install git\n" >&2
    printf "  Fedora:  sudo dnf install git\n" >&2
    printf "  Windows: https://git-scm.com/download/win\n" >&2
    exit 1
  fi
}

# pragma mark *** Help and Version ***

show_help() {
  cat <<'HELP'
sync-upstream.sh - Report fork divergence from upstream cytostack/openwolf

Shows how many commits your fork is ahead of or behind the upstream
repository (cytostack/openwolf). The script is read-only — it never
merges, rebases, or modifies branches.

Usage:
  bash scripts/sync-upstream.sh [OPTIONS]

Options:
  --help              Show this help message and exit
  --version           Show version and exit
  --branch BRANCH     Compare against upstream/BRANCH (default: main)
  --verbose           Print detailed git output (e.g., fetch errors)

Examples:
  bash scripts/sync-upstream.sh
      Compare main to upstream/main

  bash scripts/sync-upstream.sh --branch develop
      Compare develop to upstream/develop

  bash scripts/sync-upstream.sh --verbose
      Show detailed output including git fetch errors

States:
  IN SYNC   Local branch matches upstream — no action needed.
  AHEAD     Local has commits not in upstream (unpushed changes or
            fork-specific modifications).
  BEHIND    Upstream has new commits not in local — consider syncing.
  DIVERGED  Both local and upstream have unique commits — review
            side-by-side before syncing.

The script is read-only. It never merges or rebases automatically.
Review upstream changes and choose your sync strategy manually.
HELP
}

show_version() {
  printf "sync-upstream.sh %s\n" "$VERSION"
}

# pragma mark *** Remote Setup ***

ensure_upstream_remote() {
  local url
  if url=$(git remote get-url upstream 2>/dev/null); then
    printf "Using existing upstream remote: %s\n" "$url"
  else
    git remote add upstream "$UPSTREAM_URL"
    printf "Added upstream remote: %s\n" "$UPSTREAM_URL"
  fi
}

# pragma mark *** Fetch ***

fetch_upstream() {
  if [ "$VERBOSE" = "true" ]; then
    if ! git fetch upstream; then
      printf "Error: Failed to fetch from upstream remote.\n" >&2
      printf "Check network connectivity and remote URL: %s\n" "$UPSTREAM_URL" >&2
      exit 1
    fi
  else
    if ! git fetch upstream 2>/dev/null; then
      printf "Error: Failed to fetch from upstream remote.\n" >&2
      printf "Check network connectivity.\n" >&2
      exit 1
    fi
  fi
}

# pragma mark *** Divergence Report ***

validate_branch_name() {
  local branch="$1"
  if ! printf "%s" "$branch" | grep -qE '^[a-zA-Z0-9._/-]+$'; then
    printf "Error: Invalid branch name '%s'. Use alphanumeric characters, dots, underscores, hyphens, and forward slashes only.\n" "$branch" >&2
    exit 1
  fi
}

report_divergence() {
  local branch="$1"
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local upstream_ref="upstream/${branch}"
  local ahead=0
  local behind=0

  printf "\n"
  printf "=== Fork Divergence Report ===\n"
  printf "Local branch:  %s\n" "$current_branch"
  printf "Upstream ref:  %s\n" "$upstream_ref"
  printf "\n"

  ahead=$(git rev-list --count "${upstream_ref}..${branch}" 2>/dev/null || echo "0")
  behind=$(git rev-list --count "${branch}..${upstream_ref}" 2>/dev/null || echo "0")

  printf "Commits ahead of upstream:  %s\n" "$ahead"
  printf "Commits behind upstream:    %s\n" "$behind"
  printf "\n"

  # Warn if on a non-default branch
  if [ "$current_branch" != "main" ] && [ "$current_branch" != "develop" ]; then
    printf "Warning: You are on branch '%s'. Comparing against %s. Use --branch to specify a different branch.\n" "$current_branch" "$upstream_ref" >&2
    printf "\n"
  fi

  # Determine and print status
  if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
    printf "Status: DIVERGED\n"
    printf "\n"
    printf "Unique to your branch:\n"
    printf "  git log --oneline --left-only %s...%s\n" "$branch" "$upstream_ref"
    printf "\n"
    printf "Unique to upstream:\n"
    printf "  git log --oneline --right-only %s...%s\n" "$branch" "$upstream_ref"
    printf "\n"
    printf "To sync (choose one):\n"
    printf "  git merge %s\n" "$upstream_ref"
    printf "  git rebase %s\n" "$upstream_ref"
  elif [ "$ahead" -gt 0 ]; then
    printf "Status: AHEAD\n"
    printf "\n"
    printf "Your fork has commits not present in upstream.\n"
    printf "(This is normal if you have open PRs or fork-specific changes.)\n"
    printf "\n"
    printf "To see your unique commits:\n"
    printf "  git log --oneline %s..%s\n" "$upstream_ref" "$branch"
  elif [ "$behind" -gt 0 ]; then
    printf "Status: BEHIND\n"
    printf "\n"
    printf "Upstream has new commits. Review them before syncing.\n"
    printf "\n"
    printf "To review upstream changes:\n"
    printf "  git log --oneline %s..%s\n" "$branch" "$upstream_ref"
    printf "\n"
    printf "To sync (choose one):\n"
    printf "  git merge %s\n" "$upstream_ref"
    printf "  git rebase %s\n" "$upstream_ref"
  else
    printf "Status: IN SYNC\n"
    printf "Your local branch matches upstream.\n"
  fi
}

# pragma mark *** Main ***

main() {
  local branch="$DEFAULT_BRANCH"
  VERBOSE="false"

  # Parse flags using a while loop (supports long options)
  while [ $# -gt 0 ]; do
    case "$1" in
      --help)
        show_help
        exit 0
        ;;
      --version)
        show_version
        exit 0
        ;;
      --branch)
        if [ $# -lt 2 ]; then
          printf "Error: --branch requires a branch name argument.\n" >&2
          exit 1
        fi
        branch="$2"
        shift
        ;;
      --verbose)
        VERBOSE="true"
        ;;
      *)
        printf "Error: Unknown option: %s\n" "$1" >&2
        printf "Usage: bash scripts/sync-upstream.sh [--help] [--version] [--branch BRANCH] [--verbose]\n" >&2
        exit 1
        ;;
    esac
    shift
  done

  validate_dependencies
  validate_branch_name "$branch"
  ensure_upstream_remote
  fetch_upstream
  report_divergence "$branch"
}

main "$@"
