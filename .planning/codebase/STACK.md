# Technology Stack

**Analysis Date:** 2026-06-07

## Languages

**Primary:**
- TypeScript 5.7+ — All source code in `bin/`, `src/`, and `tests/`

**Secondary:**
- CSS (TailwindCSS 4 syntax) — Dashboard styling in `src/dashboard/app/styles/globals.css`
- HTML — Dashboard entry point `src/dashboard/app/index.html`
- Shell (Bash) — Development scripts in `scripts/`

## Runtime

**Environment:**
- Node.js >= 20.0.0 (enforced at `bin/openwolf.ts:3-6`)
- ES2022 target, Node16 module resolution

**Package Manager:**
- pnpm >= 8
- Lockfile: `pnpm-lock.yaml` present
- Workspace: `pnpm-workspace.yaml` (disables esbuild build)

## Frameworks

**CLI:**
- Commander ^12.0.0 — Command-line interface framework in `src/cli/index.ts`

**HTTP Server:**
- Express ^5.0.0 — Daemon HTTP server in `src/daemon/wolf-daemon.ts`

**WebSocket:**
- ws ^8.18.0 — WebSocket server in `src/daemon/wolf-daemon.ts`, client in `src/dashboard/app/lib/wolf-client.ts`

**Dashboard (SPA):**
- React ^19.0.0 — UI framework (`src/dashboard/app/`)
- TailwindCSS ^4.0.0 — Utility-first CSS via `@tailwindcss/vite`
- Vite ^6.0.0 — Build tool with `@vitejs/plugin-react`
- Recharts ^2.15.0 — Charting library for token usage panels

**Documentation Site:**
- VitePress ^1.6.4 — Static site generator in `docs/`

**Testing:**
- Vitest ^4.1.5 — Test runner with Node environment (`vitest.config.ts`)

**Build/Dev:**
- TypeScript ^5.7.0 — Three independent compilation targets:
  - `tsconfig.json` — CLI + core (output: `dist/`)
  - `tsconfig.hooks.json` — Hooks (output: `dist/hooks/`)
  - `src/dashboard/app/vite.config.ts` — Dashboard SPA (output: `dist/dashboard/`)

## Key Dependencies

**Critical:**
- `commander` ^12.0.0 — CLI subcommands (`src/cli/index.ts`)
- `express` ^5.0.0 — Daemon HTTP API and static file serving (`src/daemon/wolf-daemon.ts`)
- `ws` ^8.18.0 — Real-time dashboard updates via WebSocket (`src/daemon/wolf-daemon.ts`)
- `chokidar` ^4.0.0 — File watcher for `.wolf/` changes (`src/daemon/file-watcher.ts`)
- `node-cron` ^3.0.3 — Cron-like task scheduling (`src/daemon/cron-engine.ts`)
- `chalk` ^5.3.0 — Terminal colored output (used across CLI commands)
- `open` ^10.0.0 — Opens browser to dashboard URL (`src/cli/dashboard.ts`)

**Optional:**
- `puppeteer-core` ^24.39.1 — Browser-based screenshot capture for DesignQC (`src/designqc/`)

**Dashboard (devDependencies but runtime deps for the SPA):**
- `react` ^19.0.0, `react-dom` ^19.0.0 — UI rendering
- `recharts` ^2.15.0 — Token usage charts
- `tailwindcss` ^4.0.0, `@tailwindcss/vite` ^4.0.0 — Styling
- `@vitejs/plugin-react` ^4.0.0 — Vite React plugin

## Configuration

**Environment:**
- No `.env` files committed (listed in `.gitignore`)
- `OPENWOLF_PROJECT_ROOT` env var overrides project root detection (`src/daemon/wolf-daemon.ts:18`)
- Node.js version: `.nvmrc` not detected; `engines.node >=20.0.0` in `package.json`

**Build:**
- `tsconfig.json` — CLI + core build config
- `tsconfig.hooks.json` — Hooks build config
- `src/dashboard/app/vite.config.ts` — Dashboard build config
- `vitest.config.ts` — Test configuration
- `pnpm-workspace.yaml` — pnpm workspace config (disables esbuild build)

**Runtime:**
- `.wolf/config.json` — Daemon, dashboard, and cron settings (port, log level, bind address)
- `.wolf/cron-manifest.json` — Scheduled task definitions
- `.wolf/cron-state.json` — Runtime cron engine state

## Platform Requirements

**Development:**
- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Git repository
- macOS, Linux, or Windows (cross-platform utilities in `src/utils/platform.ts`)

**Production:**
- No deployment target — OpenWolf is a local developer tool. CLI binary published to npm.
- Optional: GitHub Pages for docs (`docs/`), deployed via `.github/workflows/docs.yml`

## Project Structure (Built Output)

```
dist/
├── bin/
│   └── openwolf.js          # CLI entry point (build artifact)
├── hooks/                    # Compiled hooks (tsconfig.hooks.json)
│   ├── session-start.js
│   ├── pre-read.js
│   ├── post-read.js
│   ├── pre-write.js
│   ├── post-write.js
│   ├── stop.js
│   └── shared.js
├── dashboard/                # Vite-built React SPA (build:dashboard)
│   └── (index.html, assets/)
├── templates/                # Copied from src/templates/
```

---

*Stack analysis: 2026-06-07*
