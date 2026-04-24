import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot } from "../scanner/project-root.js";
import { readJSON, readText } from "../utils/fs-safe.js";
import { detectWorktreeContext } from "../utils/worktree.js";

export async function statusCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const wolfDir = path.join(projectRoot, ".wolf");

  if (!fs.existsSync(wolfDir)) {
    console.log("OpenWolf not initialized. Run: openwolf init");
    return;
  }

  console.log("OpenWolf Status");
  console.log("===============\n");

  const wtCtx = detectWorktreeContext(projectRoot);
  const sessionFileDir = wtCtx.isWorktree
    ? path.join(wolfDir, "sessions", wtCtx.sessionId)
    : wolfDir;

  if (wtCtx.isWorktree) {
    console.log(`  Mode: Worktree  (${wtCtx.branch || wtCtx.sessionId})`);
    console.log(`  Main repo: ${wtCtx.mainRepoRoot}`);
    console.log(`  Session: .wolf/sessions/${wtCtx.sessionId}/`);
  } else {
    console.log(`  Mode: Main checkout`);
  }
  console.log("");

  // File integrity check
  const sharedFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md",
    "anatomy.md", "config.json", "buglog.json",
    "cron-manifest.json", "cron-state.json",
  ];
  const sessionFiles = ["memory.md", "token-ledger.json"];

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
        ? `.wolf/sessions/${wtCtx.sessionId}/${file}`
        : `.wolf/${file}`;
      console.log(`  - Not yet created: ${loc} (appears after first session)`);
    }
  }
  if (missingCount === 0) {
    console.log(`  ✓ All ${sharedFiles.length} shared knowledge files present`);
  }

  // Hook scripts check
  const hookFiles = [
    "session-start.js", "pre-read.js", "pre-write.js",
    "post-read.js", "post-write.js", "stop.js", "shared.js",
  ];
  const hooksDir = path.join(wolfDir, "hooks");
  let hooksMissing = 0;
  for (const file of hookFiles) {
    if (!fs.existsSync(path.join(hooksDir, file))) hooksMissing++;
  }
  if (hooksMissing === 0) {
    console.log(`  ✓ All ${hookFiles.length} hook scripts present`);
  } else {
    console.log(`  ✗ Missing ${hooksMissing} hook scripts`);
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
  console.log(`  Total reads: ${ledger.lifetime.total_reads}`);
  console.log(`  Total writes: ${ledger.lifetime.total_writes}`);
  console.log(`  Tokens tracked: ~${ledger.lifetime.total_tokens_estimated.toLocaleString()}`);
  console.log(`  Estimated savings: ~${ledger.lifetime.estimated_savings_vs_bare_cli.toLocaleString()} tokens`);

  if (wtCtx.isWorktree) {
    console.log(`  (This worktree session only — main checkout ledger: .wolf/token-ledger.json)`);
  }

  // Anatomy stats
  const anatomyContent = readText(path.join(wolfDir, "anatomy.md"));
  const entryCount = (anatomyContent.match(/^- `/gm) || []).length;
  console.log(`\nAnatomy: ${entryCount} files tracked`);

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
