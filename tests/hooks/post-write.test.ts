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
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { appendBugEntry, newBugId, readBugEntries } from "../../src/hooks/buglog-ndjson.js";
import { autoDetectBugFix, recordAnatomyWrite } from "../../src/hooks/post-write.js";

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

describe("autoDetectBugFix — only flags code files", () => {
  it("does NOT log a bug entry for prose/markdown edits", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-pw-md-"));
    try {
      // A diff that WOULD trip the error-handling heuristic ("catch" appears),
      // but on a .md file it must be ignored.
      const oldStr = "# Notes\n\nstatus: investigating\n";
      const newStr = "# Notes\n\ntry to catch up; status: root_cause_found\n";
      autoDetectBugFix(dir, path.join(dir, "notes.md"), dir, oldStr, newStr);
      expect(readBugEntries(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOES log a bug entry for an equivalent fix in a code file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-pw-ts-"));
    try {
      const oldStr = "function load() { return JSON.parse(read()); }";
      const newStr =
        "function load() { try { return JSON.parse(read()); } catch (e) { return null; } }";
      autoDetectBugFix(dir, path.join(dir, "src", "foo.ts"), dir, oldStr, newStr);
      const entries = readBugEntries(dir);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].tags).toContain("auto-detected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("recordAnatomyWrite — out-of-project guard (R3)", () => {
  it("does NOT write anatomy for a path outside the project root", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-oop-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      // A scratch file outside the project root (simulates /tmp / scratchpad leak).
      const outside = path.join(tmpdir(), "ow-scratch-zzz", "note.md");
      recordAnatomyWrite(wolfDir, outside, dir, "# scratch\n");
      // No anatomy.md should be created for an out-of-project path.
      expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOES record an in-project file (positive control)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-ip-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      const inProject = path.join(dir, "src", "foo.ts");
      mkdirSync(path.dirname(inProject), { recursive: true });
      writeFileSync(inProject, "export const x = 1;\n");
      recordAnatomyWrite(wolfDir, inProject, dir, "");
      const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
      expect(anatomy).toContain("foo.ts");
      expect(anatomy).toContain("src/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
