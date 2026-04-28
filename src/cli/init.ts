import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findProjectRoot } from "../scanner/project-root.js";
import { scanProject } from "../scanner/anatomy-scanner.js";
import { readJSON, writeJSON } from "../utils/fs-safe.js";
import { ensureDir } from "../utils/paths.js";
import { registerProject } from "./registry.js";
import { detectWorktreeContext } from "../utils/worktree.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

// Files that are safe to overwrite on upgrade (config/protocol, not user data)
const ALWAYS_OVERWRITE = [
  "OPENWOLF.md",
  "config.json",
  "reframe-frameworks.md",
];

// Files that contain user/session data — only create if missing, never overwrite
const CREATE_IF_MISSING = [
  "identity.md",
  "cerebrum.md",
  "memory.md",
  "anatomy.md",
  "token-ledger.json",
  "buglog.json",
  "cron-manifest.json",
  "cron-state.json",
  "designqc-report.json",
  "suggestions.json",
];

import { HOOK_SETTINGS } from "./hook-settings.js";
export { HOOK_SETTINGS };

// Find the templates directory (either src/templates or dist/templates)
function findTemplatesDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../src/templates"),
    path.resolve(__dirname, "../../dist/templates"),
    path.resolve(__dirname, "../templates"),
    path.resolve(__dirname, "templates"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Templates directory not found");
}

function writeTemplateFile(templatesDir: string, wolfDir: string, file: string): void {
  const srcPath = path.join(templatesDir, file);
  const destPath = path.join(wolfDir, file);
  if (fs.existsSync(srcPath)) {
    const content = fs.readFileSync(srcPath, "utf-8");
    fs.writeFileSync(destPath, content, "utf-8");
  } else {
    console.warn(`Template not found: ${file}`);
  }
}

function writeHooks(wolfDir: string): void {
  const hooksDir = path.join(wolfDir, "hooks");
  ensureDir(hooksDir);

  const hookFiles = [
    "session-start.js",
    "pre-read.js",
    "post-read.js",
    "pre-write.js",
    "post-write.js",
    "stop.js",
    "shared.js",
    "worktree-helper.js",
  ];

  // Find compiled hooks — check multiple locations relative to __dirname (dist/cli/)
  const candidates = [
    path.resolve(__dirname, "../hooks"),
    path.resolve(__dirname, "../../dist/hooks"),
  ];
  let sourceDir = "";
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "shared.js"))) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    console.warn("  ⚠ No compiled hooks found. Run 'pnpm build:hooks' and re-run init.");
    return;
  }

  let copiedCount = 0;
  for (const file of hookFiles) {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(hooksDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    } else {
      console.warn(`  ⚠ Hook not found: ${file}`);
    }
  }

  // ESM hooks need type:module to work in CJS projects
  fs.writeFileSync(
    path.join(hooksDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2) + "\n",
    "utf-8"
  );

  if (copiedCount < hookFiles.length) {
    console.warn(`  ⚠ Only ${copiedCount}/${hookFiles.length} hooks copied.`);
  }
}

/**
 * Returns true if a hook entry was registered by OpenWolf
 * (i.e., its command references .wolf/hooks/).
 */
export function isOpenWolfHook(hook: unknown): boolean {
  if (typeof hook !== "object" || hook === null) return false;
  const h = hook as Record<string, unknown>;
  if (typeof h.command === "string" && h.command.includes(".wolf/hooks/")) return true;
  return false;
}

/**
 * Replace OpenWolf hooks in an existing settings object while preserving
 * any user-added hooks that are NOT OpenWolf hooks.
 */
export function replaceOpenWolfHooks(
  existing: Record<string, unknown>,
  newHooks: typeof HOOK_SETTINGS
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  const existingHooks = (typeof existing.hooks === "object" && existing.hooks !== null)
    ? { ...(existing.hooks as Record<string, unknown>) }
    : {};

  for (const event of Object.keys(newHooks) as Array<keyof typeof HOOK_SETTINGS>) {
    const existing_entries = Array.isArray(existingHooks[event])
      ? (existingHooks[event] as unknown[])
      : [];
    // Keep non-OpenWolf entries the user may have added
    const userEntries = existing_entries.filter((entry) => {
      if (typeof entry !== "object" || entry === null) return true;
      const e = entry as Record<string, unknown>;
      const hooks = Array.isArray(e.hooks) ? e.hooks : [];
      return !hooks.some(isOpenWolfHook);
    });
    existingHooks[event] = [...newHooks[event], ...userEntries];
  }

  merged.hooks = existingHooks;
  return merged;
}

function writeSettings(projectRoot: string): void {
  const claudeDir = path.join(projectRoot, ".claude");
  ensureDir(claudeDir);
  const settingsPath = path.join(claudeDir, "settings.json");

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    } catch (err) {
      const backupPath = settingsPath + ".bak";
      fs.copyFileSync(settingsPath, backupPath);
      console.warn(`  ⚠ settings.json is corrupted (${err instanceof Error ? err.message : String(err)}). Backed up to ${backupPath}.`);
    }
  }

  const merged = replaceOpenWolfHooks(existing, HOOK_SETTINGS);
  writeJSON(settingsPath, merged);
}

function writeIdentity(projectRoot: string, wolfDir: string): void {
  const identityPath = path.join(wolfDir, "identity.md");
  const pkgPath = path.join(projectRoot, "package.json");
  const name = path.basename(projectRoot);
  
  let projectName = name;
  let projectDesc = "";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.name) projectName = pkg.name;
    if (pkg.description) projectDesc = pkg.description;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not parse ${pkgPath}: ${(err as Error).message}`);
    }
  }
  
  const identity = `# ${projectName}\n\n${projectDesc}\n\n> Initialized: ${new Date().toISOString()}\n> Root: ${projectRoot}`;
  fs.writeFileSync(identityPath, identity, "utf-8");
}

function writeGitIgnore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try {
    gitignore = fs.readFileSync(gitignorePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Cannot read ${gitignorePath}: ${(err as Error).message}. Skipping .gitignore update.`);
      return;
    }
  }

  if (!gitignore.includes(".wolf/")) {
    gitignore += "\n\n# OpenWolf\n.wolf/\n";
    fs.writeFileSync(gitignorePath, gitignore, "utf-8");
  }
}

function writeClaudeRules(projectRoot: string, templatesDir: string): void {
  // Create .claude/rules/ directory
  const rulesDir = path.join(projectRoot, ".claude", "rules");
  ensureDir(rulesDir);
  const destPath = path.join(rulesDir, "openwolf.md");
  const srcPath = path.join(templatesDir, "claude-rules-openwolf.md");
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  }

  // Insert @.wolf/OPENWOLF.md reference at the top of CLAUDE.md if not present
  const claudeMdPath = path.join(projectRoot, "CLAUDE.md");
  const marker = "@.wolf/OPENWOLF.md";
  const fullSnippet = `# CLAUDE.md\n\n${marker}\n\nThis project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.`;
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf-8");
    if (!content.includes("OpenWolf") && !content.includes(marker)) {
      fs.writeFileSync(claudeMdPath, marker + "\n\n" + content, "utf-8");
    }
  } else {
    fs.writeFileSync(claudeMdPath, fullSnippet + "\n", "utf-8");
  }
}

function detectProjectName(projectRoot: string): string {
  const pkgPath = path.join(projectRoot, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.name) return pkg.name;
  } catch {}
  try {
    const cargo = fs.readFileSync(path.join(projectRoot, "Cargo.toml"), "utf-8");
    const m = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  } catch {}
  try {
    const py = fs.readFileSync(path.join(projectRoot, "pyproject.toml"), "utf-8");
    const m = py.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  } catch {}
  return path.basename(projectRoot);
}

function detectProjectDescription(projectRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
    if (pkg.description) return pkg.description;
  } catch {}
  return "";
}

function seedCerebrum(wolfDir: string, projectRoot: string): void {
  const projectName = detectProjectName(projectRoot);
  const projectDescription = detectProjectDescription(projectRoot);
  if (!projectName && !projectDescription) return;

  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  let cerebrum = "";
  try { cerebrum = fs.readFileSync(cerebrumPath, "utf-8"); } catch { return; }
  const projectInfo = [
    `- **Project:** ${projectName || path.basename(projectRoot)}`,
    projectDescription ? `- **Description:** ${projectDescription}` : "",
  ].filter(Boolean).join("\n");

  if (!cerebrum.includes("**Project:**")) {
    cerebrum = cerebrum.replace(
      /## Key Learnings\n/,
      `## Key Learnings\n\n${projectInfo}\n`
    );
  }
  fs.writeFileSync(cerebrumPath, cerebrum, "utf-8");
}

export async function initCommand(): Promise<void> {
  // Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion < 20) {
    console.error(`Node.js 20+ required. Current: ${process.version}`);
    process.exit(1);
  }

  // Detect project root first — used consistently for worktree check and init
  const projectRoot = findProjectRoot();

  // Worktree guard — init must run from the main checkout
  const wtCtx = detectWorktreeContext(projectRoot);
  if (wtCtx.isWorktree) {
    const mainWolfDir = path.join(wtCtx.mainRepoRoot, ".wolf");
    if (fs.existsSync(mainWolfDir)) {
      console.log(`OpenWolf is already initialized at: ${wtCtx.mainRepoRoot}`);
      console.log(`Worktrees automatically use the shared .wolf/ state — no action needed.`);
      process.exit(0);
    } else {
      console.error(`You're running in a git worktree: ${wtCtx.worktreePath}`);
      console.error(`OpenWolf must be initialized from the main checkout. Run:`);
      console.error(`  cd ${wtCtx.mainRepoRoot} && openwolf init`);
      process.exit(1);
    }
  }
  console.log(`Project root: ${projectRoot}`);

  const wolfDir = path.join(projectRoot, ".wolf");
  const isUpgrade = fs.existsSync(wolfDir);

  const version = getVersion();

  if (isUpgrade) {
    console.log(`Upgrading OpenWolf to v${version}...`);
  }

  // Create .wolf/ directory
  ensureDir(wolfDir);
  ensureDir(path.join(wolfDir, "hooks"));

  // Find templates directory
  const actualTemplatesDir = findTemplatesDir();

  // --- Template files ---
  let createdCount = 0;
  let skippedCount = 0;

  for (const file of ALWAYS_OVERWRITE) {
    writeTemplateFile(actualTemplatesDir, wolfDir, file);
    createdCount++;
  }

  for (const file of CREATE_IF_MISSING) {
    const destPath = path.join(wolfDir, file);
    if (fs.existsSync(destPath)) {
      skippedCount++;
    } else {
      writeTemplateFile(actualTemplatesDir, wolfDir, file);
      createdCount++;
    }
  }

  // --- Hooks ---
  writeHooks(wolfDir);

  // --- Token ledger created_at ---
  const ledgerPath = path.join(wolfDir, "token-ledger.json");
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) as Record<string, unknown>;
    if (!ledger.created_at) {
      ledger.created_at = new Date().toISOString();
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf-8");
    }
  } catch {}

  // --- Settings (.claude/settings.json) ---
  writeSettings(projectRoot);

  // --- Claude rules + CLAUDE.md snippet ---
  writeClaudeRules(projectRoot, actualTemplatesDir);

  // --- Identity (only on fresh init, not upgrade) ---
  if (!isUpgrade) {
    writeIdentity(projectRoot, wolfDir);
    seedCerebrum(wolfDir, projectRoot);
  }

  // --- Project files ---
  writeGitIgnore(projectRoot);

  // --- Scan ---
  let fileCount = 0;
  if (!isUpgrade) {
    try {
      console.log("\nScanning project files...");
      fileCount = await scanProject(wolfDir, projectRoot);
      console.log(`  Scanned ${fileCount} files`);
    } catch (err) {
      console.log("  Anatomy scan deferred — will run on first session.");
      console.warn(`  (Reason: ${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // --- Registry ---
  try {
    const projectName = detectProjectName(projectRoot);
    if (projectName !== "openwolf") {
      registerProject(projectRoot, projectName, version);
    }
  } catch {
    // Non-fatal — registry is a convenience feature
  }

  // --- Summary ---
  console.log("\n" + "=".repeat(60));
  console.log(`OpenWolf v${version} initialized at: ${wolfDir}`);
  console.log("=".repeat(60));
  console.log(`  Daemon: start manually with 'openwolf daemon start' (requires pm2)`);
  console.log("\nNext steps:");
  console.log(`  1. Add .wolf/ to .gitignore (already done)`);
  console.log(`  2. Commit the changes: git add .gitignore .claude/ CLAUDE.md`);
  console.log(`  3. Start using OpenWolf in your Claude Code sessions`);
  console.log("\nDocumentation: https://github.com/cytostack/openwolf");
  console.log("Troubleshooting: openwolf status\n");
}
