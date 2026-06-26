/**
 * wolf-pantry.ts — dependency-free staging aggregator + R9 freshness hash engine.
 *
 * Provides the canonical source of truth for pending learning proposals and
 * a normalized SHA-256 hash of cerebrum.md that ignores the "Last updated"
 * date line. Zero node_modules imports — this module is safe for inclusion in
 * the hooks build (tsconfig.hooks.json C2 boundary).
 *
 * Public API (NOT re-exported via shared.ts because collectAllEntries is CLI-only):
 *   collectAllEntries()
 *   parseProposals(sessionDir, sessionId)
 *   ProposalEntry
 *   normalizeCerebrumBody(content)
 *   hashCerebrumBody(content)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getWolfDir } from "./wolf-paths.js";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ProposalEntry {
  sessionId: string;
  timestamp: string;
  target: "cerebrum" | "anatomy";
  content: string;
  raw: string;
  isStub?: boolean;
}

// ---------------------------------------------------------------------------
// Private parsing helpers
// ---------------------------------------------------------------------------

const ENTRY_HEADER_REGEX = /^(.+?) → (.+)\n\n([\s\S]*)$/;

/**
 * ENOENT-safe file read. Non-ENOENT errors are logged to stderr and swallowed
 * so that callers can decide whether to treat the file as empty.
 */
function readStaging(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(
        `OpenWolf: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    return "";
  }
}

// ---------------------------------------------------------------------------
// Staging aggregator
// ---------------------------------------------------------------------------

export function parseProposals(sessionDir: string, sessionId: string): ProposalEntry[] {
  const stagingPath = path.join(sessionDir, "proposed-learnings.md");
  const raw = readStaging(stagingPath);
  if (!raw) return [];

  const blocks = raw.split("\n## ");
  const entries: ProposalEntry[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const bodyMatch = trimmed.match(ENTRY_HEADER_REGEX);
    if (!bodyMatch) {
      process.stderr.write(
        `OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`,
      );
      continue;
    }

    const timestamp = bodyMatch[1];
    const targetRaw = bodyMatch[2].toLowerCase();
    if (targetRaw !== "cerebrum" && targetRaw !== "anatomy") {
      process.stderr.write(
        `OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`,
      );
      continue;
    }
    const target = targetRaw as "cerebrum" | "anatomy";
    const content = bodyMatch[3].trim();

    entries.push({
      sessionId,
      timestamp,
      target,
      content,
      raw: block,
    });
  }

  return entries;
}

export function collectAllEntries(): ProposalEntry[] {
  const wolfDir = getWolfDir();
  const sessionsDir = path.join(wolfDir, "sessions");

  if (!fs.existsSync(sessionsDir)) return [];

  const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  const entries: ProposalEntry[] = [];

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const sessionDir = path.join(sessionsDir, dirent.name);

    try {
      const parsed = parseProposals(sessionDir, dirent.name);

      let raw = "";
      try {
        raw = fs.readFileSync(path.join(sessionDir, "proposed-learnings.md"), "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          raw = "";
        } else {
          throw err;
        }
      }

      const trimmedRaw = raw.trim();
      if (trimmedRaw && parsed.length === 0) {
        entries.push({
          sessionId: dirent.name,
          timestamp: new Date().toISOString(),
          target: "cerebrum",
          content: "(staged stub — review and replace with explicit learning)",
          raw: trimmedRaw,
          isStub: true,
        });
      } else {
        entries.push(...parsed);
      }
    } catch {
      process.stderr.write(
        `OpenWolf: cannot read session directory ${dirent.name}, skipping\n`,
      );
      continue;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// R9 freshness hash engine
// ---------------------------------------------------------------------------

export function normalizeCerebrumBody(content: string): string {
  return content
    .replace(/^>\s*Last\s+updated\s*:.*$/gim, "")
    .replace(/\s+/g, "")
    .trim();
}

export function hashCerebrumBody(content: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeCerebrumBody(content))
    .digest("hex");
}
