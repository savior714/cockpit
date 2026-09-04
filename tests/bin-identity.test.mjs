import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const execFileAsync = promisify(execFile);

async function runBin(bin, args, { timeout = 15000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: REPO_ROOT,
      timeout,
      encoding: "utf-8",
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

test("bin identity: package.json declares scripts/cockpit.mjs as the canonical entry", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf-8"));
  assert.equal(pkg.bin?.cockpit, "./scripts/cockpit.mjs");
  assert.match(pkg.scripts?.cockpit ?? "", /scripts\/cockpit\.mjs/);
});

test("bin identity: cockpit.mjs owns the freshness guard and delegates to serve.mjs", async () => {
  const entry = await fs.readFile(path.join(REPO_ROOT, "scripts", "cockpit.mjs"), "utf-8");
  assert.match(entry, /ensureFreshBuild/);
  assert.match(entry, /serve\.mjs/);
});

test("bin identity: stale cockpit->serve.mjs link fails loud instead of serving", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-bin-identity-"));
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  const binDir = path.join(tmpDir, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const staleLink = path.join(binDir, "cockpit");
  await fs.symlink(path.join(REPO_ROOT, "scripts", "serve.mjs"), staleLink);
  const fixture = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");

  const r = await runBin(staleLink, ["check", fixture]);
  assert.equal(r.code, 1, "stale bin link must exit non-zero");
  assert.match(r.stderr, /stale install detected/);
  assert.match(r.stderr, /cockpit\.mjs/);
  assert.doesNotMatch(r.stdout, /PROGRESS structural check:\s+PASS/);
});

test("bin identity: direct serve.mjs file invocation still passes (no false positive)", async () => {
  const fixture = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");
  const r = await runBin(process.execPath, [
    path.join(REPO_ROOT, "scripts", "serve.mjs"),
    "check",
    fixture,
  ]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /PROGRESS structural check:\s+PASS/);
});

test("bin identity: canonical cockpit.mjs entry still passes", async () => {
  const fixture = path.join(REPO_ROOT, "tests", "fixtures", "canonical-minimal.md");
  const r = await runBin(process.execPath, [
    path.join(REPO_ROOT, "scripts", "cockpit.mjs"),
    "check",
    fixture,
  ]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /PROGRESS structural check:\s+PASS/);
});
