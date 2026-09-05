import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeKey,
  normalizeTitle,
  normalizeHeading,
  HEADING_ALIAS,
  isCurrentStageHeading,
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
  parseDocument,
  classifySubsectionTone,
  md,
  escapeHtml,
  renderTokens,
  withMermaidPlaceholders,
} from "../dist/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("README authoring contract stays a short human contract, not a governance manual", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf-8");

  assert.ok(readme.includes("질문 하나에 섹션 하나가 대응합니다"));
  assert.ok(readme.includes("Fresh evidence first"));
  assert.ok(readme.includes("STRUCTURALLY VALID != EVIDENCE-GROUNDED"));
  assert.ok(readme.includes("`cockpit check` PASS는 구조 검사이지 사실·문체 증명이 아니다"));
  // Contracted: no execution/publication governance in the product contract.
  assert.equal(readme.includes("WATCH_SURFACES"), false);
  assert.equal(readme.includes("ADMITTED_BASE"), false);
  assert.equal(readme.includes("PRE_FINAL_JIT"), false);
  assert.equal(readme.includes("SECOND_ADVANCE_CIRCUIT_BREAKER"), false);
});

test("Handoff context extraction: sibling module owns implementation, parser facade re-exports it", async () => {
  const sibling = await import("../dist/handoff-context.js");
  assert.equal(typeof sibling.buildFocusHandoffContext, "function");
  assert.equal(typeof sibling.buildAreaHandoffContext, "function");
  assert.equal(buildFocusHandoffContext, sibling.buildFocusHandoffContext);
  assert.equal(buildAreaHandoffContext, sibling.buildAreaHandoffContext);
});

test("Parser facade compatibility: public dist/parser.js surface exposes required legacy symbols", () => {
  for (const [label, value] of [
    ["md", md],
    ["HEADING_ALIAS", HEADING_ALIAS],
    ["normalizeKey", normalizeKey],
    ["normalizeTitle", normalizeTitle],
    ["normalizeHeading", normalizeHeading],
    ["escapeHtml", escapeHtml],
    ["renderTokens", renderTokens],
    ["withMermaidPlaceholders", withMermaidPlaceholders],
    ["splitSections", splitSections],
    ["parseProjectMap", parseProjectMap],
    ["parseAreaDetails", parseAreaDetails],
    ["findAreaDetail", findAreaDetail],
    ["getAreaCompleteness", getAreaCompleteness],
    ["renderNativeMap", renderNativeMap],
    ["checkProgressStructure", checkProgressStructure],
    ["formatStructuralCheckReport", formatStructuralCheckReport],
    ["extractSectionRawText", extractSectionRawText],
    ["formatProjectMapText", formatProjectMapText],
    ["formatAreaDetailsText", formatAreaDetailsText],
    ["buildFocusHandoffContext", buildFocusHandoffContext],
    ["buildAreaHandoffContext", buildAreaHandoffContext],
    ["formatFocusHandoffInstruction", formatFocusHandoffInstruction],
    ["formatAreaHandoffInstruction", formatAreaHandoffInstruction],
    ["parseDocument", parseDocument],
    ["classifySubsectionTone", classifySubsectionTone],
    ["isCurrentStageHeading", isCurrentStageHeading],
  ]) {
    assert.equal(typeof value, typeof value === "string" ? "string" : typeof value, label);
    assert.ok(value !== undefined, `${label} must be exposed`);
  }
  assert.equal(typeof checkProgressStructure, "function");
  assert.equal(typeof classifySubsectionTone, "function");
  // Legacy behavior spot-checks through the facade (not a second implementation).
  assert.equal(normalizeTitle("  Patient  Registration  "), "patient registration");
  assert.equal(classifySubsectionTone("남은 문제", "없음"), "danger");
  const canonical = fs.readFileSync(path.join(__dirname, "fixtures", "canonical-minimal.md"), "utf-8");
  const result = checkProgressStructure(canonical);
  assert.equal(result.ok, true, result.errors.join("; "));
  const doc = parseDocument(canonical);
  assert.ok(doc.title);
  assert.equal(doc.map.isNativeMap, true);
});

test("Parser facade exposes no contracted canonical owners", async () => {
  const facade = await import("../dist/parser.js");
  for (const removed of [
    "HERE_MARKER",
    "isFoundationHeading",
    "isFutureHeading",
    "parseProjectHorizon",
    "parseStageJourney",
    "parseProjectPosture",
    "parseCurrentFrontiers",
    "parseStrategicThreads",
    "parseMaterialMovements",
    "parseMentalModel",
    "formatExecutionWaveContractLines",
    "formatAdmissionPublicationContractLines",
  ]) {
    assert.equal(facade[removed], undefined, `${removed} must stay removed from the facade`);
  }
});

test("Parser facade is genuinely thin: no canonical definitions live in parser.ts", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "parser.ts"), "utf-8");
  assert.ok(source.includes("Compatibility/public API facade"));
  assert.ok(source.includes('from "./structural-check.js"'));
  assert.ok(source.includes('from "./semantic-construction.js"'));
  assert.ok(source.includes('from "./inspector-projection.js"'));
  assert.ok(source.includes('from "./domain.js"'));
  assert.equal(source.includes("new MarkdownIt"), false);
  assert.equal(source.includes("function parseProjectMap"), false);
  assert.equal(source.includes("function checkProgressStructure"), false);
  assert.equal(source.includes("function renderNativeMap"), false);
  assert.equal(source.includes("function classifySubsectionTone"), false);
  assert.equal(source.includes("interface ParsedMap"), false);
  assert.equal(source.includes("interface Frontier"), false);
});

test("Domain model boundary: clean model has no Token/HTML/tone/DOM dependencies", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "domain.ts"), "utf-8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(code.includes("markdown-it"), false);
  assert.equal(code.includes("Token"), false);
  assert.equal(code.includes("SemanticTone"), false);
  assert.equal(/\btone\s*[?:]/.test(code), false);
  assert.equal(/\bhtml\s*[?:]/.test(code), false);
  assert.equal(code.includes("window."), false);
  assert.equal(code.includes("document."), false);
  // No rendered HTML fields in the clean model; rawText is authoring text.
  assert.ok(code.includes("rawText"));
  assert.ok(code.includes("ParsedDocument"));
});

test("Internal production code does not use parser.ts as a dependency hub", () => {
  for (const rel of ["main.ts", "semantic-construction.ts", "structural-check.ts", "inspector-projection.ts", "handoff-context.ts", "markdown-structure.ts", "authoring-grammar.ts", "domain.ts"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf-8");
    assert.equal(source.includes('from "./parser'), false, `${rel} must not import the facade`);
    assert.equal(source.includes("from './parser"), false, `${rel} must not import the facade`);
  }
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf-8");
  assert.ok(main.includes('from "./inspector-projection.js"'));
  assert.ok(main.includes('from "./semantic-construction.js"'));
  const handoff = fs.readFileSync(path.join(__dirname, "..", "src", "handoff-context.ts"), "utf-8");
  assert.ok(handoff.includes('from "./domain.js"'));
});
