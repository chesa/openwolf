import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

async function freshSessionStart() {
    // Unset CLAUDE_PROJECT_DIR during import so the module-level main() call
    // doesn't access real project files (e.g., .wolf/ directories) when the
    // env var happens to be set in CI or developer shell config.
    const orig = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_PROJECT_DIR;
    vi.resetModules();
    const mod = await import("../../src/hooks/session-start.js");
    if (orig !== undefined) process.env.CLAUDE_PROJECT_DIR = orig;
    // Importing the module runs its top-level main(), which calls
    // initializeSessionLedger(getSessionDir()) BEFORE process.exit(0) (so the
    // exit-mock throw can't stop it). Because the test points
    // OPENWOLF_METADATA_DIR at its temp dir, that import-time write lands in the
    // very token-ledger.json the tests inspect, inflating total_sessions by one.
    // Reset it so each test measures only its own explicit ledger calls.
    const mdir = process.env.OPENWOLF_METADATA_DIR;
    if (mdir) rmSync(path.join(mdir, "token-ledger.json"), { force: true });
    return mod;
}

describe("session-start.ts ledger init", () => {
    let dir: string;
    let ledgerPath: string;

    beforeEach(() => {
        dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-sess-start-")));
        ledgerPath = path.join(dir, "token-ledger.json");
        // Redirect .wolf/ writes to temp dir so the module-level main() call
        // during import doesn't touch the real project's .wolf/ directory.
        process.env.OPENWOLF_METADATA_DIR = dir;
        // Prevent main() from running by throwing on exit
        // The first process.exit(0) from the module-level main() throws,
        // halting execution. The .catch() handler on main() calls
        // process.exit(0) a second time — mockImplementation handles that
        // by returning normally (no unhandled rejection).
        const exitMock = vi.spyOn(process, "exit");
        exitMock.mockImplementationOnce((code?: number | string | null) => {
            throw new Error(`exit:${code}`);
        });
        exitMock.mockImplementation(() => {
            return undefined as never;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.OPENWOLF_METADATA_DIR;
        rmSync(dir, { recursive: true, force: true });
    });

    it("writes all Lifetime fields at zero on first run", async () => {
        const { initializeSessionLedger } = await freshSessionStart();
        initializeSessionLedger(dir);
        const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
        expect(ledger.version).toBe(1);
        expect(ledger.lifetime.total_sessions).toBe(1);
        expect(ledger.lifetime.total_reads).toBe(0);
        expect(ledger.lifetime.total_writes).toBe(0);
        expect(ledger.lifetime.total_tokens_estimated).toBe(0);
        expect(ledger.lifetime.anatomy_hits).toBe(0);
        expect(ledger.lifetime.anatomy_misses).toBe(0);
        expect(ledger.lifetime.repeated_reads_blocked).toBe(0);
        expect(ledger.lifetime.estimated_savings_vs_bare_cli).toBe(0);
    });

    it("increments total_sessions on subsequent calls", async () => {
        const { initializeSessionLedger } = await freshSessionStart();
        initializeSessionLedger(dir);
        initializeSessionLedger(dir);
        const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
        expect(ledger.lifetime.total_sessions).toBe(2);
    });

    // NOTE: in-process JS serializes synchronous read-modify-write, so this checks accumulation, not lock contention. The real cross-process concurrency guard is the e2e test in Task 9 of the plan.
    it("initializeSessionLedger accumulates total_sessions across N calls", async () => {
        const { initializeSessionLedger } = await freshSessionStart();
        rmSync(ledgerPath, { force: true });
        const N = 20;
        for (let i = 0; i < N; i++) {
            initializeSessionLedger(dir);
        }
        const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
        expect(ledger.lifetime.total_sessions).toBe(N);
    });
});

describe("session-start.ts execution_layer hint", () => {
    let dir: string;
    let stderrOutput: string;
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-sess-hint-")));
        process.env.OPENWOLF_METADATA_DIR = dir;
        stderrOutput = "";
        stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(
            (chunk: Uint8Array | string) => {
                stderrOutput += typeof chunk === "string" ? chunk : chunk.toString();
                return true;
            }
        );
        const exitMock = vi.spyOn(process, "exit");
        exitMock.mockImplementationOnce((code?: number | string | null) => {
            throw new Error(`exit:${code}`);
        });
        exitMock.mockImplementation(() => {
            return undefined as never;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.OPENWOLF_METADATA_DIR;
        rmSync(dir, { recursive: true, force: true });
        stderrOutput = "";
    });

    it("emits execution layer hint to stderr when openwolf.execution_layer is set", async () => {
        writeFileSync(
            path.join(dir, "config.json"),
            JSON.stringify({ openwolf: { execution_layer: "gsd" } }),
            "utf-8"
        );
        vi.resetModules();
        try {
            await import("../../src/hooks/session-start.js");
        } catch {
            // swallow exit throw
        }
        expect(stderrOutput).toContain("execution layer = gsd");
    });

    it("does NOT emit execution layer hint to stderr when openwolf.execution_layer is null", async () => {
        writeFileSync(
            path.join(dir, "config.json"),
            JSON.stringify({ openwolf: { execution_layer: null } }),
            "utf-8"
        );
        vi.resetModules();
        try {
            await import("../../src/hooks/session-start.js");
        } catch {
            // swallow exit throw
        }
        expect(stderrOutput).not.toContain("execution layer =");
    });
});
