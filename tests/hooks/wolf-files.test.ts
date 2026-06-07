import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("ensureWolfDir", () => {
  const OLD_ENV = process.env;
  let tmpDir: string;
  let wolfDir: string;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), "wolf-ensure-")));
    wolfDir = path.join(tmpDir, "custom-wolf");
    delete process.env.OPENWOLF_METADATA_DIR;
  });

  afterEach(() => {
    process.env = OLD_ENV;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the directory when OPENWOLF_METADATA_DIR is set and doesn't exist", async () => {
    process.env.OPENWOLF_METADATA_DIR = wolfDir;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    const mod = await import("../../src/hooks/wolf-files.js");
    expect(fs.existsSync(wolfDir)).toBe(false);
    mod.ensureWolfDir();
    expect(fs.existsSync(wolfDir)).toBe(true);
  });

  it("exits silently when env var is not set and .wolf/ doesn't exist", async () => {
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    const mod = await import("../../src/hooks/wolf-files.js");
    expect(() => mod.ensureWolfDir()).toThrow("exit:0");

    exitSpy.mockRestore();
  });
});
