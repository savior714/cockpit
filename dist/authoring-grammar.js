/**
 * Deterministic authoring-grammar owner: implementation vocabulary for README §5.
 *
 * This module implements the human authoring contract in code. README §5
 * remains the canonical human authority; this file owns only the
 * deterministic code vocabulary (canonical keys, legacy aliases, accepted
 * state enums, label aliases, heading/line grammars, pure string
 * normalization). It must not import markdown-it Token, rendered HTML,
 * tone, or DOM. Markdown token traversal lives in
 * `./markdown-structure.js`; semantic construction lives in
 * `./semantic-construction.js`.
 */
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
export const STAGE_ENTRY_CONDITION_LABELS = ["진입 조건", "개시 조건", "entry condition", "opens when"];
export const STAGE_DECISION_REASON_LABELS = ["판정 이유", "Decision reason"];
export const MATURITY_STATE_ALIASES = {
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
export const STAGE_GATE_STATES = [
    "CLOSED",
    "IN PROOF",
    "NOT OPEN",
    "OPEN",
    "IN REVIEW",
    "PROVEN",
    "NOT PROVEN",
    "FAILED",
    "UNKNOWN",
    "BLOCKED",
];
/** Frontier synthetic-subsection alias groups (visible title matching). */
export const FRONTIER_SUBSECTION_ALIASES = [
    ["왜 지금", "why now"],
    ["완료 의미", "success meaning", "성공 의미", "success"],
    ["단계 영향", "stage impact"],
    ["이미 닫힌", "already closed", "closed boundaries", "closed"],
    ["근거", "evidence"],
];
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
export function stripInlineMarkup(value) {
    return value
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
        .trim();
}
export function isSemanticMetadataLine(line) {
    return /^(?:역할|role|관련\s*(?:영역|단계|상태|축|최전선|변화)|related\s+(?:areas?|stage|posture|frontier|movements?)|진입\s*조건|개시\s*조건|entry\s+condition|opens\s+when|판정\s*이유|decision\s+reason|현재|목표|이전|이후|변경|before|after|change|target|from|to)\s*:/i.test(line) || /^(?:STRONG|PARTIAL|WEAK|UNKNOWN|BLOCKED|CLOSED|IN PROOF|NOT OPEN|OPEN|IN REVIEW|PROVEN|NOT PROVEN|FAILED)$/i.test(line);
}
export function firstSemanticSentence(value) {
    const lines = value
        .split(/\r?\n/)
        .map((line) => stripInlineMarkup(line.replace(/^\s*[-*+]\s+/, "")))
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !isSemanticMetadataLine(line));
    return lines[0] ?? "";
}
export function parseMaturityState(value) {
    const clean = stripInlineMarkup(value).trim().toUpperCase();
    return MATURITY_STATE_ALIASES[clean] ?? null;
}
export function parseHeadingState(rawHeading) {
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
export function parseStateLine(rawText) {
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
export function parseStageStateLine(rawText) {
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
export function parseStageSegmentTitle(rawHeading) {
    const heading = stripInlineMarkup(rawHeading).trim();
    const match = /^(현재|다음|current|next)\s*(?:—|–|:|-)?\s*(.*)$/i.exec(heading);
    if (!match)
        return { role: "other", title: heading };
    const role = /^(현재|current)$/i.test(match[1]) ? "current" : "next";
    return { role, title: match[2].trim() || heading };
}
export function parseStageGateLine(rawLine) {
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
export function parseFrontierRole(rawHeading) {
    const heading = stripInlineMarkup(rawHeading).trim();
    const coPrimary = /^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선)\]\s*/i.test(heading);
    const primary = /^\s*\[(?:PRIMARY|주요\s*최전선)\]\s*/i.test(heading);
    const secondary = /^\s*\[(?:SECONDARY|보조)\]\s*/i.test(heading);
    const title = heading.replace(/^\s*\[(?:CO[- ]?PRIMARY|공동\s*최전선|PRIMARY|주요\s*최전선|SECONDARY|보조)\]\s*/i, "").trim();
    return { title, isPrimary: coPrimary || primary || !secondary, isCoPrimary: coPrimary };
}
export function parsePostureRole(title, rawText) {
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
export function extractLabeledValue(rawText, labels) {
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
export function parseArrowTransition(value) {
    const match = /([^\n→>-]{1,80}?)\s*(?:→|->)\s*([^\n]{1,120})/.exec(stripInlineMarkup(value));
    if (!match)
        return null;
    const before = match[1].replace(/^[-*+:\s]+/, "").trim();
    const after = match[2].replace(/[.;]+$/, "").trim();
    if (!before || !after)
        return null;
    return { before, after };
}
export function subsectionText(subsections, labels) {
    return (subsections.find((subsection) => labels.some((label) => normalizeKey(subsection.subheading).includes(normalizeKey(label))))?.rawText ?? "");
}
export function isStageBlockerText(rawText) {
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
export const RELATION_GRAMMAR_RULES = [
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
export function splitRelationTargets(value) {
    return value
        .split(/\s*,\s*|\s+및\s+|\s+and\s+/i)
        .map((target) => stripInlineMarkup(target).replace(/[.;]+$/, "").trim())
        .filter(Boolean);
}
export function isFrontierSubsectionAlias(subheading) {
    return FRONTIER_SUBSECTION_ALIASES.some((labels) => labels.some((label) => normalizeKey(subheading).includes(normalizeKey(label))));
}
