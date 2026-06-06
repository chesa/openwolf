# Phase 01: Fork Installation & Team Onboarding - Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 4
**Analogs found:** 3 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/install-dev.sh` (new) | utility | batch | `src/cli/init.ts` | partial |
| `package.json` (modify) | config | — | existing `package.json` | exact |
| `README.md` (modify) | config | — | existing `README.md` | exact |
| `docs/DEVELOPMENT.md` (modify) | config | — | existing `docs/DEVELOPMENT.md` | exact |

## Pattern Assignments

### `scripts/install-dev.sh` (new — utility, batch)

**Analog:** No existing bash scripts in this project. Partial analogs from `src/cli/init.ts` (prerequisite checks, git-aware logic) and `~/.claude/rules/bash.md` (CHESA Bash conventions).

**Project bash conventions** (from `~/.claude/rules/bash.md`):
- Strict mode: `set -euo pipefail`
- Header: Copyright + license
- Pragma marks for organization
- `validate_dependencies()` pattern
- `--help` and `--version` flags
- `printf` over `echo`

**Core pattern — Node version check** (from `src/cli/init.ts` lines 291–296):
```typescript
const nodeVersion = parseInt(process.version.slice(1), 10);
if (nodeVersion < 20) {
  console.error(`Node.js 20+ required. Current: ${process.version}`);
  process.exit(1);
}
```
Equivalent in bash:
```bash
node_version=$(node --version | sed 's/^v//')
major=$(printf '%s' "$node_version" | cut -d. -f1)
if [ "$major" -lt 20 ]; then
  printf 'Error: Node.js >= 20.0.0 required. Found: %s\n' "$node_version" >&2
  exit 1
fi
```

**Core pattern — git repo guard** (from `src/cli/init.ts` lines 298–315):
- Detect project root, validate git repo, fail fast with clear error messages.

**Core pattern — idempotent file/remote handling** (from `src/cli/init.ts` lines 340–354):
```typescript
for (const file of ALWAYS_OVERWRITE) {
  writeTemplateFile(actualTemplatesDir, wolfDir, file);
}
for (const file of CREATE_IF_MISSING) {
  const destPath = path.join(wolfDir, file);
  if (fs.existsSync(destPath)) {
    skippedCount++;
  } else {
    writeTemplateFile(actualTemplatesDir, wolfDir, file);
  }
}
```
Bash equivalent for upstream remote:
```bash
if git remote | grep -qx 'upstream'; then
  printf '  upstream remote already exists. Skipping.\n'
else
  git remote add upstream https://github.com/cytostack/openwolf.git
fi
```

**Error handling pattern** (from `src/cli/init.ts` lines 16–26):
```typescript
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return pkg.version || "unknown";
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    console.warn(`  ⚠ Could not read package.json for version: ${(err as Error).message}`);
  }
  return "unknown";
}
```
In bash: use `||` fallbacks and `if [ $? -ne 0 ]` with specific error messages.

---

### `package.json` (modify — config)

**Analog:** `package.json` (existing, lines 1–82)

**Scripts section pattern** (lines 9–22):
```json
"scripts": {
  "prebuild": "node -e \"const fs=require('fs');if(fs.existsSync('dist'))fs.rmSync('dist',{recursive:true})\"",
  "build": "tsc && pnpm build:hooks && pnpm build:dashboard && pnpm build:templates",
  "build:templates": "cp -r src/templates dist/templates",
  "build:hooks": "tsc -p tsconfig.hooks.json",
  "build:dashboard": "cd src/dashboard/app && npx vite build --outDir ../../../dist/dashboard",
  "dev": "tsc --watch",
  "docs:dev": "vitepress dev docs",
  "docs:build": "vitepress build docs",
  "prepublishOnly": "pnpm build",
  "test": "vitest run",
  "test:watch": "vitest",
  "clean": "node -e \"const fs=require('fs');['dist','.wolf/designqc-captures'].forEach(...);...\""
}
```

**Pattern to copy:** Add `"install:dev"` as a script that delegates to the bash script:
```json
"install:dev": "bash scripts/install-dev.sh"
```
This matches the existing pattern where `clean` delegates to a script (inline Node.js) rather than duplicating commands.

---

### `README.md` (modify — config)

**Analog:** `README.md` (existing, lines 1–152)

**Installation section pattern** (lines 15–28):
```markdown
## Installation

Requires **Node.js 20 or later**.

```bash
npm install -g openwolf
```

Verify the installation:

```bash
openwolf --version
```
```

**Pattern to copy:** Add a "Development Setup" subsection after the end-user installation, using the same heading level (`##` or `###`) and fenced code blocks with bash language hint.

---

### `docs/DEVELOPMENT.md` (modify — config)

**Analog:** `docs/DEVELOPMENT.md` (existing, lines 8–34)

**Local Setup section pattern** (lines 8–34):
```markdown
## Local Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/chesa/openwolf.git
   cd openwolf
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

4. Verify the CLI works:

   After building, verify with `node dist/bin/openwolf.js --help`

> **Prerequisites:** Node.js >= 20.0.0. See [Getting Started](getting-started.md) for full prerequisite details.
```

**Pattern to copy:** Update step 2+ to reference `./scripts/install-dev.sh` as the primary path, keep manual steps as a fallback. Maintain numbered list format and `> **Prerequisites:**` block.

---

## Shared Patterns

### Prerequisite Checks
**Apply to:** `scripts/install-dev.sh`
**Sources:** `src/cli/init.ts` (Node version check), `package.json` `engines` field, `~/.claude/rules/bash.md`
```bash
set -euo pipefail

# Node.js >= 20
node_version=$(node --version | sed 's/^v//')
major=$(printf '%s' "$node_version" | cut -d. -f1)
if [ "$major" -lt 20 ]; then
  printf 'Error: Node.js >= 20.0.0 required. Found: %s\n' "$node_version" >&2
  exit 1
fi

# pnpm installed
if ! command -v pnpm >/dev/null 2>&1; then
  printf 'Error: pnpm is required but not installed.\n' >&2
  exit 1
fi

# Inside a git repository
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf 'Error: Not a git repository.\n' >&2
  exit 1
fi
```

### Warning + Continue (Non-Destructive)
**Apply to:** `scripts/install-dev.sh` (global install conflict detection)
**Sources:** `src/cli/init.ts` (warn patterns, lines 22–25, 86–87, 109–111)
```bash
if command -v openwolf >/dev/null 2>&1; then
  printf 'Warning: openwolf is already globally installed.\n' >&2
  printf 'To avoid conflicts, uninstall the existing global package first:\n' >&2
  printf '  npm uninstall -g openwolf   or   pnpm unlink --global openwolf\n' >&2
fi
```

### Idempotent Git Remote Configuration
**Apply to:** `scripts/install-dev.sh`
**Sources:** `src/cli/init.ts` (idempotent file creation pattern)
```bash
UPSTREAM_URL="https://github.com/cytostack/openwolf.git"
if git remote | grep -qx 'upstream'; then
  existing_url=$(git remote get-url upstream 2>/dev/null || true)
  if [ "$existing_url" = "$UPSTREAM_URL" ]; then
    printf '  upstream remote already configured.\n'
  else
    printf '  upstream remote exists with a different URL. Leaving as-is.\n' >&2
  fi
else
  git remote add upstream "$UPSTREAM_URL"
  printf '  Added upstream remote: %s\n' "$UPSTREAM_URL"
fi
```

### Progress Echo Pattern
**Apply to:** `scripts/install-dev.sh`
**Sources:** `src/cli/init.ts` (console.log with checkmarks, lines 420–436)
```bash
printf 'Installing dependencies...\n'
printf 'Building project...\n'
printf 'Linking globally...\n'
printf 'Setup complete.\n'
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All files have direct analogs or established conventions. |

## Metadata

**Analog search scope:** `/Users/bfs/bitbucket/openwolf` (full project root)
**Files scanned:** 7 (`package.json`, `README.md`, `docs/DEVELOPMENT.md`, `src/cli/init.ts`, `CONTRIBUTING.md`, `~/.claude/rules/bash.md`, `~/.claude/rules/code-organization.md`)
**Pattern extraction date:** 2026-06-06
