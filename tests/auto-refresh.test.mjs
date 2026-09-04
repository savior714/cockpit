import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createRefreshOrchestrator,
  resolveRefreshIntervalMs,
  resolveRefreshCommand,
  DEFAULT_REFRESH_INTERVAL_MS,
} from "../scripts/refresh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

async function makeProgressFile(t, initial = "# Test\n\n## 현재 상황\n\n초기 상태.\n") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-auto-refresh-"));
  t.after(async () => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  });
  const file = path.join(dir, "PROGRESS.md");
  await fs.writeFile(file, initial, "utf-8");
  return { dir, file, initial };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. initial OFF
// ---------------------------------------------------------------------------

test("auto-refresh: initial state is OFF with no timer", async (t) => {
  const { file } = await makeProgressFile(t);
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => ({ outcome: "unchanged" }),
  });
  t.after(() => orch.dispose());
  const status = orch.getStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.running, false);
  assert.equal(status.lastCheckAt, null);
  assert.equal(status.lastResult, null);
  assert.equal(orch.__testOnly.getTimer(), null);
});

test("auto-refresh: default cadence is 10 minutes", () => {
  const saved = process.env.COCKPIT_REFRESH_INTERVAL_MS;
  delete process.env.COCKPIT_REFRESH_INTERVAL_MS;
  try {
    assert.equal(resolveRefreshIntervalMs(), 10 * 60 * 1000);
    assert.equal(DEFAULT_REFRESH_INTERVAL_MS, 10 * 60 * 1000);
  } finally {
    if (saved !== undefined) process.env.COCKPIT_REFRESH_INTERVAL_MS = saved;
  }
});

// ---------------------------------------------------------------------------
// 2. single schedule owner
// ---------------------------------------------------------------------------

test("auto-refresh: enabling twice keeps exactly one scheduler", async (t) => {
  const { file } = await makeProgressFile(t);
  const orch = createRefreshOrchestrator({
    progressFile: file,
    intervalMs: 30,
    execRefresh: async () => ({ outcome: "unchanged" }),
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const first = orch.__testOnly.getTimer();
  assert.ok(first, "timer must exist after ON");
  orch.setEnabled(true);
  assert.equal(orch.__testOnly.getTimer(), first, "second ON must not create another timer");
  assert.equal(orch.getStatus().enabled, true);
});

// ---------------------------------------------------------------------------
// 3. overlapping prevention (multi-tab single job surrogate)
// ---------------------------------------------------------------------------

test("auto-refresh: concurrent refresh never overlaps", async (t) => {
  const { file } = await makeProgressFile(t);
  let calls = 0;
  const orch = createRefreshOrchestrator({
    progressFile: file,
    intervalMs: 20,
    execRefresh: async () => {
      calls += 1;
      await sleep(80);
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const [first, second] = await Promise.all([orch.runRefreshOnce("manual"), orch.runRefreshOnce("manual")]);
  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["skipped-in-progress", "unchanged"].sort());
  assert.equal(calls, 1, "overlapping tick must not invoke the executor twice");
  assert.equal(orch.getStatus().running, false);
});

// ---------------------------------------------------------------------------
// 4. unchanged -> no browser update (hash equality)
// ---------------------------------------------------------------------------

test("auto-refresh: unchanged result keeps identical content", async (t) => {
  const { file, initial } = await makeProgressFile(t);
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => ({ outcome: "executed" }),
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "unchanged");
  assert.equal(result.beforeHash, result.afterHash);
  assert.equal(await fs.readFile(file, "utf-8"), initial);
  assert.equal(orch.getStatus().lastResult, "unchanged");
});

// ---------------------------------------------------------------------------
// 5+6. changed via direct write and via atomic replacement
// ---------------------------------------------------------------------------

test("auto-refresh: changed result reads back new content", async (t) => {
  const { file } = await makeProgressFile(t);
  const next = "# Test\n\n## 현재 상황\n\n실질적 전환이 확인됨.\n";
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => {
      await fs.writeFile(file, next, "utf-8");
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "changed");
  assert.notEqual(result.beforeHash, result.afterHash);
  assert.equal(await fs.readFile(file, "utf-8"), next);
  assert.equal(orch.getStatus().lastResult, "changed");
});

test("auto-refresh: atomic replacement is detected via read-back", async (t) => {
  const { dir, file } = await makeProgressFile(t);
  const next = "# Test\n\n## 현재 상황\n\n원자적 교체로 반영됨.\n";
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => {
      const tmp = path.join(dir, "PROGRESS.md.tmp");
      await fs.writeFile(tmp, next, "utf-8");
      await fs.rename(tmp, file);
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "changed");
  assert.equal(await fs.readFile(file, "utf-8"), next);
});

// ---------------------------------------------------------------------------
// 7. failure preserves document and screen state
// ---------------------------------------------------------------------------

test("auto-refresh: failure preserves existing document", async (t) => {
  const { file, initial } = await makeProgressFile(t);
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => {
      throw new Error("external owner failed");
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "failed");
  assert.equal(await fs.readFile(file, "utf-8"), initial, "failed refresh must not mutate the file itself");
  const status = orch.getStatus();
  assert.equal(status.lastResult, "failed");
  assert.equal(status.running, false);
  assert.equal(status.enabled, true, "failure must not silently disable the toggle");
});

test("auto-refresh: unconfigured executor is a non-destructive no-op", async (t) => {
  const { file, initial } = await makeProgressFile(t);
  const saved = process.env.COCKPIT_REFRESH_COMMAND;
  delete process.env.COCKPIT_REFRESH_COMMAND;
  try {
    assert.equal(resolveRefreshCommand(), null);
    const { createDefaultExecRefresh } = await import("../scripts/refresh.mjs");
    const orch = createRefreshOrchestrator({
      progressFile: file,
      execRefresh: createDefaultExecRefresh({ progressFile: file, projectDir: path.dirname(file) }),
    });
    t.after(() => orch.dispose());
    orch.setEnabled(true);
    const result = await orch.runRefreshOnce("manual");
    assert.equal(result.outcome, "not-configured");
    assert.equal(await fs.readFile(file, "utf-8"), initial);
    assert.equal(orch.getStatus().lastResult, "not-configured");
  } finally {
    if (saved !== undefined) process.env.COCKPIT_REFRESH_COMMAND = saved;
  }
});

// ---------------------------------------------------------------------------
// 8. OFF stops future invocations
// ---------------------------------------------------------------------------

test("auto-refresh: OFF stops the scheduler", async (t) => {
  const { file } = await makeProgressFile(t);
  let calls = 0;
  const orch = createRefreshOrchestrator({
    progressFile: file,
    intervalMs: 20,
    execRefresh: async () => {
      calls += 1;
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  await sleep(70);
  assert.ok(calls >= 1, "ON must schedule invocations");
  orch.setEnabled(false);
  assert.equal(orch.__testOnly.getTimer(), null);
  const frozen = calls;
  await sleep(70);
  assert.equal(calls, frozen, "OFF must stop further invocations");
});

// ---------------------------------------------------------------------------
// 9. live reload regression: external/manual modification still detected
// ---------------------------------------------------------------------------

test("auto-refresh: manual external modification is still detectable", async (t) => {
  const { file } = await makeProgressFile(t);
  const { createHash } = await import("node:crypto");
  const fingerprint = async () => createHash("sha256").update(await fs.readFile(file)).digest("hex");
  const before = await fingerprint();
  await fs.writeFile(file, "# Test\n\n## 현재 상황\n\n수동 외부 수정.\n", "utf-8");
  const after = await fingerprint();
  assert.notEqual(before, after, "existing fingerprint path must see manual edits");
});

// ---------------------------------------------------------------------------
// Boundary preservation: no new semantic ownership in Cockpit
// ---------------------------------------------------------------------------

test("auto-refresh: Cockpit never writes PROGRESS.md itself", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "scripts", "refresh.mjs"), "utf-8");
  assert.doesNotMatch(source, /writeFile|appendFile|unlink|rm\(|createWriteStream/);
  assert.match(source, /COCKPIT_REFRESH_COMMAND/);
  assert.match(source, /read.*back|readSnapshot/i);
});

test("auto-refresh: browser never owns the schedule", async () => {
  const main = await fs.readFile(path.join(REPO_ROOT, "src", "main.ts"), "utf-8");
  const html = await fs.readFile(path.join(REPO_ROOT, "index.html"), "utf-8");
  assert.doesNotMatch(main, /localStorage|sessionStorage/);
  assert.doesNotMatch(main, /setInterval\s*\(\s*\(\s*\)\s*=>\s*\{?\s*void\s+runRefresh|setInterval.*refresh.*command/i);
  // No refresh-triggering timer in the viewer: status converges via SSE only.
  const intervals = [...main.matchAll(/setInterval/g)].length;
  assert.equal(intervals, 0, "viewer must not own any interval timer");
  assert.match(html, /자동 업데이트/);
  assert.match(html, /aria-checked="false"/, "default must be OFF in markup");
  assert.doesNotMatch(html + main, /PROGRESS\.md 생성/);
});

test("auto-refresh: server keeps a single refresh scheduler", async () => {
  const serve = await fs.readFile(path.join(REPO_ROOT, "scripts", "serve.mjs"), "utf-8");
  const refresh = await fs.readFile(path.join(REPO_ROOT, "scripts", "refresh.mjs"), "utf-8");
  assert.match(serve, /createRefreshOrchestrator/);
  assert.match(serve, /refresh-status/);
  assert.match(serve, /\/api\/auto-refresh/);
  // The cadence timer lives exactly once, inside the refresh boundary.
  assert.equal([...refresh.matchAll(/setInterval/g)].length, 1);
  assert.doesNotMatch(serve, /setInterval\(\(\) => \{\s*void runRefresh/);
});

// ---------------------------------------------------------------------------
// HTTP integration: toggle API + SSE status fan-out
// ---------------------------------------------------------------------------

test("auto-refresh: HTTP toggle defaults OFF and converges", async (t) => {
  const { file } = await makeProgressFile(t);
  const proc = spawn(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "serve.mjs"), file, "--port", "0", "--no-open"],
    { cwd: REPO_ROOT, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } }
  );
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  let port = null;
  const start = Date.now();
  while (!port && Date.now() - start < 8000) {
    const m = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) port = Number.parseInt(m[1], 10);
    else await sleep(100);
  }
  assert.ok(port, "server must start");

  const base = `http://127.0.0.1:${port}`;
  const getStatus = async () => (await (await fetch(`${base}/api/auto-refresh`)).json());

  const initial = await getStatus();
  assert.equal(initial.enabled, false, "default must be OFF");

  const onRes = await fetch(`${base}/api/auto-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(onRes.status, 200);
  assert.equal((await onRes.json()).enabled, true);

  assert.equal((await getStatus()).enabled, true, "second tab would read the same server state");

  const bad = await fetch(`${base}/api/auto-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: "yes" }),
  });
  assert.equal(bad.status, 400);

  const offRes = await fetch(`${base}/api/auto-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal((await offRes.json()).enabled, false);
  assert.equal((await getStatus()).enabled, false);

  const exitPromise = new Promise((resolve) => proc.on("exit", resolve));
  proc.kill("SIGTERM");
  await exitPromise;
});

test("auto-refresh: SSE carries refresh-status to every tab", async (t) => {
  const { file } = await makeProgressFile(t);
  const proc = spawn(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "serve.mjs"), file, "--port", "0", "--no-open"],
    { cwd: REPO_ROOT, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } }
  );
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  let port = null;
  const start = Date.now();
  while (!port && Date.now() - start < 8000) {
    const m = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) port = Number.parseInt(m[1], 10);
    else await sleep(100);
  }
  assert.ok(port, "server must start");

  const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { accept: "text/event-stream" } });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let chunk = "";
  const deadline = Date.now() + 5000;
  while (!chunk.includes("refresh-status") && Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    chunk += decoder.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {}
  assert.match(chunk, /refresh-status/);
  assert.match(chunk, /"enabled":false/);

  const exitPromise = new Promise((resolve) => proc.on("exit", resolve));
  proc.kill("SIGTERM");
  await exitPromise;
});

// ---------------------------------------------------------------------------
// Lifecycle: refresh must not keep the server alive after the last viewer
// ---------------------------------------------------------------------------

test("auto-refresh lifecycle: enabled scheduler does not block last-viewer shutdown", async (t) => {
  const { file } = await makeProgressFile(t);
  const proc = spawn(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "serve.mjs"), file, "--port", "0", "--no-open"],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, COCKPIT_IDLE_SHUTDOWN_MS: "300", COCKPIT_REFRESH_COMMAND: "" },
    }
  );
  t.after(() => {
    try {
      proc.kill("SIGKILL");
    } catch {}
  });
  let stdout = "";
  proc.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
  let port = null;
  const start = Date.now();
  while (!port && Date.now() - start < 8000) {
    const m = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) port = Number.parseInt(m[1], 10);
    else await sleep(100);
  }
  assert.ok(port, "server must start");

  // Enable the scheduler while a viewer is attached.
  const onRes = await fetch(`http://127.0.0.1:${port}/api/auto-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(onRes.status, 200);
  assert.equal((await onRes.json()).enabled, true);

  const sse = await fetch(`http://127.0.0.1:${port}/events`, {
    headers: { accept: "text/event-stream" },
  });
  assert.equal(sse.status, 200);
  const reader = sse.body.getReader();
  // Drain briefly so the connection counts as a live viewer.
  const drain = (async () => {
    try {
      await reader.read();
    } catch {}
  })();
  await sleep(100);
  try {
    await reader.cancel();
  } catch {}
  await drain;

  // Last viewer is gone: even with refresh ON, the idle grace must exit.
  const code = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("server stayed alive with refresh ON")), 6000);
    proc.on("exit", (c) => {
      clearTimeout(deadline);
      resolve(c);
    });
  });
  assert.equal(code, 0, "idle shutdown must exit 0 even when auto-refresh is ON");
});

test("auto-refresh lifecycle: fresh invocation starts OFF with a clean scheduler", async (t) => {
  const { file } = await makeProgressFile(t);
  const spawnServer = () =>
    spawn(process.execPath, [path.join(REPO_ROOT, "scripts", "serve.mjs"), file, "--port", "0", "--no-open"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, COCKPIT_IDLE_SHUTDOWN_MS: "300" },
    });
  const waitPort = async (proc, stdoutRef) => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const m = stdoutRef.value.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) return Number.parseInt(m[1], 10);
      await sleep(100);
    }
    throw new Error("server must start");
  };

  const first = spawnServer();
  t.after(() => {
    try {
      first.kill("SIGKILL");
    } catch {}
  });
  const firstOut = { value: "" };
  first.stdout.on("data", (d) => (firstOut.value += d.toString("utf-8")));
  const firstPort = await waitPort(first, firstOut);
  const onRes = await fetch(`http://127.0.0.1:${firstPort}/api/auto-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal((await onRes.json()).enabled, true);
  first.kill("SIGTERM");
  await new Promise((resolve) => first.on("exit", resolve));

  // A new invocation must not inherit the previous ON state.
  const second = spawnServer();
  t.after(() => {
    try {
      second.kill("SIGKILL");
    } catch {}
  });
  const secondOut = { value: "" };
  second.stdout.on("data", (d) => (secondOut.value += d.toString("utf-8")));
  const secondPort = await waitPort(second, secondOut);
  const status = await (await fetch(`http://127.0.0.1:${secondPort}/api/auto-refresh`)).json();
  assert.equal(status.enabled, false, "fresh invocation must start OFF");
  assert.equal(status.lastCheckAt, null);
  assert.equal(status.lastResult, null);
  second.kill("SIGTERM");
  await new Promise((resolve) => second.on("exit", resolve));
});

test("auto-refresh lifecycle: dispose clears timer and never writes the file", async (t) => {
  const { file, initial } = await makeProgressFile(t);
  const orch = createRefreshOrchestrator({
    progressFile: file,
    intervalMs: 20,
    execRefresh: async () => ({ outcome: "executed" }),
  });
  orch.setEnabled(true);
  assert.ok(orch.__testOnly.getTimer(), "timer must exist after ON");
  orch.dispose();
  assert.equal(orch.__testOnly.getTimer(), null, "dispose must clear the scheduler");
  assert.equal(orch.getStatus().enabled, false);
  assert.equal(await fs.readFile(file, "utf-8"), initial, "orchestrator must never write PROGRESS.md");
});
