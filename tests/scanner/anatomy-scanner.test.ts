import { describe, it, expect } from "vitest";
import { shouldExclude } from "../../src/scanner/anatomy-scanner.js";

// Patterns roughly mirroring the default config plus the nested forms that
// the matcher must now support.
const DEFAULTS = ["node_modules", ".git", ".wolf", "*.min.js"];

describe("shouldExclude", () => {
  describe("backward-compatible behavior", () => {
    it("excludes bare directory names at any depth", () => {
      expect(shouldExclude("node_modules/foo/index.js", DEFAULTS)).toBe(true);
      expect(shouldExclude("packages/a/node_modules/x.js", DEFAULTS)).toBe(true);
      expect(shouldExclude(".wolf/config.json", DEFAULTS)).toBe(true);
    });

    it("excludes extension globs anywhere in the tree", () => {
      expect(shouldExclude("dist/app.min.js", DEFAULTS)).toBe(true);
      expect(shouldExclude("a/b/c.min.js", DEFAULTS)).toBe(true);
    });

    it("does not exclude unrelated files", () => {
      expect(shouldExclude("src/index.ts", DEFAULTS)).toBe(false);
      expect(shouldExclude("README.md", DEFAULTS)).toBe(false);
    });

    it("always excludes env files regardless of patterns", () => {
      expect(shouldExclude(".env", [])).toBe(true);
      expect(shouldExclude("config/.env.local", [])).toBe(true);
      expect(shouldExclude(".env.backup", [])).toBe(true);
    });
  });

  describe("nested-path patterns (the Q2 fix)", () => {
    it("excludes a nested directory and everything under it (prefix)", () => {
      const p = [".claude/worktrees"];
      expect(shouldExclude(".claude/worktrees", p)).toBe(true);
      expect(shouldExclude(".claude/worktrees/wt-1/meta.json", p)).toBe(true);
      // a sibling under .claude is NOT excluded
      expect(shouldExclude(".claude/settings.json", p)).toBe(false);
    });

    it("excludes direct children via a single-star path glob", () => {
      const p = ["docs/superpowers/*"];
      expect(shouldExclude("docs/superpowers/notes.md", p)).toBe(true);
      // the directory itself is not a child match
      expect(shouldExclude("docs/superpowers", p)).toBe(false);
      // a single "*" does not span deeper segments
      expect(shouldExclude("docs/superpowers/sub/x.md", p)).toBe(false);
    });

    it("supports ** spanning intermediate segments", () => {
      const p = ["docs/**/LEARNINGS.md"];
      expect(shouldExclude("docs/a/LEARNINGS.md", p)).toBe(true);
      expect(shouldExclude("docs/a/b/LEARNINGS.md", p)).toBe(true);
    });

    it("does not let a path pattern match an unrelated path", () => {
      expect(shouldExclude("src/superpowers/x.ts", ["docs/superpowers/*"])).toBe(false);
    });

    it("regression: slash patterns previously matched nothing", () => {
      // Before the fix these returned false (silent no-op), so the dirs were
      // scanned into anatomy.md anyway.
      expect(shouldExclude("docs/superpowers/x.md", ["docs/superpowers"])).toBe(true);
      expect(shouldExclude(".claude/worktrees/x", [".claude/worktrees"])).toBe(true);
    });
  });

  describe("single-segment globs", () => {
    it("matches a glob against any one path segment", () => {
      expect(shouldExclude("a/tmp123/file.txt", ["tmp*"])).toBe(true);
      expect(shouldExclude("a/b/file.txt", ["tmp*"])).toBe(false);
    });
  });
});
