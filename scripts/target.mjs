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
// Bootstrap never fabricates project truth and never creates a neutral
// starter: a missing PROGRESS.md is owned by the canonical LLM author
// capability (scripts/author.mjs, COCKPIT_AUTHOR_COMMAND with legacy
// COCKPIT_REFRESH_COMMAND fallback). This module only resolves the target,
// offers an explicit confirmed restore from the recovery replica
// (scripts/replica.mjs, exact bytes, stale-possible) before fresh authorship,
// invokes that one author capability after explicit confirmation, verifies
// via read-back (+ structural check when a checker is provided), and then
// stores the exact bytes as a recovery replica (warning-only on failure).
//
// serve.mjs keeps the loopback/read-only runtime; it must not duplicate
// path semantics. `cockpit check` shares resolution but never prompts,
// never writes, and never starts onboarding.

import path from "node:path";
import process from "node:process";
import { stat, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import {
  buildAuthorHandoff as buildCanonicalAuthorHandoff,
  resolveAuthorCommand,
  resolveAuthorCommandSource,
  runAuthorCommand,
} from "./author.mjs";
import {
  readRecoveryReplica as defaultReadRecoveryReplica,
  restoreRecoveryReplica as defaultRestoreRecoveryReplica,
  saveRecoveryReplica as defaultSaveRecoveryReplica,
} from "./replica.mjs";

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
    } else if (a === "--version" || a === "-V") {
      return { command: "version" };
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
// Bootstrap authorship (LLM author owns PROGRESS.md semantics)
// ---------------------------------------------------------------------------
//
// Cockpit never fabricates project truth and never writes a neutral starter.
// A missing PROGRESS.md is owned by the canonical LLM author capability.
// This module only invokes that one capability (shared with refresh) after
// explicit confirmation, then verifies via read-back and structural check.

/**
 * Canonical LLM author handoff request. Bootstrap and refresh share one
 * author responsibility; the author decides create-vs-PATCH from file
 * existence and fresh evidence. Single owner lives in scripts/author.mjs.
 */
export function buildAuthorHandoff({ projectDir, progressFile }) {
  return buildCanonicalAuthorHandoff({ projectDir, progressFile });
}

/**
 * Legacy name for the same single author handoff — not an independent
 * executor. Kept so existing callers keep resolving to the canonical text.
 */
export function buildAgentHandoff({ projectDir, progressFile }) {
  return buildCanonicalAuthorHandoff({ projectDir, progressFile });
}

export function formatMissingGuidance({ projectDir, progressFile }) {
  return `cockpit: '${projectDir}'에는 PROGRESS.md가 아직 없습니다.
찾는 위치: ${progressFile}

이 프로젝트의 PROGRESS.md는 LLM author가 작성해야 합니다.
LLM이 PROGRESS.md를 작성·대조하고, Cockpit은 결정론적으로 검사·읽기·렌더링만 합니다.
Cockpit은 저장소를 분석하거나 내용을 만들지 않으며, 중립 시작점을 자동 생성하지 않습니다.`;
}

export function formatAuthorMissingGuidance() {
  return `현재 author capability가 연결되지 않았습니다.
연결 방법: COCKPIT_AUTHOR_COMMAND 환경 변수에 LLM author를 호출하는 명령을 지정하세요.
예: COCKPIT_AUTHOR_COMMAND="my-llm-author --write" cockpit <project-dir>
기존 COCKPIT_REFRESH_COMMAND도 같은 의미의 fallback으로 인식됩니다.
명령은 PROJECT_DIR / PROGRESS_FILE 환경 변수로 호출되며, 해당 위치에 증거 기반 PROGRESS.md를 작성해야 합니다.`;
}

const NEXT_STEPS = `다음:
  1. 위 요청문을 LLM author에게 전달해 실제 증거 기반으로 작성하거나,
     COCKPIT_AUTHOR_COMMAND로 author capability를 연결한 뒤 호출하고
     (사람이 직접 파일을 고치는 경우는 filesystem 소유자로서 보조 경로일 뿐이다)
  2. cockpit check <progress-file> 로 구조적 완전성을 확인하고
  3. cockpit <project-dir> 로 다시 실행하세요.`;

/**
 * Explicit first-run/bootstrap UX for a concrete target with no progress
 * representation. Never fabricates project truth and never creates a
 * neutral starter:
 *
 *   - recovery replica first: when a recovery copy exists for this project
 *     key, propose restoring its exact bytes to the canonical target before
 *     any fresh authorship. Restore runs only after explicit confirmation,
 *     is labelled stale-possible, and keeps author reconciliation duty.
 *   - no author capability  -> guidance only, non-zero, no prompt
 *     beyond the handoff display (and no canonical write)
 *   - author configured     -> explicit confirmation, then invoke the ONE
 *     author capability (shared with refresh), read back the file, and
 *     verify with the structural check when a checker is provided. After
 *     that success, store the exact bytes as a recovery replica;
 *     replica failure only warns and never flips author success.
 *
 * Non-interactive callers must not invoke this with an auto-affirmative
 * prompt: no silent canonical writes. Returns an action descriptor; the
 * caller decides the exit code.
 */
export async function runMissingProgressFlow({
  projectDir,
  progressFile,
  stdin = process.stdin,
  stdout = process.stdout,
  prompt = promptLine,
  runAuthorFn,
  checkFn,
  resolveAuthorCommandFn,
  readFileFn,
  readReplicaFn,
  restoreReplicaFn,
  saveReplicaFn,
} = {}) {
  stdout.write(`${formatMissingGuidance({ projectDir, progressFile })}\n\n`);

  // Recovery check comes before any fresh-authorship proposal. Existence
  // only: no repository inspection, no content analysis.
  const readReplica = readReplicaFn ?? ((f) => defaultReadRecoveryReplica(f));
  let replica = null;
  try {
    replica = await readReplica(progressFile);
  } catch {
    replica = null;
  }
  if (replica && replica.exists) {
    stdout.write(`복구 가능한 recovery copy가 있습니다.\n`);
    stdout.write(`recovery copy: ${replica.replicaFile}\n`);
    stdout.write(`복원 대상(canonical): ${progressFile}\n`);
    if (replica.mtimeMs) {
      try {
        stdout.write(`recovery copy 시각: ${new Date(replica.mtimeMs).toISOString()}\n`);
      } catch {}
    }
    stdout.write(`주의: recovery copy이므로 stale할 수 있습니다. 복구 후에도 LLM author가 최신 증거와 대조해야 합니다.\n\n`);
    let restoreAnswer;
    try {
      restoreAnswer = await prompt(
        `recovery copy를 canonical 위치로 복원할까요? (${progressFile}) [y/N]: `,
        { stdin, stdout }
      );
    } catch {
      stdout.write(`\n${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
      return { action: "declined" };
    }
    if (isAffirmative(restoreAnswer)) {
      const restore = restoreReplicaFn ?? ((f) => defaultRestoreRecoveryReplica(f));
      let restored = null;
      try {
        restored = await restore(progressFile);
      } catch (err) {
        restored = { ok: false, error: err };
      }
      if (!restored || !restored.ok) {
        const detail = restored?.error?.message ?? restored?.error ?? "unknown error";
        stdout.write(`\nrecovery copy 복원에 실패했습니다: ${detail}\n`);
        stdout.write(`파일을 쓰지 않았습니다. 아래 fresh authorship 흐름으로 계속합니다.\n\n`);
      } else {
        stdout.write(`\nrecovery copy를 복원했습니다: ${progressFile}\n`);
        stdout.write(`주의: 복원된 파일은 recovery copy이므로 stale할 수 있습니다. LLM author가 최신 증거와 대조해야 합니다.\n`);
        stdout.write(`다음:\n  1. LLM author에게 최신 증거 대조를 요청하고\n  2. cockpit check ${progressFile} 로 구조적 완전성을 확인하고\n  3. cockpit ${projectDir} 로 다시 실행하세요.\n`);
        return { action: "restored", key: restored.key ?? replica.key, replicaFile: restored.replicaFile ?? replica.replicaFile };
      }
    } else {
      stdout.write(`\nrecovery copy를 복원하지 않았습니다. 파일을 만들지 않았습니다.\n\n`);
    }
  }

  stdout.write(`LLM author에게 전달할 준비 요청문:\n\n`);
  stdout.write(`${buildAuthorHandoff({ projectDir, progressFile })}\n\n`);

  const resolveCommand = resolveAuthorCommandFn ?? resolveAuthorCommand;
  const command = resolveCommand();
  const source = (resolveAuthorCommandSource) ? resolveAuthorCommandSource() : null;
  if (!command) {
    stdout.write(`${formatAuthorMissingGuidance()}\n\n`);
    stdout.write(`${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
    return { action: "author-missing" };
  }
  if (source === "refresh-legacy") {
    stdout.write(`참고: COCKPIT_REFRESH_COMMAND로 연결된 author capability를 사용합니다. 권장 명칭은 COCKPIT_AUTHOR_COMMAND입니다.\n\n`);
  }

  let answer;
  try {
    answer = await prompt(
      `LLM author를 호출할까요? (${progressFile}) [y/N]: `,
      { stdin, stdout }
    );
  } catch {
    stdout.write(`\n${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
    return { action: "declined" };
  }

  if (!isAffirmative(answer)) {
    stdout.write(`\nLLM author를 호출하지 않았습니다. 파일을 만들지 않았습니다.\n`);
    stdout.write(`${NEXT_STEPS.replace("<progress-file>", progressFile).replace("<project-dir>", projectDir)}\n`);
    return { action: "declined" };
  }

  if (await isFile(progressFile)) {
    stdout.write(`\n그 사이 ${progressFile} 이(가) 생겼습니다. 다시 실행하세요:\n`);
    stdout.write(`  cockpit ${projectDir}\n`);
    return { action: "exists-now" };
  }

  const invoke = runAuthorFn ?? (async () => runAuthorCommand({ projectDir, progressFile }));
  let authorResult;
  try {
    authorResult = await invoke({ projectDir, progressFile });
  } catch (err) {
    stdout.write(`\nLLM author 호출에 실패했습니다: ${err.message}\n`);
    stdout.write(`기존 문서를 유지합니다. 위 요청문으로 다시 시도하세요.\n`);
    return { action: "author-failed", error: err };
  }
  if (authorResult && authorResult.outcome === "not-configured") {
    stdout.write(`\n${formatAuthorMissingGuidance()}\n`);
    return { action: "author-missing" };
  }
  if (authorResult && (authorResult.outcome === "failed" || authorResult.error)) {
    const detail = authorResult.error?.message ?? authorResult.error ?? "unknown error";
    stdout.write(`\nLLM author 호출에 실패했습니다: ${detail}\n`);
    stdout.write(`기존 문서를 유지합니다. 위 요청문으로 다시 시도하세요.\n`);
    return { action: "author-failed", error: authorResult.error };
  }

  if (!(await isFile(progressFile))) {
    stdout.write(`\nLLM author가 PROGRESS.md를 만들지 않았습니다: ${progressFile}\n`);
    stdout.write(`위 요청문과 author 명령 설정을 확인한 뒤 다시 시도하세요.\n`);
    return { action: "author-no-output" };
  }

  if (typeof checkFn === "function") {
    let content;
    try {
      const reader = readFileFn ?? ((f) => readFile(f, "utf-8"));
      content = await reader(progressFile);
    } catch (err) {
      stdout.write(`\n작성된 PROGRESS.md를 읽지 못했습니다: ${err.message}\n`);
      return { action: "author-no-output", error: err };
    }
    let check;
    try {
      check = await checkFn(content);
    } catch (err) {
      stdout.write(`\n구조적 검사 중 오류가 발생했습니다: ${err.message}\n`);
      return { action: "author-invalid", error: err };
    }
    const ok = Boolean(check && typeof check === "object" ? check.ok : check);
    if (!ok) {
      stdout.write(`\nLLM author가 파일을 만들었지만 \`cockpit check\`가 FAIL입니다. 증거 기반으로 보완한 뒤:\n`);
      stdout.write(`  cockpit check ${progressFile}\n`);
      stdout.write(`  cockpit ${projectDir}\n`);
      return { action: "author-invalid", check };
    }
  }

  // Author success + canonical read-back success come first. Only then
  // store the exact bytes as a recovery replica. Replica failure only
  // warns and never flips author success.
  const saveReplica = saveReplicaFn ?? ((f) => defaultSaveRecoveryReplica(f));
  try {
    const saved = await saveReplica(progressFile);
    if (!saved || !saved.ok) {
      const detail = saved?.error?.message ?? saved?.error ?? "unknown error";
      stdout.write(`\ncockpit: warning: recovery replica를 저장하지 못했습니다: ${detail}\n`);
      stdout.write(`canonical 작성은 성공했습니다: ${progressFile}\n`);
    }
  } catch (err) {
    stdout.write(`\ncockpit: warning: recovery replica를 저장하지 못했습니다: ${err?.message ?? err}\n`);
    stdout.write(`canonical 작성은 성공했습니다: ${progressFile}\n`);
  }

  stdout.write(`\nLLM author가 PROGRESS.md를 작성하고 구조적 검사를 통과했습니다: ${progressFile}\n`);
  stdout.write(`  cockpit ${projectDir}\n`);
  return { action: "authored" };
}

export const __testOnly = { AFFIRMATIVE };
