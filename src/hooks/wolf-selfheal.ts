import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

/**
 * True when `<wolfDir>/anatomy.md` is missing or a stub (no file entries) —
 * e.g. a fresh clone, where anatomy.md is now a gitignored, regenerated artifact
 * and nothing has scanned the tree yet.
 */
export function anatomyNeedsRescan(wolfDir: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
  } catch {
    return true; // missing
  }
  // serializeAnatomy() emits one "- `file`…" line per tracked file; a bare
  // template/stub has none.
  return !content.split("\n").some((line) => line.startsWith("- `"));
}

/**
 * Self-heal: when anatomy.md is missing/stub, trigger a background full rescan so
 * the map repopulates without the user running `openwolf scan` by hand. Fire-and-
 * forget (detached + unref'd) so it never blocks session start or trips the hook
 * timeout — the map is ready for the next read/session.
 *
 * We spawn the `openwolf` CLI rather than importing the scanner directly: the
 * scanner (`src/scanner`) is CLI-only — it pulls in the `ignore` dependency — and
 * importing it into a hook would break the standalone hook build (MODULE_NOT_FOUND,
 * the same failure class as the WOLF_ROOT bug). Best-effort: if the CLI isn't on
 * PATH we degrade silently (no worse than before self-heal existed).
 */
export function selfHealAnatomy(wolfDir: string, projectRoot?: string): void {
  if (!anatomyNeedsRescan(wolfDir)) return;
  try {
    const child = spawn("openwolf", ["scan"], {
      cwd: projectRoot ?? path.dirname(wolfDir),
      detached: true,
      stdio: "ignore",
    });
    // 'openwolf' not on PATH emits 'error' asynchronously — swallow it so the
    // detached child can't crash the (already-exiting) hook.
    child.on("error", () => {});
    child.unref();
    process.stderr.write(
      "🐺 OpenWolf: anatomy.md missing/empty — running `openwolf scan` in the background to rebuild it.\n"
    );
  } catch {
    // Never let self-heal break session start.
  }
}
