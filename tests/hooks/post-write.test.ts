/**
 * tests/hooks/post-write.test.ts
 *
 * Tests for the autoDetectBugFix helper exported from post-write.ts.
 * The hook module exports `autoDetectBugFix` only for testing purposes.
 *
 * Task 8: verify two concurrent-ish appends produce two NDJSON lines
 * with two distinct ids (no lost entry, no duplicate id).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { appendBugEntry, newBugId, readBugEntries } from "../../src/hooks/buglog-ndjson.js";
import { autoDetectBugFix, recordAnatomyWrite } from "../../src/hooks/post-write.js";
import { normalizePath } from "../../src/hooks/shared.js";

describe("buglog NDJSON appends (Task 8 — autoDetectBugFix path)", () => {
  it("two concurrent-ish appends produce two NDJSON lines with distinct ids", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-post-write-"));
    try {
      // Simulate what autoDetectBugFix now does — two back-to-back appends
      const id1 = newBugId();
      const id2 = newBugId();

      appendBugEntry(dir, {
        id: id1,
        timestamp: new Date().toISOString(),
        error_message: "missing null check",
        file: "src/foo.ts",
        root_cause: "foo was null",
        fix: "added null guard",
        tags: ["auto-detected", "null-check", "ts"],
        related_bugs: [],
        occurrences: 1,
        last_seen: new Date().toISOString(),
      });

      appendBugEntry(dir, {
        id: id2,
        timestamp: new Date().toISOString(),
        error_message: "unhandled catch",
        file: "src/foo.ts",
        root_cause: "no try/catch",
        fix: "wrapped in try/catch",
        tags: ["auto-detected", "error-handling", "ts"],
        related_bugs: [],
        occurrences: 1,
        last_seen: new Date().toISOString(),
      });

      const entries = readBugEntries(dir);

      // Two distinct lines
      expect(entries).toHaveLength(2);

      // Ids are distinct
      expect(entries[0].id).not.toBe(entries[1].id);
      expect(entries[0].id).toBe(id1);
      expect(entries[1].id).toBe(id2);

      // Ids match NDJSON uuid format
      expect(entries[0].id).toMatch(/^bug-[0-9a-f]{8}$/);
      expect(entries[1].id).toMatch(/^bug-[0-9a-f]{8}$/);

      // File is NDJSON, not JSON array
      const raw = readFileSync(path.join(dir, "buglog.ndjson"), "utf-8");
      const lines = raw.split("\n").filter(l => l.trim().length > 0);
      expect(lines).toHaveLength(2);
      // Each line is valid JSON object
      const obj1 = JSON.parse(lines[0]);
      const obj2 = JSON.parse(lines[1]);
      expect(obj1.error_message).toBe("missing null check");
      expect(obj2.error_message).toBe("unhandled catch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("autoDetectBugFix — only flags code files", () => {
  it("does NOT log a bug entry for prose/markdown edits", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-pw-md-"));
    try {
      // A diff that WOULD trip the error-handling heuristic ("catch" appears),
      // but on a .md file it must be ignored.
      const oldStr = "# Notes\n\nstatus: investigating\n";
      const newStr = "# Notes\n\ntry to catch up; status: root_cause_found\n";
      autoDetectBugFix(dir, path.join(dir, "notes.md"), dir, oldStr, newStr);
      expect(readBugEntries(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOES log a bug entry for an equivalent fix in a code file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-pw-ts-"));
    try {
      const oldStr = "function load() { return JSON.parse(read()); }";
      const newStr =
        "function load() { try { return JSON.parse(read()); } catch (e) { return null; } }";
      autoDetectBugFix(dir, path.join(dir, "src", "foo.ts"), dir, oldStr, newStr);
      const entries = readBugEntries(dir);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].tags).toContain("auto-detected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("recordAnatomyWrite — out-of-project guard (R3)", () => {
  it("does NOT write anatomy for a path outside the project root", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-oop-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      // A scratch file outside the project root (simulates /tmp / scratchpad leak).
      const outside = path.join(tmpdir(), "ow-scratch-zzz", "note.md");
      recordAnatomyWrite(wolfDir, outside, dir, "# scratch\n");
      // No anatomy.md should be created for an out-of-project path.
      expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOES record an in-project file (positive control)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ow-anat-ip-"));
    try {
      const wolfDir = path.join(dir, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      const inProject = path.join(dir, "src", "foo.ts");
      mkdirSync(path.dirname(inProject), { recursive: true });
      writeFileSync(inProject, "export const x = 1;\n");
      recordAnatomyWrite(wolfDir, inProject, dir, "");
      const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
      expect(anatomy).toContain("foo.ts");
      expect(anatomy).toContain("src/");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Acme field replay: R3 out-of-project guard ──────────────────────────────
//
// PRD evidence E7: acme's pre-fix anatomy.md contained an entry for
// ".claude/plans/tmp.pwYfhCNiar/draft/tmp.zIDPKm5EAB" — a scratch dir that
// resolve OUTSIDE the project root via a "../" relative path.
// The frozen symptom is preserved in tests/fixtures/acme-snapshot-verify/anatomy-leak.md.
// Commit cac925a (R3) prevents this class of leak by checking relPath.startsWith("../").
//
describe("recordAnatomyWrite — acme field replay (R3)", () => {
  it("does NOT write anatomy for an acme-shaped out-of-project scratch path", () => {
    // Two sibling tmp dirs: one is the project root, the other is the scratch location.
    // path.relative(projectRoot, outsideAbs) will begin with "../" — triggering the R3 guard.
    const projectRoot = mkdtempSync(path.join(tmpdir(), "ow-r3-project-"));
    const scratchBase = mkdtempSync(path.join(tmpdir(), "ow-r3-scratch-"));
    try {
      const wolfDir = path.join(projectRoot, ".wolf");
      mkdirSync(wolfDir, { recursive: true });

      // Mimic the acme scratch shape: .../tmp.pwYfhCNiar/draft/tmp.zIDPKm5EAB
      // The key property is that this resolves outside projectRoot (starts with "../")
      const outsideAbs = path.join(
        scratchBase,
        "tmp.pwYfhCNiar",
        "draft",
        "tmp.zIDPKm5EAB",
      );

      // Confirm the relative path does start with "../" (the condition R3 guards on)
      const rel = normalizePath(path.relative(projectRoot, outsideAbs));
      expect(rel.startsWith("../")).toBe(true);

      // Call the hook function — must silently skip and produce NO anatomy.md
      recordAnatomyWrite(wolfDir, outsideAbs, projectRoot, "# scratch\n");

      // R3 assertion: no anatomy.md created for out-of-project path
      expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(scratchBase, { recursive: true, force: true });
    }
  });
});

// ─── Acme field replay: R5 buglog code-file gate ─────────────────────────────
//
// PRD evidence E5/E6 / acme bug-020 shape: acme's pre-fix buglog.ndjson contained
// auto-detected entries for prose edits — a "lambdas/README.md" value-swap and a
// "docs/superpowers/specs/x.md" multi-line restructure.  Both carried fix-pattern
// signal that WOULD trigger the heuristic on a .ts file, but the R5 gate
// (CODE_FILE_EXTENSIONS) in commit 9f63395 must now suppress them.
//
describe("autoDetectBugFix — acme prose field replay (R5)", () => {
  it("does NOT log for a lambdas/README.md quoted-value swap (acme bug-020 shape)", () => {
    // acme bug-020: a quoted API key name was renamed in a README —
    // "acme_api_token" → "acme_api_key_id".  The wrong-value heuristic would
    // fire on this if the extension guard is absent.
    const dir = mkdtempSync(path.join(tmpdir(), "ow-r5-readme-"));
    try {
      const prosePath = path.join(dir, "lambdas", "README.md");
      mkdirSync(path.dirname(prosePath), { recursive: true });
      const oldStr = 'The function expects the `"acme_api_token"` header.';
      const newStr = 'The function expects the `"acme_api_key_id"` header.';
      autoDetectBugFix(dir, prosePath, dir, oldStr, newStr);
      expect(readBugEntries(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does NOT log for a docs/superpowers/specs/x.md multi-line refactor", () => {
    // docs/superpowers/specs/*.md was in exclude_patterns yet leaked into acme's
    // anatomy AND generated spurious buglog entries.  This asserts R5 silences it.
    const dir = mkdtempSync(path.join(tmpdir(), "ow-r5-docs-"));
    try {
      const prosePath = path.join(dir, "docs", "superpowers", "specs", "x.md");
      mkdirSync(path.dirname(prosePath), { recursive: true });
      // Multi-line restructure diff with enough removed lines to trip the
      // "significant refactor" catch-all on a code file.
      const oldStr = [
        "## Overview",
        "This function validates input.",
        "Returns null on error.",
        "Uses try/catch internally.",
      ].join("\n");
      const newStr = [
        "## Overview",
        "Validates input and returns a result.",
        "Throws on invalid schema.",
      ].join("\n");
      autoDetectBugFix(dir, prosePath, dir, oldStr, newStr);
      expect(readBugEntries(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOES log for the same quoted-value swap on a .ts file (positive control)", () => {
    // Confirms the gate is the extension, not the diff content.
    const dir = mkdtempSync(path.join(tmpdir(), "ow-r5-ts-"));
    try {
      const tsPath = path.join(dir, "src", "client.ts");
      mkdirSync(path.dirname(tsPath), { recursive: true });
      const oldStr = 'const headerName = "acme_api_token";';
      const newStr = 'const headerName = "acme_api_key_id";';
      autoDetectBugFix(dir, tsPath, dir, oldStr, newStr);
      const entries = readBugEntries(dir);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].tags).toContain("auto-detected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── In-project exclusion gates: R6 (E6 regression + gitignore gate) ─────────
//
// PRD evidence E6: acme anatomy.md leaked .claude/plans scratch entries that
// were IN-PROJECT (relative path does NOT start with "../") so the R3 guard
// could not catch them.  R6 adds two opt-in gates inside recordAnatomyWrite:
//   Gate 1 — shouldExclude vs exclude_patterns (E6 regression — ROADMAP SC2)
//   Gate 2 — parseAndMatchGitignore vs root .gitignore (opt-in via respect_gitignore)
//
describe("recordAnatomyWrite — in-project exclusion (R6)", () => {
  it("E6 regression: does NOT record a path under an excluded dir", () => {
    // Configure .wolf/config.json to exclude ".claude/plans".
    // A file written inside that dir must NOT appear in anatomy.md.
    const projectRoot = mkdtempSync(path.join(tmpdir(), "ow-r6-e6-"));
    try {
      const wolfDir = path.join(projectRoot, ".wolf");
      mkdirSync(wolfDir, { recursive: true });

      // Write config with exclude_patterns that covers the leaking dir
      writeFileSync(
        path.join(wolfDir, "config.json"),
        JSON.stringify({
          openwolf: {
            anatomy: {
              exclude_patterns: [".claude/plans", "node_modules", ".wolf"],
            },
          },
        }),
        "utf-8",
      );

      // Mimic the acme E6 shape: an in-project scratch file under .claude/plans
      const leakFile = path.join(
        projectRoot,
        ".claude",
        "plans",
        "tmp.pwYfhCNiar",
        "note.md",
      );
      mkdirSync(path.dirname(leakFile), { recursive: true });
      writeFileSync(leakFile, "# scratch\n", "utf-8");

      recordAnatomyWrite(wolfDir, leakFile, projectRoot, "# scratch\n");

      // Gate 1 must have fired — no anatomy.md created (or it must not contain note.md)
      if (existsSync(path.join(wolfDir, "anatomy.md"))) {
        const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
        expect(anatomy).not.toContain("note.md");
        expect(anatomy).not.toContain(".claude/plans");
      }
      // (anatomy.md may simply not exist — that also satisfies the assertion)
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("respect_gitignore true + matching .gitignore entry: path NOT recorded", () => {
    // Configure .wolf/config.json with respect_gitignore: true.
    // Root .gitignore lists "scratch/".
    // A file under scratch/ must NOT appear in anatomy.md.
    const projectRoot = mkdtempSync(path.join(tmpdir(), "ow-r6-gi-"));
    try {
      const wolfDir = path.join(projectRoot, ".wolf");
      mkdirSync(wolfDir, { recursive: true });

      writeFileSync(
        path.join(wolfDir, "config.json"),
        JSON.stringify({
          openwolf: { anatomy: { respect_gitignore: true } },
        }),
        "utf-8",
      );

      // Root .gitignore that excludes scratch/
      writeFileSync(
        path.join(projectRoot, ".gitignore"),
        "# generated\nscratch/\n",
        "utf-8",
      );

      const scratchFile = path.join(projectRoot, "scratch", "x.ts");
      mkdirSync(path.dirname(scratchFile), { recursive: true });
      writeFileSync(scratchFile, "export const x = 1;\n", "utf-8");

      recordAnatomyWrite(wolfDir, scratchFile, projectRoot, "");

      // Gate 2 must have fired — anatomy.md must not contain the gitignored file
      if (existsSync(path.join(wolfDir, "anatomy.md"))) {
        const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
        expect(anatomy).not.toContain("x.ts");
        expect(anatomy).not.toContain("scratch/");
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("respect_gitignore absent (default false): gitignored path IS recorded (D10-08)", () => {
    // Without respect_gitignore:true in config, the root .gitignore is NOT consulted.
    // The same path-name that was blocked above MUST be recorded here — proving
    // the gate is strictly opt-in (R6-D4/D10-08).
    const projectRoot = mkdtempSync(path.join(tmpdir(), "ow-r6-gi-default-"));
    try {
      const wolfDir = path.join(projectRoot, ".wolf");
      mkdirSync(wolfDir, { recursive: true });

      // Config with NO respect_gitignore key — defaults to false
      writeFileSync(
        path.join(wolfDir, "config.json"),
        JSON.stringify({ openwolf: { anatomy: {} } }),
        "utf-8",
      );

      // Root .gitignore still lists scratch/
      writeFileSync(
        path.join(projectRoot, ".gitignore"),
        "scratch/\n",
        "utf-8",
      );

      const scratchFile = path.join(projectRoot, "scratch", "x.ts");
      mkdirSync(path.dirname(scratchFile), { recursive: true });
      writeFileSync(scratchFile, "export const x = 1;\n", "utf-8");

      recordAnatomyWrite(wolfDir, scratchFile, projectRoot, "");

      // Gate 2 is off — anatomy.md MUST have been created and must contain x.ts
      expect(existsSync(path.join(wolfDir, "anatomy.md"))).toBe(true);
      const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
      expect(anatomy).toContain("x.ts");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("no config.json: default exclude_patterns fire — node_modules/ NOT recorded", () => {
    // When .wolf/config.json is absent, the hook falls back to DEFAULT_EXCLUDE_PATTERNS.
    // DEFAULT_EXCLUDE_PATTERNS includes "node_modules" — so a file under node_modules/
    // must NOT be recorded (Gate 1 fires on the default, T-10-03 fallback).
    const projectRoot = mkdtempSync(path.join(tmpdir(), "ow-r6-noconfig-"));
    try {
      const wolfDir = path.join(projectRoot, ".wolf");
      mkdirSync(wolfDir, { recursive: true });
      // Deliberately do NOT write .wolf/config.json

      const nmFile = path.join(projectRoot, "node_modules", "some-pkg", "index.js");
      mkdirSync(path.dirname(nmFile), { recursive: true });
      writeFileSync(nmFile, "module.exports = {};\n", "utf-8");

      recordAnatomyWrite(wolfDir, nmFile, projectRoot, "");

      // DEFAULT_EXCLUDE_PATTERNS covers node_modules — anatomy.md should not contain it
      if (existsSync(path.join(wolfDir, "anatomy.md"))) {
        const anatomy = readFileSync(path.join(wolfDir, "anatomy.md"), "utf-8");
        expect(anatomy).not.toContain("index.js");
        expect(anatomy).not.toContain("node_modules");
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
