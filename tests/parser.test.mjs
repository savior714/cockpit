import test from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import {
  normalizeKey,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
  parseProjectMap,
  splitSections,
  renderNativeMap,
} from "../src/parser.ts";

const md = new MarkdownIt({ html: true, linkify: true });

test("Exact canonical current stage heading matching", () => {
  // Exact Korean and English compatibility matches
  assert.equal(isCurrentStageHeading("현재 단계"), true);
  assert.equal(isCurrentStageHeading("현재단계"), true);
  assert.equal(isCurrentStageHeading("  현재 단계  "), true);
  assert.equal(isCurrentStageHeading("Current Stage"), true);
  assert.equal(isCurrentStageHeading("current stage"), true);
  assert.equal(isCurrentStageHeading("CURRENT STAGE"), true);

  // Rejections - Regression test cases that must NOT match current stage
  assert.equal(isCurrentStageHeading("현재 문제"), false);
  assert.equal(isCurrentStageHeading("현재 가설"), false);
  assert.equal(isCurrentStageHeading("현재 확보된 기반"), false);
  assert.equal(isCurrentStageHeading("현재"), false);
  assert.equal(isCurrentStageHeading("now"), false);
  assert.equal(isCurrentStageHeading("현재 진척"), false);
  assert.equal(isCurrentStageHeading("현재 과제"), false);
  assert.equal(isCurrentStageHeading("현재 상황"), false);
  assert.equal(isCurrentStageHeading("기반"), false);
});

test("Explicit foundation and future heading aliases", () => {
  // Foundation aliases
  assert.equal(isFoundationHeading("확보된 기반"), true);
  assert.equal(isFoundationHeading("기반"), true);
  assert.equal(isFoundationHeading("Secured Foundation"), true);
  assert.equal(isFoundationHeading("Foundation"), true);

  // False foundation matches (broad substring rejection)
  assert.equal(isFoundationHeading("현재 확보된 기반"), false);
  assert.equal(isFoundationHeading("기반 기술 조사"), false);
  assert.equal(isFoundationHeading("완료된 작업"), false);

  // Future aliases
  assert.equal(isFutureHeading("앞으로의 도입 경로"), true);
  assert.equal(isFutureHeading("앞으로의 경로"), true);
  assert.equal(isFutureHeading("향후 여정"), true);
  assert.equal(isFutureHeading("향후 계획"), true);
  assert.equal(isFutureHeading("Future Trajectory"), true);
  assert.equal(isFutureHeading("Roadmap"), true);
  assert.equal(isFutureHeading("Next Steps"), true);

  // False future matches (broad substring rejection)
  assert.equal(isFutureHeading("다음 문제"), false);
  assert.equal(isFutureHeading("경로 탐색"), false);
});

test("Fixture 1: NextChart EMR PROGRESS.md parsing", () => {
  const markdown = `
# NextChart EMR

## 프로젝트 지도

### 한 환자의 외래 진료

#### 진료 전
- **환자 등록** — 환자 찾기, 기본정보와 보험정보 등록 및 관리
- **접수·보험 확인** — 오늘 진료를 시작하기 위한 접수와 자격 조회

#### 진료 중
- **진료** — 과거 이력 확인, 진단 및 진료 기록 작성
- **처방·검사·처치** — 실제 진료 지시와 금기·용량 등 필수 안전 확인
- **진료 완료** — 진료 기록을 확정하고 다음 원무 업무로 전달

#### 진료 후
- **수납·영수증** — 본인부담금 계산, 수납 처리 및 영수증 발행
- **청구 준비** — 진료 사실을 청구 가능한 자료로 연결 및 검증
- **하루 마감** — 당일 수납 내역 및 업무 상태 최종 정리

### 실제 의원에서 쓰기까지

#### 현재 확보된 기반
- **외래 진료 전 과정** — 환자 등록부터 하루 마감까지 전체 브라우저 Golden Path 정상 동작 검증

#### 현재 단계
- **첫 배포 후보 통합 검증** — 각각 검증했던 기능들이 실제 배포본 하나에서도 함께 정상적으로 성립하는지 확인

#### 앞으로의 도입 경로
- **시범 의원 준비** — 한 곳의 실제 의원 환경에서 설치·데이터 연동 및 운영 리허설
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  const parsed = parseProjectMap(mapTokens);

  assert.equal(parsed.isNativeMap, true);
  assert.equal(parsed.rails.length, 2);

  // Rail 1: 한 환자의 외래 진료 (No "현재 단계" group -> neutral rail)
  const rail1 = parsed.rails[0];
  assert.equal(rail1.title, "한 환자의 외래 진료");
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 3);
  assert.equal(rail1.groups[0].title, "진료 전");
  assert.equal(rail1.groups[0].items.length, 2);
  assert.equal(rail1.groups[0].items[0].isCurrentStage, false);

  // Rail 2: 실제 의원에서 쓰기까지 (Has "현재 단계" group -> trajectory rail)
  const rail2 = parsed.rails[1];
  assert.equal(rail2.title, "실제 의원에서 쓰기까지");
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 3);
  assert.equal(rail2.groups[0].title, "현재 확보된 기반");
  assert.equal(rail2.groups[0].items[0].isCurrentStage, false);
  assert.equal(rail2.groups[1].title, "현재 단계");
  assert.equal(rail2.groups[1].items[0].title, "첫 배포 후보 통합 검증");
  assert.equal(rail2.groups[1].items[0].isCurrentStage, true);

  // Current stage ownership
  assert.equal(parsed.currentStageTitle, "첫 배포 후보 통합 검증");

  // Render HTML check: no bogus "업무 흐름" or "프로젝트 축" badges
  const html = renderNativeMap(parsed);
  assert.equal(html.includes("업무 흐름"), false);
  assert.equal(html.includes("프로젝트 축"), false);
  assert.equal(html.includes("NOW · 현재 단계"), true);
  assert.equal(html.includes("map-rail-neutral"), true);
  assert.equal(html.includes("map-rail-trajectory"), true);
});

test("Fixture 2: Greenhub IoT sensor fleet with no NextChart vocabulary", () => {
  const markdown = `
# Greenhub IoT Sensor Fleet

## 프로젝트 지도

### 센서 수집 및 전달 계층

#### 데이터 수집
- **엣지 노드 수집** — 온습도 센서 측정치 수집

#### 데이터 가공
- **시계열 정규화** — 결측치 보정 및 이상치 필터링

#### 데이터 전송
- **MQTT 게이트웨이** — 브로커 연결 및 QoS 관리

### 현장 배포 및 가동

#### 확보된 기반
- **프로토타입 벤치마크** — 랩 환경 테스트 완료

#### 현재 단계
- **온실 1호기 실증** — 72시간 연속 가동 테스트

#### 향후 계획
- **양산 패키징** — IP67 방진방수 하우징
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  const parsed = parseProjectMap(mapTokens);

  assert.equal(parsed.isNativeMap, true);
  assert.equal(parsed.rails.length, 2);

  // Rail 1 is neutral
  assert.equal(parsed.rails[0].railType, "neutral");
  assert.equal(parsed.rails[0].groups.length, 3);

  // Rail 2 is trajectory
  assert.equal(parsed.rails[1].railType, "trajectory");
  assert.equal(parsed.currentStageTitle, "온실 1호기 실증");
});

test("Fixture 3: Deliberately neutral project without classifier vocabulary", () => {
  const markdown = `
# Neutral Project

## 프로젝트 지도

### Core Architecture

#### Layer Alpha
- **Alpha Core 1** — Primitive component
- **Alpha Core 2** — Extended primitive

#### Layer Beta
- **Beta Channel** — Message multiplexer

#### Layer Gamma
- **Gamma Interface** — Terminal boundary
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  const parsed = parseProjectMap(mapTokens);

  assert.equal(parsed.isNativeMap, true);
  assert.equal(parsed.rails.length, 1);

  const rail = parsed.rails[0];
  assert.equal(rail.title, "Core Architecture");
  assert.equal(rail.railType, "neutral");
  assert.equal(rail.groups.length, 3);
  assert.equal(parsed.currentStageTitle, undefined);

  const html = renderNativeMap(parsed);
  assert.equal(html.includes("neutral-groups-container"), true);
  assert.equal(html.includes("Layer Alpha"), true);
  assert.equal(html.includes("Layer Beta"), true);
  assert.equal(html.includes("Layer Gamma"), true);
  assert.equal(html.includes("group-current-stage"), false);
});

test("Regression Fixture 4: '현재 문제', '현재 가설', '현재 확보된 기반' do NOT become current stage", () => {
  const markdown = `
# Regression Project

## 프로젝트 지도

### 진단 레일

#### 현재 문제
- **병목 발생** — 메모리 누수 현상

#### 현재 가설
- **이벤트 리스너 미해제** — 가설 검증 필요

#### 현재 확보된 기반
- **재현 스크립트 확보** — 100% 재현 가능한 스크립트
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  const parsed = parseProjectMap(mapTokens);

  assert.equal(parsed.isNativeMap, true);
  assert.equal(parsed.rails.length, 1);

  // NONE of the groups match exact "현재 단계" -> must be neutral rail
  assert.equal(parsed.rails[0].railType, "neutral");
  assert.equal(parsed.currentStageTitle, undefined);

  for (const group of parsed.rails[0].groups) {
    for (const item of group.items) {
      assert.equal(item.isCurrentStage, false);
    }
  }

  const html = renderNativeMap(parsed);
  assert.equal(html.includes("group-current-stage"), false);
  assert.equal(html.includes("NOW · 현재 단계"), false);
});
