import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import {
  normalizeKey,
  normalizeTitle,
  HEADING_ALIAS,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
} from "../dist/authoring-grammar.js";
import {
  normalizeHeading,
  splitSections,
  extractSectionRawText,
} from "../dist/markdown-structure.js";
import { parseProjectMap, parseAreaDetails, findAreaDetail } from "../dist/semantic-construction.js";
import { renderNativeMap } from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

test("Deterministic title normalization: NFC, whitespace collapse, case folding", () => {
  assert.equal(normalizeTitle("  Patient  Registration  "), "patient registration");
  assert.equal(normalizeTitle("환자 등록"), "환자 등록");
  assert.equal(normalizeTitle("환자    등록"), "환자 등록");
  assert.equal(normalizeTitle(""), "");

  // Unicode NFC normalization test (composed vs decomposed forms)
  const decomposed = "가\u0301"; // with combining mark
  const composed = decomposed.normalize("NFC");
  assert.equal(normalizeTitle(decomposed), normalizeTitle(composed));
});

test("Exact title equality prevents false collisions across punctuation and parenthesis distinctions", () => {
  // Setup area details with distinct names that would collide if punctuation/hyphens were erased
  const areaDetailMarkdown = `
## 영역 상세

### A-B
#### 의미
Hyphenated distinct area A-B.
#### 현재 수준
Level 1.
#### 남은 문제
- None
#### 근거
- Evidence AB-1

### AB
#### 의미
Un-hyphenated distinct area AB.
#### 현재 수준
Level 2.
#### 남은 문제
- None
#### 근거
- Evidence AB-2

### 환자(외래)
#### 의미
외래 환자 접수 및 관리 영역.
#### 현재 수준
Level 3.
#### 남은 문제
- None
#### 근거
- Evidence OPD

### 환자 외래
#### 의미
외래 환자 대상 안내 및 이동 동선.
#### 현재 수준
Level 4.
#### 남은 문제
- None
#### 근거
- Evidence Guide

### 환자외래
#### 의미
외래 전용 약어 엔티티.
#### 현재 수준
Level 5.
#### 남은 문제
- None
#### 근거
- Evidence Entity

### v1.0
#### 의미
Version 1.0.
#### 현재 수준
Level 6.
#### 남은 문제
- None
#### 근거
- Evidence v1.0

### v10
#### 의미
Version 10.
#### 현재 수준
Level 7.
#### 남은 문제
- None
#### 근거
- Evidence v10
`;

  const tokens = md.parse(areaDetailMarkdown, {});
  const { sections } = splitSections(tokens);
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens);
  const areaDetails = parseAreaDetails(detailTokens);

  assert.equal(areaDetails.size, 7);

  // 1. Hyphen collision test: "A-B" vs "AB"
  const detailABHyphen = findAreaDetail("A-B", areaDetails);
  assert.ok(detailABHyphen);
  assert.equal(detailABHyphen.title, "A-B");
  assert.ok(detailABHyphen.subsections[0].rawText.includes("Hyphenated distinct area A-B"));

  const detailABNoHyphen = findAreaDetail("AB", areaDetails);
  assert.ok(detailABNoHyphen);
  assert.equal(detailABNoHyphen.title, "AB");
  assert.ok(detailABNoHyphen.subsections[0].rawText.includes("Un-hyphenated distinct area AB"));

  // 2. Korean Parentheses / Space distinction test: "환자(외래)" vs "환자 외래" vs "환자외래"
  const detailParen = findAreaDetail("환자(외래)", areaDetails);
  assert.ok(detailParen);
  assert.equal(detailParen.title, "환자(외래)");
  assert.ok(detailParen.subsections[0].rawText.includes("외래 환자 접수"));

  const detailSpace = findAreaDetail("환자 외래", areaDetails);
  assert.ok(detailSpace);
  assert.equal(detailSpace.title, "환자 외래");
  assert.ok(detailSpace.subsections[0].rawText.includes("이동 동선"));

  const detailNoSpace = findAreaDetail("환자외래", areaDetails);
  assert.ok(detailNoSpace);
  assert.equal(detailNoSpace.title, "환자외래");
  assert.ok(detailNoSpace.subsections[0].rawText.includes("약어 엔티티"));

  // 3. Dot distinction test: "v1.0" vs "v10"
  const detailV1 = findAreaDetail("v1.0", areaDetails);
  assert.ok(detailV1);
  assert.equal(detailV1.title, "v1.0");

  const detailV10 = findAreaDetail("v10", areaDetails);
  assert.ok(detailV10);
  assert.equal(detailV10.title, "v10");

  // Non-matching lookup returns undefined
  assert.equal(findAreaDetail("A_B", areaDetails), undefined);
  assert.equal(findAreaDetail("환자", areaDetails), undefined);
});

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

test("Heading aliases contract: Korean and English Area Details and Context slots", () => {
  // Korean Area Detail headings (both '영역 상세' and '영역별 상세' MUST normalize to 'area details')
  assert.equal(HEADING_ALIAS["영역 상세"], "area details");
  assert.equal(HEADING_ALIAS["영역별 상세"], "area details");

  // English Area Detail headings
  assert.equal(HEADING_ALIAS["area details"], "area details");
  assert.equal(HEADING_ALIAS["area detail"], "area details");

  // Context panels
  assert.equal(HEADING_ALIAS["product goal"], "project frame");
  assert.equal(HEADING_ALIAS["product goals"], "project frame");
  assert.equal(HEADING_ALIAS["제품 목표"], "project frame");
  assert.equal(HEADING_ALIAS["프로젝트 큰 그림"], "project frame");

  // Overview panels: one merged owner per reader question.
  assert.equal(HEADING_ALIAS["현재 집중"], "current focus");
  assert.equal(HEADING_ALIAS["현재의 집중"], "current focus");
  assert.equal(HEADING_ALIAS["current focus"], "current focus");
  assert.equal(HEADING_ALIAS["focus"], "current focus");
  assert.equal(HEADING_ALIAS["현재 상황"], "situation");
  assert.equal(HEADING_ALIAS["지금"], "situation");
  assert.equal(HEADING_ALIAS["current situation"], "situation");
  assert.equal(HEADING_ALIAS["프로젝트 지평"], "situation");
  assert.equal(HEADING_ALIAS["project horizon"], "situation");
  assert.equal(HEADING_ALIAS["다음 전환"], "next");
  assert.equal(HEADING_ALIAS["다음"], "next");
  assert.equal(HEADING_ALIAS["next transition"], "next");
  assert.equal(HEADING_ALIAS["현재 최전선"], "next");
  assert.equal(HEADING_ALIAS["current frontier"], "next");
  assert.equal(HEADING_ALIAS["직면한 문제"], "facing");
  assert.equal(HEADING_ALIAS["막힌 것"], "facing");
  assert.equal(HEADING_ALIAS["blocked"], "facing");
  assert.equal(HEADING_ALIAS["facing issues"], "facing");
  assert.equal(HEADING_ALIAS["최근 진척"], "recent");
  assert.equal(HEADING_ALIAS["최근 변화"], "recent");
  assert.equal(HEADING_ALIAS["recent progress"], "recent");
  assert.equal(HEADING_ALIAS["최근 실질적 변화"], "recent");
  assert.equal(HEADING_ALIAS["recent material movement"], "recent");
  // Removed canonical owners resolve to nothing.
  assert.equal(HEADING_ALIAS["단계 여정"], undefined);
  assert.equal(HEADING_ALIAS["stage journey"], undefined);
  assert.equal(HEADING_ALIAS["프로젝트 상태"], undefined);
  assert.equal(HEADING_ALIAS["project posture"], undefined);
  assert.equal(HEADING_ALIAS["전략적 흐름"], undefined);
  assert.equal(HEADING_ALIAS["strategic threads"], undefined);
});

test("Explicit relationship grammar: bullet list => peer rendering, no directional arrows", () => {
  const markdown = `
# Peer System

## 프로젝트 지도

### 아키텍처 계층
#### 코어 서비스
- **인증 서비스** — 토큰 발급 및 검증
- **사용자 서비스** — 프로필 및 권한 관리

#### 데이터 스토리지
- **메인 DB** — 트랜잭션 데이터 저장
- **캐시 클러스터** — 세션 및 고빈도 조회 데이터 캐싱
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens);
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.rails.length, 1);
  const rail = parsedMap.rails[0];
  assert.equal(rail.groups.length, 2);
  assert.equal(rail.groups[0].isOrdered, false);
  assert.equal(rail.groups[1].isOrdered, false);

  const html = renderNativeMap(parsedMap);

  // Structural checks
  assert.ok(html.includes("peer-track"), "Neutral rail with bullet lists should have peer-track class");
  assert.ok(!html.includes("sequential-track"), "Neutral rail with bullet lists should not have sequential-track class");
  assert.ok(!html.includes("neutral-group-connector"), "Peer groups should not have directional group connectors");
  assert.ok(!html.includes("flow-step-arrow"), "Peer groups should not have directional step arrows");
  assert.ok(html.includes("group-peer"), "Groups should have group-peer class");
  assert.ok(html.includes("card-peer"), "Cards should have card-peer class");
  assert.ok(!html.includes("card-ordered"), "Cards should not have card-ordered class");
});

test("Explicit relationship grammar: ordered list => sequential rendering with directional connectors and step numbers", () => {
  const markdown = `
# Sequential Flow System

## 프로젝트 지도

### 데이터 처리 파이프라인
#### 수집 및 전처리
1. **원천 데이터 수집** — 외부 스트림 인제스천
2. **스키마 검증 및 정제** — 필드 타입 검증 및 이상치 필터링

#### 변환 및 적재
1. **집계 변환** — 1분 단위 롤업 집계
2. **웨어하우스 적재** — 분석 저장소 최종 적재
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens);
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.rails.length, 1);
  const rail = parsedMap.rails[0];
  assert.equal(rail.groups.length, 2);
  assert.equal(rail.groups[0].isOrdered, true);
  assert.equal(rail.groups[1].isOrdered, true);

  const html = renderNativeMap(parsedMap);

  // Structural checks for sequential track
  assert.ok(html.includes("sequential-track"), "Sequential rail should have sequential-track class");
  assert.ok(html.includes("neutral-group-connector"), "Consecutive ordered groups should have directional connector");
  assert.ok(html.includes("group-arrow"), "Connector should include group arrow");
  assert.ok(html.includes("group-items-ordered"), "Items container should have group-items-ordered class");
  assert.ok(html.includes("flow-step-arrow"), "Consecutive items within group should have step flow arrow");
  assert.ok(html.includes("card-ordered"), "Cards should have card-ordered class");
  assert.ok(html.includes("step-num"), "Cards should have step numbers");
});

test("Vocabulary invariance: Titles do NOT determine sequential vs peer mode without explicit list grammar", () => {
  // Title contains "Workflow" and "Pipeline", but list uses bullet points
  const bulletWorkflow = `
# Title Invariance Test

## 프로젝트 지도

### 워크플로우 파이프라인
#### 처리 순서
- **1단계 작업** — 첫번째
- **2단계 작업** — 두번째
`;

  const parsedBullet = parseProjectMap(splitSections(md.parse(bulletWorkflow, {})).sections.get("project map"));
  assert.equal(parsedBullet.rails[0].groups[0].isOrdered, false);
  const bulletHtml = renderNativeMap(parsedBullet);
  assert.ok(!bulletHtml.includes("flow-step-arrow"), "Workflow title with bullet list must NOT render flow arrows");
  assert.ok(bulletHtml.includes("card-peer"), "Workflow title with bullet list must render card-peer");

  // Title contains "Static Components", but list uses ordered numbers
  const orderedComponents = `
# Title Invariance Test

## 프로젝트 지도

### 정적 구성요소 모음
#### 독립 모듈
1. **모듈 A** — 첫번째
2. **모듈 B** — 두번째
`;

  const parsedOrdered = parseProjectMap(splitSections(md.parse(orderedComponents, {})).sections.get("project map"));
  assert.equal(parsedOrdered.rails[0].groups[0].isOrdered, true);
  const orderedHtml = renderNativeMap(parsedOrdered);
  assert.ok(orderedHtml.includes("flow-step-arrow"), "Ordered list must render flow arrows regardless of title");
  assert.ok(orderedHtml.includes("card-ordered"), "Ordered list must render card-ordered");
});

