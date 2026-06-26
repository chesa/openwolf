---
quick_id: 260626-mnz
slug: write-a-quick-migration-guide-for-the-te
status: complete
date: 2026-06-26
---

# Quick Task Summary: 260626-mnz

## Description

Write a quick migration guide for the team about how to update/migrate from the upstream openwolf v1.0.4 to the chesa/openwolf v1.3.x-beta.

## Completed work

1. Created `docs/migration-v1.0.4-to-v1.3.md` with a complete migration guide covering:
   - Global install command: `npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"`
   - High-level differences between upstream v1.0.4 and CHESA v1.3.x-beta
   - Step-by-step migration flow (clean working tree, backup, dry-run, root `.gitignore` check, update, v1.2 hygiene untrack, hook rebuild, verify)
   - Common gotchas (bare `openwolf update`, registry deduplication, hook isolation, dashboard/daemon)
   - Rollback via `openwolf restore`
   - Team rollout checklist
2. Added a "Migrating from upstream v1.0.4" link section to `docs/updating.md`.
3. Added the new page to the VitePress Reference sidebar in `docs/.vitepress/config.ts`.

## Commit

- `docs: add migration guide from upstream v1.0.4 to chesa v1.3.x-beta`
- Hash: `1c381dc`

## Verification

- All three files created/modified.
- Markdown follows existing VitePress documentation style.
- Sidebar link added under Reference → Update & Restore.
- Type-checking against `docs/.vitepress/config.ts` surfaced only pre-existing dependency/module-resolution errors unrelated to the new sidebar entry.
