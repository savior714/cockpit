import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFocusHandoffContext,
  buildAreaHandoffContext,
} from "../dist/parser.js";

function handoffs() {
  return [
    buildFocusHandoffContext({
      projectTitle: "Freshness Handoff Project",
      focusText: "Concurrent Development & Publication Freshness",
      situationText: "shared handoff contract carries independent freshness axes",
      nextTransitionText: "executors resume correctly across remote movement",
    }),
    buildAreaHandoffContext({
      projectTitle: "Freshness Handoff Project",
      areaTitle: "Publication Freshness",
      railTitle: "Handoff Contract",
      groupTitle: "Admission",
      areaDescription: "topology / semantic / proof freshness independence in executor handoff",
    }),
  ];
}

test("C1 topology-only: preserve semantic/reusable proof with minimal JIT binding, no same-delta reapply remediation", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("Topology-only movement (SEMANTIC_OWNERS·PROOF_OWNERS unaffected): semantic result preserve, completed/reusable proof preserve, candidate/reference preserve."));
    assert.ok(context.includes("최소 final JIT topology binding"));
    assert.ok(context.includes("fresh main 위에 동일 semantic delta를 처음부터 reapply하는 것을 unconditional remediation으로 제시하지 않으며"));
    assert.ok(!context.includes("fresh main 위에 동일 delta를 reapply하는 exact resume point"));
    assert.ok(!context.includes("fresh main 위에 동일 delta를 reapply"));
  }
});

test("C2 semantic-owner movement: READMIT and blind salvage/reapply forbidden", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("Semantic-owner movement"));
    assert.ok(context.includes("`READMIT`한다."));
    assert.ok(context.includes("blind salvage/reapply를 금지한다"));
  }
});

test("C3 proof-owner-only movement: semantic work preserved, only targeted proof rerun, never combined BLOCKED", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("Proof-owner-only movement"));
    assert.ok(context.includes("semantic work preserve하고 직접 affected targeted proof만 재검증한다"));
    assert.ok(context.includes("proof-owner movement를 semantic overlap과 합쳐 `BLOCKED` 처리하지 않는다"));
    assert.ok(!context.includes("Semantic overlap / Proof boundary movement"));
  }
});

test("C4 uncertainty: no UNKNOWN->BLOCKED / UNKNOWN->FULL REBUILD, bounded classification prescribed", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("`UNKNOWN -> BLOCKED`, `UNKNOWN -> FULL REBUILD` fallback을 사용하지 않는다"));
    assert.ok(context.includes("bounded read-only classification과 nearest relevant targeted proof로 uncertainty를 먼저 줄이고"));
    assert.ok(context.includes("실제 semantic invalidation이 입증될 때만 `READMIT`한다"));
  }
});

test("C5 WATCH_SURFACES: mutation-intended handoff carries DIRECT_PATHS/SEMANTIC_OWNERS/PROOF_OWNERS with meanings", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("[Thin Transient WATCH_SURFACES]"));
    assert.ok(context.includes("`DIRECT_PATHS`(이번 bounded task가 직접 수정할 것으로 예상되는 file/surface)"));
    assert.ok(context.includes("`SEMANTIC_OWNERS`(task meaning/contract를 결정하는 직접 authority surfaces — dependency inventory 아님)"));
    assert.ok(context.includes("`PROOF_OWNERS`(완료된 proof의 validity를 실제로 바꿀 수 있는 직접 proof surfaces — project-wide test catalog 아님)"));
    assert.ok(context.includes("정확한 path를 아직 알 수 없으면 좁은 surface description으로 전달하고 executor가 current repository evidence로 더 좁히게 한다"));
  }
});

test("C6 No Persistence: WATCH_SURFACES stay transient and existing no-persistence contract stands", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("이 3필드는 transient handoff evidence이자 executor reasoning input이며, PROGRESS.md persistent slot, parser state machine, task registry, dependency DB, claim registry, publication queue, lease, scheduler가 되지 않는다"));
    assert.ok(context.includes("Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다"));
  }
});

test("C7 Recover-or-Preserve: missing legacy WATCH_SURFACES instructs reconstruction/preservation, not restart", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("[Recover-or-Preserve]"));
    assert.ok(context.includes("WATCH_SURFACES metadata가 없다고 `missing metadata -> invalid -> rebuild`하지 않는다"));
    assert.ok(context.includes("read-only reconstruction을 우선"));
    assert.ok(context.includes("known semantic result preserve, known-scope proof preserve, candidate/reference preserve"));
    assert.ok(context.includes("정보 부족만으로 완료된 semantic work를 폐기하지 않는다"));
  }
});

test("C8 second advance: attempt lost with evidence preserved, no repeated rematerialization loop", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("[Second-Advance Circuit Breaker]"));
    assert.ok(context.includes("현재 publication attempt가 경쟁에서 진 것이지 semantic task failure이 아니다"));
    assert.ok(context.includes("`SEMANTIC_READY` 유지, reusable proof 유지, candidate/reference 유지로 현재 publication attempt을 종료"));
    assert.ok(context.includes("bind → proof → advance → bind → proof → advance loop를 만들지 않는다"));
  }
});

test("C9 executor neutrality and ADMITTED_BASE immutability remain in the shared contract", () => {
  for (const context of handoffs()) {
    assert.ok(context.includes("[Executor Neutrality]"));
    assert.ok(!/claude|codex|copilot|cursor|\/tmp\/|Users\//i.test(context.split("[PROBLEM FRAMER HANDOFF INSTRUCTION]")[1]));
    assert.ok(context.includes("기록된 `ADMITTED_BASE`는 semantic work가 진행되는 동안 immutable execution basis이며, remote SHA movement alone은 semantic invalidation이 아니다"));
    assert.ok(context.includes("Cockpit handoff는 자체 merge-base/state authority를 구현·중복하지 않고"));
    assert.ok(context.includes("`SEMANTIC_READY`는 bounded semantic work와 필요한 semantic proof가 완료되어 의미가 확정된 상태이며, 지금 바로 publish 가능하다는 뜻은 아니다"));
  }
});
