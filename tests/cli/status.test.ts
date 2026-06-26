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
vi.mock("../../src/hooks/wolf-paths.js", () => ({
    getWolfDir: vi.fn(),
    getSessionDir: vi.fn(),
    getWorktreeContext: vi.fn(),
}));

import { findProjectRoot } from "../../src/scanner/project-root.js";
import { detectWorktreeContext } from "../../src/utils/worktree.js";
import { getWolfDir } from "../../src/hooks/wolf-paths.js";
import { hashCerebrumBody } from "../../src/hooks/wolf-pantry.js";
import { statusCommand } from "../../src/cli/status.js";

function makeCerebrumBody(lastUpdated: string, extra = ""): string {
    return [
        "# Cerebrum",
        "",
        `> Last updated: ${lastUpdated}`,
        "",
        "Core project memory.",
        extra,
    ].join("\n");
}

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

    it("shows pending learnings count", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        const sessionId = "test-session";
        fs.mkdirSync(path.join(wolfDir, "sessions", sessionId), { recursive: true });
        writeFileSync(
            path.join(wolfDir, "sessions", sessionId, "proposed-learnings.md"),
            "\n## 2026-06-26T12:00:00.000Z → cerebrum\n\nPending learning content\n",
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("1 learnings awaiting review"))).toBe(true);

        rmSync(dir, { recursive: true, force: true });
    });

    it("shows no-pending when staging empty", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        fs.mkdirSync(wolfDir, { recursive: true });

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("✓ No pending learnings"))).toBe(true);

        rmSync(dir, { recursive: true, force: true });
    });

    it("bootstraps sidecar when absent and does not flag", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        fs.mkdirSync(wolfDir, { recursive: true });
        const body = makeCerebrumBody("2026-06-01");
        writeFileSync(path.join(wolfDir, "cerebrum.md"), body, "utf-8");

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("baseline captured (no prior history)"))).toBe(true);
        expect(lines.some((l) => l.includes("freshness theater"))).toBe(false);

        const sidecar = JSON.parse(
            fs.readFileSync(path.join(wolfDir, "cerebrum-freshness.json"), "utf-8")
        );
        expect(sidecar.version).toBe(1);
        expect(sidecar.captured_by).toBe("status-bootstrap");
        expect(sidecar.content_sha256).toBe(hashCerebrumBody(body));
        expect(sidecar.last_updated_seen).toBe("2026-06-01");

        rmSync(dir, { recursive: true, force: true });
    });

    it("flags theater on date-only bump", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        fs.mkdirSync(wolfDir, { recursive: true });
        const body = makeCerebrumBody("2026-06-01");
        writeFileSync(path.join(wolfDir, "cerebrum.md"), body, "utf-8");
        writeFileSync(
            path.join(wolfDir, "cerebrum-freshness.json"),
            JSON.stringify({
                version: 1,
                content_sha256: hashCerebrumBody(body),
                last_updated_seen: "2026-06-01",
                captured_at: "2026-06-01T00:00:00.000Z",
                captured_by: "learnings-merge",
            }, null, 2),
            "utf-8"
        );

        // Bump only the date line; normalized content (and therefore hash) unchanged.
        writeFileSync(
            path.join(wolfDir, "cerebrum.md"),
            makeCerebrumBody("2026-06-25"),
            "utf-8"
        );

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes('✗') && l.includes("freshness theater"))).toBe(true);
        expect(lines.some((l) => l.includes("baseline captured"))).toBe(false);

        rmSync(dir, { recursive: true, force: true });
    });

    it("does NOT flag on real content change", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        fs.mkdirSync(wolfDir, { recursive: true });
        const oldBody = makeCerebrumBody("2026-06-01");
        writeFileSync(path.join(wolfDir, "cerebrum.md"), oldBody, "utf-8");
        writeFileSync(
            path.join(wolfDir, "cerebrum-freshness.json"),
            JSON.stringify({
                version: 1,
                content_sha256: hashCerebrumBody(oldBody),
                last_updated_seen: "2026-06-01",
                captured_at: "2026-06-01T00:00:00.000Z",
                captured_by: "learnings-merge",
            }, null, 2),
            "utf-8"
        );

        const newBody = makeCerebrumBody("2026-06-01", "A genuinely new sentence.");
        writeFileSync(path.join(wolfDir, "cerebrum.md"), newBody, "utf-8");

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const lines = consoleSpy.log.mock.calls.map((c) => String(c[0] ?? ""));
        expect(lines.some((l) => l.includes("✓ cerebrum.md: current"))).toBe(true);
        expect(lines.some((l) => l.includes("freshness theater"))).toBe(false);

        rmSync(dir, { recursive: true, force: true });
    });

    it("is read-only when sidecar exists", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "ow-status-"));
        const wolfDir = path.join(dir, ".wolf");
        fs.mkdirSync(wolfDir, { recursive: true });
        const body = makeCerebrumBody("2026-06-01");
        writeFileSync(path.join(wolfDir, "cerebrum.md"), body, "utf-8");
        const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");
        const originalSidecar = {
            version: 1,
            content_sha256: hashCerebrumBody(body),
            last_updated_seen: "2026-06-01",
            captured_at: "2026-06-01T00:00:00.000Z",
            captured_by: "learnings-merge",
        };
        writeFileSync(sidecarPath, JSON.stringify(originalSidecar, null, 2), "utf-8");

        vi.mocked(findProjectRoot).mockReturnValue(dir);
        vi.mocked(detectWorktreeContext).mockReturnValue({
            isWorktree: false,
            mainRepoRoot: dir,
            worktreePath: dir,
            branch: "main",
        });
        vi.mocked(getWolfDir).mockReturnValue(wolfDir);

        await statusCommand();
        const sidecarAfter = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
        expect(sidecarAfter).toEqual(originalSidecar);

        rmSync(dir, { recursive: true, force: true });
    });
});