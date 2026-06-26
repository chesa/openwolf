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

// Match proposal entries by their arrow-header boundary without splitting on every
// `##` in the body. This preserves content that contains markdown headings such as
// `## Subsection` and also tolerates an entry at the very start of the file (no
// leading newline required) (WR-07).
const ENTRY_REGEX =
  /(?:^|\n)##\s+(.+?)\s*→\s*(cerebrum|anatomy)\s*\n(?:\s*\n)*\s*([\s\S]*?)(?=\n##\s+[^\n]+\s*→\s*(?:cerebrum|anatomy)|$)/gi;

/**
 * ENOENT-safe file read. ENOENT returns an empty string silently; other errors
 * are logged to stderr and rethrown so callers can decide whether to treat the
 * session as unreadable.
 */
function readStaging(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    process.stderr.write(
      `OpenWolf: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Staging aggregator
// ---------------------------------------------------------------------------

export function parseProposals(sessionDir: string, sessionId: string): ProposalEntry[] {
  const stagingPath = path.join(sessionDir, "proposed-learnings.md");
  const raw = readStaging(stagingPath);
  return parseRawProposals(raw, sessionId);
}

function parseRawProposals(raw: string, sessionId: string): ProposalEntry[] {
  if (!raw) return [];

  const entries: ProposalEntry[] = [];
  for (const match of raw.matchAll(ENTRY_REGEX)) {
    const timestamp = match[1];
    const targetRaw = match[2].toLowerCase();
    const target = targetRaw as "cerebrum" | "anatomy";
    const content = match[3].trim();
    // Preserve the old split-style raw shape (header text without the leading `## `)
    // so downstream consumers such as learnings-cmd.ts see the same format.
    const block = match[0].replace(/^(?:\n)?##\s+/, "");

    entries.push({
      sessionId,
      timestamp,
      target,
      content,
      raw: block,
    });
  }

  // Preserve the old diagnostic: if the file has headings but no valid proposal
  // entries, something is malformed. We avoid re-splitting on every `##` so that
  // legitimate markdown headings inside an entry's body are not misclassified.
  if (entries.length === 0 && raw.trim() && /^##\s+/m.test(raw)) {
    process.stderr.write(
      `OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`,
    );
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
    const stagingPath = path.join(sessionDir, "proposed-learnings.md");

    try {
      // Read once and reuse the raw text for both parsing and stub detection (IN-001).
      const raw = readStaging(stagingPath);
      const parsed = parseRawProposals(raw, dirent.name);

      const trimmedRaw = raw.trim();
      if (trimmedRaw && parsed.length === 0) {
        // Use the staging file's mtime as a stable timestamp instead of a
        // newly generated one (IN-006).
        let stubTimestamp: string;
        try {
          stubTimestamp = fs.statSync(stagingPath).mtime.toISOString();
        } catch {
          stubTimestamp = "stub";
        }
        entries.push({
          sessionId: dirent.name,
          timestamp: stubTimestamp,
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

/**
 * Normalizes cerebrum.md content for hashing. The "Last updated" line is
 * stripped, then ALL whitespace is removed. This is intentional: date-only
 * bumps and cosmetic whitespace changes must not alter the hash. If future
 * requirements need word-boundary detection, collapse whitespace to a single
 * space instead of removing it entirely.
 */
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
