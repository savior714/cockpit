import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import {
  computeBuildFingerprint,
  checkBuildFreshness,
  isLocalDevCheckout,
  writeBuildStamp,
} from "../scripts/freshness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

test("Fingerprint determinism and build input boundary", async () => {
  const fp1 = computeBuildFingerprint(REPO_ROOT);
  const fp2 = computeBuildFingerprint(REPO_ROOT);
  assert.equal(fp1, fp2, "Fingerprint must be deterministic across identical trees");
  assert.match(fp1, /^[a-f0-9]{64}$/, "Fingerprint must be a 64-char sha256 hex string");
});

test("isLocalDevCheckout boundary detection", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-devcheck-"));
  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // Empty dir => false
  assert.equal(isLocalDevCheckout(tmpDir), false);

  // With src but no .git => false (packaged install)
  await fs.mkdir(path.join(tmpDir, "src"));
  assert.equal(isLocalDevCheckout(tmpDir), false);

  // With .git dir and src => true (git clone checkout)
  await fs.mkdir(path.join(tmpDir, ".git"));
  assert.equal(isLocalDevCheckout(tmpDir), true);

  // With .git file (git worktree) => true
  await fs.rm(path.join(tmpDir, ".git"), { recursive: true, force: true });
  await fs.writeFile(path.join(tmpDir, ".git"), "gitdir: /somewhere\n");
  assert.equal(isLocalDevCheckout(tmpDir), true);

  // Remove src => false
  await fs.rm(path.join(tmpDir, "src"), { recursive: true, force: true });
  assert.equal(isLocalDevCheckout(tmpDir), false);
});

test("Clean local checkout + fresh build: cockpit execution causes no rebuild", async (t) => {
  // Ensure the repo build is fresh
  execSync("npm run build", { cwd: REPO_ROOT, encoding: "utf-8" });

  const binPath = path.join(REPO_ROOT, "scripts", "cockpit.mjs");
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");

  const proc = spawn(process.execPath, [binPath, validFixture, "--port", "0", "--no-open"], {
    cwd: REPO_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { try { proc.kill("SIGTERM"); } catch {} });

  let stdoutData = "";
  let stderrData = "";
  let assignedPort = null;

  proc.stdout.on("data", (d) => {
    stdoutData += d.toString("utf-8");
    const m = stdoutData.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) assignedPort = Number.parseInt(m[1], 10);
  });
  proc.stderr.on("data", (d) => {
    stderrData += d.toString("utf-8");
  });

  const start = Date.now();
  while (!assignedPort && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(assignedPort, "Viewer must start on port 0");

  // Verify no rebuild warning was emitted
  assert.doesNotMatch(stderrData, /rebuilding viewer/);

  const exitPromise = new Promise((resolve) => proc.on("exit", resolve));
  proc.kill("SIGTERM");
  await exitPromise;
});

test("Local checkout with source changed: detects stale, rebuilds once, and serves modified asset", async (t) => {
  // Create an isolated git checkout fixture in tmp
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-stale-test-"));
  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // Copy necessary files to tmpDir to form a valid local git checkout
  await fs.cp(path.join(REPO_ROOT, "src"), path.join(tmpDir, "src"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "scripts"), path.join(tmpDir, "scripts"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "dist"), path.join(tmpDir, "dist"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "package.json"), path.join(tmpDir, "package.json"));
  await fs.cp(path.join(REPO_ROOT, "tsconfig.json"), path.join(tmpDir, "tsconfig.json"));
  await fs.cp(path.join(REPO_ROOT, "index.html"), path.join(tmpDir, "index.html"));
  await fs.symlink(path.join(REPO_ROOT, "node_modules"), path.join(tmpDir, "node_modules"), "dir");

  // Create .git directory to designate local checkout
  await fs.mkdir(path.join(tmpDir, ".git"));

  // Initial build to set fresh stamp
  execSync("npm run build", { cwd: tmpDir, encoding: "utf-8" });
  assert.equal(checkBuildFreshness(tmpDir).fresh, true);

  // Modify build-affecting source: append unique CSS marker rule to src/style.css
  const uniqueToken = `freshness-marker-${Date.now()}`;
  const stylePath = path.join(tmpDir, "src", "style.css");
  await fs.appendFile(stylePath, `\n.${uniqueToken} { display: block; }\n`);

  // Verify that freshness check now reports stale
  const freshnessBefore = checkBuildFreshness(tmpDir);
  assert.equal(freshnessBefore.fresh, false);
  assert.equal(freshnessBefore.reason, "fingerprint_mismatch");

  // Launch cockpit viewer: it must detect stale and trigger rebuild
  const binPath = path.join(tmpDir, "scripts", "cockpit.mjs");
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");

  const proc = spawn(process.execPath, [binPath, validFixture, "--port", "0", "--no-open"], {
    cwd: tmpDir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { try { proc.kill("SIGTERM"); } catch {} });

  let stdoutData = "";
  let stderrData = "";
  let assignedPort = null;

  proc.stdout.on("data", (d) => {
    stdoutData += d.toString("utf-8");
    const m = stdoutData.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) assignedPort = Number.parseInt(m[1], 10);
  });
  proc.stderr.on("data", (d) => {
    stderrData += d.toString("utf-8");
  });

  const start = Date.now();
  while (!assignedPort && Date.now() - start < 30000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(assignedPort, `Viewer must start after rebuild. Stderr: ${stderrData}`);

  // Assert rebuild notice was printed
  assert.match(stderrData, /cockpit: local source changed since the last build; rebuilding viewer\.\.\./);

  // Verify the rebuild actually updated dist/assets/*.css containing our uniqueToken
  const distAssets = await fs.readdir(path.join(tmpDir, "dist", "assets"));
  const cssFile = distAssets.find((f) => f.endsWith(".css"));
  assert.ok(cssFile, "Built CSS bundle must exist");
  const cssContent = await fs.readFile(path.join(tmpDir, "dist", "assets", cssFile), "utf-8");
  assert.match(cssContent, new RegExp(uniqueToken), "Rebuilt CSS bundle must contain the source changes");

  // Clean shutdown
  const exitPromise = new Promise((resolve) => proc.on("exit", resolve));
  proc.kill("SIGTERM");
  await exitPromise;

  // Verify that after rebuild, the checkout is now fresh and doesn't rebuild again
  assert.equal(checkBuildFreshness(tmpDir).fresh, true);
});

test("Build failure simulation: refuses to serve stale assets and exits non-zero", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-fail-test-"));
  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  await fs.cp(path.join(REPO_ROOT, "src"), path.join(tmpDir, "src"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "scripts"), path.join(tmpDir, "scripts"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "dist"), path.join(tmpDir, "dist"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "package.json"), path.join(tmpDir, "package.json"));
  await fs.cp(path.join(REPO_ROOT, "tsconfig.json"), path.join(tmpDir, "tsconfig.json"));
  await fs.cp(path.join(REPO_ROOT, "index.html"), path.join(tmpDir, "index.html"));
  await fs.symlink(path.join(REPO_ROOT, "node_modules"), path.join(tmpDir, "node_modules"), "dir");
  await fs.mkdir(path.join(tmpDir, ".git"));

  // Build initially so dist/ has an older valid build
  execSync("npm run build", { cwd: tmpDir, encoding: "utf-8" });

  // Introduce fatal syntax error into src/main.ts
  const mainTs = path.join(tmpDir, "src", "main.ts");
  await fs.writeFile(mainTs, "const SYNTAX_ERROR === ;;;");

  const binPath = path.join(tmpDir, "scripts", "cockpit.mjs");
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");

  let exitCode = null;
  let stdoutData = "";
  let stderrData = "";

  await new Promise((resolve) => {
    const proc = spawn(process.execPath, [binPath, validFixture, "--port", "0", "--no-open"], {
      cwd: tmpDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdout.on("data", (d) => (stdoutData += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (stderrData += d.toString("utf-8")));
    proc.on("exit", (code) => {
      exitCode = code;
      resolve();
    });
  });

  assert.notEqual(exitCode, 0, "Must exit non-zero on build failure");
  assert.match(stderrData, /rebuilding viewer\.\.\./);
  assert.match(stderrData, /cockpit: local build is stale and rebuild failed; refusing to serve stale assets\./);
  assert.doesNotMatch(stdoutData, /http:\/\/127\.0\.0\.1:/, "Must never start viewer or serve stale assets");
});

test("Packaged-install equivalent: no .git tree runs immediately without runtime build", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-packaged-test-"));
  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // Packaged install only has dist and scripts (no .git, no devDependencies, no src)
  await fs.cp(path.join(REPO_ROOT, "dist"), path.join(tmpDir, "dist"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "scripts"), path.join(tmpDir, "scripts"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "package.json"), path.join(tmpDir, "package.json"));
  await fs.symlink(path.join(REPO_ROOT, "node_modules"), path.join(tmpDir, "node_modules"), "dir");

  assert.equal(isLocalDevCheckout(tmpDir), false, "Must not be considered local dev checkout");

  const binPath = path.join(tmpDir, "scripts", "cockpit.mjs");
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");

  const proc = spawn(process.execPath, [binPath, validFixture, "--port", "0", "--no-open"], {
    cwd: tmpDir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { try { proc.kill("SIGTERM"); } catch {} });

  let stdoutData = "";
  let stderrData = "";
  let assignedPort = null;

  proc.stdout.on("data", (d) => {
    stdoutData += d.toString("utf-8");
    const m = stdoutData.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) assignedPort = Number.parseInt(m[1], 10);
  });
  proc.stderr.on("data", (d) => {
    stderrData += d.toString("utf-8");
  });

  const start = Date.now();
  while (!assignedPort && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(assignedPort, "Viewer must start on port 0");
  assert.doesNotMatch(stderrData, /rebuilding viewer/, "Must not attempt runtime build");

  const exitPromise = new Promise((resolve) => proc.on("exit", resolve));
  proc.kill("SIGTERM");
  await exitPromise;
});

test("cockpit check and explicit PROGRESS.md path semantics regression proof", async () => {
  const binPath = path.join(REPO_ROOT, "scripts", "cockpit.mjs");
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");

  const output = execSync(`"${process.execPath}" "${binPath}" check "${validFixture}"`, {
    encoding: "utf-8",
  });
  assert.match(output, /PROGRESS structural check:\s+PASS/);
  assert.match(output, /Map items:\s+8/);
});
