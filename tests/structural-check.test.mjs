import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { normalizeTitle, isCurrentStageHeading } from "../dist/authoring-grammar.js";
import { splitSections } from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
  parseMentalModel,
  parseProjectHorizon,
  parseStageJourney,
} from "../dist/semantic-construction.js";
import {
  checkProgressStructure,
  formatStructuralCheckReport,
  getAreaCompleteness,
} from "../dist/structural-check.js";
import { renderNativeMap } from "../dist/inspector-projection.js";
import { buildAreaHandoffContext } from "../dist/handoff-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

test("Structural check: 7 map items / 2 details => FAIL and exact missing titles", () => {
  const partialDoc = `
# 복합 시스템 프로젝트

## 프로젝트 지도

### 1차 운영 레일
#### 핵심 제어 그룹
- **센서 계측 인터페이스** — 실시간 센서 데이터 수집
- **원격 제어 릴레이** — 액추에이터 원격 제어 인터페이스

### 2차 도입 궤적
#### 확보된 기반
- **환경 챔버 검증** — 통제 환경 내구성 확인

#### 현재 단계
- **현장 실증 가동** — 실제 현장 가동 및 패킷 손실률 확인

#### 향후 계획
- **운영 안전 경계** — 비상 정지 및 페일세이프 회로 구성
- **직접 회귀와 계약 정합화** — 회귀 테스트 스위트 확립
- **검증된 RELEASE와 첫 운영 회차** — 정식 릴리스 및 1차 운영

## 영역 상세

### 센서 계측 인터페이스
#### 의미
센서 데이터 수집.
#### 현재 수준
완료.
#### 남은 문제
- 없음
#### 근거
- 코드 확인

### 현장 실증 가동
#### 의미
현장 무중단 가동.
#### 현재 수준
진행 중.
#### 남은 문제
- 실증 중
#### 근거
- 런타임 로그
`;

  const result = checkProgressStructure(partialDoc);
  assert.equal(result.ok, false);
  assert.equal(result.totalMapItems, 7);
  assert.equal(result.matchedDetails, 2);
  assert.equal(result.missingDetails, 5);
  assert.deepEqual(result.missingTitles, [
    "원격 제어 릴레이",
    "환경 챔버 검증",
    "운영 안전 경계",
    "직접 회귀와 계약 정합화",
    "검증된 RELEASE와 첫 운영 회차",
  ]);
  assert.equal(result.orphanDetails, 0);
  assert.equal(result.currentStageCount, 1);

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: FAIL"));
  assert.ok(report.includes("Map items:       7"));
  assert.ok(report.includes("Area details:    2"));
  assert.ok(report.includes("Missing details: 5"));
  assert.ok(report.includes("- 운영 안전 경계"));
  assert.ok(report.includes("- 직접 회귀와 계약 정합화"));
  assert.ok(report.includes("- 검증된 RELEASE와 첫 운영 회차"));
});

test("Structural check: Complete document => PASS across all synthetic fixtures", () => {
  const fixtures = [
    "operational-system.md",
    "software-architecture.md",
    "research-project.md",
  ];

  for (const fixtureName of fixtures) {
    const fixturePath = path.join(__dirname, "fixtures", fixtureName);
    const content = fs.readFileSync(fixturePath, "utf-8");

    const result = checkProgressStructure(content);
    assert.equal(result.ok, true, `${fixtureName} should PASS structural check`);
    assert.ok(result.totalMapItems > 0);
    assert.equal(result.matchedDetails, result.totalMapItems);
    assert.equal(result.missingDetails, 0);
    assert.equal(result.orphanDetails, 0);
    assert.equal(result.duplicateDetails.length, 0);
    assert.equal(result.currentStageCount, 1);
    assert.equal(result.errors.length, 0);

    const report = formatStructuralCheckReport(result);
    assert.ok(report.includes("PROGRESS structural check: PASS"));
    assert.ok(report.includes(`Map items:       ${result.totalMapItems}`));
    assert.ok(report.includes(`Area details:    ${result.matchedDetails}`));
  }
});

test("Structural check: Title drift => missing + orphan detection", () => {
  const driftDoc = `
# 시스템

## 프로젝트 지도
### 코어 레일
#### 기반
- **운영 안전 경계** — 비상 정지 회로 구성

## 영역 상세
### 운영 안전 경계 및 검증
#### 의미
비상 정지 및 검증.
#### 현재 수준
수립 완료.
#### 남은 문제
- 없음
#### 근거
- 테스트 통과
`;

  const result = checkProgressStructure(driftDoc);
  assert.equal(result.ok, false);
  assert.equal(result.totalMapItems, 1);
  assert.equal(result.matchedDetails, 0);
  assert.equal(result.missingDetails, 1);
  assert.deepEqual(result.missingTitles, ["운영 안전 경계"]);
  assert.equal(result.orphanDetails, 1);
  assert.deepEqual(result.orphanTitles, ["운영 안전 경계 및 검증"]);

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: FAIL"));
  assert.ok(report.includes("Missing:"));
  assert.ok(report.includes("- 운영 안전 경계"));
  assert.ok(report.includes("Orphan details (no matching map item):"));
  assert.ok(report.includes("- 운영 안전 경계 및 검증"));
});

test("Structural check: Multi-rail independent Current Stages across different rails => PASS", () => {
  const multiCurrentDoc = `
# 다중 궤적 레일 정상 문서

## 현재 집중
외래 진료 전체 흐름의 실제 완결성 확보 및 전송 지연 시간 단축.

## 프로젝트 지도
### 1차 임상 진료 레일
#### 확보된 기반
- **환자 접수** — 접수 대기열 관리

#### 현재 단계
- **진료 소견 작성** — 임상 기록 및 처방 입력

#### 향후 계획
- **검사 오더 연동** — 검사실 인터페이스 연동

### 2차 데이터 파이프라인 궤적
#### 확보된 기반
- **메시지 큐 수집** — 실시간 HL7/FHIR 수집

#### 현재 단계
- **정규화 엔진** — 표준 용어 매핑

#### 향후 여정
- **실시간 서빙 레이어** — 임상 대시보드 서빙

## 영역 상세
### 환자 접수
#### 의미
외래 접수.
#### 현재 수준
완료.
#### 남은 문제
- 없음
#### 근거
- 접수 모듈 코드

### 진료 소견 작성
#### 의미
임상 기록 작성.
#### 현재 수준
진행 중.
#### 남은 문제
- 서명 지연
#### 근거
- 진료 기록 단위 테스트

### 검사 오더 연동
#### 의미
검사실 데이터 연동.
#### 현재 수준
설계 중.
#### 남은 문제
- 인터페이스 규격 확정 필요
#### 근거
- 연동 문서

### 메시지 큐 수집
#### 의미
실시간 데이터 수집.
#### 현재 수준
완료.
#### 남은 문제
- 없음
#### 근거
- 큐 성능 벤치마크

### 정규화 엔진
#### 의미
표준 용어 매핑 및 데이터 정제.
#### 현재 수준
진행 중.
#### 남은 문제
- 특수 약어 처리
#### 근거
- 정규화 테스트 슈트

### 실시간 서빙 레이어
#### 의미
임상 데이터 실시간 서빙.
#### 현재 수준
대기 중.
#### 남은 문제
- 캐시 정책 수립
#### 근거
- 서빙 아키텍처 초안
`;

  const tokens = md.parse(multiCurrentDoc, {});
  const { sections } = splitSections(tokens);
  assert.ok(sections.get("current focus"), "Current Focus section must be extracted");

  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.rails.length, 2);
  assert.equal(parsedMap.rails[0].railType, "trajectory");
  assert.equal(parsedMap.rails[1].railType, "trajectory");

  const result = checkProgressStructure(multiCurrentDoc);
  assert.equal(result.ok, true, "Multi-rail with independent Current Stages must PASS check");
  assert.equal(result.currentStageCount, 2);
  assert.equal(result.currentFocusCount, 1);
  assert.equal(result.totalMapItems, 6);
  assert.equal(result.matchedDetails, 6);
  assert.equal(result.missingDetails, 0);
  assert.equal(result.orphanDetails, 0);

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: PASS"));
  assert.ok(report.includes("Current stage:   2"));
  assert.ok(report.includes("Current focus:   1"));
});

test("Structural check: Duplicate Current Stage in the SAME rail => FAIL", () => {
  const sameRailMultiCurrentDoc = `
# 단일 레일 내 다중 현재 단계 오류 문서

## 프로젝트 지도
### 코어 궤적 레일
#### 현재 단계
- **항목 A** — 1차 현재 단계

#### 현재 단계
- **항목 B** — 2차 중복 현재 단계

## 영역 상세
### 항목 A
#### 의미
의미 A
#### 현재 수준
수준 A
#### 남은 문제
- 없음
#### 근거
- 근거 A

### 항목 B
#### 의미
의미 B
#### 현재 수준
수준 B
#### 남은 문제
- 없음
#### 근거
- 근거 B
`;

  const result = checkProgressStructure(sameRailMultiCurrentDoc);
  assert.equal(result.ok, false);
  assert.equal(result.currentStageCount, 2);
  assert.ok(
    result.errors.some((e) =>
      e.includes("Multiple '현재 단계' (Current Stage) groups found in rail '코어 궤적 레일' (2)")
    )
  );

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: FAIL"));
  assert.ok(report.includes("Current stage:   2"));
  assert.ok(report.includes("Multiple '현재 단계' (Current Stage) groups found in rail '코어 궤적 레일' (2)"));
});

test("Structural check: Multiple '## 현재 집중' (Current Focus) sections => FAIL", () => {
  const multiFocusDoc = `
# 다중 현재 집중 오류 문서

## 현재 집중
첫 번째 집중 영역.

## Current Focus
두 번째 중복 집중 영역.

## 프로젝트 지도
### 코어 레일
#### 현재 단계
- **항목 A** — 현재 항목

## 영역 상세
### 항목 A
#### 의미
의미 A
#### 현재 수준
수준 A
#### 남은 문제
- 없음
#### 근거
- 근거 A
`;

  const result = checkProgressStructure(multiFocusDoc);
  assert.equal(result.ok, false);
  assert.equal(result.currentFocusCount, 2);
  assert.ok(
    result.errors.some((e) =>
      e.includes("Multiple '현재 집중' (Current Focus) sections found (2)")
    )
  );

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: FAIL"));
  assert.ok(report.includes("Multiple '현재 집중' (Current Focus) sections found (2)"));
});

test("Structural check & parsing: Document without Current Focus => PASS, no fake focus generated", () => {
  const noFocusDoc = `
# Focus 없는 일반 문서

## 프로젝트 지도
### 코어 레일
#### 현재 단계
- **항목 A** — 현재 항목

## 영역 상세
### 항목 A
#### 의미
의미 A
#### 현재 수준
수준 A
#### 남은 문제
- 없음
#### 근거
- 근거 A
`;

  const tokens = md.parse(noFocusDoc, {});
  const { sections } = splitSections(tokens);
  assert.equal(sections.get("current focus"), undefined, "No fake current focus section should exist");

  const result = checkProgressStructure(noFocusDoc);
  assert.equal(result.ok, true);
  assert.equal(result.currentFocusCount, 0);
  assert.equal(result.currentStageCount, 1);
});

test("Structural check: Duplicate Area Detail title in ## 영역 상세 => FAIL", () => {
  const duplicateDetailDoc = `
# 중복 상세 문서

## 프로젝트 지도
### 코어 레일
#### 그룹
- **환자 등록** — 환자 정보 입력

## 영역 상세
### 환자 등록
#### 의미
1차 정의
#### 현재 수준
수준 1
#### 남은 문제
- 없음
#### 근거
- 근거 1

### 환자 등록
#### 의미
2차 중복 정의
#### 현재 수준
수준 2
#### 남은 문제
- 없음
#### 근거
- 근거 2
`;

  const result = checkProgressStructure(duplicateDetailDoc);
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateDetails, ["환자 등록"]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("Duplicate Area Detail title(s) found: 환자 등록")
    )
  );

  const report = formatStructuralCheckReport(result);
  assert.ok(report.includes("PROGRESS structural check: FAIL"));
  assert.ok(report.includes("Duplicate Area Detail titles:"));
  assert.ok(report.includes("- 환자 등록"));
});

test("Structural check: Missing required top-level surfaces => FAIL", () => {
  // Missing Area Details
  const noDetailsDoc = `
# 지도만 있는 문서

## 프로젝트 지도
### 코어 레일
#### 그룹
- **항목 1** — 설명 1
`;
  const resNoDetails = checkProgressStructure(noDetailsDoc);
  assert.equal(resNoDetails.ok, false);
  assert.equal(resNoDetails.hasAreaDetails, false);
  assert.ok(
    resNoDetails.errors.some((e) =>
      e.includes("Missing required '## 영역 상세'")
    )
  );

  // Missing Project Map
  const noMapDoc = `
# 상세만 있는 문서

## 영역 상세
### 항목 1
#### 의미
의미
#### 현재 수준
수준
#### 남은 문제
- 없음
#### 근거
- 근거
`;
  const resNoMap = checkProgressStructure(noMapDoc);
  assert.equal(resNoMap.ok, false);
  assert.equal(resNoMap.hasProjectMap, false);
  assert.ok(
    resNoMap.errors.some((e) =>
      e.includes("Missing required '## 프로젝트 지도'")
    )
  );
});

test("Structural check: Complete document with ordered map list => PASS", () => {
  const completeOrderedDoc = `
# 순차 파이프라인 프로젝트

## 프로젝트 지도

### 데이터 수집 및 처리
#### 데이터 인제스천
1. **센서 데이터 수신** — MQTT 실시간 수신
2. **데이터 유효성 검증** — 스키마 검증

#### 현재 단계
1. **파티셔닝 엔진** — 시계열 파티셔닝

#### 향후 여정
1. **대용량 집계 파이프라인** — 분산 롤업
2. **실시간 이상 감지** — 스트림 이상치 감지

## 영역 상세

### 센서 데이터 수신
#### 의미
수신
#### 현재 수준
완료
#### 남은 문제
- 없음
#### 근거
- 코드 및 테스트

### 데이터 유효성 검증
#### 의미
검증
#### 현재 수준
완료
#### 남은 문제
- 없음
#### 근거
- 코드 및 테스트

### 파티셔닝 엔진
#### 의미
엔진
#### 현재 수준
진행중
#### 남은 문제
- 성능 튜닝
#### 근거
- 벤치마크

### 대용량 집계 파이프라인
#### 의미
집계
#### 현재 수준
설계중
#### 남은 문제
- 클러스터 구성
#### 근거
- 아키텍처 문서

### 실시간 이상 감지
#### 의미
감지
#### 현재 수준
대기
#### 남은 문제
- 모델 선정
#### 근거
- 요구사항 정의서

## 현재 상황
최근 파티셔닝 엔진 프로토타입 구현이 완료되어 벤치마크 테스트를 진행하고 있습니다.

## 다음 전환
파티셔닝 엔진 벤치마크 통과 후 대용량 집계 파이프라인 구현 착수.

## 직면한 문제
- 10만 RPS 부하 시 메모리 스파이크 현상 분석 중.
`;

  const result = checkProgressStructure(completeOrderedDoc);
  assert.equal(result.ok, true);
  assert.equal(result.totalMapItems, 5);
  assert.equal(result.matchedDetails, 5);
  assert.equal(result.missingDetails, 0);
  assert.equal(result.orphanDetails, 0);
  assert.equal(result.currentStageCount, 1);
});

test("Current Stage Canonical Semantics: Multi-frontier items under single Current Stage group => PASS and render each as current", () => {
  const doc = `
# 분산 시스템 롤아웃

## 프로젝트 지도

### 롤아웃 궤적 레일
#### 확보된 기반
- **기초 인프라** — 코어 클러스터 배포

#### 현재 단계
- **노드 자동 복구** — 장애 노드 자동 탐지 및 자가 치유
- **트래픽 미러링** — 실제 사용자 트래픽 10% 미러링 검증

#### 향후 여정
1. **전체 트래픽 전환** — 100% 라이브 트래픽 라우팅

## 영역 상세

### 기초 인프라
#### 의미
코어 클러스터 인프라.
#### 현재 수준
완료.
#### 남은 문제
- 없음
#### 근거
- \`infra/k8s\`

### 노드 자동 복구
#### 의미
노드 비정상 상태 시 자동 복구.
#### 현재 수준
개발 및 검증 완료.
#### 남은 문제
- 엣지 케이스 타임아웃 튜닝
#### 근거
- \`recovery.test.mjs\`

### 트래픽 미러링
#### 의미
라이브 트래픽 안전 검증.
#### 현재 수준
10% 미러링 정상 수신 중.
#### 남은 문제
- 메트릭 집계 지연
#### 근거
- \`mirror.go\`

### 전체 트래픽 전환
#### 의미
전체 트래픽 서빙.
#### 현재 수준
준비 중.
#### 남은 문제
- 승인 필요
#### 근거
- \`docs/rollout.md\`
`;

  // 1. Structural check must PASS
  const result = checkProgressStructure(doc);
  assert.equal(result.ok, true, `Multi-frontier current stage must PASS structural check: ${result.errors.join("; ")}`);
  assert.equal(result.totalMapItems, 4);
  assert.equal(result.matchedDetails, 4);
  assert.equal(result.currentStageCount, 1, "Single Current Stage group in the rail");

  // 2. Map parsing
  const tokens = md.parse(doc, {});
  const { sections } = splitSections(tokens);
  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.rails.length, 1);
  assert.equal(parsedMap.hasCurrentStage, true);

  const currentGroup = parsedMap.rails[0].groups.find((g) => isCurrentStageHeading(g.title));
  assert.ok(currentGroup, "Current Stage group must exist");
  assert.equal(currentGroup.items.length, 2, "Must have 2 current frontier items");
  assert.equal(currentGroup.items[0].title, "노드 자동 복구");
  assert.equal(currentGroup.items[0].isCurrentStage, true);
  assert.equal(currentGroup.items[1].title, "트래픽 미러링");
  assert.equal(currentGroup.items[1].isCurrentStage, true);

  // 3. Native Map Rendering: both items rendered as .card-current-stage
  const html = renderNativeMap(parsedMap);
  assert.ok(html.includes('aria-label="현재 단계: 노드 자동 복구 영역 검사"'));
  assert.ok(html.includes('aria-label="현재 단계: 트래픽 미러링 영역 검사"'));
  assert.ok(html.includes("노드 자동 복구"));
  assert.ok(html.includes("트래픽 미러링"));

  const currentCardMatches = html.match(/class="map-card card-current-stage/g);
  assert.equal(currentCardMatches?.length, 2, "Both current frontier items must render as current stage cards");
});

test("Current Stage Canonical Semantics: Multi-rail independent Current Stages + neutral rail coexistence", () => {
  const multiRailDoc = `
# 멀티 레일 복합 시스템

## 프로젝트 지도

### 데이터 수집 궤적
#### 확보된 기반
- **배치 수집** — 야간 배치 ETL
#### 현재 단계
- **실시간 스트림** — Kafka 기반 실시간 수집

### 서빙 및 추론 궤적
#### 확보된 기반
- **정적 모델 배포** — v1 모델 서빙
#### 현재 단계
- **온라인 A/B 테스트** — 다중 모델 트래픽 분기
- **실시간 피드백 루프** — 예측 결과 감사
#### 향후 계획
1. **완전 자율 갱신** — 온라인 학습 파이프라인

### 시스템 인프라
#### 클러스터 관리
- **노드 프로비저닝** — 자동 스케일아웃
`;

  const tokens = md.parse(multiRailDoc, {});
  const { sections } = splitSections(tokens);
  const parsedMap = parseProjectMap(sections.get("project map"));

  assert.equal(parsedMap.rails.length, 3);
  assert.equal(parsedMap.rails[0].title, "데이터 수집 궤적");
  assert.equal(parsedMap.rails[0].railType, "trajectory");
  assert.equal(parsedMap.rails[1].title, "서빙 및 추론 궤적");
  assert.equal(parsedMap.rails[1].railType, "trajectory");
  assert.equal(parsedMap.rails[2].title, "시스템 인프라");
  assert.equal(parsedMap.rails[2].railType, "neutral");

  // Rail 1 has 1 current item, Rail 2 has 2 current items
  const r1Current = parsedMap.rails[0].groups.find((g) => isCurrentStageHeading(g.title));
  assert.equal(r1Current?.items.length, 1);
  assert.equal(r1Current?.items[0].title, "실시간 스트림");

  const r2Current = parsedMap.rails[1].groups.find((g) => isCurrentStageHeading(g.title));
  assert.equal(r2Current?.items.length, 2);
  assert.equal(r2Current?.items[0].title, "온라인 A/B 테스트");
  assert.equal(r2Current?.items[1].title, "실시간 피드백 루프");

  // Neutral rail has no current group
  const r3Current = parsedMap.rails[2].groups.find((g) => isCurrentStageHeading(g.title));
  assert.equal(r3Current, undefined);

  assert.equal(parsedMap.hasCurrentStage, true);
});

test("Area Detail Evidence Admission: Area with Meaning + Current Level + Evidence and NO Remaining Problems is structurally valid and renders cleanly", () => {
  const doc = `# 무장애 증거 수용 시스템

## 프로젝트 지도

### 1차 데이터 파이프라인
#### 확보된 기반
- **배치 수집 엔진** — 안정화된 일괄 수집 모듈

#### 현재 단계
- **스트림 처리기** — 실시간 데이터 변환 및 전송

## 영역 상세

### 배치 수집 엔진
#### 의미
과거 데이터의 일괄 수집 및 데이터베이스 인제스천을 담당하는 모듈입니다.
#### 현재 수준
일일 500만 건 배치 처리가 결함 없이 완료되었으며 안정화 운영 단계입니다.
#### 근거
- 야간 배치 실행 로그 및 SLA 100% 달성 기록

### 스트림 처리기
#### 의미
실시간 이벤트 스트림의 윈도우 집계 및 필터링 엔진입니다.
#### 현재 수준
초당 10만 건 스트림 처리 테스트 진행 중입니다.
#### 남은 문제
- 파티션 리밸런싱 중 일시적 메시지 지연
#### 다시 열리는 조건
- 카프카 클러스터 버전 업그레이드 시 커넥터 재검증
#### 근거
- 벤치마크 테스트 리포트 STREAM-2026-08
`;

  const tokens = md.parse(doc, {});
  const { title, sections } = splitSections(tokens);

  // 1. Structural check passes with zero missing/orphan/errors
  const validation = checkProgressStructure(tokens);
  assert.equal(validation.ok, true, "Document with optional remaining problems must pass structural check");
  assert.equal(validation.totalMapItems, 2);
  assert.equal(validation.matchedDetails, 2);
  assert.equal(validation.missingDetails, 0);
  assert.equal(validation.orphanDetails, 0);

  // 2. Parse details
  const areaDetails = parseAreaDetails(sections.get("area details"));
  assert.equal(areaDetails.size, 2);

  // 3. Inspect Area 1 (No remaining problems, meaning + current level + evidence only)
  const area1 = areaDetails.get(normalizeTitle("배치 수집 엔진"));
  assert.ok(area1, "배치 수집 엔진 detail exists");
  assert.equal(area1.subsections.length, 3, "Area 1 must have exactly 3 subsections");
  const subheadings1 = area1.subsections.map((s) => s.subheading.trim());
  assert.deepEqual(subheadings1, ["의미", "현재 수준", "근거"]);
  assert.equal(subheadings1.some((h) => h.includes("남은 문제")), false, "Must not contain '남은 문제'");

  // 4. Inspect Area 2 (With remaining problems + reopen conditions)
  const area2 = areaDetails.get(normalizeTitle("스트림 처리기"));
  assert.ok(area2, "스트림 처리기 detail exists");
  assert.equal(area2.subsections.length, 5, "Area 2 must have 5 subsections");
  const subheadings2 = area2.subsections.map((s) => s.subheading.trim());
  assert.deepEqual(subheadings2, ["의미", "현재 수준", "남은 문제", "다시 열리는 조건", "근거"]);

  // 5. Handoff context formatting for Area 1 omits Remaining Problems cleanly
  const handoffArea1 = buildAreaHandoffContext({
    projectTitle: title,
    areaTitle: "배치 수집 엔진",
    areaDescription: "안정화된 일괄 수집 모듈",
    areaDetail: area1,
  });
  assert.ok(handoffArea1.includes("#### 의미\n과거 데이터의 일괄 수집"));
  assert.ok(handoffArea1.includes("#### 현재 수준\n일일 500만 건"));
  assert.ok(handoffArea1.includes("#### 근거\n- 야간 배치"));
  assert.equal(
    handoffArea1.includes("#### 남은 문제\n"),
    false,
    "Handoff for Area 1 must not manufacture an Area Details '남은 문제' subsection"
  );
  assert.equal(handoffArea1.includes("없음"), false, "Handoff must not contain filler '없음'");

  // 6. Handoff context formatting for Area 2 includes Remaining Problems and Reopen Conditions
  const handoffArea2 = buildAreaHandoffContext({
    projectTitle: title,
    areaTitle: "스트림 처리기",
    areaDescription: "실시간 데이터 변환 및 전송",
    areaDetail: area2,
  });
  assert.ok(handoffArea2.includes("#### 남은 문제\n- 파티션 리밸런싱"));
  assert.ok(handoffArea2.includes("#### 다시 열리는 조건\n- 카프카 클러스터"));
});

function readFixtureModel(filename) {
  const source = fs.readFileSync(path.join(__dirname, "fixtures", filename), "utf-8");
  const tokens = md.parse(source, {});
  const { sections } = splitSections(tokens);
  return { source, sections, model: parseMentalModel(sections) };
}

test("Canonical semantic guardrails reject invalid posture, frontier, movement, relation, and Horizon telemetry", () => {
  const invalid = `
# Invalid model

## Project Horizon
Current model was reconstructed at 0123456789abcdef0123456789abcdef01234567 by PID 123 from /Users/example/src/main.ts.

## Stage Journey
### Current — Stage 1
- **CLOSED — Gate**
### Next — Stage 2
NOT OPEN

## Project Posture
### Core Capability — BLOCKED
Role: CORE CAPABILITY
bad state
### Axis 2 — STRONG
fine
### Axis 3 — PARTIAL
fine
### Axis 4 — WEAK
fine

## Current Frontier
### One
현재: A
목표: B
### Two
현재: B
목표: C
관련 영역: Missing Area

## Recent Material Movement
### Activity only
변경: a refactor happened
`;

  const result = checkProgressStructure(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.guardrailErrors.some((error) => /full Git SHA/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /explicit PID/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /absolute implementation path/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /5–8 axes/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /encodes BLOCKED as maturity/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /Multiple Primary Frontiers/.test(error)));
  assert.ok(result.guardrailErrors.some((error) => /Material movement/.test(error)));
  assert.ok(result.unresolvedRelations.some((error) => /Missing Area/.test(error)));
});

test("Explicit CO-PRIMARY is the only valid multi-primary frontier exception", () => {
  const doc = `
# Co-primary
## Current Frontier
### [CO-PRIMARY] Release boundary
현재: A
목표: B
### [CO-PRIMARY] Reader boundary
현재: C
목표: D
`;
  const result = checkProgressStructure(doc);
  assert.equal(result.primaryFrontierCount, 2);
  assert.equal(result.coPrimaryFrontierCount, 2);
  assert.equal(result.guardrailErrors.some((error) => /Multiple Primary Frontiers/.test(error)), false);
});

test("Authoring discoverability: canonical minimal example stays PASS and covers the documented grammar", () => {
  const { source, model } = readFixtureModel("canonical-minimal.md");
  const result = checkProgressStructure(source);
  assert.equal(result.ok, true, result.errors.join("; "));

  // Map ↔ Area Detail integrity (documented exact-title rule).
  assert.equal(result.totalMapItems, 5);
  assert.equal(result.matchedDetails, 5);
  assert.equal(result.currentStageCount, 1);

  // Documented slots are all recognizable without parser-source archaeology.
  assert.equal(result.hasProjectHorizon, true);
  assert.equal(result.hasStageJourney, true);
  assert.equal(model.stageJourney?.currentStage, "Stage 0.1: 당일 운영 RC");
  assert.equal(model.stageJourney?.nextStage, "Stage 0.2: 예약 운영");
  assert.deepEqual(
    model.stageJourney?.currentGates.map((gate) => gate.state),
    ["CLOSED", "IN PROOF"]
  );
  assert.equal(model.stageJourney?.nextGates[0]?.state, "NOT OPEN");
  assert.ok((model.stageJourney?.nextGates[0]?.entryCondition ?? "").length > 0);

  // Posture: documented 5–8 axes, four-state vocabulary, both roles.
  assert.equal(result.postureAxisCount, 5);
  assert.equal(result.postureCoreCapabilityCount, 1);
  assert.equal(result.postureDeliveryReadinessCount, 1);
  for (const axis of model.posture?.axes ?? []) {
    assert.ok(["STRONG", "PARTIAL", "WEAK", "UNKNOWN"].includes(axis.state ?? ""));
  }

  // Frontier: one primary with a current → target transition.
  assert.equal(result.primaryFrontierCount, 1);
  assert.equal(model.frontiers[0]?.currentState, "NOT PROVEN");
  assert.equal(model.frontiers[0]?.targetState, "PROVEN");

  // Movement: every entry carries a before → after transition.
  assert.ok(model.movements.length >= 1);
  for (const movement of model.movements) {
    assert.equal(movement.hasStateTransition, true);
  }

  // Relations and guardrails: documented example introduces no FAIL.
  assert.equal(result.unresolvedRelations.length, 0);
  assert.equal(result.guardrailErrors.length, 0);
});

test("Stage proof disposition: FAILED + decisionReason continuation parses without phantom gates", () => {
  const markdown = `
# Proof Disposition Probe

## 단계 여정

### 현재 — Stage X
- NOT PROVEN — Browser Golden Path first clean PASS

  판정 이유: 과거 clean PASS 주장은 확인되지만 현재 reconstruction에서 재입증할 durable evidence pointer를 찾지 못했다.

  - nested note must not become a gate
  - second nested note must not become a gate

- FAILED — Exact release backend proof

  판정 이유: canonical verifier가 terminal FAIL에 도달했고 durable failure 기록이 존재한다.

- BLOCKED — Production provider proof

  판정 이유: 실행에 필요한 provider authority가 확보되지 않아 proof 자체를 시작할 수 없다.

- NOT PROVEN — Legacy gate without reason
`;
  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const journey = parseStageJourney(sections.get("stage journey"));
  assert.ok(journey);
  assert.equal(journey.currentGates.length, 4);
  assert.deepEqual(
    journey.currentGates.map((gate) => gate.state),
    ["NOT PROVEN", "FAILED", "BLOCKED", "NOT PROVEN"]
  );
  assert.deepEqual(
    journey.currentGates.map((gate) => gate.title),
    [
      "Browser Golden Path first clean PASS",
      "Exact release backend proof",
      "Production provider proof",
      "Legacy gate without reason",
    ]
  );
  // Reason is extracted to its own field, never mixed into title/state.
  assert.ok(journey.currentGates[0].decisionReason?.includes("durable evidence pointer"));
  assert.ok(journey.currentGates[1].decisionReason?.includes("terminal FAIL"));
  assert.ok(journey.currentGates[2].decisionReason?.includes("provider authority"));
  assert.equal(journey.currentGates[3].decisionReason, undefined);
  for (const gate of journey.currentGates) {
    assert.ok(!gate.title.includes("판정 이유"));
    assert.ok(!gate.title.includes("Decision reason"));
    assert.ok(!gate.state.includes("판정"));
  }
  // The old duplicate "Title — STATE" summary is gone; reason owns the third line.
  for (const gate of journey.currentGates) {
    assert.equal(gate.summaryText, "");
  }
  // Continuation paragraphs and nested items never become phantom gates.
  assert.ok(!journey.currentGates.some((gate) => gate.title.includes("nested note")));
});

test("Stage proof disposition: existing gates parse unchanged, legacy NOT PROVEN stays valid", () => {
  const { model } = readFixtureModel("canonical-minimal.md");
  assert.deepEqual(
    model.stageJourney?.currentGates.map((gate) => gate.state),
    ["CLOSED", "IN PROOF"]
  );
  for (const gate of model.stageJourney?.currentGates ?? []) {
    assert.equal(gate.decisionReason, undefined);
    assert.equal(gate.summaryText, "");
  }
  assert.equal(model.stageJourney?.nextGates[0]?.state, "NOT OPEN");
  assert.ok((model.stageJourney?.nextGates[0]?.entryCondition ?? "").length > 0);
});

test("Stage proof disposition: FAILED is canonical, fixture PASS, unknown state still guarded", () => {
  const fixturePath = path.join(__dirname, "fixtures", "stage-gate-proof-disposition.md");
  const content = fs.readFileSync(fixturePath, "utf-8");
  const result = checkProgressStructure(content);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(
    parseStageJourney(splitSections(md.parse(content, {})).sections.get("stage journey"))?.currentGates.map((gate) => gate.state),
    ["NOT PROVEN", "FAILED", "BLOCKED"]
  );

  const bogus = `
# Bogus state probe

## 단계 여정

### 현재 — Stage X
- BOGUS — Made-up state gate

### 다음 — Stage Y
NOT OPEN
`;
  const bogusResult = checkProgressStructure(bogus);
  assert.equal(bogusResult.ok, false);
  assert.ok(
    bogusResult.guardrailErrors.some((error) => /missing a declared state/.test(error)),
    "unknown/malformed states must still fail the declared-state guardrail"
  );
});

