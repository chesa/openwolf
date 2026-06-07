import * as fs from "node:fs";

const LOCK_TTL_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

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
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
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
      `OpenWolf: could not acquire lock for ${filePath}, proceeding unlocked\n`
    );
    return fn();
  }
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}
