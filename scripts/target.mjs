#!/usr/bin/env node
// Cockpit target acquisition + first-run onboarding: the single canonical
// owner for translating a CLI invocation into one concrete PROGRESS.md.
//
// Semantic path owned here:
//
//   CLI invocation
//     -> command / target intent resolution (parseArgs)
//     -> project target -> concrete progress document resolution
//        (resolveProgressTarget; shared by `serve` and `check`)
//     -> [existing] viewer launch for a concrete file (serve.mjs)
//        or explicit bootstrap UX when the representation is missing.
//
// serve.mjs keeps the loopback/read-only runtime; it must not duplicate
// path semantics. `cockpit check` shares resolution but never prompts,
// never writes, and never starts onboarding.

import path from "node:path";
import process from "node:process";
import { stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

export const PROGRESS_FILENAME = "PROGRESS.md";
export const DEFAULT_PORT = 4321;

// ---------------------------------------------------------------------------
// CLI parsing (single owner; previously duplicated between serve/check paths)
// ---------------------------------------------------------------------------

function parsePortValue(raw) {
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid --port value: ${raw}`);
  }
  return port;
}

function parseCheckArgs(argv) {
  let target = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      return { help: true, target };
    } else if (a.startsWith("-")) {
      throw new Error(`unknown check option: ${a}`);
    } else if (!target) {
      target = a;
    } else {
      throw new Error(`unexpected extra argument: ${a}`);
    }
  }
  return { help: false, target };
}

export function parseArgs(argv) {
  if (argv.length > 0 && argv[0] === "check") {
    const checkArgs = parseCheckArgs(argv.slice(1));
    return { command: "check", ...checkArgs };
  }

  let target = null;
  let port = DEFAULT_PORT;
  let noOpen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") {
      const raw = argv[++i];
      port = parsePortValue(raw);
    } else if (a === "--no-open") {
      noOpen = true;
    } else if (a === "--help" || a === "-h") {
      return { command: "serve", help: true, target, port, noOpen };
    } else if (a.startsWith("--port=")) {
      port = parsePortValue(a.slice(7));
    } else if (a.startsWith("-")) {
      throw new Error(`unknown option: ${a}`);
    } else if (!target) {
      target = a;
    } else {
      throw new Error(`unexpected extra argument: ${a}`);
    }
  }
  return { command: "serve", help: false, target, port, noOpen };
}

// ---------------------------------------------------------------------------
// Target -> progress document resolution (single owner)
// ---------------------------------------------------------------------------

async function isFile(p) {
  const st = await stat(p).catch(() => null);
  return Boolean(st && st.isFile());
}

/**
 * Resolve a raw CLI target to one concrete progress document.
 *
 * Accepted target shapes:
 *   null/undefined               -> current directory (default target)
 *   <existing directory>         -> <dir>/PROGRESS.md (first-class)
 *   <existing file>              -> that file directly (explicit fast path)
 *   <existing dir>/PROGRESS.md   -> missing representation for that project
 *                                    (missing-file, not invalid)
 *   anything else                -> invalid
 *
 * Never touches the network, never writes, never prompts. Pure resolution
 * over the filesystem plus deterministic classification.
 */
export async function resolveProgressTarget(rawTarget, cwd = process.cwd()) {
  const cwdAbs = path.resolve(cwd);

  if (rawTarget === null || rawTarget === undefined) {
    const progressFile = path.join(cwdAbs, PROGRESS_FILENAME);
    return {
      ok: true,
      targetKind: "default-directory",
      projectDir: cwdAbs,
      progressFile,
      exists: await isFile(progressFile),
    };
  }

  const abs = path.resolve(cwdAbs, rawTarget);
  const st = await stat(abs).catch(() => null);

  if (st && st.isDirectory()) {
    const progressFile = path.join(abs, PROGRESS_FILENAME);
    return {
      ok: true,
      targetKind: "directory",
      projectDir: abs,
      progressFile,
      exists: await isFile(progressFile),
    };
  }

  if (st && st.isFile()) {
    return {
      ok: true,
      targetKind: "file",
      projectDir: path.dirname(abs),
      progressFile: abs,
      exists: true,
    };
  }

  if (st) {
    // Exists but is neither a file nor a directory (socket, fifo, ...).
    return { ok: false, reason: `not a readable file or directory: ${abs}`, abs };
  }

  // Path does not exist. A missing PROGRESS.md inside an existing project
  // directory is onboarding, not an invalid target.
  if (path.basename(abs) === PROGRESS_FILENAME) {
    const parent = path.dirname(abs);
    const parentStat = await stat(parent).catch(() => null);
    if (parentStat && parentStat.isDirectory()) {
      return {
        ok: true,
        targetKind: "missing-file",
        projectDir: parent,
        progressFile: abs,
        exists: false,
      };
    }
  }

  return { ok: false, reason: `target not found: ${abs}`, abs };
}

// ---------------------------------------------------------------------------
// Interactive boundary (explicit; never hang when non-interactive)
// ---------------------------------------------------------------------------

export function isInteractive({ stdin = process.stdin, stdout = process.stdout } = {}) {
  return Boolean(stdin && stdin.isTTY && stdout && stdout.isTTY);
}

export async function promptLine(
  question,
  { stdin = process.stdin, stdout = process.stdout } = {}
) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer ?? "";
  } finally {
    rl.close();
  }
}

const AFFIRMATIVE = new Set(["y", "yes", "예", "네"]);

export function isAffirmative(answer) {
  return AFFIRMATIVE.has(String(answer ?? "").trim().toLowerCase());
}

/**
 * Interactive no-target acquisition: ask for the project target first, not
 * the internal progress-file artifact. Empty input means the current
 * directory. Testable via the injected `prompt` function.
 */
export async function acquireTargetInteractively({
  cwd = process.cwd(),
  stdin = process.stdin,
  stdout = process.stdout,
  prompt = promptLine,
  maxAttempts = 3,
} = {}) {
  const fallback = path.resolve(cwd);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let answer;
    try {
      answer = await prompt(
        `어떤 프로젝트를 Cockpit으로 볼까요?\n대상 경로 [${fallback}]: `,
        { stdin, stdout }
      );
    } catch {
      return { ok: false, reason: "cancelled" };
    }
    const trimmed = String(answer ?? "").trim();
    if (trimmed === "") {
      return { ok: true, rawTarget: null };
    }
    const abs = path.resolve(fallback, trimmed);
    const st = await stat(abs).catch(() => null);
    if (st && (st.isDirectory() || st.isFile())) {
      return { ok: true, rawTarget: trimmed };
    }
    stdout.write(`cockpit: 대상을 찾을 수 없습니다: ${abs}. 다시 입력해 주세요.\n`);
  }
  return { ok: false, reason: `no valid target after ${maxAttempts} attempts` };
}

// ---------------------------------------------------------------------------
// Bootstrap content (neutral; no fabricated project truth)
// ---------------------------------------------------------------------------

/**
 * Neutral starter scaffold. Deliberately NOT structurally valid: it carries
 * the README §5 headings (no second schema) with TODO placeholders and no
 * map items / area details, so `cockpit check` FAILs until an external agent
 * (or the author) grounds it in real evidence. No stages, areas, evidence,
 * or completion state is claimed.
 */
export function buildStarterContent({ projectName = "프로젝트" } = {}) {
  return `# ${projectName}

> 이 파일은 Cockpit 온보딩이 만든 중립 시작점이다. 아직 실제 저장소/런타임 증거와
> 대조되지 않았으므로 내용을 지어내지 않고 비워 두었다. \`README §5\` 구조를 따라
> 외부 에이전트(또는 작성자)가 실제 증거 기반으로 채울 차례다.
> 이 상태에서는 \`cockpit check\`가 FAIL인 것이 정상이다. (STRUCTURALLY VALID != EVIDENCE-GROUNDED)

## 현재 상황

아직 확인되지 않았다. (TODO: 저장소/런타임 증거와 대조해 현재 위치·확보된 것·가장 중요한 미완료 전환을 2~4문장으로 작성. 배경·이유·이력은 영역 상세/근거에)

## 다음 전환

아직 정의되지 않았다. (TODO: \`A 상태 → B 상태\` + 완료 조건 형태로 작성. 실행 command가 아님)

## 프로젝트 지도

<!-- TODO: README §5 규칙에 따라 \`###\` 레일 → \`####\` 그룹 → \`- **제목** — 한 줄 설명\` 형태로 실제 영역을 채울 것. -->
<!-- 지도 항목과 \`## 영역 상세\`의 \`### 제목\`은 정확히 1:1이어야 하며, 그 전까지 \`cockpit check\`는 FAIL이다. -->

## 영역 상세

<!-- TODO: 지도 항목마다 \`### 제목\` + \`#### 의미\` / \`#### 현재 수준\` / \`#### 근거\`를 증거 기반으로 작성. 확인된 미해결 문제가 있을 때만 \`#### 남은 문제\`를 둘 것. -->

## 제품 목표

<!-- TODO: 안정적 맥락을 간결하게 작성. 모르면 비워 둘 것. -->

## 확정된 방향

<!-- TODO: 영속적 결정만 작성. 모르면 비워 둘 것. -->
`;
}

/**
 * First-class preparation handoff for an external agent. Cockpit
 * itself stays non-intelligent: this text only tells an external agent
 * what to do. No vendor/tool is hard-coded; no internal architecture
 * (Problem Framer, parser modules) is required to understand it.
 */
export function buildAgentHandoff({ projectDir, progressFile }) {
  return `이 프로젝트의 실제 상태를 파악하여 Cockpit용 \`PROGRESS.md\` 문서를 작성해줘.

대상 프로젝트: ${projectDir}
작성 위치: ${progressFile}

먼저 저장소의 권위 문서(AGENTS.md, README.md, docs/, package.json 등), 실제 소스 코드 진입점과 실행 경로,
테스트 스위트, 최근 변경 이력을 각각 독립적으로 확인하고 서로 대조해줘. 한 축의 존재를 다른 축의
증명으로 비약하지 말고 (문서에 적혀 있다고 구현된 것이 아님), 모순은 미리 해결하고, 확인되지 않은
주장은 쓰지 마.

README §5의 마크다운 구조에 맞춰 사실 기반으로 작성해줘. 불확실한 영역은 지어내지 말고 생략하거나
모르는 범위와 경계를 명시해줘. 저장 후 반드시 \`cockpit check\`로 구조적 완전성을 확인해줘.`;
}

export function formatMissingGuidance({ projectDir, progressFile }) {
  return `cockpit: '${projectDir}'에는 PROGRESS.md가 아직 없습니다.
찾는 위치: ${progressFile}

Cockpit은 저장소를 분석하거나 내용을 자동으로 만들지 않습니다.
이 프로젝트를 보려면 PROGRESS.md를 실제 증거 기반으로 준비해야 합니다.`;
}

const NEXT_STEPS = `다음:
  1. 위 요청문을 외부 에이전트에게 전달해 실제 증거 기반으로 채우거나,
     중립 시작점을 직접 채운 뒤
  2. cockpit check <progress-file> 로 구조적 완전성을 확인하고
  3. cockpit <project-dir> 로 다시 실행하세요.`;

/**
 * Explicit first-run/bootstrap UX for a concrete target with no progress
 * representation. Identifies the owning project, never writes silently:
 * a starter file is created only after an explicit affirmative answer.
 * Returns an action descriptor; the caller decides the exit code.
 */
export async function runMissingProgressFlow({
  projectDir,
  progressFile,
  stdin = process.stdin,
  stdout = process.stdout,
  prompt = promptLine,
  writeFileFn = (f, c, e) => writeFile(f, c, e),
} = {}) {
  const projectName = path.basename(projectDir) || projectDir;
  stdout.write(`${formatMissingGuidance({ projectDir, progressFile })}\n\n`);
  stdout.write(`외부 에이전트에게 전달할 준비 요청문:\n\n`);
  stdout.write(`${buildAgentHandoff({ projectDir, progressFile })}\n\n`);

  let answer;
  try {
    answer = await prompt(
      `중립 시작점 파일을 만들까요? (${progressFile}) [y/N]: `,
      { stdin, stdout }
    );
  } catch {
    stdout.write(`\n${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
    return { action: "declined" };
  }

  if (!isAffirmative(answer)) {
    stdout.write(`\n파일을 만들지 않았습니다.\n`);
    stdout.write(`${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
    return { action: "declined" };
  }

  if (await isFile(progressFile)) {
    stdout.write(`\n그 사이 ${progressFile} 이(가) 생겼습니다. 다시 실행하세요:\n`);
    stdout.write(`  cockpit ${projectDir}\n`);
    return { action: "exists-now" };
  }

  try {
    await writeFileFn(progressFile, buildStarterContent({ projectName }), "utf-8");
  } catch (err) {
    stdout.write(`\n중립 시작점을 만들지 못했습니다: ${err.message}\n`);
    return { action: "write-failed", error: err };
  }

  stdout.write(`\n중립 시작점을 만들었습니다: ${progressFile}\n`);
  stdout.write(`이 상태에서는 \`cockpit check\`가 FAIL인 것이 정상입니다. 실제 증거 기반으로 채운 뒤:\n`);
  stdout.write(`  cockpit check ${progressFile}\n`);
  stdout.write(`  cockpit ${projectDir}\n`);
  return { action: "created" };
}

export const __testOnly = { AFFIRMATIVE };
