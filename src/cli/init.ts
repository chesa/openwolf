import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findProjectRoot } from "../scanner/project-root.js";
import { scanProject } from "../scanner/anatomy-scanner.js";
import { readJSON, writeJSON, safeCopyFile } from "../utils/fs-safe.js";
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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read package.json for version: ${(err as Error).message}`);
    }
    return "unknown";
  }
}

// Files that are safe to overwrite on upgrade (protocol docs, not user data)
const ALWAYS_OVERWRITE = [
  "OPENWOLF.md",
  "reframe-frameworks.md",
  "wolf-gitignore",
];

// Files that contain user/session data — only create if missing, never overwrite.
// config.json is here (not in ALWAYS_OVERWRITE) because users set port
// assignments and bind addresses there; overwriting it causes EADDRINUSE
// crash-loops on upgrade.
const CREATE_IF_MISSING = [
  "config.json",
  "identity.md",
  "cerebrum.md",
  "memory.md",
  "anatomy.md",
  "token-ledger.json",
  "buglog.ndjson",
  "cron-manifest.json",
  "cron-state.json",
  "designqc-report.json",
  "suggestions.json",
];

// CREATE_IF_MISSING entries that are created at runtime by their owning feature
// (cron writes suggestions.json, designqc writes designqc-report.json) rather
// than seeded from a packaged template. init must NOT warn about — or fail on —
// their absence, since they legitimately have no template.
const RUNTIME_CREATED_NO_TEMPLATE = new Set<string>([
  "designqc-report.json",
  "suggestions.json",
]);

import { makeHookSettings, isOpenWolfHook, replaceOpenWolfHooks } from "./hook-settings.js";
import { findHookSourceDir, copyHookFiles, writeHooksPackageJson } from "./hook-copy.js";
import { findTemplatesDir } from "./templates.js";
import { migrateBugLog } from "./migrate-buglog.js";
export { makeHookSettings, isOpenWolfHook, replaceOpenWolfHooks };

// Template name → destination filename mapping.
// Template files use plain names but some destinations need a different name
// (e.g. wolf-gitignore → .gitignore).
const TEMPLATE_NAME_MAP: Record<string, string> = {
  "wolf-gitignore": ".gitignore",
};

function writeTemplateFile(templatesDir: string, wolfDir: string, file: string): void {
  const srcPath = path.join(templatesDir, file);
  const destName = TEMPLATE_NAME_MAP[file] ?? file;
  const destPath = path.join(wolfDir, destName);
  if (fs.existsSync(srcPath)) {
    const content = fs.readFileSync(srcPath, "utf-8");
    fs.writeFileSync(destPath, content, "utf-8");
  } else if (!RUNTIME_CREATED_NO_TEMPLATE.has(file)) {
    console.warn(`Template not found: ${file}`);
  }
}

/**
 * Source template files that must ship in the package for a working install.
 * A missing one means the package was built or published incorrectly (e.g. a
 * nested .gitignore stripped the templates during `npm pack`). Returns the
 * names of any required templates absent from `templatesDir`. Runtime-created
 * files (designqc-report.json, suggestions.json) are excluded — they have no
 * template by design.
 */
export function findMissingTemplates(templatesDir: string): string[] {
  let present: Set<string>;
  try {
    present = new Set(fs.readdirSync(templatesDir));
  } catch {
    // templatesDir itself is unreadable/missing — treat every required
    // template as missing rather than silently producing a broken .wolf/.
    present = new Set();
  }
  const required = [...ALWAYS_OVERWRITE, ...CREATE_IF_MISSING].filter(
    (f) => !RUNTIME_CREATED_NO_TEMPLATE.has(f),
  );
  return required.filter((f) => !present.has(f));
}

function writeHooks(wolfDir: string): void {
  const hooksDir = path.join(wolfDir, "hooks");
  ensureDir(hooksDir);

  const sourceDir = findHookSourceDir();
  if (!sourceDir) {
    console.warn("  ⚠ No compiled hooks found. Run 'pnpm build:hooks' and re-run init.");
    return;
  }

  const copiedCount = copyHookFiles(sourceDir, hooksDir);
  writeHooksPackageJson(hooksDir);

  if (copiedCount === 0) {
    console.warn("  ⚠ No hook scripts found to copy.");
  }
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
      safeCopyFile(settingsPath, backupPath);
      console.warn(
        `  ⚠ settings.json could not be parsed (${err instanceof Error ? err.message : String(err)}).\n` +
        `    The original was backed up to ${backupPath}.\n` +
        `    Any user-installed hooks were NOT preserved — restore from .bak if you need them.`,
      );
    }
  }

  const merged = replaceOpenWolfHooks(existing, makeHookSettings(projectRoot));
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

/** @deprecated Replaced by .wolf/.gitignore template (D-04). Call is removed from initCommand(). */
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

export function checkRootGitIgnore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    if (content.includes(".wolf/")) {
      console.log("");
      console.log("  ℹ Your .gitignore contains '.wolf/' which blocks all wolf files.");
      console.log("    To use the mixed commit strategy (recommended for teams), remove");
      console.log("    the '.wolf/' line — the new .wolf/.gitignore handles per-file");
      console.log("    exclusions.");
    }
    // D-09-09: also warn when any .wolf/-prefixed path override exists (e.g.
    // `.wolf/hooks/` or `.wolf/anatomy.md`). These are distinct from the blanket
    // `.wolf/` rule above — they silently override the per-file .wolf/.gitignore
    // template (observed in acme_translators where `.wolf/hooks/` masked the
    // hook-ignore rule). Scan line-by-line; skip comment lines.
    const hasPrefixedOverride = content
      .split("\n")
      .some((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("#")) return false; // skip comment lines
        // Match lines starting with `.wolf/` followed by at least one more char
        // (distinguishes the bare `.wolf/` blanket from specific path rules).
        return /^\.wolf\/.+/.test(trimmed);
      });
    if (hasPrefixedOverride) {
      console.log("");
      console.log("  ℹ Your root .gitignore contains a .wolf/-prefixed path rule.");
      console.log("    Root rules silently override .wolf/.gitignore (git precedence).");
      console.log("    Remove any .wolf/ path rules from your root .gitignore —");
      console.log("    .wolf/.gitignore is the single source of truth for .wolf/ tracking.");
    }
  } catch {
    // No .gitignore or can't read — not an error
  }
}

function writeClaudeRules(projectRoot: string, templatesDir: string): void {
  // Create .claude/rules/ directory
  const rulesDir = path.join(projectRoot, ".claude", "rules");
  ensureDir(rulesDir);
  const destPath = path.join(rulesDir, "openwolf.md");
  const srcPath = path.join(templatesDir, "claude-rules-openwolf.md");
  if (fs.existsSync(srcPath)) {
    safeCopyFile(srcPath, destPath);
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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read package.json: ${(err as Error).message}`);
    }
  }
  try {
    const cargo = fs.readFileSync(path.join(projectRoot, "Cargo.toml"), "utf-8");
    const m = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read Cargo.toml: ${(err as Error).message}`);
    }
  }
  try {
    const py = fs.readFileSync(path.join(projectRoot, "pyproject.toml"), "utf-8");
    const m = py.match(/^name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read pyproject.toml: ${(err as Error).message}`);
    }
  }
  return path.basename(projectRoot);
}

function detectProjectDescription(projectRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
    if (pkg.description) return pkg.description;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read package.json: ${(err as Error).message}`);
    }
  }
  return "";
}

function seedCerebrum(wolfDir: string, projectRoot: string): void {
  const projectName = detectProjectName(projectRoot);
  const projectDescription = detectProjectDescription(projectRoot);
  if (!projectName && !projectDescription) return;

  const cerebrumPath = path.join(wolfDir, "cerebrum.md");
  let cerebrum = "";
  try {
    cerebrum = fs.readFileSync(cerebrumPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not read cerebrum.md: ${(err as Error).message}`);
    }
    return;
  }
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

  const projectRoot = findProjectRoot();

  // OPENWOLF_METADATA_DIR overrides default .wolf/ metadata location (D-03)
  const metadataDirEnv = process.env.OPENWOLF_METADATA_DIR;
  let wolfDir: string;
  if (metadataDirEnv && metadataDirEnv.trim().length > 0) {
    if (!path.isAbsolute(metadataDirEnv.trim())) {
      console.warn(`  ⚠ OPENWOLF_METADATA_DIR must be an absolute path, got "${metadataDirEnv.trim()}". Using default .wolf/`);
      wolfDir = path.join(projectRoot, ".wolf");
    } else {
      wolfDir = path.resolve(metadataDirEnv.trim());
    }
  } else {
    wolfDir = path.join(projectRoot, ".wolf");
  }

  // Hooks always deploy to projectRoot/.wolf/hooks/ per D-03
  const projectWolfDir = path.join(projectRoot, ".wolf");

  // Worktree guard — only applies when using default .wolf/ location
  const wtCtx = detectWorktreeContext(projectRoot);
  if (wtCtx.isWorktree && wolfDir === projectWolfDir) {
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

  const isUpgrade = fs.existsSync(wolfDir);

  const version = getVersion();

  if (isUpgrade) {
    console.log(`Upgrading OpenWolf to v${version}...`);
  }

  // Create metadata directory
  ensureDir(wolfDir);
  // Hooks always deploy under projectRoot/.wolf/hooks/
  ensureDir(path.join(projectWolfDir, "hooks"));

  // One-time migration: buglog.json (legacy array format) → buglog.ndjson
  migrateBugLog(wolfDir);

  // Find templates directory
  const actualTemplatesDir = findTemplatesDir();

  // Fail fast on a broken install. A missing required template means the
  // package shipped incompletely; creating a crippled .wolf/ and reporting
  // success (the silent-failure trap) is worse than erroring out here.
  const missingTemplates = findMissingTemplates(actualTemplatesDir);
  if (missingTemplates.length > 0) {
    console.error("");
    console.error(`  ✗ OpenWolf install is incomplete — ${missingTemplates.length} required template(s) missing:`);
    for (const f of missingTemplates) console.error(`      - ${f}`);
    console.error(`    (looked in ${actualTemplatesDir})`);
    console.error("");
    console.error("    This usually means the package was built or published incorrectly.");
    console.error("    Reinstall the CHESA fork:");
    console.error('      npm install -g --install-links "chesa/openwolf#develop"');
    console.error("    or rebuild from a clone:  pnpm install && pnpm run install:global");
    console.error("");
    process.exit(1);
  }

  // --- Template files ---
  let createdCount = 0;
  let skippedCount = 0;
  // Track which CREATE_IF_MISSING files were newly written so we can seed
  // their placeholders even when isUpgrade is true.
  const newlyCreated = new Set<string>();

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
      newlyCreated.add(file);
      createdCount++;
    }
  }

  // --- Hooks (always under projectRoot/.wolf/hooks/ per D-03) ---
  writeHooks(projectWolfDir);

  // --- Token ledger created_at ---
  const ledgerPath = path.join(wolfDir, "token-ledger.json");
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) as Record<string, unknown>;
    if (!ledger.created_at) {
      ledger.created_at = new Date().toISOString();
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf-8");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not update token-ledger created_at: ${(err as Error).message}`);
    }
  }

  // --- Settings (.claude/settings.json) ---
  writeSettings(projectRoot);

  // --- Claude rules + CLAUDE.md snippet ---
  writeClaudeRules(projectRoot, actualTemplatesDir);

  // --- Identity (only on fresh init, not upgrade) ---
  if (!isUpgrade) {
    writeIdentity(projectRoot, wolfDir);
    seedCerebrum(wolfDir, projectRoot);
  }

  // --- Check root .gitignore for .wolf/ entry ---
  checkRootGitIgnore(projectRoot);

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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`  ⚠ Could not update project registry: ${(err as Error).message}`);
    }
  }

  // --- Summary ---
  console.log("");
  // Indicate when metadata dir differs from default .wolf/ location
  const metadataDirDisplay = wolfDir !== projectWolfDir ? ` (OPENWOLF_METADATA_DIR: ${wolfDir})` : "";
  if (isUpgrade) {
    console.log(`  ✓ OpenWolf upgraded to v${version}${metadataDirDisplay}`);
    console.log(`  ✓ All .wolf data preserved (${skippedCount} files: cerebrum, memory, anatomy, buglog, ledger)`);
    console.log(`  ✓ Hook scripts updated`);
    console.log(`  ✓ ${createdCount} config files updated`);
    console.log(`  ✓ Anatomy: ${fileCount} files tracked (unchanged)`);
  } else {
    console.log(`  ✓ OpenWolf v${version} initialized${metadataDirDisplay}`);
    console.log(`  ✓ .wolf/ created with ${createdCount} files`);
    console.log(`  ✓ Claude Code hooks registered`);
    console.log(`  ✓ CLAUDE.md updated`);
    console.log(`  ✓ .claude/rules/openwolf.md created`);
    console.log(`  ✓ Anatomy scan: ${fileCount} files indexed`);
  }
  console.log("");
  console.log("  You're ready. Just use 'claude' as normal — OpenWolf is watching.");
  console.log("");
}
