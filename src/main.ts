import type { Token } from "./markdown-structure.js";
import mermaid from "mermaid";
import "./style.css";
import { HERE_MARKER } from "./authoring-grammar.js";
import {
  escapeHtml,
  md,
  renderTokens,
  withMermaidPlaceholders,
  splitSections,
  extractSectionRawText,
} from "./markdown-structure.js";
import {
  findAreaDetail,
  parseAreaDetails,
  parseMentalModel,
  parseProjectMap,
} from "./semantic-construction.js";
import {
  areaEntity,
  classifySubsectionTone,
  evidenceEntity,
  findEntity,
  relatedEntity,
  renderFrontiers,
  renderHorizon,
  renderLegacyFrontier,
  renderMovements,
  renderNativeMap,
  renderPosture,
  renderStageJourney,
  renderThreads,
  stateClass,
  formatAreaDetailsText,
  formatProjectMapText,
  type EntityLookup,
  type InspectorEntity,
  type InspectorKind,
} from "./inspector-projection.js";
import {
  buildAreaHandoffContext,
  buildFocusHandoffContext,
} from "./handoff-context.js";
import { getAreaCompleteness } from "./structural-check.js";
import type { AreaCompleteness } from "./structural-check.js";
import type {
  AreaDetail,
  MapItem,
  ParsedMap,
  ParsedMentalModel,
} from "./domain.js";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  flowchart: { useMaxWidth: false },
});

let activeProjectTitle = "Cockpit";
let currentSections = new Map<string, Token[]>();
let currentAreaDetails = new Map<string, AreaDetail>();
let currentParsedMap: ParsedMap | null = null;
let currentModel: ParsedMentalModel = { frontiers: [], strategicThreads: [], movements: [] };
let selectedAreaId: string | null = null;
let inspectorHistory: InspectorEntity[] = [];

function currentLookup(): EntityLookup {
  return {
    map: currentParsedMap,
    areaDetails: currentAreaDetails,
    stageJourney: currentModel.stageJourney,
    posture: currentModel.posture,
    frontiers: currentModel.frontiers,
    strategicThreads: currentModel.strategicThreads,
    movements: currentModel.movements,
  };
}

const INSPECTOR_LABELS: Record<InspectorKind, string> = {
  posture: "프로젝트 상태",
  stage: "진행 단계",
  frontier: "전환 과제",
  thread: "전략적 흐름",
  movement: "중요한 변화",
  area: "프로젝트 영역",
  evidence: "근거",
};

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
    const validRelations = entity.relations.filter((relation) => relatedEntity(relation, currentLookup()));
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
      const related = findEntity(kind, relation.dataset.relatedTitle ?? "", currentLookup());
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
      const entity = findEntity(kind, title, currentLookup());
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
        if (item) openInspector(areaEntity(item, currentAreaDetails));
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
    const refreshed = findEntity(current.kind, current.title, currentLookup());
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
