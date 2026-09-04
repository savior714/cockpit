import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVE = path.join(REPO_ROOT, "scripts", "serve.mjs");
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");

// Short grace keeps the suite fast without mocking timers. Production
// default (env absent) stays at 2000ms; this override is test-only.
const GRACE_MS = 300;

function spawnViewer(extraEnv = {}) {
  const proc = spawn(process.execPath, [SERVE, FIXTURE, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, COCKPIT_IDLE_SHUTDOWN_MS: String(GRACE_MS), ...extraEnv },
  });
  let stdout = "";
  proc.stdout.on("data", (d) => {
    stdout += d.toString("utf-8");
  });
  return { proc, getStdout: () => stdout };
}

async function waitForPort(handle, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = handle.getStdout().match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) return Number.parseInt(m[1], 10);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`viewer did not report a port. Output: ${handle.getStdout()}`);
}

function openSSE(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE status ${res.statusCode}`));
        return;
      }
      // Drain so the socket stays a live viewer; never ends on its own.
      res.on("data", () => {});
      resolve({ req, res });
    });
    req.on("error", reject);
  });
}

function closeSSE(viewer) {
  try {
    viewer.res.destroy();
  } catch {}
  try {
    viewer.req.destroy();
  } catch {}
}

async function waitForExit(proc, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null || proc.signalCode !== null) return proc.exitCode;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out waiting for server exit");
}

async function portAcceptsHttp(port) {
  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/progress.md`, (res) => {
        res.resume();
        res.on("end", resolve);
      });
      req.on("error", reject);
      req.setTimeout(1500, () => req.destroy(new Error("timeout")));
    });
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("A: last SSE viewer disconnect arms shutdown — process exits and port releases", async (t) => {
  const handle = spawnViewer();
  const { proc } = handle;
  t.after(() => {
    try {
      proc.kill("SIGKILL");
    } catch {}
  });
  const port = await waitForPort(handle);
  const viewer = await openSSE(port);
  await sleep(100);
  closeSSE(viewer);
  const code = await waitForExit(proc, 6000);
  assert.equal(code, 0, "idle shutdown must exit 0 via the canonical path");
  assert.equal(await portAcceptsHttp(port), false, "port must be released after shutdown");
});

test("B: reconnect within grace cancels pending shutdown — server survives", async (t) => {
  const handle = spawnViewer();
  const { proc } = handle;
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  const port = await waitForPort(handle);
  const first = await openSSE(port);
  await sleep(100);
  closeSSE(first);
  await sleep(100); // well inside the 300ms grace
  const second = await openSSE(port);
  await sleep(GRACE_MS * 3);
  assert.equal(proc.exitCode, null, "server must survive when a viewer reconnects in grace");
  assert.equal(await portAcceptsHttp(port), true, "port must stay open after cancelled shutdown");
  closeSSE(second);
  const code = await waitForExit(proc, 6000);
  assert.equal(code, 0, "server must still shut down after the final viewer leaves");
});

test("C: rapid refresh (disconnect/reconnect) does not kill the server", async (t) => {
  const handle = spawnViewer();
  const { proc } = handle;
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  const port = await waitForPort(handle);
  let current = await openSSE(port);
  for (let i = 0; i < 3; i++) {
    await sleep(50);
    closeSSE(current);
    current = await openSSE(port);
  }
  await sleep(GRACE_MS * 3);
  assert.equal(proc.exitCode, null, "rapid refresh cycles must not trigger shutdown");
  assert.equal(await portAcceptsHttp(port), true);
  closeSSE(current);
  const code = await waitForExit(proc, 6000);
  assert.equal(code, 0);
});

test("D: two viewers — one close survives, last close shuts down", async (t) => {
  const handle = spawnViewer();
  const { proc } = handle;
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  const port = await waitForPort(handle);
  const first = await openSSE(port);
  const second = await openSSE(port);
  await sleep(100);
  closeSSE(first);
  await sleep(GRACE_MS * 3);
  assert.equal(proc.exitCode, null, "server must survive while one viewer remains");
  assert.equal(await portAcceptsHttp(port), true);
  closeSSE(second);
  const code = await waitForExit(proc, 6000);
  assert.equal(code, 0, "server must exit after the last of two viewers leaves");
});

test("E: explicit shutdown still works — no-viewer SIGTERM and asset-only traffic", async (t) => {
  // E1: never-connected server must NOT self-exit, but must honor SIGTERM.
  const idle = spawnViewer();
  t.after(() => {
    try {
      idle.proc.kill("SIGKILL");
    } catch {}
  });
  const idlePort = await waitForPort(idle);
  await sleep(GRACE_MS * 3);
  assert.equal(idle.proc.exitCode, null, "server must not self-exit before any viewer connects");
  assert.equal(await portAcceptsHttp(idlePort), true, "asset requests must not arm shutdown");
  await sleep(GRACE_MS * 2);
  assert.equal(idle.proc.exitCode, null, "asset-only traffic must not arm shutdown");
  idle.proc.kill("SIGTERM");
  assert.equal(await waitForExit(idle.proc, 5000), 0, "SIGTERM must still exit 0");

  // E2: SIGINT with an active viewer exits promptly without waiting for grace.
  const active = spawnViewer();
  t.after(() => {
    try {
      active.proc.kill("SIGKILL");
    } catch {}
  });
  const activePort = await waitForPort(active);
  const viewer = await openSSE(activePort);
  await sleep(100);
  active.proc.kill("SIGINT");
  assert.equal(await waitForExit(active.proc, 5000), 0, "SIGINT must exit 0 even with viewers");
  closeSSE(viewer);
});
