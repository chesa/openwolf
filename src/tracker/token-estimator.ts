import * as path from "node:path";
import { CODE_EXTENSIONS, PROSE_EXTENSIONS } from "../utils/extensions.js";

export type ContentType = "code" | "prose" | "mixed";

export function detectContentType(filePath: string): ContentType {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (PROSE_EXTENSIONS.has(ext)) return "prose";
  return "mixed";
}

export function estimateTokens(
  text: string,
  type: ContentType = "mixed"
): number {
  const ratio = type === "code" ? 3.5 : type === "prose" ? 4.0 : 3.75;
  return Math.ceil(text.length / ratio);
}
