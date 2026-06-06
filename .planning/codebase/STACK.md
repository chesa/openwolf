# Technology Stack

**Analysis Date:** [YYYY-MM-DD]

## Languages

**Primary:**
- TypeScript - Core logic, CLI, Dashboard
- JavaScript (Node.js) - Tooling, Scripts

**Secondary:**
- HTML/CSS (via Tailwind CSS) - Dashboard UI

## Runtime

**Environment:**
- Node.js >= 20.0.0

**Package Manager:**
- pnpm
- Lockfile: `pnpm-lock.yaml`

## Frameworks

**Core:**
- Commander - CLI command handling
- Express - Dashboard server
- ws - WebSockets
- chokidar - File system watcher
- node-cron - Task scheduling

**UI (Dashboard):**
- React - UI components
- Tailwind CSS - Styling
- Recharts - Data visualization

**Testing:**
- Vitest - Test runner and framework

**Build/Dev:**
- Vite - Build tool for dashboard
- Vitepress - Documentation framework
- TypeScript (tsc) - TypeScript compiler

## Key Dependencies

**Critical:**
- `commander`: CLI interface framework
- `express`: Dashboard backend
- `ws`: Real-time communication
- `chokidar`: Real-time file system monitoring
- `node-cron`: Cron-style job scheduling
- `puppeteer-core`: Optional browser automation

**UI:**
- `react`, `react-dom`: UI library
- `recharts`: Charting

## Configuration

**Environment:**
- Standard Node.js environment variables (no specialized auth/config provider)

**Build:**
- `tsconfig.json`, `tsconfig.hooks.json`
- `vite.config.ts` (dashboard)
- `vitest.config.ts`

## Platform Requirements

**Development:**
- Node.js >= 20.0.0
- pnpm

**Production:**
- Node.js runtime environment as a CLI tool

---

*Stack analysis: [YYYY-MM-DD]*
