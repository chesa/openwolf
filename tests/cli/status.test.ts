import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// Mock console so we can assert output
const consoleSpy = {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
};

vi.mock("../../src/scanner/project-root.js", () => ({ findProjectRoot: vi.fn() }));
vi.mock("../../src/utils/worktree.js", () => ({ detectWorktreeContext: vi.fn() }));

import { findProjectRoot } from "../../src/scanner/project-root.js";
import { detectWorktreeContext } from "../../src/utils/worktree.js";
import { statusCommand } from "../../src/cli/status.js";

describe("status.ts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        consoleSpy.log.mockClear();
    });

    it("does not crash when ledger is missing total_tokens_estimated", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
        writeFileSync(
            path.join(dir, ".wolf", "token-ledger.json"),
            JSON.stringify({ version: 1, lifetime: { total_sessions: 1 } }),
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });

        await statusCommand();
        const tokensLine = consoleSpy.log.mock.calls.find(
            (c) => c[0] && c[0].includes("Tokens tracked")
        );
        expect(tokensLine).toBeDefined();
        expect(tokensLine![0]).toContain("~0");

        rmSync(dir, { recursive: true, force: true });
    });

    it("does not crash when ledger is missing total_reads and total_writes", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
        writeFileSync(
            path.join(dir, ".wolf", "token-ledger.json"),
            JSON.stringify({ version: 1, lifetime: { total_sessions: 1 } }),
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });

        await statusCommand();
        const readsLine = consoleSpy.log.mock.calls.find(
            (c) => c[0] && c[0].includes("Total reads")
        );
        expect(readsLine).toBeDefined();
        expect(readsLine![0]).toContain("0");

        const writesLine = consoleSpy.log.mock.calls.find(
            (c) => c[0] && c[0].includes("Total writes")
        );
        expect(writesLine).toBeDefined();
        expect(writesLine![0]).toContain("0");

        rmSync(dir, { recursive: true, force: true });
    });

    it("reports gitignored per-dev files (memory.md, cron-state.json) softly, not as ✗ errors", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
        // intentionally do NOT create memory.md or cron-state.json

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));

        // neither is flagged as a hard missing-file error
        expect(lines.some((l) => l.includes("✗ Missing: .wolf/cron-state.json"))).toBe(false);
        expect(lines.some((l) => l.includes("✗ Missing: .wolf/memory.md"))).toBe(false);
        // both are reported as informational "Not yet created" notices
        expect(
            lines.some((l) => l.includes("Not yet created") && l.includes("cron-state.json"))
        ).toBe(true);
        expect(
            lines.some((l) => l.includes("Not yet created") && l.includes("memory.md"))
        ).toBe(true);

        rmSync(dir, { recursive: true, force: true });
    });

    it("shows Execution layer line when config sets openwolf.execution_layer", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
        writeFileSync(
            path.join(dir, ".wolf", "config.json"),
            JSON.stringify({ openwolf: { execution_layer: "gsd" } }),
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("Execution layer: gsd"))).toBe(true);

        rmSync(dir, { recursive: true, force: true });
    });

    it("does NOT show Execution layer line when openwolf.execution_layer is null", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        fs.mkdirSync(path.join(dir, ".wolf"), { recursive: true });
        writeFileSync(
            path.join(dir, ".wolf", "config.json"),
            JSON.stringify({ openwolf: { execution_layer: null } }),
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("Execution layer"))).toBe(false);

        rmSync(dir, { recursive: true, force: true });
    });
});