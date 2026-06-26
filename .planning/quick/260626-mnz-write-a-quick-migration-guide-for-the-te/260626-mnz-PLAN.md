---
quick_id: 260626-mnz
slug: write-a-quick-migration-guide-for-the-te
mode: quick
description: Write a quick migration guide for the team about how to update/migrate from the upstream openwolf v1.0.4 to the chesa/openwolf v1.3.x-beta
---

# Quick Plan: 260626-mnz

## Task 1: Create migration guide document

**Files:** `docs/migration-v1.0.4-to-v1.3.md`
**Action:** Write a concise migration guide covering:
- Install the CHESA fork globally: `npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"`
- Differences between upstream v1.0.4 and CHESA fork v1.3.x-beta (registry, update semantics, daemon/dashboard, framework-blind hooks, v1.2 tracking-hygiene changes)
- Step-by-step migration for an existing upstream-initialized project
  - Backup `.wolf/`
  - Run `openwolf update --dry-run`
  - Resolve any root `.gitignore` conflicts
  - Run `openwolf update`
  - Untrack derived files per v1.2 hygiene (one-time manual `git rm --cached`)
  - Rebuild hooks with `openwolf update` / `openwolf init`
  - Verify with `openwolf update --list`
- Breaking changes / gotchas (compiled hooks no longer committed, `.wolf/.gitignore` template change, `openwolf update` requires name or `--all`)
- Rollback path with `openwolf restore`
- Team install note: use `--install-links` to avoid npm symlink issues with git-hosted packages
**Verify:** File exists, follows VitePress/markdown conventions, and covers every bullet above.
**Done:** `docs/migration-v1.0.4-to-v1.3.md` committed.

## Task 2: Link from existing update documentation

**Files:** `docs/updating.md`
**Action:** Add a short "Migrating from upstream v1.0.4" section near the top of `docs/updating.md` that links to the new migration guide.
**Verify:** Section exists and link is valid.
**Done:** `docs/updating.md` committed.

## Task 3: Add page to VitePress sidebar

**Files:** `docs/.vitepress/config.ts`
**Action:** Add `{ text: "Migration: v1.0.4 → v1.3", link: "/migration-v1.0.4-to-v1.3" }` in the Reference sidebar, directly under the "Update & Restore" entry.
**Verify:** Sidebar config is syntactically valid TypeScript and the new page is reachable.
**Done:** `docs/.vitepress/config.ts` committed.
