/**
 * Presentation / UI projection owner: domain -> Inspector/view-model.
 *
 * Sole owner for deterministic view derivation: semantic tone
 * classification, area InspectorEntity construction, evidence drill-down,
 * and map/text projection (renderNativeMap,
 * formatProjectMapText/formatAreaDetailsText). Consumes the clean domain
 * model (`./domain.js`), the authoring grammar (`./authoring-grammar.js`),
 * and string rendering from the Markdown structural layer
 * (`./markdown-structure.js`). Never traverses Tokens and never imports
 * the compatibility facade (`./parser.js`).
 *
 * The Inspector is a secondary drill-down (overview → area → evidence),
 * not a primary taxonomy surface. There are no Stage/Posture/Frontier/
 * Thread/Movement entities and no relation graph: map cards open areas,
 * evidence buttons open evidence depth. That is the whole navigation.
 *
 * Information-depth ownership: the map card owns the short area label, the
 * area view owns 의미/현재 수준/남은 문제 (why + residual), and the evidence
 * drill-down owns full proof. The area lead is intentionally not rendered as
 * a separate summary (it would repeat the map label), and evidence sections
 * render in the area view as entry points only, with the full text preserved
 * in the evidence drill-down.
 */

import {
  isCurrentStageHeading,
  isFoundationHeading,
  isFutureHeading,
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

export type InspectorKind = "area" | "evidence";

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
  evidenceParent?: InspectorEntity;
}

export interface ProjectionContext {
  map: ParsedMap | null;
  areaDetails: Map<string, AreaDetail>;
}

/**
 * Conservative veto for evidence promotion.
 * Returns true only when the ENTIRE subsection content clearly states that no
 * verifiable evidence exists yet (absent / unverified / planned-only).
 */
function isClearlyUnverifiedOrPlannedEvidence(cleanText: string): boolean {
  if (cleanText === "") return true;
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => {
    const withoutLabel = line
      .replace(/^(?:근거|증거|evidence|proof)\s*[:：]\s*/i, "")
      .trim();
    const core = withoutLabel.replace(/[.．。;；!！]+$/, "").trim();
    if (!core) return true;
    if (
      /^(?:없음|해당\s*없음|아직\s*없음|아직\s*근거\s*없음|근거\s*없음|증거\s*없음|근거\s*미확보|미확인|미검증|미작성|미수립|예정|향후\s*과제|추후\s*과제|향후\s*작업|추후\s*작업)$/.test(
        core
      )
    ) {
      return true;
    }
    if (
      /^(?:아직\s*|추가\s*|추후\s*|향후\s*)?(?:테스트|검증|확인|작성|수립|확보|측정)\s*예정(?:입니다|임)?$/.test(
        core
      )
    ) {
      return true;
    }
    if (/^추후\s*(?:테스트|검증|확인|작성|수립|확보|측정)(?:\s*예정)?$/.test(core)) {
      return true;
    }
    if (
      /^(?:아직\s*|추가\s*|추후\s*)?(?:테스트|검증|확인|작성)\s*(?:필요|요망|요구)(?:함|입니다|임)?$/.test(
        core
      )
    ) {
      return true;
    }
    if (
      /^(?:none|no\s*evidence|not\s*verified|not\s*proven|unverified|unconfirmed|unknown|tbd|n\/a|planned|future\s*work|future-work)$/i.test(
        core
      )
    ) {
      return true;
    }
    if (
      /^(?:verification|confirmation|test(?:s|ing)?)\s*(?:required|needed|pending|planned)$/i.test(
        core
      )
    ) {
      return true;
    }
    if (
      /^(?:pending(?:\s*(?:verification|confirmation|test|testing))?|to\s*be\s*(?:verified|confirmed|tested)|awaiting\s*(?:verification|confirmation|test|testing)?)$/i.test(
        core
      )
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Canonical semantic tone classifier for Inspector subsections.
 *
 * Only the README §5 Area Detail contract distinguishes tones: evidence
 * headings with verified content read as evidence, open remaining
 * problems/blockers read as danger, everything else (meaning, level,
 * closed/none issues, custom notes, legacy gate/transition headings) reads
 * as neutral. There is no separate gate/transition/movement tone owner.
 */
export function classifySubsectionTone(
  subheading: string,
  rawText?: string,
  _contextState?: string
): SemanticTone {
  const normKey = normalizeKey(subheading);
  const cleanText = (rawText || "").trim();
  const firstLine = cleanText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean)[0] ?? "";

  const isExplicitlyClosedOrNone =
    cleanText === "" ||
    /^(?:없음|해당\s*없음|해결됨|완료됨|닫힘|특이\s*사항\s*없음|none|n\/a|closed|resolved|all\s+resolved|no\s+remaining\s+issues?|no\s+issues?)\.?$/i.test(
      firstLine
    ) ||
    /^(?:남은\s*문제|remaining\s*issues?)\s*[:：]\s*(?:없음|해당\s*없음|none|n\/a|closed|해결됨)\.?$/i.test(
      firstLine
    );

  const isEvidenceHeading =
    normKey.includes("근거") ||
    normKey.includes("증거") ||
    normKey.includes("evidence") ||
    normKey.includes("proof");

  if (isEvidenceHeading) {
    if (isClearlyUnverifiedOrPlannedEvidence(cleanText)) {
      return "neutral";
    }
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
    if (isExplicitlyClosedOrNone) {
      return "neutral";
    }
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

export function evidenceEntity(parent: InspectorEntity, section: ViewSubsection): InspectorEntity {
  return {
    key: entityKey("evidence", `${parent.title}:${section.subheading}`),
    kind: "evidence",
    title: `${parent.title} · ${section.subheading}`,
    summaryText: "이 판단을 뒷받침하는 세부 근거",
    html: section.html,
    rawText: section.rawText,
    subsections: [],
    evidenceParent: parent,
  };
}

export function stateClass(state: string | undefined): string {
  return normalizeKey(state ?? "").replace(/[^a-z0-9]+/g, "-") || "unknown";
}

/** Render Native HTML Map */
export function renderNativeMap(
  parsedMap: ParsedMap,
  selectedAreaId: string | null = null,
  _areaDetails?: Map<string, AreaDetail>,
  currentStageLabel?: string
): string {
  void _areaDetails;
  let html = `<div class="native-project-map">`;
  const currentStageGroupCount = parsedMap.rails
    .filter((rail) => rail.railType === "trajectory")
    .reduce(
      (count, rail) => count + rail.groups.filter((group) => isCurrentStageHeading(group.title)).length,
      0
    );
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
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
        } else if (isCurrent) {
          html += `
            <div class="trajectory-group group-current-stage">
              <div class="group-header">
                <span class="stage-tag">현재 단계</span>
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
                aria-label="현재 단계: ${escapeHtml(item.title)} 영역 상세 보기"
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
        } else if (isFuture) {
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
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
                  aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
      }
      html += `</div>`;
    } else {
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
                aria-label="${escapeHtml(item.title)} 영역 상세 보기"
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
      });

      html += `</div>`;
    }

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
