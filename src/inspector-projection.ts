/**
 * Presentation / UI projection owner: domain -> Universal Inspector/view-model.
 *
 * Sole owner for deterministic view derivation: semantic tone classification,
 * InspectorEntity construction, relation resolution, synthetic subsection
 * construction, and map/text/HTML projection (renderNativeMap,
 * formatProjectMapText/formatAreaDetailsText, card/Inspector rendering).
 * Consumes the clean domain model (`./domain.js`), the authoring grammar
 * (`./authoring-grammar.js`), and string rendering from the Markdown
 * structural layer (`./markdown-structure.js`). Never traverses Tokens and
 * never imports the compatibility facade (`./parser.js`).
 */

import {
  isFrontierSubsectionAlias,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
  normalizeKey,
  normalizeTitle,
} from "./authoring-grammar.js";
import {
  escapeHtml,
  renderMarkdownString,
} from "./markdown-structure.js";
import type {
  AreaDetail,
  Frontier,
  MapItem,
  MaterialMovement,
  ParsedMap,
  PostureAxis,
  ProjectHorizon,
  ProjectPosture,
  SemanticRelation,
  SemanticSubsection,
  StageGate,
  StageJourney,
  StageSegment,
  StrategicThread,
} from "./domain.js";

export type SemanticTone = "neutral" | "active" | "danger" | "evidence";

export interface ViewSubsection {
  subheading: string;
  html: string;
  rawText: string;
  tone?: SemanticTone;
}

export type InspectorKind = "posture" | "stage" | "frontier" | "thread" | "movement" | "area" | "evidence";

export interface InspectorEntity {
  key: string;
  kind: InspectorKind;
  title: string;
  state?: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: ViewSubsection[];
  relations: SemanticRelation[];
  isStageBlocker?: boolean;
  stageContext?: string;
  areaItem?: MapItem;
  evidenceParent?: InspectorEntity;
}

export interface ProjectionContext {
  map: ParsedMap | null;
  areaDetails: Map<string, AreaDetail>;
  horizonText?: string;
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

/** Enrich a clean domain subsection into a view subsection (HTML + tone). */
export function toViewSubsection(
  clean: SemanticSubsection,
  contextState?: string
): ViewSubsection {
  return {
    subheading: clean.subheading,
    rawText: clean.rawText,
    html: renderMarkdownString(clean.rawText),
    tone: classifySubsectionTone(clean.subheading, clean.rawText, contextState),
  };
}

export const entityKey = (kind: InspectorKind, title: string) => `${kind}:${normalizeTitle(title)}`;

function renderRawMarkdown(rawText: string): string {
  return renderMarkdownString(rawText);
}

function syntheticSubsection(
  title: string,
  rawText: string,
  html = renderRawMarkdown(rawText)
): ViewSubsection {
  return {
    subheading: title,
    rawText,
    html,
    tone: classifySubsectionTone(title, rawText),
  };
}

function getSubsection(
  subsections: ViewSubsection[] | SemanticSubsection[],
  labels: string[]
): (ViewSubsection | SemanticSubsection) | undefined {
  return subsections.find((item) =>
    labels.some((label) => normalizeKey(item.subheading).includes(normalizeKey(label)))
  );
}

function findAreaDetailIn(
  item: MapItem | string,
  areaDetails: Map<string, AreaDetail>
): AreaDetail | undefined {
  const title = typeof item === "string" ? item : item.title;
  return areaDetails.get(normalizeTitle(title));
}

export function areaEntity(item: MapItem, areaDetails: Map<string, AreaDetail>): InspectorEntity {
  const detail = findAreaDetailIn(item, areaDetails);
  const cleanSections = detail?.subsections ?? [];
  const viewSections = cleanSections.map((s) => toViewSubsection(s));
  const meaning = getSubsection(viewSections, ["의미", "meaning"]);
  return {
    key: entityKey("area", item.title),
    kind: "area",
    title: item.title,
    summaryText: item.description || meaning?.rawText.split(/\r?\n/)[0] || "",
    html: viewSections.map((section) => section.html).join(""),
    rawText: viewSections.map((section) => section.rawText).join("\n"),
    subsections: viewSections,
    relations: [],
    areaItem: item,
  };
}

export function stageEntity(gate: StageGate, segment: StageSegment): InspectorEntity {
  const base = gate.subsections.map((s) => toViewSubsection(s, gate.state));
  const subsections = base.slice();
  if (gate.entryCondition) {
    subsections.unshift(syntheticSubsection("진입 조건", gate.entryCondition));
  }
  if (gate.decisionReason) {
    subsections.unshift(syntheticSubsection("판정 이유", gate.decisionReason));
  }
  return {
    key: entityKey("stage", gate.title),
    kind: "stage",
    title: gate.title,
    state: gate.state,
    summaryText: gate.summaryText || segment.title,
    html: renderMarkdownString(gate.rawText),
    rawText: gate.rawText,
    subsections,
    relations: gate.relations,
    isStageBlocker: gate.isStageBlocker,
    stageContext: segment.title,
  };
}

export function stageSegmentEntity(segment: StageSegment): InspectorEntity {
  const fallbackGate = segment.gates.find((gate) => gate.entryCondition);
  const subsections: ViewSubsection[] = [];
  if (fallbackGate?.entryCondition) {
    subsections.push(syntheticSubsection("진입 조건", fallbackGate.entryCondition));
  }
  return {
    key: entityKey("stage", segment.title),
    kind: "stage",
    title: segment.title,
    state: segment.gates.length === 1 ? segment.gates[0].state || undefined : undefined,
    summaryText: segment.role === "current" ? "현재 진행 중인 단계" : "다음으로 예정된 단계",
    html: renderMarkdownString(segment.rawText),
    rawText: segment.rawText,
    subsections,
    relations: [],
  };
}

export function postureEntity(axis: PostureAxis): InspectorEntity {
  return {
    key: entityKey("posture", axis.title),
    kind: "posture",
    title: axis.title,
    state: axis.state ?? axis.declaredState,
    summaryText: axis.summaryText,
    html: renderMarkdownString(axis.rawText),
    rawText: axis.rawText,
    subsections: axis.subsections.map((s) => toViewSubsection(s, axis.state ?? axis.declaredState)),
    relations: axis.relations,
    isStageBlocker: axis.isStageBlocker,
  };
}

export function frontierSubsections(frontier: Frontier): ViewSubsection[] {
  const sections: ViewSubsection[] = [];
  if (frontier.whyNow) sections.push(syntheticSubsection("왜 지금", frontier.whyNow));
  if (frontier.successMeaning) sections.push(syntheticSubsection("완료 의미", frontier.successMeaning));
  if (frontier.stageImpact) sections.push(syntheticSubsection("단계 영향", frontier.stageImpact));
  if (frontier.closedBoundaries) sections.push(syntheticSubsection("이미 닫힌 것", frontier.closedBoundaries));
  if (frontier.evidence) sections.push(syntheticSubsection("근거", frontier.evidence));
  return sections.concat(
    frontier.subsections
      .filter((item) => !isFrontierSubsectionAlias(item.subheading))
      .map((s) => toViewSubsection(s))
  );
}

export function frontierEntity(frontier: Frontier): InspectorEntity {
  const transition = `${frontier.currentState || "UNDECLARED"} → ${frontier.targetState || "UNDECLARED"}`;
  return {
    key: entityKey("frontier", frontier.title),
    kind: "frontier",
    title: frontier.title,
    state: transition,
    summaryText: frontier.summaryText,
    html: renderMarkdownString(frontier.rawText),
    rawText: frontier.rawText,
    subsections: frontierSubsections(frontier),
    relations: frontier.relations,
  };
}

export function threadEntity(thread: StrategicThread): InspectorEntity {
  return {
    key: entityKey("thread", thread.title),
    kind: "thread",
    title: thread.title,
    state: thread.state,
    summaryText: thread.summaryText,
    html: renderMarkdownString(thread.rawText),
    rawText: thread.rawText,
    subsections: thread.subsections.map((s) => toViewSubsection(s, thread.state)),
    relations: thread.relations,
  };
}

export function movementSubsections(movement: MaterialMovement): ViewSubsection[] {
  const sections: ViewSubsection[] = [];
  if (movement.before) sections.push(syntheticSubsection("변경 전", movement.before));
  if (movement.change) sections.push(syntheticSubsection("주요 변경", movement.change));
  if (movement.after) sections.push(syntheticSubsection("변경 후", movement.after));
  return sections.concat(movement.subsections.filter((item) =>
    !sections.some((existing) => normalizeKey(existing.subheading) === normalizeKey(item.subheading))
  ).map((s) => toViewSubsection(s)));
}

export function movementEntity(movement: MaterialMovement): InspectorEntity {
  return {
    key: entityKey("movement", movement.title),
    kind: "movement",
    title: movement.title,
    state: `${movement.before || "UNDECLARED"} → ${movement.after || "UNDECLARED"}`,
    summaryText: movement.change || movement.summaryText,
    html: renderMarkdownString(movement.rawText),
    rawText: movement.rawText,
    subsections: movementSubsections(movement),
    relations: movement.relations,
  };
}

export interface EntityLookup {
  map: ParsedMap | null;
  areaDetails: Map<string, AreaDetail>;
  stageJourney?: StageJourney;
  posture?: ProjectPosture;
  frontiers: Frontier[];
  strategicThreads: StrategicThread[];
  movements: MaterialMovement[];
}

export function findEntity(kind: InspectorKind, title: string, lookup: EntityLookup): InspectorEntity | null {
  const target = normalizeTitle(title);
  if (kind === "area") {
    const item = lookup.map?.rails
      .flatMap((rail) => rail.groups)
      .flatMap((group) => group.items)
      .find((candidate) => normalizeTitle(candidate.title) === target);
    return item ? areaEntity(item, lookup.areaDetails) : null;
  }
  if (kind === "posture") {
    const axis = lookup.posture?.axes.find((candidate) => normalizeTitle(candidate.title) === target);
    return axis ? postureEntity(axis) : null;
  }
  if (kind === "frontier") {
    const frontier = lookup.frontiers.find((candidate) => normalizeTitle(candidate.title) === target);
    return frontier ? frontierEntity(frontier) : null;
  }
  if (kind === "thread") {
    const thread = lookup.strategicThreads.find((candidate) => normalizeTitle(candidate.title) === target);
    return thread ? threadEntity(thread) : null;
  }
  if (kind === "movement") {
    const movement = lookup.movements.find((candidate) => normalizeTitle(candidate.title) === target);
    return movement ? movementEntity(movement) : null;
  }
  if (kind === "stage") {
    for (const segment of lookup.stageJourney?.segments ?? []) {
      const gate = segment.gates.find((candidate) => normalizeTitle(candidate.title) === target);
      if (gate) return stageEntity(gate, segment);
      if (normalizeTitle(segment.title) === target) return stageSegmentEntity(segment);
    }
  }
  return null;
}

export function relatedEntity(relation: SemanticRelation, lookup: EntityLookup): InspectorEntity | null {
  const kind: InspectorKind = relation.kind === "area"
    ? "area"
    : relation.kind === "stage"
      ? "stage"
      : relation.kind === "posture"
        ? "posture"
        : relation.kind === "frontier"
          ? "frontier"
          : "movement";
  return findEntity(kind, relation.target, lookup);
}

export function evidenceEntity(parent: InspectorEntity, section: ViewSubsection): InspectorEntity {
  return {
    key: entityKey("evidence", `${parent.title}:${section.subheading}`),
    kind: "evidence",
    title: `${parent.title} · ${section.subheading}`,
    summaryText: "이 판단을 뒷받침하는 세부 근거",
    html: section.html,
    rawText: section.rawText,
    subsections: [],
    relations: [],
    evidenceParent: parent,
  };
}

export function semanticCardAttributes(kind: InspectorKind, title: string): string {
  return `data-entity-kind="${escapeHtml(kind)}" data-entity-title="${escapeHtml(title)}"`;
}

export function stateClass(state: string | undefined): string {
  return normalizeKey(state ?? "").replace(/[^a-z0-9]+/g, "-") || "unknown";
}

export function renderHorizon(horizon: ProjectHorizon): string {
  return `<div class="horizon-copy ${horizon.isLegacyFallback ? "legacy-fallback" : ""}">
    ${renderMarkdownString(horizon.rawText)}
  </div>`;
}

export function renderStageJourney(journey: StageJourney): string {
  return `<div class="stage-journey-view">
    ${journey.segments.map((segment) => `
      <section class="stage-segment stage-segment-${segment.role}">
        <div class="stage-segment-header">
          <span class="stage-role">${segment.role === "current" ? "현재 단계" : segment.role === "next" ? "다음 단계" : "단계"}</span>
          <h3>${escapeHtml(segment.title)}</h3>
        </div>
        <div class="stage-gate-list">
          ${segment.gates.map((gate) => `
            <button type="button" class="semantic-card stage-gate-card ${gate.isStageBlocker ? "has-stage-blocker" : ""}" ${semanticCardAttributes("stage", gate.title)}>
              <span class="semantic-card-top">
                <span class="stage-gate-state state-${stateClass(gate.state)}">${escapeHtml(gate.state || "UNDECLARED")}</span>
                ${gate.isStageBlocker ? '<span class="stage-blocker-marker">단계 진입 차단</span>' : ""}
              </span>
              <strong>${escapeHtml(gate.title)}</strong>
              ${gate.summaryText ? `<span>${escapeHtml(gate.summaryText)}</span>` : ""}
              ${gate.decisionReason ? `<span class="stage-gate-reason">${escapeHtml(gate.decisionReason)}</span>` : ""}
              ${!gate.decisionReason && gate.state === "NOT PROVEN" ? `<span class="stage-gate-fallback">현재 admissible proof가 확인되지 않음 — failure와 동일한 의미는 아님</span>` : ""}
              ${gate.entryCondition ? `<span class="stage-gate-entry">진입 조건: ${escapeHtml(gate.entryCondition)}</span>` : ""}
            </button>
          `).join("")}
        </div>
      </section>
    `).join("")}
  </div>`;
}

export function renderPosture(posture: ProjectPosture): string {
  return `<div class="posture-grid">
    ${posture.axes.map((axis) => `
      <button type="button" class="semantic-card posture-card posture-${stateClass(axis.state ?? axis.declaredState)}" ${semanticCardAttributes("posture", axis.title)}>
        <span class="posture-card-top">
          <strong>${escapeHtml(axis.title)}</strong>
          <span class="maturity-badge maturity-${stateClass(axis.state ?? axis.declaredState)}">${escapeHtml((axis.state ?? axis.declaredState) || "UNDECLARED")}</span>
        </span>
        ${axis.summaryText ? `<span class="posture-summary">${escapeHtml(axis.summaryText)}</span>` : ""}
        ${axis.isStageBlocker ? '<span class="stage-blocker-marker">단계 진입 차단</span>' : ""}
      </button>
    `).join("")}
  </div>`;
}

export function renderFrontiers(frontiers: Frontier[]): string {
  return `<div class="frontier-list">
    ${frontiers.map((frontier) => `
      <button type="button" class="semantic-card frontier-card ${frontier.isPrimary ? "frontier-primary" : "frontier-secondary"}" ${semanticCardAttributes("frontier", frontier.title)}>
        <span class="semantic-card-top">
          <span class="frontier-role">${frontier.isCoPrimary ? "공동 핵심 전환" : frontier.isPrimary ? "핵심 전환" : "전략 방향"}</span>
          <span class="frontier-transition">${escapeHtml(frontier.currentState || "UNDECLARED")} <b>→</b> ${escapeHtml(frontier.targetState || "UNDECLARED")}</span>
        </span>
        <strong>${escapeHtml(frontier.title)}</strong>
        ${frontier.summaryText ? `<span>${escapeHtml(frontier.summaryText)}</span>` : ""}
      </button>
    `).join("")}
  </div>`;
}

export function renderThreads(threads: StrategicThread[]): string {
  return `<div class="thread-list">
    ${threads.map((thread) => `
      <button type="button" class="semantic-card thread-card" ${semanticCardAttributes("thread", thread.title)}>
        <span class="semantic-card-top">
          <strong>${escapeHtml(thread.title)}</strong>
          ${thread.state ? `<span class="thread-state">${escapeHtml(thread.state)}</span>` : ""}
        </span>
        ${thread.summaryText ? `<span>${escapeHtml(thread.summaryText)}</span>` : ""}
      </button>
    `).join("")}
  </div>`;
}

export function renderMovements(movements: MaterialMovement[]): string {
  return `<div class="movement-list">
    ${movements.map((movement) => `
      <button type="button" class="semantic-card movement-card" ${semanticCardAttributes("movement", movement.title)}>
        <span class="semantic-card-top">
          <span class="movement-transition">${escapeHtml(movement.before || "UNDECLARED")} <b>→</b> ${escapeHtml(movement.after || "UNDECLARED")}</span>
        </span>
        <strong>${escapeHtml(movement.title)}</strong>
        ${movement.change ? `<span>${escapeHtml(movement.change)}</span>` : ""}
      </button>
    `).join("")}
  </div>`;
}

/**
 * Reader-oriented status synthesis for the compressed `프로젝트 현황` surface.
 *
 * Presentation-only selection over the canonical domain model: Horizon text,
 * the full Stage Journey, salient Posture axes, and Primary Frontier cards
 * are composed into one flow (현재 위치 / 주목할 상태 / 가장 가까운 핵심
 * 전환). Canonical distinctions (Stage/Posture/Frontier) are preserved —
 * every card reuses the same `semantic-card` + `data-entity-kind` markup as
 * the dedicated renderers, so Inspector drill-down reaches all entities.
 * No Token traversal, no new semantic interpretation.
 */
export function renderStatusSynthesis(
  model: {
    horizon?: ProjectHorizon;
    stageJourney?: StageJourney;
    posture?: ProjectPosture;
    frontiers: Frontier[];
  },
  legacyFrontierHtml = ""
): string {
  const blocks: string[] = [];

  if (model.horizon) {
    blocks.push(`<div class="status-horizon">${renderHorizon(model.horizon)}</div>`);
  }

  if (model.stageJourney && model.stageJourney.segments.length > 0) {
    blocks.push(`
      <section class="status-block status-block-where" aria-label="현재 위치">
        <h3 class="status-block-title">현재 위치</h3>
        ${renderStageJourney(model.stageJourney)}
      </section>
    `);
  }

  if (model.posture && model.posture.axes.length > 0) {
    const attention = model.posture.axes.filter(
      (axis) => axis.isStageBlocker || (axis.state ?? axis.declaredState) !== "STRONG"
    );
    const established = model.posture.axes.filter(
      (axis) => !axis.isStageBlocker && (axis.state ?? axis.declaredState) === "STRONG"
    );
    const attentionHtml = attention.length > 0
      ? renderPosture({ axes: attention, rawText: model.posture.rawText })
      : "";
    const establishedHtml = established.length > 0
      ? `<p class="status-established">확립됨 ${established.length} · ${established.map((axis) => `
          <button type="button" class="status-established-link" ${semanticCardAttributes("posture", axis.title)}>${escapeHtml(axis.title)}</button>
        `).join(" · ")}</p>`
      : "";
    blocks.push(`
      <section class="status-block status-block-state" aria-label="주목할 상태">
        <h3 class="status-block-title">주목할 상태</h3>
        ${attentionHtml || `<p class="muted">주목할 상태가 없습니다. 전부 확립됨으로 기록되어 있습니다.</p>`}
        ${establishedHtml}
      </section>
    `);
  }

  const frontierHtml = model.frontiers.length > 0
    ? renderFrontiers(model.frontiers)
    : legacyFrontierHtml;
  if (frontierHtml) {
    blocks.push(`
      <section class="status-block status-block-next" aria-label="가장 가까운 핵심 전환">
        <h3 class="status-block-title">가장 가까운 핵심 전환</h3>
        ${frontierHtml}
      </section>
    `);
  }

  if (blocks.length === 0) return "";
  const [first, ...rest] = blocks;
  if (rest.length === 0) return first;
  return `${first}<div class="status-flow">${rest.join("")}</div>`;
}

/**
 * Demoted presentation for Strategic Threads inside `최근 변화`.
 * Same thread cards (same Inspector drill-down), lowered hierarchy via a
 * collapsed secondary block — never a top-level primary surface.
 */
export function renderThreadsSecondary(
  threads: StrategicThread[]
): string {
  if (threads.length === 0) return "";
  return `<details class="threads-secondary">
    <summary class="threads-secondary-summary">전략적 흐름 ${threads.length} · 병행 추진 방향 <span class="threads-secondary-hint">펼치기</span></summary>
    <div class="threads-secondary-body">${renderThreads(threads)}</div>
  </details>`;
}

export function renderLegacyFrontier(nextHtml: string, issueHtml: string): string {
  return `<div class="legacy-frontier-view">
    <div><span class="surface-kicker">이전 형식: 다음 전환</span>${nextHtml}</div>
    ${issueHtml ? `<div class="legacy-frontier-issue"><span class="surface-kicker">이전 형식: 제약 사항</span>${issueHtml}</div>` : ""}
  </div>`;
}

/** Render Native HTML Map */
export function renderNativeMap(
  parsedMap: ParsedMap,
  selectedAreaId: string | null = null,
  _areaDetails?: Map<string, AreaDetail>,
  currentStageLabel?: string
): string {
  void _areaDetails;
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

/** Format human-readable text representation of Project Map */
export function formatProjectMapText(parsedMap: ParsedMap): string {
  if (!parsedMap.rails || parsedMap.rails.length === 0) {
    return parsedMap.fallbackText ?? "";
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
export function formatAreaDetailsText(areaDetails: Map<string, AreaDetail>): string {  if (!areaDetails || areaDetails.size === 0) return "";
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
