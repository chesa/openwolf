import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { detectWorktreeContext } from "./worktree.js";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, execFileSync: vi.fn() };
});

function mockGitContext(opts: {
  gitDir: string;
  commonDir: string;
  branch?: string;
  branchError?: Error;
}) {
  vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
    const arg = (args ?? []).join(" ");
    if (arg.includes("--git-dir")) return opts.gitDir;
    if (arg.includes("--git-common-dir")) return opts.commonDir;
    if (arg.includes("--abbrev-ref")) {
      if (opts.branchError) throw opts.branchError;
      return opts.branch ?? "";
    }
    return "";
  });
}

describe("detectWorktreeContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns non-worktree context when git command fails (non-git dir)", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("not a git repository"); });
    const result = detectWorktreeContext("/nonexistent/path");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/nonexistent/path");
    expect(result.branch).toBe("");
  });

  it("returns non-worktree context when in the main checkout", () => {
    mockGitContext({
      gitDir: "/path/to/project/.git",
      commonDir: "/path/to/project/.git",
      branch: "main",
    });
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.branch).toBe("main");
  });

  it("returns worktree context when in a linked worktree", () => {
    mockGitContext({
      gitDir: "/path/to/project/.git/worktrees/feature-25",
      commonDir: "/path/to/project/.git",
      branch: "feature/25-git-worktree-support",
    });
    const result = detectWorktreeContext("/path/to/project/.worktrees/feature-25");
    expect(result.isWorktree).toBe(true);
    expect(result.mainRepoRoot).toBe("/path/to/project");
    expect(result.worktreePath).toBe("/path/to/project/.worktrees/feature-25");
    if (!result.isWorktree) throw new Error("expected worktree");
    expect(result.worktreeId).toHaveLength(8);
    expect(result.branch).toBe("feature/25-git-worktree-support");
  });

  it("produces consistent worktreeId for the same worktree path", () => {
    mockGitContext({
      gitDir: "/path/to/project/.git/worktrees/feat",
      commonDir: "/path/to/project/.git",
      branch: "feat",
    });
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    mockGitContext({
      gitDir: "/path/to/project/.git/worktrees/feat",
      commonDir: "/path/to/project/.git",
      branch: "feat",
    });
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat");
    if (!r1.isWorktree || !r2.isWorktree) throw new Error("expected worktree");
    expect(r1.worktreeId).toBe(r2.worktreeId);
  });

  it("produces different worktreeIds for different worktree paths", () => {
    mockGitContext({
      gitDir: "/path/to/project/.git/worktrees/feat-a",
      commonDir: "/path/to/project/.git",
      branch: "feat-a",
    });
    const r1 = detectWorktreeContext("/path/to/project/.worktrees/feat-a");
    mockGitContext({
      gitDir: "/path/to/project/.git/worktrees/feat-b",
      commonDir: "/path/to/project/.git",
      branch: "feat-b",
    });
    const r2 = detectWorktreeContext("/path/to/project/.worktrees/feat-b");
    if (!r1.isWorktree || !r2.isWorktree) throw new Error("expected worktree");
    expect(r1.worktreeId).not.toBe(r2.worktreeId);
  });

  it("returns empty branch when branch detection fails (e.g., detached HEAD)", () => {
    mockGitContext({
      gitDir: "/path/to/project/.git",
      commonDir: "/path/to/project/.git",
      branchError: new Error("detached HEAD"),
    });
    const result = detectWorktreeContext("/path/to/project");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("");
  });

  it("does not false-positive on git submodules", () => {
    mockGitContext({
      gitDir: "/parent/.git/modules/sub",
      commonDir: "/parent/.git/modules/sub",
      branch: "main",
    });
    const result = detectWorktreeContext("/parent/sub");
    expect(result.isWorktree).toBe(false);
    expect(result.branch).toBe("main");
  });

  it("throws on unexpected git errors", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("permission denied"); });
    expect(() => detectWorktreeContext("/some/path")).toThrow("permission denied");
  });

  it("handles bare repositories correctly", () => {
    mockGitContext({
      gitDir: "/bare/repo.git",
      commonDir: "/bare/repo.git",
      branch: "main",
    });
    const result = detectWorktreeContext("/bare/repo.git");
    expect(result.isWorktree).toBe(false);
    expect(result.mainRepoRoot).toBe("/bare");
    expect(result.branch).toBe("main");
  });
});
