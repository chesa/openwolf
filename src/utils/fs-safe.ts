import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Logger } from "./logger.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Recursively fills missing keys in `loaded` from `defaults`.
 * Loaded values always win; defaults only fill gaps. Arrays and scalars
 * are replaced wholesale (not merged).
 */
function deepMergeDefaults<T>(defaults: T, loaded: T): T {
  if (!isPlainObject(defaults) || !isPlainObject(loaded)) return loaded;
  const result: Record<string, unknown> = structuredClone(
    defaults
  ) as Record<string, unknown>;
  for (const key of Object.keys(loaded as Record<string, unknown>)) {
    const lv = (loaded as Record<string, unknown>)[key];
    const dv = (defaults as Record<string, unknown>)[key];
    if (isPlainObject(lv) && isPlainObject(dv)) {
      result[key] = deepMergeDefaults(dv, lv);
    } else {
      result[key] = lv;
    }
  }
  return result as T;
}

/**
 * Reads JSON from `filePath`. If the file exists and parses, its values are
 * deep-merged over `fallback` so that missing nested keys fall back to the
 * provided defaults (loaded values always win). If the file is missing,
 * `fallback` is returned silently. If the file exists but cannot be read
 * (permission error, I/O error) or is malformed JSON, a warning is written
 * to stderr and `fallback` is returned so the caller can continue.
 *
 * This prevents `TypeError: Cannot read properties of undefined` when a
 * user's config file predates a section a newer release reads.
 */
export function readJSON<T = unknown>(filePath: string, fallback: T): T {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Permission denied, I/O error, etc. — the file exists but can't be read.
      // Log so users know their config/data file is inaccessible.
      process.stderr.write(
        `[openwolf] readJSON: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as T;
    return deepMergeDefaults(fallback, parsed);
  } catch (err) {
    // Malformed JSON — always log so users know their file is broken.
    process.stderr.write(
      `[openwolf] readJSON: failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return fallback;
  }
}

export function writeJSON(filePath: string, data: unknown, logger?: Logger): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // On Windows, rename can fail if another process holds a handle.
    // Fall back to direct write and clean up the tmp file.
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (writeErr) {
      logger?.error(`Failed to write JSON file: ${filePath}. Error: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
      throw writeErr;
    }
    try {
      fs.unlinkSync(tmp);
    } catch (unlinkErr) {
      logger?.warn(`Failed to clean up temp file: ${tmp}. Error: ${unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)}`);
    }
  }
}

export function readText(filePath: string, fallback: string = ""): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Permission denied, I/O error, etc. — the file exists but can't be read.
      // Log so users know their data file is inaccessible, matching readJSON behavior.
      process.stderr.write(
        `[openwolf] readText: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    return fallback;
  }
}

export function writeText(filePath: string, content: string, logger?: Logger): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // On Windows, rename can fail if another process holds a handle.
    // Fall back to direct write and clean up the tmp file.
    try {
      fs.writeFileSync(filePath, content, "utf-8");
    } catch (writeErr) {
      logger?.error(`Failed to write text file: ${filePath}. Error: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
      throw writeErr;
    }
    try {
      fs.unlinkSync(tmp);
    } catch (unlinkErr) {
      logger?.warn(`Failed to clean up temp file: ${tmp}. Error: ${unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)}`);
    }
  }
}

export function appendText(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, content, "utf-8");
}

// Drop-in replacement for fs.copyFileSync, with two differences:
// 1. Uses plain read+write to bypass copy_file_range (EFS/WSL2 EPERM workaround):
//    fs.copyFileSync uses the copy_file_range syscall on Linux, which fails with
//    EPERM when writing to EFS-encrypted directories on Windows volumes mounted
//    via WSL2 9P. Plain read+write bypasses copy_file_range and works in all cases.
// 2. Silently creates the destination directory if it doesn't exist.
export function safeCopyFile(src: string, dest: string): void {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Use temp+rename for atomicity (matches writeJSON/writeText pattern in this file).
  // readFileSync without encoding returns a Buffer — correct for binary files.
  const tmp = dest + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(tmp, fs.readFileSync(src));
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (unlinkErr) {
      // Temp file cleanup failed — log so the user knows a .tmp file was leaked.
      // This can happen on EACCES or if the write itself never created the file.
      process.stderr.write(
        `[openwolf] safeCopyFile: failed to clean up temp file ${tmp}: ${unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)}\n`
      );
    }
    throw err;
  }
  try {
    fs.chmodSync(dest, fs.statSync(src).mode);
  } catch (chmodErr) {
    const code = (chmodErr as NodeJS.ErrnoException).code;
    // EPERM/ENOTSUP: expected on Windows and WSL2 9P mounts — non-fatal, skip silently.
    // Any other error (ENOENT on src statSync, ENOSPC, etc.) is unexpected — log it.
    if (code !== "EPERM" && code !== "ENOTSUP") {
      process.stderr.write(
        `[openwolf] safeCopyFile: chmod failed for ${dest}: ${chmodErr instanceof Error ? chmodErr.message : String(chmodErr)}\n`
      );
    }
  }
}
