import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";

import { updateCommand } from "../../src/cli/update.js";
import { registerProject } from "../../src/cli/registry.js";

vi.mock("node:os", async () => {
  const mod = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...mod, homedir: vi.fn() };
});

// Suppress the noisy but expected update output in tests.
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("openwolf update — symlinked registry entries", () => {
  let originalCwd: string;
  let homedir: string;
  let projectDir: string;
  let symlinkDir: string;
  let baseDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();

    homedir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-update-home-")));
    vi.mocked(os.homedir).mockReturnValue(homedir);

    baseDir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-update-project-")));
    projectDir = path.join(baseDir, "real");
    symlinkDir = path.join(baseDir, "link");

    mkdirSync(projectDir, { recursive: true });
    mkdirSync(path.join(projectDir, ".wolf"));
    writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "meep" }),
    );
    symlinkSync(projectDir, symlinkDir, "dir");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(homedir, { recursive: true, force: true });
    rmSync(baseDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("writes .claude/settings.json with the canonical path, not the symlink", async () => {
    const realPath = realpathSync(projectDir);

    // Seed the registry with the symlink path, simulating a stale entry
    // created by an earlier `openwolf init` run from the symlinked directory.
    registerProject(symlinkDir, "meep", "1.3.0-beta");

    process.chdir(projectDir);
    await updateCommand({ project: "meep" });

    const settingsPath = path.join(projectDir, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const cmd = settings.hooks.SessionStart[0].hooks[0].command as string;

    // The baked path must be the canonical (real) project root, never the
    // symlinked path that exists only on this machine / workspace layout.
    expect(cmd).toContain(realPath);
    expect(cmd).not.toContain(symlinkDir);
  });
});
