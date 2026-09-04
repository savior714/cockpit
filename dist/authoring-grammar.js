/**
 * Deterministic authoring-grammar owner: implementation vocabulary for README §5.
 *
 * README §5 remains the canonical human authority; this file owns only the
 * deterministic code vocabulary (canonical keys, heading aliases, pure
 * string normalization). One canonical slot per reader question:
 * map / area details / focus / situation / next / facing / recent /
 * frame / settled. Rich dual owners (Horizon-vs-Situation,
 * Frontier-vs-Next, Movement-vs-Recent), the Stage/Posture/Thread
 * gate-maturity ontology, and the trajectory journey model
 * (trajectory/neutral rails, foundation/future privileged groups) were
 * removed as off-mission canonical owners. Legacy rich headings still
 * resolve into the single merged slot so old documents render as
 * secondary context instead of failing.
 *
 * Map position uses exactly one marker: an optional group titled exactly
 * `현재 단계` (`Current Stage`) highlights its items as YOU ARE HERE.
 * Every other group title is the project's own vocabulary and renders
 * uniformly; no foundation/future heading carries privilege.
 *
 * Must not import markdown-it Token, rendered HTML, tone, or DOM.
 */
/** Exact canonical YOU ARE HERE group heading: the single position marker. */
export function isCurrentStageHeading(rawTitle) {
    const norm = normalizeKey(rawTitle);
    return norm === "현재단계" || norm === "currentstage";
}
/** Korean & English heading text → single canonical slot key per question. */
export const HEADING_ALIAS = {
    // Map — project structure + current position (mental anchor).
    "프로젝트 지도": "project map",
    "project map": "project map",
    // Area details — per-area meaning / level / evidence drill-down.
    "영역 상세": "area details",
    "영역별 상세": "area details",
    "area details": "area details",
    "area detail": "area details",
    // Focus — user-owned current interest (optional).
    "현재 집중": "current focus",
    "현재의 집중": "current focus",
    "current focus": "current focus",
    "focus": "current focus",
    // Situation (지금) — merged single owner for project-level current state.
    // Legacy "Project Horizon" headings resolve here; there is no separate
    // Horizon canonical owner anymore.
    "현재 상황": "situation",
    "지금 하는 일": "situation",
    "지금": "situation",
    "current situation": "situation",
    "프로젝트 지평": "situation",
    "project horizon": "situation",
    // Next (다음) — merged single owner for the nearest state transition.
    // Legacy "Current Frontier" headings resolve here; no separate Frontier owner.
    "다음 전환": "next",
    "다음": "next",
    "next": "next",
    "next transition": "next",
    "현재 최전선": "next",
    "current frontier": "next",
    // Facing (막힘) — material blocker / constraint, only when present.
    "직면한 문제": "facing",
    "막힌 것": "facing",
    "blocked": "facing",
    "facing issues": "facing",
    // Recent (최근 변화) — merged single owner for material transitions.
    // Legacy "Recent Material Movement" headings resolve here.
    "최근 진척": "recent",
    "최근 완료": "recent",
    "최근 변화": "recent",
    "최근 실질적 변화": "recent",
    "recently completed": "recent",
    "recent progress": "recent",
    "recent material movement": "recent",
    // Stable context — slow-moving product goal and settled direction.
    "제품 목표": "project frame",
    "프로젝트 큰 그림": "project frame",
    "project frame": "project frame",
    "product goal": "project frame",
    "product goals": "project frame",
    "확정된 방향": "settled direction",
    "이미 정해진 방향": "settled direction",
    "settled direction": "settled direction",
    // Removed canonical owners resolve to nothing: old Stage Journey /
    // Project Posture / Strategic Threads headings are intentionally absent
    // so they render as secondary extra context, never as canonical slots.
};
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
export function stripInlineMarkup(value) {
    return value
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
        .trim();
}
