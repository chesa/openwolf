import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { detectWorktreeContext } from "./worktree.js";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, execFileSync: vi.fn() };
});

describe("detectWorktreeContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns non-worktree context when git command fails (non-git dir)", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("not a git repository"); });
    const result = detectWorktreeContext("/nonexistent/path");
    expect(result.isWorktree).toBe(false);
    expect(result.sessionId).toBe("");
    expect(result.mainRepoRoot).toBe("/nonexistent/path");
    expect(result.branch).toBe("");
  });

  it("returns non-worktree context when in the main checkout", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("/path/to/project/.git")   // --git-dir
      .mockReturnValueOnce("/path/to/project/.git")   // --git-common-dir
      .mockReturnValueOnce("main");                    // --abbrev-ref HEAD
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.branch).toBe("main");
    expect(result.sessionId).toBe("");
  });

  it("returns worktree context when in a linked worktree", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("/path/to/project/.git/worktrees/feature-25")  // --git-dir
      .mockReturnValueOnce("/path/to/project/.git")                       // --git-common-dir
      .mockReturnValueOnce("feature/25-git-worktree-support");            // --abbrev-ref HEAD
    const result = detectWorktreeContext("/path/to/project/.worktrees/feature-25");
    expect(result.isWorktree).toBe(true);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.worktreePath).toBe("/path/to/project/.worktrees/feature-25");
    expect(result.sessionId).toHaveLength(8);
    expect(result.branch).toBe("feature/25-git-worktree-support");
  });

  it("produces consistent sessionId for the same worktree path", () => {
    const mock = vi.mocked(execFileSync);
    mock.mockReturnValueOnce("/path/to/project/.git/worktrees/feat")  // --git-dir (call 1)
      .mockReturnValueOnce("/path/to/project/.git")                   // --git-common-dir (call 1)
      .mockReturnValueOnce("feat");                                   // branch (call 1)
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    mock.mockReturnValueOnce("/path/to/project/.git/worktrees/feat")  // --git-dir (call 2)
      .mockReturnValueOnce("/path/to/project/.git")                   // --git-common-dir (call 2)
      .mockReturnValueOnce("feat");                                   // branch (call 2)
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    expect(r1.sessionId).toBe(r2.sessionId);
  });

  it("produces different sessionIds for different worktree paths", () => {
    const mock = vi.mocked(execFileSync);
    mock.mockReturnValueOnce("/path/to/project/.git/worktrees/feat-a")
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("feat-a");
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat-a");
    mock.mockReturnValueOnce("/path/to/project/.git/worktrees/feat-b")
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("feat-b");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat-b");
    expect(r1.sessionId).not.toBe(r2.sessionId);
  });

  it("returns empty branch when branch detection fails (e.g., detached HEAD)", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("/path/to/project/.git")   // --git-dir
      .mockReturnValueOnce("/path/to/project/.git")   // --git-common-dir
      .mockImplementationOnce(() => { throw new Error("detached HEAD"); });
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("");
  });

  it("does not false-positive on git submodules", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("/parent/.git/modules/sub")  // --git-dir (submodule's git dir)
      .mockReturnValueOnce("/parent/.git/modules/sub")  // --git-common-dir (same for submodules)
      .mockReturnValueOnce("main");
    const result = detectWorktreeContext("/parent/sub");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("main");
  });

  it("throws on unexpected git errors", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("permission denied"); });
    expect(() => detectWorktreeContext("/some/path")).toThrow("permission denied");
  });
});
