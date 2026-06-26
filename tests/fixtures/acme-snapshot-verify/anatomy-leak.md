# anatomy-leak.md — Pre-fix acme_translators anatomy excerpt (PRD evidence E5/E6/E7)
#
# This is a FROZEN snapshot of acme_translators/.wolf/anatomy.md as it existed
# BEFORE commits cac925a (R3 guard) and 2f3e1f6 (Q2 nested-path excludes) landed.
# The entries below show the two leak classes Phase 8 verifies are now prevented.
#
# Leak class 1 (E7): out-of-project /tmp-style scratch dir leaked in via post-write hook
## .claude/plans/tmp.pwYfhCNiar/draft/

> Note: the original heading in acme's anatomy.md began with `../` because this
> path resolved outside the project root. The heading above is normalized for
> readability; the R3 guard checks the `../` prefix on the raw relative path.

- `pre-commit-to-claude-hooks.md` — Migration Plan: Pre-Commit Git Hooks → Claude Hooks (~3162 tok)
- `tmp.zIDPKm5EAB` (~574 tok)

# Leak class 2 (E5/E6): docs/superpowers was in exclude_patterns yet still scanned in
## docs/superpowers/plans/

- `SUPERPOWERS_OVERVIEW.md` — Superpowers overview (~1200 tok)
