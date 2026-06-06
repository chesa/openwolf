# Phase 1: Fork Installation & Team Onboarding - Research

**Researched:** 2025-07-21
**Domain:** Developer Experience (DX) & Onboarding
**Confidence:** HIGH

## Summary

This phase aims to streamline the onboarding process for new OpenWolf contributors by automating the development setup. The core objective is to create a robust `scripts/install-global.sh` that installs dependencies, builds the project, and links the local CLI for immediate use.

**Primary recommendation:** Introduce a centralized `scripts/install-dev.sh` to automate the local development setup, add an `install:dev` script to `package.json`, and update `CONTRIBUTING.md` to recommend this streamlined flow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dependency Mgmt | Dev Environment | — | `pnpm` manages project dependencies. |
| Build Process | Dev Environment | — | `tsc` and `vite` compile project. |
| Global Linking | OS / Node | — | `npm link` / `pnpm link` handles binary mapping. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 11.1.2 | Package Manager | Fast, efficient monorepo support. |
| TypeScript | 5.7.0 | Language | Type safety for CLI & utilities. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite | 6.0.0 | Build/Dashboard | Bundling React dashboard. |
| vitest | 4.1.5 | Testing | Fast testing for TypeScript. |

**Installation:**
```bash
# Existing installation for users
npm install -g openwolf

# New recommended dev setup
./scripts/install-dev.sh
```

## Architecture Patterns

### Pattern 1: Development Automation Script (`install-dev.sh`)
**What:** Automates dependency installation, build, and linking for developers.
**When to use:** Onboarding new team members or resetting local environment.
**Example:**
```bash
#!/bin/bash
set -e
echo "Installing dependencies..."
pnpm install
echo "Building project..."
pnpm build
echo "Linking globally..."
pnpm link --global
echo "Setup complete."
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package management | Shell scripts to manage dependencies | `pnpm` / `npm` | Native CLI tools handle lockfiles and edge cases. |
| Binary linking | Manually moving binaries to `/usr/local/bin` | `npm link` / `pnpm link` | Handles platform-specific paths automatically. |

## Common Pitfalls

### Pitfall 1: Linking Conflicts
**What goes wrong:** Global `openwolf` package might conflict with local linked package.
**How to avoid:** Explicitly uninstall global `openwolf` (`npm uninstall -g openwolf`) before linking the local directory for development.

## Code Examples

### `package.json` entry
```json
"scripts": {
  "install:dev": "pnpm install && pnpm build && pnpm link --global"
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v22.22.3 | — |
| pnpm | Dependency Mgmt | ✓ | 11.1.2 | — |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | TypeScript strict mode |

## Sources

### Primary (HIGH confidence)
- `package.json` - Current project configuration
- `CONTRIBUTING.md` - Existing development standards

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already in use.
- Architecture: HIGH - Standard CLI dev practices.
- Pitfalls: HIGH - Common Node.js linking issues.

**Research date:** 2025-07-21
**Valid until:** 2025-08-20
