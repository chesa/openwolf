/**
 * extractDescription — compact, hook-relevant subset.
 *
 * This is a deliberately smaller version of the canonical extractor in
 * `src/scanner/description-extractor.ts`. The hook-time version is called by
 * `post-write.ts` for every file written during a session, where the file
 * types are overwhelmingly: .ts, .tsx, .js, .jsx, .md, .mdx, .json, .py, .rs,
 * .go, .ex, .exs. Less-common languages fall through to the "last-resort"
 * generic decl-finder at the end of this file; the full multi-language
 * coverage is re-applied by the next anatomy scan via the scanner's
 * canonical extractor.
 *
 * Intentionally omitted (return ""; covered by `description-extractor.ts`):
 * server-side framework dialects for PHP, JVM languages, .NET-specific
 * controller/DbContext branches, Ruby/Rails conventions, SwiftUI, Dart/Flutter,
 * Vue/Svelte/Astro components, stylesheet rule counters, SQL DDL, Proto and
 * GraphQL type scanners, CI / K8s / Compose YAML heuristics, TOML description
 * fields, Elixir Phoenix-specific branches, Lua function lists, Zig pub
 * items. See 02-RESEARCH.md §"Shrinkage Plan" for the original line ranges
 * (in the pre-split src/hooks/shared.ts) that this module does not carry.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export function extractDescription(filePath: string): string {
  const MAX_DESC = 150;
  const basename = path.basename(filePath);
  const ext = path.extname(basename).toLowerCase();
  const known: Record<string, string> = {
    "package.json": "Node.js package manifest",
    "tsconfig.json": "TypeScript configuration",
    ".gitignore": "Git ignore rules",
    "README.md": "Project documentation",
    "composer.json": "PHP package manifest",
    "requirements.txt": "Python dependencies",
    "schema.sql": "Database schema",
    "Dockerfile": "Docker container definition",
    "docker-compose.yml": "Docker Compose services",
    "Cargo.toml": "Rust package manifest",
    "go.mod": "Go module definition",
    "Gemfile": "Ruby dependencies",
    "pubspec.yaml": "Dart/Flutter package manifest",
  };
  if (known[basename]) return known[basename];

  let content: string;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12288); // 12KB
    const n = fs.readSync(fd, buf, 0, 12288, 0);
    fs.closeSync(fd);
    content = buf.subarray(0, n).toString("utf-8");
  } catch {
    return "";
  }
  if (!content.trim()) return "";

  const cap = (s: string) => s.length <= MAX_DESC ? s : s.slice(0, MAX_DESC - 3) + "...";

  // Markdown heading
  if (ext === ".md" || ext === ".mdx") {
    const m = content.match(/^#{1,2}\s+(.+)$/m);
    if (m) return cap(m[1].trim());
  }

  // HTML title
  if (ext === ".html" || ext === ".htm") {
    const m = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return cap(m[1].trim());
  }

  // JSDoc / PHPDoc / Javadoc — first meaningful line
  const jm = content.match(/\/\*\*\s*\n?\s*\*?\s*(.+)/);
  if (jm) {
    const l = jm[1].replace(/\*\/$/, "").trim();
    if (l && !l.startsWith("@") && l.length > 5) return cap(l);
  }

  // Python docstring
  if (ext === ".py") {
    const dm = content.match(/^(?:#[^\n]*\n)*\s*(?:"""(.+?)"""|'''(.+?)''')/s);
    if (dm) {
      const first = (dm[1] || dm[2]).split("\n")[0].trim();
      if (first && first.length > 3) return cap(first);
    }
  }

  // Rust doc comments
  if (ext === ".rs") {
    const lines = content.split("\n");
    for (const line of lines.slice(0, 20)) {
      const m = line.match(/^\s*(?:\/\/\/|\/\/!)\s*(.+)/);
      if (m && m[1].length > 5) return cap(m[1].trim());
    }
  }

  // Go package comment
  if (ext === ".go") {
    const m = content.match(/\/\/\s*Package\s+\w+\s+(.*)/);
    if (m) return cap(m[1].trim());
  }

  // C# XML doc
  if (ext === ".cs") {
    const m = content.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/);
    if (m) {
      const text = m[1].replace(/\/\/\/\s*/g, "").replace(/\s+/g, " ").trim();
      if (text.length > 5) return cap(text);
    }
  }

  // Elixir @moduledoc
  if (ext === ".ex" || ext === ".exs") {
    const m = content.match(/@moduledoc\s+"""\s*\n\s*(.*)/);
    if (m) return cap(m[1].trim());
  }

  // Header comment (skip generic ones)
  const hdrLines = content.split("\n");
  for (const line of hdrLines.slice(0, 15)) {
    const t = line.trim();
    if (!t || t === "<?php" || t.startsWith("#!") || t.startsWith("namespace") || t.startsWith("use ") || t.startsWith("import ") || t.startsWith("from ") || t.startsWith("require") || t.startsWith("module ")) continue;
    const cm = t.match(/^(?:\/\/|#|--)\s*(.+)/);
    if (cm) {
      const text = cm[1].trim();
      const lower = text.toLowerCase();
      if (text.length > 5 && !lower.startsWith("copyright") && !lower.startsWith("license") && !lower.startsWith("@") && !lower.startsWith("strict") && !lower.startsWith("generated") && !lower.startsWith("eslint-") && !lower.startsWith("nolint")) {
        return cap(text);
      }
    }
    if (!t.startsWith("//") && !t.startsWith("#") && !t.startsWith("/*") && !t.startsWith("*") && !t.startsWith("--")) break;
  }

  // ─── TS/JS/React/Next.js ─────────────────────────────────
  if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
    // React component
    if (ext === ".tsx" || ext === ".jsx") {
      const comp = content.match(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+(\w+)/);
      const parts: string[] = [];
      if (comp) parts.push(comp[1]);
      const renders: string[] = [];
      if (/<(?:form|Form)/i.test(content)) renders.push("form");
      if (/<(?:table|Table|DataTable)/i.test(content)) renders.push("table");
      if (/<(?:dialog|Dialog|Modal|Drawer)/i.test(content)) renders.push("modal");
      if (renders.length) parts.push(`renders ${renders.join(", ")}`);
      if (parts.length) return cap(parts.join(" — "));
    }

    // Next.js conventions
    if (basename === "page.tsx" || basename === "page.js") return "Next.js page component";
    if (basename === "layout.tsx" || basename === "layout.js") return "Next.js layout";
    if (basename === "route.ts" || basename === "route.js") {
      const methods = [...new Set((content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g) || [])
        .map(m => m.match(/(GET|POST|PUT|PATCH|DELETE)/)?.[1]))].filter(Boolean);
      return methods.length ? `Next.js API route: ${methods.join(", ")}` : "Next.js API route";
    }

    // Express/Fastify routes
    const routeHits = content.match(/\.(get|post|put|patch|delete)\s*\(\s*['`"]/g);
    if (routeHits && routeHits.length > 0) {
      const methods = [...new Set(routeHits.map(r => r.match(/\.(get|post|put|patch|delete)/)?.[1]?.toUpperCase()))];
      return cap(`API routes: ${methods.join(", ")} (${routeHits.length} endpoints)`);
    }

    // tRPC router
    if (content.includes("createTRPCRouter") || content.includes("publicProcedure")) {
      const procs = (content.match(/\.(query|mutation|subscription)\s*\(/g) || []).length;
      return procs ? `tRPC router: ${procs} procedures` : "tRPC router";
    }

    // Zod schemas
    if (content.includes("z.object") || content.includes("z.string")) {
      const schemas = (content.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*z\./g) || [])
        .map(s => s.match(/(?:const|let)\s+(\w+)/)?.[1]).filter(Boolean);
      if (schemas.length) return cap(`Zod schemas: ${schemas.slice(0, 4).join(", ")}${schemas.length > 4 ? ` + ${schemas.length - 4} more` : ""}`);
    }

    // Exports summary
    const exports = (content.match(/export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/g) || [])
      .map(e => e.match(/(\w+)$/)?.[1]).filter(Boolean) as string[];
    if (exports.length > 0 && exports.length <= 5) return `Exports ${exports.join(", ")}`;
    if (exports.length > 5) return cap(`Exports ${exports.slice(0, 4).join(", ")} + ${exports.length - 4} more`);
  }

  // ─── Python / Django / FastAPI / Flask ────────────────────
  if (ext === ".py") {
    // Django model
    if (content.includes("models.Model")) {
      const cls = content.match(/class\s+(\w+)\(.*models\.Model\)/);
      const fields = (content.match(/^\s+\w+\s*=\s*models\.\w+/gm) || []).length;
      return cap(`Model: ${cls?.[1] || "unknown"}, ${fields} fields`);
    }
    // FastAPI/Flask routes
    if (content.includes("@router.") || content.includes("@app.")) {
      const routes = (content.match(/@(?:router|app)\.(get|post|put|patch|delete)\s*\(/g) || []);
      return cap(routes.length ? `API: ${routes.length} endpoints` : "API router");
    }
    // Pydantic
    if (content.includes("BaseModel") && content.includes("Field(")) {
      const cls = content.match(/class\s+(\w+)\(.*BaseModel\)/);
      return cls ? `Pydantic: ${cls[1]}` : "Pydantic model";
    }
    // Celery
    if (content.includes("@shared_task") || content.includes("@app.task")) {
      const tasks = (content.match(/def\s+(\w+)/g) || []).map(m => m.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];
      return cap(tasks.length ? `Celery tasks: ${tasks.join(", ")}` : "Celery task");
    }
    // Generic
    const pyClass = content.match(/class\s+(\w+)/);
    const funcs = (content.match(/def\s+(\w+)/g) || []).map(f => f.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];
    if (pyClass && funcs.length > 0) return cap(funcs.length > 4 ? `${pyClass[1]}: ${funcs.slice(0, 4).join(", ")} + ${funcs.length - 4} more` : `${pyClass[1]}: ${funcs.join(", ")}`);
    if (funcs.length > 0) return cap(funcs.slice(0, 4).join(", "));
  }

  // ─── Go ──────────────────────────────────────────────────
  if (ext === ".go") {
    const handlers = (content.match(/func\s+(\w+)\s*\(\s*\w+\s+http\.ResponseWriter/g) || [])
      .map(m => m.match(/func\s+(\w+)/)?.[1]).filter(Boolean);
    if (handlers.length) return cap(`HTTP handlers: ${handlers.slice(0, 5).join(", ")}`);
    const iface = content.match(/type\s+(\w+)\s+interface\s*\{/);
    if (iface) return `Interface: ${iface[1]}`;
    const structM = content.match(/type\s+(\w+)\s+struct\s*\{/);
    if (structM) return `Struct: ${structM[1]}`;
    const funcs = (content.match(/^func\s+(\w+)/gm) || []).map(m => m.match(/func\s+(\w+)/)?.[1]).filter(n => n && n[0] === n[0].toUpperCase()) as string[];
    if (funcs.length) return cap(funcs.slice(0, 5).join(", "));
  }

  // ─── Rust ────────────────────────────────────────────────
  if (ext === ".rs") {
    const structM = content.match(/pub\s+struct\s+(\w+)/);
    if (structM) {
      const methods = (content.match(/pub\s+(?:async\s+)?fn\s+(\w+)/g) || []).map(m => m.match(/fn\s+(\w+)/)?.[1]).filter(Boolean);
      return cap(methods.length ? `${structM[1]}: ${methods.slice(0, 4).join(", ")}` : `Struct: ${structM[1]}`);
    }
    const traitM = content.match(/pub\s+trait\s+(\w+)/);
    if (traitM) return `Trait: ${traitM[1]}`;
    const enumM = content.match(/pub\s+enum\s+(\w+)/);
    if (enumM) return `Enum: ${enumM[1]}`;
    const fns = (content.match(/pub\s+(?:async\s+)?fn\s+(\w+)/g) || []).map(m => m.match(/fn\s+(\w+)/)?.[1]).filter(Boolean);
    if (fns.length) return cap(fns.slice(0, 5).join(", "));
  }

  // Last resort
  const declM = content.match(/(?:function|class|const|interface|type|enum)\s+(\w+)/);
  if (declM) {
    const name = declM[1];
    const methods = (content.match(/(?:public\s+)?(?:async\s+)?(?:function\s+|(?:get|set)\s+)(\w+)\s*\(/g) || [])
      .map(m => m.match(/(\w+)\s*\(/)?.[1]).filter(n => n && n !== name && n !== "__construct" && n !== "constructor") as string[];
    if (methods.length > 0 && methods.length <= 5) return cap(`${name}: ${methods.join(", ")}`);
    if (methods.length > 5) return cap(`${name}: ${methods.slice(0, 3).join(", ")} + ${methods.length - 3} more`);
    return `Declares ${name}`;
  }
  return "";
}
