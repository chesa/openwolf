import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { migrateBugLog } from "../../src/cli/migrate-buglog.js";

describe("migrateBugLog", () => {
  it("converts a legacy array, preserves ids/counts, renames .bak, idempotent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-mig-"));
    try {
      const legacy = { version: 1, bugs: [
        { id: "bug-001", error_message: "a", file: "x", root_cause: "", fix: "", tags: [], related_bugs: [], occurrences: 1, last_seen: "t", timestamp: "t" },
        { id: "bug-002", error_message: "b", file: "y", root_cause: "", fix: "", tags: [], related_bugs: [], occurrences: 2, last_seen: "t", timestamp: "t" },
      ]};
      writeFileSync(path.join(dir, "buglog.json"), JSON.stringify(legacy));
      expect(migrateBugLog(dir)).toBe("migrated");
      const lines = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe("bug-001");
      expect(existsSync(path.join(dir, "buglog.json"))).toBe(false);
      expect(existsSync(path.join(dir, "buglog.json.bak"))).toBe(true);
      expect(migrateBugLog(dir)).toBe("skipped");   // idempotent
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
