import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// wolf-selfheal only uses child_process.spawn; mock it so no real `openwolf scan`
// subprocess is launched during tests.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}));

import { spawn } from "node:child_process";
import { anatomyNeedsRescan, selfHealAnatomy } from "../../src/hooks/wolf-selfheal.js";

const ENTRY = "# anatomy.md\n\n## ./\n\n- `index.ts` — entry point (~5 tok)\n";
const STUB = "# anatomy.md\n\n> Auto-maintained by OpenWolf. Last scanned: …\n> Files: 0 tracked\n";

describe("anatomyNeedsRescan", () => {
  let dir: string;
  beforeEach(() => { dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-selfheal-"))); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("is true when anatomy.md is missing", () => {
    expect(anatomyNeedsRescan(dir)).toBe(true);
  });

  it("is true for a bare stub with no entries", () => {
    writeFileSync(path.join(dir, "anatomy.md"), STUB);
    expect(anatomyNeedsRescan(dir)).toBe(true);
  });

  it("is false once anatomy.md has at least one file entry", () => {
    writeFileSync(path.join(dir, "anatomy.md"), ENTRY);
    expect(anatomyNeedsRescan(dir)).toBe(false);
  });
});

describe("selfHealAnatomy", () => {
  let dir: string;
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-selfheal-")));
    vi.mocked(spawn).mockClear();
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("launches a detached `openwolf scan` (cwd = project root) when anatomy is missing", () => {
    selfHealAnatomy(dir);
    expect(spawn).toHaveBeenCalledWith(
      "openwolf",
      ["scan"],
      expect.objectContaining({ detached: true, cwd: path.dirname(dir), stdio: "ignore" })
    );
  });

  it("does nothing when anatomy.md already has entries", () => {
    writeFileSync(path.join(dir, "anatomy.md"), ENTRY);
    selfHealAnatomy(dir);
    expect(spawn).not.toHaveBeenCalled();
  });
});
