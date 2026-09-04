#!/usr/bin/env node
// Cockpit local viewer server: loopback-only, read-only transport for exactly
// one user-selected PROGRESS.md plus the built frontend assets in dist/.
// No frameworks, no writes, no general filesystem access.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
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
const SERVE_FILE = fileURLToPath(import.meta.url);

// Stale-bin fail-fast: the canonical `cockpit` entry is whatever
// package.json declares in `bin.cockpit` (currently scripts/cockpit.mjs,
// the freshness-guard owner). npm link/install snapshots the bin symlink at
// install time, so a checkout that moved the bin target leaves pre-existing
// `cockpit` links resolving here (serve.mjs) and silently bypassing that
// guard. Refuse that shape loudly instead of serving stale dist.
// Direct `node scripts/serve.mjs ...` keeps basename serve.mjs and stays
// allowed; canonical `cockpit ...` (argv[1] basename `cockpit`, realpath
// cockpit.mjs) is imported, not main, and also stays allowed.
function failOnStaleBinLink() {
  const invoked = process.argv[1];
  if (!invoked) return;
  let invokedBase;
  try {
    invokedBase = path.basename(invoked);
  } catch {
    return;
  }
  if (invokedBase !== "cockpit" && !invokedBase.startsWith("cockpit.")) return;
  let real;
  try {
    real = realpathSync(invoked);
  } catch {
    return;
  }
  let canonicalRel;
  try {
    canonicalRel = JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"))?.bin?.cockpit;
  } catch {
    return;
  }
  if (typeof canonicalRel !== "string" || !canonicalRel) return;
  const canonicalAbs = path.resolve(PKG_ROOT, canonicalRel);
  const serveAbs = path.resolve(SERVE_FILE);
  if (canonicalAbs === serveAbs) return;
  let canonicalReal = canonicalAbs;
  try {
    canonicalReal = realpathSync(canonicalAbs);
  } catch {}
  if (path.resolve(real) === path.resolve(canonicalReal)) return;
  if (path.resolve(real) === serveAbs || path.basename(real) === path.basename(serveAbs)) {
    console.error(
      `cockpit: stale install detected — the \`cockpit\` command resolved to scripts/serve.mjs, ` +
        `but package.json declares ${canonicalRel} as the canonical entry.\n` +
        `This bypasses the build freshness guard. Relink/reinstall so \`cockpit\` resolves to the canonical entry:\n` +
        `  (local checkout) npm link   # then verify: command -v cockpit && readlink "$(command -v cockpit)"\n` +
        `  (global) npm install -g --install-links "github:savior714/cockpit#main"\n` +
        `Never symlink scripts/serve.mjs as \`cockpit\` directly; ` +
        `\`node scripts/serve.mjs ...\` is only for explicit direct-file checks.`
    );
    process.exit(1);
  }
}

failOnStaleBinLink();

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

function openEventStream(req, res, progressFile, hooks = {}) {
  const { onOpen, onClose } = hooks;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": connected\n\n");

  if (typeof onOpen === "function") {
    try {
      onOpen();
    } catch {
      /* viewer accounting must never break the stream */
    }
  }

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
    if (closed) return;
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
    if (typeof onClose === "function") {
      try {
        onClose();
      } catch {
        /* viewer accounting must never throw from cleanup */
      }
    }
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
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
  - At most one Current Stage (YOU ARE HERE) group per map rail
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
  When an external agent is asked to open Cockpit for a project, the recommended
  workflow is to reconcile PROGRESS.md with current project evidence first,
  update only material semantic deltas, run 'cockpit check', then launch the viewer.

The default browser opens automatically once the server is ready.
Pass --no-open to suppress this.
After at least one viewer has connected, the server exits automatically
shortly after the last viewer disconnects (refresh/reconnect is tolerated).`);
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
    console.error(`cockpit: '${resolved.projectDir}'에는 PROGRESS.md가 아직 없습니다.
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

  // Viewer lifecycle: the canonical viewer signal is an active /events SSE
  // connection — not a raw TCP socket or an asset request. The server stays
  // alive until at least one viewer has connected; once the last SSE viewer
  // goes away, a short grace period allows refresh/reconnect before the
  // canonical shutdown path below reclaims the process and port.
  let activeViewers = 0;
  let seenViewer = false;
  let idleTimer = null;
  let shuttingDown = false;
  const idleShutdownMs = (() => {
    const raw = process.env.COCKPIT_IDLE_SHUTDOWN_MS;
    if (raw === undefined || raw === "") return 2000;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return 2000;
    return parsed;
  })();

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
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
      openEventStream(req, res, progressFile, {
        onOpen: () => {
          seenViewer = true;
          activeViewers += 1;
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
        },
        onClose: () => {
          if (activeViewers > 0) activeViewers -= 1;
          if (activeViewers !== 0 || !seenViewer || shuttingDown) return;
          if (idleTimer) return;
          idleTimer = setTimeout(() => {
            idleTimer = null;
            if (!shuttingDown && seenViewer && activeViewers === 0) {
              console.log("cockpit: last viewer disconnected — shutting down");
              shutdown();
            }
          }, idleShutdownMs);
        },
      });
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
    if (shuttingDown) return;
    shuttingDown = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
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


