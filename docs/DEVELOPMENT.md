<!-- generated-by: gsd-doc-writer -->

# Development

How to set up, build, and contribute to OpenWolf.

---

## Local Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/your-username/openwolf.git
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

   ```bash
   node dist/bin/openwolf.js --help
   ```

> **Prerequisites:** Node.js >= 20.0.0. See [Getting Started](getting-started.md) for full prerequisite details.

---

## Build Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Full build: TypeScript CLI + hooks bundle + React dashboard + templates copy |
| `pnpm build:hooks` | Compile hooks only (`tsconfig.hooks.json` -> `dist/hooks/`) |
| `pnpm build:dashboard` | Build Vite React dashboard only (`dist/dashboard/`) |
| `pnpm build:templates` | Copy `src/templates/` to `dist/templates/` |
| `pnpm dev` | Watch mode (TypeScript CLI only, not hooks/dashboard) |
| `pnpm clean` | Remove `dist/`, `.wolf/designqc-captures/`, and temp directories |

OpenWolf has **three independently compiled parts** that must all be built for a working CLI:

1. **CLI + core** (`tsc` via `tsconfig.json`) -- compiles `bin/` and `src/` (excluding `src/dashboard/app`) to `dist/`.
2. **Hooks** (`tsc -p tsconfig.hooks.json`) -- compiles `src/hooks/*.ts` into standalone Node scripts that Claude Code executes directly.
3. **Dashboard** (Vite, `src/dashboard/app`) -- a React 19 + TailwindCSS 4 SPA built to `dist/dashboard/`.

> **Important:** After editing hooks, you must also copy them into `.wolf/hooks/` to test them with Claude Code: `pnpm build:hooks && node dist/bin/openwolf.js update`

---

## Code Style

OpenWolf does not currently enforce linting or formatting via ESLint, Prettier, or Biome. Follow these conventions:

- Use **TypeScript strict mode** (`strict: true` in `tsconfig.json`).
- Prefer `const` and explicit types for public APIs.
- Use 2-space indentation for TypeScript and JSON.
- Keep line lengths reasonable; break long lines for readability.
- Match existing code style when editing files.

---

## Branch Conventions

No formal branch naming convention is documented. The default branch is `main`.

Create a descriptive branch name for your change:

```bash
git checkout -b my-change
```

---

## PR Process

1. Keep PRs focused -- one feature or fix per PR.
2. Describe what your PR does and why in the description.
3. If your change is platform-specific, note which platforms you tested on.
4. Update `README.md` if you add or change commands.
5. Update `src/templates/` if you change the `.wolf/` file structure.
6. Build and verify before pushing: `pnpm build && node dist/bin/openwolf.js --help`.
7. Commit with a clear message describing **what** and **why**.
8. Push and open a pull request against `main`.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution guide.

---

## Testing

Run the test suite with Vitest:

```bash
pnpm test         # Run once
pnpm test:watch   # Watch mode
```

Tests live in `tests/` and mirror the `src/` structure. Integration tests use the real filesystem and real `git` binary.

See [TESTING.md](TESTING.md) for detailed testing documentation.

---

## CI / CD

The only CI workflow is `.github/workflows/docs.yml`, which builds and deploys the VitePress documentation site to GitHub Pages on pushes to `main` that touch `docs/**`.

There is no automated test or build CI pipeline at this time.

---

## Documentation

| Command | Description |
|---------|-------------|
| `pnpm docs:dev` | Start the VitePress documentation site locally |
| `pnpm docs:build` | Build the documentation site for deployment |

The docs site is deployed to GitHub Pages automatically when changes are pushed to `main`.

---

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](../LICENSE) license.
