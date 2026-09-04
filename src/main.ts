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
  parseProjectMap,
} from "./semantic-construction.js";
import {
  areaEntity,
  classifySubsectionTone,
  evidenceEntity,
  findEntity,
  renderNativeMap,
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
let selectedAreaId: string | null = null;
let inspectorHistory: InspectorEntity[] = [];

function currentLookup(): EntityLookup {
  return {
    map: currentParsedMap,
    areaDetails: currentAreaDetails,
  };
}

const INSPECTOR_LABELS: Record<InspectorKind, string> = {
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

function setSectionPanel(sectionKey: string, panelId: string): boolean {
  const tokens = currentSections.get(sectionKey);
  const panel = document.getElementById(panelId);
  if (!panel) return false;
  const body = panel.querySelector<HTMLElement>(".panel-body");
  if (body) body.innerHTML = tokens ? withMermaidPlaceholders(renderTokens(tokens)) : "";
  const visible = Boolean(tokens?.length);
  panel.hidden = !visible;
  return visible;
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
        situationText: extractSectionRawText(currentSections.get("situation")),
        nextTransitionText: extractSectionRawText(currentSections.get("next")),
        facingIssuesText: extractSectionRawText(currentSections.get("facing")),
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
    const evidenceButton = target.closest<HTMLButtonElement>("[data-subsection-index]");
    if (evidenceButton && inspectorHistory.length > 0) {
      const index = Number(evidenceButton.dataset.subsectionIndex);
      const parent = inspectorHistory[inspectorHistory.length - 1];
      const section = parent.subsections[index];
      if (section) openInspector(evidenceEntity(parent, section));
    }
  });
}

function setupFocusCopy(sections: Map<string, Token[]>, parsedMap: ParsedMap): void {
  const button = document.getElementById("focus-copy-btn") as HTMLButtonElement | null;
  const toast = document.getElementById("focus-copy-toast");
  if (!button) return;
  button.onclick = async () => {
    const text = buildFocusHandoffContext({
      projectTitle: activeProjectTitle,
      focusText: extractSectionRawText(sections.get("current focus")),
      situationText: extractSectionRawText(sections.get("situation")),
      nextTransitionText: extractSectionRawText(sections.get("next")),
      facingIssuesText: extractSectionRawText(sections.get("facing")),
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

function renderExtraSections(sections: Map<string, Token[]>): void {
  const extra = document.getElementById("slot-extra");
  if (!extra) return;
  extra.innerHTML = "";
  const known = new Set([
    "project map", "area details",
    "current focus", "situation", "next", "facing", "recent",
    "project frame", "settled direction",
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

async function renderDoc(source: string): Promise<void> {
  const tokens = md.parse(source, {});
  const { title, sections } = splitSections(tokens);
  activeProjectTitle = title || "Cockpit";
  currentSections = sections;
  currentAreaDetails = parseAreaDetails(sections.get("area details") ?? []);
  currentParsedMap = parseProjectMap(sections.get("project map") ?? []);

  document.title = title ? `${title} — Cockpit` : "Cockpit";
  const projectTitle = document.getElementById("project-title");
  if (projectTitle) projectTitle.textContent = title || "이름 없는 프로젝트";

  // MAP-FIRST: the project map is the mental anchor and renders first.
  const mapPanel = document.getElementById("slot-map");
  const mapBody = mapPanel?.querySelector<HTMLElement>(".map-body");
  if (mapBody && currentParsedMap.isNativeMap) {
    mapBody.innerHTML = renderNativeMap(
      currentParsedMap,
      selectedAreaId,
      currentAreaDetails
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

  // Orientation second: 지금 / 다음 / 막힘 — plain-text projection, no ontology.
  setSectionPanel("situation", "slot-now");
  setSectionPanel("next", "slot-next");
  setSectionPanel("facing", "slot-blocked");
  setSectionPanel("recent", "slot-recent");

  // Stable context + user-owned focus last.
  const focusTokens = sections.get("current focus");
  const focusPanel = document.getElementById("slot-focus");
  if (focusPanel) {
    const body = focusPanel.querySelector<HTMLElement>(".panel-body");
    if (body) body.innerHTML = focusTokens ? withMermaidPlaceholders(renderTokens(focusTokens)) : "";
    focusPanel.hidden = !focusTokens?.length;
  }
  setSectionPanel("project frame", "slot-frame");
  setSectionPanel("settled direction", "slot-settled");

  renderExtraSections(sections);
  setupFocusCopy(sections, currentParsedMap);

  const empty = document.getElementById("empty-state");
  if (empty) empty.hidden = Boolean(title || sections.size);

  if (inspectorHistory.length > 0) {
    const current = inspectorHistory[inspectorHistory.length - 1];
    if (current.kind === "area" && current.areaItem) {
      const refreshed = findEntity("area", current.areaItem.title, currentLookup());
      if (refreshed) {
        inspectorHistory[inspectorHistory.length - 1] = refreshed;
        renderInspector(refreshed);
      } else {
        closeInspector();
      }
    } else if (current.kind === "evidence") {
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
