import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { normalizeTitle, normalizeKey } from "../dist/authoring-grammar.js";
import {
  splitSections,
  extractSectionRawText,
  renderTokens,
  withMermaidPlaceholders,
  escapeHtml,
} from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
  findAreaDetail,
} from "../dist/semantic-construction.js";
import {
  checkProgressStructure,
  getAreaCompleteness,
} from "../dist/structural-check.js";
import {
  renderNativeMap,
  formatProjectMapText,
  formatAreaDetailsText,
  classifySubsectionTone,
  toViewSubsection,
  findEntity,
  areaEntity,
} from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

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
  assert.ok(renderedHtml.includes("현재 단계"));
  assert.equal(renderedHtml.includes("NOW ·"), false, "map must not expose internal shorthand");
  assert.ok(renderedHtml.includes("영역 상세 보기"));
  assert.equal(renderedHtml.includes("영역 검사"), false, "map must not expose internal inspection wording");
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

test("DOM and CSS containment invariant: primary workspace leads Map-first, stable grid stays in context-region", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  const primaryIdx = html.indexOf('id="primary-workspace"');
  const slotMapIdx = html.indexOf('id="slot-map"');
  const slotRecentIdx = html.indexOf('id="slot-recent"');
  const contextRegionIdx = html.indexOf('id="context-region"');
  const stableGridIdx = html.indexOf('class="stable-context-grid"');
  const slotFrameIdx = html.indexOf('id="slot-frame"');
  const slotSettledIdx = html.indexOf('id="slot-settled"');

  assert.ok(primaryIdx !== -1 && slotMapIdx !== -1 && slotRecentIdx !== -1);
  assert.ok(contextRegionIdx !== -1, "index.html must have #context-region");
  assert.ok(stableGridIdx !== -1, "index.html must have .stable-context-grid");
  assert.ok(slotFrameIdx !== -1, "index.html must have #slot-frame");
  assert.ok(slotSettledIdx !== -1, "index.html must have #slot-settled");

  // MAP-FIRST: map renders before orientation; recent leads before stable context.
  assert.ok(primaryIdx < slotMapIdx, "#slot-map must open the primary workspace");
  assert.ok(slotMapIdx < slotRecentIdx, "orientation follows the map anchor");
  assert.ok(slotRecentIdx < contextRegionIdx, "recent changes precede the context region");
  assert.ok(contextRegionIdx < stableGridIdx, ".stable-context-grid must be inside #context-region");
  assert.ok(stableGridIdx < slotFrameIdx, "#slot-frame must be inside .stable-context-grid");
  assert.ok(stableGridIdx < slotSettledIdx, "#slot-settled must be inside .stable-context-grid");

  // CSS rules assertion for recent panel and stable context grid
  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.ok(css.includes(".panel-recent"), "CSS must style .panel-recent");
  assert.ok(css.includes(".stable-context-grid"), "CSS must style .stable-context-grid");
  assert.ok(css.includes(".panel-stable"), "CSS must style .panel-stable");
});

test("Viewer refresh remains a PROGRESS.md re-render, not a Git refresh", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  assert.match(mainSource, /fetch\("\/progress\.md", \{ cache: "no-store" \}\)/);
  assert.match(mainSource, /new EventSource\("\/events"\)/);
  assert.doesNotMatch(mainSource, /\b(?:git|simple-git|isomorphic-git)\b/i);
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

test("DOM and CSS containment: focus copy action and toast elements exist inside #slot-focus", () => {
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");

  const slotFocusIdx = html.indexOf('id="slot-focus"');
  const focusCopyBtnIdx = html.indexOf('id="focus-copy-btn"');
  const focusCopyToastIdx = html.indexOf('id="focus-copy-toast"');
  const slotFrameIdx = html.indexOf('id="slot-frame"');

  assert.ok(slotFocusIdx !== -1, "index.html must have #slot-focus");
  assert.ok(focusCopyBtnIdx !== -1, "index.html must have #focus-copy-btn");
  assert.ok(focusCopyToastIdx !== -1, "index.html must have #focus-copy-toast");

  // focus-copy-btn and focus-copy-toast must be strictly inside #slot-focus before #slot-frame
  assert.ok(slotFocusIdx < focusCopyBtnIdx && focusCopyBtnIdx < slotFrameIdx, "#focus-copy-btn must be inside #slot-focus");
  assert.ok(slotFocusIdx < focusCopyToastIdx && focusCopyToastIdx < slotFrameIdx, "#focus-copy-toast must be inside #slot-focus");

  const cssPath = path.join(__dirname, "..", "src", "style.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.ok(css.includes(".focus-actions"), "CSS must style .focus-actions");
  assert.ok(css.includes(".btn-focus-copy"), "CSS must style .btn-focus-copy");
});

test("Reader-visible DOM leads Map-first and exposes one area Inspector shell", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
  // Map-first primary order: map anchor, then orientation, then inspector.
  const ids = ["slot-map", "slot-now", "slot-next", "slot-blocked", "slot-recent", "inspector-aside"];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position !== -1));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  // Removed primary surfaces must not return under any id.
  for (const retired of ["slot-status", "slot-movement", "slot-horizon", "slot-stage", "slot-posture", "slot-frontier", "slot-threads", "legacy-overview-slots", "inspector-related", "inspector-stage-context"]) {
    assert.equal(html.indexOf(`id="${retired}"`), -1, `${retired} must not exist`);
  }
  // Reader headings stay plain outcome language, not internal architecture terms.
  for (const jargon of ["HORIZON-FIRST", "Stage Journey", "Project Posture", "Current Frontier", "Strategic Threads", "Material Movement"]) {
    assert.equal(html.includes(jargon), false, `primary surface must not expose internal jargon: ${jargon}`);
  }
  // Product display vocabulary: panel titles name their role without a helper.
  // (File-authoring headings and semantic owners — situation / next / facing /
  // recent / focus / frame / settled — are unchanged; only display differs.)
  for (const heading of ["<h2>프로젝트 지도</h2>", "<h2>프로젝트 현황</h2>", "<h2>다음 단계</h2>", "<h2>진행 제약</h2>", "<h2>최근 업데이트</h2>", "<h2>우선 과제</h2>", "<h2>제품 목표</h2>", "<h2>주요 결정</h2>"]) {
    assert.ok(html.includes(heading), `primary surface must read as product language: ${heading}`);
  }
  for (const shorthand of ["<h2>지금</h2>", "<h2>다음</h2>", "<h2>막힘</h2>", "<h2>최근 변화</h2>", "<h2>현재 집중</h2>", "<h2>확정된 방향</h2>", "작업자 지정", "프로젝트 전체의 현재 상태", "가장 가까운 상태 전환", "다음 전환을 제한하는 제약", "현재 진행 문서 기준"]) {
    assert.equal(html.includes(shorthand), false, `primary surface must not expose internal shorthand: ${shorthand}`);
  }
  assert.ok(html.includes('id="inspector-aside"'));
  assert.ok(html.includes('id="universal-inspector-panel"'));
  assert.ok(html.includes('id="inspector-breadcrumb"'));
  assert.ok(html.includes("이 영역 검토하기"));

  const css = fs.readFileSync(path.join(__dirname, "..", "src", "style.css"), "utf-8");
  for (const selector of [".panel-map", ".panel-movement", ".universal-inspector-drawer", ".map-card"]) {
    assert.ok(css.includes(selector), `${selector} must have a presentation rule`);
  }
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

  // Domain stays presentation-free (rawText only); tone is derived by the
  // projection owner. Same assertions, new sole owner.
  assert.equal(meaning && toViewSubsection(meaning).tone, "neutral");
  assert.equal(current && toViewSubsection(current).tone, "neutral");
  assert.equal(entry && toViewSubsection(entry).tone, "active");
  assert.equal(remaining && toViewSubsection(remaining).tone, "danger");
  assert.equal(evidence && toViewSubsection(evidence).tone, "evidence");
  assert.equal(notes && toViewSubsection(notes).tone, "neutral");
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
test("Contraction proof: no Stage/Posture/Frontier/Thread/Movement owners survive in source", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  assert.equal(mainSource.includes("renderStatusSynthesis"), false);
  assert.equal(mainSource.includes("renderThreadsSecondary"), false);
  assert.equal(mainSource.includes("function stageEntity"), false);
  assert.equal(mainSource.includes("function frontierEntity"), false);
  assert.ok(mainSource.includes("MAP-FIRST"));

  const projectionSource = fs.readFileSync(path.join(__dirname, "..", "src", "inspector-projection.ts"), "utf-8");
  for (const removed of ["stageEntity", "postureEntity", "frontierEntity", "threadEntity", "movementEntity", "relatedEntity", "renderStatusSynthesis", "renderThreadsSecondary", "stage-gate-reason", "판정 이유"]) {
    assert.equal(projectionSource.includes(removed), false, `projection must not contain: ${removed}`);
  }

  const grammarSource = fs.readFileSync(path.join(__dirname, "..", "src", "authoring-grammar.ts"), "utf-8");
  assert.equal(grammarSource.includes('"FAILED"'), false);
  assert.equal(grammarSource.includes("RELATION_GRAMMAR_RULES"), false);

  const constructionSource = fs.readFileSync(path.join(__dirname, "..", "src", "semantic-construction.ts"), "utf-8");
  assert.equal(constructionSource.includes("decisionReason"), false);
  assert.equal(constructionSource.includes("parseMentalModel"), false);

  const domainSource = fs.readFileSync(path.join(__dirname, "..", "src", "domain.ts"), "utf-8");
  const domainCode = domainSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const removed of ["StageJourney", "ProjectPosture", "Frontier", "StrategicThread", "MaterialMovement", "SemanticRelation", "ParsedMentalModel"]) {
    assert.equal(domainCode.includes(removed), false, `domain must not contain: ${removed}`);
  }

  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  assert.equal(readme.includes("판정 이유:"), false);
  assert.equal(readme.includes("stage-gate-proof-disposition.md"), false);
  assert.ok(readme.includes("질문 하나에 섹션 하나가 대응합니다"));
});

test("Contracted orientation invariant: map items drill to evidence, overview restores reader questions", () => {
  for (const fixtureName of ["cockpit-self.md", "nextchart-emr.md", "canonical-minimal.md"]) {
    const content = fs.readFileSync(path.join(__dirname, "fixtures", fixtureName), "utf-8");
    const { sections } = splitSections(md.parse(content, {}));
    const map = parseProjectMap(sections.get("project map"));
    const areaDetails = parseAreaDetails(sections.get("area details"));
    const lookup = { map, areaDetails };

    // Every map item stays reachable through area drill-down.
    for (const rail of map.rails) {
      for (const group of rail.groups) {
        for (const item of group.items) {
          const entity = findEntity("area", item.title, lookup);
          assert.ok(entity, `${fixtureName}: area reachable: ${item.title}`);
          assert.equal(entity.kind, "area");
          assert.ok(entity.subsections.length > 0, `${fixtureName}: area has drill-down content: ${item.title}`);
        }
      }
    }
    // Non-area kinds no longer resolve: no parallel taxonomy.
    assert.equal(findEntity("evidence", "anything", lookup), null);

    // Primary surface restores the reader questions from plain text.
    const situation = extractSectionRawText(sections.get("situation"));
    const next = extractSectionRawText(sections.get("next"));
    assert.ok(situation.length > 0, `${fixtureName}: Now restorable`);
    assert.ok(next.length > 0, `${fixtureName}: Next restorable`);

    // Map cards render for every item (mental anchor intact).
    const html = renderNativeMap(map);
    for (const rail of map.rails) {
      for (const group of rail.groups) {
        for (const item of group.items) {
          assert.ok(html.includes(escapeHtml(item.title)), `${fixtureName}: map card renders: ${item.title}`);
        }
      }
    }
  }

  // areaEntity exposes meaning/level/evidence with tone for the Inspector.
  const content = fs.readFileSync(path.join(__dirname, "fixtures", "canonical-minimal.md"), "utf-8");
  const { sections } = splitSections(md.parse(content, {}));
  const map = parseProjectMap(sections.get("project map"));
  const areaDetails = parseAreaDetails(sections.get("area details"));
  const item = map.rails.flatMap((r) => r.groups).flatMap((g) => g.items).find((i) => i.title === "수령 카운터");
  assert.ok(item);
  const entity = areaEntity(item, areaDetails);
  assert.equal(entity.kind, "area");
  assert.ok(entity.subsections.some((s) => s.tone === "danger"), "remaining problem reads as danger");
  assert.ok(entity.subsections.some((s) => s.tone === "evidence"), "evidence reads as evidence");
});
