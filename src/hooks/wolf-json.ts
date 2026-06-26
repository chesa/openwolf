import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { withFileLock } from "./wolf-lock.js";

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
 * are replaced wholesale (not merged). Uses structuredClone so that
 * default-only nested objects are deep-copied, not shared by reference.
 */
function deepMergeDefaults<T>(defaults: T, loaded: T): T {
  if (!isPlainObject(defaults) || !isPlainObject(loaded)) return loaded;
  const result: Record<string, unknown> = structuredClone(
    defaults
  ) as Record<string, unknown>;
  const skipped: string[] = [];
  for (const key of Object.keys(loaded as Record<string, unknown>)) {
    // Skip dangerous prototype keys to prevent prototype pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      skipped.push(key);
      continue;
    }
    const lv = (loaded as Record<string, unknown>)[key];
    const dv = (defaults as Record<string, unknown>)[key];
    if (isPlainObject(lv) && isPlainObject(dv)) {
      result[key] = deepMergeDefaults(dv, lv);
    } else {
      result[key] = lv;
    }
  }
  if (skipped.length > 0) {
    process.stderr.write(
      `[openwolf] ⚠️  deepMergeDefaults: Dropped potentially dangerous keys: ${skipped.join(", ")}\n`
    );
  }
  return result as T;
}

// Never calls withFileLock — safe to invoke inside an already-held lock
// (updateJSON relies on this to do a single locked read-modify-write).
export function readJSON<T = unknown>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    return deepMergeDefaults(fallback, parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(
        `OpenWolf: failed to read ${filePath} (${
          err instanceof Error ? err.message : String(err)
        })\n`
      );
    }
    return fallback;
  }
}

// Lock-free atomic write (temp file + rename). INTERNAL — every caller must
// already hold the file lock via withFileLock.
// EBUSY/EACCES/EPERM/EXDEV get a direct-write fallback: on Windows (EBUSY) and
// some network/cross-device filesystems (EXDEV) rename() fails even when the
// lock is held, so we fall back to overwriting in place rather than leaving a
// stale .tmp behind.
function _writeJSONUnsafe(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  const payload = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, payload, "utf-8");
    fs.renameSync(tmp, filePath);
    return;
  } catch (renameErr) {
    const code = (renameErr as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EACCES" && code !== "EPERM" && code !== "EXDEV") {
      try { fs.unlinkSync(tmp); } catch { /* tmp may not exist */ }
      throw renameErr;
    }
    try {
      fs.writeFileSync(filePath, payload, "utf-8");
    } catch (fallbackErr) {
      const orig = renameErr instanceof Error ? renameErr.message : String(renameErr);
      const after = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      process.stderr.write(
        `OpenWolf: failed to write ${filePath} (rename: ${orig}; fallback: ${after})\n`,
      );
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* tmp may not exist */ }
    }
  }
}

export function writeJSON(filePath: string, data: unknown): void {
  withFileLock(filePath, () => _writeJSONUnsafe(filePath, data));
}

// Read-modify-write under ONE lock. `mutate` gets the current value (or
// `fallback` if the file is absent/corrupt) and returns the value to persist.
export function updateJSON<T>(
  filePath: string,
  fallback: T,
  mutate: (cur: T) => T,
): void {
  withFileLock(filePath, () => {
    const cur = readJSON<T>(filePath, fallback);
    _writeJSONUnsafe(filePath, mutate(cur));
  });
}
