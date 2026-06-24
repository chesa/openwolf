import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";

describe("learnings integration - learningsCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-int-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    logSpy.mockClear();
  });

  it("enumerates proposals from multiple session directories", async () => {
    mkdirSync(path.join(tmpDir, "sessions", "aaa111"), { recursive: true });
    mkdirSync(path.join(tmpDir, "sessions", "bbb222"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "sessions", "aaa111", "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nFrom aaa\n", "utf-8"
    );
    writeFileSync(
      path.join(tmpDir, "sessions", "bbb222", "proposed-learnings.md"),
      "\n## 2026-06-23T13:00:00.000Z → anatomy\n\nFrom bbb\n", "utf-8"
    );

    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsCommand();

    const calls = logSpy.mock.calls.map(c => c[0]).join(" ");
    expect(calls).toContain("aaa111");
    expect(calls).toContain("bbb222");
    expect(calls).toContain("cerebrum");
    expect(calls).toContain("anatomy");
    expect(calls).toContain("From aaa");
    expect(calls).toContain("From bbb");
  });

  it("handles empty staging files without crashing", async () => {
    mkdirSync(path.join(tmpDir, "sessions", "s1"), { recursive: true });
    mkdirSync(path.join(tmpDir, "sessions", "s2"), { recursive: true });
    writeFileSync(path.join(tmpDir, "sessions", "s1", "proposed-learnings.md"), "", "utf-8");
    writeFileSync(
      path.join(tmpDir, "sessions", "s2", "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nValid\n", "utf-8"
    );

    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    expect(() => learningsCommand()).not.toThrow();
    const calls = logSpy.mock.calls.map(c => c[0]).join(" ");
    expect(calls).toContain("Valid");
  });

  it("skips a session dir that has no staging file (missing-file edge case)", async () => {
    // sessions/ exists with two dirs; one has a valid staging file, the
    // other has NO proposed-learnings.md at all. The valid one must still
    // enumerate and the missing-file dir must not crash. (TEST-02 edge case)
    mkdirSync(path.join(tmpDir, "sessions", "has-file"), { recursive: true });
    mkdirSync(path.join(tmpDir, "sessions", "no-file"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "sessions", "has-file", "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nPresent\n", "utf-8"
    );

    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    expect(() => learningsCommand()).not.toThrow();
    const calls = logSpy.mock.calls.map(c => c[0]).join(" ");
    expect(calls).toContain("has-file");
    expect(calls).toContain("Present");
  });

  it("prints 'No pending proposals found' when no sessions exist", async () => {
    const { learningsCommand } = await import("../../src/cli/learnings-cmd.js");
    learningsCommand();
    expect(logSpy).toHaveBeenCalledWith("No pending proposals found");
  });
});
