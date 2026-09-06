import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuthorHandoff } from "../scripts/author.mjs";
import { checkProgressStructure } from "../dist/structural-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf-8");

// NOTE on proof layers (per TESTING.md): this suite never claims an LLM run.
// It proves (a) the bootstrap handoff now carries an ephemeral, falsifiable
// coverage-reconciliation gate, and (b) the adversarial Meridian pair
// behaves as FAIL (old/shallow) vs PASS (repaired/reconciled) under a
// test-only deterministic coverage evaluator. The evaluator lives only in
// this test file: the viewer/runtime gains no analyzer, DB, or state machine.

// ---------------------------------------------------------------------------
// Test-only deterministic semantic-coverage evaluator (not shipped runtime)
// ---------------------------------------------------------------------------

function mapItemLines(markdown) {
  return markdown.split("\n").filter((l) => /^\s*-\s*\*\*/.test(l));
}

function evaluateMeridianCoverage(markdown) {
  const failures = [];
  const has = (re) => re.test(markdown);

  // 1. Materially independent workflows must each be traceable.
  if (!has(/워크인 접수 대기열|walk-in/)) failures.push("missing walk-in reception distinction");
  if (!has(/예약 시술 처방|scheduled/)) failures.push("missing scheduled-orders distinction");
  if (!has(/당직 호출 전달|on-call/)) failures.push("missing on-call distinction");
  if (!has(/소아 성장 기록|growth/)) failures.push("missing growth-stub distinction");
  if (!has(/실시간 방문 파이프라인|realtime/)) failures.push("missing realtime-pipeline distinction");
  if (!has(/처방→조제→청구|orders→pharmacy/)) failures.push("missing orders→pharmacy→billing chain");
  if (!has(/ClaimClear/)) failures.push("missing ClaimClear distinction");
  if (!has(/MediSync/)) failures.push("missing MediSync distinction");

  // 2. Proof states must be separated, not merged into " 동작 확인".
  if (!has(/미입증/)) failures.push("missing unproven proof-state separation");
  if (!has(/주장뿐/)) failures.push("missing claimed-only proof-state separation");
  if (!has(/스텁|NotImplemented/)) failures.push("missing stub/partial-implementation separation");
  if (!has(/stale|낡은/)) failures.push("missing stale-documentation separation");

  // 3. Forbidden broad-category merges: one map item must not swallow
  // materially different capability/workflow/ownership/proof states.
  for (const line of mapItemLines(markdown)) {
    const mentionsReception = /접수 대기열|walk-in/.test(line);
    const mentionsScheduled = /예약|scheduled/.test(line);
    const mentionsOnCall = /당직 호출|on-call/.test(line);
    if ((mentionsReception && mentionsScheduled) || (mentionsReception && mentionsOnCall)) {
      failures.push(`merged reception/scheduled/on-call in one map item: ${line.trim().slice(0, 80)}`);
      break;
    }
    const mentionsClaimClear = /ClaimClear|청구 클리어링/.test(line);
    const mentionsMediSync = /MediSync|HIE/.test(line);
    if (mentionsClaimClear && mentionsMediSync) {
      failures.push(`merged ClaimClear+MediSync in one map item: ${line.trim().slice(0, 80)}`);
      break;
    }
  }

  // 4. Stale nightly batch must not be reported as current truth.
  if (/^\s*-\s*\*\*야간 배치 정산\*\*/m.test(markdown)) {
    failures.push("stale nightly batch reported as a current map item");
  }

  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// A. Static contract: bootstrap carries the ephemeral reconciliation gate
// ---------------------------------------------------------------------------

test("static contract: bootstrap requires ephemeral coverage reconciliation before projection", () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "bootstrap" });
  assert.match(handoff, /coverage reconciliation/);
  assert.match(handoff, /traceable/);
  assert.match(handoff, /하나의 map item으로 합치지/);
  assert.match(handoff, /rail\/group은 reader-friendly하게 압축해도/);
  assert.match(handoff, /map item 자체가 실제 제품 구조를 소실/);
  assert.match(handoff, /major executable\/user workflow/);
  assert.match(handoff, /independent external contracts\/providers/);
  assert.match(handoff, /미조사를 UNKNOWN으로 위장/);
  assert.match(handoff, /설명 없이 사라진 material fact/);
  assert.match(handoff, /고정 map-item 개수나 고정 taxonomy를 만들지 마/);
  assert.match(handoff, /새 DB·index·warehouse·ontology를 만들지 말고/);
  assert.match(handoff, /cockpit check.*구조 검사이지 semantic coverage 증명이 아니다/);
});

test("static contract: reconciliation gate creates no fixed count, taxonomy, or runtime machinery", async () => {
  const handoff = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "bootstrap" });
  assert.doesNotMatch(handoff, /정확히\s*\d+\s*개/);
  assert.doesNotMatch(handoff, /반드시\s*\d+\s*개/);
  assert.ok(!/claude|chatgpt|gemini|openai|codex|qwen/i.test(handoff), "no hard-coded provider");
  const authorSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "author.mjs"), "utf-8");
  assert.doesNotMatch(authorSource, /writeFile|appendFile|createWriteStream/);
  assert.doesNotMatch(authorSource, /mongoose|sqlite|postgres|redis|leveldb/i);
  assert.doesNotMatch(authorSource, /calculateProgress|progressPercent|semanticStateMachine|stateMachine/i);
  // Refresh stays delta-first and gains no second reconciliation owner:
  // the gate is bootstrap-only (one bounded failure domain).
  const refresh = buildAuthorHandoff({ projectDir: "/p", progressFile: "/p/PROGRESS.md", mode: "refresh" });
  assert.doesNotMatch(refresh, /coverage reconciliation/);
});

// ---------------------------------------------------------------------------
// B. Behavioral: adversarial Meridian FAILs before, PASSes after
// ---------------------------------------------------------------------------

test("behavioral: structural check passes for both, so check alone cannot prove coverage", () => {
  const shallow = readFixture("adversarial-meridian-shallow.md");
  const reconciled = readFixture("adversarial-meridian-reconciled.md");
  assert.equal(checkProgressStructure(shallow).ok, true, "shallow must be structurally PASS");
  assert.equal(checkProgressStructure(reconciled).ok, true, "reconciled must be structurally PASS");
});

test("behavioral: README-only broad summary FAILs semantic coverage (old behavior)", () => {
  const shallow = readFixture("adversarial-meridian-shallow.md");
  const result = evaluateMeridianCoverage(shallow);
  assert.equal(result.ok, false, `shallow must FAIL coverage: ${result.failures.join("; ")}`);
  assert.ok(result.failures.length >= 3, "shallow must miss several material distinctions");
  assert.ok(
    result.failures.some((f) => /merged|stale nightly/.test(f)),
    "shallow must exhibit a forbidden merge or stale-as-current"
  );
});

test("behavioral: reconciled evidence-traversal output PASSes semantic coverage (repaired behavior)", () => {
  const reconciled = readFixture("adversarial-meridian-reconciled.md");
  const result = evaluateMeridianCoverage(reconciled);
  assert.equal(result.ok, true, `reconciled must PASS coverage: ${result.failures.join("; ")}`);
  const shallow = readFixture("adversarial-meridian-shallow.md");
  const before = evaluateMeridianCoverage(shallow);
  assert.ok(before.failures.length > result.failures.length, "repair must strictly reduce coverage failures");
});

// ---------------------------------------------------------------------------
// C. Cold-read proxy: primary surface alone restores the five questions
// ---------------------------------------------------------------------------

test("behavioral cold-read proxy: reconciled surface answers what/areas/position/workflows/unfinished", () => {
  const reconciled = readFixture("adversarial-meridian-reconciled.md");
  // What: title + product goal name a concrete product object.
  assert.match(reconciled, /Meridian 외래 운영 원장/);
  assert.match(reconciled, /clinic operations/);
  // Areas: map holds the independent areas without a fixed-count claim.
  const items = mapItemLines(reconciled);
  assert.ok(items.length >= 8, "reconciled map must keep the independent areas traceable");
  // Position: exactly one current-stage group.
  assert.match(reconciled, /#### 현재 단계/);
  assert.match(reconciled, /실시간 방문 파이프라인/);
  // Workflows/boundaries: major workflows + separated external contracts.
  assert.match(reconciled, /처방→조제→청구 사슬/);
  assert.match(reconciled, /ClaimClear 청구 제출/);
  assert.match(reconciled, /MediSync HIE 전달/);
  // Unfinished/unproven: open proof boundaries are explicit.
  assert.match(reconciled, /미입증/);
  assert.match(reconciled, /주장뿐/);
  assert.match(reconciled, /스텁/);

  const shallow = readFixture("adversarial-meridian-shallow.md");
  assert.doesNotMatch(shallow, /미입증/);
  assert.doesNotMatch(shallow, /주장뿐/);
  assert.doesNotMatch(shallow, /스텁/);
  assert.doesNotMatch(shallow, /실시간 방문 파이프라인/);
});
