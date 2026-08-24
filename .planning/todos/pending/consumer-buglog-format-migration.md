---
title: Migration path for consumer repos before the v2.5.0 baseline reset
date: 2026-08-24
priority: high
---

# Consumer Migration Path — Pre-Reset Gate

Blocks any consumer repo from taking the v2.5.0 baseline reset (see
[`../../seeds/v1.3-baseline-reset-on-v2.5.0.md`](../../seeds/v1.3-baseline-reset-on-v2.5.0.md)).

## The problem

Known consumers — acme_translators (3 devs, 225+ sessions) and
iconik-spectra-riobroker — run chesa/openwolf `1.3.3-beta`, whose `.wolf/`
layout includes:

- `buglog.ndjson` (append-only NDJSON, `bug-<8hex>` ids) — upstream v2.5.0 still
  ships `buglog.json`
- `.wolf/.gitignore` from the authored-vs-derived template — no upstream
  equivalent
- proposed-learnings staging under `.wolf/sessions/<worktreeId>/` — no upstream
  equivalent

A naive reset regresses their audit logs and un-tracks or re-tracks files the
team has been curating.

## What to produce

1. Inventory the actual on-disk `.wolf/` delta between 1.3.3-beta and a v2.5.0
   checkout — not the template diff, the *installed* diff.
2. Decide direction per artifact: migrate forward, preserve fork format, or
   accept upstream's.
3. A runnable migration for the buglog specifically. `src/cli/migrate-buglog.ts`
   already migrates `buglog.json` → `buglog.ndjson`; the reset may need the
   reverse, or needs `buglog.ndjson` re-ported so no migration is required.
4. Supersede or amend the existing team migration guide (quick task
   `260626-mnz`, commit `1c381dc`) — it documents upstream v1.0.4 → chesa
   v1.3.x and goes stale the moment the baseline moves.
5. Confirm nobody on acme is mid-project before scheduling the cutover.

## Note

The existing guide was written for a fork *ahead* of upstream. This migration is
the opposite shape — a fork adopting upstream's base while keeping its own
collaboration layer. Don't reuse the old guide's structure without checking that
the direction still makes sense.
