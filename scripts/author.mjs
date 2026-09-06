#!/usr/bin/env node
// Cockpit LLM author capability: the single canonical owner for PROGRESS.md
// semantic authorship (bootstrap + refresh as two modes of one owner).
//
// Product contract:
//
//   project evidence
//         ↓
//   LLM author (AUTHOR_MODE=bootstrap | refresh)
//         ↓
//   PROGRESS.md
//         ↓
//   Cockpit (deterministic check / read / render)
//
// LLM writes and reconciles PROGRESS.md.
// Cockpit deterministically checks, reads, and renders it.
//
// Same owner != same investigation strategy:
//   - bootstrap (missing PROGRESS.md): slow/deep initial reconstruction,
//     then projection to an initial high-quality PROGRESS.md.
//   - refresh (existing PROGRESS.md): delta-first revalidation against the
//     previous understanding, semantic blast-radius investigation, then a
//     conservative PATCH of only the invalidated surfaces.
//
// What this module owns:
//   - canonical author command resolution (COCKPIT_AUTHOR_COMMAND,
//     legacy fallback COCKPIT_REFRESH_COMMAND — one meaning, not two)
//   - author mode constants + normalization (bootstrap | refresh)
//   - invoking the configured author with PROJECT_DIR / PROGRESS_FILE /
//     AUTHOR_MODE (vendor-neutral; no provider/model/tool names)
//   - per-mode timeout semantics (long bootstrap budget, bounded refresh)
//   - the vendor-neutral author handoff request per mode (one owner, two
//     investigation strategies)
//
// What this module explicitly does NOT own:
//   - embedded LLM / model / provider SDK
//   - repository / runtime semantic analysis
//   - progress calculation or semantic state machines
//   - prompt-planning frameworks, DBs, persistent agent runtimes
//   - project databases, vector stores, embeddings, knowledge graphs,
//     daemons, background crawlers, understanding warehouses
//   - PROGRESS.md writes itself (the external author process writes;
//     Cockpit only reads back and checks)

import { exec } from "node:child_process";
import path from "node:path";

export const AUTHOR_COMMAND_ENV = "COCKPIT_AUTHOR_COMMAND";
export const LEGACY_REFRESH_COMMAND_ENV = "COCKPIT_REFRESH_COMMAND";
export const AUTHOR_MODE_ENV = "AUTHOR_MODE";
export const AUTHOR_MODE_ALIAS_ENV = "COCKPIT_AUTHOR_MODE";
export const BOOTSTRAP_MODE = "bootstrap";
export const REFRESH_MODE = "refresh";
export const AUTHOR_TIMEOUT_ENV = "COCKPIT_AUTHOR_TIMEOUT_MS";
export const BOOTSTRAP_TIMEOUT_ENV = "COCKPIT_AUTHOR_BOOTSTRAP_TIMEOUT_MS";
export const REFRESH_TIMEOUT_ENV = "COCKPIT_AUTHOR_REFRESH_TIMEOUT_MS";
export const DEFAULT_AUTHOR_TIMEOUT_MS = 5 * 60 * 1000;
// Refresh stays bounded like the historic default.
export const DEFAULT_REFRESH_TIMEOUT_MS = 5 * 60 * 1000;
// Bootstrap intentionally allows a materially longer deep reconstruction
// budget than the historic 5 minutes, while still bounding hung processes.
export const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 30 * 60 * 1000;
// Minimal provenance-anchor vocabulary for the durable understanding
// surface. PROGRESS.md stays the surface; the anchor is only a
// non-rendered Markdown comment recording the last successfully observed
// repository revision (e.g. `<!-- cockpit-author-observed: <git-HEAD-SHA> -->`).
// It is never a product ontology, never a truth authority, and never
// overrides fresh repository/runtime evidence. Non-Git projects omit it
// (never fabricate a revision).
export const PROVENANCE_ANCHOR_PREFIX = "cockpit-author-observed:";

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isSafeInteger(n) || n <= 0) return fallback;
  return n;
}

/**
 * Normalize an author mode value. Returns "bootstrap" | "refresh" or null
 * for anything else (including missing). Case-insensitive, trims input.
 */
export function normalizeAuthorMode(mode) {
  const v = String(mode ?? "").trim().toLowerCase();
  if (v === BOOTSTRAP_MODE) return BOOTSTRAP_MODE;
  if (v === REFRESH_MODE) return REFRESH_MODE;
  return null;
}

/**
 * Resolve the author mode from a vendor-neutral environment. AUTHOR_MODE
 * is canonical (per authoring contract); COCKPIT_AUTHOR_MODE is accepted
 * as an alias. Returns "bootstrap" | "refresh" or null when unset/unknown.
 * Explicit function arguments always win over this environment lookup;
 * callers pass the mode they already know (missing-file flow = bootstrap,
 * existing-document refresh = refresh).
 */
export function resolveAuthorMode(env = process.env) {
  return (
    normalizeAuthorMode(env?.[AUTHOR_MODE_ENV]) ??
    normalizeAuthorMode(env?.[AUTHOR_MODE_ALIAS_ENV]) ??
    null
  );
}

export function resolveBootstrapTimeoutMs(env = process.env) {
  const specific = Number.parseInt(String(env?.[BOOTSTRAP_TIMEOUT_ENV] ?? ""), 10);
  if (Number.isSafeInteger(specific) && specific > 0) return specific;
  return parsePositiveInt(env?.[AUTHOR_TIMEOUT_ENV], DEFAULT_BOOTSTRAP_TIMEOUT_MS);
}

export function resolveRefreshTimeoutMs(env = process.env) {
  const specific = Number.parseInt(String(env?.[REFRESH_TIMEOUT_ENV] ?? ""), 10);
  if (Number.isSafeInteger(specific) && specific > 0) return specific;
  return parsePositiveInt(env?.[AUTHOR_TIMEOUT_ENV], DEFAULT_REFRESH_TIMEOUT_MS);
}

/**
 * Canonical timeout resolution. The optional second argument (or the
 * AUTHOR_MODE environment when omitted) selects per-mode semantics:
 * bootstrap allows a materially longer budget, refresh stays bounded.
 * Omitting both preserves the historic generic behavior
 * (COCKPIT_AUTHOR_TIMEOUT_MS with the 5-minute default) for compatibility.
 */
export function resolveAuthorTimeoutMs(env = process.env, mode) {
  const effective = normalizeAuthorMode(mode) ?? resolveAuthorMode(env);
  if (effective === BOOTSTRAP_MODE) return resolveBootstrapTimeoutMs(env);
  if (effective === REFRESH_MODE) return resolveRefreshTimeoutMs(env);
  return parsePositiveInt(env?.[AUTHOR_TIMEOUT_ENV], DEFAULT_AUTHOR_TIMEOUT_MS);
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

export function buildAuthorEnv({ projectDir, progressFile, mode, baseEnv = process.env } = {}) {
  const effective = normalizeAuthorMode(mode) ?? resolveAuthorMode(baseEnv);
  const env = {
    ...baseEnv,
    PROJECT_DIR: projectDir,
    PROGRESS_FILE: progressFile,
  };
  // Vendor-neutral explicit mode for the external author process.
  // No provider / model / tool names are ever set here.
  if (effective) env[AUTHOR_MODE_ENV] = effective;
  return env;
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
 *
 * The caller passes the mode it already knows: missing-PROGRESS onboarding
 * passes "bootstrap", existing-document refresh passes "refresh". The mode
 * is forwarded as vendor-neutral AUTHOR_MODE and selects the per-mode
 * timeout budget. An explicit `mode` argument always wins over AUTHOR_MODE
 * found in `env`.
 */
export async function runAuthorCommand({
  projectDir,
  progressFile,
  mode,
  command,
  timeoutMs,
  env,
  onSpawn,
} = {}) {
  const resolved = command ?? resolveAuthorCommand(env ?? process.env);
  if (!resolved) return { outcome: "not-configured", mode: normalizeAuthorMode(mode) ?? resolveAuthorMode(env ?? process.env) };
  const effectiveMode = normalizeAuthorMode(mode) ?? resolveAuthorMode(env ?? process.env);
  const cwd = projectDir ?? (progressFile ? path.dirname(progressFile) : process.cwd());
  const result = await runShellCommand(resolved, {
    cwd,
    timeoutMs: timeoutMs ?? resolveAuthorTimeoutMs(env ?? process.env, effectiveMode),
    env: buildAuthorEnv({
      projectDir: cwd,
      progressFile,
      mode: effectiveMode,
      baseEnv: env ?? process.env,
    }),
    onSpawn,
  });
  if (!result.ok) return { outcome: "failed", error: result.error, command: resolved, mode: effectiveMode };
  return { outcome: "executed", command: resolved, mode: effectiveMode };
}

/**
 * Vendor-neutral author handoff request. Bootstrap (no existing file) and
 * refresh (PATCH material deltas) share one author responsibility; the
 * author decides the mode from file existence and fresh evidence. No
 * provider / tool is hard-coded; the command selects the LLM runtime.
 */
/**
 * Vendor-neutral author handoff request. One canonical owner, two explicit
 * investigation modes — never two executors:
 *
 *   - mode "bootstrap": missing PROGRESS.md. Slow/deep initial project
 *     reconstruction first, PROGRESS.md projection last.
 *   - mode "refresh": existing PROGRESS.md. Delta-first revalidation with
 *     semantic blast-radius investigation, then a conservative PATCH.
 *
 * Omitting `mode` keeps the legacy combined text for compatibility; new
 * callers (missing-file onboarding = bootstrap, scheduled/manual
 * existing-document invocation = refresh) always pass it explicitly, and
 * `runAuthorCommand` forwards it as vendor-neutral AUTHOR_MODE. No
 * provider / model / tool is hard-coded; the command selects the LLM runtime.
 */
export function buildAuthorHandoff({ projectDir, progressFile, mode }) {
  const effective = normalizeAuthorMode(mode);
  if (effective === BOOTSTRAP_MODE) return buildBootstrapHandoff({ projectDir, progressFile });
  if (effective === REFRESH_MODE) return buildRefreshHandoff({ projectDir, progressFile });
  return buildLegacyCombinedHandoff({ projectDir, progressFile });
}

function sharedQualityBlock() {
  return `주요 상태 문장은 증거가 허용하는 범위에서 실제 제품 객체·capability, 실제 사용자/운영 workflow,
관찰 가능한 현재 상태, 구체적인 미완료 경계, 관찰 가능한 닫힘 조건 중 하나 이상을 보존해줘.
"통합·실체·완결·기반·성숙도" 같은 추상어만으로 실제 대상을 대체하지 마.

개요는 압축적으로, 내용은 구체적으로 써줘. SHA·파일 경로·test command 같은 저수준 proof는
overview에서 내리고 영역 상세·근거에 두되, 현재 제품 상태를 이해하는 데 필요한 product truth까지
제거하지 마.

현재 상황은 제품 소개문이 아니라 지금 실제 되는 것 + 가장 중요한 미완료 경계로, 다음은 추상 상태명만
쓰지 말고 어떤 실제 object/workflow가 무엇을 통과하면 닫히는지 읽히게, 직면한 문제는 "증거 부족·외부 연동"
같은 category명으로 끝내지 말고 정확히 무엇이 연결·검증되지 않았거나 막혔는지 쓰되 실제 blocker가
없으면 만들지 마. 지도는 오래 살아남는 실제 제품 영역을 유지하고 각 설명은 무엇을 하는지 또는 현재
capability/state가 드러나게, Area 의미는 실제 제품 객체·하위 시스템·사용자/운영 workflow가 무엇인지,
Area 현재 수준은 "강함·구현됨·부분 완료·연동 중·흐름 확립" 같은 평가만 쓰지 말고 실제 가능한
행동/state를 말하고, 남은 문제는 미완료·미확인·저하·미입증과 해당하면 경계·접점·의존성을 구체적으로,
근거는 주요 상태 주장을 뒷받침하는 직접 증거를 두되 구체적 진실이 있는데도 추상 한 문장이나 단일 추상
불릿만으로 대신하지 마. 진짜로 끝난 영역의 남은 문제는 지어내지 말고 생략하거나 fresh evidence가
뒷받침하면 알려진 material 미완료 경계 없음을 명시해도 되며, 현재 집중은 사용자 소유이므로 활동량·executor task로
이동시키지 마.

README §5의 마크다운 구조에 맞춰 사실 기반으로 작성해줘. 불확실한 영역은 지어내지 말고 생략하거나
모르는 범위와 경계를 명시해줘. 저장 후 반드시 \`cockpit check\`로 구조적 완전성을 확인해줘.`;
}

function coverageReconciliationBlock() {
  return `최종 PROGRESS.md를 쓰기 직전, 재구성한 project model과 최종 projection 사이에 일회성 coverage reconciliation을 둬줘. 새 DB·index·warehouse·ontology를 만들지 말고 머릿속 대조로만 확인하고, 대조 과정 자체를 파일에 남기지 마. \`cockpit check\` PASS는 구조 검사이지 semantic coverage 증명이 아니다. 다음이 하나라도 깨지면 projection하지 말고 evidence로 돌아가줘.
- 조사에서 발견한 materially independent 영역이 final Project Map의 map item 또는 명시적 child/detail에 traceable한가.
- capability·workflow·ownership·authority·dependency·proof state·unfinished boundary 중 하나라도 materially 달라지는 영역을, 같은 broad category라는 이유만으로 하나의 map item으로 합치지 않았는가.
- rail/group은 reader-friendly하게 압축해도 되지만, map item 자체가 실제 제품 구조를 소실시키지 않는가.
- major executable/user workflow가 지도에서 사라지지 않았는가.
- 서로 다른 project state를 가진 independent external contracts/providers는 구분되어 있는가.
- UNKNOWN은 허용하되, 미조사를 UNKNOWN으로 위장하지 않았는가.
- 조사된 project model에서 final PROGRESS로 설명 없이 사라진 material fact가 없는가.
고정 map-item 개수나 고정 taxonomy를 만들지 마. 프로젝트 규모에 따라 map item 수는 자연스럽게 달라져야 한다.`;
}

function provenanceAnchorBlock() {
  return `durable 이해 표면은 PROGRESS.md 하나다. 별도 DB·index·warehouse를 만들지 마.
마지막으로 관찰한 repository state를 남길 수 있는 가장 작은 provenance anchor만 허용한다:
Git 저장소라면 관찰 시점의 HEAD revision을 non-rendered Markdown comment 한 줄로 파일末尾에 남겨도 된다
(예: \`<!-- ${PROVENANCE_ANCHOR_PREFIX} <git-HEAD-SHA> -->\`).
조건: viewer의 새 product ontology가 되지 않게, project truth authority가 되지 않게,
Git이 아니면 revision을 만들지 말고 anchor를 생략하고, dirty working tree와 현재 runtime 증거를
무시하는 면허로 쓰지 말고, stale anchor가 fresh evidence를 override하지 않게 해줘.
anchor가 없어도 실패하지 말고(fail-open), 구조 검사에 영향을 주지 않게 해줘.`;
}

/**
 * BOOTSTRAP mode — slow/deep initial reconstruction for a first-seen project.
 * Quality of understanding wins over speed. Reconstruct the project model
 * first; project to PROGRESS.md only at the end. Never stop at a shallow
 * summary after a few READMEs and recent commits.
 */
export function buildBootstrapHandoff({ projectDir, progressFile }) {
  return `너는 이 프로젝트의 LLM author다. Cockpit이 읽는 \`PROGRESS.md\`의 의미 내용은 네가 소유한다. Cockpit은 의미를 판단하지 않고 결정론적으로 검사·읽기·렌더링만 한다.

대상 프로젝트: ${projectDir}
작성 위치: ${progressFile}
AUTHOR_MODE: bootstrap — 최초 deep reconstruction (느려도 좋다, 이해의 질이 우선이다)

이 프로젝트에는 PROGRESS.md가 없다. 몇 개 README와 최근 commit을 읽고 바로 요약을 쓰지 마.
먼저 project model을 충분히 재구성한 뒤 마지막 단계에서만 PROGRESS.md로 projection해줘.
"모든 파일을 무조건 cat한다"는 뜻은 아니다. evidence/value-driven traversal를 쓰되,
최초 bootstrap에서는 넓은 coverage를 의도적으로 확보해줘.

최소한 applicable한 다음 축을 독립 증거로 조사하고 서로 대조해줘:
A. PROJECT / AUTHORITY — README, AGENTS/repository instructions, product/spec/docs,
   package/workspace manifests, authoritative operational documents.
B. REPOSITORY TOPOLOGY — major directories/packages/apps/services, executable entrypoints,
   runtime components, generated/vendor/무관 영역 구분.
C. PRODUCT SURFACES — 실제 사용자가 만나는 주요 surface와 대표 사용자 workflow
   (운영자/developer workflow가 제품 이해에 중요하면 포함).
D. IMPLEMENTATION — 주요 subsystem, domain objects와 semantic ownership,
   application/service flow, persistence/state, internal interfaces,
   중요한 cross-subsystem dependencies.
E. EXTERNAL BOUNDARIES — provider/API/integration boundary, external authority,
   존재(existence)와 실제 입증된 capability를 구분.
F. PROOF — tests, integration/E2E/runtime evidence. 각 proof가 무엇을 증명하고
   무엇을 증명하지 못하는지 구분.
G. HISTORY — 최근 Git history를 chronology 요약용으로 쓰지 말고, 현재 구조·ownership·
   recently changed semantics를 이해하는 데 필요한 만큼만 조사.
H. CONTRADICTIONS / UNKNOWN — docs vs code, code vs test, claim vs runtime proof,
   stale/obsolete material, 아직 충분히 이해하지 못한 중요한 영역.
한 축의 존재를 다른 축의 증명으로 비약하지 말고 (문서에 적혀 있다고 구현된 것이 아님),
모순은 미리 해결하고, 확인되지 않은 주장은 쓰지 마.

PROGRESS.md 문장을 처음부터 요약해서 쓰지 마. 문서/spec, production 구현 경로, 테스트/런타임 증거,
최근 material change를 대조해 먼저 현재 실제 가능한 capability, 대표 사용자/운영 workflow, 권위 경계,
중요한 미완료·미확인 경계, claim을 어디까지 강하게 말할 수 있는지를 재구성하고, 마지막 projection
단계에서만 PROGRESS.md로 압축해줘. 추상어는 실제 제품 사실을 정리할 수는 있지만 대체해서는 안 된다.

최근 commit/task 목록을 요약해서 현재 상황을 만들지 마. fresh evidence로 현재 제품 state를 다시
구성하고, capability·product state·frontier·durable settled semantics를 바꾸는 material fact만
상위에 투영해줘. 제품 상태를 바꾸지 않는 내부 refactor/test 정리는 상단 보고의 주제가 아니다.

BOOTSTRAP에서는 "대충 전체 그림이 보인다"는 이유로 멈추지 마. 다음이 성립할 때 멈춰줘:
- 주요 제품 영역이 식별됨
- 각 영역이 실제 무엇을 하는지 이해됨
- 핵심 workflow가 연결됨
- 주요 dependency/boundary가 파악됨
- 구현됨 / 입증됨 / 주장뿐임 / unknown을 혼동하지 않음
- 현재 프로젝트 위치와 중요한 unfinished boundary를 설명 가능
- 남아 있는 중요한 coverage gap이 명시됨
- 짧은 반증 확인으로 전체 project model이 쉽게 뒤집히지 않음
완전한 certainty는 요구하지 않는다. UNKNOWN을 허용한다. 다만 "UNKNOWN 허용"을 shallow scan의
면허로 쓰지 마. capability·boundary·transition·claim이 안정된 것만으로는 부족하고,
위 coverage가 확보되기 전 조기 종료는 금지다.

${coverageReconciliationBlock()}

${provenanceAnchorBlock()}

${sharedQualityBlock()}`;
}

/**
 * REFRESH mode — delta-first revalidation for an existing PROGRESS.md.
 * Contrast the previous understanding with fresh state first, investigate
 * the semantic blast radius deeply, then PATCH only the invalidated
 * surfaces conservatively. Never re-summarize the whole repository thinly
 * and never turn the result into a changelog of recent commits.
 */
export function buildRefreshHandoff({ projectDir, progressFile }) {
  return `너는 이 프로젝트의 LLM author다. Cockpit이 읽는 \`PROGRESS.md\`의 의미 내용은 네가 소유한다. Cockpit은 의미를 판단하지 않고 결정론적으로 검사·읽기·렌더링만 한다.

대상 프로젝트: ${projectDir}
작성 위치: ${progressFile}
AUTHOR_MODE: refresh — delta-first conservative PATCH (기존 이해 + fresh delta)

기존 PROGRESS.md가 있다. 매번 프로젝트 전체를 처음부터 얕게 다시 훑고 다시 요약하지 마.
먼저 existing PROGRESS understanding + 마지막 관찰 state(아래 provenance anchor가 있으면 참고) +
fresh repository/runtime state를 대조해 무엇이 달라졌는지를 먼저 봐줘.

Investigation order (delta-first, semantic blast radius):
1. 무엇이 달라졌는가 (delta-first: anchor·Git delta는 investigation starting point다)
2. 그 변화가 어떤 product/domain semantic을 바꾸는가
3. 어떤 dependency/boundary에 영향이 퍼지는가 (blast radius)
4. 기존 PROGRESS의 어떤 claim/area가 invalidate되는가
5. 어떤 neighboring evidence를 다시 봐야 하는가
6. 영향받지 않은 understanding은 그대로 유지 가능한가
7. 필요한 부분만 conservative PATCH

changed-files-only는 불충분하다. 예를 들어 한 service file만 바뀌었어도
API → domain rule → persistence → external boundary → test/proof →
Area Detail → project-level frontier 중 실제로 영향받는 곳까지 따라가줘 (blast radius).
반대로 영향이 없는 영역을 습관적으로 다시 작성하지 마. 실질적 변화가 없으면 파일을 그대로 둬.

refresh 결과를 "최근 commit N개에서 이것저것 바뀌었다"는 changelog 요약으로 만들지 마.
Git delta는 출발점일 뿐, 최종 PROGRESS에는 material current truth만 projection해줘:
product capability, user/operational workflow, project map, area state,
important boundary/dependency, proof strength, current frontier,
next observable transition, blocker/constraint, durable settled direction을
실제로 바꾸는 변화 위주로. implementation churn만 있으면 top-level current state를 흔들지 마.

구조적 drift가 기존 project model을 무효화했을 때만 필요한 범위의 deep reconstruction으로 확장해줘:
major package/subsystem relocation, architecture boundary movement, major workflow redesign,
domain ownership change, persistence restructuring, external integration mode change,
Project Map의 여러 Area가 실제 code/product와 불일치, old PROGRESS와 fresh evidence의 반복 충돌,
변경 영향이 너무 넓어 기존 map 보존이 더 오해를 만드는 경우가 신호다.
원칙은 small targeted reconstruction before full-project reconstruction.
다만 실제 project model이 깨졌다면 "보수적 PATCH" 규칙 때문에 낡은 구조를 억지로 보존하지 마.

기존 PROGRESS.md와 최신 증거를 대조하여 실질적으로 잘못 이해하게 되는 표면만 보수적으로 PATCH해줘.
시간이 흘렀다는 이유만으로 수정하지 말고, 닫힌 문제를 되살리거나 미확인 문제를 만들지 마.

${provenanceAnchorBlock()}

${sharedQualityBlock()}`;
}

function buildLegacyCombinedHandoff({ projectDir, progressFile }) {
  return `너는 이 프로젝트의 LLM author다. Cockpit이 읽는 \`PROGRESS.md\`의 의미 내용은 네가 소유한다. Cockpit은 의미를 판단하지 않고 결정론적으로 검사·읽기·렌더링만 한다.

대상 프로젝트: ${projectDir}
작성 위치: ${progressFile}

먼저 저장소의 권위 문서(AGENTS.md, README.md, docs/, package.json 등), 실제 소스 코드 진입점과 실행 경로,
테스트 스위트, 최근 변경 이력을 각각 독립적으로 확인하고 서로 대조해줘. 한 축의 존재를 다른 축의
증명으로 비약하지 말고 (문서에 적혀 있다고 구현된 것이 아님), 모순은 미리 해결하고, 확인되지 않은
주장은 쓰지 마.

PROGRESS.md 문장을 처음부터 요약해서 쓰지 마. 문서/spec, production 구현 경로, 테스트/런타임 증거,
최근 material change를 대조해 먼저 현재 실제 가능한 capability, 대표 사용자/운영 workflow, 권위 경계,
중요한 미완료·미확인 경계, claim을 어디까지 강하게 말할 수 있는지를 재구성하고, 마지막 projection
단계에서만 PROGRESS.md로 압축해줘. 추상어는 실제 제품 사실을 정리할 수는 있지만 대체해서는 안 된다.

주요 상태 문장은 증거가 허용하는 범위에서 실제 제품 객체·capability, 실제 사용자/운영 workflow,
관찰 가능한 현재 상태, 구체적인 미완료 경계, 관찰 가능한 닫힘 조건 중 하나 이상을 보존해줘.
"통합·실체·완결·기반·성숙도" 같은 추상어만으로 실제 대상을 대체하지 마.

개요는 압축적으로, 내용은 구체적으로 써줘. SHA·파일 경로·test command 같은 저수준 proof는
overview에서 내리고 영역 상세·근거에 두되, 현재 제품 상태를 이해하는 데 필요한 product truth까지
제거하지 마.

최근 commit/task 목록을 요약해서 현재 상황을 만들지 마. fresh evidence로 현재 제품 state를 다시
구성하고, capability·product state·frontier·durable settled semantics를 바꾸는 material fact만
상위에 투영해줘. 제품 상태를 바꾸지 않는 내부 refactor/test 정리는 상단 보고의 주제가 아니다.

현재 상황은 제품 소개문이 아니라 지금 실제 되는 것 + 가장 중요한 미완료 경계로, 다음은 추상 상태명만
쓰지 말고 어떤 실제 object/workflow가 무엇을 통과하면 닫히는지 읽히게, 직면한 문제는 "증거 부족·외부 연동"
같은 category명으로 끝내지 말고 정확히 무엇이 연결·검증되지 않았거나 막혔는지 쓰되 실제 blocker가
없으면 만들지 마. 지도는 오래 살아남는 실제 제품 영역을 유지하고 각 설명은 무엇을 하는지 또는 현재
capability/state가 드러나게, Area 의미는 실제 제품 객체·하위 시스템·사용자/운영 workflow가 무엇인지,
Area 현재 수준은 "강함·구현됨·부분 완료·연동 중·흐름 확립" 같은 평가만 쓰지 말고 실제 가능한
행동/state를 말하고, 남은 문제는 미완료·미확인·저하·미입증과 해당하면 경계·접점·의존성을 구체적으로,
근거는 주요 상태 주장을 뒷받침하는 직접 증거를 두되 구체적 진실이 있는데도 추상 한 문장이나 단일 추상
불릿만으로 대신하지 마. 진짜로 끝난 영역의 남은 문제는 지어내지 말고 생략하거나 fresh evidence가
뒷받침하면 알려진 material 미완료 경계 없음을 명시해도 되며, 현재 집중은 사용자 소유이므로 활동량·executor task로
이동시키지 마.

repository 전체를 전수 조사하는 새 framework를 만들지 마. 현재 capability, 중요한 unfinished boundary,
가장 가까운 observable transition, claim 강도가 안정되고 짧은 반증 확인에서도 뒤집히지 않으면 멈춰줘.
UNKNOWN은 허용하며, 없애기 위해 사실을 invent하거나 끝없이 조사하지 마.

기존 PROGRESS.md가 있으면 최신 증거와 대조하여 실질적으로 잘못 이해하게 되는 표면만 보수적으로 PATCH해줘.
시간이 흘렀다는 이유만으로 수정하지 말고, 실질적 변화가 없으면 파일을 그대로 두고, 닫힌 문제를 되살리거나
미확인 문제를 만들지 마. 기존 파일이 없으면 증거 기반 최초 문서를 작성해줘.

README §5의 마크다운 구조에 맞춰 사실 기반으로 작성해줘. 불확실한 영역은 지어내지 말고 생략하거나
모르는 범위와 경계를 명시해줘. 저장 후 반드시 \`cockpit check\`로 구조적 완전성을 확인해줘.`;
}
