import MarkdownIt from "markdown-it";
export const md = new MarkdownIt({ html: true, linkify: true });
export const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;
/** Korean & English heading text → canonical slot key */
export const HEADING_ALIAS = {
    // Map
    "프로젝트 지도": "project map",
    "project map": "project map",
    // Area details
    "영역 상세": "area details",
    "영역별 상세": "area details",
    "area details": "area details",
    "area detail": "area details",
    // Overview Panel
    "현재 집중": "current focus",
    "현재의 집중": "current focus",
    "current focus": "current focus",
    "focus": "current focus",
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
export function normalizeHeading(tokens) {
    const raw = tokens
        .filter((t) => t.type === "inline")
        .map((t) => t.content.trim().toLowerCase())
        .join(" ")
        .replace(/\s+/g, " ");
    return HEADING_ALIAS[raw] ?? raw;
}
export function normalizeKey(str) {
    return str
        .replace(/[*_~`#[\]\\()]/g, "")
        .replace(/[\s—\-:·]/g, "")
        .toLowerCase()
        .trim();
}
/** Dedicated safe title normalization for deterministic map ↔ detail matching */
export function normalizeTitle(str) {
    if (!str)
        return "";
    return str
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}
export function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function renderTokens(tokens) {
    return md.renderer.render(tokens, md.options, {});
}
export function withMermaidPlaceholders(html) {
    return html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_m, src) => {
        const attr = src.replace(/"/g, "&quot;");
        return `<div class="mermaid" data-src="${attr}">${src}</div>`;
    });
}
/** Split top-level token stream into sections keyed by normalized h2 heading text. */
export function splitSections(tokens) {
    const sections = new Map();
    let title = "";
    let key = null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.level === 0 && t.type === "heading_open" && t.tag === "h1") {
            if (!title) {
                title = tokens[i + 1]?.content.trim() ?? "";
                key = null;
            }
            else if (key) {
                key = `__h1:${normalizeHeading([tokens[i + 1]])}`;
                if (!sections.has(key))
                    sections.set(key, []);
            }
            else {
                i += 2;
                continue;
            }
            i += 2;
        }
        else if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
            key = normalizeHeading([tokens[i + 1]]);
            if (!sections.has(key))
                sections.set(key, []);
            i += 2;
        }
        else if (key) {
            sections.get(key).push(t);
        }
    }
    return { title, sections };
}
/** Parse list items under an H4 heading into MapItems */
export function parseListItems(tokens, railTitle, groupTitle, isCurrentStageGroup) {
    const items = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "list_item_open") {
            let inlineToken = null;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === "list_item_close")
                    break;
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
                }
                else {
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
export function isCurrentStageHeading(rawTitle) {
    const norm = normalizeKey(rawTitle);
    return norm === "현재단계" || norm === "currentstage";
}
/** Explicit supported foundation aliases */
export function isFoundationHeading(rawTitle) {
    const norm = normalizeKey(rawTitle);
    return (norm === "확보된기반" ||
        norm === "기반" ||
        norm === "securedfoundation" ||
        norm === "foundation");
}
/** Explicit supported future aliases */
export function isFutureHeading(rawTitle) {
    const norm = normalizeKey(rawTitle);
    return (norm === "앞으로의도입경로" ||
        norm === "앞으로의경로" ||
        norm === "향후여정" ||
        norm === "향후계획" ||
        norm === "도입경로" ||
        norm === "futuretrajectory" ||
        norm === "future" ||
        norm === "roadmap" ||
        norm === "nextsteps");
}
/** Parse `## 프로젝트 지도` tokens into structured rails & groups. */
export function parseProjectMap(tokens) {
    if (!tokens || tokens.length === 0) {
        return { isNativeMap: false, rails: [] };
    }
    const hasH3 = tokens.some((t) => t.type === "heading_open" && t.tag === "h3");
    if (!hasH3) {
        return { isNativeMap: false, rails: [], rawTokens: tokens };
    }
    const rails = [];
    let currentRail = null;
    let currentGroup = null;
    let groupTokens = [];
    let hasCurrentStage = false;
    const flushGroup = () => {
        if (currentRail && currentGroup) {
            const isCurrentStage = isCurrentStageHeading(currentGroup.title);
            currentGroup.items = parseListItems(groupTokens, currentRail.title, currentGroup.title, isCurrentStage);
            currentGroup.isOrdered = groupTokens.some((t) => t.type === "ordered_list_open");
            if (isCurrentStage && currentGroup.items.length > 0) {
                hasCurrentStage = true;
            }
            currentRail.groups.push(currentGroup);
            currentGroup = null;
            groupTokens = [];
        }
    };
    const flushRail = () => {
        flushGroup();
        if (currentRail && currentRail.groups.length > 0) {
            const isTrajectory = currentRail.groups.some((g) => isCurrentStageHeading(g.title));
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
        }
        else if (t.type === "heading_open" && t.tag === "h4") {
            flushGroup();
            const groupTitle = tokens[i + 1]?.content.trim() ?? "그룹";
            currentGroup = {
                title: groupTitle,
                items: [],
            };
            groupTokens = [];
            i += 2;
        }
        else if (currentGroup) {
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
        hasCurrentStage,
        rawTokens: tokens,
    };
}
/** Parse `## 영역 상세` into AreaDetail records. */
export function parseAreaDetails(tokens) {
    const details = new Map();
    if (!tokens || tokens.length === 0)
        return details;
    let currentArea = null;
    let currentSubsection = null;
    const flushSubsection = () => {
        if (currentArea && currentSubsection) {
            const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
            const rawText = extractSectionRawText(currentSubsection.tokens);
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
        }
        else if (t.type === "heading_open" && t.tag === "h4" && currentArea) {
            flushSubsection();
            const subheading = tokens[i + 1]?.content.trim() ?? "";
            currentSubsection = {
                subheading,
                tokens: [],
            };
            i += 2;
        }
        else if (currentSubsection) {
            currentSubsection.tokens.push(t);
        }
    }
    flushArea();
    return details;
}
/** Find matching AreaDetail for a given map item by deterministic exact title equality */
export function findAreaDetail(item, areaDetails) {
    const title = typeof item === "string" ? item : item.title;
    return areaDetails.get(normalizeTitle(title));
}
/** Deterministic structural completeness check across map items, area details, and current stage */
export function checkProgressStructure(markdownOrTokens) {
    const tokens = typeof markdownOrTokens === "string"
        ? md.parse(markdownOrTokens, {})
        : markdownOrTokens;
    const { sections } = splitSections(tokens);
    const mapTokens = sections.get("project map");
    const detailTokens = sections.get("area details");
    const hasProjectMap = Boolean(mapTokens && mapTokens.length > 0);
    const hasAreaDetails = Boolean(detailTokens && detailTokens.length > 0);
    // Count Current Focus H2 sections
    let currentFocusCount = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
            const headingToken = tokens[i + 1];
            if (headingToken && normalizeHeading([headingToken]) === "current focus") {
                currentFocusCount++;
            }
        }
    }
    const parsedMap = mapTokens
        ? parseProjectMap(mapTokens)
        : { isNativeMap: false, rails: [] };
    // Count Current Stage groups per rail and gather map items
    let currentStageCount = 0;
    const mapItemTitles = [];
    const mapItemKeyCounts = new Map();
    const multiStageRailErrors = [];
    if (parsedMap.rails) {
        for (const rail of parsedMap.rails) {
            let railStageCount = 0;
            for (const group of rail.groups) {
                if (isCurrentStageHeading(group.title)) {
                    currentStageCount++;
                    railStageCount++;
                }
                for (const item of group.items) {
                    mapItemTitles.push(item.title);
                    const key = normalizeTitle(item.title);
                    mapItemKeyCounts.set(key, (mapItemKeyCounts.get(key) ?? 0) + 1);
                }
            }
            if (railStageCount > 1) {
                multiStageRailErrors.push(`Multiple '현재 단계' (Current Stage) groups found in rail '${rail.title}' (${railStageCount}). At most 1 allowed per rail.`);
            }
        }
    }
    const totalMapItems = mapItemTitles.length;
    // Parse Area Details and detect duplicates
    const areaDetails = new Map();
    const duplicateDetails = [];
    const seenDetailKeys = new Set();
    if (detailTokens && detailTokens.length > 0) {
        let currentArea = null;
        let currentSubsection = null;
        const flushSubsection = () => {
            if (currentArea && currentSubsection) {
                const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
                const rawText = extractSectionRawText(currentSubsection.tokens);
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
                }
                else {
                    seenDetailKeys.add(normKey);
                }
                currentArea = {
                    title,
                    normalizedKey: normKey,
                    subsections: [],
                };
                i += 2;
            }
            else if (t.type === "heading_open" && t.tag === "h4" && currentArea) {
                flushSubsection();
                const subheading = detailTokens[i + 1]?.content.trim() ?? "";
                currentSubsection = {
                    subheading,
                    tokens: [],
                };
                i += 2;
            }
            else if (currentSubsection) {
                currentSubsection.tokens.push(t);
            }
        }
        flushArea();
    }
    // Calculate missing items (map items without area detail)
    const missingTitles = [];
    let matchedDetails = 0;
    for (const title of mapItemTitles) {
        if (areaDetails.has(normalizeTitle(title))) {
            matchedDetails++;
        }
        else {
            missingTitles.push(title);
        }
    }
    const missingDetails = totalMapItems - matchedDetails;
    // Calculate orphan details (area details without matching map item)
    const orphanTitles = [];
    for (const [key, detail] of areaDetails.entries()) {
        if (!mapItemKeyCounts.has(key)) {
            orphanTitles.push(detail.title);
        }
    }
    const orphanDetails = orphanTitles.length;
    const errors = [];
    if (!hasProjectMap || !parsedMap.isNativeMap || totalMapItems === 0) {
        errors.push("Missing required '## 프로젝트 지도' (Project Map) surface or no map items found.");
    }
    if (!hasAreaDetails) {
        errors.push("Missing required '## 영역 상세' (Area Details) section.");
    }
    if (missingDetails > 0) {
        errors.push(`${missingDetails} map item(s) missing matching Area Detail.`);
    }
    if (orphanDetails > 0) {
        errors.push(`${orphanDetails} orphan Area Detail(s) without matching map item (title drift).`);
    }
    if (duplicateDetails.length > 0) {
        errors.push(`Duplicate Area Detail title(s) found: ${duplicateDetails.join(", ")}`);
    }
    if (currentFocusCount > 1) {
        errors.push(`Multiple '현재 집중' (Current Focus) sections found (${currentFocusCount}). At most 1 allowed.`);
    }
    for (const err of multiStageRailErrors) {
        errors.push(err);
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
        currentFocusCount,
        hasProjectMap,
        hasAreaDetails,
        errors,
    };
}
/** Format human-readable CLI report from check result */
export function formatStructuralCheckReport(result) {
    const lines = [];
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
    if (result.currentFocusCount > 0) {
        lines.push(`Current focus:   ${result.currentFocusCount}`);
    }
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
        const nonMissingErrors = result.errors.filter((e) => !e.includes("missing matching Area Detail") &&
            !e.includes("orphan Area Detail") &&
            !e.includes("Duplicate Area Detail"));
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
export function getAreaCompleteness(parsedMap, areaDetails) {
    const missingTitles = [];
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
                    }
                    else {
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
export function renderNativeMap(parsedMap, selectedAreaId = null, areaDetails) {
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
                  ${item.description
                            ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                            : ""}
                </div>
              </button>
            `;
                    }
                    html += `</div></div>`;
                }
                else if (isCurrent) {
                    html += `
            <div class="trajectory-group group-current-stage">
              <div class="group-header">
                <span class="stage-tag">NOW · 현재 단계</span>
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
                  ${item.description
                            ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                            : ""}
                </div>
              </button>
            `;
                    }
                    html += `</div></div>`;
                }
                else if (isFuture) {
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
                  ${item.description
                            ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                            : ""}
                </div>
              </button>
            `;
                    });
                    html += `</div></div>`;
                }
                else {
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
                    ${item.description
                                ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                                : ""}
                  </div>
                </button>
              `;
                        });
                        html += `</div>`;
                    }
                    else {
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
                    ${item.description
                                ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                                : ""}
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
        }
        else {
            // Neutral rail: support sequential vs peer tracks and ordered vs peer groups
            const isSequentialRail = rail.groups.length > 1 && rail.groups.every((g) => g.isOrdered);
            html += `<div class="neutral-groups-container ${isSequentialRail ? "sequential-track" : "peer-track"}">`;
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
                  ${item.description
                            ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                            : ""}
                </div>
              </button>
            `;
                    });
                    html += `</div>`;
                }
                else {
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
                  ${item.description
                            ? `<span class="card-desc">${escapeHtml(item.description)}</span>`
                            : ""}
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
/** Extract clean plain text representation preserving lists and paragraphs from token stream */
export function extractSectionRawText(tokens) {
    if (!tokens || tokens.length === 0)
        return "";
    const lines = [];
    let inBulletList = false;
    let inOrderedList = false;
    let orderIndex = 1;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "bullet_list_open") {
            inBulletList = true;
        }
        else if (t.type === "bullet_list_close") {
            inBulletList = false;
        }
        else if (t.type === "ordered_list_open") {
            inOrderedList = true;
            orderIndex = 1;
        }
        else if (t.type === "ordered_list_close") {
            inOrderedList = false;
        }
        else if (t.type === "list_item_open") {
            if (t.info) {
                orderIndex = parseInt(t.info, 10) || orderIndex;
            }
        }
        else if (t.type === "inline" && t.content.trim()) {
            const content = t.content.trim();
            if (inOrderedList) {
                lines.push(`${orderIndex}. ${content}`);
                orderIndex++;
            }
            else if (inBulletList) {
                lines.push(`- ${content}`);
            }
            else {
                lines.push(content);
            }
        }
    }
    return lines.join("\n").trim();
}
/** Format human-readable text representation of Project Map */
export function formatProjectMapText(parsedMap) {
    if (!parsedMap.rails || parsedMap.rails.length === 0) {
        if (parsedMap.rawTokens) {
            return extractSectionRawText(parsedMap.rawTokens);
        }
        return "";
    }
    const lines = [];
    for (const rail of parsedMap.rails) {
        lines.push(`### ${rail.title}`);
        for (const group of rail.groups) {
            lines.push(`#### ${group.title}`);
            if (group.isOrdered) {
                group.items.forEach((item, idx) => {
                    lines.push(`${idx + 1}. **${item.title}**${item.description ? ` — ${item.description}` : ""}`);
                });
            }
            else {
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
export function formatAreaDetailsText(areaDetails) {
    if (!areaDetails || areaDetails.size === 0)
        return "";
    const lines = [];
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
/** Shared canonical Execution Wave contract lines across all Problem Framer handoffs */
export function formatExecutionWaveContractLines() {
    return [
        "A. NOW / INDEPENDENT:",
        "   - 서로 독립적이고 shared mutation/state dependency가 없는 작업.",
        "   - 지금 성공조건을 확정할 수 있으며 동일 Execution Wave에 포함 가능.",
        "   - 병렬 실행 가능 여부를 명확히 표시한다.",
        "   - NOW task가 여러 개라면 같은 응답에서 각각 별도의 독립 executor-neutral local-agent prompt를 모두 제공한다.",
        "B. SERIAL NOW:",
        "   - bounded target과 성공조건은 지금 확정 가능하지만, 동일 semantic owner / mutation surface / shared state로 인해 병렬 실행 시 충돌 위험이 높은 작업.",
        "   - WAIT로 미루지 않는다.",
        "   - 같은 응답에서 실행 순서를 명확히 하고 각 단계의 executor-neutral local-agent prompt를 모두 제공한다.",
        "C. WAIT FOR EVIDENCE:",
        "   - 선행 task 결과에 따라 필요 여부나 semantic target/success criterion이 달라지는 경우",
        "   - consequential한 사용자 결정이 먼저 필요한 경우",
        "   - 현재 evidence만으로 bounded target을 정당하게 확정할 수 없는 경우",
        "   - 이 경우에만 실행 prompt 생성을 보류하고 무엇을 기다리는지 명시한다.",
    ];
}
/** Shared project-model admission contract across all Problem Framer handoffs */
function formatProjectModelAdmissionLines(scope = "focus") {
    const openClaimLine = scope === "area"
        ? "3. [Open-Claim Re-admission] [Falsification] Area Details의 `남은 문제`는 실행 task 목록이 아니라 fresh evidence로 재검증할 기존 claim이다. 각 항목을 task로 승격하기 전에 current implementation/runtime/proof에서 closure 및 counterevidence를 적극적으로 탐색하라. 이미 닫혔거나 defect가 아닌 항목은 제거 대상으로 판정하고, 전달된 모든 problem이 닫혔으면 NO_ACTION / NO_CHANGE를 낸다. 추론 중에는 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하라."
        : "3. [Open-Claim Re-admission] [Falsification] 전달된 `남은 문제`/`직면한 문제`/`다음 전환`의 선행조건/material limitation은 실행 task가 아니라 fresh evidence로 재검증할 claim이다. 각 항목을 task로 승격하기 전에 current implementation/runtime/proof에서 closure/counterevidence를 적극적으로 탐색하고, 추론 중에만 `STILL_OPEN`/`CLOSED`/`PROOF_GAP`/`NOT_ADMITTED` 중 정확히 하나로 분류하라.";
    return [
        "2. [Mode Selection — REFRESH vs RECONSTRUCT] 먼저 기존 mental model의 신뢰성을 평가하고 진입 모드를 선택하라.",
        "   - REFRESH: 기존 mental model의 신뢰성이 최근의 독립 evidence와 신뢰할 수 있는 provenance로 충분히 확립된 경우에만 사용한다. fresh evidence와 비교해 material semantic delta가 있는 surface만 Targeted Refresh하고, 무관한 stable surface는 보존한다.",
        "   - RECONSTRUCT: 기존 mental model의 신뢰성을 전제로 할 수 없을 때 사용한다. current authority/code/runtime/proof/relevant Git에서 독립적으로 project model을 다시 구성하고, 기존 PROGRESS는 마지막 비교 전까지 topology/architecture truth가 아닌 historical claim/comparison source로만 취급한다.",
        "   - 순서: current authority/code/runtime/proof/relevant Git → independent project reconstruction → coverage closure → claim admission/uncertainty handling → synthesis → existing PROGRESS comparison → stale/false/missing semantics의 replacement.",
        "   - 대표적인 RECONSTRUCT 조건: Cockpit first-use/최초 프로젝트 연결; 사용자가 현재 model 정확성에 의문을 제기함; 여러 stale/false claim 발견; 실제 architecture/workflow와 Project Map decomposition이 맞지 않음; 장기간 재진입으로 baseline 신뢰성이 불명확함; 기존 PROGRESS의 provenance/fidelity를 신뢰할 근거가 충분하지 않음.",
        "   - RECONSTRUCT는 모든 실행을 대체하는 기본 절차가 아니다. 신뢰성이 확립된 일반 bounded task에는 기존 Mental Model Delta Test와 Targeted Refresh를 유지한다.",
        openClaimLine,
        "4. [Positive Model Re-admission] RECONSTRUCT에서는 negative/open claim뿐 아니라 material positive model도 grandfather하지 않는다. subsystem의 존재/역할, A→B→C workflow, semantic owner, capability의 구현·검증 여부, Project Map decomposition, Current Stage는 current evidence가 다시 뒷받침할 때만 admitted한다. 코드·설정·테스트가 존재한다는 사실만으로 capability나 proof를 인정하지 않는다.",
        "5. [Coverage Closure — transient] RECONSTRUCT synthesis 전에 각 material semantic surface를 가능한 범위에서 설명하라: 실제 역할, semantic owner, 실제 entry/runtime path, consequential consumer/downstream effect, authority/intent source, 직접적인 implementation/proof evidence, relevant history가 현재 의미를 바꾸는지, 최종 model에서 represented / intentionally omitted / UNKNOWN 중 무엇인지. 모든 파일/함수 전수 inventory, coverage %, persistent table/registry/schema/DB/score는 요구하거나 만들지 않는다. 설명되지 않은 material surface가 남아 있으면 synthesis를 완료한 것으로 간주하지 않는다.",
        "6. [Project Map Escape Hatch] Focus/Area를 검토하다가 전달된 Area 또는 Project Map의 의미가 틀렸거나, semantic owner가 다른 곳에 있거나, Project Map decomposition이 실제 architecture/workflow를 왜곡하거나, root cause가 기존 boundary를 넘는다는 direct evidence가 나오면 기존 map에 억지로 맞추지 말고 RECONSTRUCT 또는 필요한 wider re-entry로 escalate하라. 기본 bounded review는 유지하되 자동으로 repository-wide audit으로 확대하지 않는다.",
    ];
}
/** Format instruction block for Current Focus Problem Framer handoff */
export function formatFocusHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "1. [Fresh Evidence 대조] 외부 capable agent는 위 전달받은 context를 최종 truth로 신뢰하지 말고, 반드시 현재 repo/runtime/SSOT의 fresh evidence와 대조하여 실제 문제를 검증하라.",
        ...formatProjectModelAdmissionLines(),
        "7. [Framing Objective] Current Focus를 Next Transition까지 전진시키기 위해 현재 시점에서 의미와 성공조건을 확정할 수 있는 bounded work를 찾는다. 현재 Focus와 무관한 작업을 단순히 task 수를 늘리기 위해 끌어오지 않는다.",
        "8. [No Problem → No Task] 현재 Focus scope에서 실제 문제가 없거나 추가 작업이 불필요하다면 무리하게 task를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "9. [Execution Wave 분류 & Local-Agent Prompts]:",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        "10. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "11. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
    ];
    return lines.join("\n");
}
/** Format instruction block for Area Review Problem Framer handoff */
export function formatAreaHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "1. [Fresh Evidence 대조] 외부 capable agent는 위 전달받은 context를 최종 truth로 신뢰하지 말고, 반드시 현재 repo/runtime/SSOT의 fresh evidence와 대조하여 선택된 영역의 실제 상태/취약점/미해결 문제를 검증하라.",
        ...formatProjectModelAdmissionLines("area"),
        "7. [Framing Objective] 선택된 Area의 실제 상태/취약점/미해결 문제를 fresh evidence로 깊게 검토하는 것이 objective다. root cause나 proof가 인접 Area를 실제로 통과한다면 필요한 범위까지 조사할 수 있으나, 임의로 프로젝트 전체 review로 확장하지 않는다.",
        "8. [No Problem → No Task] 검토 결과 해당 영역에 실제 문제가 없거나 추가 조치가 불필요하다면 무리하게 task/Wave를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "9. [Execution Wave 분류 & Local-Agent Prompts]:",
        "   - 문제가 확인되면 해당 문제를 해결하는 데 지금 확정 가능한 최대 범위까지만 Execution Wave를 구성한다.",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        "10. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "11. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
    ];
    return lines.join("\n");
}
/** Build deterministic plain-text context for external Problem Framer handoff (Current Focus) */
export function buildFocusHandoffContext(params) {
    const sections = [];
    sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);
    sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);
    if (params.situationText && params.situationText.trim()) {
        sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
    }
    if (params.nextTransitionText && params.nextTransitionText.trim()) {
        sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
    }
    if (params.facingIssuesText && params.facingIssuesText.trim()) {
        sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
    }
    if (params.projectFrameText && params.projectFrameText.trim()) {
        sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
    }
    if (params.settledDirectionText && params.settledDirectionText.trim()) {
        sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
    }
    if (params.projectMapText && params.projectMapText.trim()) {
        sections.push(`[PROJECT MAP]\n${params.projectMapText.trim()}`);
    }
    if (params.areaDetailsText && params.areaDetailsText.trim()) {
        sections.push(`[AREA CONTEXT]\n${params.areaDetailsText.trim()}`);
    }
    sections.push(formatFocusHandoffInstruction());
    return sections.join("\n\n");
}
/** Build deterministic plain-text context for external Problem Framer handoff (Selected Area Review) */
export function buildAreaHandoffContext(params) {
    const sections = [];
    sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);
    const tagParts = [params.railTitle, params.groupTitle].filter(Boolean);
    const areaHeader = tagParts.length > 0
        ? `${params.areaTitle} (${tagParts.join(" · ")})`
        : params.areaTitle;
    sections.push(`[SELECTED AREA]\n${areaHeader}`);
    if (params.areaDescription && params.areaDescription.trim()) {
        sections.push(`[AREA SUMMARY]\n${params.areaDescription.trim()}`);
    }
    if (params.areaDetail && params.areaDetail.subsections.length > 0) {
        const detailLines = [];
        for (const sub of params.areaDetail.subsections) {
            detailLines.push(`#### ${sub.subheading}`);
            detailLines.push(sub.rawText.trim());
        }
        sections.push(`[AREA DETAILS]\n${detailLines.join("\n")}`);
    }
    if (params.focusText && params.focusText.trim()) {
        sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);
    }
    if (params.situationText && params.situationText.trim()) {
        sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
    }
    if (params.nextTransitionText && params.nextTransitionText.trim()) {
        sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
    }
    if (params.facingIssuesText && params.facingIssuesText.trim()) {
        sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
    }
    if (params.projectFrameText && params.projectFrameText.trim()) {
        sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
    }
    if (params.settledDirectionText && params.settledDirectionText.trim()) {
        sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
    }
    sections.push(formatAreaHandoffInstruction());
    return sections.join("\n\n");
}
