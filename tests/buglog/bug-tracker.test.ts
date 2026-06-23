import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { logBug, readBugLog, searchBugs } from "../../src/buglog/bug-tracker.js";

describe("bug-tracker NDJSON", () => {
  it("logBug appends a UUID-id NDJSON line; readBugLog reads it back", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-bt-"));
    try {
      logBug(dir, { error_message: "TypeError x", file: "a.ts", root_cause: "rc", fix: "fx", tags: ["ts"] });
      logBug(dir, { error_message: "ENOENT y", file: "b.ts", root_cause: "rc2", fix: "fx2", tags: ["fs"] });
      const raw = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8").trim().split("\n");
      expect(raw).toHaveLength(2);
      const log = readBugLog(dir);
      expect(log.bugs).toHaveLength(2);
      expect(log.bugs[0].id).toMatch(/^bug-[0-9a-f]{8}$/);
      expect(log.bugs[0].id).not.toBe(log.bugs[1].id);
      expect(searchBugs(dir, "ENOENT").map((b) => b.file)).toEqual(["b.ts"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
