/**
 * Shared file-extension classification sets used by both the anatomy
 * scanner and the token estimator.  A single source of truth prevents
 * the two consumers from drifting out of sync.
 *
 * Ratios applied downstream:
 *   code  → 3.5  chars/token
 *   prose → 4.0  chars/token
 *   mixed → 3.75 chars/token  (default, used for .html/.htm and unknowns)
 */

export const CODE_EXTENSIONS = new Set([
  ".ts", ".js", ".tsx", ".jsx", ".py", ".rs", ".go", ".java",
  ".c", ".cpp", ".h", ".css", ".scss", ".sql", ".sh", ".yaml",
  ".yml", ".json", ".toml", ".xml", ".dart",
  ".kt", ".kts", ".swift", ".m", ".mm",
  ".hpp", ".hh", ".cc", ".cxx",
  ".cs", ".rb", ".php", ".lua",
  ".vue", ".svelte",
  ".proto", ".graphql", ".gql", ".tf",
  ".bash", ".zsh", ".fish",
]);

// HTML/HTM intentionally excluded from CODE_EXTENSIONS — markup files
// contain prose content and attribute text alongside any embedded JS/CSS,
// so the mixed ratio (3.75) is more accurate than the code ratio (3.5).
// Classifying them as code causes token counts to be under-estimated,
// which can push users over their intended token budget.

export const PROSE_EXTENSIONS = new Set([".md", ".txt", ".rst", ".adoc"]);
