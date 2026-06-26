# Migrating from upstream OpenWolf v1.0.4 to CHESA OpenWolf v1.3.x-beta

This guide is for teams that started on the upstream `openwolf` package and want to move to the CHESA fork (`chesa/openwolf`) at the v1.3.x-beta line.

## Why migrate?

The CHESA fork adds CHESA-specific conventions and workflow tooling on top of the upstream OpenWolf protocol:

- **Bitbucket-first workflow** support (uses `bb` CLI, not `gh`).
- **GSD integration**: `/gsd-quick`, `/gsd-new-project`, and related planning tools live under `.planning/`.
- **Daemon + dashboard** for scheduling, token tracking, and project status.
- **Framework-blind hooks**: the fork deliberately does not hard-code a single execution framework.
- **v1.2 tracking hygiene**: `.wolf/.gitignore` is now based on an *authored-vs-derived* axis, so compiled `hooks/`, `buglog.json`, `suggestions.json`, and other derived files are explicitly ignored.

## Install the CHESA fork

Install the fork globally from the `release/1.3.3-beta` branch. The `--install-links` flag avoids npm symlink issues with git-hosted packages:

```bash
npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"
```

Verify the install:

```bash
openwolf --version
```

## High-level differences

| Area | upstream v1.0.4 | CHESA v1.3.x-beta |
|------|-----------------|-------------------|
| Package | `openwolf` | `chesa/openwolf` |
| Git host | GitHub-first defaults | Bitbucket-first defaults (`bb` CLI) |
| Planning | OpenWolf only (`STATUS.md`, `cerebrum.md`) | GSD milestones + OpenWolf context (`.planning/` + `.wolf/`) |
| Update command | `openwolf update` | `openwolf update <name>` or `openwolf update --all` |
| Compiled hooks | Committed inside `.wolf/hooks/` | Ignored; rebuilt by CLI via `openwolf init` / `openwolf update` |
| Registry | Implicit per-project | Deduplicates on read via realpath; canonicalized on write |
| Dashboard / daemon | Not present | Present in v1.3.x |

## Migration steps

Run these from the root of the consumer repo you want to migrate.

### 1. Make sure the working tree is clean

```bash
git status
```

Commit or stash any in-flight work before touching `.wolf/`.

### 2. Back up `.wolf/`

`openwolf update` already creates a timestamped backup, but an extra manual copy is cheap insurance:

```bash
cp -R .wolf .wolf-pre-migration-backup
```

### 3. Preview the update

```bash
openwolf update --dry-run
```

This shows which protocol files would be overwritten and which user-data files would be left alone. It does **not** write anything.

### 4. Check your root `.gitignore`

Your repo's **root** `.gitignore` must **not** re-list `.wolf/` paths (for example `.wolf/hooks/` or a blanket `.wolf/`). A root-level rule silently overrides the nested `.wolf/.gitignore` template, because git evaluates root rules first.

If you see rules like this, remove them:

```gitignore
# Remove these if present
.wolf/hooks/
.wolf/backups/
.wolf/
```

`.wolf/.gitignore` is the single source of truth for what gets tracked inside `.wolf/`.

### 5. Run the update

If your project is already registered, update it by name or use `--all`:

```bash
openwolf update --all
```

If the project is **not** registered yet (for example, this is a fresh clone of an upstream-initialized repo), run `openwolf init` first:

```bash
openwolf init
```

`openwolf init` scaffolds `.wolf/` and registers the project. It does not overwrite existing user-data files.

### 6. One-time untrack of derived files (v1.2 hygiene)

The new `.wolf/.gitignore` template ignores derived files, but `.gitignore` does **not** untrack files git already tracks. Run this once per repo to bring the tracked set in line with the template:

```bash
# Derived build output and local state
git rm -r --cached --ignore-unmatch .wolf/hooks \
  .wolf/designqc-captures .wolf/backups .wolf/sessions
git rm --cached --ignore-unmatch .wolf/buglog.json .wolf/anatomy.md \
  .wolf/memory.md .wolf/token-ledger.json .wolf/cron-state.json \
  .wolf/designqc-report.json .wolf/suggestions.json \
  .wolf/cerebrum-freshness.json
```

Then commit the index update:

```bash
git commit -m "chore: untrack .wolf derived and per-dev files"
```

After this step, `git ls-files .wolf/` should list only the authored set:

```text
.wolf/.gitignore
.wolf/OPENWOLF.md
.wolf/cerebrum.md
.wolf/config.json
.wolf/identity.md
.wolf/reframe-frameworks.md
.wolf/buglog.ndjson
.wolf/cron-manifest.json
```

::: warning
OpenWolf does **not** run this step for you, because touching another repo's git index carries blast-radius risk. You run it, you own it.
:::

### 7. Rebuild hooks

Because compiled `hooks/` are no longer committed, a fresh clone or a teammate's machine needs an explicit rebuild:

```bash
openwolf update --all
```

Hook-side self-heal cannot bootstrap the hooks themselves — if `.wolf/hooks/` is empty, there is no hook to execute.

### 8. Verify

```bash
openwolf update --list
```

You should see your project path in the registered list. Then smoke-test the CLI:

```bash
openwolf --help
node .wolf/hooks/session-start.js --help 2>/dev/null || true
```

## Common gotchas

- **`openwolf update` now requires a name or `--all`**. A bare `openwolf update` prints usage and exits. Use `openwolf update <name>` for a single project or `openwolf update --all` for everything.
- **Multiple registry matches error out**. If a partial name matches more than one project, the CLI stops and asks for disambiguation.
- **Hooks are runtime-isolated**. They cannot import from `src/utils/`; shared utilities live in `src/hooks/shared.ts`.
- **Dashboard and daemon are optional but real**. If your team does not use them, `.wolf/config.json` can disable scheduling and dashboard startup.

## Rollback

If something goes wrong, use the backup `openwolf update` created automatically:

```bash
openwolf restore
```

This lists available backups. Restore a specific one with its timestamp:

```bash
openwolf restore 2026-06-26T14-30-00
```

::: warning
`openwolf restore` replaces the entire `.wolf/` directory, including user-data files. If you have recent `.wolf/cerebrum.md` or `.wolf/memory.md` changes you want to keep, copy them out first.
:::

## Team rollout checklist

- [ ] Everyone installs the same fork version: `npm install -g --install-links "chesa/openwolf#release/1.3.3-beta"`
- [ ] One person migrates the shared repo and opens the untrack commit.
- [ ] Teammates pull the untrack commit, then run `openwolf update --all`.
- [ ] Confirm `git ls-files .wolf/` matches the authored set above.
- [ ] Run `openwolf --version` and `openwolf update --list` on each machine.

## Need help?

See the full update reference at [Update & Restore](./updating) and the project-specific GSD/Claude instructions in your repo's `.claude/CLAUDE.md` and `.wolf/OPENWOLF.md`.
