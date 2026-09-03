import MarkdownIt from "markdown-it";
export const md = new MarkdownIt({ html: true, linkify: true });
export const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;
/** Korean & English heading text → canonical slot key */
export const HEADING_ALIAS = {
    // Map
    "프로젝트 지도": "project map",
    "project map": "project map",
    // Mental-model-first top-level surfaces
    "프로젝트 지평": "project horizon",
    "project horizon": "project horizon",
    "단계 여정": "stage journey",
    "stage journey": "stage journey",
    "프로젝트 상태": "project posture",
    "project posture": "project posture",
    "project posture axes": "project posture",
    "현재 최전선": "current frontier",
    "current frontier": "current frontier",
    "전략적 흐름": "strategic threads",
    "strategic threads": "strategic threads",
    "최근 실질적 변화": "recent material movement",
    "recent material movement": "recent material movement",
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
const STAGE_ENTRY_CONDITION_LABELS = ["진입 조건", "개시 조건", "entry condition", "opens when"];
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
                tone: classifySubsectionTone(currentSubsection.subheading, rawText),
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
 * Conservative veto for evidence promotion.
 * Returns true only when the ENTIRE subsection content clearly states that no
 * verifiable evidence exists yet (absent / unverified / planned-only).
 * Phrase-level anchored matching only: the whole normalized line must be a
 * placeholder phrase. A single concrete evidence clause anywhere keeps the
 * subsection at evidence, so mixed "concrete evidence + future plan" content
 * is never demoted by a broad substring rule.
 */
function isClearlyUnverifiedOrPlannedEvidence(cleanText) {
    if (cleanText === "")
        return true;
    const lines = cleanText
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim())
        .filter(Boolean);
    if (lines.length === 0)
        return true;
    return lines.every((line) => {
        const withoutLabel = line
            .replace(/^(?:근거|증거|evidence|proof)\s*[:：]\s*/i, "")
            .trim();
        const core = withoutLabel.replace(/[.．。;；!！]+$/, "").trim();
        if (!core)
            return true;
        // Korean absent / unverified — whole-line anchored only.
        if (/^(?:없음|해당\s*없음|아직\s*없음|아직\s*근거\s*없음|근거\s*없음|증거\s*없음|근거\s*미확보|미확인|미검증|미작성|미수립|예정|향후\s*과제|추후\s*과제|향후\s*작업|추후\s*작업)$/.test(core)) {
            return true;
        }
        // Korean planned-only — whole-line anchored only.
        if (/^(?:아직\s*|추가\s*|추후\s*|향후\s*)?(?:테스트|검증|확인|작성|수립|확보|측정)\s*예정(?:입니다|임)?$/.test(core)) {
            return true;
        }
        if (/^추후\s*(?:테스트|검증|확인|작성|수립|확보|측정)(?:\s*예정)?$/.test(core)) {
            return true;
        }
        if (/^(?:아직\s*|추가\s*|추후\s*)?(?:테스트|검증|확인|작성)\s*(?:필요|요망|요구)(?:함|입니다|임)?$/.test(core)) {
            return true;
        }
        // English absent / unverified — whole-line anchored only.
        if (/^(?:none|no\s*evidence|not\s*verified|not\s*proven|unverified|unconfirmed|unknown|tbd|n\/a|planned|future\s*work|future-work)$/i.test(core)) {
            return true;
        }
        // English planned / required — whole-line anchored only.
        if (/^(?:verification|confirmation|test(?:s|ing)?)\s*(?:required|needed|pending|planned)$/i.test(core)) {
            return true;
        }
        if (/^(?:pending(?:\s*(?:verification|confirmation|test|testing))?|to\s*be\s*(?:verified|confirmed|tested)|awaiting\s*(?:verification|confirmation|test|testing)?)$/i.test(core)) {
            return true;
        }
        return false;
    });
}
/**
 * Canonical semantic tone classifier for Universal Inspector subsections.
 * Resolves deterministic visual tone based on semantic role and concrete content state.
 */
export function classifySubsectionTone(subheading, rawText, contextState) {
    const normKey = normalizeKey(subheading);
    const cleanText = (rawText || "").trim();
    const firstLine = cleanText
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
        .filter(Boolean)[0] ?? "";
    // 1. Explicitly closed, resolved, empty, or 'none' states:
    // Must NOT be classified as danger even if subheading is "남은 문제" / "remaining issues"
    const isExplicitlyClosedOrNone = cleanText === "" ||
        /^(?:없음|해당\s*없음|해결됨|완료됨|닫힘|특이\s*사항\s*없음|none|n\/a|closed|resolved|all\s+resolved|no\s+remaining\s+issues?|no\s+issues?)\.?$/i.test(firstLine) ||
        /^(?:남은\s*문제|remaining\s*issues?)\s*[:：]\s*(?:없음|해당\s*없음|none|n\/a|closed|해결됨)\.?$/i.test(firstLine);
    // 2. Evidence / Proof verification:
    // Must NOT claim positive/evidence state without actual supporting content.
    // UNKNOWN, unverified, or empty evidence remains neutral.
    const isEvidenceHeading = normKey.includes("근거") ||
        normKey.includes("증거") ||
        normKey.includes("evidence") ||
        normKey.includes("proof");
    if (isEvidenceHeading) {
        if (isClearlyUnverifiedOrPlannedEvidence(cleanText)) {
            return "neutral";
        }
        return "evidence";
    }
    // 3. Unresolved issues / blockers (Danger):
    const isIssueHeading = normKey.includes("남은문제") ||
        normKey.includes("직면한문제") ||
        normKey.includes("막힌것") ||
        normKey.includes("remainingissues") ||
        normKey.includes("remaining") ||
        normKey.includes("blocker") ||
        normKey.includes("issues") ||
        normKey.includes("남은과제");
    if (isIssueHeading) {
        if (isExplicitlyClosedOrNone) {
            return "neutral";
        }
        return "danger";
    }
    // 4. Transitions / Entry conditions / In-progress conditions (Active):
    const isActiveHeading = normKey.includes("진입조건") ||
        normKey.includes("개시조건") ||
        normKey.includes("entrycondition") ||
        normKey.includes("openswhen") ||
        normKey.includes("다음전환") ||
        normKey.includes("nexttransition") ||
        normKey.includes("전환") ||
        normKey.includes("transition") ||
        normKey.includes("왜지금") ||
        normKey.includes("whynow") ||
        normKey.includes("단계영향") ||
        normKey.includes("stageimpact") ||
        normKey === "before" ||
        normKey === "materialchange" ||
        normKey === "after" ||
        normKey.includes("변경");
    if (isActiveHeading) {
        return "active";
    }
    // Context-level active state if entity is explicitly in-progress
    if (contextState) {
        const normState = normalizeKey(contextState);
        if (normState.includes("inproof") ||
            normState.includes("inreview") ||
            normState.includes("partial")) {
            if (normKey.includes("조건") || normKey.includes("condition")) {
                return "active";
            }
        }
    }
    // 5. Explicitly closed boundaries:
    if (normKey.includes("이미닫힌") ||
        normKey.includes("closedboundaries") ||
        normKey.includes("closed")) {
        return "neutral";
    }
    // 6. Neutral fallback (Meaning, Current Level, Info, Custom subsections)
    return "neutral";
}
const MATURITY_STATE_ALIASES = {
    STRONG: "STRONG",
    "강함": "STRONG",
    "강한": "STRONG",
    PARTIAL: "PARTIAL",
    "부분": "PARTIAL",
    "부분적": "PARTIAL",
    WEAK: "WEAK",
    "약함": "WEAK",
    UNKNOWN: "UNKNOWN",
    "미확인": "UNKNOWN",
    "알 수 없음": "UNKNOWN",
};
const STAGE_GATE_STATES = [
    "CLOSED",
    "IN PROOF",
    "NOT OPEN",
    "OPEN",
    "IN REVIEW",
    "PROVEN",
    "NOT PROVEN",
    "UNKNOWN",
    "BLOCKED",
];
function parseHeadingBlocks(tokens, tag = "h3") {
    const blocks = [];
    if (!tokens || tokens.length === 0)
        return blocks;
    let current = null;
    const flush = () => {
        if (current)
            blocks.push(current);
        current = null;
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === "heading_open" && token.tag === tag) {
            flush();
            current = {
                title: tokens[i + 1]?.content.trim() ?? "",
                tokens: [],
            };
            i += 2;
        }
        else if (current) {
            current.tokens.push(token);
        }
    }
    flush();
    return blocks;
}
function splitSemanticContent(tokens) {
    const leadTokens = [];
    const subsections = [];
    let currentSubsection = null;
    const flushSubsection = () => {
        if (!currentSubsection)
            return;
        const html = withMermaidPlaceholders(renderTokens(currentSubsection.tokens));
        const rawText = extractSectionRawText(currentSubsection.tokens);
        subsections.push({
            subheading: currentSubsection.subheading,
            html,
            rawText,
            tone: classifySubsectionTone(currentSubsection.subheading, rawText),
        });
        currentSubsection = null;
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === "heading_open" && token.tag === "h4") {
            flushSubsection();
            currentSubsection = {
                subheading: tokens[i + 1]?.content.trim() ?? "",
                tokens: [],
            };
            i += 2;
        }
        else if (currentSubsection) {
            currentSubsection.tokens.push(token);
        }
        else {
            leadTokens.push(token);
        }
    }
    flushSubsection();
    const leadText = extractSectionRawText(leadTokens);
    const rawText = extractSectionRawText(tokens);
    const html = withMermaidPlaceholders(renderTokens(tokens));
    return {
        leadTokens,
        leadText,
        html,
        rawText,
        summaryText: firstSemanticSentence(leadText || rawText),
        subsections,
        relations: parseRelations(rawText),
    };
}
function stripInlineMarkup(value) {
    return value
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
        .trim();
}
function firstSemanticSentence(value) {
    const lines = value
        .split(/\r?\n/)
        .map((line) => stripInlineMarkup(line.replace(/^\s*[-*+]\s+/, "")))
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !isSemanticMetadataLine(line));
    return lines[0] ?? "";
}
function isSemanticMetadataLine(line) {
    return /^(?:역할|role|관련\s*(?:영역|단계|상태|축|최전선|변화)|related\s+(?:areas?|stage|posture|frontier|movements?)|진입\s*조건|개시\s*조건|entry\s+condition|opens\s+when|현재|목표|이전|이후|변경|before|after|change|target|from|to)\s*:/i.test(line) || /^(?:STRONG|PARTIAL|WEAK|UNKNOWN|BLOCKED|CLOSED|IN PROOF|NOT OPEN|OPEN)$/i.test(line);
}
function parseRelations(rawText) {
    const relations = [];
    const rules = [
        {
            kind: "area",
            pattern: /^(?:관련\s*영역|related\s+areas?|related\s+area)\s*[:：]\s*(.+)$/i,
        },
        {
            kind: "stage",
            pattern: /^(?:관련\s*단계|related\s+stage)\s*[:：]\s*(.+)$/i,
        },
        {
            kind: "posture",
            pattern: /^(?:관련\s*(?:상태|축)|related\s+posture)\s*[:：]\s*(.+)$/i,
        },
        {
            kind: "frontier",
            pattern: /^(?:관련\s*(?:최전선|프론티어)|related\s+frontier)\s*[:：]\s*(.+)$/i,
        },
        {
            kind: "movement",
            pattern: /^(?:관련\s*(?:변화|흐름)|related\s+movements?|related\s+movement)\s*[:：]\s*(.+)$/i,
        },
    ];
    for (const rawLine of rawText.split(/\r?\n/)) {
        const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, ""));
        if (!line)
            continue;
        for (const rule of rules) {
            const match = rule.pattern.exec(line);
            if (!match)
                continue;
            for (const target of splitRelationTargets(match[1])) {
                if (!target)
                    continue;
                if (!relations.some((relation) => relation.kind === rule.kind && relation.target === target)) {
                    relations.push({ kind: rule.kind, target });
                }
            }
            break;
        }
    }
    return relations;
}
function splitRelationTargets(value) {
    return value
        .split(/\s*,\s*|\s+및\s+|\s+and\s+/i)
        .map((target) => stripInlineMarkup(target).replace(/[.;]+$/, "").trim())
        .filter(Boolean);
}
function parseMaturityState(value) {
    const clean = stripInlineMarkup(value).trim().toUpperCase();
    return MATURITY_STATE_ALIASES[clean] ?? null;
}
function parseHeadingState(rawHeading) {
    const heading = stripInlineMarkup(rawHeading).trim();
    const match = /^(.*?)\s+(?:—|–|-)\s*([A-Za-z가-힣][A-Za-z가-힣 ]*)\s*$/.exec(heading);
    if (!match) {
        return { title: heading, state: null, declaredState: "" };
    }
    const declaredState = match[2].trim();
    return {
        title: match[1].trim(),
        state: parseMaturityState(declaredState),
        declaredState,
    };
}
function parseStateLine(rawText) {
    for (const rawLine of rawText.split(/\r?\n/)) {
        const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, "")).trim();
        if (!line)
            continue;
        const state = parseMaturityState(line);
        if (state)
            return { state, declaredState: line };
        if (/^BLOCKED$/i.test(line))
            return { state: null, declaredState: line };
    }
    return { state: null, declaredState: "" };
}
function parseStageStateLine(rawText) {
    for (const rawLine of rawText.split(/\r?\n/)) {
        const line = stripInlineMarkup(rawLine.replace(/^\s*[-*+]\s+/, "")).trim();
        if (!line)
            continue;
        const match = STAGE_GATE_STATES.find((state) => state.toLowerCase() === line.toLowerCase());
        if (match)
            return match;
    }
    return "";
}
function extractLabeledValue(rawText, labels) {
    const labelPattern = labels
        .map((label) => label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"))
        .join("|");
    const pattern = new RegExp(`^(?:[-*+]\\s*)?(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");
    for (const rawLine of rawText.split(/\r?\n/)) {
        const line = stripInlineMarkup(rawLine).trim();
        const match = pattern.exec(line);
        if (match)
            return match[1].trim();
    }
    return "";
}
function parseArrowTransition(value) {
    const match = /([^\n→>-]{1,80}?)\s*(?:→|->)\s*([^\n]{1,120})/.exec(stripInlineMarkup(value));
    if (!match)
        return null;
    const before = match[1].replace(/^[-*+:\s]+/, "").trim();
    const after = match[2].replace(/[.;]+$/, "").trim();
    if (!before || !after)
        return null;
    return { before, after };
}
function subsectionText(subsections, labels) {
    return (subsections.find((subsection) => labels.some((label) => normalizeKey(subsection.subheading).includes(normalizeKey(label))))?.rawText ?? "");
}
function isStageBlockerText(rawText) {
    const marker = /stage[-\s]*blocker|단계\s*blocker/i;
    for (const rawLine of rawText.split(/\r?\n/)) {
        if (!marker.test(rawLine))
            continue;
        if (/(?:아님|아니다|아니며|없음|해당\s*없|no|false|not|does\s+not|doesn't)/i.test(rawLine)) {
            continue;
        }
        return true;
    }
    return false;
}
function parsePostureRole(title, rawText) {
    const roleLine = extractLabeledValue(rawText, ["역할", "role"]);
    const role = stripInlineMarkup(roleLine).toUpperCase();
    if (/CORE\s*(?:CAPABILITY|PRODUCT|VIEWER)/i.test(role))
        return "core-capability";
    if (/(?:DELIVERY|STAGE|RELEASE|ADOPTION)\s*(?:READINESS|READY)/i.test(role)) {
        return "delivery-readiness";
    }
    const normalizedTitle = stripInlineMarkup(title).toLowerCase();
    if (/core\s*(?:capability|product|viewer)|핵심\s*(?:역량|제품|뷰어)/i.test(normalizedTitle)) {
        return "core-capability";
    }
    if (/(?:delivery|stage|release|adoption)\s*readiness|출하\s*준비|단계\s*준비/i.test(normalizedTitle)) {
        return "delivery-readiness";
    }
    return undefined;
}
function parseStageSegmentTitle(rawHeading) {
    const heading = stripInlineMarkup(rawHeading).trim();
    const match = /^(현재|다음|current|next)\s*(?:—|–|:|-)?\s*(.*)$/i.exec(heading);
    if (!match)
        return { role: "other", title: heading };
    const role = /^(현재|current)$/i.test(match[1]) ? "current" : "next";
    return { role, title: match[2].trim() || heading };
}
function parseStageGateLine(rawLine) {
    const line = stripInlineMarkup(rawLine).replace(/^\s*[-*+]\s+/, "").trim();
    const statePattern = STAGE_GATE_STATES.map((state) => state.replace(/ /g, "\\s+")).join("|");
    const leading = new RegExp(`^(${statePattern})\\s*(?:—|–|->|:|-)\\s*(.+)$`, "i").exec(line);
    if (leading)
        return { title: leading[2].trim(), state: leading[1].replace(/\s+/g, " ").toUpperCase() };
    const trailing = new RegExp(`^(.+?)\\s*(?:—|–|->|:)\\s*(${statePattern})$`, "i").exec(line);
    if (trailing)
        return { title: trailing[1].trim(), state: trailing[2].replace(/\s+/g, " ").toUpperCase() };
    return { title: line, state: "" };
}
function parseStageGateList(tokens, segmentTitle) {
    const gates = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== "list_item_open")
            continue;
        let end = i + 1;
        while (end < tokens.length && tokens[end].type !== "list_item_close")
            end++;
        const inline = tokens.slice(i + 1, end).find((candidate) => candidate.type === "inline");
        if (!inline)
            continue;
        const parsed = parseStageGateLine(inline.content);
        const rawText = extractSectionRawText(tokens.slice(i + 1, end));
        gates.push({
            title: parsed.title,
            state: parsed.state,
            summaryText: firstSemanticSentence(rawText),
            entryCondition: extractLabeledValue(rawText, STAGE_ENTRY_CONDITION_LABELS) || undefined,
            html: withMermaidPlaceholders(renderTokens(tokens.slice(i + 1, end))),
            rawText,
            subsections: [],
            relations: parseRelations(rawText),
            isStageBlocker: isStageBlockerText(rawText) || isStageBlockerText(segmentTitle),
        });
    }
    return gates;
}
export function parseProjectHorizon(tokens, isLegacyFallback = false) {
    if (!tokens || tokens.length === 0)
        return undefined;
    const content = splitSemanticContent(tokens);
    return {
        title: isLegacyFallback ? "현재 상황" : "프로젝트 지평",
        html: content.html,
        rawText: content.rawText,
        summaryText: content.summaryText,
        isLegacyFallback,
    };
}
export function parseStageJourney(tokens) {
    if (!tokens || tokens.length === 0)
        return undefined;
    const segments = [];
    for (const block of parseHeadingBlocks(tokens, "h3")) {
        const segmentInfo = parseStageSegmentTitle(block.title);
        const content = splitSemanticContent(block.tokens);
        let gates = parseStageGateList(block.tokens, segmentInfo.title);
        if (gates.length === 0) {
            const stateLine = parseStateLine(content.rawText);
            const stageState = parseStageStateLine(content.rawText);
            gates = [
                {
                    title: segmentInfo.title,
                    state: stageState || stateLine.declaredState,
                    summaryText: content.summaryText,
                    entryCondition: extractLabeledValue(content.rawText, STAGE_ENTRY_CONDITION_LABELS) || undefined,
                    html: content.html,
                    rawText: content.rawText,
                    subsections: content.subsections,
                    relations: content.relations,
                    isStageBlocker: isStageBlockerText(content.rawText),
                },
            ];
        }
        segments.push({
            role: segmentInfo.role,
            title: segmentInfo.title,
            html: content.html,
            rawText: content.rawText,
            gates,
        });
    }
    const current = segments.find((segment) => segment.role === "current");
    const next = segments.find((segment) => segment.role === "next");
    return {
        segments,
        currentStage: current?.title,
        nextStage: next?.title,
        currentGates: current?.gates ?? [],
        nextGates: next?.gates ?? [],
        rawText: extractSectionRawText(tokens),
    };
}
export function parseProjectPosture(tokens) {
    if (!tokens || tokens.length === 0)
        return undefined;
    const axes = [];
    for (const block of parseHeadingBlocks(tokens, "h3")) {
        const heading = parseHeadingState(block.title);
        const content = splitSemanticContent(block.tokens);
        const bodyState = parseStateLine(content.rawText);
        const state = heading.state ?? bodyState.state;
        const declaredState = heading.declaredState || bodyState.declaredState;
        axes.push({
            title: heading.title,
            state,
            declaredState,
            role: parsePostureRole(heading.title, content.rawText),
            summaryText: firstSemanticSentence(content.leadText || content.rawText),
            html: content.html,
            rawText: content.rawText,
            subsections: content.subsections,
            relations: content.relations,
            isStageBlocker: isStageBlockerText(content.rawText),
        });
    }
    return { axes, rawText: extractSectionRawText(tokens) };
}
function parseFrontierRole(rawHeading) {
    const heading = stripInlineMarkup(rawHeading).trim();
    const coPrimary = /^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선)\]\s*/i.test(heading);
    const primary = /^\s*\[(?:PRIMARY|주요\s*최전선)\]\s*/i.test(heading);
    const secondary = /^\s*\[(?:SECONDARY|보조)\]\s*/i.test(heading);
    const title = heading.replace(/^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선|PRIMARY|주요\s*최전선|SECONDARY|보조)\]\s*/i, "").trim();
    return { title, isPrimary: coPrimary || primary || !secondary, isCoPrimary: coPrimary };
}
export function parseCurrentFrontiers(tokens) {
    if (!tokens || tokens.length === 0)
        return [];
    const blocks = parseHeadingBlocks(tokens, "h3");
    const frontiers = [];
    for (const block of blocks) {
        const role = parseFrontierRole(block.title);
        const content = splitSemanticContent(block.tokens);
        const transition = parseArrowTransition(content.rawText) ?? parseArrowTransition(block.title);
        const currentState = extractLabeledValue(content.rawText, ["현재", "current", "from"]) || transition?.before || "";
        const targetState = extractLabeledValue(content.rawText, ["목표", "target", "to"]) || transition?.after || "";
        frontiers.push({
            title: role.title,
            currentState,
            targetState,
            whyNow: subsectionText(content.subsections, ["왜 지금", "why now"]),
            successMeaning: subsectionText(content.subsections, ["완료 의미", "success", "성공"]),
            stageImpact: subsectionText(content.subsections, ["단계 영향", "stage impact"]),
            closedBoundaries: subsectionText(content.subsections, ["이미 닫힌", "closed"]),
            evidence: subsectionText(content.subsections, ["근거", "evidence"]),
            summaryText: content.summaryText,
            html: content.html,
            rawText: content.rawText,
            subsections: content.subsections,
            relations: content.relations,
            isPrimary: role.isPrimary,
            isCoPrimary: role.isCoPrimary,
        });
    }
    return frontiers;
}
export function parseStrategicThreads(tokens) {
    if (!tokens || tokens.length === 0)
        return [];
    return parseHeadingBlocks(tokens, "h3").map((block) => {
        const heading = parseHeadingState(block.title);
        const content = splitSemanticContent(block.tokens);
        const bodyState = parseStateLine(content.rawText);
        return {
            title: heading.title,
            state: heading.declaredState || bodyState.declaredState,
            summaryText: content.summaryText,
            html: content.html,
            rawText: content.rawText,
            subsections: content.subsections,
            relations: content.relations,
        };
    });
}
export function parseMaterialMovements(tokens) {
    if (!tokens || tokens.length === 0)
        return [];
    return parseHeadingBlocks(tokens, "h3").map((block) => {
        const content = splitSemanticContent(block.tokens);
        const transition = parseArrowTransition(content.rawText) ?? parseArrowTransition(block.title);
        const before = extractLabeledValue(content.rawText, ["이전", "before", "from"]) || transition?.before || "";
        const after = extractLabeledValue(content.rawText, ["이후", "after", "to"]) || transition?.after || "";
        const change = extractLabeledValue(content.rawText, ["변경", "material change", "change"]) || firstSemanticSentence(content.leadText) || stripInlineMarkup(block.title);
        const title = stripInlineMarkup(block.title).replace(/\s*(?:—|–|-)\s*[^—–>-]+\s*(?:→|->)\s*[^\n]+$/, "").trim();
        return {
            title: title || stripInlineMarkup(block.title),
            before,
            change,
            after,
            summaryText: content.summaryText,
            html: content.html,
            rawText: content.rawText,
            subsections: content.subsections,
            relations: content.relations,
            hasStateTransition: Boolean(before && after),
        };
    });
}
function sectionWithFallback(sections, canonical, legacy = []) {
    const canonicalTokens = sections.get(canonical);
    if (canonicalTokens && canonicalTokens.length > 0) {
        return { tokens: canonicalTokens, isLegacyFallback: false };
    }
    for (const legacyKey of legacy) {
        const legacyTokens = sections.get(legacyKey);
        if (legacyTokens && legacyTokens.length > 0) {
            return { tokens: legacyTokens, isLegacyFallback: true };
        }
    }
    return { isLegacyFallback: false };
}
export function parseMentalModel(sections) {
    const horizon = sectionWithFallback(sections, "project horizon", ["current situation"]);
    const movement = sectionWithFallback(sections, "recent material movement", ["recently completed"]);
    return {
        horizon: parseProjectHorizon(horizon.tokens, horizon.isLegacyFallback),
        stageJourney: parseStageJourney(sections.get("stage journey")),
        posture: parseProjectPosture(sections.get("project posture")),
        frontiers: parseCurrentFrontiers(sections.get("current frontier")),
        strategicThreads: parseStrategicThreads(sections.get("strategic threads")),
        movements: parseMaterialMovements(movement.tokens),
    };
}
function findTopLevelTelemetry(rawText) {
    const findings = [];
    if (/\b[0-9a-f]{40}\b/i.test(rawText))
        findings.push("a full Git SHA");
    if (/\bPID\s+\d+\b/i.test(rawText))
        findings.push("an explicit PID");
    if (/::test_[A-Za-z0-9_.-]+/.test(rawText))
        findings.push("a pytest-style test node");
    if (/(?:^|[\s(`])\/(?:Users|home|private|workspace|tmp|var)\/[^\s`)>]+/i.test(rawText)) {
        findings.push("an absolute implementation path");
    }
    return findings;
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
    const mentalModel = parseMentalModel(sections);
    const hasProjectHorizon = Boolean(sections.get("project horizon") && sections.get("project horizon").length > 0);
    const hasStageJourney = Boolean(sections.get("stage journey") && sections.get("stage journey").length > 0);
    const hasProjectPosture = Boolean(sections.get("project posture") && sections.get("project posture").length > 0);
    const hasStrategicThreads = Boolean(sections.get("strategic threads") && sections.get("strategic threads").length > 0);
    const hasMaterialMovement = Boolean(sections.get("recent material movement") &&
        sections.get("recent material movement").length > 0);
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
    const postureAxes = mentalModel.posture?.axes ?? [];
    const frontiers = mentalModel.frontiers;
    const movements = mentalModel.movements;
    const primaryFrontiers = frontiers.filter((frontier) => frontier.isPrimary);
    const coPrimaryFrontiers = primaryFrontiers.filter((frontier) => frontier.isCoPrimary);
    const postureCoreCapabilityCount = postureAxes.filter((axis) => axis.role === "core-capability").length;
    const postureDeliveryReadinessCount = postureAxes.filter((axis) => axis.role === "delivery-readiness").length;
    const guardrailErrors = [];
    if (hasProjectHorizon) {
        const telemetry = findTopLevelTelemetry(mentalModel.horizon?.rawText ?? "");
        guardrailErrors.push(...telemetry.map((finding) => `Project Horizon contains ${finding}.`));
    }
    if (hasStageJourney) {
        if (!mentalModel.stageJourney || mentalModel.stageJourney.segments.length === 0) {
            guardrailErrors.push("Stage Journey must declare at least one stage segment.");
        }
        else {
            if (!mentalModel.stageJourney.currentStage) {
                guardrailErrors.push("Stage Journey must declare a '현재' (current) segment.");
            }
            if (!mentalModel.stageJourney.nextStage) {
                guardrailErrors.push("Stage Journey must declare a '다음' (next) segment.");
            }
            for (const segment of mentalModel.stageJourney.segments) {
                for (const gate of segment.gates) {
                    if (!gate.state) {
                        guardrailErrors.push(`Stage gate '${gate.title}' in '${segment.title}' is missing a declared state.`);
                    }
                }
            }
        }
    }
    if (hasProjectPosture) {
        if (postureAxes.length < 5 || postureAxes.length > 8) {
            guardrailErrors.push(`Project Posture must contain 5–8 axes; found ${postureAxes.length}.`);
        }
        if (postureCoreCapabilityCount === 0) {
            guardrailErrors.push("Project Posture must declare a Core Capability-equivalent axis or role.");
        }
        if (postureDeliveryReadinessCount === 0) {
            guardrailErrors.push("Project Posture must declare a Delivery/Stage Readiness-equivalent axis or role.");
        }
        for (const axis of postureAxes) {
            if (axis.state === null) {
                if (/^BLOCKED$/i.test(axis.declaredState)) {
                    guardrailErrors.push(`Posture axis '${axis.title}' encodes BLOCKED as maturity; use a separate Stage Blocker marker.`);
                }
                else {
                    guardrailErrors.push(`Posture axis '${axis.title}' must declare one of STRONG, PARTIAL, WEAK, or UNKNOWN.`);
                }
            }
        }
    }
    if (sections.get("current frontier") && sections.get("current frontier").length > 0) {
        if (primaryFrontiers.length === 0) {
            guardrailErrors.push("Current Frontier must declare one Primary Frontier.");
        }
        if (primaryFrontiers.length > 1 &&
            (coPrimaryFrontiers.length !== primaryFrontiers.length ||
                coPrimaryFrontiers.length < 2)) {
            guardrailErrors.push("Multiple Primary Frontiers require an explicit [CO-PRIMARY] marker on every primary entry.");
        }
        for (const frontier of frontiers) {
            if (!frontier.currentState || !frontier.targetState) {
                guardrailErrors.push(`Frontier '${frontier.title}' must declare a current and target state transition.`);
            }
        }
    }
    if (hasMaterialMovement) {
        if (movements.length === 0) {
            guardrailErrors.push("Recent Material Movement must contain at least one movement entry.");
        }
        for (const movement of movements) {
            if (!movement.hasStateTransition) {
                guardrailErrors.push(`Material movement '${movement.title}' must declare a before → after state transition.`);
            }
        }
    }
    const relationTargets = {
        area: new Set(mapItemTitles.map((title) => normalizeTitle(title))),
        stage: new Set(),
        posture: new Set(postureAxes.map((axis) => normalizeTitle(axis.title))),
        frontier: new Set(frontiers.map((frontier) => normalizeTitle(frontier.title))),
        movement: new Set(movements.map((movement) => normalizeTitle(movement.title))),
    };
    const stageJourney = mentalModel.stageJourney;
    if (stageJourney) {
        for (const segment of stageJourney.segments) {
            relationTargets.stage.add(normalizeTitle(segment.title));
            for (const gate of segment.gates) {
                relationTargets.stage.add(normalizeTitle(gate.title));
            }
        }
    }
    const unresolvedRelations = [];
    const validateRelations = (source, relations) => {
        for (const relation of relations) {
            if (!relationTargets[relation.kind].has(normalizeTitle(relation.target))) {
                unresolvedRelations.push(`${source} → ${relation.kind} '${relation.target}' does not resolve to a visible title.`);
            }
        }
    };
    for (const segment of stageJourney?.segments ?? []) {
        for (const gate of segment.gates)
            validateRelations(`Stage gate '${gate.title}'`, gate.relations);
    }
    for (const axis of postureAxes)
        validateRelations(`Posture '${axis.title}'`, axis.relations);
    for (const frontier of frontiers)
        validateRelations(`Frontier '${frontier.title}'`, frontier.relations);
    for (const thread of mentalModel.strategicThreads) {
        validateRelations(`Strategic Thread '${thread.title}'`, thread.relations);
    }
    for (const movement of movements)
        validateRelations(`Movement '${movement.title}'`, movement.relations);
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
    errors.push(...guardrailErrors);
    errors.push(...unresolvedRelations);
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
        hasProjectHorizon,
        hasStageJourney,
        hasProjectPosture,
        postureAxisCount: postureAxes.length,
        postureCoreCapabilityCount,
        postureDeliveryReadinessCount,
        primaryFrontierCount: primaryFrontiers.length,
        coPrimaryFrontierCount: coPrimaryFrontiers.length,
        hasStrategicThreads,
        hasMaterialMovement,
        materialMovementCount: movements.length,
        unresolvedRelations,
        guardrailErrors,
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
    if (result.hasProjectHorizon || result.hasStageJourney || result.hasProjectPosture) {
        lines.push(`Horizon:          ${result.hasProjectHorizon ? "yes" : "no"}`);
        lines.push(`Stage Journey:    ${result.hasStageJourney ? "yes" : "no"}`);
        lines.push(`Posture axes:     ${result.postureAxisCount}`);
        lines.push(`Primary frontier: ${result.primaryFrontierCount}`);
        lines.push(`Material movement:${result.materialMovementCount}`);
    }
    if (result.unresolvedRelations.length > 0) {
        lines.push(`Relations:         ${result.unresolvedRelations.length} unresolved`);
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
export function renderNativeMap(parsedMap, selectedAreaId = null, areaDetails, currentStageLabel) {
    let html = `<div class="native-project-map">`;
    const currentStageGroupCount = parsedMap.rails
        .filter((rail) => rail.railType === "trajectory")
        .reduce((count, rail) => count + rail.groups.filter((group) => isCurrentStageHeading(group.title)).length, 0);
    const showCurrentStageLabel = Boolean(currentStageLabel) && currentStageGroupCount === 1;
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
                ${showCurrentStageLabel ? `<span class="stage-id-tag">${escapeHtml(currentStageLabel ?? "")}</span>` : ""}
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
        "   - mutation owner, semantic surface, proof boundary, publication interaction이 실질적으로 독립적일 때만 병렬 실행 가능.",
        "   - 지금 성공조건을 확정할 수 있으며 동일 Execution Wave에 포함 가능.",
        "   - 단순히 동일 파일이나 디렉토리를 참조한다는 이유만으로 직렬화하지 않으며, 실제 mutation/evidence/publication boundary가 독립적이면 병렬로 분류한다.",
        "   - NOW task가 여러 개라면 같은 응답에서 각각 별도의 독립 executor-neutral local-agent prompt를 모두 제공한다.",
        "B. SERIAL NOW:",
        "   - bounded target과 성공조건은 지금 확정 가능하지만, 동일 semantic owner / mutation surface / proof boundary / publication-sensitive surface를 공유하여 병렬 admission 시 한 후보의 publication이 다른 READY candidate를 불필요하게 stale화할 위험이 높은 작업.",
        "   - READY candidate가 존재한다는 이유만으로 WAIT로 미루지 않는다.",
        "   - 같은 응답에서 실행 순서를 명확히 하고, 선행 task를 먼저 closure/publication boundary까지 진행한 뒤 다음 task를 fresh evidence에서 시작하도록 안내한다.",
        "   - 단순히 같은 파일 이름을 만진다는 이유만으로 직렬화하지 말고 실제 mutation/semantic/proof/publication boundary를 판정한다.",
        "   - 각 단계의 executor-neutral local-agent prompt를 모두 제공한다.",
        "C. WAIT FOR EVIDENCE:",
        "   - 선행 task 결과에 따라 필요 여부나 semantic target/success criterion이 달라지는 경우(선행 task 결과가 후속 target/necessity/ownership을 바꿀 때만 사용하며, READY candidate 존재만으로 WAIT 판정 금지)",
        "   - consequential한 사용자 결정이 먼저 필요한 경우",
        "   - 현재 evidence만으로 bounded target을 정당하게 확정할 수 없는 경우",
        "   - 이 경우에만 실행 prompt 생성을 보류하고 무엇을 기다리는지 명시한다.",
    ];
}
/** Shared admission freshness and publication reconciliation contract lines across all Problem Framer handoffs */
export function formatAdmissionPublicationContractLines() {
    return [
        "12. [Admission & Publication Discipline — Executor Prompt Contract]:",
        "   - [Fresh BASE Admission] Mutation-intended executor prompt에는 fresh BASE admission 조건을 명확히 전달한다: execution 직전에 `origin/main`을 fresh fetch하고 실제 시작 BASE SHA를 기록한다. task-owned workspace(worktree/branch)가 그 fresh BASE에서 시작하는지 확인하며, stale worktree HEAD나 canonical checkout의 dirty state를 BASE로 상속하지 않는다. 기록된 `ADMITTED_BASE`는 semantic work가 진행되는 동안 immutable execution basis이며, remote SHA movement alone은 semantic invalidation이 아니다. Cockpit은 future SHA를 추측해 handoff에 고정하지 않고, `ADMITTED_BASE`는 execution evidence이지 Cockpit persistent project state가 아니다.",
        "   - [Admission vs Scheduling Boundary] 이미 만들어진 candidate의 BASE freshness check와, 아직 시작하지 않은 후속 task를 SERIAL NOW / WAIT FOR EVIDENCE로 framing하는 scheduling 판단을 서로 다른 단계로 명확히 구분한다.",
        "   - [SEMANTIC_READY != PUBLISHABLE] `SEMANTIC_READY`는 bounded semantic work와 필요한 semantic proof가 완료되어 의미가 확정된 상태이며, 지금 바로 publish 가능하다는 뜻은 아니다. `PUBLISHABLE`은 여기에 fresh remote authority 확인, publication topology admissibility, 직접 영향 integrity/final proof 완료가 더해져 즉시 non-force FF publication을 시도할 수 있는 상태를 뜻한다. 이 구별은 handoff/reasoning vocabulary이며 Cockpit이 persistent task status로 저장하는 것이 아니다.",
        "   - [Publication & Independent Freshness Axes] Publication은 short serialization boundary다. remote advance를 발견하면 blind retry/rematerialization loop를 돌지 않고 freshness를 3개의 독립 축으로 판정한다: topology freshness / semantic freshness / proof freshness. 한 축의 movement는 다른 축을 자동 invalidation하지 않는다:",
        "     * Topology-only movement (SEMANTIC_OWNERS·PROOF_OWNERS unaffected): semantic result preserve, completed/reusable proof preserve, candidate/reference preserve. publication에 실제로 필요한 최소 final JIT topology binding과 directly affected integrity/proof만 수행한다. fresh main 위에 동일 semantic delta를 처음부터 reapply하는 것을 unconditional remediation으로 제시하지 않으며, topology movement만으로 semantic implementation을 다시 materialize하지 않는다.",
        "     * Semantic-owner movement: intervening movement가 task meaning을 결정하는 owner(requirement, public contract, workflow semantics, schema/API 의미, task가 직접 의존하는 architecture/policy authority)를 실제로 변경했다면 `READMIT`한다. old semantic evidence/candidate는 reference로 보존하고 blind salvage/reapply를 금지한다.",
        "     * Proof-owner-only movement: task meaning은 그대로이고 existing proof validity owner(relevant tests, fixtures, validation rules, build/runtime configuration, proof command, generated evidence owner)만 변경됐다면 semantic work preserve하고 직접 affected targeted proof만 재검증한다. proof-owner movement를 semantic overlap과 합쳐 `BLOCKED` 처리하지 않는다.",
        "     * Uncertain: `UNKNOWN -> BLOCKED`, `UNKNOWN -> FULL REBUILD` fallback을 사용하지 않는다. bounded read-only classification과 nearest relevant targeted proof로 uncertainty를 먼저 줄이고, 실제 semantic invalidation이 입증될 때만 `READMIT`한다.",
        "   - [Thin Transient WATCH_SURFACES] Mutation-intended executor prompt가 실제 변경으로 framing될 때는 최소 transient watch surfaces를 명시적으로 전달한다: `DIRECT_PATHS`(이번 bounded task가 직접 수정할 것으로 예상되는 file/surface), `SEMANTIC_OWNERS`(task meaning/contract를 결정하는 직접 authority surfaces — dependency inventory 아님), `PROOF_OWNERS`(완료된 proof의 validity를 실제로 바꿀 수 있는 직접 proof surfaces — project-wide test catalog 아님). 부정확한 정밀도를 조작하지 말고, 정확한 path를 아직 알 수 없으면 좁은 surface description으로 전달하고 executor가 current repository evidence로 더 좁히게 한다. 이 3필드는 transient handoff evidence이자 executor reasoning input이며, PROGRESS.md persistent slot, parser state machine, task registry, dependency DB, claim registry, publication queue, lease, scheduler가 되지 않는다.",
        "   - [Recover-or-Preserve] Legacy handoff/candidate에 WATCH_SURFACES metadata가 없다고 `missing metadata -> invalid -> rebuild`하지 않는다. current repository evidence에서 read-only reconstruction을 우선하고, 가능 범위에서 `DIRECT_PATHS`/`SEMANTIC_OWNERS`/`PROOF_OWNERS`를 재구성한다. 충분하면 normal freshness classification을 적용하고, 불충분하면 known semantic result preserve, known-scope proof preserve, candidate/reference preserve로 두고 publication/freshness decision만 stop 또는 CONTINUABLE로 보고한다. 정보 부족만으로 완료된 semantic work를 폐기하지 않는다.",
        "   - [Second-Advance Circuit Breaker] Final publication binding 이후 다른 writer가 remote를 다시 advance하면 현재 publication attempt가 경쟁에서 진 것이지 semantic task failure이 아니다. `SEMANTIC_READY` 유지, reusable proof 유지, candidate/reference 유지로 현재 publication attempt을 종료하고, 같은 attempt에서 bind → proof → advance → bind → proof → advance loop를 만들지 않는다. 다음 attempt는 fresh classification부터 재개한다.",
        "   - [Git Safety Delegation] Fresh remote revision 확보, candidate containment, ancestor/descendant/divergence 판정, FF publication admissibility는 repository-native Git Safety/development contract의 authority이며 그 준수를 요구한다. Cockpit handoff는 자체 merge-base/state authority를 구현·중복하지 않고, repository의 실제 implementation을 가정하지도 않는다.",
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
        "7. [Reader-Level Projection] evidence assimilation과 reader-level projection을 분리하라. 위 단계에서 수집·재입장한 high-resolution evidence를 발견했다는 이유만으로 Project Horizon overview(`현재 상황`/`다음 전환`/`직면한 문제`)에 그대로 투사하지 않는다. `현재 상황`은 project-wide 상태(성과/범위, 핵심 기반, 검증/준비도 등 material category 2~4개로 압축), `다음 전환`은 project-level state transition(A 상태 → B 상태와 완료 조건; executor command 아님), `직면한 문제는` 방향을 실제로 제한하는 Blocker/Material Uncertainty/Constraint만 admitted한다. commit SHA·개별 파일/route·test 개수·command·CI run·bug chronology 같은 low-level evidence는 Recent Progress(material semantic transition), Area Detail(subsystem 상태/근거), Handoff(exact execution context)의 적절한 zoom level에 두고 Overview에 중복 복사하지 않는다. 분석 정확도는 유지하되 표면별 표현 해상도만 분리한다.",
        "8. [Fresh-Supersession Gate — investigator finding vs fresh authority] This gate is not the transmitted-claim Open-Claim Re-admission above; it judges the investigator's newly derived finding against fresh authority, and it applies only when read-only investigation is about to recommend a new mutation/repair. Immediately before closure, fetch fresh `origin/main`, explicitly record its SHA via `rev-parse`, and judge identity/containment between the investigation baseline/finding provenance and fresh authority directly with Git authority (`rev-parse`, `merge-base --is-ancestor`). Topology movement alone never discards or retains a finding. Compare the investigated defect with intervening history for semantic overlap — same/directly-related source hunk, same contract or behavior, same proof/test surface, whether a superseded fix exists. When fresh authority already closes the defect's root cause completely with required proof, reclassify the finding as `CLOSED / SUPERSEDED_BY_PUBLISHED_FIX`, do not create a mutation task to reimplement or re-verify the already-published fix, and do not emit `NEXT_REPAIR` or a repair handoff. Unrelated upstream movement is information, not investigation invalidation. Partial fix, different-meaning fix, revert, or proof gap never auto-close; apply the existing semantic/proof judgment. No new state machine, registry, queue, daemon, task DB, or scheduler.",
    ];
}
/** Format instruction block for Current Focus Problem Framer handoff */
export function formatFocusHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "1. [Fresh Evidence 대조] 외부 capable agent는 위 전달받은 context를 최종 truth로 신뢰하지 말고, 반드시 현재 repo/runtime/SSOT의 fresh evidence와 대조하여 실제 문제를 검증하라.",
        ...formatProjectModelAdmissionLines(),
        "9. [Framing Objective] Current Focus를 Next Transition까지 전진시키기 위해 현재 시점에서 의미와 성공조건을 확정할 수 있는 bounded work를 찾는다. Focus가 있어도 Next Transition을 command/task 수준으로 축소하지 않고 focus advancement를 project-level state transition으로 표현한다. 현재 Focus와 무관한 작업을 단순히 task 수를 늘리기 위해 끌어오지 않는다.",
        "10. [No Problem → No Task] 현재 Focus scope에서 실제 문제가 없거나 추가 작업이 불필요하다면 무리하게 task를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "11. [Execution Wave 분류 & Local-Agent Prompts]:",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        ...formatAdmissionPublicationContractLines(),
        "13. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "14. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
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
        "9. [Framing Objective] 선택된 Area의 실제 상태/취약점/미해결 문제를 fresh evidence로 깊게 검토하는 것이 objective다. root cause나 proof가 인접 Area를 실제로 통과한다면 필요한 범위까지 조사할 수 있으나, 임의로 프로젝트 전체 review로 확장하지 않는다.",
        "10. [No Problem → No Task] 검토 결과 해당 영역에 실제 문제가 없거나 추가 조치가 불필요하다면 무리하게 task/Wave를 제조하지 말고 NO_ACTION / NO_CHANGE 결론을 낸다.",
        "11. [Execution Wave 분류 & Local-Agent Prompts]:",
        "   - 문제가 확인되면 해당 문제를 해결하는 데 지금 확정 가능한 최대 범위까지만 Execution Wave를 구성한다.",
        ...formatExecutionWaveContractLines().map((l) => "   " + l),
        ...formatAdmissionPublicationContractLines(),
        "13. [No Persistence] Execution Wave는 일회성 transient framing 결과다. Cockpit/PROGRESS.md에 task registry, backlog, queue, task status, agent assignment, dependency persistence를 저장하거나 추가하지 않는다. Model admission 분류 역시 일회성 transient reasoning이며 claim registry를 저장하지 않는다.",
        "14. [Executor Neutrality] 모든 prompt는 특정 도구/에이전트 이름이나 사용자 개인 설정/메모리에 종속되지 않는 executor-neutral prompt로 작성한다.",
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
