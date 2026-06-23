import * as fs from "node:fs";
import * as path from "node:path";

export function migrateBugLog(wolfDir: string): "migrated" | "skipped" {
  const ndjson = path.join(wolfDir, "buglog.ndjson");
  const legacy = path.join(wolfDir, "buglog.json");
  if (fs.existsSync(ndjson)) return "skipped";
  if (!fs.existsSync(legacy)) return "skipped";
  let parsed: { bugs?: unknown[] };
  try { parsed = JSON.parse(fs.readFileSync(legacy, "utf-8")); }
  catch { return "skipped"; }   // leave a corrupt legacy file untouched
  const bugs = Array.isArray(parsed.bugs) ? parsed.bugs : [];
  const tmp = ndjson + "." + Date.now() + ".tmp";
  fs.writeFileSync(tmp, bugs.map((b) => JSON.stringify(b)).join("\n") + (bugs.length ? "\n" : ""), "utf-8");
  fs.renameSync(tmp, ndjson);
  fs.renameSync(legacy, legacy + ".bak");
  return "migrated";
}
