/**
 * Semantic/domain construction owner.
 *
 * Owns Project Map construction, Area Detail construction,
 * Stage/Posture/Frontier/Thread/Movement construction, semantic relation
 * construction, and root PROGRESS document construction.
 *
 * Consumes the Markdown structural layer (`./markdown-structure.js`) and the
 * authoring grammar (`./authoring-grammar.js`) to build the explicit
 * Cockpit domain model (`./domain.js`). Produces presentation-free data
 * only: no Token, no rendered HTML, no tone. HTML/tone derivation lives in
 * `./inspector-projection.js`; structural validation lives in
 * `./structural-check.js`.
 */

import type { Token } from "./markdown-structure.js";
import {
  extractSectionRawText,
  md,
  parseHeadingBlocks,
  splitSections,
} from "./markdown-structure.js";
import {
  STAGE_DECISION_REASON_LABELS,
  STAGE_ENTRY_CONDITION_LABELS,
  RELATION_GRAMMAR_RULES,
  extractLabeledValue,
  firstSemanticSentence,
  isCurrentStageHeading,
  isStageBlockerText,
  normalizeTitle,
  normalizeKey,
  parseArrowTransition,
  parseFrontierRole,
  parseHeadingState,
  parsePostureRole,
  parseStageGateLine,
  parseStageSegmentTitle,
  parseStageStateLine,
  parseStateLine,
  splitRelationTargets,
  stripInlineMarkup,
  subsectionText,
} from "./authoring-grammar.js";
import type {
  AreaDetail,
  Frontier,
  MapItem,
  MapRail,
  MaterialMovement,
  ParsedDocument,
  ParsedMap,
  ParsedMentalModel,
  ProjectHorizon,
  ProjectPosture,
  SemanticRelation,
  SemanticSubsection,
  StageGate,
  StageJourney,
  StrategicThread,
} from "./domain.js";

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

        items.push({
          id,
          title,
          description,
          railTitle,
          groupTitle,
          isCurrentStage: isCurrentStageGroup,
        });
      }
    }
  }

  return items;
}

/** Parse `## 프로젝트 지도` tokens into structured rails & groups. */
export function parseProjectMap(tokens: Token[]): ParsedMap {
  if (!tokens || tokens.length === 0) {
    return { isNativeMap: false, rails: [], fallbackText: "" };
  }

  const hasH3 = tokens.some((t) => t.type === "heading_open" && t.tag === "h3");
  if (!hasH3) {
    return { isNativeMap: false, rails: [], fallbackText: extractSectionRawText(tokens) };
  }

  const rails: MapRail[] = [];
  let currentRail: MapRail | null = null;
  let currentGroup: { title: string; isOrdered?: boolean; items: MapItem[] } | null = null;
  let groupTokens: Token[] = [];
  let hasCurrentStage = false;

  const flushGroup = () => {
    if (currentRail && currentGroup) {
      const isCurrentStage = isCurrentStageHeading(currentGroup.title);
      const items = parseListItems(
        groupTokens,
        currentRail.title,
        currentGroup.title,
        isCurrentStage
      );
      const isOrdered = groupTokens.some((t) => t.type === "ordered_list_open");

      if (isCurrentStage && items.length > 0) {
        hasCurrentStage = true;
      }

      currentRail.groups.push({ title: currentGroup.title, items, isOrdered });
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
    return { isNativeMap: false, rails: [], fallbackText: extractSectionRawText(tokens) };
  }

  return {
    isNativeMap: true,
    rails,
    hasCurrentStage,
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
      const rawText = extractSectionRawText(currentSubsection.tokens);

      currentArea.subsections.push({
        subheading: currentSubsection.subheading,
        rawText,
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

interface SemanticContent {
  leadText: string;
  rawText: string;
  summaryText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
}

function splitSemanticContent(tokens: Token[]): SemanticContent {
  const leadTokens: Token[] = [];
  const subsections: SemanticSubsection[] = [];
  let currentSubsection: { subheading: string; tokens: Token[] } | null = null;

  const flushSubsection = () => {
    if (!currentSubsection) return;
    const rawText = extractSectionRawText(currentSubsection.tokens);
    subsections.push({
      subheading: currentSubsection.subheading,
      rawText,
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

  return {
    leadText,
    rawText,
    summaryText: firstSemanticSentence(leadText || rawText),
    subsections,
    relations: parseRelations(rawText),
  };
}

function parseRelations(rawText: string): SemanticRelation[] {
  const relations: SemanticRelation[] = [];

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, ""));
    if (!line) continue;
    for (const rule of RELATION_GRAMMAR_RULES) {
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

function parseStageGateList(tokens: Token[], segmentTitle: string): StageGate[] {
  const gates: StageGate[] = [];
  let listDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      listDepth++;
      continue;
    }
    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
      listDepth = Math.max(0, listDepth - 1);
      continue;
    }
    if (token.type !== "list_item_open") continue;
    // Only outer gate items own a StageGate; nested list items and
    // continuation paragraphs never become phantom gates.
    if (listDepth !== 1) continue;
    let openCount = 1;
    let end = i + 1;
    while (end < tokens.length) {
      if (tokens[end].type === "list_item_open") openCount++;
      else if (tokens[end].type === "list_item_close") {
        openCount--;
        if (openCount === 0) break;
      }
      end++;
    }
    if (end >= tokens.length) continue;
    const slice = tokens.slice(i + 1, end);
    const inline = slice.find((candidate) => candidate.type === "inline");
    if (!inline) continue;
    const parsed = parseStageGateLine(inline.content);
    const rawText = extractSectionRawText(slice);
    const decisionReason =
      extractLabeledValue(rawText, STAGE_DECISION_REASON_LABELS) || undefined;
    gates.push({
      title: parsed.title,
      state: parsed.state,
      // The gate line itself ("Title — STATE") is already rendered as the
      // card title + state badge; reusing it as summary duplicates the card.
      // The decision reason owns the third line via its own field.
      summaryText: "",
      entryCondition: extractLabeledValue(rawText, STAGE_ENTRY_CONDITION_LABELS) || undefined,
      decisionReason,
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
    rawText: content.rawText,
    summaryText: content.summaryText,
    isLegacyFallback,
  };
}

export function parseStageJourney(tokens?: Token[]): StageJourney | undefined {
  if (!tokens || tokens.length === 0) return undefined;
  const segments: StageJourney["segments"] = [];
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
          decisionReason:
            extractLabeledValue(content.rawText, STAGE_DECISION_REASON_LABELS) || undefined,
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
  const axes: ProjectPosture["axes"] = [];
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
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
      isStageBlocker: isStageBlockerText(content.rawText),
    });
  }
  return { axes, rawText: extractSectionRawText(tokens) };
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
      rawText: content.rawText,
      subsections: content.subsections,
      relations: content.relations,
      hasStateTransition: Boolean(before && after),
    };
  });
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

/**
 * High-level production entrypoint: Markdown/string -> parsed Cockpit document.
 * Ordinary production code (viewer shell, checks via tokens) should prefer
 * this over lower-level token functions, which remain for genuinely useful
 * or compatibility-required cases.
 */
export function parseDocument(markdown: string): ParsedDocument {
  const tokens = md.parse(markdown, {});
  const { title, sections } = splitSections(tokens);
  return {
    title,
    map: parseProjectMap(sections.get("project map") ?? []),
    areaDetails: parseAreaDetails(sections.get("area details") ?? []),
    model: parseMentalModel(sections),
  };
}
