import { describe, it, expect, vi, beforeEach } from "vitest";
import * as gitWrapper from "./git-wrapper.js";
import { detectWorktreeContext } from "./worktree.js";

describe("detectWorktreeContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns non-worktree context when git command fails (non-git dir)", () => {
    vi.spyOn(gitWrapper, "execGit").mockImplementation(() => { throw new Error("not a git repo"); });
    const result = detectWorktreeContext("/nonexistent/path");
    expect(result.isWorktree).toBe(false);
    expect(result.sessionId).toBe("");
    expect(result.mainRepoRoot).toBe("/nonexistent/path");
    expect(result.branch).toBe("");
  });

  it("returns non-worktree context when in the main checkout", () => {
    vi.spyOn(gitWrapper, "execGit")
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("main");
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.branch).toBe("main");
    expect(result.sessionId).toBe("");
  });

  it("returns worktree context when in a linked worktree", () => {
    vi.spyOn(gitWrapper, "execGit")
      .mockReturnValueOnce("/path/to/project/.git")
      .mockReturnValueOnce("feature/25-git-worktree-support");
    const result = detectWorktreeContext("/path/to/project/.worktrees/feature-25");
    expect(result.isWorktree).toBe(true);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.worktreePath).toBe("/path/to/project/.worktrees/feature-25");
    expect(result.sessionId).toHaveLength(8);
    expect(result.branch).toBe("feature/25-git-worktree-support");
  });

  it("produces consistent sessionId for the same worktree path", () => {
    vi.spyOn(gitWrapper, "execGit").mockReturnValue("/path/to/project/.git");
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    vi.spyOn(gitWrapper, "execGit").mockReturnValue("/path/to/project/.git");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    expect(r1.sessionId).toBe(r2.sessionId);
  });

  it("produces different sessionIds for different worktree paths", () => {
    vi.spyOn(gitWrapper, "execGit").mockReturnValue("/path/to/project/.git");
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat-a");
    vi.spyOn(gitWrapper, "execGit").mockReturnValue("/path/to/project/.git");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat-b");
    expect(r1.sessionId).not.toBe(r2.sessionId);
  });

  it("returns empty branch when branch detection fails (e.g., detached HEAD)", () => {
    vi.spyOn(gitWrapper, "execGit")
      .mockReturnValueOnce("/path/to/project/.git")
      .mockImplementationOnce(() => { throw new Error("detached HEAD"); });
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("");
  });
});
