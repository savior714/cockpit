import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

test("Distribution artifact smoke: pack, install into isolated prefix, and verify CLI & viewer", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cockpit-smoke-"));

  t.after(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Pack tarball into tmpDir
  const packOutput = execSync(`npm pack --pack-destination "${tmpDir}"`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();

  const tarballName = packOutput.split("\n").filter(Boolean).pop().trim();
  const tarballPath = path.join(tmpDir, tarballName);

  // Verify tarball contents do NOT include src/
  const tarballListing = execSync(`tar -tf "${tarballPath}"`, {
    encoding: "utf-8",
  });
  const files = tarballListing.split("\n").filter(Boolean);
  const srcFiles = files.filter((f) => f.startsWith("package/src/"));
  assert.equal(
    srcFiles.length,
    0,
    `Packaged tarball must not contain raw src/ files. Found: ${srcFiles.join(", ")}`
  );

  const hasParserJs = files.includes("package/dist/parser.js");
  assert.ok(hasParserJs, "Packaged tarball must include package/dist/parser.js");

  assert.ok(files.includes("package/scripts/cockpit.mjs"), "Packaged tarball must include package/scripts/cockpit.mjs");
  assert.ok(files.includes("package/scripts/freshness.mjs"), "Packaged tarball must include package/scripts/freshness.mjs");
  assert.ok(files.includes("package/scripts/serve.mjs"), "Packaged tarball must include package/scripts/serve.mjs");

  // 2. Install tarball into isolated npm prefix
  execSync(`npm install -g --prefix "${tmpDir}" "${tarballPath}"`, {
    cwd: tmpDir,
    encoding: "utf-8",
  });

  const installedPkg = path.join(tmpDir, "lib", "node_modules", "cockpit");
  let hasGit = true;
  try {
    await fs.stat(path.join(installedPkg, ".git"));
  } catch {
    hasGit = false;
  }
  assert.equal(hasGit, false, "Packaged installation must not contain .git");

  const binPath = path.join(tmpDir, "bin", "cockpit");

  // Fresh install must resolve the canonical bin target (cockpit.mjs, the
  // freshness-guard owner) — never a stale direct serve.mjs link.
  const binLinkTarget = await fs.readlink(binPath);
  assert.ok(
    binLinkTarget.endsWith(path.join("scripts", "cockpit.mjs")),
    `Fresh-install bin must resolve to scripts/cockpit.mjs. Got: ${binLinkTarget}`
  );
  assert.doesNotMatch(binLinkTarget, /serve\.mjs/);

  // 3. Test: cockpit --help & cockpit check --help
  const helpOutput = execSync(`"${binPath}" --help`, { encoding: "utf-8" });
  assert.match(helpOutput, /Usage: cockpit/);
  assert.match(helpOutput, /check \[path\]/);
  assert.match(helpOutput, /Operator note:/);
  assert.match(helpOutput, /reconcile PROGRESS\.md with current project evidence first/);

  const checkHelpOutput = execSync(`"${binPath}" check --help`, { encoding: "utf-8" });
  assert.match(checkHelpOutput, /Usage: cockpit check \[path\/to\/PROGRESS\.md\]/);
  assert.match(checkHelpOutput, /Deterministically verifies that PROGRESS\.md is structurally complete/);

  // 4. Test: cockpit check <valid fixture> -> exit 0 / PASS
  const validFixture = path.join(REPO_ROOT, "tests", "fixtures", "operational-system.md");
  const validOutput = execSync(`"${binPath}" check "${validFixture}"`, {
    encoding: "utf-8",
  });
  assert.match(validOutput, /PROGRESS structural check:\s+PASS/);
  assert.match(validOutput, /Map items:\s+8/);

  // 5. Test: cockpit check <invalid 7-map / 2-detail fixture> -> exit 1 / exact 5 missing
  const invalidDoc = `# 복합 시스템 프로젝트

## 프로젝트 지도

### 1차 운영 레일
#### 핵심 제어 그룹
- **센서 계측 인터페이스** — 실시간 센서 데이터 수집
- **원격 제어 릴레이** — 액추에이터 원격 제어 인터페이스

### 2차 도입 궤적
#### 확보된 기반
- **환경 챔버 검증** — 통제 환경 내구성 확인

#### 현재 단계
- **현장 실증 가동** — 실제 현장 가동 및 패킷 손실률 확인

#### 향후 계획
- **운영 안전 경계** — 비상 정지 및 페일세이프 회로 구성
- **직접 회귀와 계약 정합화** — 회귀 테스트 스위트 확립
- **검증된 RELEASE와 첫 운영 회차** — 정식 릴리스 및 1차 운영

## 영역 상세

### 센서 계측 인터페이스
#### 의미
센서 데이터 수집.
#### 현재 수준
완료.
#### 근거
- 코드 확인

### 현장 실증 가동
#### 의미
현장 무중단 가동.
#### 현재 수준
진행 중.
#### 남은 문제
- 실증 중
#### 근거
- 런타임 로그
`;

  const invalidFilePath = path.join(tmpDir, "invalid.md");
  await fs.writeFile(invalidFilePath, invalidDoc, "utf-8");

  let invalidFailedAsExpected = false;
  let invalidOutput = "";
  try {
    invalidOutput = execSync(`"${binPath}" check "${invalidFilePath}"`, {
      encoding: "utf-8",
    });
  } catch (err) {
    invalidFailedAsExpected = true;
    invalidOutput = (err.stdout || "") + (err.stderr || "");
    assert.equal(err.status, 1, "Exit code must be 1 on structural FAIL");
  }
  assert.ok(invalidFailedAsExpected, "cockpit check on invalid doc must exit non-zero");
  assert.match(invalidOutput, /PROGRESS structural check:\s+FAIL/);
  assert.match(invalidOutput, /Map items:\s+7/);
  assert.match(invalidOutput, /Area details:\s+2/);
  assert.match(invalidOutput, /Missing details:\s+5/);
  assert.match(invalidOutput, /- 원격 제어 릴레이/);
  assert.match(invalidOutput, /- 환경 챔버 검증/);
  assert.match(invalidOutput, /- 운영 안전 경계/);
  assert.match(invalidOutput, /- 직접 회귀와 계약 정합화/);
  assert.match(invalidOutput, /- 검증된 RELEASE와 첫 운영 회차/);

  // 6. Test: Viewer starts, serves PROGRESS.md and index.html, terminates cleanly
  const viewerProc = spawn(process.execPath, [binPath, validFixture, "--port", "0", "--no-open"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let assignedPort = null;
  let stdoutData = "";
  let stderrData = "";
  viewerProc.stdout.on("data", (d) => {
    stdoutData += d.toString("utf-8");
    const m = stdoutData.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) {
      assignedPort = Number.parseInt(m[1], 10);
    }
  });
  viewerProc.stderr.on("data", (d) => {
    stderrData += d.toString("utf-8");
  });

  // Wait for server to start (up to 5 seconds)
  const startTime = Date.now();
  while (!assignedPort && Date.now() - startTime < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(assignedPort, `Viewer server failed to start on port 0. Stdout: ${stdoutData}, Stderr: ${stderrData}`);

  // Fetch / and verify index.html
  const indexHtml = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${assignedPort}/`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
  assert.match(indexHtml, /<title>Cockpit<\/title>/);
  assert.match(indexHtml, /id="cockpit"/);

  // Fetch /progress.md and verify fixture content
  const fetchedProgress = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${assignedPort}/progress.md`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "text/markdown; charset=utf-8");
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
  assert.match(fetchedProgress, /스마트 엣지 텔레메트리 시스템/);
  assert.match(fetchedProgress, /프로젝트 지도/);

  // Terminate cleanly
  const exitPromise = new Promise((resolve) => viewerProc.on("exit", resolve));
  viewerProc.kill("SIGTERM");
  await exitPromise;

  // 7. Test: installed CLI serves a project-directory target (first-class)
  const projDir = path.join(tmpDir, "sample-proj");
  await fs.mkdir(projDir, { recursive: true });
  await fs.copyFile(validFixture, path.join(projDir, "PROGRESS.md"));

  const dirProc = spawn(process.execPath, [binPath, projDir, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let dirPort = null;
  let dirStdout = "";
  dirProc.stdout.on("data", (d) => {
    dirStdout += d.toString("utf-8");
    const m = dirStdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) dirPort = Number.parseInt(m[1], 10);
  });
  const dirStart = Date.now();
  while (!dirPort && Date.now() - dirStart < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(dirPort, `Directory-target server failed to start. Stdout: ${dirStdout}`);
  assert.match(dirStdout, /PROGRESS\.md/);

  const dirProgress = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${dirPort}/progress.md`, (res) => {
      assert.equal(res.statusCode, 200);
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
  assert.match(dirProgress, /스마트 엣지 텔레메트리 시스템/);
  const dirExit = new Promise((resolve) => dirProc.on("exit", resolve));
  dirProc.kill("SIGTERM");
  await dirExit;

  // 8. Test: installed CLI first-run in an empty project is deterministic
  const emptyDir = path.join(tmpDir, "fresh-proj");
  await fs.mkdir(emptyDir, { recursive: true });
  let firstRunFailedAsExpected = false;
  let firstRunOutput = "";
  try {
    execSync(`"${binPath}" --no-open --port 0`, {
      cwd: emptyDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
  } catch (err) {
    firstRunFailedAsExpected = true;
    firstRunOutput = (err.stdout || "") + (err.stderr || "");
    assert.equal(err.status, 1, "First-run without PROGRESS.md must exit 1");
  }
  assert.ok(firstRunFailedAsExpected, "First-run without PROGRESS.md must exit non-zero");
  assert.match(firstRunOutput, /progress representation/);
  assert.ok(
    firstRunOutput.includes(path.resolve(emptyDir)),
    "First-run output must identify the target project"
  );
  let wroteUnexpected = true;
  try {
    await fs.stat(path.join(emptyDir, "PROGRESS.md"));
  } catch {
    wroteUnexpected = false;
  }
  assert.equal(wroteUnexpected, false, "Non-interactive first-run must not write files");
});
