// merge-accumulation.test.ts — in-process accumulation test (TEST-01), NOT a
// concurrency proof. See 07-01-PLAN.md "Concurrency Coverage Rationale" and
// 2026-06-23-shared-checkout-concurrency-phase1-LEARNINGS.md.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const originalStderrWrite = process.stderr.write;

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));

vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn((_path: string, fn: () => void) => fn()),
}));

const mockAnswers = { queue: ["a", "y"], index: 0 };

vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_query: string, cb: (a: string) => void) => {
      cb(mockAnswers.queue[mockAnswers.index++] ?? "");
    }),
    close: vi.fn(),
  })),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";
import { withFileLock } from "../../src/hooks/wolf-lock.js";

describe("learnings merge — multi-session accumulation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-con-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    process.stderr.write = vi.fn(() => true) as any;
    mockAnswers.queue = ["a", "y"];
    mockAnswers.index = 0;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.stderr.write = originalStderrWrite;
  });

  it("merges proposals from two sessions into cerebrum.md intact", async () => {
    const sess1 = path.join(tmpDir, "sessions", "sess001");
    const sess2 = path.join(tmpDir, "sessions", "sess002");
    mkdirSync(sess1, { recursive: true });
    mkdirSync(sess2, { recursive: true });
    writeFileSync(
      path.join(sess1, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nContent from session one\n",
      "utf-8"
    );
    writeFileSync(
      path.join(sess2, "proposed-learnings.md"),
      "\n## 2026-06-23T13:00:00.000Z → cerebrum\n\nContent from session two\n",
      "utf-8"
    );

    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();

    const merged = fs.readFileSync(path.join(tmpDir, "cerebrum.md"), "utf-8");
    expect(merged).toContain("Content from session one");
    expect(merged).toContain("Content from session two");
    // MERGE-02: the shared-file write must be lock-protected.
    expect(vi.mocked(withFileLock)).toHaveBeenCalled();
    expect(fs.existsSync(path.join(sess1, "proposed-learnings.md"))).toBe(false);
    expect(fs.existsSync(path.join(sess2, "proposed-learnings.md"))).toBe(false);
  });

  it("archives consumed entries from both sessions after merge", async () => {
    const sess1 = path.join(tmpDir, "sessions", "s001");
    const sess2 = path.join(tmpDir, "sessions", "s002");
    mkdirSync(sess1, { recursive: true });
    mkdirSync(sess2, { recursive: true });
    writeFileSync(
      path.join(sess1, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nS1 content\n",
      "utf-8"
    );
    writeFileSync(
      path.join(sess2, "proposed-learnings.md"),
      "\n## 2026-06-23T13:00:00.000Z → cerebrum\n\nS2 content\n",
      "utf-8"
    );

    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();

    for (const sid of ["s001", "s002"]) {
      const archivePath = path.join(tmpDir, "sessions", sid, "merged-learnings.md");
      expect(fs.existsSync(archivePath)).toBe(true);
      const content = fs.readFileSync(archivePath, "utf-8");
      expect(content).toContain(sid === "s001" ? "S1 content" : "S2 content");
    }
  });

  it("prints 'No pending proposals found' when no sessions exist", async () => {
    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();
    expect(logSpy).toHaveBeenCalledWith("No pending proposals found");
  });
});
