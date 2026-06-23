/**
 * Cross-process end-to-end concurrency test — the headline proof that
 * Phase 1's append-only buglog and lock-protected read-modify-write actually
 * survive REAL concurrent OS processes.
 *
 * The existing in-process tests cannot demonstrate this: single-threaded JS
 * serializes synchronous fs I/O, so two "concurrent" calls in one process
 * never truly overlap. Here we spawn N independent `node` child processes that
 * each import the COMPILED dist module and perform ONE operation against a
 * SHARED temp dir, then exit — so they genuinely race in separate OS processes.
 *
 * We drive the compiled `dist/hooks/*.js` modules directly (plain Node ESM)
 * rather than crafting hook stdin payloads, which would be far more fragile.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root = two levels up from this test file (tests/ -> repo root).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Absolute paths to the compiled hook modules under test.
const BUGLOG_MODULE = path.join(REPO_ROOT, "dist", "hooks", "buglog-ndjson.js");
const WOLF_JSON_MODULE = path.join(REPO_ROOT, "dist", "hooks", "wolf-json.js");

// Generous timeout: a hooks-only build + dozens of child spawns. The ledger
// case in particular can take a moment if the advisory lock makes writers wait.
const SUITE_TIMEOUT_MS = 120_000;

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openwolf-e2e-"));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Spawn one `node --input-type=module -e "<code>"` child process and resolve
 * when it exits 0 (reject otherwise). The child runs in its own OS process,
 * so N of these genuinely race.
 */
function runChild(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`child exited ${exitCode}: ${stderr}`));
    });
  });
}

describe("cross-process concurrency (real child processes)", () => {
  beforeAll(() => {
    // The test is self-sufficient: compile just the hooks unit (fast) so the
    // dist modules we import below are current. `pnpm build:hooks` ==
    // `tsc -p tsconfig.hooks.json`.
    execSync("pnpm build:hooks", { cwd: REPO_ROOT, stdio: "inherit" });
    expect(fs.existsSync(BUGLOG_MODULE)).toBe(true);
    expect(fs.existsSync(WOLF_JSON_MODULE)).toBe(true);
  }, SUITE_TIMEOUT_MS);

  afterAll(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  // -------------------------------------------------------------------------
  // Case 1: Buglog append — the conflict-free guarantee.
  //
  // appendBugEntry uses a single fs.appendFileSync per entry (no lock). On
  // POSIX, an O_APPEND write of a small line is atomic with respect to other
  // appenders, so N concurrent processes each appending ONE distinct entry
  // must yield EXACTLY N lines with ZERO loss and ZERO interleaving. This is
  // the robust path and should be rock-solid even at high N.
  // -------------------------------------------------------------------------
  it(
    "20 concurrent appenders -> exactly 20 lines, all parse, 20 distinct ids",
    async () => {
      const N = 20;
      const wolfDir = makeTmpDir();
      const moduleUrl = JSON.stringify(BUGLOG_MODULE);
      const dirLit = JSON.stringify(wolfDir);

      const children = Array.from({ length: N }, (_, i) =>
        runChild(`
          import { appendBugEntry, newBugId } from ${moduleUrl};
          const id = newBugId();
          appendBugEntry(${dirLit}, {
            id,
            timestamp: new Date().toISOString(),
            error_message: "concurrent append #${i}",
            file: "tests/e2e-concurrency.test.ts",
            root_cause: "test",
            fix: "test",
            tags: ["e2e", "child-${i}"],
            related_bugs: [],
            occurrences: 1,
            last_seen: new Date().toISOString(),
          });
        `)
      );

      // Await all — they were all spawned before any resolved, so they raced.
      await Promise.all(children);

      const raw = fs.readFileSync(path.join(wolfDir, "buglog.ndjson"), "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);

      // Exactly N non-blank lines: no loss, no torn/interleaved writes.
      expect(lines).toHaveLength(N);

      // Every line parses as JSON, and we recover N DISTINCT ids.
      const ids = new Set<string>();
      for (const line of lines) {
        const entry = JSON.parse(line) as { id: string };
        ids.add(entry.id);
      }
      expect(ids.size).toBe(N);
    },
    SUITE_TIMEOUT_MS
  );

  // -------------------------------------------------------------------------
  // Case 2: Ledger read-modify-write — the lock-protected guarantee.
  //
  // updateJSON does read -> mutate -> atomic write, all under ONE withFileLock.
  // N concurrent processes each increment total_sessions by 1 against the SAME
  // token-ledger.json. With the lock holding, the final count is exactly N.
  //
  // IMPORTANT — best-effort nuance: withFileLock has a FINITE retry budget
  // (MAX_RETRIES jittered attempts) and then falls back to an UNLOCKED write
  // with a stderr warning. Under EXTREME contention two writers could both
  // fall through, read the same value, and clobber each other — so the count
  // can under-shoot N. We therefore choose N modest (8) so the lock reliably
  // holds and the test is DETERMINISTICALLY green. The truly conflict-free
  // path is the append-only buglog above (Case 1); this case demonstrates that
  // the lock correctly serializes a real RMW at realistic contention, not that
  // the advisory lock is unbreakable under pathological load.
  // -------------------------------------------------------------------------
  it(
    "8 concurrent RMW incrementers -> total_sessions === 8 (lock serializes)",
    async () => {
      const N = 8;
      const wolfDir = makeTmpDir();
      const ledgerPath = path.join(wolfDir, "token-ledger.json");
      const moduleUrl = JSON.stringify(WOLF_JSON_MODULE);
      const ledgerLit = JSON.stringify(ledgerPath);

      const children = Array.from({ length: N }, () =>
        runChild(`
          import { updateJSON } from ${moduleUrl};
          updateJSON(
            ${ledgerLit},
            { lifetime: { total_sessions: 0 } },
            (l) => { l.lifetime.total_sessions++; return l; }
          );
        `)
      );

      await Promise.all(children);

      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) as {
        lifetime: { total_sessions: number };
      };
      expect(ledger.lifetime.total_sessions).toBe(N);
    },
    SUITE_TIMEOUT_MS
  );
});
