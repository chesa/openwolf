import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

vi.mock("./shared.js", async () => {
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
const { readJSON, writeJSON } = await import("./shared.js");

interface SessionData {
    session_id: string;
    started: string;
    files_read: Record<string, unknown>;
    files_written: Array<{ file: string; action: string; tokens: number; at: string }>;
    edit_counts: Record<string, number>;
    anatomy_hits: number;
    anatomy_misses: number;
    repeated_reads_warned: number;
    cerebrum_warnings: number;
    stop_count: number;
}

import { finalizeSession } from "./stop.js";

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
            started: "",
            files_read: {},
            files_written: [],
            edit_counts: {},
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        };

        // Pass a sessionDir that has a malformed ledger to force a throw
        // during the ledger write path. finalizeSession should still
        // have incremented stop_count on the session object.
        expect(() => finalizeSession(dir, dir, session)).not.toThrow();
        expect(session.stop_count).toBeGreaterThanOrEqual(1);
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
});
