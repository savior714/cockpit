import type { Token } from "markdown-it";
import mermaid from "mermaid";
import "./style.css";
import {
  md,
  HERE_MARKER,
  type MapItem,
  type MapRail,
  type ParsedMap,
  type AreaDetail,
  type AreaCompleteness,
  normalizeKey,
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
  extractSectionRawText,
  formatProjectMapText,
  formatAreaDetailsText,
  buildFocusHandoffContext,
  buildAreaHandoffContext,
  type AreaHandoffParams,
} from "./parser";

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

/** Find MapItem by ID across all parsed rails */
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    }
  } catch (err) {
    console.error("Clipboard copy failed", err);
    return false;
  }
}

/** Update the Area Inspector panel with the selected item's details */
function updateInspectorView(item: MapItem | null) {
  const overviewPanel = document.getElementById("overview-panel")!;
  const areaInspectorPanel = document.getElementById("area-inspector-panel")!;

  if (!item) {
    selectedAreaId = null;
    overviewPanel.hidden = false;
    areaInspectorPanel.hidden = true;
    document.querySelectorAll(".map-card.selected").forEach((el) => {
      el.classList.remove("selected");
    });
    return;
  }

  selectedAreaId = item.id;
  overviewPanel.hidden = true;
  areaInspectorPanel.hidden = false;

  // Update card active state in map
  document.querySelectorAll(".map-card").forEach((el) => {
    if (el.getAttribute("data-item-id") === item.id) {
      el.classList.add("selected");
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    } else {
      el.classList.remove("selected");
    }
  });

  const groupTag = document.getElementById("inspector-group-tag")!;
  const titleEl = document.getElementById("inspector-title")!;
  const summaryEl = document.getElementById("inspector-summary")!;
  const sectionsEl = document.getElementById("inspector-sections")!;

  groupTag.textContent = `${item.railTitle} · ${item.groupTitle}`;
  titleEl.textContent = item.title;

  const detail = findAreaDetail(item, currentAreaDetails);

  if (item.description) {
    summaryEl.innerHTML = `<p class="inspector-lead">${escapeHtml(item.description)}</p>`;
    summaryEl.hidden = false;
  } else {
    summaryEl.innerHTML = "";
    summaryEl.hidden = true;
  }

  sectionsEl.innerHTML = "";

  if (detail && detail.subsections.length > 0) {
    for (const sub of detail.subsections) {
      const subCard = document.createElement("div");
      subCard.className = "inspector-sub-card";

      const normSub = normalizeKey(sub.subheading);
      let badgeClass = "sub-badge";
      if (normSub.includes("근거") || normSub.includes("evidence")) {
        badgeClass += " badge-evidence";
      } else if (normSub.includes("남은문제") || normSub.includes("remaining")) {
        badgeClass += " badge-remaining";
      } else if (normSub.includes("다시열리는조건") || normSub.includes("reopen")) {
        badgeClass += " badge-reopen";
      }

      subCard.innerHTML = `
        <div class="sub-header">
          <span class="${badgeClass}">${escapeHtml(sub.subheading)}</span>
        </div>
        <div class="sub-body">${sub.html}</div>
      `;
      sectionsEl.appendChild(subCard);
    }
  } else {
    const emptySub = document.createElement("div");
    emptySub.className = "inspector-sub-card empty-detail";
    emptySub.innerHTML = `
      <p class="muted">이 영역('${escapeHtml(item.title)}')에 대한 추가 세부 기록(의미, 현재 수준, 남은 문제, 근거 등)이 소스 문서의 '## 영역 상세'에 아직 작성되지 않았습니다.</p>
    `;
    sectionsEl.appendChild(emptySub);
  }

  // Setup "이 영역 검토하기" copy action
  const copyBtn = document.getElementById("inspector-copy-btn")!;
  const copyToast = document.getElementById("copy-toast")!;
  copyToast.hidden = true;

  copyBtn.onclick = async () => {
    const focusTokens = currentSections.get("current focus");
    const situationTokens = currentSections.get("current situation");
    const nextTokens = currentSections.get("next transition");
    const facingTokens = currentSections.get("facing issues");
    const frameTokens = currentSections.get("project frame");
    const settledTokens = currentSections.get("settled direction");

    const handoffText = buildAreaHandoffContext({
      projectTitle: activeProjectTitle,
      areaTitle: item.title,
      railTitle: item.railTitle,
      groupTitle: item.groupTitle,
      areaDescription: item.description,
      areaDetail: detail,
      focusText: focusTokens ? extractSectionRawText(focusTokens) : undefined,
      situationText: situationTokens ? extractSectionRawText(situationTokens) : undefined,
      nextTransitionText: nextTokens ? extractSectionRawText(nextTokens) : undefined,
      facingIssuesText: facingTokens ? extractSectionRawText(facingTokens) : undefined,
      projectFrameText: frameTokens ? extractSectionRawText(frameTokens) : undefined,
      settledDirectionText: settledTokens ? extractSectionRawText(settledTokens) : undefined,
    });

    const ok = await copyToClipboard(handoffText);
    if (ok) {
      copyToast.hidden = false;
      copyBtn.classList.add("btn-copied");
      setTimeout(() => {
        copyToast.hidden = true;
        copyBtn.classList.remove("btn-copied");
      }, 3000);
    }
  };
}

function setSection(panelId: string, tokens: Token[] | undefined) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const body = panel.querySelector<HTMLElement>(".panel-body");
  if (!body) return;
  const html = tokens ? withMermaidPlaceholders(renderTokens(tokens)) : "";
  body.innerHTML = html || `<p class="muted">아직 기록된 내용이 없습니다.</p>`;
}

async function renderDoc(source: string) {
  const tokens = md.parse(source, {});
  const { title, sections } = splitSections(tokens);
  currentSections = sections;
  activeProjectTitle = title || "Cockpit";

  const byHeading = (name: string) => sections.get(name);

  document.title = title ? `${title} — Cockpit` : "Cockpit";
  document.getElementById("project-title")!.textContent = title || "이름 없는 프로젝트";

  // Parse Area Details
  const areaDetailTokens = byHeading("area details") ?? [];
  currentAreaDetails = parseAreaDetails(areaDetailTokens);

  // Parse Project Map
  const mapTokens = byHeading("project map") ?? [];
  const parsedMap = parseProjectMap(mapTokens);
  currentParsedMap = parsedMap;

  const mapPanel = document.getElementById("slot-map")!;
  const mapBody = mapPanel.querySelector<HTMLElement>(".map-body")!;

  if (parsedMap.isNativeMap) {
    mapBody.innerHTML = renderNativeMap(parsedMap, selectedAreaId, currentAreaDetails);

    // Bind click events on all map cards
    mapBody.querySelectorAll<HTMLButtonElement>(".map-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-item-id");
        if (itemId) {
          const item = findMapItemById(itemId);
          if (item) {
            updateInspectorView(selectedAreaId === item.id ? null : item);
          }
        }
      });
    });
  } else {
    // Fallback to generic tokens rendering (Mermaid or Markdown)
    const html = mapTokens.length
      ? withMermaidPlaceholders(renderTokens(mapTokens))
      : `<p class="muted">프로젝트 지도 내용이 없습니다.</p>`;
    mapBody.innerHTML = html;
  }

  // Setup Area Detail Completeness Badge
  const completeness = getAreaCompleteness(parsedMap, currentAreaDetails);
  const completenessBadge = document.getElementById("map-completeness-badge");
  if (completenessBadge) {
    if (completeness.totalItems > 0 && completeness.missingItems > 0) {
      completenessBadge.textContent = `영역 상세 ${completeness.matchedItems}/${completeness.totalItems} · ${completeness.missingItems}개 미작성`;
      completenessBadge.className = "completeness-badge missing";
      completenessBadge.hidden = false;
    } else {
      completenessBadge.hidden = true;
    }
  }

  // Setup Header Chip (hidden by default; local stage markers live in each rail)
  const chip = document.getElementById("you-are-here-chip");
  if (chip) {
    chip.hidden = true;
  }

  // Setup Overview Panels
  const focusTokens = byHeading("current focus");
  const slotFocus = document.getElementById("slot-focus");
  const focusCopyBtn = document.getElementById("focus-copy-btn");
  const focusCopyToast = document.getElementById("focus-copy-toast");
  if (focusCopyToast) {
    focusCopyToast.hidden = true;
  }

  if (slotFocus) {
    if (focusTokens && focusTokens.length > 0) {
      setSection("slot-focus", focusTokens);
      slotFocus.hidden = false;

      if (focusCopyBtn) {
        focusCopyBtn.onclick = async () => {
          const focusText = extractSectionRawText(focusTokens);
          const situationText = extractSectionRawText(byHeading("current situation"));
          const nextTransitionText = extractSectionRawText(byHeading("next transition"));
          const facingIssuesText = extractSectionRawText(byHeading("facing issues"));
          const projectFrameText = extractSectionRawText(byHeading("project frame"));
          const settledDirectionText = extractSectionRawText(byHeading("settled direction"));
          const projectMapText = formatProjectMapText(parsedMap);
          const areaDetailsText = formatAreaDetailsText(currentAreaDetails);

          const handoffText = buildFocusHandoffContext({
            projectTitle: activeProjectTitle,
            focusText,
            situationText,
            nextTransitionText,
            facingIssuesText,
            projectFrameText,
            settledDirectionText,
            projectMapText,
            areaDetailsText,
          });

          const ok = await copyToClipboard(handoffText);
          if (ok && focusCopyToast) {
            focusCopyToast.hidden = false;
            focusCopyBtn.classList.add("btn-copied");
            setTimeout(() => {
              focusCopyToast.hidden = true;
              focusCopyBtn.classList.remove("btn-copied");
            }, 3000);
          }
        };
      }
    } else {
      slotFocus.hidden = true;
    }
  }

  setSection("slot-now", byHeading("current situation"));
  setSection("slot-next", byHeading("next transition"));
  setSection("slot-blocked", byHeading("facing issues"));

  // Context panels
  setSection("slot-frame", byHeading("project frame"));
  setSection("slot-settled", byHeading("settled direction"));

  const recentTokens = byHeading("recently completed");
  const slotRecent = document.getElementById("slot-recent");
  if (slotRecent) {
    if (recentTokens && recentTokens.length > 0) {
      setSection("slot-recent", recentTokens);
      slotRecent.hidden = false;
    } else {
      slotRecent.hidden = true;
    }
  }

  // Extra context sections
  const known = new Set([
    "project map",
    "area details",
    "current focus",
    "current situation",
    "next transition",
    "facing issues",
    "project frame",
    "settled direction",
    "recently completed",
  ]);

  const extra = document.getElementById("slot-extra")!;
  extra.innerHTML = "";
  let extrasShown = false;
  for (const [name, toks] of sections) {
    if (known.has(name)) continue;
    const heading = name.startsWith("__h") ? name.split(":", 2)[1] : name;
    const card = document.createElement("section");
    card.className = "panel panel-context";
    card.innerHTML = `<h2>${escapeHtml(heading)}</h2><div class="panel-body">${
      withMermaidPlaceholders(renderTokens(toks)) || `<p class="muted">아직 기록된 내용이 없습니다.</p>`
    }</div>`;
    extra.appendChild(card);
    extrasShown = true;
  }
  extra.hidden = !extrasShown;

  const empty = document.getElementById("empty-state")!;
  const nothing = !title && sections.size === 0;
  empty.hidden = !nothing;

  // Restore or reset Inspector view
  if (selectedAreaId) {
    const item = findMapItemById(selectedAreaId);
    updateInspectorView(item);
  } else {
    updateInspectorView(null);
  }

  // Bind close button
  const closeBtn = document.getElementById("inspector-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => updateInspectorView(null);
  }

  // Render any Mermaid diagrams elsewhere in the page
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(".mermaid"));
  if (nodes.length) {
    try {
      await mermaid.run({ nodes, suppressErrors: true });
    } catch {
      /* Mermaid handles its own render errors */
    }
  }

  // Fallback: If Mermaid YOU ARE HERE marker exists in a legacy map
  if (!parsedMap.hasCurrentStage) {
    for (const el of nodes) {
      const src = el.getAttribute("data-src") ?? "";
      if (!el.closest("#slot-map")) continue;
      const marker = HERE_MARKER.exec(src);
      if (!marker) continue;
      const nodeId = marker[1];
      const g = document.querySelector<SVGGElement>(
        `#slot-map [id$="-flowchart-${nodeId}"], #slot-map [id*="-flowchart-${nodeId}-"]`
      );
      if (g) {
        g.classList.add("you-are-here");
      }
    }
  }
}

async function fetchAndRender() {
  try {
    const res = await fetch("/progress.md", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    await renderDoc(text);
  } catch (err) {
    document.title = "Cockpit — Unavailable";
    document.getElementById("project-title")!.textContent = "문서를 불러올 수 없습니다";
    const empty = document.getElementById("empty-state")!;
    empty.textContent = `진행 문서를 불러오지 못했습니다 (${err instanceof Error ? err.message : String(err)}).`;
    empty.hidden = false;
  }
}

function initLiveReload() {
  if (typeof EventSource === "undefined") return;
  const es = new EventSource("/events");
  es.addEventListener("change", () => {
    void fetchAndRender();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
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
