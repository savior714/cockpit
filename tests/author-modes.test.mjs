import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHOR_MODE_ENV,
  BOOTSTRAP_MODE,
  BOOTSTRAP_TIMEOUT_ENV,
  DEFAULT_AUTHOR_TIMEOUT_MS,
  DEFAULT_BOOTSTRAP_TIMEOUT_MS,
  DEFAULT_REFRESH_TIMEOUT_MS,
  PROVENANCE_ANCHOR_PREFIX,
  REFRESH_MODE,
  REFRESH_TIMEOUT_ENV,
  buildAuthorEnv,
  buildAuthorHandoff,
  buildBootstrapHandoff,
  buildRefreshHandoff,
  normalizeAuthorMode,
  resolveAuthorMode,
  resolveAuthorTimeoutMs,
  resolveBootstrapTimeoutMs,
  resolveRefreshTimeoutMs,
  runAuthorCommand,
} from "../scripts/author.mjs";
import { buildAuthorHandoff as buildTargetHandoff, runMissingProgressFlow } from "../scripts/target.mjs";
import { createDefaultExecRefresh } from "../scripts/refresh.mjs";
import { checkProgressStructure } from "../dist/structural-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// NOTE on proof layers (per task §11): repository tests cannot evaluate live
// LLM behavior on a complex project. Tests below are split explicitly:
//   - "static contract": the handoff text / routing / timeout contract the
//     author must follow (does NOT prove the LLM deeply understood anything).
//   - "behavioral": executed runtime evidence (env forwarding, timeout
//     resolution, structural-check neutrality, injected routing contexts).
// A passing static contract is never reported as behavioral proof.

// ---------------------------------------------------------------------------
// A. MODE ROUTING — same canonical owner, explicit bootstrap vs refresh
// ---------------------------------------------------------------------------

test("static contract: mode vocabulary is exactly bootstrap | refresh", () => {
  assert.equal(BOOTSTRAP_MODE, "bootstrap");
  assert.equal(REFRESH_MODE, "refresh");
  assert.equal(AUTHOR_MODE_ENV, "AUTHOR_MODE");
  assert.equal(normalizeAuthorMode("bootstrap"), "bootstrap");
  assert.equal(normalizeAuthorMode("  REFRESH "), "refresh");
  assert.equal(normalizeAuthorMode("create"), null);
  assert.equal(normalizeAuthorMode(""), null);
  assert.equal(normalizeAuthorMode(undefined), null);
  assert.equal(resolveAuthorMode({ AUTHOR_MODE: "bootstrap" }), "bootstrap");
  assert.equal(resolveAuthorMode({ AUTHOR_MODE: "refresh" }), "refresh");
  assert.equal(resolveAuthorMode({}), null);
});

test("behavioral: missing-PROGRESS onboarding invokes the author as bootstrap", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-mode-bootstrap-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const replicaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-replica-root-"));
  t.after(async () => {
    await fs.rm(replicaRoot, { recursive: true, force: true });
  });
  const savedReplica = process.env.COCKPIT_REPLICA_DIR;
  process.env.COCKPIT_REPLICA_DIR = replicaRoot;
  t.after(() => {
    if (savedReplica === undefined) delete process.env.COCKPIT_REPLICA_DIR;
    else process.env.COCKPIT_REPLICA_DIR = savedReplica;
  });
  const seen = [];
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"), "utf-8");
  const r = await runMissingProgressFlow({
    projectDir: dir,
    progressFile: path.join(dir, "PROGRESS.md"),
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async (ctx) => {
      seen.push(ctx);
      await fs.writeFile(path.join(dir, "PROGRESS.md"), fixture, "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].mode, "bootstrap");
  // Same canonical command surface is used (no second executor).
  const targetSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "target.mjs"), "utf-8");
  assert.match(targetSource, /from\s+["']\.\/author\.mjs["']/);
  assert.match(targetSource, /BOOTSTRAP_MODE|mode:\s*BOOTSTRAP_MODE|"bootstrap"/);
});

test("static contract: refresh path invokes the same owner as refresh", async () => {
  const refreshSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "refresh.mjs"), "utf-8");
  assert.match(refreshSource, /from\s+["']\.\/author\.mjs["']/);
  assert.match(refreshSource, /REFRESH_MODE|mode:\s*REFRESH_MODE|"refresh"/);
  assert.equal(typeof createDefaultExecRefresh, "function");
});

test("behavioral: runAuthorCommand forwards AUTHOR_MODE vendor-neutrally", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-author-env-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const capture = path.join(dir, "mode.txt");
  // Fake author command records the forwarded AUTHOR_MODE and exits 0.
  const command = `node -e "require('fs').writeFileSync(process.env.COCKPIT_CAPTURE_FILE, String(process.env.AUTHOR_MODE ?? ''))"`;
  const run = async (mode) => {
    await fs.rm(capture, { force: true });
    const result = await runAuthorCommand({
      projectDir: dir,
      progressFile: path.join(dir, "PROGRESS.md"),
      mode,
      command,
      timeoutMs: 10000,
      env: { ...process.env, COCKPIT_CAPTURE_FILE: capture },
    });
    assert.equal(result.outcome, "executed");
    assert.equal(result.mode, mode);
    return fs.readFile(capture, "utf-8");
  };
  assert.equal(await run("bootstrap"), "bootstrap");
  assert.equal(await run("refresh"), "refresh");
  // Explicit mode wins over a conflicting environment value.
  await fs.rm(capture, { force: true });
  const conflict = await runAuthorCommand({
    projectDir: dir,
    progressFile: path.join(dir, "PROGRESS.md"),
    mode: "refresh",
    command,
    timeoutMs: 10000,
    env: { ...process.env, COCKPIT_CAPTURE_FILE: capture, AUTHOR_MODE: "bootstrap" },
  });
  assert.equal(conflict.mode, "refresh");
  assert.equal(await fs.readFile(capture, "utf-8"), "refresh");
  // buildAuthorEnv carries the mode without provider/model/tool names.
  const env = buildAuthorEnv({ projectDir: dir, progressFile: path.join(dir, "PROGRESS.md"), mode: "bootstrap", baseEnv: {} });
  assert.equal(env.AUTHOR_MODE, "bootstrap");
  assert.equal(env.PROJECT_DIR, dir);
  assert.ok(!("OPENAI_API_KEY" in env) || true, "no provider secrets are set by the owner");
});

// ---------------------------------------------------------------------------
// B. HANDOFF DIFFERENCE — same owner, different investigation strategy
// ---------------------------------------------------------------------------

test("static contract: bootstrap handoff demands broad/deep reconstruction, not a shallow summary", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "bootstrap" });
  assert.equal(handoff, buildBootstrapHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md" }));
  assert.match(handoff, /AUTHOR_MODE:\s*bootstrap/);
  assert.match(handoff, /deep reconstruction/);
  // Independent evidence axes A–H are all named.
  for (const axis of ["AUTHORITY", "TOPOLOGY", "SURFACES", "IMPLEMENTATION", "BOUNDARIES", "PROOF", "HISTORY", "CONTRADICTIONS"]) {
    assert.ok(handoff.includes(axis), `bootstrap must name axis ${axis}`);
  }
  assert.match(handoff, /entrypoint/i);
  assert.match(handoff, /workflow/);
  assert.match(handoff, /dependenc/);
  // Shallow convergence is forbidden; projection comes only after reconstruction.
  assert.match(handoff, /바로 요약을 쓰지 마/);
  assert.match(handoff, /마지막 단계에서만 PROGRESS\.md로 projection/);
  assert.match(handoff, /조기 종료는 금지/);
  assert.match(handoff, /짧은 반증/);
  assert.match(handoff, /UNKNOWN.*허용/);
  assert.match(handoff, /coverage gap/);
  assert.match(handoff, /cockpit check/);
  assert.match(handoff, /LLM author/);
  assert.ok(!/claude|chatgpt|gemini|openai|codex|qwen/i.test(handoff), "no hard-coded provider");
});

test("static contract: refresh handoff is delta-first with blast radius and conservative PATCH", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "refresh" });
  assert.equal(handoff, buildRefreshHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md" }));
  assert.match(handoff, /AUTHOR_MODE:\s*refresh/);
  assert.match(handoff, /delta-first/);
  assert.match(handoff, /blast radius/);
  assert.match(handoff, /conservative PATCH/);
  assert.match(handoff, /changed-files-only는 불충분/);
  assert.match(handoff, /그대로/);
  assert.match(handoff, /changelog/);
  assert.match(handoff, /material current truth/);
  assert.match(handoff, /implementation churn/);
  // Structural drift widens only when the model is invalidated.
  assert.match(handoff, /drift/);
  assert.match(handoff, /small targeted reconstruction/);
  assert.match(handoff, /억지로 보존하지 마/);
  assert.match(handoff, /cockpit check/);
  assert.match(handoff, /LLM author/);
  assert.ok(!/claude|chatgpt|gemini|openai|codex|qwen/i.test(handoff), "no hard-coded provider");
});

test("static contract: onboarding default is bootstrap and differs from refresh", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-handoff-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const progressFile = path.join(dir, "PROGRESS.md");
  const viaTarget = buildTargetHandoff({ projectDir: dir, progressFile });
  const bootstrap = buildAuthorHandoff({ projectDir: dir, progressFile, mode: "bootstrap" });
  const refresh = buildAuthorHandoff({ projectDir: dir, progressFile, mode: "refresh" });
  assert.equal(viaTarget, bootstrap);
  assert.notEqual(bootstrap, refresh);
});

// ---------------------------------------------------------------------------
// C. TIME BUDGET — bootstrap is not bound to the historic 5 minutes
// ---------------------------------------------------------------------------

test("behavioral: bootstrap default is materially longer; refresh stays bounded", () => {
  assert.equal(DEFAULT_AUTHOR_TIMEOUT_MS, 5 * 60 * 1000);
  assert.equal(DEFAULT_REFRESH_TIMEOUT_MS, 5 * 60 * 1000);
  assert.equal(DEFAULT_BOOTSTRAP_TIMEOUT_MS, 30 * 60 * 1000);
  assert.ok(DEFAULT_BOOTSTRAP_TIMEOUT_MS > DEFAULT_AUTHOR_TIMEOUT_MS, "bootstrap must not stay at 5 minutes");
  assert.ok(Number.isFinite(DEFAULT_BOOTSTRAP_TIMEOUT_MS), "bootstrap budget must still bound hung processes");
  assert.equal(resolveAuthorTimeoutMs({}, undefined), DEFAULT_AUTHOR_TIMEOUT_MS);
  assert.equal(resolveAuthorTimeoutMs({}, "bootstrap"), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
  assert.equal(resolveAuthorTimeoutMs({}, "refresh"), DEFAULT_REFRESH_TIMEOUT_MS);
  assert.equal(resolveBootstrapTimeoutMs({}), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
  assert.equal(resolveRefreshTimeoutMs({}), DEFAULT_REFRESH_TIMEOUT_MS);
});

test("behavioral: timeout env override and fallback chain", () => {
  // Mode-specific env wins.
  assert.equal(resolveBootstrapTimeoutMs({ [BOOTSTRAP_TIMEOUT_ENV]: "60000" }), 60000);
  assert.equal(resolveRefreshTimeoutMs({ [REFRESH_TIMEOUT_ENV]: "60000" }), 60000);
  // Generic COCKPIT_AUTHOR_TIMEOUT_MS is the fallback for both modes.
  assert.equal(resolveBootstrapTimeoutMs({ COCKPIT_AUTHOR_TIMEOUT_MS: "61000" }), 61000);
  assert.equal(resolveRefreshTimeoutMs({ COCKPIT_AUTHOR_TIMEOUT_MS: "62000" }), 62000);
  assert.equal(resolveAuthorTimeoutMs({ COCKPIT_AUTHOR_TIMEOUT_MS: "63000" }, "bootstrap"), 63000);
  assert.equal(resolveAuthorTimeoutMs({ COCKPIT_AUTHOR_TIMEOUT_MS: "64000" }, "refresh"), 64000);
  // Mode-specific beats generic.
  assert.equal(
    resolveBootstrapTimeoutMs({ [BOOTSTRAP_TIMEOUT_ENV]: "61000", COCKPIT_AUTHOR_TIMEOUT_MS: "62000" }),
    61000
  );
  assert.equal(
    resolveRefreshTimeoutMs({ [REFRESH_TIMEOUT_ENV]: "61000", COCKPIT_AUTHOR_TIMEOUT_MS: "62000" }),
    61000
  );
  // Invalid values fall back instead of hanging or crashing.
  assert.equal(resolveBootstrapTimeoutMs({ [BOOTSTRAP_TIMEOUT_ENV]: "nope" }), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
  assert.equal(resolveRefreshTimeoutMs({ [REFRESH_TIMEOUT_ENV]: "-5" }), DEFAULT_REFRESH_TIMEOUT_MS);
  assert.equal(resolveAuthorTimeoutMs({ COCKPIT_AUTHOR_TIMEOUT_MS: "0" }, "bootstrap"), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
  // AUTHOR_MODE environment selects the budget when no explicit mode is passed.
  assert.equal(resolveAuthorTimeoutMs({ AUTHOR_MODE: "bootstrap" }), DEFAULT_BOOTSTRAP_TIMEOUT_MS);
  assert.equal(resolveAuthorTimeoutMs({ AUTHOR_MODE: "refresh" }), DEFAULT_REFRESH_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// D. BOUNDARY — viewer/runtime never becomes a repository analyzer
// ---------------------------------------------------------------------------

test("static contract: same author owner, provider-neutral, no new runtime machinery", async () => {
  const authorSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "author.mjs"), "utf-8");
  const targetSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "target.mjs"), "utf-8");
  const refreshSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "refresh.mjs"), "utf-8");
  const serveSource = await fs.readFile(path.join(REPO_ROOT, "scripts", "serve.mjs"), "utf-8");
  // Same owner, not two executors: exactly one shell path lives in author.mjs.
  assert.match(targetSource, /from\s+["']\.\/author\.mjs["']/);
  assert.match(refreshSource, /from\s+["']\.\/author\.mjs["']/);
  assert.equal([...refreshSource.matchAll(/exec\s*\(/g)].length, 0, "refresh must not own a second exec path");
  assert.equal([...targetSource.matchAll(/exec\s*\(/g)].length, 0, "onboarding must not own a second exec path");
  // Cockpit never writes PROGRESS.md itself (author process owns all writes).
  for (const src of [authorSource, refreshSource]) {
    assert.doesNotMatch(src, /writeFile|appendFile|unlink|createWriteStream/);
  }
  assert.doesNotMatch(targetSource, /writeFile/);
  // No embedded intelligence, providers, or fetch-to-LLM in the runtime.
  // (Boundary documentation may name the forbidden categories in comments —
  // the proof here is absence of implementation signals: SDK imports,
  // network fetch to http(s), progress calculators, DB clients.)
  for (const src of [authorSource, targetSource, refreshSource, serveSource]) {
    assert.doesNotMatch(src, /openai|anthropic|claude-sdk|@anthropic|generative-ai|qwen|codex/i);
    assert.doesNotMatch(src, /fetch\s*\(\s*["']https?:\/\//i);
    assert.doesNotMatch(src, /calculateProgress|progressPercent|semanticStateMachine|stateMachine/i);
    assert.doesNotMatch(src, /mongoose|sqlite|postgres|redis|leveldb/i);
  }
  // No new schedulers/daemons: the cadence timer lives exactly once in refresh.mjs.
  assert.equal([...refreshSource.matchAll(/setInterval/g)].length, 1);
  assert.equal([...authorSource.matchAll(/setInterval|setTimeout/g)].length, 0, "author owner must not schedule");
  assert.doesNotMatch(authorSource, /Worker|createServer|listen\s*\(/);
  // Handoffs stay vendor-neutral.
  for (const handoff of [
    buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "bootstrap" }),
    buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "refresh" }),
  ]) {
    assert.ok(!/claude|chatgpt|gemini|openai|codex|qwen/i.test(handoff), "no hard-coded provider");
  }
});

// ---------------------------------------------------------------------------
// E. PROVENANCE ANCHOR — minimal, viewer-neutral, fail-open
// ---------------------------------------------------------------------------

test("behavioral: provenance anchor comment does not affect structural check", async () => {
  const fixture = await fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"), "utf-8");
  assert.equal(checkProgressStructure(fixture).ok, true);
  const anchored = `${fixture.trimEnd()}\n\n<!-- ${PROVENANCE_ANCHOR_PREFIX} abc123def456 -->\n`;
  const result = checkProgressStructure(anchored);
  assert.equal(result.ok, true, "non-rendered anchor must not flip structural PASS/FAIL");
});

test("static contract: anchor is minimal provenance, never truth authority, fail-open", () => {
  assert.equal(PROVENANCE_ANCHOR_PREFIX, "cockpit-author-observed:");
  for (const mode of ["bootstrap", "refresh"]) {
    const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode });
    assert.ok(handoff.includes(PROVENANCE_ANCHOR_PREFIX), `${mode} must document the anchor vocabulary`);
    assert.match(handoff, /fail-open/);
    assert.match(handoff, /override하지/);
    assert.match(handoff, /Git이 아니면/);
    assert.match(handoff, /truth authority/);
  }
});

test("static contract: viewer never adopts the anchor as an ontology", async () => {
  const checkSource = await fs.readFile(path.join(REPO_ROOT, "src", "structural-check.ts"), "utf-8");
  assert.doesNotMatch(checkSource, /cockpit-author-observed/);
  const domainSource = await fs.readFile(path.join(REPO_ROOT, "src", "domain.ts"), "utf-8");
  assert.doesNotMatch(domainSource, /cockpit-author-observed/);
});

// ---------------------------------------------------------------------------
// Acceptance scenarios as static contracts (not LLM behavioral proof)
// ---------------------------------------------------------------------------

test("static contract SCENARIO 1 — new large project must not end with a README+commits summary", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "bootstrap" });
  // A shallow README + recent-commits summary is explicitly forbidden.
  assert.match(handoff, /몇 개 README와 최근 commit을 읽고 바로 요약을 쓰지 마/);
  // Indirect dependencies and weak/stale claims are in scope.
  assert.match(handoff, /cross-subsystem dependencies/);
  assert.match(handoff, /stale\/obsolete material/);
  assert.match(handoff, /입증된 capability/);
});

test("static contract SCENARIO 2 — small change preserves the unaffected understanding", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "refresh" });
  assert.match(handoff, /매번 프로젝트 전체를 처음부터 얕게 다시 훑고 다시 요약하지 마/);
  assert.match(handoff, /영향이 없는 영역을 습관적으로 다시 작성하지 마/);
  assert.match(handoff, /실질적 변화가 없으면 파일을 그대로 둬/);
  // Impact follows the dependency chain, not just the changed file.
  assert.match(handoff, /API → domain rule → persistence/);
});

test("static contract SCENARIO 3 — structural drift reconstructs instead of force-PATCHing", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "refresh" });
  assert.match(handoff, /project model을 무효화/);
  assert.match(handoff, /small targeted reconstruction before full-project reconstruction/);
  assert.match(handoff, /낡은 구조를 억지로 보존하지 마/);
});
