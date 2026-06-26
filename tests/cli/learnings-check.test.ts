// learnings-check.test.ts — R7b exit-code primitive tests (RED phase).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const originalStderrWrite = process.stderr.write;
const originalStdoutWrite = process.stdout.write;

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
  getSessionDir: vi.fn(),
  getWorktreeContext: vi.fn(),
}));

vi.mock("../../src/hooks/wolf-lock.js", () => ({
  withFileLock: vi.fn((_path: string, fn: () => void) => fn()),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";

describe("learnings-cmd - learningsCheckCommand", () => {
  let tmpDir: string;
  let stderrOutput: string[];
  let stdoutOutput: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-check-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    stderrOutput = [];
    stdoutOutput = [];
    process.stderr.write = vi.fn((chunk: string) => {
      stderrOutput.push(chunk);
      return true;
    }) as any;
    process.stdout.write = vi.fn((chunk: string) => {
      stdoutOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  });

  it("returns 0 when sessions dir is absent", async () => {
    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    expect(code).toBe(0);
    expect(stderrOutput.join("")).toBe("");
  });

  it("returns 0 when all proposed-learnings.md files are empty", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    mkdirSync(path.join(sessionsDir, "s001"), { recursive: true });
    mkdirSync(path.join(sessionsDir, "s002"), { recursive: true });
    writeFileSync(path.join(sessionsDir, "s001", "proposed-learnings.md"), "", "utf-8");
    writeFileSync(path.join(sessionsDir, "s002", "proposed-learnings.md"), "", "utf-8");

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    expect(code).toBe(0);
  });

  it("returns 1 and prints a human summary when pending entries exist", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "s001");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nImportant learning\n",
      "utf-8",
    );

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    const stderr = stderrOutput.join("");
    expect(code).toBe(1);
    expect(stderr).toContain("1 learning");
    expect(stderr).toContain("s001");
    expect(stderr).toContain("learnings merge");
  });

  it("returns 1 when a stub file is present", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "stubby");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "This is a stub with no arrow grammar\n",
      "utf-8",
    );

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    expect(code).toBe(1);
    expect(stderrOutput.join("")).toContain("stubby");
  });

  it("bounds the session list to 5 with a continuation line", async () => {
    const sessionsDir = path.join(tmpDir, "sessions");
    for (let i = 1; i <= 7; i++) {
      const sid = `sess${i.toString().padStart(2, "0")}`;
      mkdirSync(path.join(sessionsDir, sid), { recursive: true });
      writeFileSync(
        path.join(sessionsDir, sid, "proposed-learnings.md"),
        `\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nLearning ${sid}\n`,
        "utf-8",
      );
    }

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    const stderr = stderrOutput.join("");
    expect(code).toBe(1);
    expect(stderr).toContain("more sessions");
  });

  it("writes structured JSON to stdout with --json", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "sjson");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nJSON learning\n",
      "utf-8",
    );

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({ json: true });
    const stdout = stdoutOutput.join("");
    const parsed = JSON.parse(stdout);
    expect(code).toBe(1);
    expect(parsed.pending).toBe(1);
    expect(stderrOutput.join("")).toBe("");
  });

  it("mutes both streams with --quiet", async () => {
    const sessionsDir = path.join(tmpDir, "sessions", "squiet");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nQuiet learning\n",
      "utf-8",
    );

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({ quiet: true });
    expect(code).toBe(1);
    expect(stdoutOutput.join("")).toBe("");
    expect(stderrOutput.join("")).toBe("");
  });

  it("returns 2 on operational error and prints to stderr unless quiet", async () => {
    // Make sessions itself a file so fs.readdirSync throws.
    writeFileSync(path.join(tmpDir, "sessions"), "not-a-directory", "utf-8");

    const { learningsCheckCommand } = await import("../../src/cli/learnings-cmd.js");
    const code = learningsCheckCommand({});
    expect(code).toBe(2);
    expect(stderrOutput.join("")).toContain("cannot check learnings");
  });
});
