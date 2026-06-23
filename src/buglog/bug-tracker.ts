import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";

interface BugEntry {
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

interface BugLog {
  version: number;
  bugs: BugEntry[];
}

export function getBugLogPath(wolfDir: string): string {
  return path.join(wolfDir, "buglog.ndjson");
}

export function readBugLog(wolfDir: string): BugLog {
  let raw: string;
  try {
    raw = fs.readFileSync(getBugLogPath(wolfDir), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(
        `OpenWolf: failed to read buglog.ndjson (${err instanceof Error ? err.message : String(err)})\n`
      );
    }
    return { version: 1, bugs: [] };
  }
  const bugs: BugEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      bugs.push(JSON.parse(t) as BugEntry);
    } catch {
      /* skip blank/torn/corrupt line */
    }
  }
  return { version: 1, bugs };
}

// Phase 1 is append-only; occurrence folding is a deferred `bug compact` follow-up.
export function logBug(
  wolfDir: string,
  bug: {
    error_message: string;
    file: string;
    line?: number;
    root_cause: string;
    fix: string;
    tags: string[];
  }
): void {
  const now = new Date().toISOString();
  const entry = {
    id: `bug-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    error_message: bug.error_message,
    file: bug.file,
    line: bug.line,
    root_cause: bug.root_cause,
    fix: bug.fix,
    tags: bug.tags,
    related_bugs: [],
    occurrences: 1,
    last_seen: now,
  };
  fs.mkdirSync(path.dirname(getBugLogPath(wolfDir)), { recursive: true });
  fs.appendFileSync(getBugLogPath(wolfDir), JSON.stringify(entry) + "\n", "utf-8");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\d+/g, "N").replace(/[^\w\s]/g, " ").trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalize(text).split(/\s+/).filter((w) => w.length > 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

interface ScoredBug {
  bug: BugEntry;
  score: number;
}

export function findSimilarBugs(wolfDir: string, errorMessage: string): ScoredBug[] {
  const bugLog = readBugLog(wolfDir);
  const normalizedInput = normalize(errorMessage);
  const inputTokens = tokenize(errorMessage);
  const results: ScoredBug[] = [];

  for (const bug of bugLog.bugs) {
    let score = 0;

    // Exact substring match
    if (
      normalize(bug.error_message).includes(normalizedInput) ||
      normalizedInput.includes(normalize(bug.error_message))
    ) {
      score += 1.0;
    }

    // Word overlap (jaccard)
    const bugTokens = tokenize(bug.error_message);
    score += jaccardSimilarity(inputTokens, bugTokens) * 0.5;

    if (score > 0.3) {
      results.push({ bug, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function searchBugs(wolfDir: string, term: string): BugEntry[] {
  const bugLog = readBugLog(wolfDir);
  const lower = term.toLowerCase();
  return bugLog.bugs.filter(
    (b) =>
      b.error_message.toLowerCase().includes(lower) ||
      b.root_cause.toLowerCase().includes(lower) ||
      b.fix.toLowerCase().includes(lower) ||
      b.tags.some((t) => t.toLowerCase().includes(lower)) ||
      b.file.toLowerCase().includes(lower)
  );
}
