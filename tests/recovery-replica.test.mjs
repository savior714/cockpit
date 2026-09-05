import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runMissingProgressFlow, resolveProgressTarget } from "../scripts/target.mjs";
import {
  canonicalProgressPath,
  readRecoveryReplica,
  replicaKeyForCanonicalPath,
  replicaLocationForProgressFile,
  resolveReplicaRoot,
  restoreRecoveryReplica,
  saveRecoveryReplica,
} from "../scripts/replica.mjs";
import { checkProgressStructure } from "../dist/structural-check.js";
import { createRefreshOrchestrator } from "../scripts/refresh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVE = path.join(REPO_ROOT, "scripts", "serve.mjs");

async function makeTempDir(t, prefix = "cockpit-replica-") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function makeIsolatedReplicaRoot(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-replica-root-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function withReplicaRoot(t, replicaRoot) {
  const saved = process.env.COCKPIT_REPLICA_DIR;
  process.env.COCKPIT_REPLICA_DIR = replicaRoot;
  t.after(() => {
    if (saved === undefined) delete process.env.COCKPIT_REPLICA_DIR;
    else process.env.COCKPIT_REPLICA_DIR = saved;
  });
}

async function readBytes(p) {
  return fs.readFile(p);
}

function shaHex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// Keying + location contract
// ---------------------------------------------------------------------------

test("replica keying: deterministic from canonical progress-file identity, outside repo", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const loc1 = await replicaLocationForProgressFile(progressFile);
  const loc2 = await replicaLocationForProgressFile(progressFile);
  assert.equal(loc1.key, loc2.key, "same canonical target must give same key");
  assert.equal(loc1.replicaFile, loc2.replicaFile);
  assert.match(loc1.key, /^[0-9a-f]{64}$/, "key is full sha256 hex");
  assert.ok(loc1.replicaFile.startsWith(path.resolve(replicaRoot) + path.sep), "replica lives under isolated root");
  assert.ok(!path.resolve(loc1.replicaFile).startsWith(path.resolve(projectDir) + path.sep), "replica is outside the target repo");
  assert.equal(path.basename(loc1.replicaFile), "PROGRESS.md");
  // Same key derivation is pure sha256 of the canonical path.
  const canonical = await canonicalProgressPath(progressFile);
  assert.equal(loc1.key, replicaKeyForCanonicalPath(canonical));
  assert.equal(resolveReplicaRoot(), path.resolve(replicaRoot), "env override wins for isolation");
});

// ---------------------------------------------------------------------------
// A. author success
// ---------------------------------------------------------------------------

test("A1 author success stores exact-byte replica after read-back + check", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"));
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(projectDir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, fixture);
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  const canonicalBytes = await readBytes(progressFile);
  const loc = await replicaLocationForProgressFile(progressFile);
  const replicaBytes = await readBytes(loc.replicaFile);
  assert.equal(shaHex(replicaBytes), shaHex(canonicalBytes), "replica must be exact-byte equivalent");
  assert.equal(shaHex(replicaBytes), shaHex(fixture));
});

test("A2 replica write failure never flips author success, warning only", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"));
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(projectDir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, fixture);
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
    saveReplicaFn: async () => ({ ok: false, error: new Error("disk full (simulated)") }),
  });
  assert.equal(r.action, "authored", "canonical success must stand despite replica failure");
  const text = out.join("");
  assert.match(text, /warning.*recovery replica/i, "failure must surface as a clear warning");
  assert.match(text, /canonical 작성은 성공/, "warning must state canonical success stands");
  assert.equal(await fs.readFile(progressFile, "utf-8"), fixture.toString("utf-8"));
});

test("A3 refresh author success also stores exact bytes, failure stays warning-only", async (t) => {
  const dir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const file = path.join(dir, "PROGRESS.md");
  const before = "# Test\n\n## 현재 상황\n\n이전 상태.\n";
  const afterText = "# Test\n\n## 현재 상황\n\n새 상태가 확인됨.\n";
  await fs.writeFile(file, before, "utf-8");
  const savedAuthor = process.env.COCKPIT_AUTHOR_COMMAND;
  process.env.COCKPIT_AUTHOR_COMMAND = "true";
  t.after(() => {
    if (savedAuthor === undefined) delete process.env.COCKPIT_AUTHOR_COMMAND;
    else process.env.COCKPIT_AUTHOR_COMMAND = savedAuthor;
  });
  const orch = createRefreshOrchestrator({
    progressFile: file,
    execRefresh: async () => {
      await fs.writeFile(file, afterText, "utf-8");
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "changed");
  const loc = await replicaLocationForProgressFile(file);
  assert.equal(await fs.readFile(loc.replicaFile, "utf-8"), afterText, "refresh must persist exact after-bytes");

  // Failure path: outcome stays changed, warning only.
  const file2 = path.join(dir, "PROGRESS2.md");
  await fs.writeFile(file2, before, "utf-8");
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const orch2 = createRefreshOrchestrator({
      progressFile: file2,
      execRefresh: async () => {
        await fs.writeFile(file2, afterText, "utf-8");
        return { outcome: "executed" };
      },
      saveReplicaFn: async () => ({ ok: false, error: new Error("replica down (simulated)") }),
    });
    t.after(() => orch2.dispose());
    orch2.setEnabled(true);
    const r2 = await orch2.runRefreshOnce("manual");
    assert.equal(r2.outcome, "changed", "replica failure must not flip refresh success");
  } finally {
    console.error = origError;
  }
  assert.ok(errors.join("\n").match(/warning.*recovery replica/i), "refresh replica failure must warn");
});

// ---------------------------------------------------------------------------
// B. normal startup: canonical exists -> replica changes nothing
// ---------------------------------------------------------------------------

test("B normal startup serves canonical bytes even with a stale replica present", async (t) => {
  const dir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  const canonical = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"));
  const progressFile = path.join(dir, "PROGRESS.md");
  await fs.writeFile(progressFile, canonical);
  // Plant a stale replica with different bytes for the same project key.
  withReplicaRoot(t, replicaRoot);
  const loc = await replicaLocationForProgressFile(progressFile);
  await fs.mkdir(path.dirname(loc.replicaFile), { recursive: true });
  await fs.writeFile(loc.replicaFile, Buffer.from("stale recovery copy, not truth", "utf-8"));

  const resolved = await resolveProgressTarget(dir, REPO_ROOT);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.exists, true, "canonical exists so no missing flow");

  const proc = spawn(process.execPath, [SERVE, dir, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    else await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(port, "server must start with canonical present");
  const body = await new Promise((resolve, reject) => {
    import("node:http").then(({ default: http }) => {
      http
        .get(`http://127.0.0.1:${port}/progress.md`, (res) => {
          assert.equal(res.statusCode, 200);
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        })
        .on("error", reject);
    });
  });
  assert.equal(shaHex(body), shaHex(canonical), "viewer must serve canonical, never the stale replica");
  assert.notEqual(shaHex(body), shaHex(Buffer.from("stale recovery copy, not truth", "utf-8")));
  proc.kill("SIGTERM");
  await new Promise((r) => proc.on("exit", r));
});

// ---------------------------------------------------------------------------
// C. missing target + replica
// ---------------------------------------------------------------------------

test("C1 recovery proposal comes before fresh authorship and writes nothing before confirm", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"));
  // Seed the replica by simulating a prior author success, then lose canonical.
  await fs.writeFile(progressFile, fixture);
  const saved = await saveRecoveryReplica(progressFile);
  assert.equal(saved.ok, true);
  await fs.rm(progressFile);

  const out = [];
  const prompts = [];
  let authorCalls = 0;
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(projectDir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async (q) => {
      prompts.push(q);
      return "n";
    },
    runAuthorFn: async () => {
      authorCalls++;
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "declined");
  assert.equal(authorCalls, 0, "declining both prompts must never invoke the author");
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false, "no canonical write before confirmation");
  assert.ok(prompts.length >= 2, "restore prompt must come first, then author prompt");
  assert.match(prompts[0], /복원/, "first prompt must be the recovery restore proposal");
  assert.match(prompts[1], /LLM author/, "second prompt is the fresh authorship proposal");
  const text = out.join("");
  assert.ok(text.includes("recovery copy"), "must propose the recovery copy");
  assert.ok(text.indexOf("recovery copy") < text.indexOf("준비 요청문"), "recovery proposal must precede fresh authorship");
  assert.match(text, /stale/, "must not hide that the copy may be stale");
});

test("C2 explicit confirmation restores exact bytes and keeps author duty visible", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"));
  await fs.writeFile(progressFile, fixture);
  const saved = await saveRecoveryReplica(progressFile);
  assert.equal(saved.ok, true);
  const replicaBytes = await fs.readFile(saved.replicaFile);
  await fs.rm(progressFile);

  const out = [];
  let authorCalls = 0;
  const prompts = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(projectDir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async (q) => {
      prompts.push(q);
      return "y";
    },
    runAuthorFn: async () => {
      authorCalls++;
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "restored");
  assert.equal(prompts.length, 1, "restore confirmation alone must not also trigger the author prompt");
  assert.equal(authorCalls, 0, "restore must not auto-invoke the author");
  const restoredBytes = await readBytes(progressFile);
  assert.equal(shaHex(restoredBytes), shaHex(replicaBytes), "restored canonical must equal replica exact bytes");
  assert.equal(shaHex(restoredBytes), shaHex(fixture));
  const text = out.join("");
  assert.match(text, /복원했습니다/, "must confirm the restore");
  assert.match(text, /stale/, "must keep the stale-possible meaning visible");
  assert.match(text, /LLM author.*대조|대조.*LLM author/, "must keep author freshness duty");
});

// ---------------------------------------------------------------------------
// D. missing target + no replica keeps the fresh path
// ---------------------------------------------------------------------------

test("D missing with no replica keeps the existing fresh authorship path", async (t) => {
  const projectDir = await makeTempDir(t);
  const replicaRoot = await makeIsolatedReplicaRoot(t);
  withReplicaRoot(t, replicaRoot);
  const progressFile = path.join(projectDir, "PROGRESS.md");
  const probed = await readRecoveryReplica(progressFile);
  assert.equal(probed.exists, false, "precondition: no replica for this fresh key");

  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(projectDir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => ({ outcome: "executed" }),
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => null,
  });
  assert.equal(r.action, "author-missing");
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
  const text = out.join("");
  assert.ok(!text.includes("recovery copy를 canonical 위치로 복원"), "no replica means no restore proposal");
  assert.ok(text.includes("COCKPIT_AUTHOR_COMMAND"), "fresh guidance path is unchanged");
});

// ---------------------------------------------------------------------------
// E. boundary regression: no repository-inspection capability added
// ---------------------------------------------------------------------------

test("E boundary: Cockpit gains no repository/history inspection capability", async () => {
  const sources = {};
  for (const rel of [
    "scripts/replica.mjs",
    "scripts/target.mjs",
    "scripts/refresh.mjs",
    "scripts/serve.mjs",
    "scripts/author.mjs",
    "scripts/cockpit.mjs",
  ]) {
    sources[rel] = await fs.readFile(path.join(REPO_ROOT, rel), "utf-8");
  }
  const all = Object.values(sources).join("\n");
  // Executable repository-history inspection signals (not prose): actual
  // git invocations, revision plumbing, exclude-file paths, embedded DBs.
  assert.doesNotMatch(all, /"\s*git\s|'\s*git\s|`\s*git\s/);
  assert.doesNotMatch(all, /rev-list/);
  assert.doesNotMatch(all, /cat-file/);
  assert.doesNotMatch(all, /reflog/);
  assert.doesNotMatch(all, /--reflog|show-ref|for-each-ref/);
  assert.doesNotMatch(all, /\.git\/info\/exclude/);
  assert.doesNotMatch(all, /mongoose|sqlite|postgres|redis|leveldb/i);
  assert.doesNotMatch(all, /calculateProgress|progressPercent|semanticStateMachine/i);
  // No scheduler/daemon/registry machinery beyond the one existing refresh
  // cadence timer owned by refresh.mjs.
  const refreshTimers = [...sources["scripts/refresh.mjs"].matchAll(/setInterval/g)].length;
  assert.equal(refreshTimers, 1, "only the existing refresh cadence timer may exist");
  assert.doesNotMatch(sources["scripts/replica.mjs"], /setInterval|setTimeout|child_process|exec\(|spawn\(/);
  assert.doesNotMatch(sources["scripts/target.mjs"], /child_process/);
  // Replica is never canonical truth: the normal serve path never imports it.
  assert.doesNotMatch(sources["scripts/serve.mjs"], /replica/i);
  // Target keeps single author ownership; replica is a byte copy only.
  assert.match(sources["scripts/target.mjs"], /from\s+["']\.\/author\.mjs["']/);
  assert.match(sources["scripts/target.mjs"], /from\s+["']\.\/replica\.mjs["']/);
});
