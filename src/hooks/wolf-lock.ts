import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_TTL_MS = 10_000;
const MAX_RETRIES = 5;

// TOCTOU staleness-storm bound (spec A3): under a staleness storm where
// multiple writers simultaneously detect a stale lock and race to unlink+rewrite,
// at most one writer wins the wx-exclusive create per embedded retry cycle.
// The entire operation is bounded by MAX_RETRIES × (LOCK_TTL_MS + max jitter),
// i.e. 5 × (10 000 ms + 150 ms) ≈ 50.75 s worst-case before falling through
// to an unlocked write with a stderr warning.
const BASE_RETRY_DELAY_MS = 80;
const RETRY_JITTER_MS = 70; // max added jitter per attempt

function sleepJittered(attempt: number): void {
  const delay = BASE_RETRY_DELAY_MS + Math.floor(Math.random() * RETRY_JITTER_MS);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
}

function acquireLock(lockPath: string): boolean {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(lockPath, process.pid + "\n" + Date.now(), { flag: "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    try {
      const contents = fs.readFileSync(lockPath, "utf-8");
      const lines = contents.trim().split("\n");
      const lockTime = parseInt(lines[lines.length - 1], 10);
      if (!isNaN(lockTime) && Date.now() - lockTime > LOCK_TTL_MS) {
        fs.unlinkSync(lockPath);
        try {
          fs.writeFileSync(lockPath, process.pid + "\n" + Date.now(), { flag: "wx" });
          return true;
        } catch {
          // Another process grabbed the lock between unlink and write
        }
      }
    } catch {
      // Staleness-check race: lock deleted between read and unlink
    }

    if (attempt < MAX_RETRIES - 1) {
      sleepJittered(attempt);
    }
  }
  return false;
}

function releaseLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore unlink errors — file may already be gone */
  }
}

export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = filePath + ".lock";
  if (!acquireLock(lockPath)) {
    process.stderr.write(
      `OpenWolf: could not acquire lock for ${path.basename(filePath)} after ${MAX_RETRIES} attempts, proceeding unlocked\n`,
    );
    return fn();
  }
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}
