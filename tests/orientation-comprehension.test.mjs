import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { splitSections, extractSectionRawText, escapeHtml } from "../dist/markdown-structure.js";
import { parseProjectMap, parseAreaDetails } from "../dist/semantic-construction.js";
import {
  buildOrientationSummary,
  currentStageTitles,
  facingHead,
  firstSentence,
  renderNativeMap,
} from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const md = new MarkdownIt({ html: true, linkify: true });

function orientationOf(fixture) {
  const source = fs.readFileSync(path.join(__dirname, "fixtures", fixture), "utf-8");
  const { sections } = splitSections(md.parse(source, {}));
  return buildOrientationSummary({
    frameText: extractSectionRawText(sections.get("project frame")),
    situationText: extractSectionRawText(sections.get("situation")),
    nextText: extractSectionRawText(sections.get("next")),
    facingText: extractSectionRawText(sections.get("facing")),
    map: parseProjectMap(sections.get("project map") ?? []),
  });
}

function ruleBlocks(source, selector) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const needle = `${selector} {`;
  let from = 0;
  while (true) {
    const start = clean.indexOf(needle, from);
    if (start === -1) return blocks;
    let depth = 0;
    let i = start + needle.length - 1;
    for (; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(clean.slice(start + needle.length, i));
    from = i + 1;
  }
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

test("Rough comprehension restores from the NextChart first screen without a click", () => {
  const summary = orientationOf("nextchart-emr.md");

  // 1. What this project is: stable purpose lead names the real product.
  assert.ok(summary.purpose.includes("EMR") || summary.purpose.includes("파이프라인"));

  // 2 + 4. Now: short concrete product language, not the whole paragraph.
  assert.ok(summary.now.length > 0 && summary.now.length < 220);
  assert.ok(summary.now.includes("외래"));
  assert.ok(summary.now.includes("대표 경로"));

  // 5. Next: the A → B transition head, arrow preserved.
  assert.ok(summary.next.includes("→"));
  assert.ok(summary.next.includes("1A"));

  // 6. Constraint: the material blocker head, or explicit absence — never invented.
  assert.equal(summary.blockedEmpty, false);
  assert.ok(summary.blocked.includes("1A 전체 증거 미인정"));

  // 3. Position: the YOU ARE HERE title, distinct from every other card.
  assert.deepEqual(summary.currentPosition, ["1A 출시 승인에 필요한 전체 증거 모으기"]);
  assert.equal(summary.hasOrientation, true);
});

test("Blocked absence renders as absence, never an invented blocker", () => {
  const markdown = `# 무제
## 현재 상황
동작이 확인된 상태다.
## 다음 전환
현재 상태 → 다음 상태. 조건이 닫히면 끝난다.
## 프로젝트 지도
### 레일
#### 현재 단계
- **항목 A** — 설명 A
## 영역 상세
### 항목 A
#### 의미
뜻이다.
#### 현재 수준
된다.
#### 근거
- 확인됨.
`;
  const { sections } = splitSections(md.parse(markdown, {}));
  const summary = buildOrientationSummary({
    situationText: extractSectionRawText(sections.get("situation")),
    nextText: extractSectionRawText(sections.get("next")),
    facingText: extractSectionRawText(sections.get("facing")),
    map: parseProjectMap(sections.get("project map") ?? []),
  });
  assert.equal(summary.blocked, "");
  assert.equal(summary.blockedEmpty, true);

  const mainTs = fs.readFileSync(path.join(REPO_ROOT, "src", "main.ts"), "utf-8");
  assert.ok(mainTs.includes("막힌 것 없음"), "absence renders an explicit empty state");

  const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf-8");
  assert.ok(html.includes('id="orientation-blocked"'), "blocked cell exists to carry the empty state");
});

test("Orientation leads compress without inventing: firstSentence + facingHead + currentStageTitles", () => {
  assert.equal(firstSentence("첫 문장이다. 둘째 문장이다."), "첫 문장이다.");
  assert.equal(firstSentence("  공백  정리  확인  "), "공백 정리 확인");
  assert.equal(firstSentence(""), "");
  assert.equal(
    facingHead("- **마감 혼잡** — 수령 확인 기록 지연으로 다음 전환을 제한한다."),
    "마감 혼잡"
  );
  assert.equal(facingHead(""), "");

  const source = fs.readFileSync(path.join(__dirname, "fixtures", "nextchart-emr.md"), "utf-8");
  const { sections } = splitSections(md.parse(source, {}));
  const map = parseProjectMap(sections.get("project map") ?? []);
  assert.deepEqual(currentStageTitles(map), ["1A 출시 승인에 필요한 전체 증거 모으기"]);
  assert.deepEqual(currentStageTitles(null), []);

  const minimal = orientationOf("canonical-minimal.md");
  assert.ok(minimal.blocked.includes("마감 혼잡"));
});

test("Map position and selection never share one visual: badge vs outline", () => {
  const source = fs.readFileSync(path.join(__dirname, "fixtures", "nextchart-emr.md"), "utf-8");
  const { sections } = splitSections(md.parse(source, {}));
  const map = parseProjectMap(sections.get("project map") ?? []);
  const items = map.rails.flatMap((r) => r.groups).flatMap((g) => g.items);
  const current = items.find((i) => i.isCurrentStage);
  const peer = items.find((i) => !i.isCurrentStage);
  assert.ok(current && peer);

  const plain = renderNativeMap(map);
  // Position keeps its pinned structural signal and adds a text badge (never color-only).
  assert.ok(plain.includes("현재 단계"), "pinned current-stage tag survives");
  assert.ok(plain.includes("현재 위치"), "YOU ARE HERE reads as text");
  assert.ok(plain.includes("current-position-badge"), "badge owns position, not selection");
  assert.ok(plain.includes("map-legend"), "legend names the two signals");
  assert.ok(plain.includes("선택됨"), "legend names selection in reader language");
  // The pinned screen-reader position prefix survives untouched.
  assert.ok(plain.includes(`aria-label="현재 단계: ${current.title} 영역 상세 보기"`));
  // No card is marked selected without a selection — legend included.
  assert.equal(plain.includes("selected"), false);

  const buttonTags = (html) => html.match(/<button[^>]*>/g) ?? [];
  const tagFor = (html, id) => buttonTags(html).find((tag) => tag.includes(`data-item-id="${id}"`));

  // Selecting a non-current area marks exactly its card with selection only.
  const picked = renderNativeMap(map, peer.id);
  assert.ok(tagFor(picked, peer.id)?.includes("selected"), "clicked card carries selection");
  assert.ok(tagFor(picked, peer.id)?.includes("aria-pressed"), "selection is announced, not just painted");
  assert.equal(tagFor(picked, current.id)?.includes("selected"), false, "current card stays unselected");
  // Badge count is selection-independent: exactly the current cards, no more.
  const badgeCount = (html) => html.match(/current-position-badge/g)?.length ?? 0;
  assert.equal(badgeCount(plain), badgeCount(picked), "selection never mints a position badge");
  assert.equal(badgeCount(plain), currentStageTitles(map).length);

  // Selecting the current area shows BOTH signals on one card — still distinguishable.
  const both = renderNativeMap(map, current.id);
  const bothTag = tagFor(both, current.id);
  assert.ok(bothTag?.includes("selected") && bothTag?.includes("aria-pressed"));
  assert.equal(both.split("current-position-badge").length - 1, currentStageTitles(map).length);

  // Every map card still renders: the anchor stays complete.
  for (const item of items) {
    assert.ok(picked.includes(escapeHtml(item.title)), `map card renders: ${item.title}`);
  }
});

test("First-screen DOM order: orientation strip before the map; recent stays secondary", () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf-8");
  const order = ["id=\"orientation-strip\"", 'id="project-title"', 'id="primary-workspace"', 'id="slot-map"', 'id="context-region"', 'id="slot-recent"']
    .map((id) => html.indexOf(id));
  assert.ok(order.every((i) => i !== -1), "orientation shell ids must exist");
  assert.ok(order[1] < order[0], "strip follows the project title");
  assert.ok(order[0] < order[2], "strip precedes the workspace so the Inspector never hides it");
  assert.ok(order[2] < order[3] && order[3] < order[4] && order[4] < order[5], "map stays the anchor; recent stays below");

  const cells = ['id="orientation-now"', 'id="orientation-next"', 'id="orientation-blocked"'].map((id) =>
    html.indexOf(id)
  );
  assert.ok(cells.every((i) => i !== -1));
  assert.deepEqual([...cells].sort((a, b) => a - b), cells, "strip reads 지금 → 다음 → 막힌 것");
  assert.ok(html.includes('id="orientation-position"'), "current position rides the strip");

  // Inspector keeps position context without owning navigation.
  const aside = html.indexOf('id="inspector-aside"');
  assert.ok(aside !== -1);
  assert.ok(html.indexOf('id="inspector-path"') > aside, "rail › group path lives in the Inspector");
  assert.ok(html.indexOf('id="inspector-position-note"') > aside, "current-position note lives in the Inspector");
  assert.ok(html.includes("이 영역 검토하기"), "deep-review handoff button survives");

  // Recent is chronology, never current truth.
  assert.ok(html.includes("지나간 전환 기록 · 현재 상태 아님"), "recent carries its secondary caption");
});

test("Viewer shell wires orientation without breaking preserved behavior", () => {
  const mainTs = fs.readFileSync(path.join(REPO_ROOT, "src", "main.ts"), "utf-8");
  assert.ok(mainTs.includes("renderOrientationStrip"), "strip renders on every document render");
  assert.ok(mainTs.includes("buildOrientationSummary"), "strip compresses existing sections only");
  assert.ok(mainTs.includes("inspector-path"), "Inspector names the area path");
  assert.ok(mainTs.includes("inspector-position-note"), "Inspector names the current position");
  assert.ok(mainTs.includes("aria-pressed"), "selection state is announced");
  // Preserved: single-current navigation, inline evidence, both handoffs.
  assert.ok(mainTs.includes("buildAreaHandoffContext"), "area deep-review handoff survives");
  assert.ok(mainTs.includes("buildFocusHandoffContext"), "focus handoff survives");
  assert.ok(mainTs.includes('querySelectorAll(".map-card")'), "selection still projects over all map cards");
  assert.equal(mainTs.includes("you-are-here-chip"), false, "no dead parallel chip returns");
});

test("Orientation styles keep position, selection, and chronology distinct", () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, "src", "style.css"), "utf-8");
  for (const token of [
    ".orientation-strip",
    ".orientation-triple",
    ".orientation-kicker",
    ".orientation-position",
    ".current-position-badge",
    ".map-legend",
    ".inspector-position-note",
    ".panel-caption",
  ]) {
    assert.ok(css.includes(token), `style owns ${token}`);
  }
  const [selected] = ruleBlocks(css, ".map-card.selected");
  assert.ok(selected, ".map-card.selected rule must exist");
  assert.match(norm(selected), /outline:\s*2px solid/, "selection is an outline signal");
  const [badge] = ruleBlocks(css, ".current-position-badge");
  assert.ok(badge, "badge rule must exist");
  assert.match(norm(badge), /color:/, "badge is text, never color-only");
  assert.match(norm(badge), /border:/, "badge differs from the selection outline by shape");
});
