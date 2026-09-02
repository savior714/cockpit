import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

export const md = new MarkdownIt({ html: true, linkify: true });

export const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;

/** Korean & English heading text → canonical slot key */
export const HEADING_ALIAS: Record<string, string> = {
  // Map
  "프로젝트 지도": "project map",
  "project map": "project map",

  // Area details
  "영역 상세": "area details",
  "영역별 상세": "area details",
  "area details": "area details",
  "area detail": "area details",

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
  currentStageTitle?: string;
  rawTokens?: Token[];
}

export interface AreaDetailSubsection {
  subheading: string;
  html: string;
  rawText: string;
}

export interface AreaDetail {
  title: string;
  normalizedKey: string;
  subsections: AreaDetailSubsection[];
  summaryText?: string;
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
  let currentStageTitle: string | undefined = undefined;

  const flushGroup = () => {
    if (currentRail && currentGroup) {
      const isCurrentStage = isCurrentStageHeading(currentGroup.title);
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
    currentStageTitle,
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

/** Render Native HTML Map */
export function renderNativeMap(
  parsedMap: ParsedMap,
  selectedAreaId: string | null = null
): string {
  let html = `<div class="native-project-map">`;

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
          // Neutral group inside trajectory
          html += `
            <div class="trajectory-group neutral-group">
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
        }
      }
      html += `</div>`;
    } else {
      // Neutral rail: clean horizontal grid of groups
      html += `<div class="neutral-groups-container">`;
      for (const group of rail.groups) {
        html += `
          <div class="neutral-group">
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
      }
      html += `</div>`;
    }

    html += `</section>`;
  }

  html += `</div>`;
  return html;
}
