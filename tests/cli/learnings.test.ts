import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const originalStderrWrite = process.stderr.write;
let stderrOutput: string[] = [];

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));

vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn(async (_path: string, fn: () => void) => fn()),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";

describe("learnings-cmd - parseProposals", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-test-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    stderrOutput = [];
    process.stderr.write = vi.fn((chunk: string) => { stderrOutput.push(chunk); return true; }) as any;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    logSpy.mockClear();
    process.stderr.write = originalStderrWrite;
  });

  it("returns empty array when staging file is missing", async () => {
    const { parseProposals } = await import("../../src/cli/learnings-cmd.js");
    const entries = parseProposals(tmpDir, "test-session");
    expect(entries).toEqual([]);
  });

  it("parses a single proposal entry", async () => {
    const stagingPath = path.join(tmpDir, "proposed-learnings.md");
    const iso = "2026-06-23T12:00:00.000Z";
    writeFileSync(stagingPath, `\n## ${iso} → cerebrum\n\nNew learning content here\n`, "utf-8");
    const { parseProposals } = await import("../../src/cli/learnings-cmd.js");
    const entries = parseProposals(tmpDir, "test-session");
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe("test-session");
    expect(entries[0].timestamp).toBe(iso);
    expect(entries[0].target).toBe("cerebrum");
    expect(entries[0].content).toBe("New learning content here");
  });

  it("parses multiple entries", async () => {
    const stagingPath = path.join(tmpDir, "proposed-learnings.md");
    writeFileSync(stagingPath, [
      "",
      "## 2026-06-23T12:00:00.000Z → cerebrum",
      "",
      "First entry",
      "",
      "## 2026-06-23T13:00:00.000Z → anatomy",
      "",
      "Second entry",
      "",
    ].join("\n"), "utf-8");
    const { parseProposals } = await import("../../src/cli/learnings-cmd.js");
    const entries = parseProposals(tmpDir, "test-session");
    expect(entries).toHaveLength(2);
    expect(entries[0].target).toBe("cerebrum");
    expect(entries[1].target).toBe("anatomy");
  });

  it("skips unparseable entries with stderr warning", async () => {
    const stagingPath = path.join(tmpDir, "proposed-learnings.md");
    writeFileSync(stagingPath, "\n## bad header no arrow\n\nsome content\n", "utf-8");
    const { parseProposals } = await import("../../src/cli/learnings-cmd.js");
    const entries = parseProposals(tmpDir, "test-session");
    expect(entries).toHaveLength(0);
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty file", async () => {
    const stagingPath = path.join(tmpDir, "proposed-learnings.md");
    writeFileSync(stagingPath, "", "utf-8");
    const { parseProposals } = await import("../../src/cli/learnings-cmd.js");
    const entries = parseProposals(tmpDir, "test-session");
    expect(entries).toEqual([]);
  });
});

describe("learnings-cmd - learningsCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-list-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    logSpy.mockClear();
  });

  it("prints 'No pending proposals found' when no sessions exist", async () => {
    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsCommand();
    expect(logSpy).toHaveBeenCalledWith("No pending proposals found");
  });

  it("lists entries from a session directory", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "abc1234");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nImportant learning\n",
      "utf-8"
    );
    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsCommand();
    const calls = logSpy.mock.calls.map(c => c[0]).join(" ");
    expect(calls).toContain("abc1234");
    expect(calls).toContain("cerebrum");
    expect(calls).toContain("Important learning");
  });

  it("filters by session ID with --session flag", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    mkdirSync(path.join(sessionsDir, "aaa111"), { recursive: true });
    mkdirSync(path.join(sessionsDir, "bbb222"), { recursive: true });
    writeFileSync(path.join(sessionsDir, "aaa111", "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nFrom aaa\n", "utf-8");
    writeFileSync(path.join(sessionsDir, "bbb222", "proposed-learnings.md"),
      "\n## 2026-06-23T13:00:00.000Z → anatomy\n\nFrom bbb\n", "utf-8");
    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsCommand("aaa111");
    const calls = logSpy.mock.calls.map(c => c[0]).join(" ");
    expect(calls).toContain("aaa111");
    expect(calls).not.toContain("bbb222");
  });
});

// learningsMergeCommand tests: tested manually via:
//   echo "a" | node dist/bin/openwolf.js learnings merge
// Interactive readline cannot be spied in ESM vitest context.
