import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { findProjectRoot } from "../scanner/project-root.js";
import { readJSON, writeJSON, readText } from "../utils/fs-safe.js";
import { Logger } from "../utils/logger.js";
import { CronEngine } from "./cron-engine.js";
import { startFileWatcher } from "./file-watcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer explicit OPENWOLF_PROJECT_ROOT env (set by CLI commands) over cwd detection
const projectRoot = process.env.OPENWOLF_PROJECT_ROOT || findProjectRoot();
const wolfDir = path.join(projectRoot, ".wolf");

// Generate a session token for authentication
const authToken = crypto.randomBytes(32).toString("hex");
fs.mkdirSync(wolfDir, { recursive: true }); // ensure .wolf/ exists before write
fs.writeFileSync(
  path.join(wolfDir, "daemon-token.tmp"),
  authToken,
  { encoding: "utf-8", mode: 0o600 }  // owner-only read/write
);

interface WolfConfig {
  openwolf?: {
    daemon?: { port?: number; log_level?: string };
    dashboard?: { enabled?: boolean; port?: number; bind?: string };
    cron?: { enabled?: boolean; heartbeat_interval_minutes?: number };
  };
}

const config = readJSON<WolfConfig>(path.join(wolfDir, "config.json"), {
  openwolf: {
    daemon: { port: 18790, log_level: "info" },
    dashboard: { enabled: true, port: 18791, bind: "127.0.0.1" },
    cron: { enabled: true, heartbeat_interval_minutes: 30 },
  },
});

// Dashboard bind address. Defaults to loopback so the unauthenticated API
// and WebSocket endpoints are not exposed to the LAN. Set to "0.0.0.0" in
// .wolf/config.json only if you explicitly need network access.
const bind = config.openwolf?.dashboard?.bind ?? "127.0.0.1";

const logger = new Logger(
  path.join(wolfDir, "daemon.log"),
  (config.openwolf?.daemon?.log_level ?? "info") as "debug" | "info" | "warn" | "error"
);

const startTime = Date.now();
const wsClients = new Set<WebSocket>();

// Express server
const app = express();
app.use(express.json());

// Serve dashboard static files before auth — HTML/JS/CSS contain no
// sensitive data and must load without a token in request headers.
// In dist: dist/src/daemon/wolf-daemon.js → ../../../dist/dashboard/
const dashboardDir = path.resolve(__dirname, "..", "..", "..", "dist", "dashboard");
if (fs.existsSync(dashboardDir)) {
  app.use(express.static(dashboardDir));
}

// Auth middleware — scoped to /api/ only so static assets are always
// served. All API endpoints require a valid x-api-token header or
// ?token= query param.
app.use("/api", (req, res, next) => {
  const token = req.headers["x-api-token"] || req.query.token;
  if (token !== authToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// Detect project metadata
function detectProjectMeta(): { name: string; description: string } {
  let name = path.basename(projectRoot);
  let description = "";

  // Try package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
    if (pkg.name) name = pkg.name;
    if (pkg.description) description = pkg.description;
  } catch (err) {
    logger.debug(`Could not read package.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Try Cargo.toml for name if not found
  if (name === path.basename(projectRoot)) {
    try {
      const cargo = fs.readFileSync(path.join(projectRoot, "Cargo.toml"), "utf-8");
      const nameMatch = cargo.match(/^name\s*=\s*"([^"]+)"/m);
      if (nameMatch) name = nameMatch[1];
    } catch (err) {
      logger.debug(`Could not read Cargo.toml: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If no description, try cerebrum.md project description
  if (!description) {
    try {
      const cerebrum = fs.readFileSync(path.join(wolfDir, "cerebrum.md"), "utf-8");
      const descMatch = cerebrum.match(/\*\*Project:\*\*\s*(.+)/);
      if (descMatch) description = descMatch[1].trim();
    } catch (err) {
      logger.debug(`Could not read cerebrum.md: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If still no description, try README first paragraph
  if (!description) {
    for (const readme of ["README.md", "readme.md", "README.rst"]) {
      try {
        const content = fs.readFileSync(path.join(projectRoot, readme), "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.startsWith("=") && !trimmed.startsWith("-") && !trimmed.startsWith("<") && !trimmed.startsWith("[") && !trimmed.startsWith("```") && trimmed.length > 10) {
            description = trimmed.length > 200 ? trimmed.slice(0, 200) + "…" : trimmed;
            break;
          }
        }
        if (description) break;
      } catch (err) {
        logger.debug(`Could not read ${readme}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { name, description };
}

const projectMeta = detectProjectMeta();

// API routes
app.get("/api/health", (_req, res) => {
  const cronState = readJSON<{ engine_status: string; last_heartbeat: string | null; dead_letter_queue: unknown[] }>(
    path.join(wolfDir, "cron-state.json"),
    { engine_status: "unknown", last_heartbeat: null, dead_letter_queue: [] }
  );
  const cronManifest = readJSON<{ tasks?: unknown[] }>(
    path.join(wolfDir, "cron-manifest.json"),
    { tasks: [] }
  );
  const taskCount = Array.isArray(cronManifest.tasks) ? cronManifest.tasks.length : 0;
  res.json({
    status: "healthy",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    last_heartbeat: cronState.last_heartbeat,
    tasks: taskCount,
    dead_letters: cronState.dead_letter_queue.length,
  });
});

app.get("/api/project", (_req, res) => {
  res.json({
    name: projectMeta.name,
    description: projectMeta.description,
    root: projectRoot,
  });
});

app.get("/api/files", (_req, res) => {
  const files: Record<string, string> = {};
  const wolfFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md", "memory.md", "anatomy.md",
    "config.json", "token-ledger.json", "buglog.json",
    "cron-manifest.json", "cron-state.json",
    "designqc-report.json",
  ];
  for (const file of wolfFiles) {
    try {
      files[file] = fs.readFileSync(path.join(wolfDir, file), "utf-8");
    } catch (err) {
      logger.debug(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
      files[file] = "";
    }
  }
  // Also try suggestions.json
  try {
    files["suggestions.json"] = fs.readFileSync(path.join(wolfDir, "suggestions.json"), "utf-8");
  } catch (err) {
    logger.debug(`Could not read suggestions.json: ${err instanceof Error ? err.message : String(err)}`);
    files["suggestions.json"] = "";
  }
  res.json(files);
});

app.get("/api/designqc-report", (_req, res) => {
  const report = readJSON(path.join(wolfDir, "designqc-report.json"), null);
  res.json(report);
});

// Trigger a cron task by ID
app.post("/api/cron/run/:taskId", (req, res) => {
  const { taskId } = req.params;
  if (!cronEngine) {
    res.status(503).json({ error: "Cron engine not running" });
    return;
  }
  cronEngine.runTask(taskId).then(() => {
    res.json({ status: "ok", task_id: taskId });
  }).catch((err) => {
    res.status(500).json({ error: String(err) });
  });
});

// SPA fallback
app.get("/{*path}", (_req, res) => {
  const indexPath = path.join(dashboardDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Dashboard not built. Run: pnpm build:dashboard" });
  }
});

// Helper: is a bind address (or remote IP) a loopback address?
const isLoopback = (addr: string): boolean =>
  addr === "127.0.0.1" || addr === "localhost" || addr === "::1";

// Start HTTP server
const port = config.openwolf?.dashboard?.port ?? 18791;
const server = app.listen(port, () => {
  logger.info(`Dashboard server listening on port ${port}`);
});

// Allow same-origin WebSocket connections (dashboard loaded from
// http://<bind>:<port>) and non-browser clients (no Origin header). Reject
// any other Origin to prevent a visited webpage from driving the daemon.
//
// When bind = "0.0.0.0" (opt-in network access), browsers send
// Origin: http://<actual-ip>:<port>, never http://0.0.0.0:<port>. We use
// the Host request header to dynamically match whatever IP the client reached
// us on instead of adding the literal (and useless) bind address to the set.
function isAllowedOrigin(
  origin: string | undefined,
  req: IncomingMessage
): boolean {
  const loopbackOrigins = new Set<string>([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]);

  if (!origin) {
    // Non-browser clients (CLI tools) don't send an Origin header. Only allow
    // them from loopback — when bind = "0.0.0.0" any remote machine could
    // otherwise omit Origin and bypass the check entirely.
    const remoteAddr = req.socket.remoteAddress ?? "";
    return (
      remoteAddr === "127.0.0.1" ||
      remoteAddr === "::1" ||
      remoteAddr === "::ffff:127.0.0.1"
    );
  }

  if (loopbackOrigins.has(origin)) return true;

  // For wildcard bind (e.g. "0.0.0.0"), allow the origin that matches the
  // Host header the client actually connected to.
  if (!isLoopback(bind)) {
    const host = req.headers["host"]; // e.g. "192.168.1.10:18791"
    if (host && origin === `http://${host}`) return true;
  }

  return false;
}

// WebSocket server
const wss = new WebSocketServer({
  server,
  verifyClient: (info: { origin: string; req: IncomingMessage; secure: boolean }) => {
    if (isAllowedOrigin(info.origin || undefined, info.req)) return true;
    logger.warn(`Rejected WebSocket upgrade: origin=${info.origin}`);
    return false;
  },
});

wss.on("connection", (ws) => {
  wsClients.add(ws);
  logger.info("WebSocket client connected");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; task_id?: string };
      handleDashboardCommand(msg);
    } catch (err) {
      logger.warn(`Invalid WebSocket message received: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
  });

  // Send initial state
  broadcast({ type: "daemon_started", timestamp: new Date().toISOString() });
});

function broadcast(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function handleDashboardCommand(msg: { type: string; task_id?: string }): void {
  switch (msg.type) {
    case "trigger_task":
      if (msg.task_id && cronEngine) {
        cronEngine.runTask(msg.task_id).catch((err) => {
          logger.error(`Manual task trigger failed: ${err}`);
        });
      }
      break;
    case "retry_dead_letter":
      if (msg.task_id) {
        const statePath = path.join(wolfDir, "cron-state.json");
        const state = readJSON<{ dead_letter_queue: Array<{ task_id: string }> }>(statePath, {
          dead_letter_queue: [],
        });
        state.dead_letter_queue = state.dead_letter_queue.filter(
          (d) => d.task_id !== msg.task_id
        );
        writeJSON(statePath, state);
      }
      break;
    case "force_scan":
      if (cronEngine) {
        cronEngine.runTask("anatomy-rescan").catch((err) => {
          logger.error(`Force scan failed: ${err}`);
        });
      }
      break;
    case "request_full_state":
      // Send all files
      try {
        const files: Record<string, string> = {};
        const wolfFiles = [
          "OPENWOLF.md", "identity.md", "cerebrum.md", "memory.md", "anatomy.md",
          "config.json", "token-ledger.json", "buglog.json",
          "cron-manifest.json", "cron-state.json",
          "designqc-report.json",
        ];
        for (const file of wolfFiles) {
          try {
            files[file] = fs.readFileSync(path.join(wolfDir, file), "utf-8");
          } catch (err) {
            logger.debug(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
            files[file] = "";
          }
        }
        broadcast({ type: "full_state", files, timestamp: new Date().toISOString() });
      } catch (err) {
        logger.error(`Full state request failed: ${err}`);
      }
      break;
  }
}

// Cron engine
let cronEngine: CronEngine | null = null;
// Default to enabled if key is absent (matches template default)
if (config.openwolf?.cron?.enabled ?? true) {
  cronEngine = new CronEngine(wolfDir, projectRoot, logger, broadcast);
  cronEngine.start();
}

// File watcher
startFileWatcher(wolfDir, logger, broadcast);

// Health heartbeat
const heartbeatInterval = (config.openwolf?.cron?.heartbeat_interval_minutes ?? 30) * 60 * 1000;
const heartbeatTimer = setInterval(() => {
  const statePath = path.join(wolfDir, "cron-state.json");
  const state = readJSON<Record<string, unknown>>(statePath, {});
  state.last_heartbeat = new Date().toISOString();
  writeJSON(statePath, state);
  broadcast({ type: "health", status: "healthy", uptime: Math.floor((Date.now() - startTime) / 1000) });
}, heartbeatInterval);

// Update cron-state to running
const cronStatePath = path.join(wolfDir, "cron-state.json");
const cronState = readJSON<Record<string, unknown>>(cronStatePath, {});
cronState.engine_status = "running";
cronState.last_heartbeat = new Date().toISOString();
writeJSON(cronStatePath, cronState);

logger.info("OpenWolf daemon started");

// Graceful shutdown
function shutdown(): void {
  logger.info("Daemon shutting down...");
  broadcast({ type: "daemon_stopping", timestamp: new Date().toISOString() });

  clearInterval(heartbeatTimer);
  if (cronEngine) cronEngine.stop();

  const state = readJSON<Record<string, unknown>>(cronStatePath, {});
  state.engine_status = "stopped";
  writeJSON(cronStatePath, state);

  for (const client of wsClients) {
    client.close();
  }
  wsClients.clear();

  server.close(() => {
    logger.info("Daemon stopped");
    process.exit(0);
  });

  // Force exit after 5s
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
