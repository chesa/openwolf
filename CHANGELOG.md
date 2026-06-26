# Changelog

All notable changes to OpenWolf are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1-beta] — Canonicalize project roots before baking into settings

### Fixed

- **Symlinked workspace paths no longer leak into `.claude/settings.json`.**
  `openwolf update` now resolves the registered project root through symlinks
  (`fs.realpathSync`) before embedding it as the absolute `WOLF_ROOT` in each
  hook command. The registry also stores canonical roots for new and updated
  registrations. This prevents machine-specific symlinked paths (e.g.
  `gsd-workspaces/ACME-757/meep`) from being committed into a shared
  `.claude/settings.json`.

- **`respect_gitignore` is now opt-out (default `true`).** The scanner and
  post-write hook now honor the project-root `.gitignore` by default. Set
  `.wolf/config.json → openwolf.anatomy.respect_gitignore` to `false` to
  disable.

- **`findProjectRoot` returns canonical real paths.** The project-root scanner
  now resolves the discovered root through symlinks, so `openwolf init` and
  `openwolf update` consistently register the canonical repo path even when
  invoked from a symlinked workspace directory.

## [1.3.0-beta] — Framework-blind resume protocol

### Added

- **`openwolf learnings check` promotion-gate primitive.** Exit code `0` when
  no staged learnings await review, `1` when pending, and `2` on operational
  error. Supports `--json` for structured stdout and `--quiet` for exit-code-only
  CI use. Both the gate and the `openwolf status` Curation line route through the
  same `collectAllEntries()` source of truth.

- **`openwolf learnings accept` re-baseline command.** After a blessed hand-edit
  to `cerebrum.md`, run `openwolf learnings accept` to update the freshness
  baseline in `.wolf/cerebrum-freshness.json` with `captured_by: learnings-accept`.

- **Continuous capture breadcrumb in the universal `stop` hook.** Sessions that
  mutate code files but record no explicit proposed learning now receive a
  fixed structural stub in `.wolf/sessions/<id>/proposed-learnings.md`. The stub
  trips `openwolf learnings check` and the status Curation count, but is never
  merged into `cerebrum.md`.

- **`openwolf status` cerebrum freshness integrity (R9).** A `node:crypto` SHA-256
  hash of the normalized `cerebrum.md` body is stored in the gitignored sidecar
  `.wolf/cerebrum-freshness.json`. `openwolf status` detects a date-only
  `> Last updated:` bump with no content change and flags it as freshness
  theater. A real content change is reported as current with no flag. On a fresh
  clone with no sidecar, `status` bootstraps the baseline once; when the sidecar
  exists `status` is strictly read-only.

### Changed

- **STATUS.md removed as a seeded artifact.** `openwolf init` no longer seeds
  `.wolf/STATUS.md`. Existing consumer repos that already have a `STATUS.md`
  are not affected — the file becomes inert user-managed prose. The `stop` hook
  no longer nudges for STATUS.md freshness.

- **Framework-blind resume seam in OPENWOLF.md.** The operating protocol now
  describes a generic three-step resume order that names no execution layer:
  (1) check your execution layer's own plan/status if present, (2) read
  `cerebrum.md`, (3) scan recent `memory.md`. Teams using GSD, Superpowers,
  gstack, or no execution layer all follow the same protocol.

- **Optional `openwolf.execution_layer` hint read and surfaced.** When
  `.wolf/config.json` sets `openwolf.execution_layer` to a non-empty string,
  `openwolf status` prints `Execution layer: <value>` in the environment block
  and the session-start hook writes `OpenWolf: execution layer = <value> —
  read its plan/status first.` to stderr. Both outputs are suppressed when the
  value is `null` or absent.
