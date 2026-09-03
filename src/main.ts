import type { Token } from "markdown-it";
import mermaid from "mermaid";
import "./style.css";
import {
  md,
  HERE_MARKER,
  type MapItem,
  type ParsedMap,
  type AreaDetail,
  type AreaCompleteness,
  type SemanticRelation,
  type SemanticSubsection,
  type SemanticTone,
  classifySubsectionTone,
  type ProjectHorizon,
  type StageJourney,
  type StageGate,
  type StageSegment,
  type ProjectPosture,
  type PostureAxis,
  type Frontier,
  type StrategicThread,
  type MaterialMovement,
  type ParsedMentalModel,
  normalizeKey,
  normalizeTitle,
  escapeHtml,
  renderTokens,
  withMermaidPlaceholders,
  splitSections,
  parseProjectMap,
  parseAreaDetails,
  findAreaDetail,
  getAreaCompleteness,
  renderNativeMap,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
  parseMentalModel,
  extractSectionRawText,
  formatProjectMapText,
  formatAreaDetailsText,
  buildFocusHandoffContext,
  buildAreaHandoffContext,
} from "./parser";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  flowchart: { useMaxWidth: false },
});

type InspectorKind = "posture" | "stage" | "frontier" | "thread" | "movement" | "area" | "evidence";

interface InspectorEntity {
  key: string;
  kind: InspectorKind;
  title: string;
  state?: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isStageBlocker?: boolean;
  stageContext?: string;
  areaItem?: MapItem;
  evidenceParent?: InspectorEntity;
}

let activeProjectTitle = "Cockpit";
let currentSections = new Map<string, Token[]>();
let currentAreaDetails = new Map<string, AreaDetail>();
let currentParsedMap: ParsedMap | null = null;
let currentModel: ParsedMentalModel = { frontiers: [], strategicThreads: [], movements: [] };
let selectedAreaId: string | null = null;
let inspectorHistory: InspectorEntity[] = [];

const INSPECTOR_LABELS: Record<InspectorKind, string> = {
  posture: "프로젝트 상태",
  stage: "진행 단계",
  frontier: "전환 과제",
  thread: "전략적 흐름",
  movement: "중요한 변화",
  area: "프로젝트 영역",
  evidence: "근거",
};

const entityKey = (kind: InspectorKind, title: string) => `${kind}:${normalizeTitle(title)}`;

function findMapItemById(id: string): MapItem | null {
  if (!currentParsedMap) return null;
  for (const rail of currentParsedMap.rails) {
    for (const group of rail.groups) {
      for (const item of group.items) {
        if (item.id === id) return item;
      }
    }
  }
  return null;
}

function renderRawMarkdown(rawText: string): string {
  if (!rawText.trim()) return "";
  return withMermaidPlaceholders(renderTokens(md.parse(rawText, {})));
}

function subsection(
  title: string,
  rawText: string,
  html = renderRawMarkdown(rawText)
): SemanticSubsection {
  return {
    subheading: title,
    rawText,
    html,
    tone: classifySubsectionTone(title, rawText),
  };
}

function getSubsection(
  subsections: SemanticSubsection[],
  labels: string[]
): SemanticSubsection | undefined {
  return subsections.find((item) =>
    labels.some((label) => normalizeKey(item.subheading).includes(normalizeKey(label)))
  );
}

const FRONTIER_SUBSECTION_ALIASES = [
  ["왜 지금", "why now"],
  ["완료 의미", "success meaning", "성공 의미", "success"],
  ["단계 영향", "stage impact"],
  ["이미 닫힌", "already closed", "closed boundaries", "closed"],
  ["근거", "evidence"],
];

function isFrontierSubsectionAlias(subsectionItem: SemanticSubsection): boolean {
  return FRONTIER_SUBSECTION_ALIASES.some((labels) =>
    labels.some((label) => normalizeKey(subsectionItem.subheading).includes(normalizeKey(label)))
  );
}

function areaEntity(item: MapItem): InspectorEntity {
  const detail = findAreaDetail(item, currentAreaDetails);
  const detailSections = detail?.subsections ?? [];
  const meaning = getSubsection(detailSections, ["의미", "meaning"]);
  return {
    key: entityKey("area", item.title),
    kind: "area",
    title: item.title,
    summaryText: item.description || meaning?.rawText.split(/\r?\n/)[0] || "",
    html: detailSections.map((section) => section.html).join(""),
    rawText: detailSections.map((section) => section.rawText).join("\n"),
    subsections: detailSections,
    relations: [],
    areaItem: item,
  };
}

function stageEntity(gate: StageGate, segment: StageSegment): InspectorEntity {
  const subsections = gate.subsections.slice();
  if (gate.entryCondition) {
    subsections.unshift(subsection("진입 조건", gate.entryCondition));
  }
  if (gate.decisionReason) {
    subsections.unshift(subsection("판정 이유", gate.decisionReason));
  }
  return {
    key: entityKey("stage", gate.title),
    kind: "stage",
    title: gate.title,
    state: gate.state,
    summaryText: gate.summaryText || segment.title,
    html: gate.html,
    rawText: gate.rawText,
    subsections,
    relations: gate.relations,
    isStageBlocker: gate.isStageBlocker,
    stageContext: segment.title,
  };
}

function stageSegmentEntity(segment: StageSegment): InspectorEntity {
  const fallbackGate = segment.gates.find((gate) => gate.entryCondition);
  const subsections: SemanticSubsection[] = [];
  if (fallbackGate?.entryCondition) {
    subsections.push(subsection("진입 조건", fallbackGate.entryCondition));
  }
  return {
    key: entityKey("stage", segment.title),
    kind: "stage",
    title: segment.title,
    state: segment.gates.length === 1 ? segment.gates[0].state || undefined : undefined,
    summaryText: segment.role === "current" ? "현재 진행 중인 단계" : "다음으로 예정된 단계",
    html: segment.html,
    rawText: segment.rawText,
    subsections,
    relations: [],
  };
}

function postureEntity(axis: PostureAxis): InspectorEntity {
  return {
    key: entityKey("posture", axis.title),
    kind: "posture",
    title: axis.title,
    state: axis.state ?? axis.declaredState,
    summaryText: axis.summaryText,
    html: axis.html,
    rawText: axis.rawText,
    subsections: axis.subsections,
    relations: axis.relations,
    isStageBlocker: axis.isStageBlocker,
  };
}

function frontierSubsections(frontier: Frontier): SemanticSubsection[] {
  const sections: SemanticSubsection[] = [];
  if (frontier.whyNow) sections.push(subsection("왜 지금", frontier.whyNow));
  if (frontier.successMeaning) sections.push(subsection("완료 의미", frontier.successMeaning));
  if (frontier.stageImpact) sections.push(subsection("단계 영향", frontier.stageImpact));
  if (frontier.closedBoundaries) sections.push(subsection("이미 닫힌 것", frontier.closedBoundaries));
  if (frontier.evidence) sections.push(subsection("근거", frontier.evidence));
  return sections.concat(frontier.subsections.filter((item) => !isFrontierSubsectionAlias(item)));
}

function frontierEntity(frontier: Frontier): InspectorEntity {
  const transition = `${frontier.currentState || "UNDECLARED"} → ${frontier.targetState || "UNDECLARED"}`;
  return {
    key: entityKey("frontier", frontier.title),
    kind: "frontier",
    title: frontier.title,
    state: transition,
    summaryText: frontier.summaryText,
    html: frontier.html,
    rawText: frontier.rawText,
    subsections: frontierSubsections(frontier),
    relations: frontier.relations,
  };
}

function threadEntity(thread: StrategicThread): InspectorEntity {
  return {
    key: entityKey("thread", thread.title),
    kind: "thread",
    title: thread.title,
    state: thread.state,
    summaryText: thread.summaryText,
    html: thread.html,
    rawText: thread.rawText,
    subsections: thread.subsections,
    relations: thread.relations,
  };
}

function movementSubsections(movement: MaterialMovement): SemanticSubsection[] {
  const sections: SemanticSubsection[] = [];
  if (movement.before) sections.push(subsection("변경 전", movement.before));
  if (movement.change) sections.push(subsection("주요 변경", movement.change));
  if (movement.after) sections.push(subsection("변경 후", movement.after));
  return sections.concat(movement.subsections.filter((item) =>
    !sections.some((existing) => normalizeKey(existing.subheading) === normalizeKey(item.subheading))
  ));
}

function movementEntity(movement: MaterialMovement): InspectorEntity {
  return {
    key: entityKey("movement", movement.title),
    kind: "movement",
    title: movement.title,
    state: `${movement.before || "UNDECLARED"} → ${movement.after || "UNDECLARED"}`,
    summaryText: movement.change || movement.summaryText,
    html: movement.html,
    rawText: movement.rawText,
    subsections: movementSubsections(movement),
    relations: movement.relations,
  };
}

function findEntity(kind: InspectorKind, title: string): InspectorEntity | null {
  const target = normalizeTitle(title);
  if (kind === "area") {
    const item = currentParsedMap?.rails
      .flatMap((rail) => rail.groups)
      .flatMap((group) => group.items)
      .find((candidate) => normalizeTitle(candidate.title) === target);
    return item ? areaEntity(item) : null;
  }
  if (kind === "posture") {
    const axis = currentModel.posture?.axes.find((candidate) => normalizeTitle(candidate.title) === target);
    return axis ? postureEntity(axis) : null;
  }
  if (kind === "frontier") {
    const frontier = currentModel.frontiers.find((candidate) => normalizeTitle(candidate.title) === target);
    return frontier ? frontierEntity(frontier) : null;
  }
  if (kind === "thread") {
    const thread = currentModel.strategicThreads.find((candidate) => normalizeTitle(candidate.title) === target);
    return thread ? threadEntity(thread) : null;
  }
  if (kind === "movement") {
    const movement = currentModel.movements.find((candidate) => normalizeTitle(candidate.title) === target);
    return movement ? movementEntity(movement) : null;
  }
  if (kind === "stage") {
    for (const segment of currentModel.stageJourney?.segments ?? []) {
      const gate = segment.gates.find((candidate) => normalizeTitle(candidate.title) === target);
      if (gate) return stageEntity(gate, segment);
      if (normalizeTitle(segment.title) === target) return stageSegmentEntity(segment);
    }
  }
  return null;
}

function relatedEntity(relation: SemanticRelation): InspectorEntity | null {
  const kind: InspectorKind = relation.kind === "area"
    ? "area"
    : relation.kind === "stage"
      ? "stage"
      : relation.kind === "posture"
        ? "posture"
        : relation.kind === "frontier"
          ? "frontier"
          : "movement";
  return findEntity(kind, relation.target);
}

function semanticCardAttributes(kind: InspectorKind, title: string): string {
  return `data-entity-kind="${escapeHtml(kind)}" data-entity-title="${escapeHtml(title)}"`;
}

function stateClass(state: string | undefined): string {
  return normalizeKey(state ?? "").replace(/[^a-z0-9]+/g, "-") || "unknown";
}

function renderHorizon(horizon: ProjectHorizon): string {
  return `<div class="horizon-copy ${horizon.isLegacyFallback ? "legacy-fallback" : ""}">
    ${horizon.html}
  </div>`;
}

function renderStageJourney(journey: StageJourney): string {
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

function renderPosture(posture: ProjectPosture): string {
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

function renderFrontiers(frontiers: Frontier[]): string {
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

function renderThreads(threads: StrategicThread[]): string {
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

function renderMovements(movements: MaterialMovement[]): string {
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

function renderLegacyFrontier(nextHtml: string, issueHtml: string): string {
  return `<div class="legacy-frontier-view">
    <div><span class="surface-kicker">이전 형식: 다음 전환</span>${nextHtml}</div>
    ${issueHtml ? `<div class="legacy-frontier-issue"><span class="surface-kicker">이전 형식: 제약 사항</span>${issueHtml}</div>` : ""}
  </div>`;
}

function setPanelHtml(panelId: string, html: string, visible: boolean): void {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const body = panel.querySelector<HTMLElement>(".panel-body");
  if (body) body.innerHTML = html || `<p class="muted">아직 기록된 내용이 없습니다.</p>`;
  panel.hidden = !visible;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  } catch (error) {
    console.error("Clipboard copy failed", error);
    return false;
  }
}

const copyFeedbackTimers = new Map<HTMLElement, number>();

function showCopyFeedback(
  toast: HTMLElement | null,
  ok: boolean,
  successText: string,
  failureText: string
): void {
  if (!toast) return;
  const pending = copyFeedbackTimers.get(toast);
  if (pending !== undefined) clearTimeout(pending);
  toast.textContent = ok ? successText : failureText;
  toast.dataset.result = ok ? "success" : "failure";
  toast.hidden = false;
  const timer = window.setTimeout(() => {
    if (copyFeedbackTimers.get(toast) === timer) {
      toast.hidden = true;
      copyFeedbackTimers.delete(toast);
    }
  }, 3000);
  copyFeedbackTimers.set(toast, timer);
}

function hideCopyFeedback(toast: HTMLElement | null): void {
  if (!toast) return;
  const pending = copyFeedbackTimers.get(toast);
  if (pending !== undefined) {
    clearTimeout(pending);
    copyFeedbackTimers.delete(toast);
  }
  toast.hidden = true;
}

function evidenceEntity(parent: InspectorEntity, section: SemanticSubsection): InspectorEntity {
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

function renderInspector(entity: InspectorEntity): void {
  const aside = document.getElementById("inspector-aside");
  if (!aside) return;
  aside.hidden = false;

  const breadcrumb = document.getElementById("inspector-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = inspectorHistory
      .map((item, index) => index === inspectorHistory.length - 1
        ? `<span>${escapeHtml(item.title)}</span>`
        : `<button type="button" data-breadcrumb-index="${index}">${escapeHtml(item.title)}</button>`)
      .join('<span class="breadcrumb-separator">→</span>');
  }

  const tag = document.getElementById("inspector-group-tag");
  if (tag) tag.textContent = INSPECTOR_LABELS[entity.kind];
  const state = document.getElementById("inspector-state");
  if (state) {
    state.textContent = entity.state ?? "";
    state.className = `inspector-state state-${stateClass(entity.state)}`;
    state.hidden = !entity.state;
  }
  const stageContextEl = document.getElementById("inspector-stage-context");
  if (stageContextEl) {
    stageContextEl.innerHTML = entity.stageContext
      ? `소속 단계: <button type="button" class="stage-context-link" data-related-kind="stage" data-related-title="${escapeHtml(entity.stageContext)}">${escapeHtml(entity.stageContext)}</button>`
      : "";
    stageContextEl.hidden = !entity.stageContext;
  }
  const title = document.getElementById("inspector-title");
  if (title) title.textContent = entity.title;
  const summary = document.getElementById("inspector-summary");
  if (summary) {
    summary.innerHTML = entity.summaryText ? `<p class="inspector-lead">${escapeHtml(entity.summaryText)}</p>` : "";
    summary.hidden = !entity.summaryText;
  }

  const sections = document.getElementById("inspector-sections");
  if (sections) {
    sections.innerHTML = entity.subsections.length > 0
      ? entity.subsections.map((item, index) => {
          const tone = item.tone ?? classifySubsectionTone(item.subheading, item.rawText, entity.state);
          const toneClass = `tone-${tone}`;
          const isEvidence = tone === "evidence" || /evidence|근거/i.test(item.subheading);
          return `
          <section class="inspector-sub-card">
            <div class="sub-header"><span class="sub-badge ${toneClass}">${escapeHtml(item.subheading)}</span></div>
            <div class="sub-body">${item.html}</div>
            ${isEvidence ? `<button type="button" class="inspector-evidence-link" data-subsection-index="${index}">세부 근거 보기 →</button>` : ""}
          </section>
        `;
        }).join("")
      : (entity.html ? `<section class="inspector-sub-card"><div class="sub-body">${entity.html}</div></section>` : `<p class="muted">추가 세부 기록이 없습니다.</p>`);
  }

  const related = document.getElementById("inspector-related");
  if (related) {
    const validRelations = entity.relations.filter((relation) => relatedEntity(relation));
    related.innerHTML = validRelations.length > 0
      ? `<div class="related-title">관련 항목</div><div class="related-links">${validRelations.map((relation) => `
          <button type="button" class="related-link" data-related-kind="${relation.kind}" data-related-title="${escapeHtml(relation.target)}">${escapeHtml(relation.target)}</button>
        `).join("")}</div>`
      : "";
    related.hidden = validRelations.length === 0;
  }

  const copyButton = document.getElementById("inspector-copy-btn") as HTMLButtonElement | null;
  const copyToast = document.getElementById("copy-toast");
  const handoffHint = document.getElementById("handoff-hint");
  if (handoffHint) handoffHint.hidden = entity.kind !== "area";
  if (copyButton) {
    copyButton.hidden = entity.kind !== "area";
    copyButton.onclick = async () => {
      if (!entity.areaItem) return;
      const detail = findAreaDetail(entity.areaItem, currentAreaDetails);
      const text = buildAreaHandoffContext({
        projectTitle: activeProjectTitle,
        areaTitle: entity.areaItem.title,
        railTitle: entity.areaItem.railTitle,
        groupTitle: entity.areaItem.groupTitle,
        areaDescription: entity.areaItem.description,
        areaDetail: detail,
        focusText: extractSectionRawText(currentSections.get("current focus")),
        situationText: extractSectionRawText(currentSections.get("project horizon") ?? currentSections.get("current situation")),
        nextTransitionText: extractSectionRawText(currentSections.get("current frontier") ?? currentSections.get("next transition")),
        facingIssuesText: extractSectionRawText(currentSections.get("facing issues")),
        projectFrameText: extractSectionRawText(currentSections.get("project frame")),
        settledDirectionText: extractSectionRawText(currentSections.get("settled direction")),
      });
      const ok = await copyToClipboard(text);
      if (copyToast) {
        showCopyFeedback(
          copyToast,
          ok,
          "✓ 에이전트에게 전달할 내용이 복사되었습니다",
          "⚠ 복사에 실패했습니다. 직접 선택해 복사해 주세요"
        );
      }
    };
  }
  if (copyToast && entity.kind !== "area") hideCopyFeedback(copyToast);
}

function openInspector(entity: InspectorEntity, replace = false): void {
  if (replace) {
    inspectorHistory = [entity];
  } else {
    const existingIndex = inspectorHistory.findIndex((item) => item.key === entity.key);
    if (existingIndex >= 0) {
      inspectorHistory = inspectorHistory.slice(0, existingIndex + 1);
    } else {
      inspectorHistory.push(entity);
    }
  }
  selectedAreaId = entity.areaItem?.id ?? null;
  document.querySelectorAll(".map-card.selected").forEach((card) => {
    card.classList.toggle("selected", card.getAttribute("data-item-id") === selectedAreaId);
  });
  if (entity.areaItem) {
    document.querySelector(`[data-item-id="${CSS.escape(entity.areaItem.id)}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
  renderInspector(entity);
}

function closeInspector(): void {
  inspectorHistory = [];
  selectedAreaId = null;
  const aside = document.getElementById("inspector-aside");
  if (aside) aside.hidden = true;
  document.querySelectorAll(".map-card.selected").forEach((card) => card.classList.remove("selected"));
}

function goBackInspector(): void {
  if (inspectorHistory.length <= 1) {
    closeInspector();
    return;
  }
  inspectorHistory.pop();
  const entity = inspectorHistory[inspectorHistory.length - 1];
  selectedAreaId = entity.areaItem?.id ?? null;
  renderInspector(entity);
}

function bindInspectorActions(): void {
  const aside = document.getElementById("inspector-aside");
  const close = document.getElementById("inspector-close-btn");
  if (!aside || !close) return;
  close.onclick = () => closeInspector();
  aside.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const breadcrumb = target.closest<HTMLButtonElement>("[data-breadcrumb-index]");
    if (breadcrumb) {
      const index = Number(breadcrumb.dataset.breadcrumbIndex);
      const entity = inspectorHistory[index];
      if (entity) {
        inspectorHistory = inspectorHistory.slice(0, index + 1);
        renderInspector(entity);
      }
      return;
    }
    const relation = target.closest<HTMLButtonElement>("[data-related-kind]");
    if (relation) {
      const kind = relation.dataset.relatedKind as InspectorKind;
      const related = findEntity(kind, relation.dataset.relatedTitle ?? "");
      if (related) openInspector(related);
      return;
    }
    const evidenceButton = target.closest<HTMLButtonElement>("[data-subsection-index]");
    if (evidenceButton && inspectorHistory.length > 0) {
      const index = Number(evidenceButton.dataset.subsectionIndex);
      const parent = inspectorHistory[inspectorHistory.length - 1];
      const section = parent.subsections[index];
      if (section) openInspector(evidenceEntity(parent, section));
    }
  });
}

function bindSemanticCards(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>("[data-entity-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.entityKind as InspectorKind;
      const title = button.dataset.entityTitle ?? "";
      const entity = findEntity(kind, title);
      if (entity) openInspector(entity, false);
    });
  });
}

function setLegacyContextSections(sections: Map<string, Token[]>): void {
  const focusTokens = sections.get("current focus");
  const focusPanel = document.getElementById("slot-focus");
  if (focusPanel) {
    const body = focusPanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = focusTokens ? withMermaidPlaceholders(renderTokens(focusTokens)) : "";
    focusPanel.hidden = !focusTokens?.length;
  }

  const recentTokens = sections.get("recently completed");
  const recentPanel = document.getElementById("slot-recent");
  if (recentPanel) {
    const body = recentPanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = recentTokens ? withMermaidPlaceholders(renderTokens(recentTokens)) : "";
    recentPanel.hidden = Boolean(currentModel.movements.length) || !recentTokens?.length;
  }

  const frameTokens = sections.get("project frame");
  const settledTokens = sections.get("settled direction");
  const frame = document.getElementById("slot-frame");
  const settled = document.getElementById("slot-settled");
  if (frame) {
    const body = frame.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = frameTokens ? withMermaidPlaceholders(renderTokens(frameTokens)) : "";
    frame.hidden = !frameTokens?.length;
  }
  if (settled) {
    const body = settled.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = settledTokens ? withMermaidPlaceholders(renderTokens(settledTokens)) : "";
    settled.hidden = !settledTokens?.length;
  }

  const horizon = sections.get("project horizon") ?? sections.get("current situation");
  const next = sections.get("next transition");
  const facing = sections.get("facing issues");
  const legacyNow = document.getElementById("slot-now")?.querySelector<HTMLElement>(".panel-body");
  const legacyNext = document.getElementById("slot-next")?.querySelector<HTMLElement>(".panel-body");
  const legacyFacing = document.getElementById("slot-blocked")?.querySelector<HTMLElement>(".panel-body");
  if (legacyNow) legacyNow.innerHTML = horizon ? withMermaidPlaceholders(renderTokens(horizon)) : "";
  if (legacyNext) legacyNext.innerHTML = next ? withMermaidPlaceholders(renderTokens(next)) : "";
  if (legacyFacing) legacyFacing.innerHTML = facing ? withMermaidPlaceholders(renderTokens(facing)) : "";

  const extra = document.getElementById("slot-extra");
  if (!extra) return;
  extra.innerHTML = "";
  const known = new Set([
    "project map", "area details", "project horizon", "stage journey", "project posture",
    "current frontier", "strategic threads", "recent material movement", "current focus",
    "current situation", "next transition", "facing issues", "project frame", "settled direction",
    "recently completed",
  ]);
  let shown = false;
  for (const [name, tokens] of sections) {
    if (known.has(name)) continue;
    const heading = name.startsWith("__h1:") ? name.slice(6) : name;
    const card = document.createElement("section");
    card.className = "panel panel-context";
    card.innerHTML = `<h2>${escapeHtml(heading)}</h2><div class="panel-body">${withMermaidPlaceholders(renderTokens(tokens))}</div>`;
    extra.appendChild(card);
    shown = true;
  }
  extra.hidden = !shown;
}

function setupFocusCopy(sections: Map<string, Token[]>, parsedMap: ParsedMap): void {
  const button = document.getElementById("focus-copy-btn") as HTMLButtonElement | null;
  const toast = document.getElementById("focus-copy-toast");
  if (!button) return;
  button.onclick = async () => {
    const text = buildFocusHandoffContext({
      projectTitle: activeProjectTitle,
      focusText: extractSectionRawText(sections.get("current focus")),
      situationText: extractSectionRawText(sections.get("project horizon") ?? sections.get("current situation")),
      nextTransitionText: extractSectionRawText(sections.get("current frontier") ?? sections.get("next transition")),
      facingIssuesText: extractSectionRawText(sections.get("facing issues")),
      projectFrameText: extractSectionRawText(sections.get("project frame")),
      settledDirectionText: extractSectionRawText(sections.get("settled direction")),
      projectMapText: formatProjectMapText(parsedMap),
      areaDetailsText: formatAreaDetailsText(currentAreaDetails),
    });
    const ok = await copyToClipboard(text);
    if (toast) {
      showCopyFeedback(
        toast,
        ok,
        "✓ 에이전트에게 전달할 내용이 복사되었습니다",
        "⚠ 복사에 실패했습니다. 직접 선택해 복사해 주세요"
      );
    }
  };
}

async function renderDoc(source: string): Promise<void> {
  const tokens = md.parse(source, {});
  const { title, sections } = splitSections(tokens);
  activeProjectTitle = title || "Cockpit";
  currentSections = sections;
  currentAreaDetails = parseAreaDetails(sections.get("area details") ?? []);
  currentParsedMap = parseProjectMap(sections.get("project map") ?? []);
  currentModel = parseMentalModel(sections);

  document.title = title ? `${title} — Cockpit` : "Cockpit";
  const projectTitle = document.getElementById("project-title");
  if (projectTitle) projectTitle.textContent = title || "이름 없는 프로젝트";

  const horizonPanel = document.getElementById("slot-horizon");
  if (horizonPanel) {
    const horizonBody = horizonPanel.querySelector<HTMLElement>(".panel-body");
    if (horizonBody && currentModel.horizon) horizonBody.innerHTML = renderHorizon(currentModel.horizon);
    horizonPanel.hidden = !currentModel.horizon;
    horizonPanel.classList.toggle("legacy-fallback", Boolean(currentModel.horizon?.isLegacyFallback));
  }

  const stagePanel = document.getElementById("slot-stage");
  if (stagePanel && currentModel.stageJourney) {
    const body = stagePanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = renderStageJourney(currentModel.stageJourney);
    stagePanel.hidden = currentModel.stageJourney.segments.length === 0;
    bindSemanticCards(stagePanel);
  } else if (stagePanel) stagePanel.hidden = true;

  const posturePanel = document.getElementById("slot-posture");
  if (posturePanel && currentModel.posture) {
    const body = posturePanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = renderPosture(currentModel.posture);
    posturePanel.hidden = currentModel.posture.axes.length === 0;
    bindSemanticCards(posturePanel);
  } else if (posturePanel) posturePanel.hidden = true;

  const frontierPanel = document.getElementById("slot-frontier");
  if (frontierPanel) {
    const body = frontierPanel.querySelector<HTMLElement>(".panel-body");
    if (body) {
      if (currentModel.frontiers.length > 0) {
        body.innerHTML = renderFrontiers(currentModel.frontiers);
      } else {
        const nextHtml = sections.get("next transition") ? withMermaidPlaceholders(renderTokens(sections.get("next transition")!)) : "";
        const issueHtml = sections.get("facing issues") ? withMermaidPlaceholders(renderTokens(sections.get("facing issues")!)) : "";
        body.innerHTML = nextHtml ? renderLegacyFrontier(nextHtml, issueHtml) : "";
      }
    }
    frontierPanel.hidden = currentModel.frontiers.length === 0 && !sections.get("next transition")?.length;
    bindSemanticCards(frontierPanel);
  }

  const threadPanel = document.getElementById("slot-threads");
  if (threadPanel) {
    const body = threadPanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = currentModel.strategicThreads.length ? renderThreads(currentModel.strategicThreads) : "";
    threadPanel.hidden = currentModel.strategicThreads.length === 0;
    bindSemanticCards(threadPanel);
  }

  const movementPanel = document.getElementById("slot-movement");
  if (movementPanel) {
    const body = movementPanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = currentModel.movements.length ? renderMovements(currentModel.movements) : "";
    movementPanel.hidden = currentModel.movements.length === 0;
    bindSemanticCards(movementPanel);
  }

  const mapPanel = document.getElementById("slot-map");
  const mapBody = mapPanel?.querySelector<HTMLElement>(".map-body");
  if (mapBody && currentParsedMap.isNativeMap) {
    mapBody.innerHTML = renderNativeMap(
      currentParsedMap,
      selectedAreaId,
      currentAreaDetails,
      currentModel.stageJourney?.currentStage
    );
    mapBody.querySelectorAll<HTMLButtonElement>(".map-card").forEach((button) => {
      button.addEventListener("click", () => {
        const item = findMapItemById(button.dataset.itemId ?? "");
        if (item) openInspector(areaEntity(item));
      });
    });
  } else if (mapBody) {
    const mapTokens = sections.get("project map");
    mapBody.innerHTML = mapTokens?.length
      ? withMermaidPlaceholders(renderTokens(mapTokens))
      : `<p class="muted">프로젝트 지도 내용이 없습니다.</p>`;
  }

  const completeness: AreaCompleteness = getAreaCompleteness(currentParsedMap, currentAreaDetails);
  const badge = document.getElementById("map-completeness-badge");
  if (badge) {
    badge.hidden = completeness.totalItems === 0 || completeness.missingItems === 0;
    badge.textContent = `${completeness.matchedItems}/${completeness.totalItems}개 영역 상세 작성됨`;
    badge.className = `completeness-badge ${completeness.missingItems > 0 ? "missing" : "complete"}`;
  }

  setLegacyContextSections(sections);
  setupFocusCopy(sections, currentParsedMap);

  const empty = document.getElementById("empty-state");
  if (empty) empty.hidden = Boolean(title || sections.size);

  if (inspectorHistory.length > 0) {
    const current = inspectorHistory[inspectorHistory.length - 1];
    const refreshed = findEntity(current.kind, current.title);
    if (refreshed) {
      inspectorHistory[inspectorHistory.length - 1] = refreshed;
      renderInspector(refreshed);
    } else {
      closeInspector();
    }
  }

  const diagrams = Array.from(document.querySelectorAll<HTMLElement>(".mermaid"));
  if (diagrams.length) {
    try {
      await mermaid.run({ nodes: diagrams, suppressErrors: true });
    } catch {
      /* Mermaid owns its own render errors. */
    }
  }

  if (!currentParsedMap.hasCurrentStage) {
    for (const element of diagrams) {
      const sourceText = element.getAttribute("data-src") ?? "";
      if (!element.closest("#slot-map")) continue;
      const marker = HERE_MARKER.exec(sourceText);
      if (!marker) continue;
      const node = document.querySelector<SVGGElement>(
        `#slot-map [id$="-flowchart-${marker[1]}"], #slot-map [id*="-flowchart-${marker[1]}-"]`
      );
      node?.classList.add("you-are-here");
    }
  }
}

async function fetchAndRender(): Promise<void> {
  try {
    const response = await fetch("/progress.md", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await renderDoc(await response.text());
  } catch (error) {
    document.title = "Cockpit — Unavailable";
    const title = document.getElementById("project-title");
    if (title) title.textContent = "문서를 불러올 수 없습니다";
    const empty = document.getElementById("empty-state");
    if (empty) {
      empty.textContent = `진행 문서를 불러오지 못했습니다 (${error instanceof Error ? error.message : String(error)}).`;
      empty.hidden = false;
    }
  }
}

function initLiveReload(): void {
  if (typeof EventSource === "undefined") return;
  const eventSource = new EventSource("/events");
  eventSource.addEventListener("change", () => { void fetchAndRender(); });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bindInspectorActions();
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInspector();
  });
  void fetchAndRender();
  initLiveReload();
}

export {
  normalizeKey,
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
  parseProjectMap,
  splitSections,
  parseAreaDetails,
  findAreaDetail,
  getAreaCompleteness,
  renderNativeMap,
};
