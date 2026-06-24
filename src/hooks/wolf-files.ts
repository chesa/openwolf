import * as fs from "node:fs";
import * as path from "node:path";
import { getSessionDir, getWolfDir, getWorktreeContext, normalizePath } from "./wolf-paths.js";
import { writeJSON } from "./wolf-json.js";

export function ensureSessionDir(): void {
  const ctx = getWorktreeContext();
  if (!ctx.isWorktree) return;
  const sessionDir = getSessionDir();
  // Throw on mkdir failure rather than logging-and-returning. The caller
  // (each hook's main()) already has a top-level catch that logs + exits 0;
  // throwing puts a single, accurate error there instead of a cascade.
  fs.mkdirSync(sessionDir, { recursive: true });
  const metaPath = path.join(sessionDir, "worktree.json");
  if (!fs.existsSync(metaPath)) {
    writeJSON(metaPath, {
      worktreePath: ctx.worktreePath,
      branch: ctx.branch,
      mainRepo: ctx.mainRepoRoot,
      created: new Date().toISOString(),
    });
  }
}

/**
 * Bail out silently if .wolf/ directory doesn't exist in the current project.
 * Call this at the top of every hook to avoid crashes in non-OpenWolf projects.
 */
export function ensureWolfDir(): void {
  const wolfDir = getWolfDir();
  if (!fs.existsSync(wolfDir)) {
    const envDir = process.env.OPENWOLF_METADATA_DIR;
    if (envDir && envDir.trim().length > 0) {
      fs.mkdirSync(wolfDir, { recursive: true });
    } else {
      process.exit(0);
    }
  }
}

export function isWolfFile(filePath: string): boolean {
  const wolfDir = getWolfDir();
  const normalizedFile = normalizePath(filePath);
  const normalizedWolfDir = normalizePath(wolfDir);
  const projectDir = normalizePath(
    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  );

  const relToProject = normalizedFile.startsWith(projectDir)
    ? normalizedFile.slice(projectDir.length).replace(/^\//, "")
    : "";

  if (
    relToProject.startsWith(".wolf/") ||
    relToProject.startsWith(".wolf\\")
  )
    return true;
  if (
    normalizedFile.startsWith(normalizedWolfDir + "/") ||
    normalizedFile.startsWith(normalizedWolfDir + "\\") ||
    normalizedFile === normalizedWolfDir
  )
    return true;

  return false;
}

export function readMarkdown(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Permission denied, I/O error, etc. — ENOENT (file not yet created)
      // is expected and silent, but other errors indicate a real problem.
      process.stderr.write(
        `OpenWolf: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return "";
  }
}

export function appendMarkdown(filePath: string, line: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, line, "utf-8");
}

export function appendProposal(target: "cerebrum" | "anatomy", content: string): void {
  const sessionDir = getSessionDir();
  const proposalPath = path.join(sessionDir, "proposed-learnings.md");
  const dir = path.dirname(proposalPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const entry = `\n## ${new Date().toISOString()} → ${target}\n\n${content.trim()}\n`;
  fs.appendFileSync(proposalPath, entry, "utf-8");
}
