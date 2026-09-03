import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { createHash } from "node:crypto";
import { normalizeTitle } from "../dist/authoring-grammar.js";
import { splitSections, extractSectionRawText } from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
  parseMentalModel,
} from "../dist/semantic-construction.js";
import {
  buildFocusHandoffContext,
  buildAreaHandoffContext,
} from "../dist/handoff-context.js";
import {
  formatProjectMapText,
  formatAreaDetailsText,
} from "../dist/inspector-projection.js";
import {
  formatFocusHandoffInstruction,
  formatAreaHandoffInstruction,
  formatExecutionWaveContractLines,
  formatAdmissionPublicationContractLines,
} from "../dist/handoff-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

test("Focus handoff context assembly: complete context and Problem Framer instructions", () => {
  const context = buildFocusHandoffContext({
    projectTitle: "스마트 진료 시스템",
    focusText: "외래 진료 흐름 안정화 및 전송 지연 단축",
    situationText: "HL7 수집 엔진 안정화 완료, 진료 소견 작성 화면 검증 진행 중",
    nextTransitionText: "비동기 서명 처리 완료 및 검사 오더 연동 규격 확정",
    facingIssuesText: "- 비표준 HL7 세그먼트 예외 처리",
    projectFrameText: "차세대 스마트 병원 외래 워크플로우 통합",
    settledDirectionText: "- 마이크로서비스 연동 아키텍처 확정 (2026-08-01)",
    projectMapText: "### 1차 레일\n- **환자 접수** — 접수 처리",
    areaDetailsText: "### 환자 접수\n#### 의미\n접수 관문",
  });

  // Verify all essential sections exist
  assert.ok(context.includes("[PROJECT]\n스마트 진료 시스템"));
  assert.ok(context.includes("[CURRENT FOCUS]\n외래 진료 흐름 안정화 및 전송 지연 단축"));
  assert.ok(context.includes("[CURRENT SITUATION]\nHL7 수집 엔진 안정화 완료, 진료 소견 작성 화면 검증 진행 중"));
  assert.ok(context.includes("[NEXT TRANSITION]\n비동기 서명 처리 완료 및 검사 오더 연동 규격 확정"));
  assert.ok(context.includes("[FACING ISSUES]\n- 비표준 HL7 세그먼트 예외 처리"));
  assert.ok(context.includes("[PROJECT FRAME]\n차세대 스마트 병원 외래 워크플로우 통합"));
  assert.ok(context.includes("[SETTLED DIRECTION]\n- 마이크로서비스 연동 아키텍처 확정 (2026-08-01)"));
  assert.ok(context.includes("[PROJECT MAP]\n### 1차 레일\n- **환자 접수** — 접수 처리"));
  assert.ok(context.includes("[AREA CONTEXT]\n### 환자 접수\n#### 의미\n접수 관문"));

  // Verify Problem Framer instructions
  assert.ok(context.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
  assert.ok(context.includes("현재 repo/runtime/SSOT의 fresh evidence와 대조하여 실제 문제를 검증하라."));
  assert.ok(context.includes("[Open-Claim Re-admission]"));
  assert.ok(context.includes("current implementation/runtime/proof에서 closure/counterevidence를 적극적으로 탐색하고"));
  assert.ok(context.includes("Current Focus를 Next Transition까지 전진시키기 위해"));
  assert.ok(context.includes("NO_ACTION / NO_CHANGE 결론을 낸다."));
  assert.ok(context.includes("A. NOW / INDEPENDENT:"));
  assert.ok(context.includes("NOW task가 여러 개라면 같은 응답에서 각각 별도의 독립 executor-neutral local-agent prompt를 모두 제공한다."));
  assert.ok(context.includes("B. SERIAL NOW:"));
  assert.ok(context.includes("동일 semantic owner / mutation surface / proof boundary / publication-sensitive surface를 공유하여 병렬 admission 시 한 후보의 publication이 다른 READY candidate를 불필요하게 stale화할 위험이 높은 작업."));
  assert.ok(context.includes("WAIT로 미루지 않는다"));
  assert.ok(context.includes("같은 응답에서 실행 순서를 명확히 하고, 선행 task를 먼저 closure/publication boundary까지 진행한 뒤 다음 task를 fresh evidence에서 시작하도록 안내한다."));
  assert.ok(context.includes("C. WAIT FOR EVIDENCE:"));
  assert.ok(context.includes("12. [Admission & Publication Discipline — Executor Prompt Contract]:"));
  assert.ok(context.includes("Mutation-intended executor prompt에는 fresh BASE admission 조건을 명확히 전달한다"));
  assert.ok(context.includes("Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다."));
  assert.ok(context.includes("executor-neutral prompt로 작성한다."));

  // Verify Cockpit does NOT generate tasks or backlog items by itself
  assert.ok(!context.includes("Task A:"));
  assert.ok(!context.includes("Task 1:"));
  assert.ok(!context.includes("## Execution Wave"));
});

test("Focus handoff context assembly: minimal optional fields omitted cleanly", () => {
  const minimalContext = buildFocusHandoffContext({
    projectTitle: "Minimal Project",
    focusText: "Core Feature Hardening",
    situationText: "Starting core implementation",
    nextTransitionText: "Initial prototype complete",
  });

  assert.ok(minimalContext.includes("[PROJECT]\nMinimal Project"));
  assert.ok(minimalContext.includes("[CURRENT FOCUS]\nCore Feature Hardening"));
  assert.ok(minimalContext.includes("[CURRENT SITUATION]\nStarting core implementation"));
  assert.ok(minimalContext.includes("[NEXT TRANSITION]\nInitial prototype complete"));
  assert.ok(!minimalContext.includes("[FACING ISSUES]"));
  assert.ok(!minimalContext.includes("[PROJECT FRAME]"));
  assert.ok(!minimalContext.includes("[SETTLED DIRECTION]"));
  assert.ok(!minimalContext.includes("[PROJECT MAP]"));
  assert.ok(!minimalContext.includes("[AREA CONTEXT]"));
  assert.ok(minimalContext.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
});

test("Area review handoff context assembly: complete context and Problem Framer instructions", () => {
  const areaDetail = {
    title: "센서 계측 인터페이스",
    normalizedKey: "센서계측인터페이스",
    subsections: [
      {
        subheading: "의미",
        html: "<p>실시간 센서 데이터 수집 관문.</p>",
        rawText: "실시간 센서 데이터 수집 관문.",
      },
      {
        subheading: "현재 수준",
        html: "<p>RS-485 및 Modbus 프로토콜 1차 연동 완료.</p>",
        rawText: "RS-485 및 Modbus 프로토콜 1차 연동 완료.",
      },
      {
        subheading: "남은 문제",
        html: "<ul><li>통신 순단 시 재연결 버퍼 오버플로우 방지</li></ul>",
        rawText: "- 통신 순단 시 재연결 버퍼 오버플로우 방지",
      },
      {
        subheading: "근거",
        html: "<p><code>src/sensor/modbus.c</code></p>",
        rawText: "- `src/sensor/modbus.c`",
      },
    ],
  };

  const context = buildAreaHandoffContext({
    projectTitle: "원격 모니터링 시스템",
    areaTitle: "센서 계측 인터페이스",
    railTitle: "1차 수집 레일",
    groupTitle: "핵심 인터페이스",
    areaDescription: "현장 센서 계측 및 패킷 파싱",
    areaDetail,
    focusText: "센서 패킷 유실 방지 및 버퍼 안정화",
    situationText: "Modbus 드라이버 통합 완료, 재연결 부하 테스트 중",
    nextTransitionText: "안전 버퍼 구현 및 24시간 스트레스 테스트 통과",
    facingIssuesText: "- 버퍼 고갈 시 링버퍼 오버라이트 정책 확정 필요",
    projectFrameText: "산업용 고신뢰성 원격 모니터링 및 제어 플랫폼",
    settledDirectionText: "- C99 기반 저지연 통신 모듈 유지",
  });

  // Verify all sections exist
  assert.ok(context.includes("[PROJECT]\n원격 모니터링 시스템"));
  assert.ok(context.includes("[SELECTED AREA]\n센서 계측 인터페이스 (1차 수집 레일 · 핵심 인터페이스)"));
  assert.ok(context.includes("[AREA SUMMARY]\n현장 센서 계측 및 패킷 파싱"));
  assert.ok(context.includes("[AREA DETAILS]"));
  assert.ok(context.includes("#### 의미\n실시간 센서 데이터 수집 관문."));
  assert.ok(context.includes("#### 현재 수준\nRS-485 및 Modbus 프로토콜 1차 연동 완료."));
  assert.ok(context.includes("#### 남은 문제\n- 통신 순단 시 재연결 버퍼 오버플로우 방지"));
  assert.ok(context.includes("#### 근거\n- `src/sensor/modbus.c`"));

  // Verify stable project context inclusion
  assert.ok(context.includes("[CURRENT FOCUS]\n센서 패킷 유실 방지 및 버퍼 안정화"));
  assert.ok(context.includes("[CURRENT SITUATION]\nModbus 드라이버 통합 완료, 재연결 부하 테스트 중"));
  assert.ok(context.includes("[NEXT TRANSITION]\n안전 버퍼 구현 및 24시간 스트레스 테스트 통과"));
  assert.ok(context.includes("[FACING ISSUES]\n- 버퍼 고갈 시 링버퍼 오버라이트 정책 확정 필요"));
  assert.ok(context.includes("[PROJECT FRAME]\n산업용 고신뢰성 원격 모니터링 및 제어 플랫폼"));
  assert.ok(context.includes("[SETTLED DIRECTION]\n- C99 기반 저지연 통신 모듈 유지"));

  // Verify Area Review Problem Framer instructions
  assert.ok(context.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
  assert.ok(context.includes("현재 repo/runtime/SSOT의 fresh evidence와 대조하여 선택된 영역의 실제 상태/취약점/미해결 문제를 검증하라."));
  assert.ok(context.includes("선택된 Area의 실제 상태/취약점/미해결 문제를 fresh evidence로 깊게 검토하는 것이 objective다."));
  assert.ok(context.includes("root cause나 proof가 인접 Area를 실제로 통과한다면 필요한 범위까지 조사할 수 있으나, 임의로 프로젝트 전체 review로 확장하지 않는다."));
  assert.ok(context.includes("검토 결과 해당 영역에 실제 문제가 없거나 추가 조치가 불필요하다면 무리하게 task/Wave를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다."));

  // Verify shared Execution Wave contract
  assert.ok(context.includes("A. NOW / INDEPENDENT:"));
  assert.ok(context.includes("NOW task가 여러 개라면 같은 응답에서 각각 별도의 독립 executor-neutral local-agent prompt를 모두 제공한다."));
  assert.ok(context.includes("B. SERIAL NOW:"));
  assert.ok(context.includes("동일 semantic owner / mutation surface / proof boundary / publication-sensitive surface를 공유하여 병렬 admission 시 한 후보의 publication이 다른 READY candidate를 불필요하게 stale화할 위험이 높은 작업."));
  assert.ok(context.includes("WAIT로 미루지 않는다"));
  assert.ok(context.includes("같은 응답에서 실행 순서를 명확히 하고, 선행 task를 먼저 closure/publication boundary까지 진행한 뒤 다음 task를 fresh evidence에서 시작하도록 안내한다."));
  assert.ok(context.includes("C. WAIT FOR EVIDENCE:"));
  assert.ok(context.includes("12. [Admission & Publication Discipline — Executor Prompt Contract]:"));
  assert.ok(context.includes("Mutation-intended executor prompt에는 fresh BASE admission 조건을 명확히 전달한다"));
  assert.ok(context.includes("Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다."));
  assert.ok(context.includes("executor-neutral prompt로 작성한다."));

  // Verify executor neutrality & no prompt leakage
  assert.ok(!context.includes("ChatGPT memory"));
  assert.ok(!context.includes("Custom Instructions"));
  assert.ok(!context.includes("Task A:"));
});

test("Area handoff re-admits existing negative claims instead of anchoring remediation", () => {
  const context = buildAreaHandoffContext({
    projectTitle: "Generic Record Service",
    areaTitle: "Record Submission",
    areaDetail: {
      title: "Record Submission",
      normalizedKey: "record submission",
      subsections: [
        {
          subheading: "Meaning",
          html: "<p>Accepts a record submission.</p>",
          rawText: "Accepts a record submission.",
        },
        {
          subheading: "Current Level",
          html: "<p>Submission path is available.</p>",
          rawText: "Submission path is available.",
        },
        {
          subheading: "Remaining Problems",
          html: "<ul><li>repeated submission creates duplicate records</li></ul>",
          rawText: "- repeated submission creates duplicate records",
        },
        {
          subheading: "Evidence",
          html: "<p>Current repository tests.</p>",
          rawText: "- Current repository tests",
        },
      ],
    },
  });

  // Transport preserves the supplied claim for external re-admission; it does not decide its truth.
  assert.ok(context.includes("#### Remaining Problems\n- repeated submission creates duplicate records"));

  // Area handoff must actively falsify existing claims rather than treat them as remediation tasks.
  assert.ok(
    context.includes(
      "Area Details의 `남은 문제`는 실행 task 목록이 아니라 fresh evidence로 재검증할 기존 claim이다."
    )
  );
  assert.ok(
    context.includes(
      "각 항목을 task로 승격하기 전에 current implementation/runtime/proof에서 closure 및 counterevidence를 적극적으로 탐색하라."
    )
  );
  assert.ok(
    context.includes(
      "이미 닫혔거나 defect가 아닌 항목은 제거 대상으로 판정하고, 전달된 모든 problem이 닫혔으면 NO_ACTION / NO_CHANGE를 낸다."
    )
  );
});

test("Focus and Area handoffs distinguish REFRESH from RECONSTRUCT and close model coverage", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Reconstruction Test Project",
      focusText: "Current focus",
      projectMapText: "### Historical map\n- **Old boundary** — supplied context",
    }),
    buildAreaHandoffContext({
      projectTitle: "Reconstruction Test Project",
      areaTitle: "Supplied area",
      areaDescription: "Supplied summary",
    }),
  ];

  for (const context of contexts) {
    assert.ok(context.includes("[Mode Selection — REFRESH vs RECONSTRUCT]"));
    assert.ok(context.includes("REFRESH: 기존 mental model의 신뢰성이"));
    assert.ok(context.includes("material semantic delta가 있는 surface만 Targeted Refresh하고"));
    assert.ok(context.includes("RECONSTRUCT: 기존 mental model의 신뢰성을 전제로 할 수 없을 때"));
    assert.ok(
      context.includes(
        "기존 PROGRESS는 마지막 비교 전까지 topology/architecture truth가 아닌 historical claim/comparison source"
      )
    );
    assert.ok(context.includes("RECONSTRUCT는 모든 실행을 대체하는 기본 절차가 아니다."));

    assert.ok(context.includes("[Positive Model Re-admission]"));
    assert.ok(context.includes("Project Map decomposition, Current Stage는 current evidence가 다시 뒷받침할 때만 admitted한다."));
    assert.ok(context.includes("[Coverage Closure — transient]"));
    assert.ok(context.includes("represented / intentionally omitted / UNKNOWN"));
    assert.ok(context.includes("persistent table/registry/schema/DB/score"));
    assert.ok(context.includes("설명되지 않은 material surface가 남아 있으면 synthesis를 완료한 것으로 간주하지 않는다."));
    assert.ok(context.includes("[Project Map Escape Hatch]"));
    assert.ok(context.includes("RECONSTRUCT 또는 필요한 wider re-entry로 escalate하라."));
  }

  const reconstructionOrder = [
    "current authority/code/runtime/proof/relevant Git",
    "independent project reconstruction",
    "coverage closure",
    "claim admission/uncertainty handling",
    "synthesis",
    "existing PROGRESS comparison",
    "stale/false/missing semantics",
  ];
  let previousIndex = -1;
  for (const marker of reconstructionOrder) {
    const index = contexts[0].indexOf(marker);
    assert.notEqual(index, -1, `handoff must include reconstruction marker: ${marker}`);
    assert.ok(index > previousIndex, `reconstruction marker must preserve order: ${marker}`);
    previousIndex = index;
  }
});

test("Repository handoffs keep canonical authority and worktree proposals distinct without a global ceremony", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Authority Boundary Project",
      focusText: "Publication relation investigation",
      situationText: "A dirty working-tree candidate proposes targeted proof refresh.",
    }),
    buildAreaHandoffContext({
      projectTitle: "Authority Boundary Project",
      areaTitle: "Publication relation",
      areaDetail: {
        title: "Publication relation",
        normalizedKey: "publication relation",
        subsections: [{
          subheading: "Current Level",
          html: "<p>A dirty working-tree candidate proposes targeted proof refresh.</p>",
          rawText: "A dirty working-tree candidate proposes targeted proof refresh.",
        }],
      },
    }),
  ];

  for (const context of contexts) {
    assert.equal(
      (context.match(/\[Canonical vs Proposed Authority — repository tasks only\]/g) ?? []).length,
      1,
      "the authority guard should be emitted once as a shared compact contract"
    );
    assert.ok(context.includes("`CANONICAL_AUTHORITY`는 fresh published/tracked authoritative ref"));
    assert.ok(context.includes("`LOCAL_TRACKED_SNAPSHOT`은 현재 `HEAD`와 tracked files"));
    assert.ok(context.includes("`PROPOSED_WORKTREE_SEMANTICS`는 dirty/untracked working-tree candidate"));
    assert.ok(context.includes("investigation evidence로는 사용할 수 있지만 canonical authority로 부르거나 승격하지 않으며"));
    assert.ok(context.includes("canonical과 충돌하면 그 mismatch 자체를 조사하라."));

    // The proposal remains input evidence; no persistent authority/provenance
    // block or task-state ceremony is added to the ordinary handoff.
    assert.ok(context.includes("dirty working-tree candidate proposes targeted proof refresh."));
    assert.ok(!context.includes("## CANONICAL_AUTHORITY"));
    assert.ok(!context.includes("## PROPOSED_WORKTREE_SEMANTICS"));
    assert.ok(!context.includes("authority registry"));
  }
});

test("Focus and Area handoffs carry the Project Horizon reader-level projection contract", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Projection Test Project",
      focusText: "Current focus",
    }),
    buildAreaHandoffContext({
      projectTitle: "Projection Test Project",
      areaTitle: "Some area",
    }),
  ];

  for (const context of contexts) {
    assert.ok(context.includes("[Reader-Level Projection]"));
    assert.ok(
      context.includes("evidence assimilation과 reader-level projection을 분리하라"),
      "handoff must separate evidence assimilation from reader-level projection"
    );
    assert.ok(
      context.includes("high-resolution evidence를 발견했다는 이유만으로 Project Horizon overview"),
      "handoff must forbid projecting raw high-resolution evidence into Overview"
    );
    assert.ok(context.includes("Project Horizon"));
    assert.ok(
      context.includes("`현재 상황`은 project-wide 상태"),
      "Overview current situation must be defined at project horizon zoom"
    );
    assert.ok(
      context.includes("executor command 아님"),
      "next transition must not be reduced to executor commands"
    );
    assert.ok(
      context.includes("Blocker/Material Uncertainty/Constraint"),
      "facing issues must be admitted at project-level constraint zoom"
    );
    assert.ok(
      context.includes("commit SHA·개별 파일/route·test 개수·command·CI run·bug chronology"),
      "handoff must enumerate low-level evidence excluded from Overview"
    );
    assert.ok(
      context.includes("Recent Progress(material semantic transition), Area Detail(subsystem 상태/근거), Handoff(exact execution context)"),
      "handoff must route low-level evidence to lower-level surfaces"
    );
    assert.ok(
      context.includes("분석 정확도는 유지하되 표면별 표현 해상도만 분리한다"),
      "handoff must preserve analysis accuracy while separating display resolution"
    );

    // Projection instruction must not weaken existing assimilation contract: it lands
    // after coverage closure/escape hatch, before framing objective.
    const projectionIdx = context.indexOf("[Reader-Level Projection]");
    assert.notEqual(projectionIdx, -1);
    assert.ok(context.indexOf("[Coverage Closure — transient]") < projectionIdx);
    assert.ok(context.indexOf("[Project Map Escape Hatch]") < projectionIdx);
    assert.ok(projectionIdx < context.indexOf("[Framing Objective]"));
  }

  // Focus handoff keeps Next Transition at project-level state transition even with a focus.
  const focusContext = contexts[0];
  assert.ok(
    focusContext.includes("Next Transition을 command/task 수준으로 축소하지 않고 focus advancement를 project-level state transition으로 표현한다"),
    "focus handoff must express focus advancement as project-level state transition"
  );
});

test("Area review handoff context assembly: minimal context without optional details/focus", () => {
  const minimalAreaContext = buildAreaHandoffContext({
    projectTitle: "Minimal Area Project",
    areaTitle: "코어 모듈",
  });

  assert.ok(minimalAreaContext.includes("[PROJECT]\nMinimal Area Project"));
  assert.ok(minimalAreaContext.includes("[SELECTED AREA]\n코어 모듈"));
  assert.ok(!minimalAreaContext.includes("[AREA SUMMARY]"));
  assert.ok(!minimalAreaContext.includes("[AREA DETAILS]"));
  assert.ok(!minimalAreaContext.includes("[CURRENT FOCUS]"));
  assert.ok(!minimalAreaContext.includes("[CURRENT SITUATION]"));
  assert.ok(!minimalAreaContext.includes("[NEXT TRANSITION]"));
  assert.ok(!minimalAreaContext.includes("[FACING ISSUES]"));
  assert.ok(!minimalAreaContext.includes("[PROJECT FRAME]"));
  assert.ok(!minimalAreaContext.includes("[SETTLED DIRECTION]"));
  assert.ok(minimalAreaContext.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
});

test("Fixture end-to-end focus handoff context on visual-test-focus.md", () => {
  const filePath = path.join(__dirname, "fixtures", "visual-test-focus.md");
  const content = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(content, {});
  const { title, sections } = splitSections(tokens);
  const focusTokens = sections.get("current focus");
  assert.ok(focusTokens);

  const parsedMap = parseProjectMap(sections.get("project map"));
  const areaDetails = parseAreaDetails(sections.get("area details"));

  const handoff = buildFocusHandoffContext({
    projectTitle: title,
    focusText: extractSectionRawText(focusTokens),
    situationText: extractSectionRawText(sections.get("current situation")),
    nextTransitionText: extractSectionRawText(sections.get("next transition")),
    facingIssuesText: extractSectionRawText(sections.get("facing issues")),
    projectFrameText: extractSectionRawText(sections.get("project frame")),
    settledDirectionText: extractSectionRawText(sections.get("settled direction")),
    projectMapText: formatProjectMapText(parsedMap),
    areaDetailsText: formatAreaDetailsText(areaDetails),
  });

  assert.ok(handoff.includes("[PROJECT]\n스마트 병원 임상 및 데이터 통합 시스템"));
  assert.ok(handoff.includes("외래 진료 전체 흐름의 실제 완결성 확보 및 전송 지연 시간 단축."));
  assert.ok(handoff.includes("진료 소견 작성"));
  assert.ok(handoff.includes("표준 용어 정규화"));
  assert.ok(handoff.includes("비표준 HL7 세그먼트 파싱 예외 처리 필요."));
  assert.ok(handoff.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
});

test("Problem Framer Execution Wave contract: admission freshness, scheduling boundaries, and 3-axis reconciliation discipline", () => {
  const focusContext = buildFocusHandoffContext({
    projectTitle: "Cockpit",
    focusText: "Problem Framer Scheduling Enforcement",
    situationText: "Repeated rematerialization churn investigation completed",
    nextTransitionText: "Scheduling enforcement contracts proven and active",
  });

  const areaContext = buildAreaHandoffContext({
    projectTitle: "Cockpit",
    areaTitle: "Execution Boundary",
    railTitle: "Core Engine",
    groupTitle: "Runtime",
    areaDescription: "Execution wave framing and handoff transport",
  });

  for (const context of [focusContext, areaContext]) {
    // A. Existing semantics preserved
    assert.ok(context.includes("A. NOW / INDEPENDENT:"));
    assert.ok(context.includes("B. SERIAL NOW:"));
    assert.ok(context.includes("C. WAIT FOR EVIDENCE:"));
    assert.ok(context.includes("Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다."));

    // B. Scheduling regression case 1:
    // 두 task 모두 target이 확정됐지만 shared semantic/proof/publication surface를 가짐 => SERIAL NOW
    assert.ok(context.includes("bounded target과 성공조건은 지금 확정 가능하지만, 동일 semantic owner / mutation surface / proof boundary / publication-sensitive surface를 공유하여 병렬 admission 시 한 후보의 publication이 다른 READY candidate를 불필요하게 stale화할 위험이 높은 작업."));
    assert.ok(context.includes("선행 task를 먼저 closure/publication boundary까지 진행한 뒤 다음 task를 fresh evidence에서 시작하도록 안내한다."));
    assert.ok(context.includes("READY candidate가 존재한다는 이유만으로 WAIT로 미루지 않는다."));

    // B. Scheduling regression case 2:
    // 선행 task 결과가 후속 target/necessity를 바꿈 => WAIT FOR EVIDENCE
    assert.ok(context.includes("선행 task 결과에 따라 필요 여부나 semantic target/success criterion이 달라지는 경우(선행 task 결과가 후속 target/necessity/ownership을 바꿀 때만 사용하며, READY candidate 존재만으로 WAIT 판정 금지)"));

    // B. Scheduling regression case 3 & 4:
    // 실제 mutation/evidence/publication boundary가 독립적 => NOW / INDEPENDENT
    // 단순 same-file disjoint semantic/proof boundary => 파일명만으로 무조건 WAIT/BLOCK하지 않음
    assert.ok(context.includes("mutation owner, semantic surface, proof boundary, publication interaction이 실질적으로 독립적일 때만 병렬 실행 가능."));
    assert.ok(context.includes("단순히 동일 파일이나 디렉토리를 참조한다는 이유만으로 직렬화하지 않으며, 실제 mutation/evidence/publication boundary가 독립적이면 병렬로 분류한다."));

    // B. Scheduling regression case 5:
    // mutation-intended handoff => fresh BASE admission 요구가 discoverable
    assert.ok(context.includes("12. [Admission & Publication Discipline — Executor Prompt Contract]:"));
    assert.ok(context.includes("execution 직전에 `origin/main`을 fresh fetch하고 실제 시작 BASE SHA를 기록한다."));
    assert.ok(context.includes("task-owned workspace(worktree/branch)가 그 fresh BASE에서 시작하는지 확인하며, stale worktree HEAD나 canonical checkout의 dirty state를 BASE로 상속하지 않는다."));
    assert.ok(context.includes("이미 만들어진 candidate의 BASE freshness check와, 아직 시작하지 않은 후속 task를 SERIAL NOW / WAIT FOR EVIDENCE로 framing하는 scheduling 판단을 서로 다른 단계로 명확히 구분한다."));

    // B. Scheduling regression case 6:
    // remote advance를 만난 already-built candidate => blind retry loop가 아니라 independent freshness axes reconciliation semantics가 discoverable
    assert.ok(context.includes("Publication은 short serialization boundary다."));
    assert.ok(context.includes("blind retry/rematerialization loop를 돌지 않고 freshness를 3개의 독립 축으로 판정한다: topology freshness / semantic freshness / proof freshness"));
    assert.ok(context.includes("Topology-only movement (SEMANTIC_OWNERS·PROOF_OWNERS unaffected): semantic result preserve, completed/reusable proof preserve, candidate/reference preserve."));
    assert.ok(context.includes("Semantic-owner movement"));
    assert.ok(context.includes("`READMIT`한다."));
    assert.ok(context.includes("Proof-owner-only movement"));
    assert.ok(!context.includes("Semantic overlap / Proof boundary movement"));
  }
});

test("Fresh-supersession gate: handoffs require fresh authority identity/containment and same-scope check", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Supersession Gate Project",
      focusText: "Current focus",
    }),
    buildAreaHandoffContext({
      projectTitle: "Supersession Gate Project",
      areaTitle: "Some area",
    }),
  ];

  for (const context of contexts) {
    assert.ok(context.includes("[Fresh-Supersession Gate"));
    assert.ok(context.includes("investigator's newly derived finding against fresh authority"));
    assert.ok(context.includes("only when read-only investigation is about to recommend a new mutation/repair"));
    assert.ok(context.includes("fetch fresh `origin/main`"));
    assert.ok(context.includes("explicitly record its SHA via `rev-parse`"));
    assert.ok(context.includes("identity/containment"));
    assert.ok(context.includes("investigation baseline/finding provenance"));
    assert.ok(context.includes("`rev-parse`"));
    assert.ok(context.includes("`merge-base --is-ancestor`"));
    assert.ok(context.includes("Topology movement alone never discards or retains a finding."));
    assert.ok(context.includes("semantic overlap"));
    assert.ok(context.includes("same/directly-related source hunk"));
    assert.ok(context.includes("same contract or behavior"));
    assert.ok(context.includes("same proof/test surface"));
    assert.ok(context.includes("superseded fix"));
  }
});

test("Fresh-supersession gate: root-cause-complete published fix closes finding without repair handoff", () => {
  const contexts = [
    formatFocusHandoffInstruction(),
    formatAreaHandoffInstruction(),
    buildFocusHandoffContext({ projectTitle: "Gate", focusText: "Focus" }),
    buildAreaHandoffContext({ projectTitle: "Gate", areaTitle: "Area" }),
  ];

  for (const context of contexts) {
    assert.ok(context.includes("already closes the defect's root cause completely with required proof"));
    assert.ok(context.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
    assert.ok(context.includes("do not create a mutation task to reimplement or re-verify the already-published fix"));
    assert.ok(context.includes("do not emit `NEXT_REPAIR` or a repair handoff"));
  }
});

test("Fresh-supersession gate: unrelated advance stays information; partial/revert/proof-gap never auto-close", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Supersession Distinction Project",
      focusText: "Current focus",
    }),
    buildAreaHandoffContext({
      projectTitle: "Supersession Distinction Project",
      areaTitle: "Some area",
    }),
  ];

  for (const context of contexts) {
    // Unrelated origin advance → finding remains retainable: information, not invalidation.
    assert.ok(context.includes("Unrelated upstream movement is information, not investigation invalidation."));
    // Same-scope root-cause-complete fix → CLOSED / SUPERSEDED_BY_PUBLISHED_FIX with no repair handoff.
    assert.ok(context.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
    assert.ok(context.includes("do not emit `NEXT_REPAIR` or a repair handoff"));
    // Partial / different-meaning / revert / proof-gap branch never auto-closes.
    assert.ok(context.includes("Partial fix, different-meaning fix, revert, or proof gap never auto-close;"));
    assert.ok(context.includes("apply the existing semantic/proof judgment."));
    // No new machinery.
    assert.ok(context.includes("No new state machine, registry, queue, daemon, task DB, or scheduler."));
  }
});

test("Fresh-supersession gate: ordering and separation from transmitted open claims", () => {
  const contexts = [
    buildFocusHandoffContext({
      projectTitle: "Gate Ordering Project",
      focusText: "Current focus",
    }),
    buildAreaHandoffContext({
      projectTitle: "Gate Ordering Project",
      areaTitle: "Some area",
    }),
  ];

  for (const context of contexts) {
    // Existing transmitted-claim contract is preserved.
    assert.ok(context.includes("[Open-Claim Re-admission]"));
    assert.ok(context.includes("[Fresh Evidence"));
    // Gate explicitly distinguishes itself from transmitted open claims.
    assert.ok(context.includes("not the transmitted-claim Open-Claim Re-admission above"));
    assert.ok(context.includes("investigator's newly derived finding against fresh authority"));

    const openClaimIdx = context.indexOf("[Open-Claim Re-admission]");
    const gateIdx = context.indexOf("[Fresh-Supersession Gate");
    const projectionIdx = context.indexOf("[Reader-Level Projection]");
    const framingIdx = context.indexOf("[Framing Objective]");
    assert.notEqual(openClaimIdx, -1);
    assert.notEqual(gateIdx, -1);
    assert.notEqual(projectionIdx, -1);
    assert.notEqual(framingIdx, -1);
    assert.ok(openClaimIdx < gateIdx, "gate must come after transmitted-claim re-admission");
    assert.ok(projectionIdx < gateIdx, "gate must come after reader-level projection");
    assert.ok(gateIdx < framingIdx, "gate must come before framing objective");
  }
});

test("Fresh-supersession gate: README authoring contract matches generated handoff semantics", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  assert.ok(readme.includes("Fresh-supersession gate"));
  assert.ok(readme.includes("mutation/repair recommendation을 emit하기 전에만"));
  assert.ok(readme.includes("fresh `origin/main`"));
  assert.ok(readme.includes("fresh SHA를 명시적으로 확보"));
  assert.ok(readme.includes("`rev-parse`"));
  assert.ok(readme.includes("`merge-base --is-ancestor`"));
  assert.ok(readme.includes("identity/containment"));
  assert.ok(readme.includes("topology movement 자체만으로 finding을 폐기하거나 유지하지 않는다"));
  assert.ok(readme.includes("semantic-overlap"));
  assert.ok(readme.includes("source hunk"));
  assert.ok(readme.includes("contract 또는 behavior"));
  assert.ok(readme.includes("proof/test surface"));
  assert.ok(readme.includes("superseded fix 여부"));
  assert.ok(readme.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
  assert.ok(readme.includes("`NEXT_REPAIR`"));
  assert.ok(readme.includes("repair handoff를 출력하지 않는다"));
  assert.ok(readme.includes("unrelated upstream movement는"));
  assert.ok(readme.includes("information이며 investigation invalidation 사유가 아니다"));
  assert.ok(readme.includes("부분 fix"));
  assert.ok(readme.includes("revert"));
  assert.ok(readme.includes("proof gap"));
  assert.ok(readme.includes("자동 CLOSED 처리하지 말고 기존 semantic/proof 판단을 적용"));
  assert.ok(readme.includes("새로운 state machine, registry, queue, daemon, task DB, scheduler를 만들지 않고"));
  assert.ok(readme.includes("transmitted open claim의 Fresh Evidence/Open-Claim Re-admission과 다르며"));
  assert.ok(readme.includes("investigator가 새로 도출한 finding과 fresh authority 사이의 판정이다"));
  assert.ok(readme.includes("모든 read-only 작업에 publication workflow를 강제하지 않는다"));

  // Generated handoffs carry the same meaning with the same Git authority vocabulary.
  for (const context of [formatFocusHandoffInstruction(), formatAreaHandoffInstruction()]) {
    assert.ok(context.includes("fetch fresh `origin/main`"));
    assert.ok(context.includes("`rev-parse`"));
    assert.ok(context.includes("`merge-base --is-ancestor`"));
    assert.ok(context.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
    assert.ok(context.includes("`NEXT_REPAIR`"));
  }
});

test("Fresh-supersession case replay: builtAt finding requires semantic root-cause closure, not topology alone", () => {
  // Baseline (stale): build stamp records nonsemantic `builtAt` wall-clock churn.
  // Fresh authority (c42b863): `builtAt` removed, fingerprint-only deterministic
  // payload with byte-identical rebuild and fingerprint propagation proof.
  // The gate must not emit DEFECT + NEXT_REPAIR on topology movement alone;
  // it closes only on same-scope root-cause-complete fix with required proof.
  const contexts = [
    formatFocusHandoffInstruction(),
    formatAreaHandoffInstruction(),
  ];

  for (const context of contexts) {
    assert.ok(
      context.includes("Topology movement alone never discards or retains a finding."),
      "topology movement alone must never decide SUPERSEDED"
    );
    assert.ok(
      context.includes("same/directly-related source hunk"),
      "same-scope hunk comparison is required (e.g. freshness stamp payload)"
    );
    assert.ok(
      context.includes("already closes the defect's root cause completely with required proof"),
      "root-cause-complete fix plus required proof is the only auto-close branch"
    );
    assert.ok(context.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
    assert.ok(context.includes("do not emit `NEXT_REPAIR` or a repair handoff"));
  }

  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  assert.ok(readme.includes("topology movement 자체만으로 finding을 폐기하거나 유지하지 않는다"));
  assert.ok(readme.includes("root cause를 이미 완결적으로 해결하고 필요한 proof까지 포함하면"));
  assert.ok(readme.includes("CLOSED / SUPERSEDED_BY_PUBLISHED_FIX"));
});
test("Handoff contract output remains pinned after authority-boundary wording", () => {
  // Exact output probes protect the extracted shared contract and facade.
  // Hashes pin the fresh BASE plus this intentional authority-boundary change;
  // any unrelated wording or extraction edit fails here.
  const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  const focusParams = {
    projectTitle: "Handoff Exact Probe",
    focusText: "Probe focus",
    situationText: "Probe situation",
    nextTransitionText: "Probe transition",
    facingIssuesText: "- probe issue",
    projectFrameText: "Probe frame",
    settledDirectionText: "- probe direction",
    projectMapText: "### Rail\n- **Item** — desc",
    areaDetailsText: "### Item\n#### 의미\nmeaning",
  };
  const areaParams = {
    projectTitle: "Handoff Exact Probe",
    areaTitle: "Probe Area",
    railTitle: "Probe Rail",
    groupTitle: "Probe Group",
    areaDescription: "Probe desc",
    areaDetail: {
      title: "Probe Area",
      normalizedKey: "probe area",
      subsections: [{ subheading: "의미", html: "<p>m</p>", rawText: "meaning text" }],
    },
    focusText: "Probe focus",
  };
  assert.equal(sha256(formatExecutionWaveContractLines().join("\n")), "56549841422cecbc6be8428ed455148317c415c7431b4566cc5bdf29413bd4f9");
  assert.equal(sha256(formatAdmissionPublicationContractLines().join("\n")), "6b6778e87c2f7a536f5cacd86a6f627e19b44f0493e32e990e064545b787f31f");
  assert.equal(sha256(formatFocusHandoffInstruction()), "68dd8a3ae3bf002294a3d3d8fb3073d2d96514bbd323c4d2f48d2546b2d06075");
  assert.equal(sha256(formatAreaHandoffInstruction()), "42a6d04b093f3f5f943e56bcb2f6d6a4e5741a2877e2ebdcbd82ab74efe8080d");
  assert.equal(sha256(buildFocusHandoffContext(focusParams)), "cd4023527e7d946dbb2965ace7f81d9a7a33cbea325118a9989e95ef85491ccf");
  assert.equal(sha256(buildAreaHandoffContext(areaParams)), "c40ae0af996d5bc85310a25292a4f039afb460020ee181bc10dc50ada15a016a");
});

