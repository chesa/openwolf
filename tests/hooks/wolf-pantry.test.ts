import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const originalStderrWrite = process.stderr.write;
let stderrOutput: string[] = [];

vi.mock("../../src/hooks/wolf-paths.js", () => ({
  getWolfDir: vi.fn(),
}));

import { getWolfDir } from "../../src/hooks/wolf-paths.js";
import {
  collectAllEntries,
  parseProposals,
  normalizeCerebrumBody,
  hashCerebrumBody,
  type ProposalEntry,
} from "../../src/hooks/wolf-pantry.js";

describe("wolf-pantry - collectAllEntries", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-pantry-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    stderrOutput = [];
    process.stderr.write = vi.fn((chunk: string) => {
      stderrOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.stderr.write = originalStderrWrite;
  });

  it("returns [] when the sessions directory is absent", () => {
    const entries = collectAllEntries();
    expect(entries).toEqual([]);
  });

  it("returns a single well-formed cerebrum proposal", () => {
    const sessionId = "sess-well-formed";
    const sessionDir = path.join(tmpDir, "sessions", sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const iso = "2026-06-23T12:00:00.000Z";
    writeFileSync(
      path.join(sessionDir, "proposed-learnings.md"),
      `\n## ${iso} → cerebrum\n\nNew learning content here\n`,
      "utf-8",
    );

    const entries = collectAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe(sessionId);
    expect(entries[0].timestamp).toBe(iso);
    expect(entries[0].target).toBe("cerebrum");
    expect(entries[0].content).toBe("New learning content here");
  });

  it("synthesizes one pending entry for a non-empty file with no arrow grammar", () => {
    const sessionId = "sess-stub";
    const sessionDir = path.join(tmpDir, "sessions", sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      path.join(sessionDir, "proposed-learnings.md"),
      "# Some heading\n\nSome text without a target arrow\n",
      "utf-8",
    );

    const entries = collectAllEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe(sessionId);
    expect(entries[0].target).toBe("cerebrum");
    expect(entries[0].content).toContain("staged stub");
  });

  it("returns [] for an empty proposed-learnings.md file", () => {
    const sessionDir = path.join(tmpDir, "sessions", "sess-empty");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      path.join(sessionDir, "proposed-learnings.md"),
      "",
      "utf-8",
    );

    const entries = collectAllEntries();
    expect(entries).toEqual([]);
  });

  it("returns [] when the session has no proposed-learnings.md file", () => {
    const sessionDir = path.join(tmpDir, "sessions", "sess-missing");
    mkdirSync(sessionDir, { recursive: true });

    const entries = collectAllEntries();
    expect(entries).toEqual([]);
  });

  it("skips a session directory that throws on read and still counts others", () => {
    const goodId = "sess-good";
    const badId = "sess-bad";
    const goodDir = path.join(tmpDir, "sessions", goodId);
    const badDir = path.join(tmpDir, "sessions", badId);
    mkdirSync(goodDir, { recursive: true });
    mkdirSync(badDir, { recursive: true });
    writeFileSync(
      path.join(goodDir, "proposed-learnings.md"),
      "\n## 2026-06-23T12:00:00.000Z → cerebrum\n\nGood content\n",
      "utf-8",
    );
    writeFileSync(
      path.join(badDir, "proposed-learnings.md"),
      "stub content without arrow\n",
      "utf-8",
    );

    const originalReadFile = fs.readFileSync;
    const readSpy = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation((filePath: fs.PathLike, ...args: any[]) => {
        if (filePath.toString().startsWith(badDir)) {
          const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        }
        return originalReadFile(filePath, ...(args as [any]));
      });

    const entries = collectAllEntries();
    readSpy.mockRestore();

    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe(goodId);
    expect(
      stderrOutput.some(
        (s) => s.includes("cannot read session directory") && s.includes(badId),
      ),
    ).toBe(true);
  });
});

describe("wolf-pantry - parseProposals", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "owl-pantry-parse-"));
    vi.mocked(getWolfDir).mockReturnValue(tmpDir);
    stderrOutput = [];
    process.stderr.write = vi.fn((chunk: string) => {
      stderrOutput.push(chunk);
      return true;
    }) as any;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.stderr.write = originalStderrWrite;
  });

  it("returns [] when the staging file is missing", () => {
    const entries = parseProposals(
      path.join(tmpDir, "sessions", "no-file"),
      "no-file",
    );
    expect(entries).toEqual([]);
  });

  it("parses an anatomy target entry", () => {
    const sessionDir = path.join(tmpDir, "sessions", "parse-anatomy");
    mkdirSync(sessionDir, { recursive: true });
    const iso = "2026-06-23T13:00:00.000Z";
    writeFileSync(
      path.join(sessionDir, "proposed-learnings.md"),
      `\n## ${iso} → anatomy\n\nAnatomy note\n`,
      "utf-8",
    );
    const entries = parseProposals(sessionDir, "parse-anatomy");
    expect(entries).toHaveLength(1);
    expect(entries[0].target).toBe("anatomy");
    expect(entries[0].content).toBe("Anatomy note");
  });
});

describe("wolf-pantry - normalizeCerebrumBody", () => {
  it("produces identical output when only the Last updated line changes", () => {
    const a = "# Header\n\n> Last updated: 2026-06-23\n\nBody text.";
    const b = "# Header\n\n> Last updated: 2026-06-24\n\nBody text.";
    expect(normalizeCerebrumBody(a)).toBe(normalizeCerebrumBody(b));
  });

  it("produces identical output for differing whitespace with same words", () => {
    const a = "Line one\n\nLine   two\n";
    const b = "Line one  \n  Line two";
    expect(normalizeCerebrumBody(a)).toBe(normalizeCerebrumBody(b));
  });
});

describe("wolf-pantry - hashCerebrumBody", () => {
  it("produces identical sha256 when only the Last updated line changes", () => {
    const a = "# Header\n\n> Last updated: 2026-06-23\n\nBody text.";
    const b = "# Header\n\n> Last updated: 2026-06-24\n\nBody text.";
    expect(hashCerebrumBody(a)).toBe(hashCerebrumBody(b));
  });

  it("produces different sha256 when real content changes", () => {
    const a = "# Header\n\n> Last updated: 2026-06-23\n\nBody text.";
    const b = "# Header\n\n> Last updated: 2026-06-23\n\nBody text plus more.";
    expect(hashCerebrumBody(a)).not.toBe(hashCerebrumBody(b));
  });

  it("returns a 64-character lowercase hex string", () => {
    const hash = hashCerebrumBody("anything");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
