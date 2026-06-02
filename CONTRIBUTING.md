<!-- generated-by: gsd-doc-writer -->

# Contributing to OpenWolf

Thank you for your interest in contributing to OpenWolf. This document outlines
the process for submitting changes, reporting issues, and the standards we
expect.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Development Setup

1. **Prerequisites:** Node.js `>=20.0.0` and `pnpm`.
2. **Clone and install:**
   ```bash
   git clone https://github.com/cytostack/openwolf.git
   cd openwolf
   pnpm install
   ```
3. **Build all parts:**
   ```bash
   pnpm build
   ```
   This compiles the CLI core, hooks, dashboard, and templates into `dist/`.
4. **Smoke-test the build:**
   ```bash
   node dist/bin/openwolf.js --help
   ```
5. **Run tests:**
   ```bash
   pnpm test
   ```

See [docs/getting-started.md](docs/getting-started.md) for a full walkthrough of
installation and first-run.

### Project Structure

```
src/
├── cli/           CLI commands and program setup
├── daemon/        Background task scheduler (cron engine)
├── designqc/      Screenshot capture for design evaluation
├── scanner/       Project structure scanner (anatomy.md)
├── tracker/       Token tracking and ledger
├── hooks/         Claude Code lifecycle hooks
├── dashboard/     React web dashboard (Vite + TailwindCSS)
├── buglog/        Bug memory system
├── utils/         Shared utilities
└── templates/     Files created by `openwolf init`
```

### Useful Build Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Full build (TypeScript + hooks + dashboard) |
| `pnpm build:hooks` | Compile hooks only |
| `pnpm build:dashboard` | Build the React dashboard only |
| `pnpm dev` | Watch mode for TypeScript CLI/core |
| `pnpm docs:dev` | Start the local VitePress docs site |

## Coding Standards

- **TypeScript strict mode:** The project compiles with `strict: true`. Run the
  following before committing to catch type errors:
  ```bash
  tsc --noEmit
  tsc --noEmit -p tsconfig.hooks.json
  ```
- **Tests:** All changes must keep the existing test suite passing. Test files
  use the suffix `*.test.ts` (unit) or `*.integration.test.ts` (integration).
  Run `pnpm test` before opening a pull request.
- **Style:** Follow the existing file organization in `src/` and match the
  naming conventions already in use.

## Pull Request Guidelines

- Branch from `main`.
- Use conventional commit style for commit messages:
  `type(scope): description` (e.g., `fix(cli): handle missing .wolf dir`).
- Keep pull requests focused on a single concern.
- Ensure `pnpm build` and `pnpm test` pass before requesting review.
- Update `README.md` if you add or change commands.
- Update `src/templates/` if you change the `.wolf/` file structure.
- Update relevant pages under `docs/` if user-facing behavior changes.

## Issue Reporting

Open bugs and feature requests on [GitHub
Issues](https://github.com/cytostack/openwolf/issues).

- **Bugs:** Include your OS and Node.js version, steps to reproduce, expected
  behavior, actual behavior, and any relevant logs.
- **Features:** Describe the problem you are solving and your proposed solution.

## Platform Notes

OpenWolf supports Windows, macOS, and Linux. Platform-specific code is
centralized in `src/utils/platform.ts`. If your change involves process
management, file paths, or shell commands, make sure it works across platforms
or uses the platform utilities.

## License

By contributing, you agree that your contributions will be licensed under the
[AGPL-3.0](LICENSE) license.
