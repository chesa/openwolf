// learnings-accept.test.ts — R9 sanctioned baseline writers (RED phase).
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
import { hashCerebrumBody } from "../../src/hooks/wolf-pantry.js";

describe("learnings-cmd - R9 baseline writers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-accept-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    process.stderr.write = vi.fn(() => true) as any;
    mockAnswers.queue = ["a", "y"];
    mockAnswers.index = 0;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    logSpy.mockClear();
    process.stderr.write = originalStderrWrite;
  });

  it("learningsAcceptCommand writes the freshness sidecar from current cerebrum.md", async () => {
    const cerebrumPath = path.join(tmpDir, "cerebrum.md");
    writeFileSync(
      cerebrumPath,
      "# Cerebrum\n\n> Last updated: 2026-06-25\n\nKnowledge.\n",
      "utf-8",
    );

    const { learningsAcceptCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsAcceptCommand();

    const sidecarPath = path.join(tmpDir, "cerebrum-freshness.json");
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    expect(sidecar.version).toBe(1);
    expect(sidecar.content_sha256).toBe(hashCerebrumBody(fs.readFileSync(cerebrumPath, "utf-8")));
    expect(sidecar.captured_by).toBe("learnings-accept");
    expect(sidecar.last_updated_seen).toBe("2026-06-25");
  });

  it("learningsMergeCommand re-baselines after a cerebrum append", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "merge01");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nMerged learning\n",
      "utf-8",
    );
    writeFileSync(
      path.join(tmpDir, "cerebrum.md"),
      "# Cerebrum\n\n> Last updated: 2026-06-20\n\nInitial.\n",
      "utf-8",
    );

    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();

    const cerebrumPath = path.join(tmpDir, "cerebrum.md");
    const sidecarPath = path.join(tmpDir, "cerebrum-freshness.json");
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    expect(sidecar.content_sha256).toBe(hashCerebrumBody(fs.readFileSync(cerebrumPath, "utf-8")));
    expect(sidecar.captured_by).toBe("learnings-merge");
  });

  it("does not append cerebrum.md from a stub-only session", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "stubmerge");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "This stub has no arrow grammar and should not merge\n",
      "utf-8",
    );

    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();

    expect(fs.existsSync(path.join(tmpDir, "cerebrum.md"))).toBe(false);
  });

  it("does not merge the exact R7a stop-hook stub into cerebrum.md", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "r7a-stub");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "### Staged Session Metadata\n\nSession ended with code changes but no explicit learning recorded. Review and add context if relevant.\n",
      "utf-8",
    );

    const { learningsMergeCommand } = await import("../../src/cli/learnings-cmd.js");
    await learningsMergeCommand();

    expect(fs.existsSync(path.join(tmpDir, "cerebrum.md"))).toBe(false);
  });
});
