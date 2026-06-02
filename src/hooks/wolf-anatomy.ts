export interface AnatomyEntry {
  file: string;
  description: string;
  tokens: number;
}

export function parseAnatomy(content: string): Map<string, AnatomyEntry[]> {
  const sections = new Map<string, AnatomyEntry[]>();
  let currentSection = "";
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const sm = line.match(/^## (.+)/);
    if (sm) {
      currentSection = sm[1].trim();
      if (!sections.has(currentSection)) sections.set(currentSection, []);
      continue;
    }
    if (!currentSection) continue;
    const em = line.match(/^- `([^`]+)`(?:\s+—\s+(.+?))?\s*\(~(\d+)\s+tok\)$/);
    if (em) {
      sections.get(currentSection)!.push({
        file: em[1],
        description: em[2] || "",
        tokens: parseInt(em[3], 10),
      });
    }
  }
  return sections;
}

export function serializeAnatomy(
  sections: Map<string, AnatomyEntry[]>,
  metadata: { lastScanned: string; fileCount: number; hits: number; misses: number }
): string {
  const lines: string[] = [
    "# anatomy.md",
    "",
    `> Auto-maintained by OpenWolf. Last scanned: ${metadata.lastScanned}`,
    `> Files: ${metadata.fileCount} tracked | Anatomy hits: ${metadata.hits} | Misses: ${metadata.misses}`,
    "",
  ];
  const keys = [...sections.keys()].sort();
  for (const key of keys) {
    lines.push(`## ${key}`);
    lines.push("");
    const entries = sections.get(key)!.sort((a, b) => a.file.localeCompare(b.file));
    for (const e of entries) {
      const desc = e.description ? ` — ${e.description}` : "";
      lines.push(`- \`${e.file}\`${desc} (~${e.tokens} tok)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
