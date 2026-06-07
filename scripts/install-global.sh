#!/usr/bin/env bash
set -euo pipefail

# OpenWolf CHESA Fork — automatic install script
# Usage: bash scripts/install-global.sh

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Prerequisites ---
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org/ (v20+)."; exit 1; }
NODE_VERSION=$(node --version | sed 's/[^0-9]*//' | cut -c1-2)
if [ "$NODE_VERSION" -lt 20 ] 2>/dev/null; then
  echo "Error: Node.js 20+ required. Found: $(node --version)"
  echo "Upgrade from https://nodejs.org/"
  exit 1
fi

command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required. Install: npm install -g pnpm"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: git is required. Install from https://git-scm.com/"; exit 1; }

# --- Upgrade detection ---
if command -v openwolf >/dev/null 2>&1; then
  OLD_VER=$(openwolf --version 2>/dev/null || echo "unknown")
  NEW_VER=$(node -e "console.log(require('${PROJECT_DIR}/package.json').version)" 2>/dev/null || echo "unknown")
  echo "Upgrading openwolf from ${OLD_VER} to ${NEW_VER}..."
fi

# --- Install ---
cd "$PROJECT_DIR"

echo "Running pnpm install..."
pnpm install || { echo "Error: pnpm install failed. Retry: cd ${PROJECT_DIR} && pnpm install"; exit 1; }

echo "Running pnpm build..."
pnpm build || { echo "Error: pnpm build failed. Retry: cd ${PROJECT_DIR} && pnpm build"; exit 1; }

echo "Running npm install -g ."
npm install -g . || { echo "Error: npm install -g failed. Retry: cd ${PROJECT_DIR} && npm install -g ."; exit 1; }

# --- Verify ---
echo "Verifying installation..."
INSTALLED_PATH=$(command -v openwolf)
echo "  Installed: openwolf -> ${INSTALLED_PATH}"
openwolf --version

# --- Upstream remote ---
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding upstream remote (read-only)..."
  git remote add upstream https://github.com/cytostack/openwolf.git
fi

echo ""
echo "Install complete!"
echo "Next: run 'openwolf update' in each project to sync hooks."
