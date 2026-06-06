import * as fs from "node:fs";

const LOCK_TTL_MS = parseInt(process.env.WITH_FILE_LOCK_TTL_MS || "30000", 10);
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 50;

/**
 * Acquires an advisory lock on `lockPath` using O_CREAT | O_EXCL.
 * The lock file is a zero-byte sentinel; only its existence and mtime matter.
 *
 * Retries up to `MAX_RETRIES` times with `RETRY_DELAY_MS` backoff between
 * attempts. If the lock file exists but its mtime is older than `LOCK_TTL_MS`,
 * it is considered stale and deleted before retrying.
 *
 * @returns the file descriptor on success, or `null` if all retries are exhausted.
 */
export function acquireLock(lockPath: string): number | null {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Check staleness — another process may have crashed without cleanup.
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_TTL_MS) {
          fs.unlinkSync(lockPath);
          continue; // stale lock removed; retry acquisition
        }
      } catch {
        // Staleness-check race (lock deleted by another process between stat and
        // unlink). Continue the retry loop — acquisition may succeed next iteration.
      }

      // Non-stale lock or check failure: backoff before retrying.
      if (i < MAX_RETRIES - 1) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
      }
    }
  }
  return null;
}

/**
 * Releases a lock previously acquired by `acquireLock`.
 * Closes the file descriptor and deletes the lock file.
 * Never throws — cleanup is best-effort.
 */
export function releaseLock(fd: number, lockPath: string): void {
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore close errors */
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore unlink errors */
  }
}

/**
 * Wraps a synchronous function `fn` with advisory per-file locking.
 *
 * Acquires a lock on `filePath + ".lock"` before calling `fn`, and releases
 * the lock in a `finally` block so it is freed even if `fn()` throws.
 *
 * @throws `Error` if the lock cannot be acquired after `MAX_RETRIES` retries.
 */
export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = filePath + ".lock";
  const fd = acquireLock(lockPath);
  if (fd === null) {
    throw new Error(
      `Could not acquire lock for ${filePath} after ${MAX_RETRIES} retries`,
    );
  }
  try {
    return fn();
  } finally {
    releaseLock(fd, lockPath);
  }
}
