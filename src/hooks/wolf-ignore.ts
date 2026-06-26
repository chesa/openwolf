/**
 * wolf-ignore.ts — dependency-free shared matcher module (R6 / D10-01).
 *
 * Provides the canonical glob-pattern matcher and a dep-free root-gitignore
 * parser used by both the hook subsystem and the scanner. Zero node_modules
 * imports — this module is safe for inclusion in the hooks build
 * (tsconfig.hooks.json C2 boundary).
 *
 * Public API (re-exported via shared.ts):
 *   shouldExclude(relPath, excludePatterns)
 *   parseAndMatchGitignore(relPath, content)
 *   DEFAULT_EXCLUDE_PATTERNS
 *   ALWAYS_EXCLUDE_FILES
 *
 * Private (not exported — D10-09 / R6-D2):
 *   globToRegExp(glob)
 *   matchesPattern(relPath, parts, pattern)
 *   parseGitignoreLine(raw)
 */

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

/** Files that should never appear in anatomy (secrets, env files). */
export const ALWAYS_EXCLUDE_FILES = new Set([
    ".env",
    ".env.local",
    ".env.production",
    ".env.staging",
    ".env.development",
]);

/** Default patterns to exclude from anatomy scans. */
export const DEFAULT_EXCLUDE_PATTERNS = [
    "node_modules", ".git", "dist", "build", ".wolf",
    ".next", ".nuxt", "coverage", "__pycache__", ".cache",
    "target", ".vscode", ".idea", ".turbo", ".vercel",
    ".netlify", ".output", "*.min.js", "*.min.css",
];

// ---------------------------------------------------------------------------
// Private: glob → RegExp (PRIVATE — not exported, D10-09)
// ---------------------------------------------------------------------------

/**
 * Translate a glob pattern into an anchored RegExp.
 *   `*`  matches any run of characters within a single path segment (no "/")
 *   `**` matches any run of characters across segments (including "/")
 * Every other regex metacharacter is escaped so the rest of the pattern
 * matches literally.
 *
 * ReDoS-safe: only emits `[^/]*` and `.*` — no backreferences, no nested
 * quantifiers (T-10-01).
 */
function globToRegExp(glob: string): RegExp {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                if (glob[i + 2] === "/") {
                    re += "(?:.*/)?"; // **/ matches zero or more segments
                    i += 2; // consume the trailing "/"
                } else {
                    re += ".*"; // ** spans path segments
                    i++; // consume the second "*"
                }
            } else {
                re += "[^/]*"; // * stays within one segment
            }
        } else if (c === "?") {
            re += "[^/]"; // ? matches any single character within a segment
        } else if ("\\^$.|+()[]{}".includes(c)) {
            re += "\\" + c;
        } else {
            re += c;
        }
    }
    return new RegExp(`^${re}$`);
}

// ---------------------------------------------------------------------------
// Private: single-pattern matcher (PRIVATE — not exported, D10-09)
// ---------------------------------------------------------------------------

/**
 * Decide whether one exclude pattern matches a project-relative path. All
 * patterns are anchored at the project root. Supported forms:
 *   "node_modules"        bare name   -> matches that segment at ANY depth
 *   "*.min.js"            ext glob    -> matches any path ending in ".min.js"
 *   "docs/archive"        path prefix  -> matches that dir AND everything under it
 *   "docs/archive/*"     path glob   -> matches direct children
 *   ".claude/**\/cache"   path glob   -> double-star spans segments
 *   "tmp*"               name glob   -> matches any single segment by glob
 */
function matchesPattern(
    relPath: string,
    parts: string[],
    pattern: string
): boolean {
    if (pattern.length === 0) return false;

    // Leading slash -> root-anchored prefix/glob semantics.
    if (pattern.startsWith("/")) {
        const anchored = pattern.slice(1).replace(/\/+$/g, "");
        if (anchored.includes("*") || anchored.includes("?")) return globToRegExp(anchored).test(relPath);
        return relPath === anchored || relPath.startsWith(`${anchored}/`);
    }

    // Otherwise strip any trailing slash before applying normal logic.
    pattern = pattern.replace(/\/+$/g, "");

    // Extension glob (backward compatible): "*.min.js"
    if (pattern.startsWith("*.") && !pattern.includes("/")) {
        return relPath.endsWith(pattern.slice(1));
    }

    const hasSlash = pattern.includes("/");
    const hasGlob = pattern.includes("*") || pattern.includes("?");

    // Bare segment name (backward compatible): match at any depth.
    if (!hasSlash && !hasGlob) {
        return parts.includes(pattern);
    }

    if (hasSlash) {
        // Path pattern without a glob -> directory-prefix semantics: the named
        // path itself and everything beneath it.
        if (!hasGlob) {
            return relPath === pattern || relPath.startsWith(`${pattern}/`);
        }
        // Path pattern with a glob -> match against the full relative path.
        return globToRegExp(pattern).test(relPath);
    }

    // Single-segment glob (e.g. "tmp*") -> match any one path segment.
    const segRe = globToRegExp(pattern);
    return parts.some((p) => segRe.test(p));
}

// ---------------------------------------------------------------------------
// Public: shouldExclude
// ---------------------------------------------------------------------------

/**
 * Return true if relPath should be excluded based on ALWAYS_EXCLUDE_FILES and
 * the provided excludePatterns. Used by both the hook and the scanner.
 */
export function shouldExclude(
    relPath: string,
    excludePatterns: string[]
): boolean {
    const parts = relPath.split("/");
    const basename = parts[parts.length - 1];

    // Always exclude sensitive files regardless of config.
    if (ALWAYS_EXCLUDE_FILES.has(basename)) return true;
    // Also exclude .env.* variants not in the set (e.g., .env.backup).
    if (basename.startsWith(".env.") || basename === ".env") return true;

    for (const pattern of excludePatterns) {
        if (matchesPattern(relPath, parts, pattern)) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Private: gitignore line classifier
// ---------------------------------------------------------------------------

/** Internal representation of a parsed gitignore line. */
type GitignoreEntry =
    | { kind: "skip" }
    | { kind: "bare"; name: string }     // parts.includes (any depth)
    | { kind: "prefix"; prefix: string } // relPath startsWith (root-anchored)
    | { kind: "glob"; re: RegExp };      // globToRegExp result

/**
 * Parse a single raw gitignore line into its matching strategy.
 *
 * Supported subset (R6-D5 / D10-04):
 *   - blank / `#` comment / `!` negation → skip (fail-closed for negation)
 *   - trailing `/` stripped → bare-name / prefix / glob semantics
 *   - leading `/` → root-anchored prefix or glob
 *   - bare name (no `/`, no `*`) → any-depth segment match
 *   - `*` within a segment → glob
 *   - `**` spanning segments → glob
 */
function parseGitignoreLine(raw: string): GitignoreEntry {
    let line = raw.trim();
    // Unescape escaped gitignore tokens so they are not mistaken for comments,
    // negation, or literal backslashes (R6-D5 / D10-04).
    line = line.replace(/\\([#! ])/g, "$1");

    // Blank or comment → skip.
    if (!line || line.startsWith("#")) return { kind: "skip" };
    // Negation → fail-closed: treat as skip (over-exclusion acceptable, not a
    // leak — D10-05 / R6-D5). The scanner's `ignore` package is the backstop.
    if (line.startsWith("!")) return { kind: "skip" };

    // Strip trailing slash (directory hint → bare-name/prefix semantics).
    const stripped = line.endsWith("/") ? line.slice(0, -1) : line;

    // Leading slash → root-anchored.
    if (stripped.startsWith("/")) {
        const anchor = stripped.slice(1);
        if (anchor.includes("*") || anchor.includes("?")) return { kind: "glob", re: globToRegExp(anchor) };
        return { kind: "prefix", prefix: anchor };
    }

    // No slash and no glob → bare name (matches at any depth via parts.includes).
    if (!stripped.includes("/") && !stripped.includes("*") && !stripped.includes("?")) {
        return { kind: "bare", name: stripped };
    }

    // Glob pattern (contains `*` or `?`).
    if (stripped.includes("*") || stripped.includes("?")) return { kind: "glob", re: globToRegExp(stripped) };

    // Path without glob → prefix semantics.
    return { kind: "prefix", prefix: stripped };
}

// ---------------------------------------------------------------------------
// Public: parseAndMatchGitignore
// ---------------------------------------------------------------------------

/**
 * Return true if relPath should be excluded according to the provided
 * gitignore content (the subset described in R6-D5 / D10-04).
 *
 * - Parses content on every call (no caching, per R6-D3).
 * - Negation (`!`) lines are skipped (fail-closed — over-exclusion acceptable).
 * - Returns false for empty or all-comment content.
 * - relPath must already be forward-slash normalized (Pitfall 3).
 */
export function parseAndMatchGitignore(
    relPath: string,
    content: string
): boolean {
    if (!content) return false;
    const parts = relPath.split("/");
    const lines = content.split("\n");
    for (const raw of lines) {
        const entry = parseGitignoreLine(raw);
        switch (entry.kind) {
            case "skip":
                continue;
            case "bare":
                if (parts.includes(entry.name)) return true;
                break;
            case "prefix":
                if (relPath === entry.prefix || relPath.startsWith(entry.prefix + "/")) {
                    return true;
                }
                break;
            case "glob":
                // For extension globs like `*.log` (no `/` in the original pattern,
                // compiled as /^[^/]*\.log$/), the endsWith check is not directly
                // available — however, globToRegExp produces /^[^/]*\.log$/ which
                // only matches a single segment. To preserve the pre-existing scanner
                // behavior (*.ext matches the whole relPath, not just one segment),
                // we test the full relPath AND each individual segment.
                if (entry.re.test(relPath)) return true;
                if (parts.some((p) => entry.re.test(p))) return true;
                break;
        }
    }
    return false;
}
