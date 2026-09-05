import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { normalizeTitle, normalizeKey, isCurrentStageHeading } from "../dist/authoring-grammar.js";
import {
  splitSections,
  extractSectionRawText,
} from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
  findAreaDetail,
  parseDocument,
} from "../dist/semantic-construction.js";
import { checkProgressStructure, formatStructuralCheckReport, getAreaCompleteness } from "../dist/structural-check.js";
import {
  renderNativeMap,
  formatProjectMapText,
  formatAreaDetailsText,
} from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

function readFixtureSections(filename) {
  const source = fs.readFileSync(path.join(__dirname, "fixtures", filename), "utf-8");
  const tokens = md.parse(source, {});
  const { title, sections } = splitSections(tokens);
  return { source, title, sections };
}

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

  // Rail 1: plain project vocabulary
  const rail1 = parsedMap.rails[0];
  assert.equal("railType" in rail1, false, "rails carry no journey typology");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: rail owning '현재 단계'; other groups are ordinary project vocabulary
  const rail2 = parsedMap.rails[1];
  assert.equal("railType" in rail2, false, "rails carry no journey typology");
  assert.equal(rail2.groups.length, 3);
  assert.equal(parsedMap.hasCurrentStage, true, "Current Stage group must set hasCurrentStage to true");

  // Rail 3: plain project vocabulary
  const rail3 = parsedMap.rails[2];
  assert.equal("railType" in rail3, false, "rails carry no journey typology");
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
  assert.ok(sections.get("situation"), "## 현재 상황 slot parsed");
  assert.ok(sections.get("next"), "## 다음 전환 slot parsed");
  assert.ok(sections.get("facing"), "## 직면한 문제 slot parsed");
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

  // Rail 1: Storage Subsystem (plain project vocabulary)
  const rail1 = parsedMap.rails[0];
  assert.equal("railType" in rail1, false, "rails carry no journey typology");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Distributed Consensus & Replication (rail owning 'Current Stage')
  const rail2 = parsedMap.rails[1];
  assert.equal("railType" in rail2, false, "rails carry no journey typology");
  assert.equal(rail2.groups.length, 3);
  assert.equal(parsedMap.hasCurrentStage, true, "Current Stage group must set hasCurrentStage to true");

  // Rail 3: Cloud Storage & WAN (plain project vocabulary)
  const rail3 = parsedMap.rails[2];
  assert.equal("railType" in rail3, false, "rails carry no journey typology");
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
  assert.ok(sections.get("situation"), "## Current Situation parsed");
  assert.ok(sections.get("next"), "## Next Transition parsed");
  assert.ok(sections.get("facing"), "## Facing Issues parsed");
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

  // Rail 1: Data collection and cohort cleaning
  const rail1 = parsedMap.rails[0];
  assert.equal("railType" in rail1, false, "rails carry no journey typology");
  assert.equal(rail1.groups.length, 2);

  // Rail 2: Statistical analysis & modeling (rail owning '현재 단계')
  const rail2 = parsedMap.rails[1];
  assert.equal("railType" in rail2, false, "rails carry no journey typology");
  assert.equal(rail2.groups.length, 2);
  assert.equal(parsedMap.hasCurrentStage, true, "Current Stage group must set hasCurrentStage to true");

  // Rail 3: Multicenter clinical validation
  const rail3 = parsedMap.rails[2];
  assert.equal("railType" in rail3, false, "rails carry no journey typology");
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
  assert.ok(sections.get("situation"), "## 현재 상황 slot parsed");
  assert.ok(sections.get("next"), "## 다음 전환 slot parsed");
  assert.ok(sections.get("facing"), "## 직면한 문제 slot parsed");
  assert.ok(sections.get("project frame"), "## 제품 목표 slot parsed");
  assert.ok(sections.get("settled direction"), "## 확정된 방향 slot parsed");
});

test("Recent changes stay a bounded semantic transition window under one merged owner", () => {
  const progressPath = path.join(__dirname, "..", "PROGRESS.md");
  const source = fs.readFileSync(progressPath, "utf-8");
  const { sections } = splitSections(md.parse(source, {}));
  const recentTokens = sections.get("recent");
  assert.ok(recentTokens, "root PROGRESS.md must expose the merged Recent section");
  const recentText = extractSectionRawText(recentTokens);
  const items = recentText.split(/\r?\n/).filter((line) => /^[-*+]\s+/.test(line));
  assert.ok(items.length >= 1 && items.length <= 8, "Recent changes must stay a bounded rolling window");
  assert.ok(recentText.includes("→"), "recent items read as change → consequence");

  // Legacy headings resolve into the same single owner — no dual canonical model.
  const legacyHeads = [
    "## Recent Progress",
    "## Recent Material Movement",
    "## 최근 진척",
    "## 최근 실질적 변화",
  ];
  for (const head of legacyHeads) {
    const legacy = splitSections(md.parse(`# Legacy\n${head}\n- **Semantic transition** → project state changed\n`, {})).sections;
    assert.ok(legacy.get("recent"), `${head} must resolve into the merged Recent owner`);
  }

  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // Product display vocabulary: the Recent panel reads as a self-sufficient
  // title with no definition-demanding helper. (Semantic owner stays `recent`.)
  assert.match(html, /<h2>최근 업데이트<\/h2>/);
  const foregroundRule = css.indexOf("li:nth-child(-n + 2)");
  const backgroundRule = css.indexOf("li:nth-child(n + 3)");
  assert.ok(foregroundRule !== -1, "the newest two Recent items need a foreground rule");
  assert.ok(backgroundRule !== -1, "older Recent items need a receding rule");
  assert.ok(foregroundRule < backgroundRule, "foreground styling must precede older-item styling");
  // Visual-hierarchy convergence: Recent sizes are owned by the :root scale
  // tokens, not by local literals. Semantic roles in the context region:
  // SECTION_HEADING (--text-l2-section) > ITEM_TITLE (--text-recent-new) >
  // BODY (--text-l4-stable) > META (--text-recent-old). Foreground li owns
  // BODY; its leading strong owns ITEM_TITLE; older li owns META.
  const foregroundSlice = css.slice(foregroundRule, backgroundRule);
  assert.match(foregroundSlice, /var\(--text-l4-stable/);
  const itemTitleRule = css.indexOf("li:nth-child(-n + 2) strong");
  assert.ok(itemTitleRule !== -1, "foreground entry titles need an ITEM_TITLE rule");
  assert.match(css.slice(itemTitleRule, itemTitleRule + 500), /var\(--text-recent-new/);
  assert.match(css.slice(backgroundRule), /var\(--text-recent-old/);
  const sectionTok = css.match(/--text-l2-section:\s*([0-9.]+)rem/);
  const recentNew = css.match(/--text-recent-new:\s*([0-9.]+)rem/);
  const stableBody = css.match(/--text-l4-stable:\s*([0-9.]+)rem/);
  const recentOld = css.match(/--text-recent-old:\s*([0-9.]+)rem/);
  assert.ok(sectionTok && recentNew && stableBody && recentOld, "the :root scale must define section/item/body/meta tokens");
  assert.equal(sectionTok[1], "0.88");
  assert.equal(recentNew[1], "0.84");
  assert.equal(stableBody[1], "0.81");
  assert.equal(recentOld[1], "0.78");
  assert.ok(
    Number(sectionTok[1]) > Number(recentNew[1]) &&
    Number(recentNew[1]) > Number(stableBody[1]) &&
    Number(stableBody[1]) > Number(recentOld[1]),
    "context-region hierarchy must read SECTION > ITEM > BODY > META"
  );
  // Stable headings share the single section treatment — no quiet exception.
  const stableH2 = css.indexOf(".panel-stable h2");
  assert.ok(stableH2 !== -1, "stable context needs a section-heading rule");
  assert.match(css.slice(stableH2, stableH2 + 600), /var\(--text-l2-section/);
  // No 700-weight bold wall: entry titles and inline emphasis converge to 600.
  assert.match(css.slice(itemTitleRule, itemTitleRule + 500), /font-weight:\s*600/);
});

test("Independent multi-rail mental-model axis invariants: single Current Stage ownership and plain-rail coexistence", () => {
  // Case A: Multi-rail map with 1 plain operational rail and 1 rail owning the position marker
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

  // Rail 1: plain operational rail
  assert.equal(parsedMap.rails[0].title, "도메인 및 운영 모델");
  assert.equal("railType" in parsedMap.rails[0], false, "rails carry no journey typology");
  assert.equal(parsedMap.rails[0].groups.length, 1);
  assert.equal(parsedMap.rails[0].groups[0].items.length, 2);

  // Rail 2: rail owning Current Stage; sibling groups are ordinary vocabulary
  assert.equal(parsedMap.rails[1].title, "도입 및 검증 여정");
  assert.equal("railType" in parsedMap.rails[1], false, "rails carry no journey typology");
  assert.equal(parsedMap.rails[1].groups.length, 3);
  assert.equal(parsedMap.hasCurrentStage, true);
  const currentGroup = parsedMap.rails[1].groups.find((g) => isCurrentStageHeading(g.title));
  assert.equal(currentGroup?.items[0]?.title, "원내 실증");
  assert.equal(currentGroup?.items[0]?.isCurrentStage, true);

  const renderedHtml = renderNativeMap(parsedMap);
  assert.ok(renderedHtml.includes("map-rail-neutral"));
  assert.equal(renderedHtml.includes("map-rail-trajectory"), false, "journey rail typology must not leak into markup");
  assert.ok(renderedHtml.includes("도메인 및 운영 모델"));
  assert.ok(renderedHtml.includes("도입 및 검증 여정"));
  assert.ok(renderedHtml.includes("현재 단계"));
  assert.equal(renderedHtml.includes("NOW ·"), false, "map must not expose internal shorthand");

  // Case B: Single plain rail (no current stage anywhere)
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
  assert.equal("railType" in singleParsed.rails[0], false, "rails carry no journey typology");
  assert.equal(singleParsed.hasCurrentStage, false);
});

test("Fixture verification: visual-test-focus.md (Current Focus + single global Current Stage + neutral rails)", () => {
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
  assert.equal(result.currentStageCount, 1);
  assert.equal(result.currentFocusCount, 1);

  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.rails.length, 3);
  assert.ok(parsedMap.rails.every((rail) => !("railType" in rail)), "rails carry no journey typology");
});

test("Fixture verification: visual-test-nofocus.md (No Current Focus + single position-marked rail)", () => {
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

test("Project horizon fixture: noisy low-level evidence stays out of Overview surfaces", () => {
  const filePath = path.join(__dirname, "fixtures", "project-horizon.md");
  const content = fs.readFileSync(filePath, "utf-8");

  const structure = checkProgressStructure(content);
  assert.equal(structure.ok, true, "project-horizon fixture should PASS structural check");

  const tokens = md.parse(content, {});
  const { sections } = splitSections(tokens);
  const overviewText = ["situation", "next", "facing"]
    .map((key) => {
      const sectionTokens = sections.get(key);
      assert.ok(sectionTokens, `fixture must contain ${key} section`);
      return extractSectionRawText(sectionTokens);
    })
    .join("\n");

  const recentProgress = extractSectionRawText(sections.get("recent"));
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
  assert.ok(overviewText.includes("전환") && overviewText.includes("→"), "next must be a state transition");
  assert.ok(overviewText.includes("완료 조건"), "next must carry a completion condition");
  assert.ok(overviewText.includes("Proof Gap"), "facing must admit a project-level constraint");
});

test("Contracted aliases resolve into one owner per reader question", () => {
  // Now: canonical + legacy Horizon headings share the merged Situation owner.
  for (const head of ["## Project Horizon", "## 프로젝트 지평", "## 현재 상황", "## Current Situation", "## 지금"]) {
    const sections = splitSections(md.parse(`# Model\n${head}\norientation\n`, {})).sections;
    assert.ok(sections.get("situation"), `${head} must resolve into the merged Situation owner`);
  }
  // Next: canonical + legacy Frontier headings share the merged Next owner.
  for (const head of ["## Current Frontier", "## 현재 최전선", "## 다음 전환", "## Next Transition", "## 다음"]) {
    const sections = splitSections(md.parse(`# Model\n${head}\nA → B\n`, {})).sections;
    assert.ok(sections.get("next"), `${head} must resolve into the merged Next owner`);
  }
  // Recent: canonical + legacy Movement headings share the merged Recent owner.
  for (const head of ["## Recent Material Movement", "## 최근 실질적 변화", "## 최근 진척", "## Recent Progress"]) {
    const sections = splitSections(md.parse(`# Model\n${head}\n- **Change** → consequence\n`, {})).sections;
    assert.ok(sections.get("recent"), `${head} must resolve into the merged Recent owner`);
  }
  // Removed owners resolve to nothing canonical: old Stage/Posture/Threads
  // headings render as secondary extra context, never as canonical slots.
  for (const head of ["## Stage Journey", "## 단계 여정", "## Project Posture", "## 프로젝트 상태", "## Strategic Threads", "## 전략적 흐름"]) {
    const sections = splitSections(md.parse(`# Model\n${head}\nbody\n`, {})).sections;
    assert.equal(sections.get("situation"), undefined, `${head} must not claim the Situation slot`);
    assert.equal(sections.get("next"), undefined, `${head} must not claim the Next slot`);
    assert.equal(sections.get("recent"), undefined, `${head} must not claim the Recent slot`);
  }
});

test("NextChart EMR acceptance fixture restores orientation from the primary surface", () => {
  const { source, title, sections } = readFixtureSections("nextchart-emr.md");
  const result = checkProgressStructure(source);

  assert.equal(result.ok, true, result.errors.join("; "));
  // Reader questions answered without taxonomy study:
  const situation = extractSectionRawText(sections.get("situation"));
  const next = extractSectionRawText(sections.get("next"));
  const facing = extractSectionRawText(sections.get("facing"));
  const recent = extractSectionRawText(sections.get("recent"));
  assert.match(situation, /NextChart/, "purpose/state restorable from Now");
  assert.match(next, /→/, "nearest transition restorable from Next");
  assert.ok(facing.length > 0, "material constraint restorable from Blocked");
  assert.match(recent, /→/, "arrival path restorable from Recent");
  // Map structure + current position intact:
  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.isNativeMap, true);
  assert.equal(parsedMap.hasCurrentStage, true);
  const CURRENT_TITLE = "1A 출시 승인에 필요한 전체 증거 모으기";
  assert.ok(parsedMap.rails.flatMap((rail) => rail.groups).flatMap((group) => group.items).some((item) => item.title === CURRENT_TITLE));
  const areaDetails = parseAreaDetails(sections.get("area details"));
  assert.ok(areaDetails.get(normalizeTitle(CURRENT_TITLE)), "current-position area drills into evidence");
  // Concrete natural-language reporting: titles/descriptions read as product
  // language without abstract-ontology decoding.
  const allItems = parsedMap.rails.flatMap((rail) => rail.groups).flatMap((group) => group.items);
  for (const item of allItems) {
    assert.ok(/[가-힣]/.test(item.title), `map title reads as product language: ${item.title}`);
    assert.ok(/[가-힣]/.test(item.description), `map description reads as product behavior: ${item.title}`);
  }
  for (const banned of ["Representative outpatient workflow", "Production truth", "Reliability & recovery", "Release proof", "External breadth"]) {
    assert.ok(!allItems.some((item) => item.title === banned), `abstract title must not return: ${banned}`);
  }
  // CONCRETE-BEFORE-ABSTRACT synthesis density. Test-owned only:
  // structural check stays structural-only (no prose regex in src/).
  // Major state sentences must preserve concrete project truth instead of
  // abstract-only ontology ("통합·실체·완결·기반·성숙도" alone).
  for (const banned of ["외부 연동 실체", "대표 외래 흐름 완결", "실제 제품 화면과 실제 영속 경계를 관통"]) {
    assert.ok(!source.includes(banned), `abstract-only phrasing must not return: ${banned}`);
  }
  // Situation: actual workflow confirmed + authoritative boundary + most
  // important unfinished boundary (not role-only, not abstract-only).
  assert.ok(
    situation.includes("접수") && situation.includes("진료") && situation.includes("처방"),
    "situation preserves actual outpatient workflow"
  );
  assert.ok(
    situation.includes("병원") && situation.includes("원본"),
    "situation preserves authoritative boundary (hospital original vs screen)"
  );
  assert.ok(
    situation.includes("1A") && (situation.includes("아직") || situation.includes("남아")),
    "situation names most important unfinished boundary"
  );
  assert.ok(situation.includes("이어"), "situation preserves continuity protection state");
  // Next: not abstract A→B names only; which object/workflow passes what to close.
  assert.ok(
    next.includes("접수") || next.includes("원본") || next.includes("이어가"),
    "next preserves concrete object/workflow, not abstract state names only"
  );
  assert.ok(
    next.includes("인정되면") && next.includes("닫힌"),
    "next carries observable closure condition"
  );
  assert.ok(next.includes("다시 열지"), "next does not reopen closed representative scope");
  // Facing: not category names; exactly what is unconnected/unverified/blocked.
  assert.ok(
    facing.includes("한 곳") && facing.includes("좁은 범위"),
    "facing specifies what is unverified (not category name alone)"
  );
  assert.ok(
    facing.includes("고장이 아니다") || facing.includes("직접 막는 blocker는 아니다"),
    "facing distinguishes fault vs deferred constraint without inventing blocker"
  );
  // Overview stays compressed: low-level proof lives below, product truth stays above.
  const overviewText = [situation, next, facing].join("\n");
  assert.ok(!/\b[0-9a-f]{7,40}\b/.test(overviewText), "overview stays compressed (no SHAs)");
  assert.ok(!/npm run/.test(overviewText), "overview stays compressed (no commands)");
  // Area current levels: actual possible action/state, not evaluation-only.
  const currentLevelOf = (areaTitle) => {
    const detail = areaDetails.get(normalizeTitle(areaTitle));
    assert.ok(detail, `area detail exists: ${areaTitle}`);
    const current = detail.subsections.find((s) => s.subheading.includes("현재 수준"));
    assert.ok(current, `area has 현재 수준: ${areaTitle}`);
    return current.rawText;
  };
  assert.ok(
    currentLevelOf("외래 접수·진료·처방 흐름").includes("접수→진료"),
    "flow area states observable workflow, not evaluation-only"
  );
  const originalLevel = currentLevelOf("실제 병원 원본과 화면 일치 확인");
  assert.ok(
    originalLevel.includes("한 곳") && originalLevel.includes("1A"),
    "original-match area states concrete unfinished boundary"
  );
  assert.ok(
    currentLevelOf("느려지거나 끊겨도 기록이 이어지는 보호").includes("사라지지 않고"),
    "continuity area states observable protection"
  );
  const currentPositionLevel = currentLevelOf("1A 출시 승인에 필요한 전체 증거 모으기");
  assert.ok(
    currentPositionLevel.includes("아직 인정되지") && currentPositionLevel.includes("다시 열지"),
    "current-position area states unfinished + closure without reopening"
  );
  void title;
});

test("Cockpit self fixture restores orientation from the primary surface", () => {
  const { source, sections } = readFixtureSections("cockpit-self.md");
  const result = checkProgressStructure(source);

  assert.equal(result.ok, true, result.errors.join("; "));
  const situation = extractSectionRawText(sections.get("situation"));
  const next = extractSectionRawText(sections.get("next"));
  assert.match(situation, /Cockpit/);
  assert.match(next, /→/);
  assert.ok(extractSectionRawText(sections.get("recent")).includes("→"));
  const parsedMap = parseProjectMap(sections.get("project map"));
  assert.equal(parsedMap.isNativeMap, true);
});

test("Native map marks its single current-stage group as YOU ARE HERE with no journey label", () => {
  const markdown = `
# Position Marked Map

## 프로젝트 지도

### Product areas
#### 현재 단계
- **Release proof** — Exact release-level convergence
`;

  const tokens = md.parse(markdown, {});
  const { sections } = splitSections(tokens);
  const parsedMap = parseProjectMap(sections.get("project map"));

  const html = renderNativeMap(parsedMap);
  assert.ok(html.includes("group-current-stage"), "position group highlights");
  assert.ok(html.includes("card-current-stage"), "position items highlight");
  assert.ok(html.includes("현재 단계"), "position tag reads plainly");
  assert.equal(html.includes("stage-id-tag"), false, "no Stage-Gate label survives");
  assert.equal(html.includes("trajectory"), false, "no journey typology leaks into markup");
  assert.equal(html.includes("card-foundation"), false, "no privileged foundation cards");
  assert.equal(html.includes("card-future"), false, "no privileged future cards");

  const ambiguousMarkdown = `
# Two Current Stages

## 프로젝트 지도

### Product areas
#### 현재 단계
- **Release proof** — One

### Delivery areas
#### 현재 단계
- **Ops readiness** — Two
`;

  const ambiguousTokens = md.parse(ambiguousMarkdown, {});
  const ambiguousMap = parseProjectMap(splitSections(ambiguousTokens).sections.get("project map"));
  const ambiguousHtml = renderNativeMap(ambiguousMap);
  assert.ok(ambiguousHtml.includes("group-current-stage"));
  assert.equal(ambiguousHtml.includes("stage-id-tag"), false);
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
  for (const key of ["project frame", "settled direction", "recent"]) {
    assert.equal(
      extractSectionRawText(sections.get(key) ?? []).trim(),
      "",
      `${key} must be blank in the intentional regression fixture`
    );
  }

  // These are legacy Horizon headings in the fixture; their empty bodies are
  // also part of the incomplete reader-facing model shape.
  for (const key of ["situation", "next"]) {
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
