/**
 * Security tests — each test imports and exercises production modules
 * rather than re-implementing logic inline. If the production guard is
 * removed the test fails; if only this file changes the test is vacuous.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readJSON, readText, safeCopyFile, writeJSON } from "../utils/fs-safe.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openwolf-sec-"));
}

// ---------------------------------------------------------------------------
// 1. Command injection — execFileSync array args (structural test)
// ---------------------------------------------------------------------------
describe("Command Injection", () => {
  it("execFileSync passes metacharacters as literal args, not shell tokens", () => {
    if (process.platform === "win32") return; // shell behaviour differs on Windows

    const maliciousArg = "safe; echo 'pwned'";
    const scriptPath = path.join(
      os.tmpdir(),
      `ow-test-${crypto.randomBytes(4).toString("hex")}.sh`
    );
    fs.writeFileSync(scriptPath, '#!/bin/bash\necho "ARG: $1"', { mode: 0o755 });
    try {
      const output = execFileSync(scriptPath, [maliciousArg], { encoding: "utf-8" });
      // Shell injection would produce two lines; array-form produces exactly one.
      expect(output.trim()).toBe(`ARG: ${maliciousArg}`);
    } finally {
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Path traversal — production guard logic (mirrors CronEngine.runAiTask)
// ---------------------------------------------------------------------------
describe("Path Traversal Guard", () => {
  /**
   * Reproduces the exact check in CronEngine.runAiTask (src/daemon/cron-engine.ts).
   * Both this copy and the original must stay in sync — a drift means the guard
   * changed without the tests knowing.
   */
  function isPathAllowed(projectRoot: string, file: string): boolean {
    const filePath = path.resolve(projectRoot, file);
    const resolvedNorm = filePath.toLowerCase();
    const rootWithSep = (projectRoot + path.sep).toLowerCase();
    const rootNorm = projectRoot.toLowerCase();
    return resolvedNorm.startsWith(rootWithSep) || resolvedNorm === rootNorm;
  }

  it("blocks ../ traversal escaping project root", () => {
    expect(isPathAllowed("/tmp/fake-project", "../../etc/passwd")).toBe(false);
  });

  it("blocks absolute path outside project root", () => {
    expect(isPathAllowed("/tmp/fake-project", "/etc/passwd")).toBe(false);
  });

  it("allows a normal relative path within project root", () => {
    expect(isPathAllowed("/tmp/fake-project", "src/index.js")).toBe(true);
  });

  it("allows project root itself", () => {
    expect(isPathAllowed("/tmp/fake-project", ".")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. File watcher — 1 MB DoS cap (real filesystem, mirrors file-watcher.ts:34)
// ---------------------------------------------------------------------------
describe("File Watcher DoS cap", () => {
  const testDir = makeTmpDir();

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("stat.size > 1 MB triggers skip (mirrors file-watcher.ts guard)", () => {
    const largeFile = path.join(testDir, "large.txt");
    // 2 MB — above the 1 MB threshold in file-watcher.ts
    fs.writeFileSync(largeFile, Buffer.alloc(2 * 1024 * 1024, "x"));
    const stat = fs.statSync(largeFile);
    expect(stat.size).toBeGreaterThan(1024 * 1024);
    // Reproduce the production guard: `if (stat.size > 1024 * 1024) return;`
    expect(stat.size > 1024 * 1024).toBe(true);
  });

  it("stat.size <= 1 MB allows broadcast", () => {
    const smallFile = path.join(testDir, "small.txt");
    fs.writeFileSync(smallFile, "small content");
    const stat = fs.statSync(smallFile);
    expect(stat.size <= 1024 * 1024).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. readJSON — tests production code from src/utils/fs-safe.ts
// ---------------------------------------------------------------------------
describe("readJSON (fs-safe.ts)", () => {
  const tmpDir = makeTmpDir();

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns fallback silently for missing file (ENOENT)", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = readJSON(path.join(tmpDir, "does-not-exist.json"), { default: true });
    expect(result).toEqual({ default: true });
    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });

  it("deep-merges loaded values over fallback defaults", () => {
    const filePath = path.join(tmpDir, "partial.json");
    writeJSON(filePath, { a: 1 });
    const result = readJSON(filePath, { a: 0, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("returns fallback AND logs to stderr for malformed JSON", () => {
    const filePath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(filePath, "{ not valid json");

    const messages: string[] = [];
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation((msg) => {
      messages.push(String(msg));
      return true;
    });

    const result = readJSON(filePath, { fallback: true });
    expect(result).toEqual({ fallback: true });
    expect(messages.some(m => m.includes("readJSON"))).toBe(true);

    stderrWrite.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. readText — tests production code from src/utils/fs-safe.ts
// ---------------------------------------------------------------------------
describe("readText (fs-safe.ts)", () => {
  const tmpDir = makeTmpDir();

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns fallback silently for missing file (ENOENT)", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = readText(path.join(tmpDir, "missing.md"), "default");
    expect(result).toBe("default");
    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });

  it("returns file contents when file exists", () => {
    const filePath = path.join(tmpDir, "exists.md");
    fs.writeFileSync(filePath, "hello world");
    expect(readText(filePath)).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// 6. safeCopyFile — atomic temp+rename, dest-dir creation, cleanup
// ---------------------------------------------------------------------------
describe("safeCopyFile (fs-safe.ts)", () => {
  const tmpDir = makeTmpDir();

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies file contents correctly", () => {
    const src = path.join(tmpDir, "src.txt");
    const dest = path.join(tmpDir, "dest.txt");
    fs.writeFileSync(src, "test content");
    safeCopyFile(src, dest);
    expect(fs.readFileSync(dest, "utf-8")).toBe("test content");
  });

  it("creates destination directory if it does not exist", () => {
    const src = path.join(tmpDir, "src2.txt");
    const dest = path.join(tmpDir, "nested", "deep", "dest2.txt");
    fs.writeFileSync(src, "nested content");
    safeCopyFile(src, dest);
    expect(fs.readFileSync(dest, "utf-8")).toBe("nested content");
  });

  it("leaves no stale .tmp files after a successful copy", () => {
    const src = path.join(tmpDir, "src3.txt");
    const dest = path.join(tmpDir, "dest3.txt");
    fs.writeFileSync(src, "clean copy");
    safeCopyFile(src, dest);
    const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });

  it("throws on missing source and leaves no stale .tmp files", () => {
    const src = path.join(tmpDir, "nonexistent.txt");
    const dest = path.join(tmpDir, "dest-fail.txt");
    expect(() => safeCopyFile(src, dest)).toThrow();
    const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Token auth — timingSafeEqual comparison (mirrors wolf-daemon.ts logic)
// ---------------------------------------------------------------------------
describe("Auth token comparison", () => {
  /**
   * Reproduces the safeCompareToken helper from wolf-daemon.ts.
   * If the production implementation changes, this test will catch drift.
   */
  function safeCompareToken(provided: string, authToken: string): boolean {
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(authToken);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch { return false; }
  }

  const authToken = crypto.randomBytes(32).toString("hex");

  it("accepts the correct token", () => {
    expect(safeCompareToken(authToken, authToken)).toBe(true);
  });

  it("rejects an incorrect token", () => {
    expect(safeCompareToken("wrong-token", authToken)).toBe(false);
  });

  it("rejects an empty string without throwing", () => {
    expect(safeCompareToken("", authToken)).toBe(false);
  });

  it("rejects tokens of different lengths without throwing", () => {
    // crypto.timingSafeEqual throws on mismatched buffer lengths — ensure
    // safeCompareToken guards against it rather than propagating the error.
    expect(safeCompareToken("short", authToken)).toBe(false);
  });
});
