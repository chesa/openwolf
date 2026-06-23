import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { updateJSON, readJSON } from "../../src/hooks/wolf-json.js";

describe("updateJSON", () => {
  it("reads, mutates, and writes under one lock", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "ledger.json");
    try {
      writeFileSync(f, JSON.stringify({ n: 1 }));
      updateJSON<{ n: number }>(f, { n: 0 }, (cur) => ({ n: cur.n + 1 }));
      expect(readJSON<{ n: number }>(f, { n: 0 }).n).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the fallback when the file is absent, then persists it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "missing.json");
    try {
      updateJSON<{ n: number }>(f, { n: 10 }, (cur) => ({ n: cur.n + 5 }));
      expect(JSON.parse(readFileSync(f, "utf-8")).n).toBe(15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT emit an unlocked-fallback warning (no nested re-lock)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-json-"));
    const f = path.join(dir, "x.json");
    const errs: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (s: string) => { errs.push(String(s)); return true; };
    try {
      updateJSON<{ n: number }>(f, { n: 0 }, (c) => ({ n: c.n + 1 }));
    } finally {
      (process.stderr as any).write = orig;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(errs.join("")).not.toMatch(/proceeding unlocked/);
  });
});
