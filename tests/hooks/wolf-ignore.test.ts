import { describe, it, expect } from "vitest";
import {
    shouldExclude,
    parseAndMatchGitignore,
    DEFAULT_EXCLUDE_PATTERNS,
    ALWAYS_EXCLUDE_FILES,
} from "../../src/hooks/wolf-ignore.js";

// ---------------------------------------------------------------------------
// shouldExclude
// ---------------------------------------------------------------------------
describe("shouldExclude", () => {
    describe("bare-name patterns (any depth)", () => {
        it("excludes node_modules at root", () => {
            expect(shouldExclude("node_modules/foo/index.js", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
        });

        it("excludes node_modules in a middle segment", () => {
            expect(shouldExclude("packages/a/node_modules/x.js", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
        });
    });

    describe("extension globs", () => {
        it("excludes *.min.js anywhere in the tree", () => {
            expect(shouldExclude("dist/app.min.js", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
            expect(shouldExclude("a/b/c.min.js", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
        });
    });

    describe("ALWAYS_EXCLUDE_FILES — secrets regardless of patterns", () => {
        it("always excludes .env (empty pattern list)", () => {
            expect(shouldExclude(".env", [])).toBe(true);
        });

        it("always excludes .env.local nested inside a directory", () => {
            expect(shouldExclude("config/.env.local", [])).toBe(true);
        });

        it("always excludes any .env.* variant", () => {
            expect(shouldExclude(".env.backup", [])).toBe(true);
            expect(shouldExclude(".env.production", [])).toBe(true);
        });

        it("ALWAYS_EXCLUDE_FILES export contains expected values", () => {
            expect(ALWAYS_EXCLUDE_FILES).toBeInstanceOf(Set);
            expect(ALWAYS_EXCLUDE_FILES.has(".env")).toBe(true);
        });
    });

    describe("normal files are not excluded", () => {
        it("src/index.ts is NOT excluded with default patterns", () => {
            expect(shouldExclude("src/index.ts", DEFAULT_EXCLUDE_PATTERNS)).toBe(false);
        });
    });

    describe("nested path patterns", () => {
        const NESTED_PATTERN = [".claude/worktrees"];

        it("excludes a path inside .claude/worktrees", () => {
            expect(
                shouldExclude(".claude/worktrees/wt-1/meta.json", NESTED_PATTERN)
            ).toBe(true);
        });

        it("does NOT exclude a sibling path under .claude", () => {
            expect(
                shouldExclude(".claude/settings.json", NESTED_PATTERN)
            ).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// parseAndMatchGitignore
// ---------------------------------------------------------------------------
describe("parseAndMatchGitignore", () => {
    describe("blank and comment lines are skipped", () => {
        it("skips blank lines and comments, still matches a bare name", () => {
            const gi = "# comment\n\nnode_modules\n";
            expect(parseAndMatchGitignore("node_modules/x.js", gi)).toBe(true);
        });
    });

    describe("bare name (any depth)", () => {
        it("matches the bare name at any segment depth", () => {
            expect(parseAndMatchGitignore("a/b/node_modules/c.js", "node_modules\n")).toBe(true);
        });
    });

    describe("trailing slash (directory-content semantics)", () => {
        it("trailing slash matches directory contents (gen/out.js matches gen/)", () => {
            expect(parseAndMatchGitignore("gen/out.js", "gen/\n")).toBe(true);
        });

        it("trailing slash does NOT match an unrelated prefix (generator/out.js)", () => {
            expect(parseAndMatchGitignore("generator/out.js", "gen/\n")).toBe(false);
        });
    });

    describe("leading slash (root-anchored)", () => {
        it("/dist matches dist/app.js at the root", () => {
            expect(parseAndMatchGitignore("dist/app.js", "/dist\n")).toBe(true);
        });

        it("/dist does NOT match src/dist/app.js (nested)", () => {
            expect(parseAndMatchGitignore("src/dist/app.js", "/dist\n")).toBe(false);
        });
    });

    describe("within-segment * (extension glob)", () => {
        it("*.log matches any path that ends with .log", () => {
            expect(parseAndMatchGitignore("logs/error.log", "*.log\n")).toBe(true);
        });

        it("*.log also matches deeply nested paths (endsWith semantics preserved)", () => {
            expect(parseAndMatchGitignore("logs/sub/error.log", "*.log\n")).toBe(true);
        });
    });

    describe("double-star ** spanning segments", () => {
        it(".cache/** matches paths inside .cache at any depth", () => {
            expect(parseAndMatchGitignore(".cache/v8/foo.bin", ".cache/**\n")).toBe(true);
        });
    });

    describe("empty / all-comment content", () => {
        it("empty gitignore content returns false", () => {
            expect(parseAndMatchGitignore("anything.ts", "")).toBe(false);
        });

        it("all-comment gitignore content returns false", () => {
            expect(parseAndMatchGitignore("src/foo.ts", "# only comments\n# another\n")).toBe(false);
        });
    });

    describe("backslash normalization (Windows path seam)", () => {
        it("forward-slashed input derived from a Windows backslash path still matches the bare name", () => {
            // The path arrives already normalized to forward slashes (normalizePath is
            // applied before any matcher call — Pitfall 3). Simulate that pre-normalization.
            const normalized = "node_modules/foo/x.js"; // was node_modules\foo\x.js
            expect(parseAndMatchGitignore(normalized, "node_modules\n")).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // MANDATORY negation fail-closed pin (D10-05 / R6-D5)
    // -------------------------------------------------------------------------
    describe("negation lines — fail-closed (MANDATORY pin)", () => {
        it("negation lines are skipped — the re-included file remains excluded", () => {
            // The '!important.log' re-include is NOT honored by the hook parser.
            // Over-exclusion is acceptable; a leak (returning false for important.log)
            // is not. The scanner's `ignore` pkg is the authoritative backstop.
            const gi = "*.log\n!important.log\n";
            expect(parseAndMatchGitignore("important.log", gi)).toBe(true);
        });
    });
});
