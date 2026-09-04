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
} from "../dist/parser.js";
import {
  DEFAULT_PORT,
  acquireTargetInteractively,
  isInteractive,
  parseArgs,
  resolveProgressTarget,
  runMissingProgressFlow,
} from "./target.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(PKG_ROOT, "dist");

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
  - At most one Current Stage per trajectory rail
  - At most one Current Focus section if present

The target may be a project directory (checks <dir>/PROGRESS.md),
an explicit progress file, or empty (checks ./PROGRESS.md).
Never prompts, never writes, never starts onboarding.

Exits with code 0 on PASS, 1 on structural FAIL.`);
      process.exit(0);
    }

    const resolved = await resolveProgressTarget(args.target, process.cwd());
    if (!resolved.ok) {
      console.error(`cockpit: ${resolved.reason}`);
      process.exit(1);
    }
    const progressFile = resolved.progressFile;
    if (!resolved.exists) {
      console.error(`cockpit: PROGRESS.md not found for project '${resolved.projectDir}'.
Expected: ${progressFile}

Usage:
  cockpit check
  cockpit check <project-dir>
  cockpit check /path/to/PROGRESS.md`);
      process.exit(1);
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
    console.log(`Usage: cockpit [project-dir | path/to/PROGRESS.md] [--port <n>] [--no-open]

Commands:
  check [path]       Check structural completeness of PROGRESS.md and exit (0 on PASS, 1 on FAIL)

Viewer:
  cockpit                  Open the current directory's project in the viewer.
                           Interactive terminals are asked for the target first
                           (empty answer means the current directory).
  cockpit <project-dir>    Open <dir>/PROGRESS.md in the viewer. When the
                           directory has no PROGRESS.md yet, Cockpit enters an
                           explicit first-run/bootstrap flow instead of failing.
  cockpit <progress-file>  Serve one explicit progress file directly (fast path),
                           e.g. cockpit ./docs/PROGRESS.md, on
                           http://127.0.0.1:<port> (default ${DEFAULT_PORT}).
                           Reads the file at runtime and live-reloads the page
                           when it changes. Read-only.

Operator note:
  Cockpit itself is read-only and displays PROGRESS.md as-is.
  When a capable agent is asked to open Cockpit for a project, the recommended
  workflow is to reconcile PROGRESS.md with current project evidence first,
  update only material semantic deltas, run 'cockpit check', then launch the viewer.

The default browser opens automatically once the server is ready.
Pass --no-open to suppress this.`);
    process.exit(0);
  }

  let rawTarget = args.target;
  if ((rawTarget === null || rawTarget === undefined) && isInteractive()) {
    const acquired = await acquireTargetInteractively({ cwd: process.cwd() });
    if (!acquired.ok) {
      console.error(`cockpit: ${acquired.reason}`);
      process.exit(1);
    }
    rawTarget = acquired.rawTarget;
  }

  const resolved = await resolveProgressTarget(rawTarget, process.cwd());
  if (!resolved.ok) {
    console.error(`cockpit: ${resolved.reason}`);
    process.exit(1);
  }

  if (!resolved.exists) {
    if (isInteractive()) {
      const flow = await runMissingProgressFlow({
        projectDir: resolved.projectDir,
        progressFile: resolved.progressFile,
      });
      process.exit(flow.action === "created" || flow.action === "exists-now" ? 0 : 1);
    }
    console.error(`cockpit: '${resolved.projectDir}'에는 Cockpit progress representation이 아직 없습니다.
찾는 위치: ${resolved.progressFile}

Cockpit은 저장소를 분석하거나 내용을 자동으로 만들지 않습니다.
터미널에서 'cockpit ${resolved.projectDir}'을(를) 실행하면 준비 요청문과 중립 시작점 안내를 볼 수 있습니다.

To verify structural completeness once prepared:
  cockpit check ${resolved.progressFile}`);
    process.exit(1);
  }
  const progressFile = resolved.progressFile;

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


