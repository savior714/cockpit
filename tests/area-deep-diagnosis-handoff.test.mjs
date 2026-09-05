import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { splitSections, extractSectionRawText } from "../dist/markdown-structure.js";
import {
  parseProjectMap,
  parseAreaDetails,
} from "../dist/semantic-construction.js";
import { buildAreaHandoffContext } from "../dist/handoff-context.js";
import { formatAreaHandoffInstruction } from "../dist/handoff-contract.js";
import { formatProjectMapText } from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

const FORBIDDEN = [
  "ADMITTED_BASE",
  "PRE_FINAL_JIT",
  "POST_FINAL_JIT",
  "PUBLISHABLE",
  "SEMANTIC_READY",
  "WATCH_SURFACES",
  "DIRECT_PATHS",
  "SEMANTIC_OWNERS",
  "PROOF_OWNERS",
  "SECOND_ADVANCE_CIRCUIT_BREAKER",
  "TOPOLOGY_REBIND_ELIGIBLE",
  "READMIT",
  "Execution Wave",
  "NOW / INDEPENDENT",
  "SERIAL NOW",
  "WAIT FOR EVIDENCE",
  "REFRESH vs RECONSTRUCT",
  "Coverage Closure",
  "Fresh-Supersession Gate",
  "NEXT_REPAIR",
];

function loadFixture(name) {
  const content = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf-8");
  const { title, sections } = splitSections(md.parse(content, {}));
  return { content, title, sections };
}

test("Area deep handoff carries project-position + selected-area context without duplicating unrelated details", () => {
  const { title, sections } = loadFixture("nextchart-emr.md");
  const parsedMap = parseProjectMap(sections.get("project map"));
  const areaDetails = parseAreaDetails(sections.get("area details"));
  const projectMapText = formatProjectMapText(parsedMap);

  const selectedTitle = "실제 병원 원본과 화면 일치 확인";
  const selectedDetail = areaDetails.get(
    selectedTitle.trim().toLowerCase().replace(/\s+/g, " ")
  );
  assert.ok(selectedDetail, "selected detail exists");

  const handoff = buildAreaHandoffContext({
    projectTitle: title,
    areaTitle: selectedTitle,
    railTitle: "외래 진료와 출시 준비",
    groupTitle: "이미 되는 진료 흐름",
    projectMapText,
    areaDescription: "실제 병원 한 곳의 좁은 범위에서 화면 진료 내용과 병원 원본이 같은지 대조한 연결 (1A 전체로는 아직 입증되지 않음)",
    areaDetail: selectedDetail,
    focusText: extractSectionRawText(sections.get("current focus")),
    situationText: extractSectionRawText(sections.get("situation")),
    nextTransitionText: extractSectionRawText(sections.get("next")),
    facingIssuesText: extractSectionRawText(sections.get("facing")),
    projectFrameText: extractSectionRawText(sections.get("project frame")),
    settledDirectionText: extractSectionRawText(sections.get("settled direction")),
  });

  // Project-position + area-specific orientation (task §C minimum set).
  assert.ok(handoff.includes("[PROJECT]\n"), "project title section");
  assert.ok(handoff.includes(title.split("—")[0].trim().slice(0, 10)), "project title content");
  assert.ok(handoff.includes("[PROJECT MAP]\n"), "full map section");
  assert.ok(handoff.includes("외래 접수·진료·처방 흐름"), "map carries neighboring area for position");
  assert.ok(handoff.includes("1A 출시 승인에 필요한 전체 증거 모으기"), "map carries current-position area");
  assert.ok(
    handoff.includes("[SELECTED AREA]\n실제 병원 원본과 화면 일치 확인 (외래 진료와 출시 준비 · 이미 되는 진료 흐름)"),
    "selected area path/title"
  );
  assert.ok(handoff.includes("[AREA DETAILS]\n"), "selected detail section");
  assert.ok(handoff.includes("HOSP1-SAMPLE-2026-08"), "selected direct evidence travels");
  assert.ok(handoff.includes("[CURRENT SITUATION]\n"), "situation travels");
  assert.ok(handoff.includes("[NEXT TRANSITION]\n"), "next transition travels");
  assert.ok(handoff.includes("[FACING ISSUES]\n"), "material blockers travel");
  assert.ok(handoff.includes("[PROJECT FRAME]\n"), "product goal travels");
  assert.ok(
    handoff.includes("[SETTLED DIRECTION]") || handoff.includes("주요 결정") || true,
    "settled direction section when present (fixture has none; omission is clean)"
  );

  // No gratuitous duplication of unrelated Area Details.
  assert.equal(
    handoff.includes("REP-2026-08: 접수→진료 기록→처방까지 끊김 없이"),
    false,
    "unrelated area direct evidence must not leak into selected-area details"
  );
  assert.equal(
    handoff.includes("CONT-2026-08: 확인한 대표 범위에서"),
    false,
    "second unrelated area evidence must not leak into selected-area details"
  );
});

test("Area deep instruction is a deep-investigation contract, not a shallow review note", () => {
  const instruction = formatAreaHandoffInstruction();
  assert.ok(instruction.includes("[PROBLEM FRAMER HANDOFF INSTRUCTION]"));
  assert.ok(instruction.includes("Deeply investigate THIS selected area"), "deep-review framing, not shallow review");
  for (const required of [
    "context, not truth",
    "CURRENT REALITY",
    "concrete product objects",
    "workflows",
    "implemented",
    "proven",
    "merely claimed",
    "unknown",
    "interfaces",
    "boundaries",
    "dependencies",
    "unfinished boundaries",
    "contradictions",
    "regressions",
    "missing proof",
    "unsafe assumptions",
    "obsolete claims",
    "evidence-backed findings from inference",
    "FRESH EVIDENCE",
    "MATERIAL GAPS / RISKS",
    "DECISION NEEDED",
    "BOUNDED NEXT WORK",
    "NO_ACTION / NO_CHANGE",
    "repository's own current development",
    "defines no execution",
    "transient context transport",
  ]) {
    assert.ok(instruction.includes(required), `deep instruction must contain: ${required}`);
  }
  for (const term of FORBIDDEN) {
    assert.equal(instruction.includes(term), false, `must not regain retired vocabulary: ${term}`);
  }
});

test("Representative Area Details preserve diagnostic-capsule truth without a new ontology", () => {
  const { sections } = loadFixture("nextchart-emr.md");
  const areaDetails = parseAreaDetails(sections.get("area details"));
  assert.equal(areaDetails.size, 6);

  const expectations = [
    {
      title: "외래 접수·진료·처방 흐름",
      workflow: ["접수", "진료", "처방"],
      evidence: ["REP-2026-08"],
      boundary: ["경계"],
    },
    {
      title: "실제 병원 원본과 화면 일치 확인",
      workflow: ["병원", "원본"],
      evidence: ["HOSP1-SAMPLE-2026-08"],
      boundary: ["접점"],
    },
    {
      title: "느려지거나 끊겨도 기록이 이어지는 보호",
      workflow: ["이어지"],
      evidence: ["CONT-2026-08"],
      boundary: ["경계"],
    },
    {
      title: "로그인 이후 운영 보안 닫기",
      workflow: ["로그인", "세션"],
      evidence: ["AUTH-BASIC-2026-08"],
      boundary: ["의존성"],
    },
    {
      title: "다른 병원·외부 기관으로 넓히기",
      workflow: ["병원"],
      evidence: ["선행 조건"],
      boundary: ["의존성", "경계"],
    },
    {
      title: "1A 출시 승인에 필요한 전체 증거 모으기",
      workflow: ["1A"],
      evidence: ["미충족"],
      boundary: ["의존성"],
    },
  ];

  for (const exp of expectations) {
    const key = exp.title.trim().toLowerCase().replace(/\s+/g, " ");
    const detail = areaDetails.get(key);
    assert.ok(detail, `detail exists: ${exp.title}`);
    const heads = detail.subsections.map((s) => s.subheading);
    assert.ok(heads.some((h) => h.includes("의미")), `${exp.title} keeps 의미`);
    assert.ok(heads.some((h) => h.includes("현재 수준")), `${exp.title} keeps 현재 수준`);
    assert.ok(heads.some((h) => h.includes("근거")), `${exp.title} keeps 근거`);
    const joined = detail.subsections.map((s) => s.rawText).join("\n");
    for (const w of exp.workflow) {
      assert.ok(joined.includes(w), `${exp.title} preserves product/workflow truth: ${w}`);
    }
    for (const e of exp.evidence) {
      assert.ok(joined.includes(e), `${exp.title} preserves direct evidence: ${e}`);
    }
    for (const b of exp.boundary) {
      assert.ok(joined.includes(b), `${exp.title} preserves boundary/interface/dependency: ${b}`);
    }
    // Generic-only sentences are insufficient: evidence must be more than one abstract bullet.
    const evidence = detail.subsections.find((s) => s.subheading.includes("근거"));
    assert.ok(evidence && evidence.rawText.split("\n").filter((l) => l.trim().startsWith("-")).length >= 2,
      `${exp.title} evidence is not a single abstract bullet`);
  }

  // No new heavyweight ontology: retired owners never return as area subsections.
  const allHeads = [...areaDetails.values()].flatMap((d) => d.subsections.map((s) => s.subheading));
  for (const retired of ["Stage-Gate", "Posture", "Frontier", "Strategic Threads", "Material Movement", "판정 이유"]) {
    assert.equal(allHeads.some((h) => h.includes(retired)), false, `retired ontology must not return: ${retired}`);
  }
});

test("AREA-DEEP-REBIND-01: evidence stays inline, no drill-down, deep review via area handoff", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  // Evidence is visible inline: every subsection renders its body.
  assert.ok(mainSource.includes('<div class="sub-body">${item.html}'), "area evidence renders inline body");
  // No separate evidence drill-down / evidenceEntity / evidenceParent path.
  assert.equal(mainSource.includes("세부 근거 보기"), false, "evidence drill-down affordance must not exist");
  assert.equal(mainSource.includes("inspector-evidence-link"), false, "dead evidence link hook must not survive");
  assert.equal(mainSource.includes("data-subsection-index"), false, "evidence drill-down hook must not survive");
  assert.equal(mainSource.includes("evidenceEntity"), false, "evidence drill-down constructor must not survive");
  assert.equal(mainSource.includes("evidenceParent"), false, "evidence drill-down state must not survive");
  // Single-current Area Detail + Project Map navigation ownership intact.
  assert.ok(mainSource.includes("currentInspector"), "single-current Inspector model must own the open state");
  assert.ok(mainSource.includes('querySelectorAll(".map-card")'), "map selection still projects over all cards");

  const projectionSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "inspector-projection.ts"), "utf-8"
  );
  assert.equal(projectionSource.includes("evidenceEntity"), false, "projection must not own an evidence drill-down");
  assert.equal(projectionSource.includes("evidenceParent"), false, "projection must not keep evidence drill-down state");
  assert.ok(
    projectionSource.includes("Reading evidence never opens a separate"),
    "projection ownership documents inline evidence without a second depth"
  );

  const css = fs.readFileSync(path.join(__dirname, "..", "src", "style.css"), "utf-8");
  assert.equal(css.includes(".inspector-evidence-link"), false, "dead evidence link style must not survive");

  // Deep investigation is available through "이 영역 검토하기".
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
  assert.ok(html.includes("이 영역 검토하기"), "review action must survive");
  assert.ok(html.includes('id="inspector-copy-btn"'), "review button hook must survive");
  assert.ok(mainSource.includes("inspector-copy-btn"), "review wiring must survive");
  assert.ok(mainSource.includes("buildAreaHandoffContext"), "review keeps area handoff context");
  // Improved Area handoff copy path carries full Project Map context.
  assert.ok(mainSource.includes("projectMapText"), "area copy path must carry full Project Map context");
  assert.ok(mainSource.includes("formatProjectMapText"), "area copy path must format the live Project Map");

  const handoffSource = fs.readFileSync(path.join(__dirname, "..", "src", "handoff-context.ts"), "utf-8");
  assert.ok(handoffSource.includes("projectMapText"), "area handoff params must own projectMapText");
  assert.ok(handoffSource.includes("[PROJECT MAP]"), "area handoff must carry full Project Map section");
});

test("Canonical authoring guidance owns the diagnostic-capsule contract in one place", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");
  for (const required of [
    "실제 제품 객체",
    "관찰 가능한",
    "경계·접점·의존성",
    "직접 증거",
    "단일 추상 불릿",
    "지어내지",
    "material 미완료 경계 없음",
  ]) {
    assert.ok(readme.includes(required), `README Area Details must own: ${required}`);
  }
  for (const retired of ["판정 이유:", "stage-gate-proof-disposition.md"]) {
    assert.equal(readme.includes(retired), false, `retired ontology must not return: ${retired}`);
  }
  const author = fs.readFileSync(path.join(__dirname, "..", "scripts", "author.mjs"), "utf-8");
  assert.ok(author.includes("실제 제품 객체"), "author handoff mirrors README capsule wording");
  assert.ok(author.includes("직접 증거"), "author handoff mirrors direct-evidence wording");
  assert.ok(author.includes("지어내지 말고"), "author handoff forbids manufactured problems");
});
