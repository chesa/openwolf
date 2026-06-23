/**
 * shared.ts — public API of the hook subsystem (D-03).
 *
 * This file is a thin barrel. It re-exports the 18 named values and 1 type
 * from the six internal wolf-* modules below. Consumers (the 6 hook files,
 * the scanner, and shared.test.ts) import from `./shared.js` and continue
 * to work unchanged (HOOK-02, COMPAT-01).
 *
 * The wolf-* modules are INTERNAL to the hook build. New code that wants a
 * utility should import it from `./shared.js`, not directly from a wolf-*
 * module — those are an implementation detail and may be reorganized.
 */

export { getWolfDir, getSessionDir, getWorktreeContext, normalizePath } from "./wolf-paths.js";

export { ensureSessionDir, ensureWolfDir, isWolfFile, readMarkdown, appendMarkdown } from "./wolf-files.js";

export { readJSON, writeJSON, updateJSON } from "./wolf-json.js";

export { withFileLock } from "./wolf-lock.js";

export { AnatomyEntry, parseAnatomy, serializeAnatomy } from "./wolf-anatomy.js";

export { extractDescription } from "./wolf-describe.js";

export { estimateTokens, timestamp, timeShort, readStdin } from "./wolf-misc.js";

export { appendBugEntry, readBugEntries, countBugEntries, newBugId, bugLogPath } from "./buglog-ndjson.js";

export type { WorktreeContext } from "./wolf-paths.js";
export type { BugEntry } from "./buglog-ndjson.js";
