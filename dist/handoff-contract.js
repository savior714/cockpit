/**
 * Canonical Problem Framer handoff instruction contract.
 *
 * Pure formatters extracted from src/parser.ts as a behavior-preserving
 * bounded refactor. src/parser.ts remains the public compatibility facade
 * and re-exports the public formatter names; import from "./parser".
 */
/** Shared canonical Execution Wave contract lines across all Problem Framer handoffs */
export function formatExecutionWaveContractLines() {
    return [
        "A. NOW / INDEPENDENT:",
        "   - mutation owner, semantic surface, proof boundary, publication interaction이 실질적으로 독립적일 때만 병렬 실행 가능.",
        "   - 지금 성공조건을 확정할 수 있으며 동일 Execution Wave에 포함 가능.",
        "   - 단순히 동일 파일이나 디렉토리를 참조한다는 이유만으로 직렬화하지 않으며, 실제 mutation/evidence/publication boundary가 독립적이면 병렬로 분류한다.",
        "   - NOW task가 여러 개라면 같은 응답에서 각각 별도의 독립 executor-neutral local-agent prompt를 모두 제공한다.",
        "B. SERIAL NOW:",
        "   - bounded target과 성공조건은 지금 확정 가능하지만, 동일 semantic owner / mutation surface / proof boundary / publication-sensitive surface를 공유하여 병렬 admission 시 한 후보의 publication이 다른 READY candidate를 불필요하게 stale화할 위험이 높은 작업.",
        "   - READY candidate가 존재한다는 이유만으로 WAIT로 미루지 않는다.",
        "   - 같은 응답에서 실행 순서를 명확히 하고, 선행 task를 먼저 closure/publication boundary까지 진행한 뒤 다음 task를 fresh evidence에서 시작하도록 안내한다.",
        "   - 단순히 같은 파일 이름을 만진다는 이유만으로 직렬화하지 말고 실제 mutation/semantic/proof/publication boundary를 판정한다.",
        "   - 각 단계의 executor-neutral local-agent prompt를 모두 제공한다.",
        "C. WAIT FOR EVIDENCE:",
        "   - 선행 task 결과에 따라 필요 여부나 semantic target/success criterion이 달라지는 경우(선행 task 결과가 후속 target/necessity/ownership을 바꿀 때만 사용하며, READY candidate 존재만으로 WAIT 판정 금지)",
        "   - consequential한 사용자 결정이 먼저 필요한 경우",
        "   - 현재 evidence만으로 bounded target을 정당하게 확정할 수 없는 경우",
        "   - 이 경우에만 실행 prompt 생성을 보류하고 무엇을 기다리는지 명시한다.",
    ];
}
/** Shared admission freshness and publication reconciliation contract lines across all Problem Framer handoffs */
export function formatAdmissionPublicationContractLines() {
    return [
        "12. [Admission & Publication Discipline — Executor Prompt Contract]:",
        "   - [Fresh BASE Admission] Mutation-intended executor prompt에는 fresh BASE admission 조건을 명확히 전달한다: execution 직전에 `origin/main`을 fresh fetch하고 실제 시작 BASE SHA를 기록한다. task-owned workspace(worktree/branch)가 그 fresh BASE에서 시작하는지 확인하며, stale worktree HEAD나 canonical checkout의 dirty state를 BASE로 상속하지 않는다. 기록된 `ADMITTED_BASE`는 semantic work가 진행되는 동안 immutable execution basis이며, remote SHA movement alone은 semantic invalidation이 아니다. Cockpit은 future SHA를 추측해 handoff에 고정하지 않고, `ADMITTED_BASE`는 execution evidence이지 Cockpit persistent project state가 아니다.",
        "   - [Admission vs Scheduling Boundary] 이미 만들어진 candidate의 BASE freshness check와, 아직 시작하지 않은 후속 task를 SERIAL NOW / WAIT FOR EVIDENCE로 framing하는 scheduling 판단을 서로 다른 단계로 명확히 구분한다.",
        "   - [SEMANTIC_READY != PUBLISHABLE] `SEMANTIC_READY`는 bounded semantic work와 필요한 semantic proof가 완료되어 의미가 확정된 상태이며, 지금 바로 publish 가능하다는 뜻은 아니다. `PUBLISHABLE`은 여기에 fresh remote authority 확인, publication topology admissibility, 직접 영향 integrity/final proof 완료가 더해져 즉시 non-force FF publication을 시도할 수 있는 상태를 뜻한다. 이 구별은 handoff/reasoning vocabulary이며 Cockpit이 persistent task status로 저장하는 것이 아니다.",
        "   - [Binding Phase] JIT binding 호출에는 transient `bindingPhase`를 반드시 명시한다: `PRE_FINAL_JIT` 또는 `POST_FINAL_JIT`. 이를 암묵적으로 `PRE_FINAL_JIT`으로 간주하지 않으며, persistent task state로 저장하지 않는다.",
        "   - [Publication Relation and JIT Phase] Publication은 identity/containment를 먼저 직접 판정한 뒤 실제 divergent movement만 phase별로 처리한다. `EXPECTED_BASE` mismatch나 `REMOTE_ADVANCED` 자체만으로 semantic/proof action을 정하지 않는다:",
        "     * `PRE_FINAL_JIT` + semantic overlap 부재 + proof-boundary movement 부재인 topology-only divergent movement → `TOPOLOGY_REBIND_ELIGIBLE` (pre-final-JIT topology-only reconciliation).",
        "     * `POST_FINAL_JIT`에서 existing candidate를 그대로 사용할 수 없는 새 divergent remote advance → `SECOND_ADVANCE_CIRCUIT_BREAKER`: `rebindAllowed: false`, candidate는 `REFERENCE_ONLY`, 현재 publication attempt는 lost race로 종료하며 같은 attempt에서 `TOPOLOGY_REBIND_ELIGIBLE`로 재진입하지 않는다.",
        "     * 위 circuit breaker는 semantic delta 삭제, broad proof invalidation, persistent `BLOCKED` state를 뜻하지 않는다. 다음 publication attempt는 fresh authority/classification부터 시작한다. fresh `origin/main`이 candidate의 strict ancestor이면 existing candidate가 여전히 FF-publishable이므로 circuit breaker나 rematerialization으로 오판하지 않는다.",
        "     * semantic overlap/semantic-owner movement → `READMIT`/`BLOCKED` 및 blind salvage 금지; proof-owner-only movement → `PROOF_BOUNDARY_REFRESH_REQUIRED`, `jitBindingReusable: false`, `semanticDeltaPreserved: true`, `proofAction: DIRECTLY_AFFECTED_TARGETED_REFRESH`.",
        "     * proof-owner-only refresh는 stale proof/JIT 재사용을 금지하고 직접 영향받은 targeted proof만 새로 실행한다. broad suite restart는 해당 broad criterion이 실제로 invalidated된 경우에만 한다.",
        "   - [Publication & Independent Freshness Axes] Publication은 short serialization boundary다. remote advance를 발견하면 blind retry/rematerialization loop를 돌지 않고 freshness를 3개의 독립 축으로 판정한다: topology freshness / semantic freshness / proof freshness. 한 축의 movement는 다른 축을 자동 invalidation하지 않는다:",
        "     * Topology-only movement (SEMANTIC_OWNERS·PROOF_OWNERS unaffected): semantic result preserve, completed/reusable proof preserve, candidate/reference preserve. publication에 실제로 필요한 최소 final JIT topology binding과 directly affected integrity/proof만 수행한다. fresh main 위에 동일 semantic delta를 처음부터 reapply하는 것을 unconditional remediation으로 제시하지 않으며, topology movement만으로 semantic implementation을 다시 materialize하지 않는다.",
        "     * Semantic-owner movement: intervening movement가 task meaning을 결정하는 owner(requirement, public contract, workflow semantics, schema/API 의미, task가 직접 의존하는 architecture/policy authority)를 실제로 변경했다면 `READMIT`한다. old semantic evidence/candidate는 reference로 보존하고 blind salvage/reapply를 금지한다.",
        "     * Proof-owner-only movement: task meaning은 그대로이고 existing proof validity owner(relevant tests, fixtures, validation rules, build/runtime configuration, proof command, generated evidence owner)만 변경됐다면 semantic work preserve하고 직접 affected targeted proof만 재검증한다. proof-owner movement를 semantic overlap과 합쳐 `BLOCKED` 처리하지 않는다.",
        "     * Uncertain: `UNKNOWN -> BLOCKED`, `UNKNOWN -> FULL REBUILD` fallback을 사용하지 않는다. bounded read-only classification과 nearest relevant targeted proof로 uncertainty를 먼저 줄이고, 실제 semantic invalidation이 입증될 때만 `READMIT`한다.",
        "   - [Thin Transient WATCH_SURFACES] Mutation-intended executor prompt가 실제 변경으로 framing될 때는 최소 transient watch surfaces를 명시적으로 전달한다: `DIRECT_PATHS`(이번 bounded task가 직접 수정할 것으로 예상되는 file/surface), `SEMANTIC_OWNERS`(task meaning/contract를 결정하는 직접 authority surfaces — dependency inventory 아님), `PROOF_OWNERS`(완료된 proof의 validity를 실제로 바꿀 수 있는 직접 proof surfaces — project-wide test catalog 아님). 부정확한 정밀도를 조작하지 말고, 정확한 path를 아직 알 수 없으면 좁은 surface description으로 전달하고 executor가 current repository evidence로 더 좁히게 한다. 이 3필드는 transient handoff evidence이자 executor reasoning input이며, PROGRESS.md persistent slot, parser state machine, task registry, dependency DB, claim registry, publication queue, lease, scheduler가 되지 않는다.",
        "   - [Recover-or-Preserve] Legacy handoff/candidate에 WATCH_SURFACES metadata가 없다고 `missing metadata -> invalid -> rebuild`하지 않는다. current repository evidence에서 read-only reconstruction을 우선하고, 가능 범위에서 `DIRECT_PATHS`/`SEMANTIC_OWNERS`/`PROOF_OWNERS`를 재구성한다. 충분하면 normal freshness classification을 적용하고, 불충분하면 known semantic result preserve, known-scope proof preserve, candidate/reference preserve로 두고 publication/freshness decision만 stop 또는 CONTINUABLE로 보고한다. 정보 부족만으로 완료된 semantic work를 폐기하지 않는다.",
        "   - [Second-Advance Circuit Breaker] Final publication binding 이후 다른 writer가 remote를 다시 advance하면 현재 publication attempt가 경쟁에서 진 것이지 semantic task failure이 아니다. `SEMANTIC_READY` 유지, reusable proof 유지, candidate/reference 유지로 현재 publication attempt을 종료하고, 같은 attempt에서 bind → proof → advance → bind → proof → advance loop를 만들지 않는다. 다음 attempt는 fresh classification부터 재개한다.",
        "   - [Git Safety Delegation] Fresh remote revision 확보, candidate containment, ancestor/descendant/divergence 판정, FF publication admissibility는 repository-native Git Safety/development contract의 authority이며 그 준수를 요구한다. Cockpit handoff는 자체 merge-base/state authority를 구현·중복하지 않고, repository의 실제 implementation을 가정하지도 않는다.",
    ];
}
/** Shared project-model admission contract across all Problem Framer handoffs */
function formatProjectModelAdmissionLines(scope = "focus") {
    const openClaimLine = scope === "area"
        ? "3. [Open-Claim Re-admission] [Falsification] Area Details의 `남은 문제`는 실행 task 목록이 아니라 fresh evidence로 재검증할 기존 claim이다. 각 항목을 task로 승격하기 전에 current implementation/runtime/proof에서 closure 및 counterevidence를 적극적으로 탐색하라. 이미 닫혔거나 defect가 아닌 항목은 제거 대상으로 판정하고, 전달된 모든 problem이 닫혔으면 NO_ACTION / NO_CHANGE를 낸다. 추론 중에는 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하라."
        : "3. [Open-Claim Re-admission] [Falsification] 전달된 `남은 문제`/`직면한 문제`/`다음 전환`의 선행조건/material limitation은 실행 task가 아니라 fresh evidence로 재검증할 claim이다. 각 항목을 task로 승격하기 전에 current implementation/runtime/proof에서 closure/counterevidence를 적극적으로 탐색하고, 추론 중에만 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하라.";
    return [
        "2. [Mode Selection — REFRESH vs RECONSTRUCT] 먼저 기존 mental model의 신뢰성을 평가하고 진입 모드를 선택하라.",
        "   - REFRESH: 기존 mental model의 신뢰성이 최근의 독립 evidence와 신뢰할 수 있는 provenance로 충분히 확립된 경우에만 사용한다. fresh evidence와 비교해 material semantic delta가 있는 surface만 Targeted Refresh하고, 무관한 stable surface는 보존한다.",
        "   - RECONSTRUCT: 기존 mental model의 신뢰성을 전제로 할 수 없을 때 사용한다. current authority/code/runtime/proof/relevant Git에서 독립적으로 project model을 다시 구성하고, 기존 PROGRESS는 마지막 비교 전까지 topology/architecture truth가 아닌 historical claim/comparison source로만 취급한다.",
        "   - 순서: current authority/code/runtime/proof/relevant Git → independent project reconstruction → coverage closure → claim admission/uncertainty handling → synthesis → existing PROGRESS comparison → stale/false/missing semantics의 replacement.",
        "   - 대표적인 RECONSTRUCT 조건: Cockpit first-use/최초 프로젝트 연결; 사용자가 현재 model 정확성에 의문을 제기함; 여러 stale/false claim 발견; 실제 architecture/workflow와 Project Map decomposition이 맞지 않음; 장기간 재진입으로 baseline 신뢰성이 불명확함; 기존 PROGRESS의 provenance/fidelity를 신뢰할 근거가 충분하지 않음.",
        "   - RECONSTRUCT는 모든 실행을 대체하는 기본 절차가 아니다. 신뢰성이 확립된 일반 bounded task에는 기존 Mental Model Delta Test와 Targeted Refresh를 유지한다.",
        openClaimLine,
        "4. [Positive Model Re-admission] RECONSTRUCT에서는 negative/open claim뿐 아니라 material positive model도 grandfather하지 않는다. subsystem의 존재/역할, A→B→C workflow, semantic owner, capability의 구현·검증 여부, Project Map decomposition, Current Stage는 current evidence가 다시 뒷받침할 때만 admitted한다. 코드·설정·테스트가 존재한다는 사실만으로 capability나 proof를 인정하지 않는다.",
        "5. [Coverage Closure — transient] RECONSTRUCT synthesis 전에 각 material semantic surface를 가능한 범위에서 설명하라: 실제 역할, semantic owner, 실제 entry/runtime path, consequential consumer/downstream effect, authority/intent source, 직접적인 implementation/proof evidence, relevant history가 현재 의미를 바꾸는지, 최종 model에서 represented / intentionally omitted / UNKNOWN 중 무엇인지. 모든 파일/함수 전수 inventory, coverage %, persistent table/registry/schema/DB/score는 요구하거나 만들지 않는다. 설명되지 않은 material surface가 남아 있으면 synthesis를 완료한 것으로 간주하지 않는다.",
        "6. [Project Map Escape Hatch] Focus/Area를 검토하다가 전달된 Area 또는 Project Map의 의미가 틀렸거나, semantic owner가 다른 곳에 있거나, Project Map decomposition이 실제 architecture/workflow를 왜곡하거나, root cause가 기존 boundary를 넘는다는 direct evidence가 나오면 기존 map에 억지로 맞추지 말고 RECONSTRUCT 또는 필요한 wider re-entry로 escalate하라. 기본 bounded review는 유지하되 자동으로 repository-wide audit으로 확대하지 않는다.",
        "7. [Reader-Level Projection] evidence assimilation과 reader-level projection을 분리하라. 위 단계에서 수집·재입장한 high-resolution evidence를 발견했다는 이유만으로 Project Horizon overview(`현재 상황`/`다음 전환`/`직면한 문제`)에 그대로 투사하지 않는다. `현재 상황`은 project-wide 상태(성과/범위, 핵심 기반, 검증/준비도 등 material category 2~4개로 압축), `다음 전환`은 project-level state transition(A 상태 → B 상태와 완료 조건; executor command 아님), `직면한 문제는` 방향을 실제로 제한하는 Blocker/Material Uncertainty/Constraint만 admitted한다. commit SHA·개별 파일/route·test 개수·command·CI run·bug chronology 같은 low-level evidence는 Recent Progress(material semantic transition), Area Detail(subsystem 상태/근거), Handoff(exact execution context)의 적절한 zoom level에 두고 Overview에 중복 복사하지 않는다. 분석 정확도는 유지하되 표면별 표현 해상도만 분리한다.",
        "8. [Fresh-Supersession Gate — investigator finding vs fresh authority] This gate is not the transmitted-claim Open-Claim Re-admission above; it judges the investigator's newly derived finding against fresh authority, and it applies only when read-only investigation is about to recommend a new mutation/repair. Immediately before closure, fetch fresh `origin/main`, explicitly record its SHA via `rev-parse`, and judge identity/containment between the investigation baseline/finding provenance and fresh authority directly with Git authority (`rev-parse`, `merge-base --is-ancestor`). Topology movement alone never discards or retains a finding. Compare the investigated defect with intervening history for semantic overlap — same/directly-related source hunk, same contract or behavior, same proof/test surface, whether a superseded fix exists. When fresh authority already closes the defect's root cause completely with required proof, reclassify the finding as `CLOSED / SUPERSEDED_BY_PUBLISHED_FIX`, do not create a mutation task to reimplement or re-verify the already-published fix, and do not emit `NEXT_REPAIR` or a repair handoff. Unrelated upstream movement is information, not investigation invalidation. Partial fix, different-meaning fix, revert, or proof gap never auto-close; apply the existing semantic/proof judgment. No new state machine, registry, queue, daemon, task DB, or scheduler.",
    ];
}
/** Format instruction block for Current Focus Problem Framer handoff */
export function formatFocusHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "1. [Fresh Evidence 대조] 외부 capable agent는 위 전달받은 context를 최종 truth로 신뢰하지 말고, 반드시 현재 repo/runtime/SSOT의 fresh evidence와 대조하여 실제 문제를 검증하라.",
        ...formatProjectModelAdmissionLines(),
        "9. [Framing Objective] Current Focus를 Next Transition까지 전진시키기 위해 현재 시점에서 의미와 성공조건을 확정할 수 있는 bounded work를 찾는다. Focus가 있어도 Next Transition을 command/task 수준으로 축소하지 않고 focus advancement를 project-level state transition으로 표현한다. 현재 Focus와 무관한 작업을 단순히 task 수를 늘리기 위해 끌어오지 않는다.",
        "10. [No Problem → No Task] 현재 Focus scope에서 실제 문제가 없거나 추가 작업이 불필요하다면 무리하게 task를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "11. [Execution Wave 분류 & Local-Agent Prompts]:",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        ...formatAdmissionPublicationContractLines(),
        "13. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "14. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
    ];
    return lines.join("\n");
}
/** Format instruction block for Area Review Problem Framer handoff */
export function formatAreaHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "1. [Fresh Evidence 대조] 외부 capable agent는 위 전달받은 context를 최종 truth로 신뢰하지 말고, 반드시 현재 repo/runtime/SSOT의 fresh evidence와 대조하여 선택된 영역의 실제 상태/취약점/미해결 문제를 검증하라.",
        ...formatProjectModelAdmissionLines("area"),
        "9. [Framing Objective] 선택된 Area의 실제 상태/취약점/미해결 문제를 fresh evidence로 깊게 검토하는 것이 objective다. root cause나 proof가 인접 Area를 실제로 통과한다면 필요한 범위까지 조사할 수 있으나, 임의로 프로젝트 전체 review로 확장하지 않는다.",
        "10. [No Problem → No Task] 검토 결과 해당 영역에 실제 문제가 없거나 추가 조치가 불필요하다면 무리하게 task/Wave를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "11. [Execution Wave 분류 & Local-Agent Prompts]:",
        "   - 문제가 확인되면 해당 문제를 해결하는 데 지금 확정 가능한 최대 범위까지만 Execution Wave를 구성한다.",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        ...formatAdmissionPublicationContractLines(),
        "13. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "14. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
    ];
    return lines.join("\n");
}
