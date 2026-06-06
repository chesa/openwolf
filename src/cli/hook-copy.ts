import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { safeCopyFile } from "../utils/fs-safe.js";
import { ensureDir } from "../utils/paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the compiled hooks source directory from 4 candidates relative to
 * __dirname (dist/cli/). Returns the first match that exists and contains
 * shared.js, or null if none found.
 */
export function findHookSourceDir(): string | null {
  const candidates = [
    path.resolve(__dirname, "../hooks"),
    path.resolve(__dirname, "../../dist/hooks"),
    path.resolve(__dirname, "..", "..", "hooks"),
    path.resolve(__dirname, "..", "hooks"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "shared.js"))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Dynamically discover all `.js` files in a directory.
 * Replaces the static HOOK_FILES iteration with a live directory scan.
 */
export function getHookFileNames(sourceDir: string): string[] {
  return fs.readdirSync(sourceDir)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

/**
 * Copy all hook `.js` files from sourceDir to destDir using safeCopyFile.
 * Returns the count of successfully copied files.
 */
export function copyHookFiles(sourceDir: string, destDir: string): number {
  ensureDir(destDir);

  const files = getHookFileNames(sourceDir);
  let copiedCount = 0;

  for (const file of files) {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);
    if (fs.existsSync(srcPath)) {
      safeCopyFile(srcPath, destPath);
      copiedCount++;
    }
  }

  return copiedCount;
}

/**
 * Write a minimal ESM package.json to the hooks directory so that
 * `.js` hook scripts work in CJS projects.
 */
export function writeHooksPackageJson(hooksDir: string): void {
  fs.writeFileSync(
    path.join(hooksDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2) + "\n",
    "utf-8",
  );
}
