import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAreaHandoffContext,
  buildFocusHandoffContext,
  formatAdmissionPublicationContractLines,
} from "../dist/parser.js";

test("Focus and Area handoffs consume the same publication vocabulary", () => {
  const sharedContract = formatAdmissionPublicationContractLines().join("\n");
  const focus = buildFocusHandoffContext({
    projectTitle: "Cockpit",
    focusText: "Publication relation repair",
  });
  const area = buildAreaHandoffContext({
    projectTitle: "Cockpit",
    areaTitle: "Publication Boundary",
    railTitle: "Core Engine",
    groupTitle: "Release",
    areaDescription: "Fresh authority and candidate relation",
  });

  for (const handoff of [focus, area]) {
    assert.ok(handoff.includes(sharedContract));
    assert.ok(handoff.includes("`bindingPhase`를 반드시 명시한다"));
    assert.ok(handoff.includes("`PRE_FINAL_JIT` 또는 `POST_FINAL_JIT`"));
    assert.ok(handoff.includes("`TOPOLOGY_REBIND_ELIGIBLE`"));
    assert.ok(handoff.includes("pre-final-JIT topology-only reconciliation"));
    assert.ok(handoff.includes("`SECOND_ADVANCE_CIRCUIT_BREAKER`"));
    assert.ok(handoff.includes("`rebindAllowed: false`"));
    assert.ok(handoff.includes("candidate는 `REFERENCE_ONLY`"));
    assert.ok(
      handoff.includes(
        "같은 attempt에서 `TOPOLOGY_REBIND_ELIGIBLE`로 재진입하지 않는다"
      )
    );
    assert.ok(handoff.includes("`PROOF_BOUNDARY_REFRESH_REQUIRED`"));
    assert.ok(handoff.includes("`jitBindingReusable: false`"));
    assert.ok(handoff.includes("`semanticDeltaPreserved: true`"));
    assert.ok(
      handoff.includes("`proofAction: DIRECTLY_AFFECTED_TARGETED_REFRESH`")
    );
    assert.ok(handoff.includes("직접 영향받은 targeted proof만 새로 실행한다"));
  }
});

test("the shared handoff does not retain the old blanket proof-boundary verdict", () => {
  const contract = formatAdmissionPublicationContractLines().join("\n");
  assert.equal(contract.includes("BLOCKED_PROOF_BOUNDARY_MOVED"), false);
  assert.equal(contract.includes("`reusable: false`"), false);
  assert.equal(
    contract.includes(
      "Semantic overlap / Proof boundary movement: semantic overlap, supersession, ownership ambiguity가 있으면 BLOCKED이며 blind reapply하지 않는다"
    ),
    false
  );
});
