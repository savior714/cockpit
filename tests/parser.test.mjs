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
  getAreaCompleteness,
  renderNativeMap,
  checkProgressStructure,
  formatStructuralCheckReport,
  extractSectionRawText,
  formatProjectMapText,
  formatAreaDetailsText,
  buildFocusHandoffContext,
} from "../dist/parser.js";

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
  assert.equal(HEADING_ALIAS["현재 집중"], "current focus");
  assert.equal(HEADING_ALIAS["현재의 집중"], "current focus");
  assert.equal(HEADING_ALIAS["current focus"], "current focus");
  assert.equal(HEADING_ALIAS["focus"], "current focus");
  assert.equal(HEADING_ALIAS["현재 상황"], "current situation");
  assert.equal(HEADING_ALIAS["다음 전환"], "next transition");
  assert.equal(HEADING_ALIAS["직면한 문제"], "facing issues");
});

test("Synthetic Fixture 1: Operational and telemetry system topology verification", () => {
  const filePath = path.join(__dirname, "fixtures", "operational-system.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.ok(title.length > 0, "Document must have a top-level H1 title");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: Neutral operational rail
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Trajectory rail owning '현재 단계' along with Foundation and Future groups
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 3);
  assert.ok(parsedMap.currentStageTitle, "Trajectory rail must identify current stage title");

  // Rail 3: Neutral cloud/control rail
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 2);

  // 2. Area details parsing under '## 영역별 상세'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## 영역별 상세 must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 8);

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

test("Synthetic Fixture 2: Distributed software architecture verification", () => {
  const filePath = path.join(__dirname, "fixtures", "software-architecture.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.ok(title.length > 0, "Document must have a top-level H1 title");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: Storage Subsystem (Neutral rail)
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Distributed Consensus & Replication (Trajectory rail owning 'Current Stage')
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 3);
  assert.ok(parsedMap.currentStageTitle, "Trajectory rail must identify current stage title");

  // Rail 3: Cloud Storage & WAN (Neutral rail)
  const rail3 = parsedMap.rails[2];
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

test("Synthetic Fixture 3: Multicenter clinical research pipeline verification", () => {
  const filePath = path.join(__dirname, "fixtures", "research-project.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);

  assert.ok(title.length > 0, "Document must have a top-level H1 title");

  // 1. Map parsing
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens, "Project Map section must be parsed");
  const parsedMap = parseProjectMap(mapTokens);

  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 3);

  // Rail 1: Data collection and cohort cleaning (Neutral rail)
  const rail1 = parsedMap.rails[0];
  assert.equal(rail1.railType, "neutral");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Statistical analysis & modeling (Trajectory rail owning '현재 단계')
  const rail2 = parsedMap.rails[1];
  assert.equal(rail2.railType, "trajectory");
  assert.equal(rail2.groups.length, 2);
  assert.ok(parsedMap.currentStageTitle, "Trajectory rail must identify current stage title");

  // Rail 3: Multicenter clinical validation (Neutral rail)
  const rail3 = parsedMap.rails[2];
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

test("Native map rendering structural invariant across trajectory and neutral rails", () => {
  const filePath = path.join(__dirname, "fixtures", "operational-system.md");
  const markdown = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens);
  const parsedMap = parseProjectMap(mapTokens);

  const renderedHtml = renderNativeMap(parsedMap);

  // 1. Structural containers
  assert.ok(renderedHtml.includes("native-project-map"));
  assert.ok(renderedHtml.includes("map-rail-neutral"));
  assert.ok(renderedHtml.includes("map-rail-trajectory"));
  assert.ok(renderedHtml.includes("trajectory-groups-container"));
  assert.ok(renderedHtml.includes("neutral-groups-container"));

  // 2. Trajectory sub-group components
  assert.ok(renderedHtml.includes("group-foundation"));
  assert.ok(renderedHtml.includes("group-current-stage"));
  assert.ok(renderedHtml.includes("group-future"));

  // 3. Card types and accessibility tags
  assert.ok(renderedHtml.includes("card-foundation"));
  assert.ok(renderedHtml.includes("card-current-stage"));
  assert.ok(renderedHtml.includes("card-future"));
  assert.ok(renderedHtml.includes("NOW · 현재 단계"));
});

test("Area completeness calculation: complete vs partial document", () => {
  // Case 1: Partial document (10 map items, only 6 matching area details)
  const partialDoc = `
# Partial Project

## 프로젝트 지도

### 주요 기능 레일
#### 핵심 그룹
- **Item 1** — First item
- **Item 2** — Second item
- **Item 3** — Third item
- **Item 4** — Fourth item
- **Item 5** — Fifth item
- **Item 6** — Sixth item

#### 현재 단계
- **Item 7** — Seventh item

### 보조 레일
#### 연계 그룹
- **Item 8** — Eighth item
- **Item 9** — Ninth item
- **Item 10** — Tenth item

## 영역 상세

### Item 1
#### 의미
Detail 1

### Item 2
#### 의미
Detail 2

### Item 3
#### 의미
Detail 3

### Item 4
#### 의미
Detail 4

### Item 5
#### 의미
Detail 5

### Item 7
#### 의미
Detail 7
`;

  const tokens = md.parse(partialDoc, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  const detailTokens = sections.get("area details");

  const parsedMap = parseProjectMap(mapTokens);
  const areaDetails = parseAreaDetails(detailTokens);

  const completeness = getAreaCompleteness(parsedMap, areaDetails);
  assert.equal(completeness.totalItems, 10);
  assert.equal(completeness.matchedItems, 6);
  assert.equal(completeness.missingItems, 4);
  assert.deepEqual(completeness.missingTitles, ["Item 6", "Item 8", "Item 9", "Item 10"]);

  // Case 2: Complete document (fixtures)
  for (const fixtureName of ["operational-system.md", "software-architecture.md", "research-project.md"]) {
    const fixturePath = path.join(__dirname, "fixtures", fixtureName);
    const content = fs.readFileSync(fixturePath, "utf-8");
    const fixTokens = md.parse(content, {});
    const { sections: fixSections } = splitSections(fixTokens);
    const fixMap = parseProjectMap(fixSections.get("project map"));
    const fixDetails = parseAreaDetails(fixSections.get("area details"));

    const fixCompleteness = getAreaCompleteness(fixMap, fixDetails);
    assert.ok(fixCompleteness.totalItems > 0);
    assert.equal(fixCompleteness.missingItems, 0, `${fixtureName} must be 100% complete`);
    assert.equal(fixCompleteness.matchedItems, fixCompleteness.totalItems);
    assert.equal(fixCompleteness.missingTitles.length, 0);
  }
});

test("DOM and CSS containment invariant: primary-workspace isolates sticky aside from lower context region", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  // 1. DOM Order and Hierarchy assertion:
  const primaryWorkspaceIdx = html.indexOf('id="primary-workspace"');
  const slotMapIdx = html.indexOf('id="slot-map"');
  const inspectorAsideIdx = html.indexOf('id="inspector-aside"');
  const contextRegionIdx = html.indexOf('id="context-region"');
  const slotFrameIdx = html.indexOf('id="slot-frame"');
  const slotSettledIdx = html.indexOf('id="slot-settled"');

  assert.ok(primaryWorkspaceIdx !== -1, "index.html must have #primary-workspace");
  assert.ok(contextRegionIdx !== -1, "index.html must have #context-region");

  // slot-map and inspector-aside must be inside primary-workspace before context-region starts
  assert.ok(primaryWorkspaceIdx < slotMapIdx && slotMapIdx < contextRegionIdx, "#slot-map must be inside #primary-workspace");
  assert.ok(primaryWorkspaceIdx < inspectorAsideIdx && inspectorAsideIdx < contextRegionIdx, "#inspector-aside must be inside #primary-workspace");

  // slot-frame and slot-settled must be inside context-region after it starts
  assert.ok(contextRegionIdx < slotFrameIdx, "#slot-frame must be inside #context-region");
  assert.ok(contextRegionIdx < slotSettledIdx, "#slot-settled must be inside #context-region");

  // 2. Completeness badge element exists in DOM
  assert.ok(html.includes('id="map-completeness-badge"'), "index.html must include #map-completeness-badge");

  // 3. CSS Structural Rules assertion
  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.ok(css.includes(".primary-workspace"), "CSS must style .primary-workspace");
  assert.ok(css.includes(".context-region"), "CSS must style .context-region");
  assert.ok(css.includes(".completeness-badge"), "CSS must style .completeness-badge");
});

test("Independent multi-rail mental-model axis invariants: single Current Stage ownership and neutral rail coexistence", () => {
  // Case A: Multi-rail map with 1 neutral operational rail and 1 trajectory rollout rail
  const multiRailDoc = `
## 프로젝트 지도

### 도메인 및 운영 모델
#### 접수 및 진료
- **외래 접수** — 당일 외래 환자 접수 및 대기열 등록
- **진료 기록** — 담당의 임상 소견 및 처방 기록

### 도입 및 검증 여정
#### 확보된 기반
- **기초 파이프라인** — 기본 진료 데이터 연동 확립

#### 현재 단계
- **원내 실증** — 실제 외래 환경 단일 진료실 파일럿 검증

#### 향후 계획
- **원외 전파** — 전체 진료과 확대 배포
`;

  const tokens = md.parse(multiRailDoc, {});
  const { sections } = splitSections(tokens);
  const mapTokens = sections.get("project map");
  assert.ok(mapTokens);

  const parsedMap = parseProjectMap(mapTokens);
  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.rails.length, 2);

  // Rail 1: Neutral operational rail
  assert.equal(parsedMap.rails[0].title, "도메인 및 운영 모델");
  assert.equal(parsedMap.rails[0].railType, "neutral");
  assert.equal(parsedMap.rails[0].groups.length, 1);
  assert.equal(parsedMap.rails[0].groups[0].items.length, 2);

  // Rail 2: Trajectory adoption rail owning Current Stage
  assert.equal(parsedMap.rails[1].title, "도입 및 검증 여정");
  assert.equal(parsedMap.rails[1].railType, "trajectory");
  assert.equal(parsedMap.rails[1].groups.length, 3);
  assert.equal(parsedMap.currentStageTitle, "원내 실증");

  const renderedHtml = renderNativeMap(parsedMap);
  assert.ok(renderedHtml.includes("map-rail-neutral"));
  assert.ok(renderedHtml.includes("map-rail-trajectory"));
  assert.ok(renderedHtml.includes("도메인 및 운영 모델"));
  assert.ok(renderedHtml.includes("도입 및 검증 여정"));
  assert.ok(renderedHtml.includes("NOW · 현재 단계"));

  // Case B: Single neutral rail (no current stage anywhere)
  const singleNeutralDoc = `
## 프로젝트 지도

### 시스템 아키텍처
#### 스토리지 레이어
- **블록 저장소** — 원시 블록 볼륨 I/O
#### 네트워크 레이어
- **RPC 브리지** — 노드 간 내부 메시징
`;

  const singleTokens = md.parse(singleNeutralDoc, {});
  const singleSections = splitSections(singleTokens).sections;
  const singleParsed = parseProjectMap(singleSections.get("project map"));
  assert.equal(singleParsed.rails.length, 1);
  assert.equal(singleParsed.rails[0].railType, "neutral");
  assert.equal(singleParsed.currentStageTitle, undefined);
});

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

test("Fixture verification: visual-test-focus.md (Current Focus + multi-rail Current Stage + neutral rail)", () => {
  const filePath = path.join(__dirname, "fixtures", "visual-test-focus.md");
  const content = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(content, {});
  const { title, sections } = splitSections(tokens);
  assert.ok(title.includes("스마트 병원"));
  assert.ok(sections.get("current focus"), "Current focus section must exist");

  const result = checkProgressStructure(content);
  assert.equal(result.ok, true);
  assert.equal(result.totalMapItems, 9);
  assert.equal(result.matchedDetails, 9);
  assert.equal(result.missingDetails, 0);
  assert.equal(result.currentStageCount, 2);
  assert.equal(result.currentFocusCount, 1);

  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.rails.length, 3);
  assert.equal(parsedMap.rails[0].railType, "trajectory");
  assert.equal(parsedMap.rails[1].railType, "trajectory");
  assert.equal(parsedMap.rails[2].railType, "neutral");
});

test("Fixture verification: visual-test-nofocus.md (No Current Focus + single trajectory rail)", () => {
  const filePath = path.join(__dirname, "fixtures", "visual-test-nofocus.md");
  const content = fs.readFileSync(filePath, "utf-8");

  const tokens = md.parse(content, {});
  const { sections } = splitSections(tokens);
  assert.equal(sections.get("current focus"), undefined, "No Current focus section should exist");

  const result = checkProgressStructure(content);
  assert.equal(result.ok, true);
  assert.equal(result.totalMapItems, 3);
  assert.equal(result.matchedDetails, 3);
  assert.equal(result.missingDetails, 0);
  assert.equal(result.currentStageCount, 1);
  assert.equal(result.currentFocusCount, 0);
});

test("Raw text extraction preserving lists and paragraphs", () => {
  const markdown = `
Paragraph line 1.
Paragraph line 2.

- Bullet item A
- Bullet item B

1. Numbered item 1
2. Numbered item 2
`;
  const tokens = md.parse(markdown, {});
  const extracted = extractSectionRawText(tokens);

  assert.ok(extracted.includes("Paragraph line 1.\nParagraph line 2."));
  assert.ok(extracted.includes("- Bullet item A"));
  assert.ok(extracted.includes("- Bullet item B"));
  assert.ok(extracted.includes("1. Numbered item 1"));
  assert.ok(extracted.includes("2. Numbered item 2"));
  assert.equal(extractSectionRawText([]), "");
  assert.equal(extractSectionRawText(undefined), "");
});

test("Project Map text formatting across rails and group types", () => {
  const mapDoc = `
## 프로젝트 지도

### 메인 레일
#### 순차 그룹
1. **단계 1** — 첫 단계 설명
2. **단계 2** — 둘째 단계 설명

### 보조 레일
#### 대등 그룹
- **항목 A** — 설명 A
- **항목 B**
`;
  const tokens = md.parse(mapDoc, {});
  const parsedMap = parseProjectMap(splitSections(tokens).sections.get("project map"));
  const text = formatProjectMapText(parsedMap);

  assert.ok(text.includes("### 메인 레일"));
  assert.ok(text.includes("#### 순차 그룹"));
  assert.ok(text.includes("1. **단계 1** — 첫 단계 설명"));
  assert.ok(text.includes("2. **단계 2** — 둘째 단계 설명"));
  assert.ok(text.includes("### 보조 레일"));
  assert.ok(text.includes("#### 대등 그룹"));
  assert.ok(text.includes("- **항목 A** — 설명 A"));
  assert.ok(text.includes("- **항목 B**"));
});

test("Area details text formatting preserves all pillar subsections", () => {
  const detailDoc = `
## 영역 상세

### 영역 1
#### 의미
영역 1의 의미.
#### 현재 수준
가동 중.
#### 남은 문제
- 문제 1
#### 근거
- 코드 파일

### 영역 2
#### 의미
영역 2의 의미.
`;
  const tokens = md.parse(detailDoc, {});
  const areaDetails = parseAreaDetails(splitSections(tokens).sections.get("area details"));
  const text = formatAreaDetailsText(areaDetails);

  assert.ok(text.includes("### 영역 1"));
  assert.ok(text.includes("#### 의미\n영역 1의 의미."));
  assert.ok(text.includes("#### 현재 수준\n가동 중."));
  assert.ok(text.includes("#### 남은 문제\n- 문제 1"));
  assert.ok(text.includes("#### 근거\n- 코드 파일"));
  assert.ok(text.includes("### 영역 2"));
});

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
  assert.ok(context.includes("현재 repo/runtime/SSOT의 fresh evidence와 위 context를 대조하라."));
  assert.ok(context.includes("Current Focus를 Next Transition까지 전진시키기 위해"));
  assert.ok(context.includes("transient Execution Wave로 묶을 수 있다."));
  assert.ok(context.includes("각 NOW-admissible task는 별도의 executor-neutral local agent handoff로 작성한다."));
  assert.ok(context.includes("선행 task 결과에 따라"));
  assert.ok(context.includes("Execution Wave는 일회성 framing 결과다. Cockpit/PROGRESS.md에 task backlog나 실행 상태로 저장하지 않는다."));
  assert.ok(context.includes("현재 evidence로 안전하게 확정 가능한 최대 범위에서 멈춘다."));

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

test("DOM and CSS containment: focus copy action and toast elements exist inside #slot-focus", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  const slotFocusIdx = html.indexOf('id="slot-focus"');
  const focusCopyBtnIdx = html.indexOf('id="focus-copy-btn"');
  const focusCopyToastIdx = html.indexOf('id="focus-copy-toast"');
  const slotNowIdx = html.indexOf('id="slot-now"');

  assert.ok(slotFocusIdx !== -1, "index.html must have #slot-focus");
  assert.ok(focusCopyBtnIdx !== -1, "index.html must have #focus-copy-btn");
  assert.ok(focusCopyToastIdx !== -1, "index.html must have #focus-copy-toast");

  // focus-copy-btn and focus-copy-toast must be strictly inside #slot-focus before #slot-now
  assert.ok(slotFocusIdx < focusCopyBtnIdx && focusCopyBtnIdx < slotNowIdx, "#focus-copy-btn must be inside #slot-focus");
  assert.ok(slotFocusIdx < focusCopyToastIdx && focusCopyToastIdx < slotNowIdx, "#focus-copy-toast must be inside #slot-focus");

  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.ok(css.includes(".focus-actions"), "CSS must style .focus-actions");
  assert.ok(css.includes(".btn-focus-copy"), "CSS must style .btn-focus-copy");
});





