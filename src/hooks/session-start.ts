import * as fs from "node:fs";
import * as path from "node:path";
import { getWolfDir, ensureWolfDir, getSessionDir, ensureSessionDir, getWorktreeContext, writeJSON, appendMarkdown, updateJSON, timestamp, timeShort, countBugEntries } from "./shared.js";
import { selfHealAnatomy } from "./wolf-selfheal.js";

async function main(): Promise<void> {
  ensureWolfDir();
  ensureSessionDir();
  const wolfDir = getWolfDir();
  const sessionDir = getSessionDir();

  const wtCtx = getWorktreeContext();
  if (wtCtx.isWorktree) {
    process.stderr.write(
      `🐺 OpenWolf: Worktree mode (${wtCtx.branch || wtCtx.worktreeId}) — sharing knowledge from ${wtCtx.mainRepoRoot}\n`
    );
  }

  // Clean up stale .tmp files left from failed atomic writes
  const dirsToClean = [wolfDir];
  if (sessionDir !== wolfDir) dirsToClean.push(sessionDir);
  for (const dir of dirsToClean) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith(".tmp")) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
    } catch (dirErr) {
      if ((dirErr as NodeJS.ErrnoException).code !== "ENOENT") {
        process.stderr.write(`OpenWolf: failed to clean tmp files in ${dir} (${(dirErr as Error).message})\n`);
      }
    }
  }
  const sessionFile = path.join(sessionDir, "_session.json");
  const now = new Date();
  const sessionId = `session-${now.toISOString().slice(0, 10)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}-${String(now.getMilliseconds()).padStart(3, "0")}`;

  // Create fresh session state
  writeJSON(sessionFile, {
    session_id: sessionId,
    started: timestamp(),
    files_read: {},
    files_written: [],
    edit_counts: {},
    anatomy_hits: 0,
    anatomy_misses: 0,
    repeated_reads_warned: 0,
    cerebrum_warnings: 0,
    stop_count: 0,
  });

  // Append session header to shared memory.md (not session-scoped) so hooks and
  // Claude write to the same file. Session-specific state lives in _session.json.
  const memoryPath = path.join(wolfDir, "memory.md");
  const header = `
## Session: ${now.toISOString().slice(0, 10)} ${timeShort()}

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
`;
  appendMarkdown(memoryPath, header);

  // Surface optional execution_layer hint from config.json (D11-07)
  // C2: hooks cannot import from src/utils/ — use raw fs.readFileSync + JSON.parse
  try {
    const configPath = path.join(wolfDir, "config.json");
    const configText = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configText) as {
      openwolf?: { execution_layer?: string | null };
    };
    const hint = config.openwolf?.execution_layer ?? null;
    if (hint) {
      process.stderr.write(
        `OpenWolf: execution layer = ${hint} — read its plan/status first.\n`
      );
    }
  } catch {
    // config.json missing or unparseable — silently skip (hint is optional)
  }

  // Check cerebrum freshness — remind Claude to learn
  try {
    const cerebrumPath = path.join(wolfDir, "cerebrum.md");
    const cerebrumContent = fs.readFileSync(cerebrumPath, "utf-8");
    const stat = fs.statSync(cerebrumPath);
    const daysSinceUpdate = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);

    // Count actual entries (non-comment, non-empty lines in content sections)
    const entryLines = cerebrumContent.split("\n").filter(l => {
      const t = l.trim();
      return t.startsWith("- ") || t.startsWith("* ") || (t.startsWith("[") && t.includes("]"));
    });

    if (entryLines.length < 3) {
      process.stderr.write(
        `💡 OpenWolf: cerebrum.md has only ${entryLines.length} entries. Learn from this session — record user preferences, project conventions, and mistakes to .wolf/cerebrum.md.\n`
      );
    } else if (daysSinceUpdate > 3) {
      process.stderr.write(
        `💡 OpenWolf: cerebrum.md hasn't been updated in ${Math.floor(daysSinceUpdate)} days. Look for opportunities to add learnings this session.\n`
      );
    }
  } catch (err) {
    process.stderr.write(`OpenWolf: cerebrum freshness check failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  // Check buglog — remind if empty
  try {
    if (countBugEntries(wolfDir) === 0) {
      process.stderr.write(
        `📋 OpenWolf: buglog.ndjson is empty. If you encounter or fix any bugs, errors, or failed tests this session, log them to .wolf/buglog.ndjson.\n`
      );
    }
  } catch (err) {
    process.stderr.write(`OpenWolf: buglog check failed (${err instanceof Error ? err.message : String(err)})\n`);
  }

  // Self-heal anatomy.md when missing/stub (e.g. a fresh clone — anatomy is now
  // a gitignored, regenerated artifact). Best-effort background rescan. Use the
  // detected project root as cwd so OPENWOLF_METADATA_DIR does not mislead the
  // scanner (WR-05).
  selfHealAnatomy(wolfDir, wtCtx.mainRepoRoot);

  // Increment total_sessions in token-ledger
  initializeSessionLedger(sessionDir);

  process.exit(0);
}

export function initializeSessionLedger(sessionDir: string): void {
  const ledgerPath = path.join(sessionDir, "token-ledger.json");
  updateJSON(ledgerPath, {
    version: 1,
    created_at: new Date().toISOString(),
    lifetime: {
      total_sessions: 0, total_reads: 0, total_writes: 0,
      total_tokens_estimated: 0, anatomy_hits: 0, anatomy_misses: 0,
      repeated_reads_blocked: 0, estimated_savings_vs_bare_cli: 0,
    },
    sessions: [],
    daemon_usage: [],
    waste_flags: [],
    optimization_report: { last_generated: null, patterns: [] },
  } as { version: number; created_at: string; lifetime: Record<string, number>; [k: string]: unknown },
  (ledger) => { ledger.lifetime.total_sessions++; return ledger; });
}

main().catch((err) => { process.stderr.write(`OpenWolf session-start: ${err instanceof Error ? err.message : String(err)}\n`); process.exit(0); });
