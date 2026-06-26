# Update and Restore

How to keep OpenWolf current across projects and recover from problems.

## Overview

OpenWolf tracks every project where `openwolf init` has been run. The `update` command pushes new protocol files to all registered projects at once, while `restore` lets you roll back if something goes wrong.

---

## `openwolf update`

Updates all registered projects (or a specific one) to the latest OpenWolf version.

```bash
openwolf update
```

### What It Does

1. **Creates a timestamped backup** of each project's `.wolf/` directory before making any changes
2. **Overwrites protocol files** with the latest versions:
   - `.wolf/OPENWOLF.md`
   - `.wolf/config.json`
   - `.wolf/reframe-frameworks.md`
   - Hook scripts in `.wolf/hooks/`
   - Claude rules in `.claude/rules/openwolf.md`
3. **Preserves user data** -- these files are never overwritten:
   - `.wolf/cerebrum.md` (learned preferences and conventions)
   - `.wolf/memory.md` (session history)
   - `.wolf/buglog.ndjson` (bug tracking)
   - `.wolf/anatomy.md` (project file map)
   - Any custom files you added to `.wolf/`
4. **Updates hooks** registered in `.claude/settings.json`

### Options

```bash
openwolf update --dry-run              # show what would change, touch nothing
openwolf update --project my-app       # update only projects matching "my-app"
openwolf update --list                 # show all registered projects
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing any files. Shows which files would be overwritten, added, or skipped. |
| `--project <name>` | Update only projects whose name or path matches the given string. Partial matches work. |
| `--list` | Print all registered project paths and exit. No updates performed. |

---

## `openwolf restore`

Restore a project's `.wolf/` directory from a previous backup.

### List Available Backups

```bash
openwolf restore
```

Without arguments, this lists all available backups for the current project with their timestamps and sizes.

### Restore a Specific Backup

```bash
openwolf restore 2026-03-15T14-30-00
```

Pass a backup timestamp to restore `.wolf/` from that snapshot. The current `.wolf/` directory is replaced entirely with the backup contents.

::: warning
Restoring overwrites the entire `.wolf/` directory, including user data files like `.wolf/cerebrum.md` and `.wolf/memory.md`. If you have recent changes you want to keep, back them up manually first.
:::

---

## What Gets Backed Up

Every backup is a full copy of `.wolf/` at the time of the update. This includes:

| File | Type |
|------|------|
| `.wolf/OPENWOLF.md` | Protocol |
| `.wolf/config.json` | Protocol |
| `.wolf/reframe-frameworks.md` | Protocol |
| `.wolf/hooks/*` | Protocol |
| `.wolf/cerebrum.md` | User data |
| `.wolf/memory.md` | User data |
| `.wolf/buglog.ndjson` | User data |
| `.wolf/anatomy.md` | User data |
| `designqc-captures/*` | Generated |
| Any custom files in `.wolf/` | User data |

Backups are stored alongside the project and named by timestamp for easy identification.

---

## Registered Projects

Each time you run `openwolf init` in a project, that project's path is registered in OpenWolf's global state. This registry is what `openwolf update` iterates over.

To see all registered projects:

```bash
openwolf update --list
```

Output:

```
Registered projects:
  D:\WORKSPACE\my-app        (initialized 2026-02-10)
  D:\WORKSPACE\landing-site  (initialized 2026-02-28)
  D:\WORKSPACE\api-server    (initialized 2026-03-05)
```

Projects are registered automatically during `openwolf init`. There is no manual registration step. If a registered project path no longer exists (the directory was deleted or moved), `openwolf update` skips it and prints a warning.

---

## Tracking hygiene migration (v1.2)

As of v1.2 the `.wolf/.gitignore` template was re-based on the
**authored-vs-derived** axis (D-13). Compiled `hooks/`, legacy
`buglog.json`, and `suggestions.json` are now explicitly ignored — only
files that a named human can own, date, and validate are committed.

However, `.gitignore` does **not** untrack files that git already tracks.
If your repo was initialized before v1.2, `git ls-files .wolf/` will still
show `hooks/`, `buglog.json`, and/or `suggestions.json` even after
`openwolf update`. A one-time manual step is needed to bring the tracked
set in line with the new template.

### One-time untrack step

Run these commands in the root of your consumer repo. Each is guarded so
that a file git never tracked is a harmless no-op (git will print
`pathspec '...' did not match any files` — you can safely ignore that).

```bash
# Derived build output and local state
git rm -r --cached --ignore-unmatch .wolf/hooks \
  .wolf/designqc-captures .wolf/backups .wolf/sessions
git rm --cached --ignore-unmatch .wolf/buglog.json .wolf/anatomy.md \
  .wolf/memory.md .wolf/token-ledger.json .wolf/cron-state.json \
  .wolf/designqc-report.json .wolf/suggestions.json

# Commit the index update so teammates get the clean state on next pull.
git commit -m "chore: untrack .wolf derived files (hooks/, buglog.json, suggestions.json)"
```

After this step, `git ls-files .wolf/` should list **only** the authored set:

```
.wolf/.gitignore
.wolf/OPENWOLF.md
.wolf/cerebrum.md
.wolf/config.json
.wolf/identity.md
.wolf/reframe-frameworks.md
.wolf/buglog.ndjson
.wolf/cron-manifest.json
```

::: warning OpenWolf does not run this step for you
Running `git rm --cached` against an external working tree carries
blast-radius risk: a dirty index or uncommitted local modifications in your
repo could cause data loss. You run this step — you own the operation
against your own index.
:::

### Consumer root `.gitignore` rule

Your repo's **root** `.gitignore` must **not** re-list `.wolf/` paths such
as `.wolf/hooks/` or a blanket `.wolf/`. A root-level rule silently
overrides the per-file `.wolf/.gitignore` template because git evaluates
root rules before nested ones. This is a known regression vector: the
`acme_translators` deployment had a root rule that masked `.wolf/hooks/`,
causing hooks to appear untracked even though the template said to ignore
them.

If you have any such rules, remove them. `.wolf/.gitignore` is the single
source of truth for what gets tracked inside `.wolf/`. When `openwolf init`
detects a conflicting root rule it will print an advisory message.

### Clone-time `hooks/` rebuild

Because compiled `hooks/` are no longer committed, a fresh clone of your
repo will have an empty `.wolf/hooks/` directory. Hook scripts are rebuilt
by the **CLI**, not by hook-side self-heal:

- `openwolf init` — copies `dist/hooks/` → `.wolf/hooks/` when scaffolding
  a new `.wolf/` directory.
- `openwolf update` — refreshes `.wolf/hooks/` alongside every other
  protocol file (see the "What It Does" list above).

Run `openwolf update` after cloning to ensure hooks are in place before
starting a session. Hook-side self-heal cannot bootstrap the hooks
themselves — if `.wolf/hooks/` is absent there is no hook to execute.
