// ─── SQL ─────────────────────────────────────────────────────
function extractSql(content: string): string {
  const creates = (content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)/gi) || [])
    .map(m => m.match(/(?:TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)([`"']?\w+)/i)?.[1]?.replace(/[`"']/g, "")).filter(Boolean);
  const alters = (content.match(/ALTER\s+TABLE\s+[`"']?(\w+)/gi) || []).length;
  const views = (content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/gi) || []).length;
  const functions = (content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/gi) || []).length;

  const parts: string[] = [];
  if (creates.length) parts.push(`tables: ${creates.slice(0, 4).join(", ")}`);
  if (alters) parts.push(`${alters} alter(s)`);
  if (views) parts.push(`${views} view(s)`);
  if (functions) parts.push(`${functions} function(s)`);
  return parts.length ? `SQL: ${parts.join(", ")}` : "";
}

// ─── Protocol Buffers ────────────────────────────────────────
function extractProto(content: string): string {
  const msgs = (content.match(/message\s+(\w+)/g) || []).map(m => m.match(/message\s+(\w+)/)?.[1]).filter(Boolean);
  const services = (content.match(/service\s+(\w+)/g) || []).map(m => m.match(/service\s+(\w+)/)?.[1]).filter(Boolean);
  const parts: string[] = [];
  if (msgs.length) parts.push(`messages: ${msgs.slice(0, 3).join(", ")}`);
  if (services.length) parts.push(`services: ${services.join(", ")}`);
  return parts.length ? `Proto: ${parts.join(", ")}` : "";
}

// ─── GraphQL ─────────────────────────────────────────────────
function extractGraphQL(content: string): string {
  const types = (content.match(/type\s+(\w+)/g) || []).map(m => m.match(/type\s+(\w+)/)?.[1]).filter(Boolean);
  const queries = (content.match(/(?:query|mutation|subscription)\s+(\w+)/g) || []).length;
  const parts: string[] = [];
  if (types.length) parts.push(`types: ${types.slice(0, 4).join(", ")}`);
  if (queries) parts.push(`${queries} operations`);
  return parts.length ? `GraphQL: ${parts.join(", ")}` : "";
}

// ─── YAML ────────────────────────────────────────────────────
function extractYaml(content: string, basename: string): string {
  // GitHub Actions
  if (content.includes("runs-on:") || content.includes("uses:")) {
    const name = content.match(/^name:\s*(.+)$/m);
    return name ? `CI: ${name[1].trim()}` : "GitHub Actions workflow";
  }
  // Kubernetes
  if (content.includes("apiVersion:") && content.includes("kind:")) {
    const kind = content.match(/kind:\s*(\w+)/);
    const name = content.match(/name:\s*(\S+)/);
    return kind ? `K8s ${kind[1]}${name ? `: ${name[1]}` : ""}` : "Kubernetes manifest";
  }
  // Docker Compose
  if (content.includes("services:") && (basename.includes("docker") || basename.includes("compose"))) {
    const services = (content.match(/^\s{2}\w+:/gm) || []).length;
    return `Docker Compose: ${services} services`;
  }
  return "";
}

// ─── TOML ────────────────────────────────────────────────────
function extractToml(content: string, basename: string): string {
  if (basename === "Cargo.toml") {
    const name = content.match(/^name\s*=\s*"([^"]+)"/m);
    const desc = content.match(/^description\s*=\s*"([^"]+)"/m);
    return desc ? desc[1] : name ? `Rust crate: ${name[1]}` : "Rust package manifest";
  }
  if (basename === "pyproject.toml") {
    const name = content.match(/^name\s*=\s*"([^"]+)"/m);
    const desc = content.match(/^description\s*=\s*"([^"]+)"/m);
    return desc ? desc[1] : name ? `Python project: ${name[1]}` : "Python project configuration";
  }
  return "";
}

// ─── Main router ─────────────────────────────────────────────
export function extractData(content: string, ext: string, basename: string, filePath: string): string {
  switch (ext) {
    case ".sql": return extractSql(content);
    case ".proto": return extractProto(content);
    case ".graphql": case ".gql": return extractGraphQL(content);
    case ".yaml": case ".yml": return extractYaml(content, basename);
    case ".toml": return extractToml(content, basename);
    default: return "";
  }
}