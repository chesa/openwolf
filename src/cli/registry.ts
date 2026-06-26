/**
 * Central registry of all OpenWolf-managed projects.
 * Stored at ~/.openwolf/registry.json
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface RegisteredProject {
  root: string;
  name: string;
  registered_at: string;
  last_updated: string;
  version: string;
}

export interface Registry {
  version: number;
  projects: RegisteredProject[];
}

export function getRegistryDir(): string {
  return path.join(os.homedir(), ".openwolf");
}

export function getRegistryPath(): string {
  return path.join(getRegistryDir(), "registry.json");
}

export function readRegistry(): Registry {
  const registryPath = getRegistryPath();
  try {
    const raw = fs.readFileSync(registryPath, "utf-8");
    return JSON.parse(raw) as Registry;
  } catch {
    return { version: 1, projects: [] };
  }
}

export function writeRegistry(registry: Registry): void {
  const dir = getRegistryDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Register a project in the central registry.
 * Updates existing entry if the project root matches.
 */
export function registerProject(projectRoot: string, name: string, version: string): void {
  const registry = readRegistry();
  const canonicalRoot = fs.realpathSync(projectRoot);
  const normalized = normalizePath(canonicalRoot);
  const now = new Date().toISOString();

  const existing = registry.projects.find(p => normalizePath(p.root) === normalized);
  if (existing) {
    existing.name = name;
    existing.last_updated = now;
    existing.version = version;
  } else {
    registry.projects.push({
      root: canonicalRoot,
      name,
      registered_at: now,
      last_updated: now,
      version,
    });
  }

  writeRegistry(registry);
}

/**
 * Remove a project from the registry (e.g., if the directory no longer exists).
 */
export function unregisterProject(projectRoot: string): void {
  const registry = readRegistry();
  const canonicalRoot = fs.realpathSync(projectRoot);
  const normalized = normalizePath(canonicalRoot);
  registry.projects = registry.projects.filter(p => normalizePath(p.root) !== normalized);
  writeRegistry(registry);
}

/**
 * Get all registered projects, optionally filtering out ones that no longer exist.
 * When validateExists is true, also deduplicates entries whose roots resolve to
 * the same canonical path (e.g. a symlinked workspace entry alongside the real
 * repo path). The entry with the newer last_updated timestamp wins.
 */
export function getRegisteredProjects(validateExists: boolean = false): RegisteredProject[] {
  const registry = readRegistry();
  if (!validateExists) return registry.projects;

  const valid: RegisteredProject[] = [];
  const removed: string[] = [];

  for (const project of registry.projects) {
    const wolfDir = path.join(project.root, ".wolf");
    if (fs.existsSync(wolfDir)) {
      valid.push(project);
    } else {
      removed.push(project.root);
    }
  }

  // Deduplicate entries that resolve to the same canonical path.
  const seen = new Map<string, RegisteredProject>();
  const deduped: RegisteredProject[] = [];
  for (const project of valid) {
    let canonical: string;
    try {
      canonical = normalizePath(fs.realpathSync(project.root));
    } catch {
      canonical = normalizePath(project.root);
    }
    const existing = seen.get(canonical);
    if (existing) {
      // Keep the entry with the newer timestamp; drop the stale one.
      if (project.last_updated > existing.last_updated) {
        deduped.splice(deduped.indexOf(existing), 1);
        deduped.push(project);
        seen.set(canonical, project);
      }
      // else: drop this duplicate silently
    } else {
      seen.set(canonical, project);
      deduped.push(project);
    }
  }

  // Persist if anything was cleaned up
  if (removed.length > 0 || deduped.length < valid.length) {
    registry.projects = deduped;
    writeRegistry(registry);
  }

  return deduped;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}
