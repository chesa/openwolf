import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot } from "../scanner/project-root.js";
import { readJSON, readText, writeJSON } from "../utils/fs-safe.js";
import { detectWorktreeContext } from "../utils/worktree.js";
import { collectAllEntries, hashCerebrumBody } from "../hooks/wolf-pantry.js";

interface FreshnessSidecar {
  version: number;
  content_sha256: string;
  last_updated_seen: string;
  captured_at: string;
  captured_by: string;
}

export async function statusCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const wtCtx = detectWorktreeContext(projectRoot);

  // OPENWOLF_METADATA_DIR overrides the default .wolf/ location (D-03).
  const envDir = process.env.OPENWOLF_METADATA_DIR;
  const wolfDir = envDir && envDir.trim().length > 0
    ? path.resolve(envDir.trim())
    : (wtCtx.isWorktree
        ? path.join(wtCtx.mainRepoRoot, ".wolf")
        : path.join(projectRoot, ".wolf"));

  if (!fs.existsSync(wolfDir)) {
    console.log("OpenWolf not initialized. Run: openwolf init");
    return;
  }

  console.log("OpenWolf Status");
  console.log("===============\n");

  const sessionFileDir = wtCtx.isWorktree
    ? path.join(wolfDir, "sessions", wtCtx.worktreeId)
    : wolfDir;

  // (OPENWOLF_METADATA_DIR already folded into wolfDir above.)

  if (wtCtx.isWorktree) {
    console.log(`  Mode: Worktree  (${wtCtx.branch || wtCtx.worktreeId})`);
    console.log(`  Main repo: ${wtCtx.mainRepoRoot}`);
    console.log(`  Session: .wolf/sessions/${wtCtx.worktreeId}/`);
  } else {
    console.log(`  Mode: Main checkout`);
  }

  // Surface optional execution_layer hint from config.json (D11-07)
  const config = readJSON<{
    openwolf?: { execution_layer?: string | null };
  }>(path.join(wolfDir, "config.json"), {});
  const executionLayer = config.openwolf?.execution_layer ?? null;
  if (executionLayer) {
    console.log(`  Execution layer: ${executionLayer}`);
  }

  console.log("");

  // File integrity check
  const sharedFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md",
    "anatomy.md", "config.json", "buglog.ndjson",
    "cron-manifest.json",
  ];
  const sessionFiles = ["token-ledger.json"];
  // Per-developer / runtime files: gitignored and created lazily (by init, the
  // daemon, or session hooks), so they are legitimately absent on a fresh
  // install or clone. Report them as informational, never as ✗ errors.
  const perDevFiles: Array<{ file: string; note: string }> = [
    { file: "memory.md", note: "per-developer session log" },
    { file: "cron-state.json", note: "daemon runtime state" },
  ];

  let missingCount = 0;
  for (const file of sharedFiles) {
    if (!fs.existsSync(path.join(wolfDir, file))) {
      console.log(`  ✗ Missing: .wolf/${file}`);
      missingCount++;
    }
  }
  for (const file of sessionFiles) {
    if (!fs.existsSync(path.join(sessionFileDir, file))) {
      const loc = wtCtx.isWorktree
        ? `.wolf/sessions/${wtCtx.worktreeId}/${file}`
        : `.wolf/${file}`;
      console.log(`  - Not yet created: ${loc} (appears after first session)`);
    }
  }
  for (const { file, note } of perDevFiles) {
    if (!fs.existsSync(path.join(wolfDir, file))) {
      console.log(`  - Not yet created: .wolf/${file} (${note})`);
    }
  }
  if (missingCount === 0) {
    console.log(`  ✓ All ${sharedFiles.length} shared knowledge files present`);
  }

  // Hook scripts check — dynamic directory scan
  const hooksDir = path.join(wolfDir, "hooks");
  let hookScriptCount = 0;
  try {
    if (fs.existsSync(hooksDir)) {
      hookScriptCount = fs.readdirSync(hooksDir).filter(f => f.endsWith(".js")).length;
    }
  } catch { /* ignore */ }
  if (hookScriptCount > 0) {
    console.log(`  ✓ ${hookScriptCount} hook module files present`);
  } else {
    console.log(`  ✗ No hook module files found`);
  }

  // Claude settings check
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = readJSON<Record<string, unknown>>(settingsPath, {});
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (hooks) {
      const hookCount = Object.values(hooks).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`  ✓ Claude Code hooks registered (${hookCount} matchers)`);
    }
  } else {
    console.log("  ✗ .claude/settings.json not found");
  }

  // Token ledger stats
  const ledger = readJSON<{
    lifetime: {
      total_sessions: number;
      total_reads: number;
      total_writes: number;
      total_tokens_estimated: number;
      estimated_savings_vs_bare_cli: number;
    };
  }>(path.join(sessionFileDir, "token-ledger.json"), {
    lifetime: { total_sessions: 0, total_reads: 0, total_writes: 0, total_tokens_estimated: 0, estimated_savings_vs_bare_cli: 0 },
  });

  console.log(`\nToken Stats:`);
  console.log(`  Sessions: ${ledger.lifetime.total_sessions}`);
  console.log(`  Total reads: ${ledger.lifetime.total_reads ?? 0}`);
  console.log(`  Total writes: ${ledger.lifetime.total_writes ?? 0}`);
  const totalTokens = ledger.lifetime.total_tokens_estimated ?? 0;
  const savings = ledger.lifetime.estimated_savings_vs_bare_cli ?? 0;
  console.log(`  Tokens tracked: ~${totalTokens.toLocaleString()}`);
  console.log(`  Estimated savings: ~${savings.toLocaleString()} tokens`);

  if (wtCtx.isWorktree) {
    console.log(`  (This worktree session only — main checkout ledger: .wolf/token-ledger.json)`);
  }

  // Anatomy stats
  const anatomyContent = readText(path.join(wolfDir, "anatomy.md"));
  const entryCount = (anatomyContent.match(/^- `/gm) || []).length;
  console.log(`\nAnatomy: ${entryCount} files tracked`);

  // Curation — pending learnings count (R7b, D12-08)
  try {
    const pending = collectAllEntries();
    console.log("\nCuration:");
    if (pending.length > 0) {
      console.log(`  - ${pending.length} learnings awaiting review`);
    } else {
      console.log("  ✓ No pending learnings");
    }
  } catch {
    console.log("\nCuration:");
    console.log("  - Curation: (unavailable)");
  }

  // R9 freshness integrity check (D12-14)
  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  const sidecarPath = path.join(wolfDir, "cerebrum-freshness.json");
  try {
    const content = readText(cerebrumPath);
    const currentHash = hashCerebrumBody(content);
    const sidecar = readJSON<FreshnessSidecar | null>(sidecarPath, null);
    const dateMatch = content.match(/>\s*Last\s+updated\s*:\s*(.+)/i);
    const currentDate = dateMatch ? dateMatch[1].trim() : "—";

    if (!sidecar) {
      // Bootstrap-on-missing — the ONE write status may do (D12-14)
      writeJSON(sidecarPath, {
        version: 1,
        content_sha256: currentHash,
        last_updated_seen: currentDate,
        captured_at: new Date().toISOString(),
        captured_by: "status-bootstrap",
      });
      console.log("  - cerebrum.md: baseline captured (no prior history)");
    } else if (currentHash === sidecar.content_sha256) {
      if (currentDate !== sidecar.last_updated_seen) {
        console.log(`  ✗ cerebrum.md: "Last updated" bumped with no content change (freshness theater)`);
      } else {
        console.log("  ✓ cerebrum.md: current");
      }
    } else {
      console.log("  ✓ cerebrum.md: current");
    }
  } catch {
    console.log("  - cerebrum.md: (freshness check unavailable)");
  }

  // Cron state
  const cronState = readJSON<{ engine_status: string; last_heartbeat: string | null }>(
    path.join(wolfDir, "cron-state.json"),
    { engine_status: "unknown", last_heartbeat: null }
  );
  console.log(`\nDaemon: ${cronState.engine_status}`);
  if (cronState.last_heartbeat) {
    const elapsed = Date.now() - new Date(cronState.last_heartbeat).getTime();
    const mins = Math.floor(elapsed / 60000);
    console.log(`  Last heartbeat: ${mins} minutes ago`);
  }

  console.log("");
}
