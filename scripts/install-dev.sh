#!/bin/bash
#
# scripts/install-dev.sh — CHESA Fork Team Toolkit
# Automated local development environment setup for the OpenWolf fork.
#
# This script:
#   1. Checks prerequisites (Node.js >= 20, pnpm, git repo)
#   2. Installs project dependencies
#   3. Builds the project
#   4. Links the CLI globally via pnpm
#   5. Configures the upstream git remote for divergence management
#
# Usage:
#   ./scripts/install-dev.sh                     Full setup
#   ./scripts/install-dev.sh [-h | --help]       Show this help message
#   ./scripts/install-dev.sh [-v | --version]    Show version
#
# License: AGPL-3.0-only
# Copyright (C) 2026 CHESA

set -euo pipefail

# --- Constants ----------------------------------------------------------- #
readonly SCRIPT_VERSION="1.0.0"
readonly UPSTREAM_URL="https://github.com/cytostack/openwolf.git"

# --- Cleanup trap --------------------------------------------------------- #

CLEANUP_TRAP_RAN=false
_cleanup() {
  if [ "$CLEANUP_TRAP_RAN" = "true" ]; then return; fi
  CLEANUP_TRAP_RAN=true
  if [ -d dist ]; then
    printf '\nSetup failed. Removing incomplete build artifacts...\n' >&2
    rm -rf dist 2>/dev/null || true
  fi
}
trap _cleanup EXIT ERR

# --- Help ----------------------------------------------------------------- #

show_help() {
  cat <<'HELP'
scripts/install-dev.sh — Automated OpenWolf development environment setup

USAGE:
  ./scripts/install-dev.sh                     Full setup
  ./scripts/install-dev.sh [-h | --help]       Show this help message
  ./scripts/install-dev.sh [-v | --version]    Show version

DESCRIPTION:
  Automates local development setup for contributors working on the
  CHESA OpenWolf fork. Verifies prerequisites, installs dependencies,
  builds the project, links the CLI globally, and configures the
  upstream git remote.

PREREQUISITES:
  - Node.js >= 20.0.0
  - pnpm (package manager)
  - Git repository context

STEPS:
  1. Prerequisite checks (Node.js, pnpm, git repo)
  2. Global openwolf conflict warning (if applicable)
  3. pnpm install
  4. pnpm build
  5. pnpm link --global
  6. Upstream remote configuration

EXIT CODES:
  0  Success
  1  Prerequisite check failed
HELP
}

# --- Version -------------------------------------------------------------- #

show_version() {
  printf 'install-dev.sh version %s\n' "$SCRIPT_VERSION"
}

# --- Command-line arguments ----------------------------------------------- #

if [ $# -gt 0 ]; then
  case "${1:-}" in
    --help|-h)
      show_help
      exit 0
      ;;
    --version|-v)
      show_version
      exit 0
      ;;
    *)
      printf 'Error: Unknown option: %s\n' "$1" >&2
      printf 'Usage: ./scripts/install-dev.sh [--help|-h] [--version|-v]\n' >&2
      exit 1
      ;;
  esac
fi

# --- Prerequisite: Node.js >= 20 ----------------------------------------- #

printf 'Checking prerequisites...\n'

NODE_VERSION=$(node --version 2>/dev/null || true)
if [ -z "$NODE_VERSION" ]; then
  printf 'Error: Node.js is not installed. Install Node.js >= 20.0.0 and try again.\n' >&2
  exit 1
fi

NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf 'Error: Node.js >= 20.0.0 required. Found: %s\n' "$NODE_VERSION" >&2
  exit 1
fi

printf '  Node.js %s OK\n' "$NODE_VERSION"

# --- Prerequisite: pnpm --------------------------------------------------- #

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'Error: pnpm is required but not installed.\n' >&2
  printf 'Install it with: npm install -g pnpm\n' >&2
  exit 1
fi

PNPM_VERSION=$(pnpm --version 2>/dev/null || true)
PNPM_MAJOR=$(printf '%s' "$PNPM_VERSION" | sed 's/^v//' | cut -d. -f1)
if [ -z "$PNPM_VERSION" ] || [ "$PNPM_MAJOR" -lt 8 ]; then
  printf 'Error: pnpm >= 8.0.0 required. Found: %s\n' "$PNPM_VERSION" >&2
  exit 1
fi
printf '  pnpm %s OK\n' "$PNPM_VERSION"

# --- Prerequisite: git repository ----------------------------------------- #

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf 'Error: Not a git repository. Run this script from within the OpenWolf fork.\n' >&2
  exit 1
fi
printf '  git repo OK\n'

cd "$(git rev-parse --show-toplevel)"
printf '  Changed to repository root: %s\n' "$(pwd)"

# --- Global openwolf conflict warning ------------------------------------ #

if command -v openwolf >/dev/null 2>&1; then
  printf 'Warning: openwolf is already globally installed.\n' >&2
  printf '  The script will continue and link the local build globally,\n' >&2
  printf '  overriding the existing installation. To avoid potential\n' >&2
  printf '  confusion, you may uninstall the existing package first:\n' >&2
  printf '    npm uninstall -g openwolf\n' >&2
  printf '    pnpm unlink --global openwolf\n' >&2
fi

# --- Core setup: install, build, link ------------------------------------ #

printf '\nInstalling dependencies...\n'
pnpm install

printf '\nBuilding project...\n'
pnpm build

printf '\nLinking globally...\n'
pnpm link --global

# --- Upstream remote configuration --------------------------------------- #

printf '\nConfiguring upstream remote...\n'

if git remote | grep -qx 'upstream'; then
  EXISTING_URL=$(git remote get-url upstream 2>/dev/null || true)
  if [ "$EXISTING_URL" = "$UPSTREAM_URL" ]; then
    printf '  upstream remote already configured to %s\n' "$UPSTREAM_URL"
  else
    printf '  Warning: upstream remote exists with a different URL:\n' >&2
    printf '    Current: %s\n' "$EXISTING_URL" >&2
    printf '    Expected: %s\n' "$UPSTREAM_URL" >&2
    printf '  Leaving as-is. To change, run: git remote set-url upstream %s\n' "$UPSTREAM_URL" >&2
  fi
else
  git remote add upstream "$UPSTREAM_URL"
  printf '  Added upstream remote: %s\n' "$UPSTREAM_URL"
fi

# --- Done ----------------------------------------------------------------- #

printf '\nDevelopment environment setup complete.\n'
printf 'Run "node dist/bin/openwolf.js --help" to verify the CLI works.\n'
