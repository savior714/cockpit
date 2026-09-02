#!/usr/bin/env node
// Cockpit local viewer server: loopback-only, read-only transport for exactly
// one user-selected PROGRESS.md plus the built frontend assets in dist/.
// No frameworks, no writes, no general filesystem access.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import {
  checkProgressStructure,
  formatStructuralCheckReport,
} from "../src/parser.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(PKG_ROOT, "dist");
const DEFAULT_PORT = 4321;

function parseCheckArgs(argv) {
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      return { help: true, file: null };
    } else if (a.startsWith("-")) {
      throw new Error(`unknown check option: ${a}`);
    } else if (!file) {
      file = path.resolve(a);
    } else {
      throw new Error(`unexpected extra argument: ${a}`);
    }
  }
  return { help: false, file };
}

function parseArgs(argv) {
  if (argv.length > 0 && argv[0] === "check") {
    const checkArgs = parseCheckArgs(argv.slice(1));
    return { command: "check", ...checkArgs };
  }

  let file = null;
  let port = DEFAULT_PORT;
  let noOpen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") {
      port = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`invalid --port value: ${argv[i]}`);
      }
    } else if (a === "--no-open") {
      noOpen = true;
    } else if (a === "--help" || a === "-h") {
      return { command: "serve", help: true, file, port, noOpen };
    } else if (a.startsWith("--port=")) {
      port = Number.parseInt(a.slice(7), 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`invalid --port value: ${a}`);
      }
    } else if (a.startsWith("-")) {
      throw new Error(`unknown option: ${a}`);
    } else if (!file) {
      file = path.resolve(a);
    } else {
      throw new Error(`unexpected extra argument: ${a}`);
    }
  }
  return { command: "serve", help: false, file, port, noOpen };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function openBrowser(url) {
  const plat = process.platform;
  let cmd;
  if (plat === "darwin") cmd = `open "${url}"`;
  else if (plat === "win32") cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      console.error(`cockpit: could not open browser — ${err.message}`);
    }
  });
}

async function fingerprint(file) {
  const [content, st] = await Promise.all([readFile(file), stat(file)]);
  return {
    hash: createHash("sha256").update(content).digest("hex"),
    mtimeMs: st.mtimeMs,
    size: st.size,
    content,
  };
}

async function serveAsset(req, res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!rel || rel === "index.html") {
    const html = await readFile(path.join(DIST_ROOT, "index.html"));
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : html);
    return;
  }
  const full = path.normalize(path.join(DIST_ROOT, rel));
  // Containment check: normalize-join can escape via ../ segments; reject anything outside dist.
  if (full !== DIST_ROOT && !full.startsWith(DIST_ROOT + path.sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }
  let buf;
  try {
    const st = await stat(full);
    if (!st.isFile()) throw new Error("not a file");
    buf = await readFile(full);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const type = MIME[path.extname(full)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : buf);
}

function openEventStream(req, res, progressFile) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": connected\n\n");

  let last = null;
  let closed = false;

  const checkAndNotify = async () => {
    if (closed) return;
    try {
      const fp = await fingerprint(progressFile);
      if (last === null) {
        last = fp.hash;
      } else if (fp.hash !== last) {
        last = fp.hash;
        res.write(`event: change\ndata: ${fp.hash}\n\n`);
      }
    } catch {
      /* file momentarily unreadable mid-save; next check retries */
    }
  };

  void checkAndNotify();

  let fsWatcher = null;
  try {
    fsWatcher = watch(progressFile, () => {
      void checkAndNotify();
    });
  } catch {
    /* fallback to interval polling if fs.watch fails on unsupported filesystem */
  }

  const pollInterval = setInterval(() => void checkAndNotify(), 600);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 20000);

  const cleanup = () => {
    closed = true;
    if (fsWatcher) {
      try {
        fsWatcher.close();
      } catch {
        /* ignore watcher close errors */
      }
      fsWatcher = null;
    }
    clearInterval(pollInterval);
    clearInterval(heartbeat);
  };
  req.on("close", cleanup);
  res.on("error", cleanup);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`cockpit: ${err.message}`);
    process.exit(2);
  }

  if (args.command === "check") {
    if (args.help) {
      console.log(`Usage: cockpit check [path/to/PROGRESS.md]

Deterministically verifies that PROGRESS.md is structurally complete:
  - Required map and area detail sections exist
  - Every map item has exactly one matching Area Detail (H3)
  - No orphan Area Details (title drift)
  - No duplicate Area Detail titles
  - At most one canonical Current Stage owner

Exits with code 0 on PASS, 1 on structural FAIL.`);
      process.exit(0);
    }

    let progressFile = args.file;
    if (!progressFile) {
      const defaultPath = path.resolve(process.cwd(), "PROGRESS.md");
      const exists = await stat(defaultPath)
        .then((st) => st.isFile())
        .catch(() => false);
      if (!exists) {
        console.error(`cockpit: PROGRESS.md not found in the current directory.

Usage:
  cockpit check
  cockpit check /path/to/PROGRESS.md`);
        process.exit(1);
      }
      progressFile = defaultPath;
    } else {
      const initial = await stat(progressFile).catch(() => null);
      if (!initial || !initial.isFile()) {
        console.error(`cockpit: not a readable file: ${progressFile}`);
        process.exit(1);
      }
    }

    let content;
    try {
      content = await readFile(progressFile, "utf-8");
    } catch (err) {
      console.error(`cockpit: cannot read ${progressFile} — ${err.message}`);
      process.exit(1);
    }

    const result = checkProgressStructure(content);
    console.log(formatStructuralCheckReport(result));
    process.exit(result.ok ? 0 : 1);
  }

  if (args.help) {
    console.log(`Usage: cockpit [command | path/to/PROGRESS.md] [--port <n>] [--no-open]

Commands:
  check [path]       Check structural completeness of PROGRESS.md and exit (0 on PASS, 1 on FAIL)

Viewer:
  cockpit [path]     Serves the Cockpit viewer on http://127.0.0.1:<port> (default ${DEFAULT_PORT}),
                     reading the target Markdown file (defaults to ./PROGRESS.md in the current directory)
                     at runtime and live-reloading the page when it changes. Read-only.

The default browser opens automatically once the server is ready.
Pass --no-open to suppress this.`);
    process.exit(0);
  }

  let progressFile = args.file;
  if (!progressFile) {
    const defaultPath = path.resolve(process.cwd(), "PROGRESS.md");
    const exists = await stat(defaultPath).then((st) => st.isFile()).catch(() => false);
    if (!exists) {
      console.error(`cockpit: PROGRESS.md not found in the current directory.

To start Cockpit:
  1. Create PROGRESS.md in your project root, or
  2. Pass a file path explicitly:
     cockpit /path/to/PROGRESS.md

To verify structural completeness:
  cockpit check /path/to/PROGRESS.md`);
      process.exit(1);
    }
    progressFile = defaultPath;
  } else {
    const initial = await stat(progressFile).catch(() => null);
    if (!initial || !initial.isFile()) {
      console.error(`cockpit: not a readable file: ${progressFile}`);
      process.exit(1);
    }
  }

  const distIndex = await stat(path.join(DIST_ROOT, "index.html")).catch(() => null);
  if (!distIndex) {
    console.error("cockpit: dist/index.html missing — run `npm run build` first.");
    process.exit(1);
  }
  const server = createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/progress.md") {
      readFile(progressFile)
        .then((buf) => {
          res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" });
          res.end(req.method === "HEAD" ? undefined : buf);
        })
        .catch(() => {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("progress file unavailable");
        });
      return;
    }
    if (pathname === "/events") {
      openEventStream(req, res, progressFile);
      return;
    }
    void serveAsset(req, res, pathname).catch(() => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("server error");
    });
  });

  server.on("error", (err) => {
    console.error(`cockpit: cannot listen on 127.0.0.1:${args.port} — ${err.message}`);
    process.exit(1);
  });

  server.listen(args.port, "127.0.0.1", () => {
    const actual = server.address();
    const url = `http://127.0.0.1:${actual.port}/`;
    console.log(`cockpit: viewing ${progressFile}`);
    console.log(`cockpit: open ${url}`);
    if (!args.noOpen) {
      openBrowser(url);
    }
  });

  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  const shutdown = () => {
    try {
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
    } catch {}
    for (const socket of sockets) {
      try {
        socket.destroy();
      } catch {}
    }
    try {
      server.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);

  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      const s = String(chunk).trim().toLowerCase();
      if (s === "q" || s === "exit" || chunk === "\u0003" || chunk === "\u0004") {
        shutdown();
      }
    });
    process.stdin.resume();
  }
}

void main();


