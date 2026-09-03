import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

import {
  formatAdmissionPublicationContractLines,
  formatAreaHandoffInstruction,
  formatExecutionWaveContractLines,
  formatFocusHandoffInstruction,
} from "./handoff-contract.js";

export const md = new MarkdownIt({ html: true, linkify: true });

export const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;

/** Korean & English heading text → canonical slot key */
export const HEADING_ALIAS: Record<string, string> = {
  // Map
  "프로젝트 지도": "project map",
  "project map": "project map",

  // Mental-model-first top-level surfaces
  "프로젝트 지평": "project horizon",
  "project horizon": "project horizon",
  "단계 여정": "stage journey",
  "stage journey": "stage journey",
  "프로젝트 상태": "project posture",
  "project posture": "project posture",
  "project posture axes": "project posture",
  "현재 최전선": "current frontier",
  "current frontier": "current frontier",
  "전략적 흐름": "strategic threads",
  "strategic threads": "strategic threads",
  "최근 실질적 변화": "recent material movement",
  "recent material movement": "recent material movement",

  // Area details
  "영역 상세": "area details",
  "영역별 상세": "area details",
  "area details": "area details",
  "area detail": "area details",

  // Overview Panel
  "현재 집중": "current focus",
  "현재의 집중": "current focus",
  "current focus": "current focus",
  "focus": "current focus",

  "현재 상황": "current situation",
  "지금 하는 일": "current situation",
  "지금": "current situation",
  "current situation": "current situation",

  "다음 전환": "next transition",
  "다음": "next transition",
  "next": "next transition",
  "next transition": "next transition",

  "직면한 문제": "facing issues",
  "막힌 것": "facing issues",
  "blocked": "facing issues",
  "facing issues": "facing issues",

  // Context panels
  "제품 목표": "project frame",
  "프로젝트 큰 그림": "project frame",
  "project frame": "project frame",
  "product goal": "project frame",
  "product goals": "project frame",

  "확정된 방향": "settled direction",
  "이미 정해진 방향": "settled direction",
  "settled direction": "settled direction",

  "최근 진척": "recently completed",
  "최근 완료": "recently completed",
  "recently completed": "recently completed",
  "recent progress": "recently completed",
};

export interface MapItem {
  id: string;
  title: string;
  description: string;
  rawHtml: string;
  railTitle: string;
  groupTitle: string;
  isCurrentStage?: boolean;
}

export interface MapGroup {
  title: string;
  isOrdered?: boolean;
  items: MapItem[];
}

export interface MapRail {
  title: string;
  railType: "trajectory" | "neutral";
  groups: MapGroup[];
}

export interface ParsedMap {
  isNativeMap: boolean;
  rails: MapRail[];
  hasCurrentStage?: boolean;
  rawTokens?: Token[];
}

export type SemanticTone = "neutral" | "active" | "danger" | "evidence";

export interface AreaDetailSubsection {
  subheading: string;
  html: string;
  rawText: string;
  tone?: SemanticTone;
}

export interface AreaDetail {
  title: string;
  normalizedKey: string;
  subsections: AreaDetailSubsection[];
  summaryText?: string;
}

export type MaturityState = "STRONG" | "PARTIAL" | "WEAK" | "UNKNOWN";

export type SemanticRelationKind =
  | "area"
  | "stage"
  | "posture"
  | "frontier"
  | "movement";

export interface SemanticRelation {
  kind: SemanticRelationKind;
  target: string;
}

export interface SemanticSubsection {
  subheading: string;
  html: string;
  rawText: string;
  tone?: SemanticTone;
}

export interface ProjectHorizon {
  title: string;
  html: string;
  rawText: string;
  summaryText: string;
  isLegacyFallback: boolean;
}

export interface StageGate {
  title: string;
  state: string;
  summaryText: string;
  entryCondition?: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isStageBlocker: boolean;
}

const STAGE_ENTRY_CONDITION_LABELS = ["진입 조건", "개시 조건", "entry condition", "opens when"];

export interface StageSegment {
  role: "current" | "next" | "other";
  title: string;
  html: string;
  rawText: string;
  gates: StageGate[];
}

export interface StageJourney {
  segments: StageSegment[];
  currentStage?: string;
  nextStage?: string;
  currentGates: StageGate[];
  nextGates: StageGate[];
  rawText: string;
}

export type PostureRole = "core-capability" | "delivery-readiness" | undefined;

export interface PostureAxis {
  title: string;
  state: MaturityState | null;
  declaredState: string;
  role: PostureRole;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isStageBlocker: boolean;
}

export interface ProjectPosture {
  axes: PostureAxis[];
  rawText: string;
}

export interface Frontier {
  title: string;
  currentState: string;
  targetState: string;
  whyNow: string;
  successMeaning: string;
  stageImpact: string;
  closedBoundaries: string;
  evidence: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isPrimary: boolean;
  isCoPrimary: boolean;
}

export interface StrategicThread {
  title: string;
  state: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
}

export interface MaterialMovement {
  title: string;
  before: string;
  change: string;
  after: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  hasStateTransition: boolean;
}

export function normalizeHeading(tokens: Token[]): string {
  const raw = tokens
    .filter((t) => t.type === "inline")
    .map((t) => t.content.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ");
  return HEADING_ALIAS[raw] ?? raw;
}

export function normalizeKey(str: string): string {
  return str
    .replace(/[*_~`#[\]\\()]/g, "")
    .replace(/[\s—\-:·]/g, "")
    .toLowerCase()
    .trim();
}

/** Dedicated safe title normalization for deterministic map ↔ detail matching */
export function normalizeTitle(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderTokens(tokens: Token[]): string {
  return md.renderer.render(tokens, md.options, {});
}

export function withMermaidPlaceholders(html: string): string {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, src: string) => {
      const attr = src.replace(/"/g, "&quot;");
      return `<div class="mermaid" data-src="${attr}">${src}</div>`;
    }
  );
}

/** Split top-level token stream into sections keyed by normalized h2 heading text. */
export function splitSections(tokens: Token[]) {
  const sections = new Map<string, Token[]>();
  let title = "";
  let key: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level === 0 && t.type === "heading_open" && t.tag === "h1") {
      if (!title) {
        title = tokens[i + 1]?.content.trim() ?? "";
        key = null;
      } else if (key) {
        key = `__h1:${normalizeHeading([tokens[i + 1]])}`;
        if (!sections.has(key)) sections.set(key, []);
      } else {
        i += 2;
        continue;
      }
      i += 2;
    } else if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
      key = normalizeHeading([tokens[i + 1]]);
      if (!sections.has(key)) sections.set(key, []);
      i += 2;
    } else if (key) {
      sections.get(key)!.push(t);
    }
  }
  return { title, sections };
}

/** Parse list items under an H4 heading into MapItems */
export function parseListItems(
  tokens: Token[],
  railTitle: string,
  groupTitle: string,
  isCurrentStageGroup: boolean
): MapItem[] {
  const items: MapItem[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "list_item_open") {
      let inlineToken: Token | null = null;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "list_item_close") break;
        if (tokens[j].type === "inline") {
          inlineToken = tokens[j];
          break;
        }
      }

      if (inlineToken) {
        const fullContent = inlineToken.content.trim();
        let title = fullContent;
        let description = "";

        const boldMatch = /^\*\*([^*]+)\*\*(?:\s*[—\-:]\s*([\s\S]*))?$/.exec(fullContent);
        if (boldMatch) {
          title = boldMatch[1].trim();
          description = (boldMatch[2] ?? "").trim();
        } else {
          const sepMatch = /^([^—\-:]+?)\s*[—\-:]\s*([\s\S]+)$/.exec(fullContent);
          if (sepMatch) {
            title = sepMatch[1].replace(/[*_`]/g, "").trim();
            description = sepMatch[2].trim();
          }
        }

        const id = `${normalizeKey(railTitle)}_${normalizeKey(groupTitle)}_${normalizeKey(title)}`;
        const rawHtml = renderTokens([inlineToken]);

        items.push({
          id,
          title,
          description,
          rawHtml,
          railTitle,
          groupTitle,
          isCurrentStage: isCurrentStageGroup,
        });
      }
    }
  }

  return items;
}

/** Exact canonical current stage heading */
export function isCurrentStageHeading(rawTitle: string): boolean {
  const norm = normalizeKey(rawTitle);
  return norm === "현재단계" || norm === "currentstage";
}

/** Explicit supported foundation aliases */
export function isFoundationHeading(rawTitle: string): boolean {
  const norm = normalizeKey(rawTitle);
  return (
    norm === "확보된기반" ||
    norm === "기반" ||
    norm === "securedfoundation" ||
    norm === "foundation"
  );
}

/** Explicit supported future aliases */
export function isFutureHeading(rawTitle: string): boolean {
  const norm = normalizeKey(rawTitle);
  return (
    norm === "앞으로의도입경로" ||
    norm === "앞으로의경로" ||
    norm === "향후여정" ||
    norm === "향후계획" ||
    norm === "도입경로" ||
    norm === "futuretrajectory" ||
    norm === "future" ||
    norm === "roadmap" ||
    norm === "nextsteps"
  );
}

/** Parse `## 프로젝트 지도` tokens into structured rails & groups. */
export function parseProjectMap(tokens: Token[]): ParsedMap {
  if (!tokens || tokens.length === 0) {
    return { isNativeMap: false, rails: [] };
  }

  const hasH3 = tokens.some((t) => t.type === "heading_open" && t.tag === "h3");
  if (!hasH3) {
    return { isNativeMap: false, rails: [], rawTokens: tokens };
  }

  const rails: MapRail[] = [];
  let currentRail: MapRail | null = null;
  let currentGroup: MapGroup | null = null;
  let groupTokens: Token[] = [];
  let hasCurrentStage = false;

  const flushGroup = () => {
    if (currentRail && currentGroup) {
      const isCurrentStage = isCurrentStageHeading(currentGroup.title);
      currentGroup.items = parseListItems(
        groupTokens,
        currentRail.title,
        currentGroup.title,
        isCurrentStage
      );
      currentGroup.isOrdered = groupTokens.some((t) => t.type === "ordered_list_open");

      if (isCurrentStage && currentGroup.items.length > 0) {
        hasCurrentStage = true;
      }

      currentRail.groups.push(currentGroup);
      currentGroup = null;
      groupTokens = [];
    }
  };

  const flushRail = () => {
    flushGroup();
    if (currentRail && currentRail.groups.length > 0) {
      const isTrajectory = currentRail.groups.some((g) =>
        isCurrentStageHeading(g.title)
      );
      currentRail.railType = isTrajectory ? "trajectory" : "neutral";
      rails.push(currentRail);
      currentRail = null;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && t.tag === "h3") {
      flushRail();
      const railTitle = tokens[i + 1]?.content.trim() ?? "지도 레일";
      currentRail = {
        title: railTitle,
        railType: "neutral",
        groups: [],
      };
      i += 2;
    } else if (t.type === "heading_open" && t.tag === "h4") {
      flushGroup();
      const groupTitle = tokens[i + 1]?.content.trim() ?? "그룹";
      currentGroup = {
        title: groupTitle,
        items: [],
      };
      groupTokens = [];
      i += 2;
    } else if (currentGroup) {
      groupTokens.push(t);
    }
  }

  flushRail();

  if (rails.length === 0) {
    return { isNativeMap: false, rails: [], rawTokens: tokens };
  }

  return {
    isNativeMap: true,
    rails,
    hasCurrentStage,
    rawTokens: tokens,
  };
}

/** Parse `## 영역 상세` into AreaDetail records. */
export function parseAreaDetails(tokens: Token[]): Map<string, AreaDetail> {
  const details = new Map<string, AreaDetail>();
  if (!tokens || tokens.length === 0) return details;

  let currentArea: AreaDetail | null = null;
  let currentSubsection: { subheading: string; tokens: Token[] } | null = null;

  const flushSubsection = () => {
    if (currentArea && currentSubsection) {
      const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
      const rawText = extractSectionRawText(currentSubsection.tokens);

      currentArea.subsections.push({
        subheading: currentSubsection.subheading,
        html,
        rawText,
        tone: classifySubsectionTone(currentSubsection.subheading, rawText),
      });
      currentSubsection = null;
    }
  };

  const flushArea = () => {
    flushSubsection();
    if (currentArea) {
      details.set(currentArea.normalizedKey, currentArea);
      currentArea = null;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && t.tag === "h3") {
      flushArea();
      const title = tokens[i + 1]?.content.trim() ?? "";
      currentArea = {
        title,
        normalizedKey: normalizeTitle(title),
        subsections: [],
      };
      i += 2;
    } else if (t.type === "heading_open" && t.tag === "h4" && currentArea) {
      flushSubsection();
      const subheading = tokens[i + 1]?.content.trim() ?? "";
      currentSubsection = {
        subheading,
        tokens: [],
      };
      i += 2;
    } else if (currentSubsection) {
      currentSubsection.tokens.push(t);
    }
  }

  flushArea();
  return details;
}

/** Find matching AreaDetail for a given map item by deterministic exact title equality */
export function findAreaDetail(
  item: MapItem | string,
  areaDetails: Map<string, AreaDetail>
): AreaDetail | undefined {
  const title = typeof item === "string" ? item : item.title;
  return areaDetails.get(normalizeTitle(title));
}

/**
 * Conservative veto for evidence promotion.
 * Returns true only when the ENTIRE subsection content clearly states that no
 * verifiable evidence exists yet (absent / unverified / planned-only).
 * Phrase-level anchored matching only: the whole normalized line must be a
 * placeholder phrase. A single concrete evidence clause anywhere keeps the
 * subsection at evidence, so mixed "concrete evidence + future plan" content
 * is never demoted by a broad substring rule.
 */
function isClearlyUnverifiedOrPlannedEvidence(cleanText: string): boolean {
  if (cleanText === "") return true;
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => {
    const withoutLabel = line
      .replace(/^(?:근거|증거|evidence|proof)\s*[:：]\s*/i, "")
      .trim();
    const core = withoutLabel.replace(/[.．。;；!！]+$/, "").trim();
    if (!core) return true;
    // Korean absent / unverified — whole-line anchored only.
    if (
      /^(?:없음|해당\s*없음|아직\s*없음|아직\s*근거\s*없음|근거\s*없음|증거\s*없음|근거\s*미확보|미확인|미검증|미작성|미수립|예정|향후\s*과제|추후\s*과제|향후\s*작업|추후\s*작업)$/.test(
        core
      )
    ) {
      return true;
    }
    // Korean planned-only — whole-line anchored only.
    if (
      /^(?:아직\s*|추가\s*|추후\s*|향후\s*)?(?:테스트|검증|확인|작성|수립|확보|측정)\s*예정(?:입니다|임)?$/.test(
        core
      )
    ) {
      return true;
    }
    if (/^추후\s*(?:테스트|검증|확인|작성|수립|확보|측정)(?:\s*예정)?$/.test(core)) {
      return true;
    }
    if (
      /^(?:아직\s*|추가\s*|추후\s*)?(?:테스트|검증|확인|작성)\s*(?:필요|요망|요구)(?:함|입니다|임)?$/.test(
        core
      )
    ) {
      return true;
    }
    // English absent / unverified — whole-line anchored only.
    if (
      /^(?:none|no\s*evidence|not\s*verified|not\s*proven|unverified|unconfirmed|unknown|tbd|n\/a|planned|future\s*work|future-work)$/i.test(
        core
      )
    ) {
      return true;
    }
    // English planned / required — whole-line anchored only.
    if (
      /^(?:verification|confirmation|test(?:s|ing)?)\s*(?:required|needed|pending|planned)$/i.test(
        core
      )
    ) {
      return true;
    }
    if (
      /^(?:pending(?:\s*(?:verification|confirmation|test|testing))?|to\s*be\s*(?:verified|confirmed|tested)|awaiting\s*(?:verification|confirmation|test|testing)?)$/i.test(
        core
      )
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Canonical semantic tone classifier for Universal Inspector subsections.
 * Resolves deterministic visual tone based on semantic role and concrete content state.
 */
export function classifySubsectionTone(
  subheading: string,
  rawText?: string,
  contextState?: string
): SemanticTone {
  const normKey = normalizeKey(subheading);
  const cleanText = (rawText || "").trim();
  const firstLine = cleanText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean)[0] ?? "";

  // 1. Explicitly closed, resolved, empty, or 'none' states:
  // Must NOT be classified as danger even if subheading is "남은 문제" / "remaining issues"
  const isExplicitlyClosedOrNone =
    cleanText === "" ||
    /^(?:없음|해당\s*없음|해결됨|완료됨|닫힘|특이\s*사항\s*없음|none|n\/a|closed|resolved|all\s+resolved|no\s+remaining\s+issues?|no\s+issues?)\.?$/i.test(
      firstLine
    ) ||
    /^(?:남은\s*문제|remaining\s*issues?)\s*[:：]\s*(?:없음|해당\s*없음|none|n\/a|closed|해결됨)\.?$/i.test(
      firstLine
    );

  // 2. Evidence / Proof verification:
  // Must NOT claim positive/evidence state without actual supporting content.
  // UNKNOWN, unverified, or empty evidence remains neutral.
  const isEvidenceHeading =
    normKey.includes("근거") ||
    normKey.includes("증거") ||
    normKey.includes("evidence") ||
    normKey.includes("proof");

  if (isEvidenceHeading) {
    if (isClearlyUnverifiedOrPlannedEvidence(cleanText)) {
      return "neutral";
    }
    return "evidence";
  }

  // 3. Unresolved issues / blockers (Danger):
  const isIssueHeading =
    normKey.includes("남은문제") ||
    normKey.includes("직면한문제") ||
    normKey.includes("막힌것") ||
    normKey.includes("remainingissues") ||
    normKey.includes("remaining") ||
    normKey.includes("blocker") ||
    normKey.includes("issues") ||
    normKey.includes("남은과제");

  if (isIssueHeading) {
    if (isExplicitlyClosedOrNone) {
      return "neutral";
    }
    return "danger";
  }

  // 4. Transitions / Entry conditions / In-progress conditions (Active):
  const isActiveHeading =
    normKey.includes("진입조건") ||
    normKey.includes("개시조건") ||
    normKey.includes("entrycondition") ||
    normKey.includes("openswhen") ||
    normKey.includes("다음전환") ||
    normKey.includes("nexttransition") ||
    normKey.includes("전환") ||
    normKey.includes("transition") ||
    normKey.includes("왜지금") ||
    normKey.includes("whynow") ||
    normKey.includes("단계영향") ||
    normKey.includes("stageimpact") ||
    normKey === "before" ||
    normKey === "materialchange" ||
    normKey === "after" ||
    normKey.includes("변경");

  if (isActiveHeading) {
    return "active";
  }

  // Context-level active state if entity is explicitly in-progress
  if (contextState) {
    const normState = normalizeKey(contextState);
    if (
      normState.includes("inproof") ||
      normState.includes("inreview") ||
      normState.includes("partial")
    ) {
      if (normKey.includes("조건") || normKey.includes("condition")) {
        return "active";
      }
    }
  }

  // 5. Explicitly closed boundaries:
  if (
    normKey.includes("이미닫힌") ||
    normKey.includes("closedboundaries") ||
    normKey.includes("closed")
  ) {
    return "neutral";
  }

  // 6. Neutral fallback (Meaning, Current Level, Info, Custom subsections)
  return "neutral";
}

interface HeadingBlock {
  title: string;
  tokens: Token[];
}

interface SemanticContent {
  leadTokens: Token[];
  leadText: string;
  html: string;
  rawText: string;
  summaryText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
}

const MATURITY_STATE_ALIASES: Record<string, MaturityState> = {
  STRONG: "STRONG",
  "강함": "STRONG",
  "강한": "STRONG",
  PARTIAL: "PARTIAL",
  "부분": "PARTIAL",
  "부분적": "PARTIAL",
  WEAK: "WEAK",
  "약함": "WEAK",
  UNKNOWN: "UNKNOWN",
  "미확인": "UNKNOWN",
  "알 수 없음": "UNKNOWN",
};

const STAGE_GATE_STATES = [
  "CLOSED",
  "IN PROOF",
  "NOT OPEN",
  "OPEN",
  "IN REVIEW",
  "PROVEN",
  "NOT PROVEN",
  "UNKNOWN",
  "BLOCKED",
];

function parseHeadingBlocks(tokens?: Token[], tag: "h3" | "h4" = "h3"): HeadingBlock[] {
  const blocks: HeadingBlock[] = [];
  if (!tokens || tokens.length === 0) return blocks;

  let current: HeadingBlock | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open" && token.tag === tag) {
      flush();
      current = {
        title: tokens[i + 1]?.content.trim() ?? "",
        tokens: [],
      };
      i += 2;
    } else if (current) {
      current.tokens.push(token);
    }
  }
  flush();
  return blocks;
}

function splitSemanticContent(tokens: Token[]): SemanticContent {
  const leadTokens: Token[] = [];
  const subsections: SemanticSubsection[] = [];
  let currentSubsection: { subheading: string; tokens: Token[] } | null = null;

  const flushSubsection = () => {
    if (!currentSubsection) return;
    const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
    const rawText = extractSectionRawText(currentSubsection.tokens);
    subsections.push({
      subheading: currentSubsection.subheading,
      html,
      rawText,
      tone: classifySubsectionTone(currentSubsection.subheading, rawText),
    });
    currentSubsection = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open" && token.tag === "h4") {
      flushSubsection();
      currentSubsection = {
        subheading: tokens[i + 1]?.content.trim() ?? "",
        tokens: [],
      };
      i += 2;
    } else if (currentSubsection) {
      currentSubsection.tokens.push(token);
    } else {
      leadTokens.push(token);
    }
  }
  flushSubsection();

  const leadText = extractSectionRawText(leadTokens);
  const rawText = extractSectionRawText(tokens);
  const html = withMermaidPlaceholders(renderTokens(tokens));

  return {
    leadTokens,
    leadText,
    html,
    rawText,
    summaryText: firstSemanticSentence(leadText || rawText),
    subsections,
    relations: parseRelations(rawText),
  };
}

function stripInlineMarkup(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
    .trim();
}

function firstSemanticSentence(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => stripInlineMarkup(line.replace(/^\s*[-*+]\s+/, "")))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSemanticMetadataLine(line));
  return lines[0] ?? "";
}

function isSemanticMetadataLine(line: string): boolean {
  return /^(?:역할|role|관련\s*(?:영역|단계|상태|축|최전선|변화)|related\s+(?:areas?|stage|posture|frontier|movements?)|진입\s*조건|개시\s*조건|entry\s+condition|opens\s+when|현재|목표|이전|이후|변경|before|after|change|target|from|to)\s*:/i.test(
    line
  ) || /^(?:STRONG|PARTIAL|WEAK|UNKNOWN|BLOCKED|CLOSED|IN PROOF|NOT OPEN|OPEN)$/i.test(line);
}

function parseRelations(rawText: string): SemanticRelation[] {
  const relations: SemanticRelation[] = [];
  const rules: Array<{ kind: SemanticRelationKind; pattern: RegExp }> = [
    {
      kind: "area",
      pattern: /^(?:관련\s*영역|related\s+areas?|related\s+area)\s*[:：]\s*(.+)$/i,
    },
    {
      kind: "stage",
      pattern: /^(?:관련\s*단계|related\s+stage)\s*[:：]\s*(.+)$/i,
    },
    {
      kind: "posture",
      pattern: /^(?:관련\s*(?:상태|축)|related\s+posture)\s*[:：]\s*(.+)$/i,
    },
    {
      kind: "frontier",
      pattern: /^(?:관련\s*(?:최전선|프론티어)|related\s+frontier)\s*[:：]\s*(.+)$/i,
    },
    {
      kind: "movement",
      pattern: /^(?:관련\s*(?:변화|흐름)|related\s+movements?|related\s+movement)\s*[:：]\s*(.+)$/i,
    },
  ];

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, ""));
    if (!line) continue;
    for (const rule of rules) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      for (const target of splitRelationTargets(match[1])) {
        if (!target) continue;
        if (!relations.some((relation) => relation.kind === rule.kind && relation.target === target)) {
          relations.push({ kind: rule.kind, target });
        }
      }
      break;
    }
  }
  return relations;
}

function splitRelationTargets(value: string): string[] {
  return value
    .split(/\s*,\s*|\s+및\s+|\s+and\s+/i)
    .map((target) => stripInlineMarkup(target).replace(/[.;]+$/, "").trim())
    .filter(Boolean);
}

function parseMaturityState(value: string): MaturityState | null {
  const clean = stripInlineMarkup(value).trim().toUpperCase();
  return MATURITY_STATE_ALIASES[clean] ?? null;
}

function parseHeadingState(rawHeading: string): {
  title: string;
  state: MaturityState | null;
  declaredState: string;
} {
  const heading = stripInlineMarkup(rawHeading).trim();
  const match = /^(.*?)\s+(?:—|–|-)\s*([A-Za-z가-힣][A-Za-z가-힣 ]*)\s*$/.exec(heading);
  if (!match) {
    return { title: heading, state: null, declaredState: "" };
  }
  const declaredState = match[2].trim();
  return {
    title: match[1].trim(),
    state: parseMaturityState(declaredState),
    declaredState,
  };
}

function parseStateLine(rawText: string): { state: MaturityState | null; declaredState: string } {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, "")).trim();
    if (!line) continue;
    const state = parseMaturityState(line);
    if (state) return { state, declaredState: line };
    if (/^BLOCKED$/i.test(line)) return { state: null, declaredState: line };
  }
  return { state: null, declaredState: "" };
}

function parseStageStateLine(rawText: string): string {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, "")).trim();
    if (!line) continue;
    const match = STAGE_GATE_STATES.find((state) => state.toLowerCase() === line.toLowerCase());
    if (match) return match;
  }
  return "";
}

function extractLabeledValue(rawText: string, labels: string[]): string {
  const labelPattern = labels
    .map((label) => label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"))
    .join("|");
  const pattern = new RegExp(`^(?:[-*+]\\s*)?(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = stripInlineMarkup(rawLine).trim();
    const match = pattern.exec(line);
    if (match) return match[1].trim();
  }
  return "";
}

function parseArrowTransition(value: string): { before: string; after: string } | null {
  const match = /([^\n→>-]{1,80}?)\s*(?:→|->)\s*([^\n]{1,120})/.exec(stripInlineMarkup(value));
  if (!match) return null;
  const before = match[1].replace(/^[-*+:\s]+/, "").trim();
  const after = match[2].replace(/[.;]+$/, "").trim();
  if (!before || !after) return null;
  return { before, after };
}

function subsectionText(subsections: SemanticSubsection[], labels: string[]): string {
  return (
    subsections.find((subsection) =>
      labels.some((label) => normalizeKey(subsection.subheading).includes(normalizeKey(label)))
    )?.rawText ?? ""
  );
}

function isStageBlockerText(rawText: string): boolean {
  const marker = /stage[-\s]*blocker|단계\s*blocker/i;
  for (const rawLine of rawText.split(/\r?\n/)) {
    if (!marker.test(rawLine)) continue;
    if (/(?:아님|아니다|아니며|없음|해당\s*없|no|false|not|does\s+not|doesn't)/i.test(rawLine)) {
      continue;
    }
    return true;
  }
  return false;
}

function parsePostureRole(title: string, rawText: string): PostureRole {
  const roleLine = extractLabeledValue(rawText, ["역할", "role"]);
  const role = stripInlineMarkup(roleLine).toUpperCase();
  if (/CORE\s*(?:CAPABILITY|PRODUCT|VIEWER)/i.test(role)) return "core-capability";
  if (/(?:DELIVERY|STAGE|RELEASE|ADOPTION)\s*(?:READINESS|READY)/i.test(role)) {
    return "delivery-readiness";
  }

  const normalizedTitle = stripInlineMarkup(title).toLowerCase();
  if (/core\s*(?:capability|product|viewer)|핵심\s*(?:역량|제품|뷰어)/i.test(normalizedTitle)) {
    return "core-capability";
  }
  if (/(?:delivery|stage|release|adoption)\s*readiness|출하\s*준비|단계\s*준비/i.test(normalizedTitle)) {
    return "delivery-readiness";
  }
  return undefined;
}

function parseStageSegmentTitle(rawHeading: string): { role: StageSegment["role"]; title: string } {
  const heading = stripInlineMarkup(rawHeading).trim();
  const match = /^(현재|다음|current|next)\s*(?:—|–|:|-)?\s*(.*)$/i.exec(heading);
  if (!match) return { role: "other", title: heading };
  const role = /^(현재|current)$/i.test(match[1]) ? "current" : "next";
  return { role, title: match[2].trim() || heading };
}

function parseStageGateLine(rawLine: string): { title: string; state: string } {
  const line = stripInlineMarkup(rawLine).replace(/^\s*[-*+]\s+/, "").trim();
  const statePattern = STAGE_GATE_STATES.map((state) => state.replace(/ /g, "\\s+")).join("|");
  const leading = new RegExp(`^(${statePattern})\\s*(?:—|–|->|:|-)\\s*(.+)$`, "i").exec(line);
  if (leading) return { title: leading[2].trim(), state: leading[1].replace(/\s+/g, " ").toUpperCase() };
  const trailing = new RegExp(`^(.+?)\\s*(?:—|–|->|:)\\s*(${statePattern})$`, "i").exec(line);
  if (trailing) return { title: trailing[1].trim(), state: trailing[2].replace(/\s+/g, " ").toUpperCase() };
  return { title: line, state: "" };
}

function parseStageGateList(tokens: Token[], segmentTitle: string): StageGate[] {
  const gates: StageGate[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "list_item_open") continue;
    let end = i + 1;
    while (end < tokens.length && tokens[end].type !== "list_item_close") end++;
    const inline = tokens.slice(i + 1, end).find((candidate) => candidate.type === "inline");
    if (!inline) continue;
    const parsed = parseStageGateLine(inline.content);
    const rawText = extractSectionRawText(tokens.slice(i + 1, end));
    gates.push({
      title: parsed.title,
      state: parsed.state,
      summaryText: firstSemanticSentence(rawText),
      entryCondition: extractLabeledValue(rawText, STAGE_ENTRY_CONDITION_LABELS) || undefined,
      html: withMermaidPlaceholders(renderTokens(tokens.slice(i + 1, end))),
      rawText,
      subsections: [],
      relations: parseRelations(rawText),
      isStageBlocker: isStageBlockerText(rawText) || isStageBlockerText(segmentTitle),
    });
  }
  return gates;
}

export function parseProjectHorizon(
  tokens: Token[] | undefined,
  isLegacyFallback = false
): ProjectHorizon | undefined {
  if (!tokens || tokens.length === 0) return undefined;
  const content = splitSemanticContent(tokens);
  return {
    title: isLegacyFallback ? "현재 상황" : "프로젝트 지평",
    html: content.html,
    rawText: content.rawText,
    summaryText: content.summaryText,
    isLegacyFallback,
  };
}

export function parseStageJourney(tokens?: Token[]): StageJourney | undefined {
  if (!tokens || tokens.length === 0) return undefined;
  const segments: StageSegment[] = [];
  for (const block of parseHeadingBlocks(tokens, "h3")) {
    const segmentInfo = parseStageSegmentTitle(block.title);
    const content = splitSemanticContent(block.tokens);
    let gates = parseStageGateList(block.tokens, segmentInfo.title);
    if (gates.length === 0) {
      const stateLine = parseStateLine(content.rawText);
      const stageState = parseStageStateLine(content.rawText);
      gates = [
        {
          title: segmentInfo.title,
          state: stageState || stateLine.declaredState,
          summaryText: content.summaryText,
          entryCondition: extractLabeledValue(content.rawText, STAGE_ENTRY_CONDITION_LABELS) || undefined,
          html: content.html,
          rawText: content.rawText,
          subsections: content.subsections,
          relations: content.relations,
          isStageBlocker: isStageBlockerText(content.rawText),
        },
      ];
    }
    segments.push({
      role: segmentInfo.role,
      title: segmentInfo.title,
      html: content.html,
      rawText: content.rawText,
      gates,
    });
  }

  const current = segments.find((segment) => segment.role === "current");
  const next = segments.find((segment) => segment.role === "next");
  return {
    segments,
    currentStage: current?.title,
    nextStage: next?.title,
    currentGates: current?.gates ?? [],
    nextGates: next?.gates ?? [],
    rawText: extractSectionRawText(tokens),
  };
}

export function parseProjectPosture(tokens?: Token[]): ProjectPosture | undefined {
  if (!tokens || tokens.length === 0) return undefined;
  const axes: PostureAxis[] = [];
  for (const block of parseHeadingBlocks(tokens, "h3")) {
    const heading = parseHeadingState(block.title);
    const content = splitSemanticContent(block.tokens);
    const bodyState = parseStateLine(content.rawText);
    const state = heading.state ?? bodyState.state;
    const declaredState = heading.declaredState || bodyState.declaredState;
    axes.push({
      title: heading.title,
      state,
      declaredState,
      role: parsePostureRole(heading.title, content.rawText),
      summaryText: firstSemanticSentence(content.leadText || content.rawText),
      html: content.html,
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
      isStageBlocker: isStageBlockerText(content.rawText),
    });
  }
  return { axes, rawText: extractSectionRawText(tokens) };
}

function parseFrontierRole(rawHeading: string): {
  title: string;
  isPrimary: boolean;
  isCoPrimary: boolean;
} {
  const heading = stripInlineMarkup(rawHeading).trim();
  const coPrimary = /^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선)\]\s*/i.test(heading);
  const primary = /^\s*\[(?:PRIMARY|주요\s*최전선)\]\s*/i.test(heading);
  const secondary = /^\s*\[(?:SECONDARY|보조)\]\s*/i.test(heading);
  const title = heading.replace(/^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선|PRIMARY|주요\s*최전선|SECONDARY|보조)\]\s*/i, "").trim();
  return { title, isPrimary: coPrimary || primary || !secondary, isCoPrimary: coPrimary };
}

export function parseCurrentFrontiers(tokens?: Token[]): Frontier[] {
  if (!tokens || tokens.length === 0) return [];
  const blocks = parseHeadingBlocks(tokens, "h3");
  const frontiers: Frontier[] = [];
  for (const block of blocks) {
    const role = parseFrontierRole(block.title);
    const content = splitSemanticContent(block.tokens);
    const transition = parseArrowTransition(content.rawText) ?? parseArrowTransition(block.title);
    const currentState = extractLabeledValue(content.rawText, ["현재", "current", "from"]) || transition?.before || "";
    const targetState = extractLabeledValue(content.rawText, ["목표", "target", "to"]) || transition?.after || "";
    frontiers.push({
      title: role.title,
      currentState,
      targetState,
      whyNow: subsectionText(content.subsections, ["왜 지금", "why now"]),
      successMeaning: subsectionText(content.subsections, ["완료 의미", "success", "성공"]),
      stageImpact: subsectionText(content.subsections, ["단계 영향", "stage impact"]),
      closedBoundaries: subsectionText(content.subsections, ["이미 닫힌", "closed"]),
      evidence: subsectionText(content.subsections, ["근거", "evidence"]),
      summaryText: content.summaryText,
      html: content.html,
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
      isPrimary: role.isPrimary,
      isCoPrimary: role.isCoPrimary,
    });
  }
  return frontiers;
}

export function parseStrategicThreads(tokens?: Token[]): StrategicThread[] {
  if (!tokens || tokens.length === 0) return [];
  return parseHeadingBlocks(tokens, "h3").map((block) => {
    const heading = parseHeadingState(block.title);
    const content = splitSemanticContent(block.tokens);
    const bodyState = parseStateLine(content.rawText);
    return {
      title: heading.title,
      state: heading.declaredState || bodyState.declaredState,
      summaryText: content.summaryText,
      html: content.html,
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
    };
  });
}

export function parseMaterialMovements(tokens?: Token[]): MaterialMovement[] {
  if (!tokens || tokens.length === 0) return [];
  return parseHeadingBlocks(tokens, "h3").map((block) => {
    const content = splitSemanticContent(block.tokens);
    const transition = parseArrowTransition(content.rawText) ?? parseArrowTransition(block.title);
    const before = extractLabeledValue(content.rawText, ["이전", "before", "from"]) || transition?.before || "";
    const after = extractLabeledValue(content.rawText, ["이후", "after", "to"]) || transition?.after || "";
    const change = extractLabeledValue(content.rawText, ["변경", "material change", "change"]) || firstSemanticSentence(content.leadText) || stripInlineMarkup(block.title);
    const title = stripInlineMarkup(block.title).replace(/\s*(?:—|–|-)\s*[^—–>-]+\s*(?:→|->)\s*[^\n]+$/, "").trim();
    return {
      title: title || stripInlineMarkup(block.title),
      before,
      change,
      after,
      summaryText: content.summaryText,
      html: content.html,
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
      hasStateTransition: Boolean(before && after),
    };
  });
}

export interface ParsedMentalModel {
  horizon?: ProjectHorizon;
  stageJourney?: StageJourney;
  posture?: ProjectPosture;
  frontiers: Frontier[];
  strategicThreads: StrategicThread[];
  movements: MaterialMovement[];
}

function sectionWithFallback(
  sections: Map<string, Token[]>,
  canonical: string,
  legacy: string[] = []
): { tokens?: Token[]; isLegacyFallback: boolean } {
  const canonicalTokens = sections.get(canonical);
  if (canonicalTokens && canonicalTokens.length > 0) {
    return { tokens: canonicalTokens, isLegacyFallback: false };
  }
  for (const legacyKey of legacy) {
    const legacyTokens = sections.get(legacyKey);
    if (legacyTokens && legacyTokens.length > 0) {
      return { tokens: legacyTokens, isLegacyFallback: true };
    }
  }
  return { isLegacyFallback: false };
}

export function parseMentalModel(sections: Map<string, Token[]>): ParsedMentalModel {
  const horizon = sectionWithFallback(sections, "project horizon", ["current situation"]);
  const movement = sectionWithFallback(sections, "recent material movement", ["recently completed"]);
  return {
    horizon: parseProjectHorizon(horizon.tokens, horizon.isLegacyFallback),
    stageJourney: parseStageJourney(sections.get("stage journey")),
    posture: parseProjectPosture(sections.get("project posture")),
    frontiers: parseCurrentFrontiers(sections.get("current frontier")),
    strategicThreads: parseStrategicThreads(sections.get("strategic threads")),
    movements: parseMaterialMovements(movement.tokens),
  };
}

function findTopLevelTelemetry(rawText: string): string[] {
  const findings: string[] = [];
  if (/\b[0-9a-f]{40}\b/i.test(rawText)) findings.push("a full Git SHA");
  if (/\bPID\s+\d+\b/i.test(rawText)) findings.push("an explicit PID");
  if (/::test_[A-Za-z0-9_.-]+/.test(rawText)) findings.push("a pytest-style test node");
  if (/(?:^|[\s(`])\/(?:Users|home|private|workspace|tmp|var)\/[^\s`)>]+/i.test(rawText)) {
    findings.push("an absolute implementation path");
  }
  return findings;
}

export interface AreaCompleteness {
  totalItems: number;
  matchedItems: number;
  missingItems: number;
  missingTitles: string[];
}

export interface StructuralCheckResult {
  ok: boolean;
  totalMapItems: number;
  matchedDetails: number;
  missingDetails: number;
  missingTitles: string[];
  orphanDetails: number;
  orphanTitles: string[];
  duplicateDetails: string[];
  currentStageCount: number;
  currentFocusCount: number;
  hasProjectMap: boolean;
  hasAreaDetails: boolean;
  hasProjectHorizon: boolean;
  hasStageJourney: boolean;
  hasProjectPosture: boolean;
  postureAxisCount: number;
  postureCoreCapabilityCount: number;
  postureDeliveryReadinessCount: number;
  primaryFrontierCount: number;
  coPrimaryFrontierCount: number;
  hasStrategicThreads: boolean;
  hasMaterialMovement: boolean;
  materialMovementCount: number;
  unresolvedRelations: string[];
  guardrailErrors: string[];
  errors: string[];
}

/** Deterministic structural completeness check across map items, area details, and current stage */
export function checkProgressStructure(
  markdownOrTokens: string | Token[]
): StructuralCheckResult {
  const tokens =
    typeof markdownOrTokens === "string"
      ? md.parse(markdownOrTokens, {})
      : markdownOrTokens;

  const { sections } = splitSections(tokens);

  const mapTokens = sections.get("project map");
  const detailTokens = sections.get("area details");

  const hasProjectMap = Boolean(mapTokens && mapTokens.length > 0);
  const hasAreaDetails = Boolean(detailTokens && detailTokens.length > 0);

  const mentalModel = parseMentalModel(sections);
  const hasProjectHorizon = Boolean(
    sections.get("project horizon") && sections.get("project horizon")!.length > 0
  );
  const hasStageJourney = Boolean(
    sections.get("stage journey") && sections.get("stage journey")!.length > 0
  );
  const hasProjectPosture = Boolean(
    sections.get("project posture") && sections.get("project posture")!.length > 0
  );
  const hasStrategicThreads = Boolean(
    sections.get("strategic threads") && sections.get("strategic threads")!.length > 0
  );
  const hasMaterialMovement = Boolean(
    sections.get("recent material movement") &&
      sections.get("recent material movement")!.length > 0
  );

  // Count Current Focus H2 sections
  let currentFocusCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
      const headingToken = tokens[i + 1];
      if (headingToken && normalizeHeading([headingToken]) === "current focus") {
        currentFocusCount++;
      }
    }
  }

  const parsedMap = mapTokens
    ? parseProjectMap(mapTokens)
    : { isNativeMap: false, rails: [] };

  // Count Current Stage groups per rail and gather map items
  let currentStageCount = 0;
  const mapItemTitles: string[] = [];
  const mapItemKeyCounts = new Map<string, number>();
  const multiStageRailErrors: string[] = [];

  if (parsedMap.rails) {
    for (const rail of parsedMap.rails) {
      let railStageCount = 0;
      for (const group of rail.groups) {
        if (isCurrentStageHeading(group.title)) {
          currentStageCount++;
          railStageCount++;
        }
        for (const item of group.items) {
          mapItemTitles.push(item.title);
          const key = normalizeTitle(item.title);
          mapItemKeyCounts.set(key, (mapItemKeyCounts.get(key) ?? 0) + 1);
        }
      }
      if (railStageCount > 1) {
        multiStageRailErrors.push(
          `Multiple '현재 단계' (Current Stage) groups found in rail '${rail.title}' (${railStageCount}). At most 1 allowed per rail.`
        );
      }
    }
  }

  const totalMapItems = mapItemTitles.length;

  // Parse Area Details and detect duplicates
  const areaDetails = new Map<string, AreaDetail>();
  const duplicateDetails: string[] = [];
  const seenDetailKeys = new Set<string>();

  if (detailTokens && detailTokens.length > 0) {
    let currentArea: AreaDetail | null = null;
    let currentSubsection: { subheading: string; tokens: Token[] } | null = null;

    const flushSubsection = () => {
      if (currentArea && currentSubsection) {
        const html = withMermaidPlaceholders(
          renderTokens(currentSubsection.tokens)
        );
        const rawText = extractSectionRawText(currentSubsection.tokens);

        currentArea.subsections.push({
          subheading: currentSubsection.subheading,
          html,
          rawText,
        });
        currentSubsection = null;
      }
    };

    const flushArea = () => {
      flushSubsection();
      if (currentArea) {
        areaDetails.set(currentArea.normalizedKey, currentArea);
        currentArea = null;
      }
    };

    for (let i = 0; i < detailTokens.length; i++) {
      const t = detailTokens[i];
      if (t.type === "heading_open" && t.tag === "h3") {
        flushArea();
        const title = detailTokens[i + 1]?.content.trim() ?? "";
        const normKey = normalizeTitle(title);
        if (seenDetailKeys.has(normKey)) {
          duplicateDetails.push(title);
        } else {
          seenDetailKeys.add(normKey);
        }
        currentArea = {
          title,
          normalizedKey: normKey,
          subsections: [],
        };
        i += 2;
      } else if (t.type === "heading_open" && t.tag === "h4" && currentArea) {
        flushSubsection();
        const subheading = detailTokens[i + 1]?.content.trim() ?? "";
        currentSubsection = {
          subheading,
          tokens: [],
        };
        i += 2;
      } else if (currentSubsection) {
        currentSubsection.tokens.push(t);
      }
    }

    flushArea();
  }

  // Calculate missing items (map items without area detail)
  const missingTitles: string[] = [];
  let matchedDetails = 0;
  for (const title of mapItemTitles) {
    if (areaDetails.has(normalizeTitle(title))) {
      matchedDetails++;
    } else {
      missingTitles.push(title);
    }
  }
  const missingDetails = totalMapItems - matchedDetails;

  // Calculate orphan details (area details without matching map item)
  const orphanTitles: string[] = [];
  for (const [key, detail] of areaDetails.entries()) {
    if (!mapItemKeyCounts.has(key)) {
      orphanTitles.push(detail.title);
    }
  }
  const orphanDetails = orphanTitles.length;

  const postureAxes = mentalModel.posture?.axes ?? [];
  const frontiers = mentalModel.frontiers;
  const movements = mentalModel.movements;
  const primaryFrontiers = frontiers.filter((frontier) => frontier.isPrimary);
  const coPrimaryFrontiers = primaryFrontiers.filter((frontier) => frontier.isCoPrimary);
  const postureCoreCapabilityCount = postureAxes.filter(
    (axis) => axis.role === "core-capability"
  ).length;
  const postureDeliveryReadinessCount = postureAxes.filter(
    (axis) => axis.role === "delivery-readiness"
  ).length;

  const guardrailErrors: string[] = [];
  if (hasProjectHorizon) {
    const telemetry = findTopLevelTelemetry(mentalModel.horizon?.rawText ?? "");
    guardrailErrors.push(...telemetry.map((finding) => `Project Horizon contains ${finding}.`));
  }

  if (hasStageJourney) {
    if (!mentalModel.stageJourney || mentalModel.stageJourney.segments.length === 0) {
      guardrailErrors.push("Stage Journey must declare at least one stage segment.");
    } else {
      if (!mentalModel.stageJourney.currentStage) {
        guardrailErrors.push("Stage Journey must declare a '현재' (current) segment.");
      }
      if (!mentalModel.stageJourney.nextStage) {
        guardrailErrors.push("Stage Journey must declare a '다음' (next) segment.");
      }
      for (const segment of mentalModel.stageJourney.segments) {
        for (const gate of segment.gates) {
          if (!gate.state) {
            guardrailErrors.push(
              `Stage gate '${gate.title}' in '${segment.title}' is missing a declared state.`
            );
          }
        }
      }
    }
  }

  if (hasProjectPosture) {
    if (postureAxes.length < 5 || postureAxes.length > 8) {
      guardrailErrors.push(
        `Project Posture must contain 5–8 axes; found ${postureAxes.length}.`
      );
    }
    if (postureCoreCapabilityCount === 0) {
      guardrailErrors.push(
        "Project Posture must declare a Core Capability-equivalent axis or role."
      );
    }
    if (postureDeliveryReadinessCount === 0) {
      guardrailErrors.push(
        "Project Posture must declare a Delivery/Stage Readiness-equivalent axis or role."
      );
    }
    for (const axis of postureAxes) {
      if (axis.state === null) {
        if (/^BLOCKED$/i.test(axis.declaredState)) {
          guardrailErrors.push(
            `Posture axis '${axis.title}' encodes BLOCKED as maturity; use a separate Stage Blocker marker.`
          );
        } else {
          guardrailErrors.push(
            `Posture axis '${axis.title}' must declare one of STRONG, PARTIAL, WEAK, or UNKNOWN.`
          );
        }
      }
    }
  }

  if (sections.get("current frontier") && sections.get("current frontier")!.length > 0) {
    if (primaryFrontiers.length === 0) {
      guardrailErrors.push("Current Frontier must declare one Primary Frontier.");
    }
    if (
      primaryFrontiers.length > 1 &&
      (coPrimaryFrontiers.length !== primaryFrontiers.length ||
        coPrimaryFrontiers.length < 2)
    ) {
      guardrailErrors.push(
        "Multiple Primary Frontiers require an explicit [CO-PRIMARY] marker on every primary entry."
      );
    }
    for (const frontier of frontiers) {
      if (!frontier.currentState || !frontier.targetState) {
        guardrailErrors.push(
          `Frontier '${frontier.title}' must declare a current and target state transition.`
        );
      }
    }
  }

  if (hasMaterialMovement) {
    if (movements.length === 0) {
      guardrailErrors.push("Recent Material Movement must contain at least one movement entry.");
    }
    for (const movement of movements) {
      if (!movement.hasStateTransition) {
        guardrailErrors.push(
          `Material movement '${movement.title}' must declare a before → after state transition.`
        );
      }
    }
  }

  const relationTargets = {
    area: new Set(mapItemTitles.map((title) => normalizeTitle(title))),
    stage: new Set<string>(),
    posture: new Set(postureAxes.map((axis) => normalizeTitle(axis.title))),
    frontier: new Set(frontiers.map((frontier) => normalizeTitle(frontier.title))),
    movement: new Set(movements.map((movement) => normalizeTitle(movement.title))),
  };
  const stageJourney = mentalModel.stageJourney;
  if (stageJourney) {
    for (const segment of stageJourney.segments) {
      relationTargets.stage.add(normalizeTitle(segment.title));
      for (const gate of segment.gates) {
        relationTargets.stage.add(normalizeTitle(gate.title));
      }
    }
  }

  const unresolvedRelations: string[] = [];
  const validateRelations = (
    source: string,
    relations: SemanticRelation[]
  ) => {
    for (const relation of relations) {
      if (!relationTargets[relation.kind].has(normalizeTitle(relation.target))) {
        unresolvedRelations.push(
          `${source} → ${relation.kind} '${relation.target}' does not resolve to a visible title.`
        );
      }
    }
  };
  for (const segment of stageJourney?.segments ?? []) {
    for (const gate of segment.gates) validateRelations(`Stage gate '${gate.title}'`, gate.relations);
  }
  for (const axis of postureAxes) validateRelations(`Posture '${axis.title}'`, axis.relations);
  for (const frontier of frontiers) validateRelations(`Frontier '${frontier.title}'`, frontier.relations);
  for (const thread of mentalModel.strategicThreads) {
    validateRelations(`Strategic Thread '${thread.title}'`, thread.relations);
  }
  for (const movement of movements) validateRelations(`Movement '${movement.title}'`, movement.relations);

  const errors: string[] = [];

  if (!hasProjectMap || !parsedMap.isNativeMap || totalMapItems === 0) {
    errors.push(
      "Missing required '## 프로젝트 지도' (Project Map) surface or no map items found."
    );
  }
  if (!hasAreaDetails) {
    errors.push("Missing required '## 영역 상세' (Area Details) section.");
  }
  if (missingDetails > 0) {
    errors.push(`${missingDetails} map item(s) missing matching Area Detail.`);
  }
  if (orphanDetails > 0) {
    errors.push(
      `${orphanDetails} orphan Area Detail(s) without matching map item (title drift).`
    );
  }
  if (duplicateDetails.length > 0) {
    errors.push(
      `Duplicate Area Detail title(s) found: ${duplicateDetails.join(", ")}`
    );
  }
  if (currentFocusCount > 1) {
    errors.push(
      `Multiple '현재 집중' (Current Focus) sections found (${currentFocusCount}). At most 1 allowed.`
    );
  }
  for (const err of multiStageRailErrors) {
    errors.push(err);
  }
  errors.push(...guardrailErrors);
  errors.push(...unresolvedRelations);

  const ok = errors.length === 0;

  return {
    ok,
    totalMapItems,
    matchedDetails,
    missingDetails,
    missingTitles,
    orphanDetails,
    orphanTitles,
    duplicateDetails,
    currentStageCount,
    currentFocusCount,
    hasProjectMap,
    hasAreaDetails,
    hasProjectHorizon,
    hasStageJourney,
    hasProjectPosture,
    postureAxisCount: postureAxes.length,
    postureCoreCapabilityCount,
    postureDeliveryReadinessCount,
    primaryFrontierCount: primaryFrontiers.length,
    coPrimaryFrontierCount: coPrimaryFrontiers.length,
    hasStrategicThreads,
    hasMaterialMovement,
    materialMovementCount: movements.length,
    unresolvedRelations,
    guardrailErrors,
    errors,
  };
}

/** Format human-readable CLI report from check result */
export function formatStructuralCheckReport(
  result: StructuralCheckResult
): string {
  const lines: string[] = [];
  lines.push(`PROGRESS structural check: ${result.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push(`Map items:       ${result.totalMapItems}`);
  lines.push(`Area details:    ${result.matchedDetails}`);
  if (result.missingDetails > 0) {
    lines.push(`Missing details: ${result.missingDetails}`);
  }
  if (result.orphanDetails > 0) {
    lines.push(`Orphan details:  ${result.orphanDetails}`);
  }
  if (result.duplicateDetails.length > 0) {
    lines.push(`Duplicates:      ${result.duplicateDetails.length}`);
  }
  lines.push(`Current stage:   ${result.currentStageCount}`);
  if (result.currentFocusCount > 0) {
    lines.push(`Current focus:   ${result.currentFocusCount}`);
  }
  if (result.hasProjectHorizon || result.hasStageJourney || result.hasProjectPosture) {
    lines.push(`Horizon:          ${result.hasProjectHorizon ? "yes" : "no"}`);
    lines.push(`Stage Journey:    ${result.hasStageJourney ? "yes" : "no"}`);
    lines.push(`Posture axes:     ${result.postureAxisCount}`);
    lines.push(`Primary frontier: ${result.primaryFrontierCount}`);
    lines.push(`Material movement:${result.materialMovementCount}`);
  }
  if (result.unresolvedRelations.length > 0) {
    lines.push(`Relations:         ${result.unresolvedRelations.length} unresolved`);
  }
  lines.push("");

  if (result.missingTitles.length > 0) {
    lines.push("Missing:");
    for (const title of result.missingTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.orphanTitles.length > 0) {
    lines.push("Orphan details (no matching map item):");
    for (const title of result.orphanTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.duplicateDetails.length > 0) {
    lines.push("Duplicate Area Detail titles:");
    for (const title of result.duplicateDetails) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0 && !result.ok) {
    const nonMissingErrors = result.errors.filter(
      (e) =>
        !e.includes("missing matching Area Detail") &&
        !e.includes("orphan Area Detail") &&
        !e.includes("Duplicate Area Detail")
    );
    if (nonMissingErrors.length > 0) {
      lines.push("Errors:");
      for (const err of nonMissingErrors) {
        lines.push(`- ${err}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

/** Calculate structural area-detail completeness across all inspectable map items */
export function getAreaCompleteness(
  parsedMap: ParsedMap,
  areaDetails: Map<string, AreaDetail>
): AreaCompleteness {
  const missingTitles: string[] = [];
  let totalItems = 0;
  let matchedItems = 0;

  if (parsedMap && parsedMap.rails) {
    for (const rail of parsedMap.rails) {
      for (const group of rail.groups) {
        for (const item of group.items) {
          totalItems++;
          const detail = findAreaDetail(item, areaDetails);
          if (detail) {
            matchedItems++;
          } else {
            missingTitles.push(item.title);
          }
        }
      }
    }
  }

  return {
    totalItems,
    matchedItems,
    missingItems: totalItems - matchedItems,
    missingTitles,
  };
}

/** Render Native HTML Map */
export function renderNativeMap(
  parsedMap: ParsedMap,
  selectedAreaId: string | null = null,
  areaDetails?: Map<string, AreaDetail>,
  currentStageLabel?: string
): string {
  let html = `<div class="native-project-map">`;
  const currentStageGroupCount = parsedMap.rails
    .filter((rail) => rail.railType === "trajectory")
    .reduce(
      (count, rail) => count + rail.groups.filter((group) => isCurrentStageHeading(group.title)).length,
      0
    );
  const showCurrentStageLabel = Boolean(currentStageLabel) && currentStageGroupCount === 1;

  for (const rail of parsedMap.rails) {
    const isTrajectory = rail.railType === "trajectory";

    html += `<section class="map-rail map-rail-${rail.railType}">`;
    html += `
      <div class="rail-header">
        <h3 class="rail-title">${escapeHtml(rail.title)}</h3>
      </div>
    `;

    if (isTrajectory) {
      html += `<div class="trajectory-groups-container">`;
      for (const group of rail.groups) {
        const isFoundation = isFoundationHeading(group.title);
        const isCurrent = isCurrentStageHeading(group.title);
        const isFuture = isFutureHeading(group.title);

        if (isFoundation) {
          html += `
            <div class="trajectory-group group-foundation">
              <div class="group-header">
                <h4 class="group-name">${escapeHtml(group.title)}</h4>
              </div>
              <div class="group-items-grid">
          `;
          for (const item of group.items) {
            const isSelected = selectedAreaId === item.id;
            html += `
              <button
                type="button"
                class="map-card card-foundation ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="${escapeHtml(item.title)} 영역 검사"
              >
                <div class="card-inner">
                  <span class="card-title">${escapeHtml(item.title)}</span>
                  ${
                    item.description
                      ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          }
          html += `</div></div>`;
        } else if (isCurrent) {
          html += `
            <div class="trajectory-group group-current-stage">
              <div class="group-header">
                <span class="stage-tag">NOW · 현재 단계</span>
                ${showCurrentStageLabel ? `<span class="stage-id-tag">${escapeHtml(currentStageLabel ?? "")}</span>` : ""}
                <h4 class="group-name visually-hidden">${escapeHtml(group.title)}</h4>
              </div>
              <div class="group-items-grid">
          `;
          for (const item of group.items) {
            const isSelected = selectedAreaId === item.id;
            html += `
              <button
                type="button"
                class="map-card card-current-stage ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="현재 단계: ${escapeHtml(item.title)} 영역 검사"
              >
                <div class="card-inner">
                  <span class="card-title">${escapeHtml(item.title)}</span>
                  ${
                    item.description
                      ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          }
          html += `</div></div>`;
        } else if (isFuture) {
          html += `
            <div class="trajectory-group group-future">
              <div class="group-header">
                <h4 class="group-name">${escapeHtml(group.title)}</h4>
              </div>
              <div class="future-steps-flow">
          `;
          group.items.forEach((item, fIdx) => {
            const isSelected = selectedAreaId === item.id;
            if (fIdx > 0) {
              html += `<div class="future-step-arrow" aria-hidden="true">↓</div>`;
            }
            html += `
              <button
                type="button"
                class="map-card card-future ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="${escapeHtml(item.title)} 영역 검사"
              >
                <span class="step-num">${fIdx + 1}</span>
                <div class="step-body">
                  <span class="card-title">${escapeHtml(item.title)}</span>
                  ${
                    item.description
                      ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          });
          html += `</div></div>`;
        } else {
          // Other group inside trajectory
          const isGroupOrdered = Boolean(group.isOrdered);
          html += `
            <div class="trajectory-group neutral-group ${isGroupOrdered ? "group-ordered" : "group-peer"}">
              <div class="group-header">
                <h4 class="group-name">${escapeHtml(group.title)}</h4>
              </div>
          `;
          if (isGroupOrdered) {
            html += `<div class="group-items-flow group-items-ordered">`;
            group.items.forEach((item, itemIdx) => {
              const isSelected = selectedAreaId === item.id;
              if (itemIdx > 0) {
                html += `<div class="flow-step-arrow" aria-hidden="true">↓</div>`;
              }
              html += `
                <button
                  type="button"
                  class="map-card card-ordered ${isSelected ? "selected" : ""}"
                  data-item-id="${escapeHtml(item.id)}"
                  aria-label="${escapeHtml(item.title)} 영역 검사"
                >
                  <span class="step-num">${itemIdx + 1}</span>
                  <div class="step-body">
                    <span class="card-title">${escapeHtml(item.title)}</span>
                    ${
                      item.description
                        ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                        : ""
                    }
                  </div>
                </button>
              `;
            });
            html += `</div>`;
          } else {
            html += `<div class="group-items-grid group-items-peer">`;
            for (const item of group.items) {
              const isSelected = selectedAreaId === item.id;
              html += `
                <button
                  type="button"
                  class="map-card card-peer ${isSelected ? "selected" : ""}"
                  data-item-id="${escapeHtml(item.id)}"
                  aria-label="${escapeHtml(item.title)} 영역 검사"
                >
                  <div class="card-inner">
                    <span class="card-title">${escapeHtml(item.title)}</span>
                    ${
                      item.description
                        ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                        : ""
                    }
                  </div>
                </button>
              `;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
      }
      html += `</div>`;
    } else {
      // Neutral rail: support sequential vs peer tracks and ordered vs peer groups
      const isSequentialRail =
        rail.groups.length > 1 && rail.groups.every((g) => g.isOrdered);

      html += `<div class="neutral-groups-container ${
        isSequentialRail ? "sequential-track" : "peer-track"
      }">`;

      rail.groups.forEach((group, gIdx) => {
        if (isSequentialRail && gIdx > 0) {
          html += `
            <div class="neutral-group-connector" aria-hidden="true">
              <span class="group-arrow">→</span>
            </div>
          `;
        }

        const isGroupOrdered = Boolean(group.isOrdered);
        html += `
          <div class="neutral-group ${isGroupOrdered ? "group-ordered" : "group-peer"}">
            <div class="group-header">
              <h4 class="group-name">${escapeHtml(group.title)}</h4>
            </div>
        `;

        if (isGroupOrdered) {
          html += `<div class="group-items-flow group-items-ordered">`;
          group.items.forEach((item, itemIdx) => {
            const isSelected = selectedAreaId === item.id;
            if (itemIdx > 0) {
              html += `<div class="flow-step-arrow" aria-hidden="true">↓</div>`;
            }
            html += `
              <button
                type="button"
                class="map-card card-ordered ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="${escapeHtml(item.title)} 영역 검사"
              >
                <span class="step-num">${itemIdx + 1}</span>
                <div class="step-body">
                  <span class="card-title">${escapeHtml(item.title)}</span>
                  ${
                    item.description
                      ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          });
          html += `</div>`;
        } else {
          html += `<div class="group-items-grid group-items-peer">`;
          for (const item of group.items) {
            const isSelected = selectedAreaId === item.id;
            html += `
              <button
                type="button"
                class="map-card card-peer ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="${escapeHtml(item.title)} 영역 검사"
              >
                <div class="card-inner">
                  <span class="card-title">${escapeHtml(item.title)}</span>
                  ${
                    item.description
                      ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          }
          html += `</div>`;
        }

        html += `</div>`;
      });

      html += `</div>`;
    }

    html += `</section>`;
  }

  html += `</div>`;
  return html;
}

/** Extract clean plain text representation preserving lists and paragraphs from token stream */
export function extractSectionRawText(tokens?: Token[]): string {
  if (!tokens || tokens.length === 0) return "";
  const lines: string[] = [];
  let inBulletList = false;
  let inOrderedList = false;
  let orderIndex = 1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "bullet_list_open") {
      inBulletList = true;
    } else if (t.type === "bullet_list_close") {
      inBulletList = false;
    } else if (t.type === "ordered_list_open") {
      inOrderedList = true;
      orderIndex = 1;
    } else if (t.type === "ordered_list_close") {
      inOrderedList = false;
    } else if (t.type === "list_item_open") {
      if (t.info) {
        orderIndex = parseInt(t.info, 10) || orderIndex;
      }
    } else if (t.type === "inline" && t.content.trim()) {
      const content = t.content.trim();
      if (inOrderedList) {
        lines.push(`${orderIndex}. ${content}`);
        orderIndex++;
      } else if (inBulletList) {
        lines.push(`- ${content}`);
      } else {
        lines.push(content);
      }
    }
  }

  return lines.join("\n").trim();
}

/** Format human-readable text representation of Project Map */
export function formatProjectMapText(parsedMap: ParsedMap): string {
  if (!parsedMap.rails || parsedMap.rails.length === 0) {
    if (parsedMap.rawTokens) {
      return extractSectionRawText(parsedMap.rawTokens);
    }
    return "";
  }
  const lines: string[] = [];
  for (const rail of parsedMap.rails) {
    lines.push(`### ${rail.title}`);
    for (const group of rail.groups) {
      lines.push(`#### ${group.title}`);
      if (group.isOrdered) {
        group.items.forEach((item, idx) => {
          lines.push(`${idx + 1}. **${item.title}**${item.description ? ` — ${item.description}` : ""}`);
        });
      } else {
        for (const item of group.items) {
          lines.push(`- **${item.title}**${item.description ? ` — ${item.description}` : ""}`);
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

/** Format human-readable text representation of all Area Details */
export function formatAreaDetailsText(areaDetails: Map<string, AreaDetail>): string {
  if (!areaDetails || areaDetails.size === 0) return "";
  const lines: string[] = [];
  for (const detail of areaDetails.values()) {
    lines.push(`### ${detail.title}`);
    for (const sub of detail.subsections) {
      lines.push(`#### ${sub.subheading}`);
      lines.push(sub.rawText);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export interface FocusHandoffParams {
  projectTitle: string;
  focusText: string;
  situationText?: string;
  nextTransitionText?: string;
  facingIssuesText?: string;
  projectFrameText?: string;
  settledDirectionText?: string;
  projectMapText?: string;
  areaDetailsText?: string;
}

export interface AreaHandoffParams {
  projectTitle: string;
  areaTitle: string;
  railTitle?: string;
  groupTitle?: string;
  areaDescription?: string;
  areaDetail?: AreaDetail | null;
  focusText?: string;
  situationText?: string;
  nextTransitionText?: string;
  facingIssuesText?: string;
  projectFrameText?: string;
  settledDirectionText?: string;
}

/** Problem Framer handoff contract facade: canonical implementation lives in ./handoff-contract.js. */
export {
  formatAdmissionPublicationContractLines,
  formatAreaHandoffInstruction,
  formatExecutionWaveContractLines,
  formatFocusHandoffInstruction,
};

/** Build deterministic plain-text context for external Problem Framer handoff (Current Focus) */
export function buildFocusHandoffContext(params: FocusHandoffParams): string {
  const sections: string[] = [];

  sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);
  sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);

  if (params.situationText && params.situationText.trim()) {
    sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
  }

  if (params.nextTransitionText && params.nextTransitionText.trim()) {
    sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
  }

  if (params.facingIssuesText && params.facingIssuesText.trim()) {
    sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
  }

  if (params.projectFrameText && params.projectFrameText.trim()) {
    sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
  }

  if (params.settledDirectionText && params.settledDirectionText.trim()) {
    sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
  }

  if (params.projectMapText && params.projectMapText.trim()) {
    sections.push(`[PROJECT MAP]\n${params.projectMapText.trim()}`);
  }

  if (params.areaDetailsText && params.areaDetailsText.trim()) {
    sections.push(`[AREA CONTEXT]\n${params.areaDetailsText.trim()}`);
  }

  sections.push(formatFocusHandoffInstruction());

  return sections.join("\n\n");
}

/** Build deterministic plain-text context for external Problem Framer handoff (Selected Area Review) */
export function buildAreaHandoffContext(params: AreaHandoffParams): string {
  const sections: string[] = [];

  sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);

  const tagParts = [params.railTitle, params.groupTitle].filter(Boolean);
  const areaHeader = tagParts.length > 0
    ? `${params.areaTitle} (${tagParts.join(" · ")})`
    : params.areaTitle;
  sections.push(`[SELECTED AREA]\n${areaHeader}`);

  if (params.areaDescription && params.areaDescription.trim()) {
    sections.push(`[AREA SUMMARY]\n${params.areaDescription.trim()}`);
  }

  if (params.areaDetail && params.areaDetail.subsections.length > 0) {
    const detailLines: string[] = [];
    for (const sub of params.areaDetail.subsections) {
      detailLines.push(`#### ${sub.subheading}`);
      detailLines.push(sub.rawText.trim());
    }
    sections.push(`[AREA DETAILS]\n${detailLines.join("\n")}`);
  }

  if (params.focusText && params.focusText.trim()) {
    sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);
  }

  if (params.situationText && params.situationText.trim()) {
    sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
  }

  if (params.nextTransitionText && params.nextTransitionText.trim()) {
    sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
  }

  if (params.facingIssuesText && params.facingIssuesText.trim()) {
    sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
  }

  if (params.projectFrameText && params.projectFrameText.trim()) {
    sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
  }

  if (params.settledDirectionText && params.settledDirectionText.trim()) {
    sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
  }

  sections.push(formatAreaHandoffInstruction());

  return sections.join("\n\n");
}
