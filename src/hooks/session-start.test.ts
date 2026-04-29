import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// Mock process.exit to prevent the module from exiting when imported
vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`process.exit called with ${code}`);
});

async function freshSessionStart() {
    vi.resetModules();
    return import("./session-start.js");
}

describe("session-start.ts ledger init", () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "ow-sess-start-")));
    const ledgerPath = path.join(dir, "token-ledger.json");

    beforeEach(() => {
        // Prevent main() from running by catching the exit
        vi.spyOn(process, "exit").mockImplementation(() => {
            // swallow exit calls
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
});
