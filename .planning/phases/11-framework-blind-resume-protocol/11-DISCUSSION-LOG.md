# Phase 11: Framework-Blind Resume Protocol - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 11-framework-blind-resume-protocol
**Areas discussed:** execution_layer template treatment, historical-docs handling, upgrade-path safety, status rendering, version semantics

> Mode: ran as `--auto` after an interactive `--assumptions` pass. The four
> substantive gray areas were resolved by the user directly during that pass;
> `--auto` confirmed the recommended option for each.

---

## `execution_layer` Template Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Seed `null` + explanatory comment | Initialize the key in template `config.json` for discoverability; read-only-if-present | ✓ |
| Read-only, no slot | Read the key if a repo sets it, but never seed it | |

**User's choice:** Seed `execution_layer: null` with an explanatory comment.
**Notes:** Maximizes discoverability without violating C1 (no hardcoded framework names). Consumers = `openwolf status` + session-resume greeting; value surfaced verbatim when non-null, silent when null/absent. Planner flag: template `config.json` is strict JSON — the "comment" must be a sibling note key or live in `docs/configuration.md` (D11-06).

---

## Historical `docs/superpowers/*` Artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite the historical text | Edit past specs to remove STATUS references | |
| Prepend a deprecation banner | Leave history intact; add a blockquote pointing to the new seam | ✓ |

**User's choice:** Prepend a standard deprecation notice; do not alter historical text.
**Notes:** Rewriting history destroys the audit trail. C1 targets code-path string literals, not docs. Current guides (README, ARCHITECTURE, configuration) are rewritten normally (D11-09).

---

## Upgrade Path for Existing `STATUS.md`

| Option | Description | Selected |
|--------|-------------|----------|
| Non-destructive (leave it) | `update` never deletes; OpenWolf just stops seeding/requiring/reading it | ✓ |
| Auto-delete on upgrade | Remove an existing STATUS.md during `update` | |

**User's choice:** Strictly non-destructive — never delete a user's file.
**Notes:** Automating deletion of files in a consumer repo violates basic safety. STATUS.md shifts from mandated protocol file to unmanaged user prose (D11-08).

---

## `openwolf status` Rendering of the Hint

| Option | Description | Selected |
|--------|-------------|----------|
| Plain key-value line | One `Execution layer: X` line in the top environment block, no color | ✓ |
| Highlighted "Active Environment" banner | Prominent colored banner at top of output | |

**User's choice:** (asked Claude to recommend) → key-value pair.
**Notes:** `status.ts` has no color vocabulary today (plain `console.log` + `✓/✗/-`); a banner would introduce a new styling pattern and over-claim authority the negative boundary renounces. Surface only when non-null; same treatment in the session-start greeting (D11-07).

---

## Version Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| No further bump (changelog only) | `1.3.0-beta` already satisfies ≥ minor over `1.1` | ✓ |
| Additional bump | Manipulate version again this phase | |

**User's choice:** No further version manipulation; document in changelog.
**Notes:** Branch is already `1.3.0-beta` (D11-12).

---

## Claude's Discretion

- Exact prose of the new OPENWOLF.md negative-boundary section and 3-step resume order (must name no tool).
- The `execution_layer` "comment" mechanism (sibling note key vs `docs/configuration.md`-only vs both).
- Whether the `session-start.ts` hint read is inline or a small helper; how `status.ts` loads the value.

## Deferred Ideas

- Acting on `execution_layer` (branching behavior, auto-detection, allow-list validation) — beyond R11's "read if present."
- R7a/R7b/R9 curation machinery on `stop.ts` — Phase 12; this phase leaves the seam empty.
- Auto-migrating existing STATUS.md content into cerebrum/memory — rejected (non-destructive = leave it, not migrate it).
