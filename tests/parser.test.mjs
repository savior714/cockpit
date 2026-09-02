import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import {
  normalizeKey,
  normalizeTitle,
  normalizeHeading,
  HEADING_ALIAS,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
  parseProjectMap,
  splitSections,
  parseAreaDetails,
  findAreaDetail,
  renderNativeMap,
} from "../src/parser.ts";

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

  // Overview panels
  assert.equal(HEADING_ALIAS["현재 상황"], "current situation");
  assert.equal(HEADING_ALIAS["다음 전환"], "next transition");
  assert.equal(HEADING_ALIAS["직면한 문제"], "facing issues");
});

test("First-Use Fixture A: Greenhub Smart Farm IoT operational & hardware topology verification", () => {
  const filePath = path.join(__dirname, "fixtures", "greenhub.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.equal(title, "Greenhub Smart Farm IoT");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: 스마트팜 현장 설비 및 엣지 계층 (Neutral rail)
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.title, "스마트팜 현장 설비 및 엣지 계층");
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: 부여 온실 1호기 현장 실증 (Trajectory rail owning '현재 단계')
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.title, "부여 온실 1호기 현장 실증");
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 2);
  assert.equal(parsedMap.currentStageTitle, "온실 1호기 72시간 연속 실증");

  // Rail 3: 클라우드 인제스천 및 관제 (Neutral rail)
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.title, "클라우드 인제스천 및 관제");
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 2);

  // 2. Area details parsing under '## 영역별 상세'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## 영역별 상세 must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 7);

  // 3. Verify EVERY map item has full 4-pillar source content in Inspector
  for (const rail of parsedMap.rails) {
    for (const group of rail.groups) {
      for (const item of group.items) {
        const detail = findAreaDetail(item, areaDetails);
        assert.ok(
          detail,
          `Map item "${item.title}" must have a matching AreaDetail in "## 영역별 상세"`
        );

        const subheadings = detail.subsections.map((s) => s.subheading.trim());
        assert.ok(
          subheadings.some((h) => h.includes("의미")),
          `Area "${item.title}" missing '의미'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("현재 수준")),
          `Area "${item.title}" missing '현재 수준'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("남은 문제")),
          `Area "${item.title}" missing '남은 문제'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("근거")),
          `Area "${item.title}" missing '근거'`
        );
      }
    }
  }

  // 4. Verify Overview and Context slots
  assert.ok(sections.get("current situation"), "## 현재 상황 slot parsed");
  assert.ok(sections.get("next transition"), "## 다음 전환 slot parsed");
  assert.ok(sections.get("facing issues"), "## 직면한 문제 slot parsed");
  assert.ok(sections.get("project frame"), "## 제품 목표 slot parsed");
  assert.ok(sections.get("settled direction"), "## 확정된 방향 slot parsed");
});

test("First-Use Fixture B: Flux Engine distributed software system architecture verification", () => {
  const filePath = path.join(__dirname, "fixtures", "flux-engine.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.equal(title, "Flux Engine");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: Storage Subsystem (Neutral rail)
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.title, "Storage Subsystem");
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Distributed Consensus & Replication (Trajectory rail owning 'Current Stage')
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.title, "Distributed Consensus & Replication");
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 3);
  assert.equal(parsedMap.currentStageTitle, "Partition Rebalancing Under Failure");

  // Rail 3: Cloud Storage & WAN (Neutral rail)
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.title, "Cloud Storage & WAN");
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 2);

  // 2. Area details parsing under '## Area Details'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## Area Details must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 7);

  // 3. Verify EVERY map item has full 4-pillar source content in Inspector
  for (const rail of parsedMap.rails) {
    for (const group of rail.groups) {
      for (const item of group.items) {
        const detail = findAreaDetail(item, areaDetails);
        assert.ok(
          detail,
          `Map item "${item.title}" must have a matching AreaDetail in "## Area Details"`
        );

        const subheadings = detail.subsections.map((s) => s.subheading.trim());
        assert.ok(
          subheadings.some((h) => h.toLowerCase().includes("meaning")),
          `Area "${item.title}" missing 'Meaning'`
        );
        assert.ok(
          subheadings.some((h) => h.toLowerCase().includes("current level")),
          `Area "${item.title}" missing 'Current Level'`
        );
        assert.ok(
          subheadings.some((h) => h.toLowerCase().includes("remaining issues")),
          `Area "${item.title}" missing 'Remaining Issues'`
        );
        assert.ok(
          subheadings.some((h) => h.toLowerCase().includes("evidence")),
          `Area "${item.title}" missing 'Evidence'`
        );
      }
    }
  }

  // 4. Overview & Context slots
  assert.ok(sections.get("current situation"), "## Current Situation parsed");
  assert.ok(sections.get("next transition"), "## Next Transition parsed");
  assert.ok(sections.get("facing issues"), "## Facing Issues parsed");
  assert.ok(sections.get("project frame"), "## Product Goals parsed");
  assert.ok(sections.get("settled direction"), "## Settled Direction parsed");
});

test("First-Use Fixture C: Genomic Clinical Cohort Study research & data pipeline verification", () => {
  const filePath = path.join(__dirname, "fixtures", "clinical-study.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.equal(title, "Genomic Clinical Cohort Study");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: 데이터 수집 및 코호트 정제 (Neutral rail)
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.title, "데이터 수집 및 코호트 정제");
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: 통계 분석 및 위험 모형화 (Trajectory rail owning '현재 단계')
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.title, "통계 분석 및 위험 모형화");
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 2);
  assert.equal(parsedMap.currentStageTitle, "다변량 생존분석 모델 검증");

  // Rail 3: 임상 유효성 평가 (Neutral rail)
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.title, "임상 유효성 평가");
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 1);

  // 2. Area details parsing under '## 영역 상세'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## 영역 상세 must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 5);

  // 3. Verify EVERY map item has full 4-pillar source content in Inspector
  for (const rail of parsedMap.rails) {
    for (const group of rail.groups) {
      for (const item of group.items) {
        const detail = findAreaDetail(item, areaDetails);
        assert.ok(
          detail,
          `Map item "${item.title}" must have a matching AreaDetail in "## 영역 상세"`
        );

        const subheadings = detail.subsections.map((s) => s.subheading.trim());
        assert.ok(
          subheadings.some((h) => h.includes("의미")),
          `Area "${item.title}" missing '의미'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("현재 수준")),
          `Area "${item.title}" missing '현재 수준'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("남은 문제")),
          `Area "${item.title}" missing '남은 문제'`
        );
        assert.ok(
          subheadings.some((h) => h.includes("근거")),
          `Area "${item.title}" missing '근거'`
        );
      }
    }
  }

  // 4. Overview & Context slots
  assert.ok(sections.get("current situation"), "## 현재 상황 slot parsed");
  assert.ok(sections.get("next transition"), "## 다음 전환 slot parsed");
  assert.ok(sections.get("facing issues"), "## 직면한 문제 slot parsed");
  assert.ok(sections.get("project frame"), "## 제품 목표 slot parsed");
  assert.ok(sections.get("settled direction"), "## 확정된 방향 slot parsed");
});

test("First-Use Fixture D: NextChart EMR fixture verification", () => {
  const filePath = path.join(__dirname, "fixtures", "nextchart.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.equal(title, "NextChart EMR");
  const mapTokens = sections.get("project map");
  const parsedMap = parseProjectMap(mapTokens);
  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.currentStageTitle, "첫 배포 후보 통합 검증");

  const detailTokens = sections.get("area details");
  const areaDetails = parseAreaDetails(detailTokens);

  const registrationDetail = findAreaDetail("환자 등록", areaDetails);
  assert.ok(registrationDetail);
  assert.equal(registrationDetail.title, "환자 등록");
  assert.equal(registrationDetail.subsections.length, 4);

  const currentStageDetail = findAreaDetail("첫 배포 후보 통합 검증", areaDetails);
  assert.ok(currentStageDetail);
  assert.equal(currentStageDetail.title, "첫 배포 후보 통합 검증");
  assert.equal(currentStageDetail.subsections.length, 4);
});
