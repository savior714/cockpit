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
  hasProjectMap: boolean;
  hasAreaDetails: boolean;
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

  const parsedMap = mapTokens
    ? parseProjectMap(mapTokens)
    : { isNativeMap: false, rails: [] };

  // Count Current Stage groups and gather map items
  let currentStageCount = 0;
  const mapItemTitles: string[] = [];
  const mapItemKeyCounts = new Map<string, number>();

  if (parsedMap.rails) {
    for (const rail of parsedMap.rails) {
      for (const group of rail.groups) {
        if (isCurrentStageHeading(group.title)) {
          currentStageCount++;
        }
        for (const item of group.items) {
          mapItemTitles.push(item.title);
          const key = normalizeTitle(item.title);
          mapItemKeyCounts.set(key, (mapItemKeyCounts.get(key) ?? 0) + 1);
        }
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
  if (currentStageCount > 1) {
    errors.push(
      `Multiple '현재 단계' (Current Stage) groups found (${currentStageCount}). At most 1 allowed across all rails.`
    );
  }

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
    hasProjectMap,
    hasAreaDetails,
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
  areaDetails?: Map<string, AreaDetail>
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
