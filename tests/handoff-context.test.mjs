import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { splitSections, extractSectionRawText } from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
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
} from "../dist/handoff-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

/** Product-external vocabulary that must never re-enter Cockpit handoff. */
const FORBIDDEN_HANDOFF_VOCABULARY = [
  "ADMITTED_BASE",
  "PRE_FINAL_JIT",
  "POST_FINAL_JIT",
  "PUBLISHABLE",
  "SEMANTIC_READY",
  "WATCH_SURFACES",
  "DIRECT_PATHS",
  "SEMANTIC_OWNERS",
  "PROOF_OWNERS",
  "SECOND_ADVANCE_CIRCUIT_BREAKER",
  "TOPOLOGY_REBIND_ELIGIBLE",
  "READMIT",
  "Execution Wave",
  "NOW / INDEPENDENT",
  "SERIAL NOW",
  "WAIT FOR EVIDENCE",
  "REFRESH vs RECONSTRUCT",
  "Coverage Closure",
  "Fresh-Supersession Gate",
  "NEXT_REPAIR",
];

function sampleHandoffs() {
  return [
    buildFocusHandoffContext({
      projectTitle: "Probe Project",
      focusText: "Probe focus",
      situationText: "Probe situation",
      nextTransitionText: "Probe transition",
      facingIssuesText: "- probe issue",
      projectFrameText: "Probe frame",
      settledDirectionText: "- probe direction",
      projectMapText: "### Rail\n- **Item** — desc",
      areaDetailsText: "### Item\n#### 의미\nmeaning",
    }),
    buildAreaHandoffContext({
      projectTitle: "Probe Project",
      areaTitle: "Probe Area",
      railTitle: "Probe Rail",
      groupTitle: "Probe Group",
      areaDescription: "Probe desc",
      areaDetail: {
        title: "Probe Area",
        normalizedKey: "probe area",
        subsections: [{ subheading: "의미", rawText: "meaning text" }],
      },
      focusText: "Probe focus",
      situationText: "Probe situation",
      nextTransitionText: "Probe transition",
      facingIssuesText: "- probe issue",
      projectFrameText: "Probe frame",
      settledDirectionText: "- probe direction",
    }),
    formatFocusHandoffInstruction(),
    formatAreaHandoffInstruction(),
  ];
}

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

  assert.ok(context.includes("[PROJECT]\n스마트 진료 시스템"));
  assert.ok(context.includes("[CURRENT FOCUS]\n외래 진료 흐름 안정화 및 전송 지연 단축"));
  assert.ok(context.includes("[CURRENT SITUATION]\nHL7 수집 엔진 안정화 완료, 진료 소견 작성 화면 검증 진행 중"));
  assert.ok(context.includes("[NEXT TRANSITION]\n비동기 서명 처리 완료 및 검사 오더 연동 규격 확정"));
  assert.ok(context.includes("[FACING ISSUES]\n- 비표준 HL7 세그먼트 예외 처리"));
  assert.ok(context.includes("[PROJECT FRAME]\n차세대 스마트 병원 외래 워크플로우 통합"));
  assert.ok(context.includes("[SETTLED DIRECTION]\n- 마이크로서비스 연동 아키텍처 확정 (2026-08-01)"));
  assert.ok(context.includes("[PROJECT MAP]\n### 1차 레일\n- **환자 접수** — 접수 처리"));
  assert.ok(context.includes("[AREA CONTEXT]\n### 환자 접수\n#### 의미\n접수 관문"));

  assert.ok(context.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
  assert.ok(context.includes("Do not trust the handed-over PROGRESS claims as truth"));
  assert.ok(context.includes("NO_ACTION / NO_CHANGE"));
  assert.ok(context.includes("follow the repository's own current development / Git safety contract"));

  // Cockpit does NOT generate tasks or backlog items by itself
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
      { subheading: "의미", rawText: "실시간 센서 데이터 수집 관문." },
      { subheading: "현재 수준", rawText: "RS-485 및 Modbus 프로토콜 1차 연동 완료." },
      { subheading: "남은 문제", rawText: "- 통신 순단 시 재연결 버퍼 오버플로우 방지" },
      { subheading: "근거", rawText: "- `src/sensor/modbus.c`" },
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

  assert.ok(context.includes("[PROJECT]\n원격 모니터링 시스템"));
  assert.ok(context.includes("[SELECTED AREA]\n센서 계측 인터페이스 (1차 수집 레일 · 핵심 인터페이스)"));
  assert.ok(context.includes("[AREA SUMMARY]\n현장 센서 계측 및 패킷 파싱"));
  assert.ok(context.includes("[AREA DETAILS]"));
  assert.ok(context.includes("#### 의미\n실시간 센서 데이터 수집 관문."));
  assert.ok(context.includes("#### 현재 수준\nRS-485 및 Modbus 프로토콜 1차 연동 완료."));
  assert.ok(context.includes("#### 남은 문제\n- 통신 순단 시 재연결 버퍼 오버플로우 방지"));
  assert.ok(context.includes("#### 근거\n- `src/sensor/modbus.c`"));

  assert.ok(context.includes("[CURRENT FOCUS]\n센서 패킷 유실 방지 및 버퍼 안정화"));
  assert.ok(context.includes("[CURRENT SITUATION]\nModbus 드라이버 통합 완료, 재연결 부하 테스트 중"));
  assert.ok(context.includes("[NEXT TRANSITION]\n안전 버퍼 구현 및 24시간 스트레스 테스트 통과"));
  assert.ok(context.includes("[FACING ISSUES]\n- 버퍼 고갈 시 링버퍼 오버라이트 정책 확정 필요"));
  assert.ok(context.includes("[PROJECT FRAME]\n산업용 고신뢰성 원격 모니터링 및 제어 플랫폼"));
  assert.ok(context.includes("[SETTLED DIRECTION]\n- C99 기반 저지연 통신 모듈 유지"));

  assert.ok(context.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
  assert.ok(context.includes("review that area against fresh evidence"));
  assert.ok(context.includes("NO_ACTION / NO_CHANGE"));

  assert.ok(!context.includes("ChatGPT memory"));
  assert.ok(!context.includes("Custom Instructions"));
  assert.ok(!context.includes("Task A:"));
});

test("Area handoff transports supplied claims without deciding their truth", () => {
  const context = buildAreaHandoffContext({
    projectTitle: "Generic Record Service",
    areaTitle: "Record Submission",
    areaDetail: {
      title: "Record Submission",
      normalizedKey: "record submission",
      subsections: [
        { subheading: "Meaning", rawText: "Accepts a record submission." },
        { subheading: "Current Level", rawText: "Submission path is available." },
        { subheading: "Remaining Problems", rawText: "- repeated submission creates duplicate records" },
        { subheading: "Evidence", rawText: "- Current repository tests" },
      ],
    },
  });

  // Transport preserves the supplied claim for external re-check; it does not decide its truth.
  assert.ok(context.includes("#### Remaining Problems\n- repeated submission creates duplicate records"));
  // The guard tells the receiver to re-check, not to trust or to manufacture work.
  assert.ok(context.includes("Do not trust the handed-over PROGRESS claims as truth"));
  assert.ok(context.includes("Do not resurrect closed or obsolete claims as new tasks"));
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

test("Handoff owns project context only: product-external vocabulary never re-enters", () => {
  for (const handoff of sampleHandoffs()) {
    for (const term of FORBIDDEN_HANDOFF_VOCABULARY) {
      assert.equal(
        handoff.includes(term),
        false,
        `Cockpit handoff must not contain product-external vocabulary: ${term}`
      );
    }
  }
});

test("Handoff delegates execution mechanics to the repository contract", () => {
  for (const handoff of sampleHandoffs()) {
    assert.ok(
      handoff.includes("follow the repository's own current development / Git safety contract"),
      "handoff must delegate execution mechanics instead of duplicating them"
    );
    assert.ok(
      handoff.includes("This handoff defines no execution, scheduling, admission, publication, freshness, or topology semantics"),
      "handoff must state its non-ownership explicitly"
    );
    assert.ok(handoff.includes("transient context transport"));
  }
});

test("Handoff context assembly is deterministic", () => {
  const params = {
    projectTitle: "Determinism Probe",
    focusText: "Probe focus",
    situationText: "Probe situation",
    nextTransitionText: "Probe transition",
  };
  assert.equal(buildFocusHandoffContext(params), buildFocusHandoffContext({ ...params }));
  const areaParams = { projectTitle: "Determinism Probe", areaTitle: "Probe Area" };
  assert.equal(buildAreaHandoffContext(areaParams), buildAreaHandoffContext({ ...areaParams }));
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
    situationText: extractSectionRawText(sections.get("situation")),
    nextTransitionText: extractSectionRawText(sections.get("next")),
    facingIssuesText: extractSectionRawText(sections.get("facing")),
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
  for (const term of FORBIDDEN_HANDOFF_VOCABULARY) {
    assert.equal(handoff.includes(term), false, `fixture handoff must not contain: ${term}`);
  }
});

test("README handoff contract matches generated handoff semantics", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  assert.ok(readme.includes("전달받은 에이전트는 `PROGRESS.md` 내용을 사실로 단정하지 않고 최신 실제 증거와 대조하며"));
  assert.ok(readme.includes("실행·스케줄링·발행·Git 절차는 해당 repository 자체의 개발 계약을 따릅니다"));
  assert.ok(readme.includes("Cockpit handoff는 그 절차를 정의하지 않습니다"));
});
