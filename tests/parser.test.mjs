import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  buildAreaHandoffContext,
  formatFocusHandoffInstruction,
  formatAreaHandoffInstruction,
  formatExecutionWaveContractLines,
  formatAdmissionPublicationContractLines,
  parseProjectHorizon,
  parseStageJourney,
  parseProjectPosture,
  parseCurrentFrontiers,
  parseStrategicThreads,
  parseMaterialMovements,
  parseMentalModel,
  classifySubsectionTone,
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
  assert.equal(parsedMap.hasCurrentStage, true, "Trajectory rail must set hasCurrentStage to true");

  // Rail 3: Neutral cloud/control rail
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 2);

  // 2. Area details parsing under '## 영역별 상세'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## 영역별 상세 must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 8);

  // 3. Verify EVERY map item has required evidence-bearing source content in Inspector
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
  assert.equal(parsedMap.hasCurrentStage, true, "Trajectory rail must set hasCurrentStage to true");

  // Rail 3: Cloud Storage & WAN (Neutral rail)
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 2);

  // 2. Area details parsing under '## Area Details'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## Area Details must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 7);

  // 3. Verify EVERY map item has required evidence-bearing source content in Inspector
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
  assert.equal(parsedMap.hasCurrentStage, true, "Trajectory rail must set hasCurrentStage to true");

  // Rail 3: Multicenter clinical validation (Neutral rail)
  const rail3 = parsedMap.rails[2];
  assert.equal(rail3.railType, "neutral");
  assert.equal(rail3.groups.length, 1);

  // 2. Area details parsing under '## 영역 상세'
  const detailTokens = sections.get("area details");
  assert.ok(detailTokens, "## 영역 상세 must be recognized as 'area details'");
  const areaDetails = parseAreaDetails(detailTokens);
  assert.equal(areaDetails.size, 5);

  // 3. Verify EVERY map item has required evidence-bearing source content in Inspector
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

test("DOM and CSS containment invariant: context-region prioritizes Recent Progress over compact stable context grid", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  const contextRegionIdx = html.indexOf('id="context-region"');
  const slotRecentIdx = html.indexOf('id="slot-recent"');
  const stableGridIdx = html.indexOf('class="stable-context-grid"');
  const slotFrameIdx = html.indexOf('id="slot-frame"');
  const slotSettledIdx = html.indexOf('id="slot-settled"');

  assert.ok(contextRegionIdx !== -1, "index.html must have #context-region");
  assert.ok(slotRecentIdx !== -1, "index.html must have #slot-recent");
  assert.ok(stableGridIdx !== -1, "index.html must have .stable-context-grid");
  assert.ok(slotFrameIdx !== -1, "index.html must have #slot-frame");
  assert.ok(slotSettledIdx !== -1, "index.html must have #slot-settled");

  // slot-recent must come before stable-context-grid, slot-frame, and slot-settled
  assert.ok(contextRegionIdx < slotRecentIdx, "#slot-recent must be inside #context-region");
  assert.ok(slotRecentIdx < stableGridIdx, "#slot-recent must precede .stable-context-grid");
  assert.ok(stableGridIdx < slotFrameIdx, "#slot-frame must be inside .stable-context-grid");
  assert.ok(stableGridIdx < slotSettledIdx, "#slot-settled must be inside .stable-context-grid");

  // CSS rules assertion for recent panel and stable context grid
  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.ok(css.includes(".panel-recent"), "CSS must style .panel-recent");
  assert.ok(css.includes(".stable-context-grid"), "CSS must style .stable-context-grid");
  assert.ok(css.includes(".panel-stable"), "CSS must style .panel-stable");
});

test("Recent Material Movement is a bounded semantic transition window, with legacy Recent Progress fallback", () => {
  const progressPath = path.join(__dirname, "..", "PROGRESS.md");
  const source = fs.readFileSync(progressPath, "utf-8");
  const { sections } = splitSections(md.parse(source, {}));
  const recentTokens = sections.get("recent material movement");
  assert.ok(recentTokens, "root PROGRESS.md must expose Recent Material Movement");
  const movements = parseMaterialMovements(recentTokens);
  assert.ok(movements.length >= 1 && movements.length <= 8, "Recent Material Movement must stay bounded");
  assert.equal(movements[0].title, "Presentation synthesis");
  assert.equal(movements[0].before, "MAP-FIRST");
  assert.equal(movements[0].after, "HORIZON-FIRST");
  assert.ok(movements.every((movement) => movement.hasStateTransition));

  const legacy = splitSections(md.parse(`
# Legacy
## Recent Progress
- **Semantic transition** → project state changed
`, {})).sections;
  assert.ok(legacy.get("recently completed"), "old Recent Progress remains a supported fallback");

  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.match(html, /현재 진행 문서 기준 · 단순 작업 나열이 아닌 프로젝트 상태의 핵심 전환/);
  const foregroundRule = css.indexOf("li:nth-child(-n + 2)");
  const backgroundRule = css.indexOf("li:nth-child(n + 3)");
  assert.ok(foregroundRule !== -1, "the newest two Recent Progress items need a foreground rule");
  assert.ok(backgroundRule !== -1, "older Recent Progress items need a receding rule");
  assert.ok(foregroundRule < backgroundRule, "foreground styling must precede older-item styling");
  assert.match(css.slice(foregroundRule, backgroundRule), /font-size: 0\.94rem/);
  assert.match(css.slice(backgroundRule), /font-size: 0\.82rem/);
});

test("Viewer refresh remains a PROGRESS.md re-render, not a Git refresh", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  assert.match(mainSource, /fetch\("\/progress\.md", \{ cache: "no-store" \}\)/);
  assert.match(mainSource, /new EventSource\("\/events"\)/);
  assert.doesNotMatch(mainSource, /\b(?:git|simple-git|isomorphic-git)\b/i);
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
  assert.equal(parsedMap.hasCurrentStage, true);
  const currentGroup = parsedMap.rails[1].groups.find((g) => isCurrentStageHeading(g.title));
  assert.equal(currentGroup?.items[0]?.title, "원내 실증");
  assert.equal(currentGroup?.items[0]?.isCurrentStage, true);

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
  assert.equal(singleParsed.hasCurrentStage, false);
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

test("Area details text formatting preserves available evidence subsections", () => {
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

test("Project horizon fixture: noisy low-level evidence stays out of Overview surfaces", () => {
  const filePath = path.join(__dirname, "fixtures", "project-horizon.md");
  const content = fs.readFileSync(filePath, "utf-8");

  const structure = checkProgressStructure(content);
  assert.equal(structure.ok, true, "project-horizon fixture should PASS structural check");

  const tokens = md.parse(content, {});
  const { sections } = splitSections(tokens);
  const overviewText = ["current situation", "next transition", "facing issues"]
    .map((key) => {
      const sectionTokens = sections.get(key);
      assert.ok(sectionTokens, `fixture must contain ${key} section`);
      return extractSectionRawText(sectionTokens);
    })
    .join("\n");

  const recentProgress = extractSectionRawText(sections.get("recent progress"));
  const areaDetailsIdx = content.indexOf("## 영역 상세");
  assert.ok(areaDetailsIdx !== -1);
  const areaDetailsText = content.slice(areaDetailsIdx, content.indexOf("## 현재 상황"));

  // Low-level evidence must be preserved in lower-level surfaces...
  const lowLevelMarkers = ["a1b2c3d", "POST /api/orders", "npm run test:integration", "CI run #4102"];
  for (const marker of lowLevelMarkers) {
    assert.ok(
      areaDetailsText.includes(marker) || recentProgress.includes(marker),
      `lower-level surface must preserve evidence marker: ${marker}`
    );
  }

  // ...but must not leak into the project-horizon Overview.
  for (const marker of lowLevelMarkers) {
    assert.ok(
      !overviewText.includes(marker),
      `Overview must not contain low-level evidence marker: ${marker}`
    );
  }
  assert.ok(!/\b[0-9a-f]{7,40}\b/.test(overviewText), "Overview must not contain commit SHAs");
  assert.ok(!/npm run/.test(overviewText), "Overview must not contain shell commands");

  // Overview must carry project-horizon semantics: categorized situation,
  // state transition with completion condition, and material constraint only.
  assert.ok(overviewText.includes("성과/범위"), "situation must be compressed into material categories");
  assert.ok(overviewText.includes("검증/준비도"));
  assert.ok(overviewText.includes("전환") && overviewText.includes("→"), "next transition must be a state transition");
  assert.ok(overviewText.includes("완료 조건"), "next transition must carry a completion condition");
  assert.ok(overviewText.includes("Proof Gap"), "facing issues must admit a project-level constraint");
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

test("Mental-model canonical aliases normalize and legacy aliases remain distinct fallbacks", () => {
  const canonical = splitSections(md.parse(`
# Model
## Project Horizon
orientation
## Stage Journey
### Current — Stage 1
- **CLOSED — Gate**
`, {})).sections;

  assert.ok(canonical.get("project horizon"));
  assert.ok(canonical.get("stage journey"));
  assert.equal(canonical.get("current situation"), undefined);

  const legacy = splitSections(md.parse(`
# Legacy
## 현재 상황
old orientation
`, {})).sections;
  const horizon = parseProjectHorizon(legacy.get("current situation"), true);
  assert.ok(horizon);
  assert.equal(horizon.isLegacyFallback, true);
  assert.equal(horizon.title, "현재 상황");
});

test("NextChart EMR acceptance fixture parses as a complex, non-telemetry mental model", () => {
  const { source, model } = readFixtureModel("nextchart-emr.md");
  const result = checkProgressStructure(source);

  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(model.horizon?.isLegacyFallback, false);
  assert.match(model.horizon?.summaryText ?? "", /NextChart/);
  assert.equal(model.stageJourney?.currentStage, "Stage 1A: Primary Care Baseline RC");
  assert.equal(model.stageJourney?.nextStage, "Stage 1B");
  assert.deepEqual(model.posture?.axes.map((axis) => axis.title), [
    "Core Product",
    "Production Truth",
    "Reliability",
    "Security",
    "External Breadth",
    "Delivery Readiness",
  ]);
  assert.equal(model.posture?.axes.find((axis) => axis.title === "Core Product")?.role, "core-capability");
  assert.equal(model.posture?.axes.find((axis) => axis.title === "Delivery Readiness")?.role, "delivery-readiness");
  assert.equal(model.frontiers.length, 1);
  assert.equal(model.frontiers[0].title, "Exact release convergence");
  assert.equal(model.frontiers[0].currentState, "NOT PROVEN");
  assert.equal(model.frontiers[0].targetState, "PROVEN");
  assert.equal(model.movements.length, 2);
  assert.ok(model.movements.every((movement) => movement.hasStateTransition));
  assert.match(model.frontiers[0].closedBoundaries, /HIRA sentinel/);
});

test("Cockpit acceptance fixture proves posture vocabulary is project-specific", () => {
  const { source, model } = readFixtureModel("cockpit-self.md");
  const result = checkProgressStructure(source);

  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(model.posture?.axes.map((axis) => axis.title), [
    "Core Viewer",
    "Model Fidelity",
    "Comprehension",
    "Portability",
    "Operational Simplicity",
    "Adoption Readiness",
  ]);
  assert.equal(model.posture?.axes.some((axis) => axis.title === "Production Truth"), false);
  assert.equal(model.frontiers[0].title, "Reader comprehension closure");
  assert.equal(model.frontiers[0].currentState, "DRAFT");
  assert.equal(model.frontiers[0].targetState, "INDEPENDENTLY ACCEPTED");
  assert.deepEqual(model.movements.map((movement) => movement.title), [
    "Presentation synthesis",
    "Inspector convergence",
  ]);
});

test("Stage Blocker remains separate from maturity and respects explicit negative wording", () => {
  const sections = splitSections(md.parse(`
# Stage blocker wording
## Project Posture
### Core Capability — STRONG
단계 blocker 아님.
### Delivery Readiness — PARTIAL
Stage blocker: yes
`, {})).sections;
  const posture = parseProjectPosture(sections.get("project posture"));

  assert.equal(posture?.axes[0]?.state, "STRONG");
  assert.equal(posture?.axes[0]?.isStageBlocker, false);
  assert.equal(posture?.axes[1]?.state, "PARTIAL");
  assert.equal(posture?.axes[1]?.isStageBlocker, true);
});

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

test("Legacy documents use a single non-duplicating Horizon fallback", () => {
  const { source, sections, model } = readFixtureModel("operational-system.md");
  const result = checkProgressStructure(source);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(model.horizon?.isLegacyFallback, true);
  assert.equal(Boolean(sections.get("project horizon")), false);
  assert.equal(model.frontiers.length, 0);
  assert.equal(model.movements.length, 0);
});

test("Reader-visible DOM follows Horizon → Stage/Posture → Frontier → Movement → Map and exposes one Inspector shell", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
  const ids = ["slot-horizon", "slot-stage", "slot-posture", "slot-frontier", "slot-threads", "slot-movement", "slot-map"];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position !== -1));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(html.includes('id="inspector-aside"'));
  assert.ok(html.includes('id="universal-inspector-panel"'));
  assert.ok(html.includes('id="inspector-breadcrumb"'));
  assert.ok(html.includes('id="inspector-related"'));

  const css = fs.readFileSync(path.join(__dirname, "..", "src", "style.css"), "utf-8");
  for (const selector of [".panel-horizon", ".stage-posture-grid", ".panel-frontier", ".panel-threads", ".panel-movement", ".universal-inspector-drawer"]) {
    assert.ok(css.includes(selector), `${selector} must have a presentation rule`);
  }
});

test("Stage entry conditions are parsed from labeled lines in declared fixtures", () => {
  const cockpit = readFixtureModel("cockpit-self.md");
  assert.equal(
    cockpit.model.stageJourney?.nextGates[0]?.entryCondition,
    "Reader-level comprehension is independently accepted at the Primary Frontier."
  );

  const emr = readFixtureModel("nextchart-emr.md");
  assert.equal(
    emr.model.stageJourney?.nextGates[0]?.entryCondition,
    "Stage 1A cannot be promoted until the exact release proof is admitted at the required boundary."
  );
});

test("Entry condition labels are semantic metadata and never contaminate summaries", () => {
  const markdown = `
# Entry Condition System

## 단계 여정

### 다음 — Stage 2
NOT OPEN
진입조건: Core reliability reaches STRONG.
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const journey = parseStageJourney(sections.get("stage journey"));
  const gate = journey?.nextGates[0];

  assert.equal(gate?.state, "NOT OPEN");
  assert.equal(gate?.entryCondition, "Core reliability reaches STRONG.");
  assert.ok(!gate?.summaryText.includes("진입"));
});

test("'Opens when' alias extracts entry condition from material gate blocks", () => {
  const markdown = `
# Entry Condition System

## Stage Journey

### Next — Stage 2
- **NOT OPEN — Adoption gate**
  Opens when: a fresh reader accepts the rendered cockpit.
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const journey = parseStageJourney(sections.get("stage journey"));

  assert.equal(journey?.nextGates[0]?.entryCondition, "a fresh reader accepts the rendered cockpit.");
});

test("Native map links its single current-stage group to the declared current stage", () => {
  const markdown = `
# Stage Linked Map

## 프로젝트 지도

### Product trajectory
#### 현재 단계
- **Release proof** — Exact release-level convergence
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const parsedMap = parseProjectMap(sections.get("project map"));

  const linked = renderNativeMap(parsedMap, null, undefined, "Stage 1A: Primary Care Baseline RC");
  assert.ok(linked.includes("stage-id-tag"));
  assert.ok(linked.includes("Stage 1A: Primary Care Baseline RC"));

  const unlinked = renderNativeMap(parsedMap);
  assert.ok(!unlinked.includes("stage-id-tag"));

  const ambiguousMarkdown = `
# Two Current Stages

## 프로젝트 지도

### Product trajectory
#### 현재 단계
- **Release proof** — One

### Delivery trajectory
#### 현재 단계
- **Ops readiness** — Two
`;

  const ambiguousTokens = md.parse(ambiguousMarkdown, {});
  const ambiguousMap = parseProjectMap(splitSections(ambiguousTokens).sections.get("project map"));
  const ambiguousHtml = renderNativeMap(ambiguousMap, null, undefined, "Stage 1A: Primary Care Baseline RC");
  assert.ok(!ambiguousHtml.includes("stage-id-tag"));
});

test("Semantic Tone Contract: Case 1 - Explicitly closed or 'none' remaining issues are neutral", () => {
  assert.equal(classifySubsectionTone("남은 문제", "없음"), "neutral");
  assert.equal(classifySubsectionTone("남은 문제", "해당 없음"), "neutral");
  assert.equal(classifySubsectionTone("남은 문제", "해당 없음."), "neutral");
  assert.equal(classifySubsectionTone("남은 문제", "남은 문제: 없음"), "neutral");
  assert.equal(classifySubsectionTone("남은 문제", "- 없음"), "neutral");
  assert.equal(classifySubsectionTone("직면한 문제", "해결됨"), "neutral");
  assert.equal(classifySubsectionTone("막힌 것", "닫힘"), "neutral");
});

test("Semantic Tone Contract: Case 2 - Genuine remaining problems and blockers are danger", () => {
  assert.equal(classifySubsectionTone("남은 문제", "- EMR 어댑터 스키마 불일치"), "danger");
  assert.equal(classifySubsectionTone("직면한 문제", "Vite 빌드 시 메모리 부족 현상"), "danger");
  assert.equal(classifySubsectionTone("막힌 것", "인증 토큰 갱신 실패"), "danger");
  assert.equal(classifySubsectionTone("remaining issues", "Network retry logic missing"), "danger");
  assert.equal(classifySubsectionTone("blocker", "Upstream API timeout"), "danger");
});

test("Semantic Tone Contract: Case 3 - Core area context subsections default to neutral", () => {
  assert.equal(classifySubsectionTone("의미", "유니버설 인스펙터의 단일 시맨틱 문법 정의"), "neutral");
  assert.equal(classifySubsectionTone("현재 수준", "기본 렌더러 구현 완료"), "neutral");
  assert.equal(classifySubsectionTone("meaning", "Primary interface for area drilldown"), "neutral");
  assert.equal(classifySubsectionTone("current level", "Initial release"), "neutral");
  assert.equal(classifySubsectionTone("이미 닫힌 경계", "레거시 모달 인스펙터 폐기"), "neutral");
  assert.equal(classifySubsectionTone("closed boundaries", "No global mutable state"), "neutral");
});

test("Semantic Tone Contract: Case 4 - Empty or resolved issues do not claim danger", () => {
  assert.equal(classifySubsectionTone("남은 문제", "All resolved."), "neutral");
  assert.equal(classifySubsectionTone("remaining issues", "none"), "neutral");
  assert.equal(classifySubsectionTone("remaining issues", "No remaining issues"), "neutral");
  assert.equal(classifySubsectionTone("남은 문제", ""), "neutral");
});

test("Semantic Tone Contract: Case 5 - Supporting evidence is evidence, but unverified/empty evidence is neutral", () => {
  // Concrete supporting evidence:
  assert.equal(
    classifySubsectionTone("근거", "Commit 94c02fd, npm test 58 pass across all synthetic fixtures"),
    "evidence"
  );
  assert.equal(
    classifySubsectionTone("증거", "실측치: 응답 지연 12ms (SLA 50ms 만족)"),
    "evidence"
  );
  assert.equal(
    classifySubsectionTone("evidence", "Test report EMR-2026-09 verifies boundary closure"),
    "evidence"
  );

  // Unverified, placeholder, or absent evidence must NOT be promoted to evidence:
  assert.equal(classifySubsectionTone("근거", ""), "neutral");
  assert.equal(classifySubsectionTone("근거", "미확인"), "neutral");
  assert.equal(classifySubsectionTone("근거", "UNKNOWN"), "neutral");
  assert.equal(classifySubsectionTone("근거", "NOT PROVEN"), "neutral");
  assert.equal(classifySubsectionTone("근거", "TBD"), "neutral");
  assert.equal(classifySubsectionTone("evidence", "unverified"), "neutral");
  assert.equal(classifySubsectionTone("evidence", "none"), "neutral");
});

test("Semantic Tone Contract: Case 6 - Transitions, entry conditions, and movement phases are active", () => {
  assert.equal(classifySubsectionTone("진입 조건", "Stage 1A release proof passes cleanly"), "active");
  assert.equal(classifySubsectionTone("개시 조건", "Reader acceptance verified"), "active");
  assert.equal(classifySubsectionTone("entry condition", "All checks green"), "active");
  assert.equal(classifySubsectionTone("opens when", "A fresh reader accepts the rendered cockpit"), "active");
  assert.equal(classifySubsectionTone("다음 전환", "Release 0.4.0 packaging"), "active");
  assert.equal(classifySubsectionTone("next transition", "Contract migration"), "active");
  assert.equal(classifySubsectionTone("왜 지금", "Legacy drift causing friction"), "active");
  assert.equal(classifySubsectionTone("단계 영향", "Directly blocks Stage 2 promotion"), "active");
  assert.equal(classifySubsectionTone("BEFORE", "Legacy modal inspector"), "active");
  assert.equal(classifySubsectionTone("MATERIAL CHANGE", "Universal Inspector with deterministic tone contract"), "active");
  assert.equal(classifySubsectionTone("AFTER", "Unified inspector drawer"), "active");
});

test("Semantic Tone Contract: Case 7 - Unknown custom subsections fall back safely to neutral", () => {
  assert.equal(classifySubsectionTone("기타 메모", "추후 고려할 아이디어 목록"), "neutral");
  assert.equal(classifySubsectionTone("히스토리", "과거 회의록 요약"), "neutral");
  assert.equal(classifySubsectionTone("FAQ", "자주 묻는 질문"), "neutral");
  assert.equal(classifySubsectionTone("custom section", "arbitrary developer notes"), "neutral");
});

test("Semantic Tone Contract: AreaDetail parser populates tone field accurately across diverse subsections", () => {
  const doc = `
# 시맨틱 톤 테스트 문서

## 프로젝트 지도
### 코어 트랙
#### 현재 단계
- **인스펙터 코어** — Universal Inspector 모듈

## 영역 상세
### 인스펙터 코어
#### 의미
유니버설 인스펙터의 시맨틱 시각 문법을 정의합니다.
#### 현재 수준
모든 엔티티 서브섹션 톤 분류 규칙이 수립되었습니다.
#### 진입 조건
Reader-level acceptance가 완료되어야 합니다.
#### 남은 문제
- 다크모드 콘트라스트 미세 조정 필요
#### 근거
Commit af97c57 및 유닛 테스트 60+ 건 통과
#### 기타 메모
외부 디자인 시스템 확장은 범위 밖입니다.
`;

  const tokens = md.parse(doc, {});
  const { sections } = splitSections(tokens);
  const details = parseAreaDetails(sections.get("area details"));
  const area = details.get("인스펙터 코어");
  assert.ok(area);

  const meaning = area.subsections.find((s) => s.subheading === "의미");
  const current = area.subsections.find((s) => s.subheading === "현재 수준");
  const entry = area.subsections.find((s) => s.subheading === "진입 조건");
  const remaining = area.subsections.find((s) => s.subheading === "남은 문제");
  const evidence = area.subsections.find((s) => s.subheading === "근거");
  const notes = area.subsections.find((s) => s.subheading === "기타 메모");

  assert.equal(meaning?.tone, "neutral");
  assert.equal(current?.tone, "neutral");
  assert.equal(entry?.tone, "active");
  assert.equal(remaining?.tone, "danger");
  assert.equal(evidence?.tone, "evidence");
  assert.equal(notes?.tone, "neutral");
});

test("Semantic Tone Repair: unverified / planned-only evidence stays neutral", () => {
  // Required adversarial cases
  assert.equal(classifySubsectionTone("근거", "아직 근거 없음"), "neutral");
  assert.equal(classifySubsectionTone("근거", "테스트 예정"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "Verification required"), "neutral");

  // Representative Korean wording (bounded, phrase-level only)
  assert.equal(classifySubsectionTone("근거", "검증 예정"), "neutral");
  assert.equal(classifySubsectionTone("근거", "확인 필요"), "neutral");
  assert.equal(classifySubsectionTone("근거", "추후 검증"), "neutral");
  assert.equal(classifySubsectionTone("근거", "미검증"), "neutral");
  assert.equal(classifySubsectionTone("근거", "근거: 아직 근거 없음"), "neutral");
  assert.equal(classifySubsectionTone("근거", "- 테스트 예정"), "neutral");
  assert.equal(classifySubsectionTone("근거", "향후 작업"), "neutral");
  assert.equal(classifySubsectionTone("근거", "추후 과제"), "neutral");

  // Representative English wording (bounded, phrase-level only)
  assert.equal(classifySubsectionTone("Evidence", "NOT VERIFIED"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "NO EVIDENCE"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "To be verified"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "UNKNOWN"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "UNVERIFIED"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "NOT PROVEN"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "TBD"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "N/A"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "planned"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "future-work"), "neutral");
  assert.equal(classifySubsectionTone("Evidence", "future work"), "neutral");
});

test("Semantic Tone Repair: concrete and mixed evidence stays evidence", () => {
  // Required adversarial cases
  assert.equal(classifySubsectionTone("근거", "66 tests passed"), "evidence");
  // Concrete evidence + future plan stays evidence
  assert.equal(classifySubsectionTone("근거", "66 tests passed; 추가 테스트 예정"), "evidence");
  assert.equal(classifySubsectionTone("근거", "브라우저에서 실제 동작 확인됨"), "evidence");

  // Representative mixed content: secured evidence first, follow-up plan appended
  assert.equal(
    classifySubsectionTone("근거", "commit abcdef1에서 수정 확인, 배포 검증은 추후 예정"),
    "evidence"
  );
  assert.equal(
    classifySubsectionTone("Evidence", "Test report EMR-2026-09 verifies boundary closure; follow-up verification pending"),
    "evidence"
  );
});

test("Semantic Tone Repair: incidental keywords never promote custom subsections", () => {
  // Heading isolation over body keywords
  assert.equal(
    classifySubsectionTone("검토 메모", "근거 자료를 검토했고 문제 후보와 예정된 후속 작업을 메모함"),
    "neutral"
  );
  assert.equal(
    classifySubsectionTone("검토 메모", "이 근거와 저 문제, 그리고 예정 사항을 함께 정리함"),
    "neutral"
  );

  // Existing regression: explicitly closed remaining problems stay neutral
  assert.equal(classifySubsectionTone("남은 문제", "남은 문제: 없음"), "neutral");

  // Existing regression: real unresolved issues stay danger
  assert.equal(classifySubsectionTone("남은 문제", "대용량 동시 요청 시 쿼리 타임아웃 발생"), "danger");
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

test("RECONSTRUCT regression: evidence-rich map/details with blank stable context is structural PASS, not semantic acceptance", () => {
  const filePath = path.join(__dirname, "fixtures", "reconstruct-incomplete-stable-context.md");
  const content = fs.readFileSync(filePath, "utf-8");
  const result = checkProgressStructure(content);

  // The fixture intentionally proves the boundary: structural validation sees
  // complete map/detail correspondence even though the RECONSTRUCT model is
  // not reader-complete.
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.totalMapItems, 3);
  assert.equal(result.matchedDetails, 3);
  assert.equal(result.missingDetails, 0);
  assert.equal(result.orphanDetails, 0);

  const report = formatStructuralCheckReport(result);
  assert.match(report, /^PROGRESS structural check: PASS/m);

  const { sections } = splitSections(md.parse(content, {}));
  for (const key of ["project frame", "settled direction", "recently completed"]) {
    assert.equal(
      extractSectionRawText(sections.get(key) ?? []).trim(),
      "",
      `${key} must be blank in the intentional regression fixture`
    );
  }

  // These are legacy Horizon headings in the fixture; their empty bodies are
  // also part of the incomplete reader-facing model shape.
  for (const key of ["current situation", "next transition"]) {
    assert.equal(
      extractSectionRawText(sections.get(key) ?? []).trim(),
      "",
      `${key} must be blank in the intentional regression fixture`
    );
  }
});

test("RECONSTRUCT regression control: complete fixture populates stable context unlike incomplete fixture", () => {
  // Negative / control inspection:
  // Both fixtures pass structural check, but only the complete fixture satisfies
  // the semantic condition that stable context surfaces are populated rather than silently blank.
  const incompletePath = path.join(__dirname, "fixtures", "reconstruct-incomplete-stable-context.md");
  const completePath = path.join(__dirname, "fixtures", "operational-system.md");

  const incompleteContent = fs.readFileSync(incompletePath, "utf-8");
  const completeContent = fs.readFileSync(completePath, "utf-8");

  const incompleteCheck = checkProgressStructure(incompleteContent);
  const completeCheck = checkProgressStructure(completeContent);

  assert.equal(incompleteCheck.ok, true);
  assert.equal(completeCheck.ok, true);

  const incompleteSections = splitSections(md.parse(incompleteContent, {})).sections;
  const completeSections = splitSections(md.parse(completeContent, {})).sections;

  // Incomplete fixture has blank stable context
  const incompleteGoal = extractSectionRawText(incompleteSections.get("project frame") ?? []).trim();
  const incompleteDirection = extractSectionRawText(incompleteSections.get("settled direction") ?? []).trim();
  assert.equal(incompleteGoal, "");
  assert.equal(incompleteDirection, "");

  // Complete fixture has populated stable context (or non-blank explicit boundary)
  const completeGoal = extractSectionRawText(completeSections.get("project frame") ?? []).trim();
  const completeDirection = extractSectionRawText(completeSections.get("settled direction") ?? []).trim();
  assert.ok(completeGoal.length > 0, "Complete fixture must populate project frame");
  assert.ok(completeDirection.length > 0, "Complete fixture must populate settled direction");
});

test("README RECONSTRUCT contract requires final synthesis beyond cockpit check", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");

  assert.ok(readme.includes("RECONSTRUCT 또는 full rebuild라면 최종 project-model synthesis와 reader-facing semantic acceptance 완료"));
  assert.ok(readme.includes("evidence collection/subagent exploration을 completion으로 취급하지 말고"));
  assert.ok(readme.includes("Product Goal / Project Frame, Settled Direction"));
  assert.ok(readme.includes("blank/placeholder로 남기면 acceptance failure"));
  assert.ok(readme.includes("`cockpit check` PASS는 구조적 사전 검사일 뿐 semantic acceptance가 아니다."));
  assert.ok(readme.includes("`COLD_READ_JUDGE_REQUIRED`"));
  assert.ok(readme.includes("BLANK != UNKNOWN"));
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

test("Handoff context extraction: sibling module owns implementation, parser facade re-exports it", async () => {
  const sibling = await import("../dist/handoff-context.js");
  assert.equal(typeof sibling.buildFocusHandoffContext, "function");
  assert.equal(typeof sibling.buildAreaHandoffContext, "function");
  assert.equal(buildFocusHandoffContext, sibling.buildFocusHandoffContext);
  assert.equal(buildAreaHandoffContext, sibling.buildAreaHandoffContext);
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

test("Stage proof disposition: card and inspector surfaces expose reason with FAILED danger reuse", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  assert.ok(mainSource.includes('subsection("판정 이유"'));
  assert.ok(mainSource.includes("stage-gate-reason"));
  assert.ok(mainSource.includes("현재 admissible proof가 확인되지 않음 — failure와 동일한 의미는 아님"));
  assert.ok(mainSource.includes('gate.state === "NOT PROVEN"'));

  const css = fs.readFileSync(path.join(__dirname, "..", "src", "style.css"), "utf-8");
  assert.ok(css.includes(".state-failed"));
  const dangerIdx = css.indexOf(".state-failed");
  assert.ok(css.slice(Math.max(0, dangerIdx - 200), dangerIdx + 200).includes("#fecaca"));

  const parserSource = fs.readFileSync(path.join(__dirname, "..", "src", "parser.ts"), "utf-8");
  assert.ok(parserSource.includes('"FAILED"'));
  assert.ok(parserSource.includes("decisionReason"));
  assert.ok(parserSource.includes("판정 이유"));

  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  assert.ok(readme.includes("FAILED"));
  assert.ok(readme.includes("판정 이유:"));
  assert.ok(readme.includes("Decision reason:"));
  assert.ok(readme.includes("stage-gate-proof-disposition.md"));
});

test("Area-Local vs Project-Global Frontier Ownership: provider-local admission vs project-wide release proof", () => {
  // WHERE-the-residual-is-owned rule: Area Details owns AREA_LOCAL residual only;
  // PROJECT_GLOBAL_FRONTIER stays on the project-horizon surface. This adds to,
  // not replaces, the existing WHAT-is-a-residual rule.
  const content = fs.readFileSync(path.join(__dirname, "fixtures", "area-frontier-ownership.md"), "utf-8");
  const structure = checkProgressStructure(content);
  assert.equal(structure.ok, true, structure.errors.join("; "));
  assert.equal(structure.totalMapItems, 3);
  assert.equal(structure.matchedDetails, 3);

  const { sections } = splitSections(md.parse(content, {}));
  const areaDetails = parseAreaDetails(sections.get("area details"));
  const model = parseMentalModel(sections);
  const subsectionText = (area, label) =>
    area?.subsections.find((s) => s.subheading.includes(label))?.rawText ?? "";

  const provider = areaDetails.get(normalizeTitle("Provider admission"));
  assert.ok(provider, "Provider admission area must exist");
  const providerLevel = subsectionText(provider, "현재 수준");
  const providerRemaining = subsectionText(provider, "남은 문제");
  assert.match(providerLevel, /Live admission.*NOT PROVEN/);
  assert.match(providerRemaining, /Live admission handshake.*NOT PROVEN/);
  assert.ok(
    providerLevel.includes("관련 최전선: Exact release convergence"),
    "provider area may reference the global frontier as context"
  );
  assert.equal(
    providerRemaining.includes("Exact release convergence"),
    false,
    "provider Remaining Problems must not carry the project-wide release proof"
  );

  assert.equal(model.frontiers.length, 1);
  assert.equal(model.frontiers[0].title, "Exact release convergence");
  assert.equal(model.frontiers[0].currentState, "NOT PROVEN");
  assert.equal(model.frontiers[0].targetState, "PROVEN");
});
