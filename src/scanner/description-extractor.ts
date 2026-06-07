import * as fs from "node:fs";
import * as path from "node:path";

import { extractWeb } from "./extractors/extract-web.js";
import { extractSystems } from "./extractors/extract-systems.js";
import { extractScripting } from "./extractors/extract-scripting.js";
import { extractData } from "./extractors/extract-data.js";

// ─── Known files ─────────────────────────────────────────────
const KNOWN_FILES: Record<string, string> = {
  // JS/TS ecosystem
  "package.json": "Node.js package manifest",
  "package-lock.json": "npm lock file",
  "pnpm-lock.yaml": "pnpm lock file",
  "yarn.lock": "Yarn lock file",
  "bun.lockb": "Bun lock file",
  "tsconfig.json": "TypeScript configuration",
  "tsconfig.build.json": "TypeScript build configuration",
  "tsconfig.hooks.json": "TypeScript hooks build configuration",
  ".eslintrc.json": "ESLint configuration",
  ".eslintrc.js": "ESLint configuration",
  ".eslintrc.cjs": "ESLint configuration",
  "eslint.config.js": "ESLint flat configuration",
  "eslint.config.mjs": "ESLint flat configuration",
  "biome.json": "Biome linter/formatter configuration",
  ".prettierrc": "Prettier configuration",
  ".prettierrc.json": "Prettier configuration",
  "prettier.config.js": "Prettier configuration",
  // Build tools
  "vite.config.ts": "Vite build configuration",
  "vite.config.js": "Vite build configuration",
  "next.config.js": "Next.js configuration",
  "next.config.mjs": "Next.js configuration",
  "next.config.ts": "Next.js configuration",
  "nuxt.config.ts": "Nuxt configuration",
  "nuxt.config.js": "Nuxt configuration",
  "svelte.config.js": "SvelteKit configuration",
  "astro.config.mjs": "Astro configuration",
  "astro.config.ts": "Astro configuration",
  "remix.config.js": "Remix configuration",
  "tailwind.config.js": "Tailwind CSS configuration",
  "tailwind.config.ts": "Tailwind CSS configuration",
  "postcss.config.js": "PostCSS configuration",
  "postcss.config.cjs": "PostCSS configuration",
  ".babelrc": "Babel configuration",
  "babel.config.js": "Babel configuration",
  "webpack.config.js": "Webpack configuration",
  "rollup.config.js": "Rollup configuration",
  "turbo.json": "Turborepo configuration",
  // Test
  "jest.config.js": "Jest test configuration",
  "jest.config.ts": "Jest test configuration",
  "vitest.config.ts": "Vitest test configuration",
  "playwright.config.ts": "Playwright test configuration",
  "cypress.config.ts": "Cypress test configuration",
  // Git
  ".gitignore": "Git ignore rules",
  ".gitattributes": "Git attributes",
  // Docker
  "Dockerfile": "Docker container definition",
  "docker-compose.yml": "Docker Compose services",
  "docker-compose.yaml": "Docker Compose services",
  ".dockerignore": "Docker ignore rules",
  // CI/CD
  ".github/workflows/ci.yml": "GitHub Actions CI pipeline",
  ".gitlab-ci.yml": "GitLab CI pipeline",
  "Jenkinsfile": "Jenkins pipeline",
  // Rust
  "Cargo.toml": "Rust package manifest",
  "Cargo.lock": "Rust dependency lock file",
  // Go
  "go.mod": "Go module definition",
  "go.sum": "Go dependency checksums",
  // Python
  "pyproject.toml": "Python project configuration",
  "setup.py": "Python package setup",
  "setup.cfg": "Python package configuration",
  "requirements.txt": "Python dependencies",
  "Pipfile": "Pipenv dependencies",
  "poetry.lock": "Poetry lock file",
  // Ruby
  "Gemfile": "Ruby dependencies",
  "Gemfile.lock": "Ruby dependency lock",
  "Rakefile": "Ruby make-like build tasks",
  // PHP
  "composer.json": "PHP package manifest",
  "composer.lock": "PHP dependency lock",
  "artisan": "Laravel CLI entry point",
  // Java/Kotlin
  "build.gradle": "Gradle build configuration",
  "build.gradle.kts": "Gradle Kotlin build configuration",
  "pom.xml": "Maven project configuration",
  "settings.gradle": "Gradle settings",
  "settings.gradle.kts": "Gradle Kotlin settings",
  // C#/.NET
  "Program.cs": "Application entry point",
  "Startup.cs": "ASP.NET startup configuration",
  "appsettings.json": ".NET application settings",
  "global.json": ".NET SDK configuration",
  // Swift
  "Package.swift": "Swift package manifest",
  // Dart/Flutter
  "pubspec.yaml": "Dart/Flutter package manifest",
  "pubspec.lock": "Dart dependency lock",
  // DB/Schema
  "schema.sql": "Database schema",
  "schema.prisma": "Prisma database schema",
  "drizzle.config.ts": "Drizzle ORM configuration",
  // Server
  ".htaccess": "Apache configuration",
  "nginx.conf": "Nginx configuration",
  // Misc
  ".editorconfig": "Editor configuration",
  ".env.example": "Environment variable template",
  "LICENSE": "Project license",
  "README.md": "Project documentation",
  "CHANGELOG.md": "Change log",
  "deno.json": "Deno configuration",
  "Makefile": "Make build targets",
  "CMakeLists.txt": "CMake build configuration",
};

const MAX_DESC = 150;
const READ_BYTES = 12288; // 12KB for better analysis

// ─── Main entry ──────────────────────────────────────────────
export function extractDescription(filePath: string): string {
  const basename = path.basename(filePath);

  if (KNOWN_FILES[basename]) return KNOWN_FILES[basename];

  // Also check directory-prefixed entries (e.g., ".github/workflows/ci.yml")
  // against the full path — basename alone won't match these.
  const dirKey = Object.keys(KNOWN_FILES).find(
    k => k.includes("/") && (filePath === k || filePath.endsWith(path.sep + k) || filePath.endsWith("/" + k))
  );
  if (dirKey) return KNOWN_FILES[dirKey];

  let content: string;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, READ_BYTES, 0);
    fs.closeSync(fd);
    content = buf.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return "";
  }
  if (!content.trim()) return "";

  const ext = path.extname(basename).toLowerCase();

  // package.json with description
  if (basename === "package.json") {
    try {
      const pkg = JSON.parse(content);
      return (pkg.description as string) || (pkg.name as string) || "Node.js package";
    } catch { return "Node.js package manifest"; }
  }

  // Markdown heading
  if (ext === ".md" || ext === ".mdx") {
    const m = content.match(/^#{1,2}\s+(.+)$/m);
    if (m) return m[1].trim();
  }

  // HTML title
  if (ext === ".html" || ext === ".htm") {
    const m = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
  }

  // Docblock (JSDoc, PHPDoc, Rustdoc, Javadoc, C# XML doc)
  const doc = extractDocblock(content, ext);
  if (doc) return doc;

  // Header comment
  const hdr = extractHeaderComment(content, ext);
  if (hdr) return hdr;

  // Language-specific smart extraction
  const smart = extractSmart(content, ext, basename, filePath);
  if (smart) return smart;

  // Generic fallback
  return extractGenericFallback(content);
}

// ─── Docblock extraction ─────────────────────────────────────
function extractDocblock(content: string, ext: string): string {
  // JSDoc / PHPDoc / Javadoc / Kotlin KDoc: /** ... */
  const jsdoc = content.match(/\/\*\*\s*\n?\s*\*?\s*(.+)/);
  if (jsdoc) {
    const line = jsdoc[1].replace(/\*\/$/, "").trim();
    if (line && !line.startsWith("@") && line.length > 5) return line;
  }

  // Python docstring
  if (ext === ".py") {
    const dm = content.match(/^(?:#[^\n]*\n)*\s*(?:"""(.+?)"""|'''(.+?)''')/s);
    if (dm) {
      const first = (dm[1] || dm[2]).split("\n")[0].trim();
      if (first && first.length > 3) return first;
    }
  }

  // Rust doc comments: /// or //!
  if (ext === ".rs") {
    const lines = content.split("\n");
    for (const line of lines.slice(0, 20)) {
      const m = line.match(/^\s*(?:\/\/\/|\/\/!)\s*(.+)/);
      if (m && m[1].length > 5) return m[1].trim();
    }
  }

  // Go package comment
  if (ext === ".go") {
    const m = content.match(/\/\/\s*Package\s+\w+\s+(.*)/);
    if (m) return m[1].trim();
  }

  // C# XML doc: /// <summary>...</summary>
  if (ext === ".cs") {
    const m = content.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/);
    if (m) {
      const text = m[1].replace(/\/\/\/\s*/g, "").replace(/\s+/g, " ").trim();
      if (text.length > 5) return text;
    }
  }

  // Elixir @moduledoc
  if (ext === ".ex" || ext === ".exs") {
    const m = content.match(/@moduledoc\s+"""\s*\n\s*(.*)/);
    if (m) return m[1].trim();
  }

  return "";
}

// ─── Header comment ──────────────────────────────────────────
function extractHeaderComment(content: string, ext: string): string {
  const lines = content.split("\n");
  for (const line of lines.slice(0, 15)) {
    const t = line.trim();
    if (!t || t === "<?php" || t.startsWith("#!") || t.startsWith("package ") ||
        t.startsWith("namespace") || t.startsWith("use ") || t.startsWith("import ") ||
        t.startsWith("from ") || t.startsWith("require") || t.startsWith("module ")) continue;

    const cm = t.match(/^(?:\/\/|#|--)\s*(.+)/);
    if (cm) {
      const text = cm[1].trim();
      if (text.length > 5 && !isGenericComment(text)) return text;
    }

    if (!t.startsWith("//") && !t.startsWith("#") && !t.startsWith("/*") &&
        !t.startsWith("*") && !t.startsWith("--")) break;
  }
  return "";
}

function isGenericComment(text: string): boolean {
  const l = text.toLowerCase();
  return l.startsWith("strict") || l.startsWith("copyright") || l.startsWith("license") ||
    l.startsWith("@author") || l.startsWith("@package") || l.startsWith("@license") ||
    l.startsWith("generated") || l.startsWith("auto-generated") || l === "use strict" ||
    l.startsWith("eslint-") || l.startsWith("prettier-") || l.startsWith("nolint") ||
    /^[-=]{3,}$/.test(text);
}

// ─── Smart extraction router ─────────────────────────────────
function extractSmart(content: string, ext: string, basename: string, filePath: string): string {
  return extractWeb(content, ext, basename, filePath)
    || extractSystems(content, ext, basename, filePath)
    || extractScripting(content, ext, basename, filePath)
    || extractData(content, ext, basename, filePath)
    || "";
}

// ─── Generic fallback ────────────────────────────────────────
function extractGenericFallback(content: string): string {
  // Try exports
  const exp = content.match(/export\s+(?:default\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/);
  if (exp) return `Exports ${exp[1]}`;

  // Try class with methods
  const cls = content.match(/(?:function|class|const|interface|type|enum)\s+(\w+)/);
  if (cls) {
    const name = cls[1];
    const methods = (content.match(/(?:public\s+)?(?:async\s+)?(?:function\s+|(?:get|set)\s+)(\w+)\s*\(/g) || [])
      .map(m => m.match(/(\w+)\s*\(/)?.[1])
      .filter(n => n && n !== name && n !== "__construct" && n !== "constructor") as string[];

    if (methods.length > 0 && methods.length <= 5) return `${name}: ${methods.join(", ")}`;
    if (methods.length > 5) return `${name}: ${methods.slice(0, 3).join(", ")} + ${methods.length - 3} more`;
    return `Declares ${name}`;
  }

  return "";
}

// ─── Utility ─────────────────────────────────────────────────
export function capDescription(desc: string, max: number = MAX_DESC): string {
  if (desc.length <= max) return desc;
  return desc.slice(0, max - 3) + "...";
}