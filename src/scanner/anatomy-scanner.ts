import * as fs from "node:fs";
import * as path from "node:path";
import { extractDescription, capDescription } from "./description-extractor.js";
import { readJSON, writeText } from "../utils/fs-safe.js";
import { normalizePath } from "../utils/paths.js";
import {
  parseAnatomy,
  type AnatomyEntry,
  withFileLock,
  shouldExclude,
  DEFAULT_EXCLUDE_PATTERNS,
} from "../hooks/shared.js";
import { CODE_EXTENSIONS, PROSE_EXTENSIONS } from "../utils/extensions.js";
// `ignore` powers the opt-in respect_gitignore feature. It is a CLI/daemon-only
// dependency: this module (src/scanner) must NEVER be imported by a hook
// (src/hooks compiles standalone with no node_modules), or this require would
// fail at runtime — the same failure class as the WOLF_ROOT MODULE_NOT_FOUND bug.
import ignore, { type Ignore } from "ignore";

interface WolfConfig {
  version?: number;
  openwolf?: {
    anatomy?: {
      max_description_length?: number;
      max_files?: number;
      exclude_patterns?: string[];
      respect_gitignore?: boolean;
    };
    token_audit?: {
      chars_per_token_code?: number;
      chars_per_token_prose?: number;
    };
  };
}

const DEFAULT_MAX_FILES = 500;

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".mp3", ".mp4", ".avi", ".mov", ".webm", ".ogg",
  ".sqlite", ".db",
  ".wasm",
  ".lock",
]);

function estimateTokens(text: string, filePath: string): number {
  const ext = path.extname(filePath).toLowerCase();
  let ratio = 3.75;
  if (CODE_EXTENSIONS.has(ext)) ratio = 3.5;
  if (PROSE_EXTENSIONS.has(ext)) ratio = 4.0;
  return Math.ceil(text.length / ratio);
}

// Load the project-root .gitignore into an `ignore` matcher when the opt-in
// respect_gitignore feature is enabled. Returns null when disabled, or when no
// .gitignore is present/readable (nothing extra to exclude). Only the root
// .gitignore is consulted — nested .gitignore files and global excludes are out
// of scope.
function loadGitignoreMatcher(projectRoot: string, respect: boolean): Ignore | null {
  if (!respect) return null;
  try {
    const content = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8");
    return ignore().add(content);
  } catch {
    return null;
  }
}

function walkDir(
  dir: string,
  rootDir: string,
  excludePatterns: string[],
  maxFiles: number,
  entries: Map<string, AnatomyEntry[]>,
  ig: Ignore | null
): void {
  let totalFiles = 0;
  for (const [, list] of entries) totalFiles += list.length;
  if (totalFiles >= maxFiles) return;

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = normalizePath(path.relative(rootDir, fullPath));

    if (shouldExclude(relPath, excludePatterns)) continue;
    // Opt-in: also honor the project's .gitignore (prunes dirs + skips files).
    if (ig && relPath && ig.ignores(relPath)) continue;

    if (item.isDirectory()) {
      walkDir(fullPath, rootDir, excludePatterns, maxFiles, entries, ig);
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Skip files > 1MB
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024) continue;
      } catch {
        continue;
      }

      // Read file for token estimation
      let content: string;
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      const desc = capDescription(extractDescription(fullPath));
      const tokens = estimateTokens(content, fullPath);
      const section = normalizePath(path.relative(rootDir, dir)) || ".";
      const sectionKey = section === "." ? "./" : section + "/";

      if (!entries.has(sectionKey)) {
        entries.set(sectionKey, []);
      }

      entries.get(sectionKey)!.push({
        file: item.name,
        description: desc,
        tokens,
      });

      totalFiles++;
      if (totalFiles >= maxFiles) return;
    }
  }
}

export function serializeAnatomy(
  sections: Map<string, AnatomyEntry[]>,
  metadata: { lastScanned: string; fileCount: number; hits: number; misses: number }
): string {
  const lines: string[] = [
    "# anatomy.md",
    "",
    `> Auto-maintained by OpenWolf. Last scanned: ${metadata.lastScanned}`,
    `> Files: ${metadata.fileCount} tracked | Anatomy hits: ${metadata.hits} | Misses: ${metadata.misses}`,
    "",
  ];

  const sortedKeys = [...sections.keys()].sort();

  for (const key of sortedKeys) {
    lines.push(`## ${key}`);
    lines.push("");
    const entries = sections.get(key)!;
    entries.sort((a, b) => a.file.localeCompare(b.file));
    for (const entry of entries) {
      const desc = entry.description ? ` — ${entry.description}` : "";
      lines.push(`- \`${entry.file}\`${desc} (~${entry.tokens} tok)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Scan the project and return the anatomy content and file count WITHOUT writing to disk.
 */
export function buildAnatomy(wolfDir: string, projectRoot: string): { content: string; fileCount: number } {
  const configPath = path.join(wolfDir, "config.json");
  const config = readJSON<WolfConfig>(configPath, {
    version: 1,
    openwolf: {
      anatomy: {
        max_description_length: 100,
        max_files: DEFAULT_MAX_FILES,
        exclude_patterns: DEFAULT_EXCLUDE_PATTERNS,
      },
      token_audit: { chars_per_token_code: 3.5, chars_per_token_prose: 4.0 },
    },
  });

  const rawPatterns = config.openwolf?.anatomy?.exclude_patterns;
  const excludePatterns =
    Array.isArray(rawPatterns) && rawPatterns.every((p) => typeof p === "string")
      ? rawPatterns
      : DEFAULT_EXCLUDE_PATTERNS;

  const ig = loadGitignoreMatcher(
    projectRoot,
    config.openwolf?.anatomy?.respect_gitignore ?? false
  );

  const entries = new Map<string, AnatomyEntry[]>();
  walkDir(
    projectRoot,
    projectRoot,
    excludePatterns,
    config.openwolf?.anatomy?.max_files ?? DEFAULT_MAX_FILES,
    entries,
    ig
  );

  let fileCount = 0;
  for (const [, list] of entries) fileCount += list.length;

  const serialized = serializeAnatomy(entries, {
    lastScanned: new Date().toISOString(),
    fileCount,
    hits: 0,
    misses: 0,
  });

  return { content: serialized, fileCount };
}

export function scanProject(wolfDir: string, projectRoot: string): number {
  const { content, fileCount } = buildAnatomy(wolfDir, projectRoot);
  const anatomyPath = path.join(wolfDir, "anatomy.md");
  writeText(anatomyPath, content);
  return fileCount;
}

export function updateAnatomyEntry(
  wolfDir: string,
  filePath: string,
  projectRoot: string,
  action: "upsert" | "delete"
): void {
  const relPath = normalizePath(path.relative(projectRoot, filePath));
  if (relPath.startsWith("../") || path.isAbsolute(relPath)) return;

  const anatomyPath = path.join(wolfDir, "anatomy.md");
  withFileLock(anatomyPath, () => {
    let content: string;
    try {
      content = fs.readFileSync(anatomyPath, "utf-8");
    } catch {
      content = "# anatomy.md\n\n> Auto-maintained by OpenWolf.\n";
    }

    const sections = parseAnatomy(content);
    const dir = path.dirname(relPath);
    const fileName = path.basename(relPath);
    const sectionKey = dir === "." ? "./" : dir + "/";

    if (action === "delete") {
      const entries = sections.get(sectionKey);
      if (entries) {
        const idx = entries.findIndex((e) => e.file === fileName);
        if (idx !== -1) entries.splice(idx, 1);
        if (entries.length === 0) sections.delete(sectionKey);
      }
    } else {
      // upsert
      let fileContent: string;
      try {
        fileContent = fs.readFileSync(filePath, "utf-8");
      } catch {
        return;
      }

      const desc = capDescription(extractDescription(filePath));
      const tokens = estimateTokens(fileContent, filePath);
      const entry: AnatomyEntry = { file: fileName, description: desc, tokens };

      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, []);
      }
      const entries = sections.get(sectionKey)!;
      const idx = entries.findIndex((e) => e.file === fileName);
      if (idx !== -1) {
        entries[idx] = entry;
      } else {
        entries.push(entry);
      }
    }

    let fileCount = 0;
    for (const [, list] of sections) fileCount += list.length;

    const serialized = serializeAnatomy(sections, {
      lastScanned: new Date().toISOString(),
      fileCount,
      hits: 0,
      misses: 0,
    });

    writeText(anatomyPath, serialized);
  });
}
