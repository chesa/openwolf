import { describe, it, expect, vi, beforeEach } from "vitest";
import * as gitWrapper from "./git-wrapper.js";
import { detectWorktreeContext } from "./worktree.js";

describe("detectWorktreeContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns non-worktree context when git command fails (non-git dir)", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockImplementation(() => { throw new Error("not a git repo"); });
    
    const result = detectWorktreeContext("/tmp/not-a-git-repo");
    expect(result.isWorktree).toBe(false);
    expect(result.sessionId).toBe("");
    expect(result.mainRepoRoot).toBe("/tmp/not-a-git-repo");
    expect(result.branch).toBe("");
    
    spy.mockRestore();
  });

  it("returns non-worktree context when in the main checkout", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockReturnValueOnce("/path/to/project/.git")
       .mockReturnValueOnce("main");
    
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.branch).toBe("main");
    expect(result.sessionId).toBe("");
    
    spy.mockRestore();
  });

  it("returns worktree context when in a linked worktree", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockReturnValueOnce("/path/to/project/.git")
       .mockReturnValueOnce("feature/25-git-worktree-support");
    
    const result = detectWorktreeContext("/path/to/project/.worktrees/feature-25");
    expect(result.isWorktree).toBe(true);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.worktreePath).toBe("/path/to/project/.worktrees/feature-25");
    expect(result.sessionId).toHaveLength(8);
    expect(result.branch).toBe("feature/25-git-worktree-support");
    
    spy.mockRestore();
  });

  it("produces consistent sessionId for the same worktree path", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockReturnValue("/path/to/project/.git");
    
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    expect(r1.sessionId).toBe(r2.sessionId);
    
    spy.mockRestore();
  });

  it("produces different sessionIds for different worktree paths", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockReturnValue("/path/to/project/.git");
    
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat-a");
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat-b");
    expect(r1.sessionId).not.toBe(r2.sessionId);
    
    spy.mockRestore();
  });

  it("returns empty branch when branch detection fails (e.g., detached HEAD)", () => {
    const spy = vi.spyOn(gitWrapper, "execGit");
    spy.mockReturnValueOnce("/path/to/project/.git")
       .mockImplementationOnce(() => { throw new Error("detached HEAD"); });
    
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("");
    
    spy.mockRestore();
  });
});
