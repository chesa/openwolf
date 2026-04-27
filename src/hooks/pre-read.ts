import * as path from "node:path";
import {
  getWolfDir, ensureWolfDir, getSessionDir, readJSON, writeJSON, readMarkdown, parseAnatomy,
  estimateTokens, readStdin, normalizePath
} from "./shared.js";

interface SessionData {
  session_id: string;
  files_read: Record<string, { count: number; tokens: number; first_read: string }>;
  anatomy_hits: number;
  anatomy_misses: number;
  repeated_reads_warned: number;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  ensureWolfDir();
  const wolfDir = getWolfDir();
  const sessionFile = path.join(getSessionDir(), "_session.json");

  const raw = await readStdin();
  let input: { tool_input?: { file_path?: string; path?: string } };
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  const filePath = input.tool_input?.file_path ?? input.tool_input?.path ?? "";
  if (!filePath) { process.exit(0); return; }

  const normalizedFile = normalizePath(filePath);

  // Skip tracking for .wolf/ internal files — they're infrastructure, not project files.
  // Counting them inflates anatomy miss rates since .wolf/ is excluded from anatomy scanning.
  // In worktree mode, .wolf/ lives at mainRepoRoot, not projectDir — check both.
  const projectDir = normalizePath(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const normalizedWolfDir = normalizePath(wolfDir);
  const isWolfFile = (f: string): boolean => {
    const relToProject = f.startsWith(projectDir) ? f.slice(projectDir.length).replace(/^\//, "") : "";
    if (relToProject.startsWith(".wolf/") || relToProject.startsWith(".wolf\\")) return true;
    if (f.startsWith(normalizedWolfDir + "/") || f.startsWith(normalizedWolfDir + "\\") || f === normalizedWolfDir) return true;
    return false;
  };
  if (isWolfFile(normalizedFile)) {
    process.exit(0);
    return;
  }

  const session = readJSON<SessionData>(sessionFile, {
    session_id: "", files_read: {}, anatomy_hits: 0, anatomy_misses: 0,
    repeated_reads_warned: 0,
  });

  // Check if already read this session
  if (session.files_read[normalizedFile]) {
    const prev = session.files_read[normalizedFile];
    process.stderr.write(
      `⚡ OpenWolf: ${path.basename(normalizedFile)} was already read this session (~${prev.tokens} tokens). Consider using your existing knowledge of this file.\n`
    );
    session.files_read[normalizedFile].count++;
    session.repeated_reads_warned++;
    writeJSON(sessionFile, session);
    process.exit(0);
    return;
  }

  // Check anatomy.md for this file
  const anatomyContent = readMarkdown(path.join(wolfDir, "anatomy.md"));
  const sections = parseAnatomy(anatomyContent);
  let found = false;

  for (const [sectionKey, entries] of sections) {
    for (const entry of entries) {
      // Build the full relative path from the section key + filename for accurate matching
      const entryRelPath = normalizePath(path.join(sectionKey, entry.file));
      if (normalizedFile.endsWith(entryRelPath) || normalizedFile.endsWith("/" + entryRelPath)) {
        process.stderr.write(
          `📋 OpenWolf anatomy: ${entry.file} — ${entry.description} (~${entry.tokens} tok)\n`
        );
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (found) {
    session.anatomy_hits++;
  } else {
    session.anatomy_misses++;
  }

  // Record initial read entry (tokens will be updated in post-read)
  session.files_read[normalizedFile] = {
    count: 1,
    tokens: 0,
    first_read: new Date().toISOString(),
  };

  writeJSON(sessionFile, session);
  process.exit(0);
}

main().catch((err) => { process.stderr.write(`OpenWolf pre-read: ${err instanceof Error ? err.message : String(err)}\n`); process.exit(0); });
