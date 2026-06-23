import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { newBugId, appendBugEntry, readBugEntries, countBugEntries, bugLogPath } from "../../src/hooks/buglog-ndjson.js";

const mk = (over = {}) => ({
  id: newBugId(), timestamp: "t", error_message: "boom", file: "a.ts",
  root_cause: "rc", fix: "fx", tags: ["x"], related_bugs: [], occurrences: 1, last_seen: "t", ...over,
});

describe("buglog-ndjson", () => {
  it("ids are unique and prefixed", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newBugId()));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^bug-[0-9a-f]{8}$/);
  });

  it("append then read round-trips", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-ndjson-"));
    try {
      appendBugEntry(dir, mk({ error_message: "one" }));
      appendBugEntry(dir, mk({ error_message: "two" }));
      const got = readBugEntries(dir);
      expect(got.map((b) => b.error_message)).toEqual(["one", "two"]);
      expect(countBugEntries(dir)).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("tolerates blank lines and a torn final line", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-ndjson-"));
    try {
      appendBugEntry(dir, mk({ error_message: "good" }));
      appendFileSync(bugLogPath(dir), "\n{\"id\":\"bug-partial\",\"error_mess");  // no newline, truncated
      const got = readBugEntries(dir);
      expect(got).toHaveLength(1);
      expect(got[0].error_message).toBe("good");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
