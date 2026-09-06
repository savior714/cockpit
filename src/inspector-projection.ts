/**
 * Presentation / UI projection owner: domain -> Inspector/view-model.
 *
 * Sole owner for deterministic view derivation: semantic tone
 * classification, area InspectorEntity construction, header-orientation
 * compression (buildOrientationSummary/firstSentence/facingHead),
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

import {
  isCurrentStageHeading,
  normalizeKey,
  normalizeTitle,
} from "./authoring-grammar.js";
import {
  escapeHtml,
  renderMarkdownString,
} from "./markdown-structure.js";
import type {
  AreaDetail,
  AreaDetailSubsection,
  MapItem,
  ParsedMap,
} from "./domain.js";

export type SemanticTone = "neutral" | "danger" | "evidence";

export interface ViewSubsection {
  subheading: string;
  html: string;
  rawText: string;
  tone?: SemanticTone;
}

export type InspectorKind = "area";

export interface InspectorEntity {
  key: string;
  kind: InspectorKind;
  title: string;
  state?: string;
  summaryText: string;
  html: string;
  rawText: string;
  subsections: ViewSubsection[];
  areaItem?: MapItem;
}

export interface ProjectionContext {
  map: ParsedMap | null;
  areaDetails: Map<string, AreaDetail>;
}

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
export function classifySubsectionTone(
  subheading: string,
  rawText?: string,
  _contextState?: string
): SemanticTone {
  void rawText;
  void _contextState;
  const normKey = normalizeKey(subheading);

  const isEvidenceHeading =
    normKey.includes("근거") ||
    normKey.includes("증거") ||
    normKey.includes("evidence") ||
    normKey.includes("proof");

  if (isEvidenceHeading) {
    return "evidence";
  }

  const isIssueHeading =
    normKey.includes("남은문제") ||
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
export function toViewSubsection(
  clean: AreaDetailSubsection,
  contextState?: string
): ViewSubsection {
  return {
    subheading: clean.subheading,
    rawText: clean.rawText,
    html: renderMarkdownString(clean.rawText),
    tone: classifySubsectionTone(clean.subheading, clean.rawText, contextState),
  };
}

export const entityKey = (kind: InspectorKind, title: string) => `${kind}:${normalizeTitle(title)}`;

function findAreaDetailIn(
  item: MapItem | string,
  areaDetails: Map<string, AreaDetail>
): AreaDetail | undefined {
  const title = typeof item === "string" ? item : item.title;
  return areaDetails.get(normalizeTitle(title));
}

export function areaEntity(item: MapItem, areaDetails: Map<string, AreaDetail>): InspectorEntity {
  const detail = findAreaDetailIn(item, areaDetails);
  const cleanSections = detail?.subsections ?? [];
  const viewSections = cleanSections.map((s) => toViewSubsection(s));
  const meaning = viewSections.find((s) =>
    ["의미", "meaning"].some((label) => normalizeKey(s.subheading).includes(normalizeKey(label)))
  );
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

export interface EntityLookup {
  map: ParsedMap | null;
  areaDetails: Map<string, AreaDetail>;
}

export function findEntity(kind: InspectorKind, title: string, lookup: EntityLookup): InspectorEntity | null {
  if (kind !== "area") return null;
  const target = normalizeTitle(title);
  const item = lookup.map?.rails
    .flatMap((rail) => rail.groups)
    .flatMap((group) => group.items)
    .find((candidate) => normalizeTitle(candidate.title) === target);
  return item ? areaEntity(item, lookup.areaDetails) : null;
}

export function stateClass(state: string | undefined): string {
  return normalizeKey(state ?? "").replace(/[^a-z0-9]+/g, "-") || "unknown";
}

/**
 * Header-orientation compression: deterministic one-line derivations from the
 * existing plain-text overview sections. No new ontology, no scores, no
 * invention — each value compresses one existing section (or, for the
 * position, the existing `현재 단계` marker) so the first screen answers
 * rough-comprehension questions in seconds. Full prose stays in the side
 * panels; these are leads, not replacements.
 */
export interface OrientationSummary {
  /** Stable purpose lead: first sentence of the product frame, if present. */
  purpose: string;
  /** Current-state lead: first sentence of the situation, if present. */
  now: string;
  /** Transition lead: first sentence of next (keeps the A → B head). */
  next: string;
  /** Constraint lead: first facing bullet head, or first sentence. */
  blocked: string;
  /** True when the document carries no facing section: render absence, never invent. */
  blockedEmpty: boolean;
  /** Titles of the `현재 단계` items: the map's YOU ARE HERE position. */
  currentPosition: string[];
  /** True when at least one orientation signal exists. */
  hasOrientation: boolean;
}

function stripInlineMarkupForLead(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
    .trim();
}

/** Compress running prose to its first sentence (whitespace-flattened, capped). */
export function firstSentence(text: string, cap = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const match = /^.*?[.!?…](?=\s|$)/.exec(flat);
  const head = (match ? match[0] : flat).trim();
  if (head.length <= cap) return head;
  const cut = head.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > cap * 0.5 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Compress a facing section to its first bullet head (or first sentence). */
export function facingHead(rawText: string): string {
  const text = rawText.trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^([-*•]|\d+[.)])\s+/.test(line));
  if (bullets.length > 0) {
    const first = stripInlineMarkupForLead(bullets[0].replace(/^([-*•]|\d+[.)])\s+/, ""));
    const split = /^(.*?)\s*[—–\-:：]\s*(.*)$/.exec(first);
    return firstSentence((split ? split[1] : first).trim());
  }
  return firstSentence(stripInlineMarkupForLead(text));
}

/** Titles of the optional `현재 단계` group items (document-wide). */
export function currentStageTitles(map: ParsedMap | null): string[] {
  if (!map?.rails) return [];
  const out: string[] = [];
  for (const rail of map.rails) {
    for (const group of rail.groups) {
      if (isCurrentStageHeading(group.title)) {
        for (const item of group.items) out.push(item.title);
      }
    }
  }
  return out;
}

export function buildOrientationSummary(args: {
  frameText?: string;
  situationText?: string;
  nextText?: string;
  facingText?: string;
  map?: ParsedMap | null;
}): OrientationSummary {
  const facing = (args.facingText ?? "").trim();
  const currentPosition = currentStageTitles(args.map ?? null);
  const summary: OrientationSummary = {
    purpose: firstSentence(stripInlineMarkupForLead(args.frameText ?? "")),
    now: firstSentence(stripInlineMarkupForLead(args.situationText ?? "")),
    next: firstSentence(stripInlineMarkupForLead(args.nextText ?? "")),
    blocked: facingHead(facing),
    blockedEmpty: facing.length === 0,
    currentPosition,
    hasOrientation: false,
  };
  summary.hasOrientation = Boolean(
    summary.purpose || summary.now || summary.next || !summary.blockedEmpty || currentPosition.length > 0
  );
  return summary;
}

/** Render Native HTML Map.
 *
 * Groups render uniformly in the project's own vocabulary. Ordered lists
 * read as sequences and unordered lists as peers because that is the
 * author's own Markdown choice, not a Cockpit journey model. The only
 * Cockpit-owned position signal is the optional `현재 단계`
 * (`Current Stage`) group, whose items highlight as YOU ARE HERE.
 *
 * Position vs selection ownership: the `현재 단계` cards always carry a
 * text `현재 위치` badge (position), while a clicked card carries the
 * `.selected` outline plus `aria-pressed` (selection). A current card that
 * is also selected shows both signals, so the two are never confused.
 */
export function renderNativeMap(
  parsedMap: ParsedMap,
  selectedAreaId: string | null = null,
  _areaDetails?: Map<string, AreaDetail>
): string {
  void _areaDetails;
  let html = `<div class="native-project-map">`;
  const hasCurrentPosition = parsedMap.rails.some((rail) =>
    rail.groups.some((group) => isCurrentStageHeading(group.title))
  );
  if (hasCurrentPosition) {
    html += `<p class="map-legend"><span class="legend-now">● 현재 위치</span><span class="legend-meaning">지금 중요한 곳</span><span class="legend-sep" aria-hidden="true"> · </span><span class="legend-pick">▢ 선택됨</span><span class="legend-meaning">눌러서 보는 영역</span></p>`;
  }

  for (const rail of parsedMap.rails) {
    html += `<section class="map-rail map-rail-neutral">`;
    html += `
      <div class="rail-header">
        <h3 class="rail-title">${escapeHtml(rail.title)}</h3>
      </div>
    `;

    const isSequentialRail =
      rail.groups.length > 1 && rail.groups.every((g) => g.isOrdered);

    html += `<div class="neutral-groups-container ${
      isSequentialRail ? "sequential-track" : "peer-track"
    }">`;

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
              ${isSelected ? `aria-pressed="true"` : ""}
            >
              <div class="card-inner">
                <span class="current-position-badge">● 현재 위치</span>
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
      } else {
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
                ${isSelected ? `aria-pressed="true"` : ""}
              >
                <span class="step-num">${itemIdx + 1}</span>
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
          html += `</div>`;
        } else {
          html += `<div class="group-items-grid group-items-peer">`;
          for (const item of group.items) {
            const isSelected = selectedAreaId === item.id;
            html += `
              <button
                type="button"
                class="map-card card-peer ${isSelected ? "selected" : ""}"
                data-item-id="${escapeHtml(item.id)}"
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
                ${isSelected ? `aria-pressed="true"` : ""}
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
export function formatProjectMapText(parsedMap: ParsedMap): string {
  if (!parsedMap.rails || parsedMap.rails.length === 0) {
    return parsedMap.fallbackText ?? "";
  }
  const lines: string[] = [];
  for (const rail of parsedMap.rails) {
    lines.push(`### ${rail.title}`);
    for (const group of rail.groups) {
      lines.push(`#### ${group.title}`);
      if (group.isOrdered) {
        group.items.forEach((item, idx) => {
          lines.push(`${idx + 1}. **${item.title}**${item.description ? ` — ${item.description}` : ""}`);
        });
      } else {
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
export function formatAreaDetailsText(areaDetails: Map<string, AreaDetail>): string {  if (!areaDetails || areaDetails.size === 0) return "";
  const lines: string[] = [];
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
