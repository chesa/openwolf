import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

describe("withFileLock", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "wolf-lock-test-")));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("executes the function and cleans up the lock file", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "test.json");
        const result = withFileLock(testFile, () => {
            expect(fs.existsSync(testFile + ".lock")).toBe(true);
            return 42;
        });
        expect(result).toBe(42);
        expect(fs.existsSync(testFile + ".lock")).toBe(false);
    });

    it("releases lock even when fn throws", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "throw.json");
        expect(() =>
            withFileLock(testFile, () => {
                throw new Error("test error");
            })
        ).toThrow("test error");
        expect(fs.existsSync(testFile + ".lock")).toBe(false);
    });

    it("proceeds unlocked after exhausting retries (3 attempts)", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "contended.json");
        const lockPath = testFile + ".lock";

        fs.writeFileSync(lockPath, process.pid + "\n" + Date.now(), "utf-8");

        const warnSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

        const result = withFileLock(testFile, () => "unlocked");
        expect(result).toBe("unlocked");
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("could not acquire lock")
        );

        warnSpy.mockRestore();
    });

    it("removes stale lock older than 10 seconds", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "stale.json");
        const lockPath = testFile + ".lock";

        fs.writeFileSync(lockPath, process.pid + "\n" + (Date.now() - 15000), "utf-8");

        const result = withFileLock(testFile, () => "stale-cleaned");
        expect(result).toBe("stale-cleaned");
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("acquires lock on first attempt when no contention", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "clean.json");
        const result = withFileLock(testFile, () => "clean");
        expect(result).toBe("clean");
    });

    it("writes PID and timestamp to lock file", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const testFile = path.join(tmpDir, "pidcheck.json");
        const lockPath = testFile + ".lock";

        withFileLock(testFile, () => {
            const contents = fs.readFileSync(lockPath, "utf-8");
            const lines = contents.trim().split("\n");
            expect(lines).toHaveLength(2);
            expect(lines[0]).toBe(String(process.pid));
            const ts = parseInt(lines[1], 10);
            expect(ts).toBeGreaterThan(Date.now() - 5000);
            expect(ts).toBeLessThanOrEqual(Date.now());
        });
    });

    it("per-file isolation — locks on different files don't block", async () => {
        const { withFileLock } = await import("../../src/hooks/wolf-lock.js");
        const fileA = path.join(tmpDir, "a.json");
        const fileB = path.join(tmpDir, "b.json");

        let aStarted = false;
        let bExecuted = false;

        withFileLock(fileA, () => {
            aStarted = true;
            withFileLock(fileB, () => {
                bExecuted = true;
            });
        });

        expect(aStarted).toBe(true);
        expect(bExecuted).toBe(true);
    });
});
