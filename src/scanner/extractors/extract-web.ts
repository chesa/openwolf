import * as path from "node:path";

// ─── TypeScript / JavaScript ─────────────────────────────────
export function extractTsJs(content: string, basename: string, ext: string): string {
  // React/Preact component
  if (ext === ".tsx" || ext === ".jsx") {
    const comp = content.match(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+(\w+)/);
    const parts: string[] = [];
    if (comp) parts.push(comp[1]);

    // What it renders
    const renders: string[] = [];
    if (/<(?:form|Form)/i.test(content)) renders.push("form");
    if (/<(?:table|Table|DataTable)/i.test(content)) renders.push("table");
    if (/(?:Chart|Recharts|Victory|<canvas)/i.test(content)) renders.push("chart");
    if (/<(?:dialog|Dialog|Modal|Drawer)/i.test(content)) renders.push("modal");
    if (/<(?:map|Map|MapContainer)/i.test(content)) renders.push("map");
    if (renders.length) parts.push(`renders ${renders.join(", ")}`);

    // Key hooks
    const hooks = new Set<string>();
    const hr = /use(\w+)\(/g;
    let hm;
    while ((hm = hr.exec(content)) !== null) {
      const name = hm[1];
      if (["State", "Effect", "Ref", "Memo", "Callback", "Context", "Reducer", "Query", "Mutation",
           "Router", "Params", "Navigate", "SearchParams", "Form", "Fetcher"].includes(name)) {
        hooks.add(`use${name}`);
      }
    }
    if (hooks.size > 0 && hooks.size <= 4) parts.push(`uses ${[...hooks].join(", ")}`);

    // Data fetching
    if (content.includes("getServerSideProps") || content.includes("getStaticProps")) parts.push("SSR");
    if (content.includes("loader") && content.includes("useLoaderData")) parts.push("Remix loader");

    if (parts.length) return parts.join(" — ");
  }

  // Next.js app router conventions
  if (basename === "page.tsx" || basename === "page.js") return "Next.js page component";
  if (basename === "layout.tsx" || basename === "layout.js") return "Next.js layout";
  if (basename === "loading.tsx") return "Next.js loading UI";
  if (basename === "error.tsx") return "Next.js error boundary";
  if (basename === "not-found.tsx") return "Next.js 404 page";
  if (basename === "route.ts" || basename === "route.js") {
    const methods = [...new Set((content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g) || [])
      .map(m => m.match(/(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/)?.[1]))].filter(Boolean);
    return methods.length ? `Next.js API route: ${methods.join(", ")}` : "Next.js API route";
  }

  // Express/Fastify/Hono routes
  const routeHits = content.match(/\.(get|post|put|patch|delete)\s*\(\s*['"`]/g);
  if (routeHits && routeHits.length > 0) {
    const methods = [...new Set(routeHits.map(r => r.match(/\.(get|post|put|patch|delete)/)?.[1]?.toUpperCase()))];
    return `API routes: ${methods.join(", ")} (${routeHits.length} endpoints)`;
  }

  // tRPC router
  if (content.includes("createTRPCRouter") || content.includes("publicProcedure") || content.includes("protectedProcedure")) {
    const procs = (content.match(/\.(query|mutation|subscription)\s*\(/g) || []).length;
    return procs ? `tRPC router: ${procs} procedures` : "tRPC router";
  }

  // Zustand / Redux store
  if (content.includes("create(") && content.includes("set(")) return "Zustand store";
  if (content.includes("createSlice")) {
    const name = content.match(/name:\s*['"](\w+)['"]/);
    return name ? `Redux slice: ${name[1]}` : "Redux slice";
  }

  // Zod schemas
  if (content.includes("z.object") || content.includes("z.string") || content.includes("z.number")) {
    const schemas = (content.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*z\./g) || [])
      .map(s => s.match(/(?:const|let)\s+(\w+)/)?.[1]).filter(Boolean);
    if (schemas.length) return `Zod schemas: ${schemas.slice(0, 4).join(", ")}${schemas.length > 4 ? ` + ${schemas.length - 4} more` : ""}`;
  }

  // Prisma client usage
  if (content.includes("prisma.") && content.includes("findMany")) {
    return "Prisma data access layer";
  }

  // Exports summary
  const exports = (content.match(/export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/g) || [])
    .map(e => e.match(/(\w+)$/)?.[1]).filter(Boolean) as string[];
  if (exports.length > 0 && exports.length <= 5) return `Exports ${exports.join(", ")}`;
  if (exports.length > 5) return `Exports ${exports.slice(0, 4).join(", ")} + ${exports.length - 4} more`;

  return "";
}

// ─── Vue ─────────────────────────────────────────────────────
export function extractVue(content: string): string {
  const name = content.match(/name:\s*['"]([^'"]+)['"]/);
  const setup = content.includes("<script setup");
  const ts = content.includes('lang="ts"');

  // Props
  const propsMatch = content.match(/defineProps<\{([^}]+)\}>/s) || content.match(/props:\s*\{([^}]+)\}/s);
  const propCount = propsMatch ? (propsMatch[1].match(/\w+\s*[:\?]/g) || []).length : 0;

  // Emits
  const emits = (content.match(/defineEmits|emit\s*\(/g) || []).length;

  const parts: string[] = [];
  if (name) parts.push(name[1]);
  if (setup) parts.push("setup");
  if (ts) parts.push("TS");
  if (propCount) parts.push(`${propCount} props`);
  if (emits) parts.push(`emits`);

  return parts.length ? `Vue: ${parts.join(", ")}` : "Vue component";
}

// ─── Svelte ──────────────────────────────────────────────────
export function extractSvelte(content: string, basename: string): string {
  const ts = content.includes('lang="ts"');
  const props = (content.match(/export\s+let\s+(\w+)/g) || []).length;
  const stores = (content.match(/\$\w+/g) || []).length;
  const parts: string[] = [basename.replace(".svelte", "")];
  if (ts) parts.push("TS");
  if (props) parts.push(`${props} props`);
  if (stores) parts.push(`${stores} stores`);
  return `Svelte: ${parts.join(", ")}`;
}

// ─── Astro ───────────────────────────────────────────────────
export function extractAstro(content: string, basename: string): string {
  const imports = (content.match(/import\s+\w+\s+from/g) || []).length;
  const slots = (content.match(/<slot/g) || []).length;
  const parts: string[] = [basename.replace(".astro", "")];
  if (slots) parts.push(`${slots} slot(s)`);
  if (imports > 3) parts.push(`${imports} imports`);
  return `Astro: ${parts.join(", ")}`;
}

// ─── CSS / SCSS / Less ───────────────────────────────────────
export function extractCss(content: string): string {
  const rules = (content.match(/^[.#@][^\n{]+/gm) || []).length;
  const media = (content.match(/@media/g) || []).length;
  const animations = (content.match(/@keyframes\s+(\w+)/g) || []).length;
  const vars = (content.match(/--[\w-]+\s*:/g) || []).length;
  const layers = (content.match(/@layer/g) || []).length;

  const parts: string[] = [];
  if (rules) parts.push(`${rules} rules`);
  if (vars) parts.push(`${vars} vars`);
  if (media) parts.push(`${media} media queries`);
  if (animations) parts.push(`${animations} animations`);
  if (layers) parts.push(`${layers} layers`);
  return parts.length ? `Styles: ${parts.join(", ")}` : "";
}

// ─── Main router ─────────────────────────────────────────────
export function extractWeb(content: string, ext: string, basename: string, filePath: string): string {
  switch (ext) {
    case ".ts": case ".tsx": case ".js": case ".jsx": case ".mjs": case ".cjs":
      return extractTsJs(content, basename, ext);
    case ".vue": return extractVue(content);
    case ".svelte": return extractSvelte(content, basename);
    case ".astro": return extractAstro(content, basename);
    case ".css": case ".scss": case ".less": return extractCss(content);
    default: return "";
  }
}