import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { withFileLock } from "./wolf-lock.js";

export interface BugEntry {
  id: string;
  timestamp: string;
  error_message: string;
  file: string;
  line?: number;
  root_cause: string;
  fix: string;
  tags: string[];
  related_bugs: string[];
  occurrences: number;
  last_seen: string;
}

export function newBugId(): string {
  return `bug-${crypto.randomUUID().slice(0, 8)}`;
}

export function bugLogPath(wolfDir: string): string {
  return path.join(wolfDir, "buglog.ndjson");
}

export function readBugEntries(wolfDir: string): BugEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(bugLogPath(wolfDir), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(`OpenWolf: failed to read buglog.ndjson (${err instanceof Error ? err.message : String(err)})\n`);
    }
    return [];
  }
  const out: BugEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as BugEntry); } catch { /* skip torn/corrupt line */ }
  }
  return out;
}

export function appendBugEntry(wolfDir: string, entry: BugEntry): void {
  const p = bugLogPath(wolfDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  withFileLock(p, () => {
    fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf-8");
  });
}

export function countBugEntries(wolfDir: string): number {
  return readBugEntries(wolfDir).length;
}
