#!/usr/bin/env node
// Cockpit LLM author capability: the single canonical owner for PROGRESS.md
// semantic authorship (bootstrap + refresh).
//
// Product contract:
//
//   project evidence
//         ↓
//   LLM author
//         ↓
//   PROGRESS.md
//         ↓
//   Cockpit (deterministic check / read / render)
//
// LLM writes and reconciles PROGRESS.md.
// Cockpit deterministically checks, reads, and renders it.
//
// What this module owns:
//   - canonical author command resolution (COCKPIT_AUTHOR_COMMAND,
//     legacy fallback COCKPIT_REFRESH_COMMAND — one meaning, not two)
//   - invoking the configured author with PROJECT_DIR / PROGRESS_FILE
//   - the vendor-neutral author handoff request (bootstrap + PATCH share
//     one author responsibility)
//
// What this module explicitly does NOT own:
//   - embedded LLM / model / provider SDK
//   - repository / runtime semantic analysis
//   - progress calculation or semantic state machines
//   - prompt-planning frameworks, DBs, persistent agent runtimes
//   - PROGRESS.md writes itself (the external author process writes;
//     Cockpit only reads back and checks)

import { exec } from "node:child_process";
import path from "node:path";

export const AUTHOR_COMMAND_ENV = "COCKPIT_AUTHOR_COMMAND";
export const LEGACY_REFRESH_COMMAND_ENV = "COCKPIT_REFRESH_COMMAND";
export const DEFAULT_AUTHOR_TIMEOUT_MS = 5 * 60 * 1000;

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isSafeInteger(n) || n <= 0) return fallback;
  return n;
}

export function resolveAuthorTimeoutMs(env = process.env) {
  return parsePositiveInt(env?.COCKPIT_AUTHOR_TIMEOUT_MS, DEFAULT_AUTHOR_TIMEOUT_MS);
}

/**
 * Canonical author command resolution. COCKPIT_AUTHOR_COMMAND wins;
 * COCKPIT_REFRESH_COMMAND is a legacy fallback with the same meaning
 * (one author capability, not two independent executors).
 */
export function resolveAuthorCommand(env = process.env) {
  const canonical = String(env?.[AUTHOR_COMMAND_ENV] ?? "").trim();
  if (canonical) return canonical;
  const legacy = String(env?.[LEGACY_REFRESH_COMMAND_ENV] ?? "").trim();
  return legacy ? legacy : null;
}

/**
 * Where the resolved command came from. Null means no author capability
 * is connected. Never two meanings: "refresh-legacy" is the same author
 * responsibility under its previous name.
 */
export function resolveAuthorCommandSource(env = process.env) {
  const canonical = String(env?.[AUTHOR_COMMAND_ENV] ?? "").trim();
  if (canonical) return "author";
  const legacy = String(env?.[LEGACY_REFRESH_COMMAND_ENV] ?? "").trim();
  if (legacy) return "refresh-legacy";
  return null;
}

export function buildAuthorEnv({ projectDir, progressFile, baseEnv = process.env } = {}) {
  return {
    ...baseEnv,
    PROJECT_DIR: projectDir,
    PROGRESS_FILE: progressFile,
  };
}

function runShellCommand(command, { cwd, timeoutMs, env, onSpawn } = {}) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = exec(
        command,
        { cwd, timeout: timeoutMs, env, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" },
        (error, _stdout, _stderr) => {
          if (error) {
            resolve({ ok: false, error });
            return;
          }
          resolve({ ok: true });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: err });
      return;
    }
    if (child && typeof onSpawn === "function") {
      try {
        onSpawn(child);
      } catch {
        /* spawn tracking must never break execution */
      }
    }
  });
}

/**
 * Invoke the configured LLM author capability once. Never analyzes the
 * repository, never writes PROGRESS.md itself: the external author process
 * owns all semantic decisions. Returns a small outcome descriptor; the
 * caller owns read-back and structural verification.
 */
export async function runAuthorCommand({
  projectDir,
  progressFile,
  command,
  timeoutMs,
  env,
  onSpawn,
} = {}) {
  const resolved = command ?? resolveAuthorCommand(env ?? process.env);
  if (!resolved) return { outcome: "not-configured" };
  const cwd = projectDir ?? (progressFile ? path.dirname(progressFile) : process.cwd());
  const result = await runShellCommand(resolved, {
    cwd,
    timeoutMs: timeoutMs ?? resolveAuthorTimeoutMs(env ?? process.env),
    env: buildAuthorEnv({
      projectDir: cwd,
      progressFile,
      baseEnv: env ?? process.env,
    }),
    onSpawn,
  });
  if (!result.ok) return { outcome: "failed", error: result.error, command: resolved };
  return { outcome: "executed", command: resolved };
}

/**
 * Vendor-neutral author handoff request. Bootstrap (no existing file) and
 * refresh (PATCH material deltas) share one author responsibility; the
 * author decides the mode from file existence and fresh evidence. No
 * provider / tool is hard-coded; the command selects the LLM runtime.
 */
export function buildAuthorHandoff({ projectDir, progressFile }) {
  return `너는 이 프로젝트의 LLM author다. Cockpit이 읽는 \`PROGRESS.md\`의 의미 내용은 네가 소유한다. Cockpit은 의미를 판단하지 않고 결정론적으로 검사·읽기·렌더링만 한다.

대상 프로젝트: ${projectDir}
작성 위치: ${progressFile}

먼저 저장소의 권위 문서(AGENTS.md, README.md, docs/, package.json 등), 실제 소스 코드 진입점과 실행 경로,
테스트 스위트, 최근 변경 이력을 각각 독립적으로 확인하고 서로 대조해줘. 한 축의 존재를 다른 축의
증명으로 비약하지 말고 (문서에 적혀 있다고 구현된 것이 아님), 모순은 미리 해결하고, 확인되지 않은
주장은 쓰지 마.

기존 PROGRESS.md가 있으면 최신 증거와 대조하여 실질적으로 잘못 이해하게 되는 표면만 보수적으로 PATCH해줘.
시간이 흘렀다는 이유만으로 수정하지 말고, 실질적 변화가 없으면 파일을 그대로 두고, 닫힌 문제를 되살리거나
미확인 문제를 만들지 마. 기존 파일이 없으면 증거 기반 최초 문서를 작성해줘.

README §5의 마크다운 구조에 맞춰 사실 기반으로 작성해줘. 불확실한 영역은 지어내지 말고 생략하거나
모르는 범위와 경계를 명시해줘. 저장 후 반드시 \`cockpit check\`로 구조적 완전성을 확인해줘.`;
}
