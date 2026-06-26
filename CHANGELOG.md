# Changelog

All notable changes to OpenWolf are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0-beta] — Framework-blind resume protocol

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
