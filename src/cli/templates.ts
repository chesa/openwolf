/**
 * Find the templates directory (either src/templates or dist/templates).
 * Single source of truth — previously duplicated across init.ts and update.ts.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function findTemplatesDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../templates"),
    path.resolve(__dirname, "../../src/templates"),
    path.resolve(__dirname, "../../dist/templates"),
    path.resolve(__dirname, "../templates"),
    path.resolve(__dirname, "templates"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Templates directory not found");
}
