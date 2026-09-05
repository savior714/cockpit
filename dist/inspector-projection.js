/**
 * Presentation / UI projection owner: domain -> Inspector/view-model.
 *
 * Sole owner for deterministic view derivation: semantic tone
 * classification, area InspectorEntity construction,
 * and map/text projection (renderNativeMap,
 * formatProjectMapText/formatAreaDetailsText). Consumes the clean domain
 * model (`./domain.js`), the authoring grammar (`./authoring-grammar.js`),
 * and string rendering from the Markdown structural layer
 * (`./markdown-structure.js`). Never traverses Tokens and never imports
 * the compatibility facade (`./parser.js`).
 *
 * The Inspector is a single-current area view (map → area),
 * not a primary taxonomy surface. There are no Stage/Posture/Frontier/
 * Thread/Movement entities, no trajectory/foundation/future journey
 * kinds, and no relation graph: map cards open areas. That is the whole
 * navigation. Map groups render uniformly in the project's own vocabulary;
 * only the optional `현재 단계` (`Current Stage`) group highlights its items
 * as YOU ARE HERE.
 *
 * Information-depth ownership: the map card owns the short area label, the
 * area view owns 의미/현재 수준/남은 문제/근거 (why + residual + proof)
 * inline. The area lead is intentionally not rendered as a separate summary
 * (it would repeat the map label), and evidence sections render in the area
 * view with their full text. Reading evidence never opens a separate
 * navigation level.
 *
 * Semantic boundary: subsection tone follows the explicit heading structure
 * only. Body prose is never reinterpreted to judge factual or verification
 * state — the LLM author owns meaning via structure and content.
 */
import { isCurrentStageHeading, normalizeKey, normalizeTitle, } from "./authoring-grammar.js";
import { escapeHtml, renderMarkdownString, } from "./markdown-structure.js";
/**
 * Canonical semantic tone classifier for Inspector subsections.
 *
 * Heading-structure only: evidence headings read as evidence, open-issue
 * headings read as danger, everything else reads as neutral. Body prose is
 * intentionally ignored — Cockpit does not re-judge factual state,
 * verification state, or open/closed meaning from natural language.
 * A strange document such as "근거: 미검증" keeps its structural
 * presentation; the author owns structure and content.
 */
export function classifySubsectionTone(subheading, rawText, _contextState) {
    void rawText;
    void _contextState;
    const normKey = normalizeKey(subheading);
    const isEvidenceHeading = normKey.includes("근거") ||
        normKey.includes("증거") ||
        normKey.includes("evidence") ||
        normKey.includes("proof");
    if (isEvidenceHeading) {
        return "evidence";
    }
    const isIssueHeading = normKey.includes("남은문제") ||
        normKey.includes("직면한문제") ||
        normKey.includes("막힌것") ||
        normKey.includes("remainingissues") ||
        normKey.includes("remaining") ||
        normKey.includes("blocker") ||
        normKey.includes("issues") ||
        normKey.includes("남은과제");
    if (isIssueHeading) {
        return "danger";
    }
    return "neutral";
}
/** Enrich a clean domain subsection into a view subsection (HTML + tone). */
export function toViewSubsection(clean, contextState) {
    return {
        subheading: clean.subheading,
        rawText: clean.rawText,
        html: renderMarkdownString(clean.rawText),
        tone: classifySubsectionTone(clean.subheading, clean.rawText, contextState),
    };
}
export const entityKey = (kind, title) => `${kind}:${normalizeTitle(title)}`;
function findAreaDetailIn(item, areaDetails) {
    const title = typeof item === "string" ? item : item.title;
    return areaDetails.get(normalizeTitle(title));
}
export function areaEntity(item, areaDetails) {
    const detail = findAreaDetailIn(item, areaDetails);
    const cleanSections = detail?.subsections ?? [];
    const viewSections = cleanSections.map((s) => toViewSubsection(s));
    const meaning = viewSections.find((s) => ["의미", "meaning"].some((label) => normalizeKey(s.subheading).includes(normalizeKey(label))));
    return {
        key: entityKey("area", item.title),
        kind: "area",
        title: item.title,
        summaryText: item.description || meaning?.rawText.split(/\r?\n/)[0] || "",
        html: viewSections.map((section) => section.html).join(""),
        rawText: viewSections.map((section) => section.rawText).join("\n"),
        subsections: viewSections,
        areaItem: item,
    };
}
export function findEntity(kind, title, lookup) {
    if (kind !== "area")
        return null;
    const target = normalizeTitle(title);
    const item = lookup.map?.rails
        .flatMap((rail) => rail.groups)
        .flatMap((group) => group.items)
        .find((candidate) => normalizeTitle(candidate.title) === target);
    return item ? areaEntity(item, lookup.areaDetails) : null;
}
export function stateClass(state) {
    return normalizeKey(state ?? "").replace(/[^a-z0-9]+/g, "-") || "unknown";
}
/** Render Native HTML Map.
 *
 * Groups render uniformly in the project's own vocabulary. Ordered lists
 * read as sequences and unordered lists as peers because that is the
 * author's own Markdown choice, not a Cockpit journey model. The only
 * Cockpit-owned position signal is the optional `현재 단계`
 * (`Current Stage`) group, whose items highlight as YOU ARE HERE.
 */
export function renderNativeMap(parsedMap, selectedAreaId = null, _areaDetails) {
    void _areaDetails;
    let html = `<div class="native-project-map">`;
    for (const rail of parsedMap.rails) {
        html += `<section class="map-rail map-rail-neutral">`;
        html += `
      <div class="rail-header">
        <h3 class="rail-title">${escapeHtml(rail.title)}</h3>
      </div>
    `;
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
            const isCurrent = isCurrentStageHeading(group.title);
            const isGroupOrdered = Boolean(group.isOrdered);
            if (isCurrent) {
                html += `
          <div class="neutral-group group-current-stage">
            <div class="group-header">
              <span class="stage-tag">현재 단계</span>
              <h4 class="group-name visually-hidden">${escapeHtml(group.title)}</h4>
            </div>
            <div class="group-items-grid group-items-peer">
        `;
                for (const item of group.items) {
                    const isSelected = selectedAreaId === item.id;
                    html += `
            <button
              type="button"
              class="map-card card-current-stage ${isSelected ? "selected" : ""}"
              data-item-id="${escapeHtml(item.id)}"
              aria-label="현재 단계: ${escapeHtml(item.title)} 영역 상세 보기"
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
            else {
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
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
        });
        html += `</div>`;
        html += `</section>`;
    }
    html += `</div>`;
    return html;
}
/** Format human-readable text representation of Project Map */
export function formatProjectMapText(parsedMap) {
    if (!parsedMap.rails || parsedMap.rails.length === 0) {
        return parsedMap.fallbackText ?? "";
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
