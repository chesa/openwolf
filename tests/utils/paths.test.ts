import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("getWolfDir (CLI)", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.OPENWOLF_METADATA_DIR;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns path.join(base, '.wolf') when env var is not set", async () => {
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/some/project/.wolf");
  });

  it("returns the env var path when OPENWOLF_METADATA_DIR is set", async () => {
    process.env.OPENWOLF_METADATA_DIR = "/custom/metadata";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/custom/metadata");
  });

  it("ignores env var when it is empty string", async () => {
    process.env.OPENWOLF_METADATA_DIR = "";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir("/some/project");
    expect(result).toBe("/some/project/.wolf");
  });

  it("resolves relative env var paths against cwd", async () => {
    process.env.OPENWOLF_METADATA_DIR = "relative/wolf";
    const { getWolfDir } = await import("../../src/utils/paths.js");
    const result = getWolfDir();
    const pathMod = await import("path");
    expect(result).toBe(pathMod.resolve("relative/wolf"));
  });
});
