import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { normalizeTitle, normalizeKey, isCurrentStageHeading, isFoundationHeading, isFutureHeading } from "../dist/authoring-grammar.js";
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
  // tokens, not by local literals. The pinned contract is the ordering
  // invariant plus the exact token values.
  const foregroundSlice = css.slice(foregroundRule, backgroundRule);
  assert.match(foregroundSlice, /var\(--text-recent-new/);
  assert.match(css.slice(backgroundRule), /var\(--text-recent-old/);
  const recentNew = css.match(/--text-recent-new:\s*([0-9.]+)rem/);
  const recentOld = css.match(/--text-recent-old:\s*([0-9.]+)rem/);
  assert.ok(recentNew && recentOld, "the :root scale must define both recent tokens");
  assert.equal(recentNew[1], "0.94");
  assert.equal(recentOld[1], "0.82");
  assert.ok(Number(recentNew[1]) > Number(recentOld[1]), "newest items must foreground above older items");
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
  assert.ok(renderedHtml.includes("현재 단계"));
  assert.equal(renderedHtml.includes("NOW ·"), false, "map must not expose internal shorthand");

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
  assert.ok(parsedMap.rails.flatMap((rail) => rail.groups).flatMap((group) => group.items).some((item) => item.title === "Release proof"));
  const areaDetails = parseAreaDetails(sections.get("area details"));
  assert.ok(areaDetails.get(normalizeTitle("Release proof")), "current-position area drills into evidence");
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
