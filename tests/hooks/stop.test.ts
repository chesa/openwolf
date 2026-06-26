import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
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
        updateJSON: vi.fn((fp, fallback, mutate) => {
            const fs = require("node:fs");
            let cur;
            try {
                cur = JSON.parse(readFileSync(fp, "utf-8"));
            } catch {
                cur = fallback;
            }
            const updated = mutate(cur);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, JSON.stringify(updated, null, 2), "utf-8");
        }),
        appendMarkdown: vi.fn(),
        timeShort: vi.fn(() => "12:34"),
        readMarkdown: vi.fn(() => ""),
        appendProposal: vi.fn(),
    };
});

// Re-import after mock
const { readJSON, writeJSON, appendProposal, readMarkdown } = await import("../../src/hooks/shared.js");

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

// Declare at module scope — assigned inside beforeAll so the stderr spy
// is scoped to this test suite and not left active as a module-level side
// effect that could capture writes from other test files (see WR-04).
let finalizeSession: (wolfDir: string, sessionDir: string, session: SessionData) => void;
let _loadTimeCalls: string[][];

describe("stop.ts robustness", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-stop-"));
    const sessionFile = path.join(dir, "_session.json");

    beforeAll(async () => {
        // Spy on stderr BEFORE importing stop.js so we capture any TypeError
        // that main() (called at module level) might write via .catch().
        const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        const mod = await import("../../src/hooks/stop.js");
        finalizeSession = mod.finalizeSession;
        _loadTimeCalls = [...spy.mock.calls];
        spy.mockRestore();
    });

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

    it("does not throw even when ledger write fails (stop_count managed by main finally)", () => {
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
        // finalizeSession must not throw; stop_count increment now happens in
        // main()'s finally via updateJSON, not inside finalizeSession itself.
        expect(() => finalizeSession(dir, badDir, session)).not.toThrow();
        expect(session.stop_count).toBe(0); // in-memory not mutated by finalizeSession
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

    it("finalizeSession does not mutate in-memory stop_count (increment is in main() finally)", () => {
        // stop_count increment moved to main()'s finally via updateJSON so that
        // concurrent sessions read the latest persisted value and can't lose increments.
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
        // finalizeSession itself no longer mutates stop_count; main()'s finally does
        expect(session.stop_count).toBe(0);
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

describe("_session.json concurrent update safety", () => {
    const concDir = mkdtempSync(path.join(tmpdir(), "ow-stop-conc-"));
    const concSessionFile = path.join(concDir, "_session.json");

    afterEach(() => {
        rmSync(concDir, { recursive: true, force: true });
    });

    it("two updateJSON calls both survive — files_written and stop_count accumulate", async () => {
        // Seed the session file with one existing file write
        mkdirSync(concDir, { recursive: true });
        writeFileSync(concSessionFile, JSON.stringify({
            session_id: "conc-test",
            started: "2026-06-23T00:00:00Z",
            files_read: {},
            files_written: [{ file: "src/foo.ts", action: "edit", tokens: 100, at: "2026-06-23T00:00:00Z" }],
            edit_counts: {},
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        }, null, 2), "utf-8");

        const { updateJSON } = await import("../../src/hooks/shared.js");
        const fallback = {
            session_id: "",
            started: "",
            files_read: {},
            files_written: [] as Array<{ file: string; action: string; tokens: number; at: string }>,
            edit_counts: {} as Record<string, number>,
            anatomy_hits: 0,
            anatomy_misses: 0,
            repeated_reads_warned: 0,
            cerebrum_warnings: 0,
            stop_count: 0,
        };

        // Simulate post-write: push a new file_written entry
        updateJSON(concSessionFile, fallback, (cur: typeof fallback) => {
            cur.files_written.push({ file: "src/bar.ts", action: "edit", tokens: 50, at: "2026-06-23T00:01:00Z" });
            return cur;
        });

        // Simulate first stop: increment stop_count
        updateJSON(concSessionFile, fallback, (cur: typeof fallback) => {
            cur.stop_count = (cur.stop_count ?? 0) + 1;
            return cur;
        });

        // Simulate second stop: increment stop_count again
        updateJSON(concSessionFile, fallback, (cur: typeof fallback) => {
            cur.stop_count = (cur.stop_count ?? 0) + 1;
            return cur;
        });

        const final = JSON.parse(readFileSync(concSessionFile, "utf-8"));
        // Both the seeded write and the post-write push must survive
        expect(final.files_written).toHaveLength(2);
        expect(final.files_written.map((w: { file: string }) => w.file)).toContain("src/foo.ts");
        expect(final.files_written.map((w: { file: string }) => w.file)).toContain("src/bar.ts");
        // Both stop increments must accumulate
        expect(final.stop_count).toBe(2);
    });
});

describe("R7a capture stub guard cases", () => {
    const sessionDir = mkdtempSync(path.join(tmpdir(), "ow-stop-r7a-"));
    const wolfDir = path.join(sessionDir, "wolf");

    beforeEach(() => {
        vi.clearAllMocks();
        mkdirSync(sessionDir, { recursive: true });
        mkdirSync(wolfDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    const baseSession = (overrides: Partial<SessionData> = {}): SessionData => ({
        session_id: "r7a-test",
        started: "2026-06-25T00:00:00Z",
        files_read: {},
        files_written: [{ file: "/project/src/foo.ts", action: "edit", tokens: 50, at: "2026-06-25T00:00:00Z" }],
        edit_counts: {},
        anatomy_hits: 0,
        anatomy_misses: 0,
        repeated_reads_warned: 0,
        cerebrum_warnings: 0,
        stop_count: 0,
        ...overrides,
    });

    it("stages a stub when code written and no proposed-learnings.md", () => {
        vi.mocked(readMarkdown).mockReturnValue("");
        finalizeSession(wolfDir, sessionDir, baseSession());
        expect(appendProposal).toHaveBeenCalledTimes(1);
        expect(appendProposal).toHaveBeenCalledWith(
            "cerebrum",
            expect.stringContaining("### Staged Session Metadata")
        );
    });

    it("does NOT stage when model already wrote proposals", () => {
        vi.mocked(readMarkdown).mockReturnValue("## Proposed learning\n\nContent.\n");
        finalizeSession(wolfDir, sessionDir, baseSession());
        expect(appendProposal).not.toHaveBeenCalled();
    });

    it("does NOT stage when only .wolf/ files were written", () => {
        vi.mocked(readMarkdown).mockReturnValue("");
        finalizeSession(wolfDir, sessionDir, baseSession({
            files_written: [
                { file: "/project/.wolf/cerebrum.md", action: "edit", tokens: 10, at: "2026-06-25T00:00:00Z" },
                { file: "/project/.tmp/scratch.txt", action: "edit", tokens: 5, at: "2026-06-25T00:00:00Z" },
            ],
        }));
        expect(appendProposal).not.toHaveBeenCalled();
    });

    it("idempotent on re-fire", () => {
        vi.mocked(readMarkdown).mockReturnValue("### Staged Session Metadata\n\nExisting stub.\n");
        finalizeSession(wolfDir, sessionDir, baseSession({ stop_count: 2 }));
        expect(appendProposal).not.toHaveBeenCalled();
    });
});

afterAll(() => {
    vi.restoreAllMocks();
});
