/**
 * Semantic/domain construction owner.
 *
 * Owns Project Map construction, Area Detail construction, and root
 * PROGRESS document construction. Consumes the Markdown structural layer
 * (`./markdown-structure.js`) and the authoring grammar
 * (`./authoring-grammar.js`) to build the explicit Cockpit domain model
 * (`./domain.js`). Produces presentation-free data only: no Token, no
 * rendered HTML, no tone. HTML/tone derivation lives in
 * `./inspector-projection.js`; structural validation lives in
 * `./structural-check.js`.
 *
 * Overview sections (situation / next / facing / recent / focus / frame /
 * settled) are intentionally NOT structured sub-ontologies here. They are
 * plain-text sections rendered directly from Tokens; this module owns no
 * Horizon/Stage/Posture/Frontier/Thread/Movement parsers and no relation
 * graph.
 */
import { extractSectionRawText, md, splitSections, } from "./markdown-structure.js";
import { isCurrentStageHeading, normalizeKey, normalizeTitle, } from "./authoring-grammar.js";
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
                items.push({
                    id,
                    title,
                    description,
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
export function parseProjectMap(tokens) {
    if (!tokens || tokens.length === 0) {
        return { isNativeMap: false, rails: [], fallbackText: "" };
    }
    const hasH3 = tokens.some((t) => t.type === "heading_open" && t.tag === "h3");
    if (!hasH3) {
        return { isNativeMap: false, rails: [], fallbackText: extractSectionRawText(tokens) };
    }
    const rails = [];
    let currentRail = null;
    let currentGroup = null;
    let groupTokens = [];
    let hasCurrentStage = false;
    const flushGroup = () => {
        if (currentRail && currentGroup) {
            const isCurrentStage = isCurrentStageHeading(currentGroup.title);
            const items = parseListItems(groupTokens, currentRail.title, currentGroup.title, isCurrentStage);
            const isOrdered = groupTokens.some((t) => t.type === "ordered_list_open");
            if (isCurrentStage && items.length > 0) {
                hasCurrentStage = true;
            }
            currentRail.groups.push({ title: currentGroup.title, items, isOrdered });
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
        return { isNativeMap: false, rails: [], fallbackText: extractSectionRawText(tokens) };
    }
    return {
        isNativeMap: true,
        rails,
        hasCurrentStage,
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
            const rawText = extractSectionRawText(currentSubsection.tokens);
            currentArea.subsections.push({
                subheading: currentSubsection.subheading,
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
/**
 * High-level production entrypoint: Markdown/string -> parsed Cockpit document.
 * Title + map + area details. Overview sections stay as plain-text Tokens
 * owned by the structural layer and rendered directly by the viewer shell.
 */
export function parseDocument(markdown) {
    const tokens = md.parse(markdown, {});
    const { title, sections } = splitSections(tokens);
    return {
        title,
        map: parseProjectMap(sections.get("project map") ?? []),
        areaDetails: parseAreaDetails(sections.get("area details") ?? []),
    };
}
