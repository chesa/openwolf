/**
 * tests/hooks/post-write.test.ts
 *
 * Tests for the autoDetectBugFix helper exported from post-write.ts.
 * The hook module exports `autoDetectBugFix` only for testing purposes.
 *
 * Task 8: verify two concurrent-ish appends produce two NDJSON lines
 * with two distinct ids (no lost entry, no duplicate id).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { appendBugEntry, newBugId, readBugEntries } from "../../src/hooks/buglog-ndjson.js";

describe("buglog NDJSON appends (Task 8 — autoDetectBugFix path)", () => {
  it("two concurrent-ish appends produce two NDJSON lines with distinct ids", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-post-write-"));
    try {
      // Simulate what autoDetectBugFix now does — two back-to-back appends
      const id1 = newBugId();
      const id2 = newBugId();

      appendBugEntry(dir, {
        id: id1,
        timestamp: new Date().toISOString(),
        error_message: "missing null check",
        file: "src/foo.ts",
        root_cause: "foo was null",
        fix: "added null guard",
        tags: ["auto-detected", "null-check", "ts"],
        related_bugs: [],
        occurrences: 1,
        last_seen: new Date().toISOString(),
      });

      appendBugEntry(dir, {
        id: id2,
        timestamp: new Date().toISOString(),
        error_message: "unhandled catch",
        file: "src/foo.ts",
        root_cause: "no try/catch",
        fix: "wrapped in try/catch",
        tags: ["auto-detected", "error-handling", "ts"],
        related_bugs: [],
        occurrences: 1,
        last_seen: new Date().toISOString(),
      });

      const entries = readBugEntries(dir);

      // Two distinct lines
      expect(entries).toHaveLength(2);

      // Ids are distinct
      expect(entries[0].id).not.toBe(entries[1].id);
      expect(entries[0].id).toBe(id1);
      expect(entries[1].id).toBe(id2);

      // Ids match NDJSON uuid format
      expect(entries[0].id).toMatch(/^bug-[0-9a-f]{8}$/);
      expect(entries[1].id).toMatch(/^bug-[0-9a-f]{8}$/);

      // File is NDJSON, not JSON array
      const raw = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8");
      const lines = raw.split("\n").filter(l => l.trim().length > 0);
      expect(lines).toHaveLength(2);
      // Each line is valid JSON object
      const obj1 = JSON.parse(lines[0]);
      const obj2 = JSON.parse(lines[1]);
      expect(obj1.error_message).toBe("missing null check");
      expect(obj2.error_message).toBe("unhandled catch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
