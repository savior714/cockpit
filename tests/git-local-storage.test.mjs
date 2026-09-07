import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runMissingProgressFlow } from "../scripts/target.mjs";
import { createRefreshOrchestrator } from "../scripts/refresh.mjs";
import {
  describeDisposition,
  ensureLocalExclude,
  ensureManagedStorage,
  isCockpitManagedContent,
} from "../scripts/git-local-exclude.mjs";
import { saveRecoveryReplica } from "../scripts/replica.mjs";
import { checkProgressStructure } from "../dist/structural-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVE = path.join(REPO_ROOT, "scripts", "serve.mjs");
const execFileAsync = promisify(execFile);

async function makeTempDir(t, prefix = "cockpit-git-storage-") {
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

function withAuthorCommand(t, value = "true") {
  const savedAuthor = process.env.COCKPIT_AUTHOR_COMMAND;
  const savedLegacy = process.env.COCKPIT_REFRESH_COMMAND;
  process.env.COCKPIT_AUTHOR_COMMAND = value;
  t.after(() => {
    if (savedAuthor === undefined) delete process.env.COCKPIT_AUTHOR_COMMAND;
    else process.env.COCKPIT_AUTHOR_COMMAND = savedAuthor;
    if (savedLegacy === undefined) delete process.env.COCKPIT_REFRESH_COMMAND;
    else process.env.COCKPIT_REFRESH_COMMAND = savedLegacy;
  });
}

async function git(cwd, ...args) {
  return execFileAsync("git", args, { cwd, encoding: "utf-8", timeout: 15000 });
}

async function initRepo(dir) {
  await git(dir, "-c", "init.defaultBranch=main", "init");
  await git(dir, "config", "user.email", "cockpit-test@example.com");
  await git(dir, "config", "user.name", "cockpit-test");
  await git(dir, "config", "commit.gpgsign", "false");
}

async function gitStatusPorcelain(cwd, ...args) {
  const { stdout } = await git(cwd, "status", "--porcelain", "--", ...args);
  return stdout;
}

async function excludeContentFor(cwd, progressFile) {
  const { stdout } = await git(cwd, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude");
  const excludeFile = stdout.trim();
  try {
    return { excludeFile, content: await fs.readFile(excludeFile, "utf-8") };
  } catch (err) {
    if (err?.code === "ENOENT") return { excludeFile, content: null };
    throw err;
  }
}

async function fixtureText() {
  return fs.readFile(path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md"), "utf-8");
}

function countRuleLines(content, rule) {
  if (!content) return 0;
  return content.split("\n").filter((line) => line.trim() === rule).length;
}

// ---------------------------------------------------------------------------
// 1. NON-GIT: no repo means plain use, no error, no Git side effect
// ---------------------------------------------------------------------------

test("1 NON-GIT: author success in a non-Git project, no Git side effect", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  const progressFile = path.join(dir, "PROGRESS.md");
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, await fixtureText(), "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  assert.equal(checkProgressStructure(await fs.readFile(progressFile, "utf-8")).ok, true);
  assert.equal(await fs.stat(path.join(dir, ".git")).then(() => true).catch(() => false), false);
  const d = await describeDisposition(progressFile);
  assert.equal(d.kind, "non-git");
  const s = await ensureManagedStorage(progressFile, { adopted: true });
  assert.equal(s.ok, true);
  assert.equal(s.action, "non-git");
});

// ---------------------------------------------------------------------------
// 2. NEW UNTRACKED GIT PROJECT: bootstrap success -> LOCAL, .gitignore intact
// ---------------------------------------------------------------------------

test("2 NEW UNTRACKED: bootstrap success applies exact local exclude, .gitignore byte-identical", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  await initRepo(dir);
  const gitignoreBody = "node_modules/\n*.log\n";
  await fs.writeFile(path.join(dir, ".gitignore"), gitignoreBody, "utf-8");
  await git(dir, "add", ".gitignore");
  await git(dir, "commit", "-m", "init");
  const progressFile = path.join(dir, "PROGRESS.md");
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, await fixtureText(), "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  assert.equal(await fs.readFile(progressFile, "utf-8"), await fixtureText());
  assert.equal(await fs.readFile(path.join(dir, ".gitignore"), "utf-8"), gitignoreBody);
  assert.equal(await gitStatusPorcelain(dir, "PROGRESS.md"), "", "PROGRESS.md must be silent in git status");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.ok(content !== null, "checkout-local exclude must exist");
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 1, "exactly one exact rule");
  assert.ok(!content.split("\n").some((l) => l.trim() === "PROGRESS.md"), "no bare wildcard rule");
});

// ---------------------------------------------------------------------------
// 3. IDEMPOTENCE: repeated disposition adds no duplicate rule
// ---------------------------------------------------------------------------

test("3 IDEMPOTENCE: repeated disposition keeps exactly one rule", async (t) => {
  const dir = await makeTempDir(t);
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  const first = await ensureManagedStorage(progressFile, { adopted: true });
  assert.equal(first.ok, true);
  assert.equal(first.action, "added");
  // After the first addition the checkout-local rule itself is an existing
  // ignore rule, so repetition converges to already-ignored: either way no
  // duplicate is written and repository .gitignore stays untouched.
  const second = await ensureManagedStorage(progressFile, { adopted: true });
  assert.equal(second.ok, true);
  assert.equal(second.action, "already-ignored");
  const third = await ensureLocalExclude(progressFile);
  assert.equal(third.action, "already-ignored");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 1);
});

// ---------------------------------------------------------------------------
// 4. TRACKED: existing tracked PROGRESS stays tracked, modifications visible
// ---------------------------------------------------------------------------

test("4 TRACKED: refresh keeps tracking, shows modifications, no untrack/exclude", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  withAuthorCommand(t);
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  await git(dir, "add", "PROGRESS.md");
  await git(dir, "commit", "-m", "track progress");
  const next = (await fixtureText()).replace("당일 수령 확정 증명이다.", "당일 수령 확정 증명이 닫혔다.");
  const orch = createRefreshOrchestrator({
    progressFile,
    execRefresh: async () => {
      await fs.writeFile(progressFile, next, "utf-8");
      return { outcome: "executed" };
    },
  });
  t.after(() => orch.dispose());
  orch.setEnabled(true);
  const result = await orch.runRefreshOnce("manual");
  assert.equal(result.outcome, "changed");
  const { stdout: tracked } = await git(dir, "ls-files", "--", "PROGRESS.md");
  assert.match(tracked, /PROGRESS\.md/, "must stay tracked");
  assert.match(await gitStatusPorcelain(dir, "PROGRESS.md"), /^ M PROGRESS\.md$/m, "modification must stay visible");
  const { stdout: lsFilesV } = await git(dir, "ls-files", "-v", "--", "PROGRESS.md");
  assert.match(lsFilesV, /^H /m, "no skip-worktree (S) / assume-unchanged (h)");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 0, "tracked file must gain no local rule");
  assert.equal(await fs.stat(path.join(dir, ".gitignore")).then(() => true).catch(() => false), false);
});

// ---------------------------------------------------------------------------
// 5. PRE-EXISTING UNTRACKED NON-COCKPIT: never silently claimed
// ---------------------------------------------------------------------------

test("5 UNMANAGED: name/check-PASS alone never claims a pre-existing file", async (t) => {
  const dir = await makeTempDir(t);
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  // Passes `cockpit check` but carries no Cockpit authorship marker.
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  assert.equal(isCockpitManagedContent(await fs.readFile(progressFile, "utf-8")), false);
  const s = await ensureManagedStorage(progressFile);
  assert.equal(s.ok, true);
  assert.equal(s.action, "unmanaged-skipped");
  assert.match(await gitStatusPorcelain(dir, "PROGRESS.md"), /^\?\? PROGRESS\.md$/m, "noise stays: not silently claimed");
  const d = await describeDisposition(progressFile);
  assert.equal(d.kind, "unmanaged");
});

test("5b CHECK: `cockpit check` on an unmanaged file writes no exclude", async (t) => {
  const dir = await makeTempDir(t);
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  let code;
  try {
    await execFileAsync(process.execPath, [SERVE, "check", progressFile], { cwd: dir, encoding: "utf-8", timeout: 15000 });
    code = 0;
  } catch (err) {
    code = err.code ?? 1;
  }
  assert.equal(code, 0, "fixture must PASS check");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 0, "check is read-only: no rule");
  assert.match(await gitStatusPorcelain(dir, "PROGRESS.md"), /^\?\? PROGRESS\.md$/m);
});

// ---------------------------------------------------------------------------
// 6. ALREADY IGNORED: existing policy respected, no duplicate, still works
// ---------------------------------------------------------------------------

test("6 ALREADY IGNORED: repo .gitignore wins, no local duplicate, flow succeeds", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  await initRepo(dir);
  const gitignoreBody = "/PROGRESS.md\n";
  await fs.writeFile(path.join(dir, ".gitignore"), gitignoreBody, "utf-8");
  await git(dir, "add", ".gitignore");
  await git(dir, "commit", "-m", "ignore progress");
  const progressFile = path.join(dir, "PROGRESS.md");
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, await fixtureText(), "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  assert.equal(await fs.readFile(path.join(dir, ".gitignore"), "utf-8"), gitignoreBody);
  const s = await ensureManagedStorage(progressFile, { adopted: true });
  assert.equal(s.ok, true);
  assert.equal(s.action, "already-ignored");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 0, "no local duplicate needed");
});

// ---------------------------------------------------------------------------
// 7. NESTED PROJECT: exact repo-relative path only, siblings unaffected
// ---------------------------------------------------------------------------

test("7 NESTED: subproject rule is exact, sibling PROGRESS.md unaffected", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  await initRepo(dir);
  const sub = path.join(dir, "apps", "foo");
  await fs.mkdir(sub, { recursive: true });
  const progressFile = path.join(sub, "PROGRESS.md");
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(sub),
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, await fixtureText(), "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "authored");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/apps/foo/PROGRESS.md"), 1, "exact nested rule");
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 0, "no root-level rule");
  assert.ok(!content.split("\n").some((l) => l.trim() === "PROGRESS.md"), "no wildcard");
  const siblingDir = path.join(dir, "apps", "bar");
  await fs.mkdir(siblingDir, { recursive: true });
  await fs.writeFile(path.join(siblingDir, "PROGRESS.md"), "sibling\n", "utf-8");
  assert.equal(await gitStatusPorcelain(dir, "apps/foo/PROGRESS.md"), "", "managed file silent");
  assert.match(await gitStatusPorcelain(dir, "apps/bar/PROGRESS.md"), /^\?\? apps\/bar\/PROGRESS\.md$/m, "sibling still visible");
});

// ---------------------------------------------------------------------------
// 8. LINKED WORKTREE: no `.git`-is-directory assumption, per-worktree location
// ---------------------------------------------------------------------------

test("8 LINKED WORKTREE: per-worktree exclude, no source diff", async (t) => {
  const dir = await makeTempDir(t, "cockpit-git-main-");
  await initRepo(dir);
  await fs.writeFile(path.join(dir, "seed.txt"), "seed\n", "utf-8");
  await git(dir, "add", "seed.txt");
  await git(dir, "commit", "-m", "seed");
  const wtParent = await makeTempDir(t, "cockpit-git-wtparent-");
  const wt = path.join(wtParent, "wt");
  await git(dir, "worktree", "add", "--detach", wt, "HEAD");
  t.after(async () => {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: dir, timeout: 15000 });
    } catch {}
  });
  // Linked worktrees keep `.git` as a file: the exclude owner must not
  // assume it is a directory (it never reads `.git` directly; the
  // location always comes from Git's canonical git-path).
  assert.equal((await fs.stat(path.join(wt, ".git"))).isFile(), true);
  const progressFile = path.join(wt, "PROGRESS.md");
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  const gitignoreBefore = await fs.readFile(path.join(dir, ".gitignore"), "utf-8").catch(() => null);
  const s = await ensureManagedStorage(progressFile, { adopted: true });
  assert.equal(s.ok, true);
  assert.equal(s.action, "added");
  assert.equal(s.rule, "/PROGRESS.md");
  const { stdout: wtExcludeRaw } = await git(wt, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude");
  assert.equal(path.resolve(s.excludeFile), path.resolve(wtExcludeRaw.trim()), "must use Git's canonical git-path");
  // Git resolves info/exclude through the common dir, so linked worktrees
  // of one repo share this checkout-local file: that is Git's own
  // location semantics, still uncommitted local metadata, never
  // repository source. The contract is the canonical location + no
  // source diff, not a per-worktree file.
  const { content: wtContent } = await excludeContentFor(wt, progressFile);
  assert.equal(countRuleLines(wtContent, "/PROGRESS.md"), 1);
  const { stdout: mainStatus } = await git(dir, "status", "--porcelain");
  assert.doesNotMatch(mainStatus, /^ M /m, "no tracked source modification in main checkout");
  const gitignoreAfter = await fs.readFile(path.join(dir, ".gitignore"), "utf-8").catch(() => null);
  assert.equal(gitignoreAfter, gitignoreBefore);
  assert.equal(await gitStatusPorcelain(wt, "PROGRESS.md"), "", "worktree status silent for managed file");
});

// ---------------------------------------------------------------------------
// 9. RECOVERY: explicit restore success applies disposition; failure adds none
// ---------------------------------------------------------------------------

test("9 RECOVERY: explicit restore success applies LOCAL disposition", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  await fs.writeFile(progressFile, await fixtureText(), "utf-8");
  const saved = await saveRecoveryReplica(progressFile);
  assert.equal(saved.ok, true);
  await fs.rm(progressFile);
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      throw new Error("author must not run on the restore path");
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
  });
  assert.equal(r.action, "restored");
  assert.equal(await fs.readFile(progressFile, "utf-8"), await fixtureText());
  assert.equal(await gitStatusPorcelain(dir, "PROGRESS.md"), "", "restored managed file silent");
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 1);
});

test("9b RECOVERY FAILURE: failed restore applies no exclude", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  await initRepo(dir);
  const progressFile = path.join(dir, "PROGRESS.md");
  const prompts = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: () => {} },
    prompt: async (q) => {
      prompts.push(q);
      return "y";
    },
    readReplicaFn: async () => ({ exists: true, key: "k", replicaFile: "/none" }),
    restoreReplicaFn: async () => ({ ok: false, error: new Error("disk gone (simulated)") }),
    runAuthorFn: async () => ({ outcome: "executed" }),
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => null,
  });
  assert.equal(r.action, "author-missing");
  assert.ok(prompts.length >= 1);
  assert.equal(await fs.stat(progressFile).then(() => true).catch(() => false), false);
  const { content } = await excludeContentFor(dir, progressFile);
  assert.equal(countRuleLines(content, "/PROGRESS.md"), 0, "restore failure must add no rule");
});

// ---------------------------------------------------------------------------
// 10. HOUSEKEEPING FAILURE: semantic success stands, file kept, warning shown
// ---------------------------------------------------------------------------

test("10 HOUSEKEEPING FAILURE: bootstrap success stands with a clear warning", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  const progressFile = path.join(dir, "PROGRESS.md");
  const out = [];
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
    progressFile,
    stdin: {},
    stdout: { write: (s) => out.push(s) },
    prompt: async () => "y",
    runAuthorFn: async () => {
      await fs.writeFile(progressFile, await fixtureText(), "utf-8");
      return { outcome: "executed" };
    },
    checkFn: (content) => checkProgressStructure(content),
    resolveAuthorCommandFn: () => "fixture-author",
    ensureStorageFn: async () => ({
      ok: false,
      action: "housekeeping-failed",
      progressFile,
      rule: "/PROGRESS.md",
      error: new Error("exclude unwritable (simulated)"),
    }),
  });
  assert.equal(r.action, "authored", "semantic success must stand");
  assert.equal(await fs.readFile(progressFile, "utf-8"), await fixtureText(), "file must be kept");
  assert.match(out.join(""), /warning.*local Git exclude/i, "warning must be explicit");
});

test("10b ORDER: author/check failure never reaches storage disposition", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  const progressFile = path.join(dir, "PROGRESS.md");
  let storageCalls = 0;
  const r = await runMissingProgressFlow({
    projectDir: path.resolve(dir),
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
    ensureStorageFn: async () => {
      storageCalls++;
      return { ok: true, action: "added" };
    },
  });
  assert.equal(r.action, "author-invalid");
  assert.equal(storageCalls, 0, "exclude must never run before author/check success");
});

test("10c HOUSEKEEPING FAILURE: refresh success stands with a warning", async (t) => {
  const dir = await makeTempDir(t);
  withReplicaRoot(t, await makeIsolatedReplicaRoot(t));
  withAuthorCommand(t);
  const file = path.join(dir, "PROGRESS.md");
  await fs.writeFile(file, "# Test\n\n## 현재 상황\n\n이전 상태.\n", "utf-8");
  const afterText = "# Test\n\n## 현재 상황\n\n새 상태가 확인됨.\n";
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const orch = createRefreshOrchestrator({
      progressFile: file,
      execRefresh: async () => {
        await fs.writeFile(file, afterText, "utf-8");
        return { outcome: "executed" };
      },
      ensureStorageFn: async () => ({ ok: false, action: "housekeeping-failed", error: new Error("exclude down (simulated)") }),
    });
    t.after(() => orch.dispose());
    orch.setEnabled(true);
    const result = await orch.runRefreshOnce("manual");
    assert.equal(result.outcome, "changed", "refresh success must stand");
  } finally {
    console.error = origError;
  }
  assert.equal(await fs.readFile(file, "utf-8"), afterText, "refreshed file must be kept");
  assert.ok(errors.join("\n").match(/warning.*local Git exclude/i), "refresh storage failure must warn");
});

// ---------------------------------------------------------------------------
// Adoption rule unit contract
// ---------------------------------------------------------------------------

test("adoption rule: only Cockpit authorship signals count, never the filename", () => {
  assert.equal(isCockpitManagedContent("<!-- cockpit-author-observed: abc123 -->"), true);
  assert.equal(isCockpitManagedContent("<!-- cockpit-progress -->"), true);
  assert.equal(isCockpitManagedContent("# PROGRESS\n\n## 현재 상황\n\n본문.\n"), false);
  assert.equal(isCockpitManagedContent(""), false);
  assert.equal(isCockpitManagedContent(null), false);
});

test("DO NOT: helper owns no history/workflow/commit machinery", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "scripts", "git-local-exclude.mjs"), "utf-8");
  // Executable history/workflow signals (not boundary prose): the only
  // transport is one execFile("git", ...) call, and every argv passed to
  // runGit must come from the narrow storage-hygiene allowlist.
  assert.equal([...source.matchAll(/execFile\(\s*"git"/g)].length, 1, "exactly one git transport");
  const allowed = new Set([
    "rev-parse", "--is-inside-work-tree", "--show-toplevel",
    "--path-format=absolute", "--git-path", "info/exclude",
    "ls-files", "--error-unmatch", "--",
    "check-ignore", "-q",
  ]);
  const calls = [...source.matchAll(/runGit\(\[([^\]]*)\]/g)];
  assert.ok(calls.length >= 5, "all repository-native commands stay visible");
  for (const [, argv] of calls) {
    const tokens = [...argv.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    assert.ok(tokens.length > 0, "git argv must be string literals");
    for (const token of tokens) {
      assert.ok(allowed.has(token), `git argv outside storage-hygiene allowlist: ${token}`);
    }
  }
  assert.doesNotMatch(source, /rev-list|cat-file|reflog|show-ref|for-each-ref/);
  assert.doesNotMatch(source, /--skip-worktree|--assume-unchanged/);
  assert.doesNotMatch(source, /"--cached"/);
  assert.doesNotMatch(source, /"[^"\n]*\.gitignore[^"\n]*"|'[^'\n]*\.gitignore[^'\n]*'/, "no .gitignore path literal");
  assert.doesNotMatch(source, /"(?:\.\/)?PROGRESS\.md"/, "no bare wildcard rule literal");
  assert.doesNotMatch(source, /writeFile\(.*progressFile|progressFile.*writeFile/i, "helper never writes PROGRESS.md");
});
