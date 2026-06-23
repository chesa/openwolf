/**
 * Format-drift guard: verifies that the hooks buglog-ndjson module and the
 * CLI bug-tracker module produce and consume identical on-disk NDJSON.
 *
 * These two modules intentionally duplicate the read/append logic because the
 * hooks compile boundary forbids importing from src/buglog/. This test is the
 * regression guard that keeps them in sync.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// Hooks side
import {
  appendBugEntry,
  readBugEntries,
  newBugId,
} from "../../src/hooks/buglog-ndjson.js";

// CLI side
import { logBug, readBugLog } from "../../src/buglog/bug-tracker.js";

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), "ow-drift-"));
}

describe("NDJSON format-drift: hooks <-> CLI", () => {
  it("hooks appendBugEntry is readable by CLI readBugLog", () => {
    const dir = tmpDir();
    try {
      const id = newBugId();
      const now = new Date().toISOString();
      const entry = {
        id,
        timestamp: now,
        error_message: "hooks-written error",
        file: "src/hooks/test.ts",
        root_cause: "test root cause",
        fix: "test fix",
        tags: ["hooks", "test"],
        related_bugs: [] as string[],
        occurrences: 1,
        last_seen: now,
      };
      appendBugEntry(dir, entry);

      const log = readBugLog(dir);
      expect(log.bugs).toHaveLength(1);
      const read = log.bugs[0];
      expect(read.id).toBe(id);
      expect(read.error_message).toBe(entry.error_message);
      expect(read.file).toBe(entry.file);
      expect(read.root_cause).toBe(entry.root_cause);
      expect(read.fix).toBe(entry.fix);
      expect(read.tags).toEqual(entry.tags);
      expect(read.related_bugs).toEqual([]);
      expect(read.occurrences).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI logBug is readable by hooks readBugEntries", () => {
    const dir = tmpDir();
    try {
      logBug(dir, {
        error_message: "cli-written error",
        file: "src/buglog/test.ts",
        root_cause: "cli root cause",
        fix: "cli fix",
        tags: ["cli", "test"],
      });

      const entries = readBugEntries(dir);
      expect(entries).toHaveLength(1);
      const e = entries[0];
      expect(e.id).toMatch(/^bug-[0-9a-f]{8}$/);
      expect(e.error_message).toBe("cli-written error");
      expect(e.file).toBe("src/buglog/test.ts");
      expect(e.root_cause).toBe("cli root cause");
      expect(e.fix).toBe("cli fix");
      expect(e.tags).toEqual(["cli", "test"]);
      expect(e.related_bugs).toEqual([]);
      expect(e.occurrences).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("both writers produce compact single-line JSON (no pretty-printing)", () => {
    const dir = tmpDir();
    try {
      const id = newBugId();
      const now = new Date().toISOString();
      appendBugEntry(dir, {
        id,
        timestamp: now,
        error_message: "e1",
        file: "f1.ts",
        root_cause: "rc1",
        fix: "fx1",
        tags: [],
        related_bugs: [],
        occurrences: 1,
        last_seen: now,
      });
      logBug(dir, {
        error_message: "e2",
        file: "f2.ts",
        root_cause: "rc2",
        fix: "fx2",
        tags: [],
      });

      const raw = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8");
      const lines = raw.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        // Compact: no internal newlines, parses as valid JSON
        expect(line).not.toContain("\n");
        const obj = JSON.parse(line) as Record<string, unknown>;
        expect(obj).toBeTruthy();
        // Each line must equal JSON.stringify(obj) + nothing (no trailing spaces)
        expect(line).toBe(JSON.stringify(obj));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("each reader tolerates lines written by the other writer", () => {
    const dir = tmpDir();
    try {
      const id = newBugId();
      const now = new Date().toISOString();
      // Write one via hooks, one via CLI
      appendBugEntry(dir, {
        id,
        timestamp: now,
        error_message: "hook entry",
        file: "hook.ts",
        root_cause: "hr",
        fix: "hf",
        tags: ["hook"],
        related_bugs: [],
        occurrences: 1,
        last_seen: now,
      });
      logBug(dir, {
        error_message: "cli entry",
        file: "cli.ts",
        root_cause: "cr",
        fix: "cf",
        tags: ["cli"],
      });

      // CLI reader sees both
      const cliLog = readBugLog(dir);
      expect(cliLog.bugs).toHaveLength(2);

      // Hooks reader sees both
      const hookEntries = readBugEntries(dir);
      expect(hookEntries).toHaveLength(2);

      // Same ids across both readers
      const cliIds = cliLog.bugs.map((b) => b.id).sort();
      const hookIds = hookEntries.map((e) => e.id).sort();
      expect(cliIds).toEqual(hookIds);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
