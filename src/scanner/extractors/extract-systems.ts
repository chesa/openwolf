// ─── Go ──────────────────────────────────────────────────────
function extractGo(content: string): string {
  // HTTP handlers
  const handlers = (content.match(/func\s+(\w+)\s*\(\s*\w+\s+http\.ResponseWriter/g) || [])
    .map(m => m.match(/func\s+(\w+)/)?.[1]).filter(Boolean);
  if (handlers.length) return `HTTP handlers: ${handlers.slice(0, 5).join(", ")}${handlers.length > 5 ? ` + ${handlers.length - 5} more` : ""}`;

  // Interface
  const iface = content.match(/type\s+(\w+)\s+interface\s*\{/);
  if (iface) {
    const methods = (content.match(/^\s+(\w+)\s*\(/gm) || []).length;
    return `Interface: ${iface[1]} (${methods} methods)`;
  }

  // Struct
  const structMatch = content.match(/type\s+(\w+)\s+struct\s*\{/);
  if (structMatch) {
    const fields = (content.match(/^\s+\w+\s+\w+/gm) || []).length;
    const methods = (content.match(/func\s+\(\w+\s+\*?\w+\)\s+(\w+)/g) || [])
      .map(m => m.match(/\)\s+(\w+)/)?.[1]).filter(n => n && n[0] === n[0].toUpperCase()) as string[];
    const parts: string[] = [`${structMatch[1]} (${fields} fields)`];
    if (methods.length) parts.push(`methods: ${methods.slice(0, 4).join(", ")}`);
    return parts.join("; ");
  }

  // Package functions
  const funcs = (content.match(/^func\s+(\w+)/gm) || [])
    .map(m => m.match(/func\s+(\w+)/)?.[1]).filter(n => n && n[0] === n[0].toUpperCase()) as string[];
  if (funcs.length) return funcs.length > 5 ? `${funcs.slice(0, 4).join(", ")} + ${funcs.length - 4} more` : funcs.join(", ");
  return "";
}

// ─── Rust ────────────────────────────────────────────────────
function extractRust(content: string): string {
  // Struct + impl
  const structM = content.match(/pub\s+struct\s+(\w+)/);
  if (structM) {
    const methods = (content.match(/pub\s+(?:async\s+)?fn\s+(\w+)/g) || [])
      .map(m => m.match(/fn\s+(\w+)/)?.[1]).filter(Boolean);
    if (methods.length) return `${structM[1]}: ${methods.slice(0, 4).join(", ")}${methods.length > 4 ? ` + ${methods.length - 4} more` : ""}`;
    return `Struct: ${structM[1]}`;
  }

  // Trait
  const traitM = content.match(/pub\s+trait\s+(\w+)/);
  if (traitM) {
    const fns = (content.match(/fn\s+(\w+)/g) || []).length;
    return `Trait: ${traitM[1]} (${fns} methods)`;
  }

  // Enum
  const enumM = content.match(/pub\s+enum\s+(\w+)/);
  if (enumM) {
    const variants = (content.match(/^\s+(\w+)[\s({,]/gm) || []).length;
    return `Enum: ${enumM[1]} (${variants} variants)`;
  }

  // Actix/Axum handlers
  const handlers = (content.match(/#\[(?:get|post|put|patch|delete)\s*\("/g) || []).length;
  if (handlers) return `Web handlers: ${handlers} endpoints`;

  // Public functions
  const fns = (content.match(/pub\s+(?:async\s+)?fn\s+(\w+)/g) || [])
    .map(m => m.match(/fn\s+(\w+)/)?.[1]).filter(Boolean);
  if (fns.length) return fns.length > 5 ? `${fns.slice(0, 4).join(", ")} + ${fns.length - 4} more` : fns.join(", ");
  return "";
}

// ─── Java ────────────────────────────────────────────────────
function extractJava(content: string, basename: string): string {
  const cls = content.match(/(?:public\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/);
  const className = cls?.[1] || basename.replace(".java", "");
  const parent = cls?.[2] || "";

  // Spring annotations
  const annotations = (content.match(/@(RestController|Controller|Service|Repository|Component|Entity|Configuration)/g) || [])
    .map(a => a.slice(1));

  // Spring endpoints
  const mappings = (content.match(/@(?:Get|Post|Put|Patch|Delete|Request)Mapping/g) || []).length;
  if (mappings) return `${annotations[0] || "Spring"}: ${className} (${mappings} endpoints)`;
  if (annotations.length) return `${annotations[0]}: ${className}`;

  // JPA Entity
  if (content.includes("@Entity") || content.includes("@Table")) {
    const table = content.match(/@Table\s*\(\s*name\s*=\s*"(\w+)"/);
    return table ? `Entity: ${className} (table: ${table[1]})` : `Entity: ${className}`;
  }

  // Public methods
  const methods = (content.match(/public\s+(?:static\s+)?(?:\w+(?:<[\w,\s]+>)?)\s+(\w+)\s*\(/g) || [])
    .map(m => m.match(/(\w+)\s*\(/)?.[1]).filter(n => n && n !== className) as string[];
  if (methods.length) return `${className}: ${methods.slice(0, 4).join(", ")}${methods.length > 4 ? ` + ${methods.length - 4} more` : ""}`;
  return className ? `Class: ${className}` : "";
}

// ─── Kotlin ──────────────────────────────────────────────────
function extractKotlin(content: string, basename: string): string {
  const cls = content.match(/(?:data\s+)?class\s+(\w+)/);
  const className = cls?.[1] || basename.replace(/\.kts?$/, "");

  // Data class (brief)
  if (content.match(/data\s+class/)) {
    const props = (content.match(/val\s+\w+:/g) || []).length + (content.match(/var\s+\w+:/g) || []).length;
    return `Data class: ${className} (${props} properties)`;
  }

  // Ktor / Spring
  if (content.includes("routing {") || content.includes("route(")) {
    const routes = (content.match(/(?:get|post|put|patch|delete)\s*\(\s*"/g) || []).length;
    return routes ? `Ktor routes: ${routes} endpoints` : "Ktor routing";
  }

  // Functions
  const fns = (content.match(/fun\s+(\w+)/g) || [])
    .map(m => m.match(/fun\s+(\w+)/)?.[1]).filter(Boolean);
  if (cls && fns.length) return `${className}: ${fns.slice(0, 4).join(", ")}${fns.length > 4 ? ` + ${fns.length - 4} more` : ""}`;
  if (fns.length) return fns.slice(0, 5).join(", ");
  return "";
}

// ─── C# / .NET ───────────────────────────────────────────────
function extractCSharp(content: string, basename: string): string {
  const cls = content.match(/(?:public\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*(\w+))?/);
  const className = cls?.[1] || basename.replace(".cs", "");
  const parent = cls?.[2] || "";

  // ASP.NET Controller
  if (parent === "Controller" || parent === "ControllerBase" || content.includes("[ApiController]")) {
    const actions = (content.match(/\[Http(Get|Post|Put|Patch|Delete)\]/g) || [])
      .map(a => a.match(/Http(\w+)/)?.[1]).filter(Boolean);
    return actions.length ? `API Controller: ${className} (${[...new Set(actions)].join(", ")})` : `Controller: ${className}`;
  }

  // EF DbContext
  if (parent === "DbContext" || content.includes("DbSet<")) {
    const sets = (content.match(/DbSet<(\w+)>/g) || []).map(s => s.match(/<(\w+)>/)?.[1]).filter(Boolean);
    return sets.length ? `DbContext: ${sets.join(", ")}` : `DbContext: ${className}`;
  }

  // EF Entity
  if (content.includes("[Table(") || content.includes("[Key]")) {
    return `Entity: ${className}`;
  }

  // Interface
  if (content.match(/interface\s+I\w+/)) {
    const methods = (content.match(/\w+\s+\w+\s*\(/g) || []).length;
    return `Interface: ${className} (${methods} members)`;
  }

  // Public methods
  const methods = (content.match(/public\s+(?:async\s+)?(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:\w+(?:<[\w,\s]+>)?)\s+(\w+)\s*\(/g) || [])
    .map(m => m.match(/(\w+)\s*\(/)?.[1]).filter(n => n && n !== className) as string[];
  if (methods.length) return `${className}: ${methods.slice(0, 4).join(", ")}${methods.length > 4 ? ` + ${methods.length - 4} more` : ""}`;
  return className ? `Class: ${className}` : "";
}

// ─── Swift ───────────────────────────────────────────────────
function extractSwift(content: string): string {
  // SwiftUI View
  if (content.includes(": View") || content.includes("some View")) {
    const name = content.match(/struct\s+(\w+)\s*:\s*View/);
    return name ? `SwiftUI view: ${name[1]}` : "SwiftUI view";
  }

  const struct = content.match(/(?:public\s+)?struct\s+(\w+)/);
  const cls = content.match(/(?:public\s+)?class\s+(\w+)/);
  const proto = content.match(/protocol\s+(\w+)/);

  if (proto) {
    const reqs = (content.match(/func\s+(\w+)/g) || []).length;
    return `Protocol: ${proto[1]} (${reqs} requirements)`;
  }

  const name = struct?.[1] || cls?.[1] || "";
  const funcs = (content.match(/func\s+(\w+)/g) || [])
    .map(m => m.match(/func\s+(\w+)/)?.[1]).filter(Boolean);

  if (name && funcs.length) return `${name}: ${funcs.slice(0, 4).join(", ")}${funcs.length > 4 ? ` + ${funcs.length - 4} more` : ""}`;
  return "";
}

// ─── Dart / Flutter ──────────────────────────────────────────
function extractDart(content: string, basename: string): string {
  // Flutter widget
  if (content.includes("StatefulWidget") || content.includes("StatelessWidget")) {
    const name = content.match(/class\s+(\w+)\s+extends\s+(?:Stateful|Stateless)Widget/);
    const type = content.includes("StatefulWidget") ? "Stateful" : "Stateless";
    return name ? `${type} widget: ${name[1]}` : `${type} widget`;
  }

  // Riverpod/Provider
  if (content.includes("@riverpod") || content.includes("Provider(")) {
    return "Riverpod provider";
  }

  const cls = content.match(/class\s+(\w+)/);
  const methods = (content.match(/(?:void|Future|String|int|bool|dynamic|Widget)\s+(\w+)\s*\(/g) || [])
    .map(m => m.match(/(\w+)\s*\(/)?.[1]).filter(Boolean);

  if (cls && methods.length) return `${cls[1]}: ${methods.slice(0, 4).join(", ")}`;
  return "";
}

// ─── Zig ─────────────────────────────────────────────────────
function extractZig(content: string): string {
  const fns = (content.match(/pub\s+fn\s+(\w+)/g) || [])
    .map(m => m.match(/fn\s+(\w+)/)?.[1]).filter(Boolean);
  if (fns.length) return fns.length > 5 ? `${fns.slice(0, 4).join(", ")} + ${fns.length - 4} more` : fns.join(", ");
  return "";
}

// ─── Main router ─────────────────────────────────────────────
export function extractSystems(content: string, ext: string, basename: string, filePath: string): string {
  switch (ext) {
    case ".go": return extractGo(content);
    case ".rs": return extractRust(content);
    case ".java": return extractJava(content, basename);
    case ".kt": case ".kts": return extractKotlin(content, basename);
    case ".cs": return extractCSharp(content, basename);
    case ".swift": return extractSwift(content);
    case ".dart": return extractDart(content, basename);
    case ".zig": return extractZig(content);
    default: return "";
  }
}