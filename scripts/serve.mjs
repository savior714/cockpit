#!/usr/bin/env node
// Cockpit local viewer server: loopback-only transport for exactly one
// user-selected PROGRESS.md plus the built frontend assets in dist/.
// The viewer itself never analyzes repository truth and never writes
// PROGRESS.md: the optional automatic refresh only asks the canonical LLM
// author capability to reconcile and PATCH, then reads the file back.
// Viewer lifecycle (last SSE viewer + short grace) owns process exit; the
// refresh cadence timer is unref'd and disposed on shutdown so it never
// keeps the server alive. No frameworks, no general filesystem access.

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
import {
  createRefreshOrchestrator,
  resolveRefreshIntervalMs,
} from "./refresh.mjs";

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
  let installedRef = "v<version>";
  try {
    const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"));
    canonicalRel = pkg?.bin?.cockpit;
    if (typeof pkg?.version === "string" && pkg.version) installedRef = `v${pkg.version}`;
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
        `  (global) npm install -g --install-links "github:savior714/cockpit#${installedRef}"\n` +
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

// Single fan-out for refresh status: every open /events stream observes the
// same server-owned scheduler state, so multiple tabs can never start
// duplicate refresh jobs. Change detection stays on the existing fingerprint
// path above; status events never trigger a document re-render by themselves.
const refreshStatusClients = new Set();

function broadcastRefreshStatus(status) {
  let payload = null;
  try {
    payload = `event: refresh-status\ndata: ${JSON.stringify(status)}\n\n`;
  } catch {
    return;
  }
  for (const client of refreshStatusClients) {
    try {
      client.write(payload);
    } catch {
      /* a broken client unsubscribes on close; never fail the scheduler */
    }
  }
}

function readJsonBody(req, limitBytes = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function openEventStream(req, res, progressFile, hooks = {}) {
  const { onOpen, onClose, getRefreshStatus } = hooks;
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

  // The single scheduler lives on the server: tabs only reflect status.
  // Send the current refresh status once so a newly opened tab converges
  // without its own timer or stored preference.
  if (typeof getRefreshStatus === "function") {
    try {
      res.write(`event: refresh-status\ndata: ${JSON.stringify(getRefreshStatus())}\n\n`);
    } catch {
      /* status snapshot is best-effort; change polling still works */
    }
    refreshStatusClients.add(res);
  }

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
    refreshStatusClients.delete(res);
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

  if (args.command === "version") {
    let version = "unknown";
    try {
      version =
        JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"))?.version ?? "unknown";
    } catch {
      /* missing/unreadable package.json reports unknown rather than crashing */
    }
    console.log(`cockpit ${version}`);
    process.exit(0);
  }

  if (args.command === "check") {
    if (args.help) {
      console.log(`Usage: cockpit check [path/to/PROGRESS.md]

Deterministically verifies that PROGRESS.md is structurally complete:
  - Required map and area detail sections exist
  - Every map item has exactly one matching Area Detail (H3)
  - No orphan Area Details (title drift)
  - No duplicate Area Detail titles
  - At most one Current Stage (YOU ARE HERE) group in the whole Project Map
  - At most one Current Focus section if present

Writing style (SHA / PID / test node / absolute path in overview) is
advisory warnings only and never affects PASS/FAIL. This check never
re-judges factual or verification state from prose.

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

Options:
  --version, -V      Print the installed Cockpit version (package.json) and exit

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
  LLM writes and reconciles PROGRESS.md. Cockpit deterministically checks,
  reads, and renders it.
  When an LLM author is asked to open Cockpit for a project, the recommended
  workflow is to reconcile PROGRESS.md with current project evidence first,
  update only material semantic deltas, run 'cockpit check', then launch the viewer.
  The optional 자동 업데이트 toggle (default OFF, top-right) appears only when
  the canonical LLM author capability (COCKPIT_AUTHOR_COMMAND, legacy fallback
  COCKPIT_REFRESH_COMMAND) is explicitly configured and asks that author
  to re-check every 10 minutes; Cockpit only reads
  the file back and refreshes the screen when the content actually changed.
  Live Reload (built-in file re-read after PROGRESS.md changes) always works.
  An ordinary launch without the author capability shows no auto-update
  control and guarantees no 10-minute semantic updates.
  Missing-file bootstrap and periodic refresh share the same author
  responsibility; Cockpit never analyzes repository truth itself.

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
        checkFn: (content) => checkProgressStructure(content),
      });
      process.exit(flow.action === "authored" || flow.action === "exists-now" || flow.action === "restored" ? 0 : 1);
    }
    console.error(`cockpit: '${resolved.projectDir}'에는 PROGRESS.md가 아직 없습니다.
찾는 위치: ${resolved.progressFile}

이 프로젝트의 PROGRESS.md는 LLM author가 작성해야 합니다.
LLM이 PROGRESS.md를 작성·대조하고, Cockpit은 결정론적으로 검사·읽기·렌더링만 합니다.
Cockpit은 저장소를 분석하거나 내용을 만들지 않으며, 중립 시작점을 자동 생성하지 않습니다.
현재 author capability가 연결되지 않았거나 비대화형 실행에서는 파일을 만들지 않고 종료합니다.
연결 방법: COCKPIT_AUTHOR_COMMAND 환경 변수에 LLM author 호출 명령을 지정하세요.
(기존 COCKPIT_REFRESH_COMMAND도 같은 의미의 fallback으로 인식됩니다.)
터미널에서 'cockpit ${resolved.projectDir}'을(를) 실행하면 LLM author용 준비 요청문을 볼 수 있습니다.

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

  // Optional automatic refresh: exactly one runtime-owned scheduler per
  // server process. Tabs never schedule; they only reflect this status.
  // Default is OFF. The executor is the canonical LLM author capability
  // (COCKPIT_AUTHOR_COMMAND, legacy fallback COCKPIT_REFRESH_COMMAND);
  // Cockpit itself never infers repository truth and never writes the file.
  // The cadence timer is unref'd and disposed on shutdown, so it never
  // blocks the last-viewer idle shutdown below.
  const refresh = createRefreshOrchestrator({
    progressFile,
    projectDir: resolved.projectDir,
    intervalMs: resolveRefreshIntervalMs(),
    onStatus: (status) => broadcastRefreshStatus(status),
  });

  // Viewer lifecycle: the canonical viewer signal is an active /events SSE
  // connection — not a raw TCP socket or an asset request. The server stays
  // alive until at least one viewer has connected; once the last SSE viewer
  // goes away, a short grace period allows refresh/reconnect before the
  // canonical shutdown path below reclaims the process and port.
  // The refresh scheduler above never arms or cancels this grace: status
  // broadcasts are not viewer activity, and the unref'd cadence timer cannot
  // keep the process alive once the grace fires.
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
    if (pathname === "/api/auto-refresh") {
      if (req.method === "GET" || req.method === "HEAD") {
        const body = JSON.stringify(refresh.getStatus());
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }
      if (req.method === "POST") {
        readJsonBody(req)
          .then((parsed) => {
            if (!parsed || typeof parsed.enabled !== "boolean") {
              res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: "expected { enabled: boolean }" }));
              return;
            }
            const status = refresh.setEnabled(parsed.enabled);
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end(JSON.stringify(status));
          })
          .catch(() => {
            if (!res.headersSent) {
              res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            }
            res.end(JSON.stringify({ error: "invalid JSON body" }));
          });
        return;
      }
      res.writeHead(405, { allow: "GET, HEAD, POST", "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
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
        getRefreshStatus: () => refresh.getStatus(),
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
    // Refresh lifecycle: stop the cadence and terminate any in-flight
    // external child first, then reclaim the server. The unref'd timer alone
    // never blocks exit; dispose() guarantees no detached scheduler remains.
    try {
      refresh.dispose();
    } catch {}
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


