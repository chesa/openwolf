import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  getWolfDir, ensureWolfDir, getSessionDir, updateJSON, readMarkdown, parseAnatomy, serializeAnatomy,
  extractDescription, estimateTokens, appendMarkdown, timeShort, timestamp, readStdin, normalizePath, isWolfFile,
  appendBugEntry, newBugId, withFileLock,
  shouldExclude, parseAndMatchGitignore, DEFAULT_EXCLUDE_PATTERNS,
} from "./shared.js";

interface SessionData {
  files_written: Array<{ file: string; action: string; tokens: number; at: string }>;
  edit_counts: Record<string, number>;
  [key: string]: unknown;
}

// Token-classification extension sets reused by anatomy and memory paths.
const CODE_EXTS = new Set([
  ".ts", ".js", ".tsx", ".jsx", ".py", ".json", ".yaml", ".yml", ".css",
]);
const PROSE_EXTS = new Set([".md", ".txt", ".rst"]);

// ─── Anatomy Update ──────────────────────────────────────────────
//
// Record (or refresh) a single file's entry in anatomy.md after a Write/Edit.
// Exported for unit testing (tests/hooks/post-write.test.ts).
//
// Out-of-project paths (scratchpad, /tmp, sibling repos) are skipped: they are not
// part of THIS project's map, and recording them leaks machine-local paths into the
// shared, committed anatomy.md (observed in acme_translators: tmp.xxxxxxxx dirs).
// relPath is project-root-relative + forward-slashed, so a leading "../" means the
// write target lives outside the project root.
export function recordAnatomyWrite(
  wolfDir: string,
  absolutePath: string,
  projectRoot: string,
  contentFallback: string,
): void {
  const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
  if (relPathLocal.startsWith("../") || path.isAbsolute(relPathLocal)) return;

  // ─── R6 gate: read .wolf/config.json fresh on every call (D10-07/R6-D3 — no caching).
  // Missing, unreadable, or malformed config falls back to defaults silently (T-10-03).
  let excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS;
  let respectGitignore = false;
  try {
    const rawCfg = fs.readFileSync(path.join(wolfDir, "config.json"), "utf-8");
    const cfg = JSON.parse(rawCfg) as { openwolf?: { anatomy?: { exclude_patterns?: unknown; respect_gitignore?: unknown } } };
    const rawPatterns = cfg.openwolf?.anatomy?.exclude_patterns;
    excludePatterns = Array.isArray(rawPatterns) && rawPatterns.every((p) => typeof p === "string")
      ? (rawPatterns as string[])
      : DEFAULT_EXCLUDE_PATTERNS;
    respectGitignore = typeof cfg.openwolf?.anatomy?.respect_gitignore === "boolean"
      ? cfg.openwolf.anatomy.respect_gitignore as boolean
      : false;
  } catch {
    // Any I/O or parse failure → defaults (D10-07/R6-D3)
  }

  // Gate 1: exclude_patterns — E6 regression (ROADMAP SC2)
  if (shouldExclude(relPathLocal, excludePatterns)) return;

  // Gate 2: root .gitignore — opt-in only (D10-08/R6-D4: default false)
  if (respectGitignore) {
    try {
      const gi = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8");
      if (parseAndMatchGitignore(relPathLocal, gi)) return;
    } catch {
      // No .gitignore or unreadable — skip gate silently
    }
  }

  const anatomyPath = path.join(wolfDir, "anatomy.md");

  // Protect the read-modify-write of anatomy.md with a file lock so concurrent
  // post-write events (or processes) do not read the same version and overwrite
  // each other's entries.
  withFileLock(anatomyPath, () => {
    let anatomyContent: string;
    try {
      anatomyContent = fs.readFileSync(anatomyPath, "utf-8");
    } catch {
      anatomyContent = "# anatomy.md\n\n> Auto-maintained by OpenWolf.";
    }

    const sections = parseAnatomy(anatomyContent);
    const dir = path.dirname(relPathLocal);
    const fileName = path.basename(relPathLocal);
    const sectionKey = dir === "." ? "./" : dir + "/";

    let fileContent = "";
    try {
      fileContent = fs.readFileSync(absolutePath, "utf-8");
      if (fileContent.includes("\0")) return;
    } catch {
      fileContent = contentFallback;
    }

    const desc = extractDescription(absolutePath).slice(0, 100);
    const ext = path.extname(absolutePath).toLowerCase();
    const type = CODE_EXTS.has(ext) ? "code" : PROSE_EXTS.has(ext) ? "prose" : "mixed";
    const tokens = estimateTokens(fileContent, type as "code" | "prose" | "mixed");

    if (!sections.has(sectionKey)) sections.set(sectionKey, []);
    const entries = sections.get(sectionKey)!;
    const idx = entries.findIndex((e) => e.file === fileName);
    if (idx !== -1) {
      entries[idx] = { file: fileName, description: desc, tokens };
    } else {
      entries.push({ file: fileName, description: desc, tokens });
    }

    let fileCount = 0;
    for (const [, list] of sections) fileCount += list.length;

    const serialized = serializeAnatomy(sections, {
      lastScanned: new Date().toISOString(),
      fileCount,
      hits: 0,
      misses: 0,
    });

    const tmp = anatomyPath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
    try {
      fs.writeFileSync(tmp, serialized, "utf-8");
      fs.renameSync(tmp, anatomyPath);
    } catch {
      try { fs.writeFileSync(anatomyPath, serialized, "utf-8"); }
      catch (fallbackErr) {
        process.stderr.write(`OpenWolf post-write: failed to write anatomy.md (${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)})\n`);
      }
      try { fs.unlinkSync(tmp); } catch {}
    }
  });
}


async function main(): Promise<void> {
  ensureWolfDir();
  const wolfDir = getWolfDir();
  const sessionDir = getSessionDir();
  const sessionFile = path.join(sessionDir, "_session.json");
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  const raw = await readStdin();
  let input: { tool_name?: string; tool_input?: { file_path?: string; path?: string; content?: string; old_string?: string; new_string?: string } };
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  const toolName = input.tool_name ?? "Write";
  const filePath = input.tool_input?.file_path ?? input.tool_input?.path ?? "";
  if (!filePath) { process.exit(0); return; }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);

  // Skip processing for .wolf/ internal files to avoid slow self-referential updates.
  if (isWolfFile(absolutePath)) {
    process.exit(0);
    return;
  }

  // Never track .env files in anatomy — they contain secrets
  const baseName = path.basename(absolutePath);
  if (baseName === ".env" || baseName.startsWith(".env.")) { process.exit(0); return; }

  const oldStr = input.tool_input?.old_string ?? "";
  const newStr = input.tool_input?.new_string ?? "";

  // Out-of-project paths (scratchpad, /tmp, sibling repos) are not part of THIS
  // project's map. Skip anatomy, memory, and session tracking for them so the
  // local filesystem layout does not leak into shared .wolf/ artifacts (R3/R6).
  const relPathLocal = normalizePath(path.relative(projectRoot, absolutePath));
  if (relPathLocal.startsWith("../") || path.isAbsolute(relPathLocal)) {
    process.exit(0);
    return;
  }

  // 1. Update anatomy.md (recordAnatomyWrite also guards out-of-project paths).
  try {
    recordAnatomyWrite(wolfDir, absolutePath, projectRoot, input.tool_input?.content ?? "");
  } catch (err) {
    process.stderr.write(`OpenWolf post-write: anatomy update failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  // 2. Append richer entry to memory.md
  try {
    const action = toolName === "Write" ? "Created" : toolName === "MultiEdit" ? "Multi-edited" : "Edited";
    const fileContent = input.tool_input?.content ?? "";
    const ext = path.extname(absolutePath).toLowerCase();
    const type = CODE_EXTS.has(ext) ? "code" : PROSE_EXTS.has(ext) ? "prose" : "mixed";
    const writeTokens = estimateTokens(fileContent || newStr, type as "code" | "prose" | "mixed");

    let changeDesc = "";
    if (oldStr && newStr) {
      changeDesc = summarizeEdit(oldStr, newStr, baseName);
    }

    const memoryPath = path.join(wolfDir, "memory.md");
    const outcome = changeDesc || "—";
    appendMarkdown(memoryPath, `| ${timeShort()} | ${action} ${relPathLocal} | ${outcome} | ~${writeTokens} |\n`);
  } catch (err) {
    process.stderr.write(`OpenWolf post-write: memory append failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  // 3. Record in session tracker + track edit counts
  try {
    const action = toolName === "Write" ? "create" : "edit";
    const fileContent = input.tool_input?.content ?? "";
    const writeTokens = estimateTokens(fileContent || newStr, "code");

    let editKeyCount = 0;
    updateJSON<SessionData>(sessionFile, { files_written: [], edit_counts: {} } as SessionData, (session) => {
      if (!session.edit_counts) session.edit_counts = {};
      session.files_written.push({ file: relPathLocal, action, tokens: writeTokens, at: timestamp() });
      session.edit_counts[relPathLocal] = (session.edit_counts[relPathLocal] || 0) + 1;
      editKeyCount = session.edit_counts[relPathLocal];
      return session;
    });

    if (editKeyCount >= 3) {
      process.stderr.write(
        `⚠️ OpenWolf: ${baseName} has been edited ${editKeyCount} times this session. If you're fixing a bug, remember to log it to .wolf/buglog.ndjson.\n`
      );
    }
  } catch (err) {
    process.stderr.write(`OpenWolf post-write: session update failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  // 4. Auto-detect bug-fix patterns and log them
  try {
    if (oldStr && newStr) {
      autoDetectBugFix(wolfDir, absolutePath, projectRoot, oldStr, newStr);
    }
  } catch (err) {
    process.stderr.write(`OpenWolf post-write: bug detection failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  process.exit(0);
}

// ─── Edit Summarizer ─────────────────────────────────────────────

// Strip quoted strings and comments so substring heuristics do not fire on words
// like "catch" or "await" that happen to appear inside literals or prose (IN-01).
function stripStringsAndComments(code: string): string {
  return code
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/`([^`\\]|\\.)*`/g, "``")
    .replace(/\/\/.*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function summarizeEdit(oldStr: string, newStr: string, filename: string): string {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const ext = path.extname(filename).toLowerCase();
  const proseExts = new Set([".md", ".txt", ".rst"]);
  const oldClean = stripStringsAndComments(oldStr);
  const newClean = stripStringsAndComments(newStr);

  // --- Structural fixes (code only) ---
  if (!proseExts.has(ext)) {
    if (newClean.includes("try") && newClean.includes("catch") && !oldClean.includes("catch")) {
      return "added error handling";
    }
    if (newClean.includes("?.") && !oldClean.includes("?.")) return "added optional chaining";
    if (newClean.includes("?? ") && !oldClean.includes("?? ")) return "added nullish coalescing";
  }

  // --- Deleted code ---
  if (!newStr.trim() || newStr.trim().length < oldStr.trim().length * 0.2) {
    return `removed ${oldCount} lines`;
  }

  // --- Import changes ---
  const oldImports = oldLines.filter(l => /^\s*(import|require|use |from )/.test(l)).length;
  const newImports = newLines.filter(l => /^\s*(import|require|use |from )/.test(l)).length;
  if (newImports > oldImports && Math.abs(newCount - oldCount) <= newImports - oldImports + 1) {
    return `added ${newImports - oldImports} import(s)`;
  }

  // --- Value/string replacement (common bug fix: wrong value) ---
  if (oldCount === 1 && newCount === 1) {
    const o = oldStr.trim();
    const n = newStr.trim();
    // String literal change
    const oStr = o.match(/['"`]([^'"`]+)['"`]/);
    const nStr = n.match(/['"`]([^'"`]+)['"`]/);
    if (oStr && nStr && oStr[1] !== nStr[1]) {
      return `"${oStr[1].slice(0, 25)}" → "${nStr[1].slice(0, 25)}"`;
    }
    // Number change
    const oNum = o.match(/\b(\d+\.?\d*)\b/);
    const nNum = n.match(/\b(\d+\.?\d*)\b/);
    if (oNum && nNum && oNum[1] !== nNum[1] && o.replace(oNum[1], "") === n.replace(nNum[1], "")) {
      return `${oNum[1]} → ${nNum[1]}`;
    }
    return "inline fix";
  }

  // --- Method/function call changes ---
  const oldCalls = extractCalls(oldStr);
  const newCalls = extractCalls(newStr);
  const addedCalls = newCalls.filter(c => !oldCalls.includes(c));
  const removedCalls = oldCalls.filter(c => !newCalls.includes(c));
  if (removedCalls.length === 1 && addedCalls.length === 1) {
    return `${removedCalls[0]}() → ${addedCalls[0]}()`;
  }

  // --- CSS/style changes ---
  if (ext === ".css" || ext === ".scss" || ext === ".vue" || ext === ".tsx" || ext === ".jsx") {
    const oldProps = extractCSSProps(oldStr);
    const newProps = extractCSSProps(newStr);
    const changed = [...newProps.entries()].filter(([k, v]) => oldProps.get(k) !== v && oldProps.has(k));
    if (changed.length > 0 && changed.length <= 3) {
      return `CSS: ${changed.map(([k, v]) => `${k}: ${oldProps.get(k)} → ${v}`).join("; ")}`;
    }
  }

  // --- Condition changes ---
  const oldConds = (oldStr.match(/if\s*\(([^)]+)\)/g) || []);
  const newConds = (newStr.match(/if\s*\(([^)]+)\)/g) || []);
  if (newConds.length > oldConds.length) {
    return `added ${newConds.length - oldConds.length} condition(s)`;
  }

  // --- Function modified ---
  const fnMatch = newStr.match(/(?:function|def|fn|func|async\s+function)\s+(\w+)/);
  if (fnMatch) {
    return `modified ${fnMatch[1]}()`;
  }

  // --- Class/method context ---
  const methodMatch = newStr.match(/(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/);
  if (methodMatch) {
    return `modified ${methodMatch[1]}()`;
  }

  // --- Size-based fallback ---
  if (newCount > oldCount + 5) return `expanded (+${newCount - oldCount} lines)`;
  if (oldCount > newCount + 5) return `reduced (-${oldCount - newCount} lines)`;

  return `${oldCount}→${newCount} lines`;
}

function extractCalls(code: string): string[] {
  return [...new Set(
    (code.match(/(\w+)\s*\(/g) || [])
      .map(m => m.match(/(\w+)/)?.[1] || "")
      .filter(n => n.length > 2 && !["if", "for", "while", "switch", "catch", "function", "return", "new", "typeof", "instanceof", "const", "let", "var"].includes(n))
  )];
}

// ─── Auto Bug Detection ──────────────────────────────────────────

// Code-source extensions the fix-pattern heuristics understand. The detectors
// look for code constructs (try/catch, null guards, function signatures), so
// running them on prose/docs/config (e.g. .md, .json, .yaml) only produces
// false positives — guard against that.
//
// Intentionally NOT shared with the canonical CODE_EXTENSIONS in
// src/utils/extensions.ts (hooks compile standalone and cannot import
// src/utils/), and deliberately narrower than the `codeExts` token-
// classification sets earlier in this file: this gate must EXCLUDE data/config
// (.json/.yaml/.css) so doc edits don't log phantom bugs. Do not merge them.
const CODE_FILE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".rb", ".php",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".cs",
  ".swift", ".kt", ".scala", ".sh", ".bash",
  ".vue", ".svelte",
]);

// Exported for unit testing (tests/hooks/post-write.test.ts).
export function autoDetectBugFix(wolfDir: string, absolutePath: string, projectRoot: string, oldStr: string, newStr: string): void {
  const relFile = normalizePath(path.relative(projectRoot, absolutePath));
  if (relFile.startsWith("../") || path.isAbsolute(relFile)) return;
  const basename = path.basename(absolutePath);
  const ext = path.extname(basename).toLowerCase();

  // The fix-pattern heuristics are code-specific. Skip docs/data/config files
  // so prose edits (e.g. editing a .md) don't generate phantom bug entries.
  if (!CODE_FILE_EXTENSIONS.has(ext)) return;

  // Detect what kind of fix this is
  const detection = detectFixPattern(oldStr, newStr, ext, basename);
  if (!detection) return;

  // Append-only (Phase 1): each detected fix becomes a fresh NDJSON entry.
  const now = new Date().toISOString();
  appendBugEntry(wolfDir, {
    id: newBugId(),
    timestamp: now,
    error_message: detection.summary,
    file: relFile,
    root_cause: detection.rootCause,
    fix: detection.fix,
    tags: ["auto-detected", detection.category, ext.replace(".", "") || "unknown"],
    related_bugs: [],
    occurrences: 1,
    last_seen: now,
  });
}

interface FixDetection {
  category: string;
  summary: string;
  rootCause: string;
  fix: string;
  context?: string;
}

function detectFixPattern(oldStr: string, newStr: string, ext: string, filename: string): FixDetection | null {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const oldClean = stripStringsAndComments(oldStr);
  const newClean = stripStringsAndComments(newStr);

  // --- Error handling added ---
  if (newClean.includes("catch") && !oldClean.includes("catch")) {
    const fn =
      newStr.match(/(?:function|def)\s+(\w+)/)?.[1] ??
      newStr.match(/async\s+(?:function|def)\s+(\w+)/)?.[1] ??
      "unknown";
    return {
      category: "error-handling",
      summary: `Missing error handling in ${fn}`,
      rootCause: "Code path had no error handling — exceptions would propagate uncaught",
      fix: `Added try/catch block`,
      context: extractChangedLines(oldStr, newStr),
    };
  }

  // --- Null/undefined safety ---
  if ((newClean.includes("?.") && !oldClean.includes("?.")) ||
      (newClean.includes("?? ") && !oldClean.includes("?? ")) ||
      (/!==?\s*(null|undefined)/.test(newClean) && !/!==?\s*(null|undefined)/.test(oldClean))) {
    return {
      category: "null-safety",
      summary: `Null/undefined access in ${filename}`,
      rootCause: "Property access on potentially null/undefined value",
      fix: `Added null safety (optional chaining or null check)`,
      context: extractChangedLines(oldStr, newStr),
    };
  }

  // --- Guard clause / early return added ---
  if (/if\s*\([^)]*\)\s*(return|throw|continue|break)/.test(newClean) &&
      !/if\s*\([^)]*\)\s*(return|throw|continue|break)/.test(oldClean)) {
    const condition = newClean.match(/if\s*\(([^)]+)\)/)?.[1]?.trim().slice(0, 60) || "condition";
    return {
      category: "guard-clause",
      summary: `Missing guard clause`,
      rootCause: `No early return/throw for edge case: ${condition}`,
      fix: `Added guard clause: if (${condition.slice(0, 40)})`,
    };
  }

  // --- Wrong value / string fix (very common bug) ---
  if (oldLines.length <= 3 && newLines.length <= 3) {
    const oldJoined = oldStr.trim();
    const newJoined = newStr.trim();
    // String literal changed
    const oStrs = oldJoined.match(/['"`]([^'"`]{2,})['"`]/g) || [];
    const nStrs = newJoined.match(/['"`]([^'"`]{2,})['"`]/g) || [];
    if (oStrs.length > 0 && nStrs.length > 0) {
      for (let i = 0; i < Math.min(oStrs.length, nStrs.length); i++) {
        if (oStrs[i] !== nStrs[i]) {
          return {
            category: "wrong-value",
            summary: `Incorrect value in code`,
            rootCause: `Had ${oStrs[i].slice(0, 50)}`,
            fix: `Changed to ${nStrs[i].slice(0, 50)}`,
          };
        }
      }
    }

    // Variable name / method call changed
    const oldTokens = tokenizeCode(oldJoined);
    const newTokens = tokenizeCode(newJoined);
    const changed: Array<[string, string]> = [];
    for (let i = 0; i < Math.min(oldTokens.length, newTokens.length); i++) {
      if (oldTokens[i] !== newTokens[i]) {
        changed.push([oldTokens[i], newTokens[i]]);
      }
    }
    if (changed.length === 1 && changed[0][0].length > 2) {
      return {
        category: "wrong-reference",
        summary: `Wrong reference: ${changed[0][0]} should be ${changed[0][1]}`,
        rootCause: `Used "${changed[0][0]}" instead of "${changed[0][1]}"`,
        fix: `Changed ${changed[0][0]} → ${changed[0][1]}`,
      };
    }
  }

  // --- Logic fix (condition changed) ---
  const oldCond = oldClean.match(/if\s*\(([^)]+)\)/)?.[1];
  const newCond = newClean.match(/if\s*\(([^)]+)\)/)?.[1];
  if (oldCond && newCond && oldCond !== newCond && oldLines.length <= 5) {
    return {
      category: "logic-fix",
      summary: `Wrong condition in logic`,
      rootCause: `Condition was: if (${oldCond.slice(0, 50)})`,
      fix: `Changed to: if (${newCond.slice(0, 50)})`,
    };
  }

  // --- Operator fix (=== vs ==, > vs >=, etc.) ---
  const opChange = findOperatorChange(oldStr, newStr);
  if (opChange) {
    return {
      category: "operator-fix",
      summary: `Wrong operator: ${opChange.old} should be ${opChange.new}`,
      rootCause: `Used "${opChange.old}" instead of "${opChange.new}"`,
      fix: `Changed operator ${opChange.old} → ${opChange.new}`,
    };
  }

  // --- Missing import/require ---
  // Match the module string whether it follows a bare import, require(), or a
  // named/default/namespace ES module import such as `import { foo } from "bar"`.
  const importRe = /(?:import|require)\b[\s\S]*?['"]([^'"]+)['"]/g;
  const oldImports = new Set((oldStr.match(importRe) || []).map(m => m));
  const newImports = (newStr.match(importRe) || []);
  const addedImports = newImports.filter(i => !oldImports.has(i));
  if (addedImports.length > 0 && newLines.length - oldLines.length <= addedImports.length + 2) {
    const modules = addedImports.map(i => i.match(/['"]([^'"]+)['"]/)?.[1] || "").filter(Boolean);
    return {
      category: "missing-import",
      summary: `Missing import: ${modules.join(", ")}`,
      rootCause: `Module(s) not imported: ${modules.join(", ")}`,
      fix: `Added import(s) for ${modules.join(", ")}`,
    };
  }

  // --- Return value fix ---
  const oldReturn = oldStr.match(/return\s+(.+)/)?.[1]?.trim();
  const newReturn = newStr.match(/return\s+(.+)/)?.[1]?.trim();
  if (oldReturn && newReturn && oldReturn !== newReturn && oldLines.length <= 5) {
    return {
      category: "return-value",
      summary: `Wrong return value`,
      rootCause: `Was returning: ${oldReturn.slice(0, 50)}`,
      fix: `Now returns: ${newReturn.slice(0, 50)}`,
    };
  }

  // --- Async/await fix ---
  if (newClean.includes("await ") && !oldClean.includes("await ")) {
    return {
      category: "async-fix",
      summary: `Missing await`,
      rootCause: `Async call without await — returned Promise instead of value`,
      fix: `Added await to async call`,
      context: extractChangedLines(oldStr, newStr),
    };
  }
  if (newClean.includes("async ") && !oldClean.includes("async ")) {
    return {
      category: "async-fix",
      summary: `Function not marked async`,
      rootCause: `Function uses await but wasn't declared async`,
      fix: `Added async modifier`,
    };
  }

  // --- Type annotation/cast fix ---
  if (ext === ".ts" || ext === ".tsx") {
    if ((newClean.includes(" as ") && !oldClean.includes(" as ")) ||
        (newClean.includes(": ") && !oldClean.includes(": ") && oldLines.length <= 3)) {
      return {
        category: "type-fix",
        summary: `Type error`,
        rootCause: `Missing or incorrect type annotation`,
        fix: `Added type assertion/annotation`,
        context: extractChangedLines(oldStr, newStr),
      };
    }
  }

  // --- CSS/style fix ---
  if (ext === ".css" || ext === ".scss" || ext === ".vue" || ext === ".tsx" || ext === ".jsx") {
    const oldProps = extractCSSProps(oldStr);
    const newProps = extractCSSProps(newStr);
    const changedProps = [...newProps.entries()].filter(([k, v]) => oldProps.get(k) !== v && oldProps.has(k));
    if (changedProps.length > 0 && changedProps.length <= 3) {
      const desc = changedProps.map(([k, v]) => `${k}: ${oldProps.get(k)} → ${v}`).join("; ");
      return {
        category: "style-fix",
        summary: `CSS fix: ${changedProps.map(([k]) => k).join(", ")}`,
        rootCause: desc,
        fix: `Changed ${desc}`,
      };
    }
  }

  // --- Significant diff (catch-all for substantial edits) ---
  const diffRatio = Math.abs(newStr.length - oldStr.length) / Math.max(oldStr.length, 1);
  if (diffRatio > 0.3 && oldLines.length >= 3 && newLines.length >= 3) {
    // Only log if there's meaningful structural change, not just additions
    const removedLines = oldLines.filter(l => l.trim() && !newLines.some(nl => nl.trim() === l.trim()));
    if (removedLines.length >= 2) {
      return {
        category: "refactor",
        summary: `Significant refactor of ${filename}`,
        rootCause: `${removedLines.length} lines replaced/restructured`,
        fix: `Rewrote ${oldLines.length}→${newLines.length} lines (${removedLines.length} removed)`,
        context: removedLines.slice(0, 2).map(l => l.trim().slice(0, 50)).join("; "),
      };
    }
  }

  return null;
}

function extractChangedLines(oldStr: string, newStr: string): string {
  const oldLines = new Set(oldStr.split("\n").map(l => l.trim()).filter(Boolean));
  const newLines = newStr.split("\n").map(l => l.trim()).filter(Boolean);
  const added = newLines.filter(l => !oldLines.has(l));
  return added.slice(0, 2).map(l => l.slice(0, 60)).join("; ");
}

function tokenizeCode(code: string): string[] {
  return code.replace(/[^\w$]/g, " ").split(/\s+/).filter(t => t.length > 0);
}

function findOperatorChange(oldStr: string, newStr: string): { old: string; new: string } | null {
  const operators = ["===", "!==", "==", "!=", ">=", "<=", ">>", "<<", "&&", "||", "??"];
  const oldTokens = tokenizeOperators(oldStr);
  const newTokens = tokenizeOperators(newStr);
  for (const op of operators) {
    const oldCount = oldTokens.filter((t) => t === op).length;
    const newCount = newTokens.filter((t) => t === op).length;
    if (oldCount > newCount) {
      for (const op2 of operators) {
        if (op2 !== op) {
          const oldCount2 = oldTokens.filter((t) => t === op2).length;
          const newCount2 = newTokens.filter((t) => t === op2).length;
          if (newCount2 > oldCount2) return { old: op, new: op2 };
        }
      }
    }
  }
  return null;
}

function tokenizeOperators(code: string): string[] {
  // Match multi-character operators as whole tokens so `===` does not get counted
  // as a `==` substring and `!==` does not get counted as `!=`.
  const re = /===|!==|==|!=|>=|<=|>>|<<|&&|\|\||\?\?/g;
  return [...code.matchAll(re)].map((m) => m[0]);
}

function extractCSSProps(code: string): Map<string, string> {
  const props = new Map<string, string>();
  const matches = code.matchAll(/([\w-]+)\s*:\s*([^;}\n]+)/g);
  for (const m of matches) {
    props.set(m[1].trim(), m[2].trim());
  }
  return props;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`OpenWolf post-write: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
