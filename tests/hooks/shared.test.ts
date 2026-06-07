import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    mkdtempSync,
    rmSync,
    existsSync,
    readFileSync,
    realpathSync,
    renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return { ...actual };
});

// Mock the helper so we control the WorktreeContext returned to shared.ts.
vi.mock("../../src/hooks/worktree-helper.js", async (importOriginal) => {
    const mod =
        await importOriginal<typeof import("../../src/hooks/worktree-helper.js")>();
    return {
        ...mod,
        detectWorktreeContextRaw: vi.fn(),
    };
});

import {
    detectWorktreeContextRaw,
    type WorktreeId,
} from "../../src/hooks/worktree-helper.js";

async function freshShared() {
    // Reset module state so _cachedWorktreeCtx starts empty for each test.
    vi.resetModules();
    return import("../../src/hooks/shared.js");
}

describe("shared.ts (hot path)", () => {
    beforeEach(() => {
        vi.mocked(detectWorktreeContextRaw).mockReset();
    });

    it(
        "getWolfDir returns <projectDir>/.wolf in a main checkout",
        async () => {
            const dir = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-shared-")),
            );
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: false,
                    mainRepoRoot: dir,
                    worktreePath: dir,
                    branch: "main",
                });
                process.env.CLAUDE_PROJECT_DIR = dir;
                const { getWolfDir } = await freshShared();
                expect(getWolfDir()).toBe(path.join(dir, ".wolf"));
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "getWolfDir always resolves to mainRepoRoot/.wolf in worktree mode",
        async () => {
            const main = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-main-")),
            );
            const wt = main + "-wt";
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: true,
                    mainRepoRoot: main,
                    worktreePath: wt,
                    worktreeId: "abcd1234" as WorktreeId,
                    branch: "feat",
                });
                process.env.CLAUDE_PROJECT_DIR = wt;
                const { getWolfDir } = await freshShared();
                expect(getWolfDir()).toBe(path.join(main, ".wolf"));
            } finally {
                rmSync(main, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "getSessionDir returns the wolf dir for a non-worktree",
        async () => {
            const dir = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-sess-")),
            );
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: false,
                    mainRepoRoot: dir,
                    worktreePath: dir,
                    branch: "main",
                });
                process.env.CLAUDE_PROJECT_DIR = dir;
                const { getWolfDir, getSessionDir } = await freshShared();
                expect(getSessionDir()).toBe(getWolfDir());
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "getSessionDir routes to .wolf/sessions/<id>/ in a worktree",
        async () => {
            const main = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-main-")),
            );
            const wt = main + "-wt";
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: true,
                    mainRepoRoot: main,
                    worktreePath: wt,
                    worktreeId: "abcd1234" as WorktreeId,
                    branch: "feat",
                });
                process.env.CLAUDE_PROJECT_DIR = wt;
                const { getSessionDir } = await freshShared();
                expect(getSessionDir()).toBe(
                    path.join(main, ".wolf", "sessions", "abcd1234"),
                );
            } finally {
                rmSync(main, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "ensureSessionDir creates the dir and writes worktree.json on first call only",
        async () => {
            const main = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-main-")),
            );
            const wt = main + "-wt";
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: true,
                    mainRepoRoot: main,
                    worktreePath: wt,
                    worktreeId: "abcd1234" as WorktreeId,
                    branch: "feat",
                });
                process.env.CLAUDE_PROJECT_DIR = wt;
                const { ensureSessionDir } = await freshShared();

                ensureSessionDir();
                const metaPath = path.join(
                    main,
                    ".wolf",
                    "sessions",
                    "abcd1234",
                    "worktree.json",
                );
                expect(existsSync(metaPath)).toBe(true);
                const firstMeta = JSON.parse(
                    readFileSync(metaPath, "utf-8"),
                );
                expect(firstMeta.branch).toBe("feat");

                const originalCreated = firstMeta.created;
                ensureSessionDir();
                const secondMeta = JSON.parse(
                    readFileSync(metaPath, "utf-8"),
                );
                expect(secondMeta.created).toBe(originalCreated);
            } finally {
                rmSync(main, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "caches detection so repeated calls invoke detectWorktreeContextRaw only once",
        async () => {
            const dir = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-cache-")),
            );
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: false,
                    mainRepoRoot: dir,
                    worktreePath: dir,
                    branch: "main",
                });
                process.env.CLAUDE_PROJECT_DIR = dir;
                const { getWolfDir, getSessionDir, getWorktreeContext } =
                    await freshShared();
                getWolfDir();
                getSessionDir();
                getWorktreeContext();
                expect(
                    vi.mocked(detectWorktreeContextRaw),
                ).toHaveBeenCalledTimes(1);
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "does NOT cache an unclassified failure — a transient throw retries on the next call",
        async () => {
            const dir = realpathSync(
                mkdtempSync(path.join(tmpdir(), "openwolf-retry-")),
            );
            try {
                const ctx = {
                    isWorktree: false as const,
                    mainRepoRoot: dir,
                    worktreePath: dir,
                    branch: "main",
                };
                // First call throws an unclassified error (status: 1).
                vi.mocked(detectWorktreeContextRaw)
                    .mockImplementationOnce(() => {
                        const e = new Error(
                            "Command failed: git",
                        ) as Error & { status?: number };
                        e.status = 1;
                        throw e;
                    })
                    .mockReturnValueOnce(ctx);

                process.env.CLAUDE_PROJECT_DIR = dir;
                const { getWorktreeContext } = await freshShared();
                const a = getWorktreeContext();
                expect(a.isWorktree).toBe(false);
                const b = getWorktreeContext();
                expect(b).toEqual(ctx);
                expect(
                    vi.mocked(detectWorktreeContextRaw),
                ).toHaveBeenCalledTimes(2);
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    it(
        "writeJSON produces output correctly on the happy path",
        async () => {
            const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-write-")));
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: false, mainRepoRoot: dir, worktreePath: dir, branch: "main",
                });
                process.env.CLAUDE_PROJECT_DIR = dir;
                const { writeJSON } = await freshShared();

                const target = path.join(dir, "ok.json");
                writeJSON(target, { a: 1 });
                expect(JSON.parse(readFileSync(target, "utf-8"))).toEqual({ a: 1 });
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        },
    );

    describe("EBUSY fallback", () => {
        vi.mock("node:fs", async (importOriginal) => {
            const actual = await importOriginal<typeof import("node:fs")>();
            return { ...actual, renameSync: vi.fn(actual.renameSync) };
        });

        it("falls back to direct write when renameSync fails with EBUSY", async () => {
            const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "openwolf-write-")));
            try {
                vi.mocked(detectWorktreeContextRaw).mockReturnValue({
                    isWorktree: false, mainRepoRoot: dir, worktreePath: dir, branch: "main",
                });
                process.env.CLAUDE_PROJECT_DIR = dir;
                const { writeJSON } = await freshShared();

                const target = path.join(dir, "fallback.json");

                // Make renameSync throw EBUSY to trigger the direct-write fallback
                const renameMock = vi.mocked(renameSync);
                renameMock.mockImplementationOnce(() => {
                    const err = new Error("resource busy") as NodeJS.ErrnoException;
                    err.code = "EBUSY";
                    throw err;
                });

                writeJSON(target, { b: 2 });
                // The file should still be written via the direct-write fallback
                expect(JSON.parse(readFileSync(target, "utf-8"))).toEqual({ b: 2 });
            } finally {
                rmSync(dir, { recursive: true, force: true });
                delete process.env.CLAUDE_PROJECT_DIR;
            }
        });
    });
});