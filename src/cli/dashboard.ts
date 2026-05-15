import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { findProjectRoot } from "../scanner/project-root.js";
import { readJSON } from "../utils/fs-safe.js";
import { Logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WolfConfig {
  openwolf?: {
    dashboard?: { port?: number };
  };
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

export async function dashboardCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const wolfDir = path.join(projectRoot, ".wolf");

  if (!fs.existsSync(wolfDir)) {
    console.log("OpenWolf not initialized. Run: openwolf init");
    return;
  }

  const logger = new Logger(path.join(wolfDir, "dashboard.log"), "info");

  const config = readJSON<WolfConfig>(path.join(wolfDir, "config.json"), {
    openwolf: { dashboard: { port: 18791 } },
  });

  const port = config.openwolf?.dashboard?.port ?? 18791;
  let url = `http://localhost:${port}`;

  // Check if daemon is already running on that port
  const running = await isPortOpen(port);

  if (!running) {
    console.log("  Daemon not running. Starting dashboard server...");

    // Find the daemon script
    const daemonScript = path.resolve(__dirname, "..", "daemon", "wolf-daemon.js");
    if (!fs.existsSync(daemonScript)) {
      console.error(`  Daemon script not found at: ${daemonScript}`);
      console.log("  Run 'pnpm build' in the openwolf directory first.");
      return;
    }

    // Fork the daemon as a child process, passing project root explicitly
    const child = fork(daemonScript, [], {
      cwd: projectRoot,
      env: { ...process.env, OPENWOLF_PROJECT_ROOT: projectRoot },
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err) => {
      console.error(`  Daemon process error: ${err.message}`);
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`  Daemon exited unexpectedly with code ${code}. Check .wolf/daemon.log for details.`);
      }
    });
    child.unref();

    // Wait for the port to open (up to 5 seconds)
    let ready = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isPortOpen(port)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.log(`  Server didn't start in time. Try manually: node "${daemonScript}"`);
      return;
    }

    console.log(`  ✓ Dashboard server running on port ${port}`);
  }

  // Append auth token to URL for initial page load bootstrap.
  // The dashboard JS reads the token from the URL param on first load,
  // stores it in sessionStorage, and immediately strips it from the URL
  // via history.replaceState — so it does not appear in browser history
  // entries or outbound Referer headers. Subsequent API calls send the
  // token via the X-Api-Token header rather than the URL.
  const tokenPath = path.join(wolfDir, "daemon-token.tmp");
  if (fs.existsSync(tokenPath)) {
    const token = fs.readFileSync(tokenPath, "utf-8").trim();
    url += `?token=${token}`;
  }

  console.log(`  Opening http://localhost:${port}...`);

  try {
    const { default: open } = await import("open");
    await open(url);
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown error';

    logger.error(`Failed to open browser at ${url}. Error: ${errorMessage}. Hint: Try opening the URL manually in your browser`);

    // User-friendly message
    console.log(`
🚨 Could not open browser automatically`);
    console.log(`URL: ${url}`);
    console.log(`Error: ${errorMessage}`);
    console.log(`You can manually open this URL in your browser.
`);
  }
}
