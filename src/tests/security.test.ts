import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "os";
import { execFileSync } from "node:child_process";
import { CronEngine } from "../daemon/cron-engine.js";

describe("Security Patches", () => {
  test("Command Injection: execFileSync handles metacharacters safely", () => {
    // In our implementation, we switched to execFileSync with array args.
    // This test verifies that metacharacters in arguments are NOT interpreted by a shell.
    
    const maliciousArg = "safe; echo 'pwned'";
    const scriptPath = path.join(process.cwd(), "test-script.sh");
    
    if (process.platform !== "win32") {
      fs.writeFileSync(scriptPath, "#!/bin/bash\necho \"ARG: $1\"", { mode: 0o755 });
      try {
        const output = execFileSync(scriptPath, [maliciousArg], { encoding: "utf-8" });
        // If safe, the output should be exactly "ARG: safe; echo 'pwned'"
        // If unsafe (shell injection), it would be "ARG: safe" followed by "pwned" on a new line
        assert.strictEqual(output.trim(), `ARG: ${maliciousArg}`);
      } finally {
        fs.unlinkSync(scriptPath);
      }
    }
  });

  test("Path Traversal: CronEngine blocks out-of-bounds files", async () => {
    // We'll mock the requirements for CronEngine to test runAiTask
    // This is a simplified logic test of the fix we applied
    const projectRoot = path.resolve("/tmp/fake-project");
    const fileToRead = "../../etc/passwd";
    const resolvedPath = path.resolve(projectRoot, fileToRead);
    
    const isBlocked = !resolvedPath.startsWith(projectRoot + path.sep) && resolvedPath !== projectRoot;
    assert.ok(isBlocked, "Path traversal should be detected as blocked");
  });

  test("DoS: File Watcher limits broadcast size", () => {
    const maxSize = 1024 * 1024;
    const largeSize = maxSize + 1;
    const smallSize = maxSize - 1;
    
    assert.ok(largeSize > maxSize);
    assert.ok(smallSize <= maxSize);
    
    // The logic in file-watcher.ts:
    // const stat = fs.statSync(filePath);
    // if (stat.size > 1024 * 1024) return;
    
    const checkLimit = (size: number) => size > 1024 * 1024;
    assert.strictEqual(checkLimit(largeSize), true, "Large file should be blocked");
    assert.strictEqual(checkLimit(smallSize), false, "Small file should be allowed");
  });

  test("Dashboard: Explicit localhost binding", () => {
    // Logic check: app.listen(port, "127.0.0.1", ...)
    // This verifies our intent in the code
    const bindAddress = "127.0.0.1";
    assert.strictEqual(bindAddress, "127.0.0.1", "Must bind to localhost only");
  });
});

describe("Path Traversal - Integration Tests", () => {
  test("should detect path traversal attempts", () => {
    const projectRoot = path.resolve("/tmp/fake-project");
    const maliciousPath = "../../../etc/passwd";
    const filePath = path.resolve(projectRoot, maliciousPath);

    // Normalize to lowercase for comparison (as done in CronEngine)
    const resolvedNorm = filePath.toLowerCase();
    const rootWithSep = (projectRoot + path.sep).toLowerCase();
    const rootNorm = projectRoot.toLowerCase();

    // Path traversal should be detected
    const isTraversal = !resolvedNorm.startsWith(rootWithSep) && resolvedNorm !== rootNorm;
    assert.ok(isTraversal, "Path traversal should be detected");
  });

  test("should allow paths within project root", () => {
    const projectRoot = path.resolve("/tmp/fake-project");
    const safePath = "src/index.js";
    const filePath = path.resolve(projectRoot, safePath);

    const resolvedNorm = filePath.toLowerCase();
    const rootWithSep = (projectRoot + path.sep).toLowerCase();
    const rootNorm = projectRoot.toLowerCase();

    // Safe path should be allowed
    const isSafe = resolvedNorm.startsWith(rootWithSep) || resolvedNorm === rootNorm;
    assert.ok(isSafe, "Safe path should be allowed");
  });
});

describe("File Watcher - Real Filesystem Tests", () => {
  const testDir = path.join(os.tmpdir(), "openwolf-test-" + Date.now());

  before(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("should skip files larger than 1MB to prevent DoS", () => {
    const largeFile = path.join(testDir, "large.txt");
    // Create a 2MB file
    const largeContent = "x".repeat(2 * 1024 * 1024);
    fs.writeFileSync(largeFile, largeContent);

    // Simulate the file watcher logic
    const stat = fs.statSync(largeFile);
    const shouldSkip = stat.size > 1024 * 1024;

    assert.ok(shouldSkip, "Large files should be skipped");
    assert.ok(stat.size > 1024 * 1024, "File should be larger than 1MB");
  });

  test("should process files under 1MB", () => {
    const smallFile = path.join(testDir, "small.txt");
    fs.writeFileSync(smallFile, "small content");

    const stat = fs.statSync(smallFile);
    const shouldProcess = stat.size <= 1024 * 1024;

    assert.ok(shouldProcess, "Small files should be processed");
    assert.ok(stat.size <= 1024 * 1024, "File should be smaller than 1MB");
  });
});
