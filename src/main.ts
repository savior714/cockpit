import type { Token } from "./markdown-structure.js";
import "./style.css";
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
import { renderMermaidDiagrams } from "./mermaid-loader.js";
import type { AreaCompleteness } from "./structural-check.js";
import type {
  AreaDetail,
  MapItem,
  ParsedMap,
} from "./domain.js";

let activeProjectTitle = "Cockpit";
let currentSections = new Map<string, Token[]>();
let currentAreaDetails = new Map<string, AreaDetail>();
let currentParsedMap: ParsedMap | null = null;
let selectedAreaId: string | null = null;
let currentInspector: InspectorEntity | null = null;

function currentLookup(): EntityLookup {
  return {
    map: currentParsedMap,
    areaDetails: currentAreaDetails,
  };
}

const INSPECTOR_LABELS: Record<InspectorKind, string> = {
  area: "프로젝트 영역",
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

function renderInspector(entity: InspectorEntity): void {
  const aside = document.getElementById("inspector-aside");
  if (!aside) return;
  aside.hidden = false;

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
    // Summary ownership: the map card already owns the area short label, and
    // the 의미 subsection owns the explanation. Rendering summaryText again as
    // an area lead repeats the same meaning, so the area view carries no lead.
    summary.innerHTML = "";
    summary.hidden = true;
  }

  const sections = document.getElementById("inspector-sections");
  if (sections) {
    // Evidence ownership: 의미/현재 수준/남은 문제/근거 all render inline in
    // the area view. Reading evidence never opens a separate navigation level.
    sections.innerHTML = entity.subsections.length > 0
      ? entity.subsections.map((item) => {
          const tone = item.tone ?? classifySubsectionTone(item.subheading, item.rawText, entity.state);
          const toneClass = `tone-${tone}`;
          return `
          <section class="inspector-sub-card">
            <div class="sub-header"><span class="sub-badge ${toneClass}">${escapeHtml(item.subheading)}</span></div>
            <div class="sub-body">${item.html}</div>
          </section>
        `;
        }).join("")
      : (entity.html ? `<section class="inspector-sub-card"><div class="sub-body">${entity.html}</div></section>` : `<p class="muted">추가 세부 기록이 없습니다.</p>`);
  }

  const copyButton = document.getElementById("inspector-copy-btn") as HTMLButtonElement | null;
  const copyToast = document.getElementById("copy-toast");
  if (copyButton) {
    copyButton.hidden = false;
    copyButton.onclick = async () => {
      if (!entity.areaItem) return;
      const detail = findAreaDetail(entity.areaItem, currentAreaDetails);
      const text = buildAreaHandoffContext({
        projectTitle: activeProjectTitle,
        areaTitle: entity.areaItem.title,
        railTitle: entity.areaItem.railTitle,
        groupTitle: entity.areaItem.groupTitle,
        projectMapText: currentParsedMap ? formatProjectMapText(currentParsedMap) : "",
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
}

function projectMapSelection(): void {
  const current = selectedAreaId;
  document.querySelectorAll(".map-card").forEach((card) => {
    card.classList.toggle(
      "selected",
      current !== null && card.getAttribute("data-item-id") === current
    );
  });
}

function resolveSelectedAreaId(entity: InspectorEntity): string | null {
  return entity.areaItem?.id ?? null;
}

function openInspector(entity: InspectorEntity): void {
  // Single-current model: Map navigation replaces the current area instead of
  // accumulating parallel areas into a sequential trail. The Project Map stays
  // the sole owner of cross-area navigation; the Inspector shows one area
  // at a time with no inter-area `→` rail.
  currentInspector = entity;
  selectedAreaId = resolveSelectedAreaId(entity);
  projectMapSelection();
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
  currentInspector = null;
  selectedAreaId = null;
  const aside = document.getElementById("inspector-aside");
  if (aside) aside.hidden = true;
  projectMapSelection();
}

function bindInspectorActions(): void {
  const close = document.getElementById("inspector-close-btn");
  if (!close) return;
  close.onclick = () => closeInspector();
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

  // Orientation second: 프로젝트 현황 / 다음 단계 / 진행 제약 — plain-text projection, no ontology.
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

  if (currentInspector) {
    const current = currentInspector;
    if (current.areaItem) {
      const refreshed = findEntity("area", current.areaItem.title, currentLookup());
      if (refreshed) {
        currentInspector = refreshed;
        renderInspector(refreshed);
      } else {
        closeInspector();
      }
    }
  }

  const diagrams = Array.from(document.querySelectorAll<HTMLElement>(".mermaid"));
  await renderMermaidDiagrams(diagrams);
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

function initLiveReload(): EventSource | null {
  if (typeof EventSource === "undefined") return null;
  const eventSource = new EventSource("/events");
  eventSource.addEventListener("change", () => { void fetchAndRender(); });
  eventSource.addEventListener("refresh-status", ((event: MessageEvent) => {
    try {
      const status = JSON.parse((event as MessageEvent).data) as AutoRefreshStatus;
      renderAutoRefresh(status);
    } catch {
      /* malformed status never breaks live reload */
    }
  }) as EventListener);
  return eventSource;
}

interface AutoRefreshStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  configured: boolean;
  lastCheckAt: string | null;
  lastResult: string | null;
}

// Latest server-reported capability. The control starts hidden and disabled in
// markup and only appears once a status with `configured: true` arrives, so an
// ordinary launch without COCKPIT_REFRESH_COMMAND never presents auto-update
// as an available capability — including across the POST round-trip below,
// where renderAutoRefresh may not run.
let lastRefreshConfigured = false;

function refreshStatusText(status: AutoRefreshStatus): string {
  // Capability first: the server already knows `configured`, so an
  // unconfigured reader never renders an operational/waiting state —
  // not before the first tick and not after an ON attempt.
  if (!status.configured) return "연결 없음 · 기존 화면 유지";
  if (!status.enabled) return "꺼짐";
  if (status.running) return "확인 중…";
  if (status.lastResult === "failed") return "확인 실패 · 기존 화면 유지";
  if (status.lastResult === "changed") return "새 내용을 반영했습니다";
  if (status.lastResult === "unchanged") return "최신 상태입니다";
  return "켜짐 · 대기 중";
}

function renderAutoRefresh(status: AutoRefreshStatus): void {
  const control = document.getElementById("auto-refresh-control");
  const toggle = document.getElementById("auto-refresh-toggle") as HTMLButtonElement | null;
  const label = document.getElementById("auto-refresh-status");
  // Optional integration only: without a separately configured external owner
  // there is no auto-update capability to offer, so the control stays hidden
  // instead of rendering a permanently disabled operational-looking switch.
  if (control) control.hidden = !status.configured;
  if (toggle) {
    toggle.setAttribute("aria-checked", status.enabled ? "true" : "false");
    toggle.disabled = !status.configured;
  }
  if (label) label.textContent = refreshStatusText(status);
  lastRefreshConfigured = status.configured;
}

async function fetchAutoRefreshStatus(): Promise<AutoRefreshStatus | null> {
  try {
    const response = await fetch("/api/auto-refresh", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as AutoRefreshStatus;
  } catch {
    return null;
  }
}

function initAutoRefresh(): void {
  const toggle = document.getElementById("auto-refresh-toggle") as HTMLButtonElement | null;
  if (!toggle) return;
  // Default is hidden and OFF in markup; converge to the server-owned
  // state once known. No browser timer or stored preference ever schedules refresh.
  void fetchAutoRefreshStatus().then((status) => {
    if (status) renderAutoRefresh(status);
  });
  toggle.addEventListener("click", () => {
    const want = toggle.getAttribute("aria-checked") !== "true";
    toggle.disabled = true;
    fetch("/api/auto-refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: want }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const status = (await response.json()) as AutoRefreshStatus;
        renderAutoRefresh(status);
      })
      .catch(() => {
        /* POST failure keeps the previous toggle state; next SSE status converges */
      })
      .finally(() => {
        // Restore the capability truth, not blind interactivity: when the
        // POST round-trip produced no status, the previous server state still
        // owns whether this control is usable at all.
        toggle.disabled = !lastRefreshConfigured;
      });
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bindInspectorActions();
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeInspector();
  });
  void fetchAndRender();
  initLiveReload();
  initAutoRefresh();
}
