import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import http from "node:http";
import {
  acquireTargetInteractively,
  buildAgentHandoff,
  buildAuthorHandoff,
  formatAuthorMissingGuidance,
  isAffirmative,
  isInteractive,
  parseArgs,
  resolveProgressTarget,
  runMissingProgressFlow,
} from "../scripts/target.mjs";
import {
  buildAuthorHandoff as buildCanonicalHandoff,
  resolveAuthorCommand,
  resolveAuthorCommandSource,
} from "../scripts/author.mjs";
import { checkProgressStructure } from "../dist/structural-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVE = path.join(REPO_ROOT, "scripts", "serve.mjs");
const execFileAsync = promisify(execFile);

async function makeTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-target-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function runCli(args, { cwd = REPO_ROOT, timeout = 15000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SERVE, ...args], {
      cwd,
      timeout,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return {
      code: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

// --- option parsing: single canonical owner, regressions preserved ---

test("parseArgs: bare invocation is a serve with a null (default-directory) target", () => {
  assert.deepEqual(parseArgs([]), {
    command: "serve",
    help: false,
    target: null,
    port: 4321,
    noOpen: false,
  });
});

test("parseArgs: directory and file targets pass through unresolved", () => {
  assert.equal(parseArgs(["/tmp/proj"]).target, "/tmp/proj");
  assert.equal(parseArgs(["."]).target, ".");
  assert.equal(parseArgs(["/tmp/proj/PROGRESS.md"]).target, "/tmp/proj/PROGRESS.md");
});

test("parseArgs: port / no-open / help forms", () => {
  assert.equal(parseArgs(["--port", "5000"]).port, 5000);
  assert.equal(parseArgs(["--port=5001"]).port, 5001);
  assert.equal(parseArgs(["-p", "5002"]).port, 5002);
  assert.equal(parseArgs(["--no-open"]).noOpen, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["check", "--help"]).help, true);
  assert.equal(parseArgs(["check"]).target, null);
  assert.equal(parseArgs(["check", "/tmp/proj"]).target, "/tmp/proj");
});

test("parseArgs: --version/-V resolves to the version command", () => {
  assert.deepEqual(parseArgs(["--version"]), { command: "version" });
  assert.deepEqual(parseArgs(["-V"]), { command: "version" });
});

test("parseArgs: regressions — unknown/extra/invalid inputs throw", () => {
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["a", "b"]), /unexpected extra argument/);
  assert.throws(() => parseArgs(["--port", "abc"]), /invalid --port value/);
  assert.throws(() => parseArgs(["--port=99999"]), /invalid --port value/);
  assert.throws(() => parseArgs(["check", "--bogus"]), /unknown check option/);
  assert.throws(() => parseArgs(["check", "a", "b"]), /unexpected extra argument/);
});

// --- resolution: one canonical owner shared by serve and check ---

test("resolve: explicit file target resolves to itself", async () => {
  const fixture = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");
  const r = await resolveProgressTarget(fixture, REPO_ROOT);
  assert.equal(r.ok, true);
  assert.equal(r.targetKind, "file");
  assert.equal(r.progressFile, path.resolve(fixture));
  assert.equal(r.exists, true);
  assert.equal(r.projectDir, path.dirname(path.resolve(fixture)));
});

test("resolve: directory with PROGRESS.md resolves deterministically", async (t) => {
  const dir = await makeTempDir(t);
  const fixture = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");
  await fs.copyFile(fixture, path.join(dir, "PROGRESS.md"));
  const r = await resolveProgressTarget(dir, REPO_ROOT);
  assert.equal(r.ok, true);
  assert.equal(r.targetKind, "directory");
  assert.equal(r.projectDir, path.resolve(dir));
  assert.equal(r.progressFile, path.join(path.resolve(dir), "PROGRESS.md"));
  assert.equal(r.exists, true);
});

test("resolve: '.' targets the cwd as a directory", async (t) => {
  const dir = await makeTempDir(t);
  const r = await resolveProgressTarget(".", dir);
  assert.equal(r.ok, true);
  assert.equal(r.targetKind, "directory");
  assert.equal(r.projectDir, path.resolve(dir));
  assert.equal(r.exists, false);
});

test("resolve: default (no target) is the current directory", async (t) => {
  const dir = await makeTempDir(t);
  const r = await resolveProgressTarget(null, dir);
  assert.equal(r.ok, true);
  assert.equal(r.targetKind, "default-directory");
  assert.equal(r.projectDir, path.resolve(dir));
  assert.equal(r.progressFile, path.join(path.resolve(dir), "PROGRESS.md"));
  assert.equal(r.exists, false);
});

test("resolve: missing PROGRESS.md path in an existing dir is onboarding, not invalid", async (t) => {
  const dir = await makeTempDir(t);
  const r = await resolveProgressTarget(path.join(dir, "PROGRESS.md"), REPO_ROOT);
  assert.equal(r.ok, true);
  assert.equal(r.targetKind, "missing-file");
  assert.equal(r.projectDir, path.resolve(dir));
  assert.equal(r.exists, false);
});

test("resolve: nonexistent target is invalid", async () => {
  const r = await resolveProgressTarget("/does/not/exist-cockpit-xyz", REPO_ROOT);
  assert.equal(r.ok, false);
  assert.match(r.reason, /target not found/);
});

// --- bootstrap authorship: LLM author owns semantics, no starter fabrication ---

test("author capability: canonical COCKPIT_AUTHOR_COMMAND wins, legacy fallback shares one meaning", () => {
  assert.equal(
    resolveAuthorCommand({ COCKPIT_AUTHOR_COMMAND: "author-cmd", COCKPIT_REFRESH_COMMAND: "legacy-cmd" }),
    "author-cmd"
  );
  assert.equal(resolveAuthorCommandSource({ COCKPIT_AUTHOR_COMMAND: "author-cmd", COCKPIT_REFRESH_COMMAND: "legacy-cmd" }), "author");
  assert.equal(resolveAuthorCommand({ COCKPIT_REFRESH_COMMAND: "legacy-cmd" }), "legacy-cmd");
  assert.equal(resolveAuthorCommandSource({ COCKPIT_REFRESH_COMMAND: "legacy-cmd" }), "refresh-legacy");
  assert.equal(resolveAuthorCommand({}), null);
  assert.equal(resolveAuthorCommandSource({}), null);
});

test("handoff: parameterized, vendor-neutral, single author for bootstrap+PATCH", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  const handoff = buildAuthorHandoff({ projectDir: dir, progressFile });
  assert.ok(handoff.includes(dir));
  assert.ok(handoff.includes(progressFile));
  assert.ok(handoff.includes("cockpit check"));
  assert.ok(handoff.includes("LLM author"));
  assert.ok(!/claude|chatgpt|gemini|openai|codex|qwen/i.test(handoff), "no hard-coded provider");
  // Bootstrap + refresh share one responsibility: create-when-missing and
  // PATCH-when-present are both described, not two owners.
  assert.match(handoff, /PATCH/);
  assert.match(handoff, /최초/);
  // Legacy name resolves to the same canonical text (one meaning, not two).
  assert.equal(buildAgentHandoff({ projectDir: dir, progressFile }), handoff);
  assert.equal(buildCanonicalHandoff({ projectDir: dir, progressFile }), handoff);
});

test("bootstrap: Cockpit runtime never fabricates a starter file", async () => {
  const targetSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "target.mjs"), "utf-8");
  assert.doesNotMatch(targetSource, /buildStarterContent/);
  assert.doesNotMatch(targetSource, /중립 시작점 파일을 만들까요/);
  assert.doesNotMatch(targetSource, /중립 시작점을 만들었습니다/);
  // No silent PROGRESS.md writes in the onboarding owner: the only writer is
  // the external author process invoked via the capability.
  assert.doesNotMatch(targetSource, /writeFile/);
  assert.match(targetSource, /COCKPIT_AUTHOR_COMMAND|resolveAuthorCommand|runAuthorCommand/);
});

// --- interactive boundary ---

test("isInteractive requires both stdin and stdout to be TTY", () => {
  assert.equal(isInteractive({ stdin: { isTTY: true }, stdout: { isTTY: true } }), true);
  assert.equal(isInteractive({ stdin: { isTTY: false }, stdout: { isTTY: true } }), false);
  assert.equal(isInteractive({ stdin: { isTTY: true }, stdout: { isTTY: false } }), false);
  assert.equal(isInteractive({ stdin: {}, stdout: {} }), false);
});

test("isAffirmative: only explicit confirmation counts", () => {
  assert.equal(isAffirmative("y"), true);
  assert.equal(isAffirmative("Y"), true);
  assert.equal(isAffirmative("yes"), true);
  assert.equal(isAffirmative(" YES "), true);
  assert.equal(isAffirmative(""), false);
  assert.equal(isAffirmative("n"), false);
  assert.equal(isAffirmative("no"), false);
  assert.equal(isAffirmative("maybe"), false);
  assert.equal(isAffirmative(undefined), false);
});

test("acquireTargetInteractively: empty answer means the default directory", async (t) => {
  const dir = await makeTempDir(t);
  const writes = [];
  const r = await acquireTargetInteractively({
    cwd: dir,
    stdin: {},
    stdout: { write: (s) => writes.push(s) },
    prompt: async () => "",
  });
  assert.deepEqual(r, { ok: true, rawTarget: null });
});

test("acquireTargetInteractively: retries an invalid path then accepts a valid one", async (t) => {
  const dir = await makeTempDir(t);
  const seen = [];
  const answers = ["/no/such/dir-xyz", "."];
  const r = await acquireTargetInteractively({
    cwd: dir,
    stdin: {},
    stdout: { write: (s) => seen.push(s) },
    prompt: async () => answers.shift(),
  });
  assert.deepEqual(r, { ok: true, rawTarget: "." });
  assert.ok(seen.join("").includes("찾을 수 없습니다"));
});

test("acquireTargetInteractively: gives up deterministically after max attempts", async () => {
  const r = await acquireTargetInteractively({
    cwd: REPO_ROOT,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "/no/such/dir-xyz",
    maxAttempts: 2,
  });
  assert.equal(r.ok, false);
});

test("runMissingProgressFlow: no author capability writes nothing and guides", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  let prompted = 0;
  let authorCalls = 0;
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => {
      prompted++;
      return "y";
    },
    runAuthorFn: async () => {
      authorCalls++;
      return { outcome: "executed" };
    },
    resolveAuthorCommandFn: () => null,
  });
  assert.equal(r.action, "author-missing");
  assert.equal(prompted, 0, "no author means no invocation prompt");
  assert.equal(authorCalls, 0, "author must not be called when unconfigured");
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
  const text = out.join("");
  assert.ok(text.includes(dir), "flow must identify the owning project");
  assert.ok(text.includes("cockpit check"), "flow must point at the preparation path");
  assert.ok(text.includes("LLM author"), "guidance must name the canonical owner");
  assert.ok(text.includes("COCKPIT_AUTHOR_COMMAND"), "guidance must tell how to connect");
});

test("runMissingProgressFlow: decline never invokes the author", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  let authorCalls = 0;
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "n",
    runAuthorFn: async () => {
      authorCalls++;
      return { outcome: "executed" };
    },
    resolveAuthorCommandFn: () => "true",
  });
  assert.equal(r.action, "declined");
  assert.equal(authorCalls, 0);
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
  assert.ok(out.join("").includes(dir), "flow must identify the owning project");
});

test("runMissingProgressFlow: empty answer is not confirmation", async (t) => {
  const dir = await makeTempDir(t);
  let authorCalls = 0;
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile: path.join(dir, "PROGRESS.md"),
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "",
    runAuthorFn: async () => {
      authorCalls++;
      throw new Error("must not be called without explicit confirmation");
    },
    resolveAuthorCommandFn: () => "true",
  });
  assert.equal(r.action, "declined");
  assert.equal(authorCalls, 0);
});

test("runMissingProgressFlow: configured author is invoked with location context, read back, and checked", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  const out = [];
  const seen = [];
  const fixture = await fs.readFile(
    path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"),
    "utf-8"
  );
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async (ctx) => {
      seen.push(ctx);
      await fs.writeFile(progressFile, fixture, "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].projectDir, path.resolve(dir));
  assert.equal(seen[0].progressFile, progressFile);
  const written = await fs.readFile(progressFile, "utf-8");
  assert.equal(checkProgressStructure(written).ok, true, "authored file must pass read-back check");
  assert.ok(out.join("").includes("LLM author"));
});

test("runMissingProgressFlow: author success without output is not success", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async () => ({ outcome: "executed" }),
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "true",
  });
  assert.equal(r.action, "author-no-output");
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
});

test("runMissingProgressFlow: failed author keeps the (missing) document and reports", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async () => ({ outcome: "failed", error: new Error("llm down") }),
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "failing-author",
  });
  assert.equal(r.action, "author-failed");
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
});

test("runMissingProgressFlow: author output that fails check is not accepted", async (t) => {
  const dir = await makeTempDir(t);
  const progressFile = path.join(dir, "PROGRESS.md");
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, "# Broken\n\n## 현재 상황\n\n형식 미달.\n", "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "sloppy-author",
  });
  assert.equal(r.action, "author-invalid");
  // The file the author wrote stays for manual repair; Cockpit does not fix it.
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), true);
});

// --- real CLI process surface (non-interactive: stdin ignored, never hangs) ---

test("CLI: check resolves a directory target", async (t) => {
  const dir = await makeTempDir(t);
  await fs.copyFile(
    path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"),
    path.join(dir, "PROGRESS.md")
  );
  const r = await runCli(["check", dir]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /PROGRESS structural check:\s+PASS/);
});

test("CLI: check with no PROGRESS.md fails deterministically without prompting", async (t) => {
  const dir = await makeTempDir(t);
  const r = await runCli(["check"], { cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /PROGRESS\.md not found/);
  assert.equal(await fs.stat(path.join(dir, "PROGRESS.md")).then(() => true).catch(() => false), false);
});

test("CLI: invalid target fails with a clean message, no stack", async () => {
  const r = await runCli(["/does/not/exist-cockpit-xyz", "--no-open", "--port", "0"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /target not found/);
  assert.ok(!/at .*\(.*:\d+:\d+\)/.test(r.stderr), "no stack trace for invalid targets");
});

test("CLI: non-interactive missing PROGRESS.md never hangs, never writes", async (t) => {
  const dir = await makeTempDir(t);
  const start = Date.now();
  const r = await runCli(["--no-open", "--port", "0"], { cwd: dir, timeout: 12000 });
  assert.ok(Date.now() - start < 12000, "must exit without waiting for input");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /PROGRESS\.md가 아직 없습니다/);
  assert.ok(r.stderr.includes(path.resolve(dir)), "must identify the target project");
  assert.match(r.stderr, /LLM author/, "must name the canonical owner");
  assert.match(r.stderr, /COCKPIT_AUTHOR_COMMAND/, "must tell how to connect the author");
  assert.doesNotMatch(r.stderr, /중립 시작점을 만들|중립 시작점 안내|중립 시작점 파일/, "must not offer a starter as the normal path");
  assert.match(r.stderr, /자동 생성하지 않습니다/, "must state no starter is auto-created");
  assert.equal(await fs.stat(path.join(dir, "PROGRESS.md")).then(() => true).catch(() => false), false);
});

test("CLI: viewer serves a directory target's PROGRESS.md", async (t) => {
  const dir = await makeTempDir(t);
  await fs.copyFile(
    path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"),
    path.join(dir, "PROGRESS.md")
  );
  const proc = spawn(process.execPath, [SERVE, dir, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  });
  let stdout = "";
  let port = null;
  proc.stdout.on("data", (d) => {
    stdout += d.toString("utf-8");
    const m = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) port = Number.parseInt(m[1], 10);
  });
  const start = Date.now();
  while (!port && Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(port, `directory-target server did not start. Output: ${stdout}`);
  assert.match(stdout, /PROGRESS\.md/);
  const body = await new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/progress.md`, (res) => {
        assert.equal(res.statusCode, 200);
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
  assert.match(body, /동네 빵집 당일 주문/);
  proc.kill("SIGTERM");
  await new Promise((r) => proc.on("exit", r));
});
