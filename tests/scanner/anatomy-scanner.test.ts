import { describe, it, expect } from "vitest";
import { shouldExclude, buildAnatomy } from "../../src/scanner/anatomy-scanner.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

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

describe("buildAnatomy — respect_gitignore (opt-in)", () => {
  // Discriminators chosen NOT to collide with DEFAULT_EXCLUDE_PATTERNS:
  // "*.log" and a "gen/" dir are not default-excluded, so they isolate the
  // gitignore behavior from the built-in pattern excludes.
  function setup(respect: boolean): { root: string; wolf: string } {
    const root = mkdtempSync(path.join(tmpdir(), "ow-gi-"));
    const wolf = path.join(root, ".wolf");
    mkdirSync(wolf, { recursive: true });
    writeFileSync(path.join(root, "keep.ts"), "export const a = 1;\n");
    writeFileSync(path.join(root, "secret.log"), "noise\n");
    mkdirSync(path.join(root, "gen"), { recursive: true });
    writeFileSync(path.join(root, "gen", "out.js"), "x\n");
    writeFileSync(path.join(root, ".gitignore"), "*.log\ngen/\n");
    writeFileSync(
      path.join(wolf, "config.json"),
      JSON.stringify({ version: 1, openwolf: { anatomy: { respect_gitignore: respect } } })
    );
    return { root, wolf };
  }

  it("excludes .gitignored files and dirs when enabled", () => {
    const { root, wolf } = setup(true);
    try {
      const { content } = buildAnatomy(wolf, root);
      expect(content).toContain("keep.ts");
      expect(content).not.toContain("secret.log");
      expect(content).not.toContain("out.js");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores .gitignore when the option is off (default behavior)", () => {
    const { root, wolf } = setup(false);
    try {
      const { content } = buildAnatomy(wolf, root);
      expect(content).toContain("keep.ts");
      // not excluded — feature off, and neither matches a default pattern
      expect(content).toContain("secret.log");
      expect(content).toContain("out.js");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
