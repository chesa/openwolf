import * as path from "node:path";

// ─── PHP / Laravel ───────────────────────────────────────────
function extractPhp(content: string, basename: string, filePath: string): string {
  if (basename.endsWith(".blade.php")) {
    const ext = content.match(/@extends\(\s*['"]([^'"]+)['"]\s*\)/);
    const sections = (content.match(/@section\(\s*['"](\w+)['"]/g) || []).map(s => s.match(/['"](\w+)['"]/)?.[1]).filter(Boolean);
    const forms = (content.match(/<form/gi) || []).length;
    const tables = (content.match(/<table/gi) || []).length;
    const comps = (content.match(/<x-/gi) || []).length;
    const parts: string[] = [];
    if (ext) parts.push(`extends ${ext[1]}`);
    if (sections.length) parts.push(`sections: ${sections.join(", ")}`);
    if (forms) parts.push(`${forms} form(s)`);
    if (tables) parts.push(`${tables} table(s)`);
    if (comps) parts.push(`${comps} component(s)`);
    return parts.length ? `Blade: ${parts.join(", ")}` : `Blade: ${basename.replace(".blade.php", "")}`;
  }

  const dirName = path.basename(path.dirname(filePath));
  const classM = content.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/);
  const className = classM?.[1] || "";
  const parent = classM?.[2] || "";

  // Public methods with docblock summaries
  const methods: Array<{ name: string; summary: string }> = [];
  const mRegex = /(?:\/\*\*\s*([\s\S]*?)\*\/\s*)?public\s+(?:static\s+)?function\s+(\w+)/g;
  let mm;
  while ((mm = mRegex.exec(content)) !== null) {
    const doc = mm[1] || "";
    const name = mm[2];
    if (name === "__construct" || name === "middleware") continue;
    const docLines = doc.split("\n").map(l => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean);
    const summary = docLines.find(l => !l.startsWith("@") && l.length > 3)?.slice(0, 50) || "";
    methods.push({ name, summary });
  }

  const methodList = (items: typeof methods, max = 5) => {
    const display = items.slice(0, max).map(m => m.summary || m.name).join(", ");
    return items.length > max ? `${display} + ${items.length - max} more` : display;
  };

  // Controller
  if (basename.endsWith("Controller.php") || parent === "Controller") {
    return methods.length ? methodList(methods) : `Controller: ${className}`;
  }

  // Model
  if (parent === "Model" || parent === "Authenticatable" || dirName === "Models") {
    const parts: string[] = [];
    const tbl = content.match(/\$table\s*=\s*['"]([^'"]+)['"]/);
    if (tbl) parts.push(`table: ${tbl[1]}`);
    const fill = content.match(/\$fillable\s*=\s*\[([^\]]*)\]/s);
    if (fill) { const c = (fill[1].match(/['"]/g) || []).length / 2; parts.push(`${Math.floor(c)} fields`); }
    const casts = content.match(/\$casts\s*=\s*\[([^\]]*)\]/s);
    if (casts) { const c = (casts[1].match(/['"]/g) || []).length / 2; parts.push(`${Math.floor(c)} casts`); }
    const rels = (content.match(/\$this->(hasMany|hasOne|belongsTo|belongsToMany|morphMany|morphTo|morphOne|hasManyThrough)\(/g) || []).length;
    if (rels) parts.push(`${rels} rels`);
    const scopes = (content.match(/public\s+function\s+scope(\w+)/g) || []).length;
    if (scopes) parts.push(`${scopes} scopes`);
    return parts.length ? `Model — ${parts.join(", ")}` : `Model: ${className}`;
  }

  // Migration
  if (basename.match(/^\d{4}_\d{2}_\d{2}/)) {
    const create = content.match(/Schema::create\(\s*['"]([^'"]+)['"]/);
    if (create) return `Migration: create ${create[1]} table`;
    const alter = content.match(/Schema::table\(\s*['"]([^'"]+)['"]/);
    if (alter) return `Migration: alter ${alter[1]} table`;
    return "Database migration";
  }

  // Laravel types
  const types: Record<string, string> = {
    ServiceProvider: "Service provider", FormRequest: "Form validation",
    ShouldQueue: "Queued job", Notification: "Notification", Mailable: "Mail",
    Event: "Event", Listener: "Event listener", Command: "Artisan command",
    Seeder: "Database seeder", Factory: "Model factory", Resource: "API resource",
    Policy: "Authorization policy", Observer: "Model observer", Rule: "Validation rule",
    Cast: "Attribute cast", Scope: "Query scope",
  };
  const implementsList = (classM?.[3] || "").split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  for (const [p, label] of Object.entries(types)) {
    if (parent === p || implementsList.includes(p) || basename.endsWith(`${p}.php`)) return `${label}: ${className}`;
  }

  // Interface / Trait
  const iface = content.match(/interface\s+(\w+)/);
  if (iface) { const mc = (content.match(/public\s+function\s+\w+/g) || []).length; return `Interface: ${iface[1]} (${mc} methods)`; }
  const trait = content.match(/trait\s+(\w+)/);
  if (trait) return `Trait: ${trait[1]}`;

  // Generic class
  if (className && methods.length) return `${className}: ${methodList(methods, 4)}`;
  return "";
}

// ─── Python ──────────────────────────────────────────────────
function extractPython(content: string, basename: string): string {
  // Django view
  if (content.includes("def get(self") || content.includes("def post(self") || content.includes("@api_view") || content.includes("APIView")) {
    const viewFuncs = (content.match(/def\s+(get|post|put|patch|delete|list|retrieve|create|update|destroy|perform_create)\s*\(/g) || [])
      .map(m => m.match(/def\s+(\w+)/)?.[1]).filter(Boolean);
    if (viewFuncs.length) return `View: ${viewFuncs.join(", ")}`;
  }

  // Django model
  if (content.includes("models.Model")) {
    const cls = content.match(/class\s+(\w+)\(.*models\.Model\)/);
    const fields = (content.match(/^\s+\w+\s*=\s*models\.\w+/gm) || []).length;
    const meta = content.match(/class\s+Meta:[\s\S]*?db_table\s*=\s*['"](\w+)['"]/);
    const parts: string[] = [];
    if (cls) parts.push(cls[1]);
    if (meta) parts.push(`table: ${meta[1]}`);
    parts.push(`${fields} fields`);
    return `Model: ${parts.join(", ")}`;
  }

  // Django serializer
  if (content.includes("serializers.") || content.includes("Serializer)")) {
    const cls = content.match(/class\s+(\w+).*Serializer/);
    return cls ? `Serializer: ${cls[1]}` : "DRF serializer";
  }

  // Django URL patterns
  if (content.includes("urlpatterns") || content.includes("path(")) {
    const paths = (content.match(/path\s*\(\s*['"]([^'"]*)['"]/g) || []).length;
    return paths ? `URL patterns: ${paths} routes` : "URL configuration";
  }

  // FastAPI / Starlette router
  if (content.includes("@router.") || content.includes("@app.")) {
    const routes = (content.match(/@(?:router|app)\.(get|post|put|patch|delete)\s*\(/g) || []);
    const paths = routes.map(r => r.match(/\.(get|post|put|patch|delete)/)?.[1]?.toUpperCase()).filter(Boolean);
    return routes.length ? `API: ${[...new Set(paths)].join(", ")} (${routes.length} endpoints)` : "API router";
  }

  // Flask
  if (content.includes("@app.route") || content.includes("@blueprint.route") || content.includes("Blueprint(")) {
    const routes = (content.match(/@(?:app|blueprint|\w+)\.route\s*\(/g) || []).length;
    return routes ? `Flask routes: ${routes} endpoints` : "Flask blueprint";
  }

  // Pydantic model
  if (content.includes("BaseModel") && content.includes("Field(")) {
    const cls = content.match(/class\s+(\w+)\(.*BaseModel\)/);
    const fields = (content.match(/^\s+\w+\s*:\s*\w+/gm) || []).length;
    return cls ? `Pydantic: ${cls[1]} (${fields} fields)` : `Pydantic model (${fields} fields)`;
  }

  // SQLAlchemy model
  if (content.includes("declarative_base") || content.includes("mapped_column") || content.includes("Column(")) {
    const cls = content.match(/class\s+(\w+)/);
    const table = content.match(/__tablename__\s*=\s*['"](\w+)['"]/);
    return cls ? `SQLAlchemy: ${cls[1]}${table ? ` (${table[1]})` : ""}` : "SQLAlchemy model";
  }

  // Celery task
  if (content.includes("@shared_task") || content.includes("@app.task") || content.includes("@celery.task")) {
    const tasks = (content.match(/def\s+(\w+)/g) || []).map(m => m.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];
    return tasks.length ? `Celery tasks: ${tasks.join(", ")}` : "Celery task";
  }

  // Pytest
  if (basename.startsWith("test_") || basename.endsWith("_test.py")) {
    const tests = (content.match(/def\s+test_(\w+)/g) || []).map(m => m.match(/test_(\w+)/)?.[1]).filter(Boolean);
    return tests.length ? `Tests: ${tests.slice(0, 4).join(", ")}${tests.length > 4 ? ` + ${tests.length - 4} more` : ""}` : "Test file";
  }

  // Generic class + functions
  const cls = content.match(/class\s+(\w+)/);
  const funcs = (content.match(/def\s+(\w+)/g) || [])
    .map(f => f.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];

  if (cls && funcs.length) {
    const display = funcs.slice(0, 4).join(", ");
    return funcs.length > 4 ? `${cls[1]}: ${display} + ${funcs.length - 4} more` : `${cls[1]}: ${display}`;
  }
  if (funcs.length) {
    return funcs.length > 4 ? `${funcs.slice(0, 4).join(", ")} + ${funcs.length - 4} more` : funcs.join(", ");
  }
  return "";
}

// ─── Ruby / Rails ────────────────────────────────────────────
function extractRuby(content: string, basename: string): string {
  const cls = content.match(/class\s+(\w+)(?:\s*<\s*(\w+(?:::\w+)?))?/);
  const className = cls?.[1] || "";
  const parent = cls?.[2] || "";

  // Rails controller
  if (parent?.includes("Controller") || basename.endsWith("_controller.rb")) {
    const actions = (content.match(/def\s+(index|show|new|create|edit|update|destroy|search|\w+)/g) || [])
      .map(m => m.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];
    return actions.length ? `Controller: ${actions.join(", ")}` : `Controller: ${className}`;
  }

  // Rails model
  if (parent === "ApplicationRecord" || parent === "ActiveRecord::Base") {
    const assocs = (content.match(/(?:has_many|has_one|belongs_to|has_and_belongs_to_many)\s+:(\w+)/g) || [])
      .map(m => m.match(/:(\w+)/)?.[1]).filter(Boolean);
    const validations = (content.match(/validates\s/g) || []).length;
    const scopes = (content.match(/scope\s+:(\w+)/g) || []).length;
    const parts: string[] = [];
    if (assocs.length) parts.push(`assocs: ${assocs.join(", ")}`);
    if (validations) parts.push(`${validations} validations`);
    if (scopes) parts.push(`${scopes} scopes`);
    return parts.length ? `Model: ${className} — ${parts.join(", ")}` : `Model: ${className}`;
  }

  // Rails migration
  if (basename.match(/^\d{14}_/)) {
    const create = content.match(/create_table\s+:(\w+)/);
    if (create) return `Migration: create ${create[1]}`;
    const change = content.match(/(?:add|remove|rename)_column\s+:(\w+)/);
    if (change) return `Migration: alter ${change[1]}`;
    return "Database migration";
  }

  // Methods
  const methods = (content.match(/def\s+(\w+)/g) || [])
    .map(m => m.match(/def\s+(\w+)/)?.[1]).filter(n => n && !n.startsWith("_")) as string[];
  if (cls && methods.length) return `${className}: ${methods.slice(0, 4).join(", ")}${methods.length > 4 ? ` + ${methods.length - 4} more` : ""}`;
  if (methods.length) return methods.slice(0, 5).join(", ");
  return "";
}

// ─── Elixir ──────────────────────────────────────────────────
function extractElixir(content: string): string {
  const mod = content.match(/defmodule\s+([\w.]+)/);
  const fns = (content.match(/def\s+(\w+)/g) || []).map(m => m.match(/def\s+(\w+)/)?.[1]).filter(Boolean);

  // Phoenix controller/live view
  if (content.includes("use") && content.includes("Controller")) {
    return mod ? `Phoenix controller: ${mod[1]}` : "Phoenix controller";
  }
  if (content.includes("Phoenix.LiveView")) {
    return mod ? `LiveView: ${mod[1]}` : "Phoenix LiveView";
  }

  if (mod && fns.length) return `${mod[1]}: ${fns.slice(0, 4).join(", ")}`;
  return mod ? mod[1] : "";
}

// ─── Lua ─────────────────────────────────────────────────────
function extractLua(content: string): string {
  const fns = (content.match(/function\s+(?:\w+[.:])?(\w+)/g) || [])
    .map(m => m.match(/(\w+)\s*$/)?.[1]).filter(Boolean);
  if (fns.length) return fns.length > 5 ? `${fns.slice(0, 4).join(", ")} + ${fns.length - 4} more` : fns.join(", ");
  return "";
}

// ─── Main router ─────────────────────────────────────────────
export function extractScripting(content: string, ext: string, basename: string, filePath: string): string {
  switch (ext) {
    case ".php": return extractPhp(content, basename, filePath);
    case ".py": return extractPython(content, basename);
    case ".rb": return extractRuby(content, basename);
    case ".ex": case ".exs": return extractElixir(content);
    case ".lua": return extractLua(content);
    default: return "";
  }
}