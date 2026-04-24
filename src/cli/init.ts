import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { findProjectRoot } from "../scanner/project-root.js";
import { scanProject } from "../scanner/anatomy-scanner.js";
import { readJSON, writeJSON, readText, writeText } from "../utils/fs-safe.js";
import { ensureDir } from "../utils/paths.js";
import { isWindows } from "../utils/platform.js";
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

// Use $CLAUDE_PROJECT_DIR so hooks resolve correctly even if CWD changes during a session
const HOOK_SETTINGS = {
  hooks: {
    SessionStart: [
      { file: "session-start.js", enabled: true },
    ],
    PreRead: [
      { file: "pre-read.js", enabled: true },
    ],
    PostRead: [
      { file: "post-read.js", enabled: true },
    ],
    PreWrite: [
      { file: "pre-write.js", enabled: true },
    ],
    PostWrite: [
      { file: "post-write.js", enabled: true },
    ],
    Stop: [
      { file: "stop.js", enabled: true },
    ],
  },
};

// Find the templates directory (either src/templates or dist/templates)
function findTemplatesDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../src/templates"),
    path.resolve(__dirname, "../../dist/templates"),
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

function writeHooks(templatesDir: string, wolfDir: string): void {
  const hooksDir = path.join(wolfDir, "hooks");
  ensureDir(hooksDir);
  
  const hookFiles = [
    "session-start.js",
    "pre-read.js",
    "post-read.js",
    "pre-write.js",
    "post-write.js",
    "stop.js",
  ];
  
  for (const file of hookFiles) {
    const srcPath = path.join(templatesDir, "..", "hooks", file);
    const destPath = path.join(hooksDir, file);
    if (fs.existsSync(srcPath)) {
      const content = fs.readFileSync(srcPath, "utf-8");
      fs.writeFileSync(destPath, content, "utf-8");
    }
  }
}

function writeSettings(templatesDir: string, wolfDir: string): void {
  const settingsPath = path.join(wolfDir, "settings.json");
  const identityPath = path.join(wolfDir, "identity.md");
  
  // Read identity to extract project name
  let projectName = "unknown";
  try {
    const identity = fs.readFileSync(identityPath, "utf-8");
    const match = identity.match(/^#\s+(.+)/);
    if (match) projectName = match[1].trim();
  } catch {}
  
  const settings = {
    version: 1,
    project: projectName,
    hooks: HOOK_SETTINGS,
    features: {
      anatomy: { enabled: true },
      buglog: { enabled: true },
      cerebrum: { enabled: true },
      cron: { enabled: true },
      designqc: { enabled: true },
      ledger: { enabled: true },
      memory: { enabled: true },
      reframe: { enabled: true },
      suggestions: { enabled: true },
    },
  };
  
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
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
  } catch {}
  
  const identity = `# ${projectName}\n\n${projectDesc}\n\n> Initialized: ${new Date().toISOString()}\n> Root: ${projectRoot}`;
  fs.writeFileSync(identityPath, identity, "utf-8");
}

function writeGitIgnore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignore = "";
  try {
    gitignore = fs.readFileSync(gitignorePath, "utf-8");
  } catch {}
  
  if (!gitignore.includes(".wolf/")) {
    gitignore += "\n\n# OpenWolf\n.wolf/\n";
    fs.writeFileSync(gitignorePath, gitignore, "utf-8");
  }
}

function writeReadme(projectRoot: string): void {
  const readmePath = path.join(projectRoot, "README.md");
  const hasReadme = fs.existsSync(readmePath);
  const hasOpenWolfSection = hasReadme ? fs.readFileSync(readmePath, "utf-8").includes("OpenWolf") : false;
  
  if (!hasOpenWolfSection) {
    const append = `\n\n## OpenWolf\n\nThis project uses [OpenWolf](https://github.com/cytostack/openwolf) for token-conscious AI brain.\n\n> 📖 [Documentation](https://github.com/cytostack/openwolf) | 🐺 [Troubleshooting](.wolf/troubleshooting.md)`;
    fs.appendFileSync(readmePath, append, "utf-8");
  }
}

export async function initCommand(): Promise<void> {
  // Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1), 10);
  if (nodeVersion < 20) {
    console.error(`Node.js 20+ required. Current: ${process.version}`);
    process.exit(1);
  }

  // Worktree guard — init must run from the main checkout
  const wtCtx = detectWorktreeContext(process.cwd());
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

  // Detect project root
  const projectRoot = findProjectRoot();
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
  writeHooks(actualTemplatesDir, wolfDir);

  // --- Settings ---
  writeSettings(actualTemplatesDir, wolfDir);

  // --- Identity ---
  writeIdentity(projectRoot, wolfDir);

  // --- Project files ---
  writeGitIgnore(projectRoot);
  writeReadme(projectRoot);

  // --- Scan ---
  console.log("\nScanning project files...");
  const fileCount = await scanProject(wolfDir, projectRoot);
  console.log(`  Scanned ${fileCount} files`);

  // --- Registry ---
  try {
    await registerProject(projectRoot, path.basename(projectRoot), getVersion());
  } catch (err) {
    console.warn("\n⚠️  Could not register project:", err instanceof Error ? err.message : String(err));
  }

  // --- Summary ---
  console.log("\n" + "=".repeat(60));
  console.log(`OpenWolf v${version} initialized at: ${wolfDir}`);
  console.log("=".repeat(60));
  console.log("\nNext steps:");
  console.log(`  1. Add .wolf/ to .gitignore (already done)`);
  console.log(`  2. Commit the changes: git add .wolf/ .gitignore README.md`);
  console.log(`  3. Start using OpenWolf in your Claude Code sessions`);
  console.log("\nDocumentation: https://github.com/cytostack/openwolf");
  console.log("Troubleshooting: openwolf status\n");
}
