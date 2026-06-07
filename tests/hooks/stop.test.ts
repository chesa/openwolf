import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

vi.mock("../../src/hooks/shared.js", async () => {
    return {
        getWolfDir: vi.fn(),
        getSessionDir: vi.fn(),
        ensureWolfDir: vi.fn(),
        readJSON: vi.fn((fp, fallback) => {
            try {
                return JSON.parse(readFileSync(fp, "utf-8"));
            } catch {
                return fallback;
            }
        }),
        writeJSON: vi.fn((fp, data) => {
            const fs = require("node:fs");
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
        }),
        appendMarkdown: vi.fn(),
        timeShort: vi.fn(() => "12:34"),
    };
});

// Re-import after mock
const { readJSON, writeJSON } = await import("../../src/hooks/shared.js");

interface FileRead {
    count: number;
    tokens: number;
    first_read: string;
}

interface FileWrite {
    file: string;
    action: string;
    tokens: number;
    at: string;
}

interface SessionData {
    session_id: string;
    started: string;
    files_read: Record<string, FileRead>;
    files_written: FileWrite[];
    edit_counts: Record<string, number>;
    anatomy_hits: number;
    anatomy_misses: number;
    repeated_reads_warned: number;
    cerebrum_warnings: number;
    stop_count: number;
}

// Spy on stderr BEFORE importing stop.js so we capture any TypeError that
// main() (called at module level) might write via its .catch() handler.
// If the F-02 guard is ever removed, this spy will catch the regression.
// Timing: `await import()` flushes the microtask queue, so main().catch()
// has already fired by the time we snapshot _loadTimeCalls below.
const _loadStderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
const { finalizeSession } = await import("../../src/hooks/stop.js");
const _loadTimeCalls = [..._loadStderrSpy.mock.calls];
_loadStderrSpy.mockRestore();

describe("stop.ts robustness", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-stop-"));
    const sessionFile = path.join(dir, "_session.json");

    beforeEach(() => {
        const fs = require("node:fs");
        fs.mkdirSync(dir, { recursive: true });
        writeFileSync(sessionFile, JSON.stringify({
            session_id: "test-session",
            started: "2026-04-28T00:00:00Z",
            files_read: { "/tmp/foo.go": { count: 1, tokens: 100, first_read: "2026-04-28T00:00:00Z" } },
            files_written: [{ file: "/tmp/foo.go", action: "edit", tokens: 50, at: "2026-04-28T00:00:00Z" }],
            edit_counts: {},
            anatomy_hits: 1,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        }), "utf-8");
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("increments stop_count even when ledger write throws", () => {
        const session = {
            session_id: "test",
            started: new Date().toISOString(),
            files_read: { "/tmp/f.go": { count: 1, tokens: 100, first_read: "2026-01-01T00:00:00Z" } },
            files_written: [{ file: "/tmp/f.go", action: "edit", tokens: 50, at: "2026-01-01T00:00:00Z" }],
            edit_counts: {},
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        };

        // Use a sessionDir that requires creating intermediate directories
        // to ensure the ledger write path is exercised (not short-circuited
        // by the early return when files_read/files_written are empty).
        const badDir = path.join(dir, "nonexistent", "deep");
        expect(() => finalizeSession(dir, badDir, session)).not.toThrow();
        expect(session.stop_count).toBeGreaterThanOrEqual(1);
    });

    it("writes ledger to sessionDir, not wolfDir, in worktree mode", () => {
        const wolfDir = path.join(dir, "main-wolf");
        const sessionDir = path.join(dir, "sessions", "abc12345");
        mkdirSync(wolfDir, { recursive: true });
        mkdirSync(sessionDir, { recursive: true });

        const session: SessionData = {
            session_id: "wt-test",
            started: "2026-04-28T00:00:00Z",
            files_read: { "/tmp/bar.ts": { count: 1, tokens: 80, first_read: "2026-04-28T00:00:00Z" } },
            files_written: [{ file: "/tmp/bar.ts", action: "edit", tokens: 40, at: "2026-04-28T00:00:00Z" }],
            edit_counts: {},
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        };

        finalizeSession(wolfDir, sessionDir, session);

        const ledgerPath = path.join(sessionDir, "token-ledger.json");
        const wolfLedgerPath = path.join(wolfDir, "token-ledger.json");
        expect(existsSync(ledgerPath)).toBe(true);
        expect(existsSync(wolfLedgerPath)).toBe(false);

        const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
        expect(ledger.sessions).toHaveLength(1);
        expect(ledger.sessions[0].id).toBe("wt-test");
    });

    it("increments stop_count when there is activity", () => {
        const session = readJSON<SessionData>(sessionFile, {
            session_id: "",
            started: "",
            files_read: {},
            files_written: [],
            edit_counts: {},
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        });

        const wolfDir = dir;
        const sessionDir = dir;

        expect(session.stop_count).toBe(0);
        finalizeSession(wolfDir, sessionDir, session);
        expect(session.stop_count).toBe(1);
    });

    it("F-02: main() does not emit TypeError to stderr when wolfDir/sessionDir are undefined", () => {
        // The mock at module level returns undefined for getWolfDir()/getSessionDir().
        // Without the F-02 guard, main().catch() writes:
        //   'OpenWolf stop: The "path" argument must be of type string. Received undefined'
        // The spy captured all stderr writes during module load; verify none match.
        const typeErrorCalls = _loadTimeCalls.filter(
            (args) => String(args[0]).includes("Received undefined")
        );
        expect(typeErrorCalls).toHaveLength(0);
    });
});
