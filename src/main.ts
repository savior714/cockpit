import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import mermaid from "mermaid";
import "./style.css";

const md = new MarkdownIt({ html: true, linkify: true });

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  flowchart: { useMaxWidth: false },
});

const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;

/** Korean & English heading text → canonical slot key */
const HEADING_ALIAS: Record<string, string> = {
  // Map
  "프로젝트 지도": "project map",
  "project map": "project map",

  // Area details
  "영역 상세": "area details",
  "area details": "area details",

  // Overview Panel (3 slots)
  "현재 상황": "current situation",
  "지금 하는 일": "current situation",
  "지금": "current situation",
  "current frontier": "current situation",
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

  "확정된 방향": "settled direction",
  "이미 정해진 방향": "settled direction",
  "settled direction": "settled direction",

  "최근 진척": "recently completed",
  "최근 완료": "recently completed",
  "recently completed": "recently completed",
  "recent progress": "recently completed",
};

interface MapItem {
  id: string;
  title: string;
  description: string;
  rawHtml: string;
  railTitle: string;
  groupTitle: string;
  isCurrentStage?: boolean;
}

interface MapGroup {
  title: string;
  items: MapItem[];
}

interface MapRail {
  title: string;
  railType: "workflow" | "trajectory" | "generic";
  groups: MapGroup[];
}

interface ParsedMap {
  isNativeMap: boolean;
  rails: MapRail[];
  currentStageTitle?: string;
  rawTokens?: Token[];
}

interface AreaDetailSubsection {
  subheading: string;
  html: string;
  rawText: string;
}

interface AreaDetail {
  title: string;
  normalizedKey: string;
  subsections: AreaDetailSubsection[];
  summaryText?: string;
}

let activeProjectTitle = "Cockpit";
let currentAreaDetails = new Map<string, AreaDetail>();
let currentParsedMap: ParsedMap | null = null;
let selectedAreaId: string | null = null;

function normalizeHeading(tokens: Token[]): string {
  const raw = tokens
    .filter((t) => t.type === "inline")
    .map((t) => t.content.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ");
  return HEADING_ALIAS[raw] ?? raw;
}

function normalizeKey(str: string): string {
  return str
    .replace(/[*_~`#[\]\\()]/g, "")
    .replace(/[\s—\-:·]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTokens(tokens: Token[]): string {
  return md.renderer.render(tokens, md.options, {});
}

function withMermaidPlaceholders(html: string): string {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, src: string) => {
      const attr = src.replace(/"/g, "&quot;");
      return `<div class="mermaid" data-src="${attr}">${src}</div>`;
    }
  );
}

/** Split top-level token stream into sections keyed by normalized h2 heading text. */
function splitSections(tokens: Token[]) {
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
function parseListItems(
  tokens: Token[],
  railTitle: string,
  groupTitle: string,
  isCurrentStageGroup: boolean
): MapItem[] {
  const items: MapItem[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "list_item_open") {
      // Look for the inline token inside this list item
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

        // Check if there is bold text `**title**`
        const boldMatch = /^\*\*([^*]+)\*\*(?:\s*[—\-:]\s*([\s\S]*))?$/.exec(fullContent);
        if (boldMatch) {
          title = boldMatch[1].trim();
          description = (boldMatch[2] ?? "").trim();
        } else {
          // Check for separator `—` or `-` or `:`
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

/** Parse `## 프로젝트 지도` tokens into structured rails & groups. */
function parseProjectMap(tokens: Token[]): ParsedMap {
  if (!tokens || tokens.length === 0) {
    return { isNativeMap: false, rails: [] };
  }

  // Check if this map section contains H3 headings
  const hasH3 = tokens.some((t) => t.type === "heading_open" && t.tag === "h3");
  if (!hasH3) {
    return { isNativeMap: false, rails: [], rawTokens: tokens };
  }

  const rails: MapRail[] = [];
  let currentRail: MapRail | null = null;
  let currentGroup: MapGroup | null = null;
  let groupTokens: Token[] = [];
  let currentStageTitle: string | undefined = undefined;

  const flushGroup = () => {
    if (currentRail && currentGroup) {
      const isCurrentStage =
        normalizeKey(currentGroup.title).includes("현재단계") ||
        normalizeKey(currentGroup.title).includes("currentstage");
      currentGroup.items = parseListItems(
        groupTokens,
        currentRail.title,
        currentGroup.title,
        isCurrentStage
      );

      if (isCurrentStage && currentGroup.items.length > 0 && !currentStageTitle) {
        currentStageTitle = currentGroup.items[0].title;
      }

      currentRail.groups.push(currentGroup);
      currentGroup = null;
      groupTokens = [];
    }
  };

  const flushRail = () => {
    flushGroup();
    if (currentRail && currentRail.groups.length > 0) {
      rails.push(currentRail);
      currentRail = null;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && t.tag === "h3") {
      flushRail();
      const railTitle = tokens[i + 1]?.content.trim() ?? "지도 레일";
      const norm = normalizeKey(railTitle);
      let railType: "workflow" | "trajectory" | "generic" = "generic";
      if (norm.includes("외래") || norm.includes("진료") || norm.includes("workflow")) {
        railType = "workflow";
      } else if (norm.includes("의원") || norm.includes("도입") || norm.includes("trajectory")) {
        railType = "trajectory";
      }

      currentRail = {
        title: railTitle,
        railType,
        groups: [],
      };
      i += 2;
    } else if (t.type === "heading_open" && t.tag === "h4") {
      flushGroup();
      const groupTitle = tokens[i + 1]?.content.trim() ?? "단계";
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
    currentStageTitle,
    rawTokens: tokens,
  };
}

/** Parse `## 영역 상세` into AreaDetail records. */
function parseAreaDetails(tokens: Token[]): Map<string, AreaDetail> {
  const details = new Map<string, AreaDetail>();
  if (!tokens || tokens.length === 0) return details;

  let currentArea: AreaDetail | null = null;
  let currentSubsection: { subheading: string; tokens: Token[] } | null = null;

  const flushSubsection = () => {
    if (currentArea && currentSubsection) {
      const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
      const rawText = currentSubsection.tokens
        .filter((t) => t.type === "inline")
        .map((t) => t.content)
        .join("\n")
        .trim();

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
        normalizedKey: normalizeKey(title),
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

/** Find matching AreaDetail for a given map item */
function findAreaDetail(item: MapItem): AreaDetail | undefined {
  const exactKey = normalizeKey(item.title);
  if (currentAreaDetails.has(exactKey)) {
    return currentAreaDetails.get(exactKey);
  }

  // Fuzzy match by inclusion
  for (const [key, detail] of currentAreaDetails) {
    if (exactKey.includes(key) || key.includes(exactKey)) {
      return detail;
    }
  }

  return undefined;
}

/** Render Native HTML Map */
function renderNativeMap(parsedMap: ParsedMap): string {
  let html = `<div class="native-project-map">`;

  for (const rail of parsedMap.rails) {
    const isWorkflow = rail.railType === "workflow";
    const isTrajectory = rail.railType === "trajectory";

    html += `<section class="map-rail map-rail-${rail.railType}">`;
    html += `
      <div class="rail-header">
        <span class="rail-badge">${
          isWorkflow
            ? "환자 진료 업무 영역"
            : isTrajectory
              ? "프로젝트 도입 여정"
              : "프로젝트 축"
        }</span>
        <h3 class="rail-title">${escapeHtml(rail.title)}</h3>
      </div>
    `;

    if (isWorkflow) {
      html += `<div class="workflow-groups-container">`;
      rail.groups.forEach((group, gIdx) => {
        if (gIdx > 0) {
          html += `<div class="workflow-arrow" aria-hidden="true">→</div>`;
        }
        const stepNum = gIdx + 1;
        html += `
          <div class="workflow-group group-${gIdx}">
            <div class="group-header">
              <span class="group-step-pill">${stepNum}</span>
              <h4 class="group-name">${escapeHtml(group.title)}</h4>
            </div>
            <div class="group-items">
        `;
        for (const item of group.items) {
          const isSelected = selectedAreaId === item.id;
          html += `
            <button
              type="button"
              class="map-card card-workflow ${isSelected ? "selected" : ""}"
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
      });
      html += `</div>`;
    } else if (isTrajectory) {
      html += `<div class="trajectory-groups-container">`;
      for (const group of rail.groups) {
        const norm = normalizeKey(group.title);
        const isFoundation = norm.includes("확보된기반") || norm.includes("foundation");
        const isCurrent = norm.includes("현재단계") || norm.includes("currentstage");
        const isFuture = norm.includes("앞으로의도입경로") || norm.includes("future");

        if (isFoundation) {
          html += `
            <div class="trajectory-group group-foundation">
              <div class="group-header">
                <span class="group-badge-subtle">기반 영역</span>
                <h4 class="group-name">${escapeHtml(group.title)}</h4>
                <span class="group-caption">진행 근거 확보됨 (필요시 언제든 재검토 가능)</span>
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
                  <div class="card-header-line">
                    <span class="card-dot-ready" aria-hidden="true"></span>
                    <span class="card-title">${escapeHtml(item.title)}</span>
                  </div>
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
                <h4 class="group-name visually-hidden">${escapeHtml(group.title)}</h4>
              </div>
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
                <div class="stage-card-content">
                  <div class="stage-title-wrap">
                    <span class="stage-pulse-dot" aria-hidden="true"></span>
                    <span class="card-title">${escapeHtml(item.title)}</span>
                  </div>
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
        } else if (isFuture) {
          html += `
            <div class="trajectory-group group-future">
              <div class="group-header">
                <span class="group-badge-subtle">향후 여정</span>
                <h4 class="group-name">${escapeHtml(group.title)}</h4>
                <span class="group-caption">단계적 도입 및 실운영 전환</span>
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
          // Generic group inside trajectory
          html += `
            <div class="trajectory-group">
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
                class="map-card ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
              >
                <span class="card-title">${escapeHtml(item.title)}</span>
                ${
                  item.description
                    ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                    : ""
                }
              </button>
            `;
          }
          html += `</div></div>`;
        }
      }
      html += `</div>`;
    } else {
      // Generic rail
      html += `<div class="generic-groups-container">`;
      for (const group of rail.groups) {
        html += `
          <div class="generic-group">
            <h4 class="group-name">${escapeHtml(group.title)}</h4>
            <div class="group-items-grid">
        `;
        for (const item of group.items) {
          const isSelected = selectedAreaId === item.id;
          html += `
            <button
              type="button"
              class="map-card ${isSelected ? "selected" : ""}"
              data-item-id="${escapeHtml(item.id)}"
            >
              <span class="card-title">${escapeHtml(item.title)}</span>
              ${
                item.description
                  ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                  : ""
              }
            </button>
          `;
        }
        html += `</div></div>`;
      }
      html += `</div>`;
    }

    html += `</section>`;
  }

  html += `</div>`;
  return html;
}

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

  const detail = findAreaDetail(item);

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
      <p class="muted">이 영역에 대한 추가 세부 기록(의미, 현재 수준, 근거 등)이 아직 '## 영역 상세'에 작성되지 않았습니다.</p>
    `;
    sectionsEl.appendChild(emptySub);
  }

  // Setup "이 영역 검토하기" copy action
  const copyBtn = document.getElementById("inspector-copy-btn")!;
  const copyToast = document.getElementById("copy-toast")!;
  copyToast.hidden = true;

  copyBtn.onclick = async () => {
    let textToCopy = `[프로젝트] ${activeProjectTitle}\n`;
    textToCopy += `[선택 영역] ${item.title} (${item.railTitle} · ${item.groupTitle})\n`;

    if (item.description) {
      textToCopy += `[개요] ${item.description}\n`;
    }

    if (detail && detail.subsections.length > 0) {
      for (const sub of detail.subsections) {
        textToCopy += `\n[${sub.subheading}]\n${sub.rawText}\n`;
      }
    }

    textToCopy += `\n---\n`;
    textToCopy += `현재 repo/SSOT/evidence와 대조해서 이 영역에 실제 취약점이 있는지 검토한다.\n`;
    textToCopy += `실제 문제가 확인되고 사용자 결정이 필요하지 않다면 가장 작은 bounded target까지 좁힌다.`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyToast.hidden = false;
      copyBtn.classList.add("btn-copied");
      setTimeout(() => {
        copyToast.hidden = true;
        copyBtn.classList.remove("btn-copied");
      }, 3000);
    } catch (err) {
      console.error("Clipboard copy failed", err);
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
    mapBody.innerHTML = renderNativeMap(parsedMap);

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

  // Setup Header Stage Chip
  const chip = document.getElementById("you-are-here-chip")!;
  chip.hidden = true;

  if (parsedMap.currentStageTitle) {
    chip.textContent = `현재 단계 · ${parsedMap.currentStageTitle}`;
    chip.hidden = false;
  }

  // Setup Overview Panels
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
  if (!parsedMap.currentStageTitle) {
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
        const label = g.querySelector(".nodeLabel")?.textContent?.trim();
        chip.textContent = `현재 단계 · ${label || nodeId}`;
        chip.hidden = false;
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

void fetchAndRender();
initLiveReload();
