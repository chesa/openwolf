import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { getWolfDir } from "../hooks/wolf-paths.js";
import { withFileLock } from "../hooks/wolf-lock.js";
import { readText } from "../utils/fs-safe.js";

export interface ProposalEntry {
  sessionId: string;
  timestamp: string;
  target: "cerebrum" | "anatomy";
  content: string;
  raw: string;
}

const ENTRY_HEADER_REGEX = /^(.+?) → (.+)\n\n([\s\S]*)$/;

export function parseProposals(sessionDir: string, sessionId: string): ProposalEntry[] {
  const stagingPath = path.join(sessionDir, "proposed-learnings.md");
  const raw = readText(stagingPath);
  if (!raw) return [];

  const blocks = raw.split("\n## ");
  const entries: ProposalEntry[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const headerLine = "## " + trimmed;
    const headerMatch = headerLine.match(/^## (.+)$/m);
    if (!headerMatch) {
      process.stderr.write(`OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`);
      continue;
    }

    const bodyAfterHeader = trimmed.slice(headerMatch[0].replace("## ", "").length).trim();
    const bodyMatch = trimmed.match(ENTRY_HEADER_REGEX);
    if (!bodyMatch) {
      process.stderr.write(`OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`);
      continue;
    }

    const timestamp = bodyMatch[1];
    const targetRaw = bodyMatch[2].toLowerCase();
    if (targetRaw !== "cerebrum" && targetRaw !== "anatomy") {
      process.stderr.write(`OpenWolf: unparseable proposal entry in session ${sessionId}, skipping\n`);
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

export function listProposals(entries: ProposalEntry[]): void {
  if (entries.length === 0) {
    console.log("No pending proposals found");
    return;
  }

  const sessionLabel = "Session ID";
  const timestampLabel = "Timestamp";
  const targetLabel = "Target";
  const previewLabel = "Preview";

  console.log(
    `${sessionLabel.padEnd(14)} ${timestampLabel.padEnd(28)} ${targetLabel.padEnd(12)} ${previewLabel}`
  );
  console.log(
    "─".repeat(14) + " " + "─".repeat(28) + " " + "─".repeat(12) + " " + "─".repeat(60)
  );

  for (const entry of entries) {
    const preview = entry.content.replace(/\n/g, " ");
    const truncated = preview.length > 60 ? preview.slice(0, 57) + "..." : preview;
    console.log(
      `${entry.sessionId.padEnd(14)} ${entry.timestamp.padEnd(28)} ${entry.target.padEnd(12)} ${truncated}`
    );
  }
}

function collectAllEntries(): ProposalEntry[] {
  const wolfDir = getWolfDir();
  const sessionsDir = path.join(wolfDir, "sessions");

  if (!fs.existsSync(sessionsDir)) return [];

  const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  const entries: ProposalEntry[] = [];

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    const sessionDir = path.join(sessionsDir, dirent.name);

    let parsed: ProposalEntry[];
    try {
      parsed = parseProposals(sessionDir, dirent.name);
    } catch {
      process.stderr.write(`OpenWolf: cannot read session directory ${dirent.name}, skipping\n`);
      continue;
    }

    entries.push(...parsed);
  }

  return entries;
}

export function learningsCommand(sessionFilter?: string): void {
  const wolfDir = getWolfDir();
  const sessionsDir = path.join(wolfDir, "sessions");

  if (!fs.existsSync(sessionsDir)) {
    console.log("No pending proposals found");
    return;
  }

  const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  const entries: ProposalEntry[] = [];

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    if (sessionFilter && dirent.name !== sessionFilter) continue;

    const sessionDir = path.join(sessionsDir, dirent.name);
    let parsed: ProposalEntry[];
    try {
      parsed = parseProposals(sessionDir, dirent.name);
    } catch {
      process.stderr.write(`OpenWolf: cannot read session directory ${dirent.name}, skipping\n`);
      continue;
    }

    entries.push(...parsed);
  }

  listProposals(entries);
}

export async function learningsMergeCommand(): Promise<void> {
  const entries = collectAllEntries();

  if (entries.length === 0) {
    console.log("No pending proposals found");
    return;
  }

  console.log("");
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const preview = e.content.replace(/\n/g, " ");
    console.log(`  ${(i + 1).toString().padEnd(3)} [${e.sessionId}] ${e.timestamp} → ${e.target}`);
    console.log(`      ${preview.length > 70 ? preview.slice(0, 67) + "..." : preview}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const input = await new Promise<string>((resolve) => {
    rl.question("\nEnter numbers to merge (e.g. 1,3,5 or 1-5), or 'a' for all, or 'q' to cancel: ", resolve);
  });

  rl.close();

  if (input.trim().toLowerCase() === "q" || input.trim() === "") {
    console.log("Cancelled.");
    return;
  }

  let indices: Set<number> | null;
  if (input.trim().toLowerCase() === "a") {
    indices = new Set(entries.map((_, i) => i));
  } else {
    const parsed = parseSelection(input, entries.length);
    if (!parsed) {
      console.log("Invalid selection. Cancelled.");
      return;
    }
    indices = parsed;
  }

  if (indices!.size === 0) {
    console.log("No entries selected. Cancelled.");
    return;
  }

  const selected = (indices as Set<number>).size === 1 ? "1 proposal" : `${(indices as Set<number>).size} proposals`;
  const confirmRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    confirmRl.question(`Merge ${selected}? [y/N] `, resolve);
  });
  confirmRl.close();

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled.");
    return;
  }

  const wolfDir = getWolfDir();
  const results: { entry: ProposalEntry; status: "success" | "failed" }[] = [];

  const idxSet = indices as Set<number>;
  for (const idx of [...idxSet].sort((a, b) => a - b)) {
    const entry = entries[idx];
    const targetPath = path.join(wolfDir, entry.target + ".md");
    const appendText = "\n" + entry.content.trim() + "\n";

    try {
      await withFileLock(targetPath, () => {
        fs.appendFileSync(targetPath, appendText, "utf-8");
      });
      results.push({ entry, status: "success" });
    } catch (err) {
      process.stderr.write(
        `OpenWolf: failed to merge entry from session ${entry.sessionId} to ${entry.target}.md: ${err instanceof Error ? err.message : String(err)}\n`
      );
      results.push({ entry, status: "failed" });
    }
  }

  const successEntries = results.filter((r) => r.status === "success").map((r) => r.entry);
  const failedCount = results.filter((r) => r.status === "failed").length;

  const consumedBySession = new Map<string, ProposalEntry[]>();
  for (const entry of successEntries) {
    const existing = consumedBySession.get(entry.sessionId) || [];
    existing.push(entry);
    consumedBySession.set(entry.sessionId, existing);
  }

  for (const [sessionId, consumed] of consumedBySession) {
    const sessionsDir = path.join(wolfDir, "sessions", sessionId);
    const stagingPath = path.join(sessionsDir, "proposed-learnings.md");

    const currentRaw = readText(stagingPath);
    if (!currentRaw) continue;

    const remaining: string[] = [];
    const currentBlocks = currentRaw.split("\n## ");

    for (const block of currentBlocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const fullBlock = "## " + trimmed;

      const isConsumed = consumed.some((c) => fullBlock.includes(c.timestamp) && fullBlock.includes("→ " + c.target));
      if (!isConsumed) {
        remaining.push(fullBlock);
      }
    }

    const remainingContent = remaining.join("\n") + (remaining.length > 0 ? "\n" : "");
    if (remainingContent.trim()) {
      fs.writeFileSync(stagingPath, remainingContent, "utf-8");
    } else {
      try { fs.unlinkSync(stagingPath); } catch {}
    }

    const archivePath = path.join(sessionsDir, "merged-learnings.md");
    const archiveContent = consumed.map((e) => e.raw.trim()).join("\n") + "\n";
    fs.appendFileSync(archivePath, archiveContent, "utf-8");
  }

  console.log(`Merged ${successEntries.length} proposal(s) into cerebrum.md/anatomy.md`);
  if (failedCount > 0) {
    process.stderr.write(
      `OpenWolf: ${failedCount} of ${results.length} entries could not be merged. See warnings above.\n`
    );
  }
}

function parseSelection(input: string, max: number): Set<number> | null {
  const parts = input.split(",").map((p) => p.trim());
  const indices = new Set<number>();

  const rangeRegex = /^(\d+)(?:-(\d+))?$/;

  for (const part of parts) {
    const match = part.match(rangeRegex);
    if (!match) return null;

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;

    if (start < 1 || end < 1 || start > max || end > max) return null;
    if (start > end) return null;

    for (let i = start; i <= end; i++) {
      indices.add(i - 1);
    }
  }

  return indices;
}
