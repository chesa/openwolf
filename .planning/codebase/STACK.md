# Technology Stack

**Analysis Date:** 2026-05-14

## Languages

**Primary:**
- TypeScript 5.7 - CLI, core, daemon, hooks, dashboard source
- JavaScript - Compiled output (ESM modules), configuration files

**Secondary:**
- CSS/SCSS - Dashboard styling (TailwindCSS 4)
- Markdown - Documentation, templates, configuration

## Runtime

**Environment:**
- Node.js >= 20.0.0 (tsconfig.json targets ES2022, module: Node16)
- Browser (React 19 dashboard)

**Package Manager:**
- pnpm (primary)
- npm (fallback, lock files present)
- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`

## Frameworks

**Core:**
- Commander 12.0.0 - CLI argument parsing and subcommand routing
- Express 5.0.0 - HTTP API server for daemon

**Frontend:**
- React 19.0.0 - Dashboard UI components
- Vite 6.0.0 - Dashboard build tool and dev server
- VitePress 1.6.4 - Documentation site
- TailwindCSS 4.0.0 - Utility CSS framework
- Recharts 2.15.0 - Chart/graph visualizations

**Backend Services:**
- node-cron 3.0.3 - Cron task scheduling (5-field expressions)
- ws 8.18.0 - WebSocket server for live dashboard updates
- chokidar 4.0.0 - File system watcher (watches .wolf/ for changes)
- open 10.0.0 - Opens browser to dashboard URL

**Testing:**
- Vitest 4.1.5 - Test runner and assertion library (Node environment)
- TypeScript strict mode - Type checking

## Key Dependencies

**Critical:**
- chalk 5.3.0 - Terminal color output for CLI messages
- puppeteer-core 24.39.1 (optional) - Headless browser for design QC screenshot capture

**Infrastructure:**
- @types/* packages (express, react, node, node-cron, ws) - TypeScript type definitions
- @tailwindcss/vite 4.0.0 - TailwindCSS Vite integration
- @vitejs/plugin-react 4.0.0 - React JSX transpilation for Vite

## Configuration

**TypeScript:**
- `tsconfig.json` - Main CLI + core (ES2022, strict mode, ESM)
  - Excludes: `src/dashboard/app` (separate Vite build)
  - Outputs: `dist/` directory
- `tsconfig.hooks.json` - Separate build for hooks (`src/hooks/**/*.ts` → `dist/hooks/`)
  - No source maps (hooks run from `.wolf/hooks/` after `openwolf update`)
  - Same strict settings

**Build:**
- `package.json` scripts:
  - `build`: Full build (tsc + hooks + dashboard + templates)
  - `build:hooks`: Compile hooks to `dist/hooks/`
  - `build:dashboard`: Vite build for SPA (src/dashboard/app → dist/dashboard/)
  - `build:templates`: Copy template files to `dist/templates/`
  - `dev`: TypeScript watch mode (CLI only, not hooks or dashboard)

**Testing:**
- `vitest.config.ts` - Node environment, includes `src/**/*.test.ts`

**Environment:**
- `src/utils/paths.ts` respects `CLAUDE_PROJECT_DIR` env var for multi-worktree support
- `src/daemon/wolf-daemon.ts` reads `OPENWOLF_PROJECT_ROOT` (set by CLI commands)
- `.wolf/config.json` defines daemon port, log level, cron heartbeat interval

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm (recommended) or npm
- Git (required for worktree detection in `src/utils/worktree.ts`)
- TypeScript compiler (`tsc`)

**Production/CLI:**
- Node.js 20+
- No external process dependencies (npm/git not required at runtime)

**Dashboard (Optional):**
- Modern browser with ES2022 + React 19 support (Chrome, Firefox, Safari, Edge)
- Running daemon at `localhost:18790` (default, configurable)

**Design QC (Optional):**
- Puppeteer Core (optional dependency) for headless browser screenshot capture
- Requires running dev server or `--url` parameter

---

*Stack analysis: 2026-05-14*
