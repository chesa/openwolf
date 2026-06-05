import * as path from "node:path";
import * as fs from "node:fs";

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function getWolfDir(from?: string): string {
  const base = from ?? process.cwd();
  return path.join(base, ".wolf");
}

export function resolveWolfFile(file: string, from?: string): string {
  // Reject absolute paths and leading separators to prevent accidental root escape
  if (path.isAbsolute(file) || file.startsWith("/") || file.startsWith("\\")) {
    throw new Error(`Absolute paths not allowed in resolveWolfFile: ${file}`);
  }
  const wolfDir = getWolfDir(from);
  const resolved = path.resolve(path.join(wolfDir, file));
  const resolvedWolfDir = path.resolve(wolfDir);
  // Verify resolved path is contained within .wolf/ directory (prevent path traversal)
  if (!resolved.startsWith(resolvedWolfDir + path.sep) && resolved !== resolvedWolfDir) {
    throw new Error(`Path traversal detected: ${file} resolves outside .wolf/ directory`);
  }
  return resolved;
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function relativeToCwd(filePath: string, cwd?: string): string {
  const base = cwd ?? process.cwd();
  const rel = path.relative(base, filePath);
  return normalizePath(rel);
}
